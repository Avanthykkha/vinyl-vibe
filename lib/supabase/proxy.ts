import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import {
  isSupabaseConfigured,
  supabasePublishableKey,
  supabaseUrl,
} from "./config";

export async function updateSession(request: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.next({ request });
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(supabaseUrl, supabasePublishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value)
        );

        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
        Object.entries(headers).forEach(([name, value]) =>
          response.headers.set(name, value)
        );
      },
    },
  });

  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims?.sub);
  const privateRoute =
    request.nextUrl.pathname === "/home" ||
    request.nextUrl.pathname.startsWith("/party/");

  if (!signedIn && privateRoute) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/";
    loginUrl.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (signedIn && request.nextUrl.pathname === "/") {
    const homeUrl = request.nextUrl.clone();
    homeUrl.pathname = "/home";
    homeUrl.search = "";
    return NextResponse.redirect(homeUrl);
  }

  return response;
}

