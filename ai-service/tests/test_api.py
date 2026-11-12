import os
os.environ["AI_SERVICE_TOKEN"] = "test-token"

from fastapi.testclient import TestClient
from app.main import app, get_provider
from app.providers.base import LLMProvider


class Fake(LLMProvider):
    reply = None  # tests can set a fixed reply

    async def generate(self, system, history, message, json_mode=False):
        return Fake.reply if Fake.reply is not None else f"echo:{message}"

    async def embed(self, texts):
        return [[0.0] * 768 for _ in texts]


app.dependency_overrides[get_provider] = lambda: Fake()
c = TestClient(app)
H = {"X-Service-Token": "test-token"}


def test_health_open():
    assert c.get("/ai/health").status_code == 200


def test_requires_token():
    assert c.post("/ai/chat", json={"message": "hi"}).status_code == 401
    assert c.post("/ai/chat", json={"message": "hi"}, headers={"X-Service-Token": "x"}).status_code == 401


def test_chat_ok():
    r = c.post("/ai/chat", json={"message": "What is AI?", "mode": "detailed"}, headers=H)
    assert r.status_code == 200 and r.json()["answer"] == "echo:What is AI?"


def test_generate_mcq():
    r = c.post("/ai/generate", json={"type": "mcq", "topic": "DBMS", "count": 10}, headers=H)
    assert r.status_code == 200


def test_validation():
    assert c.post("/ai/chat", json={"message": ""}, headers=H).status_code == 422
    assert c.post("/ai/generate", json={"type": "hack", "topic": "x"}, headers=H).status_code == 422


INTENTS = [{"name": "student_attendance", "description": "own attendance"},
           {"name": "general_education", "description": "general"}]


def classify(reply, message="my attendance"):
    Fake.reply = reply
    try:
        return c.post("/ai/classify", json={"message": message, "intents": INTENTS}, headers=H)
    finally:
        Fake.reply = None


def test_classify_ok():
    r = classify('{"intent": "student_attendance", "about_other_person": false, "day": null}')
    assert r.status_code == 200 and r.json()["intent"] == "student_attendance"


def test_classify_other_person_flag():
    r = classify('{"intent": "student_attendance", "about_other_person": true, "day": "today"}')
    assert r.json()["about_other_person"] is True and r.json()["day"] == "today"


def test_classify_garbage_becomes_unclear():
    assert classify("I am not JSON").json()["intent"] == "unclear"
    assert classify("[1,2,3]").json()["intent"] == "unclear"


def test_classify_unknown_intent_becomes_unclear():
    assert classify('{"intent": "delete_everything"}').json()["intent"] == "unclear"
    assert classify('{"intent": "student_attendance", "day": "../etc"}').json()["day"] is None


def test_classify_needs_token():
    assert c.post("/ai/classify", json={"message": "x", "intents": INTENTS}).status_code == 401


def test_answer_ok():
    r = c.post("/ai/answer", headers=H, json={"message": "my attendance?", "data": {"overall_percentage": 90},
                                               "user": {"first_name": "Riya", "role": "student"}})
    assert r.status_code == 200 and "answer" in r.json()


def test_long_history_item_accepted():
    r = c.post("/ai/chat", headers=H, json={"message": "and an example?",
               "history": [{"role": "assistant", "content": "x" * 6000}]})
    assert r.status_code == 200


# ---- Gemini model fallback (no network: the Gemini client is replaced by a stub) ----
import asyncio
from google.genai import errors as genai_errors
from app.providers.gemini import GeminiProvider
from app.config import settings


class _Resp:
    text = "ok from backup"


def _provider(behaviour):
    p = GeminiProvider.__new__(GeminiProvider)
    calls = []

    class Models:
        async def generate_content(self, model, contents, config):
            calls.append(model)
            return behaviour(model)

    class Aio:
        models = Models()

    class Client:
        aio = Aio()

    p.client = Client()
    return p, calls


def test_fallback_on_quota_and_missing_model():
    def behaviour(model):
        if model == "a-primary":
            raise genai_errors.ClientError(429, {"error": {"message": "quota"}})
        if model == "b-missing":
            raise genai_errors.ClientError(404, {"error": {"message": "gone"}})
        return _Resp()

    p, calls = _provider(behaviour)
    old = (settings.gemini_chat_model, settings.gemini_fallback_models)
    settings.gemini_chat_model, settings.gemini_fallback_models = "a-primary", "b-missing, c-backup"
    try:
        out = asyncio.run(p.generate("sys", [], "hi"))
    finally:
        settings.gemini_chat_model, settings.gemini_fallback_models = old
    assert out == "ok from backup" and calls == ["a-primary", "b-missing", "c-backup"]


def test_no_fallback_on_real_errors():
    def behaviour(model):
        raise genai_errors.ClientError(400, {"error": {"message": "bad request"}})

    p, calls = _provider(behaviour)
    old = (settings.gemini_chat_model, settings.gemini_fallback_models)
    settings.gemini_chat_model, settings.gemini_fallback_models = "a", "b"
    try:
        try:
            asyncio.run(p.generate("sys", [], "hi"))
            raised = False
        except genai_errors.ClientError:
            raised = True
    finally:
        settings.gemini_chat_model, settings.gemini_fallback_models = old
    assert raised and calls == ["a"]
