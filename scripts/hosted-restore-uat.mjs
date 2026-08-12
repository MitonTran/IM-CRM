import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { validateRestoreConfiguration } from "./free-tier-backup-lib.mjs";

const EXPECTED_ROLE_COUNTS = Object.freeze({ admin: 1, leader: 2, sale: 2 });

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function countBy(items, key) {
  return items.reduce((counts, item) => {
    const value = item[key];
    counts[value] = (counts[value] ?? 0) + 1;
    return counts;
  }, {});
}

function sortedIds(rows) {
  return rows.map((row) => row.id).sort();
}

function assertSameIds(actual, expected, label) {
  invariant(JSON.stringify(sortedIds(actual)) === JSON.stringify(sortedIds(expected)), `Phạm vi ${label} không khớp RLS dự kiến.`);
}

export function assertHostedRoleTopology(profiles, authUsers) {
  const activeProfiles = profiles.filter((profile) => profile.is_active === true);
  invariant(activeProfiles.length === 5, "Project restore phải có đúng năm hồ sơ UAT đang hoạt động.");
  const roleCounts = countBy(activeProfiles, "role");
  invariant(
    Object.keys(roleCounts).length === Object.keys(EXPECTED_ROLE_COUNTS).length
      && Object.entries(EXPECTED_ROLE_COUNTS).every(([role, count]) => roleCounts[role] === count),
    "Cơ cấu vai trò UAT trên project restore không đúng.",
  );

  const authById = new Map(authUsers.map((user) => [user.id, user]));
  for (const profile of activeProfiles) {
    const authUser = authById.get(profile.id);
    invariant(typeof authUser?.email === "string" && authUser.email.length > 3, "Một hồ sơ UAT không có tài khoản Auth tương ứng.");
    invariant(profile.role === "admin" || typeof profile.team_id === "string", "Tư vấn viên hoặc trưởng nhóm UAT chưa thuộc nhóm.");
  }

  const teamIds = [...new Set(activeProfiles.filter((profile) => profile.role !== "admin").map((profile) => profile.team_id))].sort();
  invariant(teamIds.length === 2, "Project restore phải có đúng hai nhóm UAT.");
  for (const teamId of teamIds) {
    const teamProfiles = activeProfiles.filter((profile) => profile.team_id === teamId);
    invariant(teamProfiles.filter((profile) => profile.role === "leader").length === 1, "Mỗi nhóm UAT phải có đúng một trưởng nhóm.");
    invariant(teamProfiles.filter((profile) => profile.role === "sale").length === 1, "Mỗi nhóm UAT phải có đúng một tư vấn viên.");
  }

  return { activeProfiles, authById, roleCounts, teamIds };
}

export function expectedVisibleRows(profile, snapshot) {
  const isAdmin = profile.role === "admin";
  const isLeader = profile.role === "leader";
  return {
    profiles: snapshot.profiles.filter((row) => isAdmin || row.id === profile.id || (isLeader && row.team_id === profile.team_id)),
    teams: snapshot.teams.filter((row) => isAdmin || row.id === profile.team_id),
    customers: snapshot.customers.filter((row) => isAdmin || (isLeader ? row.team_id === profile.team_id : row.owner_user_id === profile.id)),
    documents: snapshot.documents.filter((row) => isAdmin
      || row.scope_type === "organization"
      || (row.scope_type === "team" && row.team_id === profile.team_id)
      || (row.scope_type === "user" && row.user_id === profile.id)),
  };
}

export function assertFixtureCoverage(snapshot) {
  invariant(snapshot.profiles.length === 5, "Fixture restore thiếu hồ sơ UAT đang hoạt động.");
  invariant(snapshot.teams.length === 2, "Fixture restore thiếu hai nhóm đang hoạt động.");
  invariant(snapshot.customers.length >= 2, "Fixture restore cần ít nhất hai khách giả để kiểm tra chéo.");
  invariant(new Set(snapshot.customers.map((row) => row.team_id)).size === 2, "Fixture khách hàng chưa phủ cả hai nhóm.");
  invariant(snapshot.documents.some((row) => row.scope_type === "organization"), "Fixture restore thiếu tài liệu toàn công ty.");
  invariant(snapshot.documents.some((row) => row.scope_type === "team"), "Fixture restore thiếu tài liệu giới hạn theo nhóm.");
  return snapshot;
}

function createServerClient(supabaseUrl, serviceRoleKey) {
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
}

async function selectRows(client, table, columns, filters = []) {
  let query = client.from(table).select(columns);
  for (const [method, column, value] of filters) query = query[method](column, value);
  const { data, error } = await query;
  invariant(!error && Array.isArray(data), `Không đọc được ${table} khi kiểm tra project restore.`);
  return data;
}

async function readActiveSnapshot(client) {
  const [profiles, teams, customers, documents] = await Promise.all([
    selectRows(client, "profiles", "id,role,team_id,is_active", [["eq", "is_active", true]]),
    selectRows(client, "teams", "id,is_active", [["eq", "is_active", true]]),
    selectRows(client, "customers", "id,team_id,owner_user_id,deleted_at", [["is", "deleted_at", null]]),
    selectRows(client, "documents", "id,scope_type,team_id,user_id,deleted_at", [["is", "deleted_at", null]]),
  ]);
  return { profiles, teams, customers, documents };
}

async function listAllAuthUsers(client) {
  const users = [];
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage: 1000 });
    invariant(!error && Array.isArray(data?.users), "Không đọc được danh sách Auth của project restore.");
    users.push(...data.users);
    if (data.users.length < 1000) return users;
  }
  throw new Error("Danh sách Auth của project restore vượt giới hạn kiểm tra.");
}

async function verifyViewer({ profile, email, supabaseUrl, serviceRoleKey, snapshot, viewerLabel }) {
  const temporaryPassword = `Uat-${randomBytes(30).toString("base64url")}`;
  const adminClient = createServerClient(supabaseUrl, serviceRoleKey);
  const { error: updateError } = await adminClient.auth.admin.updateUserById(profile.id, { password: temporaryPassword });
  invariant(!updateError, "Không tạo được mật khẩu tạm trên project restore disposable.");

  const client = createServerClient(supabaseUrl, serviceRoleKey);
  const { data: signInData, error: signInError } = await client.auth.signInWithPassword({ email, password: temporaryPassword });
  invariant(!signInError && signInData.user?.id === profile.id && signInData.session?.access_token, "Một vai trò UAT không đăng nhập được trên project restore.");

  try {
    const actual = await readActiveSnapshot(client);
    const expected = expectedVisibleRows(profile, snapshot);
    assertSameIds(actual.profiles, expected.profiles, `${viewerLabel}/nhân sự`);
    assertSameIds(actual.teams, expected.teams, `${viewerLabel}/nhóm`);
    assertSameIds(actual.customers, expected.customers, `${viewerLabel}/khách hàng`);
    assertSameIds(actual.documents, expected.documents, `${viewerLabel}/tài liệu`);
    return {
      viewer: viewerLabel,
      status: "pass",
      visibleProfiles: actual.profiles.length,
      visibleTeams: actual.teams.length,
      visibleCustomers: actual.customers.length,
      visibleDocuments: actual.documents.length,
    };
  } finally {
    await client.auth.signOut({ scope: "local" });
  }
}

export async function runHostedRestoreUat(environment = process.env) {
  invariant(typeof environment.RESTORE_DRILL_SERVICE_ROLE_KEY === "string" && environment.RESTORE_DRILL_SERVICE_ROLE_KEY.length >= 20, "Thiếu RESTORE_DRILL_SERVICE_ROLE_KEY.");
  const configuration = validateRestoreConfiguration({
    targetSupabaseUrl: environment.RESTORE_DRILL_SUPABASE_URL,
    targetDbUrl: environment.RESTORE_DRILL_DB_URL,
    targetProjectRef: environment.RESTORE_DRILL_PROJECT_REF,
    confirmationProjectRef: environment.RESTORE_DRILL_CONFIRM_PROJECT_REF,
    sourceProjectRef: environment.FREE_BACKUP_PROJECT_REF,
  });
  const startedAt = new Date();
  const serviceClient = createServerClient(configuration.targetSupabaseUrl, environment.RESTORE_DRILL_SERVICE_ROLE_KEY);
  const snapshot = assertFixtureCoverage(await readActiveSnapshot(serviceClient));
  const topology = assertHostedRoleTopology(snapshot.profiles, await listAllAuthUsers(serviceClient));
  const teamIndex = new Map(topology.teamIds.map((teamId, index) => [teamId, index + 1]));
  const orderedProfiles = [...topology.activeProfiles].sort((left, right) => {
    const roleOrder = { sale: 0, leader: 1, admin: 2 };
    return roleOrder[left.role] - roleOrder[right.role] || String(left.team_id).localeCompare(String(right.team_id));
  });
  const roleResults = [];

  for (const profile of orderedProfiles) {
    const viewerLabel = profile.role === "admin" ? "admin" : `${profile.role}-team-${teamIndex.get(profile.team_id)}`;
    roleResults.push(await verifyViewer({
      profile,
      email: topology.authById.get(profile.id).email,
      supabaseUrl: configuration.targetSupabaseUrl,
      serviceRoleKey: environment.RESTORE_DRILL_SERVICE_ROLE_KEY,
      snapshot,
      viewerLabel,
    }));
  }

  const finishedAt = new Date();
  return {
    status: "pass",
    sourceProjectRef: configuration.sourceProjectRef,
    targetEnvironment: "hosted-disposable",
    targetProjectRef: configuration.targetProjectRef,
    startedAtUtc: startedAt.toISOString(),
    finishedAtUtc: finishedAt.toISOString(),
    durationMs: finishedAt.getTime() - startedAt.getTime(),
    fixtureCounts: {
      activeProfiles: snapshot.profiles.length,
      activeTeams: snapshot.teams.length,
      activeCustomers: snapshot.customers.length,
      activeDocuments: snapshot.documents.length,
      documentScopes: countBy(snapshot.documents, "scope_type"),
    },
    roleResults,
    checks: [
      "source-target-project-isolation",
      "five-active-auth-users",
      "password-authentication",
      "sale-own-customer-scope",
      "leader-team-customer-scope",
      "admin-all-customer-scope",
      "profile-and-team-rls",
      "organization-and-team-document-rls",
      "report-without-user-identifiers",
    ],
  };
}

async function main() {
  const report = await runHostedRestoreUat();
  const serialized = `${JSON.stringify(report, null, 2)}\n`;
  if (process.env.RESTORE_DRILL_UAT_REPORT_PATH) {
    const reportPath = path.resolve(process.env.RESTORE_DRILL_UAT_REPORT_PATH);
    await mkdir(path.dirname(reportPath), { recursive: true, mode: 0o700 });
    await writeFile(reportPath, serialized, { encoding: "utf8", mode: 0o600 });
  }
  process.stdout.write(serialized);
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (import.meta.url === invokedPath) {
  main().catch((error) => {
    process.stderr.write(`Hosted restore UAT thất bại: ${error instanceof Error ? error.message : "Lỗi không xác định."}\n`);
    process.exitCode = 1;
  });
}
