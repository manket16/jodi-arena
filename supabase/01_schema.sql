-- Jodi Arena: couple-vs-couple games
-- All gameplay writes go through SECURITY DEFINER functions. Tables are locked down with RLS.

create table public.couples (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 30),
  code text not null unique,
  p1 uuid not null references auth.users(id) on delete cascade,
  p2 uuid references auth.users(id) on delete set null,
  coins int not null default 100 check (coins >= 0),
  rating int not null default 1000,
  wins int not null default 0,
  losses int not null default 0,
  draws int not null default 0,
  badge text not null default '💞',
  badges text[] not null default array['💞'],
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null default '' check (char_length(name) <= 30),
  couple_id uuid references public.couples(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.songs (
  id serial primary key,
  title text not null unique,
  norm text not null unique,
  first_letter char(1) not null
);
create index songs_first_letter_idx on public.songs(first_letter);

create table public.sync_prompts (
  id serial primary key,
  prompt text not null,
  a text not null,
  b text not null
);

create table public.trivia (
  id serial primary key,
  q text not null,
  options jsonb not null,           -- array of 4 strings
  answer int not null check (answer between 0 and 3),
  difficulty int not null check (difficulty between 1 and 3),
  category text not null default 'general'
);

create table public.matches (
  id uuid primary key default gen_random_uuid(),
  game text not null check (game in ('sync','cricket','antakshari','hum')),
  content jsonb not null default '{}'::jsonb,   -- safe to show players
  keys jsonb not null default '{}'::jsonb,      -- answers, never sent to clients directly
  couple_a uuid not null references public.couples(id) on delete cascade,
  couple_b uuid references public.couples(id) on delete cascade,
  a_done boolean not null default false,
  b_done boolean not null default false,
  score_a int,
  score_b int,
  ghost boolean not null default false,
  status text not null default 'open' check (status in ('open','complete')),
  winner uuid,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index matches_open_idx on public.matches(game, status) where couple_b is null;
create index matches_couple_a_idx on public.matches(couple_a);
create index matches_couple_b_idx on public.matches(couple_b);

create table public.plays (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  couple_id uuid not null references public.couples(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  slot int not null check (slot in (1,2)),
  data jsonb not null default '{}'::jsonb,
  score int not null default 0,
  done boolean not null default false,
  created_at timestamptz not null default now(),
  unique (match_id, user_id)
);
create index plays_match_idx on public.plays(match_id);

create table public.bets (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  couple_id uuid not null references public.couples(id) on delete cascade,
  bettor uuid not null references auth.users(id) on delete cascade,
  target uuid not null references auth.users(id) on delete cascade,
  stake int not null check (stake in (10,25,50)),
  threshold int not null default 12,
  resolved boolean not null default false,
  won boolean,
  created_at timestamptz not null default now(),
  unique (match_id, bettor)
);

-- Lock everything down; reads and writes go through functions below.
alter table public.couples enable row level security;
alter table public.profiles enable row level security;
alter table public.songs enable row level security;
alter table public.sync_prompts enable row level security;
alter table public.trivia enable row level security;
alter table public.matches enable row level security;
alter table public.plays enable row level security;
alter table public.bets enable row level security;

-- The song list is public reference data (used for Antakshari autocomplete).
create policy "songs readable" on public.songs for select to authenticated using (true);

revoke all on public.couples, public.profiles, public.sync_prompts, public.trivia,
  public.matches, public.plays, public.bets from anon, authenticated;
revoke all on public.songs from anon;
grant select on public.songs to authenticated;
