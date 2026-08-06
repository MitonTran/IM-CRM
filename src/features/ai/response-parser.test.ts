import { describe, expect, it } from "vitest";
import { parseJsonObjectContent } from "./response-parser";

describe("AI JSON response parser", () => {
  it("parses a plain JSON object", () => {
    expect(parseJsonObjectContent('{"lead_score":80}')).toEqual({ lead_score: 80 });
  });

  it("recovers JSON wrapped in a markdown fence or short preface", () => {
    expect(parseJsonObjectContent('```json\n{"lead_score":75}\n```')).toEqual({ lead_score: 75 });
    expect(parseJsonObjectContent('Kết quả JSON:\n{"lead_score":70}')).toEqual({ lead_score: 70 });
  });

  it("rejects empty, malformed and array responses", () => {
    expect(parseJsonObjectContent("")).toBeNull();
    expect(parseJsonObjectContent("{broken" )).toBeNull();
    expect(parseJsonObjectContent("[]")).toBeNull();
  });
});
