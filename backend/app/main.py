from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import matches, predictions, leaderboard, rules, auth

app = FastAPI(
    title="World Cup 2026 Predictor API",
    description="API for FIFA World Cup 2026 Score Predictor",
    version="0.0.1",
)

# CORS for frontend communication
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:4321"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(matches.router, prefix="/api/matches", tags=["matches"])
app.include_router(predictions.router, prefix="/api/predictions", tags=["predictions"])
app.include_router(leaderboard.router, prefix="/api/leaderboard", tags=["leaderboard"])
app.include_router(rules.router, prefix="/api/rules", tags=["rules"])


@app.get("/")
async def root():
    return {"message": "World Cup 2026 Predictor API"}


@app.get("/health")
async def health_check():
    return {"status": "healthy"}
