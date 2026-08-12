import { describe, expect, it } from "vitest";
import {
  PREVIEW_PERFORMANCE_BUDGET,
  deploymentRequestHeaders,
  requirePreviewCredentials,
  summarizeRuns,
} from "./audit-preview-performance.mjs";

const passingRun = {
  ttfbMs: 400,
  fcpMs: 900,
  lcpMs: 1_200,
  cls: 0.02,
  totalTransferBytes: 500_000,
  scriptTransferBytes: 200_000,
};

describe("preview performance credentials", () => {
  it("yêu cầu đủ email và mật khẩu nhưng không biến đổi mật khẩu", () => {
    expect(requirePreviewCredentials(" admin@example.invalid ", " secret ")).toEqual({
      email: "admin@example.invalid",
      password: " secret ",
    });
    expect(() => requirePreviewCredentials("", "secret")).toThrow(/PREVIEW_AUDIT_EMAIL/);
    expect(() => requirePreviewCredentials("admin@example.invalid", "")).toThrow(/PREVIEW_AUDIT_PASSWORD/);
  });

  it("chỉ gửi bypass secret tới đúng origin Preview", () => {
    expect(deploymentRequestHeaders(
      "https://preview.example.com/dashboard",
      "https://preview.example.com",
      { accept: "text/html" },
      "bypass-test",
    )).toEqual({ accept: "text/html", "x-vercel-protection-bypass": "bypass-test" });
    expect(deploymentRequestHeaders(
      "https://project.supabase.co/auth/v1/user",
      "https://preview.example.com",
      { authorization: "Bearer fake" },
      "bypass-test",
    )).toBeUndefined();
  });
});

describe("preview performance summary", () => {
  it("dùng median của ba lượt đo và pass khi mọi chỉ số trong budget", () => {
    const result = summarizeRuns("/dashboard", [
      { ...passingRun, lcpMs: 1_000 },
      { ...passingRun, lcpMs: 1_200 },
      { ...passingRun, lcpMs: 8_000 },
    ]);
    expect(result.metrics.lcpMs).toBe(1_200);
    expect(result.status).toBe("pass");
  });

  it("fail và nêu đúng chỉ số vượt budget", () => {
    const result = summarizeRuns("/customers", [
      { ...passingRun, cls: 0.2 },
      { ...passingRun, cls: 0.2 },
      { ...passingRun, cls: 0.01 },
    ]);
    expect(result.status).toBe("fail");
    expect(result.checks.cls).toEqual({ value: 0.2, limit: PREVIEW_PERFORMANCE_BUDGET.cls, pass: false });
  });

  it("không coi metric bị thiếu với giá trị 0 là đạt", () => {
    const result = summarizeRuns("/login", [
      { ...passingRun, lcpMs: 0 },
      { ...passingRun, lcpMs: 0 },
      { ...passingRun, lcpMs: 0 },
    ]);
    expect(result.status).toBe("fail");
    expect(result.checks.lcpMs.pass).toBe(false);
  });
});
