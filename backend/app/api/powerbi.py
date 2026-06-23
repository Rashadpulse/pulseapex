from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from app.core.database import get_db
from app.api.deps import get_current_active_user
from app.models import User

router = APIRouter()

@router.get("/audit-summary")
async def get_powerbi_audit_summary(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    REST Endpoint for Power BI Service to fetch aggregated audit compliance stats.
    Queries the PostgreSQL Materialized View to prevent heavy OLAP queries from crashing the production DB.
    """
    try:
        # Refresh the materialized view before querying
        await db.execute(text("REFRESH MATERIALIZED VIEW powerbi_audit_summary;"))
        await db.commit()
        
        result = await db.execute(
            text("SELECT * FROM powerbi_audit_summary WHERE organization_id = :org_id"),
            {"org_id": current_user.organization_id}
        )
        rows = result.fetchall()
        return [dict(row._mapping) for row in rows]
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch materialized view: {e}")

@router.get("/mismatch-findings")
async def get_powerbi_mismatch_findings(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    REST Endpoint for Power BI Service to fetch aggregated risk and mismatch anomalies.
    """
    try:
        await db.execute(text("REFRESH MATERIALIZED VIEW powerbi_mismatch_findings;"))
        await db.commit()
        
        result = await db.execute(
            text("SELECT * FROM powerbi_mismatch_findings WHERE organization_id = :org_id"),
            {"org_id": current_user.organization_id}
        )
        rows = result.fetchall()
        return [dict(row._mapping) for row in rows]
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch materialized view: {e}")
