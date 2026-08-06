import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { CustomerPriority, FollowUpTask } from "@/features/customers/types";
import type { FollowUpQuery } from "./query";
export type TaskWorkspaceItem = FollowUpTask & { customerId: string; customerName: string; teamName: string };

function vietnamDayBounds(now = new Date()) {
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const start = new Date(`${date}T00:00:00+07:00`);
  return { start: start.toISOString(), next: new Date(start.getTime() + 86_400_000).toISOString(), now: now.toISOString() };
}

export async function getFollowUpWorkspace(query: FollowUpQuery) {
  const supabase = await createClient();
  const bounds = vietnamDayBounds();
  const baseSelect = "id, due_at, status, priority, completion_reason, customers!follow_up_tasks_customer_id_fkey(id, full_name, teams(name)), profiles!follow_up_tasks_assignee_user_id_fkey(full_name), activities!follow_up_tasks_activity_id_fkey(next_action)";
  let list = supabase.from("follow_up_tasks").select(baseSelect, { count: "exact" });
  if (query.status !== "all") list = list.eq("status", query.status);
  if (query.priority) list = list.eq("priority", query.priority);
  if (query.assignee) list = list.eq("assignee_user_id", query.assignee);
  if (query.scope === "overdue") list = list.lt("due_at", bounds.now).eq("status", "pending");
  if (query.scope === "today") list = list.gte("due_at", bounds.start).lt("due_at", bounds.next);
  if (query.scope === "upcoming") list = list.gte("due_at", bounds.next);
  const pageSize = 30;
  list = list.order("due_at", { ascending: true }).range((query.page - 1) * pageSize, query.page * pageSize - 1);

  const countQuery = (from: string, to?: string) => {
    let request = supabase.from("follow_up_tasks").select("id", { count: "exact", head: true }).eq("status", "pending").gte("due_at", from);
    if (to) request = request.lt("due_at", to);
    return request;
  };
  const [listResult, overdueResult, todayResult, upcomingResult, ownerResult] = await Promise.all([
    list,
    supabase.from("follow_up_tasks").select("id", { count: "exact", head: true }).eq("status", "pending").lt("due_at", bounds.now),
    countQuery(bounds.start, bounds.next),
    countQuery(bounds.next),
    supabase.from("profiles").select("id, full_name").eq("role", "sale").eq("is_active", true).order("full_name"),
  ]);
  if (listResult.error) throw new Error(`Không tải được công việc: ${listResult.error.message}`);
  const tasks = (listResult.data ?? []).map((item) => {
    const row = item as unknown as { id: string; due_at: string; status: FollowUpTask["status"]; priority: CustomerPriority; completion_reason: string | null; customers: { id: string; full_name: string; teams: { name: string } | null } | null; profiles: { full_name: string } | null; activities: { next_action: string | null } | null };
    return { id: row.id, dueAt: row.due_at, status: row.status, priority: row.priority, completionReason: row.completion_reason, assigneeName: row.profiles?.full_name ?? "Chưa rõ", nextAction: row.activities?.next_action ?? "Chăm sóc khách hàng", customerId: row.customers?.id ?? "", customerName: row.customers?.full_name ?? "Khách hàng", teamName: row.customers?.teams?.name ?? "—" } satisfies TaskWorkspaceItem;
  });
  return {
    tasks, count: listResult.count ?? 0, pageSize,
    summary: { overdue: overdueResult.count ?? 0, today: todayResult.count ?? 0, upcoming: upcomingResult.count ?? 0 },
    owners: (ownerResult.data ?? []).map((owner) => ({ id: owner.id, name: owner.full_name })),
  };
}

