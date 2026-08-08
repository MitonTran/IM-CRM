import "server-only";

import { getGeminiEmbeddingConfig } from "@/lib/env";
import { assertEmbeddingInputs, parseEmbeddingVectors } from "./embedding-contract";

export type GeminiEmbeddingTask = "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY";

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
  if (!response.ok) throw new Error("gemini_embedding_request_failed");
  return parseEmbeddingVectors(await response.json() as { embeddings?: Array<{ values?: number[] }> }, inputs.length);
}
