-- 0022 — voice notes, kept exactly as long as the room is.
--
-- WHY THIS EXISTS
--
-- The founder's brief for circles was "a WhatsApp group with our own twist".
-- In a Nigerian WhatsApp group the voice is a note, not a call: you say it and
-- it waits in the thread until somebody is there to hear it. The live voice
-- room needs two people in it at the same moment, and fourteen of the first
-- sixteen circles never had a second person at all — a note needs nobody to be
-- listening yet.
--
-- WHAT IS IN A ROW
--
-- The note is recorded from the mask (`src/lib/voice/mask.ts`), the same
-- pitch-shifted graph the live voice publishes, per seat. The raw microphone
-- never leaves the phone: the server receives a voice that is already not
-- recognisably the speaker's, as 16 kHz mono 16-bit WAV, validated from its
-- own bytes (`checkWav`) — the phone's word for its length is never stored.
--
-- `audio` is base64 text rather than bytea: both stores speak JSON, and
-- PostgREST returns bytea as hex, which is twice the size of the thing on the
-- wire. The size is capped in the route (a minute, forty notes a circle).
--
-- WHY IT DIES WITH THE ROOM
--
-- Same shape as 0021, for the same reason. Keyed to the circle, deleted in
-- `closeCircle` beside the transcript, the seats and the push rows — the
-- destruction path check 129 requires of any table holding somebody's words,
-- and the one check 112 derives the nightly export's exclusions from. A note
-- is a transcript line said out loud, and it is never kept past the room that
-- heard it.
--
-- `on delete cascade` would take these rows if a circle row were ever deleted,
-- but closing a circle updates its status and deletes nothing, so the cascade
-- is a backstop and `closeCircle` is the policy — stated there, explicitly,
-- the way 0021's comment states it for push.
--
-- `anon_id` is text with no foreign key, matching `circle_members`.

create table if not exists public.circle_voice_notes (
  id          uuid primary key default gen_random_uuid(),
  circle_id   uuid not null references public.circles(id) on delete cascade,
  anon_id     text not null,
  duration_ms integer not null check (duration_ms > 0 and duration_ms <= 61000),
  audio       text not null,
  created_at  timestamptz not null default now()
);

create index if not exists circle_voice_notes_circle_idx
  on public.circle_voice_notes (circle_id, created_at);

-- Deny-all to the browser-facing keys, the same as every table here: every
-- read and write goes through the server, which checks the seat first.
alter table public.circle_voice_notes enable row level security;

grant select, insert, delete on public.circle_voice_notes to service_role;

-- THE BACKSTOP, MADE TO RUN
--
-- 0003 wrote `purge_expired_circle_messages()` as the transcript's backstop
-- and nothing ever called it: no cron, no route, no reference anywhere in
-- `src`. A room's words were deleted when a request next touched it — the
-- room's own poll, or the lobby sweeping five at a time — and a room nobody
-- came back to kept everything until somebody did. Measured before this
-- migration: two ended rooms unswept, their messages kept by luck.
--
-- That was a transcript. This migration stores recorded voices, and the room
-- tells people they are deleted within 24 hours. So the backstop now runs on
-- its own clock, and it deletes what `closeCircle` deletes — the words, the
-- notes, the seats and the push rows — for every circle whose end has passed.
-- It never sets `status`: closing is still the app's, because the app also
-- ends the voice room on the SFU, which a database cannot reach, and
-- `sweepIfOver` never reads the seats to do it.
--
-- The 24-hour clause is kept beside the ended one: a message that old belongs
-- to a room that ended a day ago by construction, and a backstop is allowed
-- to be redundant.
create or replace function public.purge_expired_circle_messages()
returns integer
language sql
security definer
set search_path = public
as $$
  with ended as (
    select id from public.circles where ends_at < now()
  ), said as (
    delete from public.circle_messages
    where circle_id in (select id from ended)
       or created_at < now() - interval '24 hours'
    returning 1
  ), spoken as (
    delete from public.circle_voice_notes
    where circle_id in (select id from ended)
       or created_at < now() - interval '24 hours'
    returning 1
  ), seats as (
    delete from public.circle_members
    where circle_id in (select id from ended)
    returning 1
  ), rings as (
    delete from public.circle_push
    where circle_id in (select id from ended)
    returning 1
  )
  select ((select count(*) from said) + (select count(*) from spoken)
        + (select count(*) from seats) + (select count(*) from rings))::int;
$$;

revoke all on function public.purge_expired_circle_messages() from public, anon, authenticated;

-- Every fifteen minutes, where the database can keep a clock. Supabase ships
-- pg_cron and installs it into `pg_catalog` (supabase.com/docs/guides/cron/
-- install); a Postgres without it skips this block and keeps the lazy sweep
-- alone, which is what it had before. `cron.schedule` with an existing name
-- replaces the job (supabase.com/docs/guides/cron/quickstart), so this is safe
-- to run twice.
--
-- The second job is the same docs page's caution: `cron.job_run_details` is
-- never cleaned up by itself, and a job every fifteen minutes writes 96 rows a
-- day into a free database for ever.
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron with schema pg_catalog;
    grant usage on schema cron to postgres;
    grant all privileges on all tables in schema cron to postgres;
    perform cron.schedule(
      'purge-ended-circles',
      '*/15 * * * *',
      'select public.purge_expired_circle_messages()'
    );
    perform cron.schedule(
      'prune-cron-history',
      '17 3 * * *',
      $job$delete from cron.job_run_details where end_time < now() - interval '7 days'$job$
    );
  end if;
end
$$;
