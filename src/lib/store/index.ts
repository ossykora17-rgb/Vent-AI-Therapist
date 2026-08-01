import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { FileStore } from "./file-store";
import { SupabaseStore } from "./supabase-store";
import type { Store } from "./types";

export type { Store, VentRow, NewVent, ProfilePatch } from "./types";

let cached: Store | null | undefined;

/**
 * Supabase when it is configured. Otherwise a local JSON file — but only in
 * development, or when someone deliberately sets VENT_LOCAL_STORE=1.
 *
 * The guard matters: serverless filesystems are ephemeral and per-instance,
 * so silently falling back to a file in production would look like it works
 * and then lose people's sessions at random. Unconfigured production keeps
 * the honest "nothing is being saved" behaviour instead.
 */
export function getStore(): Store | null {
  if (cached !== undefined) return cached;

  const admin = createAdminClient();
  if (admin) {
    cached = new SupabaseStore(admin);
    return cached;
  }

  const localAllowed =
    process.env.VENT_LOCAL_STORE === "1" || process.env.NODE_ENV !== "production";

  cached = localAllowed ? new FileStore() : null;
  return cached;
}

/** For tests that need a clean slate. */
export function resetStoreCache() {
  cached = undefined;
}
