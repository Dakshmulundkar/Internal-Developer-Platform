"""Adapter registry + legacy ID normalization.

Canonical plugin IDs are the frontend definition IDs (`plugin-*`).
Rows seeded before unification used short IDs (`vercel`, `grafana`, …) and a
`ci_cd` category that no longer exists — normalized on read.
"""

from .adapters import (
    DatadogAdapter,
    GenericAdapter,
    GitHubAdapter,
    GrafanaAdapter,
    NewRelicAdapter,
    SentryAdapter,
    VercelAdapter,
)
from .monitoring_adapters import (
    DynatraceAdapter,
    ElasticAdapter,
    HoneycombAdapter,
    NetlifyAdapter,
    PrometheusAdapter,
    SnykAdapter,
    SonarQubeAdapter,
    StatuspageAdapter,
    VictorOpsAdapter,
)
from .cicd_adapters import (
    AirbrakeAdapter,
    ArgoCDAdapter,
    AzurePipelinesAdapter,
    AzureReposAdapter,
    HerokuAdapter,
    JenkinsAdapter,
    RaygunAdapter,
    TeamCityAdapter,
    TerraformAdapter,
    TravisCIAdapter,
)
from .cloud_adapters import (
    CloudWatchAdapter,
    CodeDeployAdapter,
    GCPDeployAdapter,
    KubernetesAdapter,
)
from .collab_adapters import (
    SlackAdapter,
    TeamsAdapter,
)
from .rest_adapters import (
    BitbucketAdapter,
    BugsnagAdapter,
    CircleCIAdapter,
    DiscordAdapter,
    GitLabAdapter,
    JiraAdapter,
    LinearAdapter,
    OpsGenieAdapter,
    PagerDutyAdapter,
    RailwayAdapter,
    RenderAdapter,
    RollbarAdapter,
    UptimeRobotAdapter,
)
from .base import BaseAdapter

_ADAPTERS: list[BaseAdapter] = [
    GrafanaAdapter(),
    VercelAdapter(),
    GitHubAdapter(),
    SentryAdapter(),
    DatadogAdapter(),
    NewRelicAdapter(),
    UptimeRobotAdapter(),
    RollbarAdapter(),
    BugsnagAdapter(),
    PagerDutyAdapter(),
    OpsGenieAdapter(),
    CircleCIAdapter(),
    RenderAdapter(),
    RailwayAdapter(),
    GitLabAdapter(),
    BitbucketAdapter(),
    JiraAdapter(),
    LinearAdapter(),
    DiscordAdapter(),
    PrometheusAdapter(),
    ElasticAdapter(),
    DynatraceAdapter(),
    HoneycombAdapter(),
    StatuspageAdapter(),
    VictorOpsAdapter(),
    SonarQubeAdapter(),
    SnykAdapter(),
    NetlifyAdapter(),
    JenkinsAdapter(),
    TravisCIAdapter(),
    TeamCityAdapter(),
    AzureReposAdapter(),
    AzurePipelinesAdapter(),
    HerokuAdapter(),
    TerraformAdapter(),
    ArgoCDAdapter(),
    RaygunAdapter(),
    AirbrakeAdapter(),
    CodeDeployAdapter(),
    CloudWatchAdapter(),
    GCPDeployAdapter(),
    KubernetesAdapter(),
    SlackAdapter(),
    TeamsAdapter(),
]

_GENERIC = GenericAdapter()

# Legacy short IDs → canonical definition IDs.
LEGACY_IDS = {
    "vercel": "plugin-vercel",
    "grafana": "plugin-grafana",
    "github": "plugin-github",
    "sentry": "plugin-sentry",
    "netlify": "plugin-netlify",
    "datadog": "plugin-datadog",
    "newrelic": "plugin-newrelic",
}

# Legacy categories → valid ones.
LEGACY_CATEGORIES = {
    "ci_cd": "deployment",
}


def normalize_plugin_id(plugin_id: str | None) -> str:
    pid = (plugin_id or "").strip()
    return LEGACY_IDS.get(pid, pid)


def normalize_record(rec: dict) -> dict:
    """Map a DB row to canonical IDs/categories for frontend consumption."""
    rec = dict(rec)
    pid = normalize_plugin_id(rec.get("plugin_id"))
    # The old "github" seed row was the Actions-flavored entry.
    if rec.get("plugin_id") == "github":
        if (rec.get("plugin_name") or "") == "GitHub Actions":
            pid = "plugin-github-actions"
        else:
            pid = "plugin-github"
            rec["plugin_name"] = rec.get("plugin_name") or "GitHub"
    rec["plugin_id"] = pid
    cat = rec.get("category") or ""
    rec["category"] = LEGACY_CATEGORIES.get(cat, cat)
    return rec


def get_adapter(plugin_id: str | None) -> BaseAdapter:
    pid = normalize_plugin_id(plugin_id)
    for adapter in _ADAPTERS:
        if pid in adapter.plugin_ids:
            return adapter
    return _GENERIC
