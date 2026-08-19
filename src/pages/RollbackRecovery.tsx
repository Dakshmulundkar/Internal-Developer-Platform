import React, { useState } from 'react';
import { usePlatform } from '../context/PlatformContext';
import { 
  ArrowLeft, RefreshCw, AlertTriangle, ShieldCheck, 
  Play, CheckCircle, Clock, Server, ArrowRight, User 
} from 'lucide-react';
import type { Deployment, Project } from '../types/platform';

export const RollbackRecovery: React.FC = () => {
  const { 
    projects, 
    deployments, 
    rollbackOperations, 
    startRollback, 
    activeProjectId,
    navigateTo 
  } = usePlatform();

  const [selectedProjId, setSelectedProjId] = useState<string>(activeProjectId || projects[0]?.id || '');
  const [targetDeployId, setTargetDeployId] = useState<string>('');

  const currentProject = projects.find(p => p.id === selectedProjId);
  
  // Filter successful candidate deployments for this project (status ready)
  const candidateDeploys = deployments.filter(
    d => d.projectId === selectedProjId && d.status === 'ready'
  );

  const activeFailedDeploy = deployments.filter(
    d => d.projectId === selectedProjId
  )[0]; // Latest deployment (could be failed or ready)

  // Rollback logs for the selected project
  const projectRollbacks = rollbackOperations.filter(r => r.projectId === selectedProjId);
  const activeRollback = rollbackOperations.find(r => r.projectId === selectedProjId && (r.status === 'queued' || r.status === 'in_progress'));

  const handleInitiateRollback = () => {
    if (!selectedProjId || !targetDeployId) return;
    startRollback(selectedProjId, targetDeployId);
    setTargetDeployId('');
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'success': return 'text-emerald-400 font-bold';
      case 'failed': return 'text-rose-400 font-bold';
      default: return 'text-blue-400 font-bold animate-pulse';
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Rollback Trigger panel */}
        <div className="bg-dark-900 border border-dark-700 rounded-xl p-5 lg:col-span-2 space-y-4">
          <h3 className="text-sm font-bold text-white mb-2">Initiate Recovery Rollback</h3>

          {/* Warning banner */}
          <div className="bg-rose-500/5 border border-rose-500/25 p-4 rounded-lg flex items-start gap-2.5 text-xs text-rose-300">
            <AlertTriangle className="text-rose-500 shrink-0 mt-0.5" size={16} />
            <div>
              <span className="font-bold text-white block mb-0.5">Destructive Infrastructure Redirection Warning</span>
              <p className="leading-relaxed text-slate-400">
                Redirection will modify edge routing rules immediately. This overrides the active production deployments on Vercel or Netlify. Please confirm stability metrics of the target archive first.
              </p>
            </div>
          </div>

          <div className="space-y-4">
            {/* Project Select */}
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">Target Service</label>
              <select
                value={selectedProjId}
                onChange={(e) => {
                  setSelectedProjId(e.target.value);
                  setTargetDeployId('');
                }}
                disabled={!!activeRollback}
                className="w-full bg-dark-950 border border-dark-750 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:border-brand-500 transition-all font-mono"
              >
                {projects.map(p => (
                  <option key={p.id} value={p.id}>{p.name} ({p.provider})</option>
                ))}
              </select>
            </div>

            {/* Target Stable Deployments select */}
            {candidateDeploys.length === 0 ? (
              <div className="p-4 bg-dark-950/20 border border-dark-750 text-slate-500 rounded text-center text-xs">
                No stable candidate archive deployments found for this service.
              </div>
            ) : (
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Target Stable Version</label>
                <select
                  value={targetDeployId}
                  onChange={(e) => setTargetDeployId(e.target.value)}
                  disabled={!!activeRollback}
                  className="w-full bg-dark-950 border border-dark-750 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:border-brand-500 transition-all font-mono"
                >
                  <option value="">-- Select a stable archive deployment --</option>
                  {candidateDeploys.map(d => (
                    <option key={d.id} value={d.id}>
                      {d.version} - Commit {d.commitHash} ({d.commitMessage.substr(0, 35)}...)
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Action Trigger button */}
            {targetDeployId && (
              <div className="pt-2">
                <button
                  onClick={handleInitiateRollback}
                  disabled={!!activeRollback}
                  className="bg-brand-600 hover:bg-brand-500 text-white font-bold py-2.5 px-4 rounded-lg text-xs transition-all shadow-md flex items-center gap-1.5 font-mono"
                >
                  <RefreshCw size={14} />
                  Initiate API Rollback Route
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Live progress and audit logger */}
        <div className="bg-dark-900 border border-dark-700 rounded-xl p-5 space-y-4">
          <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider">Active Recovery Monitor</h4>
          
          {activeRollback ? (
            <div className="space-y-4">
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-400">Status:</span>
                <span className={`uppercase font-mono text-[10px] ${getStatusColor(activeRollback.status)}`}>
                  {activeRollback.status.replace('_', ' ')}
                </span>
              </div>

              <div className="space-y-2 max-h-56 overflow-y-auto bg-dark-950 p-4 rounded-lg border border-dark-750 font-mono text-[10px] text-slate-300 leading-relaxed">
                {activeRollback.auditLogs.map((log, idx) => (
                  <div key={idx} className="flex gap-2">
                    <span className="text-brand-500">▶</span>
                    <span>{log}</span>
                  </div>
                ))}
              </div>

              <div className="flex items-center gap-2 text-[10px] text-slate-500 bg-dark-950/20 p-2.5 rounded border border-dark-750 leading-relaxed">
                <Clock size={14} className="shrink-0 text-slate-400" />
                <span>DNS edge configuration routes are changing. Aether checks live status nodes.</span>
              </div>
            </div>
          ) : (
            <div className="p-8 text-center text-slate-500 border border-dark-750 rounded-lg bg-dark-950/20">
              <ShieldCheck size={28} className="text-slate-600 mx-auto mb-2" />
              <p className="text-xs text-slate-300 font-bold">Recovery systems ready</p>
              <p className="text-[10px] text-slate-500 mt-1">Select a stable candidate deployment to launch.</p>
            </div>
          )}
        </div>
      </div>

      {/* Rollback audits timeline */}
      <div className="bg-dark-900 border border-dark-700 rounded-xl p-5">
        <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider mb-4">Rollback Recovery Audit Logs</h4>
        
        <div className="space-y-3">
          {projectRollbacks.length === 0 ? (
            <p className="text-xs text-slate-500 italic font-mono">No previous rollback events recorded for this project.</p>
          ) : (
            projectRollbacks.map(rb => (
              <div key={rb.id} className="p-4 bg-dark-950/40 rounded-lg border border-dark-750 text-xs">
                <div className="flex flex-col md:flex-row justify-between md:items-center gap-2 border-b border-dark-750/30 pb-2 mb-2 font-mono">
                  <div className="flex gap-2 flex-wrap items-center">
                    <span className="bg-brand-500/10 text-brand-400 px-2 py-0.5 rounded text-[10px] font-bold">
                      {rb.projectName}
                    </span>
                    <span className="text-[10px] text-slate-400">
                      Redirected to <b className="text-brand-400">{rb.targetVersion}</b>
                    </span>
                  </div>
                  <span className={`text-[10px] uppercase font-bold ${getStatusColor(rb.status)}`}>
                    {rb.status}
                  </span>
                </div>

                <div className="space-y-1.5 text-slate-400 font-mono text-[10px]">
                  <div>• Initiated: {new Date(rb.createdAt).toLocaleString()} by Administrator</div>
                  {rb.completedAt && <div>• Completed: {new Date(rb.completedAt).toLocaleString()}</div>}
                  <div className="text-slate-500 text-[9px] mt-1 pl-2">
                    Logs: {rb.auditLogs[rb.auditLogs.length - 1]}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
