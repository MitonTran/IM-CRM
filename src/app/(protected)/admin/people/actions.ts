"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
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
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const { data, error } = await admin.auth.admin.inviteUserByEmail(parsed.data.email, {
    redirectTo: `${appUrl}/auth/callback?next=/auth/update-password`,
    data: { full_name: parsed.data.fullName },
  });
  if (error || !data.user) redirect("/admin/people?error=invite-failed");

  const { error: profileError } = await supabase.from("profiles").update({
    full_name: parsed.data.fullName,
    role: parsed.data.role,
    team_id: parsed.data.teamId || null,
    is_active: true,
  }).eq("id", data.user.id);
  if (profileError) redirect("/admin/people?error=profile-update");

  revalidatePath("/admin/people");
}
