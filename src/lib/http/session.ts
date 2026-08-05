import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * The signed-in caller, or the response to send instead.
 *
 * Every route below reads and writes through this client — the anon key plus
 * the caller's cookies — so Row Level Security is what enforces ownership, not
 * a `where user_id =` somebody could forget. The service-role client is for
 * the anonymous vent path only and is never used here.
 *
 * `getUser()` rather than `getSession()`: getSession trusts the cookie as it
 * was sent, getUser verifies it with the auth server. On a route that decides
 * what somebody may read, that difference is the whole thing.
 */
export async function requireUser() {
  const supabase = await createClient();
  if (!supabase) {
    return {
      error: NextResponse.json(
        { error: "no_storage", message: "Supabase is not configured on this deployment." },
        { status: 503, headers: { "cache-control": "no-store" } },
      ),
    } as const;
  }

  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    return {
      error: NextResponse.json(
        { error: "unauthenticated" },
        { status: 401, headers: { "cache-control": "no-store" } },
      ),
    } as const;
  }

  return { supabase, user: data.user } as const;
}

export const noStore = { "cache-control": "no-store" } as const;
