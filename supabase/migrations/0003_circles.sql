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
