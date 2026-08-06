"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { ACTIVITY_OUTCOMES, ACTIVITY_TYPES, CUSTOMER_PRIORITIES, CUSTOMER_STATUSES } from "./types";

export type CustomerActionState = { ok: boolean; message: string; customerId?: string };

const nullableText = (max: number) => z.string().trim().max(max).optional().transform((value) => value || null);
const createSchema = z.object({
  fullName: z.string().trim().min(2, "Tên cần ít nhất 2 ký tự.").max(120),
  phone: nullableText(30), email: z.union([z.literal(""), z.email("Email chưa đúng định dạng.")]).transform((v) => v || null),
  sourceId: z.uuid("Hãy chọn nguồn khách."), priority: z.enum(CUSTOMER_PRIORITIES), noteSummary: nullableText(2000),
  ownerUserId: z.union([z.literal(""), z.uuid()]).transform((v) => v || null),
  teamId: z.union([z.literal(""), z.uuid()]).transform((v) => v || null),
  tagIds: z.array(z.uuid()).max(10),
}).refine((value) => value.phone || value.email, { message: "Cần ít nhất số điện thoại hoặc email.", path: ["phone"] });

function formObject(formData: FormData) { return Object.fromEntries(formData.entries()); }
async function authenticatedClient() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims?.sub) return null;
  return supabase;
}
function friendlyError(message: string) {
  if (message.includes("customer_duplicate") || message.includes("duplicate key")) return "Số điện thoại hoặc email đã tồn tại trong hệ thống.";
  if (message.includes("owner_team_mismatch")) return "Sale được chọn không thuộc team này.";
  if (message.includes("status_reason_required")) return "Cần nhập lý do khi khách đã mất hoặc không phù hợp.";
  if (message.includes("active_deal_required_for_won")) return "Hãy ghi nhận giao dịch để chuyển khách sang Đã chốt.";
  if (message.includes("follow_up_time") || message.includes("new_due_time")) return "Thời gian chăm sóc phải nằm trong tương lai.";
  if (message.includes("edit_window_closed")) return "Thời hạn sửa activity của Sale đã kết thúc.";
  if (message.includes("denied") || message.includes("not_authorized")) return "Bạn không có quyền thực hiện thao tác này.";
  return "Không thể lưu thay đổi. Vui lòng kiểm tra dữ liệu và thử lại.";
}

export async function createCustomerAction(_: CustomerActionState, formData: FormData): Promise<CustomerActionState> {
  const parsed = createSchema.safeParse({ ...formObject(formData), tagIds: formData.getAll("tagIds") });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Dữ liệu chưa hợp lệ." };
  const supabase = await authenticatedClient();
  if (!supabase) return { ok: false, message: "Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại." };
  const { data, error } = await supabase.rpc("create_customer_with_assignment", {
    customer_full_name: parsed.data.fullName, customer_phone: parsed.data.phone, customer_email: parsed.data.email,
    customer_source_id: parsed.data.sourceId, customer_priority: parsed.data.priority,
    customer_note_summary: parsed.data.noteSummary, customer_owner_user_id: parsed.data.ownerUserId,
    customer_team_id: parsed.data.teamId, customer_tag_ids: parsed.data.tagIds,
  });
  if (error) return { ok: false, message: friendlyError(error.message) };
  revalidatePath("/customers");
  return { ok: true, message: "Đã tạo khách hàng.", customerId: String(data) };
}

const updateSchema = z.object({
  customerId: z.uuid(), fullName: z.string().trim().min(2).max(120), phone: nullableText(30),
  email: z.union([z.literal(""), z.email()]).transform((v) => v || null), sourceId: z.uuid(),
  status: z.enum(CUSTOMER_STATUSES), statusReason: nullableText(500), priority: z.enum(CUSTOMER_PRIORITIES), noteSummary: nullableText(2000),
}).refine((value) => value.phone || value.email, { message: "Cần ít nhất số điện thoại hoặc email." });

export async function updateCustomerAction(_: CustomerActionState, formData: FormData): Promise<CustomerActionState> {
  const parsed = updateSchema.safeParse(formObject(formData));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Dữ liệu chưa hợp lệ." };
  const supabase = await authenticatedClient();
  if (!supabase) return { ok: false, message: "Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại." };
  const { customerId, ...value } = parsed.data;
  const { data, error } = await supabase.from("customers").update({ full_name: value.fullName, phone: value.phone, email: value.email, source_id: value.sourceId, status: value.status, status_reason: value.statusReason, priority: value.priority, note_summary: value.noteSummary }).eq("id", customerId).select("id").maybeSingle();
  if (error) return { ok: false, message: friendlyError(error.message) };
  if (!data) return { ok: false, message: "Khách hàng không tồn tại hoặc bạn không có quyền sửa." };
  revalidatePath("/customers");
  return { ok: true, message: "Đã cập nhật khách hàng.", customerId };
}

export async function transferCustomerAction(_: CustomerActionState, formData: FormData): Promise<CustomerActionState> {
  const parsed = z.object({ customerId: z.uuid(), ownerUserId: z.uuid(), reason: z.string().trim().min(3).max(500), taskPolicy: z.enum(["reassign", "cancel"]) }).safeParse(formObject(formData));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Dữ liệu chưa hợp lệ." };
  const supabase = await authenticatedClient();
  if (!supabase) return { ok: false, message: "Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại." };
  const { error } = await supabase.rpc("transfer_customer", { target_customer_id: parsed.data.customerId, new_owner_user_id: parsed.data.ownerUserId, transfer_reason: parsed.data.reason, task_policy: parsed.data.taskPolicy });
  if (error) return { ok: false, message: friendlyError(error.message) };
  revalidatePath("/customers");
  return { ok: true, message: "Đã chuyển người phụ trách.", customerId: parsed.data.customerId };
}

export async function deleteCustomerAction(_: CustomerActionState, formData: FormData): Promise<CustomerActionState> {
  const parsed = z.object({ customerId: z.uuid(), reason: z.string().trim().min(3).max(500) }).safeParse(formObject(formData));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Cần nhập lý do xóa." };
  const supabase = await authenticatedClient();
  if (!supabase) return { ok: false, message: "Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại." };
  const { error } = await supabase.rpc("soft_delete_customer", { target_customer_id: parsed.data.customerId, delete_reason: parsed.data.reason });
  if (error) return { ok: false, message: friendlyError(error.message) };
  revalidatePath("/customers");
  return { ok: true, message: "Đã xóa mềm khách hàng." };
}

export async function setCustomerTagsAction(_: CustomerActionState, formData: FormData): Promise<CustomerActionState> {
  const parsed = z.object({ customerId: z.uuid(), tagIds: z.array(z.uuid()).max(10) }).safeParse({
    customerId: formData.get("customerId"), tagIds: formData.getAll("tagIds"),
  });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Danh sách nhãn chưa hợp lệ." };
  const supabase = await authenticatedClient();
  if (!supabase) return { ok: false, message: "Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại." };
  const { error } = await supabase.rpc("set_customer_tags", { target_customer_id: parsed.data.customerId, target_tag_ids: parsed.data.tagIds });
  if (error) return { ok: false, message: friendlyError(error.message) };
  revalidatePath("/customers");
  return { ok: true, message: "Đã cập nhật nhãn.", customerId: parsed.data.customerId };
}

function vietnamDateTime(value: string | null) {
  if (!value || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const date = new Date(`${value}:00+07:00`);
  return Number.isNaN(date.valueOf()) ? null : date.toISOString();
}

export async function recordActivityAction(_: CustomerActionState, formData: FormData): Promise<CustomerActionState> {
  const parsed = z.object({
    customerId: z.uuid(), type: z.enum(ACTIVITY_TYPES),
    outcome: z.union([z.literal(""), z.enum(ACTIVITY_OUTCOMES)]).transform((value) => value || null),
    content: nullableText(4000), occurredAt: z.string(), nextAction: nullableText(500),
    followUpAt: z.string().optional(), priority: z.enum(CUSTOMER_PRIORITIES),
  }).safeParse(formObject(formData));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Activity chưa hợp lệ." };
  const occurredAt = parsed.data.occurredAt ? vietnamDateTime(parsed.data.occurredAt) : new Date().toISOString();
  const followUpAt = vietnamDateTime(parsed.data.followUpAt || null);
  if (!occurredAt) return { ok: false, message: "Thời gian activity chưa hợp lệ." };
  if (parsed.data.followUpAt && !followUpAt) return { ok: false, message: "Thời gian follow-up chưa hợp lệ." };
  const supabase = await authenticatedClient();
  if (!supabase) return { ok: false, message: "Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại." };
  const { error } = await supabase.rpc("record_activity_with_follow_up", {
    target_customer_id: parsed.data.customerId, activity_kind: parsed.data.type, activity_outcome: parsed.data.outcome,
    activity_content: parsed.data.content, activity_occurred_at: occurredAt, activity_next_action: parsed.data.nextAction,
    activity_follow_up_at: followUpAt, task_priority: parsed.data.priority,
  });
  if (error) return { ok: false, message: friendlyError(error.message) };
  revalidatePath("/customers");
  return { ok: true, message: "Đã ghi hoạt động chăm sóc.", customerId: parsed.data.customerId };
}

export async function manageFollowUpTaskAction(_: CustomerActionState, formData: FormData): Promise<CustomerActionState> {
  const parsed = z.object({ taskId: z.uuid(), action: z.enum(["complete", "cancel", "reschedule"]), reason: z.string().trim().min(3).max(500), dueAt: z.string().optional() }).safeParse(formObject(formData));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Thao tác follow-up chưa hợp lệ." };
  const newDueAt = vietnamDateTime(parsed.data.dueAt || null);
  if (parsed.data.action === "reschedule" && !newDueAt) return { ok: false, message: "Hãy chọn lịch mới hợp lệ." };
  const supabase = await authenticatedClient();
  if (!supabase) return { ok: false, message: "Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại." };
  const { error } = await supabase.rpc("manage_follow_up_task", { target_task_id: parsed.data.taskId, task_action: parsed.data.action, task_reason: parsed.data.reason, new_due_at: newDueAt });
  if (error) return { ok: false, message: friendlyError(error.message) };
  revalidatePath("/customers");
  return { ok: true, message: parsed.data.action === "reschedule" ? "Đã dời lịch." : parsed.data.action === "complete" ? "Đã hoàn thành follow-up." : "Đã hủy follow-up." };
}
