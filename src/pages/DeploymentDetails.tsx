import React, { useState } from 'react';
import { usePlatform } from '../context/PlatformContext';
import { 
  ArrowLeft, Terminal, Bot, RefreshCw, AlertCircle, 
  CheckCircle, Play, Server, GitCommit, User, Sparkles
} from 'lucide-react';
import { aiExplanations, initialSentryIssues } from '../data/seedData';
import type { DeploymentStatus } from '../types/platform';

export const DeploymentDetails: React.FC = () => {
  const { 
    activeDeploymentId, 
    deployments, 
    navigateTo, 
    triggerWebhookSimulation,
    projects,
    monitoringAlerts,
  } = usePlatform();

  const [isRetrying, setIsRetrying] = useState(false);
  const [showRollbackModal, setShowRollbackModal] = useState(false);

  const deployment = deployments.find(d => d.id === activeDeploymentId);

  if (!deployment) {
    return (
      <div className="text-center p-8 bg-white/[0.03] border border-white/[0.06] rounded-xl">
        <h3 className="text-sm font-semibold text-white mb-2">No active deployment selected</h3>
        <button 
          onClick={() => navigateTo('deployments')}
          className="bg-white text-black hover:bg-zinc-200 font-medium py-1.5 px-3 rounded text-xs"
        >
          Select deployment
        </button>
      </div>
    );
  }

  // Find stable candidate for rollback (not this one, and status ready)
  const projectStableDeploys = deployments.filter(
    d => d.projectId === deployment.projectId && d.status === 'ready' && d.id !== deployment.id
  );
  const stableTarget = projectStableDeploys[0];

  const handleRetryPipeline = () => {
    setIsRetrying(true);
    triggerWebhookSimulation(deployment.projectId, 'ready'); // force success on retry for demo smoothness
    
    setTimeout(() => {
      setIsRetrying(false);
      navigateTo('deployments');
    }, 1500);
  };

  const handleRollbackConfirm = () => {
    setShowRollbackModal(false);
    navigateTo('rollback-recovery', { projectId: deployment.projectId });
  };

  // Get AI Analysis for this deployment if it failed
  const aiAnalysis = aiExplanations[deployment.id];

  const getStatusStyle = (status: DeploymentStatus) => {
    switch (status) {
      case 'ready': return 'text-emerald-400 font-bold';
      case 'failed': return 'text-red-400 font-bold';
      case 'building': return 'text-blue-400 font-bold animate-pulse';
      case 'rolled_back': return 'text-purple-400 font-bold';
      default: return 'text-zinc-400';
    }
  };

  return (
    <div className="space-y-6">
      {/* Back button */}
      <button
        onClick={() => navigateTo('deployments')}
        className="flex items-center gap-2 text-xs font-medium text-zinc-400 hover:text-zinc-200 transition-colors"
      >
        <ArrowLeft size={14} />
        Back to deployment history
      </button>

      {/* Summary grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Core Summary Card */}
        <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-5 lg:col-span-2 space-y-4">
          <div className="flex justify-between items-start border-b border-white/[0.06] pb-4">
            <div>
              <span className="font-mono text-[10px] text-zinc-500 font-bold uppercase block">
                Deployment Registry
              </span>
              <h3 className="text-base font-semibold text-white tracking-tight mt-1">
                Pipeline Run: {deployment.version}
              </h3>
              <p className="text-xs text-zinc-400 mt-1">
                Project: <b className="text-zinc-200">{deployment.projectName}</b> • Provider: <span className="uppercase text-[10px] bg-black/40 text-zinc-200 border border-white/10 px-1 py-0.5 rounded font-mono font-bold">{deployment.provider}</span>
              </p>
            </div>
            
            <div className="text-right">
              <span className="text-[10px] text-zinc-500 font-mono">Status Indicator</span>
              <div className={`text-xs mt-1 uppercase font-mono ${getStatusStyle(deployment.status)}`}>
                {deployment.status.replace('_', ' ')}
              </div>
            </div>
          </div>

          {/* Details Row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
            <div>
              <span className="text-zinc-500 block">Commit Hash</span>
              <span className="font-mono text-zinc-300 flex items-center gap-1 mt-1">
                <GitCommit size={12} className="text-zinc-600" />
                {deployment.commitHash}
              </span>
            </div>
            <div>
              <span className="text-zinc-500 block">Target Branch</span>
              <span className="font-mono text-zinc-300 mt-1 block">{deployment.branch}</span>
            </div>
            <div>
              <span className="text-zinc-500 block">Triggered By</span>
              <span className="text-zinc-300 flex items-center gap-1 mt-1">
                <User size={12} className="text-zinc-600" />
                {deployment.author}
              </span>
            </div>
            <div>
              <span className="text-zinc-500 block">Duration</span>
              <span className="font-mono text-zinc-300 mt-1 block">
                {deployment.durationMs > 0 ? `${(deployment.durationMs / 1000).toFixed(1)}s` : '--'}
              </span>
            </div>
          </div>

          <div className="bg-black/20 border border-white/5 p-3 rounded text-xs">
            <span className="text-zinc-500 block mb-1">Commit Message</span>
            <p className="font-semibold text-zinc-200 font-mono">{deployment.commitMessage}</p>
          </div>

          {/* Action Trigger Options */}
          <div className="flex gap-3 border-t border-white/[0.06] pt-4">
            <button
              onClick={handleRetryPipeline}
              disabled={isRetrying || deployment.status === 'building'}
              className="bg-white text-black hover:bg-zinc-200 disabled:opacity-50 font-medium py-2 px-4 rounded-lg text-xs transition-all flex items-center gap-1.5 font-mono"
            >
              <RefreshCw size={14} className={isRetrying ? 'animate-spin' : ''} />
              {isRetrying ? 'Retrying Build...' : 'Re-Run Pipeline Webhook'}
            </button>

            {deployment.status === 'failed' && stableTarget && (
              <button
                onClick={() => setShowRollbackModal(true)}
                className="bg-zinc-900 text-zinc-300 border border-white/[0.06] hover:bg-zinc-800 font-medium py-2 px-4 rounded-lg text-xs transition-all flex items-center gap-1.5"
              >
                <Server size={14} />
                Trigger Quick Rollback
              </button>
            )}
          </div>
        </div>

        {/* Build Stages Progress Panel */}
        <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-5 space-y-4">
          <h4 className="text-xs font-semibold text-zinc-100 uppercase tracking-wider">Build Stages Progression</h4>
          
          <div className="space-y-4 relative pl-4 before:content-[''] before:absolute before:left-[19px] before:top-2 before:bottom-2 before:w-0.5 before:bg-white/[0.06]">
            {deployment.stages ? (
              deployment.stages.map((stage, idx) => (
                <div key={idx} className="relative flex items-start gap-3 text-xs">
                  {/* Status Indicator circle */}
                  <div className={`w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center -translate-x-[21px] bg-[#050505] z-10 ${
                    stage.status === 'success' ? 'border-emerald-500' :
                    stage.status === 'running' ? 'border-blue-500 animate-pulse' :
                    stage.status === 'failed' ? 'border-red-500' :
                    'border-white/[0.06]'
                  }`}>
                    {stage.status === 'success' && <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />}
                    {stage.status === 'running' && <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-ping" />}
                    {stage.status === 'failed' && <div className="w-1.5 h-1.5 rounded-full bg-red-500" />}
                  </div>
                  
                  <div className="flex-1 -translate-x-[12px]">
                    <div className="flex justify-between items-center">
                      <span className={`font-medium ${
                        stage.status === 'success' ? 'text-zinc-200' :
                        stage.status === 'running' ? 'text-blue-400' : 'text-zinc-500'
                      }`}>{stage.name}</span>
                      {stage.durationMs > 0 && (
                        <span className="font-mono text-[10px] text-zinc-600">{(stage.durationMs / 1000).toFixed(1)}s</span>
                      )}
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-zinc-500 italic text-[11px]">Timeline unavailable.</div>
            )}
          </div>
        </div>
      </div>

      {/* Failure diagnostic error and AI assistance analysis */}
      {deployment.status === 'failed' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Diagnostic Raw Failure Output */}
          <div className="bg-white/[0.03] border border-red-500/20 rounded-xl p-5 lg:col-span-1 space-y-3">
            <h4 className="text-xs font-semibold text-red-400 uppercase tracking-wider flex items-center gap-1.5">
              <AlertCircle size={14} />
              Raw Exception Output
            </h4>
            
            <div className="bg-red-500/5 border border-red-500/20 p-4 rounded-lg font-mono text-[11px] text-red-300 leading-normal overflow-x-auto whitespace-pre-wrap">
              {deployment.errorMessage || 'Unknown stack error detected during edge compilation.'}
            </div>
            
            <p className="text-[10px] text-zinc-500 leading-relaxed">
              Verify database connection details or pull branch dependencies configurations. Webhook pipeline failed verification probe tests.
            </p>
          </div>

          {/* AI Analysis Diagnostic Assistance */}
          <div className="bg-white/[0.03] border border-white/10 rounded-xl p-5 lg:col-span-2 space-y-4">
            <div className="flex justify-between items-center border-b border-white/[0.06] pb-3">
              <h4 className="text-xs font-semibold text-white uppercase tracking-wider flex items-center gap-2">
                <Sparkles size={14} className="text-zinc-400" />
                Aether AI Cause Diagnosis
              </h4>
              {aiAnalysis && (
                <span className="text-[10px] font-mono font-bold bg-white/5 text-zinc-300 border border-white/[0.06] px-2 py-0.5 rounded">
                  Confidence Score: {aiAnalysis.confidenceScore}%
                </span>
              )}
            </div>

            {aiAnalysis ? (
              <div className="space-y-4 text-xs">
                <div>
                  <span className="text-zinc-500 block font-semibold mb-1.5 uppercase text-[9px] tracking-wider">Analysis Summary</span>
                  <p className="text-zinc-300 leading-relaxed font-sans">{aiAnalysis.explanation}</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Causes */}
                  <div className="space-y-2">
                    <span className="text-red-400 font-semibold block uppercase text-[9px] tracking-wider">Identified Root Causes</span>
                    <ul className="list-disc pl-4 space-y-1.5 text-zinc-400">
                      {aiAnalysis.causes.map((c, i) => (
                        <li key={i} className="leading-normal">{c}</li>
                      ))}
                    </ul>
                  </div>

                  {/* Recommendations */}
                  <div className="space-y-2">
                    <span className="text-emerald-400 font-semibold block uppercase text-[9px] tracking-wider">Suggested Recovery Path</span>
                    <ul className="list-decimal pl-4 space-y-1.5 text-zinc-400">
                      {aiAnalysis.recommendations.map((r, i) => (
                        <li key={i} className="leading-normal">{r}</li>
                      ))}
                    </ul>
                  </div>
                </div>

                <div className="pt-2">
                  <button
                    onClick={() => navigateTo('ai-assistant', { projectId: deployment.projectId, deploymentId: deployment.id })}
                    className="bg-white/[0.03] hover:bg-white/5 border border-white/[0.06] text-zinc-300 font-medium py-1.5 px-3 rounded text-[11px] transition-all flex items-center gap-1.5"
                  >
                    <Bot size={12} />
                    Consult AI Assistant
                  </button>
                </div>
              </div>
            ) : (
              <div className="text-center p-6">
                <Bot size={28} className="text-zinc-600 mx-auto mb-2 animate-bounce" />
                <p className="text-xs text-zinc-400">Triggering analysis diagnostics scanner...</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Terminal log panel */}
      <div className="bg-black/20 border border-white/[0.06] rounded-xl overflow-hidden">
        <div className="bg-white/[0.02] border-b border-white/[0.06] px-4 py-3 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <Terminal size={14} className="text-zinc-500" />
            <span className="font-mono text-zinc-400 uppercase tracking-wide">Execution Console Logs</span>
          </div>
          <span className="font-mono text-[9px] text-zinc-600">PAGER=cat</span>
        </div>

        <div className="p-5 font-mono text-[11px] text-zinc-400 space-y-1 max-h-96 overflow-y-auto leading-relaxed">
          {deployment.logs ? (
            deployment.logs.map((log, i) => (
              <div key={i} className="flex gap-2">
                <span className="text-zinc-700 select-none w-6 text-right">{(i + 1).toString().padStart(2, '0')}</span>
                <span className={
                  log.includes('Error') || log.includes('!!!') ? 'text-red-400 font-semibold' :
                  log.includes('success') || log.includes('✓') ? 'text-emerald-400' :
                  log.includes('running') || log.includes('Installing') ? 'text-blue-400' : 'text-zinc-400'
                }>{log}</span>
              </div>
            ))
          ) : (
            <div className="text-zinc-600 italic">No logs available for this build run.</div>
          )}
        </div>
      </div>

      {/* Plugin Signals Near This Deployment */}
      {(() => {
        const depTime = new Date(deployment.createdAt).getTime();
        const nearAlerts = monitoringAlerts.filter((a: any) =>
          Math.abs(new Date(a.firedAt).getTime() - depTime) < 1800000
        );
        const releaseIssues = initialSentryIssues.filter(i =>
          i.release === deployment.version || i.deploymentId === deployment.id
        );

        const sourceBadge = (source: string) => {
          const map: Record<string, string> = {
            netlify: 'bg-teal-500/10 text-teal-400 border border-teal-500/20',
            vercel:  'bg-zinc-500/10 text-zinc-200 border border-zinc-500/20',
            grafana: 'bg-orange-500/10 text-orange-400 border border-orange-500/20',
            datadog: 'bg-purple-500/10 text-purple-400 border border-purple-500/20',
            sentry:  'bg-violet-500/10 text-violet-400 border border-violet-500/20',
          };
          return map[source.toLowerCase()] || 'bg-zinc-500/10 text-zinc-400 border border-zinc-500/20';
        };
        const sourceLabel = (source: string) => {
          const m: Record<string, string> = { netlify:'NF',vercel:'VC',grafana:'GF',datadog:'DD',sentry:'SN' };
          return m[source.toLowerCase()] || source.slice(0,2).toUpperCase();
        };
        const sevClass = (sev: string) => {
          const m: Record<string, string> = {
            critical:'text-red-400 bg-red-500/10 border border-red-500/20',
            high:'text-orange-400 bg-orange-500/10 border border-orange-500/20',
            medium:'text-amber-400 bg-amber-500/10 border border-amber-500/20',
            low:'text-zinc-400 bg-zinc-500/10 border border-zinc-500/20',
          };
          return m[sev] || m.low;
        };
        const levelClass = (level: string) => {
          const m: Record<string, string> = {
            fatal:'text-red-400 bg-red-500/10 border border-red-500/20',
            error:'text-orange-400 bg-orange-500/10 border border-orange-500/20',
            warning:'text-amber-400 bg-amber-500/10 border border-amber-500/20',
            info:'text-zinc-400 bg-zinc-500/10 border border-zinc-500/20',
          };
          return m[level] || m.info;
        };

        const deltaLabel = (firedAt: string) => {
          const diff = Math.round((new Date(firedAt).getTime() - depTime) / 60000);
          return diff >= 0 ? `+${diff}m after` : `${diff}m before`;
        };

        return (
          <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-5 space-y-5">
            <h4 className="text-xs font-semibold text-zinc-100 uppercase tracking-wider">Plugin Signals Near This Deployment</h4>

            {/* Sub-section 1: Monitoring Alerts ±30 min */}
            <div>
              <h5 className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider mb-3">Monitoring Alerts (±30 min)</h5>
              {nearAlerts.length === 0 ? (
                <p className="text-xs text-zinc-600 italic">No alerts fired within ±30 minutes of this deployment.</p>
              ) : (
                <div className="space-y-2">
                  {nearAlerts.map((alert: any) => (
                    <div key={alert.id} onClick={() => navigateTo('monitoring')}
                      className="flex items-center gap-3 p-2.5 bg-white/[0.02] border border-white/[0.06] rounded-lg cursor-pointer hover:bg-white/[0.04] transition-all">
                      <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold font-mono border shrink-0 ${sourceBadge(alert.source)}`}>
                        {sourceLabel(alert.source)}
                      </span>
                      <span className={`px-1.5 py-0.5 rounded text-[9px] font-mono border shrink-0 ${sevClass(alert.severity)}`}>
                        {alert.severity}
                      </span>
                      <span className="text-xs text-zinc-300 flex-1 truncate">{alert.title}</span>
                      <span className="text-[9px] font-mono text-zinc-500 shrink-0">{deltaLabel(alert.firedAt)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Sub-section 2: Sentry Issues in This Release */}
            <div>
              <h5 className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider mb-3">Sentry Issues in This Release</h5>
              {releaseIssues.length === 0 ? (
                <p className="text-xs text-zinc-600 italic">No Sentry issues linked to this release version.</p>
              ) : (
                <div className="space-y-2">
                  {releaseIssues.map(issue => (
                    <div key={issue.id} className="flex items-center gap-3 p-2.5 bg-white/[0.02] border border-white/[0.06] rounded-lg">
                      <span className={`px-1.5 py-0.5 rounded text-[9px] font-mono border shrink-0 ${levelClass(issue.level)}`}>
                        {issue.level}
                      </span>
                      <span className="text-xs text-zinc-300 flex-1 truncate">{issue.title}</span>
                      <span className="text-[10px] font-mono text-zinc-500 shrink-0">{issue.count}×</span>
                      <span className="text-[9px] text-zinc-600 font-mono shrink-0">{new Date(issue.firstSeen).toLocaleDateString()}</span>
                      <button onClick={() => navigateTo('ai-assistant', { projectId: deployment.projectId, deploymentId: issue.deploymentId })}
                        className="text-[10px] text-zinc-400 hover:text-zinc-200 border border-white/[0.06] hover:border-white/10 px-2 py-0.5 rounded transition-all shrink-0">
                        Ask AI
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* Quick Rollback Confirmation Modal */}
      {showRollbackModal && stableTarget && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex justify-center items-center p-4 z-50">
          <div className="bg-[#050505] border border-white/[0.06] w-full max-w-md rounded-2xl p-6 shadow-2xl space-y-4 glass">
            <div className="flex items-center gap-3 border-b border-white/[0.06] pb-3 text-red-400">
              <AlertCircle size={24} />
              <h3 className="font-semibold text-sm text-white">Redirection Target Check</h3>
            </div>
            
            <p className="text-xs text-zinc-400 leading-normal">
              You are about to override active routes for project <b className="text-zinc-200">{deployment.projectName}</b> and redirect traffic.
            </p>

            <div className="bg-black/20 border border-white/[0.06] p-4 rounded space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-zinc-500">Failed Version (Active)</span>
                <span className="font-mono text-red-400 font-bold">{deployment.version}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">Target Restore Version</span>
                <span className="font-mono text-emerald-400 font-bold">{stableTarget.version}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">Target Commit Hash</span>
                <span className="font-mono text-zinc-300">{stableTarget.commitHash}</span>
              </div>
            </div>

            <div className="p-3 bg-amber-500/5 rounded border border-amber-500/20 text-[10px] text-amber-400 leading-normal flex gap-2">
              <AlertCircle size={16} className="shrink-0" />
              <span>
                WARNING: This will update live DNS settings on your hosting provider platform API interface. Please ensure safety metrics before continuing.
              </span>
            </div>

            <div className="flex justify-end gap-3 pt-3 border-t border-white/[0.06]">
              <button
                type="button"
                onClick={() => setShowRollbackModal(false)}
                className="px-3 py-1.5 rounded bg-zinc-900 hover:bg-zinc-800 border border-white/[0.06] text-zinc-300 text-xs font-medium transition-all"
              >
                Abort
              </button>
              <button
                type="button"
                onClick={handleRollbackConfirm}
                className="px-3 py-1.5 rounded bg-white text-black hover:bg-zinc-200 text-xs font-medium transition-all"
              >
                Initiate Rollback Recovery
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
