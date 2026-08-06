export function createNonce() {
  return Buffer.from(crypto.randomUUID()).toString("base64");
}

function safeOrigin(value: string | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.hostname === "127.0.0.1" || url.hostname === "localhost" ? url.origin : null;
  } catch {
    return null;
  }
}

export function buildContentSecurityPolicy(input: { nonce: string; isDevelopment: boolean; supabaseUrl?: string }) {
  const supabaseOrigin = safeOrigin(input.supabaseUrl);
  const websocketOrigin = supabaseOrigin?.replace(/^http/, "ws");
  const connectSources = ["'self'", supabaseOrigin, websocketOrigin, input.isDevelopment ? "ws://localhost:*" : null, input.isDevelopment ? "http://127.0.0.1:*" : null].filter(Boolean).join(" ");
  const directives = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${input.nonce}' 'strict-dynamic'${input.isDevelopment ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' blob: data:${supabaseOrigin ? ` ${supabaseOrigin}` : ""}`,
    "font-src 'self' data:",
    `connect-src ${connectSources}`,
    "worker-src 'self' blob:",
    "media-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "manifest-src 'self'",
    ...(input.isDevelopment ? [] : ["upgrade-insecure-requests"]),
  ];
  return directives.join("; ");
}
