import React, { useEffect, useState } from 'react';
import { isApiAvailable, api } from '../services/api';
import {
  AlertTriangle, RefreshCw, MessageSquare, RotateCcw, XCircle, Zap,
  Rocket, Send, UserPlus, Loader,
} from 'lucide-react';

export type ActivityItem = {
  id: string;
  entity_type: string;
  entity_id: string;
  user_id: string | null;
  user_name: string | null;
  action: string;
  description: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

export type EntityActivityType = 'project' | 'deployment' | 'incident' | 'rollback';

interface ActivityFeedProps {
  entityType: EntityActivityType;
  entityId: string;
  limit?: number;
  className?: string;
  /** Render a compact horizontal list instead of the vertical timeline. */
  compact?: boolean;
}

const ACTION_ICONS: Record<string, { Icon: typeof Zap; color: string; label: string }> = {
  auto_created:      { Icon: AlertTriangle, color: 'text-red-400',   label: 'Created' },
  created:           { Icon: Rocket,        color: 'text-emerald-400', label: 'Created' },
  status_change:     { Icon: RefreshCw,     color: 'text-blue-400',  label: 'Status change' },
  status_changed:    { Icon: RefreshCw,     color: 'text-blue-400',  label: 'Status change' },
  comment:           { Icon: MessageSquare, color: 'text-zinc-400',  label: 'Comment' },
  rollback_initiated:{ Icon: RotateCcw,     color: 'text-purple-400', label: 'Rollback started' },
  failed:            { Icon: XCircle,       color: 'text-red-400',   label: 'Failed' },
  deploy:            { Icon: Rocket,        color: 'text-emerald-400', label: 'Deployed' },
  assigned:          { Icon: UserPlus,      color: 'text-amber-400', label: 'Assigned' },
};

const DEFAULT_ACTION = { Icon: Zap, color: 'text-zinc-400', label: 'Activity' };

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return '';
  const diff = Date.now() - then;
  const mins = Math.round(diff / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

export const ActivityFeed: React.FC<ActivityFeedProps> = ({
  entityType,
  entityId,
  limit = 30,
  className,
  compact = false,
}) => {
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    if (!isApiAvailable()) {
      setLoading(false);
      return;
    }

    api.activities
      .list(entityType, entityId, limit)
      .then(data => {
        if (!cancelled) setItems(data as ActivityItem[]);
      })
      .catch(err => console.warn('[ActivityFeed] fetch failed:', err))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [entityType, entityId, limit]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-xs text-zinc-500 py-4">
        <Loader size={13} className="animate-spin" /> Loading activity…
      </div>
    );
  }

  if (items.length === 0) {
    return <p className="text-xs text-zinc-600 italic py-2">No activity recorded yet.</p>;
  }

  if (compact) {
    const recent = items.slice(0, 4);
    return (
      <div className={`space-y-2 ${className ?? ''}`}>
        {recent.map(item => {
          const { Icon, color } = ACTION_ICONS[item.action] || DEFAULT_ACTION;
          return (
            <div key={item.id} className="flex items-center gap-2 text-[11px]">
              <Icon size={11} className={color} />
              <span className="text-zinc-400 truncate">{item.description || item.action}</span>
              <span className="ml-auto text-[9px] text-zinc-600 font-mono shrink-0">
                {relativeTime(item.created_at)}
              </span>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className={className ?? ''}>
      {items.map((item, idx) => {
        const isLast = idx === items.length - 1;
        const { Icon, color } = ACTION_ICONS[item.action] || DEFAULT_ACTION;
        return (
          <div key={item.id} className="relative flex gap-3 pb-4 items-start">
            {!isLast && <div className="absolute left-3 top-6 bottom-0 w-px bg-white/[0.06]" />}
            <div className="w-6 h-6 rounded-full border border-white/[0.08] bg-white/[0.03] flex items-center justify-center shrink-0 z-10">
              <Icon size={10} className={color} />
            </div>
            <div className="flex-1 pt-0.5">
              <div className="flex items-center gap-2">
                {item.user_name && item.user_name !== 'system' && (
                  <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">{item.user_name}</span>
                )}
                <span className="text-xs text-zinc-300 leading-relaxed">{item.description || item.action}</span>
                <span className="ml-auto text-[10px] text-zinc-600 font-mono shrink-0">
                  {relativeTime(item.created_at)}
                </span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};