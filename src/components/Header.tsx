import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { usePlatform } from '../context/PlatformContext';
import { isApiAvailable } from '../services/api';
import {
  Bell, Search, AlertCircle, Rocket, Folder, RotateCcw, Loader,
  LayoutDashboard, FolderGit2, History, Activity, RefreshCw,
  Zap, CalendarClock, Puzzle, Settings, Shield, User, Users, Bot, Github,
  ChevronDown, Moon, Sun, Monitor, Palette, Eye, KeyRound, FlaskConical, LogOut, Check
} from 'lucide-react';

interface SearchResult {
  type: string;
  id: string;
  title?: string;
  description?: string;
  name?: string;
  status?: string;
  [key: string]: unknown;
}

interface PageEntry {
  id: string;
  title: string;
  desc: string;
  icon: React.FC<{ size?: number; className?: string }>;
  aliases: string[];
}

const PAGES: PageEntry[] = [
  { id: 'dashboard',         title: 'Dashboard',           desc: 'Operational overview and metrics',        icon: LayoutDashboard, aliases: ['home', 'overview', 'metrics'] },
  { id: 'projects',          title: 'Projects',            desc: 'Service catalog and project management',  icon: FolderGit2,      aliases: ['services', 'catalog', 'repos'] },
  { id: 'deployments',       title: 'Deployments',         desc: 'Deployment timeline and history',          icon: History,         aliases: ['deploys', 'releases', 'ci', 'cd', 'pipeline'] },
  { id: 'monitoring',        title: 'Monitoring',          desc: 'Observability and alert management',       icon: Activity,        aliases: ['alerts', 'observability', 'grafana', 'datadog', 'sentry'] },
  { id: 'incidents',         title: 'Incidents',           desc: 'Incident tracking and resolution',         icon: AlertCircle,     aliases: ['issues', 'outages', 'oncall'] },
  { id: 'rollback-recovery', title: 'Rollback & Recovery', desc: 'Rollback procedures and recovery',         icon: RefreshCw,       aliases: ['rollback', 'recovery', 'hotfix'] },
  { id: 'automation',        title: 'Pipelines',          desc: 'Pipeline automation center',               icon: Zap,             aliases: ['pipelines', 'ci', 'cd'] },
  { id: 'scheduled-tasks',   title: 'Scheduled Tasks',     desc: 'Cron jobs and scheduled operations',       icon: CalendarClock,   aliases: ['cron', 'scheduler', 'jobs'] },
  { id: 'notifications',     title: 'Notifications',       desc: 'Audit logs and alerts',                    icon: Bell,            aliases: ['alerts', 'logs', 'audit'] },
  { id: 'settings',          title: 'Settings',            desc: 'Instance configuration and preferences',   icon: Settings,        aliases: ['config', 'preferences', 'setup'] },
  { id: 'integrations',     title: 'Plugins',             desc: 'Plugin marketplace — install and configure plugins', icon: Puzzle,          aliases: ['integrations', 'extensions', 'addons', 'plugins'] },
  { id: 'settings:providers',        title: 'Deployment Providers', desc: 'GitHub, Vercel, Netlify connections',  icon: Github,    aliases: ['github', 'vercel', 'netlify', 'git'] },
  { id: 'settings:notifications',    title: 'Notification Settings', desc: 'Configure email and platform alerts', icon: Bell,      aliases: ['email', 'alerts config'] },
  { id: 'settings:security-webhook', title: 'Security Webhook',     desc: 'GitHub webhook signature verification', icon: Shield, aliases: ['webhook', 'security', 'github'] },
  { id: 'settings:account',          title: 'Account',               desc: 'Name, description, and password',      icon: User,       aliases: ['name', 'password', 'describe', 'profile', 'me'] },
  { id: 'settings:team',             title: 'Team Management',       desc: 'Invite members and manage roles',     icon: Users,      aliases: ['members', 'invite', 'roles', 'permissions'] },
  { id: 'settings:appearance',       title: 'Appearance',            desc: 'Theme and visual settings',           icon: Palette,    aliases: ['theme', 'dark', 'light', 'look'] },
  { id: 'settings:account',          title: 'Account',               desc: 'Name, description, and password',      icon: User,       aliases: ['name', 'password', 'describe'] },
  { id: 'settings:security',         title: 'Security',              desc: 'Password and session management',      icon: Shield,     aliases: ['password', 'session', 'terminate'] },
  { id: 'settings:credentials',      title: 'Credentials',           desc: 'API keys for installed plugins',       icon: KeyRound,   aliases: ['api', 'keys', 'tokens', 'secrets'] },
];

const TYPE_ICONS: Record<string, React.FC<{ size?: number; className?: string }>> = {
  incident: AlertCircle,
  deployment: Rocket,
  project: Folder,
  rollback: RotateCcw,
  page: Search,
};

const TYPE_LABELS: Record<string, string> = {
  incident: 'Incident',
  deployment: 'Deployment',
  project: 'Project',
  rollback: 'Rollback',
  page: 'Page',
};

export const Header: React.FC = () => {
  const {
    user,
    currentPage,
    notifications,
    markNotificationAsRead,
    navigateTo,
    logoutUser,
    theme,
    setTheme
  } = usePlatform();

  const [showNotificationDropdown, setShowNotificationDropdown] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showThemeMenu, setShowThemeMenu] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);

  const notificationRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<number | null>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (notificationRef.current && !notificationRef.current.contains(e.target as Node)) {
        setShowNotificationDropdown(false);
      }
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setSearchOpen(false);
      }
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setShowUserMenu(false);
        setShowThemeMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
        setSearchOpen(true);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      setSearchLoading(false);
      return;
    }
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    setSearchLoading(true);
    debounceRef.current = window.setTimeout(async () => {
      const q = searchQuery.trim().toLowerCase();
      const pageMatches: SearchResult[] = PAGES
        .filter(p =>
          p.title.toLowerCase().includes(q) ||
          p.desc.toLowerCase().includes(q) ||
          p.aliases.some(a => a.includes(q))
        )
        .map(p => ({
          type: 'page',
          id: p.id,
          title: p.title,
          description: p.desc,
        }));
      let apiResults: SearchResult[] = [];
      if (isApiAvailable()) {
        try {
          const { api } = await import('../services/api');
          const data = await api.search.search(q);
          apiResults = (data.results || []) as SearchResult[];
        } catch { /* ignore */ }
      }
      setSearchResults([...pageMatches, ...apiResults]);
      setActiveIdx(0);
      setSearchLoading(false);
    }, 200);
  }, [searchQuery]);

  useEffect(() => () => { if (debounceRef.current) window.clearTimeout(debounceRef.current); }, []);

  const navigateToResult = useCallback((result: SearchResult) => {
    if (result.type === 'page') {
      if (result.id.startsWith('settings:')) {
        navigateTo('settings', { settingsCard: result.id.replace('settings:', '') });
      } else {
        navigateTo(result.id as any);
      }
    } else {
      switch (result.type) {
        case 'incident':   navigateTo('incidents', { incidentId: result.id }); break;
        case 'deployment': navigateTo('deployment-details', { deploymentId: result.id }); break;
        case 'project':    navigateTo('project-details', { projectId: result.id }); break;
        case 'rollback':   navigateTo('rollback-recovery', { projectId: (result as Record<string, unknown>).project_id as string }); break;
      }
    }
    setSearchOpen(false);
    setSearchQuery('');
  }, [navigateTo]);

  const onSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { setSearchOpen(false); searchInputRef.current?.blur(); return; }
    if (searchResults.length === 0) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx(i => (i + 1) % searchResults.length); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx(i => (i - 1 + searchResults.length) % searchResults.length); }
    else if (e.key === 'Enter') { e.preventDefault(); navigateToResult(searchResults[activeIdx]); }
  };

  const unreadNotifications = useMemo(
    () => notifications.filter(n => !n.read),
    [notifications],
  );

  const getHeaderTitle = () => {
    switch (currentPage) {
      case 'dashboard': return 'Operational Dashboard';
      case 'projects': return 'Project & Service Catalog';
      case 'create-project': return 'Register New Service';
      case 'project-details': return 'Service Details & Health';
      case 'deployments': return 'Deployment Timeline';
      case 'deployment-details': return 'Compilation Logs & Diagnostics';
      case 'incidents': return 'Incident Center';
      case 'rollback-recovery': return 'Recovery & Rollback Center';
      case 'ai-assistant': return 'Aether AI Diagnostic Co-pilot';
      case 'notifications': return 'Audit Logs & Notifications';
      case 'settings': return 'Settings & Credentials';
      case 'integrations': return 'Plugin Marketplace & Integrations';
      case 'plugin-config': return 'Plugin Configuration';
      case 'monitoring': return 'Monitoring & Observability';
      case 'automation': return 'Pipeline Center';
      case 'scheduled-tasks': return 'Scheduled Tasks';
      default: return 'Control Center';
    }
  };

  const resultTitle = (r: SearchResult) => r.title || r.name || String(r.id) || '(untitled)';

  const openSettingsCard = (card: string) => {
    navigateTo('settings', { settingsCard: card });
    setShowUserMenu(false);
  };

  return (
    <header className="h-[68px] bg-[rgba(0,0,0,0.2)] backdrop-blur-[20px] border-b border-white/[0.08] flex items-center justify-between px-8 shrink-0 relative z-30">
      <div>
        <h2 className="text-sm font-semibold text-white tracking-wide">{getHeaderTitle()}</h2>
        <p className="text-[10px] text-zinc-500">Manage, monitor, and recover multi-cloud environments.</p>
      </div>

      <div className="flex items-center gap-3">
        {/* Search */}
        <div className="relative shrink-0" ref={searchRef}>
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" />
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={e => { setSearchQuery(e.target.value); setSearchOpen(true); }}
            onFocus={() => setSearchOpen(true)}
            onKeyDown={onSearchKeyDown}
            placeholder="Search all pages"
            className="pl-9 pr-3 py-2 w-56 min-w-[224px] h-[34px] bg-white/[0.05] border border-white/[0.08] rounded-xl text-[12px] text-zinc-200 placeholder-zinc-500 focus:outline-none focus:ring-0 focus:border-white/[0.08]"
          />
          {searchOpen && (
            <div className="absolute left-0 top-full mt-1 w-56 bg-dark-950 border border-white/[0.06] rounded-xl shadow-xl z-50 overflow-hidden text-xs glass">
              {searchLoading && (
                <div className="flex items-center gap-2 px-4 py-3 text-[11px] text-zinc-500">
                  <Loader size={12} className="animate-spin" /> Searching…
                </div>
              )}
              {!searchLoading && searchResults.length === 0 && searchQuery.trim().length > 0 && (
                <div className="px-4 py-3 text-[11px] text-zinc-500">No results for "{searchQuery.trim()}"</div>
              )}
              {!searchLoading && !searchQuery.trim() && (
                <div className="px-4 py-3 text-[10px] text-zinc-600">Type to search across all pages and data.</div>
              )}
              {!searchLoading && searchResults.length > 0 && (
                <div className="max-h-64 overflow-y-auto divide-y divide-white/[0.06]">
                  {searchResults.map((result, idx) => {
                    const Icon = result.type === 'page'
                      ? (PAGES.find(p => p.id === result.id)?.icon || Search)
                      : (TYPE_ICONS[result.type] || Search);
                    return (
                      <button key={result.id + idx} type="button"
                        onClick={() => navigateToResult(result)}
                        onMouseEnter={() => setActiveIdx(idx)}
                        className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${idx === activeIdx ? 'bg-white/[0.04]' : ''}`}>
                        <Icon size={14} className="text-zinc-400 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] font-semibold text-zinc-200 truncate">{resultTitle(result)}</span>
                            <span className="text-[9px] font-mono text-zinc-500 uppercase bg-white/[0.04] border border-white/[0.08] px-1.5 py-0.5 rounded shrink-0">
                              {result.id.startsWith('settings:') ? 'Settings' : (TYPE_LABELS[result.type] || result.type)}
                            </span>
                          </div>
                          {result.description && <p className="text-[10px] text-zinc-500 truncate mt-0.5">{result.description}</p>}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Notifications */}
        <div className="relative" ref={notificationRef}>
          <button onClick={() => setShowNotificationDropdown(!showNotificationDropdown)}
            className={`w-8 h-8 rounded-[10px] transition-all relative flex items-center justify-center ${showNotificationDropdown ? 'bg-white/[0.1] text-white' : 'bg-white/[0.05] hover:bg-white/[0.1] text-white/40 hover:text-white'}`}>
            <Bell size={16} />
            {unreadNotifications.length > 0 && (
              <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-rose-500 border border-dark-950"></span>
            )}
          </button>
          {showNotificationDropdown && (
            <div className="absolute right-0 mt-2 w-80 bg-dark-950 border border-white/[0.06] rounded-xl shadow-xl z-50 overflow-hidden text-xs glass">
              <div className="p-3 border-b border-white/[0.06] flex justify-between items-center bg-white/[0.02]">
                <span className="font-bold text-zinc-200">Recent Alerts</span>
                <button onClick={() => { setShowNotificationDropdown(false); navigateTo('notifications'); }}
                  className="text-[10px] text-zinc-400 hover:text-zinc-200 hover:underline">View All</button>
              </div>
              <div className="max-h-64 overflow-y-auto divide-y divide-white/[0.06]">
                {notifications.length === 0 ? (
                  <div className="p-4 text-center text-zinc-500">No alerts found.</div>
                ) : notifications.slice(0, 4).map(n => (
                  <div key={n.id}
                    onClick={() => {
                      markNotificationAsRead(n.id);
                      setShowNotificationDropdown(false);
                      if (n.incidentId) navigateTo('incidents', { incidentId: n.incidentId });
                      else if (n.deploymentId) navigateTo('deployment-details', { deploymentId: n.deploymentId });
                      else if (n.projectId) navigateTo('project-details', { projectId: n.projectId });
                      else navigateTo('notifications');
                    }}
                    className={`p-3 hover:bg-white/[0.02] transition-all cursor-pointer ${!n.read ? 'bg-white/[0.02] border-l-2 border-zinc-600' : ''}`}>
                    <div className="flex justify-between items-start mb-0.5">
                      <span className={`font-semibold ${n.type === 'incident' || n.type === 'error' ? 'text-red-400' : n.type === 'success' ? 'text-emerald-400' : 'text-zinc-200'}`}>{n.title}</span>
                      <span className="text-[9px] text-zinc-500">{new Date(n.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                    <p className="text-[11px] text-zinc-400 line-clamp-2 leading-relaxed">{n.message}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Settings Gear */}
        <button onClick={() => navigateTo('settings')}
          className="w-8 h-8 rounded-[10px] bg-white/[0.05] hover:bg-white/[0.1] text-white/40 hover:text-white transition-all flex items-center justify-center"
          title="Settings">
          <Settings size={16} />
        </button>

        {/* User Menu */}
        <div className="relative" ref={userMenuRef}
          onMouseEnter={() => setShowUserMenu(true)}
          onMouseLeave={() => { setShowUserMenu(false); setShowThemeMenu(false); }}>
          <button onClick={() => setShowUserMenu(!showUserMenu)}
            className="w-8 h-8 rounded-full border border-white/[0.06] hover:border-white/20 transition-all overflow-hidden">
            {user && <img src={user.avatarUrl} alt={user.name} className="w-full h-full object-cover" />}
          </button>

          {showUserMenu && (
            <div className="absolute right-0 mt-1 w-56">
            <div className="bg-[#1a1a24] border border-white/[0.08] rounded-xl shadow-2xl overflow-hidden text-xs">
              {/* User header */}
              <div className="px-4 py-3 border-b border-white/[0.06]">
                <div className="flex items-center gap-2">
                  <User size={13} className="text-zinc-400" />
                  <span className="text-[12px] font-semibold text-zinc-200">{user?.name}</span>
                </div>
              </div>

              {/* Menu items */}
              <div className="py-1">
                {/* Theme with sub-menu */}
                <div className="relative">
                  <button onClick={() => setShowThemeMenu(!showThemeMenu)}
                    className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-white/[0.04] transition-colors text-left">
                    <div className="flex items-center gap-3">
                      {theme === 'light' ? <Sun size={14} className="text-zinc-400" /> : <Moon size={14} className="text-zinc-400" />}
                      <span className="text-[12px] text-zinc-300">Theme</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-zinc-500">{theme === 'light' ? 'Light' : theme === 'dark' ? 'Dark' : 'System'}</span>
                      <ChevronDown size={12} className={`text-zinc-500 transition-transform ${showThemeMenu ? 'rotate-180' : ''}`} />
                    </div>
                  </button>
                  {showThemeMenu && (
                    <div className="pl-8 pb-1">
                      {[
                        { value: 'light' as const, label: 'Light', icon: Sun },
                        { value: 'dark' as const, label: 'Dark', icon: Moon },
                        { value: 'system' as const, label: 'System', icon: Monitor },
                      ].map(opt => (
                        <button key={opt.value} onClick={() => { setTheme(opt.value); setShowThemeMenu(false); }}
                          className="w-full flex items-center justify-between px-4 py-1.5 hover:bg-white/[0.04] text-[11px] text-zinc-400 hover:text-zinc-200 transition-colors">
                          <span>{opt.label}</span>
                          {theme === opt.value && <Check size={12} className="text-blue-400" />}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <MenuItem icon={<Eye size={14} />} label="My Views" onClick={() => setShowUserMenu(false)} />
                <MenuItem icon={<User size={14} />} label="Account" onClick={() => openSettingsCard('account')} />
                <MenuItem icon={<Palette size={14} />} label="Appearance" onClick={() => openSettingsCard('appearance')} />
                <MenuItem icon={<Settings size={14} />} label="Preferences" onClick={() => openSettingsCard('preferences')} />
                <MenuItem icon={<Shield size={14} />} label="Security" onClick={() => openSettingsCard('security')} />
                <MenuItem icon={<FlaskConical size={14} />} label="Experiments" onClick={() => setShowUserMenu(false)} />
                <MenuItem icon={<KeyRound size={14} />} label="Credentials" onClick={() => openSettingsCard('credentials')} />
              </div>

              {/* Sign out */}
              <div className="border-t border-white/[0.06] py-1">
                <button onClick={() => { setShowUserMenu(false); logoutUser(); }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-white/[0.04] transition-colors text-left">
                  <LogOut size={14} className="text-rose-400" />
                  <span className="text-[12px] text-rose-400">Sign Out</span>
                </button>
              </div>
            </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};

function MenuItem({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-white/[0.04] transition-colors text-left">
      <span className="text-zinc-400">{icon}</span>
      <span className="text-[12px] text-zinc-300">{label}</span>
    </button>
  );
}