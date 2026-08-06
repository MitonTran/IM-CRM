import { z } from "zod";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).or(z.literal(""));
const querySchema = z.object({
  status: z.enum(["active", "void", "all"]).catch("active"),
  owner: z.union([z.uuid(), z.literal("")]).catch(""), team: z.union([z.uuid(), z.literal("")]).catch(""),
  source: z.union([z.uuid(), z.literal("")]).catch(""), from: date.catch(""), to: date.catch(""),
  page: z.coerce.number().int().min(1).catch(1),
});

export type DealQuery = z.infer<typeof querySchema>;
export function parseDealQuery(input: Record<string, string | string[] | undefined>) {
  return querySchema.parse(Object.fromEntries(Object.entries(input).map(([key, value]) => [key, Array.isArray(value) ? value[0] : value])));
}

