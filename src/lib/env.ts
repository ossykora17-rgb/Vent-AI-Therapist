/**
 * Env access is deliberately lazy and non-throwing at module scope.
 *
 * The app must build and boot on Vercel *before* any keys exist, so a missing
 * variable degrades to a visible "not configured" state instead of a 500.
 * Only code paths that genuinely need a key call the `require*` helpers.
 */

export const env = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? "",
  paystackSecretKey: process.env.PAYSTACK_SECRET_KEY ?? "",
  /** Perspective — the Guardian's second opinion on a message. */
  perspectiveApiKey: process.env.PERSPECTIVE_API_KEY ?? "",
  /** Sugra — commodities and market data. Optional; the rate works without it. */
  sugraApiKey: process.env.SUGRA_API_KEY ?? "",
  /** LiveKit — Phase 1 voice. Server half only until the client lands. */
  livekitUrl: process.env.LIVEKIT_URL ?? "",
  livekitApiKey: process.env.LIVEKIT_API_KEY ?? "",
  livekitApiSecret: process.env.LIVEKIT_API_SECRET ?? "",
  paystackPublicKey: process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY ?? "",
  siteUrl:
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "") ||
    "http://localhost:3000",
} as const;

export const isSupabaseConfigured = Boolean(
  env.supabaseUrl && env.supabaseAnonKey,
);

/**
 * Present is not the same as parseable.
 *
 * `createClient()` in supabase-js throws on a malformed URL — and
 * `abc.supabase.co`, without the scheme, is the paste people actually make.
 * It throws during construction, inside `getStore()`, which every route calls
 * before it does anything. Unguarded, one bad character in this variable is a
 * 500 across the whole app *including `/api/health`* — the endpoint you would
 * use to find out why.
 *
 * Verified against the installed client, not assumed: "abc.supabase.co" and
 * "not a url" throw; a wrong service-role key does not.
 */
export const isSupabaseUrlValid = (() => {
  if (!env.supabaseUrl) return false;
  try {
    const { protocol } = new URL(env.supabaseUrl);
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
})();

export const isAnthropicConfigured = Boolean(env.anthropicApiKey);
export const isPerspectiveConfigured = Boolean(env.perspectiveApiKey);
export const isLivekitConfigured = Boolean(
  env.livekitUrl && env.livekitApiKey && env.livekitApiSecret,
);
export const isPaystackConfigured = Boolean(
  env.paystackSecretKey && env.paystackPublicKey,
);

export function requireSupabaseEnv() {
  if (!isSupabaseConfigured) {
    throw new Error(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.",
    );
  }
  return { url: env.supabaseUrl, anonKey: env.supabaseAnonKey };
}

/** Absolute URL builder — required for OAuth/email redirects. */
export function absoluteUrl(path: string) {
  const base = env.siteUrl.replace(/\/$/, "");
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}
