import { describe, expect, it } from "vitest";
import { aiCustomerAnalysisSchema } from "./schema";

const valid = {
  summary: "Khách đang quan tâm và đã yêu cầu báo giá.",
  potential_level: "high",
  lead_score: 85,
  score_reasons: ["Đã yêu cầu báo giá"],
  key_needs: ["Nhận báo giá"],
  objections: [],
  risks: [],
  next_actions: [{ action: "Gửi báo giá", priority: "high", reason: "Đáp ứng yêu cầu đã ghi nhận" }],
  suggested_follow_up_at: null,
  suggested_message: "Em gửi anh/chị báo giá tham khảo.",
  missing_information: [],
  confidence: "medium",
  evidence_activity_ids: ["c3000000-0000-4000-8000-000000000001"],
} as const;

describe("AI customer analysis schema", () => {
  it("accepts the documented structured result", () => {
    expect(aiCustomerAnalysisSchema.parse(valid)).toEqual(valid);
  });

  it("rejects scores and activity evidence outside the contract", () => {
    expect(aiCustomerAnalysisSchema.safeParse({ ...valid, lead_score: 101 }).success).toBe(false);
    expect(aiCustomerAnalysisSchema.safeParse({ ...valid, evidence_activity_ids: ["not-a-uuid"] }).success).toBe(false);
  });

  it("caps recommendations to keep output bounded", () => {
    const next_actions = Array.from({ length: 6 }, (_, index) => ({ action: `Việc ${index}`, priority: "low", reason: "Kiểm thử" }));
    expect(aiCustomerAnalysisSchema.safeParse({ ...valid, next_actions }).success).toBe(false);
  });
});
