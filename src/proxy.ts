import type { NextRequest } from "next/server";
/*
 * Named `proxy` since Next 16 — the `middleware` file convention is
 * deprecated. Same job: refresh the Supabase auth cookie before a protected
 * route renders, and stay off the hot path for static assets.
 */
import { updateSession } from "@/lib/supabase/middleware";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Everything except static assets and image files — keeps the auth cookie
     * refresh off the hot path for /_next/* and favicons.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
