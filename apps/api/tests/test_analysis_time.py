from datetime import datetime
from uuid import uuid4

import pytest
from pydantic import ValidationError

from app.calculations import AnalysisInput, analysis_time


def inputs(**kwargs):
    return AnalysisInput(expected_revision=1, request_key=uuid4(), target_id=uuid4(), **kwargs)


def test_local_time_uses_project_zone_not_machine_zone():
    value = analysis_time(inputs(local_timestamp="2026-03-21T12:00"), "Asia/Kuala_Lumpur")
    assert value.isoformat() == "2026-03-21T12:00:00+08:00"
    explicit = inputs(timestamp="2026-03-21T04:00:00Z")
    assert analysis_time(explicit, "Asia/Kuala_Lumpur") == value


@pytest.mark.parametrize("value", ["2026-03-08T02:30", "2026-11-01T01:30"])
def test_nonexistent_or_ambiguous_local_time_requires_offset(value):
    with pytest.raises(ValueError, match="ambiguous or does not exist"):
        analysis_time(inputs(local_timestamp=value), "America/New_York")


def test_exactly_one_time_and_offset_contract():
    for values in (
        {},
        {"timestamp": datetime(2026, 1, 1)},
        {"local_timestamp": "2026-01-01T12:00+08:00"},
        {"timestamp": "2026-01-01T12:00Z", "local_timestamp": "2026-01-01T12:00"},
    ):
        with pytest.raises(ValidationError):
            inputs(**values)
