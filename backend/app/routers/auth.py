from fastapi import APIRouter, HTTPException
from app.models.models import UserLogin, AuthUserResponse
from app.data.users import validate_user

router = APIRouter()


@router.post("/login", response_model=AuthUserResponse)
async def login(credentials: UserLogin):
    """Authenticate a user with username and password."""
    user = validate_user(credentials.username, credentials.password)
    if not user:
        raise HTTPException(status_code=401, detail="User not found")

    return AuthUserResponse(
        user_id=user.user_id,
        username=user.username,
        first_name=user.first_name,
        last_name=user.last_name,
        phone_number=user.phone_number,
        role=user.role,
        name=user.name,
    )