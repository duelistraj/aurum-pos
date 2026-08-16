import logging
import time
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import UTC, datetime, timedelta
from pathlib import Path
from uuid import uuid4

from fastapi import Depends, FastAPI, HTTPException, Query, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import select, text

from app.core.config import settings
from app.core.database import engine, get_db
from app.core.health import WorkerHeartbeat
from app.core.logging import configure_logging
from app.modules.auth.dependencies import RequireCashier
from app.modules.auth.routes import router as auth_router
from app.modules.billing.routes import router as billing_router
from app.modules.changelog.routes import router as changelog_router
from app.modules.dashboard.routes import router as dashboard_router
from app.modules.items.routes import router as item_router
from app.modules.metal_rates.routes import router as metal_rate_router
from app.modules.sales.routes import router as sales_router
from app.modules.shops.routes import (
    organizations_router,
)
from app.modules.shops.routes import (
    router as shops_router,
)
from app.modules.storefront.routes import router as storefront_router
from app.modules.subscriptions.routes import router as subscriptions_router
from app.modules.whatsapp.routes import protected_router as whatsapp_router
from app.modules.whatsapp.routes import webhook_router as whatsapp_webhook_router
from app.version import APP_VERSION


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    yield
    await engine.dispose()


configure_logging()
LOGGER = logging.getLogger("aurum.api")

app = FastAPI(
    title=settings.app_name,
    version=APP_VERSION,
    lifespan=lifespan,
)
SITE_DIRECTORY = Path(__file__).resolve().parent.parent / "site"
app.mount(
    "/public-assets",
    StaticFiles(directory=SITE_DIRECTORY / "public-assets"),
    name="public-assets",
)


@app.middleware("http")
async def request_observability(request: Request, call_next):
    supplied_request_id = request.headers.get("X-Request-ID")
    request_id = (
        supplied_request_id
        if supplied_request_id and len(supplied_request_id) <= 128
        else str(uuid4())
    )
    started = time.perf_counter()
    try:
        response = await call_next(request)
    except Exception:
        LOGGER.exception(
            "request_failed",
            extra={
                "request_id": request_id,
                "method": request.method,
                "path": request.url.path,
                "status_code": 500,
                "duration_ms": round((time.perf_counter() - started) * 1000, 2),
            },
        )
        raise
    duration_ms = round((time.perf_counter() - started) * 1000, 2)
    response.headers["X-Request-ID"] = request_id
    if request.url.path.startswith(API_PREFIX):
        response.headers["Cache-Control"] = "no-store"
    LOGGER.info(
        "request_completed",
        extra={
            "request_id": request_id,
            "method": request.method,
            "path": request.url.path,
            "status_code": response.status_code,
            "duration_ms": duration_ms,
        },
    )
    return response


# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=list(settings.cors_origins),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

API_PREFIX = "/api/v1"

app.include_router(auth_router, prefix=API_PREFIX)
app.include_router(shops_router, prefix=API_PREFIX)
app.include_router(organizations_router, prefix=API_PREFIX)
app.include_router(subscriptions_router, prefix=API_PREFIX)
app.include_router(billing_router, prefix=API_PREFIX)
app.include_router(whatsapp_webhook_router, prefix=API_PREFIX)
app.include_router(storefront_router, prefix=API_PREFIX)

# Protect all other routers
protected_dependencies = [RequireCashier]
app.include_router(item_router, prefix=API_PREFIX, dependencies=protected_dependencies)
app.include_router(sales_router, prefix=API_PREFIX, dependencies=protected_dependencies)
app.include_router(metal_rate_router, prefix=API_PREFIX, dependencies=protected_dependencies)
app.include_router(dashboard_router, prefix=API_PREFIX, dependencies=protected_dependencies)
app.include_router(changelog_router, prefix=API_PREFIX, dependencies=protected_dependencies)
app.include_router(whatsapp_router, prefix=API_PREFIX, dependencies=protected_dependencies)


@app.get("/", tags=["Health"])
@app.get("/health/live", tags=["Health"])
async def health() -> dict[str, str]:
    return {
        "status": "ok",
        "app": settings.app_name,
        "env": settings.env,
    }


@app.get("/reset-password.html", include_in_schema=False)
async def reset_password_page() -> FileResponse:
    return FileResponse(SITE_DIRECTORY / "reset-password.html")


@app.get("/verify-email.html", include_in_schema=False)
async def verify_email_page() -> FileResponse:
    return FileResponse(SITE_DIRECTORY / "verify-email.html")


@app.get("/account-deletion.html", include_in_schema=False)
async def account_deletion_page() -> FileResponse:
    return FileResponse(SITE_DIRECTORY / "account-deletion.html")


@app.get("/health/ready", tags=["Health"])
async def readiness(db=Depends(get_db)) -> dict[str, str]:
    await db.execute(text("SELECT 1"))
    return {"status": "ready"}


@app.get("/health/worker", tags=["Health"])
async def worker_readiness(
    worker_id: str | None = Query(default=None, max_length=100),
    db=Depends(get_db),
) -> dict[str, str]:
    if worker_id:
        heartbeat = await db.get(WorkerHeartbeat, worker_id)
    else:
        heartbeat = await db.scalar(
            select(WorkerHeartbeat)
            .where(WorkerHeartbeat.revision == settings.git_sha)
            .order_by(WorkerHeartbeat.last_seen_at.desc())
            .limit(1)
        )
    if (
        heartbeat is None
        or heartbeat.status != "running"
        or heartbeat.last_seen_at < datetime.now(UTC) - timedelta(seconds=60)
    ):
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Worker heartbeat is stale",
        )
    queue_health = (
        await db.execute(
            text(
                """
                SELECT
                    LEAST(
                        (
                            SELECT MIN(created_at)
                            FROM email_outbox
                            WHERE status IN ('pending', 'processing')
                        ),
                        (
                            SELECT MIN(created_at)
                            FROM invoice_jobs
                            WHERE status IN ('pending', 'processing')
                        ),
                        (
                            SELECT MIN(created_at)
                            FROM whatsapp_delivery_jobs
                            WHERE status IN ('pending', 'processing')
                        )
                    ) AS oldest_pending_at,
                    (
                        SELECT COUNT(*)
                        FROM email_outbox
                        WHERE status = 'failed'
                    ) + (
                        SELECT COUNT(*)
                        FROM invoice_jobs
                        WHERE status = 'failed'
                    ) + (
                        SELECT COUNT(*)
                        FROM whatsapp_delivery_jobs
                        WHERE status IN ('failed', 'unknown')
                    ) AS terminal_failures
                """
            )
        )
    ).one()
    return {
        "status": "ready",
        "worker_id": heartbeat.worker_name,
        "revision": heartbeat.revision,
        "last_seen_at": heartbeat.last_seen_at.isoformat(),
        "oldest_pending_at": (
            queue_health.oldest_pending_at.isoformat()
            if queue_health.oldest_pending_at is not None
            else ""
        ),
        "terminal_failures": str(queue_health.terminal_failures),
    }


@app.get(f"{API_PREFIX}/version", tags=["About"])
async def version() -> dict[str, str]:
    revision = settings.git_sha
    source = (
        settings.source_repository_url
        if revision == "development"
        else f"{settings.source_repository_url}/tree/{revision}"
    )
    return {
        "version": app.version,
        "revision": revision,
        "image_digest": settings.aurum_image_digest,
        "config_revision": settings.aurum_config_revision,
        "license": "AGPL-3.0-only",
        "source": source,
        "deployment_mode": settings.deployment_mode,
    }
