import React, { useState } from 'react';
import { usePlatform } from '../context/PlatformContext';
import { pluginDefinitions } from '../data/seedData';
import {
  Puzzle, Search, CheckCircle, XCircle, AlertCircle, RefreshCw,
  Settings, Trash2, Plus, ExternalLink, Zap, ShieldCheck, Clock
} from 'lucide-react';
import type { PluginCategory, PluginStatus } from '../types/platform';

const CATEGORIES: { id: PluginCategory | 'all'; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'deployment', label: 'Deployment' },
  { id: 'monitoring', label: 'Monitoring' },
  { id: 'error_tracking', label: 'Error Tracking' },
  { id: 'source_control', label: 'Source Control' },
  { id: 'collaboration', label: 'Collaboration' },
];

const statusBadge = (status: PluginStatus) => {
  switch (status) {
    case 'connected':
      return <span className="flex items-center gap-1 text-[10px] font-semibold font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping"></span>CONNECTED</span>;
    case 'error':
      return <span className="flex items-center gap-1 text-[10px] font-semibold font-mono text-red-400 bg-red-500/10 border border-red-500/20 px-2 py-0.5 rounded-full"><span className="w-1.5 h-1.5 rounded-full bg-red-500"></span>ERROR</span>;
    case 'syncing':
      return <span className="flex items-center gap-1 text-[10px] font-semibold font-mono text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full"><span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>SYNCING</span>;
    case 'disconnected':
      return <span className="flex items-center gap-1 text-[10px] font-semibold font-mono text-zinc-500 bg-white/5 border border-white/[0.06] px-2 py-0.5 rounded-full"><span className="w-1.5 h-1.5 rounded-full bg-zinc-500"></span>DISCONNECTED</span>;
    default:
      return <span className="text-[10px] font-mono text-zinc-600 border border-white/[0.06] px-2 py-0.5 rounded-full">NOT INSTALLED</span>;
  }
};

export const Integrations: React.FC = () => {
  const { pluginInstallations, installPlugin, uninstallPlugin, navigateTo } = usePlatform();
  const [tab, setTab] = useState<'all' | 'installed'>('all');
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<PluginCategory | 'all'>('all');
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);
  const [installingId, setInstallingId] = useState<string | null>(null);

  const handleInstall = (pluginId: string) => {
    setInstallingId(pluginId);
    setTimeout(() => {
      installPlugin(pluginId);
      setInstallingId(null);
    }, 1200);
  };

  const handleRemove = (installationId: string) => {
    uninstallPlugin(installationId);
    setConfirmRemoveId(null);
  };

  const installedIds = new Set(pluginInstallations.map(p => p.pluginId));

  const filteredDefs = pluginDefinitions.filter(def => {
    const matchSearch = def.name.toLowerCase().includes(search.toLowerCase()) ||
      def.description.toLowerCase().includes(search.toLowerCase());
    const matchCat = categoryFilter === 'all' || def.category === categoryFilter;
    const matchTab = tab === 'all' || installedIds.has(def.id);
    return matchSearch && matchCat && matchTab;
  });

  const categoryColorMap: Record<PluginCategory, string> = {
    deployment: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
    monitoring: 'text-orange-400 bg-orange-500/10 border-orange-500/20',
    error_tracking: 'text-violet-400 bg-violet-500/10 border-violet-500/20',
    source_control: 'text-zinc-300 bg-white/5 border-white/[0.06]',
    collaboration: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20',
  };

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h3 className="text-base font-semibold text-white flex items-center gap-2">
            <Puzzle size={18} className="text-violet-400" />
            Plugin Marketplace
          </h3>
          <p className="text-xs text-zinc-400 mt-1">
            Connect external services through plugins. Each plugin normalizes external events into the IDP's common format.
          </p>
        </div>
        <div className="flex items-center gap-3 text-xs font-mono text-zinc-500 shrink-0">
          <span className="bg-white/[0.03] border border-white/[0.06] px-3 py-1.5 rounded-lg">
            <b className="text-white">{pluginInstallations.length}</b> installed
          </span>
          <span className="bg-white/[0.03] border border-white/[0.06] px-3 py-1.5 rounded-lg">
            <b className="text-white">{pluginInstallations.filter(p => p.status === 'connected').length}</b> connected
          </span>
        </div>
      </div>

      {/* Plugin architecture note */}
      <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-4 text-xs text-zinc-400 leading-relaxed flex gap-3">
        <Zap size={16} className="text-amber-400 shrink-0 mt-0.5" />
        <div>
          <span className="font-semibold text-zinc-200 block mb-1">Plugin Data Flow</span>
          External Provider API/Webhook → Plugin Adapter → Event Normalizer → Core IDP Services → Dashboard · Alerts · Incidents · AI Context · Rollback Support
        </div>
      </div>

      {/* Tabs + search + category filters */}
      <div className="flex flex-col md:flex-row gap-4 items-stretch md:items-center">
        <div className="flex border border-white/[0.06] rounded-lg overflow-hidden text-xs font-semibold">
          {(['all', 'installed'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-2 capitalize transition-all ${tab === t ? 'bg-white text-black' : 'bg-white/[0.03] text-zinc-400 hover:bg-white/5'}`}>
              {t === 'all' ? `All Plugins (${pluginDefinitions.length})` : `Installed (${pluginInstallations.length})`}
            </button>
          ))}
        </div>

        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-2.5 text-zinc-600" size={14} />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search plugins..."
            className="w-full bg-black/30 border border-white/[0.06] text-zinc-100 placeholder-zinc-600 focus:border-white/20 focus:outline-none rounded-md py-2 pl-9 pr-4 text-xs font-mono" />
        </div>

        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map(cat => (
            <button key={cat.id} onClick={() => setCategoryFilter(cat.id as any)}
              className={`px-3 py-1.5 rounded-lg text-[10px] font-semibold border transition-all font-mono ${
                categoryFilter === cat.id
                  ? 'border-white/20 bg-white/5 text-zinc-200'
                  : 'border-white/[0.06] text-zinc-600 hover:text-zinc-400 hover:border-white/10'
              }`}>
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* Plugin cards grid */}
      {filteredDefs.length === 0 ? (
        <div className="text-center py-12 text-zinc-600 bg-white/[0.03] border border-white/[0.06] rounded-xl">
          <Puzzle size={28} className="mx-auto mb-2 text-zinc-700" />
          <p className="text-sm font-semibold text-white">No plugins matched</p>
          <p className="text-xs mt-1">Try adjusting your filters or search term.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredDefs.map(def => {
            const installation = pluginInstallations.find(p => p.pluginId === def.id);
            const isInstalled = !!installation;
            const isInstalling = installingId === def.id;

            return (
              <div key={def.id} className={`bg-white/[0.03] border rounded-xl overflow-hidden transition-all hover:-translate-y-0.5 ${
                installation?.status === 'error'
                  ? 'border-red-500/20 hover:border-red-500/30'
                  : isInstalled ? 'border-white/10 hover:border-white/[0.15]' : 'border-white/[0.06] hover:border-white/10'
              }`}>
                {/* Card header */}
                <div className="p-5 border-b border-white/[0.06]">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    {/* Icon badge */}
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-xs font-black font-mono border shrink-0 ${categoryColorMap[def.category]}`}>
                      {def.iconLabel}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="font-semibold text-white text-sm">{def.name}</h4>
                      <p className="text-[10px] text-zinc-600 font-mono mt-0.5">{def.provider}</p>
                    </div>
                    {isInstalled && statusBadge(installation!.status)}
                  </div>
                  <p className="text-xs text-zinc-400 leading-relaxed">{def.description}</p>
                </div>

                {/* Capability tags */}
                <div className="px-5 py-3 flex flex-wrap gap-1.5 border-b border-white/[0.06]">
                  <span className={`text-[9px] font-bold px-2 py-0.5 rounded border font-mono ${categoryColorMap[def.category]}`}>
                    {def.category.replace('_', ' ').toUpperCase()}
                  </span>
                  {def.capabilities.slice(0, 3).map(cap => (
                    <span key={cap} className="text-[9px] text-zinc-500 bg-black/20 border border-white/5 px-1.5 py-0.5 rounded font-mono">{cap}</span>
                  ))}
                </div>

                {/* Permissions + auth */}
                <div className="px-5 py-3 space-y-1.5 text-[10px] border-b border-white/[0.06]">
                  <div className="flex items-center gap-1.5 text-zinc-500">
                    <ShieldCheck size={11} className="text-zinc-600" />
                    <span>Auth: <b className="text-zinc-400 font-mono">{def.authMethod.replace('_', ' ')}</b></span>
                  </div>
                  <div className="flex items-center gap-1.5 text-zinc-500">
                    <ShieldCheck size={11} className="text-zinc-600" />
                    <span>Perms: {def.requiredPermissions.join(', ')}</span>
                  </div>
                  {installation?.lastSyncAt && (
                    <div className="flex items-center gap-1.5 text-zinc-500">
                      <Clock size={11} className="text-zinc-600" />
                      <span>Synced: {new Date(installation.lastSyncAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                  )}
                  {installation?.errorMessage && (
                    <div className="flex items-center gap-1.5 text-red-400 mt-1">
                      <AlertCircle size={11} />
                      <span className="text-[9px]">{installation.errorMessage}</span>
                    </div>
                  )}
                </div>

                {/* Action footer */}
                <div className="px-5 py-3 flex items-center justify-between gap-2">
                  {isInstalled ? (
                    <>
                      <button
                        onClick={() => navigateTo('plugin-config', { pluginId: installation!.id })}
                        className="flex items-center gap-1.5 text-xs font-medium text-zinc-400 hover:text-zinc-200 transition-colors"
                      >
                        <Settings size={13} />
                        Configure
                      </button>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => navigateTo('plugin-config', { pluginId: installation!.id })}
                          className="text-[10px] font-mono text-zinc-500 hover:text-zinc-300 border border-white/[0.06] hover:border-white/10 px-2 py-1 rounded transition-all flex items-center gap-1"
                        >
                          <RefreshCw size={10} />
                          Test
                        </button>
                        <button
                          onClick={() => setConfirmRemoveId(installation!.id)}
                          className="text-[10px] font-mono text-red-400 hover:text-red-300 border border-red-500/20 hover:border-red-500/30 px-2 py-1 rounded transition-all flex items-center gap-1"
                        >
                          <Trash2 size={10} />
                          Remove
                        </button>
                      </div>
                    </>
                  ) : (
                    <button
                      onClick={() => handleInstall(def.id)}
                      disabled={isInstalling}
                      className="flex items-center gap-1.5 text-xs font-medium text-black bg-white hover:bg-zinc-200 disabled:opacity-60 px-3 py-1.5 rounded-lg transition-all"
                    >
                      {isInstalling ? <RefreshCw size={12} className="animate-spin" /> : <Plus size={12} />}
                      {isInstalling ? 'Installing...' : 'Install Plugin'}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Confirm Remove Modal */}
      {confirmRemoveId && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-[#050505] border border-white/[0.06] rounded-2xl p-6 max-w-sm w-full shadow-2xl space-y-4 glass">
            <div className="flex items-center gap-3 text-red-400">
              <Trash2 size={20} />
              <h3 className="font-semibold text-sm text-white">Remove Plugin</h3>
            </div>
            <p className="text-xs text-zinc-400 leading-relaxed">
              This will disconnect the plugin, deregister webhooks, and remove all stored credentials. This action cannot be undone.
            </p>
            <div className="flex justify-end gap-3 pt-2 border-t border-white/[0.06]">
              <button onClick={() => setConfirmRemoveId(null)}
                className="px-3 py-1.5 rounded bg-zinc-900 hover:bg-zinc-800 border border-white/[0.06] text-zinc-300 text-xs font-medium">
                Cancel
              </button>
              <button onClick={() => handleRemove(confirmRemoveId)}
                className="px-3 py-1.5 rounded bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 text-xs font-medium">
                Remove Plugin
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
