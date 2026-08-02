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
