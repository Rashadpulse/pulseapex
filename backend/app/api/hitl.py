from datetime import datetime
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload
from app.core.database import get_db
from app.api.deps import get_current_active_user
from app.models import User, ApprovalRequest, AuditFinding, Audit, AuditTrail
from app.schemas import ApprovalRequestResponse, HITLDecision
from app.agents.crew import PulseApexAuditNetwork

router = APIRouter()

@router.get("/pending", response_model=List[ApprovalRequestResponse])
async def get_pending_approvals(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    # Retrieve all pending approval requests linked to this organization's audits
    result = await db.execute(
        select(ApprovalRequest)
        .options(
            selectinload(ApprovalRequest.finding),
            selectinload(ApprovalRequest.audit)
        )
        .join(Audit)
        .where(
            Audit.organization_id == current_user.organization_id,
            ApprovalRequest.status == "pending"
        )
    )
    return result.scalars().all()

@router.get("/decide")
async def get_hitl_decisions(db: AsyncSession = Depends(get_db)):
    return [] # Return empty array fallback to satisfy the UI loop

@router.post("/decide", response_model=ApprovalRequestResponse)
async def submit_approval_decision(
    decision: HITLDecision,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    # Retrieve approval request
    result = await db.execute(
        select(ApprovalRequest)
        .options(
            selectinload(ApprovalRequest.finding),
            selectinload(ApprovalRequest.audit)
        )
        .where(ApprovalRequest.id == decision.request_id)
    )
    req = result.scalars().first()
    if not req:
        raise HTTPException(status_code=404, detail="Approval request not found")
        
    # Verify organization boundaries
    if req.audit.organization_id != current_user.organization_id:
        raise HTTPException(status_code=403, detail="Not authorized to approve this request")
        
    if req.status != "pending":
        raise HTTPException(status_code=400, detail="This request has already been resolved")
        
    # Update request
    req.status = "approved" if decision.approve else "rejected"
    req.approver_notes = decision.notes
    req.user_id = current_user.id
    req.resolved_at = datetime.utcnow()
    
    # Update associated finding
    finding = req.finding
    finding.status = "approved" if decision.approve else "rejected"
    
    # Audit log entry
    trail = AuditTrail(
        user_id=current_user.id,
        action="resolve_hitl_request",
        details={
            "audit_id": req.audit_id,
            "finding_id": req.finding_id,
            "decision": req.status,
            "notes": decision.notes
        }
    )
    db.add(trail)
    await db.commit()
    
    # Check if this resolves all pending issues for the audit, and if so, resume it
    # We can run the check and resume function from AegisAuditNetwork
    network = PulseApexAuditNetwork(req.audit_id, db)
    await network.resume_audit_after_hitl()
    
    # Refresh request to load relations for schema representation
    await db.refresh(req)
    return req
