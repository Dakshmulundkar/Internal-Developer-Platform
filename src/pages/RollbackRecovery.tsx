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
      case 'failed': return 'text-red-400 font-bold';
      default: return 'text-blue-400 font-bold animate-pulse';
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Rollback Trigger panel */}
        <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-5 lg:col-span-2 space-y-4">
          <h3 className="text-sm font-semibold text-white mb-2">Initiate Recovery Rollback</h3>

          {/* Warning banner */}
          <div className="bg-amber-500/5 border border-amber-500/20 p-4 rounded-lg flex items-start gap-2.5 text-xs text-amber-400">
            <AlertTriangle className="text-amber-400 shrink-0 mt-0.5" size={16} />
            <div>
              <span className="font-semibold text-white block mb-0.5">Destructive Infrastructure Redirection Warning</span>
              <p className="leading-relaxed text-zinc-400">
                Redirection will modify edge routing rules immediately. This overrides the active production deployments on Vercel or Netlify. Please confirm stability metrics of the target archive first.
              </p>
            </div>
          </div>

          <div className="space-y-4">
            {/* Project Select */}
            <div>
              <label className="block text-xs font-semibold text-zinc-400 mb-1">Target Service</label>
              <select
                value={selectedProjId}
                onChange={(e) => {
                  setSelectedProjId(e.target.value);
                  setTargetDeployId('');
                }}
                disabled={!!activeRollback}
                className="w-full bg-black/30 border border-white/[0.06] text-zinc-100 focus:outline-none focus:border-white/20 rounded-md p-2.5 text-xs font-mono"
              >
                {projects.map(p => (
                  <option key={p.id} value={p.id}>{p.name} ({p.provider})</option>
                ))}
              </select>
            </div>

            {/* Target Stable Deployments select */}
            {candidateDeploys.length === 0 ? (
              <div className="p-4 bg-white/[0.02] border border-white/[0.06] text-zinc-500 rounded text-center text-xs">
                No stable candidate archive deployments found for this service.
              </div>
            ) : (
              <div>
                <label className="block text-xs font-semibold text-zinc-400 mb-1">Target Stable Version</label>
                <select
                  value={targetDeployId}
                  onChange={(e) => setTargetDeployId(e.target.value)}
                  disabled={!!activeRollback}
                  className="w-full bg-black/30 border border-white/[0.06] text-zinc-100 focus:outline-none focus:border-white/20 rounded-md p-2.5 text-xs font-mono"
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
                  className="bg-white text-black hover:bg-zinc-200 disabled:opacity-50 font-medium py-2.5 px-4 rounded-lg text-xs transition-all flex items-center gap-1.5 font-mono"
                >
                  <RefreshCw size={14} />
                  Initiate API Rollback Route
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Live progress and audit logger */}
        <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-5 space-y-4">
          <h4 className="text-xs font-semibold text-zinc-100 uppercase tracking-wider">Active Recovery Monitor</h4>
          
          {activeRollback ? (
            <div className="space-y-4">
              <div className="flex justify-between items-center text-xs">
                <span className="text-zinc-400">Status:</span>
                <span className={`uppercase font-mono text-[10px] ${getStatusColor(activeRollback.status)}`}>
                  {activeRollback.status.replace('_', ' ')}
                </span>
              </div>

              <div className="space-y-2 max-h-56 overflow-y-auto bg-black/20 p-4 rounded-lg border border-white/[0.06] font-mono text-[10px] text-zinc-400 leading-relaxed">
                {activeRollback.auditLogs.map((log, idx) => (
                  <div key={idx} className="flex gap-2">
                    <span className="text-zinc-500">▶</span>
                    <span>{log}</span>
                  </div>
                ))}
              </div>

              <div className="flex items-center gap-2 text-[10px] text-zinc-500 bg-white/[0.02] p-2.5 rounded border border-white/[0.06] leading-relaxed">
                <Clock size={14} className="shrink-0 text-zinc-600" />
                <span>DNS edge configuration routes are changing. Aether checks live status nodes.</span>
              </div>
            </div>
          ) : (
            <div className="p-8 text-center text-zinc-600 border border-white/[0.06] rounded-lg bg-white/[0.01]">
              <ShieldCheck size={28} className="text-zinc-700 mx-auto mb-2" />
              <p className="text-xs text-zinc-300 font-semibold">Recovery systems ready</p>
              <p className="text-[10px] text-zinc-500 mt-1">Select a stable candidate deployment to launch.</p>
            </div>
          )}
        </div>
      </div>

      {/* Rollback audits timeline */}
      <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-5">
        <h4 className="text-xs font-semibold text-zinc-100 uppercase tracking-wider mb-4">Rollback Recovery Audit Logs</h4>
        
        <div className="space-y-3">
          {projectRollbacks.length === 0 ? (
            <p className="text-xs text-zinc-600 italic font-mono">No previous rollback events recorded for this project.</p>
          ) : (
            projectRollbacks.map(rb => (
              <div key={rb.id} className="p-4 bg-white/[0.02] rounded-lg border border-white/[0.06] text-xs">
                <div className="flex flex-col md:flex-row justify-between md:items-center gap-2 border-b border-white/[0.06] pb-2 mb-2 font-mono">
                  <div className="flex gap-2 flex-wrap items-center">
                    <span className="bg-white/5 text-zinc-300 border border-white/[0.06] px-2 py-0.5 rounded text-[10px] font-bold">
                      {rb.projectName}
                    </span>
                    <span className="text-[10px] text-zinc-400">
                      Redirected to <b className="text-zinc-200">{rb.targetVersion}</b>
                    </span>
                  </div>
                  <span className={`text-[10px] uppercase font-bold ${getStatusColor(rb.status)}`}>
                    {rb.status}
                  </span>
                </div>

                <div className="space-y-1.5 text-zinc-500 font-mono text-[10px]">
                  <div>• Initiated: {new Date(rb.createdAt).toLocaleString()} by Administrator</div>
                  {rb.completedAt && <div>• Completed: {new Date(rb.completedAt).toLocaleString()}</div>}
                  <div className="text-zinc-600 text-[9px] mt-1 pl-2">
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
