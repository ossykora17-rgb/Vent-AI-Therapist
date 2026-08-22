-- 0017 — what the room knows about somebody, across sessions.
--
-- One table, eight kinds. The obvious build is eight tables — facts,
-- relationships, goals, triggers, wins, losses, language, threads — and they
-- all have the same shape: a subject, a detail, when it was last true. Eight
-- tables is eight sets of store methods, eight RLS policies, and eight places
-- to forget a GRANT, which this project has already paid for once (0008).
--
-- THERE IS NO `trauma` KIND, AND THAT IS DELIBERATE.
--
-- A trauma row is a clinical label written by a model about somebody who never
-- consented to being assessed, in a product whose every screen says it is not
-- therapy and whose prompt says never diagnose. The row would outlive the
-- sentence that produced it and be read back weeks later as established fact.
-- `hard` holds the same information in the only form this product may hold it:
-- their words for the thing, not our name for it. "the burial" is a `hard`;
-- "unresolved grief" is a diagnosis, and `keepable()` in src/lib/vent/notes.ts
-- refuses it before it reaches this table.

create table if not exists public.vent_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.vent_users(id) on delete cascade,
  kind text not null check (
    kind in ('fact', 'person', 'goal', 'trigger', 'hard', 'win', 'loss', 'language')
  ),
  -- What it is about, in two or three words. Also half the dedupe key: a
  -- second session that learns more about the same sister updates the row
  -- rather than adding a second one, or this table becomes a transcript.
  subject text not null check (length(subject) between 2 and 24),
  detail text not null check (length(detail) between 4 and 70),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One row per thing, not one row per session that mentioned it.
-- Plain columns, not `lower(subject)`. PostgREST's `on_conflict` names
-- columns and cannot name an expression, so an expression index here would
-- have made every upsert a read-then-write — which is the shape that put
-- seven people in a six-seat circle two commits ago. The subject is
-- lower-cased at the write instead.
create unique index if not exists vent_notes_unique
  on public.vent_notes (user_id, kind, subject);

-- Every read is "everything about this person, newest first".
create index if not exists vent_notes_by_user
  on public.vent_notes (user_id, updated_at desc);

-- Deny-by-default, like every other table here. The server holds the service
-- role and scopes by user_id itself; the browser-facing key can read nothing.
alter table public.vent_notes enable row level security;

-- The GRANT underneath the policy — the ninth face in CLAUDE.md's list, and
-- the reason 0008 exists at all. A perfect policy behind a closed door reads
-- as `42501`, and /api/health reported `database: ok` over it for weeks.
grant all privileges on public.vent_notes to service_role;
revoke all on public.vent_notes from anon, authenticated;

notify pgrst, 'reload schema';
