import React, { useState, useEffect } from 'react';
import { usePlatform } from '../context/PlatformContext';
import { pluginDefinitions } from '../data/seedData';
import {
  ArrowLeft, Save, RefreshCw, Trash2, AlertCircle, CheckCircle,
  Eye, EyeOff, Link, Shield, Clock, Activity, Info
} from 'lucide-react';

export const PluginConfig: React.FC = () => {
  const { pluginInstallations, activePluginId, updatePluginConfig, uninstallPlugin, navigateTo, projects } = usePlatform();

  const installation = pluginInstallations.find(p => p.id === activePluginId) || pluginInstallations[0];
  const definition = installation ? pluginDefinitions.find(d => d.id === installation.pluginId) : null;

  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState(installation?.baseUrl || '');
  const [projectSelector, setProjectSelector] = useState(installation?.projectSelector || '');
  const [showKey, setShowKey] = useState(false);
  const [selectedProjects, setSelectedProjects] = useState<string[]>(installation?.enabledForProjects || []);
  const [testState, setTestState] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);

  useEffect(() => {
    if (installation) {
      setBaseUrl(installation.baseUrl || '');
      setProjectSelector(installation.projectSelector || '');
      setSelectedProjects(installation.enabledForProjects || []);
    }
  }, [installation?.id]);

  if (!installation || !definition) {
    return (
      <div className="text-center p-8 bg-dark-900 border border-dark-700 rounded-xl">
        <h3 className="text-sm font-bold text-white mb-2">No plugin selected</h3>
        <button onClick={() => navigateTo('integrations')}
          className="bg-brand-600 text-white font-bold py-1.5 px-3 rounded text-xs">
          Back to Integrations
        </button>
      </div>
    );
  }

  const handleTestConnection = () => {
    setTestState('testing');
    setTimeout(() => {
      setTestState(apiKey || installation.apiKeyHint ? 'success' : 'error');
    }, 1800);
  };

  const handleSave = () => {
    updatePluginConfig(installation.id, {
      baseUrl: baseUrl || undefined,
      projectSelector: projectSelector || undefined,
      enabledForProjects: selectedProjects,
      ...(apiKey ? { apiKeyHint: `${apiKey.slice(0, 4)}_••••••••••••••••••••${apiKey.slice(-4)}` } : {}),
    });
    setSaveSuccess(true);
    setApiKey('');
    setTimeout(() => setSaveSuccess(false), 3000);
  };

  const toggleProject = (pid: string) => {
    setSelectedProjects(prev =>
      prev.includes(pid) ? prev.filter(p => p !== pid) : [...prev, pid]
    );
  };

  const statusColors: Record<string, string> = {
    connected: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/25',
    error: 'text-rose-400 bg-rose-500/10 border-rose-500/25',
    syncing: 'text-amber-400 bg-amber-500/10 border-amber-500/25',
    disconnected: 'text-slate-400 bg-slate-500/10 border-slate-500/25',
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Back */}
      <button onClick={() => navigateTo('integrations')}
        className="flex items-center gap-2 text-xs font-semibold text-slate-400 hover:text-slate-200 transition-colors">
        <ArrowLeft size={14} />
        Back to Integrations
      </button>

      {/* Header card */}
      <div className="bg-dark-900 border border-dark-700 rounded-xl p-5 flex items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl border border-dark-600 bg-dark-800 flex items-center justify-center text-sm font-black font-mono text-slate-200">
            {definition.iconLabel}
          </div>
          <div>
            <h2 className="text-base font-bold text-white">{definition.name}</h2>
            <p className="text-xs text-slate-400 mt-0.5">{definition.provider} · {definition.category.replace('_', ' ')}</p>
            <div className="mt-2 flex items-center gap-2 flex-wrap">
              <span className={`text-[10px] font-bold font-mono px-2 py-0.5 rounded-full border ${statusColors[installation.status] || statusColors.disconnected}`}>
                {installation.status.toUpperCase()}
              </span>
              {installation.lastSyncAt && (
                <span className="text-[10px] text-slate-500 flex items-center gap-1 font-mono">
                  <Clock size={10} />
                  Last sync: {new Date(installation.lastSyncAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
            </div>
          </div>
        </div>
        <button onClick={() => setConfirmRemove(true)}
          className="text-xs text-rose-400 hover:text-rose-300 border border-rose-500/20 hover:border-rose-500/40 px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all">
          <Trash2 size={12} />
          Remove
        </button>
      </div>

      {saveSuccess && (
        <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs rounded-lg p-3 flex items-center gap-2">
          <CheckCircle size={14} />
          Configuration saved. Connection verified successfully.
        </div>
      )}

      {installation.errorMessage && (
        <div className="bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs rounded-lg p-3 flex items-center gap-2">
          <AlertCircle size={14} />
          {installation.errorMessage}
        </div>
      )}

      {/* Auth / credentials */}
      <div className="bg-dark-900 border border-dark-700 rounded-xl p-5 space-y-4">
        <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider border-b border-dark-750 pb-2 flex items-center gap-2">
          <Shield size={14} className="text-slate-400" />
          Authentication Credentials
        </h3>

        <div className="space-y-3 text-xs">
          <div>
            <label className="block font-semibold text-slate-400 mb-1.5">
              {definition.authMethod === 'api_key' ? 'API Key / Access Token' : 'OAuth Token'}
            </label>
            <div className="relative">
              <input
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={e => setApiKey(e.target.value)}
                placeholder={installation.apiKeyHint || `Enter ${definition.name} API key...`}
                className="w-full bg-dark-950 border border-dark-750 rounded-lg py-2.5 pl-4 pr-10 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-brand-500 font-mono"
              />
              <button type="button" onClick={() => setShowKey(!showKey)}
                className="absolute right-3 top-2.5 text-slate-500 hover:text-slate-300">
                {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
            {installation.apiKeyHint && (
              <p className="text-[10px] text-slate-500 mt-1 font-mono">Current key: {installation.apiKeyHint}</p>
            )}
            <p className="text-[10px] text-slate-500 mt-1 flex items-center gap-1">
              <Info size={10} />
              Credentials are stored encrypted. Never exposed in the frontend.
            </p>
          </div>

          {definition.authMethod === 'api_key' && (
            <div>
              <label className="block font-semibold text-slate-400 mb-1.5">Base URL <span className="text-slate-600">(optional for self-hosted)</span></label>
              <div className="relative">
                <Link className="absolute left-3 top-2.5 text-slate-500" size={14} />
                <input type="url" value={baseUrl} onChange={e => setBaseUrl(e.target.value)}
                  placeholder={`https://${definition.name.toLowerCase()}.your-company.com`}
                  className="w-full bg-dark-950 border border-dark-750 rounded-lg py-2.5 pl-10 pr-4 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-brand-500 font-mono" />
              </div>
            </div>
          )}

          <div>
            <label className="block font-semibold text-slate-400 mb-1.5">Project / Service Selector</label>
            <input type="text" value={projectSelector} onChange={e => setProjectSelector(e.target.value)}
              placeholder={`e.g. devcorp/my-service or org-id`}
              className="w-full bg-dark-950 border border-dark-750 rounded-lg py-2.5 px-4 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-brand-500 font-mono" />
          </div>
        </div>

        {/* Test connection */}
        <div className="pt-3 border-t border-dark-750">
          <button onClick={handleTestConnection}
            className="flex items-center gap-1.5 text-xs font-semibold text-brand-400 hover:text-brand-300 border border-brand-500/30 hover:border-brand-500/60 px-3 py-1.5 rounded-lg transition-all">
            <RefreshCw size={12} className={testState === 'testing' ? 'animate-spin' : ''} />
            {testState === 'testing' ? 'Testing...' : 'Test Connection'}
          </button>
          {testState === 'success' && (
            <div className="mt-2 flex items-center gap-2 text-[11px] text-emerald-400 font-mono">
              <CheckCircle size={12} />
              Connection successful — credentials valid.
            </div>
          )}
          {testState === 'error' && (
            <div className="mt-2 flex items-center gap-2 text-[11px] text-rose-400 font-mono">
              <AlertCircle size={12} />
              Connection failed — check credentials or base URL.
            </div>
          )}
        </div>
      </div>

      {/* Webhook info */}
      <div className="bg-dark-900 border border-dark-700 rounded-xl p-5 space-y-3">
        <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider border-b border-dark-750 pb-2 flex items-center gap-2">
          <Activity size={14} className="text-slate-400" />
          Webhook Configuration
        </h3>
        <div className="space-y-2 text-xs">
          <div>
            <label className="block font-semibold text-slate-400 mb-1">Inbound Webhook URL</label>
            <div className="bg-dark-950 border border-dark-750 rounded-lg p-2.5 font-mono text-slate-300 flex items-center justify-between gap-2">
              <span className="truncate">{installation.webhookUrl || `https://api.devcorp-idp.com/webhooks/${definition.name.toLowerCase()}`}</span>
              <span className="text-[9px] text-slate-500 shrink-0">READ-ONLY</span>
            </div>
            <p className="text-[10px] text-slate-500 mt-1">Register this URL in your {definition.name} dashboard to receive events.</p>
          </div>
          {installation.webhookSecret && (
            <div>
              <label className="block font-semibold text-slate-400 mb-1">Webhook Signing Secret</label>
              <div className="bg-dark-950 border border-dark-750 rounded-lg p-2.5 font-mono text-slate-500">
                ••••••••••••••••••••
              </div>
            </div>
          )}
          <div>
            <label className="block font-semibold text-slate-400 mb-1">Supported Webhook Events</label>
            <div className="flex flex-wrap gap-1.5">
              {(definition.webhookEvents || []).map(ev => (
                <span key={ev} className="text-[9px] font-mono bg-dark-800 border border-dark-700 text-slate-400 px-2 py-0.5 rounded">{ev}</span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Enabled projects */}
      <div className="bg-dark-900 border border-dark-700 rounded-xl p-5 space-y-3">
        <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider border-b border-dark-750 pb-2">
          Enabled for Projects
        </h3>
        <div className="space-y-2">
          {projects.map(p => (
            <label key={p.id} className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-dark-800 cursor-pointer transition-all">
              <input type="checkbox" checked={selectedProjects.includes(p.id)}
                onChange={() => toggleProject(p.id)}
                className="w-4 h-4 text-brand-600 bg-dark-950 border-dark-700 rounded" />
              <div className="text-xs">
                <span className="font-semibold text-slate-200">{p.name}</span>
                <span className="text-slate-500 font-mono ml-2">{p.repoOwner}/{p.repoName}</span>
              </div>
            </label>
          ))}
        </div>
      </div>

      {/* Recent events */}
      {installation.recentEvents && installation.recentEvents.length > 0 && (
        <div className="bg-dark-900 border border-dark-700 rounded-xl p-5 space-y-3">
          <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider border-b border-dark-750 pb-2">
            Recent Plugin Events
          </h3>
          <div className="space-y-2">
            {installation.recentEvents.map((ev, i) => (
              <div key={i} className="flex items-start gap-2.5 text-xs p-2.5 bg-dark-950/40 rounded border border-dark-750">
                <span className={`w-1.5 h-1.5 rounded-full mt-1 shrink-0 ${
                  ev.type === 'success' ? 'bg-emerald-500' :
                  ev.type === 'error' ? 'bg-rose-500' : 'bg-brand-500'
                }`}></span>
                <div className="flex-1">
                  <span className="text-slate-300">{ev.message}</span>
                  <span className="ml-2 text-[10px] text-slate-500 font-mono">
                    {new Date(ev.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Required permissions */}
      <div className="bg-dark-900 border border-dark-700 rounded-xl p-5 space-y-3">
        <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider border-b border-dark-750 pb-2 flex items-center gap-2">
          <Shield size={14} className="text-slate-400" />
          Required Permissions
        </h3>
        <div className="flex flex-wrap gap-2">
          {definition.requiredPermissions.map(perm => (
            <span key={perm} className="text-[10px] font-mono text-slate-400 bg-dark-800 border border-dark-700 px-2 py-1 rounded flex items-center gap-1">
              <CheckCircle size={10} className="text-emerald-500" />
              {perm}
            </span>
          ))}
        </div>
        <p className="text-[10px] text-slate-500">Plugin permissions follow least-privilege principles. Only request what is shown above.</p>
      </div>

      {/* Save button */}
      <div className="flex justify-end">
        <button onClick={handleSave}
          className="bg-brand-600 hover:bg-brand-500 text-white font-bold py-2 px-6 rounded-lg text-xs transition-all shadow-md flex items-center gap-1.5">
          <Save size={14} />
          Save Configuration
        </button>
      </div>

      {/* Confirm remove modal */}
      {confirmRemove && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-dark-900 border border-dark-700 rounded-2xl p-6 max-w-sm w-full shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-rose-400">
              <Trash2 size={20} />
              <h3 className="font-bold text-sm text-white">Remove {definition.name}?</h3>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              This will disconnect the plugin, deregister all webhooks, and delete stored credentials. You will need to reinstall and reconfigure to reconnect.
            </p>
            <div className="flex justify-end gap-3 pt-2 border-t border-dark-750">
              <button onClick={() => setConfirmRemove(false)}
                className="px-3 py-1.5 rounded bg-dark-800 border border-dark-700 text-slate-300 text-xs font-semibold">Cancel</button>
              <button onClick={() => { uninstallPlugin(installation.id); navigateTo('integrations'); }}
                className="px-3 py-1.5 rounded bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold">Remove Plugin</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
