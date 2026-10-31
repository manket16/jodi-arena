-- Dream Scenes: turn a couple photo + a typed scene into a short AI video.
-- The Supabase function make-scene talks to the video provider; the phone only talks to these RPCs.
create table public.scenes (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  created_by uuid not null,
  template text not null check (char_length(template) <= 40),
  prompt text not null check (char_length(prompt) <= 900),
  photo_path text not null,
  status text not null default 'queued' check (status in ('queued','running','done','failed')),
  provider_ref jsonb,
  video_path text,
  error text,
  created_at timestamptz not null default now()
);
create index scenes_couple_idx on public.scenes(couple_id, created_at desc);
alter table public.scenes enable row level security;
revoke all on public.scenes from anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('scenes', 'scenes', false, 62914560, array['image/jpeg','image/png','image/webp','video/mp4'])
on conflict (id) do nothing;
create policy scenes_rw on storage.objects for all to authenticated
  using (bucket_id = 'scenes' and (storage.foldername(name))[1] = public.my_couple()::text)
  with check (bucket_id = 'scenes' and (storage.foldername(name))[1] = public.my_couple()::text);

-- 3 videos per couple per calendar month; failed ones do not count
create or replace function public._scene_limit() returns int language sql immutable as $$ select 3 $$;

create or replace function public.scene_list() returns json
language plpgsql stable security definer set search_path = public as $$
declare c uuid := public.my_couple(); used int;
begin
  if c is null then raise exception 'Create or join a jodi first'; end if;
  select count(*) into used from public.scenes
   where couple_id = c and status <> 'failed' and created_at >= date_trunc('month', now());
  return json_build_object('used', used, 'limit', public._scene_limit(),
    'items', coalesce((select json_agg(json_build_object('id', id, 'template', template, 'prompt', prompt, 'status', status,
                         'video_path', video_path, 'error', error, 'mine', created_by = auth.uid(), 'created_at', created_at) order by created_at desc)
                       from (select * from public.scenes where couple_id = c order by created_at desc limit 30) s), '[]'::json));
end $$;

create or replace function public.scene_create(p_template text, p_prompt text, p_photo_path text) returns uuid
language plpgsql security definer set search_path = public as $$
declare c uuid := public.my_couple(); used int; sid uuid;
begin
  if c is null then raise exception 'Create or join a jodi first'; end if;
  if char_length(trim(coalesce(p_prompt, ''))) < 3 then raise exception 'Describe the scene first'; end if;
  if (storage.foldername(p_photo_path))[1] is distinct from c::text then raise exception 'Bad photo'; end if;
  if exists (select 1 from public.scenes where couple_id = c and status in ('queued','running') and created_at > now() - interval '15 minutes') then
    raise exception 'A video is still being made. Wait for it to finish';
  end if;
  select count(*) into used from public.scenes
   where couple_id = c and status <> 'failed' and created_at >= date_trunc('month', now());
  if used >= public._scene_limit() then raise exception 'You have used all % videos this month', public._scene_limit(); end if;
  insert into public.scenes(couple_id, created_by, template, prompt, photo_path)
  values (c, auth.uid(), left(trim(p_template), 40), left(trim(p_prompt), 900), p_photo_path) returning id into sid;
  return sid;
end $$;

-- the edge function calls this as the signed-in user to prove the scene belongs to their couple
create or replace function public.scene_get(p_id uuid) returns json
language plpgsql stable security definer set search_path = public as $$
begin
  return (select row_to_json(s) from public.scenes s where s.id = p_id and s.couple_id = public.my_couple());
end $$;

create or replace function public.scene_delete(p_id uuid) returns json
language plpgsql security definer set search_path = public as $$
declare r public.scenes;
begin
  delete from public.scenes where id = p_id and couple_id = public.my_couple() returning * into r;
  if not found then raise exception 'Video not found'; end if;
  return json_build_array(r.photo_path, r.video_path);
end $$;

revoke execute on function public.scene_list(), public.scene_create(text, text, text), public.scene_get(uuid), public.scene_delete(uuid) from public, anon;
grant execute on function public.scene_list(), public.scene_create(text, text, text), public.scene_get(uuid), public.scene_delete(uuid) to authenticated;
