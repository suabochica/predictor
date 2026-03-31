from fastapi import APIRouter
from typing import List

from app.models.models import LeaderboardEntry
from app.data.users import get_all_users

router = APIRouter()


@router.get("/")
async def get_leaderboard() -> List[LeaderboardEntry]:
    """Get the leaderboard sorted by total points."""
    users = get_all_users()

    # Sort users by total points (descending)
    sorted_users = sorted(users, key=lambda u: u.total_points, reverse=True)

    leaderboard: List[LeaderboardEntry] = []
    current_rank = 0
    previous_points = None

    for index, user in enumerate(sorted_users):
        # Handle ties in ranking
        if user.total_points != previous_points:
            current_rank = index + 1
            previous_points = user.total_points

        entry = LeaderboardEntry(
            rank=current_rank,
            user=user,
            total_points=user.total_points,
            correct_scores=0,  # To be calculated
            correct_outcomes=0,  # To be calculated
        )
        leaderboard.append(entry)

    return leaderboard


@router.get("/user/{user_id}")
async def get_user_ranking(user_id: int) -> LeaderboardEntry | None:
    """Get the ranking for a specific user."""
    leaderboard = await get_leaderboard()
    for entry in leaderboard:
        if entry.user.user_id == user_id:
            return entry
    return None
