from pydantic import BaseModel
from datetime import datetime
from typing import Optional, List
from enum import Enum


class MatchStatus(str, Enum):
    UPCOMING = "upcoming"
    LIVE = "live"
    FINISHED = "finished"


class Match(BaseModel):
    match_id: str
    team_a: str
    team_b: str
    match_date: datetime
    group: Optional[str] = None
    actual_score_a: Optional[int] = None
    actual_score_b: Optional[int] = None
    status: MatchStatus = MatchStatus.UPCOMING


class Prediction(BaseModel):
    prediction_id: str
    user_id: int
    match_id: str
    predicted_score_a: int
    predicted_score_b: int
    points_earned: Optional[int] = None
    created_at: datetime = datetime.now()


class PredictionCreate(BaseModel):
    user_id: int
    match_id: str
    predicted_score_a: int
    predicted_score_b: int


class User(BaseModel):
    user_id: int
    name: str
    avatar: str
    total_points: int = 0


class LeaderboardEntry(BaseModel):
    rank: int
    user: User
    total_points: int
    correct_scores: int = 0
    correct_outcomes: int = 0


class ScoringRule(BaseModel):
    rule_type: str
    points: int
    description: str


class UserRole(str, Enum):
    ADMIN = "admin"
    PARTICIPANT = "participant"


class UserLogin(BaseModel):
    username: str
    password: str


class AuthUser(BaseModel):
    user_id: int
    username: str
    password: str
    first_name: str
    last_name: str
    phone_number: str
    role: UserRole
    name: str  # Full name for display


class AuthUserResponse(BaseModel):
    user_id: int
    username: str
    first_name: str
    last_name: str
    phone_number: str
    role: UserRole
    name: str  # Full name for display
