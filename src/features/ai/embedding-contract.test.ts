import { describe, expect, it } from "vitest";
import { assertEmbeddingInputs, parseEmbeddingVectors, toPgVector } from "./embedding-contract";

const vector = (first = 1) => [first, ...Array.from({ length: 1535 }, () => 0)];

describe("Gemini embedding contract", () => {
  it("accepts bounded non-empty batches", () => {
    expect(() => assertEmbeddingInputs(["Nội dung tài liệu giả"])).not.toThrow();
    expect(() => assertEmbeddingInputs([])).toThrow("embedding_batch_invalid");
    expect(() => assertEmbeddingInputs(Array.from({ length: 65 }, () => "chunk"))).toThrow("embedding_batch_invalid");
  });

  it("preserves response order and enforces 1536 dimensions", () => {
    const values = parseEmbeddingVectors({
      embeddings: [{ values: vector(1) }, { values: vector(2) }],
    }, 2);
    expect(values[0][0]).toBe(1);
    expect(values[1][0]).toBe(2);
    expect(() => parseEmbeddingVectors({ embeddings: [{ values: [1, 2] }] }, 1)).toThrow("embedding_response_invalid");
    expect(() => parseEmbeddingVectors({}, 1)).toThrow("embedding_response_invalid");
  });

  it("serializes only finite vectors for pgvector RPC arguments", () => {
    expect(toPgVector(vector())).toMatch(/^\[1,0,/);
    expect(() => toPgVector([1, 2])).toThrow("embedding_vector_invalid");
    expect(() => toPgVector([Number.NaN, ...Array.from({ length: 1535 }, () => 0)])).toThrow("embedding_vector_invalid");
  });
});
