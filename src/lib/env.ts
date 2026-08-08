const PLACEHOLDER_VALUES = ["your-project-ref", "replace_me", "replace-in", "replace_in"];

function isUsable(value: string | undefined) {
  return Boolean(
    value && !PLACEHOLDER_VALUES.some((placeholder) => value.includes(placeholder)),
  );
}

export function hasSupabaseEnv() {
  return (
    isUsable(process.env.NEXT_PUBLIC_SUPABASE_URL) &&
    isUsable(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)
  );
}

export function getSupabasePublicEnv() {
  if (!hasSupabaseEnv()) {
    throw new Error("Thiếu cấu hình Supabase công khai.");
  }

  return {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL!,
    publishableKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  };
}

export function getSupabaseServiceRoleKey() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!isUsable(key)) {
    throw new Error("Thiếu SUPABASE_SERVICE_ROLE_KEY phía máy chủ.");
  }
  return key!;
}

export const AI_PROVIDERS = ["openai", "openrouter", "gemini", "deepseek", "groq", "nvidia"] as const;
export type AiProvider = (typeof AI_PROVIDERS)[number];
export const AI_PROVIDER_LABELS: Record<AiProvider, string> = {
  openai: "OpenAI",
  openrouter: "OpenRouter",
  gemini: "Google Gemini",
  deepseek: "DeepSeek",
  groq: "Groq",
  nvidia: "NVIDIA NIM",
};

const AI_PROVIDER_CONFIG: Record<AiProvider, { keyName: string; defaultModel: string; baseURL?: string }> = {
  openai: { keyName: "OPENAI_API_KEY", defaultModel: "gpt-5.6-terra" },
  openrouter: { keyName: "OPENROUTER_API_KEY", defaultModel: "openrouter/free", baseURL: "https://openrouter.ai/api/v1" },
  gemini: { keyName: "GEMINI_API_KEY", defaultModel: "gemini-3.1-flash-lite", baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/" },
  deepseek: { keyName: "DEEPSEEK_API_KEY", defaultModel: "deepseek-v4-flash", baseURL: "https://api.deepseek.com" },
  groq: { keyName: "GROQ_API_KEY", defaultModel: "openai/gpt-oss-20b", baseURL: "https://api.groq.com/openai/v1" },
  nvidia: { keyName: "NVIDIA_NIM_API_KEY", defaultModel: "nvidia/nemotron-3-nano-30b-a3b", baseURL: "https://integrate.api.nvidia.com/v1" },
};

export function getAiProvider(): AiProvider {
  const provider = (process.env.AI_PROVIDER?.trim().toLowerCase() || "openai") as AiProvider;
  if (!AI_PROVIDERS.includes(provider)) throw new Error("AI_PROVIDER không được hỗ trợ.");
  return provider;
}

export function hasAiProviderEnv() {
  try {
    const provider = getAiProvider();
    return isUsable(process.env[AI_PROVIDER_CONFIG[provider].keyName]);
  } catch {
    return false;
  }
}

export function getAiProviderConfig() {
  const provider = getAiProvider();
  const providerConfig = AI_PROVIDER_CONFIG[provider];
  const apiKey = process.env[providerConfig.keyName];
  if (!isUsable(apiKey)) throw new Error(`Thiếu ${providerConfig.keyName} phía máy chủ.`);

  const legacyOpenAIModel = provider === "openai" ? process.env.OPENAI_MODEL?.trim() : undefined;
  return {
    provider,
    apiKey: apiKey!,
    model: process.env.AI_MODEL?.trim() || legacyOpenAIModel || providerConfig.defaultModel,
    baseURL: providerConfig.baseURL,
  };
}
