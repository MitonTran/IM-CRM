"use client";

import { useActionState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createCustomerAction, deleteCustomerAction, setCustomerTagsAction, transferCustomerAction, updateCustomerAction, type CustomerActionState } from "./actions";
import { CUSTOMER_PRIORITIES, CUSTOMER_STATUSES, PRIORITY_LABELS, STATUS_LABELS, type CustomerDetail, type CustomerOption, type OwnerOption } from "./types";

const initial: CustomerActionState = { ok: false, message: "" };
const control = "focus-ring min-h-11 w-full rounded-xl border border-[#d8e2dc] bg-white px-3 text-sm outline-none";

function Feedback({ state }: { state: CustomerActionState }) { return state.message ? <p role="status" className={`rounded-xl px-3 py-2 text-sm ${state.ok ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>{state.message}</p> : null; }
function Submit({ children, danger = false, pending = false }: { children: React.ReactNode; danger?: boolean; pending?: boolean }) { return <button disabled={pending} className={`focus-ring min-h-11 rounded-xl px-4 text-sm font-bold text-white disabled:cursor-wait disabled:opacity-60 ${danger ? "bg-rose-600" : "bg-[#176a4f]"}`}>{children}</button>; }

export function CreateCustomerForm({ sources, owners, teams, tags, role }: { sources: CustomerOption[]; owners: OwnerOption[]; teams: CustomerOption[]; tags: (CustomerOption & { color: string })[]; role: string }) {
  const [state, action, pending] = useActionState(createCustomerAction, initial);
  const router = useRouter(); const searchParams = useSearchParams();
  useEffect(() => { if (state.ok && state.customerId) { const next = new URLSearchParams(searchParams); next.delete("new"); next.set("customer", state.customerId); router.replace(`/customers?${next}`); } }, [state, router, searchParams]);
  return <form action={action} className="space-y-4">
    <label className="block text-sm font-semibold">Họ và tên<input className={`${control} mt-1.5`} name="fullName" required minLength={2} /></label>
    <div className="grid gap-4 sm:grid-cols-2"><label className="block text-sm font-semibold">Điện thoại<input className={`${control} mt-1.5`} name="phone" inputMode="tel" /></label><label className="block text-sm font-semibold">Email<input className={`${control} mt-1.5`} name="email" type="email" /></label></div>
    <div className="grid gap-4 sm:grid-cols-2"><label className="block text-sm font-semibold">Nguồn<select className={`${control} mt-1.5`} name="sourceId" required defaultValue=""><option value="" disabled>Chọn nguồn</option>{sources.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label className="block text-sm font-semibold">Ưu tiên<select className={`${control} mt-1.5`} name="priority" defaultValue="normal">{CUSTOMER_PRIORITIES.map((item) => <option key={item} value={item}>{PRIORITY_LABELS[item]}</option>)}</select></label></div>
    {role !== "sale" && <div className="grid gap-4 sm:grid-cols-2"><label className="block text-sm font-semibold">Người phụ trách<select className={`${control} mt-1.5`} name="ownerUserId" defaultValue=""><option value="">Chưa giao</option>{owners.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>{role === "admin" && <label className="block text-sm font-semibold">Team<select className={`${control} mt-1.5`} name="teamId" defaultValue=""><option value="">Chọn theo Sale</option>{teams.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}</div>}
    {tags.length > 0 && <fieldset><legend className="text-sm font-semibold">Nhãn</legend><div className="mt-2 flex flex-wrap gap-2">{tags.map((tag) => <label key={tag.id} className="flex cursor-pointer items-center gap-2 rounded-full border border-[#dbe4de] bg-white px-3 py-2 text-xs font-semibold"><input type="checkbox" name="tagIds" value={tag.id} className="accent-[#176a4f]" /><span className="size-2 rounded-full" style={{ backgroundColor: tag.color }} />{tag.name}</label>)}</div></fieldset>}
    <label className="block text-sm font-semibold">Ghi chú ban đầu<textarea className={`${control} mt-1.5 min-h-24 py-3`} name="noteSummary" maxLength={2000} /></label>
    <Feedback state={state} /><div className="flex justify-end"><Submit pending={pending}>{pending ? "Đang tạo…" : "Tạo khách hàng"}</Submit></div>
  </form>;
}

export function EditCustomerForm({ customer, sources, tags }: { customer: CustomerDetail; sources: CustomerOption[]; tags: (CustomerOption & { color: string })[] }) {
  const [state, action, pending] = useActionState(updateCustomerAction, initial);
  const [tagState, tagAction, tagPending] = useActionState(setCustomerTagsAction, initial);
  return <div className="space-y-5">
    <form action={action} className="space-y-4"><input type="hidden" name="customerId" value={customer.id} />
      <label className="block text-sm font-semibold">Họ và tên<input className={`${control} mt-1.5`} name="fullName" required defaultValue={customer.fullName} /></label>
      <div className="grid gap-3 sm:grid-cols-2"><label className="block text-sm font-semibold">Điện thoại<input className={`${control} mt-1.5`} name="phone" defaultValue={customer.phone ?? ""} /></label><label className="block text-sm font-semibold">Email<input className={`${control} mt-1.5`} type="email" name="email" defaultValue={customer.email ?? ""} /></label></div>
      <div className="grid gap-3 sm:grid-cols-2"><label className="block text-sm font-semibold">Trạng thái<select className={`${control} mt-1.5`} name="status" defaultValue={customer.status}>{CUSTOMER_STATUSES.filter((item) => item !== "won" || customer.status === "won").map((item) => <option key={item} value={item}>{STATUS_LABELS[item]}</option>)}</select><span className="mt-1 block text-xs font-normal text-[#87938d]">Trạng thái Đã chốt được tạo từ giao dịch.</span></label><label className="block text-sm font-semibold">Ưu tiên<select className={`${control} mt-1.5`} name="priority" defaultValue={customer.priority}>{CUSTOMER_PRIORITIES.map((item) => <option key={item} value={item}>{PRIORITY_LABELS[item]}</option>)}</select></label></div>
      <label className="block text-sm font-semibold">Lý do trạng thái<input className={`${control} mt-1.5`} name="statusReason" defaultValue={customer.statusReason ?? ""} maxLength={500} placeholder="Bắt buộc khi Đã mất hoặc Không phù hợp" /></label>
      <label className="block text-sm font-semibold">Nguồn<select className={`${control} mt-1.5`} name="sourceId" defaultValue={customer.sourceId}>{sources.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label className="block text-sm font-semibold">Ghi chú<textarea className={`${control} mt-1.5 min-h-24 py-3`} name="noteSummary" defaultValue={customer.noteSummary ?? ""} /></label>
      <Feedback state={state} /><div className="flex justify-end"><Submit pending={pending}>{pending ? "Đang lưu…" : "Lưu thay đổi"}</Submit></div>
    </form>
    <form action={tagAction} className="border-t border-[#e4ebe7] pt-5"><input type="hidden" name="customerId" value={customer.id} /><h3 className="font-bold">Nhãn khách hàng</h3><p className="mt-1 text-xs text-[#75837c]">Tối đa 10 nhãn cho mỗi khách.</p><div className="mt-3 flex flex-wrap gap-2">{tags.map((tag) => <label key={tag.id} className="flex cursor-pointer items-center gap-2 rounded-full border border-[#dbe4de] bg-white px-3 py-2 text-xs font-semibold"><input type="checkbox" name="tagIds" value={tag.id} defaultChecked={customer.tags.some((current) => current.id === tag.id)} className="accent-[#176a4f]" /><span className="size-2 rounded-full" style={{ backgroundColor: tag.color }} />{tag.name}</label>)}</div><div className="mt-3"><Feedback state={tagState} /></div><div className="mt-3 flex justify-end"><button disabled={tagPending} className="focus-ring min-h-10 rounded-xl border border-[#bfd0c5] px-4 text-sm font-bold text-[#285b45] disabled:cursor-wait disabled:opacity-60">{tagPending ? "Đang lưu nhãn…" : "Lưu nhãn"}</button></div></form>
  </div>;
}

export function ManagementForms({ customerId, owners }: { customerId: string; owners: OwnerOption[] }) {
  const [transferState, transferAction, transferPending] = useActionState(transferCustomerAction, initial);
  const [deleteState, deleteAction, deletePending] = useActionState(deleteCustomerAction, initial);
  const router = useRouter();
  useEffect(() => { if (deleteState.ok) router.replace("/customers"); }, [deleteState.ok, router]);
  return <div className="space-y-5 border-t border-[#e4ebe7] pt-5"><form action={transferAction} className="space-y-3"><input type="hidden" name="customerId" value={customerId} /><h3 className="font-bold">Chuyển người phụ trách</h3><select className={control} name="ownerUserId" required defaultValue=""><option value="" disabled>Chọn Sale</option>{owners.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><select className={control} name="taskPolicy" defaultValue="reassign"><option value="reassign">Chuyển các follow-up đang mở</option><option value="cancel">Hủy các follow-up đang mở</option></select><input className={control} name="reason" required minLength={3} placeholder="Lý do chuyển" /><Feedback state={transferState} /><Submit pending={transferPending}>{transferPending ? "Đang chuyển…" : "Chuyển khách"}</Submit></form>
    <form action={deleteAction} className="space-y-3 rounded-2xl border border-rose-100 bg-rose-50/50 p-4"><input type="hidden" name="customerId" value={customerId} /><h3 className="font-bold text-rose-800">Xóa mềm khách hàng</h3><input className={control} name="reason" required minLength={3} placeholder="Lý do xóa" /><Feedback state={deleteState} /><Submit danger pending={deletePending}>{deletePending ? "Đang xóa…" : "Xóa khách hàng"}</Submit></form></div>;
}
