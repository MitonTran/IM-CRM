"use server";

import { redirect } from "next/navigation";
import { passwordUpdateErrorCode, passwordUpdateSchema } from "@/features/auth/password";
import { createClient } from "@/lib/supabase/server";

export async function updatePassword(formData: FormData) {
  const parsed = passwordUpdateSchema.safeParse({
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.success) redirect(`/auth/update-password?error=${passwordUpdateErrorCode(parsed.error)}`);

  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  if (!claimsData?.claims) redirect("/login?error=recovery-expired");

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) redirect("/auth/update-password?error=update-failed");

  await supabase.auth.signOut({ scope: "local" });
  redirect("/login?status=password-updated");
}
