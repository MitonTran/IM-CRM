import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const PROJECT_ID = "im_crm";
const SOURCE_DATABASE = "postgres";
const DATABASE_USER = "postgres";
const TARGET_PREFIX = "im_crm_restore_drill_";

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

export function assertSafeProjectId(projectId) {
  invariant(projectId === PROJECT_ID, `Restore drill chỉ được phép chạy cho project local ${PROJECT_ID}.`);
  return projectId;
}

export function assertSafeTargetDatabase(databaseName) {
  invariant(
    new RegExp(`^${TARGET_PREFIX}[0-9]{8}t[0-9]{6}z_[0-9a-f]{8}$`).test(databaseName),
    "Tên database restore không đạt guardrail disposable.",
  );
  invariant(databaseName !== SOURCE_DATABASE, "Database đích không được trùng database nguồn.");
  return databaseName;
}

export function createTargetDatabaseName(now = new Date(), entropy = randomBytes(4).toString("hex")) {
  const timestamp = now.toISOString().replace(/\.\d{3}Z$/, "Z").replaceAll("-", "").replaceAll(":", "").toLowerCase();
  return assertSafeTargetDatabase(`${TARGET_PREFIX}${timestamp}_${entropy}`);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    stdio: options.capture ? ["ignore", "pipe", "pipe"] : "inherit",
  });
  if (result.error) throw result.error;
  const operation = [command, ...args.slice(0, 3)].join(" ");
  invariant(result.status === 0, `${operation} thất bại với mã ${result.status ?? "không xác định"}.`);
  return options.capture ? result.stdout.trim() : "";
}

function dockerExec(container, args, options = {}) {
  return run("docker", ["exec", container, ...args], options);
}

function databaseSnapshot(container, databaseName) {
  const sql = `
    select jsonb_build_object(
      'migration_versions', coalesce(
        (select jsonb_agg(version order by version) from supabase_migrations.schema_migrations),
        '[]'::jsonb
      ),
      'auth_users', (select count(*) from auth.users),
      'profiles', (select count(*) from public.profiles),
      'customers', (select count(*) from public.customers),
      'activities', (select count(*) from public.activities),
      'follow_up_tasks', (select count(*) from public.follow_up_tasks),
      'deals', (select count(*) from public.deals),
      'documents', (select count(*) from public.documents),
      'document_versions', (select count(*) from public.document_versions),
      'document_chunks', (select count(*) from public.document_chunks),
      'ai_customer_analyses', (select count(*) from public.ai_customer_analyses),
      'ai_conversations', (select count(*) from public.ai_conversations),
      'public_rls_tables', (
        select count(*)
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
      ),
      'public_policies', (select count(*) from pg_policies where schemaname = 'public')
    )::text;
  `;
  const serialized = dockerExec(container, [
    "psql",
    `--username=${DATABASE_USER}`,
    `--dbname=${databaseName}`,
    "--set=ON_ERROR_STOP=1",
    "--tuples-only",
    "--no-align",
    `--command=${sql}`,
  ], { capture: true });
  return JSON.parse(serialized);
}

export async function runRestoreDrill(options = {}) {
  const projectId = assertSafeProjectId(options.projectId ?? PROJECT_ID);
  const container = `supabase_db_${projectId}`;
  const targetDatabase = createTargetDatabaseName(options.now, options.entropy);
  const dumpPath = `/tmp/${targetDatabase}.dump`;
  const startedAt = new Date();
  let databaseCreated = false;
  let fixtureCreated = false;
  let operationFailed = false;

  const containerProject = run("docker", [
    "inspect",
    "--format",
    '{{ index .Config.Labels "com.supabase.cli.project" }}',
    container,
  ], { capture: true });
  invariant(containerProject === projectId, "Container PostgreSQL không thuộc đúng Supabase project local.");

  const targetExists = dockerExec(container, [
    "psql",
    `--username=${DATABASE_USER}`,
    `--dbname=${SOURCE_DATABASE}`,
    "--tuples-only",
    "--no-align",
    `--command=select exists(select 1 from pg_database where datname = '${targetDatabase}');`,
  ], { capture: true });
  invariant(targetExists === "f", "Database disposable đã tồn tại; dừng để tránh ghi đè.");

  try {
    dockerExec(container, [
      "psql",
      `--username=${DATABASE_USER}`,
      `--dbname=${SOURCE_DATABASE}`,
      "--set=ON_ERROR_STOP=1",
      "--single-transaction",
      `--command=create schema ${targetDatabase}; create table ${targetDatabase}.sentinel (marker text primary key); insert into ${targetDatabase}.sentinel values ('${targetDatabase}');`,
    ]);
    fixtureCreated = true;
    const sourceSnapshot = databaseSnapshot(container, SOURCE_DATABASE);

    dockerExec(container, [
      "pg_dump",
      `--username=${DATABASE_USER}`,
      `--dbname=${SOURCE_DATABASE}`,
      "--format=custom",
      "--no-owner",
      "--no-privileges",
      `--file=${dumpPath}`,
    ]);

    dockerExec(container, [
      "createdb",
      `--username=${DATABASE_USER}`,
      "--template=template0",
      targetDatabase,
    ]);
    databaseCreated = true;

    dockerExec(container, [
      "pg_restore",
      "--username=supabase_admin",
      `--dbname=${targetDatabase}`,
      "--exit-on-error",
      "--no-owner",
      "--no-privileges",
      dumpPath,
    ]);

    const restoredMarker = dockerExec(container, [
      "psql",
      `--username=${DATABASE_USER}`,
      `--dbname=${targetDatabase}`,
      "--tuples-only",
      "--no-align",
      `--command=select marker from ${targetDatabase}.sentinel;`,
    ], { capture: true });
    invariant(restoredMarker === targetDatabase, "Dòng fixture giả không được khôi phục nguyên vẹn.");
    const restoredSnapshot = databaseSnapshot(container, targetDatabase);
    invariant(
      JSON.stringify(restoredSnapshot) === JSON.stringify(sourceSnapshot),
      "Snapshot sau restore không khớp database nguồn.",
    );
    const backupBytes = Number(dockerExec(container, ["stat", "-c", "%s", dumpPath], { capture: true }));
    invariant(Number.isSafeInteger(backupBytes) && backupBytes > 0, "Không xác minh được kích thước backup.");

    const finishedAt = new Date();
    return {
      status: "pass",
      environment: "local-disposable",
      projectId,
      sourceDatabase: SOURCE_DATABASE,
      targetDatabaseDisposed: true,
      startedAtUtc: startedAt.toISOString(),
      finishedAtUtc: finishedAt.toISOString(),
      durationMs: finishedAt.getTime() - startedAt.getTime(),
      backupBytes,
      checks: ["container-project-label", "logical-backup", "isolated-restore", "fixture-row", "migration-versions", "critical-row-counts", "rls-policy-counts"],
      snapshot: sourceSnapshot,
    };
  } catch (error) {
    operationFailed = true;
    throw error;
  } finally {
    assertSafeTargetDatabase(targetDatabase);
    const cleanupErrors = [];
    if (databaseCreated) {
      try {
        dockerExec(container, ["dropdb", `--username=${DATABASE_USER}`, "--force", "--if-exists", targetDatabase]);
      } catch (error) {
        cleanupErrors.push(error);
      }
    }
    if (fixtureCreated) {
      try {
        dockerExec(container, [
          "psql",
          `--username=${DATABASE_USER}`,
          `--dbname=${SOURCE_DATABASE}`,
          "--set=ON_ERROR_STOP=1",
          `--command=drop schema ${targetDatabase} cascade;`,
        ]);
      } catch (error) {
        cleanupErrors.push(error);
      }
    }
    try {
      dockerExec(container, ["rm", "-f", "--", dumpPath]);
    } catch (error) {
      cleanupErrors.push(error);
    }
    if (cleanupErrors.length > 0 && !operationFailed) {
      throw cleanupErrors[0];
    }
    if (cleanupErrors.length > 0) {
      process.stderr.write("Cảnh báo: cleanup restore drill chưa hoàn tất; cần kiểm tra container local.\n");
    }
  }
}

async function main() {
  const report = await runRestoreDrill();
  const serialized = `${JSON.stringify(report, null, 2)}\n`;
  if (process.env.RESTORE_DRILL_REPORT_PATH) {
    const reportPath = path.resolve(process.env.RESTORE_DRILL_REPORT_PATH);
    await mkdir(path.dirname(reportPath), { recursive: true });
    await writeFile(reportPath, serialized, "utf8");
  }
  process.stdout.write(serialized);
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (import.meta.url === invokedPath) {
  main().catch((error) => {
    process.stderr.write(`Restore drill thất bại: ${error instanceof Error ? error.message : "Lỗi không xác định."}\n`);
    process.exitCode = 1;
  });
}
