import type { User } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import {
  findAuthUserByEmail,
  isRecoverableInvitationAccount,
  listAuthUserEmails,
  normalizeInvitationEmail,
} from "./invitation-recovery";

function user(id: string, email: string, extra: Partial<User> = {}): User {
  return {
    id,
    email,
    aud: "authenticated",
    app_metadata: {},
    user_metadata: {},
    created_at: "2026-08-09T00:00:00.000Z",
    ...extra,
  };
}

describe("invitation recovery", () => {
  it("normalizes email without changing the stored credential", () => {
    expect(normalizeInvitationEmail("  Sale.B+UAT@Example.COM ")).toBe("sale.b+uat@example.com");
  });

  it("finds an exact normalized email across paginated Auth users", async () => {
    const target = user("target", "Leader.B@Example.com");
    const listUsers = vi.fn(async ({ page }: { page: number; perPage: number }) => page === 1
      ? { data: { users: [user("one", "one@example.com"), user("two", "two@example.com")], total: 3, nextPage: 2 }, error: null }
      : { data: { users: [target], total: 3, nextPage: null }, error: null });

    await expect(findAuthUserByEmail(listUsers, " leader.b@example.COM ", { perPage: 2 }))
      .resolves.toEqual(target);
    expect(listUsers).toHaveBeenCalledTimes(2);
  });

  it("returns null after the final page", async () => {
    const listUsers = vi.fn(async () => ({ data: { users: [user("one", "one@example.com")], total: 1, nextPage: null }, error: null }));
    await expect(findAuthUserByEmail(listUsers, "missing@example.com", { perPage: 2 })).resolves.toBeNull();
  });

  it("maps directory failures to a safe internal error", async () => {
    const listUsers = vi.fn(async () => ({ data: { users: [] }, error: new Error("provider detail") }));
    await expect(findAuthUserByEmail(listUsers, "user@example.com")).rejects.toThrow("auth_directory_unavailable");
  });

  it("builds a minimal email directory across every Auth page", async () => {
    const listUsers = vi.fn(async ({ page }: { page: number; perPage: number }) => page === 1
      ? { data: { users: [user("one", "one@example.com"), user("without-email", "")], total: 3, nextPage: 2 }, error: null }
      : { data: { users: [user("two", "two+uat@example.com")], total: 3, nextPage: null }, error: null });

    await expect(listAuthUserEmails(listUsers, { perPage: 2 })).resolves.toEqual({
      one: "one@example.com",
      two: "two+uat@example.com",
    });
    expect(listUsers).toHaveBeenCalledTimes(2);
  });

  it("does not expose provider details when listing the email directory fails", async () => {
    const listUsers = vi.fn(async () => ({ data: { users: [] }, error: new Error("sensitive provider detail") }));
    await expect(listAuthUserEmails(listUsers)).rejects.toThrow("auth_directory_unavailable");
  });

  it("only recovers an unconfirmed, unsigned-in, inactive account", () => {
    const pending = user("pending", "pending@example.com");
    expect(isRecoverableInvitationAccount(pending, { id: pending.id, is_active: false })).toBe(true);
    expect(isRecoverableInvitationAccount(pending, null)).toBe(true);
    expect(isRecoverableInvitationAccount(pending, { id: pending.id, is_active: true })).toBe(false);
    expect(isRecoverableInvitationAccount(user("confirmed", "confirmed@example.com", { email_confirmed_at: "2026-08-09T01:00:00.000Z" }), null)).toBe(false);
    expect(isRecoverableInvitationAccount(user("signed-in", "signed@example.com", { last_sign_in_at: "2026-08-09T01:00:00.000Z" }), null)).toBe(false);
  });
});
