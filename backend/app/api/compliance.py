from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from app.core.database import get_db
from app.api.deps import get_current_active_user
from app.models import User, ComplianceRule
from app.schemas import ComplianceRuleCreate, ComplianceRuleResponse
from app.services.vector_db import VectorDBService

router = APIRouter()

@router.post("/", response_model=ComplianceRuleResponse)
async def create_compliance_rule(
    rule_in: ComplianceRuleCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    # Save the rule as standard text DB entry
    rule = ComplianceRule(
        title=rule_in.title,
        category=rule_in.category,
        rule_text=rule_in.rule_text,
        organization_id=current_user.organization_id
    )
    db.add(rule)
    await db.commit()
    await db.refresh(rule)
    return rule

@router.get("/", response_model=List[ComplianceRuleResponse])
async def list_compliance_rules(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    result = await db.execute(
        select(ComplianceRule).where(ComplianceRule.organization_id == current_user.organization_id)
    )
    return result.scalars().all()
