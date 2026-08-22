#!/usr/bin/env bash
# Boot the built app and run the live half of the gate against it.
#
# Extracted from the workflow so both deployment shapes — voice configured
# and not — run the identical checks, and so the same script can be run by
# hand when a CI failure needs reproducing locally.
#
# Three things here are load-bearing rather than tidy:
#
#   1. The port is checked *before* starting. A leftover server from an
#      earlier run will happily answer these checks, and the run then reports
#      on a build and a configuration that are not the ones under test. That
#      is not hypothetical — it produced a passing result for the wrong shape
#      while this script was being written.
#   2. `.next` is checked too, and for exactly the same reason. `next start`
#      serves whatever is on disk, so a script that only guards the port
#      guards half the problem: with a clear port and a stale build this
#      happily reported a full green run against source that no longer
#      existed. A new route was added, every check passed, and the route was
#      not in the build at all — found only because one live probe finally
#      called it and got Next's 404 page instead of JSON.
#
#      This is the trap that is already written down twice — an orphaned
#      `next-server` answering for the build under test, and a suite that
#      tests the shape its author is standing in. Same shape, one layer down:
#      the thing under test was never the thing being served.
#   3. The server is started with `setsid` and killed as a process group.
#      `npx` spawns `next-server` as a grandchild; killing the `npx` pid alone
#      orphans it, it keeps the port, and the *next* invocation silently talks
#      to it. Running both shapes in one job depends on this working.
set -euo pipefail

PORT=3001
LOG="${RUNNER_TEMP:-/tmp}/live-checks-server.log"

if curl -sf "http://localhost:$PORT/api/health" >/dev/null 2>&1; then
  echo "something is already serving on :$PORT — refusing to test against it."
  echo "these checks must run against the build and configuration under test."
  exit 1
fi

# Is what is on disk actually the source in this tree?
#
# `BUILD_ID` is written at the end of a successful build, so it is the honest
# timestamp — `.next/` itself is touched by all sorts of things. Anything
# newer than it that the build reads means the build is behind the tree.
#
# It rebuilds rather than refusing, because CI runs `npm run build`
# immediately before this and `.next` is therefore never stale there — the
# branch costs nothing in the one place it would cost time, and by hand it
# does what somebody running "the live half" plainly meant.
BUILD_ID=".next/BUILD_ID"
if [ ! -f "$BUILD_ID" ] || [ -n "$(find src next.config.* package.json tailwind.config.* \
      tsconfig.json -newer "$BUILD_ID" -print -quit 2>/dev/null)" ]; then
  echo "the build is behind the source — rebuilding before testing it."
  npm run build
fi

# Output to a file, not to this script's stdout: a background process holding
# the parent's pipe open makes the script look hung to anything that waits on
# output rather than on exit.
setsid env VENT_LOCAL_STORE=1 VENT_EXTERNAL_FIXTURE=scripts/fixtures/external \
  npx next start -p "$PORT" >"$LOG" 2>&1 &
SERVER=$!
trap 'kill -- -"$SERVER" 2>/dev/null || kill "$SERVER" 2>/dev/null || true' EXIT

for _ in $(seq 1 30); do
  curl -sf "http://localhost:$PORT/api/health" >/dev/null 2>&1 && break
  sleep 1
done

if ! curl -sf "http://localhost:$PORT/api/health" >/dev/null 2>&1; then
  echo "the server never came up:"
  tail -30 "$LOG"
  exit 1
fi

node scripts/eval.mjs "http://localhost:$PORT"
node scripts/live-verify.mjs "http://localhost:$PORT"

# ── and then the shape nothing runs in ──────────────────────────────────────
#
# Everything above ran with VENT_LOCAL_STORE=1, because almost every assertion
# in the live half is about something being kept. That is also the reason
# CLAUDE.md's longest list exists: every automated path in this repository has
# a store, so production with no Supabase env vars — which is exactly what a
# fresh Vercel project is, and what real people were using — is the one
# configuration nothing ever exercised. The same bug has come back through
# that gap eleven times.
#
# So the second pass is not these checks with a flag flipped. `no-store-verify`
# asserts the things that are only true, and only checkable, when nothing is
# configured: that no page 5xxs, that every refusal is written for the person
# reading it rather than for whoever deployed this, and that no write path
# claims to have kept anything.
#
# The kill-and-wait between the passes is load-bearing for the reason written
# at the top of this file, and it is not theoretical: writing this, a leftover
# `next-server` from the first pass answered the second one for three runs. It
# reported the old build's copy of a sentence that had already been fixed —
# a stale server producing a *failure*, which is the lucky direction. The
# unlucky direction is the same thing producing a pass.
kill -- -"$SERVER" 2>/dev/null || kill "$SERVER" 2>/dev/null || true
for _ in $(seq 1 30); do
  curl -sf "http://localhost:$PORT/api/health" >/dev/null 2>&1 || break
  sleep 1
done
if curl -sf "http://localhost:$PORT/api/health" >/dev/null 2>&1; then
  echo "the first server would not let go of :$PORT — refusing to test against it."
  exit 1
fi

# `env -u` rather than an unset: the variable may be exported by the caller,
# by CI, or by a shell profile, and only removing it from the child's
# environment is the same in all three. NODE_ENV=production is what makes
# `getStore()` refuse to fall back to a file, which is the whole shape.
setsid env -u VENT_LOCAL_STORE NODE_ENV=production \
  VENT_EXTERNAL_FIXTURE=scripts/fixtures/external \
  npx next start -p "$PORT" >"$LOG.nostore" 2>&1 &
SERVER=$!

for _ in $(seq 1 30); do
  curl -sf "http://localhost:$PORT/api/health" >/dev/null 2>&1 && break
  sleep 1
done

if ! curl -sf "http://localhost:$PORT/api/health" >/dev/null 2>&1; then
  echo "the unconfigured server never came up:"
  tail -30 "$LOG.nostore"
  exit 1
fi

node scripts/no-store-verify.mjs "http://localhost:$PORT"
