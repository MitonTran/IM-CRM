import { createClient } from "@supabase/supabase-js";
import postgres from "postgres";
import { E2E_CUSTOMERS, E2E_TEAMS, E2E_USERS } from "./fixtures";

function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Thiếu ${name} cho E2E local.`);
  return value;
}

export default async function globalTeardown() {
  if (process.env.E2E_LOCAL_ONLY !== "true") throw new Error("Từ chối xóa fixture ngoà Supabase local.");
  const url = required("NEXT_PUBLIC_SUPABASE_URL");
  const databaseUrl = required("E2E_DB_URL");
  if (!["127.0.0.1", "localhost"].includes(new URL(url).hostname) || !["127.0.0.1", "localhost"].includes(new URL(databaseUrl).hostname)) {
    throw new Error("Từ chối xóa fixture trên database không phải local.");
  }

  const supabase = createClient(url, required("SUPABASE_SERVICE_ROLE_KEY"), { auth: { autoRefreshToken: false, persistSession: false } });
  const listed = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (listed.error) throw new Error("Không đọc được user để dọn fixture E2E local.");
  const emails = new Set<string>(Object.values(E2E_USERS).map((user) => user.email));
  const userIds = listed.data.users.filter((user) => user.email && emails.has(user.email)).map((user) => user.id);
  const customerIds = Object.values(E2E_CUSTOMERS).map((customer) => customer.id);
  const teamIds = Object.values(E2E_TEAMS).map((team) => team.id);
  const entityIds = [...customerIds, ...teamIds, ...userIds];

  const sql = postgres(databaseUrl, { max: 1, onnotice: () => undefined });
  try {
    await sql.begin(async (tx) => {
      for (const customerId of customerIds) await tx`delete from public.customers where id=${customerId}::uuid`;
      for (const userId of userIds) await tx`delete from public.profiles where id=${userId}::uuid`;
      for (const teamId of teamIds) await tx`delete from public.teams where id=${teamId}::uuid`;
      for (const entityId of entityIds) await tx`delete from public.audit_logs where entity_id=${entityId}::uuid`;
    });
  } finally {
    await sql.end();
  }

  for (const userId of userIds) {
    const deleted = await supabase.auth.admin.deleteUser(userId);
    if (deleted.error) throw new Error("Không xóa được user fixture E2E local.");
  }
}
