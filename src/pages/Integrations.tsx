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
      return <span className="flex items-center gap-1 text-[10px] font-bold font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/25 px-2 py-0.5 rounded-full"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping"></span>CONNECTED</span>;
    case 'error':
      return <span className="flex items-center gap-1 text-[10px] font-bold font-mono text-rose-400 bg-rose-500/10 border border-rose-500/25 px-2 py-0.5 rounded-full"><span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>ERROR</span>;
    case 'syncing':
      return <span className="flex items-center gap-1 text-[10px] font-bold font-mono text-amber-400 bg-amber-500/10 border border-amber-500/25 px-2 py-0.5 rounded-full"><span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>SYNCING</span>;
    case 'disconnected':
      return <span className="flex items-center gap-1 text-[10px] font-bold font-mono text-slate-400 bg-slate-500/10 border border-slate-500/25 px-2 py-0.5 rounded-full"><span className="w-1.5 h-1.5 rounded-full bg-slate-500"></span>DISCONNECTED</span>;
    default:
      return <span className="text-[10px] font-mono text-slate-500 border border-dark-700 px-2 py-0.5 rounded-full">NOT INSTALLED</span>;
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
    source_control: 'text-slate-300 bg-slate-500/10 border-slate-500/20',
    collaboration: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20',
  };

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="bg-dark-900 border border-dark-700 rounded-xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <Puzzle size={18} className="text-violet-400" />
            Plugin Marketplace
          </h3>
          <p className="text-xs text-slate-400 mt-1">
            Connect external services through plugins. Each plugin normalizes external events into the IDP's common format.
          </p>
        </div>
        <div className="flex items-center gap-3 text-xs font-mono text-slate-400 shrink-0">
          <span className="bg-dark-800 border border-dark-700 px-3 py-1.5 rounded-lg">
            <b className="text-white">{pluginInstallations.length}</b> installed
          </span>
          <span className="bg-dark-800 border border-dark-700 px-3 py-1.5 rounded-lg">
            <b className="text-white">{pluginInstallations.filter(p => p.status === 'connected').length}</b> connected
          </span>
        </div>
      </div>

      {/* Plugin architecture note */}
      <div className="bg-brand-500/5 border border-brand-500/20 rounded-xl p-4 text-xs text-slate-400 leading-relaxed flex gap-3">
        <Zap size={16} className="text-brand-400 shrink-0 mt-0.5" />
        <div>
          <span className="font-bold text-slate-200 block mb-1">Plugin Data Flow</span>
          External Provider API/Webhook → Plugin Adapter → Event Normalizer → Core IDP Services → Dashboard · Alerts · Incidents · AI Context · Rollback Support
        </div>
      </div>

      {/* Tabs + search + category filters */}
      <div className="flex flex-col md:flex-row gap-4 items-stretch md:items-center">
        <div className="flex border border-dark-700 rounded-lg overflow-hidden text-xs font-semibold">
          {(['all', 'installed'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-2 capitalize transition-all ${tab === t ? 'bg-brand-600 text-white' : 'bg-dark-900 text-slate-400 hover:bg-dark-800'}`}>
              {t === 'all' ? `All Plugins (${pluginDefinitions.length})` : `Installed (${pluginInstallations.length})`}
            </button>
          ))}
        </div>

        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-2.5 text-slate-500" size={14} />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search plugins..."
            className="w-full bg-dark-900 border border-dark-700 rounded-lg py-2 pl-9 pr-4 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-brand-500 font-mono" />
        </div>

        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map(cat => (
            <button key={cat.id} onClick={() => setCategoryFilter(cat.id as any)}
              className={`px-3 py-1.5 rounded-lg text-[10px] font-semibold border transition-all font-mono ${
                categoryFilter === cat.id
                  ? 'border-brand-500 bg-brand-500/10 text-brand-400'
                  : 'border-dark-700 text-slate-500 hover:text-slate-300 hover:border-dark-600'
              }`}>
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* Plugin cards grid */}
      {filteredDefs.length === 0 ? (
        <div className="text-center py-12 text-slate-500 bg-dark-900 border border-dark-700 rounded-xl">
          <Puzzle size={28} className="mx-auto mb-2 text-slate-600" />
          <p className="text-sm font-bold text-white">No plugins matched</p>
          <p className="text-xs mt-1">Try adjusting your filters or search term.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredDefs.map(def => {
            const installation = pluginInstallations.find(p => p.pluginId === def.id);
            const isInstalled = !!installation;
            const isInstalling = installingId === def.id;

            return (
              <div key={def.id} className={`bg-dark-900 border rounded-xl overflow-hidden transition-all hover:-translate-y-0.5 ${
                installation?.status === 'error'
                  ? 'border-rose-500/30 hover:border-rose-500/50'
                  : isInstalled ? 'border-dark-600 hover:border-dark-500' : 'border-dark-700 hover:border-dark-600'
              }`}>
                {/* Card header */}
                <div className="p-5 border-b border-dark-750">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    {/* Icon badge */}
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-xs font-black font-mono border shrink-0 ${categoryColorMap[def.category]}`}>
                      {def.iconLabel}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="font-bold text-white text-sm">{def.name}</h4>
                      <p className="text-[10px] text-slate-500 font-mono mt-0.5">{def.provider}</p>
                    </div>
                    {isInstalled && statusBadge(installation!.status)}
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed">{def.description}</p>
                </div>

                {/* Capability tags */}
                <div className="px-5 py-3 flex flex-wrap gap-1.5 border-b border-dark-750">
                  <span className={`text-[9px] font-bold px-2 py-0.5 rounded border font-mono ${categoryColorMap[def.category]}`}>
                    {def.category.replace('_', ' ').toUpperCase()}
                  </span>
                  {def.capabilities.slice(0, 3).map(cap => (
                    <span key={cap} className="text-[9px] text-slate-500 bg-dark-800 border border-dark-700 px-1.5 py-0.5 rounded font-mono">{cap}</span>
                  ))}
                </div>

                {/* Permissions + auth */}
                <div className="px-5 py-3 space-y-1.5 text-[10px] border-b border-dark-750">
                  <div className="flex items-center gap-1.5 text-slate-500">
                    <ShieldCheck size={11} className="text-slate-400" />
                    <span>Auth: <b className="text-slate-300 font-mono">{def.authMethod.replace('_', ' ')}</b></span>
                  </div>
                  <div className="flex items-center gap-1.5 text-slate-500">
                    <ShieldCheck size={11} className="text-slate-400" />
                    <span>Perms: {def.requiredPermissions.join(', ')}</span>
                  </div>
                  {installation?.lastSyncAt && (
                    <div className="flex items-center gap-1.5 text-slate-500">
                      <Clock size={11} className="text-slate-400" />
                      <span>Synced: {new Date(installation.lastSyncAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                  )}
                  {installation?.errorMessage && (
                    <div className="flex items-center gap-1.5 text-rose-400 mt-1">
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
                        className="flex items-center gap-1.5 text-xs font-semibold text-brand-400 hover:text-brand-300 transition-colors"
                      >
                        <Settings size={13} />
                        Configure
                      </button>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => navigateTo('plugin-config', { pluginId: installation!.id })}
                          className="text-[10px] font-mono text-slate-400 hover:text-slate-200 border border-dark-700 hover:border-dark-600 px-2 py-1 rounded transition-all flex items-center gap-1"
                        >
                          <RefreshCw size={10} />
                          Test
                        </button>
                        <button
                          onClick={() => setConfirmRemoveId(installation!.id)}
                          className="text-[10px] font-mono text-rose-400 hover:text-rose-300 border border-rose-500/20 hover:border-rose-500/40 px-2 py-1 rounded transition-all flex items-center gap-1"
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
                      className="flex items-center gap-1.5 text-xs font-bold text-white bg-brand-600 hover:bg-brand-500 disabled:opacity-60 px-3 py-1.5 rounded-lg transition-all"
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
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-dark-900 border border-dark-700 rounded-2xl p-6 max-w-sm w-full shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-rose-400">
              <Trash2 size={20} />
              <h3 className="font-bold text-sm text-white">Remove Plugin</h3>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              This will disconnect the plugin, deregister webhooks, and remove all stored credentials. This action cannot be undone.
            </p>
            <div className="flex justify-end gap-3 pt-2 border-t border-dark-750">
              <button onClick={() => setConfirmRemoveId(null)}
                className="px-3 py-1.5 rounded bg-dark-800 border border-dark-700 text-slate-300 text-xs font-semibold">
                Cancel
              </button>
              <button onClick={() => handleRemove(confirmRemoveId)}
                className="px-3 py-1.5 rounded bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold">
                Remove Plugin
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
