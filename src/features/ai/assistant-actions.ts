"use server";

import { revalidatePath } from "next/cache";
import OpenAI from "openai";
import { z } from "zod";
import { hasAiProviderEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { answerAssistantQuestion, planAssistantTools } from "./assistant-gateway";
import type { AiCitation } from "./assistant-schema";
import { executeAiTools } from "./tools";

export type AiAssistantActionState = { ok: boolean; message: string; conversationId?: string; responseId?: string };

const formSchema = z.object({
  conversationId: z.union([z.uuid(), z.literal("")]).transform((value) => value || null),
  question: z.string().trim().min(2).max(2000),
});

function friendlyError(message: string) {
  if (message.includes("ai_daily_quota_exceeded")) return "Trợ lý đang bận. Vui lòng thử lại sau.";
  if (message.includes("ai_disabled")) return "Trợ lý AI đang được quản trị viên tạm tắt.";
  if (message.includes("ai_conversation_scope_denied")) return "Bạn không có quyền truy cập hội thoại này.";
  if (message.includes("ai_question_invalid")) return "Câu hỏi cần từ 2 đến 2.000 ký tự.";
  if (message.includes("model_invalid_output")) return "Câu trả lời chưa hoàn tất. Vui lòng thử lại.";
  return "Không thể hoàn tất câu trả lời AI. Vui lòng thử lại sau.";
}

function failureCode(error: unknown) {
  if (error instanceof OpenAI.APIError) return `provider_http_${error.status ?? "error"}`;
  if (error instanceof Error && error.name === "AbortError") return "model_timeout";
  if (error instanceof Error && /^[a-z0-9_:-]+$/i.test(error.message)) return error.message.slice(0, 80);
  return "assistant_failed";
}

export async function askAiAssistantAction(
  _: AiAssistantActionState,
  formData: FormData,
): Promise<AiAssistantActionState> {
  const parsed = formSchema.safeParse({ conversationId: formData.get("conversationId") ?? "", question: formData.get("question") });
  if (!parsed.success) return { ok: false, message: "Câu hỏi cần từ 2 đến 2.000 ký tự." };

  const supabase = await createClient();
  const { data: claims, error: authError } = await supabase.auth.getClaims();
  const userId = String(claims?.claims?.sub ?? "");
  if (authError || !userId) return { ok: false, message: "Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại." };
  if (!hasAiProviderEnv()) return { ok: false, message: "Trợ lý đang tạm gián đoạn. Vui lòng liên hệ quản trị viên." };

  let admin: ReturnType<typeof createAdminClient>;
  try { admin = createAdminClient(); }
  catch { return { ok: false, message: "Trợ lý đang tạm gián đoạn. Vui lòng liên hệ quản trị viên." }; }

  const startedAt = Date.now();
  let assistantMessageId: string | null = null;
  let conversationId: string | null = parsed.data.conversationId;
  try {
    const request = await supabase.rpc("create_ai_assistant_request", {
      target_conversation_id: parsed.data.conversationId,
      question: parsed.data.question,
    });
    if (request.error || !request.data || typeof request.data !== "object") throw new Error(request.error?.message ?? "ai_request_failed");
    const requestData = request.data as Record<string, unknown>;
    conversationId = String(requestData.conversation_id ?? "");
    assistantMessageId = String(requestData.assistant_message_id ?? "");
    if (!conversationId || !assistantMessageId) throw new Error("ai_request_failed");

    const settings = await supabase.from("ai_settings").select("max_input_chars, max_output_tokens").eq("singleton_id", true).single();
    if (settings.error || !settings.data) throw new Error("ai_settings_unavailable");

    const plan = await planAssistantTools({ question: parsed.data.question, userId });
    const toolResults = await executeAiTools(supabase, plan.value.calls);
    const toolPayloadLength = JSON.stringify(toolResults).length;
    if (toolPayloadLength > settings.data.max_input_chars) throw new Error("ai_input_too_large");
    const answer = await answerAssistantQuestion({
      question: parsed.data.question, toolResults, userId, maxOutputTokens: settings.data.max_output_tokens,
    });

    const evidence = new Map(toolResults.flatMap((result) => result.evidence).map((item) => [item.id, item.citation]));
    const citations: AiCitation[] = [];
    for (const id of answer.value.evidence_ids) {
      const citation = evidence.get(id);
      if (citation && !citations.some((item) => JSON.stringify(item) === JSON.stringify(citation))) citations.push(citation);
    }
    const redactedToolCalls = toolResults.map((result) => ({ tool: result.tool, result_count: Math.min(100, result.resultCount) }));
    const inputTokens = plan.inputTokens + answer.inputTokens;
    const outputTokens = plan.outputTokens + answer.outputTokens;
    const totalTokens = Math.max(inputTokens + outputTokens, plan.totalTokens + answer.totalTokens);
    const model = plan.model === answer.model ? answer.model : `${plan.model}|${answer.model}`.slice(0, 120);

    const completion = await admin.rpc("complete_ai_assistant_message", {
      target_message_id: assistantMessageId,
      answer_content: answer.value.answer,
      answer_citations: citations,
      redacted_tool_calls: redactedToolCalls,
      model_name: model,
      used_input_tokens: inputTokens,
      used_output_tokens: outputTokens,
      used_total_tokens: totalTokens,
      request_latency_ms: Date.now() - startedAt,
      estimated_cost: null,
    });
    if (completion.error) throw new Error(completion.error.message);
    revalidatePath("/ai");
    return { ok: true, message: answer.value.insufficient_data ? "Đã trả lời, nhưng có thể chưa đủ dữ liệu." : "Đã trả lời.", conversationId, responseId: assistantMessageId };
  } catch (error) {
    if (assistantMessageId) {
      try {
        await admin.rpc("fail_ai_assistant_message", {
          target_message_id: assistantMessageId,
          failure_code: failureCode(error),
          request_latency_ms: Date.now() - startedAt,
        });
      } catch {
        // Giữ lỗi gốc nếu backend không ghi được trạng thái thất bại.
      }
    }
    revalidatePath("/ai");
    return { ok: false, message: error instanceof Error ? friendlyError(error.message) : friendlyError(""), conversationId: conversationId ?? undefined, responseId: assistantMessageId ?? undefined };
  }
}
