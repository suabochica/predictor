from app.models.models import User

# Mock data for 15 users
USERS = [
    User(user_id=1, name="Alex Garcia", avatar="https://i.pravatar.cc/150?u=1"),
    User(user_id=2, name="Maria Rodriguez", avatar="https://i.pravatar.cc/150?u=2"),
    User(user_id=3, name="Carlos Martinez", avatar="https://i.pravatar.cc/150?u=3"),
    User(user_id=4, name="Sofia Hernandez", avatar="https://i.pravatar.cc/150?u=4"),
    User(user_id=5, name="Juan Lopez", avatar="https://i.pravatar.cc/150?u=5"),
    User(user_id=6, name="Laura Gonzalez", avatar="https://i.pravatar.cc/150?u=6"),
    User(user_id=7, name="Diego Silva", avatar="https://i.pravatar.cc/150?u=7"),
    User(user_id=8, name="Valentina Perez", avatar="https://i.pravatar.cc/150?u=8"),
    User(user_id=9, name="Mateo Sanchez", avatar="https://i.pravatar.cc/150?u=9"),
    User(user_id=10, name="Camila Torres", avatar="https://i.pravatar.cc/150?u=10"),
    User(user_id=11, name="Lucas Ramirez", avatar="https://i.pravatar.cc/150?u=11"),
    User(user_id=12, name="Isabella Flores", avatar="https://i.pravatar.cc/150?u=12"),
    User(user_id=13, name="Daniel Castro", avatar="https://i.pravatar.cc/150?u=13"),
    User(user_id=14, name="Martina Ortiz", avatar="https://i.pravatar.cc/150?u=14"),
    User(user_id=15, name="Nicolas Ruiz", avatar="https://i.pravatar.cc/150?u=15"),
]


def get_user(user_id: int) -> User | None:
    """Get a user by ID."""
    for user in USERS:
        if user.user_id == user_id:
            return user
    return None


def get_all_users() -> list[User]:
    """Get all users."""
    return USERS
