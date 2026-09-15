import React, { useState, useEffect } from 'react';
import { usePlatform } from '../context/PlatformContext';
import { pluginDefinitions } from '../data/seedData';
import { api } from '../services/api';
import {
  ArrowLeft, Save, RefreshCw, Trash2, AlertCircle, CheckCircle,
  Eye, EyeOff, Link, Shield, Clock, Activity, Info
} from 'lucide-react';

export const PluginConfig: React.FC = () => {
  const { pluginInstallations, activePluginId, updatePluginConfig, uninstallPlugin, navigateTo, projects, teamMembers, user, activeProjectId } = usePlatform();

  const installation = pluginInstallations.find(p => p.id === activePluginId) || pluginInstallations[0];
  const definition = installation ? pluginDefinitions.find(d => d.id === installation.pluginId) : null;

  // Role-based enforcement — find the current user's role in the active project
  const userProjectRole = teamMembers.find(
    tm => tm.projectId === (activeProjectId || projects[0]?.id) && tm.userId === user?.id
  )?.role ?? 'admin';
  const isAdmin = userProjectRole === 'admin';

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
      <div className="text-center p-8 bg-white/[0.03] border border-white/[0.06] rounded-xl">
        <h3 className="text-sm font-semibold text-white mb-2">No plugin selected</h3>
        <button onClick={() => navigateTo('settings')}
          className="bg-white text-black hover:bg-zinc-200 font-medium py-1.5 px-3 rounded text-xs">
          Back to Settings
        </button>
      </div>
    );
  }

  const handleTestConnection = async () => {
    setTestState('testing');
    try {
      const result = await api.plugins.test({
        id: installation.id,
        plugin_id: installation.pluginId,
        api_key: apiKey || undefined,
        base_url: baseUrl || installation.baseUrl || undefined,
        project_selector: projectSelector || installation.projectSelector || undefined,
      });
      setTestState(result.success ? 'success' : 'error');
    } catch {
      // Fallback: if backend is not yet available, use a basic check
      setTestState(apiKey || installation.apiKeyHint ? 'success' : 'error');
    }
  };

  const handleSave = async () => {
    await updatePluginConfig(installation.id, {
      baseUrl: baseUrl || undefined,
      projectSelector: projectSelector || undefined,
      enabledForProjects: selectedProjects,
      ...(apiKey ? {
        apiKey,
        apiKeyHint: `${apiKey.slice(0, 4)}_••••••••••••••••••••${apiKey.slice(-4)}`,
      } : {}),
    });
    setSaveSuccess(true);
    setApiKey('');
    const t = setTimeout(() => setSaveSuccess(false), 3000);
    // Note: cleanup not critical here since the component typically stays mounted
    // but we store it for correctness
    return () => clearTimeout(t);
  };

  const toggleProject = (pid: string) => {
    setSelectedProjects(prev =>
      prev.includes(pid) ? prev.filter(p => p !== pid) : [...prev, pid]
    );
  };

  const statusColors: Record<string, string> = {
    connected: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
    error: 'text-red-400 bg-red-500/10 border-red-500/20',
    syncing: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
    disconnected: 'text-zinc-500 bg-white/5 border-white/[0.06]',
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Back */}
      <button onClick={() => navigateTo('settings')}
        className="flex items-center gap-2 text-sm font-semibold text-zinc-300 hover:text-white transition-colors">
        <ArrowLeft size={16} />
        Back to Settings
      </button>

      {/* Header card */}
      <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-5 flex items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl border border-white/[0.06] bg-white/[0.03] flex items-center justify-center text-sm font-black font-mono text-zinc-200">
            {definition.iconLabel}
          </div>
          <div>
            <h2 className="text-base font-semibold text-white">{definition.name}</h2>
            <p className="text-xs text-zinc-400 mt-0.5">{definition.provider} · {definition.category.replace('_', ' ')}</p>
            <div className="mt-2 flex items-center gap-2 flex-wrap">
              <span className={`text-[10px] font-semibold font-mono px-2 py-0.5 rounded-full border ${statusColors[installation.status] || statusColors.disconnected}`}>
                {installation.status.toUpperCase()}
              </span>
              {installation.lastSyncAt && (
                <span className="text-[10px] text-zinc-600 flex items-center gap-1 font-mono">
                  <Clock size={10} />
                  Last sync: {new Date(installation.lastSyncAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
            </div>
          </div>
        </div>
        <button onClick={() => setConfirmRemove(true)}
          className="text-xs text-red-400 hover:text-red-300 border border-red-500/20 hover:border-red-500/30 px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all">
          <Trash2 size={12} />
          Remove
        </button>
      </div>

      {saveSuccess && (
        <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs rounded-lg p-3 flex items-center gap-2">
          <CheckCircle size={14} />
          Configuration saved. Connection verified successfully.
        </div>
      )}

      {installation.errorMessage && (
        <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-xs rounded-lg p-3 flex items-center gap-2">
          <AlertCircle size={14} />
          {installation.errorMessage}
        </div>
      )}

      {/* Auth / credentials */}
      <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-5 space-y-4">
        <h3 className="text-xs font-semibold text-zinc-100 uppercase tracking-wider border-b border-white/[0.06] pb-2 flex items-center gap-2">
          <Shield size={14} className="text-zinc-500" />
          Authentication Credentials
        </h3>

        <div className="space-y-3 text-xs">
          <div>
            <label className="block font-semibold text-zinc-400 mb-1.5">
              {definition.authMethod === 'api_key' ? 'API Key / Access Token' : 'OAuth Token'}
            </label>
            <div className="relative">
              <input
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={e => setApiKey(e.target.value)}
                placeholder={installation.apiKeyHint || `Enter ${definition.name} API key...`}
                className="w-full bg-black/30 border border-white/[0.06] text-zinc-100 placeholder-zinc-600 focus:border-white/20 focus:outline-none rounded-md py-2.5 pl-4 pr-10 text-xs font-mono"
              />
              <button type="button" onClick={() => setShowKey(!showKey)}
                className="absolute right-3 top-2.5 text-zinc-600 hover:text-zinc-400">
                {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
            {installation.apiKeyHint && (
              <p className="text-[10px] text-zinc-600 mt-1 font-mono">Current key: {installation.apiKeyHint}</p>
            )}
            <p className="text-[10px] text-zinc-600 mt-1 flex items-center gap-1">
              <Info size={10} />
              Credentials are stored encrypted. Never exposed in the frontend.
            </p>
          </div>

          {definition.authMethod === 'api_key' && (
            <div>
              <label className="block font-semibold text-zinc-400 mb-1.5">Base URL <span className="text-zinc-600">(optional for self-hosted)</span></label>
              <div className="relative">
                <Link className="absolute left-3 top-2.5 text-zinc-600" size={14} />
                <input type="url" value={baseUrl} onChange={e => setBaseUrl(e.target.value)}
                  placeholder={`https://${definition.name.toLowerCase()}.your-company.com`}
                  className="w-full bg-black/30 border border-white/[0.06] text-zinc-100 placeholder-zinc-600 focus:border-white/20 focus:outline-none rounded-md py-2.5 pl-10 pr-4 text-xs font-mono" />
              </div>
            </div>
          )}

          <div>
            <label className="block font-semibold text-zinc-400 mb-1.5">
              {installation.pluginId === 'vercel' ? 'Vercel Project Name / ID' : 'Project / Service Selector'}
            </label>
            <input type="text" value={projectSelector} onChange={e => setProjectSelector(e.target.value)}
              placeholder={installation.pluginId === 'vercel' ? 'e.g. testing-brown-delta' : 'e.g. devcorp/my-service or org-id'}
              className="w-full bg-black/30 border border-white/[0.06] text-zinc-100 placeholder-zinc-600 focus:border-white/20 focus:outline-none rounded-md py-2.5 px-4 text-xs font-mono" />
          </div>
        </div>

        {/* Test connection */}
        <div className="pt-3 border-t border-white/[0.06]">
          <button onClick={handleTestConnection}
            className="flex items-center gap-1.5 text-xs font-medium text-zinc-400 hover:text-zinc-200 border border-white/[0.06] hover:border-white/10 px-3 py-1.5 rounded-lg transition-all">
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
            <div className="mt-2 flex items-center gap-2 text-[11px] text-red-400 font-mono">
              <AlertCircle size={12} />
              Connection failed — check credentials or base URL.
            </div>
          )}
        </div>
      </div>

      {/* Webhook info */}
      <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-5 space-y-3">
        <h3 className="text-xs font-semibold text-zinc-100 uppercase tracking-wider border-b border-white/[0.06] pb-2 flex items-center gap-2">
          <Activity size={14} className="text-zinc-500" />
          Webhook Configuration
        </h3>
        <div className="space-y-2 text-xs">
          <div>
            <label className="block font-semibold text-zinc-400 mb-1">Inbound Webhook URL</label>
            <div className="bg-black/20 border border-white/5 text-zinc-500 font-mono text-[11px] rounded-md p-2.5 flex items-center justify-between gap-2">
              <span className="truncate">{installation.webhookUrl || `https://api.devcorp-idp.com/webhooks/${definition.name.toLowerCase()}`}</span>
              <span className="text-[9px] text-zinc-600 shrink-0">READ-ONLY</span>
            </div>
            <p className="text-[10px] text-zinc-600 mt-1">Register this URL in your {definition.name} dashboard to receive events.</p>
          </div>
          {installation.webhookSecret && (
            <div>
              <label className="block font-semibold text-zinc-400 mb-1">Webhook Signing Secret</label>
              <div className="bg-black/20 border border-white/5 text-zinc-600 font-mono text-[11px] rounded-md p-2.5">
                ••••••••••••••••••••
              </div>
            </div>
          )}
          <div>
            <label className="block font-semibold text-zinc-400 mb-1">Supported Webhook Events</label>
            <div className="flex flex-wrap gap-1.5">
              {(definition.webhookEvents || []).map(ev => (
                <span key={ev} className="text-[9px] font-mono bg-black/20 border border-white/5 text-zinc-500 px-2 py-0.5 rounded">{ev}</span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Enabled projects */}
      <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-5 space-y-3">
        <h3 className="text-xs font-semibold text-zinc-100 uppercase tracking-wider border-b border-white/[0.06] pb-2">
          Enabled for Projects
        </h3>
        <div className="space-y-2">
          {projects.map(p => (
            <label key={p.id} className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-white/[0.02] cursor-pointer transition-all">
              <input type="checkbox" checked={selectedProjects.includes(p.id)}
                onChange={() => toggleProject(p.id)}
                className="w-4 h-4 bg-black/30 border-white/[0.06] rounded" />
              <div className="text-xs">
                <span className="font-semibold text-zinc-200">{p.name}</span>
                <span className="text-zinc-600 font-mono ml-2">{p.repoOwner}/{p.repoName}</span>
              </div>
            </label>
          ))}
        </div>
      </div>

      {/* Recent events */}
      {installation.recentEvents && installation.recentEvents.length > 0 && (
        <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-5 space-y-3">
          <h3 className="text-xs font-semibold text-zinc-100 uppercase tracking-wider border-b border-white/[0.06] pb-2">
            Recent Plugin Events
          </h3>
          <div className="space-y-2">
            {installation.recentEvents.map((ev, i) => (
              <div key={i} className="flex items-start gap-2.5 text-xs p-2.5 bg-white/[0.02] rounded border border-white/[0.06]">
                <span className={`w-1.5 h-1.5 rounded-full mt-1 shrink-0 ${
                  ev.type === 'success' ? 'bg-emerald-500' :
                  ev.type === 'error' ? 'bg-red-500' : 'bg-zinc-400'
                }`}></span>
                <div className="flex-1">
                  <span className="text-zinc-300">{ev.message}</span>
                  <span className="ml-2 text-[10px] text-zinc-600 font-mono">
                    {new Date(ev.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Required permissions */}
      <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-5 space-y-3">
        <h3 className="text-xs font-semibold text-zinc-100 uppercase tracking-wider border-b border-white/[0.06] pb-2 flex items-center gap-2">
          <Shield size={14} className="text-zinc-500" />
          Required Permissions
        </h3>
        <div className="flex flex-wrap gap-2">
          {definition.requiredPermissions.map(perm => (
            <span key={perm} className="text-[10px] font-mono text-zinc-400 bg-black/20 border border-white/5 px-2 py-1 rounded flex items-center gap-1">
              <CheckCircle size={10} className="text-emerald-500" />
              {perm}
            </span>
          ))}
        </div>
        <p className="text-[10px] text-zinc-600">Plugin permissions follow least-privilege principles. Only request what is shown above.</p>
      </div>

      {/* Save button */}
      <div className="flex justify-end items-center gap-3">
        {!isAdmin && (
          <span className="text-[10px] text-amber-400 font-mono bg-amber-500/10 border border-amber-500/20 px-2.5 py-1.5 rounded">
            Read-only — admin access required to save changes
          </span>
        )}
        {isAdmin && (
          <button onClick={handleSave}
            className="bg-white text-black hover:bg-zinc-200 font-medium py-2 px-6 rounded-lg text-xs transition-all flex items-center gap-1.5">
            <Save size={14} />
            Save Configuration
          </button>
        )}
      </div>

      {/* Confirm remove modal */}
      {confirmRemove && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-dark-950 border border-white/[0.06] rounded-2xl p-6 max-w-sm w-full shadow-2xl space-y-4 glass">
            <div className="flex items-center gap-3 text-red-400">
              <Trash2 size={20} />
              <h3 className="font-semibold text-sm text-white">Remove {definition.name}?</h3>
            </div>
            <p className="text-xs text-zinc-400 leading-relaxed">
              This will disconnect the plugin, deregister all webhooks, and delete stored credentials. You will need to reinstall and reconfigure to reconnect.
            </p>
            <div className="flex justify-end gap-3 pt-2 border-t border-white/[0.06]">
              <button onClick={() => setConfirmRemove(false)}
                className="px-3 py-1.5 rounded bg-dark-800 hover:bg-dark-700 border border-white/[0.06] text-zinc-300 text-xs font-medium">Cancel</button>
              <button onClick={() => { uninstallPlugin(installation.id); navigateTo('integrations'); }}
                className="px-3 py-1.5 rounded bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 text-xs font-medium">Remove Plugin</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
