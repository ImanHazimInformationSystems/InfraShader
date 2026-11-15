# Permanent draft-project deletion ? 15 November 2026

User requested a Delete project option alongside Archive. Scoped to L01, S04 and the related accessible project controls. Existing dirty worktree preserved; no user project was deleted during development. Only disposable test fixtures were removed. No migration, production dependency, remote write, Excel export or deployment.

## Behaviour

- Project details shows **Delete project** beside Archive/Restore. A native modal describes what is removed, requires the exact project name, permits Cancel/Escape and keeps deletion disabled until eligible and confirmed.
- `GET /api/v1/organisations/{org}/projects/{project}/deletion` reports eligibility and current revision. `DELETE` on the existing project URL accepts `expected_revision` and `confirmation_name`.
- The backend requires current project edit permission, plus creator identity or project access-management permission. Administrators have no implicit bypass. Stale revisions, foreign/ungranted projects and incorrect names are rejected.
- Project row is locked and all protection checks repeat on delete. Issued proposals/developer briefs or formal review entries/files block permanent removal with a plain instruction to Archive. This is a deliberately bounded deletion policy, preserving existing retained records. The user requested deletion generally; deleting issued records remains excluded by this implementation and is explicitly disclosed.
- Database FK cascades remove this project's draft design, revisions, estimates, evidence metadata and grants. Other projects and shared organisation rates remain. Archive remains reversible; Delete is permanent.
- A minimal immutable organisation audit receipt commits in the same transaction. It includes project ID, actor and private cleanup paths, not the deleted project's name or design content. This receipt is intentionally retained for deletion accountability and cleanup.
- Storage cleanup runs after the database transaction, with at most three paths per request. Successful deletes get immutable path receipts. A storage failure leaves a durable pending job, visible to its deleting account on Projects as **Deleted projects: uploaded-file cleanup pending**. **Retry file cleanup** resumes unfinished paths without exposing object paths. The project is already deleted; pending private bytes are disclosed honestly. No scheduled cleanup service was added.
- Browser Demo deletes only its local project and local workspace; it is separate from real persistence. The affected account/project session recovery draft is cleared after successful deletion.

## Files

`apps/api/app/project_deletion.py`, router registration in `apps/api/app/main.py`; `apps/web/src/components/DeleteProject.tsx`, its standalone `delete-project.css`, integration in `App.tsx`, and local `services/demo.ts`. Tests in `apps/api/tests/test_project_deletion.py`, `apps/web/src/services/demo.test.ts`, `tests/integration-browser/project-deletion.spec.mjs`.

## Actual checks

- Full backend: **404 passed**, Ruff/format passed, one existing Starlette/httpx deprecation warning. After bounding cleanup, **10 focused deletion tests passed**, including batch continuation.
- Frontend final lint, typecheck and build passed; **148 Vitest tests in 39 files passed**. Existing large-bundle warning remains. Earlier typecheck found a Supabase Session field mismatch; corrected to `session.user.id`.
- Browser integration (ports 8101/5174): deletion + project-hub **2 passed**. Deletion rechecked after standalone dialog styling: **1 passed**.
- Deletion browser verifies a wrong name cannot enable deletion, Escape preserves the project, exact confirmation deletes it, another project is retained and the deleted project remains absent after reload.
- Rendered dialog inspected at **1440x900, 820x1100, 390x844**, reduced motion enabled, no document horizontal overflow. Initially the dialog borrowed lazy-loaded map styles; inspection exposed missing styling on project details. Added an independent CSS module and rechecked the rendered result. Screenshots are in `project-deletion-2026-11-15/` alongside this evidence.
- PostGIS tests cover cascades, name/revision/role/tenant failures, issued/review protection, route validation, persistent cleanup failure/retry and batch continuation. The initial review fixture used an invalid record kind; corrected the fixture to the existing allowed basis kind.

## Remaining gates

Real Supabase private-file deletion was not exercised: storage failures/success were injected through the real deletion service with test Storage objects. Browser tests use fixture identity and offline map content with real disposable PostGIS. Physical devices, screen reader and user acceptance remain pending. Projects with retained issued/formal review records are intentionally archive-only. Cleanup retry requires the deleting account to retain organisation read access; operator transfer of abandoned cleanup jobs is not implemented. No other roadmap status or release acceptance was promoted.

Earlier L01 evidence is [issue readiness](issue-readiness-2026-11-15.md). Earlier S04 evidence remains in historical tracking exports and the retained evidence directory.
