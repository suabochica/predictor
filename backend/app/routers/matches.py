from fastapi import APIRouter, HTTPException
from datetime import datetime, timedelta
from typing import List

from app.models.models import Match, MatchStatus

router = APIRouter()

# Mock matches data for World Cup 2026
# In production, this would come from a database
MATCHES: List[Match] = [
    Match(
        match_id="match_001",
        team_a="USA",
        team_b="Mexico",
        match_date=datetime(2026, 6, 12, 16, 0),
        group="A",
        status=MatchStatus.UPCOMING,
    ),
    Match(
        match_id="match_002",
        team_a="Brazil",
        team_b="Argentina",
        match_date=datetime(2026, 6, 12, 19, 0),
        group="B",
        status=MatchStatus.UPCOMING,
    ),
    Match(
        match_id="match_003",
        team_a="Germany",
        team_b="France",
        match_date=datetime(2026, 6, 13, 16, 0),
        group="C",
        status=MatchStatus.UPCOMING,
    ),
    Match(
        match_id="match_004",
        team_a="Spain",
        team_b="Portugal",
        match_date=datetime(2026, 6, 13, 19, 0),
        group="D",
        status=MatchStatus.UPCOMING,
    ),
    Match(
        match_id="match_005",
        team_a="England",
        team_b="Netherlands",
        match_date=datetime(2026, 6, 14, 16, 0),
        group="E",
        status=MatchStatus.UPCOMING,
    ),
]


@router.get("/")
async def get_matches() -> List[Match]:
    """Get all matches."""
    return MATCHES


@router.get("/upcoming")
async def get_upcoming_matches() -> List[Match]:
    """Get upcoming matches that haven't started yet."""
    now = datetime.now()
    return [m for m in MATCHES if m.match_date > now and m.status == MatchStatus.UPCOMING]


@router.get("/{match_id}")
async def get_match(match_id: str) -> Match:
    """Get a specific match by ID."""
    for match in MATCHES:
        if match.match_id == match_id:
            return match
    raise HTTPException(status_code=404, detail="Match not found")


@router.get("/group/{group}")
async def get_matches_by_group(group: str) -> List[Match]:
    """Get all matches in a specific group."""
    return [m for m in MATCHES if m.group and m.group.upper() == group.upper()]
