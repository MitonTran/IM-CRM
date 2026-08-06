import { z } from "zod";

export const AI_DISCLAIMER = "AI hỗ trợ, cần kiểm tra trước khi sử dụng";

const boundedText = (max: number) => z.string().trim().max(max);

export const aiCustomerAnalysisSchema = z.object({
  summary: boundedText(2000),
  potential_level: z.enum(["low", "medium", "high"]),
  lead_score: z.number().int().min(0).max(100),
  score_reasons: z.array(boundedText(500)).max(8),
  key_needs: z.array(boundedText(500)).max(8),
  objections: z.array(boundedText(500)).max(8),
  risks: z.array(boundedText(500)).max(8),
  next_actions: z.array(z.object({
    action: boundedText(500),
    priority: z.enum(["low", "medium", "high"]),
    reason: boundedText(500),
  })).max(5),
  suggested_follow_up_at: z.string().nullable(),
  suggested_message: boundedText(2000).nullable(),
  missing_information: z.array(boundedText(500)).max(8),
  confidence: z.enum(["low", "medium", "high"]),
  evidence_activity_ids: z.array(z.uuid()).max(10),
});

export type AiCustomerAnalysisResult = z.infer<typeof aiCustomerAnalysisSchema>;

export type AiCustomerAnalysisItem = {
  id: string;
  status: "pending" | "completed" | "failed";
  result: AiCustomerAnalysisResult | null;
  model: string | null;
  totalTokens: number;
  latencyMs: number | null;
  errorCode: string | null;
  requestedByName: string;
  createdAt: string;
};
