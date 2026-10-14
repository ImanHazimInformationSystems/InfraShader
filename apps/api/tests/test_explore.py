from copy import deepcopy

from fastapi.testclient import TestClient

from app.main import app


def inputs():
    return {
        "center": [101.69, 3.14],
        "timestamp": "2026-10-14T09:00:00+08:00",
        "buildings": [
            {
                "height": 20,
                "ring": [
                    [101.69, 3.14],
                    [101.6901, 3.14],
                    [101.6901, 3.1401],
                    [101.69, 3.1401],
                    [101.69, 3.14],
                ],
            }
        ],
    }


def test_explorer_automatic_buildings_time_and_solar_without_project():
    client = TestClient(app)
    data = inputs()
    morning = client.post("/api/v1/explore/shadows", json=data)
    assert morning.status_code == 200
    assert morning.json()["building_count"] == 1
    assert morning.json()["shadows"]["features"]
    data["timestamp"] = "2026-10-14T15:00:00+08:00"
    afternoon = client.post("/api/v1/explore/shadows", json=data).json()
    assert morning.json()["shadows"] != afternoon["shadows"]
    data["timestamp"] = "2026-10-14T00:00:00+08:00"
    night = client.post("/api/v1/explore/shadows", json=data).json()
    assert night["status"] == "night"
    assert night["shadows"]["features"] == []
    data["buildings"] = []
    assert client.post("/api/v1/explore/shadows", json=data).json()["building_count"] == 0


def test_explorer_bounds_invalid_data_and_towers():
    client = TestClient(app)
    data = inputs()
    data["buildings"][0]["height"] = 450
    assert client.post("/api/v1/explore/shadows", json=data).status_code == 200
    for field, value in [("height", 1001), ("ring", [[0, 0]] * 5)]:
        invalid = deepcopy(data)
        invalid["buildings"][0][field] = value
        assert client.post("/api/v1/explore/shadows", json=invalid).status_code == 422
    data["timestamp"] = "2026-10-14T09:00:00"
    assert client.post("/api/v1/explore/shadows", json=data).status_code == 422
    data = inputs()
    data["buildings"] *= 501
    assert client.post("/api/v1/explore/shadows", json=data).status_code == 422


def test_bad_tile_fragment_does_not_hide_supported_building_shadows():
    data = inputs()
    data["buildings"].append({"height": 10, "ring": [[101.69, 3.14]] * 4})
    result = TestClient(app).post("/api/v1/explore/shadows", json=data)
    assert result.status_code == 200
    assert result.json()["omitted"] == 1
    assert result.json()["building_count"] == 1
    assert result.json()["shadows"]["features"]
