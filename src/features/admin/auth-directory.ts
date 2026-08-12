import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { listAuthUserEmails } from "./invitation-recovery";

export async function loadAuthEmailDirectory() {
  try {
    const authAdmin = createAdminClient().auth.admin;
    const emails = await listAuthUserEmails(authAdmin.listUsers.bind(authAdmin));
    return { emails, available: true };
  } catch {
    return { emails: {} as Record<string, string>, available: false };
  }
}
