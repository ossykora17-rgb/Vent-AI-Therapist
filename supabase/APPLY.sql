-- Mind Weave VENT — 11 migrations, in order.
-- Paste the whole thing into the Supabase SQL editor and run once.
-- Safe to re-run: every statement is IF NOT EXISTS / OR REPLACE.

-- ------------------------------------------------------------------------
-- 0001_init.sql
-- ------------------------------------------------------------------------

-- =============================================================================
-- Vent — initial schema
-- Deny-by-default: RLS is enabled on every table and no policy grants
-- cross-user access. The anon/authenticated roles can only ever reach rows
-- where user_id = auth.uid().
-- =============================================================================

-- ---------------------------------------------------------------------------
-- profiles: 1:1 with auth.users
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  display_name  text check (char_length(display_name) between 1 and 60),
  plan          text not null default 'free' check (plan in ('free', 'pro')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
  on public.profiles for select
  to authenticated
  using (auth.uid() = id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
  on public.profiles for insert
  to authenticated
  with check (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- ---------------------------------------------------------------------------
-- sessions: one therapy conversation
-- ---------------------------------------------------------------------------
create table if not exists public.sessions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  title       text not null default 'Untitled session'
                check (char_length(title) between 1 and 120),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists sessions_user_id_updated_at_idx
  on public.sessions (user_id, updated_at desc);

alter table public.sessions enable row level security;

drop policy if exists "sessions_select_own" on public.sessions;
create policy "sessions_select_own"
  on public.sessions for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "sessions_insert_own" on public.sessions;
create policy "sessions_insert_own"
  on public.sessions for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "sessions_update_own" on public.sessions;
create policy "sessions_update_own"
  on public.sessions for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "sessions_delete_own" on public.sessions;
create policy "sessions_delete_own"
  on public.sessions for delete
  to authenticated
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- messages: turns within a session
-- ---------------------------------------------------------------------------
create table if not exists public.messages (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references public.sessions(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  role        text not null check (role in ('user', 'assistant')),
  content     text not null check (char_length(content) between 1 and 20000),
  created_at  timestamptz not null default now()
);

create index if not exists messages_session_id_created_at_idx
  on public.messages (session_id, created_at);

alter table public.messages enable row level security;

-- The session_id subquery is itself RLS-filtered, so a user cannot attach a
-- message to somebody else's session even by guessing its id.
drop policy if exists "messages_select_own" on public.messages;
create policy "messages_select_own"
  on public.messages for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "messages_insert_own" on public.messages;
create policy "messages_insert_own"
  on public.messages for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.sessions s
      where s.id = session_id and s.user_id = auth.uid()
    )
  );

drop policy if exists "messages_delete_own" on public.messages;
create policy "messages_delete_own"
  on public.messages for delete
  to authenticated
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- subscriptions: Paystack billing state
-- Written only by the Paystack webhook via the service role, which bypasses
-- RLS. Users get read-only visibility into their own row.
-- ---------------------------------------------------------------------------
create table if not exists public.subscriptions (
  id                          uuid primary key default gen_random_uuid(),
  user_id                     uuid not null unique
                                references auth.users(id) on delete cascade,
  status                      text not null default 'inactive'
                                check (status in ('inactive', 'active', 'past_due', 'cancelled')),
  plan_code                   text,
  paystack_customer_code      text,
  paystack_subscription_code  text,
  current_period_end          timestamptz,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

create index if not exists subscriptions_user_id_idx
  on public.subscriptions (user_id);

alter table public.subscriptions enable row level security;

drop policy if exists "subscriptions_select_own" on public.subscriptions;
create policy "subscriptions_select_own"
  on public.subscriptions for select
  to authenticated
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

-- Keep updated_at honest.
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function public.touch_updated_at();

drop trigger if exists sessions_touch_updated_at on public.sessions;
create trigger sessions_touch_updated_at
  before update on public.sessions
  for each row execute function public.touch_updated_at();

drop trigger if exists subscriptions_touch_updated_at on public.subscriptions;
create trigger subscriptions_touch_updated_at
  before update on public.subscriptions
  for each row execute function public.touch_updated_at();

-- Create a profile row the moment a user signs up.
-- security definer so it can write past RLS; search_path pinned to block
-- search_path hijacking.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data ->> 'display_name',
      split_part(new.email, '@', 1)
    )
  )
  on conflict (id) do nothing;

  insert into public.subscriptions (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ------------------------------------------------------------------------
-- 0002_truth_anchor.sql
-- ------------------------------------------------------------------------

-- =============================================================================
-- Mind Weave VENT — Truth Anchor
--
-- SECURITY POSTURE: RLS is on with NO anon policies — deny by default. An
-- anon_id lives in localStorage and is trivially forgeable, so a policy like
-- "anon may read where anon_id matches" would let anyone read anyone's vents
-- by guessing an id. Instead every read and write goes through the server
-- route using the service role, which knows the anon_id from the request and
-- scopes the query itself. The anon key can reach nothing.
-- =============================================================================

create table if not exists public.vent_users (
  id              uuid primary key default gen_random_uuid(),
  anon_id         text unique not null check (char_length(anon_id) between 8 and 64),
  chair_picked    text check (chair_picked in ('tight_edge', 'sunk', 'half_off')),
  object_picked   text,
  onboarding_done boolean not null default false,
  created_at      timestamptz not null default now(),
  last_seen_at    timestamptz not null default now()
);

create table if not exists public.vents (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.vent_users(id) on delete cascade,
  user_message    text not null check (char_length(user_message) between 1 and 4000),
  ai_reply        text,
  mood_score      int check (mood_score between 1 and 10),
  tension_before  int check (tension_before between 0 and 100),
  tension_after   int check (tension_after between 0 and 100),
  language        text check (language in ('en', 'pidgin')),
  duality_value   real check (duality_value between 0 and 100),
  body_tapped     text check (body_tapped in ('head', 'throat', 'chest')),
  chair_picked    text,
  pressure_value  real check (pressure_value between 0 and 100),
  tactic_used     text,
  intent_type     text check (intent_type in ('factual', 'vent', 'greeting', 'meta', 'crisis')),
  real_world_tag  text check (real_world_tag in
                    ('economy','japa','ai_job','social','family','lonely','traffic','climate','health')),
  real_date_used  text,
  safety_flagged  boolean not null default false,
  created_at      timestamptz not null default now()
);

-- The two hot paths: a user's recent history, and the tactic no-repeat lookup.
create index if not exists vents_user_created_idx
  on public.vents (user_id, created_at desc);

create table if not exists public.vent_feedback (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references public.vent_users(id) on delete cascade,
  anon_id    text,
  rating     int not null check (rating between 1 and 5),
  message    text check (char_length(message) <= 2000),
  created_at timestamptz not null default now()
);

alter table public.vent_users    enable row level security;
alter table public.vents         enable row level security;
alter table public.vent_feedback enable row level security;

-- No policies are created on purpose. With RLS enabled and zero policies,
-- anon and authenticated roles are denied everything; the service role
-- bypasses RLS and is the only way in.

-- Rate limiting: counts a user's vents inside a window without shipping rows.
create or replace function public.vent_rate_count(p_user_id uuid, p_since timestamptz)
returns integer
language sql
security definer
set search_path = public
stable
as $$
  select count(*)::int from public.vents
  where user_id = p_user_id and created_at >= p_since;
$$;

revoke all on function public.vent_rate_count(uuid, timestamptz) from public, anon, authenticated;

-- ------------------------------------------------------------------------
-- 0003_circles.sql
-- ------------------------------------------------------------------------

-- =============================================================================
-- Mycelium Circles — Phase 0, text
--
-- Same posture as 0002: RLS on, no policies, deny-by-default. Every read and
-- write goes through the server on the service role. A circle is a room full
-- of strangers saying the hardest thing they have; the browser key must not
-- be able to read a word of it.
--
-- Re-runnable: apply twice safely.
-- =============================================================================

create table if not exists public.circles (
  id               uuid primary key default gen_random_uuid(),
  creator_anon_id  text not null check (char_length(creator_anon_id) between 8 and 64),
  tag              text check (tag in
                     ('economy','japa','ai_job','social','family','lonely','traffic','climate','health')),
  chair_picked     text check (chair_picked in ('tight_edge', 'sunk', 'half_off')),
  pressure_seeded  int check (pressure_seeded between 0 and 100),
  flavour          text,
  status           text not null default 'waiting'
                     check (status in ('waiting', 'live', 'closed')),
  starts_at        timestamptz not null default now(),
  ends_at          timestamptz not null,
  created_at       timestamptz not null default now()
);

create index if not exists circles_open_idx
  on public.circles (status, ends_at desc);

create table if not exists public.circle_members (
  id         uuid primary key default gen_random_uuid(),
  circle_id  uuid not null references public.circles(id) on delete cascade,
  anon_id    text not null check (char_length(anon_id) between 8 and 64),
  role       text not null check (role in ('keeper', 'sharer', 'witness')),
  joined_at  timestamptz not null default now(),
  -- One seat per person. Six seats is the whole design.
  unique (circle_id, anon_id)
);

create index if not exists circle_members_circle_idx
  on public.circle_members (circle_id, joined_at);

create table if not exists public.circle_messages (
  id         uuid primary key default gen_random_uuid(),
  circle_id  uuid not null references public.circles(id) on delete cascade,
  anon_id    text not null,
  content    text not null check (char_length(content) between 1 and 900),
  kind       text not null check (kind in ('share', 'witness', 'keeper_prompt', 'guardian')),
  flagged    boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists circle_messages_circle_idx
  on public.circle_messages (circle_id, created_at);

-- Sweeping by age is the only thing that makes "what's said here stays here"
-- true, so the index it needs is not optional.
create index if not exists circle_messages_ttl_idx
  on public.circle_messages (created_at);

alter table public.circles         enable row level security;
alter table public.circle_members  enable row level security;
alter table public.circle_messages enable row level security;

-- No policies, deliberately. See the header.

-- Server-side sweep for anything the lazy TTL missed — safe to schedule, safe
-- to call by hand, and it never touches a circle that is still inside its day.
create or replace function public.purge_expired_circle_messages()
returns integer
language sql
security definer
set search_path = public
as $$
  with gone as (
    delete from public.circle_messages
    where created_at < now() - interval '24 hours'
    returning 1
  )
  select count(*)::int from gone;
$$;

revoke all on function public.purge_expired_circle_messages() from public, anon, authenticated;

-- ------------------------------------------------------------------------
-- 0004_circle_member_pressure.sql
-- ------------------------------------------------------------------------

-- =============================================================================
-- A member's own opening pressure.
--
-- The closing drop has to be measured from the chair *that person* picked. A
-- circle-wide number would show a joiner someone else's starting point, which
-- is worse than showing nothing. Re-runnable.
-- =============================================================================

alter table public.circle_members
  add column if not exists pressure_seeded int
    check (pressure_seeded between 0 and 100);

-- ------------------------------------------------------------------------
-- 0005_circle_presence.sql
-- ------------------------------------------------------------------------

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

-- ------------------------------------------------------------------------
-- 0006_memory_vectors.sql
-- ------------------------------------------------------------------------

-- =============================================================================
-- Long-term memory, retrieved by meaning rather than by recency.
--
-- The six-turn window in src/lib/vent/memory.ts is short-term memory and stays
-- exactly as it is: cheap, local, and the thing that keeps a single
-- conversation coherent. This is the other half — a handful of durable facts a
-- person has told us across months, fetched because they are *relevant*, not
-- because they were recent.
--
-- Owner-scoped, like sessions and messages. Unlike the deny-all tables that
-- only the service role touches, a person reads and deletes their own memories
-- directly, so the policies below are real policies and not a locked door.
--
-- Re-runnable, like every migration here.
-- =============================================================================

create extension if not exists vector with schema extensions;

-- 768 dimensions matches Gemini's text-embedding-004 and gemini-embedding-001,
-- which is what src/lib/vent/embeddings.ts calls. Changing provider means
-- changing this number and re-embedding — the column is deliberately explicit
-- about that rather than hiding behind a default.
create table if not exists public.memories (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  key           text not null check (char_length(key) between 1 and 200),
  value         text not null check (char_length(value) between 1 and 4000),
  embedding     extensions.vector(768),
  source_message_id uuid references public.messages(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  -- One row per fact per person. Saying the same thing twice updates it.
  unique (user_id, key)
);

-- Cosine distance, because embeddings are compared by direction not magnitude.
-- HNSW over IVFFlat: no training step, and it stays accurate on a table that
-- grows a few rows at a time rather than being bulk-loaded.
create index if not exists memories_embedding_idx
  on public.memories using hnsw (embedding extensions.vector_cosine_ops);

create index if not exists memories_user_updated_idx
  on public.memories (user_id, updated_at desc);

alter table public.memories enable row level security;

drop policy if exists "memories_select_own" on public.memories;
create policy "memories_select_own"
  on public.memories for select
  using (auth.uid() = user_id);

drop policy if exists "memories_insert_own" on public.memories;
create policy "memories_insert_own"
  on public.memories for insert
  with check (auth.uid() = user_id);

drop policy if exists "memories_update_own" on public.memories;
create policy "memories_update_own"
  on public.memories for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "memories_delete_own" on public.memories;
create policy "memories_delete_own"
  on public.memories for delete
  using (auth.uid() = user_id);

-- =============================================================================
-- Retrieval.
--
-- security definer so the ORDER BY can use the index without RLS rewriting the
-- plan, with the caller's id passed in explicitly and filtered on inside. The
-- function never reads auth.uid() itself, so it cannot be tricked into
-- returning somebody else's rows by a caller who lies about their session —
-- the API route passes the id it got from the verified session, and that is
-- the only path.
--
-- search_path is pinned. An unpinned search_path on a security definer
-- function is how a definer function gets hijacked.
-- =============================================================================
create or replace function public.match_memories(
  p_user_id   uuid,
  p_embedding extensions.vector(768),
  p_limit     int default 5
)
returns table (id uuid, key text, value text, similarity float)
language sql
stable
security definer
set search_path = public, extensions
as $$
  select m.id, m.key, m.value, 1 - (m.embedding <=> p_embedding) as similarity
  from public.memories m
  where m.user_id = p_user_id
    and m.embedding is not null
  order by m.embedding <=> p_embedding
  limit greatest(1, least(coalesce(p_limit, 5), 20));
$$;

revoke all on function public.match_memories(uuid, extensions.vector, int) from public;
grant execute on function public.match_memories(uuid, extensions.vector, int)
  to authenticated, service_role;

-- =============================================================================
-- Storage: chat exports and audio notes.
--
-- Private bucket. Every object lives under a folder named for the owner's uid,
-- and the policies below check that first path segment — so a signed URL is
-- the only way anything leaves, and one person's export can never be listed by
-- another.
-- =============================================================================
insert into storage.buckets (id, name, public, file_size_limit)
values ('vent-files', 'vent-files', false, 26214400)  -- 25 MB
on conflict (id) do nothing;

drop policy if exists "vent_files_read_own" on storage.objects;
create policy "vent_files_read_own"
  on storage.objects for select
  using (
    bucket_id = 'vent-files'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "vent_files_write_own" on storage.objects;
create policy "vent_files_write_own"
  on storage.objects for insert
  with check (
    bucket_id = 'vent-files'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "vent_files_update_own" on storage.objects;
create policy "vent_files_update_own"
  on storage.objects for update
  using (
    bucket_id = 'vent-files'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "vent_files_delete_own" on storage.objects;
create policy "vent_files_delete_own"
  on storage.objects for delete
  using (
    bucket_id = 'vent-files'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ------------------------------------------------------------------------
-- 0007_rls_performance.sql
-- ------------------------------------------------------------------------

-- =============================================================================
-- Make Row Level Security stop calling auth.uid() once per row.
--
-- Every policy in this project was written `using (auth.uid() = user_id)`.
-- Postgres treats auth.uid() there as volatile and calls it for every row it
-- considers, so a table with ten thousand rows makes ten thousand calls to
-- decide which ones you may see. Wrapped in a scalar subquery it is evaluated
-- once and cached, which Supabase documents as 100x+ on a large table.
--
-- Nothing about who can see what changes. The predicate is identical; only
-- how often it is computed changes.
--
-- Found by auditing 0006 against Supabase's own Postgres rules before asking
-- anybody to run it, and the audit turned up the same fault in 0001 — which
-- has been live the whole time. That is the point of reading the rules before
-- the SQL rather than after the slowdown.
--
-- Re-runnable, like every migration here.
-- =============================================================================

-- ── profiles ────────────────────────────────────────────────────────────────
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
  on public.profiles for select using ((select auth.uid()) = id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
  on public.profiles for insert with check ((select auth.uid()) = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles for update
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- ── sessions ────────────────────────────────────────────────────────────────
drop policy if exists "sessions_select_own" on public.sessions;
create policy "sessions_select_own"
  on public.sessions for select using ((select auth.uid()) = user_id);

drop policy if exists "sessions_insert_own" on public.sessions;
create policy "sessions_insert_own"
  on public.sessions for insert with check ((select auth.uid()) = user_id);

drop policy if exists "sessions_update_own" on public.sessions;
create policy "sessions_update_own"
  on public.sessions for update
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "sessions_delete_own" on public.sessions;
create policy "sessions_delete_own"
  on public.sessions for delete using ((select auth.uid()) = user_id);

-- ── messages ────────────────────────────────────────────────────────────────
drop policy if exists "messages_select_own" on public.messages;
create policy "messages_select_own"
  on public.messages for select using ((select auth.uid()) = user_id);

-- The insert check also proves the session belongs to the same person, so a
-- row cannot be filed into somebody else's chat. Both halves are wrapped.
drop policy if exists "messages_insert_own" on public.messages;
create policy "messages_insert_own"
  on public.messages for insert
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.sessions s
      where s.id = session_id and s.user_id = (select auth.uid())
    )
  );

drop policy if exists "messages_delete_own" on public.messages;
create policy "messages_delete_own"
  on public.messages for delete using ((select auth.uid()) = user_id);

-- ── subscriptions ───────────────────────────────────────────────────────────
drop policy if exists "subscriptions_select_own" on public.subscriptions;
create policy "subscriptions_select_own"
  on public.subscriptions for select using ((select auth.uid()) = user_id);

-- ── memories (0006) ─────────────────────────────────────────────────────────
drop policy if exists "memories_select_own" on public.memories;
create policy "memories_select_own"
  on public.memories for select using ((select auth.uid()) = user_id);

drop policy if exists "memories_insert_own" on public.memories;
create policy "memories_insert_own"
  on public.memories for insert with check ((select auth.uid()) = user_id);

drop policy if exists "memories_update_own" on public.memories;
create policy "memories_update_own"
  on public.memories for update
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "memories_delete_own" on public.memories;
create policy "memories_delete_own"
  on public.memories for delete using ((select auth.uid()) = user_id);

-- ── storage: vent-files (0006) ──────────────────────────────────────────────
drop policy if exists "vent_files_read_own" on storage.objects;
create policy "vent_files_read_own"
  on storage.objects for select
  using (
    bucket_id = 'vent-files'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "vent_files_write_own" on storage.objects;
create policy "vent_files_write_own"
  on storage.objects for insert
  with check (
    bucket_id = 'vent-files'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "vent_files_update_own" on storage.objects;
create policy "vent_files_update_own"
  on storage.objects for update
  using (
    bucket_id = 'vent-files'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "vent_files_delete_own" on storage.objects;
create policy "vent_files_delete_own"
  on storage.objects for delete
  using (
    bucket_id = 'vent-files'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- =============================================================================
-- Indexes for the columns those policies filter on, and for the foreign keys
-- that cascade.
--
-- Postgres does not index a foreign key for you. Without one, deleting a
-- parent row scans the whole child table to find what to cascade — and every
-- policy above filters on user_id, which is the same lookup on every read.
-- =============================================================================

-- messages.user_id is in three policies and had no index of its own; the only
-- one that existed leads with session_id, which does not serve this filter.
create index if not exists messages_user_id_idx
  on public.messages (user_id);

-- ON DELETE SET NULL on this column means deleting one message scans every
-- memory anybody has ever kept.
create index if not exists memories_source_message_idx
  on public.memories (source_message_id)
  where source_message_id is not null;

-- circle_members.anon_id is how presence and seat lookups find a person.
create index if not exists circle_members_anon_idx
  on public.circle_members (anon_id);

-- vent_feedback is read by anon_id and by time, and had neither.
create index if not exists vent_feedback_anon_created_idx
  on public.vent_feedback (anon_id, created_at desc);

-- vent_feedback.user_id cascades from vent_users and had no index either.
create index if not exists vent_feedback_user_idx
  on public.vent_feedback (user_id)
  where user_id is not null;

-- ------------------------------------------------------------------------
-- 0008_grants.sql
-- ------------------------------------------------------------------------

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
-- Scope: service_role. The anonymous path — vents, circles and everything
-- around them — goes through the admin client (`src/lib/supabase/admin.ts`),
-- and those tables keep the deny-by-default posture 0001 set.
--
-- CORRECTION, see 0009: this file used to claim that no SSR client queries a
-- table directly and that `authenticated` therefore needs nothing. That was
-- checked against components and is wrong about routes. `requireUser()` builds
-- the SSR client, so every signed-in surface reaches Postgres as
-- `authenticated`. 0009 grants that role exactly what its RLS policies already
-- permit. `anon` still gets nothing.
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

-- ------------------------------------------------------------------------
-- 0009_grants_authenticated.sql
-- ------------------------------------------------------------------------

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

-- ------------------------------------------------------------------------
-- 0010_repair_drift.sql
-- ------------------------------------------------------------------------

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

-- ------------------------------------------------------------------------
-- 0011_vent_user_carve.sql
-- ------------------------------------------------------------------------

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

