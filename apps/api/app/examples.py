"""Built-in reference projects for new users (Design Studio and Organisation Review).

Three fictional contractors design the same real open field in Shah Alam, Selangor. Each design
is a Design Studio example project; the Organisation Review example receives the same three
designs as proposals. Everything is created through the domain functions and endpoint handlers
a person uses, so quantities, prices, revisions and scores come from the real backend. The
review uses the same design builders and pricing code, so plans and totals tally exactly with
the Studio examples. Client, contractors, rates and documents are fictional and labelled. No
survey, field accuracy or market price is claimed.
"""

import io
import json
from contextlib import contextmanager
from copy import deepcopy
from datetime import UTC, date, datetime, timedelta
from decimal import ROUND_HALF_UP, Decimal
from functools import lru_cache
from math import cos, pi, sin
from typing import Annotated, Literal
from uuid import NAMESPACE_URL, UUID, uuid4, uuid5

from fastapi import APIRouter, Depends, Response, UploadFile
from pyproj import Transformer
from sqlalchemy import select
from sqlalchemy import text as sql
from sqlalchemy.orm import Session

from app import access, calculations, change_register, owner_review, projects, workspace
from app.auth import current_user
from app.db import database_session
from app.design_preview import design_preview
from app.domain.pricing import calculate_estimate
from app.errors import APIError
from app.example_pdf import render
from app.models import CatalogueRate, Project
from app.schedules import pricing_items
from app.schemas import ProjectCreate, ProjectResponse, ProjectUpdate

router = APIRouter(prefix="/api/v1/organisations/{organisation_id}/examples")
DB = Annotated[Session, Depends(database_session)]
User = Annotated[UUID, Depends(current_user)]
Kind = Literal["studio", "review"]
STUDIO_KEYS = ("studio_a", "studio_b", "studio_c")
# Bumped when the examples change; older example projects are archived (not deleted) and rebuilt.
EXAMPLE_SOURCE = "Built-in example project (v2: three flat-ground designs)"

# ----------------------------------------------------------------------------- site

# Open grass field in a residential neighbourhood of Shah Alam, Selangor (WGS84).
ORIGIN = (101.51053, 3.07315)
CRS = "EPSG:32647"
_INVERSE = Transformer.from_crs(CRS, "EPSG:4326", always_xy=True)
_OX, _OY = Transformer.from_crs("EPSG:4326", CRS, always_xy=True).transform(*ORIGIN)
EXAMPLE_NOTE = (
    "Built-in example for learning. The location is a real open field in Shah Alam, but the "
    "client, contractors, rates and documents are fictional. Nothing here is a survey, a "
    "commission or a market quotation."
)
LAYOUT_SOURCE = (
    "Example concept layout drawn over aerial imagery; dimensions are design intent, "
    "not surveyed. Verify on site."
)


def ll(x: float, y: float) -> list[float]:
    """Local metres east/north of the site origin (UTM 47N) to WGS84 lon/lat."""
    lon, lat = _INVERSE.transform(_OX + x, _OY + y)
    return [round(lon, 8), round(lat, 8)]


def ring(points):
    coordinates = [ll(x, y) for x, y in points]
    return coordinates + [coordinates[0]]


def polygon(points, holes=()):
    return {"type": "Polygon", "coordinates": [ring(points), *[ring(h) for h in holes]]}


def line(points):
    return {"type": "LineString", "coordinates": [ll(x, y) for x, y in points]}


def point(x, y):
    return {"type": "Point", "coordinates": ll(x, y)}


def rect(x0, y0, x1, y1):
    return [(x0, y0), (x1, y0), (x1, y1), (x0, y1)]


def ellipse(cx, cy, rx, ry, n=16):
    return [(cx + rx * cos(2 * pi * i / n), cy + ry * sin(2 * pi * i / n)) for i in range(n)]


BOUNDARY = [(-60, -24), (-42, -42), (42, -42), (60, -24), (60, 24), (42, 42), (-42, 42), (-60, 24)]
LOOP = [(-50, -20), (-38, -34), (38, -34), (50, -20), (50, 20), (38, 34), (-38, 34), (-50, 20)]
LOOP_LINE = [*LOOP, (-50, -18)]  # a loop with a 2 m entry gap (no repeated vertex)
LAWN = [(-46, -18), (-36, -30), (36, -30), (46, -18), (46, 18), (36, 30), (-36, 30), (-46, 18)]


def site():
    outline = ring(BOUNDARY)
    lons, lats = [p[0] for p in outline], [p[1] for p in outline]
    return {
        "bounds": [min(lons), min(lats), max(lons), max(lats)],
        "outline": {"type": "Polygon", "coordinates": [outline]},
    }


# ----------------------------------------------------------------------------- rates

# Illustrative 2026 Klang Valley allowances for the example only (MYR, cost basis).
RATE_NOTE = (
    "Example allowance for the built-in reference projects (illustrative 2026 Klang Valley "
    "level). Not a market quotation; replace with your own sourced rates."
)
RATES = {
    "EX-CLEAR": ("Site clearance, setting out and tree protection", "item", "6500", ["labour"]),
    "EX-PRELIM": ("Preliminaries: hoarding, signage and site safety", "item", "12000", []),
    "EX-CONC": ("Concrete grade 20 for paths", "m3", "330", []),
    "EX-CRUN": ("Crusher-run sub-base", "m3", "85", []),
    "EX-PREMIX": ("Bituminous premix wearing course", "m3", "520", []),
    "EX-PATHLAB": ("Path forming, finishing and curing labour", "m2", "18", []),
    "EX-PAVERPATH": ("2.4 m paver walkway on sand and sub-base", "m", "200", ["labour"]),
    "EX-GRAVELPATH": ("1.5 m compacted gravel path with timber edging", "m", "75", ["labour"]),
    "EX-PAVER": ("Interlocking concrete pavers 60 mm on sand and sub-base", "m2", "85", ["labour"]),
    "EX-SHELTER": (
        "Timber wakaf shelter on concrete footings (plan area)",
        "m2",
        "950",
        ["labour"],
    ),
    "EX-GAZEBO": ("Timber garden gazebo on concrete base", "item", "42000", ["labour"]),
    "EX-PERGOLA": ("Timber pergola with climbers", "item", "16000", ["labour"]),
    "EX-EPDM": ("EPDM safety surfacing 40 mm on concrete base", "m2", "260", ["labour"]),
    "EX-PLAY": ("Play platform with slide (supply and install)", "item", "38000", ["labour"]),
    "EX-TURF": ("Cow grass close turfing on 50 mm topsoil", "m2", "9.5", ["labour"]),
    "EX-TR-TAB": ("Tabebuia rosea, 3 m, 75 mm stem, planted and staked", "item", "280", ["labour"]),
    "EX-TR-MIM": ("Mimusops elengi, 3 m, planted and staked", "item", "320", ["labour"]),
    "EX-TR-HOP": ("Hopea odorata, 3 m, planted and staked", "item", "300", ["labour"]),
    "EX-TR-PTE": ("Pterocarpus indicus, 3 m, planted and staked", "item", "290", ["labour"]),
    "EX-TR-SYZ": ("Syzygium grande, 3 m, planted and staked", "item", "310", ["labour"]),
    "EX-HELI": ("Heliconia psittacorum, 4 L bag, planted", "item", "6.5", ["labour"]),
    "EX-IXORA": ("Ixora (jejarum), 3 L bag, planted", "item", "7", ["labour"]),
    "EX-HEDGE": ("Syzygium myrtifolium hedge, 0.6 m, 6 L bag, planted", "item", "9", ["labour"]),
    "EX-BENCH": ("Park bench with backrest, installed", "item", "1450", ["labour"]),
    "EX-LIGHT": ("Solar path light, installed on footing", "item", "2800", ["labour"]),
    "EX-BIN": ("Litter bin, installed", "item", "650", ["labour"]),
    "EX-BIKE": ("Cycle parking rail, installed", "item", "900", ["labour"]),
}
RATE_CATEGORY = {
    "EX-CLEAR": "Site preparation",
    "EX-PRELIM": "Preliminaries",
    "EX-CONC": "Hardscape",
    "EX-CRUN": "Hardscape",
    "EX-PREMIX": "Hardscape",
    "EX-PATHLAB": "Hardscape",
    "EX-PAVERPATH": "Hardscape",
    "EX-GRAVELPATH": "Hardscape",
    "EX-PAVER": "Hardscape",
    "EX-SHELTER": "Structures",
    "EX-GAZEBO": "Structures",
    "EX-PERGOLA": "Structures",
    "EX-EPDM": "Play",
    "EX-PLAY": "Play",
    "EX-TURF": "Softscape",
    "EX-HELI": "Softscape",
    "EX-IXORA": "Softscape",
    "EX-HEDGE": "Softscape",
}


def ensure_rates(db, org, user, today):
    """Reuse the organisation's current example rates, creating any that are missing."""
    ids = {}
    for code, (description, unit, amount, includes) in RATES.items():
        current = db.scalar(
            select(CatalogueRate)
            .where(
                CatalogueRate.organisation_id == org,
                CatalogueRate.code == code,
                CatalogueRate.archived.is_(False),
            )
            .order_by(CatalogueRate.version.desc())
            .limit(1)
        )
        usable = (
            current is not None
            and current.basis == "cost"
            and current.unit == unit
            and current.amount == Decimal(amount)
            and current.effective_date <= today
            and (current.valid_until is None or current.valid_until >= today + timedelta(days=120))
        )
        if usable:
            ids[code] = str(current.id)
            continue
        created = calculations.create_rate(
            db,
            org,
            user,
            calculations.RateInput(
                category=RATE_CATEGORY.get(code, "Planting" if "TR" in code else "Furniture"),
                code=code,
                description=description,
                unit=unit,
                basis="cost",
                amount=amount,
                effective_date=today - timedelta(days=14),
                valid_until=today + timedelta(days=365),
                source_note=RATE_NOTE,
                includes=includes,
            ),
        )
        ids[code] = created["id"]
    return ids


def offline_id(code):
    return str(uuid5(NAMESPACE_URL, f"infrashader-example-rate:{code}"))


def offline_rates():
    """Rate records for in-memory pricing (same amounts as the catalogue example rates)."""
    return {
        offline_id(code): {
            "id": offline_id(code),
            "code": code,
            "version": 1,
            "unit": unit,
            "currency": "MYR",
            "basis": "cost",
            "amount": amount,
            "includes": includes,
            "description": description,
        }
        for code, (description, unit, amount, includes) in RATES.items()
    }


# ----------------------------------------------------------------------------- design kit

TREES = {
    "TAB": ("Tabebuia rosea", "Pink trumpet tree", "canopy", 8),
    "MIM": ("Mimusops elengi", "Bunga tanjung", "evergreen", 9),
    "HOP": ("Hopea odorata", "Merawan siput jantan", "columnar", 7),
    "PTE": ("Pterocarpus indicus", "Angsana", "canopy", 12),
    "SYZ": ("Syzygium grande", "Jambu laut", "evergreen", 8),
}
SCOPE = {
    "S01": "Site preparation and preliminaries",
    "S02": "Paths, walkways and access",
    "S03": "Shelters, pergolas and plaza paving",
    "S04": "Children's play area (surfacing and equipment)",
    "S05": "Lawn turfing",
    "S06": "Trees, supplied, planted and staked",
    "S07": "Shrub, hedge and flower planting",
    "S08": "Benches, bins, cycle rail and lighting",
}


def plant(code, scientific, common, size, crown, mature, method="explicit_count", spacing=1.0):
    return {
        "code": code,
        "scientific_name": scientific,
        "common_name": common,
        "source": "Example nursery list (illustrative); confirm stock with a nursery",
        "nursery_size": size,
        "current_crown_m": crown,
        "mature_crown_m": mature,
        "spacing_m": spacing,
        "method": method,
        "sun_water": "Full sun to light shade; regular watering during establishment",
        "suitability": (
            "Example selection only; confirm species suitability with a qualified landscape "
            "architect and the local authority planting list"
        ),
        "maintenance": "Water, weed and mulch during establishment; formative pruning as needed",
    }


class Design:
    """Builds example workspaces with an explicit item -> common scope mapping."""

    def __init__(self, rates: dict):
        self.rates = rates
        self.scope: dict[str, str] = {}

    def item(self, scope, name, kind, *, rate=None, **fields):
        value = {
            "id": str(uuid4()),
            "name": name,
            "kind": kind,
            "provenance": "estimated",
            "source_note": LAYOUT_SOURCE,
            "rate_id": self.rates[rate] if rate else None,
            **fields,
        }
        if scope:
            self.scope[value["id"]] = scope
        return value

    def tree(self, species, x, y):
        scientific, common, variant, mature = TREES[species]
        return self.item(
            "S06",
            f"{common} ({scientific})",
            "tree",
            rate=f"EX-TR-{species}",
            geometry=point(x, y),
            category="Planting",
            layout_plant="tree",
            crown_diameter_m=2.0,
            tree_design={
                "variant": variant,
                "scale": 1.0,
                "rotation_deg": (abs(x * 7 + y * 3)) % 360,
                "stock_spec": f"{scientific}, 3.0 m height, 75 mm stem, 45 L bag",
                "rate_reviewed": True,
            },
            plant=plant(f"TR-{species}", scientific, common, "3.0 m, 45 L bag", 1.5, mature),
        )

    def obj(self, scope, name, asset, x, y, rate, rotation=0.0):
        lon, lat = ll(x, y)
        return self.item(
            scope,
            name,
            "object",
            rate=rate,
            object_instance={
                "asset_id": asset,
                "longitude": lon,
                "latitude": lat,
                "rotation_deg": rotation,
            },
        )

    def bench(self, x, y, label):
        return self.item(
            "S08",
            f"Park bench ({label})",
            "bench",
            rate="EX-BENCH",
            geometry=point(x, y),
            category="Furniture",
        )

    def lights(self, points, label="Solar path light"):
        return [self.obj("S08", label, "light", x, y, "EX-LIGHT") for x, y in points]

    def bins(self, points):
        return [self.obj("S08", "Litter bin", "bin", x, y, "EX-BIN") for x, y in points]

    def area(self, scope, name, points, rate, category, holes=(), **fields):
        return self.item(
            scope,
            name,
            "area",
            rate=rate,
            geometry=polygon(points, holes),
            category=category,
            **fields,
        )

    def concrete_path(self, name, points, width=1.8):
        return self.item(
            "S02",
            name,
            "path",
            geometry=line(points),
            category="Hardscape",
            assembly={
                "code": f"PATH-CONC-{width}",
                "use": "paving",
                "material": "Broom-finished concrete grade 20 on crusher-run",
                "finish": "Broom finish with control joints at 2 m",
                "source": "Example construction detail (illustrative)",
                "width_m": width,
                "approved": True,
                "pricing": "components",
                "components": [
                    {
                        "code": "CONC",
                        "name": "Concrete grade 20, 100 mm",
                        "basis": "volume",
                        "unit": "m3",
                        "thickness_mm": 100,
                        "wastage_percent": 5,
                        "rate_id": self.rates["EX-CONC"],
                    },
                    {
                        "code": "CRUN",
                        "name": "Crusher-run sub-base, 150 mm",
                        "basis": "volume",
                        "unit": "m3",
                        "thickness_mm": 150,
                        "wastage_percent": 5,
                        "rate_id": self.rates["EX-CRUN"],
                    },
                    {
                        "code": "LAB",
                        "name": "Forming, finishing and curing",
                        "category": "labour",
                        "basis": "per_surface",
                        "unit": "m2",
                        "rate_id": self.rates["EX-PATHLAB"],
                    },
                ],
            },
        )

    def rated_path(self, name, points, rate, width, material):
        """A path priced per metre with an inclusive recipe that records its width."""
        return self.item(
            "S02",
            name,
            "path",
            rate=rate,
            geometry=line(points),
            category="Hardscape",
            assembly={
                "code": f"{rate}-{width}",
                "use": "paving",
                "material": material,
                "finish": "As detailed by the contractor (example)",
                "source": "Example construction detail (illustrative)",
                "width_m": width,
                "approved": True,
                "pricing": "inclusive",
                "components": [
                    {"code": "SURF", "name": material, "basis": "surface", "unit": "m2"}
                ],
            },
        )

    def road(self, name, points, width):
        return self.item(
            "S02",
            name,
            "area",
            category="Access",
            road={
                "mode": "line",
                "surface": "pavement",
                "points": [ll(x, y) for x, y in points],
                "width_m": width,
            },
            assembly={
                "code": "ROAD-PREMIX",
                "use": "road",
                "material": "Premix on crusher-run",
                "finish": "Bituminous premix",
                "source": "Example construction detail (illustrative)",
                "width_m": width,
                "approved": True,
                "pricing": "components",
                "components": [
                    {
                        "code": "PREMIX",
                        "name": "Premix wearing course, 50 mm",
                        "basis": "volume",
                        "unit": "m3",
                        "thickness_mm": 50,
                        "wastage_percent": 5,
                        "rate_id": self.rates["EX-PREMIX"],
                    },
                    {
                        "code": "BASE",
                        "name": "Crusher-run road base, 200 mm",
                        "basis": "volume",
                        "unit": "m3",
                        "thickness_mm": 200,
                        "wastage_percent": 5,
                        "rate_id": self.rates["EX-CRUN"],
                    },
                ],
            },
        )

    def fixed(self, name, rate):
        return self.item(
            "S01",
            name,
            "manual",
            rate=rate,
            geometry=None,
            manual_basis="fixed",
            category="Preliminaries",
            provenance="manually_entered",
            source_note="Example fixed-price allowance agreed for the walkthrough",
        )

    def preliminaries(self):
        return [
            self.fixed("Site clearance, setting out and tree protection", "EX-CLEAR"),
            self.fixed("Preliminaries: hoarding, signage and site safety", "EX-PRELIM"),
        ]

    def bed(self, name, points, rate, scientific, common, size, spacing):
        return self.area(
            "S07",
            name,
            points,
            rate,
            "Softscape",
            plant=plant(
                f"SH-{rate[3:]}",
                scientific,
                common,
                size,
                0.3,
                0.8,
                method="square_spacing",
                spacing=spacing,
            ),
        )


def existing_items(design: Design):
    rain_trees = [(-52, -28), (52, -28), (-52, 28), (52, 28), (-24, 40), (26, -40)]
    trees = [
        design.item(
            None,
            f"Existing rain tree {index} (Samanea saman) - retain and protect",
            "tree",
            status="existing",
            geometry=point(x, y),
            crown_diameter_m=12,
            category="Existing trees",
            source_note=(
                "Position and crown read from aerial imagery (about +/- 3 m). Verify on site."
            ),
        )
        for index, (x, y) in enumerate(rain_trees, start=1)
    ]
    drain = design.item(
        None,
        "Existing roadside drain (retain)",
        "path",
        status="existing",
        geometry=line([(-40, -41), (40, -41)]),
        category="Existing services",
        source_note="Alignment read from aerial imagery; depth and condition unknown.",
    )
    return [*trees, drain]


# --- Example A: community park (Example Landscape Studio) ------------------------------

A_PLAZA = rect(-8, 8, 8, 22)
A_SHELTER = rect(-3, 12, 3, 18)
A_PLAY = rect(24, 2, 42, 18)
A_BED = ellipse(-28, -14, 10, 5)
A_TREES = (
    [("TAB", x, -38) for x in (-30, -15, 0, 15, 30)]
    + [("MIM", x, 30) for x in (-30, -15, 0, 15, 30)]
    + [("HOP", 55, -12), ("HOP", 55, 12), ("HOP", -55, -12), ("HOP", -55, 8)]
    + [("PTE", 20, 10), ("PTE", 33, -4), ("PTE", 18, 22)]
    + [("SYZ", -40, -24), ("SYZ", -14, -22)]
)


def design_a(d: Design, option: str):
    benches = [(-20, -30, "south"), (10, -30, "south"), (-10, 15, "plaza"), (10, 15, "plaza")]
    lights = [(-48.5, -10), (-48.5, 10), (48.5, -10), (48.5, 10)]
    items = [
        *d.preliminaries(),
        d.concrete_path("Walking loop path, 1.8 m concrete", LOOP_LINE),
        d.area("S03", "Shelter plaza paving", A_PLAZA, "EX-PAVER", "Hardscape"),
        d.item(
            "S03",
            "Timber wakaf shelter",
            "canopy",
            rate="EX-SHELTER",
            geometry=polygon(A_SHELTER),
            height_m=3.6,
            height_source="Example design height for a timber wakaf (concept)",
            category="Structures",
        ),
        *d.bins([(-44, -4), (0, 5)]),
    ]
    if option == "b":
        trees = [t for t in A_TREES if t[0] in ("TAB", "MIM")]
        return [
            *items,
            *[d.bench(x, y, label) for x, y, label in benches],
            *d.lights(lights),
            d.area(
                "S05",
                "Central lawn turfing (excludes plaza)",
                LAWN,
                "EX-TURF",
                "Softscape",
                holes=[A_PLAZA],
            ),
            *[d.tree(s, x, y) for s, x, y in trees],
        ]
    benches += [(-46, 0, "west"), (46, -6, "east")]
    lights += [(-20, -32.5), (20, -32.5), (-20, 32.5), (20, 32.5)]
    return [
        *items,
        *[d.bench(x, y, label) for x, y, label in benches],
        *d.lights(lights),
        *d.bins([(44, -10)]),
        d.obj("S08", "Cycle parking rail", "bike", -4, 25, "EX-BIKE", rotation=90),
        d.area("S04", "Play area EPDM safety surfacing", A_PLAY, "EX-EPDM", "Play"),
        d.obj("S04", "Play platform with slide", "play", 33, 10, "EX-PLAY"),
        d.area(
            "S05",
            "Central lawn turfing (excludes plaza, play area and planting bed)",
            LAWN,
            "EX-TURF",
            "Softscape",
            holes=[A_PLAZA, A_PLAY, A_BED],
        ),
        d.bed(
            "Heliconia planting bed",
            A_BED,
            "EX-HELI",
            "Heliconia psittacorum",
            "Parakeet flower",
            "4 L bag, 3 stems",
            0.6,
        ),
        d.item(
            "S07",
            "North boundary hedge",
            "path",
            rate="EX-HEDGE",
            geometry=line([(-36, 39), (36, 39)]),
            category="Softscape",
            plant=plant(
                "SH-HEDGE",
                "Syzygium myrtifolium",
                "Pucuk merah",
                "0.6 m, 6 L bag",
                0.3,
                1.0,
                method="line_spacing",
                spacing=0.5,
            ),
        ),
        *[d.tree(s, x, y) for s, x, y in A_TREES],
    ]


def change_a(d: Design):
    """Client change request: two benches facing the play area and two entrance lights."""
    return [
        d.bench(27, -1, "play area"),
        d.bench(39, -1, "play area"),
        *d.lights([(22, 0), (44, 0)], "Solar path light (play entrance)"),
    ]


# --- Example B: shaded garden park (Taman Indah Landscape Works) ------------------------

B_PLAZA = ellipse(0, 0, 9, 9, 20)
B_PLAY = rect(-40, 4, -24, 20)
B_BEDS = [rect(-8, 14, -3, 26), rect(3, 14, 8, 26)]
B_TREES = (
    [("TAB", x, -38) for x in (-36, -24, -12, 0, 12, 24, 36)]
    + [("MIM", x, 37) for x in (-36, -24, -12, 0, 12, 24, 36)]
    + [("HOP", x, y) for x in (-54, 54) for y in (-12, 0, 12)]
    + [("PTE", x, y) for x, y in ((-20, -5), (20, 5), (20, -5), (-20, -14))]
    + [("SYZ", x, y) for x, y in ((-13, -13), (13, 13), (13, -13), (-13, 13))]
)


def design_b(d: Design):
    paver = "Concrete pavers on sand and crusher-run"
    return [
        *d.preliminaries(),
        d.rated_path("Perimeter walkway, 2.4 m pavers", LOOP_LINE, "EX-PAVERPATH", 2.4, paver),
        *[
            d.rated_path(
                f"Garden cross walk ({label}), 2.4 m pavers", points, "EX-PAVERPATH", 2.4, paver
            )
            for label, points in (
                ("west", [(-46, 0), (-9, 0)]),
                ("east", [(9, 0), (46, 0)]),
                ("south", [(0, -30), (0, -9)]),
                ("north", [(0, 9), (0, 30)]),
            )
        ],
        d.road("Maintenance and drop-off access road, 3.5 m premix", [(59, -8), (51.5, -8)], 3.5),
        d.area("S03", "Central garden plaza paving", B_PLAZA, "EX-PAVER", "Hardscape"),
        d.obj("S03", "Garden gazebo", "gazebo", 0, 0, "EX-GAZEBO"),
        d.obj("S03", "Timber pergola (north-west)", "pergola", -16, 26, "EX-PERGOLA"),
        d.obj("S03", "Timber pergola (north-east)", "pergola", 16, 26, "EX-PERGOLA"),
        d.area("S04", "Play area EPDM safety surfacing", B_PLAY, "EX-EPDM", "Play"),
        d.obj("S04", "Play platform with slide", "play", -32, 12, "EX-PLAY"),
        d.area(
            "S05",
            "Lawn turfing (to lawn outline, excludes plaza, play area and beds)",
            LAWN,
            "EX-TURF",
            "Softscape",
            holes=[B_PLAZA, B_PLAY, *B_BEDS],
            source_note=LAYOUT_SOURCE + " Walk strips laid over the lawn are not deducted.",
        ),
        *[
            d.bed(
                f"Ixora flower bed ({side})",
                points,
                "EX-IXORA",
                "Ixora coccinea",
                "Jejarum",
                "3 L bag",
                0.5,
            )
            for side, points in zip(("west", "east"), B_BEDS, strict=True)
        ],
        *[d.tree(s, x, y) for s, x, y in B_TREES],
        *[
            d.bench(x, y, label)
            for x, y, label in (
                (-15, -29, "south"),
                (15, -29, "south"),
                (-30, 29, "north"),
                (30, 29, "north"),
                (-45, -8, "west"),
                (45, 8, "east"),
                (-12, 3, "plaza"),
                (12, -3, "plaza"),
                (-3, -12, "plaza"),
                (3, 12, "plaza"),
            )
        ],
        *d.lights(
            [
                (-47.6, -10),
                (-47.6, 10),
                (47.6, -10),
                (47.6, 10),
                (-20, -31.8),
                (20, -31.8),
                (-20, 31.8),
                (20, 31.8),
            ]
        ),
        *d.lights([(6.5, 6.5), (-6.5, 6.5), (6.5, -6.5), (-6.5, -6.5)], "Solar plaza light"),
        *d.bins([(-44, -4), (44, 4), (10, -10), (-10, 10)]),
    ]


# --- Example C: open lawn park (Kenari Build & Plant) ------------------------------------

C_PAD = rect(-5, 11, 5, 21)
C_SHELTER = rect(-2.5, 13.5, 2.5, 18.5)
C_BEDS = [rect(-10, 12, -6, 20), rect(6, 12, 10, 20)]


def design_c(d: Design):
    trees = [("TAB", x, -38) for x in (-30, -15, 0, 15, 30)] + [
        ("MIM", x, 37.5) for x in (-30, -15, 0, 15, 30)
    ]
    return [
        *d.preliminaries(),
        d.rated_path(
            "Walking loop, 1.5 m compacted gravel",
            LOOP_LINE,
            "EX-GRAVELPATH",
            1.5,
            "Compacted gravel with treated timber edging",
        ),
        d.area("S03", "Shelter pad, concrete pavers", C_PAD, "EX-PAVER", "Hardscape"),
        d.item(
            "S03",
            "Timber shelter",
            "canopy",
            rate="EX-SHELTER",
            geometry=polygon(C_SHELTER),
            height_m=3.2,
            height_source="Example design height (concept)",
            category="Structures",
        ),
        d.area(
            "S05",
            "Open lawn turfing (excludes shelter pad and beds)",
            LAWN,
            "EX-TURF",
            "Softscape",
            holes=[C_PAD, *C_BEDS],
        ),
        *[
            d.bed(
                f"Heliconia bed ({side})",
                points,
                "EX-HELI",
                "Heliconia psittacorum",
                "Parakeet flower",
                "4 L bag, 3 stems",
                0.6,
            )
            for side, points in zip(("west", "east"), C_BEDS, strict=True)
        ],
        *[d.tree(s, x, y) for s, x, y in trees],
        *[
            d.bench(x, y, label)
            for x, y, label in (
                (-20, -30, "south"),
                (20, -30, "south"),
                (-20, 30, "north"),
                (20, 30, "north"),
                (-8, 9, "shelter"),
                (8, 9, "shelter"),
            )
        ],
        *d.lights([(-48.5, -10), (-48.5, 10), (48.5, -10), (48.5, 10)]),
        *d.bins([(-44, -4), (44, 4)]),
    ]


def paint(kind):
    strokes = {
        "a": [
            ("lawn", 14, [(-20, 0), (0, -10), (18, -16)]),
            ("fine", 8, [(-28, -14)]),
            ("meadow", 6, [(-40, 20), (-36, 16)]),
        ],
        "b": [
            ("lawn", 12, [(-30, -15), (30, -15), (30, 15)]),
            ("meadow", 5, [(-36, -36), (0, -36), (36, -36)]),
            ("meadow", 5, [(-36, 37), (0, 37), (36, 37)]),
        ],
        "c": [
            ("lawn", 16, [(-25, -5), (0, 0), (25, -5)]),
            ("dry", 6, [(-40, -25), (40, 25)]),
        ],
    }[kind]
    return [
        {"texture": t, "radius_m": r, "points": [ll(x, y) for x, y in pts]} for t, r, pts in strokes
    ]


def constraints(existing):
    today = date.today()
    return [
        {
            "id": str(uuid4()),
            "title": "Mature rain trees at the field edge",
            "category": "existing_tree",
            "description": (
                "Six large rain trees ring the field. Keep machinery and stockpiles outside "
                "their root zones; hand-dig within 3 m of trunks."
            ),
            "source_type": "map_derived",
            "source_note": "Aerial imagery reading for the example",
            "uncertainty": "Positions about +/- 3 m; crown spread estimated",
            "related_ids": [item["id"] for item in existing if item["kind"] == "tree"],
            "status": "unverified",
        },
        {
            "id": str(uuid4()),
            "title": "Possible buried services along the northern verge",
            "category": "utility",
            "description": (
                "Assume electricity, telecom or water services may run beside the northern "
                "road. Arrange a utility locate before any excavation or footing work."
            ),
            "source_type": "estimated",
            "source_note": "Typical residential road verge arrangement; no record supplied",
            "uncertainty": "Unknown until a utility locate is carried out",
            "status": "site_check",
            "critical": True,
            "responsible": "Example site supervisor",
            "due_date": (today + timedelta(days=14)).isoformat(),
        },
    ]


# ----------------------------------------------------------------------------- examples

EXAMPLES = {
    "studio_a": {
        "letter": "A",
        "title": "Community park",
        "contractor": "Example Landscape Studio",
        "summary": (
            "A 300 m concrete walking loop, wakaf shelter plaza, play area, planting bed, "
            "hedge and 19 new trees. Includes a cheaper option and a client change."
        ),
        "margin": Decimal("15"),
        "programme_days": 84,
    },
    "studio_b": {
        "letter": "B",
        "title": "Shaded garden park",
        "contractor": "Taman Indah Landscape Works (fictional)",
        "summary": (
            "Paver walkways crossing at a gazebo plaza, two pergolas, flower beds, play area, "
            "a short maintenance access road and 28 new shade trees."
        ),
        "margin": Decimal("18"),
        "programme_days": 98,
    },
    "studio_c": {
        "letter": "C",
        "title": "Open lawn park",
        "contractor": "Kenari Build & Plant (fictional)",
        "summary": (
            "A low-cost open lawn with a gravel walking loop, small shelter, two shrub beds and "
            "10 trees. No children's play area."
        ),
        "margin": Decimal("12"),
        "programme_days": 70,
    },
}


def build_workspace(key: str, rates: dict, *, revised=False):
    """Return (draft, design) for one example; ``revised`` applies Example A's change."""
    d = Design(rates)
    existing = existing_items(d)
    letter = key[-1]
    if letter == "a":
        option_a = design_a(d, "a") + (change_a(d) if revised else [])
        option_b = {"name": "Value option (no play area)", "items": design_a(d, "b")}
        name = "Community park (recommended)"
    elif letter == "b":
        option_a, name = design_b(d), "Shaded garden park"
        option_b = {"name": "Option B (not used)", "items": []}
    else:
        option_a, name = design_c(d), "Open lawn park"
        option_b = {"name": "Option B (not used)", "items": []}
    first_target = {"a": A_PLAY, "b": B_PLAZA, "c": C_PAD}[letter]
    draft = {
        "expected_revision": 0,
        "boundary": polygon(BOUNDARY),
        "boundary_source": LAYOUT_SOURCE,
        "boundary_provenance": "estimated",
        "constraints": constraints(existing),
        "targets": [
            {
                "id": str(uuid4()),
                "name": "Main gathering space",
                "geometry": polygon(first_target),
                "source_note": LAYOUT_SOURCE,
                "provenance": "estimated",
            }
        ],
        "scenarios": {
            "baseline": {"name": "Existing field", "items": existing},
            "option_a": {"name": name, "items": option_a, "ground_paint": paint(letter)},
            "option_b": option_b,
        },
    }
    return draft, d


def canonical_input(saved: dict, revision: int):
    """Turn a saved canonical workspace back into an input for the next revision."""
    data = deepcopy(saved)
    for key in ("metric_crs", "boundary_area_m2"):
        data.pop(key, None)
    for target in data["targets"]:
        target.pop("area_m2", None)
        target.pop("reference_review_required", None)
    for scenario in data["scenarios"].values():
        for key in ("terrain_signature", "terrain_anchors"):
            scenario.pop(key, None)
        for item in scenario["items"]:
            for key in ("quantity", "schedule", "object_pose", "reference_review_required"):
                item.pop(key, None)
    data["expected_revision"] = revision
    return data


TWO = Decimal("0.01")


@lru_cache(maxsize=1)
def offline_examples():
    """The three final designs priced in memory with the same code as the Studio examples."""
    rates = offline_rates()
    result = {}
    for key, meta in EXAMPLES.items():
        draft, design = build_workspace(
            key, {code: offline_id(code) for code in RATES}, revised=key == "studio_a"
        )
        saved = workspace.validate_workspace(workspace.WorkspaceInput(**draft), site()["bounds"])
        option = saved["scenarios"]["option_a"]["items"]
        estimate = calculate_estimate(
            pricing_items(option),
            rates,
            currency="MYR",
            method="margin",
            percent=meta["margin"],
            wastage=Decimal(0),
            charges=[],
        )
        if not estimate["complete"]:
            raise ValueError(f"The {key} example estimate must be complete.")
        cost = {code: Decimal(0) for code in SCOPE}
        for row in estimate["lines"]:
            cost[design.scope[row["parent_id"]]] += Decimal(row["cost_total"])
        total = Decimal(estimate["selling_total"])
        base = sum(cost.values())
        priced = [code for code in SCOPE if cost[code] > 0]
        selling, running = {}, Decimal(0)
        for code in priced[:-1]:
            selling[code] = (cost[code] * total / base).quantize(TWO, ROUND_HALF_UP)
            running += selling[code]
        selling[priced[-1]] = total - running
        result[key] = {
            **{k: v for k, v in meta.items() if k != "margin"},
            "key": key,
            "total": total,
            "scope": {code: selling.get(code) for code in SCOPE},
            "preview": design_preview(saved, "option_a"),
        }
    return result


def previews_payload():
    return {
        key: {
            "key": key,
            "letter": value["letter"],
            "title": value["title"],
            "contractor": value["contractor"],
            "summary": value["summary"],
            "total": str(value["total"]),
            "programme_days": value["programme_days"],
            "scope": {k: (None if v is None else str(v)) for k, v in value["scope"].items()},
            "preview": value["preview"],
        }
        for key, value in offline_examples().items()
    }


# ----------------------------------------------------------------------------- studio


def studio_brief(key):
    meta = EXAMPLES[key]
    return ProjectCreate(
        name=f"Example {meta['letter']}: {meta['title']}, Shah Alam",
        purpose="contractor_proposal",
        stakeholder="Example client: Taman residents' association (fictional)",
        problem=(
            "A one-hectare open field in a residential neighbourhood is exposed, muddy after "
            "storms and used only for informal football. Residents want shade, a safe place "
            "for children and a walking route."
        ),
        intended_users=(
            "Families with young children, older residents walking in the evening, joggers "
            "and students from nearby homes."
        ),
        desired_outcome=(
            "A shaded, walkable community park with a play area, shelter and planting, "
            "delivered within a fixed budget."
        ),
        use_periods="Daily 7:00-10:00 and 17:00-21:00; weekend mornings for community events.",
        details={
            "project_type": "Neighbourhood park upgrade (design and build)",
            "budget_min": "250000",
            "budget": "480000",
            "priorities": (
                "1. Shade and seating. 2. Safe children's play. 3. Walking route. "
                "4. Low maintenance planting."
            ),
            "constraints": (
                "Retain the six mature rain trees. Keep works inside the field. Assume buried "
                "services along the northern verge until located. Keep existing ground levels."
            ),
            "site_notes": (
                f"{EXAMPLE_NOTE} This is one of three example designs by fictional contractors "
                f"for the same field ({meta['contractor']}). Compare all three in Organisation "
                "Review."
            ),
            "known_facts": "Open grass field of about 0.94 ha surrounded by houses and roads.",
            "unknown_facts": "Soil condition and buried services (not surveyed).",
            "stakeholders": [
                {
                    "name": "Residents' association committee (fictional)",
                    "role": "Client",
                    "needs": "Shade, safety, affordable upkeep",
                },
                {
                    "name": "Local parents (fictional)",
                    "role": "Users",
                    "needs": "Visible, safe play area with seating",
                },
            ],
            "scope": {
                "deliverables": "Concept layout, quantities, estimate and an issued proposal.",
                "inclusions": meta["summary"],
                "exclusions": (
                    "Utility diversions, authority fees, SST and works outside the field."
                ),
                "intended_use": "Everyday neighbourhood recreation.",
                "unresolved_questions": "Utility locations; soil condition.",
                "facts": [
                    {
                        "text": "Field is roughly 120 m by 84 m and level",
                        "source": "Measured on aerial imagery for the example",
                        "state": "estimated",
                    },
                    {
                        "text": "Buried services",
                        "source": "No record supplied",
                        "state": "unknown",
                    },
                ],
            },
            "opportunity": {
                "owner": f"Estimator, {meta['contractor']}",
                "stage": "submitted",
                "tags": ["Example", f"Example {meta['letter']}", "Park", "Selangor"],
                "source": EXAMPLE_SOURCE,
            },
        },
        site=site(),
    )


def issue_input(key, estimate, project_revision, today, *, change_summary=""):
    meta = EXAMPLES[key]
    return calculations.IssueInput(
        valid_until=today + timedelta(days=90),
        programme=(
            f"Indicative {meta['programme_days'] // 7} weeks from site possession: setting out "
            "and protection, paths and hard works, structures and furniture, then planting and "
            "turfing, handover and defects walk. Subject to weather and the utility locate."
        ),
        maintenance=(
            "A 3-month establishment period (watering, weeding, replacing failed plants) is "
            "included. Ongoing maintenance after handover is the client's responsibility "
            "unless separately agreed."
        ),
        maintenance_plan=[
            {
                "task": "Water new trees and planting",
                "responsibility": "contractor",
                "frequency": "3 times a week for the first 3 months (skip after heavy rain)",
                "included_in_price": True,
                "assumptions": "Water supply available on site",
            },
            {
                "task": "Replace failed plants during establishment",
                "responsibility": "contractor",
                "frequency": "Monthly inspection for 3 months",
                "included_in_price": True,
            },
            {
                "task": "Grass cutting and litter collection",
                "responsibility": "client",
                "frequency": "Fortnightly",
                "included_in_price": False,
            },
            {
                "task": "Inspect play surfacing and equipment",
                "responsibility": "to_be_agreed",
                "frequency": "Monthly visual check; annual inspection by a competent person",
                "included_in_price": False,
            },
        ],
        change_summary=change_summary,
        customer_narrative=meta["summary"]
        + " The six mature rain trees are kept and protected; existing ground levels are kept.",
        evidence_ids=[],
        request_key=uuid4(),
        estimate_id=estimate["id"],
        expected_project_revision=project_revision,
        preferred_option="option_a",
        criteria=["Shade and seating for daily use", "Safe children's play", "Within budget"],
        review_notes=(
            "Example internal review: quantities checked against the plan sheet; rates are the "
            "built-in example allowances."
        ),
        assumptions=(
            "Level existing ground; tree positions and services taken from aerial imagery; a "
            "topographic and utility survey is required. Rates are example allowances."
        ),
        exclusions=(
            "Utility diversions; authority submissions and fees; SST; electrical supply (lights "
            "are solar); works outside the site boundary; maintenance after establishment."
        ),
        confirmed=True,
    )


def estimate(db, org, pid, user, revision, scenario, margin):
    return calculations.run_estimate(
        db,
        org,
        pid,
        user,
        calculations.EstimateInput(
            expected_revision=revision,
            request_key=uuid4(),
            scenario=scenario,
            method="margin",
            percent=margin,
        ),
    )


def issue(db, org, pid, user, data):
    review = calculations.estimate_readiness(db, org, pid, user, data.estimate_id, data.valid_until)
    if review["warnings"]:
        data.pricing_override_reason = (
            "Example project: the built-in example rates were reviewed for the walkthrough; "
            "they are not market quotations."
        )
    return calculations.issue_snapshot(db, org, pid, user, data, "proposal")


def build_studio_one(db, org, user, key, rates, today):
    meta = EXAMPLES[key]
    project = projects.create_project(db, org, user, studio_brief(key), commit=False)
    pid = project.id
    draft, design = build_workspace(key, rates)
    first = workspace.save_workspace(db, org, pid, user, workspace.WorkspaceInput(**draft))
    if key != "studio_a":
        current = estimate(db, org, pid, user, 1, "option_a", meta["margin"])
        issue(db, org, pid, user, issue_input(key, current, project.revision, today))
        return pid
    estimate(db, org, pid, user, 1, "option_b", meta["margin"])
    first_estimate = estimate(db, org, pid, user, 1, "option_a", meta["margin"])
    issue(db, org, pid, user, issue_input(key, first_estimate, project.revision, today))
    change = change_register.create_change(
        organisation_id=org,
        project_id=pid,
        data=change_register.ChangeCreate(
            requester="Residents' association chair (fictional)",
            requester_role="client",
            requested_on=today,
            reason="Parents asked for seating facing the play area and better lighting there.",
            original_scope="Six benches and eight solar path lights.",
            proposed_additions=(
                "Two benches facing the play area; two solar lights at its entrance."
            ),
            time_effect="No change to the programme.",
        ),
        user=user,
        db=db,
    )
    revised_input = canonical_input(first["data"], 1)
    revised_input["scenarios"]["option_a"]["items"] += change_a(design)
    revised = workspace.save_workspace(
        db, org, pid, user, workspace.WorkspaceInput(**revised_input)
    )
    estimate(db, org, pid, user, revised["revision"], "option_b", meta["margin"])
    second_estimate = estimate(db, org, pid, user, revised["revision"], "option_a", meta["margin"])
    key_id = UUID(change["key"])
    reviewed = change_register.transition(
        organisation_id=org,
        project_id=pid,
        key=key_id,
        data=change_register.ChangeTransition(
            expected_revision=change["revision"],
            state="reviewed",
            note="Impact checked against the revised estimate (example).",
        ),
        user=user,
        db=db,
    )
    sent = change_register.transition(
        organisation_id=org,
        project_id=pid,
        key=key_id,
        data=change_register.ChangeTransition(
            expected_revision=reviewed["revision"],
            state="sent",
            note="Change summary sent with the revised proposal (example).",
            sent_method="Email with revised proposal attached (example, not actually sent)",
        ),
        user=user,
        db=db,
    )
    second_issue = issue(
        db,
        org,
        pid,
        user,
        issue_input(
            key,
            second_estimate,
            project.revision,
            today,
            change_summary=(
                "Revision 2 adds two benches facing the play area and two solar path lights at "
                "its entrance, at the client's request. Programme unchanged."
            ),
        ),
    )
    change_register.link_issue(
        organisation_id=org,
        project_id=pid,
        key=key_id,
        data=change_register.IssueLink(
            expected_revision=sent["revision"], proposal_id=second_issue["id"]
        ),
        user=user,
        db=db,
    )
    return pid


def build_studio(db, org, user, missing):
    today = date.today()
    rates = ensure_rates(db, org, user, today)
    return {
        key: build_studio_one(db, org, user, key, rates, today)
        for key in STUDIO_KEYS
        if key in missing
    }


# ----------------------------------------------------------------------------- review


def _amount(value: Decimal) -> str:
    return f"{value:,.2f}"


def offer_document(bidder, reference, lines, total, details, *, page_note):
    rows = [
        ("title", f"{bidder}"),
        ("body", "FICTIONAL EXAMPLE DOCUMENT - built into InfraShader for learning only."),
        ("body", ""),
        ("heading", f"Offer {reference}: Neighbourhood park upgrade, Shah Alam"),
        ("body", "Prices in Malaysian ringgit, exclusive of SST."),
        ("body", ""),
        ("heading", "Priced schedule"),
    ]
    anchors = {}
    for code, label, amount in lines:
        if amount is None:
            rows.append(("body", f"{code}  {label}  EXCLUDED"))
        else:
            rows.append(("body", f"{code}  {label}  RM {_amount(amount)}"))
        anchors[code] = f"page 1 line {len(rows)}"
    rows.append(("heading", f"Total offer  RM {_amount(total)}"))
    anchors["total"] = f"page 1 line {len(rows)}"
    rows += [("body", ""), ("heading", "Terms")]
    for label, value in details:
        rows.append(("body", f"{label}: {value}"))
        anchors[label] = f"page 1 line {len(rows)}"
    rows += [("body", ""), ("small", page_note)]
    return render(rows, footer=f"{bidder} - offer {reference} (fictional example)"), anchors


OFFERS = {
    "studio_a": {
        "reference": "EX-LS-2",
        "channel": "native_upload",
        "registered": True,
        "warranty": "12 months defects liability",
        "maintenance": Decimal("9600.00"),
        "exclusions": "Utility diversions, authority fees, SST, works outside the field",
        "scores": {"PRICE": 8, "DESIGN": 8, "DELIVERY": 7, "MAINT": 7, "SAFETY": 8},
        "rationale": {
            "PRICE": "Complete scope well within budget; prices traceable to quantities.",
            "DESIGN": "Meets the brief: shade, play, walking loop and planting.",
            "DELIVERY": "12-week programme is realistic but depends on the utility locate.",
            "MAINT": "3-month establishment included; later upkeep left to the client.",
            "SAFETY": "EPDM surfacing and tree protection described; inspections assigned.",
        },
        "note": "Issued from Design Studio Example A (revision 2, after the client's change).",
    },
    "studio_b": {
        "reference": "TI-0417",
        "channel": "native_upload",
        "registered": True,
        "warranty": "24 months defects liability",
        "maintenance": Decimal("7200.00"),
        "exclusions": "Authority fees, SST",
        "scores": {"PRICE": 6, "DESIGN": 8, "DELIVERY": 8, "MAINT": 9, "SAFETY": 8},
        "rationale": {
            "PRICE": "Highest price and slightly above the RM 480,000 budget.",
            "DESIGN": "Most shade (28 trees), gazebo plaza and pergolas; strong garden feel.",
            "DELIVERY": "Longer 14-week programme but a clear method statement.",
            "MAINT": "24-month defects period and the lowest annual maintenance price.",
            "SAFETY": "Method statement and play inspection regime included.",
        },
        "note": "Issued from Design Studio Example B.",
    },
    "studio_c": {
        "reference": "KBP/23/88",
        "channel": "external_document",
        "registered": False,
        "warranty": "12 months defects liability",
        "maintenance": None,
        "exclusions": "Children's play area, authority fees, SST",
        "scores": {"PRICE": 9, "DESIGN": 5, "DELIVERY": 6, "MAINT": 4, "SAFETY": 6},
        "rationale": {
            "PRICE": "Lowest headline price, but the play area is excluded.",
            "DESIGN": "Basic open lawn; little shade (10 trees) and no play area.",
            "DELIVERY": "Short 10-week programme with limited resourcing detail.",
            "MAINT": "No maintenance price offered.",
            "SAFETY": "Safety plan brief; no play-area work to assess.",
        },
        "note": (
            "Received by email from a supplier without an InfraShader account; issued from "
            "Design Studio Example C."
        ),
    },
}


def design_file(key, value):
    """Native JSON design snapshot attached to an offer (what the review previews draw)."""
    return json.dumps(
        {
            "format": "infrashader-design-snapshot-v1",
            "bidder": value["contractor"],
            "design_title": f"Example {value['letter']}: {value['title']}",
            "summary": value["summary"],
            "currency": "MYR",
            "total": str(value["total"]),
            "scope_amounts": {
                code: (None if amount is None else str(amount))
                for code, amount in value["scope"].items()
            },
            "programme_days": value["programme_days"],
            "preview": value["preview"],
            "notice": "Fictional example design file. " + value["preview"]["notice"],
        },
        indent=1,
    ).encode()


def review_brief():
    return ProjectCreate(
        name="Example: Park upgrade, compare 3 proposals, Shah Alam",
        purpose="developer_decision",
        stakeholder="Example owner: Taman residents' association (fictional)",
        problem=(
            "Three contractors sent proposals for the neighbourhood park upgrade, each with a "
            "different design, price and set of inclusions. The committee needs a fair, "
            "recorded comparison before choosing one."
        ),
        intended_users="Residents' association committee members and their appointed reviewer.",
        desired_outcome=(
            "A defensible recommendation and approval based on a common scope, a locked "
            "scoring rubric and recorded reasons."
        ),
        use_periods="Proposals received this month; decision before the next committee meeting.",
        details={
            "project_type": "Owner review of contractor proposals",
            "budget": "480000",
            "site_notes": EXAMPLE_NOTE,
            "opportunity": {"tags": ["Example", "Review"], "source": EXAMPLE_SOURCE},
        },
        site=site(),
    )


def build_review(db, org, user, missing):
    now = datetime.now(UTC).replace(microsecond=0)
    today = now.date()
    project = projects.create_project(db, org, user, review_brief(), commit=False)
    pid = project.id
    designs = offline_examples()
    common = dict(organisation_id=org, project_id=pid, user=user, db=db)
    owner_review.save_basis(
        data=owner_review.BasisInput(
            expected_revision=0,
            title="Neighbourhood park upgrade, Shah Alam: contractor proposals (example)",
            deliverables=(
                "Design and build of a neighbourhood park on the existing level field, covering "
                "the eight common scope items, with a 3-month establishment period."
            ),
            submission_requirements=(
                "Priced schedule against scope items S01-S08, total exclusive of SST, validity, "
                "programme, defects period, exclusions, annual maintenance price and a site "
                "design file. Example setting: self-approval is permitted only so a single "
                "trial user can complete the walkthrough; decide this under your own policy."
            ),
            tax_basis="exclusive",
            budget=Decimal("480000"),
            deadline=now - timedelta(days=4),
            evaluation_horizon_years=5,
            scope_items=[
                owner_review.ScopeItem(code=code, description=text, unit="item")
                for code, text in SCOPE.items()
            ],
            requirements=[
                owner_review.Requirement(
                    code="R01",
                    text="Contractor registration in a grade suitable for the contract value, "
                    "with its expiry date",
                    kind="eligibility",
                    mandatory=True,
                    expiry_required=True,
                ),
                owner_review.Requirement(
                    code="R02",
                    text="Defects liability period of at least 12 months",
                    kind="technical",
                    mandatory=True,
                ),
                owner_review.Requirement(
                    code="R03",
                    text="Priced annual maintenance programme for planting and turf",
                    kind="technical",
                    mandatory=False,
                ),
            ],
            reviewers=[user],
            self_approval="permitted",
        ),
        **common,
    )
    rubric = owner_review.save_rubric(
        data=owner_review.RubricInput(
            expected_revision=0,
            criteria=[
                owner_review.Criterion(
                    code="PRICE",
                    name="Price and value for money",
                    weight=35,
                    direction="higher_better",
                    scale_min=0,
                    scale_max=10,
                    guidance="10 = complete scope at the best value; consider exclusions.",
                ),
                owner_review.Criterion(
                    code="DESIGN",
                    name="Design quality and fit with the brief",
                    weight=25,
                    direction="higher_better",
                    scale_min=0,
                    scale_max=10,
                    guidance="Shade, play, walking route and planting against the brief.",
                ),
                owner_review.Criterion(
                    code="DELIVERY",
                    name="Programme and delivery capability",
                    weight=15,
                    direction="higher_better",
                    scale_min=0,
                    scale_max=10,
                ),
                owner_review.Criterion(
                    code="MAINT",
                    name="Maintenance and long-term care",
                    weight=15,
                    direction="higher_better",
                    scale_min=0,
                    scale_max=10,
                ),
                owner_review.Criterion(
                    code="SAFETY",
                    name="Safety and compliance",
                    weight=10,
                    direction="higher_better",
                    scale_min=0,
                    scale_max=10,
                    mandatory_gate=True,
                    pass_mark=5,
                    evidence_requirement="Safety plan and play-area surfacing details.",
                ),
            ],
            missing_score_rule="not_ranked",
            reviewer_aggregation="mean",
        ),
        **common,
    )
    rubric = owner_review.lock_rubric(
        data=owner_review.RubricLock(expected_revision=rubric["revision"]), **common
    )
    for index, key in enumerate(STUDIO_KEYS):
        value, offer = designs[key], OFFERS[key]
        bidder = value["contractor"]
        lines, total = value["scope"], value["total"]
        validity = today + timedelta(days=60 + 15 * index)
        details = [
            ("Validity", validity.strftime("%d %B %Y")),
            ("Programme", f"{value['programme_days']} days from site possession"),
            ("Warranty", offer["warranty"]),
            ("Exclusions", offer["exclusions"]),
            (
                "Annual maintenance",
                "not offered"
                if offer["maintenance"] is None
                else f"RM {_amount(offer['maintenance'])} per year",
            ),
            ("Registration", f"Grade G4, valid until {(today + timedelta(days=300)):%d %B %Y}"),
            ("Design", f"Example {value['letter']}: {value['title']} (design file attached)"),
        ]
        pdf, anchors = offer_document(
            bidder,
            offer["reference"],
            [(code, SCOPE[code], lines[code]) for code in SCOPE],
            total,
            details,
            page_note=offer["note"],
        )
        submission = owner_review.create_submission(
            data=owner_review.SubmissionCreate(
                bidder_name=bidder,
                channel=offer["channel"],
                supplier_registered=offer["registered"],
                sender=f"Tender contact, {bidder}",
                received_at=now - timedelta(days=6 - index),
                receipt_evidence=(
                    "Received by email with a PDF offer and a design file; logged by the "
                    "committee secretary (example record)."
                    if offer["channel"] == "external_document"
                    else "Uploaded as a PDF offer and a design file (example record)."
                ),
            ),
            **common,
        )
        key_id = UUID(submission["key"])
        slug = offer["reference"].replace("/", "-").lower()
        document = owner_review.upload_file(
            key=key_id,
            file=UploadFile(file=io.BytesIO(pdf), filename=f"offer-{slug}.pdf"),
            description=f"Offer document {offer['reference']} (fictional example)",
            **common,
        )
        owner_review.upload_file(
            key=key_id,
            file=UploadFile(
                file=io.BytesIO(design_file(key, value)), filename=f"design-{slug}.json"
            ),
            description=f"Site design file for Example {value['letter']} (fictional example)",
            **common,
        )

        def ref(anchor, document=document, anchors=anchors):
            return {"document_id": document["id"], "location": anchors[anchor]}

        fields = {
            "quoted_total": {"state": "confirmed", "value": str(total), "source": ref("total")},
            "tax_basis": {"state": "confirmed", "value": "exclusive", "source": ref("total")},
            "validity_until": {
                "state": "confirmed",
                "value": validity.isoformat(),
                "source": ref("Validity"),
            },
            "duration_days": {
                "state": "confirmed",
                "value": value["programme_days"],
                "source": ref("Programme"),
            },
            "warranty": {
                "state": "confirmed",
                "value": offer["warranty"],
                "source": ref("Warranty"),
            },
            "exclusions": {
                "state": "confirmed",
                "value": offer["exclusions"],
                "source": ref("Exclusions"),
            },
            "annual_maintenance": (
                {"state": "not_provided"}
                if offer["maintenance"] is None
                else {
                    "state": "confirmed",
                    "value": str(offer["maintenance"]),
                    "source": ref("Annual maintenance"),
                }
            ),
        }
        lines_payload = [
            {
                "line_id": str(uuid4()),
                "original_text": f"{code} {SCOPE[code]}",
                "original_unit": "item",
                "original_amount": None if lines[code] is None else str(lines[code]),
                "source": ref(code),
                "scope_code": code,
                "state": "excluded" if lines[code] is None else "included",
                "mapping_confirmed": True,
                "mapping_note": "Offer item code matches the common scope code.",
            }
            for code in SCOPE
        ]
        responses = [
            {
                "code": "R01",
                "state": "accepted",
                "source": ref("Registration"),
                "expiry": (today + timedelta(days=300)).isoformat(),
                "note": "Registration certificate referenced in the offer (example).",
            },
            {"code": "R02", "state": "accepted", "source": ref("Warranty")},
            (
                {"code": "R03", "state": "absent", "note": "No maintenance price offered."}
                if offer["maintenance"] is None
                else {"code": "R03", "state": "accepted", "source": ref("Annual maintenance")}
            ),
        ]
        owner_review.update_submission(
            key=key_id,
            data=owner_review.SubmissionUpdate(
                expected_revision=submission["revision"],
                fields=fields,
                lines=lines_payload,
                responses=responses,
            ),
            **common,
        )
        owner_review.save_score(
            submission_key=key_id,
            data=owner_review.ScoreInput(
                expected_revision=0,
                rubric_revision=rubric["revision"],
                conflict="none",
                state="submitted",
                scores=[
                    {
                        "criterion": code,
                        "score": score,
                        "rationale": offer["rationale"][code],
                        "source": ref("total"),
                    }
                    for code, score in offer["scores"].items()
                ],
            ),
            **common,
        )
        if lines["S04"] is None:
            owner_review.save_clarification(
                key=uuid4(),
                data=owner_review.ClarificationInput(
                    expected_revision=0,
                    submission_key=key_id,
                    question=(
                        "Your proposal excludes the children's play area (scope S04). Can you "
                        "price it, or do you confirm it is excluded?"
                    ),
                    due_date=today - timedelta(days=1),
                    state="answered",
                    response=(
                        "We confirm the play area is excluded; we do not supply certified play "
                        "equipment."
                    ),
                    response_received_at=now - timedelta(days=1),
                    response_source="Email reply from the supplier (example record)",
                ),
                **common,
            )
    return {"review": pid}


# ----------------------------------------------------------------------------- endpoints


@contextmanager
def single_transaction(db: Session):
    """Run endpoint handlers inside one transaction so a failure leaves nothing behind."""
    original = db.commit
    db.commit = db.flush  # type: ignore[method-assign]
    try:
        yield
    finally:
        db.commit = original  # type: ignore[method-assign]


MARKERS = {"studio": STUDIO_KEYS, "review": ("review",)}
BUILDERS = {"studio": build_studio, "review": build_review}


def current(project):
    return (project.details or {}).get("opportunity", {}).get("source") == EXAMPLE_SOURCE


def existing(db, org, marker):
    rows = db.scalars(
        select(Project)
        .where(
            Project.organisation_id == org,
            Project.example == marker,
            Project.archived.is_(False),
        )
        .order_by(Project.created_at.desc())
    ).all()
    return next((row for row in rows if current(row)), None)


def archive_outdated(db, org, user, kind):
    """Archive (never delete) active example projects from an earlier example version."""
    markers = (*MARKERS[kind], "studio") if kind == "studio" else MARKERS[kind]
    rows = db.scalars(
        select(Project).where(
            Project.organisation_id == org,
            Project.example.in_(markers),
            Project.archived.is_(False),
        )
    ).all()
    for row in rows:
        if not current(row) and visible(db, org, user, row):
            projects.update_project(
                db, org, row.id, user, ProjectUpdate(expected_revision=row.revision, archived=True)
            )


def visible(db, org, user, row):
    return row is not None and "read_project" in access.project_capabilities(db, org, row.id, user)


def index(db, org, user):
    result = {}
    for markers in MARKERS.values():
        for marker in markers:
            row = existing(db, org, marker)
            result[marker] = str(row.id) if visible(db, org, user, row) else None
    return result


@router.get("")
def list_examples(organisation_id: UUID, user: User, db: DB):
    projects.require_membership(db, organisation_id, user)
    return index(db, organisation_id, user)


@router.get("/previews")
def example_previews(organisation_id: UUID, user: User, db: DB):
    """Plan previews and totals of the three example designs (no records are created)."""
    projects.require_membership(db, organisation_id, user)
    return previews_payload()


@router.post("/{kind}", response_model=list[ProjectResponse])
def install_example(organisation_id: UUID, kind: Kind, user: User, db: DB, response: Response):
    """Create (once) the Studio examples A-C or the Review example and return them."""
    projects.require_membership(db, organisation_id, user)
    access.require_capability(db, organisation_id, user, "create_project")
    db.execute(
        sql("SELECT pg_advisory_xact_lock(hashtext(:key))"),
        {"key": f"infrashader-example:{organisation_id}:{kind}"},
    )
    rows = {marker: existing(db, organisation_id, marker) for marker in MARKERS[kind]}
    if all(row is not None for row in rows.values()):
        if not all(visible(db, organisation_id, user, row) for row in rows.values()):
            raise APIError(
                409,
                "example_exists",
                "The example projects already exist. Ask their owner for access.",
            )
        response.status_code = 200
        return [projects.get_project(db, organisation_id, row.id, user) for row in rows.values()]
    try:
        with single_transaction(db):
            archive_outdated(db, organisation_id, user, kind)
            missing = {m for m, row in rows.items() if row is None}
            for marker, pid in BUILDERS[kind](db, organisation_id, user, missing).items():
                db.get(Project, pid).example = marker
            db.flush()
    except Exception:
        db.rollback()
        raise
    db.commit()
    response.status_code = 201
    return [
        projects.get_project(db, organisation_id, existing(db, organisation_id, m).id, user)
        for m in MARKERS[kind]
    ]
