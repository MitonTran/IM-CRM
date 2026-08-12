import { EMBEDDING_DIMENSIONS } from "@/lib/env";

export const EMBEDDING_BATCH_SIZE = 64;

export function assertEmbeddingInputs(inputs: string[]) {
  if (!inputs.length || inputs.length > EMBEDDING_BATCH_SIZE) throw new Error("embedding_batch_invalid");
  if (inputs.some((value) => !value.trim() || value.length > 3000)) throw new Error("embedding_input_invalid");
}

export function parseEmbeddingVectors(input: {
  embeddings?: Array<{ values?: number[] }>;
}, expectedCount: number) {
  if (!input.embeddings || input.embeddings.length !== expectedCount) {
    throw new Error("embedding_response_invalid");
  }
  const vectors = input.embeddings.map((item) => item.values);
  if (vectors.some((values) => !values || values.length !== EMBEDDING_DIMENSIONS || values.some((value) => !Number.isFinite(value)))) {
    throw new Error("embedding_response_invalid");
  }
  return vectors as number[][];
}

export function toPgVector(values: number[]) {
  if (values.length !== EMBEDDING_DIMENSIONS || values.some((value) => !Number.isFinite(value))) {
    throw new Error("embedding_vector_invalid");
  }
  return `[${values.join(",")}]`;
}
