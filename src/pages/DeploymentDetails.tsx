import React, { useState } from 'react';
import { usePlatform } from '../context/PlatformContext';
import { 
  ArrowLeft, Terminal, Bot, RefreshCw, AlertCircle, 
  CheckCircle, Play, Server, GitCommit, User, Sparkles
} from 'lucide-react';
import { aiExplanations } from '../data/seedData';
import type { DeploymentStatus } from '../types/platform';

export const DeploymentDetails: React.FC = () => {
  const { 
    activeDeploymentId, 
    deployments, 
    navigateTo, 
    triggerWebhookSimulation,
    projects
  } = usePlatform();

  const [isRetrying, setIsRetrying] = useState(false);
  const [showRollbackModal, setShowRollbackModal] = useState(false);

  const deployment = deployments.find(d => d.id === activeDeploymentId);

  if (!deployment) {
    return (
      <div className="text-center p-8 bg-dark-900 border border-dark-700 rounded-xl">
        <h3 className="text-sm font-bold text-white mb-2">No active deployment selected</h3>
        <button 
          onClick={() => navigateTo('deployments')}
          className="bg-brand-600 hover:bg-brand-500 text-white font-bold py-1.5 px-3 rounded text-xs"
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
      case 'failed': return 'text-rose-400 font-bold';
      case 'building': return 'text-blue-400 font-bold animate-pulse';
      case 'rolled_back': return 'text-purple-400 font-bold';
      default: return 'text-slate-400';
    }
  };

  return (
    <div className="space-y-6">
      {/* Back button */}
      <button
        onClick={() => navigateTo('deployments')}
        className="flex items-center gap-2 text-xs font-semibold text-slate-400 hover:text-slate-200 transition-colors"
      >
        <ArrowLeft size={14} />
        Back to deployment history
      </button>

      {/* Summary grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Core Summary Card */}
        <div className="bg-dark-900 border border-dark-700 rounded-xl p-5 lg:col-span-2 space-y-4">
          <div className="flex justify-between items-start border-b border-dark-750 pb-4">
            <div>
              <span className="font-mono text-[10px] text-slate-500 font-bold uppercase block">
                Deployment Registry
              </span>
              <h3 className="text-base font-bold text-white tracking-wide mt-1">
                Pipeline Run: {deployment.version}
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                Project: <b className="text-slate-200">{deployment.projectName}</b> • Provider: <span className="uppercase text-[10px] bg-black text-white px-1 py-0.5 rounded font-mono font-black">{deployment.provider}</span>
              </p>
            </div>
            
            <div className="text-right">
              <span className="text-[10px] text-slate-500 font-mono">Status Indicator</span>
              <div className={`text-xs mt-1 uppercase font-mono ${getStatusStyle(deployment.status)}`}>
                {deployment.status.replace('_', ' ')}
              </div>
            </div>
          </div>

          {/* Details Row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
            <div>
              <span className="text-slate-500 block">Commit Hash</span>
              <span className="font-mono text-slate-300 flex items-center gap-1 mt-1">
                <GitCommit size={12} className="text-slate-500" />
                {deployment.commitHash}
              </span>
            </div>
            <div>
              <span className="text-slate-500 block">Target Branch</span>
              <span className="font-mono text-slate-300 mt-1 block">{deployment.branch}</span>
            </div>
            <div>
              <span className="text-slate-500 block">Triggered By</span>
              <span className="text-slate-300 flex items-center gap-1 mt-1">
                <User size={12} className="text-slate-500" />
                {deployment.author}
              </span>
            </div>
            <div>
              <span className="text-slate-500 block">Duration</span>
              <span className="font-mono text-slate-300 mt-1 block">
                {deployment.durationMs > 0 ? `${(deployment.durationMs / 1000).toFixed(1)}s` : '--'}
              </span>
            </div>
          </div>

          <div className="bg-dark-950/40 p-3 rounded border border-dark-750 text-xs">
            <span className="text-slate-500 block mb-1">Commit Message</span>
            <p className="font-semibold text-slate-200 font-mono">{deployment.commitMessage}</p>
          </div>

          {/* Action Trigger Options */}
          <div className="flex gap-3 border-t border-dark-750 pt-4">
            <button
              onClick={handleRetryPipeline}
              disabled={isRetrying || deployment.status === 'building'}
              className="bg-brand-600 hover:bg-brand-500 disabled:opacity-50 text-white font-bold py-2 px-4 rounded-lg text-xs transition-all shadow-md flex items-center gap-1.5 font-mono"
            >
              <RefreshCw size={14} className={isRetrying ? 'animate-spin' : ''} />
              {isRetrying ? 'Retrying Build...' : 'Re-Run Pipeline Webhook'}
            </button>

            {deployment.status === 'failed' && stableTarget && (
              <button
                onClick={() => setShowRollbackModal(true)}
                className="bg-purple-600 hover:bg-purple-500 text-white font-bold py-2 px-4 rounded-lg text-xs transition-all shadow-md flex items-center gap-1.5"
              >
                <Server size={14} />
                Trigger Quick Rollback
              </button>
            )}
          </div>
        </div>

        {/* Build Stages Progress Panel */}
        <div className="bg-dark-900 border border-dark-700 rounded-xl p-5 space-y-4">
          <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider">Build Stages Progression</h4>
          
          <div className="space-y-4 relative pl-4 before:content-[''] before:absolute before:left-[19px] before:top-2 before:bottom-2 before:w-0.5 before:bg-dark-750">
            {deployment.stages ? (
              deployment.stages.map((stage, idx) => (
                <div key={idx} className="relative flex items-start gap-3 text-xs">
                  {/* Status Indicator circle */}
                  <div className={`w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center -translate-x-[21px] bg-dark-900 z-10 ${
                    stage.status === 'success' ? 'border-emerald-500 text-emerald-400 bg-dark-900' :
                    stage.status === 'running' ? 'border-blue-500 text-blue-400 animate-pulse bg-dark-900' :
                    stage.status === 'failed' ? 'border-rose-500 text-rose-400 bg-dark-900' :
                    'border-dark-700 text-slate-500'
                  }`}>
                    {stage.status === 'success' && <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />}
                    {stage.status === 'running' && <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-ping" />}
                    {stage.status === 'failed' && <div className="w-1.5 h-1.5 rounded-full bg-rose-500" />}
                  </div>
                  
                  <div className="flex-1 -translate-x-[12px]">
                    <div className="flex justify-between items-center">
                      <span className={`font-semibold ${
                        stage.status === 'success' ? 'text-slate-200' :
                        stage.status === 'running' ? 'text-blue-400' : 'text-slate-500'
                      }`}>{stage.name}</span>
                      {stage.durationMs > 0 && (
                        <span className="font-mono text-[10px] text-slate-500">{(stage.durationMs / 1000).toFixed(1)}s</span>
                      )}
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-slate-500 italic text-[11px]">Timeline unavailable.</div>
            )}
          </div>
        </div>
      </div>

      {/* Failure diagnostic error and AI assistance analysis */}
      {deployment.status === 'failed' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Diagnostic Raw Failure Output */}
          <div className="bg-dark-900 border border-rose-500/20 rounded-xl p-5 lg:col-span-1 space-y-3">
            <h4 className="text-xs font-bold text-rose-400 uppercase tracking-wider flex items-center gap-1.5">
              <AlertCircle size={14} />
              Raw Exception Output
            </h4>
            
            <div className="bg-rose-950/10 border border-rose-500/20 p-4 rounded-lg font-mono text-[11px] text-rose-300 leading-normal overflow-x-auto whitespace-pre-wrap">
              {deployment.errorMessage || 'Unknown stack error detected during edge compilation.'}
            </div>
            
            <p className="text-[10px] text-slate-500 leading-relaxed">
              Verify database connection details or pull branch dependencies configurations. Webhook pipeline failed verification probe tests.
            </p>
          </div>

          {/* AI Analysis Diagnostic Assistance */}
          <div className="bg-dark-900 border border-brand-500/30 rounded-xl p-5 lg:col-span-2 space-y-4 glow-info">
            <div className="flex justify-between items-center border-b border-dark-750 pb-3">
              <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <Sparkles size={14} className="text-brand-400" />
                Aether AI Cause Diagnosis
              </h4>
              {aiAnalysis && (
                <span className="text-[10px] font-mono font-bold bg-brand-500/10 text-brand-400 px-2 py-0.5 rounded">
                  Confidence Score: {aiAnalysis.confidenceScore}%
                </span>
              )}
            </div>

            {aiAnalysis ? (
              <div className="space-y-4 text-xs">
                <div>
                  <span className="text-slate-500 block font-bold mb-1.5 uppercase text-[9px] tracking-wider">Analysis Summary</span>
                  <p className="text-slate-300 leading-relaxed font-sans">{aiAnalysis.explanation}</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Causes */}
                  <div className="space-y-2">
                    <span className="text-rose-400 font-bold block uppercase text-[9px] tracking-wider">Identified Root Causes</span>
                    <ul className="list-disc pl-4 space-y-1.5 text-slate-400">
                      {aiAnalysis.causes.map((c, i) => (
                        <li key={i} className="leading-normal">{c}</li>
                      ))}
                    </ul>
                  </div>

                  {/* Recommendations */}
                  <div className="space-y-2">
                    <span className="text-emerald-400 font-bold block uppercase text-[9px] tracking-wider">Suggested Recovery Path</span>
                    <ul className="list-decimal pl-4 space-y-1.5 text-slate-400">
                      {aiAnalysis.recommendations.map((r, i) => (
                        <li key={i} className="leading-normal">{r}</li>
                      ))}
                    </ul>
                  </div>
                </div>

                <div className="pt-2">
                  <button
                    onClick={() => navigateTo('ai-assistant', { projectId: deployment.projectId, deploymentId: deployment.id })}
                    className="bg-brand-600/10 hover:bg-brand-600/25 border border-brand-500/30 text-brand-400 font-bold py-1.5 px-3 rounded text-[11px] transition-all flex items-center gap-1.5"
                  >
                    <Bot size={12} />
                    Consult AI Assistant
                  </button>
                </div>
              </div>
            ) : (
              <div className="text-center p-6">
                <Bot size={28} className="text-slate-600 mx-auto mb-2 animate-bounce" />
                <p className="text-xs text-slate-400">Triggering analysis diagnostics scanner...</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Terminal log panel */}
      <div className="bg-dark-950 border border-dark-700 rounded-xl overflow-hidden shadow-2xl">
        <div className="bg-dark-900 border-b border-dark-750 px-4 py-3 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <Terminal size={14} className="text-slate-400" />
            <span className="font-mono text-slate-300 uppercase tracking-wide">Execution Console Logs</span>
          </div>
          <span className="font-mono text-[9px] text-slate-500">PAGER=cat</span>
        </div>

        <div className="p-5 font-mono text-[11px] text-slate-300 space-y-1 bg-dark-950 max-h-96 overflow-y-auto leading-relaxed">
          {deployment.logs ? (
            deployment.logs.map((log, i) => (
              <div key={i} className="flex gap-2">
                <span className="text-slate-600 select-none w-6 text-right">{(i + 1).toString().padStart(2, '0')}</span>
                <span className={
                  log.includes('Error') || log.includes('!!!') ? 'text-rose-400 font-semibold' :
                  log.includes('success') || log.includes('✓') ? 'text-emerald-400' :
                  log.includes('running') || log.includes('Installing') ? 'text-blue-400' : 'text-slate-300'
                }>{log}</span>
              </div>
            ))
          ) : (
            <div className="text-slate-500 italic">No logs available for this build run.</div>
          )}
        </div>
      </div>

      {/* Quick Rollback Confirmation Modal */}
      {showRollbackModal && stableTarget && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex justify-center items-center p-4 z-50">
          <div className="bg-dark-900 border border-dark-700 w-full max-w-md rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 border-b border-dark-750 pb-3 text-rose-400">
              <AlertCircle size={24} />
              <h3 className="font-bold text-sm text-white">Redirection Target Check</h3>
            </div>
            
            <p className="text-xs text-slate-400 leading-normal">
              You are about to override active routes for project <b className="text-slate-200">{deployment.projectName}</b> and redirect traffic.
            </p>

            <div className="bg-dark-950 p-4 rounded border border-dark-750 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500">Failed Version (Active)</span>
                <span className="font-mono text-rose-400 font-bold">{deployment.version}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Target Restore Version</span>
                <span className="font-mono text-emerald-400 font-bold">{stableTarget.version}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Target Commit Hash</span>
                <span className="font-mono text-slate-300">{stableTarget.commitHash}</span>
              </div>
            </div>

            <div className="p-3 bg-rose-500/5 rounded border border-rose-500/25 text-[10px] text-rose-300 leading-normal flex gap-2">
              <AlertCircle size={16} className="shrink-0" />
              <span>
                WARNING: This will update live DNS settings on your hosting provider platform API interface. Please ensure safety metrics before continuing.
              </span>
            </div>

            <div className="flex justify-end gap-3 pt-3 border-t border-dark-750">
              <button
                type="button"
                onClick={() => setShowRollbackModal(false)}
                className="px-3 py-1.5 rounded bg-dark-800 hover:bg-dark-750 border border-dark-700 text-slate-300 text-xs font-semibold transition-all"
              >
                Abort
              </button>
              <button
                type="button"
                onClick={handleRollbackConfirm}
                className="px-3 py-1.5 rounded bg-brand-600 hover:bg-brand-500 text-white text-xs font-bold transition-all shadow-md"
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
