import React, { useState } from 'react';
import { usePlatform } from '../context/PlatformContext';
import { 
  Search, Filter, Plus, Github, ExternalLink, 
  ArrowRight, ShieldAlert, CheckCircle, Clock, RefreshCw, XCircle
} from 'lucide-react';
import type { Project, DeploymentStatus } from '../types/platform';

export const Projects: React.FC = () => {
  const { projects, navigateTo, deployments } = usePlatform();
  const [searchTerm, setSearchTerm] = useState('');
  const [providerFilter, setProviderFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Helper to retrieve status badge styles
  const getStatusBadge = (status: DeploymentStatus) => {
    switch (status) {
      case 'ready':
        return (
          <span className="flex items-center gap-1.5 text-[10px] font-bold font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/25 px-2 py-0.5 rounded-full">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
            ACTIVE
          </span>
        );
      case 'failed':
        return (
          <span className="flex items-center gap-1.5 text-[10px] font-bold font-mono text-rose-400 bg-rose-500/10 border border-rose-500/25 px-2 py-0.5 rounded-full animate-pulse">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
            FAILING
          </span>
        );
      case 'building':
        return (
          <span className="flex items-center gap-1.5 text-[10px] font-bold font-mono text-blue-400 bg-blue-500/10 border border-blue-500/25 px-2 py-0.5 rounded-full">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-ping"></span>
            BUILDING
          </span>
        );
      case 'queued':
        return (
          <span className="flex items-center gap-1.5 text-[10px] font-bold font-mono text-slate-400 bg-slate-500/10 border border-slate-500/25 px-2 py-0.5 rounded-full">
            <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
            QUEUED
          </span>
        );
      case 'rolled_back':
        return (
          <span className="flex items-center gap-1.5 text-[10px] font-bold font-mono text-purple-400 bg-purple-500/10 border border-purple-500/25 px-2 py-0.5 rounded-full">
            <span className="w-1.5 h-1.5 rounded-full bg-purple-500"></span>
            RECOVERED
          </span>
        );
      default:
        return (
          <span className="flex items-center gap-1.5 text-[10px] font-bold font-mono text-slate-400 bg-slate-500/10 border border-slate-500/25 px-2 py-0.5 rounded-full">
            <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
            CANCELED
          </span>
        );
    }
  };

  // Helper to fetch last deployment info for a project
  const getLastDeployInfo = (projectId: string) => {
    const projectDeploys = deployments.filter(d => d.projectId === projectId);
    if (projectDeploys.length === 0) return 'No deployments';
    const latest = projectDeploys[0];
    const timeStr = new Date(latest.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric' });
    return `${latest.version} (${timeStr})`;
  };

  // Filter projects
  const filteredProjects = projects.filter(project => {
    const matchesSearch = project.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      project.repoName.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesProvider = providerFilter === 'all' || project.provider === providerFilter;
    const matchesStatus = statusFilter === 'all' || project.status === statusFilter;
    return matchesSearch && matchesProvider && matchesStatus;
  });

  return (
    <div className="space-y-6">
      {/* Header controls */}
      <div className="flex flex-col md:flex-row gap-4 items-stretch md:items-center justify-between">
        {/* Search & Filters */}
        <div className="flex flex-wrap items-center gap-3 flex-1 max-w-2xl">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-2.5 text-slate-500" size={16} />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search services by project or repository name..."
              className="w-full bg-dark-900 border border-dark-700 rounded-lg py-2 pl-10 pr-4 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-brand-500 transition-all font-mono"
            />
          </div>
          
          <div className="flex items-center gap-2">
            <select
              value={providerFilter}
              onChange={(e) => setProviderFilter(e.target.value)}
              className="bg-dark-900 border border-dark-700 rounded-lg p-2 text-xs text-slate-300 focus:outline-none focus:border-brand-500"
            >
              <option value="all">All Providers</option>
              <option value="vercel">Vercel</option>
              <option value="netlify">Netlify</option>
            </select>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-dark-900 border border-dark-700 rounded-lg p-2 text-xs text-slate-300 focus:outline-none focus:border-brand-500"
            >
              <option value="all">All Statuses</option>
              <option value="ready">Active</option>
              <option value="failed">Failing</option>
              <option value="building">Building</option>
              <option value="rolled_back">Recovered</option>
            </select>
          </div>
        </div>

        {/* Add Project Button */}
        <button
          onClick={() => navigateTo('create-project')}
          className="bg-brand-600 hover:bg-brand-500 text-white font-bold py-2 px-4 rounded-lg text-xs transition-all shadow-md shadow-brand-600/10 flex items-center justify-center gap-1.5"
        >
          <Plus size={14} />
          Register Service
        </button>
      </div>

      {/* Services List */}
      {filteredProjects.length === 0 ? (
        <div className="bg-dark-900 border border-dark-700 rounded-xl p-12 text-center max-w-lg mx-auto">
          <FolderGit2 className="mx-auto text-slate-600 mb-3" size={32} />
          <h3 className="text-sm font-bold text-white mb-1">No services matched criteria</h3>
          <p className="text-xs text-slate-400 mb-4">
            Try adjusting your search queries or register a new repository to verify.
          </p>
          <button
            onClick={() => navigateTo('create-project')}
            className="bg-dark-800 hover:bg-dark-750 border border-dark-700 text-slate-200 font-bold py-1.5 px-3 rounded text-xs transition-all"
          >
            Register first service
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredProjects.map((project) => (
            <div 
              key={project.id}
              className={`bg-dark-900 border rounded-xl overflow-hidden shadow-lg transition-all hover:-translate-y-1 hover:shadow-xl ${
                project.status === 'failed' 
                  ? 'border-rose-500/25 hover:border-rose-500/50 glow-error' 
                  : 'border-dark-700 hover:border-dark-600'
              }`}
            >
              {/* Card Header */}
              <div className="p-5 border-b border-dark-750">
                <div className="flex justify-between items-start gap-2 mb-2">
                  <h4 
                    onClick={() => navigateTo('project-details', { projectId: project.id })}
                    className="font-bold text-white hover:text-brand-500 transition-colors text-sm cursor-pointer truncate"
                  >
                    {project.name}
                  </h4>
                  {getStatusBadge(project.status)}
                </div>
                <p className="text-slate-400 text-xs line-clamp-2 h-8 leading-normal mt-1.5">{project.description}</p>
              </div>

              {/* Card Meta Body */}
              <div className="p-5 space-y-3 bg-dark-950/20">
                {/* Repository details */}
                <div className="flex justify-between text-xs">
                  <span className="text-slate-500">Repository</span>
                  <div className="flex items-center gap-1 font-mono text-[10px] text-slate-300">
                    <Github size={10} className="text-slate-500" />
                    <span>{project.repoOwner}/{project.repoName}</span>
                  </div>
                </div>

                {/* Integration provider */}
                <div className="flex justify-between text-xs">
                  <span className="text-slate-500">Hosting Provider</span>
                  <div className="flex items-center gap-1.5 font-mono text-[10px] text-slate-300">
                    <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold font-mono tracking-wider uppercase ${
                      project.provider === 'vercel' ? 'bg-black text-white' : 'bg-teal-500/10 text-teal-400'
                    }`}>
                      {project.provider}
                    </span>
                    <span>{project.environment}</span>
                  </div>
                </div>

                {/* Branch */}
                <div className="flex justify-between text-xs">
                  <span className="text-slate-500">Target Branch</span>
                  <span className="font-mono text-[10px] text-brand-400 font-semibold bg-brand-500/5 px-1.5 py-0.5 rounded">
                    {project.branch}
                  </span>
                </div>

                {/* Last Deployment */}
                <div className="flex justify-between text-xs">
                  <span className="text-slate-500">Last Deploy</span>
                  <span className="font-mono text-[10px] text-slate-300">{getLastDeployInfo(project.id)}</span>
                </div>
              </div>

              {/* Card Footer Actions */}
              <div className="px-5 py-3.5 bg-dark-950/40 border-t border-dark-750 flex items-center justify-between">
                <button
                  onClick={() => navigateTo('project-details', { projectId: project.id })}
                  className="text-xs font-semibold text-slate-400 hover:text-slate-200 transition-colors flex items-center gap-1"
                >
                  Manage Project
                  <ArrowRight size={12} />
                </button>

                {project.status === 'failed' && (
                  <button
                    onClick={() => navigateTo('ai-assistant', { projectId: project.id })}
                    className="text-xs font-semibold text-rose-400 hover:text-rose-300 hover:underline transition-colors flex items-center gap-1"
                  >
                    Diagnose Build
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
