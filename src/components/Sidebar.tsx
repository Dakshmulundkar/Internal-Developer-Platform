import React from 'react';
import { usePlatform } from '../context/PlatformContext';
import { 
  LayoutDashboard, FolderGit2, History, AlertOctagon, RefreshCw, 
  Bot, Bell, Settings, LogOut, Terminal 
} from 'lucide-react';

export const Sidebar: React.FC = () => {
  const { currentPage, navigateTo, logoutUser, incidents, notifications } = usePlatform();

  const openIncidentsCount = incidents.filter(i => i.status !== 'resolved').length;
  const unreadNotificationsCount = notifications.filter(n => !n.read).length;

  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'projects', label: 'Projects', icon: FolderGit2 },
    { id: 'deployments', label: 'Deployments', icon: History },
    { 
      id: 'incidents', 
      label: 'Incidents', 
      icon: AlertOctagon, 
      badge: openIncidentsCount > 0 ? openIncidentsCount : undefined,
      badgeColor: 'bg-rose-500 text-white'
    },
    { id: 'rollback-recovery', label: 'Rollback & Recovery', icon: RefreshCw },
    { id: 'ai-assistant', label: 'AI Assistant', icon: Bot },
    { 
      id: 'notifications', 
      label: 'Notifications', 
      icon: Bell, 
      badge: unreadNotificationsCount > 0 ? unreadNotificationsCount : undefined,
      badgeColor: 'bg-blue-500 text-white'
    },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  return (
    <aside className="w-64 bg-dark-900 border-r border-dark-700 flex flex-col h-screen shrink-0">
      {/* Brand Header */}
      <div className="p-5 border-b border-dark-700 flex items-center gap-3">
        <div className="bg-brand-600 p-2 rounded-lg text-white glow-info">
          <Terminal size={20} />
        </div>
        <div>
          <h1 className="font-semibold text-sm tracking-wide text-white">AETHER IDP</h1>
          <p className="text-[10px] text-slate-400 font-mono">Control Plane v1.0.0</p>
        </div>
      </div>

      {/* Menu Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentPage === item.id || 
            (item.id === 'projects' && currentPage === 'create-project') ||
            (item.id === 'projects' && currentPage === 'project-details') ||
            (item.id === 'deployments' && currentPage === 'deployment-details');
          
          return (
            <button
              key={item.id}
              onClick={() => navigateTo(item.id as any)}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-medium transition-all duration-200 group ${
                isActive 
                  ? 'bg-brand-600 text-white shadow-md shadow-brand-600/10' 
                  : 'text-slate-400 hover:bg-dark-800 hover:text-slate-100'
              }`}
            >
              <div className="flex items-center gap-3">
                <Icon size={16} className={isActive ? 'text-white' : 'text-slate-400 group-hover:text-slate-200'} />
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

      {/* Footer User logout */}
      <div className="p-4 border-t border-dark-700">
        <button
          onClick={logoutUser}
          className="w-full flex items-center gap-3 px-3 py-2 text-xs font-medium text-slate-400 hover:bg-dark-800 hover:text-rose-400 rounded-lg transition-all"
        >
          <LogOut size={16} />
          <span>Sign Out</span>
        </button>
      </div>
    </aside>
  );
};
