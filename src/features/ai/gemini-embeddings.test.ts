import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createGeminiEmbeddings } from "./gemini-embeddings";

const previousGeminiKey = process.env.GEMINI_API_KEY;
const previousGeminiEmbeddingModel = process.env.GEMINI_EMBEDDING_MODEL;
const vector = () => Array.from({ length: 1536 }, (_, index) => index / 1536);

beforeEach(() => {
  process.env.GEMINI_API_KEY = "gemini-test-only";
  delete process.env.GEMINI_EMBEDDING_MODEL;
});

afterEach(() => {
  process.env.GEMINI_API_KEY = previousGeminiKey;
  process.env.GEMINI_EMBEDDING_MODEL = previousGeminiEmbeddingModel;
  vi.unstubAllGlobals();
});

describe("Gemini embeddings client", () => {
  it("sends a bounded batch with the retrieval task and 1536 dimensions", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      embeddings: [{ values: vector() }, { values: vector() }],
    }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await createGeminiEmbeddings(["Tài liệu giả A", "Tài liệu giả B"], "RETRIEVAL_DOCUMENT");

    expect(result).toHaveLength(2);
    const [url, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:batchEmbedContents");
    expect(request.headers).toMatchObject({ "x-goog-api-key": "gemini-test-only" });
    const body = JSON.parse(String(request.body));
    expect(body.requests).toHaveLength(2);
    expect(body.requests[0]).toMatchObject({
      model: "models/gemini-embedding-001",
      embedContentConfig: { taskType: "RETRIEVAL_DOCUMENT", outputDimensionality: 1536 },
    });
    expect(String(request.body)).not.toContain("gemini-test-only");
  });

  it("fails closed without returning provider error bodies", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("provider detail", { status: 429 })));
    await expect(createGeminiEmbeddings(["Câu hỏi giả"], "RETRIEVAL_QUERY"))
      .rejects.toMatchObject({ message: "gemini_embedding_quota_exceeded", code: "quota_exceeded" });
  });

  it.each([
    [400, "invalid_request"],
    [401, "unauthorized"],
    [403, "unauthorized"],
    [500, "provider_unavailable"],
    [418, "request_failed"],
  ])("maps HTTP %s to the safe failure code %s", async (status, code) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("provider detail", { status })));
    await expect(createGeminiEmbeddings(["Câu hỏi giả"], "RETRIEVAL_QUERY"))
      .rejects.toMatchObject({ code });
  });
});
