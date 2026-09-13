-- 0021 — one notification, scoped to the room it is about.
--
-- WHY THIS EXISTS
--
-- Of the first sixteen circles, fourteen held exactly one person. The steering
-- added in #185 stops the product opening a second empty room for somebody who
-- wanted the first one, but it cannot fix the shape underneath: person A opens
-- a room at 9pm, sits alone, closes the tab. Person B arrives at 9.20 and is
-- correctly steered into A's room. A is gone and never finds out.
--
-- The Keeper needs `members.length > 1` to say a single word, so the whole
-- product hangs on two people being in a room at the same moment — and nothing
-- has ever told the first person that the second one arrived.
--
-- That is the only notification this table is for. Not digests, not reminders,
-- not re-engagement, not "come back, we miss you". One event: somebody sat
-- down in the room you are holding.
--
-- WHY IT IS KEYED TO THE CIRCLE AND NOT TO THE PERSON
--
-- The obvious build is a per-browser subscription table that outlives any one
-- room. It was written that way first and it was wrong.
--
-- A Web Push subscription is a capability to wake a specific device. Held per
-- person, it is a thing this product keeps about somebody indefinitely, on a
-- front page that promises one tap deletes everything — and `deleteAll` works
-- in `userId` space and cannot reach a row keyed by anon id, which is exactly
-- how `circle_members` outlived that promise for as long as it existed.
--
-- Held per circle, the question does not arise. The row dies with the room, in
-- `closeCircle`, beside the seats and the transcript — the destruction path
-- check 129 already requires and already asserts. The capability to ring a
-- phone cannot outlive the forty-five minutes it was granted for, because
-- there is nowhere for it to live.
--
-- It also happens to be true to the thing: a subscription that survives the
-- room has no notification left to deliver.
--
-- `anon_id` is text with no foreign key, matching `circle_members` — anonymous
-- venters are not in `auth.users` id space, which is 0011's finding and the
-- reason the carve lives on `vent_users`.
--
-- The unique constraint is on `(circle_id, endpoint)`: one browser is one
-- endpoint, a person may hold two browsers, and re-subscribing from the same
-- browser must update rather than duplicate. 0002's lesson written down in
-- advance this time, rather than discovered later from a generated constraint
-- name nothing in this history declares.

create table if not exists public.circle_push (
  id         uuid primary key default gen_random_uuid(),
  circle_id  uuid not null references public.circles(id) on delete cascade,
  anon_id    text not null,
  endpoint   text not null,
  p256dh     text not null,
  auth       text not null,
  created_at timestamptz not null default now(),
  constraint circle_push_circle_endpoint_key unique (circle_id, endpoint)
);

create index if not exists circle_push_circle_idx on public.circle_push (circle_id);

alter table public.circle_push enable row level security;

-- No policies, deliberately, exactly as 0002 did for the tables above: RLS on
-- with zero policies denies anon and authenticated everything, and the service
-- role bypasses RLS. The server is the only way in.

-- 0008's lesson: RLS is the newer, finer gate and says nothing about the older
-- one. A table with no GRANT depends on who ran the migration and in which
-- tool, which is how eleven tables ended up unreadable by the server that owns
-- them while /api/health reported `database: ok`.
grant select, insert, update, delete on public.circle_push to service_role;
