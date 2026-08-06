import { z } from "zod";

const uuidOrEmpty = z.union([z.uuid(), z.literal("")]);
const schema = z.object({
  q: z.string().trim().max(100).catch(""),
  scope: z.enum(["organization", "team", "user", ""]).catch(""),
  extraction: z.enum(["uploading", "pending", "processing", "ready", "failed", "unsupported", ""]).catch(""),
  folder: uuidOrEmpty.catch(""),
  document: uuidOrEmpty.catch(""),
});
export type DocumentQuery = z.infer<typeof schema>;

export function parseDocumentQuery(input: Record<string, string | string[] | undefined>): DocumentQuery {
  const first = Object.fromEntries(Object.entries(input).map(([key, value]) => [key, Array.isArray(value) ? value[0] : value]));
  return schema.parse(first);
}

export function documentQueryString(query: DocumentQuery, changes: Partial<Record<keyof DocumentQuery, string | null>>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries({ ...query, ...changes })) if (value) params.set(key, value);
  return params.toString();
}

