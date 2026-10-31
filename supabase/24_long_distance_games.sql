-- Three new long-distance games: Quick Quiz ('quiz'), Photo Hunt ('scavenger') and Listen Together ('listen').
-- The duels table and record_duel_sync only knew the older games, so allow the new names and set Sync-point caps.
-- Additive: nothing is removed, old results keep working.
alter table public.duels drop constraint if exists duels_game_check;
alter table public.duels add constraint duels_game_check
  check (game = any (array['jhooth','draw','momo','hotseat','slider','bolti','camera','kaunbola','quiz','scavenger','listen']));

create or replace function public.record_duel_sync(p_game text, p_winner uuid, p_scores jsonb, p_stake text, p_sync integer default 0)
returns uuid language plpgsql security definer set search_path = public as $$
declare c uuid := public.my_couple(); cp public.couples; did uuid; l uuid; cap int; pts int;
begin
  if c is null then raise exception 'Create or join a jodi first'; end if;
  select * into cp from public.couples where id = c;
  if cp.p2 is null then raise exception 'Your partner needs to join first'; end if;
  if p_game not in ('jhooth','draw','momo','hotseat','slider','bolti','camera','kaunbola','quiz','scavenger','listen') then raise exception 'Unknown game'; end if;
  if p_winner is not null and p_winner not in (cp.p1, cp.p2) then raise exception 'Winner must be one of you'; end if;
  if p_scores is null or jsonb_typeof(p_scores) <> 'object' or octet_length(p_scores::text) > 500 then raise exception 'Bad scores'; end if;
  if exists (select 1 from public.duels where couple_id = c and created_at > now() - interval '5 seconds') then
    return (select id from public.duels where couple_id = c order by created_at desc limit 1);
  end if;
  cap := case p_game when 'jhooth' then 120 when 'draw' then 80 when 'hotseat' then 80 when 'slider' then 150 when 'bolti' then 200 when 'camera' then 60 when 'kaunbola' then 100 when 'scavenger' then 60 when 'listen' then 60 else 0 end;
  pts := least(greatest(coalesce(p_sync, 0), 0), cap);
  l := case when p_winner is null then null when p_winner = cp.p1 then cp.p2 else cp.p1 end;
  insert into public.duels(couple_id, game, winner, loser, scores, stake, created_by, sync_points)
  values (c, p_game, p_winner, l, p_scores, nullif(left(trim(coalesce(p_stake, '')), 80), ''), auth.uid(), pts)
  returning id into did;
  return did;
end $$;
