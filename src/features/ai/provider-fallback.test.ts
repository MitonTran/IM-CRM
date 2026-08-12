import { afterEach, describe, expect, it, vi } from "vitest";
import { isRetryableGroqError, withAssistantProviderFallback } from "./provider-fallback";

const previousProvider = process.env.AI_PROVIDER;
const previousModel = process.env.AI_MODEL;
const previousGroqKey = process.env.GROQ_API_KEY;
const previousGeminiKey = process.env.GEMINI_API_KEY;
const previousGeminiFallbackModel = process.env.GEMINI_FALLBACK_MODEL;

afterEach(() => {
  process.env.AI_PROVIDER = previousProvider;
  process.env.AI_MODEL = previousModel;
  process.env.GROQ_API_KEY = previousGroqKey;
  process.env.GEMINI_API_KEY = previousGeminiKey;
  process.env.GEMINI_FALLBACK_MODEL = previousGeminiFallbackModel;
  vi.restoreAllMocks();
});

describe("Groq to Gemini assistant fallback", () => {
  it.each([429, 500, 503])("treats provider status %s as retryable", (status) => {
    expect(isRetryableGroqError({ status })).toBe(true);
  });

  it.each([400, 401, 403, 422])("does not hide provider/configuration status %s", (status) => {
    expect(isRetryableGroqError({ status })).toBe(false);
  });

  it("uses Gemini once when Groq reaches its free quota", async () => {
    process.env.AI_PROVIDER = "groq";
    process.env.AI_MODEL = "openai/gpt-oss-20b";
    process.env.GROQ_API_KEY = "groq-test";
    process.env.GEMINI_API_KEY = "gemini-test";
    process.env.GEMINI_FALLBACK_MODEL = "gemini-fallback-test";
    const operation = vi.fn(async (config: { provider: string; model: string }) => {
      if (config.provider === "groq") throw Object.assign(new Error("rate limited"), { status: 429 });
      return `${config.provider}:${config.model}`;
    });

    await expect(withAssistantProviderFallback(operation)).resolves.toBe("gemini:gemini-fallback-test");
    expect(operation.mock.calls.map(([config]) => config.provider)).toEqual(["groq", "gemini"]);
  });

  it("does not retry authorization errors or loop after Gemini fails", async () => {
    process.env.AI_PROVIDER = "groq";
    process.env.GROQ_API_KEY = "groq-test";
    process.env.GEMINI_API_KEY = "gemini-test";
    const unauthorized = vi.fn().mockRejectedValue(Object.assign(new Error("bad key"), { status: 401 }));
    await expect(withAssistantProviderFallback(unauthorized)).rejects.toMatchObject({ status: 401 });
    expect(unauthorized).toHaveBeenCalledTimes(1);

    const bothUnavailable = vi.fn(async (config: { provider: string }) => {
      throw Object.assign(new Error(`${config.provider} unavailable`), { status: config.provider === "groq" ? 503 : 429 });
    });
    await expect(withAssistantProviderFallback(bothUnavailable)).rejects.toThrow("gemini unavailable");
    expect(bothUnavailable).toHaveBeenCalledTimes(2);
  });
});
