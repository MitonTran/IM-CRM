import { describe, expect, it } from "vitest";
import { parseDealQuery } from "./query";

describe("deal query", () => {
  it("rejects unknown states and malformed dates", () => {
    expect(parseDealQuery({ status: "deleted", from: "yesterday", page: "0" })).toMatchObject({ status: "active", from: "", page: 1 });
  });
});

