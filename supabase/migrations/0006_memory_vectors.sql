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
