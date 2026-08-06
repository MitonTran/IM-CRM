import { describe, expect, it } from "vitest";
import { aiAssistantAnswerSchema, aiCitationSchema, aiToolPlanSchema } from "./assistant-schema";

describe("AI assistant schemas", () => {
  it("accepts only allowlisted tools with bounded arguments", () => {
    expect(aiToolPlanSchema.safeParse({ calls: [{ tool: "list_follow_ups", arguments: { window: "overdue" } }] }).success).toBe(true);
    expect(aiToolPlanSchema.safeParse({ calls: [{ tool: "run_sql", arguments: { query: "select *" } }] }).success).toBe(false);
    expect(aiToolPlanSchema.safeParse({ calls: [{ tool: "get_kpi_summary", arguments: { period: "all_time", user_id: crypto.randomUUID() } }] }).success).toBe(false);
  });

  it("rejects unsafe citation links", () => {
    expect(aiCitationSchema.safeParse({ kind: "crm", tool: "get_kpi_summary", href: "/dashboard?period=month", label: "KPI" }).success).toBe(true);
    expect(aiCitationSchema.safeParse({ kind: "crm", tool: "get_kpi_summary", href: "https://example.com", label: "Ngoài hệ thống" }).success).toBe(false);
  });

  it("bounds answer evidence", () => {
    expect(aiAssistantAnswerSchema.safeParse({ answer: "Không đủ dữ liệu.", insufficient_data: true, evidence_ids: [] }).success).toBe(true);
    expect(aiAssistantAnswerSchema.safeParse({ answer: "", insufficient_data: false, evidence_ids: [] }).success).toBe(false);
  });
});
