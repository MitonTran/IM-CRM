import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { appendFile, mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createClient } from "@supabase/supabase-js";
import {
  BACKUP_BUCKETS,
  BACKUP_FORMAT_VERSION,
  encryptFile,
  ensureDirectory,
  resolveObjectDestination,
  sha256File,
  validateBackupConfiguration,
} from "./free-tier-backup-lib.mjs";

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function run(command, args) {
  const result = spawnSync(command, args, {
    env: { ...process.env, SUPABASE_TELEMETRY_DISABLED: "1" },
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  invariant(result.status === 0, `${command} ${args[0] ?? ""} thất bại với mã ${result.status ?? "không xác định"}.`);
}

async function fileEntry(rootDirectory, filePath) {
  const details = await stat(filePath);
  return {
    path: path.relative(rootDirectory, filePath).split(path.sep).join("/"),
    bytes: details.size,
    sha256: await sha256File(filePath),
  };
}

async function dumpDatabase(dbUrl, bundleDirectory) {
  const definitions = [
    { name: "roles.sql", args: ["--role-only"] },
    { name: "schema.sql", args: [] },
    { name: "data.sql", args: ["--use-copy", "--data-only", "-x", "storage.buckets_vectors", "-x", "storage.vector_indexes"] },
    { name: "migration-schema.sql", args: ["--schema", "supabase_migrations"] },
    { name: "migration-data.sql", args: ["--use-copy", "--data-only", "--schema", "supabase_migrations"] },
  ];
  const databaseDirectory = await ensureDirectory(path.join(bundleDirectory, "database"));
  const entries = [];

  for (const definition of definitions) {
    const destination = path.join(databaseDirectory, definition.name);
    run("supabase", ["db", "dump", "--db-url", dbUrl, "--file", destination, ...definition.args]);
    entries.push(await fileEntry(bundleDirectory, destination));
  }
  return entries;
}

async function listStorageFiles(client, bucket, prefix = "", visited = new Set()) {
  invariant(!visited.has(prefix), "Storage listing phát hiện vòng lặp path.");
  visited.add(prefix);
  const files = [];
  let offset = 0;

  while (true) {
    const { data, error } = await client.storage.from(bucket).list(prefix, {
      limit: 1000,
      offset,
      sortBy: { column: "name", order: "asc" },
    });
    if (error) throw new Error(`Không liệt kê được bucket ${bucket}.`);
    const rows = data ?? [];
    for (const row of rows) {
      const objectPath = prefix ? `${prefix}/${row.name}` : row.name;
      if (row.id) files.push(objectPath);
      else files.push(...await listStorageFiles(client, bucket, objectPath, visited));
    }
    if (rows.length < 1000) break;
    offset += rows.length;
  }
  return files;
}

async function downloadStorage(supabaseUrl, serviceRoleKey, bundleDirectory) {
  const client = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const entries = [];

  for (const bucket of BACKUP_BUCKETS) {
    const objectPaths = await listStorageFiles(client, bucket);
    for (const objectPath of objectPaths.sort()) {
      const destination = resolveObjectDestination(bundleDirectory, bucket, objectPath);
      await mkdir(path.dirname(destination), { recursive: true, mode: 0o700 });
      const { data, error } = await client.storage.from(bucket).download(objectPath);
      if (error || !data) throw new Error(`Không tải được object trong bucket ${bucket}.`);
      const bytes = Buffer.from(await data.arrayBuffer());
      await writeFile(destination, bytes, { flag: "wx", mode: 0o600 });
      entries.push({
        ...(await fileEntry(bundleDirectory, destination)),
        bucket,
        objectPath,
        contentType: data.type || "application/octet-stream",
      });
    }
  }
  return entries.sort((left, right) => left.path.localeCompare(right.path));
}

function safeOutputDirectory(value) {
  const outputDirectory = path.resolve(value || "test-results/free-tier-backup");
  invariant(outputDirectory !== path.parse(outputDirectory).root, "Thư mục output backup không an toàn.");
  return outputDirectory;
}

export async function runFreeTierBackup(environment = process.env) {
  const configuration = validateBackupConfiguration({
    supabaseUrl: environment.FREE_BACKUP_SUPABASE_URL,
    dbUrl: environment.FREE_BACKUP_DB_URL,
    expectedProjectRef: environment.FREE_BACKUP_PROJECT_REF,
    sourceEnvironment: environment.FREE_BACKUP_SOURCE_ENV,
  });
  invariant(typeof environment.FREE_BACKUP_SERVICE_ROLE_KEY === "string" && environment.FREE_BACKUP_SERVICE_ROLE_KEY.length >= 20, "Thiếu FREE_BACKUP_SERVICE_ROLE_KEY.");
  invariant(typeof environment.BACKUP_ENCRYPTION_KEY === "string", "Thiếu BACKUP_ENCRYPTION_KEY.");

  const outputDirectory = await ensureDirectory(safeOutputDirectory(environment.BACKUP_OUTPUT_DIR));
  const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "im-crm-free-backup-"));
  const bundleDirectory = await ensureDirectory(path.join(temporaryDirectory, "bundle"));
  const archivePath = path.join(temporaryDirectory, "bundle.tar.gz");
  const timestamp = new Date().toISOString().replace(/\.\d{3}Z$/, "Z").replaceAll(":", "").replaceAll("-", "");
  const outputPath = path.join(outputDirectory, `im-crm-${configuration.sourceEnvironment}-${timestamp}-${randomBytes(3).toString("hex")}.imcrm-backup`);
  let outputCreated = false;

  try {
    const databaseFiles = await dumpDatabase(configuration.dbUrl, bundleDirectory);
    const storageObjects = await downloadStorage(configuration.supabaseUrl, environment.FREE_BACKUP_SERVICE_ROLE_KEY, bundleDirectory);
    const manifest = {
      formatVersion: BACKUP_FORMAT_VERSION,
      createdAtUtc: new Date().toISOString(),
      projectRef: configuration.projectRef,
      sourceEnvironment: configuration.sourceEnvironment,
      rpoHours: 24,
      rtoHours: 8,
      buckets: BACKUP_BUCKETS,
      databaseFiles,
      storageObjects,
    };
    await writeFile(path.join(bundleDirectory, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, { flag: "wx", mode: 0o600 });
    run("tar", ["-czf", archivePath, "-C", bundleDirectory, "."]);
    await encryptFile(archivePath, outputPath, environment.BACKUP_ENCRYPTION_KEY);
    outputCreated = true;

    const encryptedBytes = (await stat(outputPath)).size;
    const report = {
      status: "pass",
      sourceEnvironment: configuration.sourceEnvironment,
      projectRef: configuration.projectRef,
      createdAtUtc: manifest.createdAtUtc,
      databaseFiles: databaseFiles.length,
      storageObjects: storageObjects.length,
      encryptedBytes,
      encryptedSha256: await sha256File(outputPath),
      backupFile: outputPath,
    };
    if (environment.GITHUB_OUTPUT) await appendFile(environment.GITHUB_OUTPUT, `backup_file=${outputPath}\n`, "utf8");
    return report;
  } catch (error) {
    if (outputCreated) await rm(outputPath, { force: true });
    throw error;
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

async function main() {
  const report = await runFreeTierBackup();
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (import.meta.url === invokedPath) {
  main().catch((error) => {
    process.stderr.write(`Free tier backup thất bại: ${error instanceof Error ? error.message : "Lỗi không xác định."}\n`);
    process.exitCode = 1;
  });
}
