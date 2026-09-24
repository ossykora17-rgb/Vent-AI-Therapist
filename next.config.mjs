/**
 * The build identity, in one place, for both ends of the update check.
 *
 * `src/lib/update.ts` explains the bug this exists for: an installed window ran
 * a days-old bundle and showed a card deleted from the code, because nothing
 * on the page ever asked whether the server had moved on. The bundle gets this
 * value inlined, every response carries it as a header, and the page compares
 * the two when somebody comes back to it.
 *
 * Derived exactly as `/api/health` derives `commit` — the first seven of
 * `VERCEL_GIT_COMMIT_SHA`, or "local" — so the endpoint an operator reads and
 * the header a window reads cannot disagree about which build is live.
 */
const build = (process.env.VERCEL_GIT_COMMIT_SHA ?? "local").slice(0, 7);

/** @type {import('next').NextConfig} */
const nextConfig = {
  env: { NEXT_PUBLIC_BUILD: build },
  async headers() {
    return [{ source: "/:path*", headers: [{ key: "x-build", value: build }] }];
  },
};

export default nextConfig;
