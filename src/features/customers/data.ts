import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { AppRole } from "@/lib/access";
import { aiCustomerAnalysisSchema, type AiCustomerAnalysisItem } from "@/features/ai/schema";
import { AI_PROVIDER_LABELS, getAiProvider } from "@/lib/env";
import type { ActivityItem, CustomerDetail, CustomerListItem, CustomerPageData, DealItem, FollowUpTask } from "./types";
import type { CustomerQuery } from "./query";

const PAGE_SIZE = 20;

type RawCustomer = {
  id: string; full_name: string; phone: string | null; email: string | null; status: CustomerListItem["status"];
  priority: CustomerListItem["priority"]; source_id: string; status_reason?: string | null; note_summary?: string | null; updated_at: string;
  lead_sources: { name: string } | null; profiles: { full_name: string } | null; teams: { name: string } | null;
  customer_tag_links?: { customer_tags: { id: string; name: string; color: string } | null }[];
};

function rowToList(row: RawCustomer): CustomerListItem {
  return {
    id: row.id, fullName: row.full_name, phone: row.phone, email: row.email, status: row.status,
    priority: row.priority, sourceName: row.lead_sources?.name ?? "—", ownerName: row.profiles?.full_name ?? null,
    teamName: row.teams?.name ?? "—", updatedAt: row.updated_at,
  };
}

export async function getCustomerPageData(query: CustomerQuery): Promise<CustomerPageData> {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = String(claims?.claims?.sub ?? "");
  if (!userId) redirect("/login");
  const { data: profile, error: profileError } = await supabase.from("profiles").select("id, role, team_id").eq("id", userId).single();
  if (profileError || !profile) throw new Error("Không thể xác định quyền người dùng.");

  const listSelect = `id, full_name, phone, email, status, priority, source_id, updated_at, lead_sources(name), profiles!customers_owner_user_id_fkey(full_name), teams(name)${query.tag ? ", customer_tag_links!inner(tag_id)" : ""}`;
  let customers = supabase.from("customers").select(
    listSelect,
    { count: "exact" },
  ).is("deleted_at", null);
  if (query.q) {
    const safe = query.q.replace(/[,%()]/g, " ").trim();
    if (safe) customers = customers.or(`full_name.ilike.%${safe}%,phone.ilike.%${safe}%,email.ilike.%${safe}%`);
  }
  if (query.status) customers = customers.eq("status", query.status);
  if (query.owner) customers = customers.eq("owner_user_id", query.owner);
  if (query.team) customers = customers.eq("team_id", query.team);
  if (query.source) customers = customers.eq("source_id", query.source);
  if (query.tag) customers = customers.eq("customer_tag_links.tag_id", query.tag);
  customers = customers.order(query.sort, { ascending: query.dir === "asc" }).range((query.page - 1) * PAGE_SIZE, query.page * PAGE_SIZE - 1);

  const [customerResult, sourceResult, tagResult, ownerResult, teamResult, facetResult] = await Promise.all([
    customers,
    supabase.from("lead_sources").select("id, name").eq("is_active", true).order("name"),
    supabase.from("customer_tags").select("id, name, color").eq("is_active", true).order("name"),
    supabase.from("profiles").select("id, full_name, team_id").eq("role", "sale").eq("is_active", true).order("full_name"),
    supabase.from("teams").select("id, name").eq("is_active", true).order("name"),
    supabase.rpc("customer_filter_facets", {
      filter_q: query.q || null, filter_status: query.status || null, filter_owner_id: query.owner || null,
      filter_team_id: query.team || null, filter_source_id: query.source || null, filter_tag_id: query.tag || null,
    }),
  ]);
  if (customerResult.error) throw new Error(`Không tải được khách hàng: ${customerResult.error.message}`);
  if (facetResult.error) throw new Error(`Không tải được thống kê bộ lọc: ${facetResult.error.message}`);
  const facets = (facetResult.data ?? {}) as { status?: Record<string, number>; source?: Record<string, number> };

  return {
    rows: ((customerResult.data ?? []) as unknown as RawCustomer[]).map(rowToList), count: customerResult.count ?? 0,
    sources: (sourceResult.data ?? []).map((item) => ({ id: item.id, name: item.name })),
    tags: (tagResult.data ?? []).map((item) => ({ id: item.id, name: item.name, color: item.color })),
    owners: (ownerResult.data ?? []).map((item) => ({ id: item.id, name: item.full_name, teamId: item.team_id })),
    teams: (teamResult.data ?? []).map((item) => ({ id: item.id, name: item.name })),
    facets: { status: facets.status ?? {}, source: facets.source ?? {} },
    viewer: { id: profile.id, role: profile.role as AppRole, teamId: profile.team_id },
  };
}

export async function getCustomerDetail(customerId: string): Promise<CustomerDetail | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("customers").select(
    "id, full_name, phone, email, status, status_reason, priority, source_id, note_summary, updated_at, lead_sources(name), profiles!customers_owner_user_id_fkey(full_name), teams(name), customer_tag_links(customer_tags(id, name, color))",
  ).eq("id", customerId).is("deleted_at", null).maybeSingle();
  if (error) throw new Error(`Không tải được chi tiết khách hàng: ${error.message}`);
  if (!data) return null;
  const [activityResult, taskResult, dealResult, aiResult, aiSettingsResult] = await Promise.all([
    supabase.from("activities").select("id, type, outcome, content, occurred_at, next_action, follow_up_at, is_late_entry, profiles!activities_performed_by_fkey(full_name)").eq("customer_id", customerId).is("deleted_at", null).order("occurred_at", { ascending: false }).limit(50),
    supabase.from("follow_up_tasks").select("id, due_at, status, priority, completion_reason, profiles!follow_up_tasks_assignee_user_id_fkey(full_name), activities!follow_up_tasks_activity_id_fkey(next_action)").eq("customer_id", customerId).order("due_at", { ascending: true }).limit(30),
    supabase.from("deals").select("id, customer_id, amount_vnd, registered_at, status, note, void_reason, profiles!deals_owner_user_id_fkey(full_name), teams(name)").eq("customer_id", customerId).order("registered_at", { ascending: false }).limit(30),
    supabase.from("ai_customer_analyses").select("id, status, result, model, total_tokens, latency_ms, error_code, created_at, profiles!ai_customer_analyses_requested_by_fkey(full_name)").eq("customer_id", customerId).order("created_at", { ascending: false }).limit(10),
    supabase.from("ai_settings").select("is_enabled").eq("singleton_id", true).maybeSingle(),
  ]);
  if (activityResult.error) throw new Error(`Không tải được timeline: ${activityResult.error.message}`);
  if (taskResult.error) throw new Error(`Không tải được follow-up: ${taskResult.error.message}`);
  if (dealResult.error) throw new Error(`Không tải được giao dịch: ${dealResult.error.message}`);
  if (aiResult.error) throw new Error(`Không tải được phân tích AI: ${aiResult.error.message}`);
  const raw = data as unknown as RawCustomer;
  const activities = (activityResult.data ?? []).map((item) => {
    const row = item as unknown as { id: string; type: string; outcome: ActivityItem["outcome"]; content: string | null; occurred_at: string; next_action: string | null; follow_up_at: string | null; is_late_entry: boolean; profiles: { full_name: string } | null };
    return { id: row.id, type: row.type, outcome: row.outcome, content: row.content, occurredAt: row.occurred_at, performerName: row.profiles?.full_name ?? "Thành viên", nextAction: row.next_action, followUpAt: row.follow_up_at, isLateEntry: row.is_late_entry } satisfies ActivityItem;
  });
  const followUps = (taskResult.data ?? []).map((item) => {
    const row = item as unknown as { id: string; due_at: string; status: FollowUpTask["status"]; priority: FollowUpTask["priority"]; completion_reason: string | null; profiles: { full_name: string } | null; activities: { next_action: string | null } | null };
    return { id: row.id, dueAt: row.due_at, status: row.status, priority: row.priority, completionReason: row.completion_reason, assigneeName: row.profiles?.full_name ?? "Chưa rõ", nextAction: row.activities?.next_action ?? "Chăm sóc khách hàng" } satisfies FollowUpTask;
  });
  const deals = (dealResult.data ?? []).map((item) => {
    const row = item as unknown as { id: string; customer_id: string; amount_vnd: number | string; registered_at: string; status: DealItem["status"]; note: string | null; void_reason: string | null; profiles: { full_name: string } | null; teams: { name: string } | null };
    return { id: row.id, customerId: row.customer_id, customerName: raw.full_name, ownerName: row.profiles?.full_name ?? "Chưa rõ", teamName: row.teams?.name ?? "—", amountVnd: Number(row.amount_vnd), registeredAt: row.registered_at, status: row.status, note: row.note, voidReason: row.void_reason } satisfies DealItem;
  });
  const aiAnalyses = (aiResult.data ?? []).map((item) => {
    const row = item as unknown as { id: string; status: AiCustomerAnalysisItem["status"]; result: unknown; model: string | null; total_tokens: number; latency_ms: number | null; error_code: string | null; created_at: string; profiles: { full_name: string } | null };
    const parsedResult = aiCustomerAnalysisSchema.safeParse(row.result);
    return { id: row.id, status: row.status, result: parsedResult.success ? parsedResult.data : null, model: row.model, totalTokens: row.total_tokens, latencyMs: row.latency_ms, errorCode: row.error_code, requestedByName: row.profiles?.full_name ?? "Thành viên", createdAt: row.created_at } satisfies AiCustomerAnalysisItem;
  });
  let aiProviderName = "Chưa cấu hình";
  try { aiProviderName = AI_PROVIDER_LABELS[getAiProvider()]; } catch { /* Hiển thị trạng thái an toàn trong UI. */ }
  return { ...rowToList(raw), sourceId: raw.source_id, statusReason: raw.status_reason ?? null, noteSummary: raw.note_summary ?? null, tags: (raw.customer_tag_links ?? []).flatMap((link) => link.customer_tags ? [link.customer_tags] : []), activities, followUps, deals, aiAnalyses, aiEnabled: aiSettingsResult.data?.is_enabled ?? false, aiProviderName };
}

export const CUSTOMER_PAGE_SIZE = PAGE_SIZE;
