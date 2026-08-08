import "server-only";

import OpenAI from "openai";
import { getOpenAiEmbeddingConfig } from "@/lib/env";
import { assertEmbeddingInputs, parseEmbeddingVectors } from "./embedding-contract";

export async function createOpenAiEmbeddings(inputs: string[]) {
  assertEmbeddingInputs(inputs);
  const config = getOpenAiEmbeddingConfig();
  const client = new OpenAI({ apiKey: config.apiKey, timeout: 20_000, maxRetries: 1 });
  const response = await client.embeddings.create({
    model: config.model,
    input: inputs,
    encoding_format: "float",
    dimensions: config.dimensions,
  });
  return parseEmbeddingVectors({ model: response.model, data: response.data }, inputs.length);
}
