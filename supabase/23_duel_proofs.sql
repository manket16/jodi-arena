-- Stake proofs: the loser can attach a photo or short video once they have done the stake.
-- Reuses the private 'proofs' bucket (files live under <couple_id>/...). Purely additive.
alter table public.duels
  add column if not exists proof_path text,
  add column if not exists proof_kind text check (proof_kind in ('image', 'video')),
  add column if not exists proof_note text,
  add column if not exists proof_at timestamptz;

-- the loser attaches proof of a stake
create or replace function public.duel_submit_proof(p_id uuid, p_path text, p_kind text, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare c uuid := public.my_couple();
begin
  if c is null then raise exception 'Set up your jodi first'; end if;
  if p_kind not in ('image', 'video') then raise exception 'Add a photo or a video'; end if;
  if p_path is null or p_path not like c::text || '/%' or p_path like '%..%' or char_length(p_path) > 200 then raise exception 'Invalid file'; end if;
  p_note := left(nullif(trim(coalesce(p_note, '')), ''), 120);
  update public.duels set proof_path = p_path, proof_kind = p_kind, proof_note = p_note, proof_at = now()
   where id = p_id and couple_id = c and loser = auth.uid() and stake is not null and paid_at is null;
  if not found then raise exception 'That stake is not open'; end if;
end $$;

-- same board as before, plus the proof fields on each recent duel
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
        select id, game, winner, loser, scores, stake, paid_at, created_at, proof_path, proof_kind, proof_note, proof_at
          from public.duels where couple_id = c order by created_at desc limit 40) r), '[]'::json)
  );
end $$;

revoke execute on function public.duel_submit_proof(uuid, text, text, text) from public, anon;
grant execute on function public.duel_submit_proof(uuid, text, text, text) to authenticated;
