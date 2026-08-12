import { z } from "zod";
import { CUSTOMER_PRIORITIES } from "./types";

const nullableText = (max: number) => z.string().trim().max(max).optional().transform((value) => value || null);
const optionalUuid = z.union([z.literal(""), z.uuid()]).optional().transform((value) => value || null);

export const createCustomerSchema = z.object({
  fullName: z.string().trim().min(2, "Tên cần ít nhất 2 ký tự.").max(120),
  phone: nullableText(30),
  email: z.union([z.literal(""), z.email("Email chưa đúng định dạng.")]).transform((value) => value || null),
  sourceId: z.uuid("Hãy chọn nguồn khách."),
  priority: z.enum(CUSTOMER_PRIORITIES),
  noteSummary: nullableText(2000),
  ownerUserId: optionalUuid,
  teamId: optionalUuid,
  tagIds: z.array(z.uuid()).max(10),
}).refine((value) => value.phone || value.email, {
  message: "Cần ít nhất số điện thoại hoặc email.",
  path: ["phone"],
});
