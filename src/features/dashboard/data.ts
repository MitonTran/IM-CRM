import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { AppRole } from "@/lib/access";
import type { DashboardQuery, PeriodBounds } from "./query";
import type { DashboardData, KpiMetric, KpiSummary, LeaderboardRow } from "./types";

const emptySummary: KpiSummary = {
  new_customers: 0, contact_attempts: 0, successful_contacts: 0, appointments: 0,
  consultations: 0, late_entries: 0, tasks_completed: 0, tasks_on_time: 0,
  overdue_now: 0, won_customers: 0, revenue_vnd: 0, contact_rate: null,
  appointment_to_consultation_rate: null, consultation_to_win_rate: null,
};

function summary(value: unknown): KpiSummary {
  if (!value || typeof value !== "object") return emptySummary;
  const row = value as Record<string, unknown>;
  const number = (key: keyof KpiSummary) => Number(row[key] ?? 0);
  const rate = (key: keyof KpiSummary) => row[key] === null || row[key] === undefined ? null : Number(row[key]);
  return {
    new_customers: number("new_customers"), contact_attempts: number("contact_attempts"),
    successful_contacts: number("successful_contacts"), appointments: number("appointments"),
    consultations: number("consultations"), late_entries: number("late_entries"),
    tasks_completed: number("tasks_completed"), tasks_on_time: number("tasks_on_time"),
    overdue_now: number("overdue_now"), won_customers: number("won_customers"),
    revenue_vnd: number("revenue_vnd"), contact_rate: rate("contact_rate"),
    appointment_to_consultation_rate: rate("appointment_to_consultation_rate"),
    consultation_to_win_rate: rate("consultation_to_win_rate"),
  };
}

export async function getDashboardData(query: DashboardQuery, bounds: PeriodBounds): Promise<DashboardData> {
  const supabase = await createClient();
  const { data: claims, error: claimsError } = await supabase.auth.getClaims();
  const userId = String(claims?.claims?.sub ?? "");
  if (claimsError || !userId) throw new Error("Phiên đăng nhập không hợp lệ.");

  const { data: profile, error: profileError } = await supabase.from("profiles").select("full_name, role, team_id").eq("id", userId).single();
  if (profileError || !profile) throw new Error("Không thể xác định quyền người dùng.");
  const role = profile.role as AppRole;

  const [ownerResult, teamResult, sourceResult] = await Promise.all([
    role === "sale" ? Promise.resolve({ data: [] }) : supabase.from("profiles").select("id, full_name, team_id").eq("role", "sale").eq("is_active", true).order("full_name"),
    role === "sale" ? Promise.resolve({ data: [] }) : supabase.from("teams").select("id, name").eq("is_active", true).order("name"),
    supabase.from("lead_sources").select("id, name").eq("is_active", true).order("name"),
  ]);
  const owners = (ownerResult.data ?? []).map((item) => ({ id: item.id, name: item.full_name, teamId: item.team_id }));
  const teams = (teamResult.data ?? []).map((item) => ({ id: item.id, name: item.name }));
  const sources = (sourceResult.data ?? []).map((item) => ({ id: item.id, name: item.name }));

  const permittedTeam = teams.find((item) => item.id === query.team);
  const permittedOwner = owners.find((item) => item.id === query.owner && (!permittedTeam || item.teamId === permittedTeam.id));
  const filterUser = role === "sale" ? userId : permittedOwner?.id ?? null;
  const filterTeam = role === "leader" ? profile.team_id : permittedTeam?.id ?? null;
  const filterSource = sources.some((item) => item.id === query.source) ? query.source : null;
  const args = { filter_user_id: filterUser, filter_team_id: filterTeam, filter_source_id: filterSource };

  const [currentResult, previousResult, leaderboardResult] = await Promise.all([
    supabase.rpc("get_kpi_summary", { range_start: bounds.startUtc, range_end: bounds.endUtc, ...args }),
    supabase.rpc("get_kpi_summary", { range_start: bounds.previousStartUtc, range_end: bounds.previousEndUtc, ...args }),
    role === "sale" ? Promise.resolve({ data: [] as unknown[], error: null }) : supabase.rpc("get_kpi_leaderboard", {
      range_start: bounds.startUtc, range_end: bounds.endUtc, filter_team_id: filterTeam, filter_source_id: filterSource,
    }),
  ]);
  if (currentResult.error) throw new Error(`Không tải được KPI: ${currentResult.error.message}`);
  if (previousResult.error) throw new Error(`Không tải được kỳ so sánh: ${previousResult.error.message}`);
  if (leaderboardResult.error) throw new Error(`Không tải được bảng xếp hạng: ${leaderboardResult.error.message}`);

  const targetScope = filterUser ? { scope_type: "user", user_id: filterUser } : filterTeam ? { scope_type: "team", team_id: filterTeam } : null;
  let targets: DashboardData["targets"] = [];
  if (targetScope) {
    let targetRequest = supabase.from("kpi_targets").select("metric_code, target_value")
      .eq("period_type", query.period).eq("period_start", bounds.startDate).eq("period_end", bounds.endDate)
      .eq("scope_type", targetScope.scope_type);
    targetRequest = "user_id" in targetScope ? targetRequest.eq("user_id", targetScope.user_id) : targetRequest.eq("team_id", targetScope.team_id);
    const { data: targetRows, error } = await targetRequest.order("metric_code");
    if (error) throw new Error(`Không tải được mục tiêu: ${error.message}`);
    targets = (targetRows ?? []).map((item) => ({ metricCode: item.metric_code as KpiMetric, targetValue: Number(item.target_value) }));
  }

  return {
    viewer: { id: userId, name: profile.full_name, role, teamId: profile.team_id },
    summary: summary(currentResult.data), previous: summary(previousResult.data),
    leaderboard: (Array.isArray(leaderboardResult.data) ? leaderboardResult.data : []) as LeaderboardRow[],
    owners, teams, sources, targets,
    effectiveFilters: { user: filterUser ?? "", team: filterTeam ?? "", source: filterSource ?? "" },
  };
}
