import "server-only";

import { getAiProviderConfig, getGeminiFallbackConfig, type AiProviderConfig } from "@/lib/env";

function providerStatus(error: unknown) {
  if (!error || typeof error !== "object" || !("status" in error)) return null;
  const status = Number(error.status);
  return Number.isInteger(status) ? status : null;
}

export function isRetryableGroqError(error: unknown) {
  const status = providerStatus(error);
  if (status === 429 || (status !== null && status >= 500)) return true;
  if (!(error instanceof Error)) return false;
  return error.name === "APIConnectionError"
    || error.name === "APIConnectionTimeoutError"
    || error.name === "AbortError";
}

export async function withAssistantProviderFallback<T>(operation: (config: AiProviderConfig) => Promise<T>) {
  const primary = getAiProviderConfig();
  try {
    return await operation(primary);
  } catch (error) {
    const fallback = getGeminiFallbackConfig();
    if (primary.provider !== "groq" || !fallback || !isRetryableGroqError(error)) throw error;
    return operation(fallback);
  }
}
