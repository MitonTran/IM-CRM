import { describe, expect, it } from "vitest";
import {
  parseEmailOtpType,
  passwordResetRequestSchema,
  passwordUpdateErrorCode,
  passwordUpdateErrorMessage,
  passwordUpdateSchema,
  safeAuthNext,
} from "./password";

describe("password recovery contracts", () => {
  it("chấp nhận email hợp lệ nhưng không xử lý tồn tại user ở lớp validation", () => {
    expect(passwordResetRequestSchema.safeParse({ email: "admin@example.com" }).success).toBe(true);
    expect(passwordResetRequestSchema.safeParse({ email: "khong-hop-le" }).success).toBe(false);
  });

  it("yêu cầu mật khẩu tối thiểu và hai trường khớp nhau", () => {
    expect(passwordUpdateSchema.safeParse({ password: "matkhau1", confirmPassword: "matkhau1" }).success).toBe(true);
    expect(passwordUpdateSchema.safeParse({ password: "ngan", confirmPassword: "ngan" }).success).toBe(false);
    expect(passwordUpdateSchema.safeParse({ password: "matkhau1", confirmPassword: "matkhau2" }).success).toBe(false);
  });

  it("chỉ trả mã và thông báo lỗi đặt mật khẩu nằm trong allowlist", () => {
    const shortPassword = passwordUpdateSchema.safeParse({ password: "ngan", confirmPassword: "ngan" });
    const mismatch = passwordUpdateSchema.safeParse({ password: "matkhau1", confirmPassword: "matkhau2" });
    if (shortPassword.success || mismatch.success) throw new Error("Test fixture phải không hợp lệ.");

    expect(passwordUpdateErrorCode(shortPassword.error)).toBe("invalid-password");
    expect(passwordUpdateErrorCode(mismatch.error)).toBe("password-mismatch");
    expect(passwordUpdateErrorMessage("password-mismatch")).toBe("Mật khẩu xác nhận chưa khớp.");
    expect(passwordUpdateErrorMessage("Nội dung từ URL không đáng tin")).toBe("Không thể cập nhật mật khẩu.");
    expect(passwordUpdateErrorMessage(undefined)).toBeNull();
  });

  it("chỉ chấp nhận OTP type và đường dẫn nội bộ đã allowlist", () => {
    expect(parseEmailOtpType("recovery")).toBe("recovery");
    expect(parseEmailOtpType("invite")).toBe("invite");
    expect(parseEmailOtpType("admin")).toBeNull();
    expect(safeAuthNext("/auth/update-password")).toBe("/auth/update-password");
    expect(safeAuthNext("https://example.com")).toBe("/dashboard");
    expect(safeAuthNext("//example.com")).toBe("/dashboard");
  });
});
