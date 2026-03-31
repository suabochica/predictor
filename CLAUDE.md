# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

FIFA World Cup 2026 Score Predictor - A web application where users predict match scores and earn points based on accuracy.

### Tech Stack

- **Frontend**: AstroJS (meta-framework) + TypeScript, JavaScript
- **Backend**: Python + FastAPI
- **Package Manager**: pnpm
- **Testing**: Jest (frontend unit tests)

## Project Structure

```
/
├── frontend/          # AstroJS + TypeScript application
│   ├── src/
│   │   ├── components/     # Reusable UI components
│   │   ├── pages/          # Astro pages (file-based routing)
│   │   ├── layouts/        # Page layouts
│   │   ├── styles/         # CSS/SCSS files
│   │   └── types/          # TypeScript type definitions
│   ├── tests/              # Jest unit tests
│   ├── astro.config.mjs
│   ├── tsconfig.json
│   └── package.json
├── backend/           # Python FastAPI application
│   ├── app/
│   │   ├── main.py         # FastAPI entry point
│   │   ├── routers/        # API route modules
│   │   ├── models/         # Pydantic models
│   │   ├── services/       # Business logic
│   │   └── data/           # Mock data (15 users)
│   ├── requirements.txt
│   └── pyproject.toml
└── CLAUDE.md
```

## Frontend Commands (pnpm)

All frontend commands should be run from the `frontend/` directory.

```bash
# Install dependencies
cd frontend && pnpm install

# Start development server
cd frontend && pnpm run dev

# Build for production
cd frontend && pnpm run build

# Preview production build
cd frontend && pnpm run preview

# Run Jest unit tests
cd frontend && pnpm test

# Run tests in watch mode
cd frontend && pnpm test -- --watch

# Run a single test file
cd frontend && pnpm test -- path/to/test.spec.ts
```

## Backend Commands (Python)

All backend commands should be run from the `backend/` directory.

```bash
# Create virtual environment
cd backend && python -m venv venv

# Activate virtual environment
source backend/venv/bin/activate  # Linux/Mac
# or: backend\venv\Scripts\activate  # Windows

# Install dependencies
pip install -r requirements.txt

# Run FastAPI development server
uvicorn app.main:app --reload

# Run with specific host/port
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

## Development Workflow

1. **Start Backend**: `cd backend && source venv/bin/activate && uvicorn app.main:app --reload`
2. **Start Frontend**: `cd frontend && pnpm run dev` (separate terminal)
3. **Frontend runs on**: http://localhost:4321 (Astro default)
4. **Backend runs on**: http://localhost:8000
5. **API docs**: http://localhost:8000/docs (FastAPI Swagger UI)

## Application Features

### 1. Score Entry Form
- Users enter predicted scores for upcoming matches
- Validation for valid score ranges
- Submit predictions before match kickoff

### 2. Rules Section
- Display scoring rules (exact match, correct winner, etc.)
- Points calculation logic:
  - Exact score prediction: maximum points
  - Correct winner/draw: partial points
  - Wrong prediction: zero points

### 3. Leaderboard
- Display all 15 users ranked by total points
- Show individual match predictions vs actual results
- Mock user data stored in backend

## API Architecture (FastAPI)

### Key Endpoints

```
GET  /api/matches              # List all World Cup 2026 matches
GET  /api/matches/upcoming     # Get upcoming matches for prediction
POST /api/predictions         # Submit a prediction
GET  /api/predictions/{user}  # Get user's predictions
GET  /api/leaderboard         # Get ranked leaderboard
GET  /api/rules               # Get scoring rules
```

### Models

- `Match`: match_id, team_a, team_b, match_date, actual_score_a, actual_score_b, status
- `Prediction`: prediction_id, user_id, match_id, predicted_score_a, predicted_score_b, points_earned
- `User`: user_id, name, avatar, total_points
- `ScoringRule`: rule_type, points, description

## Frontend Architecture (Astro)

### Pages

- `/` - Landing page with upcoming matches
- `/predictions` - Score entry form
- `/leaderboard` - Rankings and scores
- `/rules` - How points are calculated

### Components

- `MatchCard`: Display match info with score input
- `PredictionForm`: Form for entering scores
- `LeaderboardTable`: Sorted user rankings
- `RulesSection`: Scoring explanation
- `UserAvatar`: User display with avatar

### State Management

- Use Astro's built-in state for server-rendered data
- Use React/Vue/Svelte islands for interactive components (score forms)
- Fetch API calls to backend endpoints

## Mock Data

15 users are mocked in `backend/app/data/users.py` with:
- Unique user IDs (1-15)
- Names and avatars
- Initial total_points = 0

## Environment Variables

### Frontend (.env)
```
PUBLIC_API_URL=http://localhost:8000
```

### Backend (.env)
```
CORS_ORIGINS=http://localhost:4321
```

## Testing

- Frontend: Jest for unit testing components
- Backend: pytest (optional, FastAPI has TestClient)

## Dependencies

### Frontend (package.json)
- `astro`
- `@astrojs/react` (or vue/svelte for islands)
- `typescript`
- `jest`, `@testing-library/*`

### Backend (requirements.txt)
- `fastapi`
- `uvicorn`
- `pydantic`
- `python-multipart`
