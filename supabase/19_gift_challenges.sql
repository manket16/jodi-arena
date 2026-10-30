-- Gifts v2: Plans (a date with a proposed time the partner can accept), Dares with photo/video proof,
-- and an approve / ask-again step. An approved dare earns the couple Sync points.

-- ---- new kinds and columns ----
alter table public.gift_catalog drop constraint gift_catalog_kind_check;
alter table public.gift_catalog add constraint gift_catalog_kind_check check (kind in ('coupon', 'dare', 'song', 'spark', 'plan'));
alter table public.gifts drop constraint gifts_kind_check;
alter table public.gifts add constraint gifts_kind_check check (kind in ('coupon', 'dare', 'song', 'note', 'spark', 'plan'));

alter table public.gifts
  add column plan_at timestamptz,
  add column plan_reply text check (plan_reply in ('in', 'other')),
  add column plan_reply_note text check (char_length(plan_reply_note) <= 120),
  add column plan_replied_at timestamptz,
  add column status text not null default 'sent' check (status in ('sent', 'proof_sent', 'redo', 'approved')),
  add column proof_path text,
  add column proof_kind text check (proof_kind in ('image', 'video')),
  add column proof_note text check (char_length(proof_note) <= 120),
  add column proof_at timestamptz,
  add column redo_note text check (char_length(redo_note) <= 120),
  add column approved_at timestamptz,
  add column points int not null default 0 check (points between 0 and 100);

insert into public.gift_catalog(kind, emoji, title, body, make_real) values
('plan', '🕯️', 'Candlelight dinner', 'A proper dinner date at a place you choose. Dress up optional, smiling compulsory.', 'date'),
('plan', '🎬', 'Movie date, I book it', 'You pick the film, I book the tickets and carry the popcorn.', 'movie'),
('plan', '🚗', 'Long drive and chai', 'A no-destination drive with your playlist and a chai stop.', null),
('plan', '🥘', 'Street food crawl', 'Panipuri, chaat, momos, whatever you want. All on me.', 'food'),
('plan', '🌅', 'A full day out, no phones', 'A whole day for just the two of us. Phones stay in the bag.', 'date'),
('plan', '🍕', 'Pizza and a film at home', 'You choose the toppings and the movie. I just show up hungry.', 'food'),
('plan', '🧺', 'Picnic in the park', 'Blanket, snacks and no schedule.', 'date'),
('plan', '🍳', 'Cook together night', 'We pick a recipe and make a mess in the kitchen together.', null),
('plan', '🌃', 'Late night walk and ice cream', 'A slow walk and an ice cream, just talking.', 'food');

-- ---- private bucket for dare proofs (photos and short videos) ----
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('proofs', 'proofs', false, 41943040, array['image/jpeg','image/png','image/webp','video/mp4','video/quicktime','video/webm'])
on conflict (id) do nothing;
create policy "proof upload own couple" on storage.objects for insert to authenticated
  with check (bucket_id = 'proofs' and (storage.foldername(name))[1] = public.my_couple()::text);
create policy "proof read own couple" on storage.objects for select to authenticated
  using (bucket_id = 'proofs' and (storage.foldername(name))[1] = public.my_couple()::text);
create policy "proof delete own couple" on storage.objects for delete to authenticated
  using (bucket_id = 'proofs' and (storage.foldername(name))[1] = public.my_couple()::text);

-- ---- catalog: no coupons for now, plans added ----
create or replace function public.gift_catalog() returns json
language sql stable security definer set search_path = public as $$
  select coalesce(json_agg(json_build_object('id', id, 'kind', kind, 'emoji', emoji, 'title', title, 'body', body, 'make_real', make_real)
                           order by kind, id), '[]'::json)
  from public.gift_catalog where kind not in ('spark', 'coupon')
$$;

-- ---- send: plans carry a proposed date and time ----
drop function public.send_gift(text, text, text, text, text);
create or replace function public.send_gift(p_kind text, p_emoji text, p_title text, p_body text, p_make_real text default null, p_plan_at timestamptz default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare c uuid := public.my_couple(); partner uuid := public._partner(); gid uuid;
begin
  if c is null or partner is null then raise exception 'Your partner needs to join first'; end if;
  if p_kind not in ('coupon', 'dare', 'song', 'note', 'plan') then raise exception 'Unknown gift type'; end if;
  p_emoji := left(coalesce(nullif(trim(p_emoji), ''), '🎁'), 8);
  p_title := nullif(trim(coalesce(p_title, '')), '');
  p_body := trim(coalesce(p_body, ''));
  if p_kind = 'note' and p_title is null then p_title := 'A note for you'; end if;
  if p_title is null then raise exception 'Add a title'; end if;
  if char_length(p_title) > 60 then raise exception 'That title is too long'; end if;
  if char_length(p_body) < 1 or char_length(p_body) > 200 then raise exception 'Write between 1 and 200 characters'; end if;
  if p_make_real is not null and p_make_real not in ('food', 'movie', 'date', 'gift') then p_make_real := null; end if;
  if p_kind = 'plan' then
    if p_plan_at is null or p_plan_at < now() then raise exception 'Pick a date and time in the future'; end if;
  else
    p_plan_at := null;
  end if;
  if (select count(*) from public.gifts where from_user = auth.uid() and created_at > now() - interval '1 day') >= 30 then
    raise exception 'That is a lot of surprises for one day. Try again tomorrow';
  end if;
  insert into public.gifts(couple_id, from_user, to_user, kind, emoji, title, body, make_real, plan_at)
  values (c, auth.uid(), partner, p_kind, p_emoji, p_title, p_body, p_make_real, p_plan_at) returning id into gid;
  return gid;
end $$;

-- ---- receiver: attach proof of a dare ----
create or replace function public.submit_proof(p_id uuid, p_path text, p_kind text, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare c uuid := public.my_couple();
begin
  if c is null then raise exception 'Set up your jodi first'; end if;
  if p_kind not in ('image', 'video') then raise exception 'Add a photo or a video'; end if;
  if p_path is null or p_path not like c::text || '/%' or p_path like '%..%' or char_length(p_path) > 200 then raise exception 'Invalid file'; end if;
  p_note := left(nullif(trim(coalesce(p_note, '')), ''), 120);
  update public.gifts set status = 'proof_sent', proof_path = p_path, proof_kind = p_kind, proof_note = p_note, proof_at = now()
  where id = p_id and to_user = auth.uid() and kind = 'dare' and opened_at is not null and status in ('sent', 'redo');
  if not found then raise exception 'That challenge is not open'; end if;
end $$;

-- ---- sender: approve (couple earns points) or ask for another try ----
create or replace function public.approve_dare(p_id uuid) returns int
language plpgsql security definer set search_path = public as $$
declare pts constant int := 50;
begin
  update public.gifts set status = 'approved', approved_at = now(), points = pts, sender_seen_at = now()
  where id = p_id and from_user = auth.uid() and kind = 'dare' and status = 'proof_sent';
  if not found then raise exception 'Nothing to approve'; end if;
  return pts;
end $$;

create or replace function public.redo_dare(p_id uuid, p_note text default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  p_note := left(nullif(trim(coalesce(p_note, '')), ''), 120);
  update public.gifts set status = 'redo', redo_note = p_note, sender_seen_at = now()
  where id = p_id and from_user = auth.uid() and kind = 'dare' and status = 'proof_sent';
  if not found then raise exception 'Nothing to send back'; end if;
end $$;

-- ---- receiver: answer a plan ----
create or replace function public.reply_plan(p_id uuid, p_reply text, p_note text default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_reply not in ('in', 'other') then raise exception 'Pick an answer'; end if;
  p_note := left(nullif(trim(coalesce(p_note, '')), ''), 120);
  update public.gifts set plan_reply = p_reply, plan_reply_note = p_note, plan_replied_at = now()
  where id = p_id and to_user = auth.uid() and kind = 'plan' and opened_at is not null;
  if not found then raise exception 'That plan is not here'; end if;
end $$;

-- ---- what the receiver sees when opening a gift ----
create or replace function public._gift_json(g public.gifts) returns json
language sql stable security definer set search_path = public as $$
  select json_build_object('id', g.id, 'kind', g.kind, 'emoji', g.emoji, 'title', g.title, 'body', g.body, 'make_real', g.make_real,
                           'from_system', g.from_user is null, 'reaction', g.reaction, 'redeemed', g.redeemed_at is not null,
                           'plan_at', g.plan_at, 'plan_reply', g.plan_reply, 'status', g.status, 'redo_note', g.redo_note)
$$;

-- ---- the box: unopened gifts, history, challenges to do, plans to answer ----
create or replace function public.gift_box() returns json
language plpgsql stable security definer set search_path = public as $$
declare uid uuid := auth.uid(); c uuid := public.my_couple();
begin
  if c is null then return null; end if;
  return json_build_object(
    'has_partner', public._partner() is not null,
    'unopened', (select coalesce(json_agg(json_build_object('id', id, 'created_at', created_at) order by created_at desc), '[]'::json)
                 from (select id, created_at from public.gifts where to_user = uid and opened_at is null order by created_at desc limit 20) g),
    'free_available', not exists (select 1 from public.gift_free_claims where user_id = uid and day = public.today_ist()),
    'events', (select coalesce(json_agg(json_build_object('id', id) order by at desc), '[]'::json)
               from (select *, greatest(coalesce(opened_at, '-infinity'), coalesce(reacted_at, '-infinity'), coalesce(redeemed_at, '-infinity'),
                                        coalesce(proof_at, '-infinity'), coalesce(plan_replied_at, '-infinity')) as at
                     from public.gifts where from_user = uid) s
               where s.at > coalesce(s.sender_seen_at, '-infinity') and s.at > '-infinity'),
    'badge', (select count(*) from (select *, greatest(coalesce(opened_at, '-infinity'), coalesce(reacted_at, '-infinity'), coalesce(redeemed_at, '-infinity'),
                                        coalesce(proof_at, '-infinity'), coalesce(plan_replied_at, '-infinity')) as at
                     from public.gifts where from_user = uid) s
              where (s.at > coalesce(s.sender_seen_at, '-infinity') and s.at > '-infinity') or s.status = 'proof_sent'),
    'sent', (select coalesce(json_agg(json_build_object('id', id, 'kind', kind, 'emoji', emoji, 'title', title, 'body', body, 'created_at', created_at,
                                                       'opened_at', opened_at, 'reaction', reaction, 'redeemed_at', redeemed_at,
                                                       'plan_at', plan_at, 'plan_reply', plan_reply, 'plan_reply_note', plan_reply_note,
                                                       'make_real', make_real, 'status', status, 'proof_path', proof_path, 'proof_kind', proof_kind,
                                                       'proof_note', proof_note, 'redo_note', redo_note, 'points', points) order by (status = 'proof_sent') desc, created_at desc), '[]'::json)
             from (select * from public.gifts where from_user = uid order by created_at desc limit 30) t),
    'challenges', (select coalesce(json_agg(json_build_object('id', id, 'emoji', emoji, 'title', title, 'body', body, 'status', status,
                                                             'redo_note', redo_note, 'points', points) order by created_at desc), '[]'::json)
                   from (select * from public.gifts where to_user = uid and kind = 'dare' and opened_at is not null
                           and (status <> 'approved' or approved_at > now() - interval '1 day') order by created_at desc limit 10) ch),
    'plans', (select coalesce(json_agg(json_build_object('id', id, 'emoji', emoji, 'title', title, 'body', body, 'plan_at', plan_at, 'make_real', make_real) order by plan_at), '[]'::json)
              from (select * from public.gifts where to_user = uid and kind = 'plan' and opened_at is not null and plan_reply is null
                      and plan_at > now() - interval '1 day' order by plan_at limit 10) pl),
    'wallet', (select coalesce(json_agg(json_build_object('id', id, 'emoji', emoji, 'title', title, 'body', body, 'make_real', make_real) order by opened_at desc), '[]'::json)
               from (select * from public.gifts where to_user = uid and kind = 'coupon' and opened_at is not null and redeemed_at is null
                     order by opened_at desc limit 30) w));
end $$;

create or replace function public.mark_gifts_seen() returns void
language sql security definer set search_path = public as $$
  update public.gifts set sender_seen_at = now()
  where from_user = auth.uid()
    and greatest(coalesce(opened_at, '-infinity'), coalesce(reacted_at, '-infinity'), coalesce(redeemed_at, '-infinity'),
                 coalesce(proof_at, '-infinity'), coalesce(plan_replied_at, '-infinity')) > coalesce(sender_seen_at, '-infinity')
$$;

-- ---- approved dares count towards the couple's Sync points ----
create or replace function public.sync_board() returns json
language plpgsql stable security definer set search_path = public as $$
declare c uuid := public.my_couple(); mine json;
begin
  if c is null then raise exception 'Create or join a jodi first'; end if;
  select row_to_json(m) into mine from (
    select pts as points, games, rank from (
      select cp.id, x.p::int pts, g.n games, rank() over (order by x.p desc)::int rank
        from public.couples cp
        cross join lateral (select coalesce((select sum(sync_points) from public.duels where couple_id = cp.id), 0)
                                 + coalesce((select sum(points) from public.gifts where couple_id = cp.id), 0) p) x
        cross join lateral (select count(*)::int n from public.duels where couple_id = cp.id) g
       where cp.p2 is not null) t where t.id = c) m;
  return json_build_object(
    'mine', mine,
    'top', coalesce((select json_agg(r order by r.points desc, r.name) from (
      select cp.name, cp.badge, x.p::int points, g.n games, rank() over (order by x.p desc)::int rank, cp.id = c as me
        from public.couples cp
        cross join lateral (select coalesce((select sum(sync_points) from public.duels where couple_id = cp.id), 0)
                                 + coalesce((select sum(points) from public.gifts where couple_id = cp.id), 0) p) x
        cross join lateral (select count(*)::int n from public.duels where couple_id = cp.id) g
       where cp.p2 is not null and x.p > 0
       order by points desc, cp.name limit 50) r), '[]'::json));
end $$;

revoke execute on function public.send_gift(text, text, text, text, text, timestamptz), public.submit_proof(uuid, text, text, text),
  public.approve_dare(uuid), public.redo_dare(uuid, text), public.reply_plan(uuid, text, text), public.gift_box(), public.gift_catalog(),
  public._gift_json(public.gifts), public.mark_gifts_seen(), public.sync_board() from public, anon;
grant execute on function public.send_gift(text, text, text, text, text, timestamptz), public.submit_proof(uuid, text, text, text),
  public.approve_dare(uuid), public.redo_dare(uuid, text), public.reply_plan(uuid, text, text), public.gift_box(), public.gift_catalog(),
  public.mark_gifts_seen(), public.sync_board() to authenticated;
