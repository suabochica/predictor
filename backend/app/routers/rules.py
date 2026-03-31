from fastapi import APIRouter
from typing import List

from app.models.models import ScoringRule

router = APIRouter()

# Scoring rules configuration
SCORING_RULES: List[ScoringRule] = [
    ScoringRule(
        rule_type="exact_score",
        points=10,
        description="Predict the exact score of the match",
    ),
    ScoringRule(
        rule_type="correct_winner",
        points=5,
        description="Predict the correct winner (but not exact score)",
    ),
    ScoringRule(
        rule_type="correct_draw",
        points=5,
        description="Predict a draw correctly",
    ),
    ScoringRule(
        rule_type="wrong_prediction",
        points=0,
        description="Failed to predict the outcome",
    ),
]


@router.get("/")
async def get_rules() -> List[ScoringRule]:
    """Get all scoring rules."""
    return SCORING_RULES


@router.get("/{rule_type}")
async def get_rule(rule_type: str) -> ScoringRule | None:
    """Get a specific scoring rule."""
    for rule in SCORING_RULES:
        if rule.rule_type == rule_type:
            return rule
    return None
