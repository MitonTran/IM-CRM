import { describe, expect, it } from "vitest";
import { documentFileSizeError, MAX_DOCUMENT_FILE_BYTES } from "./upload-validation";

describe("document upload size validation", () => {
  it("accepts a file at the 25 MB boundary", () => {
    expect(documentFileSizeError(MAX_DOCUMENT_FILE_BYTES)).toBeNull();
  });

  it("rejects a file larger than 25 MB before upload", () => {
    expect(documentFileSizeError(MAX_DOCUMENT_FILE_BYTES + 1)).toBe("File không được vượt quá 25 MB.");
  });

  it.each([0, -1, Number.NaN, 1.5])("rejects invalid file size %s", (sizeBytes) => {
    expect(documentFileSizeError(sizeBytes)).toBe("Hãy chọn một file hợp lệ.");
  });
});
