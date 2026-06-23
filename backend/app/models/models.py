from datetime import datetime
from typing import List, Optional
from sqlalchemy import (
    Column, Integer, String, Boolean, DateTime, ForeignKey, 
    Text, JSON, Float, Table, Index
)
from sqlalchemy.orm import relationship, Mapped, mapped_column
from pgvector.sqlalchemy import Vector
from app.models.base import Base

# Many-to-many relationship helper table for roles and permissions
role_permissions = Table(
    "role_permissions",
    Base.metadata,
    Column("role_id", Integer, ForeignKey("roles.id", ondelete="CASCADE"), primary_key=True),
    Column("permission_id", Integer, ForeignKey("permissions.id", ondelete="CASCADE"), primary_key=True)
)

class Organization(Base):
    __tablename__ = "organizations"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False, unique=True)
    slug = Column(String(255), nullable=False, unique=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    users = relationship("User", back_populates="organization")
    documents = relationship("Document", back_populates="organization")
    compliance_rules = relationship("ComplianceRule", back_populates="organization")
    audits = relationship("Audit", back_populates="organization")

class Role(Base):
    __tablename__ = "roles"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), unique=True, nullable=False)
    description = Column(String(255))
    
    # Relationships
    users = relationship("User", back_populates="role")
    permissions = relationship("Permission", secondary=role_permissions, back_populates="roles")

class Permission(Base):
    __tablename__ = "permissions"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), unique=True, nullable=False)  # e.g., "document:upload", "audit:approve"
    description = Column(String(255))

    # Relationships
    roles = relationship("Role", secondary=role_permissions, back_populates="permissions")

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), unique=True, nullable=False, index=True)
    hashed_password = Column(String(255), nullable=False)
    full_name = Column(String(255))
    is_active = Column(Boolean, default=True)
    is_mfa_enabled = Column(Boolean, default=False)
    mfa_secret = Column(String(255), nullable=True)
    role_id = Column(Integer, ForeignKey("roles.id"))
    organization_id = Column(Integer, ForeignKey("organizations.id"))
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    organization = relationship("Organization", back_populates="users")
    role = relationship("Role", back_populates="users")
    sessions = relationship("Session", back_populates="user")
    audit_trails = relationship("AuditTrail", back_populates="user")
    approval_requests = relationship("ApprovalRequest", back_populates="user")

class Document(Base):
    __tablename__ = "documents"

    id = Column(Integer, primary_key=True, index=True)
    filename = Column(String(255), nullable=False)
    file_type = Column(String(50), nullable=False)  # PDF, DOCX, XLSX, CSV, TXT
    file_size = Column(Integer, nullable=False)  # in bytes
    storage_path = Column(String(555), nullable=False)
    status = Column(String(50), default="uploaded")  # uploaded, parsing, audited, failed
    organization_id = Column(Integer, ForeignKey("organizations.id"))
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    organization = relationship("Organization", back_populates="documents")
    versions = relationship("DocumentVersion", back_populates="document", cascade="all, delete-orphan")
    audits = relationship("Audit", back_populates="document", cascade="all, delete-orphan")

class DocumentVersion(Base):
    __tablename__ = "document_versions"

    id = Column(Integer, primary_key=True, index=True)
    document_id = Column(Integer, ForeignKey("documents.id", ondelete="CASCADE"), nullable=False)
    version_number = Column(Integer, nullable=False)
    storage_path = Column(String(555), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    document = relationship("Document", back_populates="versions")

class ComplianceRule(Base):
    __tablename__ = "compliance_rules"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(255), nullable=False)
    category = Column(String(100), nullable=False)  # Tax, Contract, Procurement, General
    rule_text = Column(Text, nullable=False)
    organization_id = Column(Integer, ForeignKey("organizations.id"))
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    organization = relationship("Organization", back_populates="compliance_rules")
    embeddings = relationship("EmbeddingsMetadata", back_populates="compliance_rule", cascade="all, delete-orphan")

class EmbeddingsMetadata(Base):
    __tablename__ = "embeddings_metadata"

    id = Column(Integer, primary_key=True, index=True)
    compliance_rule_id = Column(Integer, ForeignKey("compliance_rules.id", ondelete="CASCADE"), nullable=False)
    chunk_index = Column(Integer, nullable=False)
    chunk_text = Column(Text, nullable=False)
    # Using 1536 dimensional vectors for OpenAI / Gemini compatibility
    embedding = Column(Vector(1536), nullable=True) 
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    compliance_rule = relationship("ComplianceRule", back_populates="embeddings")

    # Add index for vector similarity search (L2 distance or Cosine distance)
    # In pgvector, HNSW or IVFFlat indexes are commonly used.
    # We will declare this as a standard database index
    __table_args__ = (
        Index("idx_embeddings_rule_id", "compliance_rule_id"),
    )

class Audit(Base):
    __tablename__ = "audits"

    id = Column(Integer, primary_key=True, index=True)
    document_id = Column(Integer, ForeignKey("documents.id", ondelete="CASCADE"), nullable=False)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False)
    status = Column(String(50), default="pending")  # pending, running, paused, completed, failed
    compliance_score = Column(Float, default=100.0)
    critical_findings_count = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)

    # Relationships
    document = relationship("Document", back_populates="audits")
    organization = relationship("Organization", back_populates="audits")
    findings = relationship("AuditFinding", back_populates="audit", cascade="all, delete-orphan")
    data_quality_reports = relationship("DataQualityReport", back_populates="audit", cascade="all, delete-orphan")
    mismatch_reports = relationship("MismatchReport", back_populates="audit", cascade="all, delete-orphan")
    compliance_violations = relationship("ComplianceViolation", back_populates="audit", cascade="all, delete-orphan")
    agent_runs = relationship("AgentRun", back_populates="audit", cascade="all, delete-orphan")
    approval_requests = relationship("ApprovalRequest", back_populates="audit", cascade="all, delete-orphan")

class AuditFinding(Base):
    __tablename__ = "audit_findings"

    id = Column(Integer, primary_key=True, index=True)
    audit_id = Column(Integer, ForeignKey("audits.id", ondelete="CASCADE"), nullable=False)
    severity = Column(String(50), nullable=False)  # critical, high, medium, low
    category = Column(String(100), nullable=False)  # signature, transaction, risk, inconsistency
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=False)
    original_value = Column(Text, nullable=True)
    proposed_value = Column(Text, nullable=True)
    status = Column(String(50), default="unresolved")  # unresolved, approved, rejected, resolved
    page_number = Column(Integer, nullable=True)
    compliance_reference = Column(String(255), nullable=True)  # reference to policy rule
    ai_confidence_score = Column(Float, nullable=True)  # e.g., 85.5
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    audit = relationship("Audit", back_populates="findings")

class AgentRun(Base):
    __tablename__ = "agent_runs"

    id = Column(Integer, primary_key=True, index=True)
    audit_id = Column(Integer, ForeignKey("audits.id", ondelete="CASCADE"), nullable=False)
    agent_name = Column(String(100), nullable=False)  # Parser, Auditor, Patch, Verification, Summary
    status = Column(String(50), default="started")  # started, completed, failed
    created_at = Column(DateTime, default=datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)

    # Relationships
    audit = relationship("Audit", back_populates="agent_runs")
    logs = relationship("AgentLog", back_populates="agent_run", cascade="all, delete-orphan")

class AgentLog(Base):
    __tablename__ = "agent_logs"

    id = Column(Integer, primary_key=True, index=True)
    agent_run_id = Column(Integer, ForeignKey("agent_runs.id", ondelete="CASCADE"), nullable=False)
    log_level = Column(String(20), default="info")
    message = Column(Text, nullable=False)
    agent_thought = Column(Text, nullable=True)  # Detailed "thinking" trace
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    agent_run = relationship("AgentRun", back_populates="logs")

class ApprovalRequest(Base):
    __tablename__ = "approval_requests"

    id = Column(Integer, primary_key=True, index=True)
    audit_id = Column(Integer, ForeignKey("audits.id", ondelete="CASCADE"), nullable=False)
    finding_id = Column(Integer, ForeignKey("audit_findings.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)  # User who made the decision
    status = Column(String(50), default="pending")  # pending, approved, rejected
    approver_notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    resolved_at = Column(DateTime, nullable=True)

    # Relationships
    audit = relationship("Audit", back_populates="approval_requests")
    user = relationship("User", back_populates="approval_requests")
    finding = relationship("AuditFinding")

class Notification(Base):
    __tablename__ = "notifications"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    title = Column(String(255), nullable=False)
    message = Column(Text, nullable=False)
    is_read = Column(Boolean, default=False)
    type = Column(String(50), default="general")  # general, approval_request, audit_complete
    created_at = Column(DateTime, default=datetime.utcnow)

class AuditTrail(Base):
    __tablename__ = "audit_trails"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    action = Column(String(100), nullable=False)  # upload_document, approve_fix, login
    details = Column(JSON, nullable=True)
    ip_address = Column(String(45), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    user = relationship("User", back_populates="audit_trails")

class Session(Base):
    __tablename__ = "sessions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    token = Column(String(500), unique=True, nullable=False)
    ip_address = Column(String(45), nullable=True)
    user_agent = Column(String(255), nullable=True)
    expires_at = Column(DateTime, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    user = relationship("User", back_populates="sessions")


class DataQualityReport(Base):
    __tablename__ = "data_quality_reports"

    id = Column(Integer, primary_key=True, index=True)
    audit_id = Column(Integer, ForeignKey("audits.id", ondelete="CASCADE"), nullable=False)
    issue_type = Column(String(100), nullable=False)  # null_value, duplicate, missing_field, invalid_format
    table_or_file = Column(String(255), nullable=True)
    row_identifier = Column(String(255), nullable=True)
    description = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    audit = relationship("Audit", back_populates="data_quality_reports")


class MismatchReport(Base):
    __tablename__ = "mismatch_reports"

    id = Column(Integer, primary_key=True, index=True)
    audit_id = Column(Integer, ForeignKey("audits.id", ondelete="CASCADE"), nullable=False)
    mismatch_type = Column(String(100), nullable=False)  # erp_vs_invoice, invoice_vs_payment, vendor_vs_po, bank_vs_ledger
    source_a_value = Column(String(255), nullable=True)
    source_b_value = Column(String(255), nullable=True)
    description = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    audit = relationship("Audit", back_populates="mismatch_reports")


class ComplianceViolation(Base):
    __tablename__ = "compliance_violations"

    id = Column(Integer, primary_key=True, index=True)
    audit_id = Column(Integer, ForeignKey("audits.id", ondelete="CASCADE"), nullable=False)
    rule_id = Column(Integer, ForeignKey("compliance_rules.id", ondelete="SET NULL"), nullable=True)
    violation_type = Column(String(100), nullable=False)  # gst_rule, internal_control, audit_policy
    description = Column(Text, nullable=False)
    severity = Column(String(50), default="high")
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    audit = relationship("Audit", back_populates="compliance_violations")
    rule = relationship("ComplianceRule")


class HumanCorrectionVector(Base):
    __tablename__ = "human_corrections_vector"

    id = Column(Integer, primary_key=True, index=True)
    original_anomaly = Column(Text, nullable=False)
    human_correction = Column(Text, nullable=False)
    auditor_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    confidence_at_time = Column(Float, nullable=True)
    # The embedding vector (e.g., 1536 dimensions for OpenAI text-embedding-3-small)
    embedding = Column(Vector(1536), nullable=True) 
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    auditor = relationship("User")

    __table_args__ = (
        Index("idx_human_corrections_embedding", "embedding", postgresql_using="hnsw", postgresql_with={"m": 16, "ef_construction": 64}, postgresql_ops={"embedding": "vector_cosine_ops"}),
    )
