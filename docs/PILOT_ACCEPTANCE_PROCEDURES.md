# Pilot and external acceptance procedures (prepared 13 November 2026)

These procedures prepare the gates that software cannot close. Nothing here is completed or accepted; record each
result as dated evidence in `docs/tracking/evidence/` and update `release-gates.csv` / `acceptance-checklist.csv`.
Use a staging or local environment with real Supabase Auth/Storage — never production data without consent.

## REC-010 — owner procurement policy decision (G1)

The owner workflow deliberately has **no defaults** for these choices; each project currently chooses them
explicitly in the comparison basis and rubric. An authorised person should decide whether the organisation adopts a
standard and record: self-approval (prohibited/permitted), missing reviewer scores (not ranked / scale minimum),
reviewer aggregation (mean/median), tie handling (currently report only — never broken), weight conventions,
approval stages and any delegation limits. Record the decision maker, date, scope and source document. Until then
the decision memorandum states that the settings are project choices, not adopted policy.

## AC-04 — representative documents

1. Collect 5–10 anonymised real offers (mix of text PDF, scanned PDF, XLSX BOQ, native JSON) with permission.
2. For each: record receipt, retain the original, use "Suggest lines from text" where offered, map and confirm
   lines against the viewer, and note every suggestion that was wrong, missing or misleading.
3. Check: scanned files report "no text layer"; oversized/malformed files are refused clearly; confirmed values carry
   page/cell anchors; hashes match on download. Record time taken per offer.
4. Pass criterion to agree with the owner team beforehand (e.g. no confirmed value without a source anchor).

## AC-10 — pilots of both workflows

- **Design Studio (contractor):** site → brief → design Baseline/Option → quantities with sources → rates with
  validity → estimate → reviewed proposal PDF (v3 plan sheet, maintenance checklist) → client change request →
  revised issue; confirm the earlier issue is unchanged and the change register CSV is understandable.
- **Organisation Review (owner):** basis → rubric (locked) → three offers incl. one external document-only offer
  from an unregistered supplier → confirmed comparison → reviewer scores with rationale → clarification and revised
  offer → recommendation → separate approver → decision pack and memorandum.
- For each participant record role, task success, time, errors, confusing wording and whether outputs would be
  sent as-is. Hand-check at least one quantity, one price and one weighted score per pilot (see AC-03 examples in
  `docs/tracking/evidence/owner-review-d1b-2026-11-13.md` and `change-register-2026-11-13.md`).

## AC-06 — devices and assistive technology

Automated WCAG 2.1 A/AA scans pass on main screens (`shared-audit-2026-11-13.md`). Still required: NVDA + Edge
and VoiceOver + Safari passes of both workflows; keyboard-only completion; 200% zoom; a phone and a tablet with
touch; reduced-motion setting; record browser/OS/device versions.

## Human review of wording (G4)

A commercial reviewer checks proposal wording (pricing assumptions, validity, maintenance responsibilities), a
quantity reviewer checks measurement labels and "verify on site" statements, and someone accountable for claims
confirms no output implies field shade accuracy or survey-grade dimensions.

## AC-07 / G7 — operations

Measured locally (`shared-audit-2026-11-13.md`, `live-auth-storage-restore-2026-11-13.md`). Still required on the
target environment: scheduled off-machine backups of Postgres and Storage, an Auth user export, a timed restore
(RPO/RTO), monitoring/alerting and a reference-device performance run.
