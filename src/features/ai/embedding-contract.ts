import { OPENAI_EMBEDDING_DIMENSIONS, OPENAI_EMBEDDING_MODEL } from "@/lib/env";

export const EMBEDDING_BATCH_SIZE = 64;

export function assertEmbeddingInputs(inputs: string[]) {
  if (!inputs.length || inputs.length > EMBEDDING_BATCH_SIZE) throw new Error("embedding_batch_invalid");
  if (inputs.some((value) => !value.trim() || value.length > 3000)) throw new Error("embedding_input_invalid");
}

export function parseEmbeddingVectors(input: {
  model: string;
  data: Array<{ index: number; embedding: number[] }>;
}, expectedCount: number) {
  if (input.model !== OPENAI_EMBEDDING_MODEL || input.data.length !== expectedCount) {
    throw new Error("embedding_response_invalid");
  }
  const sorted = [...input.data].sort((a, b) => a.index - b.index);
  if (sorted.some((item, index) => item.index !== index || item.embedding.length !== OPENAI_EMBEDDING_DIMENSIONS || item.embedding.some((value) => !Number.isFinite(value)))) {
    throw new Error("embedding_response_invalid");
  }
  return sorted.map((item) => item.embedding);
}

export function toPgVector(values: number[]) {
  if (values.length !== OPENAI_EMBEDDING_DIMENSIONS || values.some((value) => !Number.isFinite(value))) {
    throw new Error("embedding_vector_invalid");
  }
  return `[${values.join(",")}]`;
}
