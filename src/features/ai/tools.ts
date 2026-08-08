import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { hasGeminiEmbeddingEnv } from "@/lib/env";
import type { AiPeriod, AiToolCall, AiToolEvidence, AiToolResult } from "./assistant-schema";
import { toPgVector } from "./embedding-contract";
import { createGeminiEmbeddings } from "./gemini-embeddings";
import { aiPeriodBounds, vietnamDateKey } from "./period";

type ScopedClient = SupabaseClient;

function locatorLabel(locator: unknown, chunkIndex: number) {
  const value = locator && typeof locator === "object" ? locator as Record<string, unknown> : {};
  if (value.page) return `Trang ${value.page}`;
  if (value.slide) return `Slide ${value.slide}`;
  if (value.sheet && value.range) return `${value.sheet} · ${value.range}`;
  if (value.sheet) return String(value.sheet);
  if (value.paragraph) return `Đoạn ${value.paragraph}`;
  return `Đoạn ${chunkIndex + 1}`;
}

function crmEvidence(tool: Extract<AiToolCall["tool"], "get_customer_summary" | "list_follow_ups" | "get_kpi_summary" | "get_revenue_summary" | "get_funnel_summary">, href: string, label: string): AiToolEvidence {
  return { id: `crm:${tool}:${href}`, citation: { kind: "crm", tool, href, label } };
}

async function getCustomerSummary(supabase: ScopedClient, customerId: string): Promise<AiToolResult> {
  const [customer, activities, tasks, deals] = await Promise.all([
    supabase.from("customers").select("id, full_name, status, priority, note_summary, lead_sources(name), profiles!customers_owner_user_id_fkey(full_name), teams(name), customer_tag_links(customer_tags(name))").eq("id", customerId).single(),
    supabase.from("activities").select("id, type, outcome, content, next_action, follow_up_at, occurred_at").eq("customer_id", customerId).order("occurred_at", { ascending: false }).limit(12),
    supabase.from("follow_up_tasks").select("id, due_at, status, priority").eq("customer_id", customerId).order("due_at", { ascending: false }).limit(10),
    supabase.from("deals").select("id, amount_vnd, registered_at, status").eq("customer_id", customerId).order("registered_at", { ascending: false }).limit(10),
  ]);
  if (customer.error || !customer.data) return { tool: "get_customer_summary", data: { found: false }, evidence: [], resultCount: 0 };
  const evidence = crmEvidence("get_customer_summary", `/customers?customer=${customerId}`, `Khách hàng ${customer.data.full_name}`);
  const safeCustomer = customer.data as Record<string, unknown>;
  const safeActivities = (activities.data ?? []).map((row) => ({ ...row, content: row.content?.slice(0, 800) ?? null, next_action: row.next_action?.slice(0, 300) ?? null }));
  return {
    tool: "get_customer_summary", resultCount: 1, evidence: [evidence],
    data: { evidence_id: evidence.id, customer: { ...safeCustomer, note_summary: typeof safeCustomer.note_summary === "string" ? safeCustomer.note_summary.slice(0, 2000) : null }, activities: safeActivities, follow_ups: tasks.data ?? [], deals: deals.data ?? [] },
  };
}

function dayBounds(now = new Date()) {
  const key = vietnamDateKey(now);
  const start = new Date(`${key}T00:00:00+07:00`);
  return { now: now.toISOString(), start: start.toISOString(), next: new Date(start.getTime() + 86_400_000).toISOString(), next7: new Date(start.getTime() + 8 * 86_400_000).toISOString() };
}

async function listFollowUps(supabase: ScopedClient, window: "overdue" | "today" | "next_7_days"): Promise<AiToolResult> {
  const bounds = dayBounds();
  let query = supabase.from("follow_up_tasks").select("id, due_at, priority, customers!follow_up_tasks_customer_id_fkey(id, full_name), profiles!follow_up_tasks_assignee_user_id_fkey(full_name)").eq("status", "pending");
  if (window === "overdue") query = query.lt("due_at", bounds.now);
  else if (window === "today") query = query.gte("due_at", bounds.start).lt("due_at", bounds.next);
  else query = query.gte("due_at", bounds.next).lt("due_at", bounds.next7);
  const result = await query.order("due_at", { ascending: true }).limit(20);
  if (result.error) throw new Error(`ai_tool_follow_ups:${result.error.message}`);
  const href = `/tasks?scope=${window === "next_7_days" ? "upcoming" : window}`;
  const evidence = crmEvidence("list_follow_ups", href, `Danh sách follow-up ${window}`);
  return { tool: "list_follow_ups", data: { evidence_id: evidence.id, window, tasks: result.data ?? [] }, evidence: [evidence], resultCount: result.data?.length ?? 0 };
}

async function getKpi(supabase: ScopedClient, period: AiPeriod, tool: "get_kpi_summary" | "get_funnel_summary"): Promise<AiToolResult> {
  const bounds = aiPeriodBounds(period);
  const result = await supabase.rpc("get_kpi_summary", { range_start: bounds.start, range_end: bounds.end, filter_user_id: null, filter_team_id: null, filter_source_id: null });
  if (result.error) throw new Error(`ai_tool_kpi:${result.error.message}`);
  const href = `/dashboard?period=${period === "this_year" ? "year" : "month"}&anchor=${vietnamDateKey()}`;
  const evidence = crmEvidence(tool, href, `${tool === "get_funnel_summary" ? "Phễu" : "KPI"} ${bounds.label}`);
  const summary = result.data && typeof result.data === "object" ? result.data as Record<string, unknown> : {};
  const data = tool === "get_funnel_summary" ? {
    successful_contacts: summary.successful_contacts, appointments: summary.appointments,
    consultations: summary.consultations, won_customers: summary.won_customers,
    contact_rate: summary.contact_rate, appointment_to_consultation_rate: summary.appointment_to_consultation_rate,
    consultation_to_win_rate: summary.consultation_to_win_rate,
  } : summary;
  return { tool, data: { evidence_id: evidence.id, period: bounds.label, summary: data }, evidence: [evidence], resultCount: 1 };
}

async function getRevenue(supabase: ScopedClient, period: AiPeriod, groupBy: "team" | "source" | "owner"): Promise<AiToolResult> {
  const bounds = aiPeriodBounds(period);
  const result = await supabase.from("deals").select("amount_vnd, team_id, owner_user_id, teams(name), profiles!deals_owner_user_id_fkey(full_name), customers!deals_customer_id_fkey(lead_sources(name))")
    .eq("status", "active").gte("registered_at", bounds.start).lt("registered_at", bounds.end).limit(1000);
  if (result.error) throw new Error(`ai_tool_revenue:${result.error.message}`);
  const groups = new Map<string, { label: string; revenue_vnd: number; deals: number }>();
  for (const raw of result.data ?? []) {
    const row = raw as unknown as { amount_vnd: number | string; team_id: string; owner_user_id: string; teams: { name?: string } | null; profiles: { full_name?: string } | null; customers: { lead_sources?: { name?: string } | null } | null };
    const key = groupBy === "team" ? row.team_id : groupBy === "owner" ? row.owner_user_id : row.customers?.lead_sources?.name ?? "unknown";
    const label = groupBy === "team" ? row.teams?.name ?? "Chưa rõ" : groupBy === "owner" ? row.profiles?.full_name ?? "Chưa rõ" : row.customers?.lead_sources?.name ?? "Chưa rõ";
    const current = groups.get(key) ?? { label, revenue_vnd: 0, deals: 0 };
    current.revenue_vnd += Number(row.amount_vnd); current.deals += 1; groups.set(key, current);
  }
  const evidence = crmEvidence("get_revenue_summary", "/deals", `Doanh thu ${bounds.label}`);
  const rows = [...groups.values()].sort((a, b) => b.revenue_vnd - a.revenue_vnd).slice(0, 30);
  return { tool: "get_revenue_summary", data: { evidence_id: evidence.id, period: bounds.label, group_by: groupBy, groups: rows }, evidence: [evidence], resultCount: result.data?.length ?? 0 };
}

type DocumentChunk = { chunk_id: string; document_id: string; version_id: string; title: string; version_no: number; chunk_index: number; excerpt: string; locator: unknown };

function documentResult(tool: "search_documents" | "get_document_excerpt", rows: DocumentChunk[]): AiToolResult {
  const evidence = rows.map((row) => {
    const locator = locatorLabel(row.locator, row.chunk_index);
    return {
      id: `document:${row.chunk_id}`,
      citation: { kind: "document" as const, document_id: row.document_id, version_id: row.version_id, title: row.title, locator, label: `${row.title} · ${locator}` },
    };
  });
  return {
    tool, resultCount: rows.length, evidence,
    data: rows.map((row, index) => ({ evidence_id: evidence[index].id, title: row.title, version: row.version_no, locator: locatorLabel(row.locator, row.chunk_index), excerpt: row.excerpt })),
  };
}

async function searchDocuments(supabase: ScopedClient, query: string) {
  let result;
  if (hasGeminiEmbeddingEnv()) {
    try {
      const [embedding] = await createGeminiEmbeddings([query], "RETRIEVAL_QUERY");
      result = await supabase.rpc("search_documents_hybrid", {
        search_text: query,
        query_embedding: toPgVector(embedding),
        max_results: 6,
      });
    } catch {
      result = await supabase.rpc("search_documents", { search_text: query, max_results: 6 });
    }
  } else {
    result = await supabase.rpc("search_documents", { search_text: query, max_results: 6 });
  }
  if (result.error) throw new Error(`ai_tool_document_search:${result.error.message}`);
  return documentResult("search_documents", (result.data ?? []) as DocumentChunk[]);
}

async function getDocumentExcerpt(supabase: ScopedClient, versionId: string, chunkIndex: number) {
  const result = await supabase.rpc("get_document_excerpt", { target_version_id: versionId, target_chunk_index: chunkIndex });
  if (result.error) throw new Error(`ai_tool_document_excerpt:${result.error.message}`);
  return documentResult("get_document_excerpt", (result.data ?? []) as DocumentChunk[]);
}

export async function executeAiTool(supabase: ScopedClient, call: AiToolCall): Promise<AiToolResult> {
  switch (call.tool) {
    case "get_customer_summary": return getCustomerSummary(supabase, call.arguments.customer_id);
    case "list_follow_ups": return listFollowUps(supabase, call.arguments.window);
    case "get_kpi_summary": return getKpi(supabase, call.arguments.period, "get_kpi_summary");
    case "get_funnel_summary": return getKpi(supabase, call.arguments.period, "get_funnel_summary");
    case "get_revenue_summary": return getRevenue(supabase, call.arguments.period, call.arguments.group_by);
    case "search_documents": return searchDocuments(supabase, call.arguments.query);
    case "get_document_excerpt": return getDocumentExcerpt(supabase, call.arguments.version_id, call.arguments.chunk_index);
  }
}

export async function executeAiTools(supabase: ScopedClient, calls: AiToolCall[]) {
  const results: AiToolResult[] = [];
  for (const call of calls) results.push(await executeAiTool(supabase, call));
  return results;
}
