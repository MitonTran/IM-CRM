import { chromium } from "@playwright/test";
import { launch } from "chrome-launcher";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import lighthouse from "lighthouse";
import { requirePreviewCredentials } from "./audit-preview-performance.mjs";
import { normalizeBaseUrl } from "./smoke-deployment.mjs";

const DEFAULT_PATHS = ["/login", "/dashboard", "/customers"];

export const LIGHTHOUSE_SCORE_BUDGET = Object.freeze({
  performance: 0.7,
  accessibility: 0.9,
  bestPractices: 0.9,
});

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

export function normalizeLighthousePaths(input) {
  const paths = input ? input.split(",").map((value) => value.trim()).filter(Boolean) : DEFAULT_PATHS;
  invariant(paths.length > 0, "Danh sách route Lighthouse đang trống.");
  for (const route of paths) {
    invariant(DEFAULT_PATHS.includes(route), `Route Lighthouse không được phép: ${route}.`);
  }
  return [...new Set(paths)].sort((left, right) => Number(right === "/login") - Number(left === "/login"));
}

function roundedScore(value) {
  return Number((value ?? 0).toFixed(2));
}

function roundedMetric(audit) {
  return Math.round(audit?.numericValue ?? 0);
}

function failedAudits(category, audits) {
  return (category?.auditRefs ?? [])
    .filter((reference) => reference.weight > 0 && audits[reference.id]?.score !== 1)
    .map((reference) => {
      const audit = audits[reference.id];
      const selectors = [...new Set(
        (audit?.details?.items ?? []).map((item) => item.node?.selector).filter((selector) => typeof selector === "string"),
      )].slice(0, 10);
      return { id: reference.id, score: audit?.score ?? null, selectors };
    });
}

export function summarizeLighthouseResult(route, lhr, budget = LIGHTHOUSE_SCORE_BUDGET) {
  const scores = {
    performance: roundedScore(lhr.categories.performance?.score),
    accessibility: roundedScore(lhr.categories.accessibility?.score),
    bestPractices: roundedScore(lhr.categories["best-practices"]?.score),
    seo: roundedScore(lhr.categories.seo?.score),
  };
  const checks = Object.fromEntries(
    Object.entries(budget).map(([name, minimum]) => [name, { value: scores[name], minimum, pass: scores[name] >= minimum }]),
  );
  return {
    route,
    status: Object.values(checks).every((check) => check.pass) ? "pass" : "fail",
    runtimeError: lhr.runtimeError ? { code: lhr.runtimeError.code, message: lhr.runtimeError.message } : null,
    scores,
    checks,
    failedAudits: {
      performance: failedAudits(lhr.categories.performance, lhr.audits),
      accessibility: failedAudits(lhr.categories.accessibility, lhr.audits),
      bestPractices: failedAudits(lhr.categories["best-practices"], lhr.audits),
      seo: failedAudits(lhr.categories.seo, lhr.audits),
    },
    metrics: {
      fcpMs: roundedMetric(lhr.audits["first-contentful-paint"]),
      lcpMs: roundedMetric(lhr.audits["largest-contentful-paint"]),
      speedIndexMs: roundedMetric(lhr.audits["speed-index"]),
      totalBlockingTimeMs: roundedMetric(lhr.audits["total-blocking-time"]),
      cls: Number((lhr.audits["cumulative-layout-shift"]?.numericValue ?? 0).toFixed(4)),
    },
  };
}

async function authenticate(context, baseUrl, credentials) {
  const page = await context.newPage();
  try {
    await page.goto(new URL("/login", baseUrl).href, { waitUntil: "load", timeout: 30_000 });
    if (new URL(page.url()).pathname === "/dashboard") return;
    await page.locator('input[name="email"]').fill(credentials.email);
    await page.locator('input[name="password"]').fill(credentials.password);
    await page.getByRole("button", { name: "Đăng nhập" }).click();
    await page.waitForURL(/\/dashboard(?:\?|$)/, { timeout: 15_000 });
    await page.getByText("Bảng hiệu suất", { exact: true }).first().waitFor({ state: "visible", timeout: 10_000 });
  } catch {
    throw new Error("Không thể tạo phiên Lighthouse đã đăng nhập; kiểm tra credential và tài khoản Admin UAT trên Supabase Preview.");
  } finally {
    await page.close();
  }
}

export async function auditPreviewLighthouse(input, options = {}) {
  const baseUrl = normalizeBaseUrl(input);
  invariant(new URL(baseUrl).protocol === "https:", "Lighthouse Preview bắt buộc dùng HTTPS.");
  const routes = normalizeLighthousePaths(options.paths);
  const protectedRoutes = routes.filter((route) => route !== "/login");
  const credentials = protectedRoutes.length > 0 ? requirePreviewCredentials(options.email, options.password) : null;
  const chrome = await launch({
    chromePath: options.chromePath ?? chromium.executablePath(),
    chromeFlags: ["--headless=new", "--no-sandbox", "--disable-dev-shm-usage"],
    logLevel: "silent",
  });
  let browser;
  try {
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${chrome.port}`);
    const context = browser.contexts()[0];
    invariant(context, "Không thể kết nối browser context cho Lighthouse.");
    const results = [];
    for (const route of routes) {
      if (route !== "/login" && credentials) await authenticate(context, baseUrl, credentials);
      const run = await lighthouse(new URL(route, baseUrl).href, {
        port: chrome.port,
        logLevel: "error",
        output: "json",
        preset: "desktop",
        onlyCategories: ["performance", "accessibility", "best-practices", "seo"],
        disableStorageReset: route !== "/login",
        maxWaitForLoad: 60_000,
      });
      invariant(run?.lhr, `Lighthouse không trả kết quả cho ${route}.`);
      results.push(summarizeLighthouseResult(route, run.lhr));
    }
    return {
      status: results.every((route) => route.status === "pass") ? "pass" : "fail",
      checkedAtUtc: new Date().toISOString(),
      baseUrl,
      methodology: "Lighthouse desktop, one isolated collection per route; authenticated routes reuse a server-created Supabase cookie session",
      rawReportsStored: false,
      notes: ["SEO is informational because this internal CRM intentionally sends noindex, nofollow."],
      scoreBudget: LIGHTHOUSE_SCORE_BUDGET,
      routes: results,
    };
  } finally {
    try {
      await browser?.close();
    } catch {
      // Chrome may already be gone after a Lighthouse protocol failure.
    }
    try {
      await chrome.kill();
    } catch {
      // Cleanup must not hide the original audit result.
    }
  }
}

async function main() {
  const report = await auditPreviewLighthouse(process.argv[2] ?? process.env.PERFORMANCE_BASE_URL, {
    paths: process.env.LIGHTHOUSE_PATHS,
    email: process.env.PREVIEW_AUDIT_EMAIL,
    password: process.env.PREVIEW_AUDIT_PASSWORD,
    chromePath: process.env.CHROME_PATH,
  });
  const reportPath = path.resolve(process.env.LIGHTHOUSE_REPORT_PATH ?? "test-results/preview-lighthouse.json");
  await mkdir(path.dirname(reportPath), { recursive: true });
  const serialized = `${JSON.stringify(report, null, 2)}\n`;
  await writeFile(reportPath, serialized, "utf8");
  process.stdout.write(serialized);
  if (report.status !== "pass") process.exitCode = 1;
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (import.meta.url === invokedPath) {
  main().catch((error) => {
    process.stderr.write(`Audit Lighthouse Preview thất bại: ${error instanceof Error ? error.message : "Lỗi không xác định."}\n`);
    process.exitCode = 1;
  });
}
