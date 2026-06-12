import { create } from 'zustand';

export interface User {
  id: number;
  email: string;
  full_name: string;
  role_id?: number;
  organization_id?: number;
  created_at: string;
}

export interface Document {
  id: number;
  filename: string;
  file_type: string;
  file_size: number;
  status: string;
  created_at: string;
}

export interface AuditFinding {
  id: number;
  audit_id: number;
  severity: 'critical' | 'high' | 'medium' | 'low';
  category: string;
  title: string;
  description: string;
  original_value?: string;
  proposed_value?: string;
  status: 'unresolved' | 'approved' | 'rejected' | 'resolved';
  page_number?: number;
  compliance_reference?: string;
}

export interface Audit {
  id: number;
  document_id: number;
  status: 'pending' | 'running' | 'paused' | 'completed' | 'failed';
  compliance_score: number;
  critical_findings_count: number;
  created_at: string;
  completed_at?: string;
  findings: AuditFinding[];
}

export interface AgentLog {
  agent: string;
  message: string;
  thought: string;
  timestamp: string;
}

interface PulseApexStore {
  token: string | null;
  user: User | null;
  documents: Document[];
  audits: Record<number, Audit>;
  agentLogs: AgentLog[];
  activeTab: string;
  selectedDocId: number | null;
  pendingApprovals: any[];
  
  setToken: (token: string | null) => void;
  setUser: (user: User | null) => void;
  setDocuments: (docs: Document[]) => void;
  addDocument: (doc: Document) => void;
  setAudit: (docId: number, audit: Audit) => void;
  addAgentLog: (log: AgentLog) => void;
  clearAgentLogs: () => void;
  setActiveTab: (tab: string) => void;
  setSelectedDocId: (docId: number | null) => void;
  setPendingApprovals: (approvals: any[]) => void;
  logout: () => void;
}

export const usePulseApexStore = create<PulseApexStore>((set) => ({
  token: typeof window !== 'undefined' ? localStorage.getItem('pulseapex_token') : null,
  user: null,
  documents: [],
  audits: {},
  agentLogs: [],
  activeTab: 'dashboard',
  selectedDocId: null,
  pendingApprovals: [],

  setToken: (token) => {
    if (token) {
      localStorage.setItem('pulseapex_token', token);
    } else {
      localStorage.removeItem('pulseapex_token');
    }
    set({ token });
  },
  setUser: (user) => set({ user }),
  setDocuments: (documents) => set({ documents }),
  addDocument: (doc) => set((state) => ({ documents: [doc, ...state.documents] })),
  setAudit: (docId, audit) => set((state) => ({
    audits: { ...state.audits, [docId]: audit }
  })),
  addAgentLog: (log) => set((state) => ({ agentLogs: [...state.agentLogs, log] })),
  clearAgentLogs: () => set({ agentLogs: [] }),
  setActiveTab: (activeTab) => set({ activeTab }),
  setSelectedDocId: (selectedDocId) => set({ selectedDocId }),
  setPendingApprovals: (pendingApprovals) => set({ pendingApprovals }),
  logout: () => {
    localStorage.removeItem('pulseapex_token');
    set({ token: null, user: null, documents: [], audits: {}, agentLogs: [], activeTab: 'dashboard', selectedDocId: null });
  }
}));
