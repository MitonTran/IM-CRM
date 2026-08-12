import { NextResponse } from "next/server";
import { parseEmailOtpType, safeAuthNext } from "@/features/auth/password";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const tokenHash = url.searchParams.get("token_hash");
  const type = parseEmailOtpType(url.searchParams.get("type"));
  const next = safeAuthNext(url.searchParams.get("next"));

  if (tokenHash && type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) return NextResponse.redirect(new URL(next, url.origin));
  }

  return NextResponse.redirect(new URL("/login?error=recovery-expired", url.origin));
}
