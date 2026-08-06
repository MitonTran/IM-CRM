import { describe, expect, it } from "vitest";
import { inspectDeployment, normalizeBaseUrl } from "./smoke-deployment.mjs";

const securityHeaders = {
  "content-type": "text/html; charset=utf-8",
  "content-security-policy": "default-src 'self'; script-src 'self' 'nonce-test-value' 'strict-dynamic'; object-src 'none'; frame-ancestors 'none'",
  "x-frame-options": "DENY",
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
};

describe("deployment smoke URL", () => {
  it("chấp nhận HTTPS và HTTP local", () => {
    expect(normalizeBaseUrl("https://preview.example.com/")).toBe("https://preview.example.com");
    expect(normalizeBaseUrl("http://127.0.0.1:3200")).toBe("http://127.0.0.1:3200");
  });

  it("từ chối HTTP từ xa, credential và path", () => {
    expect(() => normalizeBaseUrl("http://preview.example.com")).toThrow(/HTTPS/);
    expect(() => normalizeBaseUrl("https://user:pass@preview.example.com")).toThrow(/credential/);
    expect(() => normalizeBaseUrl("https://preview.example.com/login")).toThrow(/origin/);
  });
});

describe("deployment smoke checks", () => {
  it("xác minh health, login và truyền bypass bằng header mà không đưa vào report", async () => {
    const seenHeaders = [];
    const fetchImpl = async (url, init) => {
      seenHeaders.push(init.headers);
      if (new URL(url).pathname === "/api/health") {
        return new Response(JSON.stringify({ status: "ok" }), { status: 200, headers: { "content-type": "application/json", "cache-control": "no-store" } });
      }
      return new Response("<h1>Đăng nhập IM CRM</h1>", { status: 200, headers: securityHeaders });
    };
    const report = await inspectDeployment("https://preview.example.com", { fetchImpl, bypassSecret: "test-bypass", responseBudgetMs: 1_000 });
    expect(report.status).toBe("pass");
    expect(report.protectionBypassUsed).toBe(true);
    expect(JSON.stringify(report)).not.toContain("test-bypass");
    expect(seenHeaders.every((headers) => headers["x-vercel-protection-bypass"] === "test-bypass")).toBe(true);
  });

  it("dừng khi CSP không đạt", async () => {
    const fetchImpl = async (url) => new URL(url).pathname === "/api/health"
      ? new Response(JSON.stringify({ status: "ok" }), { status: 200, headers: { "cache-control": "no-store" } })
      : new Response("Đăng nhập IM CRM", { status: 200, headers: { ...securityHeaders, "content-security-policy": "default-src 'self'" } });
    await expect(inspectDeployment("https://preview.example.com", { fetchImpl })).rejects.toThrow(/nonce/);
  });
});

