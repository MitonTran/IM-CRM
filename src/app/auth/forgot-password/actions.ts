"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { authConfirmRedirectTo, resolveAuthRedirectOrigin } from "@/features/auth/origin";
import { passwordResetRequestSchema } from "@/features/auth/password";
import { hasSupabaseEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

export async function requestPasswordReset(formData: FormData) {
  if (!hasSupabaseEnv()) redirect("/auth/forgot-password?error=not-configured");

  const parsed = passwordResetRequestSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) redirect("/auth/forgot-password?error=invalid-email");

  const supabase = await createClient();
  const appUrl = resolveAuthRedirectOrigin(await headers(), process.env.NEXT_PUBLIC_APP_URL);
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: authConfirmRedirectTo(appUrl),
  });
  if (error) redirect("/auth/forgot-password?error=request-failed");

  redirect("/auth/forgot-password?status=sent");
}
