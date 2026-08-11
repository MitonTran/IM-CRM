"use client";

import { useActionState } from "react";
import { Save } from "lucide-react";
import { FormattedNumberInput } from "@/components/ui/formatted-number-input";
import { upsertTargetAction } from "./actions";
import type { DashboardOption } from "./types";

export function TargetForm({ teams, owners, period, start, end, defaultTeam }: {
  teams: DashboardOption[]; owners: DashboardOption[]; period: "day" | "month" | "year";
  start: string; end: string; defaultTeam: string;
}) {
  const [state, action, pending] = useActionState(upsertTargetAction, { ok: false, message: "" });
  const subjects = [
    ...teams.map((item) => ({ ...item, value: `team:${item.id}`, label: `Team · ${item.name}` })),
    ...owners.map((item) => ({ ...item, value: `user:${item.id}`, label: `Sale · ${item.name}` })),
  ];
  const defaultValue = defaultTeam && teams.some((item) => item.id === defaultTeam) ? `team:${defaultTeam}` : subjects[0]?.value;

  return <form action={action} className="mt-5 grid gap-3 sm:grid-cols-2">
    <input type="hidden" name="period" value={period} /><input type="hidden" name="periodStart" value={start} /><input type="hidden" name="periodEnd" value={end} />
    <label className="text-xs font-bold text-[#617168]">Chỉ số<select name="metric" defaultValue="revenue_vnd" className="focus-ring mt-1 min-h-11 w-full rounded-xl border border-[#d8e2dc] bg-white px-3 text-sm"><option value="revenue_vnd">Doanh thu</option><option value="contact_attempts">Lần liên hệ</option><option value="successful_contacts">Liên hệ thành công</option><option value="appointments">Lịch hẹn</option><option value="consultations">Tư vấn</option><option value="won_customers">Khách thắng</option><option value="new_customers">Khách mới</option><option value="tasks_on_time">Task đúng hạn</option></select></label>
    <label className="text-xs font-bold text-[#617168]">Áp dụng cho<select name="subject" defaultValue={defaultValue} onChange={(event) => { const [scope, id] = event.currentTarget.value.split(":"); const form = event.currentTarget.form; if (form) { (form.elements.namedItem("scope") as HTMLInputElement).value = scope; (form.elements.namedItem("subjectId") as HTMLInputElement).value = id; } }} className="focus-ring mt-1 min-h-11 w-full rounded-xl border border-[#d8e2dc] bg-white px-3 text-sm" required>{subjects.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
    <input type="hidden" name="scope" defaultValue={defaultValue?.split(":")[0]} /><input type="hidden" name="subjectId" defaultValue={defaultValue?.split(":")[1]} />
    <label className="text-xs font-bold text-[#617168]">Giá trị mục tiêu<FormattedNumberInput name="targetValue" required placeholder="Ví dụ: 500.000.000" className="focus-ring mt-1 min-h-11 w-full rounded-xl border border-[#d8e2dc] bg-white px-3 text-sm" /></label>
    <button disabled={pending || !subjects.length} className="focus-ring mt-auto inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#176a4f] px-4 text-sm font-bold text-white disabled:opacity-50"><Save size={16} />{pending ? "Đang lưu..." : "Lưu mục tiêu"}</button>
    {state.message ? <p aria-live="polite" className={`sm:col-span-2 text-sm font-semibold ${state.ok ? "text-emerald-700" : "text-red-700"}`}>{state.message}</p> : null}
  </form>;
}
