import React from 'react';
import { usePlatform } from '../context/PlatformContext';
import { 
  ArrowLeft, Github, ExternalLink, RefreshCw, AlertTriangle, 
  History, Settings, Play, CheckCircle2, ChevronRight, HelpCircle 
} from 'lucide-react';
import type { DeploymentStatus, IncidentSeverity } from '../types/platform';

export const ProjectDetails: React.FC = () => {
  const { 
    activeProjectId, 
    projects, 
    deployments, 
    incidents, 
    navigateTo 
  } = usePlatform();

  const project = projects.find(p => p.id === activeProjectId);

  if (!project) {
    return (
      <div className="text-center p-8 bg-white/[0.03] border border-white/[0.06] rounded-xl">
        <h3 className="text-sm font-semibold text-white mb-2">No active project selected</h3>
        <button 
          onClick={() => navigateTo('projects')}
          className="bg-white text-black hover:bg-zinc-200 font-medium py-1.5 px-3 rounded text-xs"
        >
          Select project
        </button>
      </div>
    );
  }

  // Filter deployments and incidents specific to this project
  const projectDeploys = deployments.filter(d => d.projectId === project.id);
  const projectIncidents = incidents.filter(i => i.projectId === project.id);
  const activeIncident = projectIncidents.find(i => i.status !== 'resolved');

  // Status indicator badges helper
  const getStatusIndicator = (status: DeploymentStatus) => {
    switch (status) {
      case 'ready':
        return (
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
            <span className="text-xs font-semibold text-zinc-200">Operational</span>
          </div>
        );
      case 'failed':
        return (
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-ping"></span>
            <span className="text-xs font-semibold text-red-400">Failed / Unhealthy</span>
          </div>
        );
      case 'building':
        return (
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-spin"></span>
            <span className="text-xs font-semibold text-blue-400">Build in Progress</span>
          </div>
        );
      case 'rolled_back':
        return (
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-purple-500"></span>
            <span className="text-xs font-semibold text-purple-400">Recovered (Rolled back)</span>
          </div>
        );
      default:
        return (
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-zinc-500"></span>
            <span className="text-xs font-semibold text-zinc-500">Suspended</span>
          </div>
        );
    }
  };

  const getDeployStatusBadge = (status: DeploymentStatus) => {
    switch (status) {
      case 'ready': return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
      case 'failed': return 'bg-red-500/10 text-red-400 border-red-500/20';
      case 'building': return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
      case 'rolled_back': return 'bg-purple-500/10 text-purple-400 border-purple-500/25';
      default: return 'text-zinc-500 bg-white/5 border-white/[0.06]';
    }
  };

  const getSeverityBadge = (severity: IncidentSeverity) => {
    switch (severity) {
      case 'critical': return 'bg-red-500/10 text-red-400 border-red-500/20 font-bold';
      case 'high': return 'bg-orange-500/10 text-orange-400 border-orange-500/25';
      case 'medium': return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
      default: return 'text-zinc-500 bg-white/5 border-white/[0.06]';
    }
  };

  return (
    <div className="space-y-6">
      {/* Back link */}
      <button
        onClick={() => navigateTo('projects')}
        className="flex items-center gap-2 text-xs font-medium text-zinc-400 hover:text-zinc-200 transition-colors"
      >
        <ArrowLeft size={14} />
        Back to projects catalog
      </button>

      {/* Main Status Grid layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Core Project Card */}
        <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-5 lg:col-span-2 space-y-4">
          <div className="flex justify-between items-start border-b border-white/[0.06] pb-4">
            <div>
              <h3 className="text-base font-semibold text-white tracking-tight">{project.name}</h3>
              <div className="flex items-center gap-2 mt-2">
                <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase ${
                  project.provider === 'vercel' ? 'bg-black/40 text-zinc-200 border border-white/10' : 'bg-teal-500/10 text-teal-400 border border-teal-500/20'
                }`}>
                  {project.provider}
                </span>
                <span className="text-[10px] text-zinc-500 font-mono">Env: {project.environment}</span>
              </div>
            </div>
            {getStatusIndicator(project.status)}
          </div>

          <p className="text-xs text-zinc-400 leading-relaxed">{project.description}</p>

          {/* Repo & Webhook Config Detail */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-white/[0.02] p-4 rounded-lg border border-white/[0.06] text-xs">
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-zinc-500 font-medium">Source GitHub Repository</span>
                <span className="font-mono text-zinc-300 flex items-center gap-1">
                  <Github size={12} className="text-zinc-600" />
                  {project.repoOwner}/{project.repoName}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500 font-medium">Production Branch</span>
                <span className="font-mono text-zinc-400 bg-black/20 border border-white/5 px-1.5 py-0.5 rounded">
                  {project.branch}
                </span>
              </div>
            </div>
            
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-zinc-500 font-medium">Deployment Url</span>
                {project.status === 'ready' || project.status === 'rolled_back' ? (
                  <a 
                    href={projectDeploys[0]?.url} 
                    target="_blank" 
                    rel="noreferrer" 
                    className="text-zinc-300 hover:text-zinc-100 hover:underline flex items-center gap-1"
                  >
                    Visit App
                    <ExternalLink size={10} />
                  </a>
                ) : (
                  <span className="text-zinc-600 italic">Unavailable</span>
                )}
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500 font-medium">Registered Webhook</span>
                <span className="font-mono text-zinc-400 text-[10px]">Active</span>
              </div>
            </div>
          </div>

          {/* Quick Actions Panel */}
          <div className="flex flex-wrap gap-3 border-t border-white/[0.06] pt-4">
            {/* Rollback Trigger */}
            <button
              onClick={() => navigateTo('rollback-recovery', { projectId: project.id })}
              className="bg-white text-black hover:bg-zinc-200 font-medium py-2 px-4 rounded-lg text-xs transition-all flex items-center gap-1.5"
            >
              <RefreshCw size={14} />
              Initiate Rollback Recovery
            </button>

            {/* AI Assistant Diagnosis */}
            {project.status === 'failed' && (
              <button
                onClick={() => navigateTo('ai-assistant', { projectId: project.id, deploymentId: projectDeploys[0]?.id })}
                className="bg-red-500/10 border border-red-500/20 hover:bg-red-500/20 text-red-400 font-medium py-2 px-4 rounded-lg text-xs transition-all flex items-center gap-1.5"
              >
                <HelpCircle size={14} />
                Diagnose Build Failure
              </button>
            )}
          </div>
        </div>

        {/* Incidents Quick Status Panel */}
        <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-5 space-y-4">
          <h4 className="text-xs font-semibold text-zinc-100 uppercase tracking-wider">Service Incident Alerts</h4>
          
          {projectIncidents.length === 0 ? (
            <div className="p-4 bg-white/[0.02] border border-white/[0.06] rounded-lg text-center">
              <CheckCircle2 size={24} className="text-emerald-500 mx-auto mb-2" />
              <p className="text-xs text-zinc-300 font-semibold">No active alerts</p>
              <p className="text-[10px] text-zinc-500 mt-1">This service is running normally.</p>
            </div>
          ) : (
            <div className="space-y-3 max-h-[300px] overflow-y-auto">
              {projectIncidents.map(inc => (
                <div 
                  key={inc.id}
                  onClick={() => navigateTo('incidents', { incidentId: inc.id })}
                  className={`p-3 rounded-lg border text-xs cursor-pointer transition-all ${
                    inc.status !== 'resolved' 
                      ? 'bg-red-500/5 border-red-500/20 hover:border-red-500/30' 
                      : 'bg-white/[0.02] border-white/[0.06] hover:border-white/10'
                  }`}
                >
                  <div className="flex justify-between items-start gap-2 mb-1.5">
                    <span className="font-semibold text-zinc-200 hover:underline">{inc.title}</span>
                    <span className={`px-1.5 py-0.5 border rounded text-[9px] font-mono capitalize ${getSeverityBadge(inc.severity)}`}>
                      {inc.severity}
                    </span>
                  </div>
                  <p className="text-[11px] text-zinc-400 line-clamp-2 leading-relaxed">{inc.description}</p>
                  <div className="flex justify-between items-center mt-2 pt-2 border-t border-white/[0.06] text-[10px] text-zinc-500">
                    <span>Status: <b className={inc.status !== 'resolved' ? 'text-red-400' : 'text-emerald-400'}>{inc.status.toUpperCase()}</b></span>
                    <span>{new Date(inc.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Deployments History List */}
      <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-5">
        <div className="flex justify-between items-center mb-4">
          <h4 className="text-xs font-semibold text-zinc-100 uppercase tracking-wider flex items-center gap-1.5">
            <History size={14} className="text-zinc-500" />
            Deployment & Pipeline History
          </h4>
          <button 
            onClick={() => navigateTo('deployments')}
            className="text-[10px] text-zinc-400 hover:text-zinc-200 hover:underline"
          >
            Show full timeline
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-white/[0.06] text-[10px] font-semibold text-zinc-500 uppercase tracking-wider bg-white/[0.02]">
                <th className="py-2.5">VERSION</th>
                <th className="py-2.5">COMMIT MESSAGE</th>
                <th className="py-2.5">BRANCH</th>
                <th className="py-2.5">STATUS</th>
                <th className="py-2.5">DURATION</th>
                <th className="py-2.5">DEPLOYED DATE</th>
                <th className="py-2.5 text-right">ACTION</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.06] text-zinc-300">
              {projectDeploys.slice(0, 5).map(deploy => (
                <tr key={deploy.id} className="hover:bg-white/[0.02] group">
                  <td className="py-3 font-mono text-[10px] font-bold text-zinc-300">{deploy.version}</td>
                  <td className="py-3 max-w-xs truncate pr-4">
                    <span className="font-semibold text-zinc-200 block truncate">{deploy.commitMessage}</span>
                    <span className="text-[10px] text-zinc-500 font-mono block mt-0.5">SHA: {deploy.commitHash} by {deploy.author}</span>
                  </td>
                  <td className="py-3 font-mono text-[10px] text-zinc-500">{deploy.branch}</td>
                  <td className="py-3">
                    <span className={`px-2 py-0.5 border rounded-full text-[9px] font-mono font-semibold capitalize ${getDeployStatusBadge(deploy.status)}`}>
                      {deploy.status.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="py-3 font-mono text-zinc-500">
                    {deploy.durationMs > 0 ? `${(deploy.durationMs / 1000).toFixed(1)}s` : '--'}
                  </td>
                  <td className="py-3 text-zinc-500">
                    {new Date(deploy.createdAt).toLocaleDateString()} {new Date(deploy.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </td>
                  <td className="py-3 text-right">
                    <button
                      onClick={() => navigateTo('deployment-details', { deploymentId: deploy.id })}
                      className="text-[11px] font-medium text-zinc-400 hover:text-zinc-200 flex items-center gap-0.5 justify-end ml-auto"
                    >
                      Logs
                      <ChevronRight size={12} className="group-hover:translate-x-0.5 transition-transform" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
