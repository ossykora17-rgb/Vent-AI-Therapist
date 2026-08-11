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
