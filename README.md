# University Smart Assistant

## Structure
- `frontend/`   React + Tailwind
- `backend/`    Node + Express (auth, RBAC, business APIs)
- `ai-service/` Python + FastAPI (RAG, LLM, ingestion)
- `db/migrations/` SQL, auto-run by Postgres container on first start

## Run the database
    cp .env.example .env     # then edit values
    docker compose up -d db

## Run the AI service
    cd ai-service
    python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
    pip install -r requirements.txt
    uvicorn app.main:app --reload --port 8000
Docs at http://localhost:8000/docs. Tests: `pytest` (no API key needed, uses a fake model).
