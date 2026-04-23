import asyncio
from collections import Counter
from datetime import datetime, timedelta, timezone
import hashlib
import json
import re
from typing import Any, Dict, List, Optional

import structlog

from app.agents.nodes.analytics import run_analytics_query
from app.config import settings
from app.db.redis import get_redis
from app.db.repositories.analytics_repo import AnalyticsRepository
from app.db.supabase_client import get_admin_client

logger = structlog.get_logger()

ALLOWED_TABLES = {"tickets", "ticket_events", "profiles", "teams", "sla_policies"}
FORBIDDEN_SQL_PATTERN = re.compile(
    r"\b(insert|update|delete|drop|alter|truncate|grant|revoke|create|copy|execute)\b",
    re.IGNORECASE,
)
FORBIDDEN_SQL_COMMENT_PATTERN = re.compile(r"(--|/\*)")
TABLE_PATTERN = re.compile(r"\b(?:from|join)\s+([a-zA-Z_][\w\.]*)", re.IGNORECASE)
LIMIT_PATTERN = re.compile(r"\blimit\s+(\d+)\b", re.IGNORECASE)


class AnalyticsValidationError(ValueError):
    pass


class AnalyticsService:
    def __init__(self) -> None:
        self.repo = AnalyticsRepository()
        self.sb = get_admin_client()

    @staticmethod
    def _normalize_question(question: str) -> str:
        return " ".join(question.strip().lower().split())

    def _cache_key(self, normalized_question: str) -> str:
        digest = hashlib.sha256(normalized_question.encode("utf-8")).hexdigest()
        return f"analytics:query:{digest}"

    @staticmethod
    def _extract_tables(sql_query: str) -> List[str]:
        tables: List[str] = []
        for raw_name in TABLE_PATTERN.findall(sql_query):
            cleaned = raw_name.split(".")[-1].strip('"')
            tables.append(cleaned)
        return tables

    def validate_sql(self, sql_query: str) -> str:
        query = sql_query.strip().rstrip(";")
        if not query:
            raise AnalyticsValidationError("Generated SQL is empty")

        lowered = query.lower()
        if not (lowered.startswith("select") or lowered.startswith("with")):
            raise AnalyticsValidationError("Only SELECT/CTE queries are allowed")

        if FORBIDDEN_SQL_PATTERN.search(lowered):
            raise AnalyticsValidationError("Mutation/DDL statements are not allowed")
        if FORBIDDEN_SQL_COMMENT_PATTERN.search(query):
            raise AnalyticsValidationError("SQL comments are not allowed")

        if ";" in query:
            raise AnalyticsValidationError("Multiple SQL statements are not allowed")

        limit_match = LIMIT_PATTERN.search(query)
        if not limit_match:
            raise AnalyticsValidationError("SQL query must include a LIMIT clause")
        if int(limit_match.group(1)) > 500:
            raise AnalyticsValidationError("LIMIT cannot exceed 500")

        tables = self._extract_tables(query)
        unknown_tables = [table for table in tables if table not in ALLOWED_TABLES]
        if unknown_tables:
            raise AnalyticsValidationError(f"Disallowed tables detected: {', '.join(unknown_tables)}")

        return query

    @staticmethod
    def _summarize(rows: List[Dict[str, Any]], columns: List[str]) -> str:
        if not rows:
            return "No rows matched this query."
        sample = rows[0]
        preview = ", ".join(f"{col}={sample.get(col)}" for col in columns[:4])
        return f"Returned {len(rows)} rows. Sample: {preview}"

    def _fallback_query_for_question(self, question: str) -> Optional[Dict[str, str]]:
        normalized = self._normalize_question(question)

        if "auto" in normalized and "resolved" in normalized and "week" in normalized:
            return {
                "sql_query": """
                    SELECT COUNT(*)::int AS auto_resolved_tickets
                    FROM tickets
                    WHERE resolution_type = 'auto'
                      AND resolved_at >= date_trunc('week', now())
                    LIMIT 1
                """,
                "explanation": "Counts tickets marked as auto-resolved since the start of the current week.",
                "chart_type": "table",
            }

        if "open" in normalized and "ticket" in normalized and ("how many" in normalized or "count" in normalized):
            return {
                "sql_query": """
                    SELECT COUNT(*)::int AS open_tickets
                    FROM tickets
                    WHERE status NOT IN ('resolved', 'closed')
                    LIMIT 1
                """,
                "explanation": "Counts tickets that are still open.",
                "chart_type": "table",
            }

        if ("resolved" in normalized or "closed" in normalized) and (
            "ticket" in normalized or "tickets" in normalized or "case" in normalized
        ):
            return {
                "sql_query": """
                    SELECT COUNT(*)::int AS resolved_tickets
                    FROM tickets
                    WHERE status IN ('resolved', 'closed')
                    LIMIT 1
                """,
                "explanation": "Counts tickets that are currently resolved or closed.",
                "chart_type": "table",
            }

        if "breach" in normalized and "sla" in normalized:
            return {
                "sql_query": """
                    SELECT COUNT(*)::int AS breached_tickets
                    FROM tickets
                    WHERE sla_breached = true
                    LIMIT 1
                """,
                "explanation": "Counts tickets that have breached SLA.",
                "chart_type": "table",
            }

        if "category" in normalized:
            return {
                "sql_query": """
                    SELECT COALESCE(category, 'uncategorized') AS category, COUNT(*)::int AS ticket_count
                    FROM tickets
                    GROUP BY COALESCE(category, 'uncategorized')
                    ORDER BY ticket_count DESC
                    LIMIT 20
                """,
                "explanation": "Breaks tickets down by category.",
                "chart_type": "bar",
            }

        if "priority" in normalized:
            return {
                "sql_query": """
                    SELECT COALESCE(priority, 'unknown') AS priority, COUNT(*)::int AS ticket_count
                    FROM tickets
                    GROUP BY COALESCE(priority, 'unknown')
                    ORDER BY ticket_count DESC
                    LIMIT 20
                """,
                "explanation": "Breaks tickets down by priority.",
                "chart_type": "bar",
            }

        if ("ticket" in normalized and "week" in normalized) or ("volume" in normalized and "ticket" in normalized):
            return {
                "sql_query": """
                    SELECT TO_CHAR(created_at::date, 'YYYY-MM-DD') AS day, COUNT(*)::int AS count
                    FROM tickets
                    WHERE created_at >= NOW() - INTERVAL '14 days'
                    GROUP BY created_at::date
                    ORDER BY day ASC
                    LIMIT 14
                """,
                "explanation": "Shows ticket volume across the last 14 days.",
                "chart_type": "line",
            }

        return None

    async def query_from_natural_language(self, question: str) -> Dict[str, Any]:
        normalized = self._normalize_question(question)
        cache_key = self._cache_key(normalized)
        redis_client = await get_redis()

        cached = await redis_client.get(cache_key)
        if cached:
            payload = json.loads(cached)
            payload["cached"] = True
            return payload

        llm_result: Optional[Dict[str, Any]] = None
        fallback = self._fallback_query_for_question(question)
        try:
            llm_result = await asyncio.wait_for(run_analytics_query(question), timeout=8)
        except asyncio.TimeoutError:
            logger.warning("analytics_llm_generation_timed_out", question=question)
        except Exception as exc:
            logger.warning("analytics_llm_generation_fallback", question=question, error=str(exc))

        query_source = "llm"
        if llm_result and llm_result.get("sql_query"):
            sql_query = self.validate_sql(llm_result.get("sql_query", ""))
            explanation = llm_result.get("explanation", "")
            chart_type = llm_result.get("chart_type") or "table"
        elif fallback:
            sql_query = self.validate_sql(fallback["sql_query"])
            explanation = fallback["explanation"]
            chart_type = fallback["chart_type"]
            query_source = "fallback"
        else:
            raise RuntimeError("Analytics query timed out while generating SQL. Try a simpler question.")

        query_result = self.repo.execute_readonly_query(sql_query)
        rows = query_result["rows"]
        columns = query_result["columns"]

        response = {
            "sql_query": sql_query,
            "explanation": explanation,
            "summary": self._summarize(rows, columns),
            "rows": rows,
            "columns": columns,
            "chart_type": chart_type,
            "cached": False,
            "query_source": query_source,
        }
        await redis_client.set(cache_key, json.dumps(response, default=str), ex=settings.ANALYTICS_CACHE_TTL_SECONDS)
        return response

    def _run_sql(self, sql_query: str) -> Dict[str, Any]:
        return self.repo.execute_readonly_query(sql_query)

    @staticmethod
    def _parse_timestamp(value: str | None) -> datetime | None:
        if not value:
            return None
        return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(timezone.utc)

    async def get_dashboard_data(self) -> Dict[str, Any]:
        redis_client = await get_redis()
        cache_key = "analytics:dashboard:default"
        cached = await redis_client.get(cache_key)
        if cached:
            data = json.loads(cached)
            data["cached"] = True
            return data

        tickets_response = (
            self.sb.table("tickets")
            .select("created_at,resolved_at,status,resolution_type,feedback_score,sla_breached,sla_deadline,category")
            .limit(5000)
            .execute()
        )
        tickets = tickets_response.data or []

        total = len(tickets)

        resolved_tickets = [ticket for ticket in tickets if ticket.get("status") in ("resolved", "closed")]
        auto_resolved_count = sum(1 for ticket in resolved_tickets if ticket.get("resolution_type") == "auto")
        auto_resolution_rate = round((auto_resolved_count / len(resolved_tickets)) * 100, 2) if resolved_tickets else 0.0

        resolution_durations: List[float] = []
        for ticket in tickets:
            created_at = self._parse_timestamp(ticket.get("created_at"))
            resolved_at = self._parse_timestamp(ticket.get("resolved_at"))
            if created_at and resolved_at:
                resolution_durations.append((resolved_at - created_at).total_seconds() / 3600)
        avg_resolution_hours = round(sum(resolution_durations) / len(resolution_durations), 2) if resolution_durations else 0.0

        feedback_scores = [ticket["feedback_score"] for ticket in tickets if ticket.get("feedback_score") is not None]
        csat = round(sum(feedback_scores) / len(feedback_scores), 2) if feedback_scores else 0.0

        with_sla = [ticket for ticket in tickets if ticket.get("sla_deadline")]
        compliant = sum(1 for ticket in with_sla if not ticket.get("sla_breached"))
        sla_compliance = round((compliant / len(with_sla)) * 100, 2) if with_sla else 100.0

        now_utc = datetime.now(timezone.utc)
        recent_days = [(now_utc - timedelta(days=offset)).date() for offset in range(13, -1, -1)]
        volume_counts: Dict[str, int] = {day.isoformat(): 0 for day in recent_days}
        for ticket in tickets:
            created_at = self._parse_timestamp(ticket.get("created_at"))
            if created_at:
                day_key = created_at.date().isoformat()
                if day_key in volume_counts:
                    volume_counts[day_key] += 1
        volume_trend = [{"day": day, "count": count} for day, count in volume_counts.items()]

        resolution_counter = Counter((ticket.get("resolution_type") or "unknown") for ticket in tickets)
        resolution_breakdown = [
            {"label": label, "value": value}
            for label, value in resolution_counter.most_common(20)
        ]

        category_counter = Counter((ticket.get("category") or "uncategorized") for ticket in tickets)
        category_breakdown = [
            {"label": label, "value": value}
            for label, value in category_counter.most_common(20)
        ]

        payload = {
            "kpis": {
                "total_tickets": total,
                "auto_resolution_rate": auto_resolution_rate,
                "avg_resolution_hours": avg_resolution_hours,
                "csat": csat,
                "sla_compliance": sla_compliance,
            },
            "ticket_volume_trend": volume_trend,
            "resolution_type_breakdown": resolution_breakdown,
            "category_breakdown": category_breakdown,
            "cached": False,
        }
        await redis_client.set(cache_key, json.dumps(payload, default=str), ex=settings.ANALYTICS_CACHE_TTL_SECONDS)
        return payload
