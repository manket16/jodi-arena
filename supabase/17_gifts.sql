-- Jodi Arena: the surprise gift box.
-- A partner sends a coupon, dare, song dedication or note. The receiver sees only a wrapped box
-- until they open it. The sender then sees the open, the reaction and the redemption.
-- On days with nothing waiting, the app leaves a free "spark" box.

create table public.gift_catalog (
  id serial primary key,
  kind text not null check (kind in ('coupon', 'dare', 'song', 'spark')),
  emoji text not null,
  title text not null,
  body text not null,
  make_real text check (make_real in ('food', 'movie', 'date', 'gift'))
);
alter table public.gift_catalog enable row level security;
revoke all on public.gift_catalog from anon, authenticated;

create table public.gifts (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  from_user uuid,                       -- null = a free box from the app
  to_user uuid not null,
  kind text not null check (kind in ('coupon', 'dare', 'song', 'note', 'spark')),
  emoji text not null check (char_length(emoji) between 1 and 8),
  title text not null check (char_length(title) between 1 and 60),
  body text not null check (char_length(body) between 1 and 200),
  make_real text check (make_real in ('food', 'movie', 'date', 'gift')),
  created_at timestamptz not null default now(),
  opened_at timestamptz,
  reaction text check (reaction in ('😂', '😍', '🥹', '😈', '🔥', '❤️')),
  reacted_at timestamptz,
  redeemed_at timestamptz,
  sender_seen_at timestamptz
);
create index gifts_to_idx on public.gifts(to_user, opened_at);
create index gifts_from_idx on public.gifts(from_user, created_at desc);
alter table public.gifts enable row level security;
revoke all on public.gifts from anon, authenticated;

create table public.gift_free_claims (
  user_id uuid not null,
  day date not null,
  primary key (user_id, day)
);
alter table public.gift_free_claims enable row level security;
revoke all on public.gift_free_claims from anon, authenticated;

insert into public.gift_catalog(kind, emoji, title, body, make_real) values
-- coupons
('coupon', '🍗', 'Biryani on me tonight', 'Redeem this and I will order your favourite biryani. No arguments about who pays.', 'food'),
('coupon', '☕', 'Chai and snacks, delivered', 'One round of your favourite chai and snacks, delivered to wherever you are.', 'food'),
('coupon', '🍦', 'Midnight ice cream run', 'Redeem at any hour. I will get dressed and bring the ice cream.', 'food'),
('coupon', '🍕', 'Pizza night, you pick', 'You choose the toppings and the movie. I just show up hungry.', 'food'),
('coupon', '🥘', 'Street food date, I pay', 'Panipuri, chaat, momos, whatever you want. All on me.', 'food'),
('coupon', '🍳', 'Breakfast in bed', 'One lazy morning, breakfast served to you. Choose the day.', null),
('coupon', '🎬', 'Movie date, I book it', 'You pick the film, I book the tickets and carry the popcorn.', 'movie'),
('coupon', '🕯️', 'Candlelight dinner', 'A proper dinner date at a place you choose. Dress up optional, smiling compulsory.', 'date'),
('coupon', '🚗', 'Long drive and chai', 'A no-destination drive with your playlist and a chai stop.', null),
('coupon', '🌅', 'One full day out, no phones', 'A whole day for just the two of us. Phones stay in the bag.', 'date'),
('coupon', '💆', 'Free massage, 15 minutes', 'Head, shoulders or feet. You decide, I do not complain.', null),
('coupon', '🍽️', 'Dishes duty for a week', 'I take the dishes for seven days. Redeem when you are tired of them.', null),
('coupon', '📺', 'You pick the show, no complaints', 'One evening where you control the remote and I say nothing.', null),
('coupon', '👑', 'Auto-win your next argument', 'Use it at the right moment. I will say you are right and mean it.', null),
('coupon', '☀️', 'Good morning song and call', 'I will call you tomorrow morning and sing. Badly, with feeling.', null),
('coupon', '🌻', 'Flowers coming your way', 'A bouquet delivered to you. Pick the day you want it.', 'gift'),
('coupon', '🎁', 'A surprise gift, my choice', 'I will pick something small and thoughtful. Redeem to make me go shopping.', 'gift'),
('coupon', '🧹', 'Skip one chore, no questions', 'Hand over any one chore and I will take it.', null),
-- dares
('dare', '🤪', 'Send your worst selfie, now', 'Right now. No retakes, no filters. I want the worst one you have.', null),
('dare', '🎤', 'Voice note: sing our song', 'Send me a voice note singing the first line of our song.', null),
('dare', '💬', 'Three things you love about me', 'Tell me in 30 seconds, out loud, in a voice note.', null),
('dare', '🎨', 'Draw me in 20 seconds', 'Terrible drawings only. Send it before time runs out.', null),
('dare', '🍛', 'Show me your plate', 'Send a photo of what you are eating right now.', null),
('dare', '🎭', 'A filmy dialogue for today', 'Send the Bollywood dialogue that describes your day best.', null),
('dare', '💃', 'Dance for 15 seconds', 'Record a 15 second dance and send it. Proof required.', null),
('dare', '😳', 'Your most embarrassing memory of us', 'Tell me the one we both pretend did not happen.', null),
-- song dedications (titles only, with my own lines)
('song', '🎵', 'Dedicated: Tum Hi Ho', 'Play this one loud and think of me. This one is for you.', null),
('song', '🎵', 'Dedicated: Raataan Lambiyan', 'Long nights, short distance. Put on headphones and play it.', null),
('song', '🎵', 'Dedicated: Kesariya', 'Play this on the way home and smile like a fool. I will be doing the same.', null),
('song', '🎵', 'Dedicated: Kal Ho Naa Ho', 'For all the days we had and the many more coming.', null),
('song', '🎵', 'Dedicated: Tera Ban Jaunga', 'No explanation needed. Just play it and read between the lines.', null),
('song', '🎵', 'Dedicated: Channa Mereya', 'Play it when you miss me. It is the closest thing to a hug I can send.', null),
('song', '🎵', 'Dedicated: Apna Bana Le', 'Press play and tell me what you think. I already know the answer.', null),
('song', '🎵', 'Dedicated: Pehle Bhi Main', 'A slow one for tonight. Press play and sit with it.', null),
-- free "spark" boxes from the app
('spark', '🤗', 'A 20 second hug', 'Hug your partner for a full 20 seconds today. Count out loud.', null),
('spark', '💭', 'One thing from this week', 'Ask each other: what is one thing the other did this week that you loved?', null),
('spark', '📞', 'Call, do not text', 'Call your partner instead of texting for the next thing you want to say.', null),
('spark', '🍫', 'Tiny treat', 'Buy your partner one small treat today. Nothing big, just unexpected.', null),
('spark', '🌙', 'Goodnight with a reason', 'Tonight, end the day with one real reason you are glad they exist.', null),
('spark', '📸', 'Photo of right now', 'Send each other a photo of exactly where you are at this moment.', null),
('spark', '🎶', 'Swap one song', 'Send your partner the song stuck in your head. Listen to theirs.', null),
('spark', '😂', 'Say the old joke', 'Say the joke only the two of you understand. Wait for the laugh.', null),
('spark', '🫶', 'Plan one small thing', 'Plan something tiny for this weekend together. A walk counts.', null),
('spark', '🙈', 'Confess a small thing', 'Tell your partner one harmless thing you never told them.', null);

create or replace function public.gift_catalog() returns json
language sql stable security definer set search_path = public as $$
  select coalesce(json_agg(json_build_object('id', id, 'kind', kind, 'emoji', emoji, 'title', title, 'body', body, 'make_real', make_real)
                           order by kind, id), '[]'::json)
  from public.gift_catalog where kind <> 'spark'
$$;

create or replace function public.send_gift(p_kind text, p_emoji text, p_title text, p_body text, p_make_real text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare c uuid := public.my_couple(); partner uuid := public._partner(); gid uuid;
begin
  if c is null or partner is null then raise exception 'Your partner needs to join first'; end if;
  if p_kind not in ('coupon', 'dare', 'song', 'note') then raise exception 'Unknown gift type'; end if;
  p_emoji := left(coalesce(nullif(trim(p_emoji), ''), '🎁'), 8);
  p_title := nullif(trim(coalesce(p_title, '')), '');
  p_body := trim(coalesce(p_body, ''));
  if p_kind = 'note' and p_title is null then p_title := 'A note for you'; end if;
  if p_title is null then raise exception 'Add a title'; end if;
  if char_length(p_title) > 60 then raise exception 'That title is too long'; end if;
  if char_length(p_body) < 1 or char_length(p_body) > 200 then raise exception 'Write between 1 and 200 characters'; end if;
  if p_make_real is not null and p_make_real not in ('food', 'movie', 'date', 'gift') then p_make_real := null; end if;
  if (select count(*) from public.gifts where from_user = auth.uid() and created_at > now() - interval '1 day') >= 30 then
    raise exception 'That is a lot of surprises for one day. Try again tomorrow';
  end if;
  insert into public.gifts(couple_id, from_user, to_user, kind, emoji, title, body, make_real)
  values (c, auth.uid(), partner, p_kind, p_emoji, p_title, p_body, p_make_real) returning id into gid;
  return gid;
end $$;

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
    'events', (select coalesce(json_agg(json_build_object('id', id, 'kind', kind, 'emoji', emoji, 'title', title, 'opened_at', opened_at,
                                                          'reaction', reaction, 'redeemed_at', redeemed_at) order by at desc), '[]'::json)
               from (select *, greatest(coalesce(opened_at, '-infinity'), coalesce(reacted_at, '-infinity'), coalesce(redeemed_at, '-infinity')) as at
                     from public.gifts where from_user = uid) s
               where s.at > coalesce(s.sender_seen_at, '-infinity') and s.at > '-infinity'),
    'wallet', (select coalesce(json_agg(json_build_object('id', id, 'emoji', emoji, 'title', title, 'body', body, 'make_real', make_real) order by opened_at desc), '[]'::json)
               from (select * from public.gifts where to_user = uid and kind = 'coupon' and opened_at is not null and redeemed_at is null
                     order by opened_at desc limit 30) w));
end $$;

create or replace function public._gift_json(g public.gifts) returns json
language sql stable security definer set search_path = public as $$
  select json_build_object('id', g.id, 'kind', g.kind, 'emoji', g.emoji, 'title', g.title, 'body', g.body, 'make_real', g.make_real,
                           'from_system', g.from_user is null, 'reaction', g.reaction, 'redeemed', g.redeemed_at is not null)
$$;

create or replace function public.open_gift(p_id uuid) returns json
language plpgsql security definer set search_path = public as $$
declare g public.gifts;
begin
  update public.gifts set opened_at = coalesce(opened_at, now()) where id = p_id and to_user = auth.uid() returning * into g;
  if not found then raise exception 'That gift is not here'; end if;
  return public._gift_json(g);
end $$;

create or replace function public.claim_free_gift() returns json
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); c uuid := public.my_couple(); s public.gift_catalog; g public.gifts;
begin
  if c is null then raise exception 'Set up your jodi first'; end if;
  insert into public.gift_free_claims(user_id, day) values (uid, public.today_ist()) on conflict do nothing;
  if not found then raise exception 'Come back tomorrow for your next free surprise'; end if;
  select * into s from public.gift_catalog where kind = 'spark' order by random() limit 1;
  insert into public.gifts(couple_id, from_user, to_user, kind, emoji, title, body, opened_at)
  values (c, null, uid, 'spark', s.emoji, s.title, s.body, now()) returning * into g;
  return public._gift_json(g);
end $$;

create or replace function public.react_gift(p_id uuid, p_reaction text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_reaction not in ('😂', '😍', '🥹', '😈', '🔥', '❤️') then raise exception 'Pick a reaction'; end if;
  update public.gifts set reaction = p_reaction, reacted_at = now()
  where id = p_id and to_user = auth.uid() and opened_at is not null and from_user is not null;
  if not found then raise exception 'Open the gift first'; end if;
end $$;

create or replace function public.redeem_gift(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.gifts set redeemed_at = now()
  where id = p_id and to_user = auth.uid() and kind = 'coupon' and opened_at is not null and redeemed_at is null;
  if not found then raise exception 'That coupon is not available'; end if;
end $$;

create or replace function public.mark_gifts_seen() returns void
language sql security definer set search_path = public as $$
  update public.gifts set sender_seen_at = now()
  where from_user = auth.uid()
    and greatest(coalesce(opened_at, '-infinity'), coalesce(reacted_at, '-infinity'), coalesce(redeemed_at, '-infinity')) > coalesce(sender_seen_at, '-infinity')
$$;

revoke execute on function public.gift_catalog(), public.send_gift(text, text, text, text, text), public.gift_box(), public._gift_json(public.gifts),
  public.open_gift(uuid), public.claim_free_gift(), public.react_gift(uuid, text), public.redeem_gift(uuid), public.mark_gifts_seen() from public, anon;
grant execute on function public.gift_catalog(), public.send_gift(text, text, text, text, text), public.gift_box(),
  public.open_gift(uuid), public.claim_free_gift(), public.react_gift(uuid, text), public.redeem_gift(uuid), public.mark_gifts_seen() to authenticated;
