import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { normalizeBaseUrl } from "./smoke-deployment.mjs";

export const PREVIEW_PERFORMANCE_BUDGET = Object.freeze({
  ttfbMs: 2_000,
  fcpMs: 2_500,
  lcpMs: 2_500,
  cls: 0.1,
  totalTransferBytes: 3_000_000,
  scriptTransferBytes: 1_500_000,
});

const ROUTES = [
  { route: "/login", readyText: "Đăng nhập IM CRM", authenticated: false },
  { route: "/dashboard", readyText: "Bảng hiệu suất", authenticated: true },
  { route: "/customers", readyText: "Khách hàng", authenticated: true },
];

const RUNS_PER_ROUTE = 3;

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

export function requirePreviewCredentials(email, password) {
  invariant(typeof email === "string" && email.trim(), "Thiếu PREVIEW_AUDIT_EMAIL cho tài khoản UAT dùng dữ liệu giả.");
  invariant(typeof password === "string" && password, "Thiếu PREVIEW_AUDIT_PASSWORD cho tài khoản UAT dùng dữ liệu giả.");
  return { email: email.trim(), password };
}

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)];
}

export function summarizeRuns(route, runs, budget = PREVIEW_PERFORMANCE_BUDGET) {
  invariant(runs.length > 0, `Không có mẫu hiệu năng cho ${route}.`);
  const metrics = {
    ttfbMs: median(runs.map((run) => run.ttfbMs)),
    fcpMs: median(runs.map((run) => run.fcpMs)),
    lcpMs: median(runs.map((run) => run.lcpMs)),
    cls: median(runs.map((run) => run.cls)),
    totalTransferBytes: median(runs.map((run) => run.totalTransferBytes)),
    scriptTransferBytes: median(runs.map((run) => run.scriptTransferBytes)),
  };
  const checks = Object.fromEntries(
    Object.entries(budget).map(([name, limit]) => {
      const value = metrics[name];
      const hasValidSample = name === "cls" ? value >= 0 : value > 0;
      return [name, { value, limit, pass: hasValidSample && value <= limit }];
    }),
  );
  return {
    route,
    status: Object.values(checks).every((check) => check.pass) ? "pass" : "fail",
    metrics,
    checks,
    runs,
  };
}

function contextOptions(storageState) {
  return { storageState, userAgent: "im-crm-preview-performance/1.0" };
}

export function deploymentRequestHeaders(requestUrl, baseUrl, currentHeaders, bypassSecret) {
  if (!bypassSecret || new URL(requestUrl).origin !== baseUrl) return undefined;
  return { ...currentHeaders, "x-vercel-protection-bypass": bypassSecret };
}

async function installDeploymentBypass(page, baseUrl, bypassSecret) {
  if (!bypassSecret) return;
  await page.route("**/*", async (route) => {
    const request = route.request();
    const headers = deploymentRequestHeaders(request.url(), baseUrl, request.headers(), bypassSecret);
    await route.continue(headers ? { headers } : undefined);
  });
}

async function installObservers(page) {
  await page.addInitScript(() => {
    window.__IM_CRM_LAB_VITALS__ = { cls: 0, lcpMs: 0 };
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) window.__IM_CRM_LAB_VITALS__.lcpMs = entry.startTime;
    }).observe({ type: "largest-contentful-paint", buffered: true });
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (!entry.hadRecentInput) window.__IM_CRM_LAB_VITALS__.cls += entry.value;
      }
    }).observe({ type: "layout-shift", buffered: true });
  });
}

async function measureNavigation(page, baseUrl, route, readyText) {
  await installObservers(page);
  const response = await page.goto(new URL(route, baseUrl).href, { waitUntil: "load", timeout: 30_000 });
  invariant(response?.status() === 200, `${route} trả HTTP ${response?.status() ?? "không xác định"}.`);
  await page.getByText(readyText, { exact: true }).first().waitFor({ state: "visible", timeout: 10_000 });
  await page.waitForTimeout(750);

  return page.evaluate(() => {
    const navigation = performance.getEntriesByType("navigation")[0];
    const paints = performance.getEntriesByType("paint");
    const firstContentfulPaint = paints.find((entry) => entry.name === "first-contentful-paint");
    const resources = performance.getEntriesByType("resource");
    const totalTransferBytes = resources.reduce((sum, entry) => sum + entry.transferSize, navigation.transferSize);
    const scriptTransferBytes = resources
      .filter((entry) => entry.initiatorType === "script")
      .reduce((sum, entry) => sum + entry.transferSize, 0);
    return {
      ttfbMs: Math.round(navigation.responseStart - navigation.startTime),
      fcpMs: Math.round(firstContentfulPaint?.startTime ?? 0),
      lcpMs: Math.round(window.__IM_CRM_LAB_VITALS__.lcpMs),
      cls: Number(window.__IM_CRM_LAB_VITALS__.cls.toFixed(4)),
      totalTransferBytes,
      scriptTransferBytes,
    };
  });
}

async function createAuthenticatedState(browser, baseUrl, credentials, bypassSecret) {
  const context = await browser.newContext(contextOptions());
  try {
    const page = await context.newPage();
    await installDeploymentBypass(page, baseUrl, bypassSecret);
    await page.goto(new URL("/login", baseUrl).href, { waitUntil: "load", timeout: 30_000 });
    await page.getByLabel("Email").fill(credentials.email);
    await page.getByLabel("Mật khẩu").fill(credentials.password);
    await page.getByRole("button", { name: "Đăng nhập" }).click();
    await page.waitForURL(/\/dashboard(?:\?|$)/, { timeout: 15_000 });
    await page.getByText("Bảng hiệu suất", { exact: true }).first().waitFor({ state: "visible", timeout: 10_000 });
    return context.storageState();
  } catch {
    throw new Error("Không thể đăng nhập tài khoản UAT trên Preview; kiểm tra credential, trạng thái user và Supabase Preview.");
  } finally {
    await context.close();
  }
}

async function measureRoute(browser, baseUrl, definition, storageState, bypassSecret) {
  const runs = [];
  for (let index = 0; index < RUNS_PER_ROUTE; index += 1) {
    const context = await browser.newContext(contextOptions(definition.authenticated ? storageState : undefined));
    try {
      const page = await context.newPage();
      await installDeploymentBypass(page, baseUrl, bypassSecret);
      runs.push(await measureNavigation(page, baseUrl, definition.route, definition.readyText));
    } finally {
      await context.close();
    }
  }
  return summarizeRuns(definition.route, runs);
}

export async function auditPreviewPerformance(input, options = {}) {
  const baseUrl = normalizeBaseUrl(input);
  invariant(new URL(baseUrl).protocol === "https:", "Audit Preview bắt buộc dùng HTTPS; performance local đã được kiểm tra bằng E2E riêng.");
  const credentials = requirePreviewCredentials(options.email, options.password);
  const browser = await chromium.launch({ headless: true });
  try {
    const storageState = await createAuthenticatedState(browser, baseUrl, credentials, options.bypassSecret);
    const routes = [];
    for (const definition of ROUTES) {
      routes.push(await measureRoute(browser, baseUrl, definition, storageState, options.bypassSecret));
    }
    return {
      status: routes.every((route) => route.status === "pass") ? "pass" : "fail",
      checkedAtUtc: new Date().toISOString(),
      baseUrl,
      methodology: "Playwright Chromium, 3 cold-context runs per route, median lab metrics",
      note: "Lab LCP/CLS/FCP/TTFB là guardrail Preview; vẫn cần lưu Lighthouse hoặc Speed Insights field data trước Production.",
      budget: PREVIEW_PERFORMANCE_BUDGET,
      authenticatedRoutesUsed: true,
      protectionBypassUsed: Boolean(options.bypassSecret),
      routes,
    };
  } finally {
    await browser.close();
  }
}

async function main() {
  const report = await auditPreviewPerformance(process.argv[2] ?? process.env.PERFORMANCE_BASE_URL, {
    email: process.env.PREVIEW_AUDIT_EMAIL,
    password: process.env.PREVIEW_AUDIT_PASSWORD,
    bypassSecret: process.env.VERCEL_AUTOMATION_BYPASS_SECRET,
  });
  const serialized = `${JSON.stringify(report, null, 2)}\n`;
  const reportPath = path.resolve(process.env.PERFORMANCE_REPORT_PATH ?? "test-results/preview-performance.json");
  await mkdir(path.dirname(reportPath), { recursive: true });
  await writeFile(reportPath, serialized, "utf8");
  process.stdout.write(serialized);
  if (report.status !== "pass") process.exitCode = 1;
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (import.meta.url === invokedPath) {
  main().catch((error) => {
    process.stderr.write(`Audit hiệu năng Preview thất bại: ${error instanceof Error ? error.message : "Lỗi không xác định."}\n`);
    process.exitCode = 1;
  });
}
