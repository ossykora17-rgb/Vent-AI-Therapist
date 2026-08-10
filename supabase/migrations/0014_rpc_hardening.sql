-- 0014 — stop trusting a caller who says whose memories these are.
--
-- Found by Supabase's own security linter the first hour anybody could reach
-- production with a tool instead of a screenshot.
--
-- ## match_memories read anybody's memories
--
-- 0006 defines it `security definer` — so it runs as the owner and RLS on
-- `public.memories` does not apply to it — and it filters on a uuid the
-- *caller supplies*:
--
--     where m.user_id = p_user_id
--
-- `authenticated` holds execute. So any signed-in person could POST to
-- /rest/v1/rpc/match_memories with somebody else's id and read their memories
-- straight back: key, value, similarity. In a product whose entire promise is
-- that nobody knows it is you, that is the worst shape of bug available.
--
-- The app has always passed the caller's own id (`p_user_id: auth.user.id` in
-- /api/memories), so the fix costs nothing legitimate: keep the signature so
-- the existing call still type-checks, and ignore the argument. `auth.uid()`
-- is the only identity the database will accept from here.
--
-- The parameter stays rather than being dropped, deliberately. Dropping it
-- changes the signature, which breaks the running deployment the moment this
-- lands and before the code can catch up. It is named as ignored below so
-- nobody re-wires it back in.
--
-- ## handle_new_user was callable over HTTP
--
-- It is a trigger function on auth.users. Called as an RPC there is no `new`
-- record, so it errors rather than doing anything — but an endpoint that
-- exists to throw is still surface, and triggers do not need execute grants
-- to fire. Revoked from both roles; the trigger is unaffected.
--
-- ## touch_updated_at had no search_path
--
-- Security invoker, so the exposure is small, but an unpinned search_path on
-- a trigger is free to fix and one less thing on the report.

-- ── the real one ───────────────────────────────────────────────────────────
create or replace function public.match_memories(
  p_user_id uuid,
  p_embedding extensions.vector,
  p_limit int default 5
)
returns table (id uuid, key text, value text, similarity double precision)
language sql
stable
-- Invoker, not definer. RLS on public.memories is already
-- `auth.uid() = user_id`, so the row filter belongs to the table rather than
-- to this function — one mechanism instead of two, and the linter warning
-- clears honestly rather than being waved off as intentional. The auth.uid()
-- clause below stays as a second lock: a guarantee that depends on another
-- file staying correct is not a guarantee.
security invoker
set search_path to 'public', 'extensions'
as $$
  select m.id, m.key, m.value, 1 - (m.embedding <=> p_embedding) as similarity
  from public.memories m
  -- p_user_id is accepted and ignored. The caller does not get to say who
  -- they are; `auth.uid()` does. A null uid (anon, or a service-role client
  -- with no user context) matches nothing, which is the correct answer to
  -- "whose memories are these" when there is no whose.
  where m.user_id = auth.uid()
    and m.embedding is not null
  order by m.embedding <=> p_embedding
  limit greatest(1, least(coalesce(p_limit, 5), 20));
$$;

comment on function public.match_memories(uuid, extensions.vector, int) is
  'Vector search over the CALLER''S OWN memories. security invoker, so RLS on public.memories applies; the auth.uid() filter is a second lock, not the only one. p_user_id is accepted for signature compatibility and ignored. See 0014.';

revoke all on function public.match_memories(uuid, extensions.vector, int) from public;
revoke all on function public.match_memories(uuid, extensions.vector, int) from anon;
grant execute on function public.match_memories(uuid, extensions.vector, int)
  to authenticated, service_role;

-- ── surface that only ever throws ──────────────────────────────────────────
revoke all on function public.handle_new_user() from public;
revoke all on function public.handle_new_user() from anon;
revoke all on function public.handle_new_user() from authenticated;

-- ── free hardening ─────────────────────────────────────────────────────────
alter function public.touch_updated_at() set search_path = '';
