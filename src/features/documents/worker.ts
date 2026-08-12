import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { chunkSections, extractDocument, fullExtractedText } from "./extractors";

type ClaimedVersion = { version_id: string; document_id: string; storage_path: string; mime_type: string; size_bytes: number };
export type ExtractionResult = { versionId: string | null; status: "ready" | "failed" | "unsupported" | "empty"; chunks?: number };

async function markFinished(versionId: string, status: "failed" | "unsupported", safeError?: string) {
  const admin = createAdminClient();
  await admin.rpc("fail_document_extraction", { target_version_id: versionId, final_status: status, safe_error: status === "failed" ? safeError ?? "Không đọc được nội dung tài liệu." : null });
}

async function processClaimed(row: ClaimedVersion): Promise<ExtractionResult> {
  const admin = createAdminClient();
  if (row.mime_type.startsWith("image/")) { await markFinished(row.version_id, "unsupported"); return { versionId: row.version_id, status: "unsupported" }; }
  try {
    const { data: blob, error: downloadError } = await admin.storage.from("documents").download(row.storage_path);
    if (downloadError || !blob || blob.size !== Number(row.size_bytes)) throw new Error("document_download_or_size_mismatch");
    const sections = await extractDocument(new Uint8Array(await blob.arrayBuffer()), row.mime_type);
    const chunks = chunkSections(sections); const text = fullExtractedText(sections);
    if (!chunks.length || !text) { await markFinished(row.version_id, "unsupported"); return { versionId: row.version_id, status: "unsupported" }; }
    const textPath = `${row.document_id}/${row.version_id}.txt`;
    const { error: uploadError } = await admin.storage.from("document-extracted").upload(textPath, new Blob([text], { type: "text/plain;charset=utf-8" }), { contentType: "text/plain", upsert: true });
    if (uploadError) throw new Error("document_extracted_text_upload_failed");
    const { error: completeError } = await admin.rpc("complete_document_extraction", { target_version_id: row.version_id, text_storage_path: textPath, chunks });
    if (completeError) throw new Error("document_extraction_commit_failed");
    return { versionId: row.version_id, status: "ready", chunks: chunks.length };
  } catch {
    await markFinished(row.version_id, "failed", "Không đọc được nội dung tài liệu. Hãy kiểm tra tệp và thử lại.");
    return { versionId: row.version_id, status: "failed" };
  }
}

async function claim(versionId?: string) {
  const admin = createAdminClient();
  const result = versionId ? await admin.rpc("claim_document_extraction", { target_version_id: versionId }) : await admin.rpc("claim_next_document_extraction");
  if (result.error) throw new Error("document_extraction_claim_failed");
  return ((result.data ?? [])[0] as ClaimedVersion | undefined) ?? null;
}

export async function processDocumentVersion(versionId: string): Promise<ExtractionResult> {
  const row = await claim(versionId); return row ? processClaimed(row) : { versionId: null, status: "empty" };
}

export async function processPendingDocuments(limit = 5): Promise<ExtractionResult[]> {
  const bounded = Math.max(1, Math.min(10, Math.trunc(limit))); const results: ExtractionResult[] = [];
  for (let index = 0; index < bounded; index += 1) { const row = await claim(); if (!row) break; results.push(await processClaimed(row)); }
  return results;
}
