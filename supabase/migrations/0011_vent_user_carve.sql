-- 0011 — the carve belongs to the person the product actually has.
--
-- `public.memories` was the obvious home and it is the wrong one. Its
-- `user_id` is `references auth.users(id)`: a signed-in Supabase auth
-- account. Everyone venting here is anonymous, and `store.ensureUser(anonId)`
-- returns a `public.vent_users.id` — a different table in a different id
-- space entirely.
--
-- So writing a carve to `memories` keyed by a vent_users id violates that
-- foreign key. In Postgres the insert is rejected, `setCarve` returns false,
-- and the carve is silently never kept. On `FileStore` there is no foreign
-- key, so it works perfectly. Local: alive. Production: dead. That is the
-- oldest failure in this repo, and it shipped again in the commit that wired
-- the Carver.
--
-- One column on the table the anonymous person already owns. It cascades on
-- delete with `vent_users`, so "clear my id" takes it with everything else
-- without any extra statement having to remember to.
--
-- Additive and idempotent. Until this is applied `setCarve` returns false and
-- `getCarve` returns null, which is exactly how the product behaved before
-- the Carver existed — the room simply opens knowing nothing. Nothing breaks
-- while this is pending; the feature is just off, and /api/health says so.

alter table public.vent_users
  add column if not exists carve text
  check (carve is null or char_length(carve) between 1 and 200);

comment on column public.vent_users.carve is
  'Eight words for the wound, written by the Carver at session close. One line per person, sharpened rather than accumulated. Deleted with the row.';
