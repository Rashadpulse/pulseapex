"use client";

import React, { useState, useEffect, useRef } from "react";
import { 
  usePulseApexStore, Document, Audit, AuditFinding, AgentLog 
} from "../store";
import { 
  Shield, UploadCloud, Layers, ClipboardCheck, Terminal, BookOpen, 
  Settings, User as UserIcon, LogOut, CheckCircle, AlertTriangle, 
  XCircle, Play, Info, ArrowRight, RefreshCw, Check, X, FileText,
  AlertCircle, ShieldAlert, Cpu, Activity
} from "lucide-react";

if (typeof window !== 'undefined') {
  const originalFetch = window.fetch;
  window.fetch = async function (...args) {
    let url = args[0];
    if (typeof url === 'string' && url.includes('pulseapex-api.onrender.com')) {
      // If the URL ends with /:1, strip it completely
      if (url.endsWith('/:1')) {
        url = url.replace('/:1', '');
      }
      // For individual document lookups like /document/19:1 -> transform to /document/19
      url = url.replace(/:1$/, '').replace(/:1\//, '/');
      args[0] = url;
    }
    return originalFetch.apply(this, args);
  };
}

export default function Home() {
  const {
    token, setToken, user, setUser, documents, setDocuments, addDocument,
    audits, setAudit, agentLogs, addAgentLog, clearAgentLogs, 
    activeTab, setActiveTab, selectedDocId, setSelectedDocId, 
    pendingApprovals, setPendingApprovals, logout
  } = usePulseApexStore();

  // Hydration fix
  const [hasMounted, setHasMounted] = useState(false);
  useEffect(() => { setHasMounted(true); }, []);

  // Local UI States
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [orgName, setOrgName] = useState("");
  const [isRegistering, setIsRegistering] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  
  // Real-time API config
  const [backendUrl, setBackendUrl] = useState("https://pulseapex-api.onrender.com/api/v1");
  const [wsUrl, setWsUrl] = useState(process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8000/ws");
  const [connectionMode, setConnectionMode] = useState<"mock" | "live">("live");
  const [wsConnected, setWsConnected] = useState(false);

  // File Upload states
  const [dragActive, setDragActive] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadingFile, setUploadingFile] = useState<string | null>(null);

  // New Compliance Rule state
  const [newRuleTitle, setNewRuleTitle] = useState("");
  const [newRuleCategory, setNewRuleCategory] = useState("Tax");
  const [newRuleText, setNewRuleText] = useState("");
  const [complianceRules, setComplianceRules] = useState<any[]>([]);

  // Refs for auto-scroll in logs
  const terminalEndRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);

  // Mocking defaults for the free out-of-the-box sandbox preview
  useEffect(() => {
    if (connectionMode === "mock" && documents.length === 0) {
      // Load standard mock data
      const mockDocs: Document[] = [
        { id: 1, filename: "q4_financial_statement_2025_unsigned.xlsx", file_type: "XLSX", file_size: 1542000, status: "audited", created_at: "2026-06-12T10:00:00Z" },
        { id: 2, filename: "globex_procurement_agreement_draft.docx", file_type: "DOCX", file_size: 450000, status: "paused", created_at: "2026-06-12T11:15:00Z" },
        { id: 3, filename: "us_entity_tax_log_may2026.csv", file_type: "CSV", file_size: 23000, status: "uploaded", created_at: "2026-06-12T12:30:00Z" }
      ];
      setDocuments(mockDocs);

      const mockAudit1: Audit = {
        id: 101,
        document_id: 1,
        status: "completed",
        compliance_score: 95.0,
        critical_findings_count: 0,
        created_at: "2026-06-12T10:05:00Z",
        completed_at: "2026-06-12T10:08:00Z",
        findings: [
          {
            id: 201,
            audit_id: 101,
            severity: "medium",
            category: "risk",
            title: "Amortization Rate Discrepancy",
            description: "Asset amortization rate in Sheet 2 cell D14 is calculated at 12% instead of the corporate standard 10%.",
            original_value: "Rate: 12% (Declining Balance)",
            proposed_value: "Rate: 10% (Straight Line)",
            status: "resolved",
            page_number: 2,
            compliance_reference: "Corporate Asset Guidelines 4.2"
          }
        ]
      };

      const mockAudit2: Audit = {
        id: 102,
        document_id: 2,
        status: "paused",
        compliance_score: 70.0,
        critical_findings_count: 1,
        created_at: "2026-06-12T11:16:00Z",
        findings: [
          {
            id: 202,
            audit_id: 102,
            severity: "critical",
            category: "transaction",
            title: "Unsigned Transaction Exceeds Limit",
            description: "The procurement agreement defines a total liability limit of 250,000 USD. The document has not been countersigned by the CFO and lacks board authorization reference.",
            original_value: "Authorized by CEO signature only.",
            proposed_value: "Requires board resolution ID and dual countersign (CEO + CFO).",
            status: "unresolved",
            page_number: 1,
            compliance_reference: "Rule SOC2-Sec4"
          },
          {
            id: 203,
            audit_id: 102,
            severity: "high",
            category: "signature",
            title: "Missing Contractor Signature",
            description: "Globex Inc representative line has been left blank. The agreement is legally non-binding until executed.",
            original_value: "Contractor: [BLANK]",
            proposed_value: "Contractor Signature: Jane Smith (Globex VP)",
            status: "unresolved",
            page_number: 14,
            compliance_reference: "Governance Procurement Standards v2"
          }
        ]
      };

      setAudit(1, mockAudit1);
      setAudit(2, mockAudit2);

      // Seed mock approvals list
      setPendingApprovals([
        {
          id: 501,
          audit_id: 102,
          finding_id: 202,
          status: "pending",
          finding: mockAudit2.findings[0]
        },
        {
          id: 502,
          audit_id: 102,
          finding_id: 203,
          status: "pending",
          finding: mockAudit2.findings[1]
        }
      ]);

      // Seed compliance rules
      setComplianceRules([
        { id: 1, title: "Dual Signing Authority Rule", category: "Governance", rule_text: "All corporate contracts and financial commitments exceeding $50,000 USD must carry dual authorization signatures, specifically from the Chief Executive Officer (CEO) and the Chief Financial Officer (CFO)." },
        { id: 2, title: "Vendor Payment Risk Controls", category: "Finance", rule_text: "Payments to non-registered contractors require a secondary review gate. Procurement agreements must contain a minimum 30-day termination notice clause." },
        { id: 3, title: "Data Privacy & Compliance Audit", category: "Compliance", rule_text: "Contracts sharing customer profiles must state compliance with GDPR regulations, including specific data deletion policy clauses." }
      ]);
    }
  }, [connectionMode, documents.length]);

  // Handle auto-scroll in logs
  useEffect(() => {
    if (activeTab === "agent-terminal") {
      terminalEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [agentLogs, activeTab]);

  // Connect to WebSockets when connected to live backend
  useEffect(() => {
    if (connectionMode === "live" && token) {
      try {
        const cleanToken = String(token || "").split(':')[0];
        const socket = new WebSocket(`${wsUrl}?token=${cleanToken}`);
        wsRef.current = socket;

        socket.onopen = () => {
          setWsConnected(true);
        };

        socket.onmessage = (event) => {
          console.log("RAW WEBSOCKET DATA RECEIVED:", event.data);
          try {
            const data = JSON.parse(event.data);
            if (data.type === "agent_log") {
              addAgentLog({
                agent: data.agent_name,
                message: data.message,
                thought: data.agent_thought || "",
                timestamp: new Date().toLocaleTimeString()
              });
            } else if (data.type === "audit_update") {
              // Refresh documents and audits
              fetchDocuments();
            }
          } catch (e) {
            console.error("Error parsing socket frame", e);
          }
        };

        socket.onclose = () => {
          setWsConnected(false);
        };

        socket.onerror = () => {
          setWsConnected(false);
        };

        return () => {
          socket.close();
        };
      } catch (err) {
        console.error("WS connect failed", err);
      }
    }
  }, [connectionMode, token, wsUrl]);

  // API Fetch Helpers
  const fetchDocuments = async () => {
    if (connectionMode === "mock") return;
    try {
      let baseDocumentsUrl = `https://pulseapex-api.onrender.com/api/v1/documents`;
      const res = await fetch(baseDocumentsUrl, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setDocuments(data);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchAuditForDoc = async (docId: number) => {
    if (connectionMode === "mock") return;
    try {
      let rawDocId = docId;
      const strictId = String(rawDocId || "").split(':')[0].replace(/[^0-9]/g, '');
      const res = await fetch(`https://pulseapex-api.onrender.com/api/v1/audits/document/${strictId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const auditData = await res.json();
        setAudit(docId, auditData);
      }
    } catch (e) {
      console.error("Failed to fetch audit for document", e);
    }
  };

  useEffect(() => {
    if (selectedDocId && token && connectionMode === "live") {
      fetchAuditForDoc(selectedDocId);
    }
  }, [selectedDocId, token, connectionMode]);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    if (connectionMode === "mock") {
      // Mock log in
      setUser({
        id: 99,
        email: email || "executive@acme.com",
        full_name: fullName || "Executive Officer",
        created_at: new Date().toISOString()
      });
      setToken("mock-jwt-token-12345");
      setLoading(false);
      return;
    }

    try {
      if (isRegistering) {
        const res = await fetch(`${backendUrl}/auth/register`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email,
            password,
            full_name: fullName,
            organization_name: orgName
          })
        });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.detail || "Registration failed");
        }
        setIsRegistering(false);
        setError("Account registered! Please log in.");
      } else {
        const params = new URLSearchParams();
        params.append("username", email);
        params.append("password", password);

        const res = await fetch(`${backendUrl}/auth/login`, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: params
        });
        if (!res.ok) {
          throw new Error("Invalid username or password");
        }
        const tokenData = await res.json();
        setToken(tokenData.access_token);
        
        // Fetch current user details
        const userRes = await fetch(`${backendUrl}/auth/me`, {
          headers: { Authorization: `Bearer ${tokenData.access_token}` }
        });
        if (userRes.ok) {
          const userData = await userRes.json();
          setUser(userData);
        }
        fetchDocuments();
      }
    } catch (err: any) {
      setError(err.message || "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  const handleStartAudit = async (docId: number) => {
    if (connectionMode === "mock") {
      // Simulate audit process locally in the terminal tab
      setActiveTab("agent-terminal");
      clearAgentLogs();
      
      const logs = [
        { agent: "Parser Agent", msg: "Opening document buffer", thought: "Analyzing file path and headers" },
        { agent: "Parser Agent", msg: "Extracting transaction parameters", thought: "Running structural tokenization on tables" },
        { agent: "Compliance Auditor", msg: "Initiating compliance scan against active guidelines", thought: "Querying Supabase pgvector database for matching rules" },
        { agent: "Compliance Auditor", msg: "Retrieved Dual Signing Authority policy rule", thought: "Comparing document signatures with required signatories list" },
        { agent: "Patch Specialist", msg: "Generating proposed correction block for discrepancy", thought: "Formatting replacement patch code" },
        { agent: "Verification Agent", msg: "Reviewing patch alignment", thought: "Asserting confidence index" },
        { agent: "Verification Agent", msg: "High risk violation found. HITL review center flag raised.", thought: "Halting pipeline execution" }
      ];

      for (let i = 0; i < logs.length; i++) {
        await new Promise((resolve) => setTimeout(resolve, 1500));
        addAgentLog({
          agent: logs[i].agent,
          message: logs[i].msg,
          thought: logs[i].thought,
          timestamp: new Date().toLocaleTimeString()
        });
      }

      // Mark document as paused
      setDocuments(documents.map(d => d.id === docId ? { ...d, status: "paused" } : d));
      setSelectedDocId(docId);
      setActiveTab("workspace");
      return;
    }

    try {
      let rawDocId = docId;
      const strictId = String(rawDocId || "").split(':')[0].replace(/[^0-9]/g, '');
      const res = await fetch(`https://pulseapex-api.onrender.com/api/v1/audits/trigger/${strictId}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const auditData = await res.json();
        setAudit(docId, auditData);
        // Switch tab to Agent Terminal to watch logs stream
        clearAgentLogs();
        setActiveTab("agent-terminal");
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      uploadFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      uploadFile(e.target.files[0]);
    }
  };

  const uploadFile = async (file: File) => {
    setUploadingFile(file.name);
    setUploadProgress(10);
    
    if (connectionMode === "mock") {
      // Mock file upload
      const interval = setInterval(() => {
        setUploadProgress((prev) => {
          if (prev >= 100) {
            clearInterval(interval);
            const newDoc: Document = {
              id: documents.length + 1,
              filename: file.name,
              file_type: file.name.split('.').pop()?.toUpperCase() || "TXT",
              file_size: file.size,
              status: "uploaded",
              created_at: new Date().toISOString()
            };
            addDocument(newDoc);
            setUploadingFile(null);
            setActiveTab("workspace");
            setSelectedDocId(newDoc.id);
            return 0;
          }
          return prev + 30;
        });
      }, 500);
      return;
    }

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch(`${backendUrl}/documents/upload`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData
      });
      if (res.ok) {
        const data = await res.json();
        addDocument(data);
        setUploadingFile(null);
        setActiveTab("workspace");
        setSelectedDocId(data.id);
      }
    } catch (e) {
      console.error("Upload failed", e);
      setUploadingFile(null);
    }
  };

  const handleDecideHITL = async (reqId: number, approve: boolean, notes: string = "") => {
    if (connectionMode === "mock") {
      // Update pending approvals state
      setPendingApprovals(pendingApprovals.filter(p => p.id !== reqId));
      
      // Update findings state
      const resolvedDocId = 2; // globex doc
      const currentAudit = audits[resolvedDocId];
      if (currentAudit) {
        const updatedFindings = currentAudit.findings.map(f => {
          if (f.id === 202 && reqId === 501) {
            return { ...f, status: approve ? "approved" as const : "rejected" as const };
          }
          if (f.id === 203 && reqId === 502) {
            return { ...f, status: approve ? "approved" as const : "rejected" as const };
          }
          return f;
        });
        
        // If all approvals are resolved, complete audit
        const allResolved = updatedFindings.every(f => f.status !== "unresolved");
        
        setAudit(resolvedDocId, {
          ...currentAudit,
          status: allResolved ? "completed" : "paused",
          findings: updatedFindings
        });

        if (allResolved) {
          // Update doc status
          setDocuments(documents.map(d => d.id === resolvedDocId ? { ...d, status: "audited" } : d));
        }
      }
      return;
    }

    try {
      const res = await fetch(`${backendUrl}/hitl/decide`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          request_id: reqId,
          approve,
          notes
        })
      });
      if (res.ok) {
        // Refresh pending approvals queue
        const approvalsRes = await fetch(`${backendUrl}/hitl/pending`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (approvalsRes.ok) {
          const data = await approvalsRes.json();
          setPendingApprovals(data);
        }
        fetchDocuments();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleAddRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRuleTitle || !newRuleText) return;

    if (connectionMode === "mock") {
      setComplianceRules([
        ...complianceRules,
        {
          id: complianceRules.length + 1,
          title: newRuleTitle,
          category: newRuleCategory,
          rule_text: newRuleText
        }
      ]);
      setNewRuleTitle("");
      setNewRuleText("");
      return;
    }

    try {
      const res = await fetch(`${backendUrl}/compliance/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          title: newRuleTitle,
          category: newRuleCategory,
          rule_text: newRuleText
        })
      });
      if (res.ok) {
        const newRule = await res.json();
        setComplianceRules([...complianceRules, newRule]);
        setNewRuleTitle("");
        setNewRuleText("");
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Helper stats calculation
  const getStats = () => {
    const docsProcessed = documents.length;
    const activeAudits = documents.filter(d => d.status === "parsing" || d.status === "paused").length;
    
    // Avg compliance
    let sum = 0;
    let count = 0;
    Object.values(audits).forEach(a => {
      if (a.status === "completed") {
        sum += a.compliance_score;
        count++;
      }
    });
    const avgScore = count > 0 ? (sum / count) : 95.0;

    // Critical count
    let criticals = 0;
    Object.values(audits).forEach(a => {
      criticals += a.critical_findings_count;
    });

    return {
      docsProcessed,
      activeAudits,
      complianceScore: Math.round(avgScore),
      criticalFindings: criticals
    };
  };

  const stats = getStats();
  const selectedDoc = documents.find(d => d.id === selectedDocId);
  const selectedAudit = selectedDocId ? audits[selectedDocId] : null;

  // Hydration guard
  if (!hasMounted) {
    return (
      <div className="p-8 text-center text-slate-500 animate-pulse">Synchronizing Security Environment...</div>
    );
  }

  // Render Login/Register view if not logged in
  if (!token) {
    return (
      <div className="flex-1 flex items-center justify-center p-6 bg-[#030305] relative overflow-hidden">
        {/* Decorative Grid and Ambient Glows */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:32px_32px]" />
        <div className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full bg-cyan-500/10 blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 rounded-full bg-purple-500/10 blur-3xl" />

        <div className="w-full max-w-md glass-panel p-8 rounded-2xl relative z-10 border border-gray-800 shadow-2xl">
          <div className="flex items-center gap-3 justify-center mb-8">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-tr from-cyan-500 to-purple-600 flex items-center justify-center shadow-lg shadow-cyan-500/20">
              <Shield className="w-6 h-6 text-white" />
            </div>
            <h1 className="text-2xl font-bold tracking-wider bg-clip-text text-transparent bg-gradient-to-r from-cyan-400 to-purple-400 font-sans">
              PULSEAPEX AI
            </h1>
          </div>

          <div className="mb-6 flex p-1 bg-gray-950/80 rounded-lg border border-gray-900">
            <button
              onClick={() => setIsRegistering(false)}
              className={`flex-1 py-2 rounded-md font-medium text-sm transition-all ${!isRegistering ? 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/20' : 'text-gray-400 hover:text-gray-200'}`}
            >
              Sign In
            </button>
            <button
              onClick={() => setIsRegistering(true)}
              className={`flex-1 py-2 rounded-md font-medium text-sm transition-all ${isRegistering ? 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/20' : 'text-gray-400 hover:text-gray-200'}`}
            >
              Register
            </button>
          </div>

          <form onSubmit={handleAuth} className="space-y-4">
            {isRegistering && (
              <>
                <div>
                  <label className="block text-xs font-semibold uppercase text-gray-400 mb-1 tracking-wider">Full Name</label>
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="John Doe"
                    className="w-full px-4 py-2 bg-gray-950 border border-gray-800 rounded-lg focus:outline-none focus:border-cyan-500 text-sm text-gray-200"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase text-gray-400 mb-1 tracking-wider">Organization Name</label>
                  <input
                    type="text"
                    required
                    value={orgName}
                    onChange={(e) => setOrgName(e.target.value)}
                    placeholder="Acme Corp"
                    className="w-full px-4 py-2 bg-gray-950 border border-gray-800 rounded-lg focus:outline-none focus:border-cyan-500 text-sm text-gray-200"
                  />
                </div>
              </>
            )}

            <div>
              <label className="block text-xs font-semibold uppercase text-gray-400 mb-1 tracking-wider">Email Address</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="executive@company.com"
                className="w-full px-4 py-2 bg-gray-950 border border-gray-800 rounded-lg focus:outline-none focus:border-cyan-500 text-sm text-gray-200"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase text-gray-400 mb-1 tracking-wider">Password</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-4 py-2 bg-gray-950 border border-gray-800 rounded-lg focus:outline-none focus:border-cyan-500 text-sm text-gray-200"
              />
            </div>

            {error && (
              <div className="p-3 bg-red-950/35 border border-red-500/25 rounded-lg text-xs text-red-400 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Connection Mode Settings inside Auth for developers */}
            <div className="pt-2 border-t border-gray-900 mt-6 flex flex-col gap-2">
              <label className="text-[10px] font-semibold uppercase text-gray-500 tracking-wider">System Integration Mode</label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setConnectionMode("mock")}
                  className={`flex-1 py-1 rounded text-[10px] font-bold border ${connectionMode === "mock" ? 'bg-cyan-950/40 text-cyan-400 border-cyan-500/40' : 'bg-transparent text-gray-500 border-gray-800 hover:text-gray-300'}`}
                >
                  LOCAL SANDBOX (FREE)
                </button>
                <button
                  type="button"
                  onClick={() => setConnectionMode("live")}
                  className={`flex-1 py-1 rounded text-[10px] font-bold border ${connectionMode === "live" ? 'bg-purple-950/40 text-purple-400 border-purple-500/40' : 'bg-transparent text-gray-500 border-gray-800 hover:text-gray-300'}`}
                >
                  LIVE API (REQUIRES API/DB)
                </button>
              </div>
              {connectionMode === "live" && (
                <div className="flex flex-col gap-1.5 mt-2">
                  <input
                    type="text"
                    value={backendUrl}
                    onChange={(e) => setBackendUrl(e.target.value)}
                    placeholder="API Endpoint"
                    className="w-full px-2 py-1 bg-gray-950 border border-gray-900 rounded text-[10px] text-gray-400 focus:outline-none"
                  />
                  <input
                    type="text"
                    value={wsUrl}
                    onChange={(e) => setWsUrl(e.target.value)}
                    placeholder="WS Endpoint"
                    className="w-full px-2 py-1 bg-gray-950 border border-gray-900 rounded text-[10px] text-gray-400 focus:outline-none"
                  />
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-gradient-to-r from-cyan-500 to-purple-600 hover:from-cyan-400 hover:to-purple-500 text-white rounded-lg font-semibold text-sm transition-all shadow-lg shadow-cyan-500/10 cursor-pointer disabled:opacity-50 mt-4 flex items-center justify-center gap-2"
            >
              {loading ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : isRegistering ? (
                "Create Executive Account"
              ) : (
                "Initialize Auditing Dashboard"
              )}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col md:flex-row h-screen overflow-hidden bg-[#040407]">
      {/* 1. SIDEBAR NAVIGATION */}
      <aside className="w-full md:w-64 bg-[#0a0a12] border-b md:border-b-0 md:border-r border-gray-900 flex flex-col justify-between flex-shrink-0 z-20">
        <div>
          {/* Logo Brand */}
          <div className="h-16 flex items-center gap-3 px-6 border-b border-gray-950">
            <div className="w-8 h-8 rounded bg-gradient-to-tr from-cyan-500 to-purple-500 flex items-center justify-center">
              <Shield className="w-5 h-5 text-white" />
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-bold tracking-wider bg-clip-text text-transparent bg-gradient-to-r from-cyan-400 to-purple-400">
                PULSEAPEX AI
              </span>
              <span className="text-[9px] uppercase tracking-widest text-cyan-400 font-bold">
                Agentic Auditor
              </span>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="p-4 space-y-1">
            {[
              { id: "dashboard", label: "Executive Dashboard", icon: Layers },
              { id: "upload", label: "Document Upload", icon: UploadCloud },
              { id: "workspace", label: "Audit Workspace", icon: ClipboardCheck },
              { id: "hitl", label: "HITL Reviews", icon: ShieldAlert, badge: pendingApprovals.length },
              { id: "agent-terminal", label: "Live Agents Feed", icon: Terminal, activeGlow: true },
              { id: "rules", label: "Compliance Rules", icon: BookOpen }
            ].map((item) => {
              const Icon = item.icon;
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    setActiveTab(item.id);
                    if (item.id === "workspace" && documents.length > 0 && !selectedDocId) {
                      setSelectedDocId(documents[0].id);
                    }
                  }}
                  className={`w-full flex items-center justify-between px-4 py-3 rounded-lg text-sm font-medium transition-all cursor-pointer ${
                    active 
                      ? 'bg-gradient-to-r from-cyan-950/45 to-transparent border-l-2 border-cyan-500 text-cyan-400' 
                      : 'text-gray-400 hover:text-gray-200 hover:bg-gray-900/40'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Icon className={`w-4 h-4 ${active ? 'text-cyan-400' : 'text-gray-400'}`} />
                    <span>{item.label}</span>
                  </div>
                  {item.badge !== undefined && item.badge > 0 && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/25">
                      {item.badge}
                    </span>
                  )}
                  {item.activeGlow && (
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* User profile footer */}
        <div className="p-4 border-t border-gray-950 bg-gray-950/20">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-9 h-9 rounded-full bg-gray-800 flex items-center justify-center border border-gray-700">
              <UserIcon className="w-4 h-4 text-gray-300" />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-xs font-semibold text-gray-200 truncate">{user?.full_name || "Guest Auditor"}</span>
              <span className="text-[10px] text-gray-500 truncate">{user?.email || "sandbox-session"}</span>
            </div>
          </div>

          <button
            onClick={logout}
            className="w-full flex items-center gap-2 justify-center py-2 rounded bg-gray-950 border border-gray-900 hover:bg-red-950/10 hover:border-red-500/20 hover:text-red-400 text-xs text-gray-400 transition-all cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Terminate Session</span>
          </button>
        </div>
      </aside>

      {/* 2. MAIN CONTENT AREA */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Top Header */}
        <header className="h-16 border-b border-gray-950 px-6 flex items-center justify-between bg-[#07070d]/60 backdrop-blur-md">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold text-gray-200 uppercase tracking-wider">
              {activeTab.replace("-", " ")}
            </h2>
          </div>

          {/* Connection status tag */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 bg-gray-950 px-3 py-1.5 rounded-full border border-gray-900 text-xs">
              <Activity className={`w-3.5 h-3.5 ${connectionMode === 'mock' || wsConnected ? 'text-emerald-500' : 'text-amber-500'}`} />
              <span className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider">
                {connectionMode === "mock" ? "Local Sandbox (Offline)" : `Live API: ${wsConnected ? 'Connected' : 'Reconnecting'}`}
              </span>
            </div>
          </div>
        </header>

        {/* Tab-driven panels wrapper */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* TAB 1: EXECUTIVE DASHBOARD */}
          {activeTab === "dashboard" && (
            <div className="space-y-6">
              {/* Headline Welcome Banner */}
              <div className="glass-panel p-6 rounded-2xl relative overflow-hidden bg-gradient-to-r from-cyan-950/20 via-transparent to-transparent">
                <div className="absolute top-0 right-0 w-64 h-full bg-[linear-gradient(to_left,rgba(6,182,212,0.05)_1px,transparent_1px)] bg-[size:16px_16px]" />
                <h3 className="text-xl font-bold text-gray-100 mb-2">Welcome to PulseApex Executive Intelligence Center</h3>
                <p className="text-sm text-gray-400 max-w-2xl leading-relaxed">
                  Real-time autonomous auditing is active. The agent network parses uploads, detects compliance discrepancies, and builds security patches. Review highlights below.
                </p>
              </div>

              {/* Stat Metric Cards grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                  { label: "Documents Processed", value: stats.docsProcessed, icon: FileText, color: "text-cyan-400", bg: "from-cyan-500/10" },
                  { label: "Average Compliance Score", value: `${stats.complianceScore}%`, icon: Shield, color: "text-emerald-400", bg: "from-emerald-500/10" },
                  { label: "Active Audit Pipeline", value: stats.activeAudits, icon: RefreshCw, color: "text-purple-400", bg: "from-purple-500/10" },
                  { label: "Critical Findings Block", value: stats.criticalFindings, icon: AlertTriangle, color: "text-red-400", bg: "from-red-500/10" }
                ].map((stat, idx) => {
                  const Icon = stat.icon;
                  return (
                    <div key={idx} className="glass-panel p-5 rounded-2xl flex items-center justify-between relative overflow-hidden">
                      <div className="space-y-2">
                        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{stat.label}</span>
                        <div className="text-3xl font-extrabold text-gray-100 tracking-tight">{stat.value}</div>
                      </div>
                      <div className={`w-12 h-12 rounded-xl bg-gradient-to-tr ${stat.bg} to-transparent flex items-center justify-center border border-gray-800`}>
                        <Icon className={`w-6 h-6 ${stat.color}`} />
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Two Column details: recent docs and system status */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Recent Documents list */}
                <div className="glass-panel p-6 rounded-2xl lg:col-span-2 space-y-4">
                  <div className="flex justify-between items-center pb-3 border-b border-gray-950">
                    <h4 className="font-bold text-gray-200 text-sm uppercase tracking-wider">Recent Document Submissions</h4>
                    <button 
                      onClick={() => setActiveTab("upload")}
                      className="text-xs text-cyan-400 font-bold hover:underline cursor-pointer"
                    >
                      Upload New File
                    </button>
                  </div>

                  <div className="space-y-2">
                    {documents.length === 0 ? (
                      <div className="text-center py-10 text-xs text-gray-500">No documents uploaded yet.</div>
                    ) : (
                      documents.map((doc) => (
                        <div key={doc.id} className="p-4 bg-gray-950/45 rounded-xl border border-gray-900 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded bg-gray-900 flex items-center justify-center border border-gray-800">
                              <FileText className="w-5 h-5 text-gray-400" />
                            </div>
                            <div className="flex flex-col">
                              <span className="text-sm font-semibold text-gray-300 max-w-[250px] sm:max-w-xs truncate">{doc.filename}</span>
                              <span className="text-[10px] text-gray-500 uppercase font-bold">{doc.file_type} • {(doc.file_size / 1024).toFixed(1)} KB</span>
                            </div>
                          </div>
                          
                          <div className="flex items-center gap-3 self-stretch sm:self-auto justify-between sm:justify-start">
                            {/* Document status badge */}
                            <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold border ${
                              doc.status === "completed" || doc.status === "audited" ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                              doc.status === "paused" ? 'bg-amber-500/10 text-amber-400 border-amber-500/20 animate-pulse' :
                              doc.status === "parsing" ? 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20' :
                              'bg-gray-800 text-gray-400 border-gray-700'
                            }`}>
                              {doc.status.toUpperCase()}
                            </span>

                            {doc.status === "uploaded" && (
                              <button
                                onClick={() => handleStartAudit(doc.id)}
                                className="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5"
                              >
                                <Play className="w-3 h-3" />
                                <span>Audit</span>
                              </button>
                            )}

                            {(doc.status === "audited" || doc.status === "completed" || doc.status === "paused") && (
                              <button
                                onClick={() => {
                                  setSelectedDocId(doc.id);
                                  setActiveTab("workspace");
                                }}
                                className="px-3 py-1.5 bg-gray-900 border border-gray-800 hover:bg-gray-800 text-gray-300 rounded text-xs font-semibold transition-all cursor-pointer"
                              >
                                View Results
                              </button>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Audit Health Overview panel */}
                <div className="glass-panel p-6 rounded-2xl flex flex-col justify-between">
                  <div className="space-y-4">
                    <h4 className="font-bold text-gray-200 text-sm uppercase tracking-wider pb-3 border-b border-gray-950">System Security Gauge</h4>
                    
                    {/* Visual Radial Gauge simulation */}
                    <div className="flex flex-col items-center py-6">
                      <div className="w-36 h-36 rounded-full border-4 border-gray-950 flex items-center justify-center relative shadow-inner bg-gray-950/20">
                        {/* Glow halo */}
                        <div className="absolute inset-0 rounded-full border-t-4 border-l-4 border-cyan-500 animate-spin" style={{ animationDuration: '6s' }} />
                        <div className="flex flex-col items-center">
                          <span className="text-4xl font-black text-glow-cyan text-cyan-400">96.4</span>
                          <span className="text-[9px] uppercase tracking-wider text-gray-500 font-bold mt-1">Health Index</span>
                        </div>
                      </div>
                    </div>

                    <p className="text-xs text-gray-400 text-center leading-relaxed">
                      Operational threshold active. Standard compliance metrics are satisfied. No unhandled critical errors outside HITL scope.
                    </p>
                  </div>

                  <div className="pt-4 border-t border-gray-950 mt-4 flex items-center justify-between text-xs text-gray-500 font-semibold">
                    <span>Audit Pipeline: ONLINE</span>
                    <span className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block animate-ping" />
                      <span>NO BACKLOG</span>
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: UPLOAD CENTER */}
          {activeTab === "upload" && (
            <div className="max-w-2xl mx-auto space-y-6">
              <div className="glass-panel p-6 rounded-2xl text-center space-y-4">
                <h3 className="text-lg font-bold text-gray-200">Upload New Audit Documents</h3>
                <p className="text-sm text-gray-400">
                  Select corporate agreements, legal contracts, CSV transactions, or financial Excel spreadsheets. Supported file types: PDF, DOCX, XLSX, CSV, TXT (Maximum size 25MB).
                </p>
              </div>

              {/* Drag & Drop Card */}
              <div
                onDragEnter={handleDrag}
                onDragOver={handleDrag}
                onDragLeave={handleDrag}
                onDrop={handleDrop}
                className={`glass-panel p-16 rounded-2xl border-2 border-dashed flex flex-col items-center justify-center gap-4 transition-all ${
                  dragActive ? 'border-cyan-500 bg-cyan-950/10' : 'border-gray-800 hover:border-gray-700'
                }`}
              >
                <div className="w-16 h-16 rounded-full bg-gray-950 flex items-center justify-center border border-gray-900 shadow-md">
                  <UploadCloud className="w-8 h-8 text-cyan-400" />
                </div>
                
                <div className="text-center space-y-1">
                  <span className="text-sm font-semibold text-gray-300 block">Drag & Drop file here, or</span>
                  <label className="text-xs text-cyan-400 font-bold hover:underline cursor-pointer block mt-1">
                    browse from directories
                    <input 
                      type="file" 
                      onChange={handleFileInput}
                      className="hidden" 
                      accept=".pdf,.docx,.xlsx,.csv,.txt"
                    />
                  </label>
                </div>
              </div>

              {/* Uploading Status */}
              {uploadingFile && (
                <div className="glass-panel p-5 rounded-2xl space-y-3 animate-pulse">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-semibold text-gray-300">Uploading: {uploadingFile}</span>
                    <span className="font-bold text-cyan-400">{uploadProgress}%</span>
                  </div>
                  <div className="w-full h-1.5 bg-gray-950 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-cyan-500 rounded-full transition-all duration-300"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: AUDIT WORKSPACE */}
          {activeTab === "workspace" && (
            <div className="space-y-6">
              {/* Document selection helper */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-gray-950">
                <div className="flex items-center gap-3 overflow-x-auto">
                  {documents.map((d) => (
                    <button
                      key={d.id}
                      onClick={() => setSelectedDocId(d.id)}
                      className={`px-4 py-2 rounded-lg text-xs font-semibold border flex items-center gap-2 whitespace-nowrap cursor-pointer transition-all ${
                        selectedDocId === d.id 
                          ? 'bg-cyan-950/30 text-cyan-400 border-cyan-500/40' 
                          : 'bg-transparent text-gray-500 border-gray-900 hover:text-gray-300'
                      }`}
                    >
                      <FileText className="w-3.5 h-3.5" />
                      <span>{d.filename}</span>
                    </button>
                  ))}
                </div>
                {documents.length > 0 && (
                  <button
                    onClick={() => {
                      fetchDocuments();
                      if (selectedDocId) {
                        fetchAuditForDoc(selectedDocId);
                      }
                    }}
                    className="px-3 py-1.5 bg-gray-950 border border-gray-900 hover:border-gray-800 text-gray-300 hover:text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer self-start sm:self-auto"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Sync Findings</span>
                  </button>
                )}
              </div>

              {!selectedDoc ? (
                <div className="text-center py-20 text-xs text-gray-500">Please select a document or upload one to inspect the workspace.</div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {/* Left Column: Metadata & Analysis timeline */}
                  <div className="space-y-6 lg:col-span-1">
                    {/* General Metadata Panel */}
                    <div className="glass-panel p-5 rounded-2xl space-y-4">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-gray-400">Document Insights</h4>
                      
                      <div className="space-y-3 text-xs">
                        <div className="flex justify-between">
                          <span className="text-gray-500">Filename:</span>
                          <span className="text-gray-300 truncate max-w-[180px] font-medium">{selectedDoc.filename}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-500">Formats:</span>
                          <span className="text-gray-300 font-bold uppercase">{selectedDoc.file_type}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-500">Upload Date:</span>
                          <span className="text-gray-400">{new Date(selectedDoc.created_at).toLocaleDateString()}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-500">Verification Status:</span>
                          <span className="text-cyan-400 font-bold uppercase">{selectedDoc.status}</span>
                        </div>
                      </div>
                    </div>

                    {/* Gauge score card */}
                    <div className="glass-panel p-5 rounded-2xl space-y-4 text-center">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-gray-400">Compliance Integrity Index</h4>
                      
                      <div className="py-2">
                        <div className="text-5xl font-black text-glow-cyan text-cyan-400">
                          {selectedAudit ? `${selectedAudit.compliance_score}%` : "100%"}
                        </div>
                        <span className="text-[10px] uppercase text-gray-500 tracking-wider font-bold mt-2 block">
                          Current Score Rating
                        </span>
                      </div>
                    </div>

                    {/* Agent reasoning timeline */}
                    <div className="glass-panel p-5 rounded-2xl space-y-4">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-gray-400">Agent Reasoning Log</h4>
                      
                      <div className="space-y-4 relative pl-4 border-l border-gray-900 text-xs">
                        <div className="relative">
                          <div className="absolute -left-[21px] w-2.5 h-2.5 rounded-full bg-cyan-400" />
                          <div className="font-semibold text-gray-300">Parser Agent</div>
                          <p className="text-gray-500 mt-1">Extracted document structures and metadata matrices successfully.</p>
                        </div>
                        <div className="relative">
                          <div className="absolute -left-[21px] w-2.5 h-2.5 rounded-full bg-purple-400" />
                          <div className="font-semibold text-gray-300">Compliance Auditor</div>
                          <p className="text-gray-500 mt-1">Cross-referenced content streams against active regulatory models.</p>
                        </div>
                        <div className="relative">
                          <div className="absolute -left-[21px] w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse" />
                          <div className="font-semibold text-gray-300">Verification Agent</div>
                          <p className="text-gray-500 mt-1">
                            {selectedDoc.status === 'paused' ? 'Violations identified. Raised pipeline locks.' : 'Completed verification.'}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Right Column: Findings details */}
                  <div className="lg:col-span-2 space-y-6">
                    {/* Findings list */}
                    <div className="glass-panel p-6 rounded-2xl space-y-4">
                      <h4 className="font-bold text-gray-200 text-sm uppercase tracking-wider pb-3 border-b border-gray-950">Discovered Anomalies</h4>

                      <div className="space-y-3">
                        {!selectedAudit || selectedAudit.findings.length === 0 ? (
                          <div className="text-center py-10 text-xs text-gray-500">No discrepancies identified in this document. Good health!</div>
                        ) : (
                          selectedAudit.findings.map((f) => (
                            <div key={f.id} className="p-4 bg-gray-950/60 border border-gray-900 rounded-xl space-y-3">
                              <div className="flex justify-between items-start">
                                <div className="space-y-1">
                                  <div className="flex items-center gap-2">
                                    <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold border ${
                                      f.severity === 'critical' ? 'bg-red-500/10 text-red-400 border-red-500/20' :
                                      f.severity === 'high' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' :
                                      'bg-cyan-500/10 text-cyan-400 border-cyan-500/20'
                                    }`}>
                                      {f.severity.toUpperCase()}
                                    </span>
                                    <h5 className="font-bold text-sm text-gray-300">{f.title}</h5>
                                  </div>
                                  <p className="text-xs text-gray-400 leading-relaxed">{f.description}</p>
                                </div>
                              </div>

                              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-3 border-t border-gray-900 text-xs">
                                <div className="p-2 bg-gray-950/40 border border-gray-900 rounded">
                                  <div className="text-[10px] text-gray-500 font-semibold mb-1 uppercase">Detected Value</div>
                                  <span className="font-mono text-red-400">{f.original_value || "N/A"}</span>
                                </div>
                                <div className="p-2 bg-gray-950/40 border border-gray-900 rounded">
                                  <div className="text-[10px] text-gray-500 font-semibold mb-1 uppercase">AI Proposed Patch</div>
                                  <span className="font-mono text-emerald-400">{f.proposed_value || "N/A"}</span>
                                </div>
                              </div>

                              <div className="flex justify-between items-center pt-2 text-[10px] font-semibold text-gray-500">
                                <span>Page: {f.page_number || "Cover"}</span>
                                <span>Reference: {f.compliance_reference || "Default Guidelines"}</span>
                                <span className={`uppercase font-bold ${
                                  f.status === 'approved' ? 'text-emerald-400' :
                                  f.status === 'rejected' ? 'text-red-400' :
                                  'text-amber-400'
                                }`}>
                                  Status: {f.status}
                                </span>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 4: HITL REVIEWS QUEUE */}
          {activeTab === "hitl" && (
            <div className="space-y-6">
              <div className="glass-panel p-6 rounded-2xl bg-gradient-to-r from-amber-950/10 via-transparent to-transparent">
                <h3 className="text-lg font-bold text-gray-200 mb-2 flex items-center gap-2">
                  <ShieldAlert className="w-5 h-5 text-amber-500" />
                  <span>Human-In-The-Loop Review Gateway</span>
                </h3>
                <p className="text-sm text-gray-400 max-w-2xl">
                  The agent network automatically halts pipeline execution when a high-risk policy violation is flagged. Audit logs wait for manual resolution inputs below.
                </p>
              </div>

              <div className="space-y-4">
                {pendingApprovals.length === 0 ? (
                  <div className="glass-panel p-10 rounded-2xl text-center text-xs text-gray-500">
                    <CheckCircle className="w-8 h-8 text-emerald-500 mx-auto mb-3" />
                    <span>No pending approval requests. The audit network has clear runways!</span>
                  </div>
                ) : (
                  pendingApprovals.map((req) => (
                    <div key={req.id} className="glass-panel p-6 rounded-2xl space-y-4">
                      <div className="flex justify-between items-start pb-3 border-b border-gray-950">
                        <div className="space-y-1">
                          <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">Audit Frame #{req.audit_id}</span>
                          <h4 className="font-bold text-base text-gray-300">{req.finding.title}</h4>
                        </div>
                        <span className="px-2.5 py-1 rounded bg-amber-500/10 border border-amber-500/25 text-[10px] font-bold text-amber-400 uppercase tracking-widest animate-pulse">
                          AWAITING DECISION
                        </span>
                      </div>

                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        <div className="space-y-3">
                          <h5 className="text-xs font-bold uppercase text-gray-400">Violation Details</h5>
                          <p className="text-xs text-gray-500 leading-relaxed bg-gray-950/40 p-3 border border-gray-900 rounded">
                            {req.finding.description}
                          </p>
                          <div className="flex gap-6 text-[10px] text-gray-500 font-semibold">
                            <span>Compliance Standard: {req.finding.compliance_reference}</span>
                            <span>Frame Page: {req.finding.page_number}</span>
                          </div>
                        </div>

                        {/* Proposal Override details */}
                        <div className="space-y-3">
                          <h5 className="text-xs font-bold uppercase text-gray-400">Split-Screen Patches</h5>
                          <div className="grid grid-cols-2 gap-3 text-xs">
                            <div className="p-3 bg-red-950/15 border border-red-500/15 rounded flex flex-col justify-between">
                              <span className="text-[9px] text-red-400/60 font-bold uppercase mb-2">Original Document</span>
                              <span className="font-mono text-red-300 break-words">{req.finding.original_value}</span>
                            </div>
                            <div className="p-3 bg-emerald-950/15 border border-emerald-500/15 rounded flex flex-col justify-between">
                              <span className="text-[9px] text-emerald-400/60 font-bold uppercase mb-2">AI Proposed Fix</span>
                              <span className="font-mono text-emerald-300 break-words">{req.finding.proposed_value}</span>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Decision override buttons */}
                      <div className="pt-4 border-t border-gray-950 flex gap-3 justify-end">
                        <button
                          onClick={() => handleDecideHITL(req.id, false, "Manual reject decision override.")}
                          className="px-4 py-2 border border-red-500/20 bg-red-950/10 hover:bg-red-950/30 text-red-400 rounded text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5"
                        >
                          <X className="w-3.5 h-3.5" />
                          <span>Reject Fix</span>
                        </button>
                        <button
                          onClick={() => handleDecideHITL(req.id, true, "Manual approval decision override.")}
                          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>Approve & Apply Patch</span>
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* TAB 5: LIVE AGENT ACTIVITY TERMINAL */}
          {activeTab === "agent-terminal" && (
            <div className="space-y-6 max-w-4xl mx-auto">
              <div className="glass-panel p-6 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <h3 className="text-lg font-bold text-gray-200 flex items-center gap-2">
                    <Cpu className="w-5 h-5 text-cyan-400" />
                    <span>Agent Stream Orchestration Hub</span>
                  </h3>
                  <p className="text-xs text-gray-400">
                    Watching collaboration between: Parser, Auditor, Patch Specialist, and Verification Agents.
                  </p>
                </div>
                {agentLogs.length > 0 && (
                  <button
                    onClick={clearAgentLogs}
                    className="px-3 py-1.5 bg-gray-950 border border-gray-900 text-gray-400 hover:text-gray-200 rounded text-xs font-semibold cursor-pointer"
                  >
                    Clear Terminal Feed
                  </button>
                )}
              </div>

              {/* Terminal Frame */}
              <div className="bg-[#020204] border border-gray-950 rounded-2xl shadow-2xl overflow-hidden">
                {/* Header panel */}
                <div className="bg-[#07070c] px-4 py-2 flex items-center justify-between border-b border-gray-950 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-red-500/20" />
                    <span className="w-3 h-3 rounded-full bg-amber-500/20" />
                    <span className="w-3 h-3 rounded-full bg-emerald-500/20" />
                  </div>
                  <span className="font-mono text-[10px] text-gray-600 uppercase">pulseapex_ai_terminal_log.log</span>
                </div>

                {/* Log list */}
                <div className="p-6 h-[400px] overflow-y-auto font-mono text-xs space-y-4">
                  {agentLogs.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-gray-600 text-center space-y-2">
                      <Terminal className="w-8 h-8 opacity-40 animate-pulse text-cyan-400" />
                      <span className="text-[10px] tracking-wider uppercase font-semibold">Terminal idle. Trigger an audit to view live stream.</span>
                    </div>
                  ) : (
                    agentLogs.map((log, idx) => (
                      <div key={idx} className="space-y-1 border-l-2 border-cyan-500/35 pl-3">
                        <div className="flex items-center gap-2 text-[10px] text-gray-500">
                          <span className="font-bold text-cyan-400">[{log.agent.toUpperCase()}]</span>
                          <span>{log.timestamp}</span>
                        </div>
                        <p className="text-gray-200">{log.message}</p>
                        {log.thought && (
                          <div className="p-2 bg-gray-950/40 border border-gray-950 rounded text-gray-500 text-[10px] italic mt-1">
                            <span className="font-bold text-purple-400/70 not-italic block uppercase text-[8px] tracking-widest mb-0.5">Agent Internal Thoughts:</span>
                            {log.thought}
                          </div>
                        )}
                      </div>
                    ))
                  )}
                  <div ref={terminalEndRef} />
                </div>
              </div>
            </div>
          )}

          {/* TAB 6: COMPLIANCE RULES */}
          {activeTab === "rules" && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Rule Upload form */}
                <div className="lg:col-span-1">
                  <div className="glass-panel p-6 rounded-2xl space-y-4">
                    <h4 className="font-bold text-gray-200 text-sm uppercase tracking-wider pb-3 border-b border-gray-950">Ingest Policy Guidelines</h4>

                    <form onSubmit={handleAddRule} className="space-y-4">
                      <div>
                        <label className="block text-xs font-semibold uppercase text-gray-400 mb-1 tracking-wider">Rule Reference Title</label>
                        <input
                          type="text"
                          required
                          value={newRuleTitle}
                          onChange={(e) => setNewRuleTitle(e.target.value)}
                          placeholder="e.g., Dual Sign-off Guideline"
                          className="w-full px-4 py-2 bg-gray-950 border border-gray-800 rounded-lg focus:outline-none focus:border-cyan-500 text-sm text-gray-200"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold uppercase text-gray-400 mb-1 tracking-wider">Auditing Category</label>
                        <select
                          value={newRuleCategory}
                          onChange={(e) => setNewRuleCategory(e.target.value)}
                          className="w-full px-4 py-2 bg-gray-950 border border-gray-800 rounded-lg focus:outline-none focus:border-cyan-500 text-sm text-gray-300"
                        >
                          <option value="Tax">Tax & Finance</option>
                          <option value="Contract">Contracts & Legal</option>
                          <option value="Procurement">Procurement</option>
                          <option value="Governance">Governance</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold uppercase text-gray-400 mb-1 tracking-wider">Policy Text Content (Chunked for RAG)</label>
                        <textarea
                          required
                          rows={4}
                          value={newRuleText}
                          onChange={(e) => setNewRuleText(e.target.value)}
                          placeholder="Provide the compliance policy paragraph. The auditor agent will run semantic indexing on this text."
                          className="w-full px-4 py-2 bg-gray-950 border border-gray-800 rounded-lg focus:outline-none focus:border-cyan-500 text-sm text-gray-200"
                        />
                      </div>

                      <button
                        type="submit"
                        className="w-full py-2.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg font-bold text-xs transition-all shadow-md shadow-cyan-500/10 cursor-pointer"
                      >
                        Ingest & Vector Index Rule
                      </button>
                    </form>
                  </div>
                </div>

                {/* Rules inventory list */}
                <div className="lg:col-span-2">
                  <div className="glass-panel p-6 rounded-2xl space-y-4">
                    <h4 className="font-bold text-gray-200 text-sm uppercase tracking-wider pb-3 border-b border-gray-950">Active Compliance Guidelines</h4>

                    <div className="space-y-3">
                      {complianceRules.length === 0 ? (
                        <div className="text-center py-10 text-xs text-gray-500">No custom compliance rules added yet.</div>
                      ) : (
                        complianceRules.map((rule) => (
                          <div key={rule.id} className="p-4 bg-gray-950/45 border border-gray-900 rounded-xl space-y-2">
                            <div className="flex justify-between items-start">
                              <h5 className="font-bold text-sm text-cyan-400">{rule.title}</h5>
                              <span className="px-2 py-0.5 rounded-full text-[9px] font-bold border bg-gray-900 text-gray-400 border-gray-800 uppercase">
                                {rule.category}
                              </span>
                            </div>
                            <p className="text-xs text-gray-400 leading-relaxed">{rule.rule_text}</p>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
