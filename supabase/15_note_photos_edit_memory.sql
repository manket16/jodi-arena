-- Photos on love notes and Open When letters (up to 3, stored in the private 'memories' bucket under the couple's folder),
-- and editing a memory after it has been saved.

alter table public.love_notes add column if not exists photos text[] not null default '{}';
alter table public.love_notes add constraint love_notes_photos_max check (cardinality(photos) <= 3);

-- same rules as send_note, plus photo paths (notes and Open When letters only)
create or replace function public.send_note_v2(p_kind text, p_title text, p_body text, p_emoji text default null,
                                               p_topic text default null, p_deliver_at timestamptz default null,
                                               p_paths text[] default '{}')
returns uuid language plpgsql security definer set search_path = public as $$
declare c uuid := public.my_couple(); partner uuid := public._partner(); nid uuid; pth text;
begin
  if c is null or partner is null then raise exception 'Your partner needs to join first'; end if;
  if p_kind not in ('note', 'quick', 'openwhen', 'jar') then raise exception 'Unknown note type'; end if;
  p_body := trim(coalesce(p_body, ''));
  p_title := nullif(trim(coalesce(p_title, '')), '');
  p_topic := nullif(trim(coalesce(p_topic, '')), '');
  p_paths := coalesce(p_paths, '{}');
  if char_length(p_body) < 1 or char_length(p_body) > 1200 then raise exception 'Write between 1 and 1200 characters'; end if;
  if p_title is not null and char_length(p_title) > 80 then raise exception 'Title is too long'; end if;
  if p_kind = 'openwhen' and p_topic is null then raise exception 'Pick when this letter should be opened'; end if;
  if p_topic is not null and char_length(p_topic) > 40 then raise exception 'That topic is too long'; end if;
  if cardinality(p_paths) > 3 then raise exception 'Up to 3 photos per note'; end if;
  if cardinality(p_paths) > 0 and p_kind not in ('note', 'openwhen') then raise exception 'Photos can only go on notes and letters'; end if;
  foreach pth in array p_paths loop
    if pth not like c::text || '/%' or pth like '%..%' then raise exception 'Invalid photo'; end if;
  end loop;
  if p_deliver_at is not null then
    if p_kind <> 'note' then raise exception 'Only notes can be scheduled'; end if;
    if p_deliver_at <= now() then raise exception 'Pick a time in the future'; end if;
    if p_deliver_at > now() + interval '400 days' then raise exception 'Schedule within the next year'; end if;
  end if;
  if (select count(*) from public.love_notes where from_user = auth.uid() and created_at > now() - interval '1 day') >= 60 then
    raise exception 'That is a lot of love for one day. Try again tomorrow';
  end if;
  insert into public.love_notes(couple_id, from_user, to_user, kind, title, body, emoji, topic, deliver_at, photos)
  values (c, auth.uid(), partner, p_kind, p_title, p_body, nullif(left(coalesce(p_emoji, ''), 8), ''), p_topic, p_deliver_at, p_paths)
  returning id into nid;
  return nid;
end $$;

-- deleting a note hands back its photo paths so the app can remove the files too
create or replace function public.delete_note_v2(p_id uuid) returns text[]
language plpgsql security definer set search_path = public as $$
declare ph text[];
begin
  delete from public.love_notes where id = p_id and from_user = auth.uid() returning photos into ph;
  if not found then raise exception 'Note not found'; end if;
  return coalesce(ph, '{}');
end $$;

-- same as before, now with photos on inbox, sent and the letters you wrote
create or replace function public.love_notes() returns json
language plpgsql stable security definer set search_path = public as $$
declare uid uuid := auth.uid(); c uuid := public.my_couple();
begin
  if c is null then raise exception 'Create or join a jodi first'; end if;
  return json_build_object(
    'partner_name', (select name from public.profiles where id = public._partner()),
    'inbox', coalesce((select json_agg(r order by r.at desc) from (
        select id, kind, title, body, emoji, photos, coalesce(deliver_at, created_at) as at, read_at is null as unread
          from public.love_notes
         where to_user = uid and couple_id = c and kind in ('note', 'quick') and (deliver_at is null or deliver_at <= now())
         order by coalesce(deliver_at, created_at) desc limit 100) r), '[]'::json),
    'sent', coalesce((select json_agg(r order by r.at desc) from (
        select id, kind, title, body, emoji, photos, deliver_at, coalesce(deliver_at, created_at) as at,
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
        select id, topic, title, body, photos, created_at from public.love_notes
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

create or replace function public.open_letter(p_id uuid) returns json
language plpgsql security definer set search_path = public as $$
declare n public.love_notes;
begin
  update public.love_notes set read_at = coalesce(read_at, now())
   where id = p_id and to_user = auth.uid() and kind = 'openwhen' returning * into n;
  if n.id is null then raise exception 'Letter not found'; end if;
  return json_build_object('id', n.id, 'topic', n.topic, 'title', n.title, 'body', n.body, 'photos', n.photos);
end $$;

-- edit a saved memory; p_paths is the full list of photos to keep (old ones you keep plus new uploads)
-- returns the photo paths that were dropped so the app can delete those files
create or replace function public.update_memory(p_id uuid, p_title text, p_caption text, p_date date, p_album text, p_place text, p_paths text[])
returns text[] language plpgsql security definer set search_path = public as $$
declare c uuid := public.my_couple(); old text[]; pth text;
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
  select photos into old from public.memories where id = p_id and couple_id = c for update;
  if not found then raise exception 'Memory not found'; end if;
  update public.memories set title = p_title, caption = nullif(trim(coalesce(p_caption, '')), ''), happened_on = p_date,
         album = nullif(trim(coalesce(p_album, '')), ''), place = nullif(trim(coalesce(p_place, '')), ''), photos = p_paths
   where id = p_id;
  return array(select o from unnest(old) o where o <> all(p_paths));
end $$;

revoke execute on function public.send_note_v2(text, text, text, text, text, timestamptz, text[]), public.delete_note_v2(uuid),
  public.update_memory(uuid, text, text, date, text, text, text[]) from public, anon;
grant execute on function public.send_note_v2(text, text, text, text, text, timestamptz, text[]), public.delete_note_v2(uuid),
  public.update_memory(uuid, text, text, date, text, text, text[]) to authenticated;
