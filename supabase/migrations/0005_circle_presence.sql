-- Presence, derived rather than declared.
--
-- Two timestamps, no "online" boolean: a flag goes stale the moment a phone
-- dies mid-session and needs a cleanup job to un-lie. A timestamp read
-- through a window is only ever a few seconds behind, and it self-heals.
--
-- Re-runnable, like every migration here.

alter table public.circle_members
  add column if not exists last_seen_at timestamptz,
  add column if not exists typing_until timestamptz;

-- Every read is "the members of this circle", so the seat lookup carries the
-- presence columns with it and no extra query is needed to draw the dots.
create index if not exists circle_members_circle_seen_idx
  on public.circle_members (circle_id, last_seen_at desc);

-- RLS stays deny-all: no policies, service role only. Presence is not more
-- public than the room it belongs to.
