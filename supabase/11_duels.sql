-- Couple duels: the 6 live two-phone games. Each finished game is one row; the loser owes the stake.

create table public.duels (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  game text not null check (game in ('jhooth','draw','momo','hotseat','slider','bolti')),
  winner uuid,            -- null = tie
  loser uuid,
  scores jsonb not null default '{}'::jsonb,
  stake text check (char_length(stake) <= 80),
  paid_at timestamptz,
  created_by uuid not null,
  created_at timestamptz not null default now()
);
create index duels_couple_idx on public.duels(couple_id, created_at desc);
alter table public.duels enable row level security;
revoke all on public.duels from anon, authenticated;

create or replace function public.record_duel(p_game text, p_winner uuid, p_scores jsonb, p_stake text)
returns uuid language plpgsql security definer set search_path = public as $$
declare c uuid := public.my_couple(); cp public.couples; did uuid; l uuid;
begin
  if c is null then raise exception 'Create or join a jodi first'; end if;
  select * into cp from public.couples where id = c;
  if cp.p2 is null then raise exception 'Your partner needs to join first'; end if;
  if p_game not in ('jhooth','draw','momo','hotseat','slider','bolti') then raise exception 'Unknown game'; end if;
  if p_winner is not null and p_winner not in (cp.p1, cp.p2) then raise exception 'Winner must be one of you'; end if;
  if p_scores is null or jsonb_typeof(p_scores) <> 'object' or octet_length(p_scores::text) > 500 then raise exception 'Bad scores'; end if;
  -- one result per couple every few seconds, so a double tap cannot record twice
  if exists (select 1 from public.duels where couple_id = c and created_at > now() - interval '5 seconds') then
    return (select id from public.duels where couple_id = c order by created_at desc limit 1);
  end if;
  l := case when p_winner is null then null when p_winner = cp.p1 then cp.p2 else cp.p1 end;
  insert into public.duels(couple_id, game, winner, loser, scores, stake, created_by)
  values (c, p_game, p_winner, l, p_scores, nullif(left(trim(coalesce(p_stake, '')), 80), ''), auth.uid())
  returning id into did;
  return did;
end $$;

create or replace function public.duel_board() returns json
language plpgsql stable security definer set search_path = public as $$
declare uid uuid := auth.uid(); c uuid := public.my_couple(); partner uuid := public._partner();
begin
  if c is null then raise exception 'Create or join a jodi first'; end if;
  return json_build_object(
    'me', uid, 'partner', partner,
    'my_wins', (select count(*) from public.duels where couple_id = c and winner = uid),
    'partner_wins', (select count(*) from public.duels where couple_id = c and winner = partner),
    'ties', (select count(*) from public.duels where couple_id = c and winner is null),
    'by_game', coalesce((select json_object_agg(game, json_build_object('me', me, 'partner', pa)) from (
        select game, count(*) filter (where winner = uid) me, count(*) filter (where winner = partner) pa
          from public.duels where couple_id = c group by game) g), '{}'::json),
    'recent', coalesce((select json_agg(r order by r.created_at desc) from (
        select id, game, winner, loser, scores, stake, paid_at, created_at
          from public.duels where couple_id = c order by created_at desc limit 40) r), '[]'::json)
  );
end $$;

create or replace function public.duel_paid(p_id uuid, p_paid boolean default true) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.duels set paid_at = case when p_paid then now() end
   where id = p_id and couple_id = public.my_couple() and stake is not null and loser is not null;
  if not found then raise exception 'Stake not found'; end if;
end $$;

revoke execute on function public.record_duel(text, uuid, jsonb, text), public.duel_board(), public.duel_paid(uuid, boolean) from public, anon;
grant execute on function public.record_duel(text, uuid, jsonb, text), public.duel_board(), public.duel_paid(uuid, boolean) to authenticated;
