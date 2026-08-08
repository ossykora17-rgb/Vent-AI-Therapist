-- 0009 — the other half of the grant, for the other identity.
--
-- 0008 says, in a comment: "no browser and no SSR client queries a table
-- directly, so anon and authenticated need no table privileges at all."
-- That was verified against components and is wrong about routes.
-- `requireUser()` in `src/lib/http/session.ts` builds the **SSR** client, so
-- every signed-in surface — /api/chats, /api/chats/[id]/messages,
-- /api/memories, /api/profile — reaches Postgres as `authenticated`, not as
-- `service_role`. 0008 alone would have left all of them refused, and the
-- symptom would have been a signed-in person with a working chat and an empty
-- everything-else: the same silhouette as every other bug in this file.
--
-- This is Supabase's intended two-gate design, stated properly for once.
-- GRANT is the coarse gate and runs first; RLS is the fine one and decides
-- rows. Neither substitutes for the other, which is what 0001–0007 assumed
-- and what cost eleven tables.
--
-- Least privilege, matched to the policies that exist. A verb granted here
-- with no policy behind it would be refused by RLS anyway, so granting more
-- than this buys nothing and widens the surface for no reason.
--
-- Deliberately absent: vents, vent_users, vent_feedback, circles,
-- circle_members, circle_messages. Those belong to the anonymous path, which
-- is served only by the admin client, and they carry deny-by-default RLS on
-- purpose. A signed-in stranger has no business reaching them, and 0008
-- already gave the server what it needs. `anon` gets nothing at all.
--
--
-- WHY THIS IS A DO BLOCK AND NOT EIGHT PLAIN GRANTS
--
-- `grant ... on public.memories` against a database where `memories` does not
-- exist raises an error, and one error in the Supabase SQL editor rolls back
-- the whole script. Production says `PGRST205` for `memories` right now —
-- 0006 has not been applied there — so a flat list of grants would abort on
-- the first missing table and silently leave the earlier ones unapplied too.
--
-- The first version of this file was a flat list. It would have failed on
-- paste and looked like the grant "didn't work", which is a worse outcome
-- than not shipping it: it teaches you to distrust the fix that is correct.
--
-- So each grant is applied only if its table is actually there. Running this
-- before 0006, after 0006, or twice all produce the same end state, and a
-- table that is missing is reported rather than fatal.

do $$
declare
  spec record;
begin
  for spec in
    select * from (values
      ('profiles',      'select, insert, update'),
      ('sessions',      'select, insert, update, delete'),
      ('messages',      'select, insert, delete'),
      ('memories',      'select, insert, update, delete'),
      ('subscriptions', 'select')
    ) as t(tbl, verbs)
  loop
    if to_regclass('public.' || spec.tbl) is null then
      raise notice 'skipping %: table does not exist yet', spec.tbl;
    else
      execute format('grant %s on public.%I to authenticated', spec.verbs, spec.tbl);
    end if;
  end loop;
end
$$;

grant usage on schema public to authenticated;

-- Vector search. 0006 defines match_memories as security definer with a
-- pinned search_path, taking the caller's id as an argument rather than
-- reading auth.uid() inside, so it cannot be steered into another person's
-- rows. Guarded the same way — the function does not exist until 0006 runs.
do $$
begin
  if to_regprocedure('public.match_memories(uuid, extensions.vector, int)') is null then
    raise notice 'skipping match_memories: function does not exist yet (apply 0006)';
  else
    grant usage on schema extensions to authenticated;
    execute 'grant execute on function public.match_memories(uuid, extensions.vector, int)'
         || ' to authenticated, service_role';
  end if;
end
$$;
