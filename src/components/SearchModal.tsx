import React, { useCallback, useEffect, useRef, useState } from 'react';
import { usePlatform } from '../context/PlatformContext';
import { isApiAvailable, api } from '../services/api';
import { Search, X, AlertCircle, Rocket, Folder, RotateCcw, Loader } from 'lucide-react';

interface SearchResult {
  type: string;
  id: string;
  title?: string;
  description?: string;
  name?: string;
  status?: string;
  severity?: string;
  version?: string;
  [key: string]: unknown;
}

const TYPE_ICONS: Record<string, React.FC<{ size?: number; className?: string }>> = {
  incident: AlertCircle,
  deployment: Rocket,
  project: Folder,
  rollback: RotateCcw,
};

const TYPE_LABELS: Record<string, string> = {
  incident: 'Incident',
  deployment: 'Deployment',
  project: 'Project',
  rollback: 'Rollback',
};

export const SearchModal: React.FC = () => {
  const { navigateTo } = usePlatform();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<number | null>(null);

  // Global Ctrl+K / Cmd+K listener
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setOpen(prev => !prev);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Focus input on open
  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => inputRef.current?.focus());
      setQuery('');
      setResults([]);
      setTotal(0);
      setActiveIdx(0);
    }
  }, [open]);

  // Debounced search
  useEffect(() => {
    if (!open || !query.trim()) {
      setResults([]);
      setTotal(0);
      return;
    }
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(async () => {
      if (!isApiAvailable()) return;
      setLoading(true);
      try {
        const data = await api.search.search(query.trim());
        setResults(data.results as SearchResult[]);
        setTotal(data.total || 0);
        setActiveIdx(0);
      } catch (err) {
        console.warn('[SearchModal] search failed:', err);
        setResults([]);
        setTotal(0);
      } finally {
        setLoading(false);
      }
    }, 250);
  }, [query, open]);

  useEffect(() => () => { if (debounceRef.current) window.clearTimeout(debounceRef.current); }, []);

  const navigateToResult = useCallback((result: SearchResult) => {
    switch (result.type) {
      case 'incident':
        navigateTo('incidents', { incidentId: result.id });
        break;
      case 'deployment':
        navigateTo('deployment-details', { deploymentId: result.id });
        break;
      case 'project':
        navigateTo('project-details', { projectId: result.id });
        break;
      case 'rollback':
        navigateTo('rollback-recovery', { projectId: (result as Record<string, unknown>).project_id as string });
        break;
      default:
        break;
    }
    setOpen(false);
  }, [navigateTo]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { setOpen(false); return; }
    if (results.length === 0) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx(i => (i + 1) % results.length); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx(i => (i - 1 + results.length) % results.length); }
    else if (e.key === 'Enter') { e.preventDefault(); navigateToResult(results[activeIdx]); }
  };

  const resultTitle = (r: SearchResult) => r.title || r.name || String(r.id) || '(untitled)';

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] bg-black/70 backdrop-blur-sm"
      onClick={() => setOpen(false)}
    >
      <div
        className="w-full max-w-xl bg-[#0a0a0a] border border-white/[0.08] rounded-2xl shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-white/[0.06]">
          <Search size={16} className="text-zinc-500 shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search incidents, deployments, projects…"
            className="flex-1 bg-transparent text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none"
          />
          <kbd className="text-[9px] text-zinc-500 bg-white/[0.04] border border-white/[0.08] px-1.5 py-0.5 rounded font-mono">ESC</kbd>
        </div>

        {/* Results */}
        <div className="max-h-80 overflow-y-auto">
          {loading && (
            <div className="flex items-center gap-2 px-5 py-4 text-xs text-zinc-500">
              <Loader size={13} className="animate-spin" /> Searching…
            </div>
          )}

          {!loading && results.length === 0 && query.trim().length > 0 && (
            <div className="px-5 py-4 text-xs text-zinc-500">
              No results found for "{query.trim()}".
            </div>
          )}

          {!loading && !query.trim() && (
            <div className="px-5 py-4 text-[10px] text-zinc-600">
              Type to search across all projects, deployments, and incidents.
            </div>
          )}

          {results.map((result, idx) => {
            const Icon = TYPE_ICONS[result.type] || Search;
            return (
              <button
                key={result.id + idx}
                type="button"
                onClick={() => navigateToResult(result)}
                onMouseEnter={() => setActiveIdx(idx)}
                className={`w-full flex items-center gap-3 px-5 py-3 text-left transition-colors ${
                  idx === activeIdx ? 'bg-white/[0.04]' : ''
                }`}
              >
                <Icon size={15} className="text-zinc-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-zinc-200 truncate">{resultTitle(result)}</span>
                    <span className="text-[9px] font-mono text-zinc-500 uppercase bg-white/[0.04] border border-white/[0.08] px-1.5 py-0.5 rounded shrink-0">
                      {TYPE_LABELS[result.type] || result.type}
                    </span>
                  </div>
                  {result.description && (
                    <p className="text-[10px] text-zinc-500 truncate mt-0.5">{result.description}</p>
                  )}
                </div>
                {result.status && (
                  <span className="text-[9px] font-mono text-zinc-500 shrink-0">{result.status}</span>
                )}
              </button>
            );
          })}
        </div>

        {/* Footer */}
        {total > 0 && (
          <div className="px-5 py-2 border-t border-white/[0.06] text-[9px] text-zinc-600">
            {total} result{total !== 1 ? 's' : ''} found
          </div>
        )}
      </div>
    </div>
  );
};