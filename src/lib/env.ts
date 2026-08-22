/**
 * Env access is deliberately lazy and non-throwing at module scope.
 *
 * The app must build and boot on Vercel *before* any keys exist, so a missing
 * variable degrades to a visible "not configured" state instead of a 500.
 * Only code paths that genuinely need a key call the `require*` helpers.
 */

/**
 * Every value is trimmed.
 *
 * A dashboard paste picks up a trailing newline or a leading space far more
 * often than anyone admits, and a credential with one invisible character on
 * the end is rejected exactly like a wrong one — an `authentication_error`
 * that sends you hunting for a revoked key that was never revoked. Trimming
 * costs nothing and removes the whole class.
 */
const s = (v: string | undefined) => (v ?? "").trim();

/**
 * The project origin, not an endpoint inside it.
 *
 * `https://ref.supabase.co/rest/v1` is a valid https URL, looks right in a
 * dashboard, and is wrong: supabase-js appends `/rest/v1` itself, so every
 * query then asks for `/rest/v1/rest/v1/vents` and PostgREST answers
 * `PGRST125 — Invalid path specified in request URL`. Every read fails, and
 * the message names a *path* while the eye reads it as a table problem. That
 * cost three misdiagnoses.
 *
 * The four `/x/v1` suffixes are unambiguous — they are endpoints inside a
 * project, never a project base — so they are stripped rather than rejected.
 * Any other path is left exactly as given: a self-hosted Supabase behind
 * `https://example.com/supabase` is a real deployment shape, and refusing a
 * path outright would break it to fix a paste.
 */
const ENDPOINT_SUFFIX = /\/(rest|auth|storage|realtime|functions)\/v1$/;

export function supabaseBase(raw: string): string {
  if (!raw) return raw;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    // Not parseable at all — isSupabaseUrlValid is the one that says so.
    return raw;
  }
  const path = url.pathname.replace(/\/+$/, "");
  if (!ENDPOINT_SUFFIX.test(path)) return raw;
  url.pathname = path.replace(ENDPOINT_SUFFIX, "");
  return url.toString().replace(/\/$/, "");
}

export const env = {
  supabaseUrl: supabaseBase(s(process.env.NEXT_PUBLIC_SUPABASE_URL)),
  /*
    Gone with the account system that was its only reader.

    It fed two things: the browser client, and a proxy that refreshed a
    Supabase auth cookie on every single request — page loads, API calls, the
    lot — for an auth system nobody could reach. A round trip per request, on
    behalf of a login that no longer exists.

    Kept as a comment rather than silently dropped because the variable is
    still set in Vercel and somebody will wonder why nothing reads it. Nothing
    reads it. It can be deleted there whenever.
  */
  supabaseServiceRoleKey: s(process.env.SUPABASE_SERVICE_ROLE_KEY),
  anthropicApiKey: s(process.env.ANTHROPIC_API_KEY),
  /** Every other provider speaks the OpenAI shape — see lib/vent/providers. */
  geminiApiKey: s(process.env.GEMINI_API_KEY),
  groqApiKey: s(process.env.GROQ_API_KEY),
  openrouterApiKey: s(process.env.OPENROUTER_API_KEY),
  cerebrasApiKey: s(process.env.CEREBRAS_API_KEY),
  deepseekApiKey: s(process.env.DEEPSEEK_API_KEY),
  zhipuApiKey: s(process.env.ZHIPU_API_KEY),
  paystackSecretKey: s(process.env.PAYSTACK_SECRET_KEY),
  /** Perspective — the Guardian's second opinion on a message. */
  perspectiveApiKey: s(process.env.PERSPECTIVE_API_KEY),
  /** Sugra — commodities and market data. Optional; the rate works without it. */
  sugraApiKey: s(process.env.SUGRA_API_KEY),
  /** LiveKit — Phase 1 voice. Server half only until the client lands. */
  livekitUrl: s(process.env.LIVEKIT_URL),
  livekitApiKey: s(process.env.LIVEKIT_API_KEY),
  livekitApiSecret: s(process.env.LIVEKIT_API_SECRET),
  paystackPublicKey: s(process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY),
  /**
   * The one credential that guards a copy of everything.
   *
   * Supabase Hobby keeps no automated backups. Every carve, every held note,
   * every vent is one incident away from gone — in a product whose opening
   * sentence to a returning person is "I kept what you left here". That is
   * the only promise here that cannot be made good after the fact.
   *
   * A backup route needs a secret by construction: unauthenticated, it is a
   * full database dump served to anybody who guesses the path, which is a
   * worse failure than having no backup at all. So the route answers 501
   * until this is set, and never anything else — absent means the door does
   * not exist, not that it is open.
   */
  backupToken: s(process.env.VENT_BACKUP_TOKEN),
  siteUrl:
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "") ||
    "http://localhost:3000",
} as const;

/*
  Configured means the store can be built, which means the service role.

  This was `url && anonKey` — correct while an anonymous browser client was
  the second half of the pair. It is not any more: every read and write in
  this product goes through the service-role client, and a deployment with a
  URL and an anon key and no service key can do nothing at all while
  reporting itself configured.

  The same distinction `/api/health` already draws with `no_service_key`,
  arriving one file earlier.
*/
export const isSupabaseConfigured = Boolean(
  env.supabaseUrl && env.supabaseServiceRoleKey,
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

/**
 * What is left on the URL after normalisation, for the diagnostic surfaces.
 *
 * The path and nothing else — no host, no project ref, no key — so it is safe
 * in an open response body. `"/"` is the shape every hosted project has; a
 * store error alongside anything else here is the first thing to look at.
 */
export const supabaseUrlPath = (() => {
  if (!env.supabaseUrl) return null;
  try {
    return new URL(env.supabaseUrl).pathname || "/";
  } catch {
    return null;
  }
})();

export const isAnthropicConfigured = Boolean(env.anthropicApiKey);

/**
 * Any way at all to answer. The vent route branches on this rather than on
 * Anthropic alone — a build with only a free Gemini key is a working product,
 * and telling that build it has no model would be false.
 */
export const isModelConfigured = Boolean(
  env.anthropicApiKey ||
    env.geminiApiKey ||
    env.groqApiKey ||
    env.openrouterApiKey ||
    env.cerebrasApiKey ||
    env.deepseekApiKey ||
    env.zhipuApiKey,
);
export const isPerspectiveConfigured = Boolean(env.perspectiveApiKey);
export const isLivekitConfigured = Boolean(
  env.livekitUrl && env.livekitApiKey && env.livekitApiSecret,
);
export const isPaystackConfigured = Boolean(
  env.paystackSecretKey && env.paystackPublicKey,
);
