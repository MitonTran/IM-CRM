import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { hasSupabaseEnv } from "@/lib/env";
import { type Profile } from "@/lib/access";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  if (!hasSupabaseEnv()) redirect("/login?error=not-configured");

  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  if (!userId) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, full_name, role, team_id, is_active, team:teams!profiles_team_id_fkey(name)")
    .eq("id", userId)
    .single();

  if (!profile?.is_active) redirect("/login?error=inactive");
  const team = Array.isArray(profile.team) ? profile.team[0] : profile.team;

  return <AppShell profile={profile as Profile} teamName={(team as { name?: string } | null)?.name}>{children}</AppShell>;
}
