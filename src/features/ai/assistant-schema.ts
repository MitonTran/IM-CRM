import { z } from "zod";

export const aiPeriodSchema = z.enum(["this_month", "last_month", "this_year"]);

const customerSummaryCall = z.object({
  tool: z.literal("get_customer_summary"),
  arguments: z.object({ customer_id: z.uuid() }),
});
const followUpsCall = z.object({
  tool: z.literal("list_follow_ups"),
  arguments: z.object({ window: z.enum(["overdue", "today", "next_7_days"]) }),
});
const kpiCall = z.object({
  tool: z.literal("get_kpi_summary"),
  arguments: z.object({ period: aiPeriodSchema }),
});
const revenueCall = z.object({
  tool: z.literal("get_revenue_summary"),
  arguments: z.object({ period: aiPeriodSchema, group_by: z.enum(["team", "source", "owner"]) }),
});
const funnelCall = z.object({
  tool: z.literal("get_funnel_summary"),
  arguments: z.object({ period: aiPeriodSchema }),
});
const documentSearchCall = z.object({
  tool: z.literal("search_documents"),
  arguments: z.object({ query: z.string().trim().min(2).max(300) }),
});
const documentExcerptCall = z.object({
  tool: z.literal("get_document_excerpt"),
  arguments: z.object({ version_id: z.uuid(), chunk_index: z.number().int().min(0).max(100000) }),
});

export const aiToolCallSchema = z.discriminatedUnion("tool", [
  customerSummaryCall,
  followUpsCall,
  kpiCall,
  revenueCall,
  funnelCall,
  documentSearchCall,
  documentExcerptCall,
]);

export const aiToolPlanSchema = z.object({
  calls: z.array(aiToolCallSchema).min(1).max(3),
});

export const aiAssistantAnswerSchema = z.object({
  answer: z.string().trim().min(1).max(12000),
  insufficient_data: z.boolean(),
  evidence_ids: z.array(z.string().trim().min(1).max(120)).max(12),
});

export const documentCitationSchema = z.object({
  kind: z.literal("document"),
  document_id: z.uuid(),
  version_id: z.uuid(),
  title: z.string().trim().min(1).max(200),
  locator: z.string().trim().min(1).max(160),
  label: z.string().trim().min(1).max(240),
});

export const crmCitationSchema = z.object({
  kind: z.literal("crm"),
  tool: z.enum(["get_customer_summary", "list_follow_ups", "get_kpi_summary", "get_revenue_summary", "get_funnel_summary"]),
  href: z.string().regex(/^\/(customers|tasks|dashboard|deals)([/?].*)?$/),
  label: z.string().trim().min(1).max(240),
});

export const aiCitationSchema = z.discriminatedUnion("kind", [documentCitationSchema, crmCitationSchema]);

export type AiToolCall = z.infer<typeof aiToolCallSchema>;
export type AiPeriod = z.infer<typeof aiPeriodSchema>;
export type AiToolPlan = z.infer<typeof aiToolPlanSchema>;
export type AiAssistantAnswer = z.infer<typeof aiAssistantAnswerSchema>;
export type AiCitation = z.infer<typeof aiCitationSchema>;

export type AiToolEvidence = {
  id: string;
  citation: AiCitation;
};

export type AiToolResult = {
  tool: AiToolCall["tool"];
  data: unknown;
  evidence: AiToolEvidence[];
  resultCount: number;
};
