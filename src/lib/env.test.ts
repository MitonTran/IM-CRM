import { afterEach, describe, expect, it } from "vitest";
import { getAiProviderConfig, getGeminiEmbeddingConfig, getGeminiFallbackConfig, getSupabasePublicEnv, hasAiProviderEnv, hasGeminiEmbeddingEnv, hasSupabaseEnv } from "./env";

const previousUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const previousKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const previousOpenAIKey = process.env.OPENAI_API_KEY;
const previousOpenAIModel = process.env.OPENAI_MODEL;
const previousAiProvider = process.env.AI_PROVIDER;
const previousAiModel = process.env.AI_MODEL;
const previousOpenRouterKey = process.env.OPENROUTER_API_KEY;
const previousGeminiKey = process.env.GEMINI_API_KEY;
const previousDeepSeekKey = process.env.DEEPSEEK_API_KEY;
const previousGroqKey = process.env.GROQ_API_KEY;
const previousNvidiaKey = process.env.NVIDIA_NIM_API_KEY;
const previousEmbeddingModel = process.env.GEMINI_EMBEDDING_MODEL;
const previousGeminiFallbackModel = process.env.GEMINI_FALLBACK_MODEL;

afterEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = previousUrl;
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = previousKey;
  process.env.OPENAI_API_KEY = previousOpenAIKey;
  process.env.OPENAI_MODEL = previousOpenAIModel;
  process.env.AI_PROVIDER = previousAiProvider;
  process.env.AI_MODEL = previousAiModel;
  process.env.OPENROUTER_API_KEY = previousOpenRouterKey;
  process.env.GEMINI_API_KEY = previousGeminiKey;
  process.env.DEEPSEEK_API_KEY = previousDeepSeekKey;
  process.env.GROQ_API_KEY = previousGroqKey;
  process.env.NVIDIA_NIM_API_KEY = previousNvidiaKey;
  process.env.GEMINI_EMBEDDING_MODEL = previousEmbeddingModel;
  process.env.GEMINI_FALLBACK_MODEL = previousGeminiFallbackModel;
});

describe("AI provider environment", () => {
  it("keeps placeholder API keys unusable", () => {
    process.env.AI_PROVIDER = "openai";
    process.env.OPENAI_API_KEY = "replace_in_server_environment_only";
    expect(hasAiProviderEnv()).toBe(false);
    expect(() => getAiProviderConfig()).toThrow(/OPENAI_API_KEY/);
  });

  it("keeps the existing OpenAI default and legacy model override", () => {
    process.env.AI_PROVIDER = "openai";
    process.env.OPENAI_API_KEY = "sk-test-only";
    delete process.env.AI_MODEL;
    delete process.env.OPENAI_MODEL;
    expect(getAiProviderConfig()).toMatchObject({ provider: "openai", apiKey: "sk-test-only", model: "gpt-5.6-terra" });
    process.env.OPENAI_MODEL = "gpt-legacy-override";
    expect(getAiProviderConfig().model).toBe("gpt-legacy-override");
  });

  it.each([
    ["openrouter", "OPENROUTER_API_KEY", "or-test", "openrouter/free", "https://openrouter.ai/api/v1"],
    ["gemini", "GEMINI_API_KEY", "gemini-test", "gemini-3.1-flash-lite", "https://generativelanguage.googleapis.com/v1beta/openai/"],
    ["deepseek", "DEEPSEEK_API_KEY", "deepseek-test", "deepseek-v4-flash", "https://api.deepseek.com"],
    ["groq", "GROQ_API_KEY", "groq-test", "openai/gpt-oss-20b", "https://api.groq.com/openai/v1"],
    ["nvidia", "NVIDIA_NIM_API_KEY", "nvidia-test", "nvidia/nemotron-3-nano-30b-a3b", "https://integrate.api.nvidia.com/v1"],
  ] as const)("selects %s with its fixed endpoint", (provider, keyName, key, model, baseURL) => {
    process.env.AI_PROVIDER = provider;
    process.env[keyName] = key;
    delete process.env.AI_MODEL;
    expect(getAiProviderConfig()).toEqual({ provider, apiKey: key, model, baseURL });
  });

  it("uses one server-side model override for every provider", () => {
    process.env.AI_PROVIDER = "openrouter";
    process.env.OPENROUTER_API_KEY = "or-test";
    process.env.AI_MODEL = "vendor/model:free";
    expect(getAiProviderConfig().model).toBe("vendor/model:free");
  });

  it("rejects unsupported providers instead of accepting a custom URL", () => {
    process.env.AI_PROVIDER = "custom";
    expect(hasAiProviderEnv()).toBe(false);
    expect(() => getAiProviderConfig()).toThrow(/không được hỗ trợ/);
  });

  it("configures a Gemini fallback only for a Groq primary without reusing the Groq model", () => {
    process.env.AI_PROVIDER = "groq";
    process.env.AI_MODEL = "openai/gpt-oss-20b";
    process.env.GROQ_API_KEY = "groq-test";
    process.env.GEMINI_API_KEY = "gemini-test";
    delete process.env.GEMINI_FALLBACK_MODEL;
    expect(getGeminiFallbackConfig()).toMatchObject({ provider: "gemini", model: "gemini-3.1-flash-lite" });
    process.env.GEMINI_FALLBACK_MODEL = "gemini-fallback-test";
    expect(getGeminiFallbackConfig()).toMatchObject({ provider: "gemini", model: "gemini-fallback-test" });
    process.env.AI_PROVIDER = "openrouter";
    expect(getGeminiFallbackConfig()).toBeNull();
  });
});

describe("Supabase environment", () => {
  it("rejects missing or placeholder configuration", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://your-project-ref.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_replace_me";

    expect(hasSupabaseEnv()).toBe(false);
    expect(() => getSupabasePublicEnv()).toThrow(/Thiếu cấu hình/);
  });

  it("returns configured public values", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_test";

    expect(getSupabasePublicEnv()).toEqual({
      url: "https://example.supabase.co",
      publishableKey: "sb_publishable_test",
    });
  });
});

describe("Gemini document embedding environment", () => {
  it("requires a real server-only Gemini key", () => {
    process.env.GEMINI_API_KEY = "replace_in_server_environment_only";
    expect(hasGeminiEmbeddingEnv()).toBe(false);
    expect(() => getGeminiEmbeddingConfig()).toThrow(/GEMINI_API_KEY/);
  });

  it("pins the model and dimensions to the database schema", () => {
    process.env.GEMINI_API_KEY = "gemini-test-only";
    delete process.env.GEMINI_EMBEDDING_MODEL;
    expect(getGeminiEmbeddingConfig()).toEqual({ apiKey: "gemini-test-only", model: "gemini-embedding-001", dimensions: 1536 });
    process.env.GEMINI_EMBEDDING_MODEL = "gemini-embedding-2";
    expect(() => getGeminiEmbeddingConfig()).toThrow(/khớp schema vector/);
  });
});
