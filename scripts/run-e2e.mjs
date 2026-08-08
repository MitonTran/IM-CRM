import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const supabaseBin = path.join(root, "node_modules", ".bin", "supabase");
const playwrightBin = path.join(root, "node_modules", ".bin", "playwright");

function parseEnv(output) {
  const result = {};
  for (const line of output.split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!match) continue;
    const raw = match[2].trim();
    result[match[1]] = raw.startsWith('"') ? JSON.parse(raw) : raw;
  }
  return result;
}

function localSupabaseEnv() {
  let output;
  try {
    output = execFileSync(supabaseBin, ["status", "-o", "env"], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  } catch {
    throw new Error("Supabase local chưa chạy. Hãy chạy npm run db:start trước E2E.");
  }
  const values = parseEnv(output);
  const apiUrl = values.API_URL;
  const hostname = apiUrl ? new URL(apiUrl).hostname : "";
  const dbHostname = values.DB_URL ? new URL(values.DB_URL).hostname : "";
  if (!apiUrl || !["127.0.0.1", "localhost"].includes(hostname) || !["127.0.0.1", "localhost"].includes(dbHostname) || !values.PUBLISHABLE_KEY || !values.SERVICE_ROLE_KEY) {
    throw new Error("E2E chỉ được phép dùng Supabase local với đủ key tạm thời.");
  }
  return {
    NEXT_PUBLIC_SUPABASE_URL: apiUrl,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: values.PUBLISHABLE_KEY,
    SUPABASE_SERVICE_ROLE_KEY: values.SERVICE_ROLE_KEY,
    E2E_DB_URL: values.DB_URL,
  };
}

function run(command, args, env) {
  const result = spawnSync(command, args, { cwd: root, env, stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

const testEnv = {
  ...process.env,
  ...localSupabaseEnv(),
  NEXT_PUBLIC_APP_URL: "http://localhost:3200",
  CRON_SECRET: "e2e-local-cron-secret-only",
  E2E_LOCAL_ONLY: "true",
};

run("npm", ["run", "build"], testEnv);
run(playwrightBin, ["test"], testEnv);
