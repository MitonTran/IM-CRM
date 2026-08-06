"use client";

import { useActionState, useEffect, useRef } from "react";
import { ArrowUp, LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { askAiAssistantAction, type AiAssistantActionState } from "./assistant-actions";

const initialState: AiAssistantActionState = { ok: false, message: "" };

export function AiAssistantComposer({ conversationId, disabled }: { conversationId?: string; disabled: boolean }) {
  const [state, action, pending] = useActionState(askAiAssistantAction, initialState);
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const handledResponse = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!state.conversationId || !state.responseId || handledResponse.current === state.responseId) return;
    handledResponse.current = state.responseId;
    formRef.current?.reset();
    if (state.conversationId !== conversationId) router.replace(`/ai?conversation=${state.conversationId}`);
    else router.refresh();
  }, [conversationId, router, state.conversationId, state.responseId]);

  return <form ref={formRef} action={action} className="border-t border-[#e2e9e5] bg-white p-4 sm:p-5">
    <input type="hidden" name="conversationId" value={conversationId ?? ""} />
    <div className="flex items-end gap-3 rounded-2xl border border-[#cfdbd4] bg-[#f9fbf9] p-2 focus-within:border-[#6d9a84] focus-within:ring-4 focus-within:ring-[#176a4f]/10">
      <label htmlFor="ai-question" className="sr-only">Đặt câu hỏi cho trợ lý AI</label>
      <textarea id="ai-question" name="question" required minLength={2} maxLength={2000} rows={2} disabled={disabled || pending}
        placeholder="Hỏi về KPI, follow-up, doanh thu hoặc nội dung tài liệu…"
        className="min-h-14 flex-1 resize-none bg-transparent px-3 py-2 text-sm leading-6 outline-none placeholder:text-[#8a9790] disabled:cursor-not-allowed" />
      <button type="submit" disabled={disabled || pending} aria-label="Gửi câu hỏi"
        className="focus-ring grid size-11 shrink-0 place-items-center rounded-xl bg-[#176a4f] text-white transition hover:bg-[#11533e] disabled:cursor-not-allowed disabled:opacity-50">
        {pending ? <LoaderCircle size={19} className="animate-spin" /> : <ArrowUp size={19} />}
      </button>
    </div>
    <div className="mt-2 flex min-h-5 items-center justify-between gap-3 px-1 text-[11px] text-[#78867f]">
      <span>AI chỉ đọc dữ liệu bạn đang có quyền xem.</span>
      <span aria-live="polite" className={state.message && !state.ok ? "font-semibold text-rose-700" : "text-[#5f786b]"}>{pending ? "Đang tìm dữ liệu và soạn câu trả lời…" : state.message}</span>
    </div>
  </form>;
}
