"""Validate canonical audit CSVs and regenerate documentation/workbook payload (stdlib only).

Run: python scripts/tracking.py [--check]
Excel rendering is a separate optional step using scripts/tracking-workbook.mjs.
"""
import argparse
import csv
import hashlib
import json
import re
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT / "docs/tracking"
TABLES = {
    "Feature Register": "feature-register.csv",
    "Acceptance Checklist": "acceptance-checklist.csv",
    "Dependencies and Release Gates": "release-gates.csv",
    "Reconciliation": "reconciliation.csv",
    "Resource Register": "resources.csv",
    "Source Coverage": "source-coverage.csv",
}


def load(name):
    with (BASE / name).open(encoding="utf-8-sig", newline="") as stream:
        return list(csv.DictReader(stream))


def validate(data, specs):
    errors = []
    features = data["Feature Register"]
    ids = {r["Feature ID"] for r in features}
    expected = {f"{p}{n:02}" for p, count in [("F",20),("D",10),("E",8),("S",12),("L",31),("O",30),("A",12),("K",6)] for n in range(1,count+1)}
    if ids != expected or len(features) != len(ids):
        errors.append(f"Feature ID coverage/uniqueness mismatch: {ids ^ expected}")
    for label, rows, key in [("acceptance",data["Acceptance Checklist"],"Tracking ID"),("gates",data["Dependencies and Release Gates"],"Gate ID"),("specs",specs,"Feature ID")]:
        if len(rows) != len({r[key] for r in rows}): errors.append(f"Duplicate {label} IDs")
    if {s["Feature ID"] for s in specs} != ids: errors.append("Specifications missing")
    if sum(r["Count in roadmap"] == "Yes" for r in features) != 85: errors.append("Project roadmap must contain the original 84-feature baseline plus L31 addendum")
    statuses = {
        "Repository-audited implementation status": {"Not audited","Not implemented","Partial","Implemented"},
        "Verification status": {"Not run","Passed","Failed","Blocked","Not applicable"},
        "Deployment status": {"Unknown","Local only","Deployed"},
        "Acceptance status": {"Not assessed","Pending","Accepted","Rejected"},
    }
    for row in features:
        for key, allowed in statuses.items():
            if row[key] not in allowed: errors.append(f"Invalid {key}: {row['Feature ID']}")
        for ref in filter(None,row["Related IDs"].split("; ")):
            if ref not in ids: errors.append(f"Broken parent/related ID {ref}")
        for key in ["Relevant code paths","Relevant tests/checks"]:
            for path in filter(None,row[key].split("; ")):
                if not (ROOT/path).is_file(): errors.append(f"Missing evidence path {path}")
        if row["Feature ID"].startswith("A") and row["Repository-audited implementation status"] == "Implemented":
            errors.append("AI completion needs explicit review of validator guard and evidence")
        if row["Repository-audited implementation status"] != "Not audited" and not row["Evidence reference"]:
            errors.append(f"Audited status without evidence: {row['Feature ID']}")
        if row["Deployment status"] == "Deployed" and not row.get("Deployment evidence"):
            errors.append("Deployed requires Deployment evidence column")
    for row in data["Acceptance Checklist"]:
        for ref in row["Feature IDs"].split("; "):
            if ref not in ids | {"GLOBAL"}: errors.append(f"Broken acceptance parent: {ref}")
        if row["Result"] not in statuses["Verification status"]: errors.append("Invalid criterion result")
        if row["Acceptance status"] not in statuses["Acceptance status"]: errors.append("Invalid criterion acceptance")
        if row["Result"] == "Passed" and not row["Evidence"]: errors.append("Passed without evidence")
    manifest = json.loads((BASE/"source-manifest.json").read_text())
    for name, expected_hash in manifest["sources"].items():
        if hashlib.sha256((BASE/"sources"/name).read_bytes()).hexdigest() != expected_hash:
            errors.append(f"Source snapshot changed: {name}")
    original = [r for r in data["Acceptance Checklist"] if r["Original requirement ID"]]
    if len(original) != 160: errors.append("Original SRS index incomplete")
    if errors: raise SystemExit("\n".join(errors))


def generate(data, specs):
    features = data["Feature Register"]
    review_date = max(r["Last reviewed date"] for r in features)
    roadmap = [r for r in features if r["Count in roadmap"] == "Yes"]
    counts = Counter(r["Repository-audited implementation status"] for r in roadmap)
    lines = ["# InfraShader feature status", "", "Generated from canonical CSV registers. Do not edit this summary directly.", "", f"Latest tracking review: {review_date}. Implementation and acceptance remain separate; initial audit evidence is dated 26 October 2026.", "", "85 project roadmap features: the 84-feature 11 November 2026 PDF baseline plus the user-requested L31 roadwork addendum dated 12 November 2026. The source PDF remains an 84-feature historical baseline. The 38 overlapping baseline references (F/D/E) and six refinements (K) are not extra features. Resources, gates, SRS names and aliases are excluded. No completion percentage is asserted.", "", "| Roadmap implementation | Records |", "|---|---:|"]
    lines += [f"| {s} | {counts[s]} |" for s in ["Not audited","Not implemented","Partial","Implemented"]]
    lines += ["", "Implementation, verification, deployment and acceptance are recorded per feature below. Read the evidence and remaining gates before interpreting a Passed verification status as acceptance. No hosted deployment is inferred.", "", "Historical 26 October audit checks: frontend lint/typecheck/build passed; 36 frontend tests passed; Ruff passed; 158 backend tests passed and 26 database-dependent tests skipped; nine desktop Demo/fixture browser tests passed. Real Auth/Storage/PostGIS integration, provider/device, field and customer acceptance were not rerun. See [audit evidence](tracking/evidence/audit-2026-10-26.md).", "", "Read [specification guide](FEATURE_SPEC.md), [maintenance instructions](tracking/README.md) and [reconciliation](tracking/reconciliation.md) before feature work.", "", "## Next work by controlling stage", "", "- D0: S04/F12/F14 retained issued bytes and recovery; F11/L16 commercial explanations; S06/D06/D09 forced-expiry, form recovery, privacy and joint restore; S07/S08/D08/D10 measured accessibility/operations.", "- D1A: L03/K01/K05 evidence and brief confirmation; L04/K02 editing/change impact; L05/F17 limited calibrated reference subject to its gate; L09/L10/L13â€“L16/K04 curated schedules, build-ups and price readiness; L24/L26/K03 retained proposal/change ledger; L22 limited maintenance checklist.", "- D1B: O02â€“O07 document intake and human-confirmed common scope; O09/O10/O12 locked rubric and reproducible scores; O14/K06 coverage/readiness; O15/O16 clarification and simple signoff; O17/O18/O28 retained decision pack and bounded dashboard/exports.", "- L31: user-requested road/driveway takeoff is a new addendum with partial area-to-uniform-layer implementation. Confirm local road standards/class; verify independent metric quantities, proposal disclosure, qualified review and pilot acceptance.", "- Keep connected exchange, AI and D3/D4 spatial/enterprise expansions deferred to their stated prerequisites. No automatic backlog implementation is authorised.", "", "## Register", "", "| ID | Feature | Priority | Audited implementation | Verification |", "|---|---|---|---|---|"]
    lines = [
        line.replace(
            "Confirm local road standards/class; verify independent metric quantities, proposal disclosure, qualified review and pilot acceptance.",
            "Bounded drag/click road drawing, width and curve/area editing are connected; separate road overlaps are rejected. Confirm local road standards/class; verify independent metric quantities, proposal disclosure, qualified review and pilot acceptance.",
        )
        for line in lines
    ]
    for r in features:
        lines.append(f"| [{r['Feature ID']}](features/{r['Feature ID']}.md) | {r['Feature name']} | {r['Priority']} | {r['Repository-audited implementation status']} | {r['Verification status']} |")
    (ROOT/"docs/FEATURE_STATUS.md").write_text("\n".join(lines)+"\n",encoding="utf-8")
    by_id = {r["Feature ID"]:r for r in features}
    dest=ROOT/"docs/features";dest.mkdir(exist_ok=True)
    for spec in specs:
        id=spec["Feature ID"];r=by_id[id]
        out=[f"# {id} â€” {r['Feature name']}","", "Generated from feature-register.csv and feature-specifications.csv. Source wording is retained below; controlling scope takes precedence over broader activity lists.","",f"- Type: {r['Record type']}; audience: {r['Workspace/audience']}",f"- Related IDs: {r['Related IDs'] or 'None explicitly mapped'}",f"- Priority: {r['Priority']} (separate from status); legacy delivery label: {r['Legacy delivery label'] or 'Not specified'}",f"- Reported: {r['Reported implementation status']}",f"- Audited implementation: **{r['Repository-audited implementation status']}**; verification: **{r['Verification status']}**; deployment: **{r['Deployment status']}**; acceptance: **{r['Acceptance status']}**", ""]
        for label in ["Purpose","Trigger and prerequisites","Inputs and sources","Outputs","Permissions and confidentiality","Validation and failure states","Revision/history","Explicit exclusions"]:
            out += [f"## {label}","",spec[label],""]
        out += ["## Current scope and evidence","",r["Requirement summary"],"",f"Code: {r['Relevant code paths'] or 'Not individually audited; do not interpret as absent.'}","",f"Relevant checks: {r['Relevant tests/checks'] or 'No feature-specific checks mapped in this bounded audit.'}","", f"Feature evidence: [{r['Evidence reference']}](../{r['Evidence reference'].removeprefix('docs/')}). Passing suite checks are not field or customer acceptance.","",f"Remaining gaps: {r['Remaining gaps']}","",f"Dependencies: {r['Dependencies']}","",f"Resources: {r['Resource IDs']}; see canonical resources.csv. A reference is not an installed dependency.","","## Acceptance criteria","", "New TRK IDs are derived â€” review needed. Preserve IDs when refining; add new IDs without renumbering. Original requirement-name rows need full SRS wording before acceptance.",""]
        for a in data["Acceptance Checklist"]:
            if id in a["Feature IDs"].split("; "):
                out += [f"- **{a['Tracking ID']}** ({a['Criterion origin']}): {a['Expected behaviour']} Result: {a['Result']}."]
        out += ["", "Shared GLOBAL criteria and release gates also apply where relevant; an unscoped example is not a new mandatory business rule.","","## Verbatim source contract","",f"[Catalogue snapshot](../tracking/sources/catalogue-2026-10-18.txt), lines {spec['Source start']}â€“{spec['Source end']}. Full text is preserved to avoid losing qualifiers or exclusions.","","```text",spec["Source contract"],"```",""]
        if id == "L31":
            source_index = out.index("## Verbatim source contract")
            out[source_index] = "## User-requested addendum contract"
            out[source_index + 2] = (
                "This contract synthesizes the [roadwork request](../tracking/sources/user-roadwork-addendum-2026-11-12.md) "
                "and [later road-drawing clarification](../tracking/sources/user-road-drawing-clarification-2026-11-12.md). "
                "It is not a passage from the original PDF."
            )
        (dest/f"{id}.md").write_text("\n".join(out),encoding="utf-8")
    reconciliation=["# Reconciliation", "", "Generated from reconciliation.csv. Original workbook is preserved unchanged in sources; historical workbook sheets remain source snapshots, not editable current tracking.", ""]
    for row in data["Reconciliation"]:
        if re.fullmatch(r"REC-\d+",row["Reconciliation ID"]):
            reconciliation += [f"## {row['Reconciliation ID']} â€” {row['Action']} ({row['State']})","",row['Finding'],"",row['Resolution / remaining question'],""]
    (BASE/"reconciliation.md").write_text("\n".join(reconciliation),encoding="utf-8")
    payload={"review_date":review_date,"tables":data,"counts":dict(counts),"canonical_hashes":{name:hashlib.sha256((BASE/name).read_bytes()).hexdigest() for name in TABLES.values()}}
    (BASE/"workbook-data.json").write_text(json.dumps(payload,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")


def main():
    parser=argparse.ArgumentParser();parser.add_argument("--check",action="store_true");args=parser.parse_args()
    data={sheet:load(name) for sheet,name in TABLES.items()};specs=load("feature-specifications.csv")
    validate(data,specs)
    if not args.check:generate(data,specs)
    else:
        payload=json.loads((BASE/"workbook-data.json").read_text(encoding="utf-8"))
        if payload["tables"] != data:raise SystemExit("Generated workbook payload is stale; regenerate")
        for r in data["Feature Register"]:
            if not (ROOT/r["Specification link"]).is_file():raise SystemExit("Missing specification file")
            body=(ROOT/r["Specification link"]).read_text(encoding="utf-8")
            if f"Audited implementation: **{r['Repository-audited implementation status']}**" not in body:
                raise SystemExit(f"Stale specification status: {r['Feature ID']}")
        summary=(ROOT/'docs/FEATURE_STATUS.md').read_text(encoding='utf-8')
        for r in data['Feature Register']:
            expected=f"| [{r['Feature ID']}](features/{r['Feature ID']}.md) | {r['Feature name']} | {r['Priority']} | {r['Repository-audited implementation status']} | {r['Verification status']} |"
            if expected not in summary:raise SystemExit(f"Stale summary row: {r['Feature ID']}")
        documents=[ROOT/'docs/FEATURE_STATUS.md',ROOT/'docs/FEATURE_SPEC.md',BASE/'README.md',BASE/'reconciliation.md',*(ROOT/'docs/features').glob('*.md')]
        for document in documents:
            for target in re.findall(r'\]\(([^)]+)\)',document.read_text(encoding='utf-8')):
                if target.startswith(('http:', 'https:', '#')):continue
                if not (document.parent/target.split('#')[0]).exists():raise SystemExit(f"Broken link in {document}: {target}")
    print(f"Validated {len(data['Feature Register'])} records / 85 project roadmap features (84 baseline + L31 addendum), {len(data['Acceptance Checklist'])} acceptance records, 160 original requirement names; references/statuses/source hashes valid.")


if __name__ == "__main__": main()
