export interface AutomationRule {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  sort_order: number;
  project_id: string | null;
  trigger_type: string;
  tags?: string[];
  conditions: Array<{ field: string; op: string; value: unknown }>;
  actions: Array<Record<string, unknown>>;
  trigger_count: number;
  last_triggered_at: string | null;
  created_at: string;
}

export interface ScheduledTask {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  sort_order: number;
  cron_expression: string;
  task_type: string;
  task_config: Record<string, unknown>;
  project_id: string | null;
  last_run_at: string | null;
  next_run_at: string | null;
  created_at: string;
}

export interface TriggerDef {
  type: string;
  label: string;
  desc: string;
  icon: 'deploy' | 'incident' | 'alert';
}

export type AutomatonItem = AutomationRule | ScheduledTask;
