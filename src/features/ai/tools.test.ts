import { describe, expect, it } from "vitest";
import { aiPeriodBounds } from "./period";

describe("AI tool period bounds", () => {
  const now = new Date("2026-08-06T08:00:00.000Z");

  it("uses Asia/Ho_Chi_Minh month boundaries", () => {
    expect(aiPeriodBounds("this_month", now)).toEqual({
      start: "2026-07-31T17:00:00.000Z", end: "2026-08-31T17:00:00.000Z", label: "tháng 8/2026",
    });
  });

  it("handles last month across a year boundary", () => {
    expect(aiPeriodBounds("last_month", new Date("2026-01-10T02:00:00.000Z"))).toEqual({
      start: "2025-11-30T17:00:00.000Z", end: "2025-12-31T17:00:00.000Z", label: "tháng 12/2025",
    });
  });
});
