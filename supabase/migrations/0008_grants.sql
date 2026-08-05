-- 0008 — the grants nobody wrote down.
--
-- Every read of `vents` in production failed with:
--
--   [42501] permission denied for table vents
--   hint: GRANT SELECT ON public.vents TO service_role;
--
-- 0001 through 0007 create eleven tables and grant privileges on none of them.
-- They leaned on Supabase's default privileges, which apply to objects created
-- by particular roles — so whether the server can read its own tables depended
-- on who happened to run the migration and in which editor. It worked for the
-- author and not for the deployment, which is the fifth question again:
-- *which deployment shape makes this false.*
--
-- Two layers were doing the work of one. RLS was written carefully in 0001 and
-- 0006 and tightened in 0007, and underneath it the SQL grant — the older,
-- coarser gate that runs first — was never mentioned. RLS cannot allow what
-- GRANT has not permitted, so a perfect policy sat behind a closed door.
--
-- Scope: service_role and nothing else. Every table read in this app goes
-- through the admin client (`src/lib/supabase/admin.ts`); no browser and no
-- SSR client queries a table directly. So `anon` and `authenticated` need no
-- table privileges at all, and giving them any would widen the surface to fix
-- a problem they do not have. The deny-by-default posture 0001 set stays
-- exactly as it is.
--
-- Idempotent: GRANT is, by definition. Safe to run twice.

grant usage on schema public to service_role;

-- The server's identity. It bypasses RLS by design and scopes every query by
-- user_id itself — see the comment on createAdminClient().
grant all privileges on all tables in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;

-- The same, for anything added after this file. Default privileges attach to
-- the role that runs this statement, so a table created by a different role in
-- a different tool still needs its own grant — which is exactly how the eleven
-- above ended up unreachable. `/api/health` reports the store's error code and
-- hint now, so the next one names itself in one request instead of three
-- deploys.
alter default privileges in schema public
  grant all privileges on tables to service_role;
alter default privileges in schema public
  grant all privileges on sequences to service_role;
alter default privileges in schema public
  grant execute on functions to service_role;

-- Vector search is called by the server with the caller's id passed as an
-- argument (0006 pins its search_path and takes the uuid rather than reading
-- auth.uid(), so it cannot be tricked into reading somebody else's rows).
grant usage on schema extensions to service_role;
