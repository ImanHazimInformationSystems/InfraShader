"""O06 bounded text-layer suggestions from retained offer originals.

Untrusted, unconfirmed suggestions only: extracted text never becomes an official comparison
or evaluation value until a person maps and confirms it in the offer editor. No OCR and no AI:
a scanned PDF without a text layer is reported as such. Work is bounded by pages, rows,
uncompressed member size, output length and wall-clock time.
"""

import io
import re
import threading
import time
import zipfile
from decimal import Decimal, InvalidOperation
from xml.etree import ElementTree

MAX_PAGES = 100
MAX_ROWS = 5000
MAX_SUGGESTIONS = 500
MAX_TEXT = 300
MAX_MEMBER_BYTES = 20 * 1024 * 1024
TIME_LIMIT_S = 15.0
AMOUNT = re.compile(r"(?<![\w.])(?:RM|MYR)?\s*(\d{1,3}(?:[, ]\d{3})+|\d+)(\.\d{2})\s*$")
NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}


def _clean(text):
    text = re.sub(r"[\x00-\x08\x0b-\x1f\x7f]", " ", str(text))
    return re.sub(r"\s+", " ", text).strip()[:MAX_TEXT]


def _amount(text):
    match = AMOUNT.search(text)
    if not match:
        return None, text
    try:
        value = Decimal(re.sub(r"[, ]", "", match.group(1)) + match.group(2))
    except InvalidOperation:
        return None, text
    label = _clean(text[: match.start()]).rstrip(" :-")
    return f"{value:.2f}", label


def _pdf(content, deadline):
    from pypdf import PdfReader

    reader = PdfReader(io.BytesIO(content))
    pages = len(reader.pages)
    rows, chars, read = [], 0, 0
    for number, page in enumerate(reader.pages[:MAX_PAGES], start=1):
        if time.monotonic() > deadline:
            break
        text = page.extract_text() or ""
        read = number
        chars += len(text.strip())
        for line_no, raw in enumerate(text.splitlines(), start=1):
            amount, label = _amount(raw)
            if amount is not None and label:
                rows.append(
                    {"location": f"page {number} line {line_no}", "text": label, "amount": amount}
                )
    if chars == 0:
        return {
            "status": "no_text_layer",
            "message": (
                "No text layer was found (for example a scanned document). OCR is not available; "
                "enter values manually from the viewer."
            ),
            "pages": pages,
            "suggestions": [],
        }
    return {"status": "ok", "pages": pages, "pages_read": read, "suggestions": rows}


def _xlsx(content, deadline):
    archive = zipfile.ZipFile(io.BytesIO(content))
    for info in archive.infolist():
        if info.file_size > MAX_MEMBER_BYTES:
            raise ValueError("A workbook part exceeds the 20 MiB uncompressed limit.")
    shared = []
    if "xl/sharedStrings.xml" in archive.namelist():
        root = ElementTree.fromstring(archive.read("xl/sharedStrings.xml"))
        shared = ["".join(t.text or "" for t in si.iter(f"{{{NS['m']}}}t")) for si in root]
    sheets = sorted(
        (n for n in archive.namelist() if re.fullmatch(r"xl/worksheets/sheet\d+\.xml", n)),
        key=lambda n: int(re.search(r"(\d+)", n.rsplit("/", 1)[1]).group(1)),
    )
    rows, count = [], 0
    for name in sheets:
        sheet = name.rsplit("/", 1)[1].removesuffix(".xml")
        root = ElementTree.fromstring(archive.read(name))
        for row in root.iter(f"{{{NS['m']}}}row"):
            count += 1
            if count > MAX_ROWS or time.monotonic() > deadline:
                break
            texts, numbers, ref = [], [], row.get("r")
            for cell in row.findall("m:c", NS):
                kind, value = cell.get("t"), cell.find("m:v", NS)
                if kind == "s" and value is not None and value.text and value.text.isdigit():
                    index = int(value.text)
                    texts.append(shared[index] if index < len(shared) else "")
                elif kind == "inlineStr":
                    texts.append("".join(t.text or "" for t in cell.iter(f"{{{NS['m']}}}t")))
                elif value is not None and value.text:
                    try:
                        numbers.append((cell.get("r"), Decimal(value.text)))
                    except InvalidOperation:
                        texts.append(value.text)
            label = _clean(" ".join(t for t in texts if t))
            if label and numbers:
                cell_ref, amount = numbers[-1]
                rows.append(
                    {
                        "location": f"{sheet} row {ref} cell {cell_ref}",
                        "text": label,
                        "amount": f"{amount.quantize(Decimal('0.01'))}",
                    }
                )
    return {"status": "ok", "sheets": len(sheets), "rows_read": count, "suggestions": rows}


def _native_package(content):
    """An InfraShader submission package: offer its declared total as an unverified line."""
    import json

    try:
        data = json.loads(content.decode("utf-8"))
    except (UnicodeDecodeError, ValueError):
        return None
    if not isinstance(data, dict) or data.get("schema") != "infrashader.submission-package.v1":
        return None
    proposal = data.get("proposal") or {}
    total = proposal.get("selling_total")
    rows = []
    if total is not None:
        try:
            amount = f"{Decimal(str(total)).quantize(Decimal('0.01'))}"
        except (InvalidOperation, ValueError):
            amount = None
        if amount is not None:
            rows.append(
                {
                    "location": "package proposal.selling_total",
                    "text": f"Quoted total, issued proposal v{proposal.get('issued_version')} "
                    f"({proposal.get('currency') or 'MYR'})",
                    "amount": amount,
                }
            )
    return {
        "status": "ok",
        "notice": (
            "Read from the contractor's InfraShader package. This is the contractor's "
            "declaration, not a verified figure; check it against the proposal PDF."
        ),
        "suggestions": rows,
    }


def extract(content: bytes, content_type: str) -> dict:
    """Return bounded suggestions. Never raises for malformed input; failures are explicit."""
    if content_type == "application/json":
        package = _native_package(content)
        if package is not None:
            return package
        return {
            "status": "unsupported",
            "message": (
                "Native JSON snapshots are structured already; confirm their values directly."
            ),
            "suggestions": [],
        }
    handler = {
        "application/pdf": _pdf,
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": _xlsx,
    }.get(content_type)
    if handler is None:
        return {
            "status": "unsupported",
            "message": "This file type is not extracted.",
            "suggestions": [],
        }
    deadline = time.monotonic() + TIME_LIMIT_S
    box = {}

    def work():
        try:
            box["result"] = handler(content, deadline)
        except Exception as exc:  # noqa: BLE001 - malformed documents are reported, not raised
            box["error"] = exc

    worker = threading.Thread(target=work, daemon=True)
    worker.start()
    worker.join(TIME_LIMIT_S + 5)
    if worker.is_alive():
        return {
            "status": "timeout",
            "message": "Text extraction exceeded its time limit; enter values manually.",
            "suggestions": [],
        }
    if "error" in box:
        return {
            "status": "unreadable",
            "message": (
                "The document text could not be read; use the viewer and enter values manually."
            ),
            "suggestions": [],
        }
    result = box["result"]
    truncated = len(result["suggestions"]) > MAX_SUGGESTIONS or time.monotonic() > deadline
    result["suggestions"] = result["suggestions"][:MAX_SUGGESTIONS]
    result["truncated"] = truncated
    result["notice"] = (
        "Unverified suggestions from the document text. Nothing is official until you map each "
        "line, check it against the document and confirm it."
    )
    return result
