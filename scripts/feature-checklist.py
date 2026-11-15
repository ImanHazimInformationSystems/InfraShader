#!/usr/bin/env python3
"""Generate the PDF-comparison checklist from canonical feature/UI registers."""

import argparse
import csv
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
REGISTER = ROOT / "docs/tracking/feature-register.csv"
UI_REGISTER = ROOT / "docs/tracking/ui-coverage.csv"
OUTPUT = ROOT / "docs/FEATURE_CHECKLIST.md"


def read_csv(path: Path) -> list[dict[str, str]]:
    with path.open(encoding="utf-8-sig", newline="") as source:
        return list(csv.DictReader(source))


def cell(value: str) -> str:
    return (value or "").replace("|", "\\|").replace("\n", " ")


def table(rows: list[dict[str, str]], ui: dict[str, dict[str, str]]) -> list[str]:
    output = [
        "| Tally | ID | Feature name | Approved / staged scope | Priority | Implementation | Verification | Deployment | Acceptance | UI state |",
        "|---|---|---|---|---|---|---|---|---|---|",
    ]
    for row in rows:
        feature_id = row["Feature ID"]
        output.append(
            "| [ ] | {id} | {name} | {scope} | {priority} | {implementation} | {verification} | "
            "{deployment} | {acceptance} | {ui_state} |".format(
                id=cell(feature_id),
                name=cell(row["Feature name"]),
                scope=cell(row["Requirement summary"]),
                priority=cell(row["Priority"]),
                implementation=cell(row["Repository-audited implementation status"]),
                verification=cell(row["Verification status"]),
                deployment=cell(row["Deployment status"]),
                acceptance=cell(row["Acceptance status"]),
                ui_state=cell(ui[feature_id]["UI state"]),
            )
        )
    return output


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    all_rows = read_csv(REGISTER)
    roadmap = [
        row
        for row in all_rows
        if row["Record type"] == "Roadmap feature" and row["Count in roadmap"] == "Yes"
    ]
    ui = {row["Feature ID"]: row for row in read_csv(UI_REGISTER)}
    if len(roadmap) != 85 or len(ui) != 85:
        raise SystemExit(f"Expected 85 roadmap/UI rows; found {len(roadmap)}/{len(ui)}")
    if {row["Feature ID"] for row in roadmap} != set(ui):
        raise SystemExit("Roadmap IDs and UI coverage IDs do not match")

    interfaces = [
        ("Design Studio", "L", 31, "L01-L31"),
        ("Organisation Review", "O", 30, "O01-O30"),
    ]
    status_counts: dict[str, int] = {}
    for row in roadmap:
        status = row["Repository-audited implementation status"]
        status_counts[status] = status_counts.get(status, 0) + 1

    lines = [
        "# InfraShader full feature checklist",
        "",
        "> A tally-friendly checklist of the 85 current project roadmap features: the 84-feature InfraShader Full Feature Catalogue dated 2026-11-11 plus the user-requested L31 roadwork addendum dated 2026-11-12. Use the boxes to compare the original baseline with the PDF and see the separate addendum. Statuses are copied from the repository tracker; a checklist box does not mean the feature is complete.",
        "",
        "## Source and counting",
        "",
        "- Catalogue: [`InfraShader_Full_Feature_Catalogue_2026-11-11.pdf`](../output/pdf/InfraShader_Full_Feature_Catalogue_2026-11-11.pdf), 23 pages.",
        "- The attached Desktop PDF is byte-identical to the repository copy above. The separately named `InfraShader_Full_Feature_Catalogue_2026-11-11(1).pdf` was not present. See the concept reconciliation for verified source hashes and the exact filename discrepancy.",
        "- Includes current project roadmap IDs **L01-L31, O01-O30, S01-S12 and A01-A12**. The 11 November PDF baseline contains L01-L30; L31 is a separately traceable user-requested addendum. The overlapping F/D/E references and K01-K06 refinements are cross-references, not additional roadmap features.",
        "- Priority, implementation, verification, deployment, acceptance and UI state are separate. In particular, `Not audited` does not mean `Not implemented`, and a UI preview does not prove the underlying capability works.",
        "",
        "## How to read the checklist",
        "",
        "- **Design Studio product model and all 31 Studio features:** [Design Studio feature list](DESIGN_STUDIO_FEATURES.md), including the contractor workflow, scope boundaries, status, priority and catalogue resource links. L31 is the user-requested roadwork addendum; it is not in the original PDF. **Workflow:** [contractor/landscaper journey](contractor-workflow.md). **Cost model:** [visual element to quantity to rate to preliminary estimate](measurement-and-estimating.md). **Original concept reconciliation:** [reconciliation](UI_CONCEPT_RECONCILIATION.md).",
        "- **Priority** is copied from the catalogue/register. `CORE` and `KEEP` indicate core/retained scope; `NEXT` and `LATER` indicate staged work. Combined values preserve multiple stages. `CORE (LIMITED)` means only the stated bounded scope is core.",
        "- **Implemented** means the repository audit recorded that bounded feature scope as implemented. **Partial** means supported behaviour exists but gaps remain. **Not audited** is an evidence gap, not proof the feature is absent.",
        "- The section **Not fully implemented or not audited** groups `Partial` and `Not audited`. No item is relabelled `Not implemented` unless the canonical audited status establishes that.",
        "- **Verification / deployment / acceptance** are independent tracker fields. `Local only` is not a production deployment claim; `Pending` means acceptance has not been recorded.",
        "- **UI state** describes the product interface: `UI-only + connected subset` links an existing subset, `UI-only/demo` is an ephemeral preview, and `Planned` is staged. None proves full domain implementation.",
        "- **L31 road building:** the connected bounded subset includes drag/click route placement, width and curve/area editing, confirmed footprints, saved road layers and preliminary estimates. Separate road overlaps are rejected; broader engineering/acceptance gaps remain. See TRK-L31-011 through TRK-L31-013 in the [L31 specification](features/L31.md).",
        "- Use `[ ]` to mark your PDF comparison. These boxes are intentionally left unchecked.",
        "",
        "## At a glance",
        "",
        "| Area | Roadmap features |",
        "|---|---:|",
        "| Design Studio | 31 |",
        "| Organisation Review | 30 |",
        "| Shared by both workspaces (S and A features) | 24 |",
        "| **Total** | **85 (84 PDF baseline + L31 addendum)** |",
        "",
        "### Repository-audited implementation status (all roadmap features)",
        "",
        "| Status | Count |",
        "|---|---:|",
    ]
    for status in ("Implemented", "Partial", "Not audited", "Not implemented"):
        if status in status_counts:
            lines.append(f"| {status} | {status_counts[status]} |")
    lines.append(f"| **Total** | **{len(roadmap)}** |")

    for index, (title, prefix, expected, id_range) in enumerate(interfaces, start=1):
        rows = [row for row in roadmap if row["Feature ID"].startswith(prefix)]
        if len(rows) != expected:
            raise SystemExit(f"Expected {expected} {title} features, found {len(rows)}")
        complete = [row for row in rows if row["Repository-audited implementation status"] == "Implemented"]
        remaining = [row for row in rows if row["Repository-audited implementation status"] != "Implemented"]
        lines += [
            "",
            f"## {index}. {title}",
            "",
            f"### 1) Implemented in the repository ({len(complete)})",
            "",
            *table(complete, ui),
            "",
            f"### 2) Not fully implemented or not audited ({len(remaining)})",
            "",
            *table(remaining, ui),
        ]

    shared = [row for row in roadmap if row["Feature ID"].startswith(("S", "A"))]
    shared_complete = [row for row in shared if row["Repository-audited implementation status"] == "Implemented"]
    shared_remaining = [row for row in shared if row["Repository-audited implementation status"] != "Implemented"]
    lines += [
        "",
        "## Shared by both interfaces (platform and AI)",
        "",
        "These features apply across Design Studio and Organisation Review, so they are listed once here rather than duplicated. Their UI locations are mapped in docs/UI_COVERAGE.md.",
        "",
        f"### 1) Implemented in the repository ({len(shared_complete)})",
        "",
        *table(shared_complete, ui),
        "",
        f"### 2) Not fully implemented or not audited ({len(shared_remaining)})",
        "",
        *table(shared_remaining, ui),
        "",
        "## Detail and maintenance",
        "",
        "- Each feature specification is at `docs/features/<ID>.md` (for example, [`docs/features/L01.md`](features/L01.md)); it records scope, dependencies, evidence, checks and remaining gaps.",
        "- UI locations for all features are in [`docs/UI_COVERAGE.md`](UI_COVERAGE.md).",
        "- Canonical implementation and acceptance tracking lives in `docs/tracking/feature-register.csv` and `docs/tracking/acceptance-checklist.csv`. This checklist is a generated view, not a second status source.",
        "- Regenerate the feature summaries first, then this checklist:",
        "",
        "```powershell",
        "python scripts/tracking.py",
        "python scripts/feature-checklist.py",
        "python scripts/feature-checklist.py --check",
        "```",
        "",
    ]
    content = "\n".join(lines)
    if args.check:
        if not OUTPUT.exists() or OUTPUT.read_text(encoding='utf-8') != content:
            raise SystemExit('Feature checklist is stale; run python scripts/feature-checklist.py')
        print(f'Validated {OUTPUT.relative_to(ROOT)}: {len(roadmap)} roadmap features')
    else:
        OUTPUT.write_text(content, encoding="utf-8", newline="\n")
        print(f"Generated {OUTPUT.relative_to(ROOT)}: {len(roadmap)} roadmap features")


if __name__ == "__main__":
    main()
