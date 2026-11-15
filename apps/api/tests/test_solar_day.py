from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

from app.domain.shade import solar_position
from app.main import app


@pytest.mark.parametrize(
    "center,day,offset", [([100.958, 4.386], "2026-10-17", 8), ([-74, 40.7], "2026-03-20", -4)]
)
def test_daily_positions_match_shadow_engine_and_events(center, day, offset):
    response = TestClient(app).post(
        "/api/v1/explore/solar-day", json={"center": center, "date": day, "utc_offset": offset}
    )
    assert response.status_code == 200
    result = response.json()
    assert len(result["samples"]) == 1441
    start = datetime.fromisoformat(day).replace(tzinfo=timezone(timedelta(hours=offset)))
    for minute in (0, 360, 720, 1100, 1440):
        expected = solar_position(start + timedelta(minutes=minute), *center)
        for key, value in expected.items():
            assert result["samples"][minute][key] == pytest.approx(value, abs=1e-8)
    events = result["events"]
    assert events["sunrise"] < events["solar_noon"] < events["sunset"]
    assert result["samples"][events["sunrise"]]["elevation_deg"] >= -0.833
    assert result["samples"][0]["elevation_deg"] < -6


@pytest.mark.parametrize("day,daylight", [("2026-06-21", True), ("2026-12-21", False)])
def test_polar_day_and_night_have_no_invented_events(day, daylight):
    response = TestClient(app).post(
        "/api/v1/explore/solar-day", json={"center": [15, 78], "date": day, "utc_offset": 1}
    )
    data = response.json()
    assert data["events"]["sunrise"] is None
    assert data["events"]["sunset"] is None
    assert all((s["elevation_deg"] > 0) == daylight for s in data["samples"])


def test_daily_endpoint_rejects_unbounded_or_invalid_input():
    client = TestClient(app)
    for patch in ({"utc_offset": 15}, {"date": "1999-12-31"}, {"date": "bad"}, {"center": [0, 91]}):
        assert (
            client.post(
                "/api/v1/explore/solar-day",
                json={"center": [100, 4], "date": "2026-10-17", "utc_offset": 8, **patch},
            ).status_code
            == 422
        )
