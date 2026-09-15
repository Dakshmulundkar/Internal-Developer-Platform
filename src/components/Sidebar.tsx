import React from 'react';
import { usePlatform } from '../context/PlatformContext';
import type { PageType } from '../context/PlatformContext';
import { 
  LayoutDashboard, FolderGit2, History, AlertOctagon, RefreshCw, 
  Bell, Terminal, Activity, Zap, CalendarClock, ChevronRight
} from 'lucide-react';

export const Sidebar: React.FC = () => {
  const { currentPage, navigateTo, logoutUser, incidents, notifications, monitoringAlerts, user } = usePlatform();

  const openIncidentsCount      = incidents.filter(i => i.status !== 'resolved').length;
  const unreadNotificationsCount = notifications.filter(n => !n.read).length;
  const firingAlertsCount       = monitoringAlerts.filter(a => a.status === 'firing').length;

  const menuItems: Array<{ id: PageType; label: string; icon: React.FC<{size?: number; className?: string}>; badge?: number; badgeColor?: string }> = [
    { id: 'dashboard',         label: 'Dashboard',           icon: LayoutDashboard },
    { id: 'projects',          label: 'Projects',            icon: FolderGit2 },
    { id: 'deployments',       label: 'Deployments',         icon: History },
    { id: 'monitoring',        label: 'Monitoring',          icon: Activity,
      badge: firingAlertsCount > 0 ? firingAlertsCount : undefined,
      badgeColor: 'bg-amber-500/10 text-amber-400 border border-amber-500/20' },
    { id: 'incidents',         label: 'Incidents',           icon: AlertOctagon,
      badge: openIncidentsCount > 0 ? openIncidentsCount : undefined,
      badgeColor: 'bg-red-500/10 text-red-400 border border-red-500/20' },
    { id: 'rollback-recovery', label: 'Rollback & Recovery', icon: RefreshCw },
    { id: 'automation',        label: 'Automation',          icon: Zap },
    { id: 'scheduled-tasks',   label: 'Scheduled Tasks',     icon: CalendarClock },
    { id: 'notifications',     label: 'Notifications',       icon: Bell,
      badge: unreadNotificationsCount > 0 ? unreadNotificationsCount : undefined,
      badgeColor: 'bg-blue-500/10 text-blue-400 border border-blue-500/20' },
  ];

  return (
    <aside className="w-60 bg-[rgba(28,28,30,0.4)] backdrop-blur-[40px] backdrop-saturate-[160%] border-r border-white/[0.08] flex flex-col h-screen shrink-0">
      {/* Brand */}
      <div className="px-5 py-4 border-b border-white/[0.08] flex items-center gap-3">
        <div className="w-9 h-9 rounded-[10px] bg-gradient-to-br from-[#3B82F6] to-[#7C3AED] shadow-[0_0_20px_rgba(59,130,246,0.3)] flex items-center justify-center text-white">
          <Terminal size={17} />
        </div>
        <div>
          <h1 className="text-[15px] font-bold tracking-[-0.02em] text-white leading-none">AETHER IDP</h1>
          <p className="text-[10px] text-white/30 font-medium mt-0.5 font-mono">Control Plane v2.0.0</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        <p className="px-3 pb-2 text-[10px] font-bold text-white/20 tracking-[0.05em] uppercase">Main Menu</p>
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive =
            currentPage === item.id ||
            (item.id === 'projects'      && (currentPage === 'create-project' || currentPage === 'project-details')) ||
            (item.id === 'deployments'   && currentPage === 'deployment-details');

          return (
            <button key={item.id} onClick={() => navigateTo(item.id)}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-[13px] transition-all duration-150 group ${
                isActive
                  ? 'bg-white/[0.08] text-white font-semibold'
                  : 'text-white/40 font-medium hover:text-white/70 hover:bg-white/[0.05]'
              }`}>
              <div className="flex items-center gap-3">
                <Icon size={16} className={isActive ? 'text-[#3B82F6]' : 'text-inherit group-hover:text-[#60A5FA]'} />
                <span>{item.label}</span>
              </div>
              {isActive ? (
                <ChevronRight size={14} className="opacity-50" />
              ) : (
                item.badge !== undefined && (
                  <span className={`px-1.5 py-0.5 text-[10px] font-bold rounded-full ${item.badgeColor}`}>
                    {item.badge}
                  </span>
                )
              )}
            </button>
          );
        })}
      </nav>

      {/* Bottom user section */}
      <div className="p-4 border-t border-white/[0.05]">
        {user && (
          <div className="flex items-center gap-3 bg-white/[0.03] border border-white/[0.05] rounded-2xl p-2.5">
            <img
              src={user.avatarUrl}
              alt={user.name}
              className="w-8 h-8 rounded-full border border-white/[0.1] shrink-0"
            />
            <div className="min-w-0">
              <p className="text-xs font-semibold text-white truncate leading-none">{user.name}</p>
              <p className="text-[10px] text-white/30 mt-0.5 truncate">{user.role}</p>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
};