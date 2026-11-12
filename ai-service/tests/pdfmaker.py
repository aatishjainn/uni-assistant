"""Tiny PDF writer so tests (and the sample documents) need no extra libraries."""
import textwrap


def _esc(s: str) -> str:
    return s.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")


def make_pdf(pages: list[str]) -> bytes:
    out = bytearray(b"%PDF-1.4\n")
    offsets: list[int] = []

    def add(obj: bytes) -> None:
        offsets.append(len(out))
        out.extend(obj)

    n = len(pages)
    add(b"1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n")
    kids = " ".join(f"{4 + 2 * i} 0 R" for i in range(n))
    add(f"2 0 obj\n<< /Type /Pages /Kids [{kids}] /Count {n} >>\nendobj\n".encode())
    add(b"3 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n")
    for i, text in enumerate(pages):
        body = "".join(f"({_esc(line)}) Tj T*\n" for line in text.split("\n"))
        stream = f"BT /F1 11 Tf 50 750 Td 14 TL\n{body}ET".encode("latin-1", "replace")
        add((f"{4 + 2 * i} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] "
             f"/Contents {5 + 2 * i} 0 R /Resources << /Font << /F1 3 0 R >> >> >>\nendobj\n").encode())
        add(f"{5 + 2 * i} 0 obj\n<< /Length {len(stream)} >>\nstream\n".encode() + stream + b"\nendstream\nendobj\n")
    xref = len(out)
    count = len(offsets) + 1
    out.extend(f"xref\n0 {count}\n0000000000 65535 f \n".encode())
    for off in offsets:
        out.extend(f"{off:010d} 00000 n \n".encode())
    out.extend(f"trailer\n<< /Size {count} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n".encode())
    return bytes(out)


def document_to_pages(title: str, sections: list[tuple[str, str]], lines_per_page: int = 44) -> list[str]:
    """Wrap text into pages of plain lines."""
    lines = [title, ""]
    for heading, body in sections:
        lines += [heading.upper(), ""]
        for para in body.split("\n"):
            lines += textwrap.wrap(para, 90) or [""]
        lines.append("")
    return ["\n".join(lines[i:i + lines_per_page]) for i in range(0, len(lines), lines_per_page)]
