import React, { useState } from 'react';
import { usePlatform } from '../context/PlatformContext';
import { 
  Search, Filter, Github, ChevronRight, Clock,
  ArrowRight, ShieldAlert, CheckCircle2, History 
} from 'lucide-react';
import type { DeploymentStatus } from '../types/platform';

export const Deployments: React.FC = () => {
  const { deployments, navigateTo } = usePlatform();
  const [searchTerm, setSearchTerm] = useState('');
  const [providerFilter, setProviderFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  const getStatusColor = (status: DeploymentStatus) => {
    switch (status) {
      case 'ready': return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25';
      case 'failed': return 'bg-rose-500/10 text-rose-400 border-rose-500/25';
      case 'building': return 'bg-blue-500/10 text-blue-400 border-blue-500/25';
      case 'queued': return 'bg-slate-500/10 text-slate-400 border-slate-500/25';
      case 'rolled_back': return 'bg-purple-500/10 text-purple-400 border-purple-500/25';
      default: return 'bg-slate-500/10 text-slate-400 border-slate-500/25';
    }
  };

  const filteredDeploys = deployments.filter(d => {
    const matchesSearch = d.projectName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      d.commitMessage.toLowerCase().includes(searchTerm.toLowerCase()) ||
      d.commitHash.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesProvider = providerFilter === 'all' || d.provider === providerFilter;
    const matchesStatus = statusFilter === 'all' || d.status === statusFilter;
    return matchesSearch && matchesProvider && matchesStatus;
  });

  return (
    <div className="space-y-6">
      {/* Filtering */}
      <div className="flex flex-col md:flex-row gap-4 items-stretch md:items-center justify-between">
        <div className="flex flex-wrap items-center gap-3 flex-1 max-w-2xl">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-2.5 text-slate-500" size={16} />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by commit message, hash, or project..."
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
              <option value="ready">Ready (Success)</option>
              <option value="failed">Failed</option>
              <option value="building">Building</option>
              <option value="queued">Queued</option>
              <option value="rolled_back">Rolled Back</option>
            </select>
          </div>
        </div>
      </div>

      {/* Table List */}
      <div className="bg-dark-900 border border-dark-700 rounded-xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-dark-750 text-slate-500 font-semibold font-mono text-[10px] bg-dark-950/20">
                <th className="p-4">PROJECT</th>
                <th className="p-4">VERSION</th>
                <th className="p-4">COMMIT MESSAGE</th>
                <th className="p-4">BRANCH</th>
                <th className="p-4">STATUS</th>
                <th className="p-4">DURATION</th>
                <th className="p-4">DEPLOYED DATE</th>
                <th className="p-4 text-right">ACTION</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-dark-750 text-slate-300">
              {filteredDeploys.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-slate-500 font-mono">
                    No matching deployment builds found.
                  </td>
                </tr>
              ) : (
                filteredDeploys.map((deploy) => (
                  <tr key={deploy.id} className="hover:bg-dark-950/20 group transition-all">
                    {/* Project & Provider */}
                    <td className="p-4 font-semibold text-white">
                      <div>{deploy.projectName}</div>
                      <span className="text-[9px] font-bold text-slate-500 font-mono uppercase mt-0.5 block">
                        {deploy.provider}
                      </span>
                    </td>

                    {/* Version */}
                    <td className="p-4 font-mono text-[10px] font-bold text-brand-400">
                      {deploy.version}
                    </td>

                    {/* Commit Message & Author */}
                    <td className="p-4 max-w-xs truncate pr-4">
                      <span className="font-semibold text-slate-200 block truncate">{deploy.commitMessage}</span>
                      <div className="flex items-center gap-1.5 mt-1">
                        {deploy.authorAvatar && (
                          <img src={deploy.authorAvatar} alt="" className="w-3.5 h-3.5 rounded-full" />
                        )}
                        <span className="text-[10px] text-slate-500 font-mono">
                          SHA: {deploy.commitHash} by {deploy.author}
                        </span>
                      </div>
                    </td>

                    {/* Branch */}
                    <td className="p-4 font-mono text-[10px] text-slate-400">
                      {deploy.branch}
                    </td>

                    {/* Status Badge */}
                    <td className="p-4">
                      <span className={`px-2 py-0.5 border rounded-full text-[9px] font-mono font-bold capitalize ${getStatusColor(deploy.status)}`}>
                        {deploy.status.replace('_', ' ')}
                      </span>
                    </td>

                    {/* Duration */}
                    <td className="p-4 font-mono text-slate-400">
                      {deploy.durationMs > 0 ? `${(deploy.durationMs / 1000).toFixed(1)}s` : '--'}
                    </td>

                    {/* Date */}
                    <td className="p-4 text-slate-400">
                      <div>{new Date(deploy.createdAt).toLocaleDateString()}</div>
                      <span className="text-[10px] text-slate-500 mt-0.5 block">
                        {new Date(deploy.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </td>

                    {/* Actions */}
                    <td className="p-4 text-right">
                      <button
                        onClick={() => navigateTo('deployment-details', { deploymentId: deploy.id })}
                        className="text-[11px] font-semibold text-brand-500 hover:text-brand-400 flex items-center gap-0.5 justify-end ml-auto group-hover:translate-x-0.5 transition-transform"
                      >
                        Details
                        <ChevronRight size={14} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
