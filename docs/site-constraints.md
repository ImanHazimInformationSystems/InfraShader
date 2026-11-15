# L03 survey evidence and constraints

Local implementation checkpoint: 2 November 2026. The register connects private observations and supplied records to design decisions. It records user declarations; it does not survey the site, locate buried utilities or certify setback compliance.

## Use the register

1. Open a real local Design Studio project and **Geometry workspace**. Define the site boundary. The **Survey evidence & constraints · L03** section is below the calculation controls and above private photo evidence. Browser Demo does not simulate these server checks.
2. Select **New constraint**. Choose observation, access point, utility, setback, existing tree or no-work zone. Record the description, source type/reference and uncertainty. A note can remain unlocated; no geometry is fabricated from its text.
3. To add a location, choose Point, LineString or Polygon. Enter WGS84 longitude/latitude pairs, or expand **Draw constraint location**. Confirm permission to record the location and document its basis. Geotagged observations and measured records require an inspection date. Imported images continue to have EXIF/GPS stripped; the app does not silently harvest location metadata.
4. Upload photos in **Private site evidence**, then use **Refresh evidence list** and select supporting photos in the register. Link relevant target/work-item IDs with **Linked design geometry**. Refer to external supplied reports in the source/reference text; no external URL is fetched or treated as verified automatically.
5. Mark an unknown fact **Verify on site**, assign a responsible person and optionally a due date. Mark critical facts explicitly. Record the intended design response. The queue includes all unverified/site-check records, with critical records first, followed by due date and title. Assignment is recorded text, not an invitation or notification.
6. To record verification, use a measured/supplied source and give the verifier, verification date and actual verification reference. Map-derived, traced and estimated records cannot be labelled verified/resolved. Resolution additionally requires the result. Verification cannot precede the recorded inspection. These checks establish record completeness, not the truth or authority of a supplied document.
7. **Apply constraint to draft**, then **Validate & save workspace**. Apply validates geometry and links; final save checks that linked photo metadata belongs to this project and is active. Invalid edits retain the form; failed saves retain the workspace draft. Workspace history retains prior sources and actor/revision information. Restoring history creates another revision.
8. Use **Show constraint layer** on the main map to hide/show the location overlay. It is a view control: constraints are not billable geometry and neither adding nor hiding them changes quantities. Amber denotes unverified locations; purple denotes verification/resolution recorded. The geometry drawing map and the numeric form remain available when a basemap fails.

## Safeguards and boundaries

- Up to 100 records per workspace; at most 20 photo links and 30 design links per record. Existing local geometry limits apply. Locations must lie inside the declared design boundary. Outside-site information can be retained as an unlocated note; extending the boundary is an explicit geometry task.
- Project read/edit grants and archive controls apply server-side. Private evidence remains behind the existing authorised proxy. No service-role credential or storage object path is exposed by this feature.
- A photo supporting a saved constraint cannot be archived until the link is removed and the workspace is saved. This avoids silently invalidating a recorded source. Earlier workspace revisions retain the original linkage. Restoring a revision may require restoring its archived evidence first.
- Unapplied constraint forms block calculation/issue and workspace-history restoration. Applied constraint drafts use the existing undo/recovery/save workflow. Unapplied form contents are not independently persisted across a browser reload; apply before leaving the tab.
- Removing a linked design item is rejected until the constraint is relinked/unlinked. The current register does not automatically modify quantities, dimensions, utility geometry, source heights or no-work-zone enforcement. The recorded response is reviewed by the designer. L20's wider automatic constraint checks remain separate.
- The calculations panel exposes outstanding/critical counts before use. Issued output snapshots contain only frozen counts and a limitation statement; private titles, locations, source notes, responsible people and verification references are not automatically published. Photo publication remains the existing explicit opt-in workflow. No new automatic issue veto or authority approval rule is invented.
- This implements L03 and the simple K05 assignment/resolution queue. Full K05 measurement-override impact and calibration workflow acceptance are not closed by this register. Field, customer, physical-device and full assistive-technology acceptance remain pending.

## Technology and primary references

No new production dependency or schema migration. The register is stored in the existing PostgreSQL/PostGIS-backed workspace JSONB and immutable workspace revisions; older records load with an empty register. React/TypeScript/Zod provide the interface and response parsing. FastAPI/Pydantic own validation and access; Shapely/PyProj validate site-relative geometry; MapLibre/Terra Draw render and capture GeoJSON. Existing Supabase private storage and Pillow sanitisation are reused.

- [GeoJSON RFC 7946](https://www.rfc-editor.org/info/rfc7946/): WGS84 transfer and longitude/latitude ordering.
- [Shapely manual](https://shapely.readthedocs.io/en/stable/manual.html): geometry validity and coverage checks.
- [Supabase private buckets](https://supabase.com/docs/guides/storage/buckets/fundamentals) and [storage access control](https://supabase.com/docs/guides/storage/security/access-control): private file foundations. Application project access is checked by the server proxy before file transfer.
- Catalogue resources R02–R08 are retained in `docs/tracking/resources.csv`. Their presence alone is not evidence of an installed dependency or acceptance.

See [checkpoint evidence](tracking/evidence/l03-2026-11-02.md) and [canonical feature specification](features/L03.md). Tracking data stays in CSV; no Excel export is required.
