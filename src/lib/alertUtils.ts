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
  uptimerobot: 'bg-green-500/10 text-green-400 border border-green-500/20',
  rollbar:  'bg-red-500/10 text-red-400 border border-red-500/20',
  bugsnag:  'bg-pink-500/10 text-pink-400 border border-pink-500/20',
  pagerduty: 'bg-green-500/10 text-green-400 border border-green-500/20',
  opsgenie: 'bg-blue-500/10 text-blue-400 border border-blue-500/20',
  prometheus: 'bg-orange-500/10 text-orange-400 border border-orange-500/20',
  elastic:  'bg-blue-500/10 text-blue-300 border border-blue-500/20',
  dynatrace: 'bg-teal-500/10 text-teal-400 border border-teal-500/20',
  honeycomb: 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20',
  statuspage: 'bg-blue-500/10 text-blue-400 border border-blue-500/20',
  victorops: 'bg-green-500/10 text-green-400 border border-green-500/20',
  sonarqube: 'bg-blue-500/10 text-blue-400 border border-blue-500/20',
  snyk:     'bg-violet-500/10 text-violet-400 border border-violet-500/20',
  argocd:   'bg-orange-500/10 text-orange-400 border border-orange-500/20',
  raygun:   'bg-orange-500/10 text-orange-400 border border-orange-500/20',
  airbrake: 'bg-red-500/10 text-red-400 border border-red-500/20',
  kubernetes: 'bg-blue-500/10 text-blue-400 border border-blue-500/20',
  cloudwatch: 'bg-amber-500/10 text-amber-400 border border-amber-500/20',
};

const SOURCE_LABELS: Record<string, string> = {
  grafana:  'GF',
  datadog:  'DD',
  newrelic: 'NR',
  sentry:   'SN',
  vercel:   'VC',
  netlify:  'NF',
  trivy:    'TV',
  uptimerobot: 'UR',
  rollbar:  'RB',
  bugsnag:  'BG',
  pagerduty: 'PD',
  opsgenie: 'OG',
  prometheus: 'PM',
  elastic:  'EL',
  dynatrace: 'DT',
  honeycomb: 'HC',
  statuspage: 'SP',
  victorops: 'VO',
  sonarqube: 'SQ',
  snyk:     'SK',
  argocd:   'AC',
  raygun:   'RG',
  airbrake: 'AB',
  kubernetes: 'K8',
  cloudwatch: 'CW',
};

/** Returns a Tailwind badge class string for the given alert source. */
export function alertSourceColor(source: string): string {
  return SOURCE_COLORS[source.toLowerCase()] ?? 'bg-zinc-500/10 text-zinc-400 border border-zinc-500/20';
}

/** Returns a short 2-letter abbreviation for the given alert source. */
export function alertSourceLabel(source: string): string {
  return SOURCE_LABELS[source.toLowerCase()] ?? source.slice(0, 2).toUpperCase();
}
