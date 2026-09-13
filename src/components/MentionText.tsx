import React from 'react';

interface MentionTextProps {
  content: string;
  className?: string;
}

const MENTION_RE = /@([a-zA-Z0-9_.-]+)/g;

/** Renders raw text with @mentions highlighted (does not fetch user data). */
export const MentionText: React.FC<MentionTextProps> = ({ content, className }) => {
  let lastIndex = 0;
  let key = 0;
  const parts: React.ReactNode[] = [];

  for (const match of content.matchAll(MENTION_RE)) {
    const index = match.index ?? 0;
    if (index > lastIndex) parts.push(content.slice(lastIndex, index));
    parts.push(
      <span key={`m${key}`} className="text-blue-400 font-medium bg-blue-500/10 rounded px-0.5">
        {match[0]}
      </span>,
    );
    key += 1;
    lastIndex = index + match[0].length;
  }

  if (lastIndex < content.length) parts.push(content.slice(lastIndex));

  return <span className={className}>{parts.length > 0 ? parts : content}</span>;
};