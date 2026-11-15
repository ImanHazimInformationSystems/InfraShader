# Client, project and opportunity hub (L01)

L01 reuses the existing briefs, project grants, archive/restore and immutable revision history. The implementation also connects the K01 agreed-brief checkpoint. Canonical implementation and verification status live in [the tracker](FEATURE_STATUS.md); this page describes behaviour and how to test it.

## Try it locally

Start the existing local services using [setup.md](setup.md). The local database on this PC was upgraded through migration 0014 on 4 November 2026. On another checkout/database, run `./scripts/api.ps1 migrate` after starting the local database. Then run the API and web development servers normally. No hosted service or new production dependency is needed.

1. Sign in and choose **Design Studio → Projects**. Switch between cards and the table. Search covers project/client name, sponsor, owner, tags and opportunity source. Filter the derived project progress separately from the manually recorded opportunity stage; sort by due date, name, creation or update time. Existing project access grants still determine every result, including pagination and counts.
2. Open **My reusable client contacts** to create, edit, archive, restore or inspect a contact's history. These records are private to the current account inside the selected organisation.
3. Create or edit a project brief. **Client and opportunity** records owner, due date, stage, source and tags. **Budget, priorities and stakeholders** retains the existing budget range and stakeholder needs. Choose a saved contact to copy a client snapshot into the brief. Other permitted project readers can see this snapshot. Later contact-library edits do not silently rewrite projects.
4. In a saved project, **Save or maintain a reusable brief template** stores reusable brief text. On a new brief, use **Start from my brief templates**. Applying a template asks before replacing text and retains the selected site, client and budget. Template fields deliberately exclude customer contacts, budgets, geometry, confirmations, issued outputs and access grants. Review copied free text for customer-specific information yourself.
5. **Duplicate this project** creates a new active project at the same site with its own brief history and creator-only grants. It resets owner, due date and sales stage. Optionally copy the saved design: geometry, targets, terrain, objects and quantity inputs are revalidated/recalculated. Source brief and workspace revisions are checked; stale requests fail rather than copying a different version.
6. Use the existing project archive/restore controls. Archiving is reversible; it does not erase project history, client records or evidence.

## Boundaries and permissions

- Library access requires active organisation membership and `create_project`. Each record additionally matches organisation and owner; administrator role alone is not a cross-user library override.
- Duplication requires `create_project` and source-project `edit_project`. Including design additionally requires `edit_geometry`. A read-only assignment cannot duplicate a project into a new writable context.
- Owner is a responsibility label, not a membership assignment or access grant. The default opportunity stages are enquiry, qualified, design, submitted, won, lost and on hold. They do not issue a proposal, constitute an approval or imply acceptance.
- Library changes append immutable snapshots with optimistic revision checks. Brief metadata uses the existing immutable project revisions. Contact/template archives are reversible; deletion and cross-account transfer are outside this slice.
- Copies never inherit grants, approvals, acknowledgement records, uploaded evidence, plan overlays, estimates, pricing adjustments, issued snapshots or retained PDFs. Reference-calibration links are cleared; copied site constraints return to unverified with evidence links removed. Original source notes remain, so the user must review suitability and upload any required evidence again.
- New internal opportunity/contact data is excluded from customer/developer issued payloads. Scope and acknowledgement information deliberately intended for the proposal is included. Existing issued files remain unchanged.
- Browser Demo remains separate. It can display locally stored opportunity fields, but reusable libraries, real duplication and evidence-backed acknowledgement require the API/database.

## Agreed brief checkpoint (K01)

In **Edit brief → Agreed scope, assumptions and sources**, record deliverables, inclusions, exclusions, intended use, unresolved questions and individual known/estimated/unknown facts with a supplier/source. Save these as a new brief revision.

In the project, **Agreed brief checkpoint** displays scope and outstanding questions. An editor can append either:

- **Not confirmed**, with a note and an issue policy; or
- **Acknowledgement supported by evidence**, with an external confirming person, date, method, note and selected existing project evidence. Deliverables, inclusions, exclusions and intended use must be recorded first. Future dates, unavailable/foreign evidence and stale brief/checkpoint versions are rejected. Upload evidence using the existing private evidence workflow and reload the checkpoint list.

The system records evidence of an external event; it cannot establish that a client actually agreed or verify the file's truth. This is not a digital-signature service. Historical confirmations and evidence metadata/hash references are immutable.

**Issue policy is explicit:** a recorded Draft-only policy blocks issuing while the current brief is unconfirmed; draft PDF previews remain available. Only a user with the relevant project issue capability can record a qualified-issue policy. Qualified issue allows an output that explicitly says NOT CONFIRMED. Before any checkpoint has been recorded, the existing issue workflow is retained as qualified issue, with that same disclosure. This compatibility default and the available policy choices are implementation decisions pending pilot acceptance, not an agreed company approval policy.

Any later brief edit, including restoring an older brief as a new revision, invalidates the current acknowledgement. The prior record stays in history. Duplicated projects have no acknowledgement. Issued proposal/decision snapshots and PDFs freeze the exact brief revision, checkpoint reference/status, scope, unresolved questions, budget range and acknowledgement evidence metadata. Later changes cannot retrospectively alter them.

## Technology and sources

Uses the repository's existing React/TypeScript/Zod forms, FastAPI/Pydantic contracts, SQLAlchemy/PostgreSQL persistence, Alembic migrations, project grants, Supabase private-evidence integration, and React PDF output renderer. Design duplication reuses the existing geometry/terrain/object validation. No additional package or paid service was introduced. The bounded 100-row page uses a semantic HTML table; catalogue resource N01 is a candidate, not a requirement to install another table library.

Controlling source: [catalogue L01](tracking/sources/catalogue-2026-10-18.txt), lines 952–972; [K01](features/K01.md), lines 172–184. Resource mappings R01–R03/R07/N01 and X01/X04/X05 remain in `docs/tracking/resources.csv`. Related F01/D03/D04 retain their existing cross-references; delivering this slice does not close unrelated requirements under those broader IDs.

See [test evidence](tracking/evidence/l01-k01-2026-11-04.md) for actual commands, coverage, failures corrected and remaining acceptance gates. Pilot usability, real customer acknowledgement and live Auth/Storage acceptance are separate from software checks.
