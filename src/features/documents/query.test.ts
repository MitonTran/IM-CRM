import { describe, expect, it } from "vitest";
import { documentQueryString, parseDocumentQuery } from "./query";

describe("document URL query", () => {
  it("allowlists document filters", () => {
    expect(parseDocumentQuery({ q: "  Quy trình  ", scope: "public", extraction: "done", document: "bad" })).toMatchObject({ q: "Quy trình", scope: "", extraction: "", document: "" });
  });
  it("preserves library filters when opening a document", () => {
    const query = parseDocumentQuery({ scope: "team", q: "sale" });
    const value = documentQueryString(query, { document: "a0000000-0000-0000-0000-000000000001" });
    expect(value).toContain("scope=team"); expect(value).toContain("q=sale"); expect(value).toContain("document=");
  });
});

