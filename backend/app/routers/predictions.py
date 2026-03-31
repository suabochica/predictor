from fastapi import APIRouter, HTTPException
from typing import List, Dict
from datetime import datetime

from app.models.models import Prediction, PredictionCreate
from app.data.users import get_user

router = APIRouter()

# In-memory storage for predictions (use database in production)
PREDICTIONS: Dict[str, Prediction] = {}


@router.post("/")
async def create_prediction(prediction: PredictionCreate) -> Prediction:
    """Submit a new prediction."""
    # Validate user exists
    user = get_user(prediction.user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Create prediction
    prediction_id = f"pred_{prediction.user_id}_{prediction.match_id}"

    new_prediction = Prediction(
        prediction_id=prediction_id,
        user_id=prediction.user_id,
        match_id=prediction.match_id,
        predicted_score_a=prediction.predicted_score_a,
        predicted_score_b=prediction.predicted_score_b,
        created_at=datetime.now(),
    )

    PREDICTIONS[prediction_id] = new_prediction
    return new_prediction


@router.get("/user/{user_id}")
async def get_user_predictions(user_id: int) -> List[Prediction]:
    """Get all predictions for a specific user."""
    return [p for p in PREDICTIONS.values() if p.user_id == user_id]


@router.get("/match/{match_id}")
async def get_match_predictions(match_id: str) -> List[Prediction]:
    """Get all predictions for a specific match."""
    return [p for p in PREDICTIONS.values() if p.match_id == match_id]


@router.get("/{prediction_id}")
async def get_prediction(prediction_id: str) -> Prediction:
    """Get a specific prediction."""
    if prediction_id not in PREDICTIONS:
        raise HTTPException(status_code=404, detail="Prediction not found")
    return PREDICTIONS[prediction_id]


@router.delete("/{prediction_id}")
async def delete_prediction(prediction_id: str) -> dict:
    """Delete a prediction (only allowed before match starts)."""
    if prediction_id not in PREDICTIONS:
        raise HTTPException(status_code=404, detail="Prediction not found")
    del PREDICTIONS[prediction_id]
    return {"message": "Prediction deleted"}
