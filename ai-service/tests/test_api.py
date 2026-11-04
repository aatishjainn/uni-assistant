import os
os.environ["AI_SERVICE_TOKEN"] = "test-token"

from fastapi.testclient import TestClient
from app.main import app, get_provider
from app.providers.base import LLMProvider


class Fake(LLMProvider):
    async def generate(self, system, history, message):
        return f"echo:{message}"

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
