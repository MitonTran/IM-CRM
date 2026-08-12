import { spawnSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { decryptFile, ensureDirectory, verifyBackupDirectory } from "./free-tier-backup-lib.mjs";

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

export async function verifyEncryptedBackup(environment = process.env) {
  invariant(typeof environment.BACKUP_FILE === "string" && environment.BACKUP_FILE.length > 0, "Thiếu BACKUP_FILE.");
  invariant(typeof environment.BACKUP_ENCRYPTION_KEY === "string", "Thiếu BACKUP_ENCRYPTION_KEY.");
  const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "im-crm-backup-verify-"));
  const archivePath = path.join(temporaryDirectory, "bundle.tar.gz");
  const bundleDirectory = await ensureDirectory(path.join(temporaryDirectory, "bundle"));

  try {
    await decryptFile(path.resolve(environment.BACKUP_FILE), archivePath, environment.BACKUP_ENCRYPTION_KEY);
    const extracted = spawnSync("tar", ["-xzf", archivePath, "-C", bundleDirectory], { stdio: "inherit" });
    if (extracted.error) throw extracted.error;
    invariant(extracted.status === 0, "Không giải nén được backup.");
    return await verifyBackupDirectory(bundleDirectory);
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

async function main() {
  const report = await verifyEncryptedBackup();
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (import.meta.url === invokedPath) {
  main().catch((error) => {
    process.stderr.write(`Xác minh backup thất bại: ${error instanceof Error ? error.message : "Lỗi không xác định."}\n`);
    process.exitCode = 1;
  });
}
