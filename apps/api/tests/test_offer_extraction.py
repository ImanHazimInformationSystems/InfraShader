"""O06 bounded, untrusted text-layer suggestions."""

import io
import zipfile

import pytest
from fastapi import UploadFile

from app.offer_extraction import extract

XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


def pdf_with_lines(lines):
    """Hand-built single-page PDF with a Helvetica text layer and correct xref offsets."""
    text = (
        "BT /F1 11 Tf 50 750 Td 14 TL "
        + " ".join("(" + line.replace("(", "").replace(")", "") + ") Tj T*" for line in lines)
        + " ET"
    )
    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] "
        b"/Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
        b"<< /Length "
        + str(len(text)).encode()
        + b" >>\nstream\n"
        + text.encode()
        + b"\nendstream",
    ]
    out = io.BytesIO()
    out.write(b"%PDF-1.4\n")
    offsets = []
    for number, body in enumerate(objects, start=1):
        offsets.append(out.tell())
        out.write(f"{number} 0 obj\n".encode() + body + b"\nendobj\n")
    xref = out.tell()
    out.write(f"xref\n0 {len(objects) + 1}\n0000000000 65535 f \n".encode())
    for offset in offsets:
        out.write(f"{offset:010d} 00000 n \n".encode())
    out.write(
        f"trailer << /Size {len(objects) + 1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n".encode()
    )
    return out.getvalue()


def xlsx(rows, oversized=False):
    strings = sorted({cell for row in rows for cell in row if isinstance(cell, str)})
    index = {value: i for i, value in enumerate(strings)}
    cells = []
    for r, row in enumerate(rows, start=1):
        parts = []
        for c, value in enumerate(row):
            ref = f"{'ABCDEF'[c]}{r}"
            if isinstance(value, str):
                parts.append(f'<c r="{ref}" t="s"><v>{index[value]}</v></c>')
            else:
                parts.append(f'<c r="{ref}"><v>{value}</v></c>')
        cells.append(f'<row r="{r}">{"".join(parts)}</row>')
    ns = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"'
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("[Content_Types].xml", "<Types/>")
        archive.writestr("xl/workbook.xml", f"<workbook {ns}/>")
        archive.writestr(
            "xl/sharedStrings.xml",
            f"<sst {ns}>" + "".join(f"<si><t>{s}</t></si>" for s in strings) + "</sst>",
        )
        archive.writestr(
            "xl/worksheets/sheet1.xml",
            f"<worksheet {ns}><sheetData>{''.join(cells)}</sheetData></worksheet>",
        )
        if oversized:
            archive.writestr("xl/media/huge.bin", b"\0" * (21 * 1024 * 1024))
    return buffer.getvalue()


def test_pdf_text_layer_lines_with_amounts_become_unconfirmed_suggestions():
    result = extract(
        pdf_with_lines(
            [
                "Offer from Garden Works",
                "Paving works 12,500.00",
                "Planting: 3 000.00",
                "Total RM 15,500.00",
                "Notes without amount",
            ]
        ),
        "application/pdf",
    )
    assert result["status"] == "ok" and result["pages"] == 1
    found = {(s["text"], s["amount"]) for s in result["suggestions"]}
    assert ("Paving works", "12500.00") in found and ("Total", "15500.00") in found
    assert ("Planting", "3000.00") in found  # space-separated thousands, not 0.00
    assert all(s["location"].startswith("page 1 line ") for s in result["suggestions"])
    assert "Nothing is official" in result["notice"]


def test_blank_pdf_reports_no_text_layer_instead_of_inventing_values():
    result = extract(pdf_with_lines([]), "application/pdf")
    assert result["status"] == "no_text_layer" and result["suggestions"] == []
    assert "OCR is not available" in result["message"]


def test_xlsx_rows_with_text_and_a_number_are_suggested_with_cell_anchors():
    result = extract(
        xlsx([["Item", "Amount"], ["Paving", 12500], ["Lighting", 820.5], ["Note"]]), XLSX
    )
    assert result["status"] == "ok"
    assert {(s["text"], s["amount"]) for s in result["suggestions"]} == {
        ("Paving", "12500.00"),
        ("Lighting", "820.50"),
    }
    assert result["suggestions"][0]["location"] == "sheet1 row 2 cell B2"


def test_malformed_oversized_and_native_inputs_fail_explicitly():
    assert extract(b"%PDF-1.4\ngarbage\n%%EOF\n", "application/pdf")["status"] in (
        "unreadable",
        "no_text_layer",
    )
    assert extract(xlsx([["A", 1]], oversized=True), XLSX)["status"] == "unreadable"
    assert extract(b"{}", "application/json")["status"] == "unsupported"
    assert extract(b"x", "text/plain")["status"] == "unsupported"
    long = "x" * 1000 + " 1.00"
    suggestion = extract(pdf_with_lines([long]), "application/pdf")["suggestions"][0]
    assert len(suggestion["text"]) <= 300


@pytest.mark.integration
def test_suggestions_endpoint_is_reviewer_only_and_never_confirms(database):
    from sqlalchemy.orm import Session

    from app import owner_review as ow
    from app.errors import APIError
    from tests.test_owner_review import RECEIVED, actors

    org, pid, admin, member, approver, designer, foreign, spare = actors(database)
    with Session(database) as db:
        ow.save_basis(
            org,
            pid,
            ow.BasisInput(
                expected_revision=0,
                title="Extraction basis",
                tax_basis="exclusive",
                self_approval="permitted",
                reviewers=[admin],
                scope_items=[{"code": "PAV", "description": "Paving", "unit": "m2"}],
            ),
            admin,
            db,
        )
        sub = ow.create_submission(
            org,
            pid,
            ow.SubmissionCreate(
                bidder_name="Scanned bidder",
                channel="external_document",
                sender="Bidder",
                received_at=RECEIVED,
                receipt_evidence="Inbox",
            ),
            admin,
            db,
        )
        meta = ow.upload_file(
            org,
            pid,
            sub["key"],
            admin,
            db,
            UploadFile(file=io.BytesIO(pdf_with_lines(["Paving 1,200.00"])), filename="o.pdf"),
            "Original",
        )
        result = ow.file_suggestions(org, pid, meta["id"], admin, db)
        assert result["status"] == "ok" and result["suggestions"][0]["amount"] == "1200.00"
        for user in (designer, approver, foreign):  # Studio-only, approver-only, other tenant
            with pytest.raises(APIError):
                ow.file_suggestions(org, pid, meta["id"], user, db)
        state = ow.get_state(org, pid, admin, db)
        submission = state["submissions"][0]["payload"]
        assert submission["lines"] == [] and submission["confirmed_package_version"] is None
