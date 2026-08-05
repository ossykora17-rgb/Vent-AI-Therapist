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
