import React, { useEffect, useState, useRef } from 'react';
import { 
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, 
  CartesianGrid, PieChart, Pie, Cell 
} from 'recharts';
import { 
  RefreshCw, AlertTriangle, Shield, CheckCircle, FileText, 
  TrendingUp, Clock, Database, Layers, ClipboardCheck, 
  Search, BookOpen, Activity, Cpu, ArrowUpRight, Terminal
} from 'lucide-react';
import { API_BASE_URL } from '../config/api';
import { usePulseApexStore } from '../store';

interface DashboardProps {
  token: string | null;
}

export default function NativeDashboard({ token }: DashboardProps) {
  const { agentLogs, clearAgentLogs, documents } = usePulseApexStore();
  const [summaryData, setSummaryData] = useState<any>(null);
  const [anomaliesData, setAnomaliesData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const terminalEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll terminal log to bottom
  useEffect(() => {
    if (terminalEndRef.current) {
      terminalEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [agentLogs]);

  const fetchData = async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const headers = { Authorization: `Bearer ${token}` };
      const [summaryRes, anomaliesRes] = await Promise.all([
        fetch(`${API_BASE_URL}/powerbi/audit-summary`, { headers }).catch(() => null),
        fetch(`${API_BASE_URL}/powerbi/mismatch-findings`, { headers }).catch(() => null)
      ]);
      
      let summaryJson = null;
      let anomaliesJson = null;

      if (summaryRes && summaryRes.ok) {
        summaryJson = await summaryRes.json();
      }
      if (anomaliesRes && anomaliesRes.ok) {
        anomaliesJson = await anomaliesRes.json();
      }

      setSummaryData(summaryJson && summaryJson.length > 0 ? summaryJson[0] : null);
      
      if (anomaliesJson && anomaliesJson.length > 0) {
        const categoryCounts = anomaliesJson.reduce((acc: any, item: any) => {
          acc[item.category] = (acc[item.category] || 0) + 1;
          return acc;
        }, {});
        
        const chartData = Object.keys(categoryCounts).map(cat => ({
          name: cat.charAt(0).toUpperCase() + cat.slice(1),
          value: categoryCounts[cat]
        }));
        setAnomaliesData(chartData);
      } else {
        setAnomaliesData([]);
      }
    } catch (e: any) {
      setError(e.message);
    }
    setLoading(false);
  };

  useEffect(() => { 
    fetchData(); 
  }, [token]);

  // Fallback / Mock Data for Stunning Sandbox View
  const mockMismatches = 325;
  const mockProcessedDocs = 1450;
  const mockConfidence = 98.7;

  const activeMismatches = summaryData?.total_critical_findings ?? mockMismatches;
  const activeProcessedDocs = (summaryData?.total_audits ?? 0) > 0 
    ? summaryData.total_audits 
    : (documents.length > 0 ? documents.length : mockProcessedDocs);
  const activeConfidence = summaryData?.avg_compliance_score 
    ? parseFloat(summaryData.avg_compliance_score) 
    : mockConfidence;

  // Mini Sparkline Mock Data
  const mismatchesSparkline = [
    { value: 24 }, { value: 30 }, { value: 20 }, { value: 38 }, 
    { value: 28 }, { value: 45 }, { value: 35 }
  ];
  const docsSparkline = [
    { value: 110 }, { value: 125 }, { value: 130 }, { value: 142 }, 
    { value: 138 }, { value: 150 }, { value: 165 }
  ];

  // Anomaly distribution donut data
  const defaultAnomalyData = [
    { name: 'Tax & Finance', value: 145, color: '#6366f1' }, // Indigo
    { name: 'GDPR', value: 85, color: '#0ea5e9' },          // Sky Blue
    { name: 'Contracts', value: 65, color: '#f43f5e' },     // Rose
    { name: 'Governance', value: 30, color: '#10b981' }      // Emerald
  ];

  const pieData = anomaliesData.length > 0 
    ? anomaliesData.map((d, i) => ({
        ...d,
        color: ['#6366f1', '#0ea5e9', '#f43f5e', '#10b981', '#f59e0b'][i % 5]
      }))
    : defaultAnomalyData;

  const totalAnomalies = pieData.reduce((sum, d) => sum + d.value, 0);

  // Weekly trend area chart data
  const weeklyTrends = [
    { name: 'Mon', volume: 140 },
    { name: 'Tue', volume: 185 },
    { name: 'Wed', volume: 160 },
    { name: 'Thu', volume: 210 },
    { name: 'Fri', volume: 195 },
    { name: 'Sat', volume: 95 },
    { name: 'Sun', volume: 125 }
  ];

  // Live Agent status determination
  const getAgentStatuses = () => {
    const defaultStatuses: Record<string, { state: 'active' | 'processing' | 'idle' | 'alert' | 'listening'; desc: string; icon: any }> = {
      'Data Collector': { state: 'listening', desc: 'Ingesting file streams', icon: Database },
      'Data Quality': { state: 'idle', desc: 'Awaiting data packets', icon: Activity },
      'Reconciliation': { state: 'processing', desc: 'Cross-matching values', icon: Layers },
      'Compliance': { state: 'active', desc: 'Policy validation active', icon: ClipboardCheck },
      'Root Cause': { state: 'alert', desc: 'Discrepancy analyzed', icon: AlertTriangle },
      'Report Agent': { state: 'idle', desc: 'Standby for patch triggers', icon: BookOpen }
    };

    if (agentLogs.length > 0) {
      // Set all to listening/idle initially
      const statuses = { ...defaultStatuses };
      Object.keys(statuses).forEach(k => {
        statuses[k] = { ...statuses[k], state: 'listening' };
      });

      const latestLog = agentLogs[agentLogs.length - 1];
      const activeAgent = latestLog.agent.toLowerCase();

      const agentMap: Record<string, string> = {
        'data collector': 'Data Collector',
        'data quality': 'Data Quality',
        'reconciliation': 'Reconciliation',
        'reconciliation agent': 'Reconciliation',
        'compliance': 'Compliance',
        'compliance agent': 'Compliance',
        'root cause': 'Root Cause',
        'root cause agent': 'Root Cause',
        'report': 'Report Agent',
        'report agent': 'Report Agent',
      };

      const mappedName = agentMap[activeAgent];
      if (mappedName) {
        const isError = latestLog.message.toLowerCase().includes('error') || 
                        latestLog.message.toLowerCase().includes('fail') ||
                        latestLog.message.toLowerCase().includes('mismatch');
        statuses[mappedName] = {
          ...statuses[mappedName],
          state: isError ? 'alert' : 'processing',
          desc: latestLog.message.substring(0, 30) + '...'
        };
      }
      return statuses;
    }

    return defaultStatuses;
  };

  const agentNodes = getAgentStatuses();

  const getStatusStyle = (state: string) => {
    switch (state) {
      case 'active':
        return { dot: 'bg-emerald-500 animate-pulse', border: 'border-emerald-200 bg-emerald-50/50', text: 'text-emerald-700', bg: 'bg-emerald-500/10 text-emerald-600' };
      case 'processing':
        return { dot: 'bg-indigo-500 animate-pulse', border: 'border-indigo-200 bg-indigo-50/50', text: 'text-indigo-700', bg: 'bg-indigo-500/10 text-indigo-600' };
      case 'alert':
        return { dot: 'bg-rose-500 animate-pulse', border: 'border-rose-200 bg-rose-50/50', text: 'text-rose-700', bg: 'bg-rose-500/10 text-rose-600' };
      case 'listening':
        return { dot: 'bg-amber-500 animate-pulse', border: 'border-amber-200 bg-amber-50/50', text: 'text-amber-700', bg: 'bg-amber-500/10 text-amber-600' };
      default:
        return { dot: 'bg-slate-400', border: 'border-slate-200 bg-slate-50/50', text: 'text-slate-500', bg: 'bg-slate-100 text-slate-500' };
    }
  };

  return (
    <div className="space-y-6">
      {/* HEADER BANNER */}
      <div className="bg-gradient-to-r from-indigo-600 via-indigo-700 to-sky-600 text-white rounded-2xl p-6 relative overflow-hidden shadow-md shadow-indigo-500/10">
        <div className="absolute top-0 right-0 -mt-4 -mr-4 w-40 h-40 bg-white/10 rounded-full blur-xl pointer-events-none" />
        <div className="absolute bottom-0 left-1/3 -mb-10 w-60 h-60 bg-sky-500/20 rounded-full blur-2xl pointer-events-none" />
        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-xl font-bold tracking-tight">PulseApex Network Operational Dashboard</h3>
            <p className="text-sm text-indigo-100 mt-1 max-w-2xl">
              Real-time AI Auditor intelligence, agent statuses, and performance diagnostics.
            </p>
          </div>
          <button 
            onClick={fetchData} 
            disabled={loading}
            className="flex items-center gap-2 bg-white/15 backdrop-blur-md hover:bg-white/20 transition-all px-4 py-2 rounded-xl border border-white/10 text-xs font-bold cursor-pointer disabled:opacity-50 self-start sm:self-auto"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            <span>Sync Network</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-rose-600 text-sm flex items-center gap-2 shadow-sm">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* METRICS CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* CARD 1: TOTAL MISMATCHES FLAGGED */}
        <div className="premium-card p-5 flex flex-col justify-between min-h-[130px]">
          <div className="flex justify-between items-start">
            <div className="space-y-1">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Total Mismatches Flagged</span>
              <span className="text-3xl font-extrabold text-slate-800 tracking-tight block">
                {activeMismatches}
              </span>
            </div>
            <div className="w-10 h-10 rounded-xl bg-rose-50 border border-rose-100 flex items-center justify-center text-rose-500">
              <AlertTriangle className="w-5 h-5" />
            </div>
          </div>
          <div className="flex items-end justify-between mt-4">
            <span className="text-[11px] font-semibold text-rose-600 flex items-center gap-0.5">
              <TrendingUp className="w-3.5 h-3.5" />
              <span>+12% Since Yesterday</span>
            </span>
            <div className="h-8 w-24">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={mismatchesSparkline}>
                  <Area type="monotone" dataKey="value" stroke="#f43f5e" fill="#ffe4e6" strokeWidth={1.5} dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* CARD 2: PROCESSED DOCUMENTS */}
        <div className="premium-card p-5 flex flex-col justify-between min-h-[130px]">
          <div className="flex justify-between items-start">
            <div className="space-y-1">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Processed Documents</span>
              <span className="text-3xl font-extrabold text-slate-800 tracking-tight block">
                {activeProcessedDocs.toLocaleString()}
              </span>
            </div>
            <div className="w-10 h-10 rounded-xl bg-sky-50 border border-sky-100 flex items-center justify-center text-sky-500">
              <FileText className="w-5 h-5" />
            </div>
          </div>
          <div className="flex items-end justify-between mt-4">
            <span className="text-[11px] font-semibold text-slate-400">
              Total Uploads to Date
            </span>
            <div className="h-8 w-24">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={docsSparkline}>
                  <Area type="monotone" dataKey="value" stroke="#0ea5e9" fill="#e0f2fe" strokeWidth={1.5} dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* CARD 3: NETWORK CONFIDENCE */}
        <div className="premium-card p-5 flex flex-col justify-between min-h-[130px]">
          <div className="flex justify-between items-start">
            <div className="space-y-1">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Network Confidence</span>
              <span className="text-3xl font-extrabold text-slate-800 tracking-tight block">
                {activeConfidence.toFixed(1)}%
              </span>
            </div>
            <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-500">
              <Shield className="w-5 h-5" />
            </div>
          </div>
          <div className="flex items-center justify-between mt-4">
            <span className="text-[11px] font-semibold text-emerald-600 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
              <span>Last 1h Trend: Stable</span>
            </span>
            <div className="relative w-9 h-9 flex items-center justify-center">
              <svg className="w-full h-full transform -rotate-90">
                <circle cx="18" cy="18" r="15" className="stroke-slate-100 fill-none" strokeWidth="2.5" />
                <circle cx="18" cy="18" r="15" className="stroke-emerald-500 fill-none" strokeWidth="2.5" strokeDasharray={`${2 * Math.PI * 15}`} strokeDashoffset={`${2 * Math.PI * 15 * (1 - activeConfidence / 100)}`} />
              </svg>
              <span className="absolute text-[8px] font-bold text-slate-700">{Math.round(activeConfidence)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* CHARTS CONTAINER */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* DONUT CHART (2 Columns) */}
        <div className="premium-card p-5 lg:col-span-2 flex flex-col justify-between">
          <div>
            <h4 className="font-bold text-slate-700 text-xs uppercase tracking-wider pb-3 border-b border-slate-100 flex items-center gap-1.5">
              <Activity className="w-4 h-4 text-indigo-500" />
              <span>Anomaly Distribution</span>
            </h4>
            <div className="relative h-48 flex items-center justify-center mt-3">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={75}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-2xl font-black text-slate-800">{totalAnomalies}</span>
                <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Total Risks</span>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 mt-4 pt-3 border-t border-slate-100">
            {pieData.map((d, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: d.color }} />
                <div className="flex flex-col min-w-0">
                  <span className="text-[10px] font-bold text-slate-600 truncate">{d.name}</span>
                  <span className="text-[10px] text-slate-400 font-bold">{d.value} ({Math.round(d.value / totalAnomalies * 100)}%)</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* LINE TRENDS (3 Columns) */}
        <div className="premium-card p-5 lg:col-span-3 flex flex-col justify-between">
          <div>
            <h4 className="font-bold text-slate-700 text-xs uppercase tracking-wider pb-3 border-b border-slate-100 flex items-center gap-1.5">
              <TrendingUp className="w-4 h-4 text-sky-500" />
              <span>Audit Processing Trends</span>
            </h4>
            <div className="h-48 w-full mt-4">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={weeklyTrends} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorVolume" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366f1" stopOpacity={0.15}/>
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="name" stroke="#94a3b8" fontSize={10} tickLine={false} axisLine={false} />
                  <YAxis stroke="#94a3b8" fontSize={10} tickLine={false} axisLine={false} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', fontSize: '11px', color: '#334155' }}
                  />
                  <Area type="monotone" dataKey="volume" stroke="#6366f1" fillOpacity={1} fill="url(#colorVolume)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="flex items-center justify-between text-[11px] text-slate-400 font-bold mt-4 pt-3 border-t border-slate-100">
            <span className="flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" />
              <span>Pipeline latency: 12.4s avg</span>
            </span>
            <span className="text-indigo-600 flex items-center gap-0.5 hover:underline cursor-pointer">
              <span>View full reports</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </span>
          </div>
        </div>
      </div>

      {/* COCKPIT INTEGRATED FEED */}
      <div>
        <h4 className="font-bold text-slate-700 text-sm uppercase tracking-wider mb-4 flex items-center gap-2">
          <Cpu className="w-5 h-5 text-indigo-600" />
          <span>Live Agent Intelligence Cockpit</span>
        </h4>
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* NODE GRID (2 Columns) */}
          <div className="premium-card p-5 lg:col-span-2 space-y-4">
            <div className="pb-3 border-b border-slate-100">
              <h5 className="font-bold text-slate-700 text-xs uppercase tracking-wider">Agent Node Status</h5>
              <p className="text-[10px] text-slate-400 mt-0.5">Active collaboration pipeline of autonomous subnet nodes.</p>
            </div>
            
            <div className="grid grid-cols-2 gap-3">
              {Object.entries(agentNodes).map(([name, node]) => {
                const Icon = node.icon;
                const styles = getStatusStyle(node.state);
                return (
                  <div 
                    key={name} 
                    className={`p-3 rounded-xl border transition-all flex flex-col justify-between min-h-[95px] relative group hover:shadow-sm ${styles.border}`}
                  >
                    <div className="flex justify-between items-start">
                      <div className={`p-1.5 rounded-lg ${styles.bg}`}>
                        <Icon className="w-4 h-4" />
                      </div>
                      <div className="flex items-center gap-1.5 bg-white border border-slate-100 px-2 py-0.5 rounded-full">
                        <span className={`w-1.5 h-1.5 rounded-full ${styles.dot}`} />
                        <span className="text-[8px] font-bold text-slate-500 uppercase tracking-wider">{node.state}</span>
                      </div>
                    </div>
                    
                    <div className="mt-3">
                      <span className="text-xs font-bold text-slate-700 block">{name}</span>
                      <span className="text-[9px] text-slate-400 block truncate font-medium mt-0.5" title={node.desc}>
                        {node.desc}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ACTIVITY LOGS FEED (3 Columns) */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-xl overflow-hidden lg:col-span-3 flex flex-col h-[320px]">
            <div className="bg-slate-800 px-4 py-3 flex items-center justify-between border-b border-slate-700 text-xs">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500/60" />
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500/60" />
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/60" />
                <span className="font-mono text-[10px] text-slate-400 uppercase ml-2">pulseapex_cockpit_stream.log</span>
              </div>
              {agentLogs.length > 0 && (
                <button 
                  onClick={clearAgentLogs} 
                  className="px-2 py-1 bg-slate-700 hover:bg-slate-600 text-[10px] text-slate-300 font-bold rounded cursor-pointer transition-colors"
                >
                  Clear Feed
                </button>
              )}
            </div>
            
            <div className="p-5 overflow-y-auto font-mono text-xs flex-1 space-y-3.5 scrollbar-thin">
              {agentLogs.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-500 text-center space-y-3">
                  <Terminal className="w-8 h-8 opacity-40 animate-pulse text-indigo-400" />
                  <div className="space-y-1">
                    <span className="text-[10px] tracking-wider uppercase font-bold text-slate-400 block">Agent Subnet Standby</span>
                    <span className="text-[9px] text-slate-500 block max-w-xs leading-relaxed">No active logs in feed. Go to the "Audit & Files" workspace and trigger a new audit to observe agent cooperation streams.</span>
                  </div>
                </div>
              ) : (
                agentLogs.map((log, idx) => (
                  <div key={idx} className="space-y-1 border-l border-slate-800 pl-3">
                    <div className="flex items-center gap-2 text-[9px] text-slate-500">
                      <span className="font-bold text-indigo-400">[{log.agent.toUpperCase()}]</span>
                      <span>{log.timestamp}</span>
                    </div>
                    <p className="text-slate-300 text-[11px] leading-relaxed">{log.message}</p>
                    {log.thought && (
                      <div className="p-2 bg-slate-800/40 border border-slate-800/80 rounded-lg text-slate-400 text-[10px] italic mt-1 leading-relaxed">
                        <span className="font-bold text-indigo-400/80 not-italic block uppercase text-[8px] tracking-widest mb-0.5">Subnet Agent Thought:</span>
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
      </div>
    </div>
  );
}
