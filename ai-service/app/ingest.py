"""Turns an uploaded PDF/DOCX into searchable text chunks."""
import io
import re

from docx import Document
from docx.table import Table
from docx.text.paragraph import Paragraph
from pypdf import PdfReader

MAX_PAGES = 300
MAX_CHARS = 1_500_000
MAX_CHUNKS = 600
CHUNK_SIZE = 1000
OVERLAP = 150


class IngestError(ValueError):
    """A problem with the document itself (shown to the admin)."""


def extract_pdf(data: bytes) -> list[tuple[int | None, str]]:
    try:
        reader = PdfReader(io.BytesIO(data))
        if reader.is_encrypted:
            raise IngestError("Password-protected PDFs are not supported.")
        if len(reader.pages) > MAX_PAGES:
            raise IngestError(f"The PDF has more than {MAX_PAGES} pages.")
        pages = []
        for number, page in enumerate(reader.pages, start=1):
            try:
                text = page.extract_text() or ""
            except Exception:
                text = ""
            if text.strip():
                pages.append((number, text))
        return pages
    except IngestError:
        raise
    except Exception:
        raise IngestError("The PDF could not be read. It may be corrupted.")


def extract_docx(data: bytes) -> list[tuple[int | None, str]]:
    try:
        doc = Document(io.BytesIO(data))
        parts = []
        for child in doc.element.body.iterchildren():
            tag = child.tag.rsplit("}", 1)[-1]
            if tag == "p":
                text = Paragraph(child, doc).text.strip()
                if text:
                    parts.append(text)
            elif tag == "tbl":
                for row in Table(child, doc).rows:
                    cells = [c.text.strip() for c in row.cells]
                    if any(cells):
                        parts.append(" | ".join(cells))
    except Exception:
        raise IngestError("The DOCX file could not be read. It may be corrupted.")
    text = "\n\n".join(parts)
    return [(None, text)] if text.strip() else []


def _split_long(text: str, size: int, overlap: int) -> list[str]:
    """Cut a long text into windows, preferring to end at a sentence or word boundary."""
    out, i = [], 0
    while i < len(text):
        end = min(i + size, len(text))
        if end < len(text):
            floor = i + int(size * 0.6)
            cut = max(text.rfind(". ", floor, end), text.rfind("\n", floor, end), text.rfind(" ", floor, end))
            if cut > i:
                end = cut + 1
        piece = text[i:end].strip()
        if piece:
            out.append(piece)
        if end >= len(text):
            break
        i = max(end - overlap, i + 1)
    return out


def chunk_pages(pages: list[tuple[int | None, str]], size: int = CHUNK_SIZE, overlap: int = OVERLAP) -> list[dict]:
    """Chunks never cross a page boundary, so every chunk has a correct page number for citations."""
    chunks: list[dict] = []
    for page, raw in pages:
        text = re.sub(r"[ \t]+", " ", raw.replace("\r", ""))
        paragraphs = [p.strip() for p in re.split(r"\n\s*\n", text) if p.strip()]
        current = ""

        def flush():
            nonlocal current
            if current.strip():
                chunks.append({"text": current.strip(), "page": page})
            current = ""

        for para in paragraphs:
            if len(current) + len(para) + 2 <= size:
                current = f"{current}\n\n{para}" if current else para
                continue
            flush()
            if len(para) > size:
                for piece in _split_long(para, size, overlap):
                    chunks.append({"text": piece, "page": page})
            else:
                current = para
        flush()
    for index, chunk in enumerate(chunks):
        chunk["index"] = index
    return chunks


def extract_and_chunk(data: bytes, kind: str) -> list[dict]:
    pages = extract_pdf(data) if kind == "pdf" else extract_docx(data)
    if sum(len(t) for _, t in pages) > MAX_CHARS:
        raise IngestError("The document is too large to index.")
    chunks = chunk_pages(pages)
    if not chunks:
        raise IngestError("No readable text found. Scanned/image-only documents are not supported (no OCR).")
    if len(chunks) > MAX_CHUNKS:
        raise IngestError("The document is too large to index. Split it into smaller files.")
    return chunks
