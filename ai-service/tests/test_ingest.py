import io

import pytest
from docx import Document
from fastapi.testclient import TestClient

from app.ingest import IngestError, chunk_pages, extract_and_chunk
from app.main import app, get_provider
from app.providers.base import LLMProvider
from tests.pdfmaker import make_pdf

H = {"X-Service-Token": "test-token"}


class EmbedOK(LLMProvider):
    async def generate(self, system, history, message, json_mode=False):
        return "x"

    async def embed(self, texts, task="document"):
        return [[0.1] * 768 for _ in texts]


class EmbedFails(EmbedOK):
    async def embed(self, texts, task="document"):
        raise RuntimeError("quota")


@pytest.fixture
def client():
    import os
    os.environ["AI_SERVICE_TOKEN"] = "test-token"
    from app.config import settings
    settings.ai_service_token = "test-token"
    previous = app.dependency_overrides.get(get_provider)
    yield TestClient(app)
    if previous is None:
        app.dependency_overrides.pop(get_provider, None)
    else:
        app.dependency_overrides[get_provider] = previous


def make_docx(paragraphs, table=None):
    d = Document()
    for p in paragraphs:
        d.add_paragraph(p)
    if table:
        t = d.add_table(rows=len(table), cols=len(table[0]))
        for r, row in enumerate(table):
            for c, val in enumerate(row):
                t.cell(r, c).text = val
    buf = io.BytesIO()
    d.save(buf)
    return buf.getvalue()


def test_pdf_pages_and_numbers():
    pdf = make_pdf(["Hostel rules\nQuiet hours start at 10 PM.", "Library timings\nOpen 9 AM to 8 PM."])
    chunks = extract_and_chunk(pdf, "pdf")
    assert [c["page"] for c in chunks] == [1, 2]
    assert "Quiet hours" in chunks[0]["text"] and "Library timings" in chunks[1]["text"]


def test_long_text_is_split_with_overlap_and_page_kept():
    sentence = "The examination hall ticket must be carried at all times. "
    chunks = chunk_pages([(3, sentence * 80)], size=500, overlap=100)
    assert len(chunks) > 5 and all(c["page"] == 3 for c in chunks)
    assert all(len(c["text"]) <= 500 for c in chunks)
    assert [c["index"] for c in chunks] == list(range(len(chunks)))


def test_docx_paragraphs_and_tables():
    docx = make_docx(["Grievance procedure", "Submit the form to the dean."], table=[["Step", "Office"], ["1", "Dean office"]])
    text = " ".join(c["text"] for c in extract_and_chunk(docx, "docx"))
    assert "Grievance procedure" in text and "Step | Office" in text and "1 | Dean office" in text


def test_empty_pdf_is_rejected_clearly():
    with pytest.raises(IngestError, match="No readable text"):
        extract_and_chunk(make_pdf([""]), "pdf")


def test_corrupted_files_are_rejected():
    with pytest.raises(IngestError):
        extract_and_chunk(b"%PDF-1.4 this is not really a pdf", "pdf")
    with pytest.raises(IngestError):
        extract_and_chunk(b"PK\x03\x04garbage", "docx")


def test_ingest_endpoint_returns_chunks_with_embeddings(client):
    app.dependency_overrides[get_provider] = lambda: EmbedOK()
    pdf = make_pdf(["BCA admission documents\nMarksheet and ID proof are required."])
    r = client.post("/ai/ingest", headers=H, files={"file": ("a.pdf", pdf, "application/pdf")}, data={"kind": "pdf"})
    assert r.status_code == 200
    body = r.json()
    assert body["embedding_error"] is None and len(body["chunks"][0]["embedding"]) == 768


def test_ingest_keeps_chunks_when_embedding_fails(client):
    app.dependency_overrides[get_provider] = lambda: EmbedFails()
    pdf = make_pdf(["Scholarship rules\nMerit scholarship for top scorers."])
    r = client.post("/ai/ingest", headers=H, files={"file": ("a.pdf", pdf, "application/pdf")}, data={"kind": "pdf"})
    assert r.status_code == 200
    assert r.json()["embedding_error"] and r.json()["chunks"][0]["embedding"] is None


def test_ingest_requires_token_and_valid_kind(client):
    app.dependency_overrides[get_provider] = lambda: EmbedOK()
    pdf = make_pdf(["x y z"])
    assert client.post("/ai/ingest", files={"file": ("a.pdf", pdf)}, data={"kind": "pdf"}).status_code == 401
    assert client.post("/ai/ingest", headers=H, files={"file": ("a.exe", pdf)}, data={"kind": "exe"}).status_code == 422
    assert client.post("/ai/ingest", headers=H, files={"file": ("a.pdf", make_pdf([""]))}, data={"kind": "pdf"}).status_code == 422


def test_answer_kinds_use_different_rules(client):
    from app.prompts import answer_system_prompt
    assert "numbered excerpts" in answer_system_prompt("A", "student", "documents")
    assert "official, approved" in answer_system_prompt("A", "student", "public_records")
    assert "own record" in answer_system_prompt("A", "student", "personal")
