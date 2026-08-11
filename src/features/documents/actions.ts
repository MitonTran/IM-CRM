"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { processDocumentVersion } from "./worker";
import { MAX_DOCUMENT_FILE_BYTES } from "./upload-validation";

const fileSchema = z.object({
  title: z.string().trim().min(1).max(200), fileName: z.string().trim().min(1).max(255),
  mimeType: z.string().min(1).max(150), sizeBytes: z.number().int().min(1).max(MAX_DOCUMENT_FILE_BYTES),
  scope: z.enum(["organization", "team", "user"]), teamId: z.uuid().nullable(), userId: z.uuid().nullable(), folderId: z.uuid().nullable(),
});
const versionSchema = fileSchema.pick({ fileName: true, mimeType: true, sizeBytes: true }).extend({ documentId: z.uuid() });

async function authenticatedClient() {
  const supabase = await createClient(); const { data, error } = await supabase.auth.getClaims();
  return error || !data?.claims?.sub ? null : supabase;
}
function uploadError(message: string) {
  if (message.includes("manage_denied")) return "Bạn không có quyền tải tài liệu cho người được chọn.";
  if (message.includes("file_size")) return "Tệp phải lớn hơn 0 và không vượt quá 25 MB.";
  if (message.includes("file_type")) return "Định dạng hoặc phần mở rộng tệp chưa được hỗ trợ.";
  if (message.includes("folder_scope")) return "Thư mục không phù hợp với người được xem.";
  return "Không thể chuẩn bị phiên tải lên.";
}
export type UploadPreparation = { ok: boolean; message: string; documentId?: string; versionId?: string; storagePath?: string };

export async function prepareDocumentUpload(input: unknown): Promise<UploadPreparation> {
  const parsed = fileSchema.safeParse(input); if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Thông tin tệp chưa hợp lệ." };
  const supabase = await authenticatedClient(); if (!supabase) return { ok: false, message: "Phiên đăng nhập đã hết hạn." };
  const { data, error } = await supabase.rpc("create_document_upload", {
    document_title: parsed.data.title, folder_id: parsed.data.folderId, document_scope: parsed.data.scope,
    document_team_id: parsed.data.scope === "team" ? parsed.data.teamId : null,
    document_user_id: parsed.data.scope === "user" ? parsed.data.userId : null,
    original_file_name: parsed.data.fileName, file_mime_type: parsed.data.mimeType, file_size_bytes: parsed.data.sizeBytes,
  });
  if (error) return { ok: false, message: uploadError(error.message) };
  const result = data as { documentId: string; versionId: string; storagePath: string };
  return { ok: true, message: "Đã chuẩn bị tải lên.", ...result };
}

export async function prepareDocumentVersionUpload(input: unknown): Promise<UploadPreparation> {
  const parsed = versionSchema.safeParse(input); if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Thông tin tệp chưa hợp lệ." };
  const supabase = await authenticatedClient(); if (!supabase) return { ok: false, message: "Phiên đăng nhập đã hết hạn." };
  const { data, error } = await supabase.rpc("create_document_version_upload", { target_document_id: parsed.data.documentId, original_file_name: parsed.data.fileName, file_mime_type: parsed.data.mimeType, file_size_bytes: parsed.data.sizeBytes });
  if (error) return { ok: false, message: uploadError(error.message) };
  const result = data as { documentId: string; versionId: string; storagePath: string };
  return { ok: true, message: "Đã chuẩn bị phiên bản mới.", ...result };
}

export async function finalizeDocumentUpload(versionId: string, checksum: string): Promise<UploadPreparation> {
  const parsed = z.object({ versionId: z.uuid(), checksum: z.string().regex(/^[a-f0-9]{64}$/) }).safeParse({ versionId, checksum });
  if (!parsed.success) return { ok: false, message: "Tệp chưa thể xác minh. Vui lòng tải lại." };
  const supabase = await authenticatedClient(); if (!supabase) return { ok: false, message: "Phiên đăng nhập đã hết hạn." };
  const { error } = await supabase.rpc("finalize_document_upload", { target_version_id: versionId, checksum });
  if (error) return { ok: false, message: "Tệp đã tải lên nhưng chưa thể hoàn tất. Vui lòng thử lại." };
  revalidatePath("/documents"); return { ok: true, message: "Tải tài liệu thành công." };
}

export type DocumentActionState = { ok: boolean; message: string };
export async function createFolderAction(_: DocumentActionState, formData: FormData): Promise<DocumentActionState> {
  const parsed = z.object({ name: z.string().trim().min(1).max(120), scope: z.enum(["organization", "team", "user"]), subjectId: z.union([z.uuid(), z.literal("")]) }).safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, message: "Thông tin thư mục chưa hợp lệ." };
  const supabase = await authenticatedClient(); if (!supabase) return { ok: false, message: "Phiên đăng nhập đã hết hạn." };
  const { error } = await supabase.rpc("create_document_folder", { folder_name: parsed.data.name, folder_scope: parsed.data.scope, folder_team_id: parsed.data.scope === "team" ? parsed.data.subjectId || null : null, folder_user_id: parsed.data.scope === "user" ? parsed.data.subjectId || null : null, parent_folder_id: null });
  if (error) return { ok: false, message: uploadError(error.message) };
  revalidatePath("/documents"); return { ok: true, message: "Đã tạo thư mục." };
}

export async function deleteDocumentAction(_: DocumentActionState, formData: FormData): Promise<DocumentActionState> {
  const parsed = z.object({ documentId: z.uuid(), reason: z.string().trim().min(3).max(500) }).safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, message: "Cần nhập lý do ngừng sử dụng tối thiểu 3 ký tự." };
  const supabase = await authenticatedClient(); if (!supabase) return { ok: false, message: "Phiên đăng nhập đã hết hạn." };
  const { error } = await supabase.rpc("soft_delete_document", { target_document_id: parsed.data.documentId, reason: parsed.data.reason });
  if (error) return { ok: false, message: error.message.includes("denied") ? "Bạn không có quyền ngừng sử dụng tài liệu này." : "Không thể ngừng sử dụng tài liệu." };
  revalidatePath("/documents"); return { ok: true, message: "Đã ngừng sử dụng tài liệu." };
}

export async function processDocumentNowAction(_: DocumentActionState, formData: FormData): Promise<DocumentActionState> {
  const parsed = z.object({ versionId: z.uuid() }).safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, message: "Phiên bản chưa hợp lệ." };
  const supabase = await authenticatedClient(); if (!supabase) return { ok: false, message: "Phiên đăng nhập đã hết hạn." };
  const { data: version } = await supabase.from("document_versions").select("document_id, extraction_status").eq("id", parsed.data.versionId).single();
  if (!version) return { ok: false, message: "Không tìm thấy phiên bản hoặc bạn không có quyền." };
  const { data: allowed } = await supabase.rpc("can_manage_document", { target_document_id: version.document_id });
  if (!allowed) return { ok: false, message: "Bạn không có quyền xử lý tài liệu này." };
  if (version.extraction_status === "failed") {
    const { error } = await supabase.rpc("retry_document_extraction", { target_version_id: parsed.data.versionId });
    if (error) return { ok: false, message: "Chưa thể xử lý lại tài liệu. Vui lòng thử lại." };
  } else if (version.extraction_status !== "pending") {
    return { ok: false, message: version.extraction_status === "unsupported" ? "Định dạng này hiện chỉ có thể tải xuống." : "Phiên bản không ở trạng thái chờ xử lý." };
  }
  try {
    const result = await processDocumentVersion(parsed.data.versionId); revalidatePath("/documents");
    if (result.status === "ready") return { ok: true, message: "Đã xử lý nội dung tài liệu." };
    if (result.status === "unsupported") return { ok: false, message: "Không đọc được nội dung tệp. Bạn vẫn có thể tải tệp xuống." };
    return { ok: false, message: "Không đọc được nội dung tài liệu. Hãy kiểm tra tệp và thử lại." };
  } catch { return { ok: false, message: "Chưa thể xử lý tài liệu lúc này. Vui lòng liên hệ quản trị viên." }; }
}

export async function retryDocumentEmbeddingAction(_: DocumentActionState, formData: FormData): Promise<DocumentActionState> {
  const parsed = z.object({ versionId: z.uuid() }).safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, message: "Phiên bản chưa hợp lệ." };
  const supabase = await authenticatedClient();
  if (!supabase) return { ok: false, message: "Phiên đăng nhập đã hết hạn." };
  const { data: version } = await supabase.from("document_versions")
    .select("document_id, extraction_status, embedding_status")
    .eq("id", parsed.data.versionId)
    .single();
  if (!version) return { ok: false, message: "Không tìm thấy phiên bản hoặc bạn không có quyền." };
  const { data: allowed } = await supabase.rpc("can_manage_document", { target_document_id: version.document_id });
  if (!allowed) return { ok: false, message: "Bạn không có quyền chuẩn bị lại tài liệu này cho trợ lý AI." };
  if (version.extraction_status !== "ready" || version.embedding_status !== "failed") {
    return { ok: false, message: "Tài liệu chưa thể chuẩn bị lại cho trợ lý AI lúc này." };
  }
  const { error } = await supabase.rpc("retry_document_embedding", { target_version_id: parsed.data.versionId });
  if (error) return { ok: false, message: "Chưa thể chuẩn bị lại tài liệu cho trợ lý AI." };
  revalidatePath("/documents");
  return { ok: true, message: "Đang chuẩn bị lại tài liệu cho trợ lý AI." };
}
