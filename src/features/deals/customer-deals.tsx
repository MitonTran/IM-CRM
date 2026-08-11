"use client";

import { BadgeCheck, Banknote, Ban, PencilLine } from "lucide-react";
import { useActionState } from "react";
import { FormattedNumberInput } from "@/components/ui/formatted-number-input";
import type { AppRole } from "@/lib/access";
import type { DealItem } from "@/features/customers/types";
import { amendDealAction, registerDealAction, voidDealAction, type DealActionState } from "./actions";

const initial: DealActionState = { ok: false, message: "" };
const control = "focus-ring min-h-10 w-full rounded-xl border border-[#d8e2dc] bg-white px-3 text-sm outline-none";
const money = new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 });
const date = (value: string) => new Intl.DateTimeFormat("vi-VN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(value));

type DealViewer = { id: string; role: AppRole };

function vietnamLocalInput(value: string) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(value)).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

export function CustomerDeals({ customerId, deals, viewer, idempotencyKey, amendmentKeys }: {
  customerId: string;
  deals: DealItem[];
  viewer: DealViewer;
  idempotencyKey: string;
  amendmentKeys: Record<string, string>;
}) {
  const [state, action, pending] = useActionState(registerDealAction, initial);
  const activeTotal = deals.filter((deal) => deal.status === "active").reduce((sum, deal) => sum + deal.amountVnd, 0);
  return <section className="space-y-4">
    <div className="flex items-center justify-between"><h3 className="flex items-center gap-2 font-bold"><Banknote size={18} className="text-[#176a4f]" /> Giao dịch</h3><span className="text-sm font-bold text-[#176a4f]">{money.format(activeTotal)}</span></div>
    <details className="rounded-2xl border border-[#dce6df] bg-white p-4"><summary className="focus-ring cursor-pointer list-none rounded-lg font-bold">Ghi nhận đăng ký mới</summary><form action={action} className="mt-4 space-y-3"><input type="hidden" name="customerId" value={customerId} /><input type="hidden" name="idempotencyKey" value={idempotencyKey} /><label className="block text-xs font-bold text-[#596a61]">Doanh thu VND<FormattedNumberInput name="amountVnd" required className={`${control} mt-1`} placeholder="Ví dụ: 25.000.000" /></label><label className="block text-xs font-bold text-[#596a61]">Ngày đăng ký<input name="registeredAt" type="datetime-local" className={`${control} mt-1`} /><span className="mt-1 block font-normal text-[#87938d]">Để trống sẽ dùng thời điểm hiện tại.</span></label><label className="block text-xs font-bold text-[#596a61]">Ghi chú<textarea name="note" maxLength={2000} className={`${control} mt-1 min-h-20 py-2.5`} /></label><label className="flex items-start gap-2 rounded-xl bg-[#f5f8f4] p-3 text-xs font-semibold"><input type="checkbox" name="closePendingTasks" defaultChecked className="mt-0.5 accent-[#176a4f]" /> Đánh dấu hoàn thành các lịch chăm sóc đang mở</label>{state.message && <p role="status" className={`rounded-xl px-3 py-2 text-sm ${state.ok ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>{state.message}</p>}<div className="flex justify-end"><button disabled={pending} className="focus-ring min-h-10 rounded-xl bg-[#176a4f] px-4 text-sm font-bold text-white disabled:cursor-wait disabled:opacity-60">{pending ? "Đang ghi nhận…" : "Ghi nhận giao dịch"}</button></div></form></details>
    {deals.length ? <div className="space-y-3">{deals.map((deal) => <DealCard key={deal.id} deal={deal} viewer={viewer} amendmentKey={amendmentKeys[deal.id] ?? ""} />)}</div> : <p className="rounded-2xl border border-dashed border-[#d9e3dc] p-4 text-center text-sm text-[#75837c]">Chưa có giao dịch nào.</p>}
  </section>;
}

export function DealCard({ deal, viewer, amendmentKey }: { deal: DealItem; viewer: DealViewer; amendmentKey: string }) {
  const [voidState, voidAction, voidPending] = useActionState(voidDealAction, initial);
  const [amendState, amendAction, amendPending] = useActionState(amendDealAction, initial);
  const saleOwnDeal = viewer.role === "sale" && deal.createdBy === viewer.id;
  const canAmend = deal.status === "active" && Boolean(amendmentKey);
  const canVoid = deal.status === "active" && viewer.role !== "sale";

  return <article className={`rounded-2xl border p-4 ${deal.status === "active" ? "border-emerald-100 bg-emerald-50/40" : "border-slate-200 bg-slate-50 opacity-80"}`}>
    <div className="flex items-start justify-between gap-3"><div><p className="text-lg font-bold">{money.format(deal.amountVnd)}</p><p className="mt-1 text-xs text-[#6f7e76]">{date(deal.registeredAt)} · {deal.ownerName}</p></div><div className="flex flex-wrap justify-end gap-1.5">{deal.replacesDealId && <span className="inline-flex items-center gap-1 rounded-full bg-sky-100 px-2.5 py-1 text-[11px] font-bold text-sky-700"><PencilLine size={12} /> Đã chỉnh sửa</span>}<span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold ${deal.status === "active" ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-600"}`}>{deal.status === "active" ? <BadgeCheck size={13} /> : <Ban size={13} />}{deal.status === "active" ? "Đang hiệu lực" : "Đã hủy"}</span></div></div>
    {deal.note && <p className="mt-3 text-sm text-[#4d6056]">{deal.note}</p>}
    {deal.amendmentReason && <p className="mt-3 text-xs font-semibold text-sky-700">Lý do điều chỉnh: {deal.amendmentReason}</p>}
    {deal.voidReason && <p className="mt-3 text-xs font-semibold text-rose-700">Lý do hủy: {deal.voidReason}</p>}
    {amendState.message && <p role="status" className={`mt-3 rounded-xl px-3 py-2 text-sm ${amendState.ok ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>{amendState.message}</p>}
    {canAmend && <details className="mt-3 border-t border-emerald-100 pt-3"><summary className="focus-ring cursor-pointer list-none rounded-lg text-xs font-bold text-[#176a4f]">Chỉnh sửa giao dịch</summary><form action={amendAction} className="mt-3 space-y-2"><input type="hidden" name="dealId" value={deal.id} /><input type="hidden" name="idempotencyKey" value={amendmentKey} /><label className="block text-xs font-bold text-[#596a61]">Doanh thu VND<FormattedNumberInput name="amountVnd" required defaultValue={deal.amountVnd} className={`${control} mt-1`} /></label><label className="block text-xs font-bold text-[#596a61]">Ngày đăng ký<input name="registeredAt" required type="datetime-local" defaultValue={vietnamLocalInput(deal.registeredAt)} className={`${control} mt-1`} /></label><label className="block text-xs font-bold text-[#596a61]">Ghi chú<textarea name="note" maxLength={2000} defaultValue={deal.note ?? ""} className={`${control} mt-1 min-h-20 py-2.5`} /></label><label className="block text-xs font-bold text-[#596a61]">Lý do điều chỉnh<input name="reason" required minLength={3} maxLength={500} className={`${control} mt-1`} placeholder="Ví dụ: Nhập sai số tiền" /></label><button disabled={amendPending} className="focus-ring min-h-10 rounded-xl bg-[#176a4f] px-3 text-xs font-bold text-white disabled:cursor-wait disabled:opacity-60">{amendPending ? "Đang điều chỉnh…" : "Lưu thay đổi"}</button></form></details>}
    {deal.status === "active" && saleOwnDeal && !canAmend && <p className="mt-3 border-t border-emerald-100 pt-3 text-xs text-[#75837c]">Bạn chỉ có thể tự sửa trong 24 giờ. Sau thời gian này, hãy liên hệ trưởng nhóm hoặc quản trị viên.</p>}
    {canVoid && <details className="mt-3 border-t border-emerald-100 pt-3"><summary className="focus-ring cursor-pointer list-none rounded-lg text-xs font-bold text-rose-700">Hủy hiệu lực giao dịch</summary><form action={voidAction} className="mt-2 flex flex-col gap-2 sm:flex-row"><input type="hidden" name="dealId" value={deal.id} /><input name="reason" required minLength={3} maxLength={500} className={control} placeholder="Lý do hủy" /><button disabled={voidPending} className="focus-ring min-h-10 shrink-0 rounded-xl bg-rose-600 px-3 text-xs font-bold text-white disabled:opacity-60">{voidPending ? "Đang xử lý…" : "Xác nhận"}</button></form>{voidState.message && <p role="status" className={`mt-2 text-xs ${voidState.ok ? "text-emerald-700" : "text-rose-700"}`}>{voidState.message}</p>}</details>}
  </article>;
}
