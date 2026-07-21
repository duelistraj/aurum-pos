from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.core.config import settings
from app.core.database import engine, get_db
from app.modules.auth.dependencies import RequireCashier
from app.modules.auth.routes import router as auth_router
from app.modules.billing.routes import router as billing_router
from app.modules.changelog.routes import router as changelog_router
from app.modules.dashboard.routes import router as dashboard_router
from app.modules.items.routes import router as item_router
from app.modules.metal_rates.routes import router as metal_rate_router
from app.modules.sales.routes import router as sales_router
from app.modules.shops.routes import router as shops_router
from app.modules.subscriptions.routes import router as subscriptions_router


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    yield
    await engine.dispose()


app = FastAPI(
    title=settings.app_name,
    version="0.1.0",
    lifespan=lifespan,
)

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
app.include_router(subscriptions_router, prefix=API_PREFIX)
app.include_router(billing_router, prefix=API_PREFIX)

# Protect all other routers
protected_dependencies = [RequireCashier]
app.include_router(item_router, prefix=API_PREFIX, dependencies=protected_dependencies)
app.include_router(sales_router, prefix=API_PREFIX, dependencies=protected_dependencies)
app.include_router(metal_rate_router, prefix=API_PREFIX, dependencies=protected_dependencies)
app.include_router(dashboard_router, prefix=API_PREFIX, dependencies=protected_dependencies)
app.include_router(changelog_router, prefix=API_PREFIX, dependencies=protected_dependencies)


@app.get("/", tags=["Health"])
@app.get("/health/live", tags=["Health"])
async def health() -> dict[str, str]:
    return {
        "status": "ok",
        "app": settings.app_name,
        "env": settings.env,
    }


@app.get("/health/ready", tags=["Health"])
async def readiness(db=Depends(get_db)) -> dict[str, str]:
    await db.execute(text("SELECT 1"))
    return {"status": "ready"}


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
        "license": "AGPL-3.0-only",
        "source": source,
        "deployment_mode": settings.deployment_mode,
    }
