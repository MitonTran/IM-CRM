import { describe, expect, it } from "vitest";
import { createCustomerSchema } from "./validation";

const sourceId = "10000000-0000-4000-8000-000000000001";

function validSaleSubmission() {
  return {
    fullName: "Khách UAT Sale A",
    phone: "0900000999",
    email: "",
    sourceId,
    priority: "normal",
    noteSummary: "Dữ liệu giả dùng cho UAT",
    tagIds: [],
  };
}

describe("createCustomerSchema", () => {
  it("accepts a Sale form without hidden owner and team fields", () => {
    const result = createCustomerSchema.safeParse(validSaleSubmission());

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.ownerUserId).toBeNull();
      expect(result.data.teamId).toBeNull();
    }
  });

  it("accepts explicit owner and team UUIDs for manager forms", () => {
    const result = createCustomerSchema.safeParse({
      ...validSaleSubmission(),
      ownerUserId: "20000000-0000-4000-8000-000000000001",
      teamId: "30000000-0000-4000-8000-000000000001",
    });

    expect(result.success).toBe(true);
  });

  it("rejects a malformed owner value instead of passing it to the RPC", () => {
    const result = createCustomerSchema.safeParse({ ...validSaleSubmission(), ownerUserId: "not-a-uuid" });

    expect(result.success).toBe(false);
  });
});
