import React, { useState } from 'react';
import { usePlatform } from '../context/PlatformContext';
import { UserPlus, Check, X, ChevronDown, ChevronUp, AlertCircle } from 'lucide-react';
import type { TeamMember } from '../types/platform';

/**
 * InviteBanner — shown at the top of the page when the logged-in user has
 * one or more pending team invitations.
 *
 * Behaviour:
 * - In API mode: calls /team/{id}/accept or /team/{id}/decline with the
 *   invite_token. Backend updates team_members.status and marks the
 *   in-platform notification as read.
 * - In demo mode: updates local PlatformContext state only.
 */
export const InviteBanner: React.FC = () => {
  const { pendingInvites, acceptTeamInvite, declineTeamInvite, navigateTo } = usePlatform();

  const [expanded, setExpanded] = useState(true);
  const [processing, setProcessing] = useState<Record<string, 'accepting' | 'declining'>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  if (!pendingInvites || pendingInvites.length === 0) return null;

  const handleAccept = async (invite: TeamMember) => {
    setProcessing(p => ({ ...p, [invite.id]: 'accepting' }));
    setErrors(e => { const n = { ...e }; delete n[invite.id]; return n; });
    try {
      await acceptTeamInvite(invite.id, '', invite.inviteToken);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to accept invite';
      setErrors(e => ({ ...e, [invite.id]: msg }));
    } finally {
      setProcessing(p => { const n = { ...p }; delete n[invite.id]; return n; });
    }
  };

  const handleDecline = async (invite: TeamMember) => {
    setProcessing(p => ({ ...p, [invite.id]: 'declining' }));
    setErrors(e => { const n = { ...e }; delete n[invite.id]; return n; });
    try {
      await declineTeamInvite(invite.id, '', invite.inviteToken);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to decline invite';
      setErrors(e => ({ ...e, [invite.id]: msg }));
    } finally {
      setProcessing(p => { const n = { ...p }; delete n[invite.id]; return n; });
    }
  };

  const roleColor: Record<string, string> = {
    admin:     'text-violet-400 bg-violet-500/10 border-violet-500/20',
    developer: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
    viewer:    'text-zinc-400 bg-zinc-500/10 border-zinc-500/20',
  };

  return (
    <div className="bg-blue-950/40 border-b border-blue-500/20 px-6 py-0 z-20 relative">
      {/* Header row — always visible */}
      <button
        type="button"
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center justify-between py-2.5 text-left"
        aria-expanded={expanded}
      >
        <div className="flex items-center gap-2.5">
          <UserPlus size={14} className="text-blue-400 shrink-0" />
          <span className="text-xs font-semibold text-blue-300">
            {pendingInvites.length === 1
              ? 'You have 1 pending team invitation'
              : `You have ${pendingInvites.length} pending team invitations`}
          </span>
          <span className="w-5 h-5 rounded-full bg-blue-500 text-white text-[10px] font-bold flex items-center justify-center shrink-0">
            {pendingInvites.length}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={e => { e.stopPropagation(); navigateTo('settings'); }}
            className="text-[10px] text-blue-400 hover:text-blue-200 underline underline-offset-2 transition-colors"
          >
            Manage in Settings
          </button>
          {expanded
            ? <ChevronUp size={14} className="text-blue-500" />
            : <ChevronDown size={14} className="text-blue-500" />}
        </div>
      </button>

      {/* Expandable invite cards */}
      {expanded && (
        <div className="pb-3 space-y-2">
          {pendingInvites.map(invite => {
            const isBusy = Boolean(processing[invite.id]);
            const err = errors[invite.id];
            const projectLabel = invite.projectName || invite.projectId;
            const expiresAt = invite.inviteExpiresAt
              ? new Date(invite.inviteExpiresAt).toLocaleDateString([], { month: 'short', day: 'numeric' })
              : null;

            return (
              <div
                key={invite.id}
                className="flex items-center justify-between gap-4 bg-blue-950/40 border border-blue-500/20 rounded-lg px-4 py-2.5"
              >
                {/* Info */}
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-7 h-7 rounded-md bg-blue-500/10 border border-blue-500/20 flex items-center justify-center shrink-0">
                    <UserPlus size={13} className="text-blue-400" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-semibold text-zinc-100 truncate">
                        {projectLabel}
                      </span>
                      <span className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded border ${roleColor[invite.role] ?? roleColor.viewer}`}>
                        {invite.role.toUpperCase()}
                      </span>
                    </div>
                    {expiresAt && (
                      <p className="text-[10px] text-zinc-500 mt-0.5">
                        Expires {expiresAt}
                      </p>
                    )}
                    {err && (
                      <p className="text-[10px] text-red-400 flex items-center gap-1 mt-0.5">
                        <AlertCircle size={10} /> {err}
                      </p>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => handleAccept(invite)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 text-emerald-400 text-[11px] font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {processing[invite.id] === 'accepting' ? (
                      <span className="w-3 h-3 rounded-full border border-emerald-400 border-t-transparent animate-spin" />
                    ) : (
                      <Check size={12} strokeWidth={2.5} />
                    )}
                    Accept
                  </button>
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => handleDecline(invite)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.08] text-zinc-400 hover:text-zinc-200 text-[11px] font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {processing[invite.id] === 'declining' ? (
                      <span className="w-3 h-3 rounded-full border border-zinc-500 border-t-transparent animate-spin" />
                    ) : (
                      <X size={12} strokeWidth={2.5} />
                    )}
                    Decline
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
