"""Renderable 2D design preview of one saved design option (local metres, north up).

Built from the canonical saved workspace, so a preview shows exactly the items, sizes and
quantities that were priced. It is a schematic of recorded geometry: not a survey, not a
3D scene and not verified on site.
"""

import shapely
from pyproj import Transformer
from shapely.geometry import mapping, shape

from app.domain.geometry import project_wgs84_geometry

FORMAT = "infrashader-design-preview-v1"


def _round(value):
    return round(float(value), 2)


def _walk(value):
    if isinstance(value, (list, tuple)) and value and isinstance(value[0], (int, float)):
        return [_round(value[0]), _round(value[1])]
    return [_walk(part) for part in value]


def design_preview(saved: dict, option: str) -> dict:
    boundary = saved["boundary"]
    projected = project_wgs84_geometry(boundary, source_crs="EPSG:4326")
    crs = projected.metric_crs
    forward = Transformer.from_crs("EPSG:4326", crs, always_xy=True)
    min_x, min_y, max_x, max_y = projected.geometry.bounds

    def local(geometry):
        moved = shapely.transform(
            shape(geometry),
            lambda xy: [
                (x - min_x, y - min_y)
                for x, y in zip(*forward.transform(xy[:, 0], xy[:, 1]), strict=True)
            ],
        )
        data = mapping(moved)
        return {"type": data["type"], "coordinates": _walk(data["coordinates"])}

    scenario = saved["scenarios"][option]
    items, counts = [], {}
    for item in scenario["items"]:
        if not item.get("geometry"):
            continue
        quantity = item.get("quantity") or {}
        entry = {
            "id": item["id"],
            "name": item["name"],
            "kind": item["kind"],
            "category": item.get("category", "General"),
            "status": item.get("status", "proposed"),
            "geometry": local(item["geometry"]),
            "quantity": _round(quantity.get("value", 0)),
            "unit": (quantity.get("calculated") or {}).get("unit", ""),
        }
        if item["kind"] == "tree":
            plant = item.get("plant") or {}
            entry["crown_m"] = item.get("crown_diameter_m") or plant.get("current_crown_m") or 2
            entry["mature_crown_m"] = plant.get("mature_crown_m") or entry["crown_m"]
            entry["variant"] = (item.get("tree_design") or {}).get("variant", "existing")
        if item.get("object_instance"):
            entry["asset"] = item["object_instance"]["asset_id"]
        recipe = item.get("assembly")
        if recipe and item["kind"] == "path":
            entry["width_m"] = recipe["width_m"]
        if item.get("road"):
            entry["road_surface"] = item["road"]["surface"]
        items.append(entry)
        if entry["status"] == "proposed":
            key = entry.get("asset") or item["kind"]
            counts[key] = counts.get(key, 0) + 1
    paint = [
        {
            "texture": stroke["texture"],
            "radius_m": stroke["radius_m"],
            "points": [
                [_round(a - min_x), _round(b - min_y)]
                for a, b in (forward.transform(*p) for p in stroke["points"])
            ],
        }
        for stroke in scenario.get("ground_paint", [])
        if stroke["texture"] != "erase"
    ]
    site = local(boundary)
    return {
        "format": FORMAT,
        "crs": crs,
        "option_name": scenario["name"],
        "extent_m": {"width": _round(max_x - min_x), "height": _round(max_y - min_y)},
        "site": {"geometry": site, "area_m2": _round(projected.geometry.area)},
        "items": items,
        "paint": paint,
        "counts": counts,
        "notice": (
            "Schematic plan of the saved design (local metres, north up). Not a survey and "
            "not verified on site."
        ),
    }
