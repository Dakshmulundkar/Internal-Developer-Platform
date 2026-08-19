import React, { useState } from 'react';
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
    <header className="h-16 border-b border-dark-700 bg-dark-900/60 backdrop-blur-md flex items-center justify-between px-6 shrink-0 relative z-30">
      {/* Title */}
      <div>
        <h2 className="text-sm font-semibold text-white tracking-wide">{getHeaderTitle()}</h2>
        <p className="text-[10px] text-slate-400">Manage, monitor, and recover multi-cloud environments.</p>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-4">
        {/* Connection States */}
        <div className="hidden lg:flex items-center gap-3 border-r border-dark-700 pr-4">
          <div className="flex items-center gap-1.5 text-[10px] font-medium font-mono text-slate-400">
            <span>Vercel:</span>
            {user?.connectedVercel ? (
              <span className="flex items-center gap-1 text-emerald-400 font-bold">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                ACTIVE
              </span>
            ) : (
              <span className="text-slate-500">DISCONNECTED</span>
            )}
          </div>
          <div className="flex items-center gap-1.5 text-[10px] font-medium font-mono text-slate-400">
            <span>Netlify:</span>
            {user?.connectedNetlify ? (
              <span className="flex items-center gap-1 text-emerald-400 font-bold">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                ACTIVE
              </span>
            ) : (
              <span className="text-slate-500">DISCONNECTED</span>
            )}
          </div>
        </div>

        {/* Webhook Simulator Button */}
        <div className="relative">
          <button 
            onClick={() => setShowSimulator(!showSimulator)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-brand-500/30 hover:border-brand-500/60 bg-brand-600/10 hover:bg-brand-600/20 text-brand-500 text-[11px] font-semibold transition-all font-mono glow-info"
          >
            <Activity size={14} className="animate-pulse" />
            SIMULATE WEBHOOK
          </button>

          {/* Webhook Simulator Popover */}
          {showSimulator && (
            <div className="absolute right-0 mt-2 w-72 bg-dark-800 border border-dark-700 rounded-xl p-4 shadow-xl z-50 text-xs">
              <h3 className="font-bold text-slate-200 mb-2 border-b border-dark-700 pb-1.5 flex items-center gap-1.5">
                <Send size={12} className="text-brand-500" />
                Git Webhook Broker Sim
              </h3>
              
              <div className="space-y-3">
                <div>
                  <label className="block text-[10px] font-semibold text-slate-400 mb-1">Target Project</label>
                  <select 
                    value={selectedProjId}
                    onChange={(e) => setSelectedProjId(e.target.value)}
                    className="w-full bg-dark-900 border border-dark-700 rounded p-1 text-[11px] text-slate-200 focus:outline-none focus:border-brand-500"
                  >
                    {projects.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-semibold text-slate-400 mb-1">Force Build Outcome</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setSimStatus('ready')}
                      className={`py-1 rounded border text-[10px] font-mono flex items-center justify-center gap-1 ${
                        simStatus === 'ready' 
                          ? 'border-emerald-500 bg-emerald-500/10 text-emerald-400 font-bold' 
                          : 'border-dark-700 hover:bg-dark-700 text-slate-400'
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
                          ? 'border-rose-500 bg-rose-500/10 text-rose-400 font-bold' 
                          : 'border-dark-700 hover:bg-dark-700 text-slate-400'
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
                  className="w-full bg-brand-600 hover:bg-brand-500 text-white font-bold py-1.5 rounded transition-all mt-1 font-mono text-[11px]"
                >
                  DISPATCH WEBHOOK PUSH
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Notifications Quick Access */}
        <div className="relative">
          <button 
            onClick={() => setShowNotificationDropdown(!showNotificationDropdown)}
            className="p-2 bg-dark-800 hover:bg-dark-700 text-slate-300 hover:text-slate-100 rounded-lg border border-dark-700 transition-all relative"
          >
            <Bell size={16} />
            {unreadNotifications.length > 0 && (
              <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-rose-500 border border-dark-800"></span>
            )}
          </button>

          {/* Notifications Dropdown */}
          {showNotificationDropdown && (
            <div className="absolute right-0 mt-2 w-80 bg-dark-800 border border-dark-700 rounded-xl shadow-xl z-50 overflow-hidden text-xs">
              <div className="p-3 border-b border-dark-700 flex justify-between items-center bg-dark-900/40">
                <span className="font-bold text-slate-200">Recent Alerts</span>
                <button 
                  onClick={() => {
                    setShowNotificationDropdown(false);
                    navigateTo('notifications');
                  }} 
                  className="text-[10px] text-brand-500 hover:underline"
                >
                  View All
                </button>
              </div>
              <div className="max-h-64 overflow-y-auto divide-y divide-dark-700">
                {notifications.length === 0 ? (
                  <div className="p-4 text-center text-slate-500">No alerts found.</div>
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
                      className={`p-3 hover:bg-dark-700 transition-all cursor-pointer ${!n.read ? 'bg-brand-600/5' : ''}`}
                    >
                      <div className="flex justify-between items-start mb-0.5">
                        <span className={`font-semibold ${
                          n.type === 'incident' || n.type === 'error' ? 'text-rose-400' :
                          n.type === 'success' ? 'text-emerald-400' : 'text-slate-200'
                        }`}>{n.title}</span>
                        <span className="text-[9px] text-slate-500">
                          {new Date(n.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 line-clamp-2 leading-relaxed">{n.message}</p>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* User Badge Info */}
        {user && (
          <div className="flex items-center gap-3 border-l border-dark-700 pl-4">
            <img 
              src={user.avatarUrl} 
              alt={user.name} 
              className="w-8 h-8 rounded-full border border-dark-700 shadow"
            />
            <div className="hidden md:block text-left">
              <p className="text-xs font-semibold text-slate-200 leading-none">{user.name}</p>
              <p className="text-[9px] font-mono text-slate-500 uppercase mt-0.5">{user.role}</p>
            </div>
          </div>
        )}
      </div>
    </header>
  );
};
