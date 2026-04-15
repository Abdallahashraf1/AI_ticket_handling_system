from fastapi import APIRouter, Depends

from app.db.supabase_client import get_admin_client
from app.middleware.auth import require_role

router = APIRouter()


@router.get("/overview")
async def manager_overview(user: dict = Depends(require_role("manager", "admin"))):
    sb = get_admin_client()
    total = sb.table("tickets").select("id", count="exact").execute().count or 0
    open_count = (
        sb.table("tickets")
        .select("id", count="exact")
        .in_("status", ["new", "triaging", "routing", "resolving", "escalated", "pending_review", "reopened"])
        .execute()
        .count
        or 0
    )
    resolved = (
        sb.table("tickets")
        .select("id", count="exact")
        .in_("status", ["resolved", "closed"])
        .execute()
        .count
        or 0
    )
    resolution_rate = round((resolved / total) * 100, 2) if total else 0.0
    return {
        "total_tickets": total,
        "open_tickets": open_count,
        "resolved_tickets": resolved,
        "resolution_rate": resolution_rate,
    }


@router.get("/teams")
async def manager_teams(user: dict = Depends(require_role("manager", "admin"))):
    sb = get_admin_client()
    teams_resp = sb.table("teams").select("id,name,description,specialization").order("name").execute()
    teams = teams_resp.data or []
    team_ids = [t["id"] for t in teams]

    members_by_team = {}
    if team_ids:
        members_resp = (
            sb.table("profiles")
            .select("id,full_name,email,role,team_id")
            .in_("team_id", team_ids)
            .order("full_name")
            .execute()
        )
        for member in members_resp.data or []:
            members_by_team.setdefault(member["team_id"], []).append(member)

    return [
        {
            **team,
            "members": members_by_team.get(team["id"], []),
            "member_count": len(members_by_team.get(team["id"], [])),
        }
        for team in teams
    ]

