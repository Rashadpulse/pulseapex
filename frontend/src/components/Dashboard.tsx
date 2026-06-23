import React, { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { RefreshCw, AlertTriangle, Shield, CheckCircle, FileText, Server } from 'lucide-react';
import { API_BASE_URL } from '../config/api';

interface DashboardProps {
  token: string | null;
}

export default function NativeDashboard({ token }: DashboardProps) {
  const [summaryData, setSummaryData] = useState<any>(null);
  const [anomaliesData, setAnomaliesData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const headers = { Authorization: `Bearer ${token}` };
      const [summaryRes, anomaliesRes] = await Promise.all([
        fetch(`${API_BASE_URL}/powerbi/audit-summary`, { headers }),
        fetch(`${API_BASE_URL}/powerbi/mismatch-findings`, { headers })
      ]);
      
      if (!summaryRes.ok || !anomaliesRes.ok) {
        throw new Error('Failed to fetch dashboard metrics');
      }

      const summary = await summaryRes.json();
      const anomalies = await anomaliesRes.json();
      
      setSummaryData(summary.length > 0 ? summary[0] : null);
      
      // Transform anomalies into chart data (group by category)
      const categoryCounts = anomalies.reduce((acc: any, item: any) => {
        acc[item.category] = (acc[item.category] || 0) + 1;
        return acc;
      }, {});
      
      const chartData = Object.keys(categoryCounts).map(cat => ({
        name: cat.charAt(0).toUpperCase() + cat.slice(1),
        mismatches: categoryCounts[cat]
      }));
      
      setAnomaliesData(chartData);
    } catch (e: any) {
      setError(e.message);
    }
    setLoading(false);
  };

  useEffect(() => { 
    fetchData(); 
  }, [token]);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
          <Server className="w-5 h-5 text-sky-500" />
          Native Executive Dashboard
        </h2>
        <button 
          onClick={fetchData} 
          disabled={loading}
          className="p-2 border border-slate-200 bg-white rounded-lg hover:bg-slate-50 transition-colors text-slate-500 disabled:opacity-50 shadow-sm"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin text-sky-500" : ""}`} />
        </button>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm flex items-center gap-2 shadow-sm">
          <AlertTriangle className="w-4 h-4" />
          {error}
        </div>
      )}

      {/* Metrics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="glass-panel p-5 rounded-2xl flex flex-col justify-between relative overflow-hidden">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Total Mismatches Flagged</span>
          <div className="text-3xl font-extrabold text-slate-800 tracking-tight">
            {loading ? "..." : (summaryData?.total_critical_findings || 0)}
          </div>
          <AlertTriangle className="absolute right-4 bottom-4 w-12 h-12 text-red-500/10" />
        </div>
        
        <div className="glass-panel p-5 rounded-2xl flex flex-col justify-between relative overflow-hidden">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Processed Documents</span>
          <div className="text-3xl font-extrabold text-slate-800 tracking-tight">
            {loading ? "..." : (summaryData?.total_audits || 0)}
          </div>
          <FileText className="absolute right-4 bottom-4 w-12 h-12 text-sky-500/10" />
        </div>

        <div className="glass-panel p-5 rounded-2xl flex flex-col justify-between relative overflow-hidden">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Network Confidence</span>
          <div className="text-3xl font-extrabold text-slate-800 tracking-tight">
            {loading ? "..." : `${Math.round(summaryData?.avg_compliance_score || 0)}%`}
          </div>
          <Shield className="absolute right-4 bottom-4 w-12 h-12 text-emerald-500/10" />
        </div>
      </div>

      {/* Trend Tracking Chart */}
      <div className="glass-panel p-6">
        <h3 className="text-sm font-bold text-slate-700 uppercase tracking-widest mb-6">Anomaly Distribution by Category</h3>
        <div className="h-64 w-full">
          {loading ? (
            <div className="h-full w-full flex items-center justify-center">
              <RefreshCw className="w-6 h-6 animate-spin text-slate-400" />
            </div>
          ) : anomaliesData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={anomaliesData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="name" stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip 
                  cursor={{ fill: '#f1f5f9', opacity: 0.5 }}
                  contentStyle={{ backgroundColor: '#ffffff', borderColor: '#e2e8f0', borderRadius: '0.5rem', color: '#0f172a' }}
                  itemStyle={{ color: '#0ea5e9' }}
                />
                <Bar dataKey="mismatches" fill="#0ea5e9" radius={[4, 4, 0, 0]} barSize={40} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full w-full flex flex-col items-center justify-center text-slate-500">
              <CheckCircle className="w-8 h-8 text-emerald-500/40 mb-2" />
              <p>No critical anomalies found</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
