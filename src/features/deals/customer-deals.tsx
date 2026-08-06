"use client";

import { Banknote, Ban, BadgeCheck } from "lucide-react";
import { useActionState } from "react";
import type { AppRole } from "@/lib/access";
import type { DealItem } from "@/features/customers/types";
import { registerDealAction, voidDealAction, type DealActionState } from "./actions";

const initial: DealActionState = { ok: false, message: "" };
const control = "focus-ring min-h-10 w-full rounded-xl border border-[#d8e2dc] bg-white px-3 text-sm outline-none";
const money = new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 });
const date = (value: string) => new Intl.DateTimeFormat("vi-VN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(value));

export function CustomerDeals({ customerId, deals, role, idempotencyKey }: { customerId: string; deals: DealItem[]; role: AppRole; idempotencyKey: string }) {
  const [state, action, pending] = useActionState(registerDealAction, initial);
  const activeTotal = deals.filter((deal) => deal.status === "active").reduce((sum, deal) => sum + deal.amountVnd, 0);
  return <section className="space-y-4"><div className="flex items-center justify-between"><h3 className="flex items-center gap-2 font-bold"><Banknote size={18} className="text-[#176a4f]" /> Giao dịch</h3><span className="text-sm font-bold text-[#176a4f]">{money.format(activeTotal)}</span></div>
    <details className="rounded-2xl border border-[#dce6df] bg-white p-4"><summary className="focus-ring cursor-pointer list-none rounded-lg font-bold">Ghi nhận đăng ký mới</summary><form action={action} className="mt-4 space-y-3"><input type="hidden" name="customerId" value={customerId} /><input type="hidden" name="idempotencyKey" value={idempotencyKey} /><label className="block text-xs font-bold text-[#596a61]">Doanh thu VND<input name="amountVnd" required type="number" min="0" max="999999999999999" step="1" className={`${control} mt-1`} placeholder="Ví dụ: 25000000" /></label><label className="block text-xs font-bold text-[#596a61]">Ngày đăng ký<input name="registeredAt" type="datetime-local" className={`${control} mt-1`} /><span className="mt-1 block font-normal text-[#87938d]">Để trống sẽ dùng thời điểm hiện tại.</span></label><label className="block text-xs font-bold text-[#596a61]">Ghi chú<textarea name="note" maxLength={2000} className={`${control} mt-1 min-h-20 py-2.5`} /></label><label className="flex items-start gap-2 rounded-xl bg-[#f5f8f4] p-3 text-xs font-semibold"><input type="checkbox" name="closePendingTasks" defaultChecked className="mt-0.5 accent-[#176a4f]" /> Hoàn thành các follow-up đang mở của khách</label>{state.message && <p role="status" className={`rounded-xl px-3 py-2 text-sm ${state.ok ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>{state.message}</p>}<div className="flex justify-end"><button disabled={pending} className="focus-ring min-h-10 rounded-xl bg-[#176a4f] px-4 text-sm font-bold text-white disabled:cursor-wait disabled:opacity-60">{pending ? "Đang ghi nhận…" : "Ghi nhận giao dịch"}</button></div></form></details>
    {deals.length ? <div className="space-y-3">{deals.map((deal) => <DealCard key={deal.id} deal={deal} canVoid={role !== "sale"} />)}</div> : <p className="rounded-2xl border border-dashed border-[#d9e3dc] p-4 text-center text-sm text-[#75837c]">Chưa có giao dịch nào.</p>}
  </section>;
}

export function DealCard({ deal, canVoid }: { deal: DealItem; canVoid: boolean }) {
  const [state, action, pending] = useActionState(voidDealAction, initial);
  return <article className={`rounded-2xl border p-4 ${deal.status === "active" ? "border-emerald-100 bg-emerald-50/40" : "border-slate-200 bg-slate-50 opacity-75"}`}><div className="flex items-start justify-between gap-3"><div><p className="text-lg font-bold">{money.format(deal.amountVnd)}</p><p className="mt-1 text-xs text-[#6f7e76]">{date(deal.registeredAt)} · {deal.ownerName}</p></div><span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold ${deal.status === "active" ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-600"}`}>{deal.status === "active" ? <BadgeCheck size={13} /> : <Ban size={13} />}{deal.status === "active" ? "Active" : "Đã vô hiệu"}</span></div>{deal.note && <p className="mt-3 text-sm text-[#4d6056]">{deal.note}</p>}{deal.voidReason && <p className="mt-3 text-xs font-semibold text-rose-700">Lý do: {deal.voidReason}</p>}{canVoid && deal.status === "active" && <details className="mt-3 border-t border-emerald-100 pt-3"><summary className="focus-ring cursor-pointer list-none rounded-lg text-xs font-bold text-rose-700">Vô hiệu hóa giao dịch</summary><form action={action} className="mt-2 flex flex-col gap-2 sm:flex-row"><input type="hidden" name="dealId" value={deal.id} /><input name="reason" required minLength={3} maxLength={500} className={control} placeholder="Lý do vô hiệu hóa" /><button disabled={pending} className="focus-ring min-h-10 shrink-0 rounded-xl bg-rose-600 px-3 text-xs font-bold text-white disabled:opacity-60">{pending ? "Đang xử lý…" : "Xác nhận"}</button></form>{state.message && <p role="status" className={`mt-2 text-xs ${state.ok ? "text-emerald-700" : "text-rose-700"}`}>{state.message}</p>}</details>}</article>;
}

