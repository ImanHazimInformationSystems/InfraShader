# Current workflow

Follow [setup.md](setup.md).

**Design Studio in four steps (15 November 2026).** Open a project and choose **Open design map**. The header shows the steps:
1. **Site** — check the site summary and records.
2. **Design** — use Layout, Trees, Objects and Materials, with **Option being edited** on the map.
3. **Prices** — give each item a price in Pricing; keep your dated price list in Saved rates.
4. **Proposal** — Review what needs attention, calculate the Total, then preview and issue the Proposal.

Optional Terrain and Shade study, and the one-page **List view**, are under **More tools**. The numbered steps below describe the same work in detail. Browser Demo can explore projects and save geometry drafts without accounts. Its quantities and calculations are unavailable; only real mode uses the API and PostGIS.

1. Enter Explore Map, select numeric longitude/latitude bounds or the visible extent, choose a project purpose and record the stakeholder/brief. Bounds are a locator, not a surveyed boundary.
2. Open the design map (the list view shows these controls on one page). Start a draft from the locator, then replace/verify the boundary and record its source. Draw with Terra Draw or enter coordinate pairs. Apply the form to the draft before saving.
3. Add shared target zones. Define existing Baseline items and independent Option A/B items. Copying Baseline explicitly replaces one option. Supported items include area, path, building, elevated canopy roof, tree, bench and manual counts. Trees have no modeled shadow.
4. Record geometry provenance and source notes; building/roof heights need their own source. Document any quantity override. Real saves validate containment/CRS/limits and calculate quantities; failed saves retain the draft.
5. In real mode, add explicit dated organisation rates, assign them to proposed scope, save, then calculate the selected option estimate. Developer budgets and contractor selling prices use different rate bases. Missing rates yield an incomplete priced subset.
6. For exploratory ground shade, select a saved target and an ISO date/time with explicit offset (Malaysia is +08:00). All three scenarios use that same target/time. Results are modeled, not field validated; changes make them stale.
7. Complete the brief, select a complete current estimate, record review criteria/notes/assumptions/exclusions and confirm the purpose-specific issue. Download retries use the same immutable snapshot. Numerical shade is omitted from issued PDFs while field validation is pending.
8. Private site photos require configured local Supabase Storage and permission to use the photo. PNG/JPEG files are re-encoded to remove embedded metadata. Keep relevant source/location notes explicitly.

Archive requires confirmation and projects can be restored. Conflicts require reviewing/reloading newer data. Staged IFC, AI, plan overlay, terrain and GLB workflows remain gated. Profile/member/settings administration, independent review history, commercial-policy completion and recovery operations are not yet complete. No screen certifies construction suitability, field shade accuracy or market prices.

## Submitting a proposal to an owner organisation (15 November 2026)

**Owner (Organisation Review):**
1. Open the review project and save the comparison basis.
2. Under **Invite contractors to submit**, choose **New invitation**. Enter the contractor's account email, the closing time and instructions, and pick which brief fields to share.
3. Click **Preview what will be shared** and add any files.
4. Click **Issue invitation link**, then copy the link and send it yourself. It is shown once.

Received offers appear in step 3 **Offers** and in the invitation's history. Received is not accepted: confirm the values before scoring.

**Contractor (Design Studio):**
1. Open the link, sign in with the invited email and accept for your organisation.
2. Under **Projects > Invited opportunities**, link a project or create one from the brief.
3. Issue your proposal as usual.
4. In the project's **Proposal** step, under **Submit to organisation**, preview what the owner will receive, confirm you are authorised, and submit. Keep the receipt.

To revise, issue a new version and submit it with a reason. Earlier submissions stay on record.
