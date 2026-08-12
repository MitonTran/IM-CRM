import { describe, expect, it } from "vitest";
import { assertSafeProjectId, assertSafeTargetDatabase, createTargetDatabaseName } from "./restore-drill.mjs";

describe("restore drill guardrails", () => {
  it("chỉ chấp nhận đúng Supabase project local", () => {
    expect(assertSafeProjectId("im_crm")).toBe("im_crm");
    expect(() => assertSafeProjectId("production")).toThrow(/chỉ được phép/);
  });

  it("tạo tên database disposable có tiền tố và entropy cố định", () => {
    expect(createTargetDatabaseName(new Date("2026-08-08T03:04:05.678Z"), "a1b2c3d4"))
      .toBe("im_crm_restore_drill_20260808t030405z_a1b2c3d4");
  });

  it("từ chối database nguồn và tên ngoài guardrail", () => {
    expect(() => assertSafeTargetDatabase("postgres")).toThrow(/guardrail/);
    expect(() => assertSafeTargetDatabase("im_crm_restore_drill_production")).toThrow(/guardrail/);
  });
});
