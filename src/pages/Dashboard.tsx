import React from 'react';
import { usePlatform } from '../context/PlatformContext';
import { 
  FolderGit2, History, AlertTriangle, RefreshCw, Activity,
  CheckCircle, ArrowUpRight, ShieldAlert, Cpu
} from 'lucide-react';
import { 
  AreaChart, Area, LineChart, Line, XAxis, YAxis, 
  CartesianGrid, Tooltip, ResponsiveContainer 
} from 'recharts';

export const Dashboard: React.FC = () => {
  const { 
    projects, 
    deployments, 
    incidents, 
    rollbackOperations, 
    auditLogs, 
    navigateTo 
  } = usePlatform();

  // Metrics calculation
  const totalProjects = projects.length;
  const activeDeployments = deployments.filter(d => d.status === 'building' || d.status === 'queued').length;
  const failedDeployments = deployments.filter(d => d.status === 'failed').length;
  const openIncidents = incidents.filter(i => i.status !== 'resolved').length;
  const recentRollbacks = rollbackOperations.length;

  // Chart data 1: Deployment Success Rate History
  const successChartData = [
    { name: 'Aug 13', successRate: 94 },
    { name: 'Aug 14', successRate: 92 },
    { name: 'Aug 15', successRate: 95 },
    { name: 'Aug 16', successRate: 98 },
    { name: 'Aug 17', successRate: 91 },
    { name: 'Aug 18', successRate: 88 },
    { name: 'Aug 19', successRate: 96 },
  ];

  // Chart data 2: Incident Trends
  const incidentTrendData = [
    { name: 'Aug 13', open: 1, resolved: 2 },
    { name: 'Aug 14', open: 2, resolved: 1 },
    { name: 'Aug 15', open: 0, resolved: 2 },
    { name: 'Aug 16', open: 1, resolved: 0 },
    { name: 'Aug 17', open: 3, resolved: 1 },
    { name: 'Aug 18', open: 2, resolved: 3 },
    { name: 'Aug 19', open: openIncidents, resolved: 1 },
  ];

  return (
    <div className="space-y-6">
      {/* Top Welcome Panel */}
      <div className="bg-dark-900 border border-dark-700 rounded-xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h3 className="text-base font-bold text-white tracking-wide flex items-center gap-2">
            <Cpu size={18} className="text-brand-500" />
            Infrastructure Status: Operational
          </h3>
          <p className="text-xs text-slate-400 mt-1">
            All connected webhook pipelines are monitoring active branch changes. Rollback systems armed.
          </p>
        </div>
        <div className="flex gap-2">
          <button 
            onClick={() => navigateTo('create-project')}
            className="bg-brand-600 hover:bg-brand-500 text-white font-bold py-2 px-4 rounded-lg text-xs transition-all shadow-md shadow-brand-600/10 flex items-center gap-1.5"
          >
            <FolderGit2 size={14} />
            Onboard Project
          </button>
        </div>
      </div>

      {/* Metrics Cards Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {/* Total Projects */}
        <div 
          onClick={() => navigateTo('projects')}
          className="bg-dark-900 border border-dark-700 hover:border-dark-600 p-4 rounded-xl cursor-pointer transition-all hover:translate-y-[-2px] group"
        >
          <div className="flex justify-between items-start text-slate-400">
            <span className="text-[10px] font-semibold uppercase tracking-wider">Total Services</span>
            <FolderGit2 size={16} className="text-brand-500" />
          </div>
          <div className="text-2xl font-bold text-white mt-2 font-mono">{totalProjects}</div>
          <div className="text-[10px] text-slate-500 mt-1 flex items-center gap-1">
            <span>View service catalog</span>
            <ArrowUpRight size={10} className="group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
          </div>
        </div>

        {/* Active Deployments */}
        <div 
          onClick={() => navigateTo('deployments')}
          className="bg-dark-900 border border-dark-700 hover:border-dark-600 p-4 rounded-xl cursor-pointer transition-all hover:translate-y-[-2px] group"
        >
          <div className="flex justify-between items-start text-slate-400">
            <span className="text-[10px] font-semibold uppercase tracking-wider">Active Deploys</span>
            <Activity size={16} className="text-blue-400 animate-pulse" />
          </div>
          <div className="text-2xl font-bold text-white mt-2 font-mono">{activeDeployments}</div>
          <div className="text-[10px] text-slate-500 mt-1 flex items-center gap-1">
            <span>Pipelines running</span>
            <ArrowUpRight size={10} className="group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
          </div>
        </div>

        {/* Failed Deployments */}
        <div 
          onClick={() => navigateTo('deployments')}
          className="bg-dark-900 border border-dark-700 hover:border-dark-600 p-4 rounded-xl cursor-pointer transition-all hover:translate-y-[-2px] group"
        >
          <div className="flex justify-between items-start text-slate-400">
            <span className="text-[10px] font-semibold uppercase tracking-wider">Failed Deploys</span>
            <AlertTriangle size={16} className="text-rose-500" />
          </div>
          <div className="text-2xl font-bold text-rose-400 mt-2 font-mono">{failedDeployments}</div>
          <div className="text-[10px] text-slate-500 mt-1 flex items-center gap-1">
            <span>Compile failures</span>
            <ArrowUpRight size={10} className="group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
          </div>
        </div>

        {/* Open Incidents */}
        <div 
          onClick={() => navigateTo('incidents')}
          className={`border p-4 rounded-xl cursor-pointer transition-all hover:translate-y-[-2px] group ${
            openIncidents > 0 
              ? 'bg-rose-950/20 border-rose-500/30 hover:border-rose-500/60 glow-error' 
              : 'bg-dark-900 border-dark-700 hover:border-dark-600'
          }`}
        >
          <div className="flex justify-between items-start text-slate-400">
            <span className="text-[10px] font-semibold uppercase tracking-wider">Open Incidents</span>
            <ShieldAlert size={16} className={openIncidents > 0 ? 'text-rose-500 animate-bounce' : 'text-slate-400'} />
          </div>
          <div className={`text-2xl font-bold mt-2 font-mono ${openIncidents > 0 ? 'text-rose-400' : 'text-white'}`}>
            {openIncidents}
          </div>
          <div className="text-[10px] text-slate-500 mt-1 flex items-center gap-1">
            <span>Actionable incidents</span>
            <ArrowUpRight size={10} className="group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
          </div>
        </div>

        {/* Rollback Operations */}
        <div 
          onClick={() => navigateTo('rollback-recovery')}
          className="bg-dark-900 border border-dark-700 hover:border-dark-600 p-4 rounded-xl cursor-pointer transition-all hover:translate-y-[-2px] group"
        >
          <div className="flex justify-between items-start text-slate-400">
            <span className="text-[10px] font-semibold uppercase tracking-wider">Rollbacks Ran</span>
            <RefreshCw size={16} className="text-purple-400" />
          </div>
          <div className="text-2xl font-bold text-white mt-2 font-mono">{recentRollbacks}</div>
          <div className="text-[10px] text-slate-500 mt-1 flex items-center gap-1">
            <span>Recovery audit trails</span>
            <ArrowUpRight size={10} className="group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
          </div>
        </div>
      </div>

      {/* Analytics Charts Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Success Rate Area Chart */}
        <div className="bg-dark-900 border border-dark-700 rounded-xl p-5">
          <div className="flex justify-between items-center mb-4">
            <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider">Deployment Success Rate (%)</h4>
            <span className="text-[10px] font-mono text-emerald-400 font-bold bg-emerald-500/10 px-2 py-0.5 rounded">
              Avg: 93.5%
            </span>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={successChartData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorSuccess" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2}/>
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />
                <XAxis dataKey="name" stroke="#6b7280" fontSize={10} tickLine={false} />
                <YAxis domain={[80, 100]} stroke="#6b7280" fontSize={10} tickLine={false} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#111827', borderColor: '#374151', borderRadius: '8px' }}
                  labelStyle={{ color: '#f3f4f6', fontSize: '11px', fontWeight: 'bold' }}
                  itemStyle={{ color: '#3b82f6', fontSize: '11px' }}
                />
                <Area type="monotone" dataKey="successRate" stroke="#3b82f6" strokeWidth={2} fillOpacity={1} fill="url(#colorSuccess)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Incident Trend Bar/Line Chart */}
        <div className="bg-dark-900 border border-dark-700 rounded-xl p-5">
          <div className="flex justify-between items-center mb-4">
            <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider">Incident Activity Timeline</h4>
            <div className="flex gap-3 text-[10px] font-mono">
              <span className="flex items-center gap-1 text-rose-400">
                <span className="w-2 h-2 rounded-full bg-rose-500"></span>
                Opened
              </span>
              <span className="flex items-center gap-1 text-emerald-400">
                <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                Resolved
              </span>
            </div>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={incidentTrendData} margin={{ top: 10, right: 10, left: -30, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />
                <XAxis dataKey="name" stroke="#6b7280" fontSize={10} tickLine={false} />
                <YAxis stroke="#6b7280" fontSize={10} tickLine={false} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#111827', borderColor: '#374151', borderRadius: '8px' }}
                  labelStyle={{ color: '#f3f4f6', fontSize: '11px', fontWeight: 'bold' }}
                  itemStyle={{ fontSize: '11px' }}
                />
                <Line type="monotone" dataKey="open" stroke="#ef4444" strokeWidth={2} dot={{ r: 3 }} />
                <Line type="monotone" dataKey="resolved" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Audit Activity Log and Provider Status */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Webhook/Audit Logs */}
        <div className="bg-dark-900 border border-dark-700 rounded-xl p-5 lg:col-span-2">
          <div className="flex justify-between items-center mb-4">
            <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider">Aether Platform Audit Trail</h4>
            <button 
              onClick={() => navigateTo('notifications')}
              className="text-[10px] text-brand-500 hover:underline"
            >
              Full logs
            </button>
          </div>
          <div className="space-y-3 max-h-64 overflow-y-auto">
            {auditLogs.slice(0, 5).map(log => (
              <div key={log.id} className="flex items-start gap-3 p-3 bg-dark-950/40 rounded-lg border border-dark-750 text-xs">
                <div className={`p-1.5 rounded bg-dark-800 ${
                  log.action.includes('ROLLBACK') ? 'text-purple-400' :
                  log.action.includes('INCIDENT') ? 'text-rose-400' :
                  log.action.includes('CREATE') ? 'text-brand-500' : 'text-slate-400'
                }`}>
                  {log.action.includes('ROLLBACK') ? <RefreshCw size={12} /> :
                   log.action.includes('INCIDENT') ? <ShieldAlert size={12} /> :
                   log.action.includes('CREATE') ? <FolderGit2 size={12} /> : <Cpu size={12} />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-start mb-0.5">
                    <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-slate-300">
                      {log.action.replace('_', ' ')}
                    </span>
                    <span className="text-[9px] text-slate-500">
                      {new Date(log.createdAt).toLocaleTimeString()}
                    </span>
                  </div>
                  <p className="text-slate-400 leading-normal">{log.details}</p>
                  {log.projectName && (
                    <span className="inline-block mt-1 font-mono text-[9px] bg-dark-800 px-1.5 py-0.5 rounded text-slate-400">
                      Service: {log.projectName}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Integration Status Panel */}
        <div className="bg-dark-900 border border-dark-700 rounded-xl p-5 flex flex-col justify-between">
          <div>
            <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider mb-4">Cloud Provider Services</h4>
            <div className="space-y-4">
              {/* Vercel API Health */}
              <div className="p-3 bg-dark-950/40 border border-dark-750 rounded-lg">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-xs font-bold text-slate-300">Vercel API Gateway</span>
                  <span className="text-[10px] font-bold text-emerald-400 flex items-center gap-1 bg-emerald-500/10 px-2 py-0.5 rounded">
                    <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-ping"></span>
                    200 OK
                  </span>
                </div>
                <p className="text-[10px] text-slate-500 leading-normal">
                  Latency: 48ms • Webhooks: Hooked • Security: RSA-256
                </p>
              </div>

              {/* Netlify API Health */}
              <div className="p-3 bg-dark-950/40 border border-dark-750 rounded-lg">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-xs font-bold text-slate-300">Netlify CDN Registry</span>
                  <span className="text-[10px] font-bold text-emerald-400 flex items-center gap-1 bg-emerald-500/10 px-2 py-0.5 rounded">
                    <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-ping"></span>
                    200 OK
                  </span>
                </div>
                <p className="text-[10px] text-slate-500 leading-normal">
                  Latency: 65ms • Webhooks: Hooked • SSL: Confirmed
                </p>
              </div>
            </div>
          </div>

          <div className="mt-4 pt-4 border-t border-dark-750 text-center">
            <button 
              onClick={() => navigateTo('settings')}
              className="text-[11px] font-semibold text-brand-500 hover:underline"
            >
              Verify API Access Keys →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
