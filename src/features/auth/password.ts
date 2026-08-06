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

const emailOtpTypes = ["signup", "invite", "magiclink", "recovery", "email_change", "email"] as const;

export type SupportedEmailOtpType = (typeof emailOtpTypes)[number];

export function parseEmailOtpType(value: string | null): SupportedEmailOtpType | null {
  return emailOtpTypes.find((type) => type === value) ?? null;
}

export function safeAuthNext(value: string | null) {
  return value === "/auth/update-password" ? value : "/dashboard";
}
