import type { EmailOtpType } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const type = request.nextUrl.searchParams.get("type") as EmailOtpType | null;
  const code = request.nextUrl.searchParams.get("code");
  const redirectTo = request.nextUrl.clone();

  redirectTo.search = "";

  if (tokenHash && type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type,
    });

    if (!error) {
      redirectTo.pathname = "/home";
      return NextResponse.redirect(redirectTo);
    }
  }

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      redirectTo.pathname = "/home";
      return NextResponse.redirect(redirectTo);
    }
  }

  redirectTo.pathname = "/";
  redirectTo.searchParams.set(
    "authError",
    "That confirmation link is invalid or has expired."
  );
  return NextResponse.redirect(redirectTo);
}
