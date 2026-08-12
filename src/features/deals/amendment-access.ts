import "server-only";

import type { AppRole } from "@/lib/access";
import type { DealItem } from "@/features/customers/types";

export function buildDealAmendmentKeys(deals: DealItem[], viewer: { id: string; role: AppRole }, now = new Date()) {
  const saleCutoff = now.getTime() - 24 * 60 * 60 * 1000;
  return Object.fromEntries(deals.flatMap((deal) => {
    if (deal.status !== "active") return [];
    if (viewer.role === "sale" && (deal.createdBy !== viewer.id || new Date(deal.createdAt).getTime() < saleCutoff)) return [];
    return [[deal.id, crypto.randomUUID()]];
  }));
}
