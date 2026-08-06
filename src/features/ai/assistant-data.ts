import "server-only";

import { AI_PROVIDER_LABELS, getAiProvider } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { aiCitationSchema, type AiCitation } from "./assistant-schema";

export type AiConversationItem = { id: string; title: string; lastMessageAt: string };
export type AiMessageItem = {
  id: string;
  role: "user" | "assistant";
  content: string;
  status: "pending" | "completed" | "failed";
  citations: AiCitation[];
  model: string | null;
  totalTokens: number;
  latencyMs: number | null;
  createdAt: string;
};

function vietnamDayStart(now = new Date()) {
  const key = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  return new Date(`${key}T00:00:00+07:00`).toISOString();
}

export async function getAiAssistantWorkspace(requestedConversationId?: string, forceNew = false) {
  const supabase = await createClient();
  const { data: claims, error: authError } = await supabase.auth.getClaims();
  const userId = String(claims?.claims?.sub ?? "");
  if (authError || !userId) throw new Error("Phiên đăng nhập không hợp lệ.");

  const [conversationResult, settingsResult, usageResult] = await Promise.all([
    supabase.from("ai_conversations").select("id, title, last_message_at").order("last_message_at", { ascending: false }).limit(50),
    supabase.from("ai_settings").select("is_enabled, daily_request_quota").eq("singleton_id", true).single(),
    supabase.from("ai_request_ledger").select("request_id", { count: "exact", head: true }).gte("requested_at", vietnamDayStart()),
  ]);
  if (conversationResult.error) throw new Error(`Không tải được hội thoại: ${conversationResult.error.message}`);
  if (settingsResult.error || !settingsResult.data) throw new Error("Không tải được cấu hình AI.");
  const conversations: AiConversationItem[] = (conversationResult.data ?? []).map((row) => ({ id: row.id, title: row.title, lastMessageAt: row.last_message_at }));
  const selected = forceNew ? null : conversations.find((item) => item.id === requestedConversationId) ?? conversations[0] ?? null;

  let messages: AiMessageItem[] = [];
  if (selected) {
    const result = await supabase.from("ai_messages").select("id, role, content, status, citations, model, total_tokens, latency_ms, created_at")
      .eq("conversation_id", selected.id).order("created_at", { ascending: true }).limit(200);
    if (result.error) throw new Error(`Không tải được tin nhắn: ${result.error.message}`);
    messages = (result.data ?? []).map((row) => ({
      id: row.id, role: row.role as AiMessageItem["role"], content: row.content ?? "Đang xử lý…", status: row.status as AiMessageItem["status"],
      citations: Array.isArray(row.citations) ? row.citations.flatMap((citation) => { const parsed = aiCitationSchema.safeParse(citation); return parsed.success ? [parsed.data] : []; }) : [],
      model: row.model, totalTokens: Number(row.total_tokens), latencyMs: row.latency_ms, createdAt: row.created_at,
    }));
  }

  let providerName = "Chưa cấu hình";
  try { providerName = AI_PROVIDER_LABELS[getAiProvider()]; } catch { /* Không lộ chi tiết cấu hình môi trường. */ }
  return {
    conversations, selected, messages,
    settings: { enabled: settingsResult.data.is_enabled, dailyQuota: settingsResult.data.daily_request_quota, usedToday: usageResult.count ?? 0, providerName },
  };
}
