import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { env, isSupabaseConfigured } from "@/lib/env";
import type { Database } from "@/lib/supabase/types";

/**
 * Server client for Server Components, Route Handlers and Server Actions.
 * Returns null when Supabase is unconfigured.
 */
export function createClient() {
  if (!isSupabaseConfigured) return null;

  const cookieStore = cookies();

  return createServerClient<Database>(env.supabaseUrl, env.supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Called from a Server Component: cookies are read-only here.
          // Middleware refreshes the session, so this is safe to ignore.
        }
      },
    },
  });
}

/** The signed-in user, or null. Never throws. */
export async function getUser() {
  const supabase = createClient();
  if (!supabase) return null;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  return user;
}
