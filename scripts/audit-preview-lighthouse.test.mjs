import { describe, expect, it } from "vitest";
import {
  LIGHTHOUSE_SCORE_BUDGET,
  normalizeLighthousePaths,
  summarizeLighthouseResult,
} from "./audit-preview-lighthouse.mjs";

function lhrWithScores(scores = {}) {
  return {
    categories: {
      performance: { score: scores.performance ?? 0.9 },
      accessibility: { score: scores.accessibility ?? 0.95 },
      "best-practices": { score: scores.bestPractices ?? 0.95 },
      seo: { score: scores.seo ?? 0.9 },
    },
    audits: {
      "first-contentful-paint": { numericValue: 800.4 },
      "largest-contentful-paint": { numericValue: 1_500.6 },
      "speed-index": { numericValue: 1_100.2 },
      "total-blocking-time": { numericValue: 10.3 },
      "cumulative-layout-shift": { numericValue: 0.01234 },
    },
  };
}

describe("preview Lighthouse routes", () => {
  it("giữ login trước route bảo vệ và loại route trùng", () => {
    expect(normalizeLighthousePaths("/dashboard,/login,/dashboard,/customers")).toEqual([
      "/login",
      "/dashboard",
      "/customers",
    ]);
  });

  it("chặn route ngoài allowlist", () => {
    expect(() => normalizeLighthousePaths("/admin/people")).toThrow(/không được phép/);
  });
});

describe("preview Lighthouse summary", () => {
  it("chỉ giữ score và metric số đã làm tròn", () => {
    const result = summarizeLighthouseResult("/dashboard", lhrWithScores());
    expect(result.status).toBe("pass");
    expect(result.metrics).toEqual({
      fcpMs: 800,
      lcpMs: 1_501,
      speedIndexMs: 1_100,
      totalBlockingTimeMs: 10,
      cls: 0.0123,
    });
    expect(result).not.toHaveProperty("lhr");
  });

  it("fail khi một category thấp hơn guardrail", () => {
    const result = summarizeLighthouseResult("/customers", lhrWithScores({ performance: 0.5 }));
    expect(result.status).toBe("fail");
    expect(result.checks.performance).toEqual({
      value: 0.5,
      minimum: LIGHTHOUSE_SCORE_BUDGET.performance,
      pass: false,
    });
  });
});
