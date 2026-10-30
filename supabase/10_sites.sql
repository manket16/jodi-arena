-- Create with AI: couple websites. A couple builds a small website for their partner from a template
-- and a few answers; it gets a public link (/site.html?s=slug) that anyone with the link can open.

create table public.sites (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  created_by uuid not null,
  slug text not null unique check (slug ~ '^[a-z0-9]{8}$'),
  template text not null,
  title text not null check (char_length(title) between 1 and 80),
  data jsonb not null,
  views int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index sites_couple_idx on public.sites(couple_id, updated_at desc);
alter table public.sites enable row level security;
revoke all on public.sites from anon, authenticated;

-- Photos on a website must load for anyone with the link, so they live in a public bucket.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('site-photos', 'site-photos', true, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

create policy "site photo upload own couple" on storage.objects for insert to authenticated
  with check (bucket_id = 'site-photos' and (storage.foldername(name))[1] = public.my_couple()::text);
create policy "site photo delete own couple" on storage.objects for delete to authenticated
  using (bucket_id = 'site-photos' and (storage.foldername(name))[1] = public.my_couple()::text);

create or replace function public._site_templates() returns text[]
language sql immutable as $$
  select array['classic','filmy','stars','scrapbook','envelope','birthday','timeline','proposal','sorry','distance','letter','mixtape']
$$;

create or replace function public.save_site(p_id uuid, p_template text, p_title text, p_data jsonb) returns json
language plpgsql security definer set search_path = public as $$
declare c uuid := public.my_couple(); s public.sites; sl text; tries int := 0;
begin
  if c is null then raise exception 'Create or join a jodi first'; end if;
  if not (p_template = any(public._site_templates())) then raise exception 'Unknown template'; end if;
  p_title := trim(coalesce(p_title, ''));
  if char_length(p_title) < 1 or char_length(p_title) > 80 then raise exception 'Give your website a title (up to 80 characters)'; end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' then raise exception 'Nothing to save'; end if;
  if octet_length(p_data::text) > 60000 then raise exception 'That is too much text for one website. Shorten a few answers'; end if;

  if p_id is not null then
    update public.sites set template = p_template, title = p_title, data = p_data, updated_at = now()
     where id = p_id and couple_id = c returning * into s;
    if s.id is null then raise exception 'Website not found'; end if;
  else
    if (select count(*) from public.sites where couple_id = c) >= 30 then raise exception 'You can keep up to 30 websites. Delete an old one first'; end if;
    loop
      sl := (select string_agg(substr('abcdefghjkmnpqrstuvwxyz23456789', 1 + floor(random() * 31)::int, 1), '')
               from generate_series(1, 8));
      begin
        insert into public.sites(couple_id, created_by, slug, template, title, data)
        values (c, auth.uid(), sl, p_template, p_title, p_data) returning * into s;
        exit;
      exception when unique_violation then
        tries := tries + 1;
        if tries > 5 then raise; end if;
      end;
    end loop;
  end if;
  return json_build_object('id', s.id, 'slug', s.slug);
end $$;

create or replace function public.list_sites() returns json
language plpgsql stable security definer set search_path = public as $$
declare c uuid := public.my_couple();
begin
  if c is null then raise exception 'Create or join a jodi first'; end if;
  return coalesce((select json_agg(r) from (
    select id, slug, template, title, data, views, updated_at, created_by = auth.uid() as mine
      from public.sites where couple_id = c order by updated_at desc) r), '[]'::json);
end $$;

create or replace function public.delete_site(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from public.sites where id = p_id and couple_id = public.my_couple();
  if not found then raise exception 'Website not found'; end if;
end $$;

-- Public: anyone with the link can open a website.
create or replace function public.get_site(p_slug text) returns json
language plpgsql security definer set search_path = public as $$
declare s public.sites;
begin
  if p_slug is null or p_slug !~ '^[a-z0-9]{8}$' then return null; end if;
  update public.sites set views = views + 1 where slug = p_slug returning * into s;
  if s.id is null then return null; end if;
  return json_build_object('template', s.template, 'title', s.title, 'data', s.data);
end $$;

revoke execute on function public.save_site(uuid, text, text, jsonb), public.list_sites(), public.delete_site(uuid),
  public.get_site(text), public._site_templates() from public, anon;
grant execute on function public.save_site(uuid, text, text, jsonb), public.list_sites(), public.delete_site(uuid)
  to authenticated;
grant execute on function public.get_site(text) to anon, authenticated;
