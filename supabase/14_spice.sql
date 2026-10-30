-- Spice levels, used prompts, and short-lived Kaun Bola clips.
-- Match counts come straight from the duels table, so nothing can drift.

create table if not exists public.couple_progress (
  couple_id uuid primary key references public.couples(id) on delete cascade,
  used_prompts text[] not null default '{}',
  updated_at timestamptz not null default now()
);
alter table public.couple_progress enable row level security;

create or replace function public.get_progress()
returns json language plpgsql stable security definer set search_path = public as $$
declare c uuid := public.my_couple();
begin
  if c is null then return null; end if;
  return json_build_object(
    'total', (select count(*) from public.duels where couple_id = c),
    'by_game', coalesce((select json_object_agg(game, n) from (select game, count(*)::int n from public.duels where couple_id = c group by game) g), '{}'::json),
    'used', coalesce((select to_json(used_prompts) from public.couple_progress where couple_id = c), '[]'::json));
end $$;

create or replace function public.save_used_prompts(p_ids text[], p_reset text default null)
returns void language plpgsql security definer set search_path = public as $$
declare c uuid := public.my_couple(); clean text[];
begin
  if c is null then raise exception 'Create or join a jodi first'; end if;
  select coalesce(array_agg(x), '{}') into clean from (select left(trim(x), 40) x from unnest(coalesce(p_ids, '{}')) x limit 60) q where x <> '';
  insert into public.couple_progress(couple_id, used_prompts) values (c, clean)
  on conflict (couple_id) do update set used_prompts = (
      select coalesce(array_agg(distinct u), '{}') from unnest(
        (case when p_reset is not null then array(select y from unnest(public.couple_progress.used_prompts) y where y not like p_reset || '%')
              else public.couple_progress.used_prompts end) || excluded.used_prompts) u),
    updated_at = now();
end $$;

-- same function, two new games allowed
create or replace function public.record_duel_sync(p_game text, p_winner uuid, p_scores jsonb, p_stake text, p_sync integer default 0)
returns uuid language plpgsql security definer set search_path = public as $$
declare c uuid := public.my_couple(); cp public.couples; did uuid; l uuid; cap int; pts int;
begin
  if c is null then raise exception 'Create or join a jodi first'; end if;
  select * into cp from public.couples where id = c;
  if cp.p2 is null then raise exception 'Your partner needs to join first'; end if;
  if p_game not in ('jhooth','draw','momo','hotseat','slider','bolti','camera','kaunbola') then raise exception 'Unknown game'; end if;
  if p_winner is not null and p_winner not in (cp.p1, cp.p2) then raise exception 'Winner must be one of you'; end if;
  if p_scores is null or jsonb_typeof(p_scores) <> 'object' or octet_length(p_scores::text) > 500 then raise exception 'Bad scores'; end if;
  if exists (select 1 from public.duels where couple_id = c and created_at > now() - interval '5 seconds') then
    return (select id from public.duels where couple_id = c order by created_at desc limit 1);
  end if;
  cap := case p_game when 'jhooth' then 120 when 'draw' then 80 when 'hotseat' then 80 when 'slider' then 150 when 'bolti' then 200 when 'camera' then 60 when 'kaunbola' then 100 else 0 end;
  pts := least(greatest(coalesce(p_sync, 0), 0), cap);
  l := case when p_winner is null then null when p_winner = cp.p1 then cp.p2 else cp.p1 end;
  insert into public.duels(couple_id, game, winner, loser, scores, stake, created_by, sync_points)
  values (c, p_game, p_winner, l, p_scores, nullif(left(trim(coalesce(p_stake, '')), 80), ''), auth.uid(), pts)
  returning id into did;
  return did;
end $$;

-- private bucket for 5-second Kaun Bola clips, one folder per couple
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('clips', 'clips', false, 3145728, array['video/webm','video/mp4','video/quicktime','audio/webm'])
on conflict (id) do nothing;

create policy clips_rw on storage.objects for all to authenticated
  using (bucket_id = 'clips' and (storage.foldername(name))[1] = public.my_couple()::text)
  with check (bucket_id = 'clips' and (storage.foldername(name))[1] = public.my_couple()::text);
