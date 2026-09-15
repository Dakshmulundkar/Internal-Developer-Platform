import React, { useState, useEffect } from 'react';
import { usePlatform } from '../context/PlatformContext';
import { isApiAvailable } from '../services/api';
import {
  Github, Shield, Bell, User, CheckCircle, RefreshCw, Puzzle,
  AlertCircle, ExternalLink, X, Users, Mail, Search, ArrowLeft,
  Moon, Palette, KeyRound, Eye, Lock, Save, Sun, Monitor
} from 'lucide-react';
import type { ProjectRole } from '../types/platform';

type CardId = 'providers' | 'plugins' | 'notifications' | 'security-webhook' | 'user-profile' | 'team' | 'appearance' | 'account' | 'security' | 'credentials' | 'preferences';

export const Settings: React.FC = () => {
  const { user, updateUserConnections, pluginInstallations, navigateTo, teamMembers, addTeamMember, removeTeamMember, updateTeamMemberRole, projects, activeSettingsCard, theme, setTheme } = usePlatform();

  const [activeCard, setActiveCard] = useState<CardId | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Open card if navigated with settingsCard param
  useEffect(() => {
    if (activeSettingsCard) {
      setActiveCard(activeSettingsCard as CardId);
    }
  }, [activeSettingsCard]);

  // Deployment providers
  const [gitUser, setGitUser] = useState(user?.connectedGithub || '');
  const [connectVcl, setConnectVcl] = useState(user?.connectedVercel || false);
  const [connectNfl, setConnectNfl] = useState(user?.connectedNetlify || false);

  // Notification prefs
  const [notifyBuilds, setNotifyBuilds] = useState(true);
  const [notifyIncidents, setNotifyIncidents] = useState(true);
  const [notifyRollbacks, setNotifyRollbacks] = useState(true);
  const [notifyAlerts, setNotifyAlerts] = useState(true);
  const [notifyPlugins, setNotifyPlugins] = useState(true);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Security
  const [secConfig, setSecConfig] = useState<{ configured: boolean; webhook_path: string; usage: string } | null>(null);

  useEffect(() => {
    if (isApiAvailable()) {
      (async () => {
        try {
          const { api } = await import('../services/api');
          const prefs = await api.settings.getNotifications();
          if (prefs) {
            setNotifyIncidents(Boolean(prefs.incident_created ?? true));
            setNotifyRollbacks(Boolean(prefs.rollback_completed ?? true));
            setNotifyBuilds(Boolean(prefs.deployment_failed ?? true));
            setNotifyAlerts(Boolean(prefs.daily_digest ?? false));
            setNotifyPlugins(Boolean(prefs.mention_received ?? true));
          }
          try {
            const sec = await api.settings.getSecurity();
            if (sec) setSecConfig(sec);
          } catch (secErr) {
            console.warn('[Settings] Failed to load security config:', secErr);
          }
        } catch (err) {
          console.warn('[Settings] Failed to load notification prefs:', err);
        }
      })();
    }
  }, []);

  const handleSaveProviders = () => {
    updateUserConnections({ github: gitUser || undefined, vercel: connectVcl, netlify: connectNfl });
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 3000);
  };

  const handleSaveNotifications = async () => {
    if (isApiAvailable()) {
      try {
        const { api } = await import('../services/api');
        await api.settings.saveNotifications({
          email_notifications: true,
          incident_created: notifyIncidents,
          incident_escalated: true,
          deployment_failed: notifyBuilds,
          rollback_completed: notifyRollbacks,
          mention_received: notifyPlugins,
          daily_digest: notifyAlerts,
          weekly_digest: false,
        });
      } catch (err) {
        console.error('[Settings] Failed to save notification prefs:', err);
      }
    }
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 3000);
  };

  const handleCardClick = (id: CardId) => {
    if (id === 'plugins') {
      navigateTo('integrations');
      return;
    }
    setActiveCard(id);
  };

  const systemCards: Array<{ id: CardId; icon: React.ReactNode; title: string; desc: string; badge?: string; badgeColor?: string }> = [
    {
      id: 'providers',
      icon: <Github size={20} className="text-zinc-300" />,
      title: 'Deployment Providers',
      desc: 'Configure GitHub username and connect Vercel or Netlify for deployment status tracking.',
    },
    {
      id: 'plugins',
      icon: <Puzzle size={20} className="text-violet-400" />,
      title: 'Plugins',
      desc: 'Add, remove, or configure observability plugins like Grafana, Datadog, and Sentry.',
      badge: pluginInstallations.length > 0 ? `${pluginInstallations.length}` : undefined,
      badgeColor: 'bg-violet-500/10 text-violet-400 border border-violet-500/20',
    },
    {
      id: 'notifications',
      icon: <Bell size={20} className="text-blue-400" />,
      title: 'Notifications',
      desc: 'Control which events trigger email and in-platform alerts.',
    },
    {
      id: 'appearance',
      icon: <Palette size={20} className="text-amber-400" />,
      title: 'Appearance',
      desc: 'Customize theme and visual appearance of the interface.',
    },
    {
      id: 'account',
      icon: <User size={20} className="text-zinc-400" />,
      title: 'Account',
      desc: 'Manage your name, description, and account settings.',
    },
    {
      id: 'preferences',
      icon: <Eye size={20} className="text-cyan-400" />,
      title: 'Preferences',
      desc: 'Configure which pages and content sections are visible.',
    },
  ];

  const securityCards: Array<{ id: CardId; icon: React.ReactNode; title: string; desc: string }> = [
    {
      id: 'security-webhook',
      icon: <Shield size={20} className="text-rose-400" />,
      title: 'Security Webhook',
      desc: 'Configure GitHub webhook signature verification for security triage events.',
    },
    {
      id: 'security',
      icon: <Lock size={20} className="text-red-400" />,
      title: 'Security',
      desc: 'Manage password, session termination, and account security.',
    },
    {
      id: 'credentials',
      icon: <KeyRound size={20} className="text-emerald-400" />,
      title: 'Credentials',
      desc: 'Store API keys and tokens for installed plugins.',
    },
    {
      id: 'team',
      icon: <Users size={20} className="text-emerald-400" />,
      title: 'Team Management',
      desc: 'Invite members, assign roles, and manage project-level access permissions.',
    },
  ];

  const filteredSystem = systemCards.filter(c => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return c.title.toLowerCase().includes(q) || c.desc.toLowerCase().includes(q);
  });
  const filteredSecurity = securityCards.filter(c => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return c.title.toLowerCase().includes(q) || c.desc.toLowerCase().includes(q);
  });

  const renderDetail = () => {
    switch (activeCard) {
      case 'providers':
        return (
          <div className="space-y-5">
            <div>
              <label className="block text-[11px] font-semibold text-zinc-400 mb-1.5">GitHub Username</label>
              <div className="relative">
                <Github className="absolute left-3 top-2.5 text-zinc-600" size={14} />
                <input type="text" value={gitUser} onChange={e => setGitUser(e.target.value)}
                  placeholder="github-username"
                  className="w-full bg-black/30 border border-white/[0.06] text-zinc-100 placeholder-zinc-600 focus:border-white/20 focus:outline-none rounded-md py-2.5 pl-9 pr-3 text-xs font-mono" />
              </div>
            </div>
            {[
              { label: 'Vercel API Integration', desc: 'Query deployment statuses and redirect routing rules.', checked: connectVcl, onChange: setConnectVcl },
              { label: 'Netlify Webhook Sync', desc: 'Read build stage logs and initiate edge rollbacks.', checked: connectNfl, onChange: setConnectNfl },
            ].map(item => (
              <div key={item.label} className="flex items-center justify-between p-4 bg-white/[0.02] rounded-xl border border-white/[0.06]">
                <div>
                  <span className="font-semibold text-zinc-200 block text-xs">{item.label}</span>
                  <p className="text-[11px] text-zinc-500 mt-1">{item.desc}</p>
                </div>
                <input type="checkbox" checked={item.checked} onChange={e => item.onChange(e.target.checked)}
                  className="w-4 h-4 bg-black/30 border-white/[0.06] rounded" />
              </div>
            ))}
            <button onClick={handleSaveProviders}
              className="bg-white text-black hover:bg-zinc-200 font-medium py-2 px-5 rounded-lg text-xs transition-all">
              Save Providers
            </button>
          </div>
        );

      case 'notifications':
        return (
          <div className="space-y-5">
            {[
              { id: 'builds',    label: 'Pipeline build completion',      checked: notifyBuilds,    onChange: setNotifyBuilds },
              { id: 'incidents', label: 'New incident creation',          checked: notifyIncidents, onChange: setNotifyIncidents },
              { id: 'rollbacks', label: 'Rollback completion',            checked: notifyRollbacks, onChange: setNotifyRollbacks },
              { id: 'alerts',    label: 'Monitoring alert notifications', checked: notifyAlerts,    onChange: setNotifyAlerts },
              { id: 'plugins',   label: 'Plugin connection errors',       checked: notifyPlugins,   onChange: setNotifyPlugins },
            ].map(item => (
              <label key={item.id} className="flex items-center gap-3 cursor-pointer p-4 bg-white/[0.02] rounded-xl border border-white/[0.06] hover:bg-white/[0.04] transition-all">
                <input id={item.id} type="checkbox" checked={item.checked} onChange={e => item.onChange(e.target.checked)}
                  className="w-4 h-4 bg-black/30 border-white/[0.06] rounded" />
                <span className="text-zinc-300 font-medium text-xs">{item.label}</span>
              </label>
            ))}
            <button onClick={handleSaveNotifications}
              className="bg-white text-black hover:bg-zinc-200 font-medium py-2 px-5 rounded-lg text-xs transition-all">
              Save Notifications
            </button>
          </div>
        );

      case 'security-webhook':
        return (
          <div className="space-y-5">
            <div className="flex items-center justify-between p-4 bg-white/[0.02] rounded-xl border border-white/[0.06]">
              <span className="font-semibold text-zinc-200 text-xs">Signature verification</span>
              {secConfig ? (
                secConfig.configured ? (
                  <span className="text-[11px] font-mono text-emerald-400 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>ENABLED
                  </span>
                ) : (
                  <span className="text-[11px] font-mono text-amber-400 flex items-center gap-1.5">
                    <AlertCircle size={11} />NOT CONFIGURED
                  </span>
                )
              ) : (
                <span className="text-[11px] font-mono text-zinc-600">CHECKING…</span>
              )}
            </div>
            <div className="p-4 bg-white/[0.02] border border-white/[0.06] rounded-xl font-mono text-[11px] text-zinc-400">
              <span className="text-zinc-600 block mb-1.5 font-sans font-semibold uppercase tracking-wider text-[10px]">Webhook URL</span>
              <span className="text-rose-300">{secConfig?.webhook_path || '/webhooks/github/security/{service_id}'}</span>
            </div>
            <p className="text-[11px] text-zinc-500 leading-relaxed flex gap-2">
              <ExternalLink size={13} className="shrink-0 mt-0.5 text-zinc-600" />
              <span>{secConfig?.usage || 'Set GITHUB_WEBHOOK_SECRET in the backend environment to enable X-Hub-Signature-256 verification.'}</span>
            </p>
          </div>
        );

      case 'user-profile':
        return user ? (
          <div className="space-y-5">
            <div className="flex items-center gap-5">
              <img src={user.avatarUrl} alt="" className="w-14 h-14 rounded-full border border-white/[0.06]" />
              <div className="space-y-1.5">
                <div className="text-zinc-200 font-semibold text-sm">{user.name}</div>
                <div className="text-zinc-400 text-xs">{user.email}</div>
                <span className="inline-block text-[10px] font-mono text-zinc-400 font-bold bg-white/5 border border-white/[0.06] px-2.5 py-0.5 rounded uppercase">
                  Role: {user.role}
                </span>
              </div>
            </div>
            <div className="p-4 bg-white/[0.02] border border-white/[0.06] rounded-xl text-[11px] text-zinc-500 flex gap-2.5">
              <Shield size={15} className="shrink-0 text-zinc-600 mt-0.5" />
              <span>Account scopes managed by your corporate directory. Contact operations to adjust role permissions.</span>
            </div>
          </div>
        ) : null;

      case 'team':
        return <TeamSection
          user={user!} projects={projects} teamMembers={teamMembers}
          addTeamMember={addTeamMember} removeTeamMember={removeTeamMember}
          updateTeamMemberRole={updateTeamMemberRole} />;

      case 'appearance':
        return (
          <div className="space-y-6">
            <div>
              <h4 className="text-xs font-semibold text-zinc-300 mb-1">Theme</h4>
              <p className="text-[11px] text-zinc-500 mb-4">Select a theme to change how Aether appears.</p>
              <div className="grid grid-cols-3 gap-4">
                {[
                  { id: 'light' as const, label: 'Light', icon: Sun, bg: 'bg-zinc-100', border: 'border-zinc-300' },
                  { id: 'dark' as const, label: 'Dark', icon: Moon, bg: 'bg-zinc-800', border: 'border-zinc-600' },
                  { id: 'system' as const, label: 'System', icon: Monitor, bg: 'bg-gradient-to-br from-zinc-100 to-zinc-800', border: 'border-zinc-500' },
                ].map(t => (
                  <button key={t.id} onClick={() => setTheme(t.id)}
                    className={`relative rounded-xl border-2 ${theme === t.id ? 'border-blue-500' : 'border-white/[0.08]'} overflow-hidden cursor-pointer hover:border-white/20 transition-all`}>
                    <div className={`${t.bg} h-24 flex items-center justify-center`}>
                      <t.icon size={20} className={t.id === 'light' ? 'text-zinc-600' : 'text-white/70'} />
                    </div>
                    <div className="p-3 flex items-center gap-2">
                      {theme === t.id && <CheckCircle size={14} className="text-blue-400" />}
                      <span className="text-xs font-medium text-zinc-200">{t.label}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        );

      case 'account':
        return (
          <div className="space-y-6">
            <div>
              <h4 className="text-xs font-semibold text-zinc-300 mb-1">General</h4>
              <div className="space-y-4 mt-3">
                <div>
                  <label className="block text-[11px] font-semibold text-zinc-400 mb-1">Full name</label>
                  <p className="text-[10px] text-zinc-600 mb-2">We recommend using your real name so people can recognize you instead of your ID.</p>
                  <input type="text" defaultValue={user?.name || ''}
                    className="w-full bg-black/30 border border-white/[0.06] text-zinc-100 focus:border-white/20 focus:outline-none rounded-md py-2.5 px-3 text-xs" />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-zinc-400 mb-1">Description</label>
                  <p className="text-[10px] text-zinc-600 mb-2">Enter a short description about yourself so that visitors know who you are.</p>
                  <textarea rows={4} placeholder="Tell us about yourself..."
                    className="w-full bg-black/30 border border-white/[0.06] text-zinc-100 placeholder-zinc-600 focus:border-white/20 focus:outline-none rounded-md py-2.5 px-3 text-xs resize-none" />
                  <div className="flex gap-3 mt-1.5">
                    <span className="text-[10px] text-zinc-500">Plain text</span>
                    <button className="text-[10px] text-blue-400 hover:underline">Preview</button>
                  </div>
                </div>
              </div>
            </div>
            <div className="border-t border-white/[0.06] pt-4">
              <button className="bg-white text-black hover:bg-zinc-200 font-medium py-2 px-5 rounded-lg text-xs transition-all flex items-center gap-1.5">
                <Save size={14} /> Save Account
              </button>
            </div>
          </div>
        );

      case 'security':
        return (
          <div className="space-y-6">
            <div>
              <h4 className="text-xs font-semibold text-zinc-300 mb-3">Password</h4>
              <div className="space-y-3">
                <div>
                  <label className="block text-[11px] font-semibold text-zinc-400 mb-1">Password</label>
                  <input type="password" defaultValue="••••••••••••••••••••••••••••••••"
                    className="w-full bg-black/30 border border-white/[0.06] text-zinc-100 focus:border-white/20 focus:outline-none rounded-md py-2.5 px-3 text-xs" />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-zinc-400 mb-1">Confirm Password</label>
                  <input type="password" defaultValue="••••••••••••••••••••••••••••••••"
                    className="w-full bg-black/30 border border-white/[0.06] text-zinc-100 focus:border-white/20 focus:outline-none rounded-md py-2.5 px-3 text-xs" />
                </div>
              </div>
            </div>
            <div className="border-t border-white/[0.06] pt-4">
              <h4 className="text-xs font-semibold text-zinc-300 mb-3">Session Termination</h4>
              <button className="bg-red-500/10 border border-red-500/20 text-red-400 font-medium py-2 px-4 rounded-lg text-xs transition-all hover:bg-red-500/20 flex items-center gap-2">
                Terminate All Sessions
                <span className="w-4 h-4 rounded-full border border-red-500/30 flex items-center justify-center text-[9px]">?</span>
              </button>
            </div>
            <div className="border-t border-white/[0.06] pt-4 flex gap-3">
              <button className="bg-white text-black hover:bg-zinc-200 font-medium py-2 px-5 rounded-lg text-xs transition-all">Save</button>
              <button className="bg-white/[0.05] border border-white/[0.08] text-zinc-300 hover:bg-white/[0.08] font-medium py-2 px-5 rounded-lg text-xs transition-all">Apply</button>
            </div>
          </div>
        );

      case 'credentials':
        return (
          <div className="space-y-6">
            <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-8 text-center">
              <KeyRound size={32} className="text-zinc-600 mx-auto mb-3" />
              <p className="text-sm text-zinc-400 font-semibold">There are no credentials</p>
              <button className="mt-3 bg-white text-black hover:bg-zinc-200 font-medium py-2 px-4 rounded-lg text-xs transition-all">
                + Add Credentials
              </button>
            </div>
            <div className="border-t border-white/[0.06] pt-4">
              <p className="text-[11px] text-zinc-500 mb-3">Stores scoped to User: {user?.name}</p>
              <div className="p-3 bg-white/[0.02] border border-white/[0.06] rounded-xl flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <User size={14} className="text-zinc-500" />
                  <span className="text-xs font-semibold text-blue-400">User: {user?.name}</span>
                </div>
                <span className="text-[10px] text-zinc-500">Domains: <span className="bg-white/[0.06] px-1.5 py-0.5 rounded text-zinc-300">Global</span></span>
              </div>
            </div>
            {pluginInstallations.length > 0 && (
              <div className="border-t border-white/[0.06] pt-4">
                <h4 className="text-xs font-semibold text-zinc-300 mb-3">Plugin API Keys</h4>
                <div className="space-y-3">
                  {pluginInstallations.map(p => (
                    <div key={p.id} className="p-3 bg-white/[0.02] border border-white/[0.06] rounded-xl">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-semibold text-zinc-200">{p.pluginName}</span>
                        <span className={`text-[9px] font-mono ${p.status === 'connected' ? 'text-emerald-400' : 'text-zinc-500'}`}>{p.status || 'disconnected'}</span>
                      </div>
                      <input type="password" placeholder={`Enter ${p.pluginName} API key...`}
                        defaultValue={p.apiKeyHint || ''}
                        className="w-full bg-black/30 border border-white/[0.06] text-zinc-100 placeholder-zinc-600 focus:border-white/20 focus:outline-none rounded-md py-2 px-3 text-[11px] font-mono" />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );

      case 'preferences':
        return <PreferencesCard />;

      default:
        return null;
    }
  };

  const activeCardMeta = [...systemCards, ...securityCards].find(c => c.id === activeCard);

  // Detail view
  if (activeCard) {
    return (
      <div className="max-w-3xl mx-auto space-y-6">
        <button onClick={() => setActiveCard(null)}
          className="flex items-center gap-2 text-sm font-semibold text-zinc-300 hover:text-white transition-colors">
          <ArrowLeft size={16} />
          Back to Settings
        </button>
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-white/[0.05] border border-white/[0.08] flex items-center justify-center">
            {activeCardMeta?.icon}
          </div>
          <div>
            <h3 className="text-base font-bold text-white">{activeCardMeta?.title}</h3>
            <p className="text-[11px] text-zinc-500">{activeCardMeta?.desc}</p>
          </div>
        </div>
        {saveSuccess && (
          <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs rounded-lg p-3 flex items-center gap-2">
            <CheckCircle size={14} />Settings saved successfully.
          </div>
        )}
        {renderDetail()}
      </div>
    );
  }

  // Grid view
  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold text-white tracking-tight">Manage Settings</h3>
          <p className="text-[11px] text-zinc-500 mt-0.5">Configure your Aether IDP instance.</p>
        </div>
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search settings"
            className="pl-9 pr-8 py-2 w-56 bg-white/[0.05] border border-white/[0.08] rounded-xl text-[12px] text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-[rgba(59,130,246,0.4)]"
          />
          <kbd className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-zinc-500 bg-white/[0.1] px-1.5 py-0.5 rounded font-mono">/</kbd>
        </div>
      </div>

      {/* System Configuration */}
      {filteredSystem.length > 0 && (
        <div>
          <h4 className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider mb-3">System Configuration</h4>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {filteredSystem.map(card => (
              <div key={card.id} onClick={() => handleCardClick(card.id)}
                className="group p-5 bg-white/[0.03] border border-white/[0.06] rounded-xl cursor-pointer hover:bg-white/[0.05] hover:border-white/[0.1] transition-all">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-white/[0.05] border border-white/[0.08] flex items-center justify-center shrink-0 group-hover:bg-white/[0.08] transition-all">
                    {card.icon}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] font-semibold text-white group-hover:text-blue-400 transition-colors">{card.title}</span>
                      {card.badge && (
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${card.badgeColor}`}>{card.badge}</span>
                      )}
                    </div>
                    <p className="text-[11px] text-zinc-500 mt-1 leading-relaxed">{card.desc}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Security */}
      {filteredSecurity.length > 0 && (
        <div>
          <h4 className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider mb-3">Security</h4>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {filteredSecurity.map(card => (
              <div key={card.id} onClick={() => handleCardClick(card.id)}
                className="group p-5 bg-white/[0.03] border border-white/[0.06] rounded-xl cursor-pointer hover:bg-white/[0.05] hover:border-white/[0.1] transition-all">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-white/[0.05] border border-white/[0.08] flex items-center justify-center shrink-0 group-hover:bg-white/[0.08] transition-all">
                    {card.icon}
                  </div>
                  <div className="min-w-0">
                    <span className="text-[13px] font-semibold text-white group-hover:text-blue-400 transition-colors">{card.title}</span>
                    <p className="text-[11px] text-zinc-500 mt-1 leading-relaxed">{card.desc}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty search */}
      {filteredSystem.length === 0 && filteredSecurity.length === 0 && searchQuery && (
        <div className="text-center py-12">
          <p className="text-sm text-zinc-500">No settings match "{searchQuery}"</p>
        </div>
      )}
    </div>
  );
};

/* ── Preferences Card ──────────────────────────────────── */

const ALL_PAGES = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'projects', label: 'Projects' },
  { id: 'deployments', label: 'Deployments' },
  { id: 'monitoring', label: 'Monitoring' },
  { id: 'incidents', label: 'Incidents' },
  { id: 'rollback-recovery', label: 'Rollback & Recovery' },
  { id: 'automation', label: 'Automation' },
  { id: 'scheduled-tasks', label: 'Scheduled Tasks' },
  { id: 'notifications', label: 'Notifications' },
  { id: 'settings', label: 'Settings' },
];

const PAGE_SECTIONS: Record<string, string[]> = {
  dashboard: ['KPI Cards', 'Charts', 'Audit Trail', 'Service Health', 'Integration Health'],
  projects: ['Project List', 'Status Filters', 'Quick Actions'],
  deployments: ['Timeline View', 'Status Badges', 'Filter Bar'],
  monitoring: ['Alert Table', 'Grafana Panels', 'Metrics Charts'],
  incidents: ['Incident List', 'Severity Filters', 'Resolution Timeline'],
  'rollback-recovery': ['Recovery Procedures', 'Rollback History'],
  automation: ['Pipeline List', 'Execution History'],
  'scheduled-tasks': ['Task List', 'Cron Schedule'],
  notifications: ['Alert Feed', 'Audit Log', 'Filter Tabs'],
  settings: ['System Config', 'Security', 'Team Management'],
};

function PreferencesCard() {
  const [enabledPages, setEnabledPages] = useState<Record<string, boolean>>(
    Object.fromEntries(ALL_PAGES.map(p => [p.id, true]))
  );
  const [expandedPage, setExpandedPage] = useState<string | null>(null);
  const [enabledSections, setEnabledSections] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    Object.values(PAGE_SECTIONS).flat().forEach(s => { init[s] = true; });
    return init;
  });

  const togglePage = (id: string) => setEnabledPages(prev => ({ ...prev, [id]: !prev[id] }));
  const toggleSection = (section: string) => setEnabledSections(prev => ({ ...prev, [section]: !prev[section] }));

  return (
    <div className="space-y-4">
      <p className="text-[11px] text-zinc-500">Choose which pages and content sections are visible in your workspace.</p>
      {ALL_PAGES.map(page => (
        <div key={page.id} className="bg-white/[0.02] border border-white/[0.06] rounded-xl overflow-hidden">
          <div className="flex items-center justify-between p-3">
            <div className="flex items-center gap-3">
              <input type="checkbox" checked={enabledPages[page.id]} onChange={() => togglePage(page.id)}
                className="w-4 h-4 bg-black/30 border-white/[0.06] rounded" />
              <span className="text-xs font-semibold text-zinc-200">{page.label}</span>
            </div>
            {PAGE_SECTIONS[page.id] && (
              <button onClick={() => setExpandedPage(expandedPage === page.id ? null : page.id)}
                className="text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors">
                {expandedPage === page.id ? 'Collapse' : 'Configure sections'}
              </button>
            )}
          </div>
          {expandedPage === page.id && PAGE_SECTIONS[page.id] && (
            <div className="border-t border-white/[0.06] px-3 py-2 space-y-1.5">
              {PAGE_SECTIONS[page.id].map(section => (
                <label key={section} className="flex items-center gap-2.5 cursor-pointer py-1">
                  <input type="checkbox" checked={enabledSections[section] ?? true}
                    onChange={() => toggleSection(section)}
                    className="w-3.5 h-3.5 bg-black/30 border-white/[0.06] rounded" />
                  <span className="text-[11px] text-zinc-400">{section}</span>
                </label>
              ))}
            </div>
          )}
        </div>
      ))}
      <button className="bg-white text-black hover:bg-zinc-200 font-medium py-2 px-5 rounded-lg text-xs transition-all flex items-center gap-1.5">
        <Save size={14} /> Save Preferences
      </button>
    </div>
  );
}

/* ── Team Management (extracted to respect hooks rules) ──────────── */

interface TeamSectionProps {
  user: { id: string };
  projects: Array<{ id: string; name: string }>;
  teamMembers: Array<{
    id: string; userId: string; name: string; email: string;
    role: ProjectRole; projectId: string; status?: string; addedAt: string;
  }>;
  addTeamMember: (member: any) => Promise<void>;
  removeTeamMember: (id: string) => void;
  updateTeamMemberRole: (id: string, role: ProjectRole) => void;
}

const TeamSection: React.FC<TeamSectionProps> = ({
  user, projects, teamMembers, addTeamMember, removeTeamMember, updateTeamMemberRole,
}) => {
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<ProjectRole>('developer');
  const [inviteError, setInviteError] = useState('');
  const [inviteSending, setInviteSending] = useState(false);
  const [inviteSent, setInviteSent] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState(projects[0]?.id || '');

  useEffect(() => {
    if (!selectedProjectId && projects.length > 0) {
      setSelectedProjectId(projects[0].id);
    }
  }, [projects, selectedProjectId]);

  const roleClass = (role: ProjectRole) => {
    if (role === 'admin') return 'bg-white text-black text-[9px] px-2 py-0.5 rounded font-mono';
    if (role === 'developer') return 'bg-blue-500/10 text-blue-400 border border-blue-500/20 text-[9px] px-2 py-0.5 rounded';
    return 'bg-zinc-500/10 text-zinc-400 border border-zinc-500/20 text-[9px] px-2 py-0.5 rounded';
  };

  const scopeProjectId = selectedProjectId || projects[0]?.id;
  const projectMembers = scopeProjectId
    ? teamMembers.filter(tm => tm.projectId === scopeProjectId)
    : [];

  const handleInvite = async () => {
    if (!inviteEmail.trim()) { setInviteError('Please enter an email address.'); return; }
    const scopeId = selectedProjectId || projects[0]?.id;
    if (!scopeId) {
      setInviteError('No project available. Create a project before inviting team members.');
      return;
    }
    setInviteError('');
    setInviteSending(true);
    setInviteSent(false);
    try {
      await addTeamMember({
        userId: 'u_pending_' + Math.random().toString(36).substr(2, 6),
        name: inviteEmail.split('@')[0],
        email: inviteEmail,
        role: inviteRole,
        projectId: scopeId,
      });
      setInviteSent(true);
      setTimeout(() => {
        setShowInviteModal(false);
        setInviteEmail('');
        setInviteRole('developer');
        setInviteSent(false);
      }, 2000);
    } catch (err: unknown) {
      setInviteError(err instanceof Error ? err.message : 'Failed to send invite.');
    } finally {
      setInviteSending(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        {projects.length > 1 && (
          <div className="flex items-center gap-2 text-xs">
            <span className="text-zinc-500 shrink-0">Project:</span>
            <select value={selectedProjectId} onChange={e => setSelectedProjectId(e.target.value)}
              className="bg-black/30 border border-white/[0.06] text-zinc-300 rounded px-2 py-1 text-xs">
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
        )}
        <button onClick={() => setShowInviteModal(true)}
          className="text-xs font-semibold text-zinc-300 border border-white/[0.06] hover:border-white/20 bg-white/[0.03] hover:bg-white/[0.05] px-4 py-2 rounded-lg transition-all">
          + Invite Member
        </button>
      </div>

      {projectMembers.length === 0 ? (
        <div className="text-center py-8 text-zinc-600">
          <p className="text-xs font-semibold text-zinc-500">No members yet</p>
          <p className="text-[11px] mt-1 text-zinc-600">Click "Invite Member" to add your first team member.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {projectMembers.map(tm => {
            const isOwnRow = tm.userId === user.id;
            const initials = tm.name.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase();
            const statusColor = tm.status === 'accepted' ? 'text-emerald-400' : tm.status === 'declined' ? 'text-red-400' : 'text-amber-400';
            return (
              <div key={tm.id} className="flex items-center justify-between p-3 bg-white/[0.02] rounded-xl border border-white/[0.06]">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-zinc-700 to-zinc-500 flex items-center justify-center text-[10px] font-bold text-white shrink-0">
                    {initials}
                  </div>
                  <div className="min-w-0">
                    <span className="text-zinc-200 font-medium text-xs block truncate">{tm.name}</span>
                    <span className="text-[11px] text-zinc-500 font-mono block truncate">{tm.email}</span>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className={roleClass(tm.role)}>{tm.role}</span>
                  <span className={`text-[11px] font-mono ${statusColor}`}>{tm.status || 'invited'}</span>
                  {!isOwnRow && (
                    <div className="flex items-center gap-1.5">
                      <select value={tm.role} onChange={e => updateTeamMemberRole(tm.id, e.target.value as ProjectRole)}
                        className="bg-black/30 border border-white/[0.06] text-zinc-300 text-[10px] rounded p-0.5">
                        <option value="viewer">viewer</option>
                        <option value="developer">developer</option>
                        <option value="admin">admin</option>
                      </select>
                      <button onClick={() => { if (window.confirm('Remove member?')) removeTeamMember(tm.id); }}
                        className="text-red-400 hover:text-red-300 text-xs font-mono">×</button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showInviteModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-dark-950 border border-white/[0.06] rounded-xl p-6 w-[420px] space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold text-white">Invite Team Member</h4>
              <button type="button" onClick={() => { setShowInviteModal(false); setInviteEmail(''); setInviteRole('developer'); }} className="text-zinc-500 hover:text-zinc-300"><X size={16} /></button>
            </div>

            {inviteSent ? (
              <div className="py-6 flex flex-col items-center gap-3 text-center">
                <div className="w-12 h-12 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                  <CheckCircle size={22} className="text-emerald-400" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">Invitation sent!</p>
                  <p className="text-[11px] text-zinc-400 mt-1 leading-relaxed">
                    <span className="font-mono text-zinc-300">{inviteEmail}</span> received an email invite.
                  </p>
                </div>
              </div>
            ) : (
              <>
                <div className="bg-blue-500/5 border border-blue-500/15 rounded-lg px-3 py-2.5 flex gap-2.5 text-[11px] text-zinc-400 leading-relaxed">
                  <Mail size={14} className="text-blue-400 shrink-0 mt-0.5" />
                  <span>
                    The invitation is sent <strong className="text-zinc-200">by email via Resend</strong> and,
                    if the address matches an existing account, also as an <strong className="text-zinc-200">in-platform notification</strong>.
                  </span>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="block text-[10px] font-semibold text-zinc-400 mb-1.5">Email address</label>
                    <input type="email" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)}
                      placeholder="developer@company.com"
                      className="w-full bg-black/30 border border-white/[0.06] text-zinc-100 placeholder-zinc-600 focus:border-white/20 focus:outline-none rounded-md py-2 px-3 text-xs" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-zinc-400 mb-1.5">Role</label>
                    <select value={inviteRole} onChange={e => setInviteRole(e.target.value as ProjectRole)}
                      className="w-full bg-black/30 border border-white/[0.06] text-zinc-300 rounded-md py-2 px-3 text-xs">
                      <option value="viewer">viewer — read-only access</option>
                      <option value="developer">developer — can manage deployments</option>
                      <option value="admin">admin — full project control</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-zinc-400 mb-1.5">Add to project</label>
                    {projects.length > 0 ? (
                      <select value={selectedProjectId || projects[0]?.id || ''} onChange={e => setSelectedProjectId(e.target.value)}
                        className="w-full bg-black/30 border border-white/[0.06] text-zinc-300 rounded-md py-2 px-3 text-xs">
                        {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                    ) : (
                      <div className="text-[10px] text-amber-400/90 bg-white/[0.02] border border-white/[0.06] rounded px-3 py-2">
                        No projects yet — create a project before inviting team members.
                      </div>
                    )}
                  </div>
                </div>

                {inviteError && (
                  <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-[11px] rounded-md p-2.5 flex items-center gap-2">
                    <AlertCircle size={12} />
                    <span>{inviteError}</span>
                  </div>
                )}

                <div className="flex justify-end gap-3 pt-2 border-t border-white/[0.06]">
                  <button type="button" onClick={() => { setShowInviteModal(false); setInviteEmail(''); setInviteRole('developer'); setInviteError(''); }}
                    className="px-3 py-1.5 rounded bg-dark-800 hover:bg-dark-700 border border-white/[0.06] text-zinc-300 text-xs font-medium">Cancel</button>
                  <button type="button" onClick={handleInvite} disabled={inviteSending}
                    className="px-3 py-1.5 rounded bg-white text-black hover:bg-zinc-200 text-xs font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5">
                    {inviteSending
                      ? <><span className="w-3 h-3 rounded-full border border-black border-t-transparent animate-spin" /> Sending…</>
                      : <>Send Invite</>}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};