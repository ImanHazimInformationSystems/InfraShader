import logging
import re
from datetime import date
from time import perf_counter
from typing import Annotated, Literal
from uuid import UUID, uuid4

import jwt
from fastapi import Depends, FastAPI, File, Form, Query, Request, Response, UploadFile
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session
from starlette.exceptions import HTTPException

from app import (
    administration,
    calculations,
    evidence,
    explore,
    projects,
    reviews,
    shade_studies,
    spatial_editor,
    terrain_analysis,
    workspace,
)
from app.auth import TokenVerifier, current_user, get_verifier
from app.body_limit import BodyLimit
from app.brief_checkpoint import router as brief_checkpoint_router
from app.change_register import router as change_register_router
from app.config import Settings, get_settings
from app.db import database_session, engine_for
from app.errors import APIError
from app.examples import router as examples_router
from app.models import CatalogueRate
from app.onboarding import router as onboarding_router
from app.opportunities import router as opportunities_router
from app.owner_review import router as owner_review_router
from app.plan_reference import PlanReference
from app.project_deletion import router as project_deletion_router
from app.project_hub import router as project_hub_router
from app.schemas import ProjectCreate, ProjectList, ProjectResponse, ProjectUpdate, SessionResponse

logger = logging.getLogger("infrashader.requests")
app = FastAPI(title="InfraShader API", version="0.1.0", docs_url="/api/docs")
app.include_router(onboarding_router)
app.include_router(project_hub_router)
app.include_router(project_deletion_router)
app.include_router(brief_checkpoint_router)
app.include_router(owner_review_router)
app.include_router(opportunities_router)
app.include_router(change_register_router)
app.include_router(examples_router)


@app.post("/api/v1/explore/shadows")
def explore_shadows(data: explore.ExploreInput):
    # Public, bounded and stateless: no project, identity, persistence or provider access.
    try:
        return explore.preview(data)
    except ValueError as error:
        raise APIError(422, "explore_unavailable", str(error)) from error


@app.post("/api/v1/explore/solar-day")
def explore_solar_day(data: explore.SolarDayInput):
    try:
        return explore.solar_day(data)
    except ValueError as error:
        raise APIError(422, "solar_unavailable", str(error)) from error


app.add_middleware(BodyLimit)
app.add_middleware(
    CORSMiddleware,
    allow_origins=get_settings().cors_origins,
    # DELETE: project deletion, brief files and submission attachments (cross-origin deploys).
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Request-ID"],
    expose_headers=["X-Request-ID"],
)


@app.middleware("http")
async def request_context(request: Request, call_next):
    incoming_id = request.headers.get("X-Request-ID", "")
    request.state.request_id = (
        incoming_id if re.fullmatch(r"[A-Za-z0-9_-]{8,64}", incoming_id) else str(uuid4())
    )
    started = perf_counter()
    response = await call_next(request)
    response.headers["X-Request-ID"] = request.state.request_id
    if request.headers.get("Authorization"):
        response.headers["Cache-Control"] = "no-store"
    # No token, query string, request body, private URI or customer contents are logged.
    logger.info(
        "request_completed request_id=%s method=%s status=%s duration_ms=%.1f",
        request.state.request_id,
        request.method,
        response.status_code,
        (perf_counter() - started) * 1000,
    )
    return response


def error_response(request: Request, error: APIError):
    request_id = getattr(request.state, "request_id", str(uuid4()))
    headers = {"X-Request-ID": request_id}
    if error.status_code == 401:
        headers["WWW-Authenticate"] = "Bearer"
    return JSONResponse(
        status_code=error.status_code,
        content={
            "error": {"code": error.code, "message": error.message, "details": error.details},
            "request_id": request_id,
        },
        headers=headers,
    )


@app.exception_handler(APIError)
async def application_error(request: Request, exc: APIError):
    return error_response(request, exc)


@app.exception_handler(RequestValidationError)
async def validation_error(request: Request, exc: RequestValidationError):
    # Pydantic input/context can contain customer data: expose locations and safe messages only.
    details = [{"field": ".".join(map(str, e["loc"])), "message": e["msg"]} for e in exc.errors()]
    return error_response(
        request, APIError(422, "validation_error", "Check the marked fields.", details)
    )


@app.exception_handler(HTTPException)
async def http_error(request: Request, exc: HTTPException):
    message = (
        "The requested endpoint is unavailable." if exc.status_code == 404 else "Request failed."
    )
    return error_response(request, APIError(exc.status_code, "http_error", message))


@app.exception_handler(Exception)
async def unexpected_error(request: Request, exc: Exception):
    logger.error(
        "unexpected_error request_id=%s type=%s", request.state.request_id, type(exc).__name__
    )
    return error_response(
        request, APIError(500, "internal_error", "The operation failed. Retry shortly.")
    )


@app.get("/api/v1/health")
def health():
    return {"status": "ok", "service": "infrashader-api", "version": "0.1.0"}


@app.get("/api/v1/readiness")
def readiness(
    settings: Annotated[Settings, Depends(get_settings)],
    verifier: Annotated[TokenVerifier, Depends(get_verifier)],
):
    checks = {
        "database": "not_configured",
        "auth": "not_configured",
    }
    if settings.database_url:
        try:
            with engine_for(settings.database_url).connect() as connection:
                connection.execute(text("SELECT postgis_version()"))
                connection.execute(text("SELECT 1 FROM organisations LIMIT 1"))
            checks["database"] = "ready"
        except SQLAlchemyError:
            checks["database"] = "unavailable_or_unmigrated"
    if settings.issuer:
        try:
            keys = verifier.jwks.get_signing_keys() if verifier.jwks else []
            checks["auth"] = (
                "ready"
                if any(key.algorithm_name in {"RS256", "ES256"} for key in keys)
                else "unsupported_keys"
            )
        except jwt.PyJWTError:
            checks["auth"] = "unavailable"
    ready = checks == {"database": "ready", "auth": "ready"}
    return JSONResponse(
        status_code=200 if ready else 503,
        content={"status": "ready" if ready else "unavailable", "checks": checks},
    )


User = Annotated[UUID, Depends(current_user)]
Database = Annotated[Session, Depends(database_session)]


@app.get("/api/v1/session", response_model=SessionResponse)
def user_session(user: User, db: Database):
    return projects.session_info(db, user)


@app.get("/api/v1/organisations/{organisation_id}/projects", response_model=ProjectList)
def project_list(
    organisation_id: UUID,
    user: User,
    db: Database,
    archived: bool = False,
    query: Annotated[str, Query(max_length=160)] = "",
    sort: Literal["updated", "name", "created", "due"] = "updated",
    stage: Literal["", "brief", "site", "option", "estimate", "developer_brief", "proposal"] = "",
    opportunity: Literal[
        "", "enquiry", "qualified", "design", "submitted", "won", "lost", "on_hold"
    ] = "",
    purpose: Literal["", "developer_decision", "contractor_proposal"] = "",
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
):
    return projects.list_projects(
        db, organisation_id, user, archived, limit, offset, query, sort, stage, opportunity, purpose
    )


@app.post(
    "/api/v1/organisations/{organisation_id}/projects",
    response_model=ProjectResponse,
    status_code=201,
)
def project_create(organisation_id: UUID, data: ProjectCreate, user: User, db: Database):
    return projects.create_project(db, organisation_id, user, data)


@app.get(
    "/api/v1/organisations/{organisation_id}/projects/{project_id}", response_model=ProjectResponse
)
def project_get(organisation_id: UUID, project_id: UUID, user: User, db: Database):
    return projects.get_project(db, organisation_id, project_id, user)


@app.patch(
    "/api/v1/organisations/{organisation_id}/projects/{project_id}", response_model=ProjectResponse
)
def project_update(
    organisation_id: UUID, project_id: UUID, data: ProjectUpdate, user: User, db: Database
):
    return projects.update_project(db, organisation_id, project_id, user, data)


@app.get("/api/v1/organisations/{organisation_id}/projects/{project_id}/workspace")
def workspace_get(organisation_id: UUID, project_id: UUID, user: User, db: Database):
    return workspace.get_workspace(db, organisation_id, project_id, user)


@app.get("/api/v1/organisations/{organisation_id}/projects/{project_id}/workspace/history")
def workspace_history_get(
    organisation_id: UUID,
    project_id: UUID,
    user: User,
    db: Database,
    offset: Annotated[int, Query(ge=0, le=100000)] = 0,
):
    return workspace.workspace_history(db, organisation_id, project_id, user, offset)


@app.post(
    "/api/v1/organisations/{organisation_id}/projects/{project_id}/workspace/history/{revision}/restore"
)
def workspace_history_restore(
    organisation_id: UUID,
    project_id: UUID,
    revision: int,
    user: User,
    db: Database,
    expected_revision: Annotated[int, Query(ge=0)],
):
    return workspace.restore_workspace(
        db, organisation_id, project_id, user, revision, expected_revision
    )


@app.post("/api/v1/organisations/{organisation_id}/projects/{project_id}/workspace")
def workspace_save(
    organisation_id: UUID,
    project_id: UUID,
    data: workspace.WorkspaceInput,
    user: User,
    db: Database,
):
    return workspace.save_workspace(db, organisation_id, project_id, user, data)


@app.post("/api/v1/organisations/{organisation_id}/projects/{project_id}/reference-preview")
def reference_preview(
    organisation_id: UUID, project_id: UUID, data: PlanReference, user: User, db: Database
):
    try:
        return workspace.reference_preview(db, organisation_id, project_id, user, data)
    except ValueError as exc:
        raise APIError(422, "invalid_calibration", str(exc)) from exc


@app.post("/api/v1/organisations/{organisation_id}/projects/{project_id}/spatial-scene")
def spatial_scene(
    organisation_id: UUID,
    project_id: UUID,
    data: workspace.WorkspaceInput,
    user: User,
    db: Database,
    georeferenced: bool = False,
):
    # Inspection is allowed to project readers; this endpoint never persists a draft.
    project = workspace.project_for_workspace(db, organisation_id, project_id, user)
    return spatial_editor.scene_geometry(data, project.site["bounds"], georeferenced)


@app.post("/api/v1/organisations/{organisation_id}/projects/{project_id}/spatial-edit")
def spatial_edit(
    organisation_id: UUID,
    project_id: UUID,
    data: spatial_editor.EditInput,
    user: User,
    db: Database,
):
    workspace.access.require_project(db, organisation_id, project_id, user, "edit_geometry")
    project = workspace.project_for_workspace(db, organisation_id, project_id, user)
    if data.operation in ("road", "plant", "tree", "paint", "clear_paint", "fence"):
        saved = workspace.get_workspace(db, organisation_id, project_id, user)
        if data.workspace.expected_revision != saved["revision"]:
            raise APIError(
                409, "revision_conflict", "The workspace changed. Reload before editing the layout."
            )
        if data.operation == "tree" and data.tree_item and data.tree_item.rate_id:
            rate = db.get(CatalogueRate, data.tree_item.rate_id)
            expected_basis = (
                "indicative_budget" if project.purpose == "developer_decision" else "cost"
            )
            if (
                not rate
                or rate.organisation_id != organisation_id
                or rate.unit != "item"
                or rate.currency != project.currency
                or rate.basis != expected_basis
            ):
                raise APIError(
                    422,
                    "tree_rate",
                    "Choose a compatible sourced per-item tree rate from this organisation.",
                )
            old = next(
                (
                    item
                    for item in (saved.get("data") or {})
                    .get("scenarios", {})
                    .get(data.scenario, {})
                    .get("items", [])
                    if item["id"] == str(data.tree_item.id)
                ),
                None,
            )
            if rate.basis == "cost" and (not old or old.get("rate_id") != str(rate.id)):
                workspace.access.require_project(
                    db, organisation_id, project_id, user, "internal_pricing"
                )
    try:
        return spatial_editor.edit_draft(data, project.site["bounds"])
    except ValueError as error:
        raise APIError(422, "spatial_edit", str(error)) from error


@app.post("/api/v1/organisations/{organisation_id}/projects/{project_id}/object-transform")
def object_transform(
    organisation_id: UUID,
    project_id: UUID,
    data: workspace.ObjectTransformInput,
    user: User,
    db: Database,
):
    workspace.access.require_project(db, organisation_id, project_id, user, "edit_geometry")
    project = workspace.project_for_workspace(db, organisation_id, project_id, user)
    return workspace.transform_objects(data, project.site["bounds"])


@app.post("/api/v1/organisations/{organisation_id}/projects/{project_id}/object-preview")
def object_preview(
    organisation_id: UUID,
    project_id: UUID,
    data: workspace.WorkspaceInput,
    user: User,
    db: Database,
):
    workspace.access.require_project(db, organisation_id, project_id, user, "edit_geometry")
    project = workspace.project_for_workspace(db, organisation_id, project_id, user)
    return workspace.validate_workspace(data, project.site["bounds"])


@app.post("/api/v1/organisations/{organisation_id}/projects/{project_id}/terrain-studies")
def terrain_study_create(
    organisation_id: UUID,
    project_id: UUID,
    data: terrain_analysis.StudyInput,
    user: User,
    db: Database,
):
    return terrain_analysis.create_study(db, organisation_id, project_id, user, data)


@app.get("/api/v1/organisations/{organisation_id}/projects/{project_id}/terrain-studies")
def terrain_study_list(organisation_id: UUID, project_id: UUID, user: User, db: Database):
    return terrain_analysis.list_studies(db, organisation_id, project_id, user)


@app.post("/api/v1/organisations/{organisation_id}/projects/{project_id}/terrain-frame")
def terrain_frame(
    organisation_id: UUID,
    project_id: UUID,
    data: workspace.WorkspaceInput,
    user: User,
    db: Database,
):
    workspace.access.require_project(db, organisation_id, project_id, user, "edit_geometry")
    project = workspace.project_for_workspace(db, organisation_id, project_id, user)
    validated = workspace.validate_workspace(data, project.site["bounds"])
    projected = workspace.project_wgs84_geometry(validated["boundary"], source_crs="EPSG:4326")
    return {"metric_crs": projected.metric_crs, "bounds": list(projected.geometry.bounds)}


@app.get("/api/v1/organisations/{organisation_id}/projects/{project_id}/schedule")
def schedule_get(
    organisation_id: UUID,
    project_id: UUID,
    user: User,
    db: Database,
    scenario: workspace.ScenarioKey = "option_a",
):
    from app.schedules import schedule_report

    return schedule_report(db, organisation_id, project_id, user, scenario)


@app.post("/api/v1/organisations/{organisation_id}/projects/{project_id}/pricing-preview")
def pricing_preview_post(
    organisation_id: UUID,
    project_id: UUID,
    data: workspace.WorkspaceInput,
    user: User,
    db: Database,
    scenario: workspace.ScenarioKey = "option_a",
):
    # Project readers may preview; costs stay behind internal pricing and nothing is persisted.
    from app.schedules import pricing_preview

    return pricing_preview(db, organisation_id, project_id, user, data, scenario)


@app.get("/api/v1/organisations/{organisation_id}/rates")
def rates_get(
    organisation_id: UUID,
    user: User,
    db: Database,
    query: Annotated[str, Query(max_length=160)] = "",
    category: Annotated[str, Query(max_length=80)] = "",
    archived: bool = False,
    unit: Literal["m2", "m", "item", "m3", "h"] | None = None,
    basis: Literal["indicative_budget", "cost"] | None = None,
    offset: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
):
    return calculations.list_rates(
        db,
        organisation_id,
        user,
        query=query,
        unit=unit,
        basis=basis,
        offset=offset,
        limit=limit,
        category=category,
        archived=archived,
    )


@app.get("/api/v1/organisations/{organisation_id}/rates/{rate_id}")
def rate_get(organisation_id: UUID, rate_id: UUID, user: User, db: Database):
    return calculations.get_rate(db, organisation_id, user, rate_id)


@app.post("/api/v1/organisations/{organisation_id}/rates", status_code=201)
def rates_create(organisation_id: UUID, data: calculations.RateInput, user: User, db: Database):
    return calculations.create_rate(db, organisation_id, user, data)


@app.get("/api/v1/organisations/{organisation_id}/projects/{project_id}/artifacts")
def artifacts_get(organisation_id: UUID, project_id: UUID, user: User, db: Database):
    return calculations.get_artifacts(db, organisation_id, project_id, user)


@app.post(
    "/api/v1/organisations/{organisation_id}/projects/{project_id}/shade-studies", status_code=201
)
def shade_study_create(
    organisation_id: UUID,
    project_id: UUID,
    data: shade_studies.StudyInput,
    user: User,
    db: Database,
):
    return shade_studies.run(db, organisation_id, project_id, user, data)


@app.get("/api/v1/organisations/{organisation_id}/projects/{project_id}/shade-studies")
def shade_study_list(organisation_id: UUID, project_id: UUID, user: User, db: Database):
    return shade_studies.list_saved(db, organisation_id, project_id, user)


@app.post("/api/v1/organisations/{organisation_id}/projects/{project_id}/analyses", status_code=201)
def analysis_create(
    organisation_id: UUID,
    project_id: UUID,
    data: calculations.AnalysisInput,
    user: User,
    db: Database,
):
    return calculations.run_analysis(db, organisation_id, project_id, user, data)


@app.post(
    "/api/v1/organisations/{organisation_id}/projects/{project_id}/estimates", status_code=201
)
def estimate_create(
    organisation_id: UUID,
    project_id: UUID,
    data: calculations.EstimateInput,
    user: User,
    db: Database,
):
    return calculations.run_estimate(db, organisation_id, project_id, user, data)


@app.post(
    "/api/v1/organisations/{organisation_id}/projects/{project_id}/developer-briefs",
    status_code=201,
)
def developer_brief_create(
    organisation_id: UUID,
    project_id: UUID,
    data: calculations.IssueInput,
    user: User,
    db: Database,
    settings: Annotated[Settings, Depends(get_settings)],
):
    return calculations.issue_snapshot(
        db,
        organisation_id,
        project_id,
        user,
        data,
        "developer_brief",
        storage=evidence.PrivateStorage(settings) if data.include_evidence_images else None,
    )


@app.post(
    "/api/v1/organisations/{organisation_id}/projects/{project_id}/proposals", status_code=201
)
def proposal_create(
    organisation_id: UUID,
    project_id: UUID,
    data: calculations.IssueInput,
    user: User,
    db: Database,
    settings: Annotated[Settings, Depends(get_settings)],
):
    return calculations.issue_snapshot(
        db,
        organisation_id,
        project_id,
        user,
        data,
        "proposal",
        storage=evidence.PrivateStorage(settings) if data.include_evidence_images else None,
    )


@app.post("/api/v1/organisations/{organisation_id}/projects/{project_id}/issue-readiness")
def issue_readiness(
    organisation_id: UUID,
    project_id: UUID,
    data: calculations.ReadinessInput,
    kind: Literal["developer_brief", "proposal"],
    user: User,
    db: Database,
):
    return calculations.issue_readiness(db, organisation_id, project_id, user, data, kind)


@app.post("/api/v1/organisations/{organisation_id}/projects/{project_id}/output-preview")
def output_preview(
    organisation_id: UUID,
    project_id: UUID,
    data: calculations.PreviewInput,
    kind: Literal["developer_brief", "proposal"],
    user: User,
    db: Database,
    settings: Annotated[Settings, Depends(get_settings)],
):
    return calculations.issue_snapshot(
        db,
        organisation_id,
        project_id,
        user,
        data,
        kind,
        preview=True,
        storage=evidence.PrivateStorage(settings) if data.include_evidence_images else None,
    )


@app.get("/api/v1/organisations/{organisation_id}/projects/{project_id}/evidence")
def evidence_list(
    organisation_id: UUID, project_id: UUID, user: User, db: Database, archived: bool = False
):
    return evidence.list_evidence(db, organisation_id, project_id, user, archived)


@app.patch(
    "/api/v1/organisations/{organisation_id}/projects/{project_id}/evidence/{evidence_id}/archive"
)
def evidence_archive(
    organisation_id: UUID,
    project_id: UUID,
    evidence_id: UUID,
    data: evidence.EvidenceArchive,
    user: User,
    db: Database,
):
    return evidence.archive_evidence(db, organisation_id, project_id, user, evidence_id, data)


@app.post("/api/v1/organisations/{organisation_id}/projects/{project_id}/evidence", status_code=201)
def evidence_upload(
    organisation_id: UUID,
    project_id: UUID,
    user: User,
    db: Database,
    settings: Annotated[Settings, Depends(get_settings)],
    photo: Annotated[UploadFile, File()],
    description: Annotated[str, Form(max_length=2000)],
    source_note: Annotated[str, Form(max_length=2000)],
    rights_confirmed: Annotated[bool, Form()],
):
    if not rights_confirmed:
        raise APIError(422, "file_rights", "Confirm that you have permission to use this photo.")
    content = photo.file.read(evidence.MAX_BYTES + 1)
    return evidence.upload(
        db,
        organisation_id,
        project_id,
        user,
        content,
        description,
        source_note,
        evidence.PrivateStorage(settings),
    )


@app.get(
    "/api/v1/organisations/{organisation_id}/projects/{project_id}/evidence/{evidence_id}/content"
)
def evidence_download(
    organisation_id: UUID,
    project_id: UUID,
    evidence_id: UUID,
    user: User,
    db: Database,
    settings: Annotated[Settings, Depends(get_settings)],
):
    content, content_type = evidence.download(
        db, organisation_id, project_id, user, evidence_id, evidence.PrivateStorage(settings)
    )
    return Response(
        content,
        media_type=content_type,
        headers={
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff",
            "Content-Disposition": f'attachment; filename="evidence-{evidence_id}.jpg"',
        },
    )


@app.get("/api/v1/organisations/{organisation_id}/projects/{project_id}/reviews")
def review_history(
    organisation_id: UUID,
    project_id: UUID,
    user: Annotated[UUID, Depends(current_user)],
    db: Annotated[Session, Depends(database_session)],
):
    return reviews.list_reviews(db, organisation_id, project_id, user)


@app.post("/api/v1/organisations/{organisation_id}/projects/{project_id}/reviews", status_code=201)
def save_option_review(
    organisation_id: UUID,
    project_id: UUID,
    data: reviews.ReviewInput,
    user: Annotated[UUID, Depends(current_user)],
    db: Annotated[Session, Depends(database_session)],
):
    return reviews.save_review(db, organisation_id, project_id, user, data)


@app.get("/api/v1/organisations/{organisation_id}/projects/{project_id}/history")
def brief_history(
    organisation_id: UUID,
    project_id: UUID,
    user: User,
    db: Database,
    offset: Annotated[int, Query(ge=0)] = 0,
):
    return projects.project_history(db, organisation_id, project_id, user, offset)


@app.post(
    "/api/v1/organisations/{organisation_id}/projects/{project_id}/history/{revision}/restore"
)
def brief_restore(
    organisation_id: UUID,
    project_id: UUID,
    revision: int,
    user: User,
    db: Database,
    expected_revision: Annotated[int, Query(ge=1)],
):
    return projects.restore_project(
        db, organisation_id, project_id, user, revision, expected_revision
    )


@app.get("/api/v1/profile")
def profile_get(user: User, db: Database):
    return administration.get_profile(db, user)


@app.put("/api/v1/profile")
def profile_save(data: administration.ProfileInput, user: User, db: Database):
    return administration.save_profile(db, user, data)


@app.get("/api/v1/organisations/{organisation_id}/settings")
def organisation_settings(organisation_id: UUID, user: User, db: Database):
    return administration.get_settings(db, organisation_id, user)


@app.put("/api/v1/organisations/{organisation_id}/settings")
def organisation_settings_save(
    organisation_id: UUID, data: administration.OrganisationInput, user: User, db: Database
):
    return administration.save_settings(db, organisation_id, user, data)


@app.get("/api/v1/organisations/{organisation_id}/members")
def members_get(organisation_id: UUID, user: User, db: Database):
    return administration.list_members(db, organisation_id, user)


@app.patch("/api/v1/organisations/{organisation_id}/members/{member_id}")
def member_update(
    organisation_id: UUID,
    member_id: UUID,
    data: administration.MemberInput,
    user: User,
    db: Database,
):
    return administration.update_member(db, organisation_id, user, member_id, data)


@app.get("/api/v1/organisations/{organisation_id}/administration-history")
def admin_history(organisation_id: UUID, user: User, db: Database):
    return administration.events(db, organisation_id, user)


@app.post("/api/v1/organisations/{organisation_id}/projects/{project_id}/rectangle-preview")
def rectangle_preview(
    organisation_id: UUID,
    project_id: UUID,
    data: workspace.RectangleInput,
    user: User,
    db: Database,
):
    try:
        return workspace.rectangle_preview(db, organisation_id, project_id, user, data)
    except ValueError as error:
        raise APIError(422, "rectangle_input", str(error)) from error


@app.patch("/api/v1/organisations/{organisation_id}/projects/{project_id}/evidence/{evidence_id}")
def evidence_edit(
    organisation_id: UUID,
    project_id: UUID,
    evidence_id: UUID,
    data: evidence.EvidenceUpdate,
    user: User,
    db: Database,
):
    return evidence.update_metadata(db, organisation_id, project_id, user, evidence_id, data)


@app.patch("/api/v1/organisations/{organisation_id}/rates/{rate_id}")
def rate_archive(
    organisation_id: UUID,
    rate_id: UUID,
    data: calculations.RateArchiveInput,
    user: User,
    db: Database,
):
    return calculations.archive_rate(db, organisation_id, user, rate_id, data)


@app.get("/api/v1/organisations/{organisation_id}/service-requests")
def service_requests(organisation_id: UUID, user: User, db: Database):
    return administration.service_requests(db, organisation_id, user)


@app.post("/api/v1/organisations/{organisation_id}/service-requests", status_code=201)
def service_request(
    organisation_id: UUID, data: administration.ServiceRequestInput, user: User, db: Database
):
    return administration.save_service_request(db, organisation_id, user, data)


@app.post(
    "/api/v1/organisations/{organisation_id}/service-requests/{request_id}/responses",
    status_code=201,
)
def service_response(
    organisation_id: UUID,
    request_id: UUID,
    data: administration.ServiceResponseInput,
    user: User,
    db: Database,
):
    return administration.save_service_request(db, organisation_id, user, data, request_id)


@app.get("/api/v1/organisations/{organisation_id}/projects/{project_id}/outputs/{artifact_id}/file")
def issued_status(
    organisation_id: UUID, project_id: UUID, artifact_id: UUID, user: User, db: Database
):
    from app import issued_files

    return issued_files.status(db, organisation_id, project_id, user, artifact_id)


@app.post(
    "/api/v1/organisations/{organisation_id}/projects/{project_id}/outputs/{artifact_id}/file"
)
def issued_retain(
    organisation_id: UUID,
    project_id: UUID,
    artifact_id: UUID,
    user: User,
    db: Database,
    pdf: Annotated[UploadFile, File()],
    manifest_hash: Annotated[str, Form(max_length=64)],
):
    from app import issued_files

    return issued_files.retain(
        db,
        organisation_id,
        project_id,
        user,
        artifact_id,
        pdf.file.read(issued_files.MAX_BYTES + 1),
        manifest_hash,
    )


@app.get(
    "/api/v1/organisations/{organisation_id}/projects/{project_id}/outputs/{artifact_id}/file/content"
)
def issued_download(
    organisation_id: UUID, project_id: UUID, artifact_id: UUID, user: User, db: Database
):
    from app import issued_files

    content, digest = issued_files.download(db, organisation_id, project_id, user, artifact_id)
    return Response(
        content,
        media_type="application/pdf",
        headers={
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff",
            "X-Content-SHA256": digest,
            "Content-Disposition": f'attachment; filename="issued-{artifact_id}.pdf"',
        },
    )


@app.get(
    "/api/v1/organisations/{organisation_id}/projects/{project_id}/estimates/{estimate_id}/readiness"
)
def estimate_ready(
    organisation_id: UUID,
    project_id: UUID,
    estimate_id: UUID,
    user: User,
    db: Database,
    valid_until: date | None = None,
):
    return calculations.estimate_readiness(
        db, organisation_id, project_id, user, estimate_id, valid_until
    )
