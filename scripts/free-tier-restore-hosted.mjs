import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createClient } from "@supabase/supabase-js";
import {
  assertEmptyRestoreTarget,
  assertRestorableBackupManifest,
  assertSafeArchiveEntries,
  decryptFile,
  ensureDirectory,
  validateRestoreConfiguration,
  verifyBackupDirectory,
} from "./free-tier-backup-lib.mjs";

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function safeDiagnostic(value, environment = process.env) {
  let diagnostic = typeof value === "string" ? value.trim() : "";
  for (const name of [
    "BACKUP_ENCRYPTION_KEY",
    "RESTORE_DRILL_DB_URL",
    "RESTORE_DRILL_SERVICE_ROLE_KEY",
  ]) {
    const secret = environment[name];
    if (secret) diagnostic = diagnostic.replaceAll(secret, "***");
  }
  diagnostic = diagnostic.replace(/postgres(?:ql)?:\/\/[^\s'"`]+/giu, "[database-url]");
  return diagnostic.slice(0, 1200);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    env: { ...process.env, ...options.env },
    stdio: options.capture ? ["ignore", "pipe", "pipe"] : "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const diagnostic = options.capture ? safeDiagnostic(result.stderr) : "";
    throw new Error(`${command} thất bại với mã ${result.status ?? "không xác định"}${diagnostic ? `: ${diagnostic}` : ""}.`);
  }
  return options.capture ? result.stdout.trim() : "";
}

function runPsql(dbUrl, args, options = {}) {
  const database = new URL(dbUrl);
  return run("psql", args, {
    ...options,
    env: {
      ...options.env,
      PGHOST: database.hostname,
      PGPORT: database.port || "5432",
      PGUSER: decodeURIComponent(database.username),
      PGPASSWORD: decodeURIComponent(database.password),
      PGDATABASE: database.pathname.replace(/^\//, "") || "postgres",
      PGSSLMODE: database.searchParams.get("sslmode") || "require",
      PGCONNECT_TIMEOUT: "20",
    },
  });
}

async function resolveBackupFile(environment) {
  if (environment.BACKUP_FILE) return path.resolve(environment.BACKUP_FILE);
  invariant(environment.BACKUP_DIRECTORY, "Thiếu BACKUP_FILE hoặc BACKUP_DIRECTORY.");
  const directory = path.resolve(environment.BACKUP_DIRECTORY);
  const entries = await readdir(directory, { withFileTypes: true });
  const backups = entries.filter((entry) => entry.isFile() && entry.name.endsWith(".imcrm-backup"));
  invariant(backups.length === 1, "Thư mục artifact phải chứa đúng một file .imcrm-backup.");
  return path.join(directory, backups[0].name);
}

function databaseSnapshot(dbUrl) {
  const sql = `
    select json_build_object(
      'publicTables', (
        select count(*)::int
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind in ('r', 'p')
      ),
      'authUsers', (select count(*)::int from auth.users),
      'storageBuckets', (select count(*)::int from storage.buckets),
      'storageObjects', (select count(*)::int from storage.objects),
      'migrationVersions', (
        select case when to_regclass('supabase_migrations.schema_migrations') is null then 0
          else (select count(*)::int from supabase_migrations.schema_migrations) end
      ),
      'publicRlsTables', (
        select count(*)::int
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind in ('r', 'p') and c.relrowsecurity
      ),
      'publicPolicies', (select count(*)::int from pg_policies where schemaname = 'public')
    )::text;
  `;
  const serialized = runPsql(dbUrl, ["--set=ON_ERROR_STOP=1", "--tuples-only", "--no-align", `--command=${sql}`], { capture: true });
  return JSON.parse(serialized);
}

function restoreDatabase(dbUrl, bundleDirectory) {
  const databaseDirectory = path.join(bundleDirectory, "database");
  runPsql(dbUrl, [
    "--single-transaction",
    "--variable=ON_ERROR_STOP=1",
    `--file=${path.join(databaseDirectory, "roles.sql")}`,
    `--file=${path.join(databaseDirectory, "schema.sql")}`,
    "--command=SET session_replication_role = replica",
    `--file=${path.join(databaseDirectory, "data.sql")}`,
  ]);
  runPsql(dbUrl, [
    "--single-transaction",
    "--variable=ON_ERROR_STOP=1",
    `--file=${path.join(databaseDirectory, "migration-schema.sql")}`,
    `--file=${path.join(databaseDirectory, "migration-data.sql")}`,
  ]);
}

async function sha256Blob(blob) {
  const hash = createHash("sha256");
  hash.update(Buffer.from(await blob.arrayBuffer()));
  return hash.digest("hex");
}

async function restoreAndVerifyStorage(client, bundleDirectory, manifest) {
  let restoredBytes = 0;
  for (const entry of manifest.storageObjects) {
    const sourcePath = path.join(bundleDirectory, ...entry.path.split("/"));
    const bytes = await readFile(sourcePath);
    invariant(bytes.length === entry.bytes, "Kích thước Storage object nguồn không khớp manifest.");
    const { error } = await client.storage.from(entry.bucket).upload(entry.objectPath, bytes, {
      contentType: entry.contentType || "application/octet-stream",
      upsert: true,
    });
    if (error) throw new Error("Không upload được một Storage object vào project restore.");
    const { data, error: downloadError } = await client.storage.from(entry.bucket).download(entry.objectPath);
    if (downloadError || !data) throw new Error("Không tải lại được một Storage object để kiểm tra.");
    invariant(data.size === entry.bytes, "Kích thước Storage object sau restore không khớp manifest.");
    invariant(await sha256Blob(data) === entry.sha256, "Checksum Storage object sau restore không khớp manifest.");
    restoredBytes += entry.bytes;
  }
  return { storageObjects: manifest.storageObjects.length, storageBytes: restoredBytes };
}

async function extractVerifiedBundle(backupFile, encryptionKey, temporaryDirectory) {
  const archivePath = path.join(temporaryDirectory, "bundle.tar.gz");
  const bundleDirectory = await ensureDirectory(path.join(temporaryDirectory, "bundle"));
  await decryptFile(backupFile, archivePath, encryptionKey);
  const listing = run("tar", ["-tzf", archivePath], { capture: true }).split("\n").filter(Boolean);
  assertSafeArchiveEntries(listing);
  run("tar", ["-xzf", archivePath, "--no-same-owner", "--no-same-permissions", "-C", bundleDirectory]);
  await verifyBackupDirectory(bundleDirectory);
  return bundleDirectory;
}

export async function runHostedRestoreDrill(environment = process.env) {
  invariant(typeof environment.BACKUP_ENCRYPTION_KEY === "string", "Thiếu BACKUP_ENCRYPTION_KEY.");
  invariant(typeof environment.RESTORE_DRILL_SERVICE_ROLE_KEY === "string" && environment.RESTORE_DRILL_SERVICE_ROLE_KEY.length >= 20, "Thiếu RESTORE_DRILL_SERVICE_ROLE_KEY.");
  const configuration = validateRestoreConfiguration({
    targetSupabaseUrl: environment.RESTORE_DRILL_SUPABASE_URL,
    targetDbUrl: environment.RESTORE_DRILL_DB_URL,
    targetProjectRef: environment.RESTORE_DRILL_PROJECT_REF,
    confirmationProjectRef: environment.RESTORE_DRILL_CONFIRM_PROJECT_REF,
    sourceProjectRef: environment.FREE_BACKUP_PROJECT_REF,
  });
  const backupFile = await resolveBackupFile(environment);
  invariant((await stat(backupFile)).isFile(), "Không tìm thấy file backup mã hóa.");
  const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "im-crm-hosted-restore-"));
  const startedAt = new Date();

  try {
    const before = assertEmptyRestoreTarget(databaseSnapshot(configuration.targetDbUrl));
    const bundleDirectory = await extractVerifiedBundle(backupFile, environment.BACKUP_ENCRYPTION_KEY, temporaryDirectory);
    const manifest = assertRestorableBackupManifest(
      JSON.parse(await readFile(path.join(bundleDirectory, "manifest.json"), "utf8")),
      configuration.sourceProjectRef,
    );
    restoreDatabase(configuration.targetDbUrl, bundleDirectory);
    const client = createClient(configuration.targetSupabaseUrl, environment.RESTORE_DRILL_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const storage = await restoreAndVerifyStorage(client, bundleDirectory, manifest);
    const after = databaseSnapshot(configuration.targetDbUrl);
    invariant(after.publicTables > 0, "Restore không tạo bảng ứng dụng.");
    invariant(after.publicRlsTables > 0 && after.publicPolicies > 0, "Restore thiếu RLS hoặc policy ứng dụng.");
    invariant(after.migrationVersions > 0, "Restore thiếu lịch sử migration.");
    invariant(after.storageObjects === manifest.storageObjects.length, "Số Storage object sau restore không khớp manifest.");

    const finishedAt = new Date();
    return {
      status: "pass",
      sourceEnvironment: manifest.sourceEnvironment,
      sourceProjectRef: configuration.sourceProjectRef,
      targetEnvironment: "hosted-disposable",
      targetProjectRef: configuration.targetProjectRef,
      startedAtUtc: startedAt.toISOString(),
      finishedAtUtc: finishedAt.toISOString(),
      durationMs: finishedAt.getTime() - startedAt.getTime(),
      databaseFiles: manifest.databaseFiles.length,
      storageObjects: storage.storageObjects,
      storageBytes: storage.storageBytes,
      targetBefore: before,
      targetAfter: after,
      checks: [
        "source-target-project-isolation",
        "empty-target-preflight",
        "encrypted-bundle-integrity",
        "single-transaction-database-restore",
        "migration-history",
        "storage-api-upload",
        "storage-checksum",
        "rls-policy-counts",
      ],
    };
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

async function main() {
  const report = await runHostedRestoreDrill();
  const serialized = `${JSON.stringify(report, null, 2)}\n`;
  if (process.env.RESTORE_DRILL_REPORT_PATH) {
    const reportPath = path.resolve(process.env.RESTORE_DRILL_REPORT_PATH);
    await mkdir(path.dirname(reportPath), { recursive: true, mode: 0o700 });
    await writeFile(reportPath, serialized, { encoding: "utf8", mode: 0o600 });
  }
  process.stdout.write(serialized);
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (import.meta.url === invokedPath) {
  main().catch((error) => {
    process.stderr.write(`Hosted restore drill thất bại: ${error instanceof Error ? error.message : "Lỗi không xác định."}\n`);
    process.exitCode = 1;
  });
}
