import { describe, expect, it } from "vitest";
import { authConfirmRedirectTo, parseSafeAuthOrigin, resolveAuthRedirectOrigin } from "./origin";

function requestHeaders(values: Record<string, string>) {
  const normalized = new Map(Object.entries(values).map(([key, value]) => [key.toLowerCase(), value]));
  return { get: (name: string) => normalized.get(name.toLowerCase()) ?? null };
}

describe("auth redirect origin", () => {
  it("giữ đúng HTTPS origin của Preview khi host khớp", () => {
    const headers = requestHeaders({
      origin: "https://im-crm-git-feature.example.vercel.app",
      "x-forwarded-host": "im-crm-git-feature.example.vercel.app",
    });
    expect(resolveAuthRedirectOrigin(headers, "https://crm.example.com"))
      .toBe("https://im-crm-git-feature.example.vercel.app");
  });

  it("hỗ trợ HTTP chỉ cho local development", () => {
    const headers = requestHeaders({ origin: "http://127.0.0.1:3200", host: "127.0.0.1:3200" });
    expect(resolveAuthRedirectOrigin(headers, undefined)).toBe("http://127.0.0.1:3200");
  });

  it("không nhận origin có credential, path hoặc HTTP từ xa", () => {
    expect(parseSafeAuthOrigin("https://user:pass@example.com")).toBeNull();
    expect(parseSafeAuthOrigin("https://example.com/auth/callback")).toBeNull();
    expect(parseSafeAuthOrigin("http://example.com")).toBeNull();
  });

  it("dùng fallback an toàn khi origin và host không khớp", () => {
    const headers = requestHeaders({ origin: "https://attacker.example", host: "crm.example.com" });
    expect(resolveAuthRedirectOrigin(headers, "https://crm.example.com"))
      .toBe("https://crm.example.com");
  });

  it("từ chối khi request và fallback đều không an toàn", () => {
    expect(() => resolveAuthRedirectOrigin(requestHeaders({}), "http://crm.example.com"))
      .toThrow("Thiếu origin an toàn");
  });

  it("tạo RedirectTo token-hash ở route confirm cùng origin", () => {
    expect(authConfirmRedirectTo("https://preview.example.com"))
      .toBe("https://preview.example.com/auth/confirm");
    expect(() => authConfirmRedirectTo("http://preview.example.com"))
      .toThrow("Origin xác thực không an toàn");
  });
});
