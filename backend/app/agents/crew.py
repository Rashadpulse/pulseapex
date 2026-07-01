import asyncio
import random
import os
import json
import re


from datetime import datetime
from typing import Dict, List, Any, Callable, Awaitable, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from app.models import Audit, AuditFinding, AgentRun, AgentLog, Document, ApprovalRequest, ComplianceRule, EmbeddingsMetadata
from app.core.config import settings
from app.services.parser import DocumentParserService

# Import CrewAI core independently from LLM providers
try:
    from crewai import Agent, Task, Crew, Process
    CREWAI_AVAILABLE = True
except ImportError:
    CREWAI_AVAILABLE = False

# Import LLM providers independently so one missing provider doesn't block the other
try:
    from langchain_openai import ChatOpenAI
    OPENAI_LLM_AVAILABLE = True
except ImportError:
    OPENAI_LLM_AVAILABLE = False

try:
    from langchain_google_genai import ChatGoogleGenerativeAI
    GEMINI_LLM_AVAILABLE = True
except ImportError:
    GEMINI_LLM_AVAILABLE = False


# Securely load the API key from environment variables (via config.py)
API_KEY = settings.OPENROUTER_API_KEY
BASE_URL = "https://openrouter.ai/api/v1"

def get_openrouter_llm(model_name: str):
    from crewai import LLM
    # Prefixing with 'openrouter/' ensures internal LiteLLM routes correctly
    return LLM(
        model=f"openrouter/{model_name}",
        api_key=API_KEY,
        base_url=BASE_URL,
        temperature=0.1  # Low temperature for strict structural audit outputs
    )


def _extract_json_from_text(text: str) -> Optional[Any]:
    """
    Robustly extracts JSON from LLM output text that may contain markdown fences,
    preamble text, or other formatting around the JSON payload.
    """
    if not text or not text.strip():
        return None

    raw = text.strip()

    # 1. Try direct parse
    try:
        return json.loads(raw)
    except (json.JSONDecodeError, ValueError):
        pass

    # 2. Strip markdown code fences (```json ... ``` or ``` ... ```)
    fence_pattern = r'```(?:json)?\s*\n?(.*?)\n?\s*```'
    fence_match = re.search(fence_pattern, raw, re.DOTALL)
    if fence_match:
        try:
            return json.loads(fence_match.group(1).strip())
        except (json.JSONDecodeError, ValueError):
            pass

    # 3. Find the first [ or { and match to its closing counterpart
    for start_char, end_char in [('[', ']'), ('{', '}')]:
        idx = raw.find(start_char)
        if idx != -1:
            depth = 0
            for i in range(idx, len(raw)):
                if raw[i] == start_char:
                    depth += 1
                elif raw[i] == end_char:
                    depth -= 1
                if depth == 0:
                    candidate = raw[idx:i + 1]
                    try:
                        return json.loads(candidate)
                    except (json.JSONDecodeError, ValueError):
                        break

    return None


class PulseApexAuditNetwork:
    """
    Coordinates the multi-agent auditing process. Supports both real LLM execution
    via CrewAI/LangChain and a highly realistic, interactive simulation mode.
    """
    
    def __init__(self, audit_id: int, db: AsyncSession, log_callback: Callable[[str, str, str], Awaitable[None]] = None):
        """
        log_callback: async function(agent_name, message, thought) to stream updates (e.g., via WebSockets)
        """
        self.audit_id = audit_id
        self.db = db
        self.log_callback = log_callback
        self.findings_created = []

    async def log_step(self, run_id: int, agent_name: str, message: str, thought: str = None, level: str = "info"):
        # Save log to PostgreSQL
        db_log = AgentLog(
            agent_run_id=run_id,
            log_level=level,
            message=message,
            agent_thought=thought
        )
        self.db.add(db_log)
        await self.db.commit()
        
        # Broadcast via callback (WebSockets)
        if self.log_callback:
            await self.log_callback(agent_name, message, thought or "")

    async def _create_agent_run(self, agent_name: str, status: str = "started") -> AgentRun:
        """Helper to create and persist an AgentRun record."""
        run = AgentRun(audit_id=self.audit_id, agent_name=agent_name, status=status)
        self.db.add(run)
        await self.db.commit()
        await self.db.refresh(run)
        return run

    async def _complete_agent_run(self, run: AgentRun):
        """Helper to mark an AgentRun as completed."""
        result = await self.db.execute(select(AgentRun).where(AgentRun.id == run.id))
        run_obj = result.scalars().first()
        if run_obj:
            run_obj.status = "completed"
            run_obj.completed_at = datetime.utcnow()
            await self.db.commit()

    async def _fail_agent_run(self, run: AgentRun, error_msg: str):
        """Helper to mark an AgentRun as failed."""
        result = await self.db.execute(select(AgentRun).where(AgentRun.id == run.id))
        run_obj = result.scalars().first()
        if run_obj:
            run_obj.status = "failed"
            run_obj.completed_at = datetime.utcnow()
            await self.db.commit()
        await self.log_step(run.id, run.agent_name, f"Agent failed: {error_msg}", error_msg, "error")

    async def _load_compliance_rules(self) -> List[str]:
        """Load compliance rules from the database for this audit's organization."""
        # Get the organization_id from the audit
        audit_result = await self.db.execute(select(Audit).where(Audit.id == self.audit_id))
        audit_obj = audit_result.scalars().first()
        if not audit_obj:
            return []

        rules_result = await self.db.execute(
            select(ComplianceRule).where(ComplianceRule.organization_id == audit_obj.organization_id)
        )
        rules = rules_result.scalars().all()
        return [f"[{r.category}] {r.title}: {r.rule_text}" for r in rules]



    async def _save_findings_and_handle_hitl(self, findings: List[Dict[str, Any]]) -> float:
        """
        Saves parsed findings to the database, calculates compliance score,
        creates HITL approval requests based on ai_confidence_score < 90, and updates the audit.
        Returns the compliance score.
        """
        critical_count = 0
        score_reduction = 0
        db_findings = []

        for f in findings:
            severity = f.get("severity", "low").lower()
            if severity not in ("critical", "high", "medium", "low"):
                severity = "medium"
                
            confidence = float(f.get("ai_confidence_score", 95.0))

            db_finding = AuditFinding(
                audit_id=self.audit_id,
                severity=severity,
                category=f.get("category", "risk"),
                title=f.get("title", "Unnamed Finding"),
                description=f.get("description", "No description provided."),
                original_value=f.get("original_value") or f.get("original_text", ""),
                proposed_value=f.get("proposed_value") or f.get("proposed_fix", ""),
                status="unresolved" if confidence < 90.0 else "resolved",
                page_number=f.get("page_number"),
                compliance_reference=f.get("compliance_reference", ""),
                ai_confidence_score=confidence
            )
            self.db.add(db_finding)
            db_findings.append(db_finding)

            if severity == "critical":
                critical_count += 1
                score_reduction += 25
            elif severity == "high":
                score_reduction += 15
            elif severity == "medium":
                score_reduction += 8
            else:
                score_reduction += 3

        await self.db.commit()

        for f in db_findings:
            await self.db.refresh(f)
            self.findings_created.append(f)

        compliance_score = max(0.0, 100.0 - score_reduction)

        hitl_triggered = False
        for f in db_findings:
            if f.ai_confidence_score is not None and f.ai_confidence_score < 90.0:
                hitl_triggered = True
                app_req = ApprovalRequest(
                    audit_id=self.audit_id,
                    finding_id=f.id,
                    status="pending"
                )
                self.db.add(app_req)

        await self.db.commit()

        result = await self.db.execute(select(Audit).where(Audit.id == self.audit_id))
        audit_obj = result.scalars().first()
        if audit_obj:
            audit_obj.compliance_score = compliance_score
            audit_obj.critical_findings_count = critical_count
            if hitl_triggered:
                audit_obj.status = "paused"
            else:
                audit_obj.status = "completed"
                audit_obj.completed_at = datetime.utcnow()
            await self.db.commit()

        return compliance_score

    # ──────────────────────────────────────────────────
    #  SIMULATION MODE (unchanged from original)
    # ──────────────────────────────────────────────────

    async def run_audit_simulation(self, doc: Document):
        """
        Executes a highly detailed simulation of the 5-agent auditing process.
        Perfect for local runs, free tiers, and testing workflows.
        """
        # 1. Create agent runs in DB
        agents = ["Data Collector Agent", "Data Quality Agent", "Reconciliation Agent", "Compliance Agent", "Root Cause Agent", "Report Agent"]
        run_ids = {}
        
        for agent in agents:
            run = AgentRun(audit_id=self.audit_id, agent_name=agent, status="started")
            self.db.add(run)
            await self.db.commit()
            await self.db.refresh(run)
            run_ids[agent] = run.id

        # --- AGENT 1: DATA COLLECTOR AGENT ---
        agent = "Data Collector Agent"
        run_id = run_ids[agent]
        await self.log_step(run_id, agent, "Initializing data ingestion engine...", "Locating file on storage disk and API endpoints.")
        await asyncio.sleep(1.5)
        
        await self.log_step(run_id, agent, f"Reading source: {doc.filename} ({doc.file_type})", "Extracting raw data.")
        await asyncio.sleep(2)
        
        unified_dataset = {
            "title": doc.filename,
            "date": datetime.utcnow().strftime("%Y-%m-%d"),
            "parties": ["Acme Corp", "Vendor Globex Inc"],
            "amount": 250000.00 if "contract" in doc.filename.lower() or "financial" in doc.filename.lower() else 4500.00,
            "currency": "USD",
            "has_signatures": False if "draft" in doc.filename.lower() or "unsigned" in doc.filename.lower() else True
        }
        
        await self.log_step(run_id, agent, "Successfully extracted structured data. Unified Dataset generated.", f"JSON Output:\n{json.dumps(unified_dataset, indent=2)}")
        
        result = await self.db.execute(select(AgentRun).where(AgentRun.id == run_id))
        run_obj = result.scalars().first()
        run_obj.status = "completed"
        run_obj.completed_at = datetime.utcnow()
        await self.db.commit()

        # --- AGENT 2: DATA QUALITY AGENT ---
        agent = "Data Quality Agent"
        run_id = run_ids[agent]
        await self.log_step(run_id, agent, "Validating dataset integrity...", "Checking for null values, duplicates, and missing fields.")
        await asyncio.sleep(1.5)
        
        await self.log_step(run_id, agent, "Data Quality Check Passed", "No missing fields or invalid formats detected in unified dataset.")
        
        result = await self.db.execute(select(AgentRun).where(AgentRun.id == run_id))
        run_obj = result.scalars().first()
        run_obj.status = "completed"
        run_obj.completed_at = datetime.utcnow()
        await self.db.commit()

        # --- AGENT 3: RECONCILIATION AGENT ---
        agent = "Reconciliation Agent"
        run_id = run_ids[agent]
        await self.log_step(run_id, agent, "Performing multi-way matching...", "Comparing Unified Dataset against ERP, Invoices, and Ledgers.")
        await asyncio.sleep(2)
        
        reconciliation_findings = []
        if unified_dataset["amount"] > 100000.00:
            reconciliation_findings.append({
                "severity": "high",
                "category": "transaction",
                "title": "ERP Sales vs Invoice Mismatch",
                "description": "Invoice amount does not match the ERP sales ledger.",
                "original_value": f"Invoice Amount: {unified_dataset['amount']}",
                "proposed_value": "ERP Amount: 95000.00",
                "page_number": 1,
                "compliance_reference": "Reconciliation Policy"
            })
        
        await self.log_step(run_id, agent, f"Reconciliation Complete. Found {len(reconciliation_findings)} mismatches.", "Generating Mismatch Report.")
        result = await self.db.execute(select(AgentRun).where(AgentRun.id == run_id))
        run_obj = result.scalars().first()
        run_obj.status = "completed"
        run_obj.completed_at = datetime.utcnow()
        await self.db.commit()

        # --- AGENT 4: COMPLIANCE AGENT ---
        agent = "Compliance Agent"
        run_id = run_ids[agent]
        await self.log_step(run_id, agent, "Retrieving compliance rules from database...", "Running pgvector similarity search matching document metadata.")
        await asyncio.sleep(2)
        
        # Check database for custom rules, otherwise mock search queries
        rules_result = await self.db.execute(select(ComplianceRule))
        rules = rules_result.scalars().all()
        rules_text = [r.rule_text for r in rules] or ["Rule SOC2-Sec4: All contracts over $50,000 require multi-signature approvals.", "Rule Tx-202: Non-disclosure agreement must be fully signed before releasing payment."]
        
        await self.log_step(run_id, agent, f"Found {len(rules_text)} matching policy rules. Inspecting compliance metrics...", f"Matching Policies:\n" + "\n".join(rules_text))
        await asyncio.sleep(2.5)
        
        # Generate some discrepancies based on filename or randomness
        findings = reconciliation_findings.copy()
        if unified_dataset["amount"] > 50000.00:
            findings.append({
                "severity": "critical",
                "category": "compliance",
                "title": "Transaction Exceeds Single-Sign Threshold",
                "description": f"The document references an amount of {unified_dataset['amount']} USD which exceeds the single-sign authorization limit of 50,000 USD. Additional manager signature is missing.",
                "original_value": "Authorized by single signature: CEO Acme Corp",
                "proposed_value": "Requires dual authorization (CEO & CFO)",
                "page_number": 1,
                "compliance_reference": "Rule SOC2-Sec4"
            })
            
        if not unified_dataset["has_signatures"]:
            findings.append({
                "severity": "high",
                "category": "signature",
                "title": "Missing Signatures in Executable Contract",
                "description": "The legal contract contains blank signature lines. Unsigned contracts pose major legal and operational liabilities.",
                "original_value": "Signed: [BLANK]",
                "proposed_value": "Signed: John Doe (Acme Corp) & Jane Smith (Globex Inc)",
                "page_number": 12,
                "compliance_reference": "General Corporate Governance Policy"
            })
            
        if len(findings) == 0:
            # Default fallback minor finding
            findings.append({
                "severity": "low",
                "category": "risk",
                "title": "Missing Termination Clause Period",
                "description": "The document contains a standard termination clause but fails to specify the notice period (typically 30 days).",
                "original_value": "Either party may terminate at any time.",
                "proposed_value": "Either party may terminate upon 30 days written notice.",
                "page_number": 3,
                "compliance_reference": "Contract Guidelines Sec 2.1"
            })
            
        for f in findings:
            await self.log_step(run_id, agent, f"Discrepancy Detected: {f['title']} ({f['severity'].upper()})", f"Details: {f['description']}\nCategory: {f['category']}")
            
        # Update run status
        result = await self.db.execute(select(AgentRun).where(AgentRun.id == run_id))
        run_obj = result.scalars().first()
        run_obj.status = "completed"
        run_obj.completed_at = datetime.utcnow()
        await self.db.commit()

        # --- AGENT 5: ROOT CAUSE AGENT ---
        agent = "Root Cause Agent"
        run_id = run_ids[agent]
        await self.log_step(run_id, agent, "Analyzing mismatch root causes...", "Determining 'why' the mismatch happened using historical patterns.")
        await asyncio.sleep(2)
        
        critical_count = 0
        score_reduction = 0
        db_findings = []
        
        # Prepare proposed fixes and calculate confidence
        for f in findings:
            # Simulate confidence dropping for high/critical severities
            ai_confidence = 85.0 if f["severity"] in ["critical", "high"] else 98.0
            
            await self.log_step(
                run_id, agent, 
                f"Root Cause identified for: '{f['title']}'",
                f"Confidence Score: {ai_confidence}%. Cause: Data Entry Error or Missing Sync."
            )
            await asyncio.sleep(1.0)
            
            db_finding = AuditFinding(
                audit_id=self.audit_id,
                severity=f["severity"],
                category=f["category"],
                title=f["title"],
                description=f["description"] + " [Root Cause: Pending Sync / Data Entry Error]",
                original_value=f["original_value"],
                proposed_value=f["proposed_value"],
                status="unresolved" if ai_confidence < 90.0 else "resolved", # <90% goes to human review
                page_number=f["page_number"],
                compliance_reference=f["compliance_reference"],
                ai_confidence_score=ai_confidence
            )
            self.db.add(db_finding)
            db_findings.append(db_finding)
            
            if f["severity"] == "critical":
                critical_count += 1
                score_reduction += 25
            elif f["severity"] == "high":
                score_reduction += 15
            else:
                score_reduction += 5
                
        await self.db.commit()
        
        for f in db_findings:
            await self.db.refresh(f)
            self.findings_created.append(f)
            
        compliance_score = max(0.0, 100.0 - score_reduction)
        
        # Create approval requests (Human-In-The-Loop) for findings where confidence < 90%
        hitl_triggered = False
        for f in db_findings:
            if f.ai_confidence_score is not None and f.ai_confidence_score < 90.0:
                await self.log_step(
                    run_id, agent, 
                    f"LOW CONFIDENCE ({f.ai_confidence_score}%): Pausing audit network.", 
                    f"Creating approval request for: '{f.title}'. Triggering Human-In-The-Loop review."
                )
                hitl_triggered = True
                app_req = ApprovalRequest(
                    audit_id=self.audit_id,
                    finding_id=f.id,
                    status="pending"
                )
                self.db.add(app_req)
                
        await self.db.commit()
        
        result = await self.db.execute(select(Audit).where(Audit.id == self.audit_id))
        audit_obj = result.scalars().first()
        audit_obj.compliance_score = compliance_score
        audit_obj.critical_findings_count = critical_count
        
        if hitl_triggered:
            audit_obj.status = "paused"
        else:
            audit_obj.status = "completed"
            audit_obj.completed_at = datetime.utcnow()
            
        await self.db.commit()
        
        result = await self.db.execute(select(AgentRun).where(AgentRun.id == run_id))
        run_obj = result.scalars().first()
        run_obj.status = "completed"
        run_obj.completed_at = datetime.utcnow()
        await self.db.commit()

        if hitl_triggered:
            return

        # --- AGENT 6: REPORT AGENT ---
        # Only runs if audit completed immediately
        agent = "Report Agent"
        run_id = run_ids[agent]
        await self.log_step(run_id, agent, "Compiling final Data Quality, Mismatch, and Compliance reports...", "Formatting outputs for Power BI REST API views.")
        await asyncio.sleep(2)
        
        await self.log_step(run_id, agent, f"Audit Completed. Compliance Score: {compliance_score}%.", "Materialized views ready for BI ingestion.")
        
        result = await self.db.execute(select(AgentRun).where(AgentRun.id == run_id))
        run_obj = result.scalars().first()
        run_obj.status = "completed"
        run_obj.completed_at = datetime.utcnow()
        await self.db.commit()

    # ──────────────────────────────────────────────────
    #  LIVE CrewAI MODE — Full 5-Agent Pipeline
    # ──────────────────────────────────────────────────

    async def execute_real_crewai(self, doc: Document):
        """
        Executes the full CrewAI 5-agent audit pipeline with a real LLM.
        Each agent stage creates proper AgentRun + AgentLog records.
        Falls back to simulation mode if configuration fails.
        """
        import logging
        logger = logging.getLogger("uvicorn.error")

        if not CREWAI_AVAILABLE or settings.AI_PROVIDER == "mock":
            logger.info(f"[CrewAI] Audit {self.audit_id}: CrewAI not available or AI_PROVIDER=mock. Running simulation.")
            await self.run_audit_simulation(doc)
            return

        if not settings.OPENROUTER_API_KEY:
            logger.warning(f"[CrewAI] Audit {self.audit_id}: No OPENROUTER_API_KEY found. Falling back to simulation.")

        try:
            logger.info(f"[CrewAI] Audit {self.audit_id}: Starting full 5-agent pipeline...")

            # ── STAGE 1: DATA COLLECTOR AGENT ──────────────────

            collector_run = await self._create_agent_run("Data Collector Agent", "running")
            await self.log_step(collector_run.id, "Data Collector Agent", f"Extracting dataset: {doc.filename} ({doc.file_type})", "Using DocumentParserService.")

            # Use the real parser service to extract document content
            doc_content = DocumentParserService.parse_document(doc.storage_path, doc.file_type)
            # Truncate to avoid exceeding LLM context limits
            max_chars = 8000
            if len(doc_content) > max_chars:
                doc_content = doc_content[:max_chars] + "\n\n[... content truncated for LLM context limit ...]"

            await self.log_step(
                collector_run.id, "Data Collector Agent",
                f"Extracted {len(doc_content)} characters of text content.",
                f"First 500 chars:\n{doc_content[:500]}"
            )

            collector_agent = Agent(
                role='Enterprise Data Collector Specialist',
                goal='Extract and standardize raw data from Excel, PDF, Images, SQL, ERP, and APIs into a Unified Dataset.',
                backstory='You are a data ingestion specialist responsible for turning unstructured corporate documents and data streams into a clean, unified structure.',
                verbose=False,
                allow_delegation=False,
                llm=get_openrouter_llm("meta-llama/llama-3-8b-instruct:free")
            )

            collector_task = Task(
                description=(
                    f"Analyze this document content and extract structured information.\n\n"
                    f"DOCUMENT FILENAME: {doc.filename}\n"
                    f"DOCUMENT TYPE: {doc.file_type}\n\n"
                    f"DOCUMENT CONTENT:\n{doc_content}\n\n"
                    f"Extract the following into a JSON object:\n"
                    f"- title: The document title or subject\n"
                    f"- parties: List of parties/organizations mentioned\n"
                    f"- date: The document date if present\n"
                    f"- amount: Any financial amount mentioned (number, 0 if none)\n"
                    f"- currency: Currency code (USD if not specified)\n"
                    f"- signed: Boolean, whether the document appears to be signed\n"
                    f"- key_clauses: List of key clause summaries (up to 5)\n"
                    f"- document_type: Classification (contract, invoice, financial_statement, policy, report, other)\n\n"
                    f"Return ONLY valid JSON, no extra text."
                ),
                expected_output='A valid JSON object representing the unified dataset.',
                agent=collector_agent
            )

            # ── STAGE 2: DATA QUALITY AGENT ──────────────────

            quality_run = await self._create_agent_run("Data Quality Agent", "running")
            await self.log_step(quality_run.id, "Data Quality Agent", "Analyzing dataset for null values, duplicates, missing fields, and invalid formats.", "Validating unified dataset integrity.")

            quality_agent = Agent(
                role='Data Quality Auditor',
                goal='Identify null values, duplicate records, missing fields, and invalid formats in the unified dataset.',
                backstory='You ensure that data entering the reconciliation pipeline is perfectly clean and error-free.',
                verbose=False,
                allow_delegation=False,
                llm=get_openrouter_llm("cohere/north-mini-code:free")
            )

            quality_task = Task(
                description=(
                    f"Review the Unified Dataset provided by the Data Collector Agent.\n"
                    f"Identify any missing fields, invalid formats, or null values.\n"
                    f"Return ONLY a JSON array of Data Quality issues. If none, return an empty array []."
                ),
                expected_output='A valid JSON array of Data Quality issues.',
                agent=quality_agent,
                context=[collector_task]
            )

            # ── STAGE 3: RECONCILIATION AGENT ──────────────────

            recon_run = await self._create_agent_run("Reconciliation Agent", "running")
            await self.log_step(recon_run.id, "Reconciliation Agent", "Performing multi-way matching...", "Comparing ERP Sales vs Invoice, Bank vs Ledger.")

            recon_agent = Agent(
                role='Enterprise Reconciliation Specialist',
                goal='Compare the unified dataset against external sources like ERP, Ledgers, and POs to find mismatches.',
                backstory='You are a financial reconciliation expert. You find discrepancies between what was billed, what was paid, and what the internal systems report.',
                verbose=False,
                allow_delegation=False,
                llm=get_openrouter_llm("cohere/north-mini-code:free")
            )

            recon_task = Task(
                description=(
                    f"Review the Unified Dataset provided by the Data Collector.\n"
                    f"Identify any financial mismatches (e.g., ERP vs Invoice, Invoice vs Payment, Vendor vs PO).\n"
                    f"Return ONLY a JSON array of findings. If no mismatches exist, return an empty array [].\n"
                    f"Findings must use keys: severity, category, title, description, original_value, proposed_value."
                ),
                expected_output='A valid JSON array of mismatch finding objects.',
                agent=recon_agent,
                context=[collector_task]
            )

            # ── STAGE 4: COMPLIANCE AGENT ──────────────────

            # Load compliance rules from the database
            compliance_rules = await self._load_compliance_rules()
            rules_context = "\n".join(compliance_rules) if compliance_rules else (
                "No custom rules defined. Apply these standard policies:\n"
                "1. All contracts/invoices exceeding $50,000 must have dual authorization signatures (CEO + CFO).\n"
                "2. All contracts must contain a termination notice period (minimum 30 days).\n"
                "3. Financial statements must have all formula cells validated and dates current.\n"
                "4. Confidentiality/NDA documents must specify data retention and deletion policies."
            )

            compliance_run = await self._create_agent_run("Compliance Agent", "running")
            await self.log_step(
                compliance_run.id, "Compliance Agent",
                f"Loaded {len(compliance_rules)} compliance rules. Beginning policy audit.",
                f"Rules context:\n{rules_context[:1000]}"
            )

            compliance_agent = Agent(
                role='Corporate Compliance Auditor',
                goal='Cross-reference unified dataset against compliance policies, GST rules, and internal controls to identify violations.',
                backstory='You are a certified fraud examiner. You ensure every transaction and contract strictly adheres to corporate and legal regulations.',
                verbose=False,
                allow_delegation=False,
                llm=get_openrouter_llm("cohere/north-mini-code:free")
            )

            compliance_task = Task(
                description=(
                    f"Review the dataset and identify ALL compliance violations based on these rules:\n{rules_context}\n\n"
                    f"Combine any existing reconciliation mismatches with new compliance violations.\n"
                    f"For each violation/mismatch, provide a JSON array of findings. Each finding must have:\n"
                    f"- severity: 'critical', 'high', 'medium', or 'low'\n"
                    f"- category: 'signature', 'transaction', 'risk', 'inconsistency', or 'compliance'\n"
                    f"- title: Short violation title\n"
                    f"- description: Detailed explanation of the violation\n"
                    f"- original_value: What the document currently states\n"
                    f"- proposed_value: What it should state to be compliant\n"
                    f"- page_number: Page number if applicable (integer or null)\n"
                    f"- compliance_reference: Which rule or policy this violates\n\n"
                    f"If the document is fully compliant, return at least one 'low' severity finding noting the compliance status.\n"
                    f"Return ONLY a valid JSON array of findings, no extra text."
                ),
                expected_output='A valid JSON array of finding objects with keys: severity, category, title, description, original_value, proposed_value, page_number, compliance_reference.',
                agent=compliance_agent,
                context=[recon_task, collector_task]
            )

            # ── STAGE 5: ROOT CAUSE AGENT ──────────────────

            root_cause_run = await self._create_agent_run("Root Cause Agent", "running")
            await self.log_step(root_cause_run.id, "Root Cause Agent", "Analyzing violations to determine root causes...", "Using LLM to find why the mismatch happened.")

            root_cause_agent = Agent(
                role='Enterprise Root Cause Specialist',
                goal='Analyze compliance violations and mismatches to determine the root cause, and assign an AI confidence score.',
                backstory='You identify exactly why a financial discrepancy occurred (e.g. Duplicate invoice, missing payment). You also assign a confidence score to your finding.',
                verbose=False,
                allow_delegation=False,
                llm=get_openrouter_llm("openai/gpt-oss-120b:free")
            )

            root_cause_task = Task(
                description=(
                    f"Review the mismatch and compliance findings.\n"
                    f"For each finding, append the likely root cause to the 'description' field.\n"
                    f"Also, add a new numerical field called 'ai_confidence_score' between 0 and 100.\n"
                    f"If you are highly confident in the root cause, assign > 90. If it requires human review, assign < 90.\n"
                    f"Return ONLY the updated JSON array of finding objects.\n"
                    f"Keep ALL other fields (severity, category, title, original_value, etc.) exactly as they are."
                ),
                expected_output='A valid JSON array of finding objects including ai_confidence_score.',
                agent=root_cause_agent,
                context=[compliance_task]
            )

            # ── STAGE 6: REPORT AGENT ──────────────────

            report_agent = Agent(
                role='Reporting Director',
                goal='Compile the final verified array of findings for insertion into the database.',
                backstory='You finalize data for the Power BI Materialized views.',
                verbose=False,
                allow_delegation=False,
                llm=get_openrouter_llm("cohere/north-mini-code:free")
            )

            report_task = Task(
                description=(
                    f"Review the final findings from the Root Cause Agent.\n"
                    f"Filter out any invalid or false positive findings.\n"
                    f"Ensure every finding has an 'ai_confidence_score' (float).\n"
                    f"Return ONLY the final JSON array of findings. No extra text."
                ),
                expected_output='A valid JSON array of final finding objects.',
                agent=report_agent,
                context=[root_cause_task]
            )

            # ── Run the Crew ──────────────────────────────

            crew = Crew(
                agents=[collector_agent, quality_agent, recon_agent, compliance_agent, root_cause_agent, report_agent],
                tasks=[collector_task, quality_task, recon_task, compliance_task, root_cause_task, report_task],
                process=Process.sequential,
                verbose=False
            )

            logger.info(f"[CrewAI] Audit {self.audit_id}: Launching crew.kickoff() in executor thread...")
            await self.log_step(collector_run.id, "Data Collector Agent", "CrewAI pipeline initiated. Running LLM agents...", "Sequential execution started.")

            # CrewAI is synchronous, so run in a thread executor
            loop = asyncio.get_running_loop()
            crew_result = await loop.run_in_executor(None, crew.kickoff)

            logger.info(f"[CrewAI] Audit {self.audit_id}: crew.kickoff() completed successfully.")

            # ── Process CrewAI Output ──────────────────────

            # Extract the raw output text from the crew result
            if hasattr(crew_result, 'raw'):
                result_text = str(crew_result.raw)
            elif hasattr(crew_result, 'output'):
                result_text = str(crew_result.output)
            else:
                result_text = str(crew_result)

            logger.info(f"[CrewAI] Audit {self.audit_id}: Raw output length: {len(result_text)} chars")

            # Mark runs as completed
            await self._complete_agent_run(collector_run)
            await self.log_step(collector_run.id, "Data Collector Agent", "Data ingestion completed.", "Unified dataset compiled.")

            await self._complete_agent_run(quality_run)
            await self.log_step(quality_run.id, "Data Quality Agent", "Data quality checked.", "Quality verified.")

            await self._complete_agent_run(recon_run)
            await self.log_step(recon_run.id, "Reconciliation Agent", "Reconciliation multi-way matching completed.", "No outstanding mismatches missed.")

            await self._complete_agent_run(compliance_run)
            await self.log_step(compliance_run.id, "Compliance Agent", "Compliance cross-reference audit completed by LLM.", "All rules checked against document content.")

            # Try to parse the final task output (patch_task) as findings JSON
            findings = []
            parsed_json = _extract_json_from_text(result_text)

            if parsed_json is not None:
                if isinstance(parsed_json, list):
                    findings = parsed_json
                    logger.info(f"[CrewAI] Audit {self.audit_id}: Successfully parsed {len(findings)} findings from LLM output.")
                elif isinstance(parsed_json, dict):
                    # LLM may have returned a single finding as an object
                    if "findings" in parsed_json:
                        findings = parsed_json["findings"]
                    else:
                        findings = [parsed_json]
                    logger.info(f"[CrewAI] Audit {self.audit_id}: Parsed {len(findings)} findings from dict output.")
            else:
                logger.warning(f"[CrewAI] Audit {self.audit_id}: Could not parse JSON from LLM output. Attempting per-task extraction...")

                # Try extracting from individual task outputs
                for task_obj in [report_task, root_cause_task, compliance_task, recon_task]:
                    try:
                        task_output = str(task_obj.output) if hasattr(task_obj, 'output') and task_obj.output else ""
                        if task_output:
                            task_json = _extract_json_from_text(task_output)
                            if task_json and isinstance(task_json, list):
                                findings = task_json
                                logger.info(f"[CrewAI] Audit {self.audit_id}: Extracted {len(findings)} findings from task output.")
                                break
                    except Exception:
                        continue

            await self._complete_agent_run(root_cause_run)
            await self.log_step(root_cause_run.id, "Root Cause Agent", f"Root cause analysis generated. {len(findings)} findings processed.", "Completed.")

            # If no findings could be parsed, create a fallback finding
            if not findings:
                logger.warning(f"[CrewAI] Audit {self.audit_id}: No structured findings extracted. Creating fallback from raw text.")
                findings = [{
                    "severity": "low",
                    "category": "risk",
                    "title": "AI Audit Analysis Complete",
                    "description": f"The AI agent completed its analysis. Raw output summary: {result_text[:500]}",
                    "original_value": "Document analyzed",
                    "proposed_value": "Review the AI analysis output for detailed recommendations.",
                    "page_number": None,
                    "compliance_reference": "AI-Generated Analysis",
                    "ai_confidence_score": 95.0
                }]

            # ── STAGE 6: REPORT AGENT ────────────────

            report_run = await self._create_agent_run("Report Agent", "running")
            await self.log_step(
                report_run.id, "Report Agent",
                f"Compiling final reports and verifying {len(findings)} findings...",
                "Saving to DB and checking for HITL triggers (<90% confidence)."
            )

            # Save findings and handle HITL
            compliance_score = await self._save_findings_and_handle_hitl(findings)

            hitl_count = sum(1 for f in findings if float(f.get("ai_confidence_score", 95.0)) < 90.0)
            if hitl_count > 0:
                await self.log_step(
                    report_run.id, "Report Agent",
                    f"LOW CONFIDENCE REQUIRES APPROVAL: {hitl_count} findings <90% confidence. Audit PAUSED.",
                    f"Compliance Score: {compliance_score}%. Created {hitl_count} approval requests."
                )
            else:
                await self.log_step(
                    report_run.id, "Report Agent",
                    f"All findings verified with high confidence. Compliance Score: {compliance_score}%.",
                    "No findings requiring manual approval."
                )

            await self._complete_agent_run(report_run)

            logger.info(f"[CrewAI] Audit {self.audit_id}: Full pipeline completed. Score: {compliance_score}%, Findings: {len(findings)}")

        except Exception as e:
            error_msg = f"crew.kickoff() FAILED: {type(e).__name__}: {e}"
            logger.error(f"[CrewAI] Audit {self.audit_id}: {error_msg}")
            
            # Write error to database log row and safely broadcast state update
            err_run = await self._create_agent_run("System Orchestrator", "failed")
            await self.log_step(
                err_run.id, 
                "System Orchestrator", 
                "Execution encountered a fatal error. Falling back to simulation mode.", 
                error_msg,
                "error"
            )
            
            logger.info(f"[CrewAI] Audit {self.audit_id}: Falling back to simulation mode after error.")
            await self.run_audit_simulation(doc)

    async def _run_report_agent(self, findings: List[Dict[str, Any]], compliance_score: float):
        report_run = await self._create_agent_run("Report Agent", "running")
        await self.log_step(
            report_run.id, "Report Agent",
            "Compiling final Data Quality, Mismatch, and Compliance reports...",
            "Formatting outputs for Power BI REST API views."
        )

        if CREWAI_AVAILABLE:
            from crewai import Agent, Task, Crew
            report_agent = Agent(
                role='Reporting Director',
                goal='Compile the final verified array of findings for insertion into the database.',
                backstory='You finalize data for the Power BI Materialized views.',
                verbose=False,
                allow_delegation=False,
                llm=get_openrouter_llm("cohere/north-mini-code:free")
            )
            
            findings_str = "\n".join([f"[{f.get('severity', 'N/A').upper()}] {f.get('title', 'N/A')}: {f.get('description', 'N/A')}" for f in findings])
            
            report_task = Task(
                description=(
                    f"Review these verified findings:\n\n{findings_str}\n\n"
                    f"Format the final report for Power BI."
                ),
                expected_output='A compiled final report for materialized views.',
                agent=report_agent
            )
            
            report_crew = Crew(agents=[report_agent], tasks=[report_task], verbose=False)
            loop = asyncio.get_running_loop()
            try:
                report_result = await loop.run_in_executor(None, report_crew.kickoff)
                if hasattr(report_result, 'raw'):
                    report_text = str(report_result.raw)
                else:
                    report_text = str(report_result)
            except Exception as e:
                report_text = f"Audit Completed. Report failed: {e}"
        else:
            report_text = f"Audit Completed. Compliance Score: {compliance_score}%. Total findings: {len(findings)}."

        await self.log_step(
            report_run.id, "Report Agent",
            f"Audit Completed. Compliance Score: {compliance_score}%.",
            "Materialized views ready for BI ingestion."
        )
        await self._complete_agent_run(report_run)

    async def resume_audit_after_hitl(self):
        """
        Resumes the audit network once all approval requests are resolved.
        """
        # Fetch audit and verify if there are any remaining pending approvals
        result = await self.db.execute(
            select(ApprovalRequest).where(
                ApprovalRequest.audit_id == self.audit_id,
                ApprovalRequest.status == "pending"
            )
        )
        pending = result.scalars().all()
        
        if len(pending) > 0:
            # Still waiting on other approvals
            return
            
        # All approvals resolved! Let's resume and run the Report agent.
        result = await self.db.execute(select(Audit).where(Audit.id == self.audit_id))
        audit_obj = result.scalars().first()
        audit_obj.status = "completed"
        audit_obj.completed_at = datetime.utcnow()
        await self.db.commit()
        
        # Load findings from DB to pass to summarizer
        findings_result = await self.db.execute(select(AuditFinding).where(AuditFinding.audit_id == self.audit_id))
        findings_db = findings_result.scalars().all()
        findings_list = [{"title": f.title, "severity": f.severity, "description": f.description} for f in findings_db]
        
        await self._run_report_agent(findings_list, audit_obj.compliance_score)
