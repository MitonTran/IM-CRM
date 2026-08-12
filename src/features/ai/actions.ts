"use server";

import { revalidatePath } from "next/cache";
import OpenAI from "openai";
import { z } from "zod";
import { hasAiProviderEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { AiAnalysisError, analyzeCustomerSnapshot } from "./gateway";

export type AiAnalysisActionState = { ok: boolean; message: string };

const inputSchema = z.object({ customerId: z.uuid() });

function friendlyError(message: string) {
  if (message.includes("ai_daily_quota_exceeded")) return "Trợ lý đang bận. Vui lòng thử lại sau.";
  if (message.includes("ai_disabled")) return "Trợ lý AI đang được quản trị viên tạm tắt.";
  if (message.includes("ai_input_too_large")) return "Lịch sử chăm sóc quá dài. Vui lòng thử lại sau khi cập nhật thông tin chính.";
  if (message.includes("scope_denied") || message.includes("request_denied")) return "Bạn không có quyền phân tích khách hàng này.";
  return "Không thể hoàn tất phân tích AI. Vui lòng thử lại sau.";
}

function failureCode(error: unknown) {
  if (error instanceof AiAnalysisError) return error.code;
  if (error instanceof OpenAI.APIError) return `provider_http_${error.status ?? "error"}`;
  if (error instanceof Error && error.name === "AbortError") return "model_timeout";
  return "analysis_failed";
}

export async function analyzeCustomerAction(
  _: AiAnalysisActionState,
  formData: FormData,
): Promise<AiAnalysisActionState> {
  const parsed = inputSchema.safeParse({ customerId: formData.get("customerId") });
  if (!parsed.success) return { ok: false, message: "Khách hàng chưa hợp lệ." };

  const supabase = await createClient();
  const { data: claims, error: authError } = await supabase.auth.getClaims();
  const userId = String(claims?.claims?.sub ?? "");
  if (authError || !userId) return { ok: false, message: "Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại." };
  if (!hasAiProviderEnv()) return { ok: false, message: "Trợ lý đang tạm gián đoạn. Vui lòng liên hệ quản trị viên." };
  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch {
    return { ok: false, message: "Trợ lý đang tạm gián đoạn. Vui lòng liên hệ quản trị viên." };
  }

  const startedAt = Date.now();
  let analysisId: string | null = null;
  try {
    const { data: requestId, error: requestError } = await supabase.rpc("create_ai_customer_analysis_request", {
      target_customer_id: parsed.data.customerId,
    });
    if (requestError || !requestId) throw new Error(requestError?.message ?? "ai_request_failed");
    analysisId = String(requestId);

    const [analysisQuery, settingsQuery] = await Promise.all([
      supabase.from("ai_customer_analyses").select("input_snapshot").eq("id", analysisId).single(),
      supabase.from("ai_settings").select("max_output_tokens").eq("singleton_id", true).single(),
    ]);
    if (analysisQuery.error || !analysisQuery.data) throw new Error("ai_snapshot_unavailable");
    if (settingsQuery.error || !settingsQuery.data) throw new Error("ai_settings_unavailable");

    const output = await analyzeCustomerSnapshot({
      snapshot: analysisQuery.data.input_snapshot,
      userId,
      maxOutputTokens: settingsQuery.data.max_output_tokens,
    });

    const { error: completionError } = await admin.rpc("complete_ai_customer_analysis", {
      target_analysis_id: analysisId,
      analysis_result: output.result,
      model_name: output.model,
      used_input_tokens: output.inputTokens,
      used_output_tokens: output.outputTokens,
      used_total_tokens: output.totalTokens,
      request_latency_ms: Date.now() - startedAt,
      estimated_cost: null,
    });
    if (completionError) throw new Error(completionError.message);

    revalidatePath("/customers");
    return { ok: true, message: "Đã hoàn tất phân tích. Hãy kiểm tra đề xuất trước khi sử dụng." };
  } catch (error) {
    if (analysisId) {
      try {
        await admin.rpc("fail_ai_customer_analysis", {
          target_analysis_id: analysisId,
          failure_code: failureCode(error),
          request_latency_ms: Date.now() - startedAt,
        });
      } catch {
        // Không che lấp lỗi gốc nếu backend tạm thời không ghi được trạng thái thất bại.
      }
    }
    revalidatePath("/customers");
    return { ok: false, message: error instanceof Error ? friendlyError(error.message) : friendlyError("") };
  }
}
