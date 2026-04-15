import hashlib
import json
import re
from typing import Any, Dict, List

import structlog

from app.agents.nodes.analytics import run_analytics_query
from app.config import settings
from app.db.redis import get_redis
from app.db.repositories.analytics_repo import AnalyticsRepository

logger = structlog.get_logger()

ALLOWED_TABLES = {"tickets", "ticket_events", "profiles", "teams", "sla_policies"}
FORBIDDEN_SQL_PATTERN = re.compile(
    r"\b(insert|update|delete|drop|alter|truncate|grant|revoke|create|copy|execute)\b",
    re.IGNORECASE,
)
TABLE_PATTERN = re.compile(r"\b(?:from|join)\s+([a-zA-Z_][\w\.]*)", re.IGNORECASE)
LIMIT_PATTERN = re.compile(r"\blimit\s+(\d+)\b", re.IGNORECASE)


class AnalyticsValidationError(ValueError):
    pass


class AnalyticsService:
    def __init__(self) -> None:
        self.repo = AnalyticsRepository()

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

    async def query_from_natural_language(self, question: str) -> Dict[str, Any]:
        normalized = self._normalize_question(question)
        cache_key = self._cache_key(normalized)
        redis_client = await get_redis()

        cached = await redis_client.get(cache_key)
        if cached:
            payload = json.loads(cached)
            payload["cached"] = True
            return payload

        llm_result = await run_analytics_query(question)
        sql_query = self.validate_sql(llm_result.get("sql_query", ""))
        query_result = self.repo.execute_readonly_query(sql_query)
        rows = query_result["rows"]
        columns = query_result["columns"]

        response = {
            "sql_query": sql_query,
            "explanation": llm_result.get("explanation", ""),
            "summary": self._summarize(rows, columns),
            "rows": rows,
            "columns": columns,
            "chart_type": llm_result.get("chart_type") or "table",
            "cached": False,
        }
        await redis_client.set(cache_key, json.dumps(response, default=str), ex=settings.ANALYTICS_CACHE_TTL_SECONDS)
        return response

    def _run_sql(self, sql_query: str) -> Dict[str, Any]:
        return self.repo.execute_readonly_query(sql_query)

    async def get_dashboard_data(self) -> Dict[str, Any]:
        redis_client = await get_redis()
        cache_key = "analytics:dashboard:default"
        cached = await redis_client.get(cache_key)
        if cached:
            data = json.loads(cached)
            data["cached"] = True
            return data

        total = self._run_sql("SELECT COUNT(*)::int AS total_tickets FROM tickets LIMIT 1")["rows"][0]["total_tickets"]
        auto_rate_row = self._run_sql(
            """
            SELECT COALESCE(ROUND(
                (COUNT(*) FILTER (WHERE resolution_type = 'auto')::numeric / NULLIF(COUNT(*), 0)) * 100
            , 2), 0) AS auto_resolution_rate
            FROM tickets
            WHERE status IN ('resolved', 'closed')
            LIMIT 1
            """
        )["rows"][0]
        avg_resolution_row = self._run_sql(
            """
            SELECT COALESCE(ROUND(AVG(EXTRACT(EPOCH FROM (resolved_at - created_at)) / 3600)::numeric, 2), 0) AS avg_resolution_hours
            FROM tickets
            WHERE resolved_at IS NOT NULL
            LIMIT 1
            """
        )["rows"][0]
        csat_row = self._run_sql(
            """
            SELECT COALESCE(ROUND(AVG(feedback_score)::numeric, 2), 0) AS csat
            FROM tickets
            WHERE feedback_score IS NOT NULL
            LIMIT 1
            """
        )["rows"][0]
        sla_row = self._run_sql(
            """
            SELECT COALESCE(ROUND(
                (COUNT(*) FILTER (WHERE sla_breached = false AND sla_deadline IS NOT NULL)::numeric
                / NULLIF(COUNT(*) FILTER (WHERE sla_deadline IS NOT NULL), 0)) * 100
            , 2), 100) AS sla_compliance
            FROM tickets
            LIMIT 1
            """
        )["rows"][0]

        volume_trend = self._run_sql(
            """
            SELECT TO_CHAR(created_at::date, 'YYYY-MM-DD') AS day, COUNT(*)::int AS count
            FROM tickets
            WHERE created_at >= NOW() - INTERVAL '14 days'
            GROUP BY created_at::date
            ORDER BY day ASC
            LIMIT 200
            """
        )["rows"]

        resolution_breakdown = self._run_sql(
            """
            SELECT COALESCE(resolution_type, 'unknown') AS label, COUNT(*)::int AS value
            FROM tickets
            GROUP BY COALESCE(resolution_type, 'unknown')
            ORDER BY value DESC
            LIMIT 20
            """
        )["rows"]

        category_breakdown = self._run_sql(
            """
            SELECT COALESCE(category, 'uncategorized') AS label, COUNT(*)::int AS value
            FROM tickets
            GROUP BY COALESCE(category, 'uncategorized')
            ORDER BY value DESC
            LIMIT 20
            """
        )["rows"]

        payload = {
            "kpis": {
                "total_tickets": total,
                "auto_resolution_rate": auto_rate_row["auto_resolution_rate"],
                "avg_resolution_hours": avg_resolution_row["avg_resolution_hours"],
                "csat": csat_row["csat"],
                "sla_compliance": sla_row["sla_compliance"],
            },
            "ticket_volume_trend": volume_trend,
            "resolution_type_breakdown": resolution_breakdown,
            "category_breakdown": category_breakdown,
            "cached": False,
        }
        await redis_client.set(cache_key, json.dumps(payload, default=str), ex=settings.ANALYTICS_CACHE_TTL_SECONDS)
        return payload
