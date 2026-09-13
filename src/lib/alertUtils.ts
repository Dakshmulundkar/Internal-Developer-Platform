/**
 * Shared utilities for alert source rendering.
 * Centralises the badge colour maps and label abbreviations that were
 * duplicated across ProjectDetails, Incidents, and DeploymentDetails.
 */

const SOURCE_COLORS: Record<string, string> = {
  grafana:  'bg-orange-500/10 text-orange-400 border border-orange-500/20',
  datadog:  'bg-purple-500/10 text-purple-400 border border-purple-500/20',
  newrelic: 'bg-green-500/10 text-green-400 border border-green-500/20',
  sentry:   'bg-violet-500/10 text-violet-400 border border-violet-500/20',
  vercel:   'bg-zinc-500/10 text-zinc-200 border border-zinc-500/20',
  netlify:  'bg-teal-500/10 text-teal-400 border border-teal-500/20',
  trivy:    'bg-red-500/10 text-red-400 border border-red-500/20',
};

const SOURCE_LABELS: Record<string, string> = {
  grafana:  'GF',
  datadog:  'DD',
  newrelic: 'NR',
  sentry:   'SN',
  vercel:   'VC',
  netlify:  'NF',
  trivy:    'TV',
};

/** Returns a Tailwind badge class string for the given alert source. */
export function alertSourceColor(source: string): string {
  return SOURCE_COLORS[source.toLowerCase()] ?? 'bg-zinc-500/10 text-zinc-400 border border-zinc-500/20';
}

/** Returns a short 2-letter abbreviation for the given alert source. */
export function alertSourceLabel(source: string): string {
  return SOURCE_LABELS[source.toLowerCase()] ?? source.slice(0, 2).toUpperCase();
}
