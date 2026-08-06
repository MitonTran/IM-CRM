import { describe, expect, it } from "vitest";
import {
  parseEmailOtpType,
  passwordResetRequestSchema,
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

  it("chỉ chấp nhận OTP type và đường dẫn nội bộ đã allowlist", () => {
    expect(parseEmailOtpType("recovery")).toBe("recovery");
    expect(parseEmailOtpType("invite")).toBe("invite");
    expect(parseEmailOtpType("admin")).toBeNull();
    expect(safeAuthNext("/auth/update-password")).toBe("/auth/update-password");
    expect(safeAuthNext("https://example.com")).toBe("/dashboard");
    expect(safeAuthNext("//example.com")).toBe("/dashboard");
  });
});
