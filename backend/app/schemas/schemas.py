from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, EmailStr

# Auth Schemas
class UserCreate(BaseModel):
    email: EmailStr
    password: str
    full_name: str
    organization_name: str  # Creating a new org on signup for simplicity

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class UserResponse(BaseModel):
    id: int
    email: EmailStr
    full_name: Optional[str] = None
    is_active: bool
    organization_id: Optional[int] = None
    created_at: datetime

    class Config:
        from_attributes = True

class Token(BaseModel):
    access_token: str
    token_type: str

class TokenData(BaseModel):
    user_id: Optional[str] = None

# Document Schemas
class DocumentResponse(BaseModel):
    id: int
    filename: str
    file_type: str
    file_size: int
    status: str
    organization_id: int
    created_at: datetime

    class Config:
        from_attributes = True

# Audit Schemas
class AuditFindingResponse(BaseModel):
    id: int
    audit_id: int
    severity: str
    category: str
    title: str
    description: str
    original_value: Optional[str] = None
    proposed_value: Optional[str] = None
    status: str
    page_number: Optional[int] = None
    compliance_reference: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True

class AuditResponse(BaseModel):
    id: int
    document_id: int
    organization_id: int
    status: str
    compliance_score: float
    critical_findings_count: Optional[int] = None
    created_at: datetime
    completed_at: Optional[datetime] = None
    findings: List[AuditFindingResponse] = []

    class Config:
        from_attributes = True

# Agent run schemas
class AgentLogResponse(BaseModel):
    id: int
    log_level: str
    message: str
    agent_thought: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True

class AgentRunResponse(BaseModel):
    id: int
    agent_name: str
    status: str
    created_at: datetime
    completed_at: Optional[datetime] = None
    logs: List[AgentLogResponse] = []

    class Config:
        from_attributes = True

# HITL Schemas
class ApprovalRequestResponse(BaseModel):
    id: int
    audit_id: int
    finding_id: int
    status: str
    approver_notes: Optional[str] = None
    created_at: datetime
    resolved_at: Optional[datetime] = None
    finding: AuditFindingResponse

    class Config:
        from_attributes = True

class HITLDecision(BaseModel):
    request_id: int
    approve: bool
    notes: Optional[str] = None

# Compliance Schemas
class ComplianceRuleCreate(BaseModel):
    title: str
    category: str
    rule_text: str

class ComplianceRuleResponse(BaseModel):
    id: int
    title: str
    category: str
    rule_text: str
    organization_id: int
    created_at: datetime

    class Config:
        from_attributes = True

# Dashboard Stats Schema
class DashboardStats(BaseModel):
    documents_processed: int
    compliance_score: float
    active_audits: int
    critical_findings: int
    health_score: float
