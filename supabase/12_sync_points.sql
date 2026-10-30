-- Sync points: a couple earns points whenever one partner correctly reads the other (right call in
-- Jhooth Pakdo, guessed drawing, bullseye rating, and so on). Points belong to the couple and rank
-- couples on the Sync leaderboard.

alter table public.duels add column sync_points int not null default 0 check (sync_points between 0 and 300);
create index duels_sync_idx on public.duels(couple_id) where sync_points > 0;

create or replace function public.record_duel_sync(p_game text, p_winner uuid, p_scores jsonb, p_stake text, p_sync int default 0)
returns uuid language plpgsql security definer set search_path = public as $$
declare c uuid := public.my_couple(); cp public.couples; did uuid; l uuid; cap int; pts int;
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
  -- the most a single game of each kind can honestly give; anything above is trimmed
  cap := case p_game when 'jhooth' then 120 when 'draw' then 80 when 'hotseat' then 80 when 'slider' then 150 when 'bolti' then 200 else 0 end;
  pts := least(greatest(coalesce(p_sync, 0), 0), cap);
  l := case when p_winner is null then null when p_winner = cp.p1 then cp.p2 else cp.p1 end;
  insert into public.duels(couple_id, game, winner, loser, scores, stake, created_by, sync_points)
  values (c, p_game, p_winner, l, p_scores, nullif(left(trim(coalesce(p_stake, '')), 80), ''), auth.uid(), pts)
  returning id into did;
  return did;
end $$;

-- The leaderboard: every couple with points, best first, plus where my couple stands.
create or replace function public.sync_board() returns json
language plpgsql stable security definer set search_path = public as $$
declare c uuid := public.my_couple(); mine json;
begin
  if c is null then raise exception 'Create or join a jodi first'; end if;
  select row_to_json(m) into mine from (
    select pts as points, games, rank from (
      select cp.id, coalesce(sum(d.sync_points), 0)::int pts, count(d.id)::int games,
             rank() over (order by coalesce(sum(d.sync_points), 0) desc)::int rank
        from public.couples cp left join public.duels d on d.couple_id = cp.id
       where cp.p2 is not null group by cp.id) t where t.id = c) m;
  return json_build_object(
    'mine', mine,
    'top', coalesce((select json_agg(r order by r.points desc, r.name) from (
      select cp.name, cp.badge, coalesce(sum(d.sync_points), 0)::int points, count(d.id)::int games,
             rank() over (order by coalesce(sum(d.sync_points), 0) desc)::int rank, cp.id = c as me
        from public.couples cp join public.duels d on d.couple_id = cp.id
       where cp.p2 is not null
       group by cp.id having coalesce(sum(d.sync_points), 0) > 0
       order by points desc, cp.name limit 50) r), '[]'::json));
end $$;

revoke execute on function public.record_duel_sync(text, uuid, jsonb, text, int), public.sync_board() from public, anon;
grant execute on function public.record_duel_sync(text, uuid, jsonb, text, int), public.sync_board() to authenticated;
