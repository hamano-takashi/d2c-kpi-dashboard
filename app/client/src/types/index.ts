export interface User {
  id: string;
  email: string;
  name: string;
}

export interface Project {
  id: string;
  name: string;
  owner_id: string;
  owner_name: string;
  role: 'admin' | 'editor' | 'viewer';
  created_at: string;
  userRole?: 'admin' | 'editor' | 'viewer';
}

export interface Member {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'editor' | 'viewer';
  created_at: string;
}

export interface KpiMaster {
  id: string;
  agent: string;
  category: string;
  name: string;
  unit: string;
  default_target: number;
  benchmark_min: number;
  benchmark_max: number;
  parent_kpi_id: string | null;
  level: number;
  description?: string;
}

export interface KpiTarget {
  id?: number;
  project_id: string;
  kpi_id: string;
  target_value: number;
  year: number;
  month?: number;
}

export interface KpiActual {
  id?: number;
  project_id: string;
  kpi_id: string;
  actual_value: number;
  year: number;
  month: number;
  updated_by?: string;
  updated_at?: string;
}

export interface KgiSummary {
  id: string;
  name: string;
  unit: string;
  benchmark_min: number;
  benchmark_max: number;
  target_value: number | null;
  actual_value: number | null;
}

export interface AgentScore {
  agent: string;
  total: number;
  achieved: number;
}

export interface Alert {
  id: string;
  name: string;
  agent: string;
  unit: string;
  target_value: number;
  actual_value: number;
  achievement_rate: number;
}

export interface Summary {
  kgis: KgiSummary[];
  agentScores: AgentScore[];
  alerts: Alert[];
}

export type RoleType = 'admin' | 'editor' | 'viewer';

export const ROLE_LABELS: Record<RoleType, string> = {
  admin: '管理者',
  editor: '編集者',
  viewer: '閲覧者',
};

export const AGENT_LABELS: Record<string, string> = {
  COMMANDER: '戦略',
  ACQUISITION: '集客',
  CREATIVE: '制作',
  INSIGHT: '分析',
  ENGAGEMENT: '顧客',
  OPERATIONS: '運用',
};

export const AGENT_ICONS: Record<string, string> = {
  COMMANDER: '🎯',
  ACQUISITION: '📈',
  CREATIVE: '✏️',
  INSIGHT: '📊',
  ENGAGEMENT: '💌',
  OPERATIONS: '⚙️',
};
