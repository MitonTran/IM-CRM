"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export type DealActionState = { ok: boolean; message: string; dealId?: string };

async function authenticatedClient() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  return error || !data?.claims?.sub ? null : supabase;
}

function vietnamDateTime(value: string) {
  if (!value) return new Date().toISOString();
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const date = new Date(`${value}:00+07:00`);
  return Number.isNaN(date.valueOf()) ? null : date.toISOString();
}

function friendlyError(message: string) {
  if (message.includes("deal_amend_window_expired")) return "Sale chỉ được chỉnh sửa giao dịch do mình tạo trong vòng 24 giờ.";
  if (message.includes("deal_amend_inactive")) return "Giao dịch này không còn active hoặc đã được điều chỉnh.";
  if (message.includes("deal_amend_already_replaced")) return "Giao dịch đã có bản thay thế. Hãy tải lại hồ sơ khách.";
  if (message.includes("deal_amend_no_changes")) return "Chưa có thông tin giao dịch nào thay đổi.";
  if (message.includes("deal_amend_reason_required")) return "Cần nhập lý do điều chỉnh từ 3 đến 500 ký tự.";
  if (message.includes("deal_create_denied") || message.includes("deal_void_denied") || message.includes("deal_amend_denied")) return "Bạn không có quyền thực hiện thao tác này.";
  if (message.includes("customer_owner_required")) return "Khách cần được giao cho một Sale trước khi đăng ký.";
  if (message.includes("idempotency")) return "Yêu cầu giao dịch bị trùng. Hãy tải lại chi tiết khách.";
  if (message.includes("registered_at")) return "Ngày đăng ký chưa hợp lệ.";
  return "Không thể lưu giao dịch. Vui lòng kiểm tra dữ liệu và thử lại.";
}

function revalidateDealViews() {
  revalidatePath("/customers");
  revalidatePath("/deals");
  revalidatePath("/dashboard");
  revalidatePath("/tasks");
}

export async function registerDealAction(_: DealActionState, formData: FormData): Promise<DealActionState> {
  const parsed = z.object({
    customerId: z.uuid(), amountVnd: z.string().regex(/^\d{1,15}$/, "Số tiền VND chưa hợp lệ.").transform(Number),
    registeredAt: z.string(), idempotencyKey: z.uuid(), note: z.string().trim().max(2000).optional(),
  }).safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Dữ liệu giao dịch chưa hợp lệ." };
  const registeredAt = vietnamDateTime(parsed.data.registeredAt);
  if (!registeredAt) return { ok: false, message: "Ngày đăng ký chưa hợp lệ." };
  const supabase = await authenticatedClient();
  if (!supabase) return { ok: false, message: "Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại." };
  const { data, error } = await supabase.rpc("register_deal", {
    target_customer_id: parsed.data.customerId, deal_amount_vnd: parsed.data.amountVnd,
    deal_registered_at: registeredAt, request_idempotency_key: parsed.data.idempotencyKey,
    deal_note: parsed.data.note || null, close_pending_tasks: formData.get("closePendingTasks") === "on",
  });
  if (error) return { ok: false, message: friendlyError(error.message) };
  revalidateDealViews();
  return { ok: true, message: "Đã ghi nhận giao dịch.", dealId: String(data) };
}

export async function amendDealAction(_: DealActionState, formData: FormData): Promise<DealActionState> {
  const parsed = z.object({
    dealId: z.uuid(),
    amountVnd: z.string().regex(/^\d{1,15}$/, "Số tiền VND chưa hợp lệ.").transform(Number),
    registeredAt: z.string(),
    idempotencyKey: z.uuid(),
    note: z.string().trim().max(2000).optional(),
    reason: z.string().trim().min(3, "Cần nhập lý do điều chỉnh.").max(500),
  }).safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Dữ liệu điều chỉnh chưa hợp lệ." };
  const registeredAt = vietnamDateTime(parsed.data.registeredAt);
  if (!registeredAt) return { ok: false, message: "Ngày đăng ký chưa hợp lệ." };
  const supabase = await authenticatedClient();
  if (!supabase) return { ok: false, message: "Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại." };
  const { data, error } = await supabase.rpc("amend_deal", {
    target_deal_id: parsed.data.dealId,
    amended_amount_vnd: parsed.data.amountVnd,
    amended_registered_at: registeredAt,
    amended_note: parsed.data.note || null,
    reason: parsed.data.reason,
    request_idempotency_key: parsed.data.idempotencyKey,
  });
  if (error) return { ok: false, message: friendlyError(error.message) };
  revalidateDealViews();
  return { ok: true, message: "Đã điều chỉnh giao dịch và giữ lại bản cũ trong lịch sử.", dealId: String(data) };
}

export async function voidDealAction(_: DealActionState, formData: FormData): Promise<DealActionState> {
  const parsed = z.object({ dealId: z.uuid(), reason: z.string().trim().min(3).max(500) }).safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Cần nhập lý do vô hiệu hóa." };
  const supabase = await authenticatedClient();
  if (!supabase) return { ok: false, message: "Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại." };
  const { error } = await supabase.rpc("void_deal", { target_deal_id: parsed.data.dealId, reason: parsed.data.reason });
  if (error) return { ok: false, message: friendlyError(error.message) };
  revalidateDealViews();
  return { ok: true, message: "Đã vô hiệu hóa giao dịch." };
}
