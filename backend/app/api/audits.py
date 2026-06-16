from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from fastapi.responses import StreamingResponse
import io
import csv
import pandas as pd
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload, joinedload
from app.core.database import AsyncSessionLocal, get_db
from app.api.deps import get_current_active_user
from app.models import User, Document, Audit, AuditFinding, AgentRun
from app.schemas import AuditResponse, DashboardStats
from app.agents.crew import PulseApexAuditNetwork

router = APIRouter()

async def run_crew_task(audit_id: int, doc_id: int):
    """Background task: run the CrewAI agent network for a given audit."""
    import logging
    logger = logging.getLogger("uvicorn.error")
    logger.info(f"[CrewAI] Starting background crew task for audit_id={audit_id}, doc_id={doc_id}")

    try:
        async with AsyncSessionLocal() as db_session:
            # Retrieve document
            result = await db_session.execute(select(Document).where(Document.id == doc_id))
            doc = result.scalars().first()
            if not doc:
                logger.error(f"[CrewAI] Document {doc_id} not found. Aborting crew task.")
                return

            # Retrieve the audit's organization_id for WebSocket broadcasting
            audit_result = await db_session.execute(select(Audit).where(Audit.id == audit_id))
            audit_obj = audit_result.scalars().first()
            org_id = audit_obj.organization_id if audit_obj else 1

            # Wire up WebSocket broadcast callback for real-time log streaming
            from app.websockets.connection import manager

            async def ws_log_callback(agent_name: str, message: str, thought: str):
                try:
                    await manager.broadcast_to_org(org_id, {
                        "type": "agent_log",
                        "audit_id": audit_id,
                        "agent_name": agent_name,
                        "message": message,
                        "agent_thought": thought
                    })
                except Exception as ws_err:
                    logger.debug(f"[WS] Broadcast failed (non-fatal): {ws_err}")

            network = PulseApexAuditNetwork(audit_id, db_session, log_callback=ws_log_callback)
            await network.execute_real_crewai(doc)

            # Broadcast audit completion event
            try:
                await manager.broadcast_to_org(org_id, {
                    "type": "audit_update",
                    "audit_id": audit_id,
                    "status": "completed"
                })
            except Exception:
                pass

        logger.info(f"[CrewAI] Crew task completed successfully for audit_id={audit_id}")

    except Exception as e:
        logger.error(f"[CrewAI] FATAL ERROR in background crew task for audit_id={audit_id}: {type(e).__name__}: {e}")
        # Mark audit as failed so the frontend doesn't hang
        try:
            async with AsyncSessionLocal() as db_session:
                result = await db_session.execute(select(Audit).where(Audit.id == audit_id))
                audit_obj = result.scalars().first()
                if audit_obj and audit_obj.status not in ["completed", "failed"]:
                    audit_obj.status = "failed"
                    await db_session.commit()
                    logger.info(f"[CrewAI] Marked audit_id={audit_id} as 'failed'")
        except Exception as inner_e:
            logger.error(f"[CrewAI] Could not update audit status: {inner_e}")

@router.post("/start/{document_id}", response_model=AuditResponse)
@router.post("/trigger/{document_id}", response_model=AuditResponse)
@router.get("/trigger/{document_id}", response_model=AuditResponse)
async def start_audit(
    document_id: int,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    # Verify document ownership
    result = await db.execute(
        select(Document).where(
            Document.id == document_id,
            Document.organization_id == current_user.organization_id
        )
    )
    doc = result.scalars().first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
        
    # Check if there is an active audit running
    result = await db.execute(
        select(Audit).where(
            Audit.document_id == document_id,
            Audit.status.in_(["pending", "running", "paused"])
        )
    )
    existing_audit = result.scalars().first()
    if existing_audit:
        raise HTTPException(status_code=400, detail="An active audit is already in progress for this document.")
        
    # Create Audit record
    db_audit = Audit(
        document_id=document_id,
        organization_id=current_user.organization_id,
        status="running",
        compliance_score=100.0,
        critical_findings_count=0
    )
    db.add(db_audit)
    await db.commit()
    await db.refresh(db_audit)
    
    # Update document status
    doc.status = "parsing"
    await db.commit()
    
    # Run in background to prevent request timeouts
    background_tasks.add_task(run_crew_task, db_audit.id, document_id)
    
    # Re-fetch with eager loading to prevent MissingGreenlet on serialization
    result = await db.execute(
        select(Audit)
        .options(joinedload(Audit.findings))
        .where(Audit.id == db_audit.id)
    )
    db_audit = result.scalars().first()
    return db_audit

@router.get("/status/{audit_id}", response_model=AuditResponse)
async def get_audit_status(
    audit_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    result = await db.execute(
        select(Audit)
        .options(joinedload(Audit.findings))
        .where(
            Audit.id == audit_id,
            Audit.organization_id == current_user.organization_id
        )
    )
    audit = result.scalars().first()
    if not audit:
        raise HTTPException(status_code=404, detail="Audit job not found")
    return audit

@router.get("/document/{document_id}", response_model=AuditResponse)
async def get_latest_audit_by_document(
    document_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    result = await db.execute(
        select(Audit)
        .options(joinedload(Audit.findings))
        .where(
            Audit.document_id == document_id,
            Audit.organization_id == current_user.organization_id
        )
        .order_by(Audit.created_at.desc())
    )
    audit = result.scalars().first()
    if not audit:
        raise HTTPException(status_code=404, detail="No audits found for this document")
    return audit

@router.get("/stats", response_model=DashboardStats)
async def get_dashboard_stats(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    # Fetch general metrics for dashboard cards
    doc_count_result = await db.execute(
        select(Document).where(Document.organization_id == current_user.organization_id)
    )
    doc_count = len(doc_count_result.scalars().all())
    
    audits_result = await db.execute(
        select(Audit).where(Audit.organization_id == current_user.organization_id)
    )
    audits = audits_result.scalars().all()
    
    active_audits = sum(1 for a in audits if a.status in ["running", "paused"])
    
    # Calculate average compliance score
    completed_audits = [a for a in audits if a.status == "completed"]
    avg_compliance = 100.0
    if completed_audits:
        avg_compliance = sum(a.compliance_score for a in completed_audits) / len(completed_audits)
        
    critical_findings_count = sum(a.critical_findings_count for a in audits)
    
    # Health score is a visual calculation based on average compliance score and active findings
    health = max(0.0, avg_compliance - (critical_findings_count * 2))

    return {
        "documents_processed": doc_count,
        "compliance_score": round(avg_compliance, 1),
        "active_audits": active_audits,
        "critical_findings": critical_findings_count,
        "health_score": round(health, 1)
    }

@router.get("/export/{audit_id}/{export_format}")
async def export_audit_report(
    audit_id: int,
    export_format: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    # Fetch audit with findings and document
    result = await db.execute(
        select(Audit)
        .options(joinedload(Audit.findings), joinedload(Audit.document))
        .where(
            Audit.id == audit_id,
            Audit.organization_id == current_user.organization_id
        )
    )
    audit = result.scalars().first()
    if not audit:
        raise HTTPException(status_code=404, detail="Audit job not found")
        
    export_format = export_format.lower()
    
    # Export as CSV
    if export_format == "csv":
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(["Finding ID", "Severity", "Category", "Title", "Description", "Original Value", "Proposed Patch", "Status", "Reference"])
        
        for f in audit.findings:
            writer.writerow([f.id, f.severity, f.category, f.title, f.description, f.original_value, f.proposed_value, f.status, f.compliance_reference])
            
        output.seek(0)
        return StreamingResponse(
            io.BytesIO(output.getvalue().encode("utf-8")),
            media_type="text/csv",
            headers={"Content-Disposition": f"attachment; filename=pulseapex_audit_{audit_id}.csv"}
        )
        
    # Export as Excel
    elif export_format == "excel":
        output = io.BytesIO()
        data = []
        for f in audit.findings:
            data.append({
                "Finding ID": f.id,
                "Severity": f.severity,
                "Category": f.category,
                "Title": f.title,
                "Description": f.description,
                "Original Value": f.original_value,
                "Proposed Patch": f.proposed_value,
                "Status": f.status,
                "Reference": f.compliance_reference
            })
        df = pd.DataFrame(data)
        
        with pd.ExcelWriter(output, engine="openpyxl") as writer:
            df.to_excel(writer, sheet_name="Audit Findings", index=False)
            
        output.seek(0)
        return StreamingResponse(
            output,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f"attachment; filename=pulseapex_audit_{audit_id}.xlsx"}
        )
        
    # Export as PDF
    elif export_format == "pdf":
        output = io.BytesIO()
        
        try:
            from fpdf import FPDF
            class PDF(FPDF):
                def header(self):
                    self.set_font("Helvetica", "B", 15)
                    self.cell(0, 10, "PulseApex Audit Network Report", border=False, ln=1, align="C")
                    self.set_font("Helvetica", "I", 9)
                    self.cell(0, 10, f"Audit ID: {audit_id} | Document: {audit.document.filename}", border=False, ln=1, align="C")
                    self.line(10, 30, 200, 30)
                    self.ln(10)
                    
                def footer(self):
                    self.set_y(-15)
                    self.set_font("Helvetica", "I", 8)
                    self.cell(0, 10, f"Page {self.page_no()}/{{nb}}", 0, 0, "C")
                    
            pdf = PDF()
            pdf.alias_nb_pages()
            pdf.add_page()
            
            pdf.set_font("Helvetica", "B", 12)
            pdf.cell(0, 10, f"Compliance Score: {audit.compliance_score}%", ln=1)
            pdf.cell(0, 10, f"Total Findings: {len(audit.findings)}", ln=1)
            pdf.ln(5)
            
            for f in audit.findings:
                pdf.set_font("Helvetica", "B", 10)
                pdf.cell(0, 8, f"[{f.severity.upper()}] - {f.title} ({f.category})", ln=1)
                pdf.set_font("Helvetica", "", 9)
                pdf.multi_cell(0, 5, f"Description: {f.description}")
                pdf.multi_cell(0, 5, f"Old: {f.original_value} --> New: {f.proposed_value}")
                pdf.cell(0, 5, f"Status: {f.status} | Rule Reference: {f.compliance_reference}", ln=1)
                pdf.ln(4)
                
            pdf_bytes = pdf.output(dest='S')
            return StreamingResponse(
                io.BytesIO(pdf_bytes),
                media_type="application/pdf",
                headers={"Content-Disposition": f"attachment; filename=pulseapex_audit_{audit_id}.pdf"}
            )
            
        except Exception as e:
            # Fallback text representation if FPDF fails
            text_output = f"PulseApex Audit Network Report\nAudit ID: {audit_id}\nDocument: {audit.document.filename}\nCompliance Score: {audit.compliance_score}%\n\nFindings:\n"
            for f in audit.findings:
                text_output += f"[{f.severity.upper()}] {f.title}\nDescription: {f.description}\nOriginal: {f.original_value}\nProposed: {f.proposed_value}\nStatus: {f.status}\nReference: {f.compliance_reference}\n\n"
                
            return StreamingResponse(
                io.BytesIO(text_output.encode("utf-8")),
                media_type="text/plain",
                headers={"Content-Disposition": f"attachment; filename=pulseapex_audit_{audit_id}.txt"}
            )
            
    else:
        raise HTTPException(status_code=400, detail="Invalid format. Supported formats: csv, excel, pdf")

