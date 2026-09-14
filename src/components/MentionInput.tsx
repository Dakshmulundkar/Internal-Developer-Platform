import React, { useCallback, useEffect, useRef, useState } from 'react';
import { isApiAvailable, api } from '../services/api';

export interface MentionCandidate {
  name: string;
  email: string;
  avatarUrl?: string;
}

interface MentionInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  className?: string;
  /** Fallback user list used when the API is unavailable (demo mode). */
  fallbackUsers?: MentionCandidate[];
}

const MENTION_RE = /@([a-zA-Z0-9_.-]*)$/;

/**
 * Textarea that surfaces an @mention autocomplete dropdown.
 * Fetches team members via the `/team/search` API when available,
 * otherwise filters the provided fallbackUsers list.
 */
export const MentionInput: React.FC<MentionInputProps> = ({
  value,
  onChange,
  placeholder,
  rows = 3,
  className,
  fallbackUsers = [],
}) => {
  const [suggestions, setSuggestions] = useState<MentionCandidate[]>([]);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIdx, setActiveIdx] = useState(0);
  const [mentionStart, setMentionStart] = useState<number | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const debounceRef = useRef<number | null>(null);

  const detectMention = useCallback((text: string, caret: number) => {
    const before = text.slice(0, caret);
    const match = before.match(MENTION_RE);
    if (!match) {
      setOpen(false);
      setMentionStart(null);
      return;
    }
    setQuery(match[1]);
    setMentionStart(caret - match[0].length);
    setActiveIdx(0);
    setOpen(true);
  }, []);

  const applySuggestion = useCallback(
    (candidate: MentionCandidate) => {
      if (mentionStart === null) return;
      const before = value.slice(0, mentionStart);
      const after = value.slice(caretRef.current);
      const next = `${before}@${candidate.name.replace(/[^a-zA-Z0-9_.-]/g, '')} ${after}`;
      onChange(next);
      setOpen(false);
      setMentionStart(null);
      // refocus and place caret after inserted mention
      requestAnimationFrame(() => {
        const el = textareaRef.current;
        if (el) {
          el.focus();
          const pos = (mentionStart ?? 0) + candidate.name.length + 2;
          el.setSelectionRange(pos, pos);
        }
      });
    },
    [mentionStart, value, onChange],
  );

  // Track current caret position for applySuggestion
  const caretRef = useRef(0);

  useEffect(() => {
    const el = textareaRef.current;
    const onSelect = () => {
      if (el) caretRef.current = el.selectionStart ?? 0;
    };
    if (el) {
      el.addEventListener('select', onSelect);
      el.addEventListener('click', onSelect);
    }
    return () => {
      el?.removeEventListener('select', onSelect);
      el?.removeEventListener('click', onSelect);
    };
  }, []);

  useEffect(() => {
    if (!open || query.length === 0) return;

    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(async () => {
      try {
        if (isApiAvailable()) {
          const users = await api.team.searchUsers(query);
          setSuggestions(
            users.map(u => ({
              name: u.name || u.email.split('@')[0],
              email: u.email,
              avatarUrl: u.avatar_url,
            })),
          );
        } else {
          const q = query.toLowerCase();
          setSuggestions(
            fallbackUsers.filter(
              u => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q),
            ),
          );
        }
      } catch (err) {
        console.warn('[MentionInput] suggestion fetch failed:', err);
        setSuggestions([]);
      }
    }, 200);
  }, [query, open, fallbackUsers]);

  useEffect(() => () => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
  }, []);

  const onKeyDown = (e: React.KeyboardEvent) => {
    caretRef.current = (e.target as HTMLTextAreaElement).selectionStart ?? 0;

    if (open && suggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIdx(i => (i + 1) % suggestions.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIdx(i => (i - 1 + suggestions.length) % suggestions.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        applySuggestion(suggestions[activeIdx]);
        return;
      }
      if (e.key === 'Escape') {
        setOpen(false);
        return;
      }
    }
  };

  return (
    <div className="relative">
      <textarea
        ref={textareaRef}
        rows={rows}
        value={value}
        onChange={e => {
          const el = e.target;
          caretRef.current = el.selectionStart ?? 0;
          onChange(e.target.value);
          detectMention(e.target.value, caretRef.current);
        }}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        className={className}
      />

      {open && suggestions.length > 0 && (
        <div className="absolute left-0 right-0 bottom-full mb-1.5 z-20 bg-dark-900 glass border border-white/[0.08] rounded-lg shadow-xl py-1 max-h-44 overflow-y-auto">
          <div className="px-3 py-1 text-[9px] uppercase tracking-wider text-zinc-600 font-bold">
            Mention a teammate
          </div>
          {suggestions.map((s, i) => (
            <button
              key={s.email}
              type="button"
              onMouseDown={e => e.preventDefault()}
              onClick={() => applySuggestion(s)}
              onMouseEnter={() => setActiveIdx(i)}
              className={`w-full flex items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors ${
                i === activeIdx ? 'bg-white/[0.06]' : ''
              }`}
            >
              {s.avatarUrl ? (
                <img src={s.avatarUrl} alt="" className="w-5 h-5 rounded-full border border-white/[0.06]" />
              ) : (
                <span className="w-5 h-5 rounded-full bg-gradient-to-tr from-zinc-700 to-zinc-400 flex items-center justify-center text-[9px] font-bold text-white shrink-0">
                  {s.name.slice(0, 2).toUpperCase()}
                </span>
              )}
              <span className="text-zinc-200 font-medium">{s.name}</span>
              <span className="text-zinc-600 font-mono text-[10px] ml-auto">{s.email}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};