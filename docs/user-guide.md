# Current workflow

Follow [setup.md](setup.md). Browser Demo can explore projects and save geometry drafts without accounts. Its quantities and calculations are unavailable; only real mode uses the API and PostGIS.

1. Enter Explore Map, select numeric longitude/latitude bounds or the visible extent, choose a project purpose and record the stakeholder/brief. Bounds are a locator, not a surveyed boundary.
2. Open the geometry workspace. Start a draft from the locator, then replace/verify the boundary and record its source. Draw with Terra Draw or enter coordinate pairs. Apply the form to the draft before saving.
3. Add shared target zones. Define existing Baseline items and independent Option A/B items. Copying Baseline explicitly replaces one option. Supported items include area, path, building, elevated canopy roof, tree, bench and manual counts. Trees have no modeled shadow.
4. Record geometry provenance and source notes; building/roof heights need their own source. Document any quantity override. Real saves validate containment/CRS/limits and calculate quantities; failed saves retain the draft.
5. In real mode, add explicit dated organisation rates, assign them to proposed scope, save, then calculate the selected option estimate. Developer budgets and contractor selling prices use different rate bases. Missing rates yield an incomplete priced subset.
6. For exploratory ground shade, select a saved target and an ISO date/time with explicit offset (Malaysia is +08:00). All three scenarios use that same target/time. Results are modeled, not field validated; changes make them stale.
7. Complete the brief, select a complete current estimate, record review criteria/notes/assumptions/exclusions and confirm the purpose-specific issue. Download retries use the same immutable snapshot. Numerical shade is omitted from issued PDFs while field validation is pending.
8. Private site photos require configured local Supabase Storage and permission to use the photo. PNG/JPEG files are re-encoded to remove embedded metadata. Keep relevant source/location notes explicitly.

Archive requires confirmation and projects can be restored. Conflicts require reviewing/reloading newer data. Staged IFC, AI, plan overlay, terrain and GLB workflows remain gated. Profile/member/settings administration, independent review history, commercial-policy completion and recovery operations are not yet complete. No screen certifies construction suitability, field shade accuracy or market prices.
