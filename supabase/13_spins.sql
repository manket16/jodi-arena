-- Personal spins: each couple writes its own 8 "Loser has to..." options. Both partners share one set.
create table public.couple_spins (
  couple_id uuid primary key references public.couples(id) on delete cascade,
  items text[] not null check (array_length(items, 1) = 8),
  updated_by uuid not null,
  updated_at timestamptz not null default now()
);
alter table public.couple_spins enable row level security;
revoke all on public.couple_spins from anon, authenticated;

create or replace function public.get_spins() returns json
language plpgsql stable security definer set search_path = public as $$
declare c uuid := public.my_couple();
begin
  if c is null then return null; end if;
  return (select to_json(items) from public.couple_spins where couple_id = c);
end $$;

create or replace function public.save_spins(p_items text[]) returns json
language plpgsql security definer set search_path = public as $$
declare c uuid := public.my_couple(); clean text[] := '{}'; t text;
begin
  if c is null then raise exception 'Create or join a jodi first'; end if;
  if p_items is null or coalesce(array_length(p_items, 1), 0) <> 8 then raise exception 'Fill all 8 spins'; end if;
  foreach t in array p_items loop
    t := left(trim(coalesce(t, '')), 60);
    if char_length(t) < 2 then raise exception 'Every spin needs a few words'; end if;
    clean := clean || t;
  end loop;
  insert into public.couple_spins(couple_id, items, updated_by) values (c, clean, auth.uid())
  on conflict (couple_id) do update set items = excluded.items, updated_by = excluded.updated_by, updated_at = now();
  return to_json(clean);
end $$;

revoke execute on function public.get_spins(), public.save_spins(text[]) from public, anon;
grant execute on function public.get_spins(), public.save_spins(text[]) to authenticated;
