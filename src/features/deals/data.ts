import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { AppRole } from "@/lib/access";
import type { DealItem } from "@/features/customers/types";
import type { DealQuery } from "./query";

export async function getDealsWorkspace(query: DealQuery) {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = String(claims?.claims?.sub ?? "");
  const { data: profile, error: profileError } = await supabase.from("profiles").select("role").eq("id", userId).single();
  if (profileError || !profile) throw new Error("Không thể xác định quyền người dùng.");
  const select = `id, customer_id, amount_vnd, registered_at, status, note, void_reason, profiles!deals_owner_user_id_fkey(full_name), teams(name), customers${query.source ? "!inner" : ""}(full_name, source_id)`;
  let request = supabase.from("deals").select(select, { count: "exact" });
  if (query.status !== "all") request = request.eq("status", query.status);
  if (query.owner) request = request.eq("owner_user_id", query.owner);
  if (query.team) request = request.eq("team_id", query.team);
  if (query.source) request = request.eq("customers.source_id", query.source);
  if (query.from) request = request.gte("registered_at", `${query.from}T00:00:00+07:00`);
  if (query.to) request = request.lt("registered_at", new Date(new Date(`${query.to}T00:00:00+07:00`).getTime() + 86_400_000).toISOString());
  const pageSize = 30;
  request = request.order("registered_at", { ascending: false }).range((query.page - 1) * pageSize, query.page * pageSize - 1);
  const [dealResult, ownerResult, teamResult, sourceResult] = await Promise.all([
    request,
    supabase.from("profiles").select("id, full_name").eq("role", "sale").eq("is_active", true).order("full_name"),
    supabase.from("teams").select("id, name").eq("is_active", true).order("name"),
    supabase.from("lead_sources").select("id, name").eq("is_active", true).order("name"),
  ]);
  if (dealResult.error) throw new Error(`Không tải được giao dịch: ${dealResult.error.message}`);
  const deals = (dealResult.data ?? []).map((item) => {
    const row = item as unknown as { id: string; customer_id: string; amount_vnd: number | string; registered_at: string; status: DealItem["status"]; note: string | null; void_reason: string | null; profiles: { full_name: string } | null; teams: { name: string } | null; customers: { full_name: string } | null };
    return { id: row.id, customerId: row.customer_id, customerName: row.customers?.full_name ?? "Khách hàng", ownerName: row.profiles?.full_name ?? "Chưa rõ", teamName: row.teams?.name ?? "—", amountVnd: Number(row.amount_vnd), registeredAt: row.registered_at, status: row.status, note: row.note, voidReason: row.void_reason } satisfies DealItem;
  });
  return {
    deals, count: dealResult.count ?? 0, pageSize, pageTotal: deals.filter((deal) => deal.status === "active").reduce((sum, deal) => sum + deal.amountVnd, 0),
    owners: (ownerResult.data ?? []).map((item) => ({ id: item.id, name: item.full_name })),
    teams: (teamResult.data ?? []).map((item) => ({ id: item.id, name: item.name })),
    sources: (sourceResult.data ?? []).map((item) => ({ id: item.id, name: item.name })),
    viewerRole: profile.role as AppRole,
  };
}

