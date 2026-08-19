import React, { useState } from 'react';
import { usePlatform } from '../context/PlatformContext';
import { 
  Settings as SettingsIcon, Github, Shield, Bell, 
  User, CheckCircle, RefreshCw, Key, Info 
} from 'lucide-react';

export const Settings: React.FC = () => {
  const { user, updateUserConnections } = usePlatform();

  // Connected state fields
  const [gitUser, setGitUser] = useState(user?.connectedGithub || '');
  const [connectVcl, setConnectVcl] = useState(user?.connectedVercel || false);
  const [connectNfl, setConnectNfl] = useState(user?.connectedNetlify || false);

  // Form notifications state checkboxes
  const [notifyBuilds, setNotifyBuilds] = useState(true);
  const [notifyIncidents, setNotifyIncidents] = useState(true);
  const [notifyRollbacks, setNotifyRollbacks] = useState(true);

  const [saveSuccess, setSaveSuccess] = useState(false);

  const handleSaveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    updateUserConnections({
      github: gitUser || undefined,
      vercel: connectVcl,
      netlify: connectNfl
    });
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 3000);
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <form onSubmit={handleSaveSettings} className="space-y-6">
        {/* Success toast notification */}
        {saveSuccess && (
          <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs rounded-lg p-3 flex items-center gap-2">
            <CheckCircle size={14} />
            <span>Integrations settings saved successfully. Webhooks updated.</span>
          </div>
        )}

        {/* Integration Credentials Section */}
        <div className="bg-dark-900 border border-dark-700 rounded-xl p-5 space-y-4">
          <h3 className="text-sm font-bold text-white border-b border-dark-750 pb-2 flex items-center gap-2">
            <Github size={16} className="text-slate-400" />
            Integrations & Cloud Connections
          </h3>

          <div className="space-y-4 text-xs">
            {/* GitHub Username */}
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1.5">GitHub Connected Username</label>
              <div className="relative">
                <Github className="absolute left-3 top-3 text-slate-500" size={16} />
                <input
                  type="text"
                  value={gitUser}
                  onChange={(e) => setGitUser(e.target.value)}
                  placeholder="github-username"
                  className="w-full bg-dark-950 border border-dark-750 rounded-lg py-2.5 pl-10 pr-4 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-brand-500 transition-all font-mono"
                />
              </div>
            </div>

            {/* Provider toggles */}
            <div className="space-y-3">
              <span className="block text-xs font-semibold text-slate-400">Authorized Hosting Gateways</span>
              
              {/* Vercel toggle */}
              <div className="flex items-center justify-between p-3 bg-dark-950/40 rounded-lg border border-dark-750">
                <div>
                  <span className="font-bold text-slate-200 block">Vercel API Integration</span>
                  <p className="text-[10px] text-slate-500 leading-normal mt-0.5">Allows platform to query deployment statuses and redirect routing rules.</p>
                </div>
                <input
                  type="checkbox"
                  checked={connectVcl}
                  onChange={(e) => setConnectVcl(e.target.checked)}
                  className="w-4 h-4 text-brand-600 bg-dark-950 border-dark-700 rounded focus:ring-brand-500 focus:ring-2"
                />
              </div>

              {/* Netlify toggle */}
              <div className="flex items-center justify-between p-3 bg-dark-950/40 rounded-lg border border-dark-750">
                <div>
                  <span className="font-bold text-slate-200 block">Netlify Webhook sync</span>
                  <p className="text-[10px] text-slate-500 leading-normal mt-0.5">Allows reading build stages logs and initiating edge rollbacks.</p>
                </div>
                <input
                  type="checkbox"
                  checked={connectNfl}
                  onChange={(e) => setConnectNfl(e.target.checked)}
                  className="w-4 h-4 text-brand-600 bg-dark-950 border-dark-700 rounded focus:ring-brand-500 focus:ring-2"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Notifications preferences */}
        <div className="bg-dark-900 border border-dark-700 rounded-xl p-5 space-y-4">
          <h3 className="text-sm font-bold text-white border-b border-dark-750 pb-2 flex items-center gap-2">
            <Bell size={16} className="text-slate-400" />
            Alerting Preferences
          </h3>

          <div className="space-y-3 text-xs">
            <div className="flex items-center gap-3">
              <input
                id="notifyBuilds"
                type="checkbox"
                checked={notifyBuilds}
                onChange={(e) => setNotifyBuilds(e.target.checked)}
                className="w-4 h-4 text-brand-600 bg-dark-950 border-dark-700 rounded focus:ring-brand-500"
              />
              <label htmlFor="notifyBuilds" className="text-slate-300 font-medium">Pipeline build completion emails</label>
            </div>

            <div className="flex items-center gap-3">
              <input
                id="notifyIncidents"
                type="checkbox"
                checked={notifyIncidents}
                onChange={(e) => setNotifyIncidents(e.target.checked)}
                className="w-4 h-4 text-brand-600 bg-dark-950 border-dark-700 rounded focus:ring-brand-500"
              />
              <label htmlFor="notifyIncidents" className="text-slate-300 font-medium">Slack notifications on incident creation</label>
            </div>

            <div className="flex items-center gap-3">
              <input
                id="notifyRollbacks"
                type="checkbox"
                checked={notifyRollbacks}
                onChange={(e) => setNotifyRollbacks(e.target.checked)}
                className="w-4 h-4 text-brand-600 bg-dark-950 border-dark-700 rounded focus:ring-brand-500"
              />
              <label htmlFor="notifyRollbacks" className="text-slate-300 font-medium">Audit alerts on rollback redirection success</label>
            </div>
          </div>
        </div>

        {/* Profile Role summary (Read-only demo) */}
        <div className="bg-dark-900 border border-dark-700 rounded-xl p-5 space-y-4">
          <h3 className="text-sm font-bold text-white border-b border-dark-750 pb-2 flex items-center gap-2">
            <User size={16} className="text-slate-400" />
            User Profile Information
          </h3>

          {user && (
            <div className="flex items-center gap-4 text-xs">
              <img src={user.avatarUrl} alt="" className="w-10 h-10 rounded-full border border-dark-700 shadow" />
              <div className="space-y-1">
                <div className="text-slate-200 font-semibold">{user.name}</div>
                <div className="text-slate-400">{user.email}</div>
                <span className="inline-block text-[9px] font-mono text-brand-400 font-bold bg-brand-500/5 px-2 py-0.5 border border-brand-500/20 rounded uppercase">
                  System Role: {user.role}
                </span>
              </div>
            </div>
          )}

          <div className="p-3 bg-dark-950/20 border border-dark-750 rounded text-[10px] text-slate-500 flex gap-2">
            <Shield size={16} className="shrink-0 text-slate-400" />
            <span>
              Account scopes are managed by your corporate Azure Active Directory endpoint sync. Contact operations to adjust roles permissions.
            </span>
          </div>
        </div>

        {/* Submit */}
        <div className="flex justify-end">
          <button
            type="submit"
            className="bg-brand-600 hover:bg-brand-500 text-white font-bold py-2 px-6 rounded-lg text-xs transition-all shadow-md shadow-brand-600/10 flex items-center gap-1.5"
          >
            <RefreshCw size={14} />
            Save Integrations Settings
          </button>
        </div>
      </form>
    </div>
  );
};
