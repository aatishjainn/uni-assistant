import logging
import secrets
from typing import Literal

from fastapi import Depends, FastAPI, Header, HTTPException
from pydantic import BaseModel, Field

from .config import settings
from .prompts import GENERATE_TEMPLATES, chat_system_prompt, BASE_RULES
from .providers.base import LLMProvider

log = logging.getLogger("ai-service")
app = FastAPI(title="University Smart Assistant - AI Service")

_provider: LLMProvider | None = None


def get_provider() -> LLMProvider:
    global _provider
    if _provider is None:
        if settings.llm_provider == "gemini":
            from .providers.gemini import GeminiProvider
            _provider = GeminiProvider()
        else:
            raise RuntimeError(f"Unknown LLM_PROVIDER: {settings.llm_provider}")
    return _provider


def require_service_token(x_service_token: str = Header(default="")) -> None:
    """Only the Express backend (which knows the secret) may call this service."""
    expected = settings.ai_service_token
    if not expected or not secrets.compare_digest(x_service_token, expected):
        raise HTTPException(status_code=401, detail="Unauthorized")


class HistoryItem(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(max_length=settings.max_message_chars)


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=settings.max_message_chars)
    history: list[HistoryItem] = []
    mode: Literal["simple", "detailed"] = "simple"


class GenerateRequest(BaseModel):
    type: Literal["mcq", "assignment", "lesson_plan", "project_ideas", "interview_questions"]
    topic: str = Field(min_length=1, max_length=200)
    count: int = Field(default=10, ge=1, le=30)
    difficulty: Literal["easy", "medium", "hard"] = "medium"


class EmbedRequest(BaseModel):
    texts: list[str] = Field(min_length=1, max_length=100)


async def _call(coro):
    try:
        return await coro
    except Exception:
        log.exception("LLM provider error")  # full detail in logs only
        raise HTTPException(status_code=503, detail="The AI model is busy or unavailable. Please try again.")


@app.get("/ai/health")
async def health():
    return {"status": "ok", "provider": settings.llm_provider}


@app.post("/ai/chat", dependencies=[Depends(require_service_token)])
async def chat(req: ChatRequest, provider: LLMProvider = Depends(get_provider)):
    history = [h.model_dump() for h in req.history[-settings.max_history_messages:]]
    answer = await _call(provider.generate(chat_system_prompt(req.mode), history, req.message))
    return {"answer": answer, "sources": []}


@app.post("/ai/generate", dependencies=[Depends(require_service_token)])
async def generate(req: GenerateRequest, provider: LLMProvider = Depends(get_provider)):
    prompt = GENERATE_TEMPLATES[req.type].format(
        count=req.count, topic=req.topic, difficulty=req.difficulty
    )
    answer = await _call(provider.generate(BASE_RULES, [], prompt))
    return {"answer": answer, "sources": []}


@app.post("/ai/embed", dependencies=[Depends(require_service_token)])
async def embed(req: EmbedRequest, provider: LLMProvider = Depends(get_provider)):
    vectors = await _call(provider.embed(req.texts))
    return {"embeddings": vectors}
