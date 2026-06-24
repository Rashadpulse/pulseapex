import os
import shutil
from typing import List
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from app.core.database import get_db
from app.api.deps import get_current_active_user
from app.models import User, ComplianceRule
from app.schemas import ComplianceRuleCreate, ComplianceRuleResponse
from app.services.vector_db import VectorDBService
from app.services.parser import DocumentParserService

router = APIRouter()

STORAGE_DIR = os.path.join(os.getcwd(), "storage", "rulebooks")
os.makedirs(STORAGE_DIR, exist_ok=True)

@router.post("", response_model=ComplianceRuleResponse)
async def create_compliance_rule(
    rule_in: ComplianceRuleCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    # Ingest the rule (chunks it, generates mock/real embeddings and saves to DB)
    rule = await VectorDBService.ingest_rule(
        db=db,
        org_id=current_user.organization_id,
        title=rule_in.title,
        category=rule_in.category,
        rule_text=rule_in.rule_text
    )
    return rule

@router.post("/upload", response_model=ComplianceRuleResponse)
async def upload_compliance_rule(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    org_dir = os.path.join(STORAGE_DIR, str(current_user.organization_id))
    os.makedirs(org_dir, exist_ok=True)
    
    file_path = os.path.join(org_dir, file.filename)
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
        
    ext = os.path.splitext(file.filename)[1].lower().replace(".", "").upper()
    
    # Extract text using parser
    rule_text = DocumentParserService.parse_document(file_path, ext)
    
    # Truncate if massive
    if len(rule_text) > 50000:
        rule_text = rule_text[:50000]
        
    # Ingest the rule
    rule = await VectorDBService.ingest_rule(
        db=db,
        org_id=current_user.organization_id,
        title=file.filename,
        category="Uploaded Policy",
        rule_text=rule_text
    )
    
    return rule

@router.get("", response_model=List[ComplianceRuleResponse])
async def list_compliance_rules(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    result = await db.execute(
        select(ComplianceRule).where(ComplianceRule.organization_id == current_user.organization_id)
    )
    return result.scalars().all()
