import React from 'react';
import { usePlatform } from '../context/PlatformContext';
import { 
  LayoutDashboard, FolderGit2, History, AlertOctagon, RefreshCw, 
  Bot, Bell, Settings, LogOut, Terminal, Puzzle, Activity
} from 'lucide-react';

export const Sidebar: React.FC = () => {
  const { currentPage, navigateTo, logoutUser, incidents, notifications, monitoringAlerts, pluginInstallations } = usePlatform();

  const openIncidentsCount      = incidents.filter(i => i.status !== 'resolved').length;
  const unreadNotificationsCount = notifications.filter(n => !n.read).length;
  const firingAlertsCount       = monitoringAlerts.filter(a => a.status === 'firing').length;
  const installedPluginsCount   = pluginInstallations.length;

  const menuItems = [
    { id: 'dashboard',        label: 'Dashboard',          icon: LayoutDashboard },
    { id: 'projects',         label: 'Projects',           icon: FolderGit2 },
    { id: 'deployments',      label: 'Deployments',        icon: History },
    { id: 'monitoring',       label: 'Monitoring',         icon: Activity,
      badge: firingAlertsCount > 0 ? firingAlertsCount : undefined,
      badgeColor: 'bg-amber-500 text-white' },
    { id: 'incidents',        label: 'Incidents',          icon: AlertOctagon,
      badge: openIncidentsCount > 0 ? openIncidentsCount : undefined,
      badgeColor: 'bg-rose-500 text-white' },
    { id: 'rollback-recovery', label: 'Rollback & Recovery', icon: RefreshCw },
    { id: 'ai-assistant',     label: 'AI Assistant',       icon: Bot },
    { id: 'integrations',     label: 'Integrations',       icon: Puzzle,
      badge: installedPluginsCount > 0 ? installedPluginsCount : undefined,
      badgeColor: 'bg-zinc-600 text-white' },
    { id: 'notifications',    label: 'Notifications',      icon: Bell,
      badge: unreadNotificationsCount > 0 ? unreadNotificationsCount : undefined,
      badgeColor: 'bg-blue-500 text-white' },
    { id: 'settings',         label: 'Settings',           icon: Settings },
  ];

  return (
    <aside className="w-56 bg-[#050505] border-r border-white/[0.06] flex flex-col h-screen shrink-0 glass">
      {/* Brand */}
      <div className="p-5 border-b border-white/[0.06] flex items-center gap-3">
        <div className="w-8 h-8 bg-white/5 border border-white/10 rounded-lg flex items-center justify-center text-white">
          <Terminal size={16} />
        </div>
        <div>
          <h1 className="text-sm font-semibold text-white">AETHER IDP</h1>
          <p className="text-[10px] text-zinc-500 font-mono">Control Plane v2.0.0</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive =
            currentPage === item.id ||
            (item.id === 'projects'      && (currentPage === 'create-project' || currentPage === 'project-details')) ||
            (item.id === 'deployments'   && currentPage === 'deployment-details') ||
            (item.id === 'integrations'  && currentPage === 'plugin-config');

          return (
            <button key={item.id} onClick={() => navigateTo(item.id as any)}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-md text-sm font-medium transition-all duration-150 group ${
                isActive
                  ? 'bg-white/5 ring-1 ring-white/5 text-zinc-100'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.03]'
              }`}>
              <div className="flex items-center gap-3">
                <Icon size={15} className={isActive ? 'text-zinc-100' : 'text-zinc-500 group-hover:text-zinc-300'} />
                <span>{item.label}</span>
              </div>
              {item.badge !== undefined && (
                <span className={`px-1.5 py-0.5 text-[10px] font-bold rounded-full ${item.badgeColor}`}>
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Sign out */}
      <div className="p-4 border-t border-white/[0.06]">
        <button onClick={logoutUser}
          className="w-full flex items-center gap-3 px-3 py-2 text-xs font-medium text-zinc-400 hover:bg-white/[0.03] hover:text-rose-400 rounded-md transition-all">
          <LogOut size={15} />
          <span>Sign Out</span>
        </button>
      </div>
    </aside>
  );
};
