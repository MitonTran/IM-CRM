import { describe, expect, it } from "vitest";
import { canManagePeople, dataScopeFor } from "./access";

describe("role capabilities", () => {
  it("maps the three MVP roles to the documented data scope", () => {
    expect(dataScopeFor({ role: "sale", team_id: "team-a" })).toBe("own");
    expect(dataScopeFor({ role: "leader", team_id: "team-a" })).toBe("team");
    expect(dataScopeFor({ role: "admin", team_id: null })).toBe("all");
  });

  it("only allows admins to manage people", () => {
    expect(canManagePeople("admin")).toBe(true);
    expect(canManagePeople("leader")).toBe(false);
    expect(canManagePeople("sale")).toBe(false);
  });
});
