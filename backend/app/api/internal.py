from fastapi import APIRouter, Depends, HTTPException, Header
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from app.core.database import get_db
from app.core.config import settings

router = APIRouter()

@router.post("/refresh-views")
async def refresh_materialized_views(
    x_cron_secret: str = Header(None),
    db: AsyncSession = Depends(get_db)
):
    """
    Internal Cron Endpoint for automatically refreshing PostGREST/FastAPI Materialized Views.
    Protected by x-cron-secret header for Render Background Cron jobs.
    """
    if not x_cron_secret or x_cron_secret != getattr(settings, "CRON_SECRET", "default-cron-secret"):
        raise HTTPException(status_code=403, detail="Forbidden: Invalid cron secret")
        
    try:
        await db.execute(text("REFRESH MATERIALIZED VIEW powerbi_audit_summary;"))
        await db.execute(text("REFRESH MATERIALIZED VIEW powerbi_mismatch_findings;"))
        await db.commit()
        return {"status": "success", "message": "Materialized views refreshed"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
