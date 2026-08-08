import { expect, test, type Page } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { E2E_PASSWORD, E2E_USERS } from "./fixtures";

const APP_URL = "http://localhost:3200";
const PERFORMANCE_BUDGET = {
  ttfbMs: 2_000,
  domContentLoadedMs: 3_500,
  loadMs: 5_000,
  totalTransferBytes: 3_000_000,
  scriptTransferBytes: 1_500_000,
} as const;

type PerformanceBaseline = {
  route: string;
  ttfbMs: number;
  domContentLoadedMs: number;
  loadMs: number;
  totalTransferBytes: number;
  scriptTransferBytes: number;
};

async function measureFullNavigation(page: Page, route: string, readyText: string): Promise<PerformanceBaseline> {
  const response = await page.goto(route, { waitUntil: "load" });
  expect(response?.status()).toBe(200);
  await expect(page.getByText(readyText, { exact: true }).first()).toBeVisible();

  return page.evaluate((currentRoute) => {
    const navigation = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming;
    const resources = performance.getEntriesByType("resource") as PerformanceResourceTiming[];
    const transferred = resources.reduce((sum, item) => sum + item.transferSize, navigation.transferSize);
    const scripts = resources
      .filter((item) => item.initiatorType === "script")
      .reduce((sum, item) => sum + item.transferSize, 0);
    return {
      route: currentRoute,
      ttfbMs: Math.round(navigation.responseStart - navigation.startTime),
      domContentLoadedMs: Math.round(navigation.domContentLoadedEventEnd - navigation.startTime),
      loadMs: Math.round(navigation.loadEventEnd - navigation.startTime),
      totalTransferBytes: transferred,
      scriptTransferBytes: scripts,
    };
  }, route);
}

function expectWithinBudget(metric: PerformanceBaseline) {
  expect(metric.ttfbMs, `${metric.route} TTFB`).toBeLessThan(PERFORMANCE_BUDGET.ttfbMs);
  expect(metric.domContentLoadedMs, `${metric.route} DOMContentLoaded`).toBeLessThan(PERFORMANCE_BUDGET.domContentLoadedMs);
  expect(metric.loadMs, `${metric.route} load`).toBeLessThan(PERFORMANCE_BUDGET.loadMs);
  expect(metric.totalTransferBytes, `${metric.route} total transfer`).toBeLessThan(PERFORMANCE_BUDGET.totalTransferBytes);
  expect(metric.scriptTransferBytes, `${metric.route} script transfer`).toBeLessThan(PERFORMANCE_BUDGET.scriptTransferBytes);
}

test("health endpoint và security headers hoạt động trên bản production", async ({ request }) => {
  const health = await request.get("/api/health");
  expect(health.status()).toBe(200);
  expect(await health.json()).toEqual({ status: "ok" });
  expect(health.headers()["cache-control"]).toContain("no-store");

  const login = await request.get("/login");
  expect(login.status()).toBe(200);
  const headers = login.headers();
  const csp = headers["content-security-policy"] ?? "";
  expect(csp).toMatch(/script-src[^;]*'nonce-[^']+'/);
  expect(csp).toContain("'strict-dynamic'");
  expect(csp).toContain("object-src 'none'");
  expect(csp).toContain("frame-ancestors 'none'");
  expect(csp.match(/script-src[^;]*/)?.[0] ?? "").not.toContain("'unsafe-inline'");
  expect(headers["x-frame-options"]).toBe("DENY");
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
});

test("login, dashboard và danh sách khách nằm trong performance budget local", async ({ browser, page }, testInfo) => {
  const metrics: PerformanceBaseline[] = [];
  metrics.push(await measureFullNavigation(page, "/login", "Đăng nhập IM CRM"));
  await page.getByLabel("Email").fill(E2E_USERS.admin.email);
  await page.getByLabel("Mật khẩu").fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Đăng nhập" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  const storageState = await page.context().storageState();

  for (const [route, readyText] of [["/dashboard", "Bảng hiệu suất"], ["/customers", "Khách hàng"]] as const) {
    const context = await browser.newContext({ baseURL: APP_URL, storageState });
    try {
      metrics.push(await measureFullNavigation(await context.newPage(), route, readyText));
    } finally {
      await context.close();
    }
  }

  for (const metric of metrics) expectWithinBudget(metric);
  const baselinePath = testInfo.outputPath("performance-baseline.json");
  await writeFile(baselinePath, JSON.stringify({ budget: PERFORMANCE_BUDGET, metrics }, null, 2), "utf8");
  await testInfo.attach("performance-baseline.json", {
    path: baselinePath,
    contentType: "application/json",
  });
  console.info(`[performance] ${metrics.map((item) => `${item.route}: ttfb=${item.ttfbMs}ms load=${item.loadMs}ms transfer=${item.totalTransferBytes}B`).join(" | ")}`);
});
