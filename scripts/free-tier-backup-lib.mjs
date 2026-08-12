import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, open, readFile, rm, stat } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";

export const BACKUP_BUCKETS = ["document-extracted", "documents"];
export const BACKUP_FORMAT_VERSION = 1;
export const BACKUP_POSTGRES_IMAGE = "ghcr.io/supabase/postgres:17.6.1.156";
export const REQUIRED_DATABASE_BACKUP_FILES = [
  "database/data.sql",
  "database/migration-data.sql",
  "database/migration-schema.sql",
  "database/roles.sql",
  "database/schema.sql",
];

const MAGIC = Buffer.from("IMCRMBK1", "ascii");
const IV_BYTES = 12;
const TAG_BYTES = 16;
const PROJECT_REF_PATTERN = /^[a-z0-9]{20}$/;

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

export function decodeEncryptionKey(encoded) {
  invariant(typeof encoded === "string" && /^[A-Za-z0-9+/]{43}=$/.test(encoded), "BACKUP_ENCRYPTION_KEY phải là base64 của đúng 32 byte.");
  const key = Buffer.from(encoded, "base64");
  invariant(key.length === 32 && key.toString("base64") === encoded, "BACKUP_ENCRYPTION_KEY không hợp lệ.");
  return key;
}

export function assertSafeObjectPath(objectPath) {
  invariant(typeof objectPath === "string" && objectPath.length > 0, "Storage object path không được để trống.");
  invariant(!objectPath.startsWith("/") && !objectPath.includes("\\") && !objectPath.includes("\0"), "Storage object path không an toàn.");
  const segments = objectPath.split("/");
  invariant(segments.every((segment) => segment && segment !== "." && segment !== ".."), "Storage object path không an toàn.");
  invariant(path.posix.normalize(objectPath) === objectPath, "Storage object path không ở dạng chuẩn.");
  return objectPath;
}

export function resolveObjectDestination(rootDirectory, bucket, objectPath) {
  invariant(BACKUP_BUCKETS.includes(bucket), "Bucket nằm ngoài allowlist backup.");
  const safeObjectPath = assertSafeObjectPath(objectPath);
  const bucketRoot = path.resolve(rootDirectory, "storage", bucket);
  const destination = path.resolve(bucketRoot, ...safeObjectPath.split("/"));
  invariant(destination.startsWith(`${bucketRoot}${path.sep}`), "Storage object path thoát khỏi thư mục backup.");
  return destination;
}

export function validateBackupConfiguration({ supabaseUrl, dbUrl, expectedProjectRef, sourceEnvironment }) {
  invariant(PROJECT_REF_PATTERN.test(expectedProjectRef ?? ""), "FREE_BACKUP_PROJECT_REF phải là project ref Supabase 20 ký tự.");
  invariant(["preview", "production"].includes(sourceEnvironment), "FREE_BACKUP_SOURCE_ENV chỉ được là preview hoặc production.");

  let api;
  let database;
  try {
    api = new URL(supabaseUrl);
    database = new URL(dbUrl);
  } catch {
    throw new Error("URL Supabase backup không hợp lệ.");
  }

  invariant(api.protocol === "https:" && api.hostname === `${expectedProjectRef}.supabase.co`, "Supabase URL không khớp project ref đã duyệt.");
  invariant(database.protocol === "postgresql:" || database.protocol === "postgres:", "Database URL phải dùng PostgreSQL.");
  invariant(database.password.length > 0, "Database URL phải chứa mật khẩu đã percent-encode.");
  const decodedUsername = decodeURIComponent(database.username);
  const directMatch = database.hostname === `db.${expectedProjectRef}.supabase.co`;
  const poolerMatch = decodedUsername === `postgres.${expectedProjectRef}` && database.hostname.endsWith(".pooler.supabase.com");
  invariant(directMatch || poolerMatch, "Database URL không khớp project ref đã duyệt.");

  return { projectRef: expectedProjectRef, sourceEnvironment, supabaseUrl: api.origin, dbUrl: database.href };
}

export function buildRoleDumpCommand(dbUrl, postgresImage = BACKUP_POSTGRES_IMAGE) {
  const database = new URL(dbUrl);
  invariant(database.protocol === "postgresql:" || database.protocol === "postgres:", "Database URL phải dùng PostgreSQL.");
  invariant(database.hostname && database.username && database.password, "Database URL thiếu thông tin kết nối role dump.");
  invariant(typeof postgresImage === "string" && postgresImage.startsWith("ghcr.io/supabase/postgres:"), "Postgres image không hợp lệ.");

  return {
    command: "docker",
    args: [
      "run",
      "--rm",
      "-e",
      "PGPASSWORD",
      postgresImage,
      "pg_dumpall",
      "--roles-only",
      "--no-role-passwords",
      "--host",
      database.hostname,
      "--port",
      database.port || "5432",
      "--username",
      decodeURIComponent(database.username),
      "--database",
      decodeURIComponent(database.pathname.replace(/^\//, "") || "postgres"),
    ],
    env: { PGPASSWORD: decodeURIComponent(database.password) },
  };
}

export function validateRestoreConfiguration({
  targetSupabaseUrl,
  targetDbUrl,
  targetProjectRef,
  confirmationProjectRef,
  sourceProjectRef,
}) {
  invariant(PROJECT_REF_PATTERN.test(targetProjectRef ?? ""), "RESTORE_DRILL_PROJECT_REF phải là project ref Supabase 20 ký tự.");
  invariant(PROJECT_REF_PATTERN.test(sourceProjectRef ?? ""), "Project ref nguồn backup không hợp lệ.");
  invariant(targetProjectRef !== sourceProjectRef, "Project restore không được trùng project nguồn Preview.");
  invariant(confirmationProjectRef === targetProjectRef, "Xác nhận project restore không khớp project ref đã duyệt.");

  let api;
  let database;
  try {
    api = new URL(targetSupabaseUrl);
    database = new URL(targetDbUrl);
  } catch {
    throw new Error("URL project restore không hợp lệ.");
  }

  invariant(api.protocol === "https:" && api.hostname === `${targetProjectRef}.supabase.co`, "Supabase URL restore không khớp project ref đã duyệt.");
  invariant(database.protocol === "postgresql:" || database.protocol === "postgres:", "Database restore URL phải dùng PostgreSQL.");
  invariant(database.password.length > 0, "Database restore URL phải chứa mật khẩu đã percent-encode.");
  const decodedUsername = decodeURIComponent(database.username);
  const directMatch = database.hostname === `db.${targetProjectRef}.supabase.co`;
  const poolerMatch = decodedUsername === `postgres.${targetProjectRef}` && database.hostname.endsWith(".pooler.supabase.com");
  invariant(directMatch || poolerMatch, "Database restore URL không khớp project ref đã duyệt.");

  return {
    sourceProjectRef,
    targetProjectRef,
    targetSupabaseUrl: api.origin,
    targetDbUrl: database.href,
  };
}

export function assertSafeArchiveEntries(entries) {
  invariant(Array.isArray(entries) && entries.length > 0, "Archive backup không có file.");
  for (const entry of entries) {
    invariant(typeof entry === "string" && entry.length > 0 && !entry.includes("\0") && !entry.includes("\\"), "Archive backup chứa path không an toàn.");
    const relative = entry.replace(/^\.\//, "").replace(/\/$/, "");
    if (!relative) continue;
    invariant(!path.posix.isAbsolute(relative), "Archive backup chứa path tuyệt đối.");
    const segments = relative.split("/");
    invariant(segments.every((segment) => segment && segment !== "." && segment !== ".."), "Archive backup chứa path traversal.");
    invariant(path.posix.normalize(relative) === relative, "Archive backup chứa path không ở dạng chuẩn.");
  }
  return entries;
}

export function assertRestorableBackupManifest(manifest, expectedSourceProjectRef) {
  invariant(manifest?.projectRef === expectedSourceProjectRef, "Manifest không thuộc project nguồn đã duyệt.");
  invariant(manifest?.sourceEnvironment === "preview", "Restore drill hosted chỉ nhận backup Preview.");
  const databasePaths = (manifest.databaseFiles ?? []).map((entry) => entry.path).sort();
  invariant(JSON.stringify(databasePaths) === JSON.stringify(REQUIRED_DATABASE_BACKUP_FILES), "Manifest thiếu hoặc thừa file database bắt buộc.");
  invariant(JSON.stringify(manifest.buckets) === JSON.stringify(BACKUP_BUCKETS), "Manifest bucket không khớp allowlist restore.");
  return manifest;
}

export function assertEmptyRestoreTarget(snapshot) {
  for (const key of ["publicTables", "authUsers", "storageBuckets", "storageObjects"]) {
    invariant(Number.isSafeInteger(snapshot?.[key]) && snapshot[key] === 0, `Project restore không rỗng (${key}).`);
  }
  return snapshot;
}

export function extractRoleNamesFromDump(sql) {
  invariant(typeof sql === "string" && sql.length > 0, "roles.sql không hợp lệ.");
  const names = new Set();
  const pattern = /^\s*(?:CREATE|ALTER)\s+ROLE\s+(?:"([^"]+)"|([a-z_][a-z0-9_]*))/gimu;
  for (const match of sql.matchAll(pattern)) names.add(match[1] ?? match[2]);
  invariant(names.size > 0, "roles.sql không chứa role để kiểm tra.");
  return [...names].sort();
}

export async function sha256File(filePath) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest("hex");
}

export async function encryptFile(sourcePath, outputPath, encodedKey) {
  const key = decodeEncryptionKey(encodedKey);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertextPath = `${outputPath}.cipher-${randomBytes(6).toString("hex")}`;
  let outputCreated = false;

  try {
    await pipeline(createReadStream(sourcePath), cipher, createWriteStream(ciphertextPath, { flags: "wx", mode: 0o600 }));
    const tag = cipher.getAuthTag();
    const output = await open(outputPath, "wx", 0o600);
    outputCreated = true;
    try {
      await output.write(MAGIC);
      await output.write(iv);
      for await (const chunk of createReadStream(ciphertextPath)) await output.write(chunk);
      await output.write(tag);
    } finally {
      await output.close();
    }
    return outputPath;
  } catch (error) {
    if (outputCreated) await rm(outputPath, { force: true });
    throw error;
  } finally {
    await rm(ciphertextPath, { force: true });
  }
}

export async function decryptFile(sourcePath, outputPath, encodedKey) {
  const key = decodeEncryptionKey(encodedKey);
  const details = await stat(sourcePath);
  invariant(details.size > MAGIC.length + IV_BYTES + TAG_BYTES, "File backup mã hóa bị thiếu dữ liệu.");

  const source = await open(sourcePath, "r");
  const header = Buffer.alloc(MAGIC.length + IV_BYTES);
  const tag = Buffer.alloc(TAG_BYTES);
  try {
    await source.read(header, 0, header.length, 0);
    await source.read(tag, 0, tag.length, details.size - TAG_BYTES);
  } finally {
    await source.close();
  }
  invariant(header.subarray(0, MAGIC.length).equals(MAGIC), "Định dạng backup không được hỗ trợ.");

  const decipher = createDecipheriv("aes-256-gcm", key, header.subarray(MAGIC.length));
  decipher.setAuthTag(tag);
  try {
    await pipeline(
      createReadStream(sourcePath, { start: header.length, end: details.size - TAG_BYTES - 1 }),
      decipher,
      createWriteStream(outputPath, { flags: "wx", mode: 0o600 }),
    );
    return outputPath;
  } catch (error) {
    await rm(outputPath, { force: true });
    throw new Error("Không giải mã được backup; key sai hoặc file đã bị thay đổi.", { cause: error });
  }
}

async function verifyFile(rootDirectory, entry) {
  invariant(entry && typeof entry.path === "string" && typeof entry.sha256 === "string" && Number.isSafeInteger(entry.bytes), "Manifest backup không hợp lệ.");
  const filePath = path.resolve(rootDirectory, ...entry.path.split("/"));
  invariant(filePath.startsWith(`${path.resolve(rootDirectory)}${path.sep}`), "Manifest chứa path không an toàn.");
  const details = await stat(filePath);
  invariant(details.isFile() && details.size === entry.bytes, "Kích thước một file trong backup không khớp manifest.");
  invariant(await sha256File(filePath) === entry.sha256, "Checksum một file trong backup không khớp manifest.");
}

export async function verifyBackupDirectory(rootDirectory) {
  const manifest = JSON.parse(await readFile(path.join(rootDirectory, "manifest.json"), "utf8"));
  invariant(manifest.formatVersion === BACKUP_FORMAT_VERSION, "Phiên bản manifest backup không được hỗ trợ.");
  invariant(PROJECT_REF_PATTERN.test(manifest.projectRef ?? ""), "Manifest thiếu project ref hợp lệ.");
  invariant(["preview", "production"].includes(manifest.sourceEnvironment), "Manifest thiếu môi trường nguồn hợp lệ.");
  invariant(Array.isArray(manifest.databaseFiles) && Array.isArray(manifest.storageObjects), "Manifest thiếu danh sách file.");
  invariant(JSON.stringify(manifest.buckets) === JSON.stringify(BACKUP_BUCKETS), "Manifest bucket không khớp allowlist.");

  for (const entry of [...manifest.databaseFiles, ...manifest.storageObjects]) await verifyFile(rootDirectory, entry);
  return {
    status: "pass",
    projectRef: manifest.projectRef,
    sourceEnvironment: manifest.sourceEnvironment,
    createdAtUtc: manifest.createdAtUtc,
    databaseFiles: manifest.databaseFiles.length,
    storageObjects: manifest.storageObjects.length,
    storageBytes: manifest.storageObjects.reduce((sum, item) => sum + item.bytes, 0),
  };
}

export async function ensureDirectory(directory) {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  return directory;
}
