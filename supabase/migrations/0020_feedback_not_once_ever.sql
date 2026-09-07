-- 0020 — a person may rate more than one reply.
--
-- WHAT IS WRONG
--
-- Production carries `vent_feedback_user_id_key UNIQUE (user_id)`. No migration
-- in this repository declares it. `0002_truth_anchor.sql` creates the table
-- with a plain `user_id uuid references public.vent_users(id)` and no
-- uniqueness at all — but it creates it with `create table if not exists`,
-- which does exactly nothing to a table that is already there in a different
-- shape. So the repo's definition has never applied to the database it is
-- supposed to describe, and the name Postgres generated —
-- `<table>_<column>_key` — is the fingerprint of a `unique` written directly on
-- the column by something that is no longer in this history.
--
-- WHAT IT COSTS
--
-- `/api/feedback` allows five ratings an hour: `FEEDBACK_PER_HOUR = 5`, checked
-- against `countFeedbackSince` one line before the insert. The database allows
-- one, for ever. So a person's *second* rating raises 23505 and is dropped —
-- the route's stated policy and the database's actual one disagree by a factor
-- of five an hour against one for all time.
--
-- Until recently that surfaced as a 500. It is now caught and honestly reported
-- as `persisted: false`, which is better and is not a fix: the rating is still
-- gone. `feedback/route.ts` carries the reason it matters — "silently losing
-- them corrupts the one place the product learns what is losing" — and the
-- preference log downstream of it is the input to `npm run rlhf`. Every DPO
-- pair this product has ever built came from first ratings only, and nothing
-- said so.
--
-- WHY IT DROPS BY LOOKUP AND NOT BY NAME
--
-- 0016's lesson, which cost a debugging session: `drop ... if exists` matches
-- nothing and says nothing when the thing moved. `vent_feedback_user_id_key` is
-- an auto-generated name, and an auto-generated name is a guess about what some
-- earlier tool happened to call it. So this finds any UNIQUE constraint whose
-- columns are exactly `(user_id)` on this table and drops that, whatever it is
-- called — and raises a notice either way, because a migration that did nothing
-- and a migration that worked must not look identical.
--
-- The index is not collateral. `0007_rls_performance.sql` already creates
-- `vent_feedback_user_idx` on `(user_id) where user_id is not null`, so the
-- foreign key stays indexed after the unique index goes with its constraint.
--
-- Idempotent, and a no-op on any database built from these migrations — which
-- is every fresh deployment. It is written for the one that was not.

do $$
declare
  con_name text;
  dropped  int := 0;
begin
  for con_name in
    select c.conname
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'vent_feedback'
      and c.contype = 'u'
      -- Exactly one column, and that column is user_id. A composite unique
      -- that happens to include user_id is a different decision and is left
      -- alone: this drops the rule "one row per user", not any rule mentioning
      -- the column.
      and c.conkey = array[
        (select a.attnum
           from pg_attribute a
          where a.attrelid = t.oid
            and a.attname = 'user_id'
            and not a.attisdropped)
      ]
  loop
    execute format('alter table public.vent_feedback drop constraint %I', con_name);
    dropped := dropped + 1;
    raise notice '0020: dropped % from vent_feedback — a person may rate more than one reply', con_name;
  end loop;

  if dropped = 0 then
    raise notice '0020: no single-column unique on vent_feedback.user_id — nothing to do';
  end if;
end $$;
