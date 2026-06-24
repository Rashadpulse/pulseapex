"use client";

import React, { useState, useEffect, useRef } from "react";
import { usePulseApexStore, Document, Audit } from "../store";
import { 
  Shield, UploadCloud, Layers, ClipboardCheck, Terminal, BookOpen, FolderOpen, PieChart,
  Settings, User as UserIcon, LogOut, CheckCircle, AlertTriangle, 
  XCircle, Play, Info, ArrowRight, RefreshCw, Check, X, FileText,
  AlertCircle, ShieldAlert, Cpu, Activity, Search, ChevronUp, ChevronDown,
  MoreHorizontal, Sparkles, Edit, Trash2, Mail, Lock, Eye, EyeOff, Database
} from "lucide-react";
import { API_BASE_URL, WS_BASE_URL } from "../config/api";

export default function Home() {
  const {
    token, setToken, user, setUser, documents, setDocuments, addDocument,
    audits, setAudit, agentLogs, addAgentLog, clearAgentLogs, 
    selectedDocId, setSelectedDocId, 
    pendingApprovals, setPendingApprovals, logout
  } = usePulseApexStore();

  const [hasMounted, setHasMounted] = useState(false);
  useEffect(() => { 
    setHasMounted(true);
    const storedToken = localStorage.getItem('pulseapex_token');
    if (storedToken && !token) {
      setToken(storedToken);
    }
  }, [token, setToken]);

  // Auth States
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [orgName, setOrgName] = useState("");
  const [isRegistering, setIsRegistering] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  
  // Connection Mode
  const [connectionMode, setConnectionMode] = useState<"mock" | "live">("live");
  const [wsConnected, setWsConnected] = useState(false);

  // Upload States
  const [dragActive, setDragActive] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadingFile, setUploadingFile] = useState<string | null>(null);

  // Progressive Flow State: 0=Upload/Ingest, 1=Auditing, 2=Completed/HITL
  const [flowStep, setFlowStep] = useState(0);

  // Rules
  const [showRules, setShowRules] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const [activeHitlFinding, setActiveHitlFinding] = useState<any>(null);

  const terminalEndRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (connectionMode === "mock" && documents.length === 0) {
      const mockDocs: Document[] = [
        { id: 1, filename: "q4_financial_statement_2025_unsigned.xlsx", file_type: "XLSX", file_size: 1542000, status: "audited", created_at: "2026-06-12T10:00:00Z" }
      ];
      setDocuments(mockDocs);
    }
  }, [connectionMode, documents.length]);

  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [agentLogs]);

  useEffect(() => {
    if (connectionMode === "live" && token) {
      try {
        const cleanToken = String(token || "").split(':')[0];
        const socket = new WebSocket(`${WS_BASE_URL}?token=${cleanToken}`);
        wsRef.current = socket;

        socket.onopen = () => setWsConnected(true);
        socket.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            const state = usePulseApexStore.getState();
            if (data.type === "agent_log") {
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
              fetchDocuments();
              const targetDocId = Object.keys(state.audits).find(
                docId => state.audits[Number(docId)]?.id === data.audit_id
              );
              if (targetDocId) {
                fetchAuditForDoc(Number(targetDocId));
                // Auto transition to flowStep 2
                setFlowStep(2);
              } else if (state.selectedDocId) {
                fetchAuditForDoc(state.selectedDocId);
                setFlowStep(2);
              }
            }
          } catch (e) {
            console.error(e);
          }
        };
        socket.onclose = () => setWsConnected(false);
        socket.onerror = () => setWsConnected(false);
        return () => socket.close();
      } catch (err) {
        console.error("WS connect failed", err);
      }
    }
  }, [connectionMode, token]);

  const fetchDocuments = async (overrideToken?: string) => {
    if (connectionMode === "mock") return;
    try {
      const activeToken = overrideToken || token;
      const res = await fetch(`${API_BASE_URL}/documents`, {
        headers: { Authorization: `Bearer ${activeToken}` }
      });
      if (res.ok) {
        const data = await res.json();
        setDocuments(data);
      }
    } catch (e) { console.error(e); }
  };

  const fetchAuditForDoc = async (docId: number, overrideToken?: string) => {
    if (connectionMode === "mock") return;
    try {
      const activeToken = overrideToken || token;
      const strictId = String(docId || "").split(':')[0].replace(/[^0-9]/g, '');
      const res = await fetch(`${API_BASE_URL}/audits/document/${strictId}`, {
        headers: { Authorization: `Bearer ${activeToken}` }
      });
      if (res.ok) {
        const auditData = await res.json();
        setAudit(docId, auditData);
      }
    } catch (e) { console.error(e); }
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    if (connectionMode === "mock") {
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
          body: JSON.stringify({ email, password, full_name: fullName, organization_name: orgName })
        });
        if (!res.ok) throw new Error("Registration failed");
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
        if (!res.ok) throw new Error("Invalid username or password");
        const tokenData = await res.json();
        setToken(tokenData.access_token);
        
        const userRes = await fetch(`${API_BASE_URL}/auth/me`, {
          headers: { Authorization: `Bearer ${tokenData.access_token}` }
        });
        if (userRes.ok) setUser(await userRes.json());
        fetchDocuments(tokenData.access_token);
      }
    } catch (err) {
      setError((err as Error).message || "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  const handleStartAudit = async (docId: number) => {
    setFlowStep(1); // Move to active orchestration
    if (connectionMode === "mock") {
      clearAgentLogs();
      const logs = [
        { agent: "Data Collector Agent", msg: "Extracting dataset...", thought: "" },
        { agent: "Data Quality Agent", msg: "Validating integrity...", thought: "" },
        { agent: "Reconciliation Agent", msg: "Cross-matching values...", thought: "" },
        { agent: "Compliance Agent", msg: "Policy validation active...", thought: "" },
        { agent: "Root Cause Agent", msg: "Discrepancy analyzed. Confidence 88%.", thought: "" },
        { agent: "Report Agent", msg: "Audit paused for HITL review.", thought: "" }
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
      const mockAudit: Audit = {
        id: 999,
        document_id: docId,
        status: 'paused',
        compliance_score: 88,
        critical_findings_count: 1,
        created_at: new Date().toISOString(),
        findings: [
          {
            id: 1001,
            audit_id: 999,
            severity: 'critical',
            category: 'Finance',
            title: 'Revenue Recognition Mismatch',
            description: 'The Q3 revenue reported in the ledger does not match the sum of recognized contracts. Requires human verification.',
            original_value: '$1,200,500',
            proposed_value: '$1,050,000',
            status: 'unresolved',
            compliance_reference: 'ASC 606 / IFRS 15',
            ai_confidence_score: 85
          }
        ]
      };
      setAudit(docId, mockAudit);
      setFlowStep(2);
      setSelectedDocId(docId);
      return;
    }

    try {
      const strictId = String(docId || "").split(':')[0].replace(/[^0-9]/g, '');
      const res = await fetch(`${API_BASE_URL}/audits/trigger/${strictId}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const auditData = await res.json();
        setAudit(docId, auditData);
        clearAgentLogs();
      }
    } catch (e) {
      console.error(e);
      setFlowStep(0);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) uploadFile(e.dataTransfer.files[0]);
  };

  const uploadFile = async (file: File) => {
    if (!token && connectionMode === "live") return;
    setUploadingFile(file.name);
    setUploadProgress(10);
    
    if (connectionMode === "mock") {
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
        setSelectedDocId(data.id);
        setUploadingFile(null);
      } else {
        console.error("Upload failed with status", res.status);
        setUploadingFile(null);
        setUploadProgress(0);
        // If 401, auto logout or alert user
        if (res.status === 401) {
          alert("Session expired or invalid. Please log out and log in again.");
        }
      }
    } catch (e) {
      console.error("Upload failed", e);
      setUploadingFile(null);
      setUploadProgress(0);
    }
  };

  const handleDecideHITL = async (reqId: number, approve: boolean, notes: string = "") => {
    // Handling logic for both mock and live
    if (connectionMode === "mock") {
      // Refresh mock state
      alert(`HITL Decision: ${approve ? 'Approved' : 'Rejected'} with notes: ${notes}`);
      setFlowStep(0);
      setActiveHitlFinding(null);
      return;
    }
    try {
      const res = await fetch(`${API_BASE_URL}/hitl/decide`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ request_id: reqId, approve, notes })
      });
      if (res.ok) {
        setActiveHitlFinding(null);
        fetchDocuments();
        if (selectedDocId) fetchAuditForDoc(selectedDocId);
      }
    } catch (e) { console.error(e); }
  };

  if (!hasMounted) return <div className="p-8 text-center text-slate-500 animate-pulse">Initializing PulseApex...</div>;

  if (!token) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 bg-[#F8F9FA] min-h-screen">
        <div className="flex flex-col items-center gap-2 mb-6">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center shadow-md shadow-indigo-500/25">
              <Shield className="w-5 h-5 text-white" />
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-extrabold tracking-wide text-slate-800">PULSEAPEX AI</span>
              <span className="text-[9px] uppercase tracking-widest text-slate-400 font-bold -mt-0.5">Enterprise Agentic Auditor</span>
            </div>
          </div>
        </div>
        <div className="w-full max-w-md bg-white rounded-3xl shadow-xl border border-slate-200/60 p-8">
          <form onSubmit={handleAuth} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">Email Address</label>
              <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">Password</label>
              <input type={showPassword ? "text" : "password"} required value={password} onChange={(e) => setPassword(e.target.value)} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-sm" />
            </div>
            <button type="submit" disabled={loading} className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-sm transition-all shadow-md">
              {loading ? "Authenticating..." : "Secure Login"}
            </button>
          </form>
          <div className="mt-4 text-center">
            <button onClick={() => setConnectionMode(connectionMode === "live" ? "mock" : "live")} className="text-xs text-slate-400 hover:text-slate-600">
              Mode: {connectionMode === "live" ? "Live API" : "Local Sandbox"} (Click to swap)
            </button>
          </div>
        </div>
      </div>
    );
  }

  const selectedDoc = documents.find(d => d.id === selectedDocId);
  const selectedAudit = selectedDocId ? audits[selectedDocId] : null;

  // Active Agent computation for visual track
  const agentsList = ["Parser", "Data Collector", "Data Quality", "Reconciliation", "Compliance", "Root Cause", "Report"];
  let activeAgentIndex = -1;
  if (agentLogs.length > 0) {
    const latestLog = agentLogs[agentLogs.length - 1];
    const map: Record<string, number> = {
      'parser agent': 0, 'data collector agent': 1, 'data quality agent': 2,
      'reconciliation agent': 3, 'compliance agent': 4, 'root cause agent': 5, 'report agent': 6
    };
    activeAgentIndex = map[latestLog.agent.toLowerCase()] ?? 0;
  }

  const isPipelinePaused = flowStep >= 2 && selectedAudit?.status === 'paused';

  return (
    <div className="flex-1 flex flex-col h-screen overflow-hidden bg-[#F8F9FA] text-slate-800 font-sans">
      {/* GLOBAL COMMERCIAL HEADER */}
      <header className="h-16 border-b border-slate-200 bg-white px-6 flex items-center justify-between shadow-sm z-50 flex-shrink-0">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center shadow-md shadow-indigo-500/20 border border-indigo-500">
            <Shield className="w-6 h-6 text-white" />
          </div>
          <div className="flex flex-col">
            <span className="text-lg font-black tracking-tight text-slate-900 leading-none">PULSEAPEX AI</span>
            <span className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Enterprise Agentic Auditor Hub</span>
          </div>
        </div>
        <div className="flex items-center gap-5">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-emerald-200 bg-emerald-50">
            <div className={`w-2 h-2 rounded-full ${wsConnected || connectionMode === 'mock' ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
            <span className="text-[10px] text-emerald-700 font-bold uppercase tracking-wider">
              {connectionMode === "mock" ? "[MOCK SANDBOX ACTIVE]" : `[LIVE SECURITY LINK ACTIVE]`}
            </span>
          </div>
          <div className="flex items-center gap-3 pl-5 border-l border-slate-200">
            <div className="flex flex-col items-end">
              <span className="text-xs font-bold text-slate-700">{user?.full_name || "Auditor"}</span>
              <span className="text-[10px] text-slate-400">{user?.email || "sandbox"}</span>
            </div>
            <button onClick={logout} className="w-8 h-8 rounded-full bg-slate-50 border border-slate-200 flex items-center justify-center hover:bg-red-50 hover:border-red-200 hover:text-red-500 text-slate-400 transition-colors">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* PROGRESSIVE SCROLLABLE FEED */}
      <main className="flex-1 overflow-y-auto p-6 md:p-10 space-y-8 scroll-smooth max-w-[1200px] mx-auto w-full pb-32">
        
        {/* PHASE 1: RULEBOOK INGESTION */}
        <section className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
          <div className="flex items-center justify-between cursor-pointer" onClick={() => setShowRules(!showRules)}>
            <div className="flex items-center gap-3">
              <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg"><BookOpen className="w-5 h-5" /></div>
              <div>
                <h3 className="text-sm font-bold text-slate-800">Rulebook Ingestion & Search</h3>
                <p className="text-xs text-slate-500">Ensure active compliance policies are loaded before auditing.</p>
              </div>
            </div>
            {showRules ? <ChevronUp className="w-5 h-5 text-slate-400" /> : <ChevronDown className="w-5 h-5 text-slate-400" />}
          </div>
          
          {showRules && (
            <div className="mt-5 pt-5 border-t border-slate-100 flex gap-4">
              <div className="flex-1 relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <input type="text" placeholder="Search active policies (e.g. 'SOC2', 'GDPR')..." className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500/20 outline-none" />
              </div>
              <button className="px-4 py-2 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl text-sm font-bold text-slate-700 flex items-center gap-2 shadow-sm transition-colors">
                <UploadCloud className="w-4 h-4" /> Upload Rulebook
              </button>
            </div>
          )}
        </section>

        {/* PHASE 2: DOCUMENT UPLOAD */}
        <section className={`transition-all duration-500 ease-in-out ${flowStep >= 1 ? 'opacity-60 scale-[0.98]' : 'opacity-100 scale-100'}`}>
          <div className="bg-white rounded-2xl border border-slate-200 p-8 shadow-sm">
            <div className="flex flex-col items-center text-center max-w-lg mx-auto">
              <div 
                onDragEnter={() => setDragActive(true)} onDragLeave={() => setDragActive(false)} onDragOver={(e) => e.preventDefault()} onDrop={handleDrop}
                onClick={() => document.getElementById('file-input')?.click()}
                className={`w-full border-2 border-dashed rounded-2xl p-10 cursor-pointer transition-all ${dragActive ? 'border-indigo-500 bg-indigo-50/50' : 'border-slate-300 bg-slate-50 hover:bg-slate-100/50'}`}
              >
                <div className="w-16 h-16 rounded-2xl bg-white border border-slate-200 shadow-sm flex items-center justify-center mx-auto mb-4">
                  <UploadCloud className="w-8 h-8 text-indigo-500" />
                </div>
                <h3 className="text-base font-bold text-slate-800">Secure Document Dropzone</h3>
                <p className="text-xs text-slate-500 mt-2">Upload PDFs, Excel sheets, or Word docs for autonomous analysis.</p>
                <input id="file-input" type="file" className="hidden" onChange={(e) => e.target.files && uploadFile(e.target.files[0])} />
              </div>

              {uploadingFile && (
                <div className="w-full mt-6 space-y-2">
                  <div className="flex justify-between text-xs font-bold text-slate-600"><span>{uploadingFile}</span><span className="text-indigo-600">{uploadProgress}%</span></div>
                  <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-indigo-500 transition-all duration-300" style={{ width: `${uploadProgress}%` }} /></div>
                </div>
              )}

              {selectedDoc && !uploadingFile && flowStep === 0 && (
                <div className="w-full mt-8 animate-in fade-in slide-in-from-bottom-4">
                  <div className="flex items-center gap-4 p-4 bg-indigo-50/50 border border-indigo-100 rounded-xl mb-4 text-left">
                    <FileText className="w-8 h-8 text-indigo-600" />
                    <div>
                      <p className="text-sm font-bold text-slate-800">{selectedDoc.filename}</p>
                      <p className="text-xs text-slate-500">Ready for Agentic Orchestration</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => handleStartAudit(selectedDoc.id)}
                    className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-black tracking-wide text-sm transition-all shadow-lg shadow-indigo-500/25 flex items-center justify-center gap-2 relative overflow-hidden group"
                  >
                    <div className="absolute inset-0 bg-white/20 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000" />
                    <Play className="w-5 h-5 fill-current" />
                    START AUTONOMOUS AUDIT
                  </button>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* PHASE 3: LIVE AGENT PIPELINE */}
        {flowStep >= 1 && (
          <section className="animate-in fade-in slide-in-from-bottom-8 duration-700">
            <h3 className="text-sm font-bold text-slate-800 mb-4 flex items-center gap-2">
              <Activity className="w-5 h-5 text-indigo-600" />
              Live Orchestration Pipeline
            </h3>
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8">
              
              {/* Horizontal Node Track */}
              <div className="relative flex justify-between items-center w-full mb-12">
                {/* Connecting background line */}
                <div className="absolute left-0 right-0 h-1 bg-slate-100 top-1/2 -translate-y-1/2 z-0 rounded-full" />
                
                {/* Active connecting line fill */}
                <div 
                  className={`absolute left-0 h-1 top-1/2 -translate-y-1/2 z-0 rounded-full transition-all duration-700 ease-in-out ${isPipelinePaused ? 'bg-amber-600 shadow-[0_0_10px_rgba(217,119,6,0.5)]' : 'bg-indigo-500 shadow-[0_0_10px_rgba(99,102,241,0.5)]'}`}
                  style={{ width: `${Math.max(0, (activeAgentIndex / (agentsList.length - 1)) * 100)}%` }} 
                />

                {agentsList.map((agent, index) => {
                  const isCompleted = activeAgentIndex > index;
                  const isActive = activeAgentIndex === index;
                  const isNodePaused = isActive && isPipelinePaused;
                  
                  return (
                    <div key={agent} className="relative z-10 flex flex-col items-center">
                      <div className="relative w-12 h-12 flex items-center justify-center">
                        <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 100 100">
                          <circle cx="50" cy="50" r="44" fill="white" stroke="#F1F5F9" strokeWidth="8" />
                          <circle 
                            cx="50" cy="50" r="44" 
                            fill="transparent" 
                            stroke={isNodePaused ? "#B45309" : "#4F46E5"} 
                            strokeWidth="8"
                            strokeLinecap="round"
                            strokeDasharray="276.46"
                            strokeDashoffset={isCompleted || isNodePaused ? "0" : (isActive ? "60" : "276.46")}
                            className={`transition-all duration-1000 ease-in-out ${isActive && !isNodePaused ? 'animate-[spin_2s_linear_infinite]' : ''}`}
                            style={{ transformOrigin: '50px 50px' }}
                          />
                        </svg>

                        <div className={`relative z-10 w-5 h-5 rounded-full flex items-center justify-center transition-all duration-500 ${
                          isNodePaused ? 'bg-amber-600 text-white shadow-[0_0_10px_rgba(217,119,6,0.6)]' :
                          isCompleted ? 'bg-indigo-600 text-white shadow-[0_0_10px_rgba(79,70,229,0.5)]' :
                          isActive ? 'bg-indigo-600 text-white animate-pulse shadow-[0_0_10px_rgba(79,70,229,0.5)]' :
                          'bg-slate-200 text-slate-400'
                        }`}>
                          {isNodePaused ? <Lock className="w-3 h-3" /> : <Cpu className="w-3 h-3" />}
                        </div>
                      </div>
                      
                      <span className={`absolute top-16 text-[10px] font-bold uppercase tracking-wider whitespace-nowrap transition-colors duration-500 ${
                        isNodePaused ? 'text-amber-700' :
                        isActive ? 'text-indigo-600' : 
                        isCompleted ? 'text-indigo-900' : 
                        'text-slate-400'
                      }`}>
                        {agent}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Live Log Stream */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 max-h-[250px] overflow-y-auto font-mono text-[11px] mt-8">
                {agentLogs.length === 0 ? (
                  <p className="text-slate-400 text-center py-4">Waiting for agent telemetry...</p>
                ) : (
                  agentLogs.map((log, idx) => (
                    <div key={idx} className="mb-3 pl-3 border-l-2 border-indigo-200 animate-in fade-in slide-in-from-left-2">
                      <div className="flex gap-2 text-slate-500 font-bold mb-1">
                        <span className="text-indigo-600">[{log.agent.toUpperCase()}]</span>
                        <span>{log.timestamp}</span>
                      </div>
                      <p className="text-slate-700">{log.message}</p>
                      {log.thought && <p className="text-slate-500 italic mt-1 bg-white border border-slate-100 p-2 rounded-md">&gt; {log.thought}</p>}
                    </div>
                  ))
                )}
                <div ref={terminalEndRef} />
              </div>
            </div>
          </section>
        )}

        {/* PHASE 4: MATERIALIZED FINDINGS & HITL OVERVIEW */}
        {flowStep >= 2 && selectedAudit && (
          <section className="animate-in fade-in slide-in-from-bottom-8 duration-700 space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-bold text-slate-800">Final Compliance Overview</h3>
              <div className="flex items-center gap-3">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Network Confidence:</span>
                <div className={`px-4 py-2 rounded-full font-black text-sm border ${selectedAudit.compliance_score >= 90 ? 'bg-emerald-50 text-emerald-600 border-emerald-200' : 'bg-amber-50 text-amber-600 border-amber-200'}`}>
                  {selectedAudit.compliance_score}%
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {selectedAudit.findings.map(finding => {
                const isHITL = finding.ai_confidence_score && finding.ai_confidence_score < 90 && finding.status === 'unresolved';
                
                return (
                  <div key={finding.id} className={`bg-white rounded-2xl border overflow-hidden shadow-sm transition-all ${isHITL ? 'border-amber-300 ring-2 ring-amber-100 shadow-amber-500/10' : 'border-slate-200'}`}>
                    <div className={`px-5 py-3 border-b flex justify-between items-center ${isHITL ? 'bg-amber-50 border-amber-100' : 'bg-slate-50 border-slate-100'}`}>
                      <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md ${
                        finding.severity === 'critical' ? 'bg-rose-100 text-rose-700' :
                        finding.severity === 'high' ? 'bg-orange-100 text-orange-700' : 'bg-emerald-100 text-emerald-700'
                      }`}>
                        {finding.severity}
                      </span>
                      {isHITL && <span className="flex items-center gap-1 text-[10px] font-bold text-amber-600 animate-pulse"><AlertTriangle className="w-3 h-3" /> HUMAN REVIEW REQUIRED</span>}
                    </div>
                    
                    <div className="p-5 space-y-4">
                      <div>
                        <h4 className="text-sm font-bold text-slate-800">{finding.title}</h4>
                        <p className="text-xs text-slate-500 mt-1 leading-relaxed">{finding.description}</p>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100">
                        <div>
                          <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 block mb-1">Detected Anomaly</span>
                          <span className="text-xs font-mono text-rose-600 bg-rose-50 px-1 py-0.5 rounded border border-rose-100 break-words">{finding.original_value}</span>
                        </div>
                        <div>
                          <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 block mb-1">Agent Proposal</span>
                          <span className="text-xs font-mono text-emerald-600 bg-emerald-50 px-1 py-0.5 rounded border border-emerald-100 break-words">{finding.proposed_value}</span>
                        </div>
                      </div>

                      <div className="pt-2">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                          <BookOpen className="w-3 h-3" /> Policy Reference:
                        </span>
                        <a href="#" className="text-xs font-semibold text-indigo-600 hover:underline mt-1 inline-block">
                          {finding.compliance_reference}
                        </a>
                      </div>

                      {/* HITL BUTTON */}
                      {isHITL && (
                        <div className="mt-4 pt-4 border-t border-amber-100 flex justify-end">
                          <button 
                            onClick={() => setActiveHitlFinding(finding)}
                            className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-xs font-bold shadow-md shadow-amber-500/20 transition-colors flex items-center gap-2"
                          >
                            <Eye className="w-4 h-4" /> Review HITL Request
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            
            {!selectedAudit.findings.some(f => f.ai_confidence_score && f.ai_confidence_score < 90 && f.status === 'unresolved') && (
              <div className="mt-8 flex justify-center">
                <button onClick={() => setFlowStep(0)} className="px-6 py-3 bg-white border border-slate-300 hover:bg-slate-50 rounded-xl text-sm font-bold text-slate-700 shadow-sm transition-colors flex items-center gap-2">
                  <RefreshCw className="w-4 h-4" /> Start New Audit
                </button>
              </div>
            )}
          </section>
        )}
      </main>

      {/* HITL MODAL OVERLAY */}
      {activeHitlFinding && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-300 p-4">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-4 duration-300">
            <div className="bg-amber-500 p-6 flex justify-between items-center text-white">
              <div className="flex items-center gap-3">
                <AlertTriangle className="w-6 h-6 animate-pulse" />
                <h3 className="font-bold text-lg">Human Review Required</h3>
              </div>
              <button onClick={() => setActiveHitlFinding(null)} className="p-1 hover:bg-amber-600 rounded-full transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-8 space-y-6">
              <div>
                <h4 className="text-base font-bold text-slate-800">{activeHitlFinding.title}</h4>
                <p className="text-sm text-slate-500 mt-2 leading-relaxed">{activeHitlFinding.description}</p>
              </div>
              
              <div className="grid grid-cols-2 gap-4 p-4 bg-slate-50 rounded-2xl border border-slate-100">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">Detected Anomaly</span>
                  <span className="text-sm font-mono text-rose-600 bg-rose-50 px-2 py-1 rounded-md border border-rose-100 break-words block">{activeHitlFinding.original_value}</span>
                </div>
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">Agent Proposal</span>
                  <span className="text-sm font-mono text-emerald-600 bg-emerald-50 px-2 py-1 rounded-md border border-emerald-100 break-words block">{activeHitlFinding.proposed_value}</span>
                </div>
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-700 uppercase tracking-wider block mb-2">Auditor Override Notes</label>
                <textarea 
                  className="w-full p-4 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 text-slate-700 shadow-inner"
                  rows={3}
                  placeholder="Provide rationale for approval/rejection..."
                  id="modal-hitl-notes"
                />
              </div>
            </div>

            <div className="p-6 bg-slate-50 border-t border-slate-100 flex gap-3">
              <button 
                onClick={() => {
                  const notes = (document.getElementById('modal-hitl-notes') as HTMLTextAreaElement)?.value;
                  handleDecideHITL(activeHitlFinding.id, false, notes);
                }}
                className="flex-1 py-3 bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 rounded-xl text-sm font-bold shadow-sm transition-colors"
              >
                Reject & Flag
              </button>
              <button 
                onClick={() => {
                  const notes = (document.getElementById('modal-hitl-notes') as HTMLTextAreaElement)?.value;
                  handleDecideHITL(activeHitlFinding.id, true, notes);
                }}
                className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-bold shadow-md shadow-emerald-500/25 transition-colors"
              >
                Approve Remedy
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
