export const APP_ROLES = ["admin", "leader", "sale"] as const;
export type AppRole = (typeof APP_ROLES)[number];

export type Profile = {
  id: string;
  full_name: string;
  role: AppRole;
  team_id: string | null;
  is_active: boolean;
};

export const ROLE_LABELS: Record<AppRole, string> = {
  admin: "Quản trị viên",
  leader: "Trưởng nhóm",
  sale: "Tư vấn viên",
};

export function canManagePeople(role: AppRole) {
  return role === "admin";
}

export function dataScopeFor(profile: Pick<Profile, "role" | "team_id">) {
  if (profile.role === "admin") return "all" as const;
  if (profile.role === "leader" && profile.team_id) return "team" as const;
  return "own" as const;
}
