import React, { useCallback, useEffect, useRef, useState } from 'react';
import { usePlatform } from '../context/PlatformContext';
import { isApiAvailable, api } from '../services/api';
import { timeAgo } from '../hooks/useDragReorder';
import { MentionInput, type MentionCandidate } from './MentionInput';
import { MentionText } from './MentionText';
import { Paperclip, Send, X, File, Loader, Trash2, Pencil, Check, AlertCircle } from 'lucide-react';

export interface CommentAttachment {
  id?: string;
  filename: string;
  file_url: string;
  file_size?: number;
  mime_type?: string;
}

export interface CommentItem {
  id: string;
  userId: string;
  userName: string;
  userAvatar?: string;
  content: string;
  createdAt: string;
  edited?: boolean;
  attachments?: CommentAttachment[];
}

interface PendingFile {
  key: string;
  file: File;
}

interface CommentSectionProps {
  entityType: 'deployment' | 'rollback' | 'project';
  entityId: string;
  /** Comments used when the API is unavailable (demo mode). */
  demoComments?: CommentItem[];
  /** Called in demo mode when a comment is submitted. */
  onDemoComment?: (content: string) => void;
  placeholder?: string;
  disableInput?: boolean;
  /** Team members passed for `@mention` autocomplete in demo mode. */
  mentionCandidates?: MentionCandidate[];
}

export const CommentSection: React.FC<CommentSectionProps> = ({
  entityType,
  entityId,
  demoComments = [],
  onDemoComment,
  placeholder = 'Write a comment (use @ to mention someone)',
  disableInput = false,
  mentionCandidates = [],
}) => {
  const { user, teamMembers } = usePlatform();
  const [comments, setComments] = useState<CommentItem[]>([]);
  const [loading, setLoading] = useState(isApiAvailable());
  const [text, setText] = useState('');
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const candidates: MentionCandidate[] =
    mentionCandidates.length > 0
      ? mentionCandidates
      : teamMembers.map(m => ({ name: m.name, email: m.email, avatarUrl: m.avatarUrl }));

  useEffect(() => {
    if (!isApiAvailable()) {
      setComments(demoComments);
      return;
    }
    setLoading(true);
    api.comments
      .list(entityType, entityId)
      .then(data => setComments((data || []) as CommentItem[]))
      .catch(err => console.warn('[CommentSection] load failed:', err))
      .finally(() => setLoading(false));
  }, [entityType, entityId]);

  useEffect(() => {
    if (demoComments && (!isApiAvailable())) setComments(demoComments);
  }, [demoComments]);

  const addFiles = (files: FileList | null) => {
    if (!files) return;
    const next = Array.from(files).filter(f => {
      if (f.size > 10 * 1024 * 1024) {
        setError('File exceeds 10 MB limit');
        return false;
      }
      return true;
    });
    setPendingFiles(prev => [...prev, ...next.map(f => ({ key: `${Date.now()}-${f.name}`, file: f }))]);
  };

  const submit = async () => {
    if (submitting) return;
    if (!text.trim() && pendingFiles.length === 0) return;
    setSubmitting(true);
    setError(null);

    try {
      if (isApiAvailable()) {
        // 1) Create the comment, then attach files to it (comment row exists first).
        let comment: Record<string, unknown> | null = null;
        if (text.trim()) {
          comment = await api.comments.add(entityType, entityId, text.trim());
        }

        const attachments: CommentAttachment[] = [];
        for (const pf of pendingFiles) {
          try {
            const up = await api.upload.uploadFile(pf.file, (comment?.id as string) || undefined, entityType);
            attachments.push({
              id: up.id,
              filename: up.filename,
              file_url: up.file_url,
              file_size: up.file_size,
              mime_type: up.mime_type,
            });
          } catch (err) {
            console.warn('[CommentSection] attachment upload failed:', err);
          }
        }

        if (comment) {
          setComments(prev => [
            {
              id: comment.id as string,
              userId: comment.user_id as string || user?.id || '',
              userName: comment.user_name as string || user?.name || 'User',
              userAvatar: user?.avatarUrl,
              content: comment.content as string || text,
              createdAt: comment.created_at as string || new Date().toISOString(),
              attachments,
            },
            ...prev,
          ]);
        } else if (attachments.length > 0) {
          // Files-only comment (backend requires content; simulate locally).
          setComments(prev => [
            {
              id: 'c_' + Math.random().toString(36).substr(2, 9),
              userId: user?.id || '',
              userName: user?.name || 'User',
              userAvatar: user?.avatarUrl,
              content: '',
              createdAt: new Date().toISOString(),
              attachments,
            },
            ...prev,
          ]);
        }
      } else {
        onDemoComment?.(text.trim());
        setComments(prev => [
          {
            id: 'c_' + Math.random().toString(36).substr(2, 9),
            userId: user?.id || '',
            userName: user?.name || 'User',
            userAvatar: user?.avatarUrl,
            content: text.trim(),
            createdAt: new Date().toISOString(),
            attachments: pendingFiles.map(f => ({ filename: f.file.name, file_url: URL.createObjectURL(f.file) })),
          },
          ...prev,
        ]);
      }

      setText('');
      setPendingFiles([]);
    } catch (err) {
      console.error('[CommentSection] submit failed:', err);
      setError('Failed to submit comment.');
    } finally {
      setSubmitting(false);
    }
  };

  const beginEdit = (comment: CommentItem) => {
    setEditingId(comment.id);
    setEditingText(comment.content);
  };

  const saveEdit = async () => {
    if (!editingId) return;
    if (isApiAvailable()) {
      try {
        await api.comments.update(entityType, entityId, editingId, editingText.trim());
      } catch (err) {
        console.error('[CommentSection] edit failed:', err);
        setEditingId(null);
        return;
      }
    }
    setComments(prev =>
      prev.map(c => (c.id === editingId ? { ...c, content: editingText.trim(), edited: true } : c)),
    );
    setEditingId(null);
  };

  const removeComment = async (commentId: string) => {
    if (isApiAvailable()) {
      try {
        await api.comments.delete(entityType, entityId, commentId);
      } catch (err) {
        console.error('[CommentSection] delete failed:', err);
        return;
      }
    }
    setComments(prev => prev.filter(c => c.id !== commentId));
  };

  const isOwn = (comment: CommentItem) => user && (comment.userId === user.id || comment.userName === user.name);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-xs text-zinc-500 py-3">
        <Loader size={13} className="animate-spin" /> Loading comments…
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Comment list */}
      {comments.map(comment => (
        <div
          key={comment.id}
          className="flex gap-2.5 bg-white/[0.02] border border-white/[0.06] rounded-lg p-3"
        >
          {comment.userAvatar ? (
            <img src={comment.userAvatar} alt="" className="w-6 h-6 rounded-full border border-white/[0.06] shrink-0" />
          ) : (
            <span className="w-6 h-6 rounded-full bg-gradient-to-tr from-zinc-700 to-zinc-400 flex items-center justify-center text-[9px] font-bold text-white shrink-0">
              {comment.userName.slice(0, 2).toUpperCase()}
            </span>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <span className="text-xs font-semibold text-zinc-200">{comment.userName}</span>
              {comment.edited && <span className="text-[9px] text-zinc-600">· edited</span>}
              <span className="ml-auto text-[10px] text-zinc-600 font-mono"> {timeAgo(comment.createdAt)}</span>
              {isOwn(comment) && (
                <span className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => (editingId === comment.id ? saveEdit() : beginEdit(comment))}
                    className="text-zinc-600 hover:text-zinc-300 transition-colors"
                    title={editingId === comment.id ? 'Save' : 'Edit'}
                  >
                    {editingId === comment.id ? <Check size={12} /> : <Pencil size={12} />}
                  </button>
                  <button
                    onClick={() => { if (window.confirm('Delete this comment?')) removeComment(comment.id); }}
                    className="text-zinc-600 hover:text-red-400 transition-colors"
                    title="Delete"
                  >
                    <Trash2 size={12} />
                  </button>
                </span>
              )}
            </div>

            {editingId === comment.id ? (
              <div className="space-y-1.5">
                <MentionInput
                  value={editingText}
                  onChange={setEditingText}
                  rows={2}
                  className="w-full bg-black/30 border border-white/[0.06] text-zinc-100 placeholder-zinc-600 focus:border-white/20 focus:outline-none rounded-md p-2 text-xs resize-none"
                />
                <div className="flex gap-2">
                  <button onClick={saveEdit} className="text-xs text-emerald-400 hover:text-emerald-300">Save</button>
                  <button onClick={() => setEditingId(null)} className="text-xs text-zinc-500 hover:text-zinc-300">Cancel</button>
                </div>
              </div>
            ) : (
              <>
                {comment.content ? (
                  <p className="text-xs text-zinc-300 leading-relaxed whitespace-pre-wrap break-words">
                    <MentionText content={comment.content} />
                  </p>
                ) : (
                  <p className="text-[10px] text-zinc-600 italic">Comment with attachment only</p>
                )}
                {comment.attachments && comment.attachments.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-1.5">
                    {comment.attachments.map((att, i) => (
                      <a
                        key={att.filename + i}
                        href={att.file_url}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-1.5 text-[10px] font-mono text-blue-400 bg-blue-500/[0.06] border border-blue-500/10 rounded px-2 py-1 hover:bg-blue-500/10"
                      >
                        <File size={11} />
                        {att.filename}
                      </a>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      ))}

      {comments.length === 0 && (
        <p className="text-xs text-zinc-600 italic">No comments yet.</p>
      )}

      {/* Composer */}
      {!disableInput && (
        <div
          className={`border border-dashed transition-colors rounded-lg p-3 space-y-2 ${
            dragging ? 'border-white/30 bg-white/[0.03]' : 'border-white/[0.08]'
          }`}
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={e => { e.preventDefault(); setDragging(false); addFiles(e.dataTransfer.files); }}
        >
          <MentionInput
            value={text}
            onChange={setText}
            rows={3}
            placeholder={placeholder}
            fallbackUsers={candidates}
            className="w-full bg-black/30 border border-white/[0.06] text-zinc-100 placeholder-zinc-600 focus:border-white/20 focus:outline-none rounded-lg p-3 text-xs resize-none"
          />

          {pendingFiles.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {pendingFiles.map(pf => (
                <span key={pf.key} className="flex items-center gap-1.5 text-[10px] font-mono text-zinc-300 bg-white/[0.04] border border-white/[0.08] rounded px-2 py-1">
                  <Paperclip size={10} className="text-zinc-500" />
                  {pf.file.name}
                  <span className="text-zinc-600">({Math.round(pf.file.size / 1024)} KB)</span>
                  <button onClick={() => setPendingFiles(prev => prev.filter(f => f.key !== pf.key))} className="text-zinc-500 hover:text-red-400">
                    <X size={11} />
                  </button>
                </span>
              ))}
            </div>
          )}

          {error && (
            <div className="flex items-center gap-1.5 text-[10px] text-red-400">
              <AlertCircle size={11} /> {error}
            </div>
          )}

          <div className="flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={e => { addFiles(e.target.files); e.target.value = ''; }}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="text-[10px] flex items-center gap-1.5 text-zinc-400 hover:text-zinc-200 border border-white/[0.06] hover:border-white/15 bg-white/[0.02] px-2.5 py-1.5 rounded transition-all"
            >
              <Paperclip size={11} /> Attach
            </button>
            <button
              onClick={submit}
              disabled={submitting || (!text.trim() && pendingFiles.length === 0)}
              className="ml-auto bg-white text-black hover:bg-zinc-200 font-medium text-xs px-4 py-1.5 rounded-lg transition-all flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {submitting ? <Loader size={12} className="animate-spin" /> : <Send size={12} />} Submit
            </button>
          </div>
        </div>
      )}
    </div>
  );
};