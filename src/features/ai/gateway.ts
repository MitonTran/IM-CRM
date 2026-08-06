import "server-only";

import { createHash } from "node:crypto";
import OpenAI from "openai";
import { zodResponseFormat, zodTextFormat } from "openai/helpers/zod";
import { getAiProviderConfig, type AiProvider } from "@/lib/env";
import { parseJsonObjectContent } from "./response-parser";
import { aiCustomerAnalysisSchema, type AiCustomerAnalysisResult } from "./schema";

const OUTPUT_EXAMPLE = `{
  "summary":"string",
  "potential_level":"low|medium|high",
  "lead_score":0,
  "score_reasons":[],
  "key_needs":[],
  "objections":[],
  "risks":[],
  "next_actions":[{"action":"string","priority":"low|medium|high","reason":"string"}],
  "suggested_follow_up_at":null,
  "suggested_message":null,
  "missing_information":[],
  "confidence":"low|medium|high",
  "evidence_activity_ids":[]
}`;

const SYSTEM_PROMPT = `Bạn là trợ lý phân tích khách hàng cho IM CRM.
Chỉ phân tích dữ liệu có trong snapshot được cung cấp và trả lời bằng tiếng Việt.
Bạn chỉ được đưa ra nhận định và đề xuất; không tuyên bố đã tạo, sửa hoặc xóa dữ liệu CRM.
Không suy đoán dữ kiện không có trong snapshot. Đưa dữ kiện thiếu vào missing_information.
evidence_activity_ids chỉ được chứa ID activity xuất hiện trong snapshot và thực sự hỗ trợ nhận định.
suggested_follow_up_at phải là ISO-8601 có múi giờ hoặc null.
Không lặp lại dữ liệu định danh cá nhân không cần thiết.
Chỉ trả về một JSON object hợp lệ, không markdown hay lời dẫn, theo cấu trúc mẫu sau:
${OUTPUT_EXAMPLE}`;

export class AiAnalysisError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = "AiAnalysisError";
  }
}

type GatewayOutput = {
  result: AiCustomerAnalysisResult;
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
};

function validateResult(value: unknown) {
  const parsed = aiCustomerAnalysisSchema.safeParse(value);
  if (!parsed.success) throw new AiAnalysisError("model_invalid_output");
  if (parsed.data.suggested_follow_up_at) {
    const suggestedAt = parsed.data.suggested_follow_up_at;
    if (!/(Z|[+-]\d{2}:\d{2})$/.test(suggestedAt) || Number.isNaN(Date.parse(suggestedAt))) {
      throw new AiAnalysisError("model_invalid_follow_up_time");
    }
  }
  return parsed.data;
}

function modelAuditName(provider: AiProvider, model: string) {
  return `${provider}:${model}`.slice(0, 120);
}

function compatibleClient(config: ReturnType<typeof getAiProviderConfig>) {
  const defaultHeaders = config.provider === "openrouter" ? {
    "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
    "X-Title": "IM CRM",
  } : undefined;
  return new OpenAI({ apiKey: config.apiKey, baseURL: config.baseURL, timeout: 20_000, maxRetries: 1, defaultHeaders });
}

async function analyzeWithOpenAI(input: { snapshot: unknown; userId: string; maxOutputTokens: number }): Promise<GatewayOutput> {
  const config = getAiProviderConfig();
  const client = new OpenAI({ apiKey: config.apiKey, timeout: 20_000, maxRetries: 1 });
  const safetyIdentifier = createHash("sha256").update(`im-crm:${input.userId}`).digest("hex");
  const response = await client.responses.parse({
    model: config.model,
    store: false,
    safety_identifier: safetyIdentifier,
    reasoning: { effort: "low" },
    max_output_tokens: input.maxOutputTokens,
    input: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: `Phân tích snapshot khách hàng sau:\n${JSON.stringify(input.snapshot)}` },
    ],
    text: { verbosity: "low", format: zodTextFormat(aiCustomerAnalysisSchema, "customer_analysis") },
  });
  return {
    result: validateResult(response.output_parsed),
    model: modelAuditName(config.provider, response.model || config.model),
    inputTokens: response.usage?.input_tokens ?? 0,
    outputTokens: response.usage?.output_tokens ?? 0,
    totalTokens: response.usage?.total_tokens ?? 0,
  };
}

async function analyzeWithCompatibleProvider(input: { snapshot: unknown; maxOutputTokens: number }): Promise<GatewayOutput> {
  const config = getAiProviderConfig();
  const client = compatibleClient(config);
  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: `Phân tích snapshot khách hàng sau:\n${JSON.stringify(input.snapshot)}` },
  ];

  if (config.provider === "gemini") {
    const response = await client.chat.completions.parse({
      model: config.model,
      messages,
      reasoning_effort: "low",
      max_tokens: input.maxOutputTokens,
      response_format: zodResponseFormat(aiCustomerAnalysisSchema, "customer_analysis"),
    });
    const message = response.choices[0]?.message;
    return {
      result: validateResult(message?.parsed),
      model: modelAuditName(config.provider, response.model || config.model),
      inputTokens: response.usage?.prompt_tokens ?? 0,
      outputTokens: response.usage?.completion_tokens ?? 0,
      totalTokens: response.usage?.total_tokens ?? 0,
    };
  }

  const baseRequest = { model: config.model, messages, max_tokens: input.maxOutputTokens };
  let response: OpenAI.Chat.Completions.ChatCompletion;
  if (config.provider === "openrouter") {
    const request: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming & { provider: { require_parameters: boolean } } = {
      ...baseRequest,
      response_format: zodResponseFormat(aiCustomerAnalysisSchema, "customer_analysis"),
      provider: { require_parameters: true },
    };
    response = await client.chat.completions.create(request);
  } else if (config.provider === "deepseek") {
    response = await client.chat.completions.create({ ...baseRequest, response_format: { type: "json_object" } });
  } else {
    response = await client.chat.completions.create(baseRequest);
  }

  const content = response.choices[0]?.message.content;
  return {
    result: validateResult(parseJsonObjectContent(content)),
    model: modelAuditName(config.provider, response.model || config.model),
    inputTokens: response.usage?.prompt_tokens ?? 0,
    outputTokens: response.usage?.completion_tokens ?? 0,
    totalTokens: response.usage?.total_tokens ?? 0,
  };
}

export async function analyzeCustomerSnapshot(input: {
  snapshot: unknown;
  userId: string;
  maxOutputTokens: number;
}): Promise<GatewayOutput> {
  const config = getAiProviderConfig();
  if (config.provider === "openai") return analyzeWithOpenAI(input);
  return analyzeWithCompatibleProvider(input);
}
