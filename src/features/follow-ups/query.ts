import { z } from "zod";

const querySchema = z.object({
  scope: z.enum(["overdue", "today", "upcoming", "all"]).catch("today"),
  status: z.enum(["pending", "completed", "cancelled", "all"]).catch("pending"),
  priority: z.enum(["low", "normal", "high", "urgent", ""]).catch(""),
  assignee: z.union([z.uuid(), z.literal("")]).catch(""),
  page: z.coerce.number().int().min(1).catch(1),
});

export type FollowUpQuery = z.infer<typeof querySchema>;

export function parseFollowUpQuery(input: Record<string, string | string[] | undefined>) {
  return querySchema.parse(Object.fromEntries(Object.entries(input).map(([key, value]) => [key, Array.isArray(value) ? value[0] : value])));
}

