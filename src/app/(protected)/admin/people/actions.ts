"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { findAuthUserByEmail, isRecoverableInvitationAccount, normalizeInvitationEmail } from "@/features/admin/invitation-recovery";
import { resolveAuthRedirectOrigin } from "@/features/auth/origin";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const teamSchema = z.object({ name: z.string().trim().min(2).max(80) });
const inviteSchema = z.object({
  email: z.email(),
  fullName: z.string().trim().min(2).max(120),
  role: z.enum(["admin", "leader", "sale"]),
  teamId: z.union([z.uuid(), z.literal("")]),
});
const activeFlag = z.enum(["true", "false"]).transform((value) => value === "true");
const manageTeamSchema = z.object({
  teamId: z.uuid(),
  name: z.string().trim().min(2).max(80),
  isActive: activeFlag,
});
const managePersonSchema = z.object({
  userId: z.uuid(),
  fullName: z.string().trim().min(2).max(120),
  role: z.enum(["admin", "leader", "sale"]),
  teamId: z.union([z.uuid(), z.literal("")]),
  isActive: activeFlag,
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
  redirect("/admin/people?status=team-created");
}

function managementErrorCode(message: string) {
  const knownCodes = [
    "team_manage_input_invalid",
    "team_manage_not_found",
    "team_manage_active_members",
    "team_manage_active_customers",
    "team_manage_name_taken",
    "profile_manage_input_invalid",
    "profile_manage_not_found",
    "profile_manage_team_required",
    "profile_manage_team_invalid",
    "profile_manage_self_privileges",
    "profile_manage_active_customers",
    "profile_manage_pending_tasks",
  ] as const;
  return knownCodes.find((code) => message.includes(code)) ?? "management-failed";
}

export async function manageTeam(formData: FormData) {
  const supabase = await requireAdmin();
  const parsed = manageTeamSchema.safeParse({
    teamId: formData.get("teamId"),
    name: formData.get("name"),
    isActive: formData.get("isActive"),
  });
  if (!parsed.success) redirect("/admin/people?error=team_manage_input_invalid");

  const { error } = await supabase.rpc("admin_manage_team", {
    target_team_id: parsed.data.teamId,
    managed_name: parsed.data.name,
    managed_is_active: parsed.data.isActive,
  });
  if (error) redirect(`/admin/people?error=${managementErrorCode(error.message)}`);
  revalidatePath("/admin/people");
  redirect("/admin/people?status=team-saved");
}

export async function managePerson(formData: FormData) {
  const supabase = await requireAdmin();
  const parsed = managePersonSchema.safeParse({
    userId: formData.get("userId"),
    fullName: formData.get("fullName"),
    role: formData.get("role"),
    teamId: formData.get("teamId"),
    isActive: formData.get("isActive"),
  });
  if (!parsed.success) redirect("/admin/people?error=profile_manage_input_invalid");

  const { error } = await supabase.rpc("admin_manage_profile", {
    target_user_id: parsed.data.userId,
    managed_full_name: parsed.data.fullName,
    managed_role: parsed.data.role,
    managed_team_id: parsed.data.teamId || null,
    managed_is_active: parsed.data.isActive,
  });
  if (error) redirect(`/admin/people?error=${managementErrorCode(error.message)}`);
  revalidatePath("/admin/people");
  redirect("/admin/people?status=person-saved");
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

  const appUrl = resolveAuthRedirectOrigin(await headers(), process.env.NEXT_PUBLIC_APP_URL);
  const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${appUrl}/auth/callback?next=/auth/update-password`,
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
