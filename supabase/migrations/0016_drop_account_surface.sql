-- Drop the account surface, because nothing reads it any more.
--
-- An anonymous product had grown an account system: a login, a signup, an
-- auth callback, a dashboard with status lamps, `/api/chats` with no callers,
-- and `/api/memories` behind `requireUser()`. Nothing here signs anybody in —
-- the premise is that saying a thing you cannot say out loud does not come
-- with a name attached, and the whole app runs on an id made on the device.
--
-- All of that application code is gone. These are the two tables and one
-- function it owned, and while they stay they are not inert:
--
--   * `/api/health` probed both on every check, on behalf of unreachable code
--   * `pgvector` indexes on `memories` cost storage and vacuum time
--   * `profiles` is 1:1 with `auth.users`, which keeps an auth dependency
--     alive in a schema that no longer has an auth surface
--
-- THIS IS IRREVERSIBLE AND IT DESTROYS ROWS.
--
-- Say plainly what: any profile row created by somebody who signed up while
-- the login existed, and any vector memory written for them. No vent, no
-- carve, no held note and no circle is touched — those live in `vent_users`,
-- `vents`, `circles`, `circle_members` and `circle_messages`, none of which
-- appear below.
--
-- Take a backup first if there is any chance somebody real signed up. There
-- is a `/api/export` route for exactly that, and it excludes circle
-- transcripts by design.

begin;

-- The function first: it reads `memories`, and dropping the table under a
-- function that references it leaves a broken object behind.
drop function if exists public.match_memories(uuid, vector, int, float);
drop function if exists public.match_memories(uuid, vector, integer, double precision);

-- `cascade` takes the RLS policies, the indexes and the foreign keys with the
-- table. Named explicitly rather than relying on it for the function above,
-- because a cascade that silently drops something nobody expected is how a
-- migration becomes the thing you are debugging next week.
drop table if exists public.memories cascade;
drop table if exists public.profiles cascade;

-- And the privileges those roles never needed.
--
-- 0009 opens with "anon and authenticated need no table privileges at all"
-- and then grants them anyway, because at the time there was an auth surface
-- reaching Postgres as `authenticated`. There is not any more: every read and
-- write in this product goes through the service-role client, which bypasses
-- RLS and does not consult these grants.
--
-- So they are surplus privilege attached to two roles nobody can be. That is
-- not merely untidy — `anon` is the role behind the public anon key, and a
-- leaked key with table privileges is a very different incident from a leaked
-- key with none.
--
-- Revoked rather than dropped: the roles are Supabase's own and other parts
-- of the platform use them. Only what this schema handed them goes.
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from anon, authenticated;
alter default privileges in schema public
  revoke all on tables from anon, authenticated;

commit;

-- PostgREST caches the schema. Without this it goes on advertising two tables
-- that no longer exist, and the next `/api/health` reports them as errors
-- rather than as absent — which reads as a broken database instead of a
-- finished cleanup.
notify pgrst, 'reload schema';
