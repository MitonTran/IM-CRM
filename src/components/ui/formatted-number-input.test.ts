import { describe, expect, it } from "vitest";
import { formatWholeNumberInput, normalizeWholeNumberInput } from "./formatted-number-input";

describe("formatted whole-number input", () => {
  it("formats groups of three digits with Vietnamese separators", () => {
    expect(formatWholeNumberInput("50000")).toBe("50.000");
    expect(formatWholeNumberInput("25000000")).toBe("25.000.000");
  });

  it("normalizes typed or pasted formatted values before submission", () => {
    expect(normalizeWholeNumberInput("50.000")).toBe("50000");
    expect(normalizeWholeNumberInput("12abc.345 VND")).toBe("12345");
  });

  it("removes redundant leading zeroes and enforces the digit limit", () => {
    expect(normalizeWholeNumberInput("00050")).toBe("50");
    expect(normalizeWholeNumberInput("123456", 5)).toBe("12345");
  });
});
