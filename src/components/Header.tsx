import React, { useState, useEffect, useRef } from 'react';
import { usePlatform } from '../context/PlatformContext';
import { Bell, Activity, Send, CheckCircle, XCircle } from 'lucide-react';
import type { DeploymentStatus } from '../types/platform';

export const Header: React.FC = () => {
  const { 
    user, 
    currentPage, 
    projects, 
    notifications, 
    markNotificationAsRead, 
    triggerWebhookSimulation,
    navigateTo 
  } = usePlatform();

  const [showSimulator, setShowSimulator] = useState(false);
  const [selectedProjId, setSelectedProjId] = useState(projects[0]?.id || '');
  const [simStatus, setSimStatus] = useState<DeploymentStatus>('ready');
  const [showNotificationDropdown, setShowNotificationDropdown] = useState(false);

  const simulatorRef = useRef<HTMLDivElement>(null);
  const notificationRef = useRef<HTMLDivElement>(null);

  // Close dropdowns on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (simulatorRef.current && !simulatorRef.current.contains(e.target as Node)) {
        setShowSimulator(false);
      }
      if (notificationRef.current && !notificationRef.current.contains(e.target as Node)) {
        setShowNotificationDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const unreadNotifications = notifications.filter(n => !n.read);

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
      default: return 'Control Center';
    }
  };

  const handleSimulateWebhook = () => {
    if (!selectedProjId) return;
    triggerWebhookSimulation(selectedProjId, simStatus);
    setShowSimulator(false);
    navigateTo('deployments');
  };

  return (
    <header className="h-16 border-b border-white/[0.06] bg-white/[0.02] glass backdrop-blur-[12px] flex items-center justify-between px-6 shrink-0 relative z-30">
      {/* Title */}
      <div>
        <h2 className="text-sm font-semibold text-white tracking-wide">{getHeaderTitle()}</h2>
        <p className="text-[10px] text-zinc-500">Manage, monitor, and recover multi-cloud environments.</p>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-4">
        {/* Connection States */}
        <div className="hidden lg:flex items-center gap-3 border-r border-white/[0.06] pr-4">
          <div className="flex items-center gap-1.5 text-[10px] font-medium font-mono text-zinc-500">
            <span>Vercel:</span>
            {user?.connectedVercel ? (
              <span className="flex items-center gap-1 text-emerald-400 font-bold">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                ACTIVE
              </span>
            ) : (
              <span className="text-zinc-600">DISCONNECTED</span>
            )}
          </div>
          <div className="flex items-center gap-1.5 text-[10px] font-medium font-mono text-zinc-500">
            <span>Netlify:</span>
            {user?.connectedNetlify ? (
              <span className="flex items-center gap-1 text-emerald-400 font-bold">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                ACTIVE
              </span>
            ) : (
              <span className="text-zinc-600">DISCONNECTED</span>
            )}
          </div>
        </div>

        {/* Webhook Simulator Button */}
        <div className="relative" ref={simulatorRef}>
          <button 
            onClick={() => setShowSimulator(!showSimulator)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-white/[0.06] hover:border-white/10 bg-white/[0.03] hover:bg-white/5 text-zinc-400 hover:text-zinc-200 text-[11px] font-semibold transition-all font-mono"
          >
            <Activity size={14} className="animate-pulse" />
            SIMULATE WEBHOOK
          </button>

          {/* Webhook Simulator Popover */}
          {showSimulator && (
            <div className="absolute right-0 mt-2 w-72 bg-[#050505] border border-white/[0.06] rounded-xl p-4 shadow-xl z-50 text-xs glass">
              <h3 className="font-bold text-zinc-200 mb-2 border-b border-white/[0.06] pb-1.5 flex items-center gap-1.5">
                <Send size={12} className="text-zinc-400" />
                Git Webhook Broker Sim
              </h3>
              
              <div className="space-y-3">
                <div>
                  <label className="block text-[10px] font-semibold text-zinc-500 mb-1">Target Project</label>
                  <select 
                    value={selectedProjId}
                    onChange={(e) => setSelectedProjId(e.target.value)}
                    className="w-full bg-black/30 border border-white/[0.06] rounded p-1 text-[11px] text-zinc-200 focus:outline-none focus:border-white/20 font-mono"
                  >
                    {projects.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-semibold text-zinc-500 mb-1">Force Build Outcome</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setSimStatus('ready')}
                      className={`py-1 rounded border text-[10px] font-mono flex items-center justify-center gap-1 ${
                        simStatus === 'ready' 
                          ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400 font-bold' 
                          : 'border-white/[0.06] hover:bg-white/[0.03] text-zinc-500'
                      }`}
                    >
                      <CheckCircle size={10} />
                      SUCCESS
                    </button>
                    <button
                      type="button"
                      onClick={() => setSimStatus('failed')}
                      className={`py-1 rounded border text-[10px] font-mono flex items-center justify-center gap-1 ${
                        simStatus === 'failed' 
                          ? 'border-red-500/20 bg-red-500/10 text-red-400 font-bold' 
                          : 'border-white/[0.06] hover:bg-white/[0.03] text-zinc-500'
                      }`}
                    >
                      <XCircle size={10} />
                      FAILURE
                    </button>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleSimulateWebhook}
                  className="w-full bg-white text-black hover:bg-zinc-200 font-medium py-1.5 rounded transition-all mt-1 font-mono text-[11px]"
                >
                  DISPATCH WEBHOOK PUSH
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Notifications Quick Access */}
        <div className="relative" ref={notificationRef}>
          <button 
            onClick={() => setShowNotificationDropdown(!showNotificationDropdown)}
            className="p-2 bg-white/[0.03] hover:bg-white/5 text-zinc-400 hover:text-zinc-200 rounded-lg border border-white/[0.06] transition-all relative"
          >
            <Bell size={16} />
            {unreadNotifications.length > 0 && (
              <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-rose-500 border border-[#050505]"></span>
            )}
          </button>

          {/* Notifications Dropdown */}
          {showNotificationDropdown && (
            <div className="absolute right-0 mt-2 w-80 bg-[#050505] border border-white/[0.06] rounded-xl shadow-xl z-50 overflow-hidden text-xs glass">
              <div className="p-3 border-b border-white/[0.06] flex justify-between items-center bg-white/[0.02]">
                <span className="font-bold text-zinc-200">Recent Alerts</span>
                <button 
                  onClick={() => {
                    setShowNotificationDropdown(false);
                    navigateTo('notifications');
                  }} 
                  className="text-[10px] text-zinc-400 hover:text-zinc-200 hover:underline"
                >
                  View All
                </button>
              </div>
              <div className="max-h-64 overflow-y-auto divide-y divide-white/[0.06]">
                {notifications.length === 0 ? (
                  <div className="p-4 text-center text-zinc-500">No alerts found.</div>
                ) : (
                  notifications.slice(0, 4).map(n => (
                    <div 
                      key={n.id} 
                      onClick={() => {
                        markNotificationAsRead(n.id);
                        setShowNotificationDropdown(false);
                        if (n.incidentId) {
                          navigateTo('incidents', { incidentId: n.incidentId });
                        } else if (n.deploymentId) {
                          navigateTo('deployment-details', { deploymentId: n.deploymentId });
                        } else if (n.projectId) {
                          navigateTo('project-details', { projectId: n.projectId });
                        } else {
                          navigateTo('notifications');
                        }
                      }}
                      className={`p-3 hover:bg-white/[0.02] transition-all cursor-pointer ${!n.read ? 'bg-white/[0.02] border-l-2 border-zinc-600' : ''}`}
                    >
                      <div className="flex justify-between items-start mb-0.5">
                        <span className={`font-semibold ${
                          n.type === 'incident' || n.type === 'error' ? 'text-red-400' :
                          n.type === 'success' ? 'text-emerald-400' : 'text-zinc-200'
                        }`}>{n.title}</span>
                        <span className="text-[9px] text-zinc-500">
                          {new Date(n.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <p className="text-[11px] text-zinc-400 line-clamp-2 leading-relaxed">{n.message}</p>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* User Badge Info */}
        {user && (
          <div className="flex items-center gap-3 border-l border-white/[0.06] pl-4">
            <img 
              src={user.avatarUrl} 
              alt={user.name} 
              className="w-8 h-8 rounded-full border border-white/[0.06] shadow"
            />
            <div className="hidden md:block text-left">
              <p className="text-xs font-semibold text-zinc-200 leading-none">{user.name}</p>
              <p className="text-[9px] font-mono text-zinc-500 uppercase mt-0.5">{user.role}</p>
            </div>
          </div>
        )}
      </div>
    </header>
  );
};
