import { z } from "zod";

export const PASSWORD_MIN_LENGTH = 8;

export const passwordResetRequestSchema = z.object({
  email: z.email("Email không hợp lệ."),
});

export const passwordUpdateSchema = z
  .object({
    password: z.string().min(PASSWORD_MIN_LENGTH, `Mật khẩu cần ít nhất ${PASSWORD_MIN_LENGTH} ký tự.`),
    confirmPassword: z.string(),
  })
  .refine(({ password, confirmPassword }) => password === confirmPassword, {
    message: "Mật khẩu xác nhận chưa khớp.",
    path: ["confirmPassword"],
  });

const passwordUpdateErrorMessages: Record<string, string> = {
  "invalid-password": `Mật khẩu cần ít nhất ${PASSWORD_MIN_LENGTH} ký tự.`,
  "password-mismatch": "Mật khẩu xác nhận chưa khớp.",
  "update-failed": "Không thể cập nhật mật khẩu. Liên kết có thể đã hết hạn.",
};

export function passwordUpdateErrorCode(error: z.ZodError) {
  return error.issues.some((issue) => issue.path[0] === "confirmPassword")
    ? "password-mismatch"
    : "invalid-password";
}

export function passwordUpdateErrorMessage(value: string | undefined) {
  if (!value) return null;
  return passwordUpdateErrorMessages[value] ?? "Không thể cập nhật mật khẩu.";
}

const emailOtpTypes = ["signup", "invite", "magiclink", "recovery", "email_change", "email"] as const;

export type SupportedEmailOtpType = (typeof emailOtpTypes)[number];

export function parseEmailOtpType(value: string | null): SupportedEmailOtpType | null {
  return emailOtpTypes.find((type) => type === value) ?? null;
}

export function safeAuthNext(value: string | null) {
  return value === "/auth/update-password" ? value : "/dashboard";
}
