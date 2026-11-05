import json
import logging
import secrets
from typing import Literal

from fastapi import Depends, FastAPI, Header, HTTPException
from pydantic import BaseModel, Field

from .config import settings
from .prompts import (GENERATE_TEMPLATES, chat_system_prompt, BASE_RULES,
                      classify_system_prompt, answer_system_prompt)
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
    content: str = Field(max_length=8000)  # assistant answers can be long


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


DAYS = {"today", "tomorrow", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday", "week"}


class IntentInfo(BaseModel):
    name: str = Field(pattern=r"^[a-z_]{1,60}$")
    description: str = Field(max_length=300)


class ClassifyRequest(BaseModel):
    message: str = Field(min_length=1, max_length=settings.max_message_chars)
    recent: list[HistoryItem] = []
    intents: list[IntentInfo] = Field(min_length=1, max_length=30)


class UserContext(BaseModel):
    first_name: str = Field(max_length=60)
    role: str = Field(max_length=20)


class AnswerRequest(BaseModel):
    message: str = Field(min_length=1, max_length=settings.max_message_chars)
    history: list[HistoryItem] = []
    data: dict | list
    user: UserContext


def parse_classification(text: str, valid: set[str]) -> dict:
    """Never trust model output: anything unexpected becomes 'unclear'."""
    fallback = {"intent": "unclear", "about_other_person": False, "day": None}
    cleaned = text.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
    try:
        obj = json.loads(cleaned)
        if not isinstance(obj, dict):
            return fallback
    except Exception:
        return fallback
    intent = obj.get("intent")
    if intent not in valid:
        intent = "unclear"
    day = obj.get("day")
    return {
        "intent": intent,
        "about_other_person": obj.get("about_other_person") is True,
        "day": day if day in DAYS else None,
    }


@app.post("/ai/classify", dependencies=[Depends(require_service_token)])
async def classify(req: ClassifyRequest, provider: LLMProvider = Depends(get_provider)):
    recent = [h.model_dump() for h in req.recent[-4:]]
    text = await _call(provider.generate(classify_system_prompt(req.intents), recent, req.message, json_mode=True))
    return parse_classification(text, {i.name for i in req.intents})


@app.post("/ai/answer", dependencies=[Depends(require_service_token)])
async def answer(req: AnswerRequest, provider: LLMProvider = Depends(get_provider)):
    history = [h.model_dump() for h in req.history[-6:]]
    payload = json.dumps(req.data, default=str)[:20000]
    prompt = f"<data>\n{payload}\n</data>\n\nQuestion: {req.message}"
    text = await _call(provider.generate(answer_system_prompt(req.user.first_name, req.user.role), history, prompt))
    return {"answer": text, "sources": []}
