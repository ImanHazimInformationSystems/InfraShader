"""M2 quantity/CRS acceptance fixtures; these are not persistence acceptance."""

from math import inf, nan

import pytest
from pyproj import Transformer
from shapely import transform
from shapely.geometry import mapping

from app.domain.geometry import (
    MAX_VERTICES,
    GeometryValidationError,
    calculate_geographic_quantity,
    calculate_metric_quantity,
    count_quantity,
    project_wgs84_geometry,
    select_active_quantity,
)


def polygon(points):
    return {"type": "Polygon", "coordinates": [points]}


def line(points):
    return {"type": "LineString", "coordinates": points}


RECTANGLE = polygon([[0, 0], [10, 0], [10, 20], [0, 20], [0, 0]])
SITE = polygon(
    [[100.979, 4.385], [100.980, 4.385], [100.980, 4.386], [100.979, 4.386], [100.979, 4.385]]
)


def test_v1_exact_metric_area_and_length():
    area = calculate_metric_quantity(RECTANGLE, metric_crs="EPSG:32647")
    length = calculate_metric_quantity(line([[0, 0], [3, 0], [3, 4]]), metric_crs="EPSG:32647")
    assert (area.value, area.unit, area.metric_crs) == (200.0, "m2", "EPSG:32647")
    assert (length.value, length.unit) == (7.0, "m")


def test_geographic_projection_uses_longitude_first_and_suitable_utm():
    projected = project_wgs84_geometry(SITE, source_crs="EPSG:4326")
    assert projected.metric_crs == "EPSG:32647"
    assert projected.source_crs == "EPSG:4326"
    assert 700_000 < projected.geometry.centroid.x < 730_000
    assert 480_000 < projected.geometry.centroid.y < 490_000
    quantity = calculate_geographic_quantity(SITE, source_crs="EPSG:4326")
    assert quantity.unit == "m2"
    assert 12_000 < quantity.value < 12_400


def test_geographic_round_trip_and_known_metric_fixture():
    to_geographic = Transformer.from_crs("EPSG:32647", "EPSG:4326", always_xy=True)
    x, y = Transformer.from_crs("EPSG:4326", "EPSG:32647", always_xy=True).transform(100.979, 4.385)
    fixture = polygon([[x, y], [x + 10, y], [x + 10, y + 20], [x, y + 20], [x, y]])
    geographic = polygon(
        [list(to_geographic.transform(*point)) for point in fixture["coordinates"][0]]
    )
    projected = project_wgs84_geometry(geographic, source_crs="EPSG:4326")
    quantity = calculate_geographic_quantity(geographic, source_crs="EPSG:4326")
    assert quantity.value == pytest.approx(200, abs=1e-6)
    round_trip = transform(projected.geometry, to_geographic.transform, interleaved=False)
    for actual, expected in zip(
        mapping(round_trip)["coordinates"][0], geographic["coordinates"][0], strict=True
    ):
        assert actual == pytest.approx(expected, abs=1e-10)


@pytest.mark.parametrize("metric_crs", ["EPSG:4326", "EPSG:2263", "", "not-a-crs"])
def test_degrees_feet_missing_and_invalid_crs_are_not_metric(metric_crs):
    with pytest.raises(GeometryValidationError):
        calculate_metric_quantity(RECTANGLE, metric_crs=metric_crs)


@pytest.mark.parametrize("source_crs", ["WGS84", "EPSG:3857", "", None])
def test_geographic_transfer_requires_explicit_wgs84(source_crs):
    with pytest.raises(GeometryValidationError, match="EPSG:4326"):
        calculate_geographic_quantity(SITE, source_crs=source_crs)


@pytest.mark.parametrize(
    "coordinate", [[nan, 0], [0, inf], [True, 0], ["1", 0], [0], [0, 0, 3], None]
)
def test_malformed_and_nonfinite_coordinates_are_rejected(coordinate):
    with pytest.raises(GeometryValidationError):
        calculate_metric_quantity(line([[0, 0], coordinate]), metric_crs="EPSG:32647")


@pytest.mark.parametrize("coordinate", [[181, 4], [100, 85], [-181, 4], [100, -81]])
def test_geographic_ranges_are_rejected(coordinate):
    with pytest.raises(GeometryValidationError, match="longitude"):
        project_wgs84_geometry(line([[100, 4], coordinate]), source_crs="EPSG:4326")


@pytest.mark.parametrize(
    "geometry",
    [
        polygon([[0, 0], [10, 10], [0, 10], [10, 0], [0, 0]]),  # Bow tie.
        polygon([[0, 0], [10, 0], [20, 0], [0, 0]]),  # Collinear.
        polygon([[0, 0], [10, 0], [10, 0], [0, 10], [0, 0]]),
        polygon([[0, 0], [10, 0], [0, 10]]),  # Unclosed ring.
        line([[0, 0], [0, 0]]),
        line([[0, 0], [10, 10], [0, 10], [10, 0]]),
        line([[0, 0], [10, 0], [0, 0]]),
        {"type": "Polygon", "coordinates": []},
        {
            "type": "Polygon",
            "coordinates": [RECTANGLE["coordinates"][0], RECTANGLE["coordinates"][0]],
        },
        {"type": "MultiPolygon", "coordinates": []},
        {"type": "Feature", "geometry": RECTANGLE},
    ],
)
def test_invalid_or_unsupported_geometries_are_rejected(geometry):
    with pytest.raises(GeometryValidationError):
        calculate_metric_quantity(geometry, metric_crs="EPSG:32647")


def test_vertex_limit_and_local_scope_are_enforced():
    with pytest.raises(GeometryValidationError, match="vertex"):
        calculate_metric_quantity(
            line([[n, n] for n in range(MAX_VERTICES + 1)]), metric_crs="EPSG:32647"
        )
    with pytest.raises(GeometryValidationError, match="5 km"):
        calculate_metric_quantity(line([[0, 0], [4_000, 4_000]]), metric_crs="EPSG:32647")
    with pytest.raises(GeometryValidationError, match="5 km"):
        project_wgs84_geometry(line([[100.979, 4.385], [101.079, 4.385]]), source_crs="EPSG:4326")


@pytest.mark.parametrize(
    "coordinates",
    [[[5.999, 4], [6.001, 4]], [[100, -0.001], [100, 0.001]], [[179.999, 4], [-179.999, 4]]],
)
def test_cross_zone_equator_and_antimeridian_are_rejected(coordinates):
    with pytest.raises(GeometryValidationError, match="UTM zone and hemisphere"):
        project_wgs84_geometry(line(coordinates), source_crs="EPSG:4326")


def test_work_must_stay_within_declared_site_boundary():
    inside = line([[100.9792, 4.3852], [100.9798, 4.3858]])
    quantity = calculate_geographic_quantity(inside, source_crs="EPSG:4326", site_boundary=SITE)
    assert quantity.unit == "m"
    assert 90 < quantity.value < 100
    with pytest.raises(GeometryValidationError, match="within"):
        calculate_geographic_quantity(
            line([[100.978, 4.3852], [100.9798, 4.3858]]),
            source_crs="EPSG:4326",
            site_boundary=SITE,
        )


def test_count_and_quantity_override_preserve_calculation_and_provenance():
    calculated = calculate_metric_quantity(RECTANGLE, metric_crs="EPSG:32647")
    active = select_active_quantity(
        calculated, provenance="measured", source_note=" Tape survey ", override=198.5
    )
    assert active.value == 198.5
    assert active.calculated.value == 200
    assert active.source_note == "Tape survey"
    assert active.is_override
    assert count_quantity(2).value == 2
    assert count_quantity(0).value == 0
    assert count_quantity(2).metric_crs is None


@pytest.mark.parametrize("count", [-1, 1.5, True, 1_000_001])
def test_invalid_count_is_rejected(count):
    with pytest.raises(GeometryValidationError):
        count_quantity(count)


def test_sourced_override_preserves_calculation_and_source_note():
    calculated = calculate_metric_quantity(RECTANGLE, metric_crs="EPSG:32647")
    active = select_active_quantity(
        calculated, provenance="sourced", source_note=" Approved takeoff, sheet A12 ", override=205
    )
    assert active.value == 205
    assert active.calculated.value == 200
    assert active.provenance == "sourced"
    assert active.source_note == "Approved takeoff, sheet A12"
    assert active.is_override


@pytest.mark.parametrize("override", [-1, 0, nan, inf, True, "20"])
def test_invalid_area_override_is_rejected(override):
    calculated = calculate_metric_quantity(RECTANGLE, metric_crs="EPSG:32647")
    with pytest.raises(GeometryValidationError):
        select_active_quantity(
            calculated, provenance="measured", source_note="Survey", override=override
        )


def test_override_requires_source_and_nonderived_provenance():
    calculated = count_quantity(2)
    for provenance, note, override in [
        ("measured", "", 3),
        ("calculated", "Imported", 3),
        ("invented", "Survey", 3),
        ("measured", "Survey", 2.5),
    ]:
        with pytest.raises(GeometryValidationError):
            select_active_quantity(
                calculated, provenance=provenance, source_note=note, override=override
            )
