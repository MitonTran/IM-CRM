import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params; const version = new URL(request.url).searchParams.get("version");
  const parsed = z.object({ id: z.uuid(), version: z.uuid() }).safeParse({ id, version });
  if (!parsed.success) return new NextResponse("Không tìm thấy tài liệu.", { status: 404 });
  const supabase = await createClient(); const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) return NextResponse.redirect(new URL("/login", request.url));
  const { data: row, error } = await supabase.from("document_versions").select("id, document_id, storage_path").eq("id", parsed.data.version).eq("document_id", parsed.data.id).single();
  if (error || !row) return new NextResponse("Không tìm thấy tài liệu.", { status: 404 });
  const { data: signed, error: signedError } = await supabase.storage.from("documents").createSignedUrl(row.storage_path, 60);
  if (signedError || !signed?.signedUrl) return new NextResponse("Không thể mở file lúc này.", { status: 503 });
  const { error: auditError } = await supabase.rpc("record_document_download", { target_version_id: row.id });
  if (auditError) return new NextResponse("Không thể xác minh quyền tải file.", { status: 403 });
  return NextResponse.redirect(signed.signedUrl);
}
