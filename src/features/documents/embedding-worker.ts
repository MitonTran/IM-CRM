import "server-only";

import { EMBEDDING_BATCH_SIZE } from "@/features/ai/embedding-contract";
import { createOpenAiEmbeddings } from "@/features/ai/openai-embeddings";
import { OPENAI_EMBEDDING_MODEL, hasOpenAiEmbeddingEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";

type ClaimedEmbedding = { version_id: string };
type ChunkForEmbedding = { id: string; content: string };
export type EmbeddingResult = { versionId: string | null; status: "ready" | "pending" | "failed" | "empty"; chunks?: number };

async function claimNextEmbedding() {
  const admin = createAdminClient();
  const result = await admin.rpc("claim_next_document_embedding");
  if (result.error) throw new Error("document_embedding_claim_failed");
  return ((result.data ?? [])[0] as ClaimedEmbedding | undefined) ?? null;
}

async function failEmbedding(versionId: string) {
  const admin = createAdminClient();
  await admin.rpc("fail_document_embedding", {
    target_version_id: versionId,
    safe_error: "Không thể tạo chỉ mục ngữ nghĩa. Tìm kiếm từ khóa vẫn hoạt động.",
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
    const vectors = await createOpenAiEmbeddings(chunks.map((chunk) => chunk.content));
    const stored = await admin.rpc("store_document_embedding_batch", {
      target_version_id: row.version_id,
      model_name: OPENAI_EMBEDDING_MODEL,
      embeddings: chunks.map((chunk, index) => ({ chunk_id: chunk.id, embedding: vectors[index] })),
    });
    if (stored.error || typeof stored.data !== "number") throw new Error("document_embedding_commit_failed");
    return { versionId: row.version_id, status: stored.data === 0 ? "ready" : "pending", chunks: chunks.length };
  } catch {
    await failEmbedding(row.version_id);
    return { versionId: row.version_id, status: "failed" };
  }
}

export async function processPendingDocumentEmbeddings(limit = 2): Promise<EmbeddingResult[]> {
  if (!hasOpenAiEmbeddingEnv()) return [];
  const bounded = Math.max(1, Math.min(5, Math.trunc(limit)));
  const results: EmbeddingResult[] = [];
  for (let index = 0; index < bounded; index += 1) {
    const row = await claimNextEmbedding();
    if (!row) break;
    results.push(await processClaimedEmbedding(row));
  }
  return results;
}
