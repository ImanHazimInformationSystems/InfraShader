#!/usr/bin/env python3
"""Generate the user-facing Design Studio feature list from canonical registers."""

import argparse
import csv
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
REGISTER = ROOT / "docs/tracking/feature-register.csv"
RESOURCES = ROOT / "docs/tracking/resources.csv"
OUTPUT = ROOT / "docs/DESIGN_STUDIO_FEATURES.md"


def read_csv(path: Path) -> list[dict[str, str]]:
    with path.open(encoding="utf-8-sig", newline="") as source:
        return list(csv.DictReader(source))


def md_cell(value: str) -> str:
    return (value or "").replace("|", "\\|").replace("\n", " ").strip()


def build() -> str:
    rows = [
        row
        for row in read_csv(REGISTER)
        if row["Record type"] == "Roadmap feature"
        and row["Count in roadmap"] == "Yes"
        and row["Feature ID"].startswith("L")
    ]
    resource_rows = read_csv(RESOURCES)
    resources: dict[str, dict[str, str]] = {}
    for resource in resource_rows:
        resources.setdefault(resource["Resource ID"], resource)
    if len(rows) != 31:
        raise SystemExit(f"Expected 31 Design Studio rows (30 PDF baseline + L31 addendum), found {len(rows)}")

    lines = [
        "# Design Studio feature list",
        "",
        "> This list is generated from the canonical feature register and resource catalogue. It covers the 30 L-features in the approved 11 November PDF plus user-requested L31 as a separately recorded project-roadmap addendum. Statuses remain repository-audited facts.",
        "",
        "## What Design Studio is intended to do",
        "",
        "Design Studio is InfraShader’s site-planning and contractor estimating workspace. A contractor or landscaper selects a real site, records what is known about it, lays out existing conditions and proposed options on a map-centred work surface, then turns supported design geometry into reviewable quantities, sourced rates, a preliminary estimate, and a client proposal.",
        "",
        "The intended experience is approachable and spatial, with a town-builder feel: users see the site and proposed outdoor work together, use direct map/canvas tools for planting and hardscape, and can inspect a 3D context where supported. It remains a professional planning and estimating product. A visual object is not automatically a measured quantity or a cost; the pricing workflow requires a compatible method, rate, source, date, unit, and assumptions.",
        "",
        "### Contractor workflow",
        "",
        "1. Create/open a project and confirm its client, purpose, budget, scope, exclusions, and assumptions (L01, K01).",
        "2. Find the site; select its boundary; collect evidence and label inputs measured, sourced, estimated, or unknown (L02-L05, K05).",
        "3. Record an existing-site Baseline, then design proposed Option A and optionally B with supported geometry, planting, objects, materials, and explicitly scoped site-road surfaces (L04, L09-L12, L31).",
        "4. Review bounded shade and deterministic design/readiness checks, including unavailable or stale results (L11, L20-K02).",
        "5. Review quantity methods and units, including explicit L31 pavement-layer definitions; deliberately link compatible sourced rate versions and see partial/unpriced work and assumptions (L13-L16, L31, K04).",
        "6. Prepare a client proposal with selected scope, quantities, pricing basis, assumptions, exclusions, evidence, and issue readiness; preserve later clarifications and revisions (L22-L28).",
        "",
        "For the detailed sequence and safeguards, see [contractor workflow](contractor-workflow.md) and [measurement and estimating](measurement-and-estimating.md).",
        "",
        "### Cost-estimation stages",
        "",
        "**Draw or place work, calculate quantity by an explicit supported method, select a compatible dated and sourced rate, calculate a preliminary estimate, then label completeness and unresolved work.** L31 has a partial connected slice for explicit road-surface polygons and user-defined uniform material layers; see its tracked status and gaps below. Missing rates, mismatched units, uncertain measurements, demo rates, or stale inputs must not be presented as a verified complete quote. Labour, equipment, transport, waste, taxes, overhead, and markup require explicit scope and inclusion assumptions; avoid double counting.",
        "",
        "### Boundaries to keep visible",
        "",
        "- Map imagery, provider building heights, reference plans, and concept dimensions are not automatically survey-grade.",
        "- Current shade analysis has stated model limits; tree-crown shade is excluded from L11 analytical results. It is not a complete thermal-comfort or environmental assessment.",
        "- L06 terrain/pond sculpting is a visual concept capability and remains **LATER** priority. It does not calculate cut/fill, earthworks, pond volume, drainage, or construction cost.",
        "- **L31 road/driveway takeoff is a user-requested addendum outside the original PDF, with partial implementation.** The connected slice supports a deliberately drawn area, explicit material layers, uniform-thickness quantities and selected compatible rates via saved schedule/estimate workflows. It does not provide automatic pavement design, compaction/density factors, earthworks, drainage design, jurisdiction compliance, or civil-engineer certification. The original PDF baseline remains unchanged.",
        "- **L31 road placement:** Layout > Roads and driveways supports drag/click routes, explicit width, editable curve/area control points and backend-validated footprint confirmation. Saved pavement layers and sourced component rates feed preliminary estimates. Separate road overlaps are rejected; engineering, field and customer acceptance remain open.",
        "- Fictional or demo rates are examples, not real supplier prices. The Organisation Review procurement/evaluation workflow (O01-O30) is a separate workspace, not part of a contractor’s client proposal.",
        "",
        "## Design Studio project roadmap (PDF baseline plus addendum)",
        "",
        "Priority, implementation, verification, deployment, and acceptance are separate fields copied from the canonical tracker. Resource links identify references/candidates; they do not mean a package is installed, approved, or required. These include libraries, hosted tools, data sources, and curated inputs; not every entry is open source. See the [resource register](tracking/resources.csv) for licences, terms, maturity and usage notes. Existing stack and data sources take precedence where already present. Review each resource’s licence, terms, compatibility, and actual manifest before adoption.",
        "",
        "| ID | Feature | Priority | Repository-audited implementation | Verification | Intended capability | Software / data-source references in catalogue |",
        "|---|---|---|---|---|---|---|",
    ]
    for row in rows:
        linked_resources = []
        for resource_id in filter(None, (item.strip() for item in row["Resource IDs"].split(","))):
            resource = resources.get(resource_id)
            if not resource:
                raise SystemExit(f"{row['Feature ID']} references missing resource {resource_id}")
            name = f"{resource_id} {resource['Name']}"
            url = resource["URL"].strip()
            linked_resources.append(f"[{name}]({url})" if url.startswith("https://") else name)
        lines.append(
            "| {id} | {name} | {priority} | {implementation} | {verification} | {scope} | {resources} |".format(
                id=md_cell(row["Feature ID"]),
                name=md_cell(row["Feature name"]),
                priority=md_cell(row["Priority"]),
                implementation=md_cell(row["Repository-audited implementation status"]),
                verification=md_cell(row["Verification status"]),
                scope=md_cell(row["Requirement summary"]),
                resources="; ".join(linked_resources),
            )
        )
    lines += [
        "",
        "## Resource bundles at a glance",
        "",
        "- **Current product foundations:** React/TypeScript/Vite; FastAPI/Pydantic; PostgreSQL/PostGIS; MapLibre/OpenFreeMap/Photon; Terra Draw; PyProj/Shapely/pvlib; Supabase Auth/Storage; Python Decimal/PostgreSQL NUMERIC; React PDF; and the existing tests. See R01-R11 and R16. Confirm actual locked packages in the repository manifests.",
        "- **Conditional spatial/asset review tools:** GDAL/PDF.js, Blender/glTF Validator, IFC/DXF readers and QGIS/GRASS GIS profiles are candidates for specific workflows only (R12-R14; N14-N15, N21). They do not provide road engineering approval and are not required dependencies for the first L31 slice.",
        "- **Curated business data:** plant, material, supplier/rate, and local-policy data come from permissioned sources and human review (N13). There is no universal free supplier-price or horticulture database included.",
        "- **Optional UI/report tools:** TanStack Table/Virtual, ECharts, CSV/openpyxl/python-docx and Celery/Valkey are candidates only where the corresponding staged need justifies them (N01-N07). No paid service or hosted AI is required by this list.",
        "- **Not engineering solvers:** MapLibre, Three.js, GDAL, IFC/DXF readers, and generic volume arithmetic do not by themselves provide verified road design, earthworks takeoff, drainage sizing, structural approval, or survey accuracy.",
        "",
        "## Update and verify",
        "",
        "The canonical scope, priorities, status, and resource IDs live in `docs/tracking/feature-register.csv` and `docs/tracking/resources.csv`. Edit those registers first, then regenerate and check this file:",
        "",
        "```powershell",
        "python scripts/design-studio-catalogue.py",
        "python scripts/design-studio-catalogue.py --check",
        "```",
        "",
    ]
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    content = build()
    if args.check:
        if not OUTPUT.exists() or OUTPUT.read_text(encoding="utf-8") != content:
            raise SystemExit("Design Studio list is stale; run python scripts/design-studio-catalogue.py")
        print(f"Validated {OUTPUT.relative_to(ROOT)}: 31 Design Studio features")
    else:
        OUTPUT.write_text(content, encoding="utf-8", newline="\n")
        print(f"Generated {OUTPUT.relative_to(ROOT)}: 31 Design Studio features")


if __name__ == "__main__":
    main()
