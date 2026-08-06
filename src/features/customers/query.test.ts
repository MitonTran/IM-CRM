import { describe, expect, it } from "vitest";
import { customerQueryString, parseCustomerQuery } from "./query";

describe("customer URL query", () => {
  it("allowlists filters and applies safe defaults", () => {
    expect(parseCustomerQuery({ status: "hacked", sort: "email", page: "-2", q: "  Lan  " })).toMatchObject({
      status: "", sort: "updated_at", page: 1, q: "Lan", dir: "desc",
    });
  });

  it("keeps useful table state in a shareable query", () => {
    const parsed = parseCustomerQuery({ status: "new", page: "2", q: "An" });
    expect(customerQueryString(parsed, { page: 3, customer: "40000000-0000-0000-0000-000000000001" })).toContain("status=new");
    expect(customerQueryString(parsed, { page: 3 })).toContain("page=3");
  });
});

