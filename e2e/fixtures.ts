export const E2E_PASSWORD = "E2E-ImCrm-2026!";
export const E2E_RECOVERY_PASSWORD = "E2E-ImCrm-Recovered-2026!";

export const E2E_USERS = {
  admin: { email: "admin.e2e@example.invalid", fullName: "Admin E2E" },
  leaderA: { email: "leader.a.e2e@example.invalid", fullName: "Leader A E2E" },
  leaderB: { email: "leader.b.e2e@example.invalid", fullName: "Leader B E2E" },
  saleA: { email: "sale.a.e2e@example.invalid", fullName: "Sale A E2E" },
  saleB: { email: "sale.b.e2e@example.invalid", fullName: "Sale B E2E" },
} as const;

export const E2E_TEAMS = {
  a: { id: "e1000000-0000-4000-8000-000000000001", name: "Team A E2E" },
  b: { id: "e1000000-0000-4000-8000-000000000002", name: "Team B E2E" },
  empty: { id: "e1000000-0000-4000-8000-000000000003", name: "Team Trống E2E" },
} as const;

export const E2E_CUSTOMERS = {
  saleA: { id: "e2000000-0000-4000-8000-000000000001", name: "Khách của Sale A E2E" },
  saleB: { id: "e2000000-0000-4000-8000-000000000002", name: "Khách của Sale B E2E" },
  unassignedA: { id: "e2000000-0000-4000-8000-000000000003", name: "Khách chưa giao Team A E2E" },
} as const;
