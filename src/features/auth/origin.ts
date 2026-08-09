const LOCAL_AUTH_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

function firstHeaderValue(value: string | null) {
  return value?.split(",", 1)[0]?.trim() || null;
}

export function parseSafeAuthOrigin(value: string | null | undefined) {
  if (!value) return null;

  try {
    const url = new URL(value);
    const isLocalHttp = url.protocol === "http:" && LOCAL_AUTH_HOSTS.has(url.hostname);
    if (url.protocol !== "https:" && !isLocalHttp) return null;
    if (url.username || url.password || url.pathname !== "/" || url.search || url.hash) return null;
    return url.origin;
  } catch {
    return null;
  }
}

export function resolveAuthRedirectOrigin(requestHeaders: Pick<Headers, "get">, fallback: string | undefined) {
  const requestOrigin = parseSafeAuthOrigin(requestHeaders.get("origin"));
  const requestHost = firstHeaderValue(requestHeaders.get("x-forwarded-host"))
    ?? firstHeaderValue(requestHeaders.get("host"));

  if (requestOrigin && requestHost && new URL(requestOrigin).host === requestHost) {
    return requestOrigin;
  }

  const fallbackOrigin = parseSafeAuthOrigin(fallback);
  if (fallbackOrigin) return fallbackOrigin;
  throw new Error("Thiếu origin an toàn cho liên kết xác thực.");
}
