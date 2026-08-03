import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { env, isSupabaseUrlValid } from "@/lib/env";

/**
 * Service-role client. Bypasses RLS, so it must never be imported into a
 * client component — `server-only` makes that a build error rather than a leak.
 * Every query made with it has to scope by user_id itself.
 */
export function createAdminClient() {
  if (!env.supabaseUrl || !env.supabaseServiceRoleKey) return null;

  // A URL that does not parse throws here, and this runs inside getStore(),
  // which every route calls first. Unguarded it is a 500 on every surface at
  // once. Misconfigured has to behave like unconfigured — the app degrades
  // and says nothing is being saved, which is true — while /api/health names
  // it as `misconfigured` so the cause is findable.
  if (!isSupabaseUrlValid) {
    console.error(
      "[supabase] NEXT_PUBLIC_SUPABASE_URL is not a valid http(s) URL — refusing to build a client",
    );
    return null;
  }

  try {
    return createSupabaseClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  } catch (error) {
    console.error("[supabase] admin client construction failed", error);
    return null;
  }
}

export const isPersistenceConfigured = () => createAdminClient() !== null;
