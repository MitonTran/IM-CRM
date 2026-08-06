import { describe, expect, it } from "vitest";
import { getPeriodBounds, parseDashboardQuery } from "./query";

describe("dashboard query and Vietnam periods", () => {
  it("allowlists filters and rejects impossible dates", () => {
    const query = parseDashboardQuery({ period: "week", anchor: "2026-02-31", owner: "not-an-id" });
    expect(query.period).toBe("month");
    expect(query.owner).toBe("");
    expect(query.anchor).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("converts a month in Vietnam to an exclusive UTC range", () => {
    expect(getPeriodBounds({ period: "month", anchor: "2026-08-22" })).toMatchObject({
      startDate: "2026-08-01", endDate: "2026-08-31",
      startUtc: "2026-07-31T17:00:00.000Z", endUtc: "2026-08-31T17:00:00.000Z",
      previousStartUtc: "2026-06-30T17:00:00.000Z", previousEndUtc: "2026-07-31T17:00:00.000Z",
    });
  });

  it("handles leap-day and year boundaries without local timezone drift", () => {
    expect(getPeriodBounds({ period: "day", anchor: "2028-02-29" }).endDate).toBe("2028-02-29");
    expect(getPeriodBounds({ period: "year", anchor: "2026-08-22" }).previousStartUtc).toBe("2024-12-31T17:00:00.000Z");
  });
});

