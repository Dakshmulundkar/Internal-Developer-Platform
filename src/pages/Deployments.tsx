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
      case 'ready': return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
      case 'failed': return 'bg-red-500/10 text-red-400 border-red-500/20';
      case 'building': return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
      case 'queued': return 'text-zinc-500 bg-white/5 border-white/[0.06]';
      case 'rolled_back': return 'bg-purple-500/10 text-purple-400 border-purple-500/25';
      default: return 'text-zinc-500 bg-white/5 border-white/[0.06]';
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
            <Search className="absolute left-3 top-2.5 text-zinc-600" size={16} />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by commit message, hash, or project..."
              className="w-full bg-black/30 border border-white/[0.06] text-zinc-100 placeholder-zinc-600 focus:border-white/20 focus:outline-none rounded-md text-xs font-mono py-2 pl-10 pr-4"
            />
          </div>

          <div className="flex items-center gap-2">
            <select
              value={providerFilter}
              onChange={(e) => setProviderFilter(e.target.value)}
              className="bg-black/30 border border-white/[0.06] text-zinc-300 focus:outline-none focus:border-white/20 rounded-md p-2 text-xs"
            >
              <option value="all">All Providers</option>
              <option value="vercel">Vercel</option>
              <option value="netlify">Netlify</option>
            </select>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-black/30 border border-white/[0.06] text-zinc-300 focus:outline-none focus:border-white/20 rounded-md p-2 text-xs"
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
      <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-white/[0.06] text-[10px] font-semibold text-zinc-500 uppercase tracking-wider bg-white/[0.02]">
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
            <tbody className="divide-y divide-white/[0.06] text-zinc-300">
              {filteredDeploys.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-zinc-500 font-mono">
                    No matching deployment builds found.
                  </td>
                </tr>
              ) : (
                filteredDeploys.map((deploy) => (
                  <tr key={deploy.id} className="hover:bg-white/[0.02] group transition-all">
                    {/* Project & Provider */}
                    <td className="p-4 font-semibold text-white">
                      <div>{deploy.projectName}</div>
                      <span className="text-[9px] font-bold text-zinc-600 font-mono uppercase mt-0.5 block">
                        {deploy.provider}
                      </span>
                    </td>

                    {/* Version */}
                    <td className="p-4 font-mono text-[10px] font-bold text-zinc-300">
                      {deploy.version}
                    </td>

                    {/* Commit Message & Author */}
                    <td className="p-4 max-w-xs truncate pr-4">
                      <span className="font-semibold text-zinc-200 block truncate">{deploy.commitMessage}</span>
                      <div className="flex items-center gap-1.5 mt-1">
                        {deploy.authorAvatar && (
                          <img src={deploy.authorAvatar} alt="" className="w-3.5 h-3.5 rounded-full" />
                        )}
                        <span className="text-[10px] text-zinc-500 font-mono">
                          SHA: {deploy.commitHash} by {deploy.author}
                        </span>
                      </div>
                    </td>

                    {/* Branch */}
                    <td className="p-4 font-mono text-[10px] text-zinc-500">
                      {deploy.branch}
                    </td>

                    {/* Status Badge */}
                    <td className="p-4">
                      <span className={`px-2 py-0.5 border rounded-full text-[9px] font-mono font-semibold capitalize whitespace-nowrap ${getStatusColor(deploy.status)}`}>
                        {deploy.status.replace('_', ' ')}
                      </span>
                    </td>

                    {/* Duration */}
                    <td className="p-4 font-mono text-zinc-500">
                      {deploy.durationMs > 0 ? `${(deploy.durationMs / 1000).toFixed(1)}s` : '--'}
                    </td>

                    {/* Date */}
                    <td className="p-4 text-zinc-500">
                      <div>{new Date(deploy.createdAt).toLocaleDateString()}</div>
                      <span className="text-[10px] text-zinc-600 mt-0.5 block">
                        {new Date(deploy.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </td>

                    {/* Actions */}
                    <td className="p-4 text-right">
                      <button
                        onClick={() => navigateTo('deployment-details', { deploymentId: deploy.id })}
                        className="text-[11px] font-medium text-zinc-400 hover:text-zinc-200 flex items-center gap-0.5 justify-end ml-auto group-hover:translate-x-0.5 transition-transform"
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
