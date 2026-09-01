import React, { useState } from 'react';
import { usePlatform } from '../context/PlatformContext';
import { 
  Github, Shield, Bell, User, CheckCircle, RefreshCw, Puzzle,
  AlertCircle, ExternalLink
} from 'lucide-react';

export const Settings: React.FC = () => {
  const { user, updateUserConnections, pluginInstallations, navigateTo } = usePlatform();

  const [gitUser,        setGitUser]        = useState(user?.connectedGithub || '');
  const [connectVcl,     setConnectVcl]     = useState(user?.connectedVercel || false);
  const [connectNfl,     setConnectNfl]     = useState(user?.connectedNetlify || false);
  const [notifyBuilds,   setNotifyBuilds]   = useState(true);
  const [notifyIncidents,setNotifyIncidents]= useState(true);
  const [notifyRollbacks,setNotifyRollbacks]= useState(true);
  const [notifyAlerts,   setNotifyAlerts]   = useState(true);
  const [notifyPlugins,  setNotifyPlugins]  = useState(true);
  const [saveSuccess,    setSaveSuccess]    = useState(false);

  const grafana = pluginInstallations.find(p => p.pluginId === 'plugin-grafana');
  const datadog = pluginInstallations.find(p => p.pluginId === 'plugin-datadog');
  const sentry  = pluginInstallations.find(p => p.pluginId === 'plugin-sentry');

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    updateUserConnections({ github: gitUser || undefined, vercel: connectVcl, netlify: connectNfl });
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 3000);
  };

  const connStatus = (installed: boolean, status?: string) => {
    if (!installed) return <span className="text-[10px] font-mono text-zinc-600">Not installed</span>;
    switch (status) {
      case 'connected': return <span className="text-[10px] font-mono text-emerald-400 flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping"></span>Connected</span>;
      case 'error':     return <span className="text-[10px] font-mono text-red-400 flex items-center gap-1"><AlertCircle size={10} />Error</span>;
      case 'syncing':   return <span className="text-[10px] font-mono text-amber-400 flex items-center gap-1"><RefreshCw size={10} className="animate-spin" />Syncing</span>;
      default:          return <span className="text-[10px] font-mono text-zinc-500">Disconnected</span>;
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <form onSubmit={handleSave} className="space-y-6">

        {saveSuccess && (
          <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs rounded-lg p-3 flex items-center gap-2">
            <CheckCircle size={14} />Settings saved successfully.
          </div>
        )}

        {/* Deployment providers */}
        <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-5 space-y-4">
          <h3 className="text-sm font-semibold text-white border-b border-white/[0.06] pb-2 flex items-center gap-2">
            <Github size={16} className="text-zinc-500" />
            Deployment Provider Connections
          </h3>
          <div className="space-y-3 text-xs">
            <div>
              <label className="block font-semibold text-zinc-400 mb-1.5">GitHub Username</label>
              <div className="relative">
                <Github className="absolute left-3 top-3 text-zinc-600" size={16} />
                <input type="text" value={gitUser} onChange={e => setGitUser(e.target.value)}
                  placeholder="github-username"
                  className="w-full bg-black/30 border border-white/[0.06] text-zinc-100 placeholder-zinc-600 focus:border-white/20 focus:outline-none rounded-md py-2.5 pl-10 pr-4 text-xs font-mono" />
              </div>
            </div>
            {[
              { label: 'Vercel API Integration',  desc: 'Query deployment statuses and redirect routing rules.', checked: connectVcl, onChange: setConnectVcl },
              { label: 'Netlify Webhook Sync',    desc: 'Read build stage logs and initiate edge rollbacks.',   checked: connectNfl, onChange: setConnectNfl },
            ].map(item => (
              <div key={item.label} className="flex items-center justify-between p-3 bg-white/[0.02] rounded-lg border border-white/[0.06]">
                <div>
                  <span className="font-semibold text-zinc-200 block">{item.label}</span>
                  <p className="text-[10px] text-zinc-500 mt-0.5">{item.desc}</p>
                </div>
                <input type="checkbox" checked={item.checked} onChange={e => item.onChange(e.target.checked)}
                  className="w-4 h-4 bg-black/30 border-white/[0.06] rounded" />
              </div>
            ))}
          </div>
        </div>

        {/* Monitoring plugins */}
        <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-5 space-y-4">
          <div className="flex justify-between items-center border-b border-white/[0.06] pb-2">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <Puzzle size={16} className="text-violet-400" />
              Monitoring & Observability Plugins
            </h3>
            <button type="button" onClick={() => navigateTo('integrations')}
              className="text-[10px] text-zinc-400 hover:text-zinc-200 hover:underline flex items-center gap-1">
              Manage <ExternalLink size={10} />
            </button>
          </div>
          <div className="space-y-3 text-xs">
            {[
              { name: 'Grafana', data: grafana },
              { name: 'Datadog', data: datadog },
              { name: 'Sentry',  data: sentry  },
            ].map(item => (
              <div key={item.name} className="flex items-center justify-between p-3 bg-white/[0.02] rounded-lg border border-white/[0.06]">
                <div>
                  <span className="font-semibold text-zinc-200 block">{item.name}</span>
                  {item.data && (
                    <p className="text-[10px] text-zinc-600 mt-0.5 font-mono">
                      {item.data.apiKeyHint || 'Key not set'}
                      {item.data.lastSyncAt ? ` · Synced ${new Date(item.data.lastSyncAt).toLocaleTimeString()}` : ''}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  {connStatus(!!item.data, item.data?.status)}
                  {item.data && (
                    <button type="button" onClick={() => navigateTo('plugin-config', { pluginId: item.data!.id })}
                      className="text-[10px] text-zinc-400 hover:text-zinc-200 hover:underline">Configure</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Notification prefs */}
        <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-5 space-y-4">
          <h3 className="text-sm font-semibold text-white border-b border-white/[0.06] pb-2 flex items-center gap-2">
            <Bell size={16} className="text-zinc-500" />
            Notification Preferences
          </h3>
          <div className="space-y-2.5 text-xs">
            {[
              { id: 'builds',     label: 'Pipeline build completion',       checked: notifyBuilds,    onChange: setNotifyBuilds },
              { id: 'incidents',  label: 'New incident creation',           checked: notifyIncidents, onChange: setNotifyIncidents },
              { id: 'rollbacks',  label: 'Rollback completion',             checked: notifyRollbacks, onChange: setNotifyRollbacks },
              { id: 'alerts',     label: 'Monitoring alert notifications',  checked: notifyAlerts,    onChange: setNotifyAlerts },
              { id: 'plugins',    label: 'Plugin connection errors',        checked: notifyPlugins,   onChange: setNotifyPlugins },
            ].map(item => (
              <label key={item.id} className="flex items-center gap-3 cursor-pointer">
                <input id={item.id} type="checkbox" checked={item.checked} onChange={e => item.onChange(e.target.checked)}
                  className="w-4 h-4 bg-black/30 border-white/[0.06] rounded" />
                <span className="text-zinc-300 font-medium">{item.label}</span>
              </label>
            ))}
          </div>
        </div>

        {/* User profile */}
        <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-5 space-y-4">
          <h3 className="text-sm font-semibold text-white border-b border-white/[0.06] pb-2 flex items-center gap-2">
            <User size={16} className="text-zinc-500" />
            User Profile
          </h3>
          {user && (
            <div className="flex items-center gap-4 text-xs">
              <img src={user.avatarUrl} alt="" className="w-10 h-10 rounded-full border border-white/[0.06]" />
              <div className="space-y-1">
                <div className="text-zinc-200 font-semibold">{user.name}</div>
                <div className="text-zinc-400">{user.email}</div>
                <span className="inline-block text-[9px] font-mono text-zinc-400 font-bold bg-white/5 border border-white/[0.06] px-2 py-0.5 rounded uppercase">
                  Role: {user.role}
                </span>
              </div>
            </div>
          )}
          <div className="p-3 bg-white/[0.02] border border-white/[0.06] rounded text-[10px] text-zinc-500 flex gap-2">
            <Shield size={14} className="shrink-0 text-zinc-600" />
            <span>Account scopes managed by your corporate directory. Contact operations to adjust role permissions.</span>
          </div>
        </div>

        <div className="flex justify-end">
          <button type="submit"
            className="bg-white text-black hover:bg-zinc-200 font-medium py-2 px-6 rounded-lg text-xs transition-all flex items-center gap-1.5">
            <RefreshCw size={14} />Save Settings
          </button>
        </div>

      </form>
    </div>
  );
};
