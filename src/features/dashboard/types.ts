import type { AppRole } from "@/lib/access";

export const KPI_METRICS = [
  "new_customers", "contact_attempts", "successful_contacts", "appointments",
  "consultations", "tasks_on_time", "won_customers", "revenue_vnd",
] as const;

export type KpiMetric = (typeof KPI_METRICS)[number];

export type KpiSummary = {
  new_customers: number;
  contact_attempts: number;
  successful_contacts: number;
  appointments: number;
  consultations: number;
  late_entries: number;
  tasks_completed: number;
  tasks_on_time: number;
  overdue_now: number;
  won_customers: number;
  revenue_vnd: number;
  contact_rate: number | null;
  appointment_to_consultation_rate: number | null;
  consultation_to_win_rate: number | null;
};

export type LeaderboardRow = {
  user_id: string;
  full_name: string;
  contact_attempts: number;
  successful_contacts: number;
  won_customers: number;
  revenue_vnd: number;
  overdue_now: number;
};

export type DashboardOption = { id: string; name: string; teamId?: string | null };

export type DashboardData = {
  viewer: { id: string; name: string; role: AppRole; teamId: string | null };
  summary: KpiSummary;
  previous: KpiSummary;
  leaderboard: LeaderboardRow[];
  owners: DashboardOption[];
  teams: DashboardOption[];
  sources: DashboardOption[];
  targets: { metricCode: KpiMetric; targetValue: number }[];
  effectiveFilters: { user: string; team: string; source: string };
};
