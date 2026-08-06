import { describe, expect, it } from "vitest";
import { isValidBearerSecret } from "./cron-auth-core";

describe("cron authorization", () => {
  it("accepts only the exact bearer secret", () => {
    expect(isValidBearerSecret("Bearer 0123456789abcdef", "0123456789abcdef")).toBe(true);
    expect(isValidBearerSecret("Bearer 0123456789abcdeg", "0123456789abcdef")).toBe(false);
    expect(isValidBearerSecret("0123456789abcdef", "0123456789abcdef")).toBe(false);
  });

  it("rejects missing and weak server configuration", () => {
    expect(isValidBearerSecret("Bearer short", "short")).toBe(false);
    expect(isValidBearerSecret(null, undefined)).toBe(false);
  });
});
