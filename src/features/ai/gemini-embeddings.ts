import "server-only";

import { getGeminiEmbeddingConfig } from "@/lib/env";
import { assertEmbeddingInputs, parseEmbeddingVectors } from "./embedding-contract";

export type GeminiEmbeddingTask = "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY";
export type GeminiEmbeddingFailureCode =
  | "invalid_request"
  | "unauthorized"
  | "quota_exceeded"
  | "provider_unavailable"
  | "request_failed";

export class GeminiEmbeddingError extends Error {
  constructor(public readonly code: GeminiEmbeddingFailureCode) {
    super(`gemini_embedding_${code}`);
    this.name = "GeminiEmbeddingError";
  }
}

function failureCodeForStatus(status: number): GeminiEmbeddingFailureCode {
  if (status === 400 || status === 404) return "invalid_request";
  if (status === 401 || status === 403) return "unauthorized";
  if (status === 429) return "quota_exceeded";
  if (status >= 500) return "provider_unavailable";
  return "request_failed";
}

export async function createGeminiEmbeddings(inputs: string[], taskType: GeminiEmbeddingTask) {
  assertEmbeddingInputs(inputs);
  const config = getGeminiEmbeddingConfig();
  const model = `models/${config.model}`;
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/${model}:batchEmbedContents`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-goog-api-key": config.apiKey,
      },
      body: JSON.stringify({
        requests: inputs.map((text) => ({
          model,
          content: { parts: [{ text }] },
          embedContentConfig: {
            taskType,
            outputDimensionality: config.dimensions,
          },
        })),
      }),
      signal: AbortSignal.timeout(20_000),
    },
  );
  if (!response.ok) throw new GeminiEmbeddingError(failureCodeForStatus(response.status));
  return parseEmbeddingVectors(await response.json() as { embeddings?: Array<{ values?: number[] }> }, inputs.length);
}
