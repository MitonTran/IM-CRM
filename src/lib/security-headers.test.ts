import { describe, expect, it } from "vitest";
import { buildContentSecurityPolicy } from "./security-headers";

describe("Content Security Policy", () => {
  it("uses a nonce and exact Supabase origins without unsafe inline scripts", () => {
    const value = buildContentSecurityPolicy({ nonce: "nonce-test", isDevelopment: false, supabaseUrl: "https://demo.supabase.co/path" });
    expect(value).toContain("script-src 'self' 'nonce-nonce-test' 'strict-dynamic'");
    expect(value).not.toContain("script-src 'self' 'unsafe-inline'");
    expect(value).toContain("connect-src 'self' https://demo.supabase.co wss://demo.supabase.co");
    expect(value).toContain("upgrade-insecure-requests");
  });

  it("allows local development sockets but never trusts an invalid remote URL", () => {
    const value = buildContentSecurityPolicy({ nonce: "dev", isDevelopment: true, supabaseUrl: "javascript:alert(1)" });
    expect(value).toContain("'unsafe-eval'");
    expect(value).toContain("ws://localhost:*");
    expect(value).not.toContain("javascript:");
    expect(value).not.toContain("upgrade-insecure-requests");
  });
});
