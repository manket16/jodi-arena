-- Home hub: Memories (photo timeline), Love Notes (quick notes, open-when letters, scheduled notes, jar)
-- and the daily quota for Create with AI.

-- ---------- Memories ----------
create table public.memories (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  by_user uuid not null,
  title text not null check (char_length(title) between 1 and 80),
  caption text check (char_length(caption) <= 600),
  happened_on date not null,
  album text check (char_length(album) <= 40),
  place text check (char_length(place) <= 60),
  photos text[] not null default '{}' check (cardinality(photos) <= 6),
  fav boolean not null default false,
  created_at timestamptz not null default now()
);
create index memories_couple_idx on public.memories(couple_id, happened_on desc);
alter table public.memories enable row level security;
revoke all on public.memories from anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('memories', 'memories', false, 6291456, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

create policy "memory upload own couple" on storage.objects for insert to authenticated
  with check (bucket_id = 'memories' and (storage.foldername(name))[1] = public.my_couple()::text);
create policy "memory read own couple" on storage.objects for select to authenticated
  using (bucket_id = 'memories' and (storage.foldername(name))[1] = public.my_couple()::text);
create policy "memory delete own couple" on storage.objects for delete to authenticated
  using (bucket_id = 'memories' and (storage.foldername(name))[1] = public.my_couple()::text);

create or replace function public.add_memory(p_title text, p_caption text, p_date date, p_album text, p_place text, p_paths text[])
returns uuid language plpgsql security definer set search_path = public as $$
declare c uuid := public.my_couple(); mid uuid; pth text;
begin
  if c is null then raise exception 'Create or join a jodi first'; end if;
  p_title := trim(coalesce(p_title, ''));
  if char_length(p_title) < 1 or char_length(p_title) > 80 then raise exception 'Give this memory a title (up to 80 characters)'; end if;
  if p_date is null or p_date > (now() at time zone 'Asia/Kolkata')::date + 1 then raise exception 'Pick the date this happened'; end if;
  p_paths := coalesce(p_paths, '{}');
  if cardinality(p_paths) > 6 then raise exception 'Up to 6 photos per memory'; end if;
  foreach pth in array p_paths loop
    if pth not like c::text || '/%' or pth like '%..%' then raise exception 'Invalid photo'; end if;
  end loop;
  if (select count(*) from public.memories where couple_id = c) >= 500 then raise exception 'Memory limit reached'; end if;
  insert into public.memories(couple_id, by_user, title, caption, happened_on, album, place, photos)
  values (c, auth.uid(), p_title, nullif(trim(coalesce(p_caption, '')), ''), p_date,
          nullif(trim(coalesce(p_album, '')), ''), nullif(trim(coalesce(p_place, '')), ''), p_paths)
  returning id into mid;
  return mid;
end $$;

create or replace function public.list_memories() returns json
language plpgsql stable security definer set search_path = public as $$
declare c uuid := public.my_couple();
begin
  if c is null then raise exception 'Create or join a jodi first'; end if;
  return coalesce((select json_agg(r) from (
    select m.id, m.title, m.caption, m.happened_on, m.album, m.place, m.photos, m.fav,
           m.by_user = auth.uid() as mine, (select name from public.profiles where id = m.by_user) as by_name
      from public.memories m where m.couple_id = c
     order by m.happened_on desc, m.created_at desc limit 500) r), '[]'::json);
end $$;

create or replace function public.toggle_memory_fav(p_id uuid) returns boolean
language plpgsql security definer set search_path = public as $$
declare v boolean;
begin
  update public.memories set fav = not fav where id = p_id and couple_id = public.my_couple() returning fav into v;
  if v is null then raise exception 'Memory not found'; end if;
  return v;
end $$;

create or replace function public.delete_memory(p_id uuid) returns text[]
language plpgsql security definer set search_path = public as $$
declare ph text[];
begin
  delete from public.memories where id = p_id and couple_id = public.my_couple() returning photos into ph;
  if ph is null then raise exception 'Memory not found'; end if;
  return ph;
end $$;

-- ---------- Love Notes ----------
create table public.love_notes (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  from_user uuid not null,
  to_user uuid not null,
  kind text not null check (kind in ('note', 'quick', 'openwhen', 'jar')),
  title text check (char_length(title) <= 80),
  body text not null check (char_length(body) between 1 and 1200),
  emoji text check (char_length(emoji) <= 8),
  topic text check (char_length(topic) <= 40),
  deliver_at timestamptz,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index love_notes_to_idx on public.love_notes(to_user, kind);
create index love_notes_from_idx on public.love_notes(from_user, created_at desc);
alter table public.love_notes enable row level security;
revoke all on public.love_notes from anon, authenticated;

create or replace function public._partner() returns uuid
language sql stable security definer set search_path = public as $$
  select case when c.p1 = auth.uid() then c.p2 else c.p1 end from public.couples c where c.id = public.my_couple()
$$;

create or replace function public.send_note(p_kind text, p_title text, p_body text, p_emoji text default null,
                                            p_topic text default null, p_deliver_at timestamptz default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare c uuid := public.my_couple(); partner uuid := public._partner(); nid uuid;
begin
  if c is null or partner is null then raise exception 'Your partner needs to join first'; end if;
  if p_kind not in ('note', 'quick', 'openwhen', 'jar') then raise exception 'Unknown note type'; end if;
  p_body := trim(coalesce(p_body, ''));
  p_title := nullif(trim(coalesce(p_title, '')), '');
  p_topic := nullif(trim(coalesce(p_topic, '')), '');
  if char_length(p_body) < 1 or char_length(p_body) > 1200 then raise exception 'Write between 1 and 1200 characters'; end if;
  if p_title is not null and char_length(p_title) > 80 then raise exception 'Title is too long'; end if;
  if p_kind = 'openwhen' and p_topic is null then raise exception 'Pick when this letter should be opened'; end if;
  if p_topic is not null and char_length(p_topic) > 40 then raise exception 'That topic is too long'; end if;
  if p_deliver_at is not null then
    if p_kind <> 'note' then raise exception 'Only notes can be scheduled'; end if;
    if p_deliver_at <= now() then raise exception 'Pick a time in the future'; end if;
    if p_deliver_at > now() + interval '400 days' then raise exception 'Schedule within the next year'; end if;
  end if;
  if (select count(*) from public.love_notes where from_user = auth.uid() and created_at > now() - interval '1 day') >= 60 then
    raise exception 'That is a lot of love for one day. Try again tomorrow';
  end if;
  insert into public.love_notes(couple_id, from_user, to_user, kind, title, body, emoji, topic, deliver_at)
  values (c, auth.uid(), partner, p_kind, p_title, p_body, nullif(left(coalesce(p_emoji, ''), 8), ''), p_topic, p_deliver_at)
  returning id into nid;
  return nid;
end $$;

create or replace function public.love_notes() returns json
language plpgsql stable security definer set search_path = public as $$
declare uid uuid := auth.uid(); c uuid := public.my_couple();
begin
  if c is null then raise exception 'Create or join a jodi first'; end if;
  return json_build_object(
    'partner_name', (select name from public.profiles where id = public._partner()),
    'inbox', coalesce((select json_agg(r order by r.at desc) from (
        select id, kind, title, body, emoji, coalesce(deliver_at, created_at) as at, read_at is null as unread
          from public.love_notes
         where to_user = uid and couple_id = c and kind in ('note', 'quick') and (deliver_at is null or deliver_at <= now())
         order by coalesce(deliver_at, created_at) desc limit 100) r), '[]'::json),
    'sent', coalesce((select json_agg(r order by r.at desc) from (
        select id, kind, title, body, emoji, deliver_at, coalesce(deliver_at, created_at) as at,
               read_at is not null as seen, coalesce(deliver_at > now(), false) as pending
          from public.love_notes
         where from_user = uid and couple_id = c and kind in ('note', 'quick')
         order by coalesce(deliver_at, created_at) desc limit 100) r), '[]'::json),
    'incoming_scheduled', coalesce((select json_agg(r order by r.deliver_at) from (
        select id, deliver_at from public.love_notes
         where to_user = uid and couple_id = c and kind = 'note' and deliver_at > now()) r), '[]'::json),
    'openwhen_in', coalesce((select json_agg(r order by r.created_at) from (
        select id, topic, read_at is not null as opened, case when read_at is not null then title end as title, created_at
          from public.love_notes where to_user = uid and couple_id = c and kind = 'openwhen') r), '[]'::json),
    'openwhen_out', coalesce((select json_agg(r order by r.created_at) from (
        select id, topic, title, body, created_at from public.love_notes
         where from_user = uid and couple_id = c and kind = 'openwhen') r), '[]'::json),
    'jar_left', (select count(*) from public.love_notes where to_user = uid and couple_id = c and kind = 'jar' and read_at is null),
    'jar_pulled', coalesce((select json_agg(r order by r.read_at desc) from (
        select id, body, read_at from public.love_notes
         where to_user = uid and couple_id = c and kind = 'jar' and read_at is not null) r), '[]'::json),
    'jar_out', coalesce((select json_agg(r order by r.created_at desc) from (
        select id, body, created_at from public.love_notes
         where from_user = uid and couple_id = c and kind = 'jar') r), '[]'::json)
  );
end $$;

create or replace function public.mark_note_read(p_id uuid) returns void
language sql security definer set search_path = public as $$
  update public.love_notes set read_at = coalesce(read_at, now())
   where id = p_id and to_user = auth.uid() and kind in ('note', 'quick') and (deliver_at is null or deliver_at <= now())
$$;

create or replace function public.open_letter(p_id uuid) returns json
language plpgsql security definer set search_path = public as $$
declare n public.love_notes;
begin
  update public.love_notes set read_at = coalesce(read_at, now())
   where id = p_id and to_user = auth.uid() and kind = 'openwhen' returning * into n;
  if n.id is null then raise exception 'Letter not found'; end if;
  return json_build_object('id', n.id, 'topic', n.topic, 'title', n.title, 'body', n.body);
end $$;

create or replace function public.pull_jar() returns json
language plpgsql security definer set search_path = public as $$
declare n public.love_notes; fresh boolean;
begin
  select * into n from public.love_notes
   where to_user = auth.uid() and kind = 'jar' and couple_id = public.my_couple()
   order by (read_at is null) desc, random() limit 1;
  if n.id is null then return null; end if;
  fresh := n.read_at is null;
  if fresh then update public.love_notes set read_at = now() where id = n.id; end if;
  return json_build_object('id', n.id, 'body', n.body, 'fresh', fresh,
    'left', (select count(*) from public.love_notes where to_user = auth.uid() and kind = 'jar' and read_at is null));
end $$;

create or replace function public.delete_note(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from public.love_notes where id = p_id and from_user = auth.uid();
  if not found then raise exception 'Note not found'; end if;
end $$;

-- ---------- Create with AI quota ----------
create table public.ai_usage (
  couple_id uuid not null references public.couples(id) on delete cascade,
  day date not null,
  n int not null default 0,
  primary key (couple_id, day)
);
alter table public.ai_usage enable row level security;
revoke all on public.ai_usage from anon, authenticated;

create or replace function public.ai_quota_take(p_limit int default 25) returns json
language plpgsql security definer set search_path = public as $$
declare c uuid := public.my_couple(); used int;
begin
  if c is null then raise exception 'Create or join a jodi first'; end if;
  if public.couple_has_guest(c) then raise exception 'Save your account (Me tab) to use Create with AI'; end if;
  insert into public.ai_usage(couple_id, day, n) values (c, public.today_ist(), 1)
  on conflict (couple_id, day) do update set n = public.ai_usage.n + 1 where public.ai_usage.n < p_limit
  returning n into used;
  if used is null then raise exception 'You used all % AI creations for today. Come back tomorrow', p_limit; end if;
  return json_build_object('used', used, 'left', p_limit - used,
    'me', (select name from public.profiles where id = auth.uid()),
    'partner', (select name from public.profiles where id = public._partner()),
    'jodi', (select name from public.couples where id = c));
end $$;

-- ---------- hub badges ----------
create or replace function public.hub_counts() returns json
language plpgsql stable security definer set search_path = public as $$
declare uid uuid := auth.uid(); c uuid := public.my_couple(); d date := (now() at time zone 'Asia/Kolkata')::date;
begin
  if c is null then return null; end if;
  return json_build_object(
    'unread_notes', (select count(*) from public.love_notes where to_user = uid and kind in ('note', 'quick')
                       and read_at is null and (deliver_at is null or deliver_at <= now())),
    'letters', (select count(*) from public.love_notes where to_user = uid and kind = 'openwhen' and read_at is null),
    'jar_left', (select count(*) from public.love_notes where to_user = uid and kind = 'jar' and read_at is null),
    'memories', (select count(*) from public.memories where couple_id = c),
    'on_this_day', (select count(*) from public.memories where couple_id = c
                      and extract(month from happened_on) = extract(month from d)
                      and extract(day from happened_on) = extract(day from d)
                      and extract(year from happened_on) < extract(year from d)),
    'ai_left', 25 - coalesce((select n from public.ai_usage where couple_id = c and day = public.today_ist()), 0));
end $$;

-- ---------- permissions ----------
revoke execute on function public.add_memory(text, text, date, text, text, text[]), public.list_memories(),
  public.toggle_memory_fav(uuid), public.delete_memory(uuid), public._partner(),
  public.send_note(text, text, text, text, text, timestamptz), public.love_notes(), public.mark_note_read(uuid),
  public.open_letter(uuid), public.pull_jar(), public.delete_note(uuid), public.ai_quota_take(int), public.hub_counts()
  from public, anon;
grant execute on function public.add_memory(text, text, date, text, text, text[]), public.list_memories(),
  public.toggle_memory_fav(uuid), public.delete_memory(uuid),
  public.send_note(text, text, text, text, text, timestamptz), public.love_notes(), public.mark_note_read(uuid),
  public.open_letter(uuid), public.pull_jar(), public.delete_note(uuid), public.ai_quota_take(int), public.hub_counts()
  to authenticated;
