import { hasValidCronAuthorization } from "@/lib/cron-auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(request: Request) {
  if (!hasValidCronAuthorization(request.headers.get("authorization"))) return new Response("Unauthorized", { status: 401 });
  try {
    const { data, error } = await createAdminClient().rpc("purge_expired_ai_history");
    if (error) return Response.json({ status: "failed" }, { status: 503, headers: { "Cache-Control": "no-store" } });
    return Response.json({ status: "ok", purgedConversations: Number(data ?? 0) }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ status: "failed" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
