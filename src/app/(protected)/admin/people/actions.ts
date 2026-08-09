"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { findAuthUserByEmail, isRecoverableInvitationAccount, normalizeInvitationEmail } from "@/features/admin/invitation-recovery";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const teamSchema = z.object({ name: z.string().trim().min(2).max(80) });
const inviteSchema = z.object({
  email: z.email(),
  fullName: z.string().trim().min(2).max(120),
  role: z.enum(["admin", "leader", "sale"]),
  teamId: z.union([z.uuid(), z.literal("")]),
});

async function requireAdmin() {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  if (!userId) redirect("/login");
  const { data } = await supabase.from("profiles").select("role,is_active").eq("id", userId).single();
  if (data?.role !== "admin" || !data.is_active) redirect("/dashboard");
  return supabase;
}

export async function createTeam(formData: FormData) {
  const supabase = await requireAdmin();
  const parsed = teamSchema.safeParse({ name: formData.get("name") });
  if (!parsed.success) redirect("/admin/people?error=team-invalid");
  const { error } = await supabase.from("teams").insert({ name: parsed.data.name });
  if (error) redirect("/admin/people?error=team-create");
  revalidatePath("/admin/people");
}

export async function invitePerson(formData: FormData) {
  const supabase = await requireAdmin();
  const parsed = inviteSchema.safeParse({
    email: formData.get("email"), fullName: formData.get("fullName"),
    role: formData.get("role"), teamId: formData.get("teamId"),
  });
  if (!parsed.success) redirect("/admin/people?error=invite-invalid");
  if (parsed.data.role !== "admin" && !parsed.data.teamId) redirect("/admin/people?error=team-required");

  const admin = createAdminClient();
  const email = normalizeInvitationEmail(parsed.data.email);
  let existingUser;
  try {
    existingUser = await findAuthUserByEmail(admin.auth.admin.listUsers.bind(admin.auth.admin), email);
  } catch {
    redirect("/admin/people?error=invite-directory");
  }

  if (existingUser) {
    const { data: existingProfile } = await supabase
      .from("profiles")
      .select("id,is_active")
      .eq("id", existingUser.id)
      .maybeSingle();
    if (!isRecoverableInvitationAccount(existingUser, existingProfile)) {
      redirect("/admin/people?error=invite-exists");
    }

    const { error: prepareError } = await supabase.rpc("configure_invited_profile", {
      target_user_id: existingUser.id,
      invited_full_name: parsed.data.fullName,
      invited_role: parsed.data.role,
      invited_team_id: parsed.data.role === "admin" ? null : parsed.data.teamId,
      activate_profile: false,
    });
    if (prepareError) redirect("/admin/people?error=profile-update");
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${appUrl}/auth/callback`,
    data: { full_name: parsed.data.fullName },
  });
  if (error || !data.user) {
    let partialUser = existingUser;
    if (!partialUser) {
      try {
        partialUser = await findAuthUserByEmail(admin.auth.admin.listUsers.bind(admin.auth.admin), email);
      } catch {
        redirect("/admin/people?error=invite-directory");
      }
    }

    if (!partialUser) redirect("/admin/people?error=invite-failed");
    const { data: partialProfile } = await supabase
      .from("profiles")
      .select("id,is_active")
      .eq("id", partialUser.id)
      .maybeSingle();
    if (!isRecoverableInvitationAccount(partialUser, partialProfile)) {
      redirect("/admin/people?error=invite-exists");
    }

    const { error: recoveryError } = await supabase.rpc("configure_invited_profile", {
      target_user_id: partialUser.id,
      invited_full_name: parsed.data.fullName,
      invited_role: parsed.data.role,
      invited_team_id: parsed.data.role === "admin" ? null : parsed.data.teamId,
      activate_profile: false,
    });
    if (recoveryError) redirect("/admin/people?error=profile-update");
    revalidatePath("/admin/people");
    redirect("/admin/people?error=invite-pending");
  }

  if (existingUser && data.user.id !== existingUser.id) {
    redirect("/admin/people?error=invite-integrity");
  }

  const { error: profileError } = await supabase.rpc("configure_invited_profile", {
    target_user_id: data.user.id,
    invited_full_name: parsed.data.fullName,
    invited_role: parsed.data.role,
    invited_team_id: parsed.data.role === "admin" ? null : parsed.data.teamId,
    activate_profile: true,
  });
  if (profileError) redirect("/admin/people?error=profile-update");

  revalidatePath("/admin/people");
  redirect("/admin/people?status=invite-sent");
}
