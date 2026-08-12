import Link from "next/link";
import { Bot, BookOpen, ChartNoAxesCombined, Clock3, MessageSquarePlus, ShieldCheck, Sparkles } from "lucide-react";
import { AiAssistantComposer } from "@/features/ai/assistant-composer";
import { getAiAssistantWorkspace, type AiMessageItem } from "@/features/ai/assistant-data";
import type { AiCitation } from "@/features/ai/assistant-schema";
import { AI_DISCLAIMER } from "@/features/ai/schema";

export const metadata = { title: "Trợ lý AI" };
export const maxDuration = 60;

export default async function AiAssistantPage({ searchParams }: { searchParams: Promise<{ conversation?: string; new?: string }> }) {
  const { conversation, new: newConversation } = await searchParams;
  const data = await getAiAssistantWorkspace(conversation, newConversation === "1");

  return <div className="mx-auto max-w-[1380px]">
    <header className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
      <div><p className="text-xs font-bold uppercase tracking-[.14em] text-[#728179]">Hỗ trợ công việc</p><h1 className="mt-2 text-3xl font-bold tracking-[-.035em] sm:text-4xl">Trợ lý AI</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-[#718078]">Đặt câu hỏi về công việc, kết quả bán hàng hoặc tài liệu nội bộ.</p></div>
      <span className="w-fit rounded-full bg-[#e8f1df] px-3 py-2 text-xs font-semibold text-[#426043]">Sẵn sàng hỗ trợ</span>
    </header>

    <div className="mt-6 grid min-h-[680px] overflow-hidden rounded-[26px] border border-[#dce5df] bg-white shadow-[0_18px_60px_rgba(28,54,43,.08)] lg:grid-cols-[290px_1fr]">
      <aside className="border-b border-[#e2e9e5] bg-[#f7f9f7] p-4 lg:border-b-0 lg:border-r">
        <Link href="/ai?new=1" className="focus-ring flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#173c2f] px-4 text-sm font-bold text-white"><MessageSquarePlus size={17} /> Hội thoại mới</Link>
        <p className="mt-6 px-2 text-[10px] font-bold uppercase tracking-[.14em] text-[#87938d]">Gần đây</p>
        <nav aria-label="Hội thoại AI" className="mt-2 space-y-1">
          {data.conversations.length ? data.conversations.map((item) => <Link key={item.id} href={`/ai?conversation=${item.id}`}
            className={`focus-ring block rounded-xl px-3 py-3 text-sm transition ${data.selected?.id === item.id ? "bg-white font-bold text-[#24563f] shadow-sm" : "text-[#65746d] hover:bg-white/70"}`}>
            <span className="line-clamp-2 leading-5">{item.title}</span><span className="mt-1 block text-[10px] font-medium text-[#96a19b]">{formatTime(item.lastMessageAt)}</span>
          </Link>) : <p className="px-3 py-5 text-sm leading-6 text-[#87938d]">Chưa có hội thoại nào.</p>}
        </nav>
      </aside>

      <section className="flex min-w-0 flex-col bg-[radial-gradient(circle_at_50%_0%,rgba(229,240,214,.45),transparent_24rem)]">
        <div className="flex-1 overflow-y-auto p-4 sm:p-7">
          {data.messages.length ? <div className="mx-auto max-w-3xl space-y-6">{data.messages.map((message) => <Message key={message.id} message={message} />)}</div> : <EmptyState />}
        </div>
        {!data.settings.enabled ? <p className="border-t border-amber-200 bg-amber-50 px-5 py-3 text-center text-xs font-semibold text-amber-800">Trợ lý AI đang được quản trị viên tạm tắt.</p> : null}
        <AiAssistantComposer conversationId={newConversation === "1" ? undefined : data.selected?.id} disabled={!data.settings.enabled} />
      </section>
    </div>
  </div>;
}

function Message({ message }: { message: AiMessageItem }) {
  if (message.role === "user") return <div className="ml-auto max-w-[82%] rounded-2xl rounded-br-md bg-[#176a4f] px-4 py-3 text-sm leading-6 text-white"><p className="whitespace-pre-wrap">{message.content}</p></div>;
  return <article className="flex gap-3">
    <span className="mt-1 grid size-9 shrink-0 place-items-center rounded-xl bg-[#e4efda] text-[#365c43]"><Bot size={18} /></span>
    <div className="min-w-0 flex-1"><div className={`rounded-2xl rounded-tl-md border px-4 py-4 text-sm leading-7 ${message.status === "failed" ? "border-rose-200 bg-rose-50 text-rose-900" : "border-[#dfe7e2] bg-white"}`}><p className="whitespace-pre-wrap">{message.content}</p>{message.citations.length ? <div className="mt-4 flex flex-wrap gap-2 border-t border-[#e7ece9] pt-3">{message.citations.map((citation, index) => <Citation key={`${message.id}-${index}`} citation={citation} />)}</div> : null}</div>
      <p className="mt-2 px-1 text-[10px] text-[#929d97]">{AI_DISCLAIMER}</p>
    </div>
  </article>;
}

function Citation({ citation }: { citation: AiCitation }) {
  const href = citation.kind === "document" ? `/documents/${citation.document_id}/open?version=${citation.version_id}` : citation.href;
  return <Link href={href} target={citation.kind === "document" ? "_blank" : undefined} rel={citation.kind === "document" ? "noreferrer" : undefined}
    className="focus-ring inline-flex items-center gap-1.5 rounded-full border border-[#d8e2dc] bg-[#f7faf7] px-3 py-1.5 text-[11px] font-semibold text-[#426052] hover:border-[#a9c1b4]">
    {citation.kind === "document" ? <BookOpen size={13} /> : <ChartNoAxesCombined size={13} />} {citation.label}
  </Link>;
}

function EmptyState() {
  return <div className="mx-auto flex h-full max-w-2xl flex-col items-center justify-center py-16 text-center"><span className="grid size-16 place-items-center rounded-[22px] bg-[#e4efda] text-[#315940]"><Sparkles size={27} /></span><h2 className="mt-5 text-2xl font-bold tracking-[-.025em]">Bắt đầu từ một câu hỏi cụ thể</h2><p className="mt-2 max-w-lg text-sm leading-6 text-[#718078]">Ví dụ: “Lịch chăm sóc nào đang quá hạn?”, “Doanh thu tháng này theo nhóm?” hoặc “Tài liệu nói gì về quy trình tư vấn?”</p><div className="mt-7 grid gap-3 text-left sm:grid-cols-3"><Tip icon={Clock3} text="Công việc hôm nay và quá hạn" /><Tip icon={ChartNoAxesCombined} text="KPI, doanh thu và phễu" /><Tip icon={ShieldCheck} text="Tài liệu được phép xem" /></div></div>;
}

function Tip({ icon: Icon, text }: { icon: typeof Clock3; text: string }) { return <div className="rounded-2xl border border-[#e0e7e2] bg-white p-4 text-xs font-semibold leading-5 text-[#5f7167]"><Icon size={17} className="mb-3 text-[#55765f]" />{text}</div>; }
function formatTime(value: string) { return new Intl.DateTimeFormat("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(value)); }
