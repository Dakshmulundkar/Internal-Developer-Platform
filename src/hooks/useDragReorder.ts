import { useRef, useState } from 'react';

/**
 * Lightweight HTML5 native drag-to-reorder for lists of items.
 * No external dependencies. Persist the returned order however you like.
 */
export function useDragReorder<T extends { id: string }>(
  items: T[],
  onOrderChange: (next: T[]) => void,
) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const draggedId = useRef<string | null>(null);

  const onDragStart = (_e: React.DragEvent, index: number, id: string) => {
    draggedId.current = id;
    setDragIndex(index);
    setOverIndex(index);
    try {
      _e.dataTransfer.effectAllowed = 'move';
      _e.dataTransfer.setData('text/plain', id);
    } catch {
      /* dataTransfer not available (e.g. tests) */
    }
  };

  const onDragOver = (e: React.DragEvent, index: number) => {
    if (dragIndex === null) return;
    e.preventDefault(); // required to allow dropping
    e.dataTransfer.dropEffect = 'move';
    if (index !== overIndex) setOverIndex(index);
  };

  const onDragEnter = (e: React.DragEvent, index: number) => {
    if (dragIndex === null) return;
    e.preventDefault();
    if (index !== overIndex) setOverIndex(index);
  };

  const onDragLeave = () => {
    /* no-op; we keep the indicator until drop or dragend */
  };

  const onDrop = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (dragIndex === null) return;
    const from = dragIndex;
    const to = index;
    const next = [...items];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    onOrderChange(next);
    reset();
  };

  const onDragEnd = () => reset();

  const reset = () => {
    setDragIndex(null);
    setOverIndex(null);
    draggedId.current = null;
  };

  const isDragging = (index: number) => dragIndex === index;
  const isDropTarget = (index: number) => overIndex === index && dragIndex !== null && dragIndex !== index;

  return { onDragStart, onDragOver, onDragEnter, onDragLeave, onDrop, onDragEnd, isDragging, isDropTarget, dragIndex };
}

/** Human-readable relative time, e.g. "3m ago", "2h ago", "Jan 3". */
export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return '—';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '—';
  const diff = Date.now() - t;
  const sec = Math.floor(diff / 1000);
  if (sec < 45) return 'just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const days = Math.floor(hr / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

/** Next fire time for a 5-field cron expression (approx, looks ahead 8 days). */
export function nextCronRun(cron: string, from = new Date()): string {
  const parts = cron.trim().split(/\s+/);
  if (parts.length < 5) return '—';
  const [minStr, hourStr] = parts;

  const minuteSet = minStr === '*' ? null : minStr.split(',').map(Number);
  const hourSet = hourStr === '*' ? null : hourStr.split(',').map(Number);

  for (let day = 0; day < 8; day++) {
    const base = new Date(from);
    base.setDate(from.getDate() + day);
    base.setSeconds(0, 0);
    const mList = minuteSet ?? [0];
    if (hourSet) {
      for (const h of hourSet) {
        for (const m of mList) {
          const cand = new Date(base);
          cand.setHours(h, m, 0, 0);
          if (cand.getTime() > from.getTime()) return cand.toLocaleString();
        }
      }
    } else {
      for (const m of mList) {
        const cand = new Date(base);
        cand.setMinutes(m, 0, 0);
        if (cand.getTime() > from.getTime()) return cand.toLocaleString();
      }
    }
  }
  return '—';
}