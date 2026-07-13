import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabasePublishableKey, supabaseUrl } from "./config";

let browserClient: SupabaseClient | undefined;

export function createClient(): SupabaseClient {
  if (!supabaseUrl || !supabasePublishableKey) {
    throw new Error(
      "Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY to .env.local."
    );
  }

  browserClient ??= createBrowserClient(
    supabaseUrl,
    supabasePublishableKey
  );

  return browserClient;
}
