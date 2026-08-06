"use server";

import { redirect } from "next/navigation";
import { passwordResetRequestSchema } from "@/features/auth/password";
import { hasSupabaseEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

export async function requestPasswordReset(formData: FormData) {
  if (!hasSupabaseEnv()) redirect("/auth/forgot-password?error=not-configured");

  const parsed = passwordResetRequestSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) redirect("/auth/forgot-password?error=invalid-email");

  const supabase = await createClient();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${appUrl}/auth/callback?next=/auth/update-password`,
  });

  redirect("/auth/forgot-password?status=sent");
}
