import { describe, expect, it } from "vitest";
import { assertFixtureCoverage, assertHostedRoleTopology, expectedVisibleRows } from "./hosted-restore-uat.mjs";

const profiles = [
  { id: "admin", role: "admin", team_id: null, is_active: true },
  { id: "leader-a", role: "leader", team_id: "team-a", is_active: true },
  { id: "sale-a", role: "sale", team_id: "team-a", is_active: true },
  { id: "leader-b", role: "leader", team_id: "team-b", is_active: true },
  { id: "sale-b", role: "sale", team_id: "team-b", is_active: true },
];

const authUsers = profiles.map((profile) => ({ id: profile.id, email: `${profile.id}@example.invalid` }));
const snapshot = {
  profiles,
  teams: [{ id: "team-a" }, { id: "team-b" }],
  customers: [
    { id: "customer-a", team_id: "team-a", owner_user_id: "sale-a" },
    { id: "customer-b", team_id: "team-b", owner_user_id: "sale-b" },
  ],
  documents: [
    { id: "document-org", scope_type: "organization", team_id: null, user_id: null },
    { id: "document-team-a", scope_type: "team", team_id: "team-a", user_id: null },
    { id: "document-user-a", scope_type: "user", team_id: null, user_id: "sale-a" },
  ],
};

describe("hosted restore UAT guardrails", () => {
  it("yêu cầu đúng năm vai trò chia đều trên hai nhóm", () => {
    expect(assertHostedRoleTopology(profiles, authUsers)).toMatchObject({
      roleCounts: { admin: 1, leader: 2, sale: 2 },
      teamIds: ["team-a", "team-b"],
    });
    expect(() => assertHostedRoleTopology(profiles.slice(1), authUsers)).toThrow(/năm hồ sơ/);
    expect(() => assertHostedRoleTopology(profiles, authUsers.slice(1))).toThrow(/Auth tương ứng/);
  });

  it("chỉ chấp nhận fixture có khách hai nhóm và tài liệu kiểm tra chéo", () => {
    expect(assertFixtureCoverage(snapshot)).toBe(snapshot);
    expect(() => assertFixtureCoverage({ ...snapshot, customers: snapshot.customers.slice(0, 1) })).toThrow(/hai khách/);
    expect(() => assertFixtureCoverage({ ...snapshot, documents: snapshot.documents.filter((row) => row.scope_type !== "team") })).toThrow(/theo nhóm/);
  });

  it("tính đúng phạm vi Sale, Leader và Admin mà không cần email hoặc nội dung", () => {
    const sale = expectedVisibleRows(profiles[2], snapshot);
    expect(sale.customers.map((row) => row.id)).toEqual(["customer-a"]);
    expect(sale.documents.map((row) => row.id)).toEqual(["document-org", "document-team-a", "document-user-a"]);
    expect(sale.profiles.map((row) => row.id)).toEqual(["sale-a"]);

    const leader = expectedVisibleRows(profiles[3], snapshot);
    expect(leader.customers.map((row) => row.id)).toEqual(["customer-b"]);
    expect(leader.documents.map((row) => row.id)).toEqual(["document-org"]);
    expect(leader.profiles.map((row) => row.id)).toEqual(["leader-b", "sale-b"]);

    const admin = expectedVisibleRows(profiles[0], snapshot);
    expect(admin.customers).toHaveLength(2);
    expect(admin.documents).toHaveLength(3);
    expect(admin.profiles).toHaveLength(5);
  });
});
