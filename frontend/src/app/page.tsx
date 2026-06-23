"use client";

import React, { useState, useEffect, useRef } from "react";
import { 
  usePulseApexStore, Document, Audit 
} from "../store";
import { 
  Shield, UploadCloud, Layers, ClipboardCheck, Terminal, BookOpen, FolderOpen, PieChart,
  Settings, User as UserIcon, LogOut, CheckCircle, AlertTriangle, 
  XCircle, Play, Info, ArrowRight, RefreshCw, Check, X, FileText,
  AlertCircle, ShieldAlert, Cpu, Activity, Search, ChevronUp, ChevronDown,
  MoreHorizontal, Sparkles, Edit, Trash2, Mail, Lock, Eye, EyeOff
} from "lucide-react";
import { API_BASE_URL, WS_BASE_URL } from "../config/api";
import NativeDashboard from "../components/Dashboard";

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
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  
  // Real-time API config
  const [connectionMode, setConnectionMode] = useState<"mock" | "live">("live");
  const [wsConnected, setWsConnected] = useState(false);

  // File Upload states
  const [dragActive, setDragActive] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadingFile, setUploadingFile] = useState<string | null>(null);

  // Optional Compliance Rules Management state
  const [showRulesManager, setShowRulesManager] = useState(false);
  const [rulesIngestionMode, setRulesIngestionMode] = useState<"automated" | "manual">("automated");
  const [isProcessingRules, setIsProcessingRules] = useState(false);
  const [rulesDragActive, setRulesDragActive] = useState(false);

  // New Compliance Rule manual state
  const [newRuleTitle, setNewRuleTitle] = useState("");
  const [newRuleCategory, setNewRuleCategory] = useState("Tax");
  const [newRuleSeverity, setNewRuleSeverity] = useState("Medium");
  const [newRuleText, setNewRuleText] = useState("");
  const [complianceRules, setComplianceRules] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState("");

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
            compliance_reference: "Rule SOC2-Sec4",
            ai_confidence_score: 88.5
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
        const socket = new WebSocket(`${WS_BASE_URL}?token=${cleanToken}`);
        wsRef.current = socket;

        socket.onopen = () => {
          setWsConnected(true);
        };

        socket.onmessage = (event) => {
          console.log("RAW WEBSOCKET DATA RECEIVED:", event.data);
          try {
            const data = JSON.parse(event.data);
            const state = usePulseApexStore.getState();

            if (data.type === "agent_log") {
              // Ensure we only show logs for the currently selected audit's document
              const currentDocId = state.selectedDocId;
              const currentAudit = currentDocId ? state.audits[currentDocId] : null;
              
              if (!currentAudit || data.audit_id === currentAudit.id) {
                addAgentLog({
                  agent: data.agent_name,
                  message: data.message,
                  thought: data.agent_thought || "",
                  timestamp: new Date().toLocaleTimeString()
                });
              }
            } else if (data.type === "audit_update") {
              // Refresh documents globally
              fetchDocuments();
              
              // Find the document associated with this completed audit
              const targetDocId = Object.keys(state.audits).find(
                docId => state.audits[Number(docId)]?.id === data.audit_id
              );
              
              if (targetDocId) {
                fetchAuditForDoc(Number(targetDocId));
              } else if (state.selectedDocId) {
                // Fallback: just refresh the current one
                fetchAuditForDoc(state.selectedDocId);
              }
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
  }, [connectionMode, token, WS_BASE_URL]);

  // API Fetch Helpers
  const fetchDocuments = async (overrideToken?: string) => {
    if (connectionMode === "mock") return;
    try {
      const activeToken = overrideToken || token;
      let baseDocumentsUrl = `${API_BASE_URL}/documents`;
      const res = await fetch(baseDocumentsUrl, {
        headers: { Authorization: `Bearer ${activeToken}` }
      });
      if (res.ok) {
        const data = await res.json();
        setDocuments(data);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchAuditForDoc = async (docId: number, overrideToken?: string) => {
    if (connectionMode === "mock") return;
    try {
      const activeToken = overrideToken || token;
      let rawDocId = docId;
      const strictId = String(rawDocId || "").split(':')[0].replace(/[^0-9]/g, '');
      const res = await fetch(`${API_BASE_URL}/audits/document/${strictId}`, {
        headers: { Authorization: `Bearer ${activeToken}` }
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
    if (selectedDocId && token && connectionMode === "live" && !audits[selectedDocId]) {
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
        const res = await fetch(`${API_BASE_URL}/auth/register`, {
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

        const res = await fetch(`${API_BASE_URL}/auth/login`, {
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
        const userRes = await fetch(`${API_BASE_URL}/auth/me`, {
          headers: { Authorization: `Bearer ${tokenData.access_token}` }
        });
        if (userRes.ok) {
          const userData = await userRes.json();
          setUser(userData);
        }
        fetchDocuments(tokenData.access_token);
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
      const res = await fetch(`${API_BASE_URL}/audits/trigger/${strictId}`, {
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
    if (!token && connectionMode === "live") {
      alert("Please sign in to upload documents.");
      return;
    }
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
      const res = await fetch(`${API_BASE_URL}/documents/upload`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData
      });
      if (res.ok) {
        const data = await res.json();
        addDocument(data);

        // Immediately trigger the audit so an audit record exists before any GET
        try {
          const triggerRes = await fetch(`${API_BASE_URL}/audits/trigger/${data.id}`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` }
          });
          if (triggerRes.ok) {
            const auditData = await triggerRes.json();
            setAudit(data.id, auditData);
            clearAgentLogs();
          }
        } catch (triggerErr) {
          console.error("Failed to auto-trigger audit", triggerErr);
        }

        setUploadingFile(null);
        setSelectedDocId(data.id);
        setActiveTab("agent-terminal");
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
      const res = await fetch(`${API_BASE_URL}/hitl/decide`, {
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
        const approvalsRes = await fetch(`${API_BASE_URL}/hitl/pending`, {
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
      const res = await fetch(`${API_BASE_URL}/compliance`, {
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
      <div className="flex-1 flex flex-col items-center justify-center p-6 bg-[#F8F9FA] relative overflow-hidden min-h-screen">
        {/* Decorative Grid Patterns and Subtle Light Glows */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(99,102,241,0.03)_1px,transparent_1px),linear-gradient(to_bottom,rgba(99,102,241,0.03)_1px,transparent_1px)] bg-[size:24px_24px] pointer-events-none" />
        <div className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full bg-indigo-500/5 blur-3xl pointer-events-none" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 rounded-full bg-sky-500/5 blur-3xl pointer-events-none" />

        {/* LOGO & BRAND */}
        <div className="flex flex-col items-center gap-2 mb-6 relative z-10">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center shadow-md shadow-indigo-500/25">
              <Shield className="w-5 h-5 text-white" />
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-extrabold tracking-wide text-slate-800">PULSEAPEX AI</span>
              <span className="text-[9px] uppercase tracking-widest text-slate-400 font-bold -mt-0.5">Agentic Auditor</span>
            </div>
          </div>
        </div>

        {/* SPLIT-PANEL CARD */}
        <div className="w-full max-w-4xl bg-white rounded-3xl shadow-xl border border-slate-200/60 overflow-hidden flex flex-col md:flex-row min-h-[580px] relative z-10">
          
          {/* LEFT PANEL (FORM) */}
          <div className="w-full md:w-1/2 p-8 flex flex-col justify-between">
            <div>
              <h2 className="text-xl font-bold text-slate-800">Welcome to PulseApex AI Auditor</h2>
              <p className="text-xs text-slate-400 mt-1 mb-6">Login or Register to Autonomously Audit your Documents.</p>

              <form onSubmit={handleAuth} className="space-y-4">
                {isRegistering && (
                  <>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1.5">Full Name</label>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                          <UserIcon className="w-4 h-4" />
                        </div>
                        <input
                          type="text"
                          required
                          value={fullName}
                          onChange={(e) => setFullName(e.target.value)}
                          placeholder="John Doe"
                          className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 text-sm text-slate-800 placeholder:text-slate-400"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1.5">Organization Name</label>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                          <Cpu className="w-4 h-4" />
                        </div>
                        <input
                          type="text"
                          required
                          value={orgName}
                          onChange={(e) => setOrgName(e.target.value)}
                          placeholder="Acme Corp"
                          className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 text-sm text-slate-800 placeholder:text-slate-400"
                        />
                      </div>
                    </div>
                  </>
                )}

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">Email Address</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                      <Mail className="w-4 h-4" />
                    </div>
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="Email Address"
                      className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 text-sm text-slate-800 placeholder:text-slate-400"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">Password</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                      <Lock className="w-4 h-4" />
                    </div>
                    <input
                      type={showPassword ? "text" : "password"}
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Password"
                      className="w-full pl-10 pr-10 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 text-sm text-slate-800 placeholder:text-slate-400"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-600 cursor-pointer"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {!isRegistering && (
                  <div className="flex justify-end">
                    <span className="text-xs font-semibold text-indigo-600 hover:underline cursor-pointer">Forgot Password?</span>
                  </div>
                )}

                {error && (
                  <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-600 flex items-center gap-2 shadow-sm">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    <span>{error}</span>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-sm transition-all shadow-md shadow-indigo-500/20 flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  {loading ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      <span>{isRegistering ? "Register Now" : "Sign In"}</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </form>

              {/* Toggle Tab link */}
              <div className="text-center mt-4">
                <span className="text-xs text-slate-500">
                  {isRegistering ? "Already have an account? " : "New to PulseApex? "}
                  <button
                    type="button"
                    onClick={() => { setIsRegistering(!isRegistering); setError(""); }}
                    className="font-bold text-indigo-600 hover:underline cursor-pointer"
                  >
                    {isRegistering ? "Sign In" : "Register Now"}
                  </button>
                </span>
              </div>

              {/* OAuth Segment */}
              <div className="relative my-5">
                <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-100" /></div>
                <div className="relative flex justify-center text-[10px] uppercase font-bold text-slate-400"><span className="bg-white px-2">Or Sign in with</span></div>
              </div>

              <div className="flex justify-center gap-3">
                {/* Google Button */}
                <button type="button" className="w-10 h-10 rounded-xl border border-slate-200 hover:bg-slate-50 transition-colors flex items-center justify-center cursor-pointer shadow-sm">
                  <svg className="w-4 h-4" viewBox="0 0 24 24">
                    <path fill="#EA4335" d="M12 5.04c1.62 0 3.08.56 4.22 1.65l3.15-3.15C17.45 1.84 14.97 1 12 1 7.35 1 3.39 3.65 1.5 7.5l3.6 2.8C6.01 7.22 8.77 5.04 12 5.04z" />
                    <path fill="#4285F4" d="M23.49 12.27c0-.81-.07-1.59-.2-2.33H12v4.51h6.44c-.28 1.47-1.11 2.71-2.36 3.55l3.64 2.83c2.13-1.97 3.41-4.87 3.41-8.56z" />
                    <path fill="#FBBC05" d="M5.1 14.7c-.24-.72-.38-1.49-.38-2.3s.14-1.58.38-2.3L1.5 7.3C.54 9.22 0 11.37 0 13.6c0 2.23.54 4.38 1.5 6.3l3.6-2.82-1-2.38z" />
                    <path fill="#34A853" d="M12 23c3.24 0 5.97-1.07 7.96-2.91l-3.64-2.83c-1.1.74-2.51 1.18-4.32 1.18-3.23 0-5.99-2.18-6.96-5.26l-3.6 2.8C3.39 20.35 7.35 23 12 23z" />
                  </svg>
                </button>
                {/* Azure Button */}
                <button type="button" className="w-10 h-10 rounded-xl border border-slate-200 hover:bg-slate-50 transition-colors flex items-center justify-center cursor-pointer shadow-sm">
                  <svg className="w-4 h-4" viewBox="0 0 23 23">
                    <rect x="0" y="0" width="11" height="11" fill="#F25022" />
                    <rect x="12" y="0" width="11" height="11" fill="#7FBA00" />
                    <rect x="0" y="12" width="11" height="11" fill="#00A1F1" />
                    <rect x="12" y="12" width="11" height="11" fill="#FFB900" />
                  </svg>
                </button>
                {/* Okta/Other Icon Button */}
                <button type="button" className="w-10 h-10 rounded-xl border border-slate-200 hover:bg-slate-50 transition-colors flex items-center justify-center cursor-pointer shadow-sm text-slate-700">
                  <Shield className="w-4 h-4 text-slate-800" />
                </button>
              </div>
            </div>

            {/* Connection Mode Settings inside Auth for developers */}
            <div className="pt-4 border-t border-slate-100 mt-6 flex flex-col gap-2">
              <details className="cursor-pointer group">
                <summary className="text-[10px] font-bold uppercase text-slate-400 tracking-wider list-none flex items-center gap-1 hover:text-slate-600 transition-colors select-none">
                  <ChevronDown className="w-3.5 h-3.5 group-open:rotate-180 transition-transform" />
                  <span>Integration Config</span>
                </summary>
                <div className="flex flex-col gap-2 mt-2">
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setConnectionMode("mock")}
                      className={`flex-1 py-1 rounded-lg text-[9px] font-bold border transition-colors ${connectionMode === "mock" ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'bg-transparent text-slate-400 border-slate-200 hover:text-slate-600'}`}
                    >
                      LOCAL SANDBOX
                    </button>
                    <button
                      type="button"
                      onClick={() => setConnectionMode("live")}
                      className={`flex-1 py-1 rounded-lg text-[9px] font-bold border transition-colors ${connectionMode === "live" ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'bg-transparent text-slate-400 border-slate-200 hover:text-slate-600'}`}
                    >
                      LIVE API
                    </button>
                  </div>
                  {connectionMode === "live" && (
                    <div className="flex flex-col gap-1 mt-1">
                      <input
                        type="text"
                        value={API_BASE_URL} readOnly
                        placeholder="API Endpoint"
                        className="w-full px-2.5 py-1 bg-slate-50 border border-slate-200 rounded-lg text-[9px] text-slate-500 focus:outline-none"
                      />
                      <input
                        type="text"
                        value={WS_BASE_URL} readOnly
                        placeholder="WS Endpoint"
                        className="w-full px-2.5 py-1 bg-slate-50 border border-slate-200 rounded-lg text-[9px] text-slate-500 focus:outline-none"
                      />
                    </div>
                  )}
                </div>
              </details>
            </div>
          </div>

          {/* RIGHT PANEL (VALUE PROPOSITION) */}
          <div className="w-full md:w-1/2 bg-gradient-to-br from-indigo-50 via-slate-50 to-indigo-100/50 p-8 flex flex-col justify-between border-l border-slate-200/50 relative overflow-hidden">
            {/* Visual Overlays */}
            <div className="absolute -top-10 -right-10 w-40 h-40 bg-indigo-500/10 rounded-full blur-xl pointer-events-none" />
            <div className="absolute -bottom-10 -left-10 w-40 h-40 bg-sky-500/10 rounded-full blur-xl pointer-events-none" />
            
            {/* Network nodes diagram */}
            <div className="relative flex items-center justify-center py-6">
              <div className="relative w-44 h-44 flex items-center justify-center">
                {/* Central checkmark shield node */}
                <div className="w-16 h-16 rounded-2xl bg-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-500/30 z-10 border border-indigo-400">
                  <Shield className="w-7 h-7 text-white" />
                </div>
                
                {/* Connected nodes */}
                <div className="absolute top-2 left-6 w-8 h-8 rounded-lg bg-white border border-slate-200 shadow-sm flex items-center justify-center text-slate-500 animate-bounce" style={{ animationDuration: '3s' }}><Cpu className="w-4 h-4 text-indigo-500" /></div>
                <div className="absolute top-8 right-4 w-8 h-8 rounded-lg bg-white border border-slate-200 shadow-sm flex items-center justify-center text-slate-500 animate-bounce" style={{ animationDuration: '4s' }}><Layers className="w-4 h-4 text-sky-500" /></div>
                <div className="absolute bottom-6 left-4 w-8 h-8 rounded-lg bg-white border border-slate-200 shadow-sm flex items-center justify-center text-slate-500 animate-bounce" style={{ animationDuration: '5s' }}><ClipboardCheck className="w-4 h-4 text-emerald-500" /></div>
                <div className="absolute bottom-4 right-10 w-8 h-8 rounded-lg bg-white border border-slate-200 shadow-sm flex items-center justify-center text-slate-500 animate-bounce" style={{ animationDuration: '6.5s' }}><FileText className="w-4 h-4 text-amber-500" /></div>

                {/* Connecting SVG lines */}
                <svg className="absolute inset-0 w-full h-full text-indigo-200 pointer-events-none">
                  <line x1="88" y1="88" x2="36" y2="24" stroke="currentColor" strokeWidth="1.5" strokeDasharray="4 4" />
                  <line x1="88" y1="88" x2="152" y2="48" stroke="currentColor" strokeWidth="1.5" strokeDasharray="4 4" />
                  <line x1="88" y1="88" x2="32" y2="148" stroke="currentColor" strokeWidth="1.5" strokeDasharray="4 4" />
                  <line x1="88" y1="88" x2="136" y2="156" stroke="currentColor" strokeWidth="1.5" strokeDasharray="4 4" />
                </svg>
              </div>
            </div>

            {/* Value Props Text */}
            <div className="space-y-4 relative z-10">
              <h3 className="text-lg font-extrabold text-slate-800 tracking-tight leading-snug">
                Automated Compliance Auditing and Patching.
              </h3>
              
              <ul className="space-y-2.5">
                {[
                  "Real-time Autonomous Scanning.",
                  "Compliance Discrepancy Detection.",
                  "Automatic Security Patches.",
                  "Centralized Threat View."
                ].map((val, idx) => (
                  <li key={idx} className="flex items-center gap-2.5 text-xs font-semibold text-slate-600">
                    <div className="w-4 h-4 rounded-full bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-600 flex-shrink-0">
                      <Check className="w-2.5 h-2.5" />
                    </div>
                    <span>{val}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        {/* BOTTOM EXTERNAL FOOTER */}
        <div className="text-[10px] text-slate-400 font-bold tracking-wide mt-8 relative z-10 flex gap-4">
          <span className="hover:text-slate-600 cursor-pointer">Support Center</span>
          <span className="text-slate-300">&bull;</span>
          <span className="hover:text-slate-600 cursor-pointer">API Documentation</span>
          <span className="text-slate-300">&bull;</span>
          <span>&copy; 2026 PulseApex AI</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col md:flex-row h-screen overflow-hidden bg-[#F8F9FA]">
      {/* SIDEBAR */}
      <aside className="w-full md:w-56 bg-white border-b md:border-b-0 md:border-r border-slate-200 flex flex-col justify-between flex-shrink-0 z-20">
        <div>
          <div className="h-14 flex items-center gap-3 px-5 border-b border-slate-100">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center">
              <Shield className="w-4 h-4 text-white" />
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-extrabold tracking-wide text-slate-800">PULSEAPEX AI</span>
              <span className="text-[9px] uppercase tracking-widest text-slate-400 font-semibold">Agentic Auditor</span>
            </div>
          </div>
          <nav className="p-3 space-y-1">
            {( [
              { id: "audit", label: "Audit & Files", icon: FolderOpen, sparkle: true },
              { id: "overview", label: "Overview", icon: PieChart, sparkle: false }
            ] as any[] ).map((item) => {
              const Icon = item.icon;
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-all cursor-pointer ${
                    active ? 'bg-indigo-600 text-white shadow-md shadow-indigo-500/25' : 'text-slate-600 hover:text-slate-800 hover:bg-slate-50'
                  }`}
                >
                  <Icon className={`w-4 h-4 ${active ? 'text-white' : 'text-slate-400'}`} />
                  <span>{item.label}</span>
                  {item.sparkle && active && <Sparkles className="w-3.5 h-3.5 text-indigo-200 ml-auto" />}
                </button>
              );
            })}
          </nav>
        </div>
        <div className="p-4 border-t border-slate-100">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center border border-slate-200">
              <UserIcon className="w-4 h-4 text-slate-500" />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-xs font-semibold text-slate-700 truncate">{user?.full_name || "Guest Auditor"}</span>
              <span className="text-[10px] text-slate-400 truncate">{user?.email || "sandbox-session"}</span>
            </div>
          </div>
          <button onClick={logout} className="w-full flex items-center gap-2 justify-center py-2 rounded-lg bg-slate-50 border border-slate-200 hover:bg-red-50 hover:border-red-200 hover:text-red-500 text-xs text-slate-500 transition-all cursor-pointer">
            <LogOut className="w-3.5 h-3.5" /><span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* MAIN CONTENT */}
      <main className="flex-1 flex flex-col overflow-hidden">
        <header className="h-14 border-b border-slate-200 px-6 flex items-center justify-between bg-white flex-shrink-0">
          <h2 className="text-base font-bold text-slate-800">PulseApex Agentic Auditor</h2>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-emerald-200 bg-emerald-50">
              <div className={`w-2 h-2 rounded-full ${connectionMode === 'mock' || wsConnected ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
              <span className="text-[11px] text-emerald-700 font-bold uppercase tracking-wider">
                {connectionMode === "mock" ? "Local Sandbox" : `Live API: ${wsConnected ? 'Operational' : 'Reconnecting'}`}
              </span>
            </div>
            <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 w-48">
              <Search className="w-3.5 h-3.5 text-slate-400" />
              <input type="text" placeholder="Search" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="bg-transparent text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none w-full" />
            </div>
            <div className="w-8 h-8 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center cursor-pointer hover:border-slate-300 transition-colors">
              <UserIcon className="w-4 h-4 text-slate-500" />
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-6">
          {/* TAB: AUDIT & FILES */}
          {activeTab === "audit" && (
            <div className="space-y-8 max-w-[1400px] mx-auto">
              <div>
                <h1 className="text-xl font-bold text-slate-800">PulseApex Audit Workspace</h1>
                <p className="text-sm text-slate-500 mt-1">Combine document auditing, file handling, and rule configuration in one unified interface.</p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
                {/* MODULE 1 */}
                <div className="lg:col-span-2 space-y-3">
                  <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Module 1: Document Upload & Primary Action</h3>
                  <div className="premium-card p-6">
                    <div onDragEnter={handleDrag} onDragOver={handleDrag} onDragLeave={handleDrag} onDrop={handleDrop}
                      className={`border-2 border-dashed rounded-xl p-8 text-center transition-all cursor-pointer ${dragActive ? 'border-indigo-500 bg-indigo-50' : 'border-slate-300 bg-slate-50/50 hover:bg-slate-50 hover:border-slate-400'}`}
                      onClick={() => document.getElementById('file-input')?.click()}>
                      <UploadCloud className={`w-10 h-10 mx-auto mb-3 ${dragActive ? 'text-indigo-500' : 'text-slate-400'}`} />
                      <p className="text-sm font-semibold text-slate-700">Drag & Drop Files Here (PDF, Images, Word)</p>
                      <input id="file-input" type="file" className="hidden" accept=".pdf,.docx,.xlsx,.csv,.txt,.png,.jpg,.jpeg" onChange={handleFileInput} />
                    </div>
                    <button onClick={() => { const u = documents.find(d => d.status === 'uploaded'); if (u) handleStartAudit(u.id); }}
                      className="mt-4 w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold text-sm transition-all cursor-pointer shadow-md shadow-indigo-500/20">Start New Audit</button>
                    {uploadingFile && (
                      <div className="mt-4 space-y-2 pt-4 border-t border-slate-100">
                        <div className="flex justify-between text-xs text-slate-600"><span className="font-semibold">Current Uploads (PDF, Images, Word)</span><span className="text-slate-400">Progress</span></div>
                        <div>
                          <div className="flex justify-between text-xs mb-1"><span className="text-slate-600 truncate max-w-[200px]">{uploadingFile}</span><span className="text-indigo-600 font-bold">{uploadProgress}%</span></div>
                          <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-indigo-500 rounded-full transition-all duration-300" style={{ width: `${uploadProgress}%` }} /></div>
                        </div>
                      </div>
                    )}
                    {!uploadingFile && documents.length > 0 && (
                      <div className="mt-4 space-y-2 pt-4 border-t border-slate-100">
                        <div className="flex justify-between text-xs text-slate-600"><span className="font-semibold">Recent Uploads</span><span className="text-slate-400">Status</span></div>
                        {documents.slice(0, 2).map(doc => (
                          <div key={doc.id} className="flex justify-between text-xs">
                            <span className="text-slate-600 truncate max-w-[200px]">{doc.filename}</span>
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${doc.status === 'audited' ? 'bg-emerald-50 text-emerald-700' : doc.status === 'uploaded' ? 'bg-blue-50 text-blue-700' : 'bg-amber-50 text-amber-700'}`}>{doc.status}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* MODULE 2 */}
                <div className="lg:col-span-3 space-y-3">
                  <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Module 2: Configure Compliance Rules (Optional)</h3>
                  <div className="premium-card">
                    <button onClick={() => setShowRulesManager(!showRulesManager)} className="w-full flex items-center justify-between p-5 cursor-pointer hover:bg-slate-50 transition-colors rounded-xl">
                      <span className="text-sm font-bold text-slate-700">Rules Ingestion and Management (Optional)</span>
                      {showRulesManager ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                    </button>
                    {showRulesManager && (
                      <div className="px-5 pb-5">
                        <div className="flex flex-col md:flex-row gap-6 items-stretch">
                          <div className="flex-1 border border-slate-200 rounded-xl p-5 space-y-4">
                            <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Option A: Document Ingestion (PDF, Image, Word)</h4>
                            <div className={`border-2 border-dashed rounded-xl p-6 text-center transition-all cursor-pointer ${rulesDragActive ? 'border-indigo-500 bg-indigo-50' : 'border-slate-300 bg-slate-50/50 hover:bg-slate-50'}`}
                              onDragEnter={() => setRulesDragActive(true)} onDragLeave={() => setRulesDragActive(false)} onDragOver={(e) => e.preventDefault()}
                              onDrop={(e) => { e.preventDefault(); setRulesDragActive(false); setIsProcessingRules(true); setTimeout(() => setIsProcessingRules(false), 3000); }}>
                              {isProcessingRules ? (
                                <div className="flex flex-col items-center gap-2"><RefreshCw className="w-8 h-8 text-indigo-600 animate-spin" /><p className="text-sm font-semibold text-slate-700">AI Processing...</p></div>
                              ) : (
                                <div className="flex flex-col items-center gap-2">
                                  <div className="w-14 h-14 rounded-full bg-indigo-50 border-2 border-dashed border-indigo-300 flex items-center justify-center"><Cpu className="w-6 h-6 text-indigo-500" /></div>
                                  <p className="text-sm font-semibold text-slate-700 mt-1">Upload Corporate Rulebooks for AI Parsing</p>
                                </div>
                              )}
                            </div>
                            <button className="w-full py-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-lg font-semibold text-xs transition-all cursor-pointer">Process Document Rules</button>
                          </div>
                          <div className="flex items-center justify-center"><span className="text-sm font-bold text-slate-400 px-2">OR</span></div>
                          <div className="flex-1 border border-slate-200 rounded-xl p-5 space-y-3">
                            <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Option B: Manual Form Ingestion</h4>
                            <form onSubmit={handleAddRule} className="space-y-3">
                              <p className="text-xs font-bold text-slate-600">Step 1: Rule Details</p>
                              <div className="grid grid-cols-2 gap-3">
                                <input type="text" required value={newRuleTitle} onChange={(e) => setNewRuleTitle(e.target.value)} placeholder="Rule Name" className="px-3 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 text-sm text-slate-700 placeholder:text-slate-400" />
                                <select value={newRuleCategory} onChange={(e) => setNewRuleCategory(e.target.value)} className="px-3 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 text-sm text-slate-700">
                                  <option value="Tax">Tax & Finance</option><option value="GDPR">GDPR</option><option value="Contract">Contracts & Legal</option><option value="Governance">Governance</option>
                                </select>
                              </div>
                              <p className="text-xs font-bold text-slate-600">Step 2: Severity</p>
                              <div className="grid grid-cols-2 gap-3">
                                <select value={newRuleSeverity} onChange={(e) => setNewRuleSeverity(e.target.value)} className="px-3 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 text-sm text-slate-700">
                                  <option value="Critical">Critical</option><option value="High">High</option><option value="Medium">Medium</option><option value="Low">Low</option>
                                </select>
                                <input type="text" required value={newRuleText} onChange={(e) => setNewRuleText(e.target.value)} placeholder="Description" className="px-3 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 text-sm text-slate-700 placeholder:text-slate-400" />
                              </div>
                              <button type="submit" className="w-full py-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-lg font-semibold text-xs transition-all cursor-pointer">Add Rule Manually</button>
                            </form>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* MODULE 3 */}
              <div className="space-y-3">
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Module 3: Current Files & Audit Status Table</h3>
                <div className="premium-card overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-100">
                          <th className="text-left px-5 py-3.5 text-xs font-bold text-slate-500 uppercase tracking-wider"><div className="flex items-center gap-1 cursor-pointer hover:text-slate-700">File Name <ChevronDown className="w-3 h-3" /></div></th>
                          <th className="text-left px-5 py-3.5 text-xs font-bold text-slate-500 uppercase tracking-wider">Upload Date</th>
                          <th className="text-left px-5 py-3.5 text-xs font-bold text-slate-500 uppercase tracking-wider">Status</th>
                          <th className="text-left px-5 py-3.5 text-xs font-bold text-slate-500 uppercase tracking-wider">Compliance Category</th>
                          <th className="text-left px-5 py-3.5 text-xs font-bold text-slate-500 uppercase tracking-wider">Agent Patches</th>
                          <th className="text-left px-5 py-3.5 text-xs font-bold text-slate-500 uppercase tracking-wider">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {documents.length === 0 ? (
                          <tr><td colSpan={6} className="text-center py-10 text-sm text-slate-400">No documents uploaded yet. Drag & drop files above to begin.</td></tr>
                        ) : (
                          documents.map((doc) => {
                            const audit = audits[doc.id];
                            const statusMap: Record<string, { label: string; cls: string }> = {
                              audited: { label: 'Matched', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
                              paused: { label: 'HITL Review Needed', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
                              parsing: { label: 'Processing (80%)', cls: 'bg-blue-50 text-blue-700 border-blue-200' },
                              uploaded: { label: 'Flagged', cls: 'bg-red-50 text-red-600 border-red-200' },
                              completed: { label: 'Matched', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
                            };
                            const st = statusMap[doc.status] || { label: doc.status, cls: 'bg-slate-50 text-slate-600 border-slate-200' };
                            const category = audit?.findings?.[0]?.compliance_reference?.includes('SOC') ? 'SOC-2' : audit?.findings?.[0]?.category === 'risk' ? 'Financial' : 'GDPR';
                            return (
                              <tr key={doc.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                                <td className="px-5 py-3.5"><div className="flex items-center gap-2.5"><FileText className={`w-4 h-4 flex-shrink-0 ${doc.file_type === 'PDF' ? 'text-red-400' : doc.file_type === 'XLSX' || doc.file_type === 'CSV' ? 'text-emerald-500' : 'text-blue-400'}`} /><span className="text-slate-700 font-medium truncate max-w-[220px]">{doc.filename}</span></div></td>
                                <td className="px-5 py-3.5 text-slate-500 text-xs">{new Date(doc.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}</td>
                                <td className="px-5 py-3.5"><span className={`inline-block px-2.5 py-1 rounded-full text-[11px] font-bold border ${st.cls}`}>{st.label}</span></td>
                                <td className="px-5 py-3.5 text-slate-600 text-xs font-medium">{category}</td>
                                <td className="px-5 py-3.5">{audit?.status === 'completed' ? (<span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 text-[10px] font-bold border border-indigo-200">PR <span className="bg-indigo-600 text-white rounded-full w-4 h-4 flex items-center justify-center text-[9px]">{audit.findings.length}</span></span>) : <span className="text-xs text-slate-400 italic">Generating...</span>}</td>
                                <td className="px-5 py-3.5">
                                  <div className="flex items-center gap-1.5">
                                    {doc.status === 'uploaded' && <button onClick={() => handleStartAudit(doc.id)} className="p-1.5 rounded-lg hover:bg-indigo-50 text-slate-400 hover:text-indigo-600 transition-colors cursor-pointer" title="Run Audit"><Play className="w-3.5 h-3.5" /></button>}
                                    <button className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer" title="Edit"><Edit className="w-3.5 h-3.5" /></button>
                                    <button className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer" title="Delete"><Trash2 className="w-3.5 h-3.5" /></button>
                                    <button className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer" title="More"><MoreHorizontal className="w-3.5 h-3.5" /></button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              {/* MODULE 4 */}
              <div className="space-y-3">
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Live Agents Network Feed (Integrated)</h3>
                <div className="premium-card p-5">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-bold text-slate-700">Real-time Agent Activity Stream</span>
                    {agentLogs.length > 0 && <button onClick={clearAgentLogs} className="text-[10px] font-bold text-slate-400 hover:text-slate-600 cursor-pointer uppercase tracking-wider">Clear</button>}
                  </div>
                  <div className="flex gap-4 overflow-x-auto pb-2" style={{ scrollbarWidth: 'none' }}>
                    {agentLogs.length === 0 ? (
                      <>
                        {[
                          { agent: "Agent 3", msg: "Found GDPR mismatch in the documents. Remediating and..." },
                          { agent: "Agent 1", msg: "Scanning rules... Checking agent documents, matching..." },
                          { agent: "Agent 7", msg: "Creating patch. Including compliance modifications..." }
                        ].map((mock, i) => (
                          <div key={i} className="flex-shrink-0 w-80 p-3.5 bg-slate-50 rounded-xl border border-slate-100 flex items-start gap-3">
                            <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0"><Cpu className="w-4 h-4 text-indigo-600" /></div>
                            <p className="text-xs text-slate-700"><span className="font-bold">{mock.agent}:</span> <span className="text-slate-500">{mock.msg}</span></p>
                          </div>
                        ))}
                      </>
                    ) : (
                      agentLogs.slice(-6).map((log, idx) => (
                        <div key={idx} className="flex-shrink-0 w-80 p-3.5 bg-slate-50 rounded-xl border border-slate-100 flex items-start gap-3">
                          <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0"><Cpu className="w-4 h-4 text-indigo-600" /></div>
                          <p className="text-xs text-slate-700"><span className="font-bold">{log.agent}:</span> <span className="text-slate-500">{log.message}</span></p>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB: OVERVIEW */}
          {activeTab === "overview" && (
            <div className="space-y-6 max-w-[1400px] mx-auto">
              <NativeDashboard token={token} />
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
