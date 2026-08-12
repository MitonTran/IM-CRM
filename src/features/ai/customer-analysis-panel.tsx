"use client";

import { Bot, CheckCircle2, Clock3, Sparkles, TriangleAlert } from "lucide-react";
import { useActionState } from "react";
import { analyzeCustomerAction, type AiAnalysisActionState } from "./actions";
import { AI_DISCLAIMER, type AiCustomerAnalysisItem } from "./schema";

const initialState: AiAnalysisActionState = { ok: false, message: "" };
const levelLabel = { low: "Thấp", medium: "Trung bình", high: "Cao" } as const;
const priorityClass = { low: "bg-slate-100 text-slate-700", medium: "bg-amber-50 text-amber-700", high: "bg-rose-50 text-rose-700" } as const;
const formatDate = (value: string) => new Intl.DateTimeFormat("vi-VN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(value));

export function CustomerAnalysisPanel({ customerId, analyses, enabled }: { customerId: string; analyses: AiCustomerAnalysisItem[]; enabled: boolean }) {
  const [state, action, pending] = useActionState(analyzeCustomerAction, initialState);
  const latest = analyses.find((item) => item.status === "completed" && item.result)?.result ?? null;

  return <section className="rounded-2xl border border-[#dbe5df] bg-gradient-to-br from-[#f5f9f1] to-white p-4">
    <div className="flex items-start justify-between gap-4"><div className="flex gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-[#dfeecf] text-[#315c43]"><Bot size={19} /></span><div><h3 className="font-bold">Phân tích khách hàng bằng AI</h3><p className="mt-1 text-xs font-semibold text-[#6a796f]">{AI_DISCLAIMER}</p></div></div>{latest && <div className="rounded-2xl bg-white px-3 py-2 text-center shadow-sm"><p className="text-xl font-black text-[#176a4f]">{latest.lead_score}</p><p className="text-[10px] font-bold uppercase tracking-wide text-[#79867f]">Điểm tiềm năng</p></div>}</div>

    <form action={action} className="mt-4"><input type="hidden" name="customerId" value={customerId} /><button disabled={pending || !enabled} className="focus-ring inline-flex min-h-10 items-center gap-2 rounded-xl bg-[#176a4f] px-4 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"><Sparkles size={16} />{pending ? "Đang phân tích…" : latest ? "Phân tích lại" : "Tạo phân tích"}</button>{!enabled && <p className="mt-2 text-xs text-amber-700">Trợ lý AI đang tạm tắt.</p>}{state.message && <p role="status" className={`mt-3 rounded-xl px-3 py-2 text-sm ${state.ok ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>{state.message}</p>}</form>

    {latest ? <div className="mt-5 space-y-5 border-t border-[#dfe7e2] pt-5">
      <div><div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-[#e5f0da] px-2.5 py-1 text-xs font-bold text-[#315b43]">Tiềm năng {levelLabel[latest.potential_level]}</span><span className="text-xs font-semibold text-[#718078]">Độ tin cậy {levelLabel[latest.confidence]}</span></div><p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-[#3f5148]">{latest.summary}</p></div>
      <InsightList title="Nhu cầu chính" items={latest.key_needs} empty="Chưa đủ dữ liệu về nhu cầu." />
      {(latest.objections.length > 0 || latest.risks.length > 0) && <InsightList title="Băn khoăn và rủi ro" items={[...latest.objections, ...latest.risks]} />}
      <div><h4 className="text-sm font-bold">Hành động đề xuất</h4>{latest.next_actions.length ? <ol className="mt-2 space-y-2">{latest.next_actions.map((item, index) => <li key={`${item.action}-${index}`} className="rounded-xl border border-[#e1e8e4] bg-white p-3"><div className="flex items-start gap-2"><span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${priorityClass[item.priority]}`}>{levelLabel[item.priority]}</span><div><p className="text-sm font-bold">{item.action}</p><p className="mt-1 text-xs leading-5 text-[#6b7971]">{item.reason}</p></div></div></li>)}</ol> : <p className="mt-2 text-sm text-[#748179]">Chưa đủ dữ liệu để đề xuất hành động.</p>}</div>
      {latest.suggested_message && <div className="rounded-xl bg-white p-3"><h4 className="text-xs font-bold uppercase tracking-wide text-[#66766d]">Tin nhắn gợi ý</h4><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[#3f5148]">{latest.suggested_message}</p></div>}
      {latest.evidence_activity_ids.length > 0 && <div><p className="text-xs font-bold text-[#66766d]">Hoạt động liên quan</p><div className="mt-2 flex flex-wrap gap-2">{latest.evidence_activity_ids.map((id, index) => <a key={id} href={`#activity-${id}`} className="focus-ring rounded-full border border-[#cfdbd4] bg-white px-2.5 py-1 text-xs font-bold text-[#176a4f] hover:bg-[#f1f6ef]">#{index + 1}</a>)}</div></div>}
    </div> : <p className="mt-4 rounded-xl border border-dashed border-[#d4ded8] bg-white/70 p-3 text-sm text-[#708078]">AI sẽ tóm tắt mức độ tiềm năng, nhu cầu, rủi ro và bước chăm sóc tiếp theo từ dữ liệu bạn được phép xem.</p>}

    {analyses.length > 0 && <details className="mt-4 border-t border-[#e0e7e3] pt-4"><summary className="focus-ring cursor-pointer list-none rounded-lg text-xs font-bold text-[#64736b]">Lịch sử phân tích ({analyses.length})</summary><ul className="mt-3 space-y-2">{analyses.map((item) => <li key={item.id} className="flex items-center justify-between gap-3 rounded-xl bg-white px-3 py-2 text-xs"><span className="flex items-center gap-2">{item.status === "completed" ? <CheckCircle2 size={14} className="text-emerald-600" /> : item.status === "failed" ? <TriangleAlert size={14} className="text-rose-600" /> : <Clock3 size={14} className="text-amber-600" />}<span><b>{item.requestedByName}</b><br />{formatDate(item.createdAt)}</span></span><span className="text-right text-[#78857e]">{item.status === "completed" ? "Đã hoàn thành" : item.status === "failed" ? "Không thành công" : "Đang xử lý"}</span></li>)}</ul></details>}
  </section>;
}

function InsightList({ title, items, empty }: { title: string; items: string[]; empty?: string }) {
  return <div><h4 className="text-sm font-bold">{title}</h4>{items.length ? <ul className="mt-2 space-y-1.5">{items.map((item, index) => <li key={`${item}-${index}`} className="flex gap-2 text-sm leading-5 text-[#4b5d53]"><span className="mt-2 size-1.5 shrink-0 rounded-full bg-[#6e9258]" />{item}</li>)}</ul> : empty ? <p className="mt-2 text-sm text-[#748179]">{empty}</p> : null}</div>;
}
