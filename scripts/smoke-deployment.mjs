import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_RESPONSE_BUDGET_MS = 5_000;

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

export function normalizeBaseUrl(value) {
  invariant(typeof value === "string" && value.trim(), "Thiếu URL deployment cần smoke test.");
  const url = new URL(value.trim());
  invariant(["http:", "https:"].includes(url.protocol), "URL deployment phải dùng HTTP(S).");
  invariant(!url.username && !url.password, "Không đặt credential trong URL deployment.");
  const local = ["127.0.0.1", "localhost"].includes(url.hostname);
  invariant(url.protocol === "https:" || local, "Deployment từ xa bắt buộc dùng HTTPS.");
  invariant(url.pathname === "/" && !url.search && !url.hash, "Hãy truyền origin deployment, không kèm path/query/hash.");
  return url.origin;
}

function smokeHeaders(bypassSecret) {
  const headers = { "user-agent": "im-crm-deployment-smoke/1.0" };
  if (bypassSecret) headers["x-vercel-protection-bypass"] = bypassSecret;
  return headers;
}

async function timedGet(fetchImpl, baseUrl, pathname, headers, timeoutMs) {
  const startedAt = performance.now();
  const response = await fetchImpl(new URL(pathname, baseUrl), {
    method: "GET",
    headers,
    redirect: "follow",
    signal: AbortSignal.timeout(timeoutMs),
  });
  return { response, durationMs: Math.round(performance.now() - startedAt) };
}

export async function inspectDeployment(input, options = {}) {
  const baseUrl = normalizeBaseUrl(input);
  const fetchImpl = options.fetchImpl ?? fetch;
  const responseBudgetMs = options.responseBudgetMs ?? DEFAULT_RESPONSE_BUDGET_MS;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const headers = smokeHeaders(options.bypassSecret);

  const health = await timedGet(fetchImpl, baseUrl, "/api/health", headers, timeoutMs);
  invariant(health.response.status === 200, `/api/health trả HTTP ${health.response.status}, cần 200.`);
  invariant(health.durationMs < responseBudgetMs, `/api/health vượt budget ${responseBudgetMs} ms.`);
  invariant(health.response.headers.get("cache-control")?.includes("no-store"), "/api/health thiếu Cache-Control: no-store.");
  let healthBody;
  try {
    healthBody = await health.response.json();
  } catch {
    throw new Error("/api/health không trả JSON hợp lệ.");
  }
  invariant(healthBody?.status === "ok", "/api/health không trả status=ok.");

  const login = await timedGet(fetchImpl, baseUrl, "/login", headers, timeoutMs);
  invariant(login.response.status === 200, `/login trả HTTP ${login.response.status}, cần 200.`);
  invariant(login.durationMs < responseBudgetMs, `/login vượt budget ${responseBudgetMs} ms.`);
  invariant(login.response.headers.get("content-type")?.includes("text/html"), "/login không trả HTML.");
  const csp = login.response.headers.get("content-security-policy") ?? "";
  const scriptDirective = csp.match(/(?:^|;\s*)script-src[^;]*/)?.[0] ?? "";
  invariant(/'nonce-[^']+'/.test(scriptDirective), "CSP /login thiếu nonce cho script-src.");
  invariant(scriptDirective.includes("'strict-dynamic'"), "CSP /login thiếu strict-dynamic.");
  invariant(!scriptDirective.includes("'unsafe-inline'"), "CSP script-src không được dùng unsafe-inline.");
  invariant(csp.includes("object-src 'none'"), "CSP /login chưa chặn object-src.");
  invariant(csp.includes("frame-ancestors 'none'"), "CSP /login chưa chặn frame-ancestors.");
  invariant(login.response.headers.get("x-frame-options") === "DENY", "/login thiếu X-Frame-Options: DENY.");
  invariant(login.response.headers.get("x-content-type-options") === "nosniff", "/login thiếu X-Content-Type-Options: nosniff.");
  invariant(login.response.headers.get("referrer-policy") === "strict-origin-when-cross-origin", "/login sai Referrer-Policy.");
  invariant(!login.response.headers.has("x-powered-by"), "/login đang lộ X-Powered-By.");
  const loginBody = await login.response.text();
  invariant(loginBody.includes("Đăng nhập IM CRM"), "/login thiếu nội dung nhận diện IM CRM.");

  return {
    status: "pass",
    checkedAtUtc: new Date().toISOString(),
    baseUrl,
    checks: ["health", "login-content", "security-headers", "response-budget"],
    timings: { healthMs: health.durationMs, loginMs: login.durationMs },
    protectionBypassUsed: Boolean(options.bypassSecret),
  };
}

async function main() {
  const baseUrl = process.argv[2] ?? process.env.SMOKE_BASE_URL;
  const report = await inspectDeployment(baseUrl, {
    bypassSecret: process.env.VERCEL_AUTOMATION_BYPASS_SECRET,
  });
  const serialized = `${JSON.stringify(report, null, 2)}\n`;
  if (process.env.SMOKE_REPORT_PATH) {
    const reportPath = path.resolve(process.env.SMOKE_REPORT_PATH);
    await mkdir(path.dirname(reportPath), { recursive: true });
    await writeFile(reportPath, serialized, "utf8");
  }
  process.stdout.write(serialized);
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (import.meta.url === invokedPath) {
  main().catch((error) => {
    process.stderr.write(`Deployment smoke thất bại: ${error instanceof Error ? error.message : "Lỗi không xác định."}\n`);
    process.exitCode = 1;
  });
}

