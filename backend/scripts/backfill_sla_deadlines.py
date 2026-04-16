from __future__ import annotations

import argparse
import asyncio
import sys
from datetime import datetime, timezone
from pathlib import Path


BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.db.redis import get_redis  # noqa: E402
from app.db.supabase_client import get_admin_client  # noqa: E402
from app.services.sla_service import SLAService  # noqa: E402


DEFAULT_STATUSES = ["triaged"]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Backfill missing SLA deadlines for existing tickets."
    )
    parser.add_argument(
        "--statuses",
        default=",".join(DEFAULT_STATUSES),
        help="Comma-separated ticket statuses to backfill. Default: triaged",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=500,
        help="Maximum number of tickets to scan.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Preview updates without writing them.",
    )
    return parser.parse_args()


def parse_created_at(value: str | None) -> datetime:
    if not value:
        return datetime.now(timezone.utc)
    return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(timezone.utc)


async def invalidate_dashboard_cache() -> None:
    redis_client = await get_redis()
    await redis_client.delete("analytics:dashboard:default")


def main() -> int:
    args = parse_args()
    statuses = [status.strip() for status in args.statuses.split(",") if status.strip()]

    sb = get_admin_client()
    sla_service = SLAService()

    response = (
        sb.table("tickets")
        .select("id,subject,status,priority,created_at,sla_deadline")
        .is_("sla_deadline", "null")
        .in_("status", statuses)
        .order("created_at", desc=False)
        .limit(args.limit)
        .execute()
    )
    tickets = response.data or []

    if not tickets:
        print("No matching tickets found.")
        return 0

    updated = 0
    for ticket in tickets:
        created_at = parse_created_at(ticket.get("created_at"))
        priority = ticket.get("priority") or "medium"
        deadline = sla_service.calculate_deadline(priority, created_at).isoformat()

        print(
            f"{ticket['id']} | {ticket.get('status')} | {priority} | "
            f"{ticket.get('subject', '')[:60]} -> {deadline}"
        )

        if args.dry_run:
            continue

        sb.table("tickets").update({"sla_deadline": deadline}).eq("id", ticket["id"]).execute()
        updated += 1

    if not args.dry_run and updated:
        asyncio.run(invalidate_dashboard_cache())

    print(
        f"Processed {len(tickets)} ticket(s). "
        f"{'Dry run only.' if args.dry_run else f'Updated {updated} ticket(s).'}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
