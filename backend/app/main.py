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
    allow_origins=settings.BACKEND_CORS_ORIGINS,
    allow_origin_regex=r"https://.*\.vercel\.app|http://localhost:3000|http://127\.0\.0\.1:3000",
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

@app.get("/debug-db")
async def debug_db():
    from app.core.database import engine
    from sqlalchemy import text
    import traceback
    try:
        async with engine.connect() as conn:
            result = await conn.execute(text("SELECT 1;"))
            val = result.scalar()
            
            # Check tables
            tables_res = await conn.execute(text(
                "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';"
            ))
            tables = [row[0] for row in tables_res.fetchall()]
            
            return {
                "status": "connected",
                "select_1": val,
                "tables": tables
            }
    except Exception as e:
        return {
            "status": "error",
            "error_type": str(type(e)),
            "error_message": str(e),
            "traceback": traceback.format_exc()
        }

@app.get("/debug-register")
async def debug_register(email: str = "test_debug@gmail.com"):
    from app.core.database import AsyncSessionLocal
    from app.models import User, Organization, Role
    from app.core.security import get_password_hash
    from sqlalchemy.future import select
    import traceback
    import random
    
    steps = {}
    try:
        async with AsyncSessionLocal() as db:
            # Step 1: ensure default roles
            steps["1_ensure_roles"] = "start"
            roles = ["admin", "auditor", "user"]
            for role_name in roles:
                result = await db.execute(select(Role).where(Role.name == role_name))
                db_role = result.scalars().first()
                if not db_role:
                    db_role = Role(name=role_name, description=f"Default {role_name} role")
                    db.add(db_role)
            await db.commit()
            steps["1_ensure_roles"] = "success"
            
            # Step 2: check user exists
            steps["2_check_user"] = "start"
            rand_email = f"debug_{random.randint(1000, 9999)}_{email}"
            result = await db.execute(select(User).where(User.email == rand_email))
            user = result.scalars().first()
            steps["2_check_user"] = "success"
            
            # Step 3: get or create org
            steps["3_create_org"] = "start"
            org_name = f"Debug Org {random.randint(1000, 9999)}"
            org = Organization(
                name=org_name,
                slug=org_name.lower().replace(" ", "-")
            )
            db.add(org)
            await db.commit()
            await db.refresh(org)
            steps["3_create_org"] = f"success (id={org.id})"
            
            # Step 4: get admin role
            steps["4_get_role"] = "start"
            result = await db.execute(select(Role).where(Role.name == "admin"))
            role = result.scalars().first()
            steps["4_get_role"] = f"success (id={role.id if role else None})"
            
            # Step 5: create user
            steps["5_create_user"] = "start"
            db_user = User(
                email=rand_email,
                hashed_password=get_password_hash("testpass123"),
                full_name="Debug User",
                is_active=True,
                role_id=role.id if role else None,
                organization_id=org.id,
            )
            db.add(db_user)
            await db.commit()
            await db.refresh(db_user)
            steps["5_create_user"] = f"success (id={db_user.id})"
            
            return {
                "status": "success",
                "steps": steps,
                "user_id": db_user.id
            }
    except Exception as e:
        return {
            "status": "error",
            "failed_at_step": list(steps.keys())[-1] if steps else "none",
            "error_type": str(type(e)),
            "error_message": str(e),
            "traceback": traceback.format_exc(),
            "steps_state": steps
        }
