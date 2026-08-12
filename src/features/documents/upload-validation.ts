export const MAX_DOCUMENT_FILE_BYTES = 25 * 1024 * 1024;

export function documentFileSizeError(sizeBytes: number) {
  if (!Number.isSafeInteger(sizeBytes) || sizeBytes <= 0) return "Hãy chọn một file hợp lệ.";
  if (sizeBytes > MAX_DOCUMENT_FILE_BYTES) return "File không được vượt quá 25 MB.";
  return null;
}
