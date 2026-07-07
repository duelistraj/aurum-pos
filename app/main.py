from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from app.core.config import settings
from app.core.database import engine
from app.modules.items.routes import router as item_router
from app.modules.sales.routes import router as sales_router
from app.modules.metal_rates.routes import router as metal_rate_router
from app.modules.invoices.routes import router as invoice_router
from app.modules.dashboard.routes import router as dashboard_router
from app.modules.changelog.routes import router as changelog_router
from app.modules.auth.routes import router as auth_router
from app.modules.auth.dependencies import RequireAuth


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    yield
    # Shutdown
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

app.include_router(auth_router)

# Protect all other routers
protected_dependencies = [RequireAuth]
app.include_router(item_router, dependencies=protected_dependencies)
app.include_router(sales_router, dependencies=protected_dependencies)
app.include_router(metal_rate_router, dependencies=protected_dependencies)
app.include_router(dashboard_router, dependencies=protected_dependencies)
app.include_router(changelog_router, dependencies=protected_dependencies)
app.include_router(invoice_router, dependencies=protected_dependencies)


@app.get("/", tags=["Health"])
async def health():
    return {
        "status": "ok",
        "app": settings.app_name,
        "env": settings.env,
    }
