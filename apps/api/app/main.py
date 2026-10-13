import logging
import re
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

from app import administration, calculations, evidence, projects, reviews, workspace
from app.auth import TokenVerifier, current_user, get_verifier
from app.body_limit import BodyLimit
from app.config import Settings, get_settings
from app.db import database_session, engine_for
from app.errors import APIError
from app.schemas import ProjectCreate, ProjectList, ProjectResponse, ProjectUpdate, SessionResponse

logger = logging.getLogger("infrashader.requests")
app = FastAPI(title="InfraShader API", version="0.1.0", docs_url="/api/docs")
app.add_middleware(BodyLimit)
app.add_middleware(
    CORSMiddleware,
    allow_origins=get_settings().cors_origins,
    allow_methods=["GET", "POST", "PATCH", "OPTIONS"],
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
    sort: Literal["updated", "name", "created"] = "updated",
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
):
    return projects.list_projects(db, organisation_id, user, archived, limit, offset, query, sort)


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


@app.get("/api/v1/organisations/{organisation_id}/rates")
def rates_get(
    organisation_id: UUID,
    user: User,
    db: Database,
    query: Annotated[str, Query(max_length=160)] = "",
    category: Annotated[str, Query(max_length=80)] = "",
    archived: bool = False,
    unit: Literal["m2", "m", "item"] | None = None,
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
    organisation_id: UUID, project_id: UUID, data: calculations.IssueInput, user: User, db: Database
):
    return calculations.issue_snapshot(
        db, organisation_id, project_id, user, data, "developer_brief"
    )


@app.post(
    "/api/v1/organisations/{organisation_id}/projects/{project_id}/proposals", status_code=201
)
def proposal_create(
    organisation_id: UUID, project_id: UUID, data: calculations.IssueInput, user: User, db: Database
):
    return calculations.issue_snapshot(db, organisation_id, project_id, user, data, "proposal")


@app.post("/api/v1/organisations/{organisation_id}/projects/{project_id}/output-preview")
def output_preview(
    organisation_id: UUID,
    project_id: UUID,
    data: calculations.IssueInput,
    kind: Literal["developer_brief", "proposal"],
    user: User,
    db: Database,
):
    return calculations.issue_snapshot(
        db, organisation_id, project_id, user, data, kind, preview=True
    )


@app.get("/api/v1/organisations/{organisation_id}/projects/{project_id}/evidence")
def evidence_list(organisation_id: UUID, project_id: UUID, user: User, db: Database):
    return evidence.list_evidence(db, organisation_id, project_id, user)


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
