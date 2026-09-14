import React, { useEffect, useState } from 'react';
import { isApiAvailable, api } from '../services/api';
import { X, Copy, Check, Link2, Trash2, Eye, ExternalLink, Share2 } from 'lucide-react';

interface ShareLink {
  id: string;
  entity_type: string;
  entity_id: string;
  token: string;
  url?: string;
  expires_at: string | null;
  access_count: number;
  last_accessed_at: string | null;
  revoked: boolean;
  created_at: string;
}

interface ShareDialogProps {
  entityType: 'incident' | 'deployment' | 'project';
  entityId: string;
  entityName?: string;
  onClose: () => void;
}

const BASE_ORIGIN = typeof window !== 'undefined' ? window.location.origin : '';
const DEFAULT_EXPIRY = 7;

export const ShareDialog: React.FC<ShareDialogProps> = ({ entityType, entityId, entityName, onClose }) => {
  const [links, setLinks] = useState<ShareLink[]>([]);
  const [expiry, setExpiry] = useState<number>(DEFAULT_EXPIRY);
  const [withPassword, setWithPassword] = useState(false);
  const [password, setPassword] = useState('');
  const [copied, setCopied] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  const publicUrl = (link: ShareLink) => link.url || `${BASE_ORIGIN}/share/${entityType}/${entityId}?token=${link.token}`;

  const load = async () => {
    if (!isApiAvailable()) return;
    try {
      const mine = (await api.sharing.mine()) as ShareLink[];
      setLinks(mine.filter(l => !l.revoked && l.entity_type === entityType && l.entity_id === entityId));
    } catch (err) {
      console.warn('[Share] load failed:', err);
    }
  };

  useEffect(() => { load(); }, [entityType, entityId]);

  const handleCreate = async () => {
    if (withPassword && password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    setError('');
    setCreating(true);
    try {
      await api.sharing.create({
        entity_type: entityType,
        entity_id: entityId,
        expires_in_days: expiry > 0 ? expiry : null,
        password: withPassword ? password : null,
      });
      setWithPassword(false);
      setPassword('');
      await load();
    } catch (err: any) {
      setError(err?.message || 'Failed to create share link.');
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = async (linkId: string) => {
    try {
      await api.sharing.revoke(linkId);
      setLinks(prev => prev.filter(l => l.id !== linkId));
    } catch (err) {
      console.warn('[Share] revoke failed:', err);
    }
  };

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(id);
      setTimeout(() => setCopied(null), 1500);
    });
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-dark-900 glass border border-white/[0.08] rounded-2xl w-[460px] max-w-[95vw] overflow-hidden shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06] bg-white/[0.02]">
          <div className="flex items-center gap-2.5">
            <span className="w-7 h-7 rounded-lg bg-gradient-to-br from-cyan-500/20 to-blue-500/10 border border-cyan-500/20 flex items-center justify-center">
              <Share2 size={13} className="text-cyan-300" />
            </span>
            <div>
              <h3 className="text-sm font-semibold text-white">Share {entityType}</h3>
              {entityName && <p className="text-[10px] text-zinc-500 max-w-[280px] truncate">{entityName}</p>}
            </div>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300"><X size={16} /></button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {error && <div className="bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs rounded-lg p-3">{error}</div>}

          {/* Existing links */}
          {links.length > 0 && (
            <div className="space-y-2">
              <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">Active links</p>
              {links.map(link => (
                <div key={link.id} className="flex items-center gap-2 bg-white/[0.02] border border-white/[0.06] rounded-lg p-2.5">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 text-[10px] font-mono text-zinc-300 truncate">
                      <Link2 size={11} className="text-zinc-600 shrink-0" />
                      <span className="truncate">{publicUrl(link)}</span>
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-[9px] text-zinc-600">
                      <span>{link.expires_at ? `expires ${new Date(link.expires_at).toLocaleDateString()}` : 'never expires'}</span>
                      <span className="flex items-center gap-1"><Eye size={9} /> {link.access_count} views</span>
                    </div>
                  </div>
                  <a href={publicUrl(link)} target="_blank" rel="noreferrer"
                    className="p-1.5 text-zinc-500 hover:text-zinc-200 rounded transition-all"><ExternalLink size={13} /></a>
                  <button onClick={() => handleCopy(publicUrl(link), link.id)}
                    className="p-1.5 text-zinc-500 hover:text-zinc-200 rounded transition-all">
                    {copied === link.id ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
                  </button>
                  <button onClick={() => handleRevoke(link.id)}
                    className="p-1.5 text-zinc-500 hover:text-red-400 rounded transition-all"><Trash2 size={13} /></button>
                </div>
              ))}
            </div>
          )}

          {/* Create new */}
          <div className="space-y-3">
            <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">New link</p>
            <div className="flex items-center gap-2">
              <label className="text-[10px] text-zinc-400 w-20 shrink-0">Expires in</label>
              <select value={expiry} onChange={e => setExpiry(Number(e.target.value))}
                className="flex-1 bg-black/30 border border-white/[0.07] text-zinc-300 rounded-lg py-2 px-3 text-xs focus:outline-none focus:border-cyan-400/40">
                <option value={1}>1 day</option>
                <option value={7}>7 days</option>
                <option value={30}>30 days</option>
                <option value={90}>90 days</option>
                <option value={0}>Never</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="pw" checked={withPassword} onChange={e => setWithPassword(e.target.checked)}
                className="w-4 h-4 bg-black/30 border-white/[0.06] rounded" />
              <label htmlFor="pw" className="text-[10px] text-zinc-400">Require password</label>
              {withPassword && (
                <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                  placeholder="Password"
                  className="flex-1 bg-black/30 border border-white/[0.07] text-zinc-100 placeholder-zinc-600 focus:border-cyan-400/40 focus:outline-none rounded-lg py-1.5 px-3 text-xs" />
              )}
            </div>
            <button onClick={handleCreate} disabled={creating}
              className="w-full py-2 rounded-lg bg-white text-black hover:bg-zinc-200 text-xs font-semibold transition-all disabled:opacity-50">
              {creating ? 'Creating…' : 'Generate share link'}
            </button>
            {!isApiAvailable() && (
              <p className="text-[9px] text-zinc-600 text-center">Share links require the backend (VITE_API_URL).</p>
            )}
          </div>
        </div>

        <div className="px-6 py-3 border-t border-white/[0.06] bg-white/[0.02] text-[9px] text-zinc-600">
          Anyone with the link can view this {entityType} read-only. See Sharing in the backend API docs for token endpoints.
        </div>
      </div>
    </div>
  );
};

export default ShareDialog;