export function parseJsonObjectContent(content: string | null | undefined): unknown | null {
  if (!content?.trim()) return null;
  const trimmed = content.trim();
  const withoutFence = trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  const firstBrace = withoutFence.indexOf("{");
  const lastBrace = withoutFence.lastIndexOf("}");
  const candidates = [withoutFence];
  if (firstBrace >= 0 && lastBrace > firstBrace) candidates.push(withoutFence.slice(firstBrace, lastBrace + 1));

  for (const candidate of candidates) {
    try {
      const value = JSON.parse(candidate) as unknown;
      if (value && typeof value === "object" && !Array.isArray(value)) return value;
    } catch {
      // Thử phần object được trích khỏi markdown hoặc lời dẫn của model.
    }
  }
  return null;
}
