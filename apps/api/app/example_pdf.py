"""Minimal text-layer PDF writer for the built-in example offer documents.

Only used to produce clearly labelled fictional example documents. Output is plain
Helvetica text (WinAnsi), so the bounded text-layer suggestion feature can read it.
"""

from collections.abc import Iterable

PAGE_W, PAGE_H = 595, 842  # A4 in points
MARGIN, LEADING = 56, 15
LINES_PER_PAGE = (PAGE_H - 2 * MARGIN) // LEADING


def _escape(text: str) -> str:
    safe = text.encode("latin-1", "replace").decode("latin-1")
    return safe.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")


def _page_stream(lines: list[tuple[str, str]]) -> bytes:
    """Each line is (style, text); style is 'title', 'heading', 'body' or 'small'."""
    sizes = {"title": ("F2", 16), "heading": ("F2", 11), "body": ("F1", 10), "small": ("F1", 8)}
    parts = ["BT"]
    y = PAGE_H - MARGIN
    for style, text in lines:
        font, size = sizes[style]
        parts.append(f"/{font} {size} Tf 1 0 0 1 {MARGIN} {y} Tm ({_escape(text)}) Tj")
        y -= LEADING + (6 if style == "title" else 0)
    parts.append("ET")
    return "\n".join(parts).encode("latin-1")


def render(lines: Iterable[tuple[str, str]], *, footer: str) -> bytes:
    """Return a complete PDF; lines flow onto as many A4 pages as needed."""
    rows = list(lines)
    pages, current = [], []
    for row in rows:
        if len(current) >= LINES_PER_PAGE - 2:
            pages.append(current)
            current = []
        current.append(row)
    pages.append(current)
    total = len(pages)
    objects: list[bytes] = []

    def add(body: bytes) -> int:
        objects.append(body)
        return len(objects)

    catalog = add(b"")  # placeholder, filled below
    tree = add(b"")
    regular = add(
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>"
    )
    bold = add(
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>"
    )
    kids = []
    for number, page in enumerate(pages, start=1):
        content = page + [("small", ""), ("small", f"{footer}  -  page {number} of {total}")]
        stream = _page_stream(content)
        stream_id = add(
            b"<< /Length " + str(len(stream)).encode() + b" >>\nstream\n" + stream + b"\nendstream"
        )
        kids.append(
            add(
                (
                    f"<< /Type /Page /Parent {tree} 0 R /MediaBox [0 0 {PAGE_W} {PAGE_H}] "
                    f"/Resources << /Font << /F1 {regular} 0 R /F2 {bold} 0 R >> >> "
                    f"/Contents {stream_id} 0 R >>"
                ).encode()
            )
        )
    objects[catalog - 1] = f"<< /Type /Catalog /Pages {tree} 0 R >>".encode()
    objects[tree - 1] = (
        f"<< /Type /Pages /Kids [{' '.join(f'{k} 0 R' for k in kids)}] /Count {len(kids)} >>"
    ).encode()
    out = bytearray(b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")
    offsets = []
    for index, body in enumerate(objects, start=1):
        offsets.append(len(out))
        out += f"{index} 0 obj\n".encode() + body + b"\nendobj\n"
    xref = len(out)
    out += f"xref\n0 {len(objects) + 1}\n0000000000 65535 f \n".encode()
    for offset in offsets:
        out += f"{offset:010d} 00000 n \n".encode()
    out += (
        f"trailer\n<< /Size {len(objects) + 1} /Root {catalog} 0 R >>\nstartxref\n{xref}\n%%EOF\n"
    ).encode()
    return bytes(out)
