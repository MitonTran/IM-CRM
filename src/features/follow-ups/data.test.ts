import { describe, expect, it } from "vitest";
import { parseFollowUpQuery } from "./query";

describe("follow-up query", () => {
  it("allowlists scope and status", () => {
    expect(parseFollowUpQuery({ scope: "unsafe", status: "deleted", page: "-1" })).toMatchObject({ scope: "today", status: "pending", page: 1 });
  });
});
