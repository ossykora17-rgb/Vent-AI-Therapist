-- 0010 — repair the one column the database is genuinely missing.
--
-- The schema contract found two mismatches on its second run in production.
-- They point in opposite directions, and only one of them is a database
-- problem:
--
--   column vent_feedback.vent_id does not exist   → the CODE was wrong.
--     There has never been such a column. 0002 creates the table with user_id
--     and anon_id, `insertFeedback` writes exactly those, and the contract
--     invented `vent_id` by reading the row types instead of the migration.
--     Fixed in src/lib/store/contract.ts. Nothing to do here.
--
--   column circle_messages.flagged does not exist → the DATABASE is wrong.
--     0003 creates `flagged boolean not null default false` and the store
--     selects it on every read of a transcript. Production's table does not
--     have it, so `circle_messages` was created from an older or edited
--     version of 0003 — the drift that happens when a schema is built in two
--     places that cannot see each other. This is the repair.
--
-- `flagged` is what the Guardian writes when a message trips the thresholds in
-- `lib/external/guardian.ts`. Without the column, every read of a circle
-- transcript fails outright — so the circles surface has not worked in
-- production at all, and could not have.
--
-- `default false` is the honest backfill. Existing rows were never checked by
-- a Guardian that could not write its verdict anywhere, and marking them
-- flagged would invent a judgement nobody made. Unflagged is not a claim that
-- they were fine; it is the absence of a claim, which is the truth.
--
-- Guarded and idempotent, for the same reason 0009 is: one error in the SQL
-- editor rolls back the whole script, and this may be pasted alongside
-- migrations for tables that do not exist yet.

do $$
begin
  if to_regclass('public.circle_messages') is null then
    raise notice 'skipping circle_messages: table does not exist yet (apply 0003)';
  else
    alter table public.circle_messages
      add column if not exists flagged boolean not null default false;
  end if;
end
$$;
