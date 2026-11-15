"""S09: CSV exports neutralise spreadsheet formulas but keep numbers numeric."""

import io

from app.csv_safety import cell, writer


def test_cells_neutralise_formula_prefixes_and_keep_numbers():
    for risky in ("=SUM(A1)", "+cmd", "-1+2", "@IMPORTXML(x)", "\tlead", "\rx", '=HYPERLINK("u")'):
        assert cell(risky) == "'" + risky
    for safe in ("-120.50", "45", "0.0001", "Paving", "", "MYR 1,000"):
        assert cell(safe) == safe
    assert cell(None) is None and cell(-3) == -3 and cell(True) is True


def test_writer_applies_to_every_cell():
    out = io.StringIO()
    writer(out).writerow(["=1+1", "-5.25", "ok"])
    assert out.getvalue().strip() == "'=1+1,-5.25,ok"
