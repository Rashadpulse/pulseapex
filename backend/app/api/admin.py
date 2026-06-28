from typing import List, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Header, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import update, desc
from app.core.database import get_db
from app.core.config import settings
from app.models import Organization, Document, SystemConfig, HumanCorrectionVector, Audit

router = APIRouter()

async def verify_admin_token(x_admin_token: str = Header(None)):
    if not x_admin_token or x_admin_token != settings.ADMIN_PASSWORD:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid or missing Admin Token"
        )
    return True

@router.get("/organizations", dependencies=[Depends(verify_admin_token)])
async def get_organizations(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Organization).order_by(Organization.name))
    orgs = result.scalars().all()
    return [{"id": o.id, "name": o.name, "is_active": o.is_active} for o in orgs]

@router.patch("/organizations/{org_id}/status", dependencies=[Depends(verify_admin_token)])
async def update_organization_status(org_id: int, payload: Dict[str, bool], db: AsyncSession = Depends(get_db)):
    is_active = payload.get("is_active")
    if is_active is None:
        raise HTTPException(status_code=400, detail="Missing 'is_active' in payload")
    
    result = await db.execute(select(Organization).where(Organization.id == org_id))
    org = result.scalars().first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
        
    org.is_active = is_active
    await db.commit()
    return {"id": org.id, "is_active": org.is_active}

@router.get("/config", dependencies=[Depends(verify_admin_token)])
async def get_system_config(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(SystemConfig))
    configs = result.scalars().all()
    return {c.config_key: c.config_value for c in configs}

@router.patch("/config", dependencies=[Depends(verify_admin_token)])
async def update_system_config(payload: Dict[str, str], db: AsyncSession = Depends(get_db)):
    for key, value in payload.items():
        result = await db.execute(select(SystemConfig).where(SystemConfig.config_key == key))
        config = result.scalars().first()
        if config:
            config.config_value = str(value)
        else:
            new_config = SystemConfig(config_key=key, config_value=str(value))
            db.add(new_config)
    await db.commit()
    return {"status": "updated"}

@router.get("/queue", dependencies=[Depends(verify_admin_token)])
async def get_priority_queue(db: AsyncSession = Depends(get_db)):
    # Fetch pending documents/audits ordered by priority desc
    result = await db.execute(
        select(Document).where(Document.status.in_(["uploaded", "parsing"])).order_by(desc(Document.priority), Document.created_at)
    )
    docs = result.scalars().all()
    return [{"id": d.id, "filename": d.filename, "status": d.status, "priority": d.priority} for d in docs]

@router.patch("/queue/{doc_id}/priority", dependencies=[Depends(verify_admin_token)])
async def boost_priority(doc_id: int, payload: Dict[str, int], db: AsyncSession = Depends(get_db)):
    priority = payload.get("priority", 10)
    result = await db.execute(select(Document).where(Document.id == doc_id))
    doc = result.scalars().first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    
    doc.priority = priority
    await db.commit()
    return {"id": doc.id, "priority": doc.priority}

@router.get("/telemetry", dependencies=[Depends(verify_admin_token)])
async def get_telemetry():
    # Mocking telemetry data for now
    return {
        "token_burn": {
            "labels": ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
            "data": [12000, 19000, 15000, 22000, 18000, 10000, 14000]
        },
        "api_costs": {
            "labels": ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
            "data": [12.5, 19.2, 15.1, 22.8, 18.3, 10.0, 14.2]
        }
    }

@router.get("/rag-memory", dependencies=[Depends(verify_admin_token)])
async def get_rag_memory(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(HumanCorrectionVector).order_by(desc(HumanCorrectionVector.created_at)).limit(50))
    logs = result.scalars().all()
    return [
        {
            "id": l.id,
            "original_anomaly": l.original_anomaly,
            "human_correction": l.human_correction,
            "confidence_at_time": l.confidence_at_time,
            "created_at": l.created_at
        } for l in logs
    ]
