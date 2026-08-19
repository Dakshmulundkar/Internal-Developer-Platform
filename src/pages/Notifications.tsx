import React from 'react';
import { usePlatform } from '../context/PlatformContext';
import { 
  Bell, CheckCircle, XCircle, AlertOctagon, 
  Info, ShieldCheck, MailOpen, History 
} from 'lucide-react';

export const Notifications: React.FC = () => {
  const { 
    notifications, 
    markNotificationAsRead, 
    markAllNotificationsRead,
    navigateTo 
  } = usePlatform();

  const getAlertIcon = (type: string) => {
    switch (type) {
      case 'incident': return <AlertOctagon size={16} className="text-rose-400" />;
      case 'error': return <XCircle size={16} className="text-rose-400" />;
      case 'success': return <CheckCircle size={16} className="text-emerald-400" />;
      case 'warning': return <AlertOctagon size={16} className="text-amber-400" />;
      default: return <Info size={16} className="text-brand-400" />;
    }
  };

  const handleNotificationClick = (n: any) => {
    markNotificationAsRead(n.id);
    if (n.incidentId) {
      navigateTo('incidents', { incidentId: n.incidentId });
    } else if (n.deploymentId) {
      navigateTo('deployment-details', { deploymentId: n.deploymentId });
    } else if (n.projectId) {
      navigateTo('project-details', { projectId: n.projectId });
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header operations */}
      <div className="flex justify-between items-center bg-dark-900 border border-dark-700 rounded-xl p-4">
        <div>
          <h3 className="text-sm font-bold text-white tracking-wide">System Notifications Inbox</h3>
          <p className="text-[11px] text-slate-400 mt-0.5">
            Audit logs tracking webhook pipelines operations.
          </p>
        </div>
        
        {notifications.filter(n => !n.read).length > 0 && (
          <button
            onClick={markAllNotificationsRead}
            className="flex items-center gap-1.5 bg-dark-800 hover:bg-dark-750 border border-dark-700 text-slate-300 font-bold py-1.5 px-3 rounded text-xs transition-all"
          >
            <MailOpen size={14} />
            Mark all read
          </button>
        )}
      </div>

      {/* Lists feed */}
      <div className="bg-dark-900 border border-dark-700 rounded-xl overflow-hidden shadow-xl divide-y divide-dark-750">
        {notifications.length === 0 ? (
          <div className="p-12 text-center text-slate-500 font-mono text-xs">
            <Bell size={24} className="mx-auto mb-2 text-slate-600" />
            No notifications on Aether platform.
          </div>
        ) : (
          notifications.map(n => (
            <div
              key={n.id}
              onClick={() => handleNotificationClick(n)}
              className={`p-4 transition-all hover:bg-dark-800 cursor-pointer flex gap-3 text-xs ${
                !n.read ? 'bg-brand-600/5 border-l-2 border-brand-500' : ''
              }`}
            >
              {/* Icon indicator */}
              <div className="p-1.5 bg-dark-950 rounded border border-dark-750 shrink-0 h-8 w-8 flex items-center justify-center">
                {getAlertIcon(n.type)}
              </div>

              {/* Body */}
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-start mb-1">
                  <span className="font-semibold text-slate-200">{n.title}</span>
                  <span className="text-[10px] font-mono text-slate-500 shrink-0">
                    {new Date(n.createdAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <p className="text-slate-400 leading-relaxed font-sans">{n.message}</p>
                
                {/* Navigation suggestions link */}
                <span className="inline-block mt-2 font-mono text-[9px] text-brand-400 font-bold bg-brand-500/5 px-1.5 py-0.5 rounded hover:underline">
                  Inspect alert target event →
                </span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
