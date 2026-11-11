-- Jodi DNA: a few taps about the couple (cities, how you met, shared obsession, vibe).
-- Used only to rename and re-theme the games for that couple. Game rules and scoring never change.
alter table public.couples add column if not exists dna jsonb;

create or replace function public.get_couple_dna()
returns jsonb language sql stable security definer set search_path = public as $$
  select c.dna from public.couples c where c.id = public.my_couple()
$$;

create or replace function public.set_couple_dna(p_dna jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare c uuid := public.my_couple(); d jsonb := '{}'::jsonb;
begin
  if c is null then raise exception 'Set up your jodi first'; end if;
  if p_dna is null or jsonb_typeof(p_dna) <> 'object' then raise exception 'Bad DNA'; end if;
  if coalesce(p_dna->>'met', '') in ('college', 'office', 'app', 'family', 'school') then d := d || jsonb_build_object('met', p_dna->>'met'); end if;
  if coalesce(p_dna->>'obs', '') in ('food', 'movies', 'hills', 'cricket', 'gym') then d := d || jsonb_build_object('obs', p_dna->>'obs'); end if;
  if coalesce(p_dna->>'vibe', '') in ('filmy', 'roast', 'clingy', 'rebels') then d := d || jsonb_build_object('vibe', p_dna->>'vibe'); end if;
  if nullif(trim(coalesce(p_dna->>'cityA', '')), '') is not null then d := d || jsonb_build_object('cityA', left(trim(p_dna->>'cityA'), 24)); end if;
  if nullif(trim(coalesce(p_dna->>'cityB', '')), '') is not null then d := d || jsonb_build_object('cityB', left(trim(p_dna->>'cityB'), 24)); end if;
  update public.couples set dna = d where id = c;
end $$;

revoke all on function public.get_couple_dna() from public, anon;
revoke all on function public.set_couple_dna(jsonb) from public, anon;
grant execute on function public.get_couple_dna() to authenticated;
grant execute on function public.set_couple_dna(jsonb) to authenticated;
