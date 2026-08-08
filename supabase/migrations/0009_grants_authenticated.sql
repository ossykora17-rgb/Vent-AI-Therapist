-- 0009 — the other half of the grant, for the other identity.
--
-- 0008 says, in a comment: "no browser and no SSR client queries a table
-- directly, so anon and authenticated need no table privileges at all."
-- That was verified against components and is wrong about routes.
-- `requireUser()` in `src/lib/http/session.ts` builds the **SSR** client, so
-- every signed-in surface — /api/chats, /api/chats/[id]/messages,
-- /api/memories, /api/profile — reaches Postgres as `authenticated`, not as
-- `service_role`. 0008 would have left all of them refused, and the symptom
-- would have been a signed-in person with a working chat and an empty
-- everything-else: the same silhouette as every other bug in this file.
--
-- This is Supabase's intended two-gate design, stated properly for once.
-- GRANT is the coarse gate and runs first; RLS is the fine one and decides
-- rows. Neither substitutes for the other, which is what 0001–0007 assumed
-- and what cost eleven tables.
--
-- Least privilege, matched to the policies that exist. A verb granted here
-- with no policy behind it would be refused by RLS anyway, so granting more
-- than this buys nothing and widens the surface for no reason:
--
--   profiles       select, insert, update   (0001 — no delete policy)
--   sessions       select, insert, update, delete
--   messages       select, insert, delete   (0001 — no update policy)
--   memories       select, insert, update, delete   (0006)
--   subscriptions  select                   (0001 — read-only to its owner)
--
-- Deliberately absent: vents, vent_users, vent_feedback, circles,
-- circle_members, circle_messages. Those belong to the anonymous path, which
-- is served only by the admin client, and they carry deny-by-default RLS on
-- purpose. A signed-in stranger has no business reaching them, and 0008
-- already gave the server what it needs.
--
-- `anon` gets nothing at all. Signing in is what changes that.
--
-- Idempotent. Safe to run twice, and safe to run before or after 0008.

grant usage on schema public to authenticated;

grant select, insert, update          on public.profiles      to authenticated;
grant select, insert, update, delete  on public.sessions      to authenticated;
grant select, insert, delete          on public.messages      to authenticated;
grant select, insert, update, delete  on public.memories      to authenticated;
grant select                          on public.subscriptions to authenticated;

-- Vector search. 0006 defines match_memories as security definer with a
-- pinned search_path and takes the caller's id as an argument rather than
-- reading auth.uid() inside, so it cannot be steered into another person's
-- rows. It already grants execute to authenticated; repeated here so this
-- file stands alone if 0006 is ever re-run out of order.
grant usage on schema extensions to authenticated;
grant execute on function public.match_memories(uuid, extensions.vector, int)
  to authenticated, service_role;
