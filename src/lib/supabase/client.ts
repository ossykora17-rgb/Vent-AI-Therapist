"use client";

import { createBrowserClient } from "@supabase/ssr";
import { env, isSupabaseConfigured } from "@/lib/env";
import type { Database } from "@/lib/supabase/types";

/**
 * Browser client. Returns null when Supabase keys are absent so UI can render
 * a "not configured" state rather than crashing the whole tree.
 */
export function createClient() {
  if (!isSupabaseConfigured) return null;
  return createBrowserClient<Database>(env.supabaseUrl, env.supabaseAnonKey);
}
