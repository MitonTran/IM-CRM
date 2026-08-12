"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { KPI_METRICS } from "./types";

export type TargetActionState = { ok: boolean; message: string };

const schema = z.object({
  metric: z.enum(KPI_METRICS),
  scope: z.enum(["user", "team"]),
  subjectId: z.uuid("Người hoặc nhóm được giao mục tiêu chưa hợp lệ."),
  period: z.enum(["day", "month", "year"]),
  periodStart: z.iso.date(),
  periodEnd: z.iso.date(),
  targetValue: z.coerce.number().finite().min(0).max(999_999_999_999_999),
});

export async function upsertTargetAction(_: TargetActionState, formData: FormData): Promise<TargetActionState> {
  const parsed = schema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Mục tiêu chưa hợp lệ." };
  const supabase = await createClient();
  const { data: claims, error: claimsError } = await supabase.auth.getClaims();
  const userId = String(claims?.claims?.sub ?? "");
  if (claimsError || !userId) return { ok: false, message: "Phiên đăng nhập đã hết hạn." };
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", userId).single();
  if (!profile || !["leader", "admin"].includes(profile.role)) return { ok: false, message: "Bạn không có quyền đặt mục tiêu." };

  const { error } = await supabase.rpc("upsert_kpi_target", {
    target_metric: parsed.data.metric,
    target_scope: parsed.data.scope,
    target_user_id: parsed.data.scope === "user" ? parsed.data.subjectId : null,
    target_team_id: parsed.data.scope === "team" ? parsed.data.subjectId : null,
    target_period: parsed.data.period,
    target_period_start: parsed.data.periodStart,
    target_period_end: parsed.data.periodEnd,
    target_value: parsed.data.targetValue,
  });
  if (error) {
    const denied = error.message.includes("denied");
    return { ok: false, message: denied ? "Bạn không có quyền đặt mục tiêu cho đối tượng này." : "Không thể lưu mục tiêu. Vui lòng thử lại." };
  }
  revalidatePath("/dashboard");
  return { ok: true, message: "Đã lưu mục tiêu." };
}
