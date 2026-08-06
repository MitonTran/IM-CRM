import { z } from "zod";
import { CUSTOMER_STATUSES } from "./types";

const uuidOrEmpty = z.union([z.uuid(), z.literal("")]);
const schema = z.object({
  q: z.string().trim().max(100).catch(""),
  status: z.union([z.enum(CUSTOMER_STATUSES), z.literal("")]).catch(""),
  owner: uuidOrEmpty.catch(""),
  team: uuidOrEmpty.catch(""),
  source: uuidOrEmpty.catch(""),
  tag: uuidOrEmpty.catch(""),
  sort: z.enum(["updated_at", "full_name", "status", "priority"]).catch("updated_at"),
  dir: z.enum(["asc", "desc"]).catch("desc"),
  page: z.coerce.number().int().min(1).catch(1),
  customer: uuidOrEmpty.catch(""),
  new: z.union([z.literal("1"), z.literal("")]).catch(""),
});

export type CustomerQuery = z.infer<typeof schema>;

export function parseCustomerQuery(input: Record<string, string | string[] | undefined>): CustomerQuery {
  const first = Object.fromEntries(Object.entries(input).map(([key, value]) => [key, Array.isArray(value) ? value[0] : value]));
  return schema.parse(first);
}

export function customerQueryString(query: CustomerQuery, changes: Partial<Record<keyof CustomerQuery, string | number | null>>) {
  const params = new URLSearchParams();
  const merged = { ...query, ...changes };
  for (const [key, value] of Object.entries(merged)) {
    if (value !== "" && value !== null && value !== undefined && !(key === "page" && value === 1)) params.set(key, String(value));
  }
  return params.toString();
}

