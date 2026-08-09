import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { AppRole } from "@/lib/access";
import type { DocumentQuery } from "./query";
import type { DocumentListItem, DocumentScope, DocumentsWorkspace, DocumentVersion, EmbeddingStatus, ExtractionStatus } from "./types";

type RawDocument = {
  id: string; title: string; scope_type: DocumentScope; team_id: string | null; user_id: string | null;
  status: "active" | "archived"; updated_at: string; document_folders: { name: string } | null;
  teams: { name: string } | null; profiles: { full_name: string } | null;
  document_versions: null | { id: string; version_no: number; original_file_name: string; mime_type: string; size_bytes: number; extraction_status: ExtractionStatus; embedding_status: EmbeddingStatus };
};

function canManage(role: AppRole, viewerTeam: string | null, row: Pick<RawDocument, "scope_type" | "team_id">) {
  return role === "admin" || (role === "leader" && row.scope_type === "team" && row.team_id === viewerTeam);
}

function mapDocument(row: RawDocument, role: AppRole, teamId: string | null): DocumentListItem {
  const version = Array.isArray(row.document_versions) ? row.document_versions[0] : row.document_versions;
  return {
    id: row.id, title: row.title, scope: row.scope_type,
    scopeName: row.scope_type === "organization" ? "Toàn công ty" : row.scope_type === "team" ? row.teams?.name ?? "Team" : row.profiles?.full_name ?? "Cá nhân",
    folderName: row.document_folders?.name ?? null, status: row.status, updatedAt: row.updated_at,
    canManage: canManage(role, teamId, row),
    currentVersion: version ? { id: version.id, versionNo: version.version_no, fileName: version.original_file_name, mimeType: version.mime_type, sizeBytes: Number(version.size_bytes), extractionStatus: version.extraction_status, embeddingStatus: version.embedding_status } : null,
  };
}

export async function getDocumentsWorkspace(query: DocumentQuery): Promise<DocumentsWorkspace> {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims(); const userId = String(claims?.claims?.sub ?? "");
  if (!userId) throw new Error("Phiên đăng nhập không hợp lệ.");
  const { data: profile, error: profileError } = await supabase.from("profiles").select("role, team_id").eq("id", userId).single();
  if (profileError || !profile) throw new Error("Không thể xác định quyền người dùng.");
  const role = profile.role as AppRole;
  let searchIds: string[] | null = null;
  if (query.q) {
    const { data, error } = await supabase.rpc("search_document_ids", { search_text: query.q });
    if (error) throw new Error(`Không thể tìm tài liệu: ${error.message}`);
    searchIds = (data ?? []).map((item: { document_id: string }) => item.document_id);
  }
  const versionRelation = query.extraction ? "document_versions!documents_current_version_fk!inner" : "document_versions!documents_current_version_fk";
  const select = `id, title, scope_type, team_id, user_id, status, updated_at, document_folders(name), teams(name), profiles!documents_user_id_fkey(full_name), ${versionRelation}(id, version_no, original_file_name, mime_type, size_bytes, extraction_status, embedding_status)`;
  let request = supabase.from("documents").select(select).order("updated_at", { ascending: false }).limit(100);
  if (searchIds) request = searchIds.length ? request.in("id", searchIds) : request.eq("id", "00000000-0000-0000-0000-000000000000");
  if (query.scope) request = request.eq("scope_type", query.scope);
  if (query.folder) request = request.eq("folder_id", query.folder);
  if (query.extraction) request = request.eq("document_versions.extraction_status", query.extraction);
  const [documentResult, teamResult, userResult, folderResult] = await Promise.all([
    request,
    role === "admin" ? supabase.from("teams").select("id, name").eq("is_active", true).order("name") : Promise.resolve({ data: [] }),
    role === "admin" ? supabase.from("profiles").select("id, full_name, team_id").eq("is_active", true).order("full_name") : Promise.resolve({ data: [] }),
    supabase.from("document_folders").select("id, name, scope_type, team_id, user_id").order("name"),
  ]);
  if (documentResult.error) throw new Error(`Không tải được tài liệu: ${documentResult.error.message}`);
  const documents = (documentResult.data ?? []).map((item) => mapDocument(item as unknown as RawDocument, role, profile.team_id));
  const selected = query.document ? documents.find((item) => item.id === query.document) ?? null : null;
  let versions: DocumentVersion[] = [];
  if (selected) {
    const { data, error } = await supabase.from("document_versions").select("id, version_no, original_file_name, mime_type, size_bytes, extraction_status, extraction_error, embedding_status, embedding_error, created_at, uploaded_by").eq("document_id", selected.id).order("version_no", { ascending: false });
    if (error) throw new Error(`Không tải được phiên bản: ${error.message}`);
    const uploaderIds = [...new Set((data ?? []).map((item) => item.uploaded_by))];
    const uploaderResult = uploaderIds.length
      ? await supabase.from("profiles").select("id, full_name").in("id", uploaderIds)
      : { data: [] };
    const uploaderNames = new Map((uploaderResult.data ?? []).map((item) => [item.id, item.full_name]));
    versions = (data ?? []).map((item) => ({
      id: item.id, versionNo: item.version_no, fileName: item.original_file_name, mimeType: item.mime_type,
      sizeBytes: Number(item.size_bytes), extractionStatus: item.extraction_status as ExtractionStatus,
      extractionError: item.extraction_error, embeddingStatus: item.embedding_status as EmbeddingStatus,
      embeddingError: item.embedding_error, createdAt: item.created_at,
      uploaderName: uploaderNames.get(item.uploaded_by) ?? "Thành viên",
    }));
  }
  return {
    viewer: { id: userId, role, teamId: profile.team_id }, documents, selected, versions,
    teams: (teamResult.data ?? []).map((item) => ({ id: item.id, name: item.name })),
    users: (userResult.data ?? []).map((item) => ({ id: item.id, name: item.full_name, teamId: item.team_id })),
    folders: (folderResult.data ?? []).map((item) => ({ id: item.id, name: item.name, scope: item.scope_type as DocumentScope, teamId: item.team_id, userId: item.user_id })),
  };
}
