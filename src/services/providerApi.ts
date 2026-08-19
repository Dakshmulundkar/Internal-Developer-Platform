import type { Deployment, DeploymentStatus, ProviderType } from '../types/platform';

/**
 * Service to fetch live deployment data and trigger rollback operations
 * via Vercel REST API and Netlify REST API when API tokens are provided.
 */

// Vercel API endpoints
export async function fetchVercelDeployments(apiToken: string, projectId?: string): Promise<Partial<Deployment>[]> {
  try {
    const url = projectId 
      ? `https://api.vercel.com/v6/deployments?projectId=${projectId}&limit=10`
      : 'https://api.vercel.com/v6/deployments?limit=10';
      
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${apiToken}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`Vercel API error: ${response.statusText}`);
    }

    const data = await response.json();
    const vercelDeploys = data.deployments || [];

    return vercelDeploys.map((d: any) => ({
      id: d.uid || d.id,
      version: d.meta?.githubCommitRef ? `commit-${d.meta.githubCommitSha?.slice(0, 7)}` : 'v1.0.0',
      status: mapVercelStatus(d.state || d.status),
      commitHash: d.meta?.githubCommitSha?.slice(0, 7) || 'a1b2c3d',
      commitMessage: d.meta?.githubCommitMessage || 'Deployment push',
      branch: d.meta?.githubCommitRef || 'main',
      author: d.meta?.githubCommitAuthorName || 'Developer',
      provider: 'vercel' as ProviderType,
      durationMs: (d.buildingAt && d.ready) ? (d.ready - d.buildingAt) : 45000,
      createdAt: new Date(d.created || Date.now()).toISOString(),
      url: d.url ? `https://${d.url}` : undefined,
    }));
  } catch (error) {
    console.warn('Vercel live fetch failed or unauthenticated, using fallback demonstration data:', error);
    return [];
  }
}

// Netlify API endpoints
export async function fetchNetlifyDeployments(apiToken: string, siteId: string): Promise<Partial<Deployment>[]> {
  try {
    const response = await fetch(`https://api.netlify.com/api/v1/sites/${siteId}/deploys?per_page=10`, {
      headers: {
        'Authorization': `Bearer ${apiToken}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`Netlify API error: ${response.statusText}`);
    }

    const netlifyDeploys = await response.json();

    return netlifyDeploys.map((d: any) => ({
      id: d.id,
      version: d.commit_ref ? `commit-${d.commit_ref.slice(0, 7)}` : 'v1.0.0',
      status: mapNetlifyStatus(d.state),
      commitHash: d.commit_ref?.slice(0, 7) || 'f4b3a12',
      commitMessage: d.title || 'Deployment commit',
      branch: d.branch || 'main',
      author: d.committer || 'Developer',
      provider: 'netlify' as ProviderType,
      durationMs: (d.deploy_time ? d.deploy_time * 1000 : 30000),
      createdAt: new Date(d.created_at || Date.now()).toISOString(),
      url: d.ssl_url || d.url,
      errorMessage: d.error_message || undefined
    }));
  } catch (error) {
    console.warn('Netlify live fetch failed or unauthenticated, using fallback demonstration data:', error);
    return [];
  }
}

// Rollback triggers
export async function triggerVercelRollbackApi(apiToken: string, projectId: string, deploymentId: string): Promise<boolean> {
  try {
    const res = await fetch(`https://api.vercel.com/v9/projects/${projectId}/alias`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ deploymentId })
    });
    return res.ok;
  } catch (e) {
    console.error('Vercel rollback API call failed:', e);
    return false;
  }
}

export async function triggerNetlifyRollbackApi(apiToken: string, siteId: string, deployId: string): Promise<boolean> {
  try {
    const res = await fetch(`https://api.netlify.com/api/v1/sites/${siteId}/deploys/${deployId}/restore`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiToken}`,
        'Content-Type': 'application/json'
      }
    });
    return res.ok;
  } catch (e) {
    console.error('Netlify rollback API call failed:', e);
    return false;
  }
}

function mapVercelStatus(state: string): DeploymentStatus {
  switch (state?.toUpperCase()) {
    case 'READY': return 'ready';
    case 'ERROR':
    case 'FAILED': return 'failed';
    case 'BUILDING':
    case 'INITIALIZING': return 'building';
    case 'CANCELED': return 'canceled';
    default: return 'queued';
  }
}

function mapNetlifyStatus(state: string): DeploymentStatus {
  switch (state?.toLowerCase()) {
    case 'ready': return 'ready';
    case 'error': return 'failed';
    case 'building':
    case 'uploading': return 'building';
    default: return 'queued';
  }
}
