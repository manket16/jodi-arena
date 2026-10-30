-- The loser's stake is now spun on the result page, after the game is saved.
-- The host phone calls this once the winner's spin lands; it fills the stake on the couple's latest result.
create or replace function public.set_duel_stake(p_stake text) returns void
language plpgsql security definer set search_path = public as $$
declare c uuid := public.my_couple(); did uuid; s text := nullif(left(trim(coalesce(p_stake, '')), 80), '');
begin
  if c is null then raise exception 'Create or join a jodi first'; end if;
  if s is null then return; end if;
  select id into did from public.duels
   where couple_id = c and loser is not null and stake is null and created_at > now() - interval '30 minutes'
   order by created_at desc limit 1;
  if did is not null then update public.duels set stake = s where id = did; end if;
end $$;
revoke execute on function public.set_duel_stake(text) from public, anon;
grant execute on function public.set_duel_stake(text) to authenticated;
