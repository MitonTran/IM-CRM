import "server-only";

import { EMBEDDING_BATCH_SIZE } from "@/features/ai/embedding-contract";
import {
  createGeminiEmbeddings,
  GeminiEmbeddingError,
  type GeminiEmbeddingFailureCode,
} from "@/features/ai/gemini-embeddings";
import { GEMINI_EMBEDDING_MODEL, hasGeminiEmbeddingEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";

type ClaimedEmbedding = { version_id: string };
type ChunkForEmbedding = { id: string; content: string };
export type EmbeddingResult = {
  versionId: string | null;
  status: "ready" | "pending" | "failed" | "empty";
  chunks?: number;
  failureCode?: GeminiEmbeddingFailureCode;
};

function safeEmbeddingError(error: unknown) {
  if (!(error instanceof GeminiEmbeddingError)) {
    return "Không thể tạo chỉ mục ngữ nghĩa. Tìm kiếm từ khóa vẫn hoạt động.";
  }
  switch (error.code) {
    case "unauthorized":
      return "Gemini từ chối API key. Kiểm tra GEMINI_API_KEY của Preview.";
    case "quota_exceeded":
      return "Gemini đã hết quota hoặc đang giới hạn tần suất. Hãy thử lại sau.";
    case "invalid_request":
      return "Gemini không chấp nhận yêu cầu embedding. Kiểm tra cấu hình model.";
    case "provider_unavailable":
      return "Dịch vụ embedding Gemini đang tạm thời không khả dụng. Hãy thử lại sau.";
    default:
      return "Không thể gọi dịch vụ embedding Gemini. Tìm kiếm từ khóa vẫn hoạt động.";
  }
}

async function claimNextEmbedding() {
  const admin = createAdminClient();
  const result = await admin.rpc("claim_next_document_embedding");
  if (result.error) throw new Error("document_embedding_claim_failed");
  return ((result.data ?? [])[0] as ClaimedEmbedding | undefined) ?? null;
}

async function failEmbedding(versionId: string, safeError: string) {
  const admin = createAdminClient();
  await admin.rpc("fail_document_embedding", {
    target_version_id: versionId,
    safe_error: safeError,
  });
}

async function processClaimedEmbedding(row: ClaimedEmbedding): Promise<EmbeddingResult> {
  const admin = createAdminClient();
  try {
    const chunksQuery = await admin.from("document_chunks")
      .select("id, content")
      .eq("document_version_id", row.version_id)
      .is("embedding", null)
      .order("chunk_index", { ascending: true })
      .limit(EMBEDDING_BATCH_SIZE);
    if (chunksQuery.error) throw new Error("document_embedding_chunks_unavailable");
    const chunks = (chunksQuery.data ?? []) as ChunkForEmbedding[];
    if (!chunks.length) throw new Error("document_embedding_chunks_empty");
    const vectors = await createGeminiEmbeddings(chunks.map((chunk) => chunk.content), "RETRIEVAL_DOCUMENT");
    const stored = await admin.rpc("store_document_embedding_batch", {
      target_version_id: row.version_id,
      model_name: GEMINI_EMBEDDING_MODEL,
      embeddings: chunks.map((chunk, index) => ({ chunk_id: chunk.id, embedding: vectors[index] })),
    });
    if (stored.error || typeof stored.data !== "number") throw new Error("document_embedding_commit_failed");
    return { versionId: row.version_id, status: stored.data === 0 ? "ready" : "pending", chunks: chunks.length };
  } catch (error) {
    await failEmbedding(row.version_id, safeEmbeddingError(error));
    return {
      versionId: row.version_id,
      status: "failed",
      failureCode: error instanceof GeminiEmbeddingError ? error.code : undefined,
    };
  }
}

export async function processPendingDocumentEmbeddings(limit = 2): Promise<EmbeddingResult[]> {
  if (!hasGeminiEmbeddingEnv()) return [];
  const bounded = Math.max(1, Math.min(5, Math.trunc(limit)));
  const results: EmbeddingResult[] = [];
  for (let index = 0; index < bounded; index += 1) {
    const row = await claimNextEmbedding();
    if (!row) break;
    results.push(await processClaimedEmbedding(row));
  }
  return results;
}
