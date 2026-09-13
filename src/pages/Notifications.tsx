import React from 'react';
import { usePlatform } from '../context/PlatformContext';
import { 
  Bell, CheckCircle, XCircle, AlertOctagon, 
  Info, MailOpen, UserPlus, Check, X
} from 'lucide-react';
import type { Notification } from '../types/platform';

export const Notifications: React.FC = () => {
  const { 
    notifications, 
    markNotificationAsRead, 
    markAllNotificationsRead,
    acceptTeamInvite,
    declineTeamInvite,
    teamMembers,
    pendingInvites,
    navigateTo 
  } = usePlatform();

  const getIcon = (type: string) => {
    switch (type) {
      case 'incident':  return <AlertOctagon size={16} className="text-red-400" />;
      case 'error':     return <XCircle size={16} className="text-red-400" />;
      case 'success':   return <CheckCircle size={16} className="text-emerald-400" />;
      case 'warning':   return <AlertOctagon size={16} className="text-amber-400" />;
      case 'team_invite': return <UserPlus size={16} className="text-indigo-400" />;
      default:          return <Info size={16} className="text-zinc-400" />;
    }
  };

  const handleNotificationClick = (n: Notification) => {
    // Don't auto-mark-read on invite clicks — they need explicit Accept/Decline
    if (n.type === 'team_invite') return;

    markNotificationAsRead(n.id);
    if (n.incidentId)   navigateTo('incidents', { incidentId: n.incidentId });
    else if (n.deploymentId) navigateTo('deployment-details', { deploymentId: n.deploymentId });
    else if (n.projectId)    navigateTo('project-details', { projectId: n.projectId });
  };

  const handleAccept = (n: Notification) => {
    if (!n.teamMemberId) return;
    acceptTeamInvite(n.teamMemberId, n.id, n.inviteToken);
  };

  const handleDecline = (n: Notification) => {
    if (!n.teamMemberId) return;
    declineTeamInvite(n.teamMemberId, n.id, n.inviteToken);
  };

  // Check the live status of an invite so buttons update after action
  const getInviteStatus = (teamMemberId?: string) => {
    if (!teamMemberId) return null;
    const tm = teamMembers.find(tm => tm.id === teamMemberId);
    if (tm?.status === 'accepted' || tm?.status === 'declined') return tm.status;
    // Still pending (pending invite list) — actions still available
    if (pendingInvites.find(p => p.id === teamMemberId)) return 'invited';
    // Membership row is only visible in teamMembers once accepted, so a pending
    // row marked invited here counts as an active invite too.
    if (tm?.status === 'invited') return 'invited';
    return null;
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center bg-white/[0.03] border border-white/[0.06] rounded-xl p-4">
        <div>
          <h3 className="text-sm font-semibold text-white tracking-tight">Notifications</h3>
          <p className="text-[11px] text-zinc-400 mt-0.5">
            System alerts, deployment events, and team invitations.
          </p>
        </div>
        
        {notifications.filter(n => !n.read).length > 0 && (
          <button
            onClick={markAllNotificationsRead}
            className="flex items-center gap-1.5 bg-zinc-900 hover:bg-zinc-800 border border-white/[0.06] text-zinc-300 font-medium py-1.5 px-3 rounded text-xs transition-all"
          >
            <MailOpen size={14} />
            Mark all read
          </button>
        )}
      </div>

      {/* Feed */}
      <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl overflow-hidden divide-y divide-white/[0.06]">
        {notifications.length === 0 ? (
          <div className="p-12 text-center text-zinc-600 font-mono text-xs">
            <Bell size={24} className="mx-auto mb-2 text-zinc-700" />
            No notifications.
          </div>
        ) : (
          notifications.map(n => {
            const isInvite = n.type === 'team_invite';
            const inviteStatus = isInvite ? getInviteStatus(n.teamMemberId) : null;
            const inviteActioned = inviteStatus === 'accepted' || inviteStatus === 'declined';
            // A read invite notification with no visible pending invite and no
            // member row (e.g. declined, or membership not yet loaded) is already
            // handled — don't keep showing Accept/Decline for it.
            const inviteHandled = inviteActioned || (isInvite && inviteStatus === null && n.read);

            return (
              <div
                key={n.id}
                onClick={() => handleNotificationClick(n)}
                className={`p-4 transition-all flex gap-3 text-xs
                  ${!n.read && !inviteHandled ? 'bg-white/[0.02] border-l-2 border-zinc-600' : ''}
                  ${!isInvite ? 'hover:bg-white/[0.02] cursor-pointer' : 'cursor-default'}
                `}
              >
                {/* Icon */}
                <div className="p-1.5 bg-white/[0.03] rounded border border-white/[0.06] shrink-0 h-8 w-8 flex items-center justify-center">
                  {getIcon(n.type)}
                </div>

                {/* Body */}
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-start mb-1">
                    <span className="font-semibold text-zinc-200">{n.title}</span>
                    <span className="text-[10px] font-mono text-zinc-600 shrink-0 ml-2">
                      {new Date(n.createdAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <p className="text-zinc-400 leading-relaxed">{n.message}</p>

                  {/* Team invite action buttons */}
                  {isInvite && (
                    <div className="mt-3">
                      {inviteStatus === 'accepted' || inviteStatus === 'declined' ? (
                        <span className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded
                          ${inviteStatus === 'accepted'
                            ? 'bg-emerald-500/10 text-emerald-400'
                            : 'bg-red-500/10 text-red-400'}`}
                        >
                          {inviteStatus === 'accepted'
                            ? <><Check size={11} /> Accepted</>
                            : <><X size={11} /> Declined</>}
                        </span>
                      ) : inviteHandled ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded bg-zinc-500/10 text-zinc-400">
                          <CheckCircle size={11} /> Invitation handled
                        </span>
                      ) : (
                        <div className="flex gap-2">
                          <button
                            onClick={(e) => { e.stopPropagation(); handleAccept(n); }}
                            className="flex items-center gap-1 bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-medium px-3 py-1.5 rounded transition-colors"
                          >
                            <Check size={11} />
                            Accept
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDecline(n); }}
                            className="flex items-center gap-1 bg-white/[0.06] hover:bg-white/[0.10] text-zinc-300 text-[11px] font-medium px-3 py-1.5 rounded transition-colors"
                          >
                            <X size={11} />
                            Decline
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Navigate hint for non-invite notifications */}
                  {!isInvite && (
                    <span className="inline-block mt-2 font-mono text-[9px] text-zinc-500 bg-white/[0.03] border border-white/[0.06] px-1.5 py-0.5 rounded hover:underline">
                      Inspect alert target event →
                    </span>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
