import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  BACKUP_BUCKETS,
  assertSafeObjectPath,
  decryptFile,
  encryptFile,
  resolveObjectDestination,
  sha256File,
  validateBackupConfiguration,
  verifyBackupDirectory,
} from "./free-tier-backup-lib.mjs";

const temporaryDirectories = [];
const key = Buffer.alloc(32, 7).toString("base64");
const wrongKey = Buffer.alloc(32, 8).toString("base64");

async function temporaryDirectory() {
  const directory = await mkdtemp(path.join(os.tmpdir(), "im-crm-backup-test-"));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("free tier backup guardrails", () => {
  it("chỉ chấp nhận URL API và database của cùng project ref", () => {
    expect(validateBackupConfiguration({
      supabaseUrl: "https://abcdefghijklmnopqrst.supabase.co",
      dbUrl: "postgresql://postgres.abcdefghijklmnopqrst:secret@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres",
      expectedProjectRef: "abcdefghijklmnopqrst",
      sourceEnvironment: "preview",
    })).toMatchObject({ projectRef: "abcdefghijklmnopqrst", sourceEnvironment: "preview" });

    expect(() => validateBackupConfiguration({
      supabaseUrl: "https://abcdefghijklmnopqrst.supabase.co",
      dbUrl: "postgresql://postgres.zzzzzzzzzzzzzzzzzzzz:secret@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres",
      expectedProjectRef: "abcdefghijklmnopqrst",
      sourceEnvironment: "preview",
    })).toThrow(/không khớp/);
  });

  it("chặn object path traversal và bucket ngoài allowlist", () => {
    expect(assertSafeObjectPath("document/version.pdf")).toBe("document/version.pdf");
    expect(() => assertSafeObjectPath("../secret")).toThrow(/không an toàn/);
    expect(() => resolveObjectDestination("/tmp/backup", "other", "file.txt")).toThrow(/allowlist/);
  });
});

describe("free tier backup encryption and integrity", () => {
  it("mã hóa và giải mã round-trip bằng AES-256-GCM", async () => {
    const directory = await temporaryDirectory();
    const source = path.join(directory, "source.txt");
    const encrypted = path.join(directory, "backup.imcrm-backup");
    const restored = path.join(directory, "restored.txt");
    await writeFile(source, "fixture giả không chứa PII", "utf8");
    await encryptFile(source, encrypted, key);
    await decryptFile(encrypted, restored, key);
    expect(await readFile(restored, "utf8")).toBe("fixture giả không chứa PII");
  });

  it("từ chối key sai và không để file bản rõ", async () => {
    const directory = await temporaryDirectory();
    const source = path.join(directory, "source.txt");
    const encrypted = path.join(directory, "backup.imcrm-backup");
    const restored = path.join(directory, "restored.txt");
    await writeFile(source, "fixture", "utf8");
    await encryptFile(source, encrypted, key);
    await expect(decryptFile(encrypted, restored, wrongKey)).rejects.toThrow(/key sai|thay đổi/);
    await expect(readFile(restored)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("xác minh checksum database và Storage từ manifest", async () => {
    const directory = await temporaryDirectory();
    const databasePath = path.join(directory, "database", "schema.sql");
    const storagePath = path.join(directory, "storage", "documents", "a", "file.pdf");
    await mkdir(path.dirname(databasePath), { recursive: true });
    await mkdir(path.dirname(storagePath), { recursive: true });
    await writeFile(databasePath, "create table fixture(id int);", "utf8");
    await writeFile(storagePath, "fake pdf", "utf8");
    const manifest = {
      formatVersion: 1,
      projectRef: "abcdefghijklmnopqrst",
      sourceEnvironment: "preview",
      createdAtUtc: "2026-08-10T00:00:00.000Z",
      buckets: BACKUP_BUCKETS,
      databaseFiles: [{ path: "database/schema.sql", bytes: 29, sha256: await sha256File(databasePath) }],
      storageObjects: [{ path: "storage/documents/a/file.pdf", bytes: 8, sha256: await sha256File(storagePath) }],
    };
    await writeFile(path.join(directory, "manifest.json"), JSON.stringify(manifest), "utf8");
    await expect(verifyBackupDirectory(directory)).resolves.toMatchObject({ status: "pass", databaseFiles: 1, storageObjects: 1 });
  });
});
