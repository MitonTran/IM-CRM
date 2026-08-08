import { processPendingDocumentEmbeddings } from "@/features/documents/embedding-worker";
import { processPendingDocuments } from "@/features/documents/worker";
import { hasValidCronAuthorization } from "@/lib/cron-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  if (!hasValidCronAuthorization(request.headers.get("authorization"))) return new Response("Unauthorized", { status: 401 });
  const results = await processPendingDocuments(5);
  const embeddingResults = await processPendingDocumentEmbeddings(2);
  return Response.json({
    processed: results.length,
    ready: results.filter((item) => item.status === "ready").length,
    failed: results.filter((item) => item.status === "failed").length,
    unsupported: results.filter((item) => item.status === "unsupported").length,
    embeddingProcessed: embeddingResults.length,
    embeddingReady: embeddingResults.filter((item) => item.status === "ready").length,
    embeddingPending: embeddingResults.filter((item) => item.status === "pending").length,
    embeddingFailed: embeddingResults.filter((item) => item.status === "failed").length,
  });
}
