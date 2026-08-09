import type { User } from "@supabase/supabase-js";

export type InvitationProfileState = {
  id: string;
  is_active: boolean;
} | null;

type ListUsersResult = {
  data: { users: User[]; total?: number; nextPage?: number | null };
  error: Error | null;
};

type ListUsers = (params: { page: number; perPage: number }) => Promise<ListUsersResult>;

export function normalizeInvitationEmail(email: string) {
  return email.trim().toLowerCase();
}

export function isRecoverableInvitationAccount(user: User, profile: InvitationProfileState) {
  return (!profile || !profile.is_active)
    && !user.confirmed_at
    && !user.email_confirmed_at
    && !user.last_sign_in_at;
}

export async function findAuthUserByEmail(
  listUsers: ListUsers,
  email: string,
  options: { perPage?: number; maxPages?: number } = {},
) {
  const normalizedEmail = normalizeInvitationEmail(email);
  const perPage = options.perPage ?? 1000;
  const maxPages = options.maxPages ?? 100;

  for (let page = 1; page <= maxPages; page += 1) {
    const { data, error } = await listUsers({ page, perPage });
    if (error) throw new Error("auth_directory_unavailable");

    const match = data.users.find((user) => normalizeInvitationEmail(user.email ?? "") === normalizedEmail);
    if (match) return match;

    const reachedTotal = typeof data.total === "number" && data.total > 0 && page * perPage >= data.total;
    if (data.users.length < perPage || data.nextPage === null || reachedTotal) return null;
  }

  throw new Error("auth_directory_limit_exceeded");
}
