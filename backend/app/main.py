from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.core.database import engine
from app.models.base import Base
from app.api import auth, documents, audits, hitl, compliance
from app.websockets import router as ws_router

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Create tables in Supabase (or SQLite) if they don't exist yet
    async with engine.begin() as conn:
        # Enable pgvector extension on Supabase if it isn't enabled
        try:
            await conn.execute("CREATE EXTENSION IF NOT EXISTS vector;")
        except Exception:
            # If the DB doesn't support vector or user lacks privileges, fail silently
            # pgvector is pre-installed on Supabase so it should succeed.
            pass
        await conn.run_sync(Base.metadata.create_all)
    yield
    # Shutdown: Clean up connections
    await engine.dispose()

app = FastAPI(
    title=settings.PROJECT_NAME,
    openapi_url=f"{settings.API_V1_STR}/openapi.json",
    lifespan=lifespan
)

# Set CORS middleware rules
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://pulseapex1.vercel.app",
        "http://localhost:3000",
        "http://127.0.0.1:3000"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Connect Routers
app.include_router(auth.router, prefix=f"{settings.API_V1_STR}/auth", tags=["Authentication"])
app.include_router(documents.router, prefix=f"{settings.API_V1_STR}/documents", tags=["Documents"])
app.include_router(audits.router, prefix=f"{settings.API_V1_STR}/audits", tags=["Audit Workspace"])
app.include_router(hitl.router, prefix=f"{settings.API_V1_STR}/hitl", tags=["Human-in-the-Loop"])
app.include_router(compliance.router, prefix=f"{settings.API_V1_STR}/compliance", tags=["Compliance Policies"])
app.include_router(ws_router, tags=["WebSockets"])

@app.get("/")
def read_root():
    return {
        "status": "healthy",
        "service": settings.PROJECT_NAME,
        "message": "PulseApex Audit Network Backend is operational."
    }
