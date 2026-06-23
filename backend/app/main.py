from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.core.database import engine
from app.models.base import Base
from app.api import auth, documents, audits, hitl, compliance, powerbi, internal
from app.websockets import router as ws_router

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Validate essential configuration variables on startup
    import logging
    logger = logging.getLogger("uvicorn.error")
    missing_vars = []
    
    if not settings.DATABASE_URL:
        missing_vars.append("DATABASE_URL")
    if not settings.SECRET_KEY:
        missing_vars.append("SECRET_KEY")
    if settings.SECRET_KEY == "super-secret-aegis-ai-cryptographic-security-key-change-in-production":
        logger.warning("Using default or placeholder SECRET_KEY. It is highly recommended to set a custom key in production.")
        
    if missing_vars:
        err_msg = f"CRITICAL Startup Failure: Missing essential environment variables: {', '.join(missing_vars)}"
        logger.error(err_msg)
        raise RuntimeError(err_msg)

    # Startup: Create tables in Supabase (or SQLite) if they don't exist yet
    try:
        async with engine.begin() as conn:
            # Enable pgvector extension on Supabase if it isn't enabled
            try:
                from sqlalchemy import text
                await conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector;"))
            except Exception:
                pass
                
            await conn.run_sync(Base.metadata.create_all)
            
            try:
                # Ensure missing columns exist in older database tables (Render deployments)
                await conn.execute(text("ALTER TABLE audit_findings ADD COLUMN IF NOT EXISTS ai_confidence_score FLOAT;"))
                
                # Phase 4: Create Materialized Views for Power BI REST API Integration
                await conn.execute(text("""
                CREATE MATERIALIZED VIEW IF NOT EXISTS powerbi_audit_summary AS
                SELECT 
                    organization_id,
                    COUNT(id) as total_audits,
                    AVG(compliance_score) as avg_compliance_score,
                    SUM(critical_findings_count) as total_critical_findings
                FROM audits
                GROUP BY organization_id;
                """))
                
                await conn.execute(text("""
                CREATE MATERIALIZED VIEW IF NOT EXISTS powerbi_mismatch_findings AS
                SELECT 
                    a.organization_id,
                    f.id as finding_id,
                    f.severity,
                    f.category,
                    f.status,
                    f.ai_confidence_score
                FROM audit_findings f
                JOIN audits a ON f.audit_id = a.id
                WHERE f.severity IN ('high', 'critical');
                """))
            except Exception as e:
                # If the DB doesn't support vector or user lacks privileges, fail silently
                logger.error(f"Failed to initialize extensions or views: {e}")
        logger.info("Database Connection, Migrations, and Materialized Views Successful")
    except Exception as e:
        logger.error(f"Database Connection Failed: {str(e)}")
    yield
    # Shutdown: Clean up connections
    await engine.dispose()

app = FastAPI(
    title=settings.PROJECT_NAME,
    openapi_url=f"{settings.API_V1_STR}/openapi.json",
    lifespan=lifespan,
    redirect_slashes=False
)

# Set CORS middleware rules
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://pulseapex1.vercel.app",
        "http://localhost:3000",
        "http://127.0.0.1:3000"
    ],
    allow_origin_regex=r"https://.*\.vercel\.app|http://localhost:3000|http://127\.0\.0\.1:3000",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Custom global 404 handler for undefined routes
@app.exception_handler(404)
async def custom_404_handler(request: Request, exc: Exception):
    return JSONResponse(
        status_code=404,
        content={
            "detail": "Requested endpoint not found. Please verify the API route prefix (e.g. /api/v1/...) and request path."
        }
    )

# Connect Routers
app.include_router(auth.router, prefix=f"{settings.API_V1_STR}/auth", tags=["Authentication"])
app.include_router(documents.router, prefix=f"{settings.API_V1_STR}/documents", tags=["Documents"])
app.include_router(audits.router, prefix=f"{settings.API_V1_STR}/audits", tags=["Audit Workspace"])
app.include_router(hitl.router, prefix=f"{settings.API_V1_STR}/hitl", tags=["Human-in-the-Loop"])
app.include_router(compliance.router, prefix=f"{settings.API_V1_STR}/compliance", tags=["Compliance Policies"])
app.include_router(powerbi.router, prefix=f"{settings.API_V1_STR}/powerbi", tags=["Power BI Export"])
app.include_router(internal.router, prefix=f"{settings.API_V1_STR}/internal", tags=["Internal Cron"])
app.include_router(ws_router, tags=["WebSockets"])

@app.get("/")
def read_root():
    return {
        "status": "healthy",
        "service": settings.PROJECT_NAME,
        "message": "PulseApex Audit Network Backend is operational."
    }
