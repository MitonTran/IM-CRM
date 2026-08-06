import { createClient } from "@supabase/supabase-js";
import postgres from "postgres";
import { E2E_CUSTOMERS, E2E_PASSWORD, E2E_TEAMS, E2E_USERS } from "./fixtures";

function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Thiếu ${name} cho E2E local.`);
  return value;
}

export default async function globalSetup() {
  if (process.env.E2E_LOCAL_ONLY !== "true") throw new Error("Từ chối tạo fixture ngoài Supabase local.");
  const url = required("NEXT_PUBLIC_SUPABASE_URL");
  if (!["127.0.0.1", "localhost"].includes(new URL(url).hostname)) throw new Error("Từ chối tạo fixture trên database không phải local.");
  const databaseUrl = required("E2E_DB_URL");
  if (!["127.0.0.1", "localhost"].includes(new URL(databaseUrl).hostname)) throw new Error("Từ chối kết nối database không phải local.");
  const supabase = createClient(url, required("SUPABASE_SERVICE_ROLE_KEY"), { auth: { autoRefreshToken: false, persistSession: false } });

  const listed = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (listed.error) throw new Error("Không đọc được user E2E local.");
  const ids = new Map<string, string>();
  for (const user of Object.values(E2E_USERS)) {
    const existing = listed.data.users.find((item) => item.email === user.email);
    if (existing) {
      const updated = await supabase.auth.admin.updateUserById(existing.id, { password: E2E_PASSWORD, email_confirm: true, user_metadata: { full_name: user.fullName } });
      if (updated.error) throw new Error(`Không cập nhật được user E2E ${user.fullName}.`);
      ids.set(user.email, existing.id);
    } else {
      const created = await supabase.auth.admin.createUser({ email: user.email, password: E2E_PASSWORD, email_confirm: true, user_metadata: { full_name: user.fullName } });
      if (created.error || !created.data.user) throw new Error(`Không tạo được user E2E ${user.fullName}.`);
      ids.set(user.email, created.data.user.id);
    }
  }

  const id = (email: string) => { const value = ids.get(email); if (!value) throw new Error("Thiếu user fixture E2E."); return value; };
  const sql = postgres(databaseUrl, { max: 1, onnotice: () => undefined });
  try {
    await sql.begin(async (tx) => {
      await tx`insert into public.teams(id,name,is_active) values
        (${E2E_TEAMS.a.id}::uuid,${E2E_TEAMS.a.name},true),(${E2E_TEAMS.b.id}::uuid,${E2E_TEAMS.b.name},true)
        on conflict(id) do update set name=excluded.name,is_active=true`;
      const profiles = [
        [id(E2E_USERS.admin.email), E2E_USERS.admin.fullName, "admin", null],
        [id(E2E_USERS.leaderA.email), E2E_USERS.leaderA.fullName, "leader", E2E_TEAMS.a.id],
        [id(E2E_USERS.leaderB.email), E2E_USERS.leaderB.fullName, "leader", E2E_TEAMS.b.id],
        [id(E2E_USERS.saleA.email), E2E_USERS.saleA.fullName, "sale", E2E_TEAMS.a.id],
        [id(E2E_USERS.saleB.email), E2E_USERS.saleB.fullName, "sale", E2E_TEAMS.b.id],
      ];
      for (const [profileId, fullName, role, teamId] of profiles) {
        await tx`insert into public.profiles(id,full_name,role,team_id,is_active) values (${profileId}::uuid,${fullName},${role}::public.app_role,${teamId}::uuid,true)
          on conflict(id) do update set full_name=excluded.full_name,role=excluded.role,team_id=excluded.team_id,is_active=true`;
      }
      await tx`update public.teams set leader_user_id=${id(E2E_USERS.leaderA.email)}::uuid where id=${E2E_TEAMS.a.id}::uuid`;
      await tx`update public.teams set leader_user_id=${id(E2E_USERS.leaderB.email)}::uuid where id=${E2E_TEAMS.b.id}::uuid`;
      const [source] = await tx<{ id: string }[]>`select id from public.lead_sources where name='Website'`;
      if (!source) throw new Error("Không tìm thấy nguồn Website cho E2E.");
      const customers = [
        [E2E_CUSTOMERS.saleA.id, E2E_CUSTOMERS.saleA.name, "0900000101", id(E2E_USERS.saleA.email), E2E_TEAMS.a.id],
        [E2E_CUSTOMERS.saleB.id, E2E_CUSTOMERS.saleB.name, "0900000102", id(E2E_USERS.saleB.email), E2E_TEAMS.b.id],
        [E2E_CUSTOMERS.unassignedA.id, E2E_CUSTOMERS.unassignedA.name, "0900000103", null, E2E_TEAMS.a.id],
      ];
      for (const [customerId, fullName, phone, ownerId, teamId] of customers) {
        await tx`insert into public.customers(id,full_name,phone,source_id,owner_user_id,team_id,created_by,updated_by)
          values (${customerId}::uuid,${fullName},${phone},${source.id}::uuid,${ownerId}::uuid,${teamId}::uuid,${id(E2E_USERS.admin.email)}::uuid,${id(E2E_USERS.admin.email)}::uuid)
          on conflict(id) do update set full_name=excluded.full_name,phone=excluded.phone,source_id=excluded.source_id,owner_user_id=excluded.owner_user_id,team_id=excluded.team_id`;
      }
    });
  } finally {
    await sql.end();
  }

  for (const user of Object.values(E2E_USERS)) {
    const verifier = createClient(url, required("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"), { auth: { autoRefreshToken: false, persistSession: false } });
    const verified = await verifier.auth.signInWithPassword({ email: user.email, password: E2E_PASSWORD });
    if (verified.error) throw new Error(`Fixture đăng nhập không hợp lệ cho ${user.fullName}: ${verified.error.message}`);
    const profile = await verifier
      .from("profiles")
      .select("id, role, team_id, is_active, team:teams!profiles_team_id_fkey(name)")
      .eq("id", verified.data.user.id)
      .single();
    if (profile.error || !profile.data?.is_active) {
      throw new Error(`Fixture hồ sơ không hợp lệ cho ${user.fullName}: ${profile.error?.message ?? "inactive"}`);
    }
  }
}
