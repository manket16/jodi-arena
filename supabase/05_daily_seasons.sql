-- Daily Jodi Challenge (same round for every couple each day), shared couple streak, and seasons.

-- ---------- seasons ----------
create table public.seasons (
  tag text primary key,
  name text not null,
  emoji text not null,
  tagline text not null,
  color text not null,         -- accent for the banner
  badge text not null,         -- limited badge sold only during the season
  starts date not null,
  ends date not null
);
alter table public.seasons enable row level security;
revoke all on public.seasons from anon, authenticated;

alter table public.sync_prompts add column season text;
alter table public.trivia add column season text;
alter table public.estimates add column season text;

create or replace function public.today_ist() returns date
language sql stable as $$ select (now() at time zone 'Asia/Kolkata')::date $$;

create or replace function public.current_season() returns public.seasons
language sql stable security definer set search_path = public as $$
  select * from public.seasons where public.today_ist() between starts and ends order by starts desc limit 1
$$;

-- ---------- daily + streak columns ----------
alter table public.matches add column daily_day date;
create unique index matches_daily_once on public.matches(couple_a, daily_day) where daily_day is not null;
create index matches_daily_day_idx on public.matches(daily_day) where daily_day is not null;

alter table public.couples add column streak int not null default 0;
alter table public.couples add column best_streak int not null default 0;
alter table public.couples add column last_daily date;

create table public.daily_challenges (
  day date primary key,
  game text not null,
  content jsonb not null,
  keys jsonb not null,
  season text
);
alter table public.daily_challenges enable row level security;
revoke all on public.daily_challenges from anon, authenticated;

-- ---------- content generation, now mixing in seasonal questions ----------
create or replace function public.gen_content(p_game text, out o_content jsonb, out o_keys jsonb)
language plpgsql volatile security definer set search_path = public as $$
declare
  ids int[]; i int; t text; opts text[]; v_sets jsonb := '[[],[]]'; v_options jsonb := '[[],[]]';
  v_answers jsonb := '[[],[]]'; s int; k int; beats jsonb := '[0]'; tms int := 0;
  v_tag text := (public.current_season()).tag;
begin
  if p_game = 'sync' then
    select jsonb_agg(jsonb_build_object('id', x.id, 'q', x.prompt, 'a', x.a, 'b', x.b) order by random())
      into o_content from (
        select * from (
          (select id, prompt, a, b, 0 as pri from public.sync_prompts where season = v_tag order by random() limit 5)
          union all
          (select id, prompt, a, b, 1 from public.sync_prompts where season is null order by random() limit 10)
        ) u order by pri, random() limit 10) x;
    o_content := jsonb_build_object('prompts', o_content);
    o_keys := '{}'::jsonb;
  elsif p_game = 'cricket' then
    with picked as (
      select * from (
        (select id, q, options, answer, difficulty, 0 as pri from public.trivia where season = v_tag order by random() limit 4)
        union all
        (select id, q, options, answer, difficulty, 1 from public.trivia where season is null order by random() limit 12)
      ) u order by pri, random() limit 12
    ), q as (select p.*, row_number() over (order by random()) as rn from picked p)
    select jsonb_agg(jsonb_build_object('id', q.id, 'q', q.q, 'options', q.options, 'difficulty', q.difficulty) order by q.rn),
           jsonb_agg(q.answer order by q.rn)
      into o_content, o_keys from q;
    o_content := jsonb_build_object('questions', o_content);
    o_keys := jsonb_build_object('answers', o_keys);
  elsif p_game = 'antakshari' then
    o_content := jsonb_build_object('start', substr('abcdghjkmprst', floor(random()*13)::int + 1, 1));
    o_keys := '{}'::jsonb;
  elsif p_game = 'hum' then
    ids := array(select id from public.songs order by random() limit 6);
    for i in 1..6 loop
      s := case when i <= 3 then 0 else 1 end;
      select title into t from public.songs where id = ids[i];
      opts := array(select title from public.songs where id <> all(ids) order by random() limit 3) || t;
      opts := array(select x from unnest(opts) x order by random());
      k := array_position(opts, t) - 1;
      v_sets := jsonb_set(v_sets, array[s::text], (v_sets->s) || jsonb_build_array(t));
      v_options := jsonb_set(v_options, array[s::text], (v_options->s) || jsonb_build_array(to_jsonb(opts)));
      v_answers := jsonb_set(v_answers, array[s::text], (v_answers->s) || to_jsonb(k));
    end loop;
    o_content := '{}'::jsonb;
    o_keys := jsonb_build_object('sets', v_sets, 'options', v_options, 'answers', v_answers);
  elsif p_game = 'andaaza' then
    with picked as (
      select * from (
        (select id, q, answer, tol, unit, lo, hi, 0 as pri from public.estimates where season = v_tag order by random() limit 2)
        union all
        (select id, q, answer, tol, unit, lo, hi, 1 from public.estimates where season is null order by random() limit 6)
      ) u order by pri, random() limit 6
    ), q as (select p.*, row_number() over (order by random()) as rn from picked p)
    select jsonb_agg(jsonb_build_object('id', q.id, 'q', q.q, 'unit', q.unit, 'lo', q.lo, 'hi', q.hi) order by q.rn),
           jsonb_agg(jsonb_build_object('answer', q.answer, 'tol', q.tol) order by q.rn)
      into o_content, o_keys from q;
    o_content := jsonb_build_object('questions', o_content);
    o_keys := jsonb_build_object('answers', o_keys);
  elsif p_game = 'rhythm' then
    for i in 2..8 loop
      tms := tms + (array[300, 450, 600, 600, 900])[floor(random()*5)::int + 1];
      beats := beats || to_jsonb(tms);
    end loop;
    o_content := jsonb_build_object('beats', beats);
    o_keys := '{}'::jsonb;
  else
    raise exception 'Unknown game';
  end if;
end $$;

-- ---------- regular matches ignore daily ones ----------
create or replace function public.start_match(p_game text) returns uuid
language plpgsql security definer set search_path = public as $$
declare c uuid := public.my_couple(); mid uuid; g record;
begin
  if c is null then raise exception 'Create or join a jodi first'; end if;
  if (select p2 from public.couples where id = c) is null then
    raise exception 'Your partner needs to join with your code first';
  end if;
  if p_game not in ('sync','cricket','antakshari','hum','andaaza','rhythm') then raise exception 'Unknown game'; end if;
  select id into mid from public.matches
   where game = p_game and daily_day is null
     and ((couple_a = c and not a_done) or (couple_b = c and not b_done))
   order by created_at desc limit 1;
  if mid is not null then return mid; end if;
  select id into mid from public.matches
   where game = p_game and daily_day is null and status = 'open' and couple_b is null and not ghost
     and couple_a <> c and created_at > now() - interval '3 days'
   order by a_done desc, created_at asc
   limit 1 for update skip locked;
  if mid is not null then
    update public.matches set couple_b = c where id = mid;
    return mid;
  end if;
  select * into g from public.gen_content(p_game);
  insert into public.matches(game, content, keys, couple_a)
    values (p_game, g.o_content, g.o_keys, c) returning id into mid;
  return mid;
end $$;

-- ---------- daily challenge ----------
create or replace function public.daily_game(p_day date) returns text
language sql immutable as $$
  select (array['sync','andaaza','rhythm','cricket'])[((p_day - date '2026-01-01') % 4) + 1]
$$;

create or replace function public.start_daily() returns uuid
language plpgsql security definer set search_path = public as $$
declare c uuid := public.my_couple(); d date := public.today_ist(); dc public.daily_challenges; g record; mid uuid;
begin
  if c is null then raise exception 'Create or join a jodi first'; end if;
  if (select p2 from public.couples where id = c) is null then
    raise exception 'Your partner needs to join with your code first';
  end if;
  select id into mid from public.matches where couple_a = c and daily_day = d;
  if mid is not null then return mid; end if;

  select * into dc from public.daily_challenges where day = d;
  if not found then
    select * into g from public.gen_content(public.daily_game(d));
    insert into public.daily_challenges(day, game, content, keys, season)
      values (d, public.daily_game(d), g.o_content, g.o_keys, (public.current_season()).tag)
      on conflict (day) do nothing;
    select * into dc from public.daily_challenges where day = d;
  end if;

  insert into public.matches(game, content, keys, couple_a, daily_day)
    values (dc.game, dc.content, dc.keys, c, d)
    on conflict (couple_a, daily_day) where daily_day is not null do nothing
    returning id into mid;
  if mid is null then
    select id into mid from public.matches where couple_a = c and daily_day = d;
  end if;
  return mid;
end $$;

-- Completing the daily: no rival, rank against everyone who played today, extend the streak.
create or replace function public.finalize_daily(p_match uuid, p_couple uuid, p_score int) returns void
language plpgsql security definer set search_path = public as $$
declare m public.matches; cp public.couples; new_streak int;
begin
  select * into m from public.matches where id = p_match for update;
  if m.status = 'complete' then return; end if;
  update public.matches set a_done = true, b_done = true, score_a = p_score, status = 'complete', completed_at = now()
   where id = p_match;
  select * into cp from public.couples where id = p_couple for update;
  if cp.last_daily = m.daily_day then return; end if;
  new_streak := case when cp.last_daily = m.daily_day - 1 then cp.streak + 1 else 1 end;
  update public.couples set
    streak = new_streak,
    best_streak = greatest(best_streak, new_streak),
    last_daily = m.daily_day,
    coins = coins + 20 + least(new_streak, 10) * 3
  where id = p_couple;
end $$;

create or replace function public.set_couple_done(p_match uuid, p_couple uuid, p_score int) returns void
language plpgsql security definer set search_path = public as $$
begin
  if (select daily_day from public.matches where id = p_match) is not null then
    perform public.finalize_daily(p_match, p_couple, p_score);
    return;
  end if;
  update public.matches set a_done = true, score_a = p_score where id = p_match and couple_a = p_couple and not a_done;
  update public.matches set b_done = true, score_b = p_score where id = p_match and couple_b = p_couple and not b_done;
  perform public.finalize_match(p_match);
end $$;

create or replace function public.play_ghost(p_match uuid) returns json
language plpgsql security definer set search_path = public as $$
declare x record; m public.matches; gs int;
begin
  select * into x from public._ctx(p_match);
  select * into m from public.matches where id = p_match for update;
  if m.daily_day is not null or x.o_side <> 'a' or not m.a_done or m.couple_b is not null or m.status <> 'open' then
    raise exception 'A ghost match is not available here';
  end if;
  gs := case m.game
          when 'sync' then 60 + floor(random() * 56)::int
          when 'cricket' then 8 + floor(random() * 29)::int
          when 'antakshari' then 40 + floor(random() * 9)::int * 10
          when 'andaaza' then 40 + floor(random() * 51)::int
          when 'rhythm' then 45 + floor(random() * 51)::int
          else 30 + floor(random() * 46)::int end;
  update public.matches set ghost = true, b_done = true, score_b = gs where id = p_match;
  perform public.finalize_match(p_match);
  return public.match_state(p_match);
end $$;

-- effective streak: drops to 0 once a day is missed
create or replace function public.effective_streak(cp public.couples) returns int
language sql stable as $$
  select case when cp.last_daily >= public.today_ist() - 1 then cp.streak else 0 end
$$;

create or replace function public.match_state(p_match uuid) returns json
language plpgsql stable security definer set search_path = public as $$
declare x record; m public.matches; uid uuid := auth.uid();
  mine public.plays; theirs public.plays; rival uuid; extra jsonb := '{}'::jsonb; pslot int;
  my_bet public.bets; their_bet public.bets; daily jsonb := null; cp public.couples;
begin
  select * into x from public._ctx(p_match);
  select * into m from public.matches where id = p_match;
  select * into mine from public.plays where match_id = p_match and user_id = uid;
  select * into theirs from public.plays where match_id = p_match and user_id = x.o_partner;
  rival := case when x.o_side = 'a' then m.couple_b else m.couple_a end;
  pslot := 3 - x.o_slot;
  if x.o_game = 'hum' then
    extra := jsonb_build_object(
      'my_set', x.o_keys->'sets'->(x.o_slot - 1),
      'guess_options', x.o_keys->'options'->(pslot - 1),
      'partner_clips', theirs.data->'clips',
      'my_clips', mine.data->'clips');
  elsif x.o_game = 'antakshari' then
    extra := jsonb_build_object(
      'my_start', case when x.o_slot = 1 then x.o_content->>'start' else theirs.data->>'next' end,
      'partner_songs', coalesce(theirs.data->'songs', '[]'::jsonb));
  elsif x.o_game = 'cricket' then
    select * into my_bet from public.bets where match_id = p_match and bettor = uid;
    select * into their_bet from public.bets where match_id = p_match and bettor = x.o_partner;
    extra := jsonb_build_object(
      'my_bet', case when my_bet.id is null then null else to_jsonb(my_bet) - 'couple_id' end,
      'partner_bet', case when their_bet.id is null then null else to_jsonb(their_bet) - 'couple_id' end);
  elsif x.o_game = 'andaaza' and x.o_couple_done then
    extra := jsonb_build_object('answers', x.o_keys->'answers');
  end if;

  if m.daily_day is not null then
    select * into cp from public.couples where id = x.o_c;
    daily := jsonb_build_object(
      'day', m.daily_day,
      'streak', public.effective_streak(cp),
      'best', cp.best_streak,
      'played', (select count(*) from public.matches where daily_day = m.daily_day and status = 'complete'),
      'rank', case when m.status = 'complete' then
        1 + (select count(*) from public.matches o where o.daily_day = m.daily_day and o.status = 'complete' and o.score_a > m.score_a)
        else null end,
      'top', (select max(score_a) from public.matches where daily_day = m.daily_day and status = 'complete'));
  end if;

  return json_build_object(
    'id', m.id, 'game', m.game, 'status', m.status, 'content', m.content,
    'slot', x.o_slot, 'side', x.o_side,
    'me_done', coalesce(mine.done, false), 'partner_done', coalesce(theirs.done, false),
    'my_data', mine.data, 'my_score', mine.score,
    'partner_data', case when x.o_couple_done then theirs.data else null end,
    'partner_score', case when x.o_couple_done then theirs.score else null end,
    'couple_done', x.o_couple_done,
    'couple_score', case when x.o_side = 'a' then m.score_a else m.score_b end,
    'rival_score', case when m.status = 'complete' then (case when x.o_side = 'a' then m.score_b else m.score_a end) else null end,
    'rival_name', case when m.ghost then 'Ghost Jodi 👻' else (select name from public.couples where id = rival) end,
    'rival_badge', case when m.ghost then '👻' else (select badge from public.couples where id = rival) end,
    'has_rival', rival is not null or m.ghost,
    'ghost', m.ghost,
    'result', case when m.status <> 'complete' or m.daily_day is not null then null
                   when m.winner is null then 'draw'
                   when m.winner = x.o_c then 'win' else 'loss' end,
    'daily', daily,
    'extra', extra);
end $$;

create or replace function public.get_home() returns json
language plpgsql stable security definer set search_path = public as $$
declare uid uuid := auth.uid(); p public.profiles; cp public.couples; partner uuid; res json;
  d date := public.today_ist(); dm public.matches; s public.seasons := public.current_season();
begin
  if uid is null then raise exception 'Please sign in first'; end if;
  select * into p from public.profiles where id = uid;
  if p.couple_id is null then
    return json_build_object('profile', json_build_object('name', p.name), 'couple', null, 'matches', '[]'::json);
  end if;
  select * into cp from public.couples where id = p.couple_id;
  partner := case when cp.p1 = uid then cp.p2 else cp.p1 end;
  select * into dm from public.matches where couple_a = cp.id and daily_day = d;

  select json_build_object(
    'profile', json_build_object('name', p.name),
    'couple', json_build_object(
      'id', cp.id, 'name', cp.name, 'code', cp.code, 'coins', cp.coins, 'rating', cp.rating,
      'wins', cp.wins, 'losses', cp.losses, 'draws', cp.draws, 'badge', cp.badge, 'badges', cp.badges,
      'slot', case when cp.p1 = uid then 1 else 2 end,
      'partner_name', (select name from public.profiles where id = partner),
      'complete', cp.p2 is not null,
      'streak', public.effective_streak(cp), 'best_streak', cp.best_streak),
    'daily', json_build_object(
      'day', d,
      'game', coalesce((select game from public.daily_challenges where day = d), public.daily_game(d)),
      'match_id', dm.id,
      'done', coalesce(dm.status = 'complete', false),
      'score', dm.score_a,
      'me_done', exists (select 1 from public.plays pl where pl.match_id = dm.id and pl.user_id = uid and pl.done),
      'partner_done', exists (select 1 from public.plays pl where pl.match_id = dm.id and pl.user_id = partner and pl.done),
      'played_today', (select count(*) from public.matches where daily_day = d and status = 'complete'),
      'rank', case when dm.status = 'complete' then
        1 + (select count(*) from public.matches o where o.daily_day = d and o.status = 'complete' and o.score_a > dm.score_a) end),
    'season', case when s.tag is null then null else json_build_object(
      'tag', s.tag, 'name', s.name, 'emoji', s.emoji, 'tagline', s.tagline, 'color', s.color,
      'badge', s.badge, 'ends', s.ends, 'days_left', s.ends - d) end,
    'matches', coalesce((
      select json_agg(r order by r.created_at desc) from (
        select m.id, m.game, m.status, m.created_at,
          case when m.couple_a = cp.id then m.a_done else m.b_done end as couple_done,
          exists (select 1 from public.plays pl where pl.match_id = m.id and pl.user_id = uid and pl.done) as me_done,
          exists (select 1 from public.plays pl where pl.match_id = m.id and pl.user_id = partner and pl.done) as partner_done,
          case when m.ghost then 'Ghost Jodi 👻'
               else (select name from public.couples where id = case when m.couple_a = cp.id then m.couple_b else m.couple_a end) end as rival_name,
          case when m.couple_a = cp.id then m.score_a else m.score_b end as my_score,
          case when m.status = 'complete' then (case when m.couple_a = cp.id then m.score_b else m.score_a end) end as rival_score,
          case when m.status <> 'complete' then null when m.winner is null then 'draw'
               when m.winner = cp.id then 'win' else 'loss' end as result
        from public.matches m
        where (m.couple_a = cp.id or m.couple_b = cp.id) and m.daily_day is null
          and (m.status = 'open' or m.completed_at > now() - interval '2 days')
        order by m.created_at desc limit 20) r), '[]'::json)
  ) into res;
  return res;
end $$;

-- Season table: 3 points per win, 1 per draw, plus daily challenges completed (1 point each, +1 if top 10 that day).
create or replace function public.season_board() returns json
language sql stable security definer set search_path = public as $$
  with s as (select * from public.current_season()),
  pts as (
    select c.id,
      coalesce((select sum(case when m.winner = c.id then 3 when m.winner is null then 1 else 0 end)
                from public.matches m, s
                where m.daily_day is null and m.status = 'complete' and (m.couple_a = c.id or m.couple_b = c.id)
                  and (m.completed_at at time zone 'Asia/Kolkata')::date between s.starts and s.ends), 0)
      + coalesce((select count(*) from public.matches m, s
                where m.daily_day is not null and m.couple_a = c.id and m.status = 'complete'
                  and m.daily_day between s.starts and s.ends), 0) as points
    from public.couples c where c.p2 is not null
  )
  select coalesce(json_agg(r), '[]'::json) from (
    select c.name, c.badge, p.points, public.effective_streak(c) as streak, c.id = public.my_couple() as me
    from pts p join public.couples c on c.id = p.id
    where p.points > 0 or c.id = public.my_couple()
    order by p.points desc, c.rating desc limit 50) r
$$;

create or replace function public.buy_badge(p_badge text) returns json
language plpgsql security definer set search_path = public as $$
declare c uuid := public.my_couple(); price int; s public.seasons := public.current_season();
  prices jsonb := '{"💞":0,"🌻":100,"🏏":120,"🎤":120,"🔥":150,"🪔":200,"👑":300}';
begin
  if c is null then raise exception 'Create or join a jodi first'; end if;
  if s.badge is not null then prices := prices || jsonb_build_object(s.badge, 150); end if;
  price := (prices->>p_badge)::int;
  if not exists (select 1 from public.couples where id = c and p_badge = any(badges)) then
    if price is null then raise exception 'This badge is not available right now'; end if;
    update public.couples set coins = coins - price, badges = badges || p_badge
     where id = c and coins >= price;
    if not found then raise exception 'Not enough coins'; end if;
  end if;
  update public.couples set badge = p_badge where id = c;
  return public.get_home();
end $$;

revoke execute on function public.start_daily(), public.season_board() from public, anon;
grant execute on function public.start_daily(), public.season_board() to authenticated;
revoke execute on function public.finalize_daily(uuid, uuid, int), public.gen_content(text),
  public.set_couple_done(uuid, uuid, int), public.current_season(), public.effective_streak(public.couples)
  from public, anon, authenticated;

-- ---------- season calendar (IST dates) ----------
insert into public.seasons(tag, name, emoji, tagline, color, badge, starts, ends) values
('diwali26', 'Diwali Dhamaka', '🪔', 'Diwali questions, festive badge, season table', '#F59E0B', '🎆', '2026-10-20', '2026-11-15'),
('shaadi26', 'Shaadi Season', '💍', 'Baraat, sangeet and buffet battles', '#E5306B', '💍', '2026-11-16', '2026-12-24'),
('newyear27', 'New Year Jodi', '🎉', 'Start the year as the top jodi', '#2F6FEB', '🎉', '2026-12-25', '2027-01-31'),
('valentine27', 'Valentine''s Month', '💘', 'How well do you really know each other?', '#F0386B', '💘', '2027-02-01', '2027-02-28'),
('holi27', 'Holi Hai', '🎨', 'Colour, gujiya and thandai rounds', '#0F9D8A', '🎨', '2027-03-01', '2027-03-20'),
('ipl27', 'IPL Fever', '🏏', 'Cricket-heavy rounds all season', '#16A34A', '🏟️', '2027-03-21', '2027-05-31');

insert into public.sync_prompts(prompt, a, b, season) values
('Diwali mithai?', 'Kaju katli', 'Gulab jamun', 'diwali26'),
('Crackers?', 'Loud bombs', 'Only phuljhadi', 'diwali26'),
('Diwali outfit?', 'Full traditional', 'Indo-western', 'diwali26'),
('Who makes the rangoli?', 'Him', 'Her', 'diwali26'),
('Who cleans more before Diwali?', 'Him', 'Her', 'diwali26'),
('Lights?', 'Diyas', 'Fairy lights', 'diwali26'),
('Diwali night?', 'Family pooja', 'Card party', 'diwali26'),
('Diwali gift box?', 'Dry fruits', 'Chocolates', 'diwali26'),
('Who loses more at teen patti?', 'Him', 'Her', 'diwali26'),
('Diwali shopping?', 'Local market', 'Mall', 'diwali26'),
('Leftover mithai?', 'Finish it ourselves', 'Give it away', 'diwali26'),
('Who eats more mithai?', 'Him', 'Her', 'diwali26'),
('Shaadi food counter?', 'Chaat', 'Biryani', 'shaadi26'),
('Baraat dance?', 'Naagin', 'Bhangra', 'shaadi26'),
('Sangeet song?', 'Old Bollywood', 'Latest hits', 'shaadi26'),
('Who cries at the vidaai?', 'Him', 'Her', 'shaadi26'),
('Who dances more at weddings?', 'Him', 'Her', 'shaadi26'),
('Wedding outfit?', 'Heavy and grand', 'Light and comfy', 'shaadi26'),
('Shaadi gift?', 'Envelope', 'Gift box', 'shaadi26'),
('Dream wedding size?', '500 guests', '50 guests', 'shaadi26'),
('Destination wedding?', 'Udaipur', 'Goa', 'shaadi26'),
('Favourite function?', 'Mehendi', 'Haldi', 'shaadi26'),
('Who eats more at a shaadi buffet?', 'Him', 'Her', 'shaadi26'),
('Leave the shaadi?', 'Right after dinner', 'After the last dance', 'shaadi26');

insert into public.trivia(q, options, answer, difficulty, season) values
('Diwali celebrates Ram''s return to which city?', '["Ayodhya", "Mathura", "Kashi", "Dwarka"]', 0, 1, 'diwali26'),
('Goddess Lakshmi is the goddess of?', '["Wealth", "Knowledge", "Strength", "Music"]', 0, 1, 'diwali26'),
('Which festival comes two days before Diwali?', '["Dhanteras", "Bhai Dooj", "Govardhan Puja", "Chhath"]', 0, 1, 'diwali26'),
('Chhath Puja is mainly celebrated in?', '["Bihar", "Kerala", "Goa", "Assam"]', 0, 1, 'diwali26'),
('Who lifted the Govardhan hill?', '["Krishna", "Ram", "Hanuman", "Shiva"]', 0, 1, 'diwali26'),
('A traditional diya is made of?', '["Clay", "Brass", "Glass", "Wood"]', 0, 1, 'diwali26'),
('Kali Puja on Diwali night is biggest in?', '["West Bengal", "Punjab", "Gujarat", "Kerala"]', 0, 2, 'diwali26'),
('Narak Chaturdashi marks the defeat of?', '["Narakasura", "Kansa", "Ravana", "Mahishasura"]', 0, 2, 'diwali26'),
('Which state celebrates its New Year the day after Diwali?', '["Gujarat", "Bihar", "Kerala", "Punjab"]', 0, 2, 'diwali26'),
('Sikhs celebrate which occasion on Diwali?', '["Bandi Chhor Divas", "Baisakhi", "Lohri", "Hola Mohalla"]', 0, 3, 'diwali26'),
('For Jains, Diwali marks the nirvana of?', '["Mahavira", "Buddha", "Parshvanath", "Rishabhanatha"]', 0, 3, 'diwali26'),
('How many rounds (pheras) are taken in a Hindu wedding?', '["5", "6", "7", "9"]', 2, 1, 'shaadi26'),
('''Mehendi Laga Ke Rakhna'' is from which film?', '["DDLJ", "Hum Aapke Hain Koun", "Kuch Kuch Hota Hai", "Hum Saath Saath Hain"]', 0, 1, 'shaadi26'),
('''Didi Tera Devar Deewana'' is from which film?', '["Hum Aapke Hain Koun", "DDLJ", "Vivah", "Band Baaja Baaraat"]', 0, 1, 'shaadi26'),
('Who plays the male lead in Band Baaja Baaraat?', '["Ranveer Singh", "Ranbir Kapoor", "Shahid Kapoor", "Varun Dhawan"]', 0, 1, 'shaadi26'),
('Sindoor is traditionally applied in the?', '["Hair parting", "Forehead", "Palm", "Neck"]', 0, 1, 'shaadi26'),
('What is the wedding planning company called in Band Baaja Baaraat?', '["Shaadi Mubarak", "Shubh Vivah", "Band Baaja", "Shaadi Sutra"]', 0, 2, 'shaadi26'),
('Who stars opposite Shahid Kapoor in Vivah?', '["Amrita Rao", "Kareena Kapoor", "Vidya Balan", "Ayesha Takia"]', 0, 2, 'shaadi26'),
('Who directed Monsoon Wedding?', '["Mira Nair", "Zoya Akhtar", "Karan Johar", "Deepa Mehta"]', 0, 2, 'shaadi26'),
('Who plays the lead in Bride and Prejudice?', '["Aishwarya Rai", "Priyanka Chopra", "Kareena Kapoor", "Deepika Padukone"]', 0, 2, 'shaadi26');

insert into public.estimates(q, answer, tol, unit, lo, hi, season) values
('How many years was Ram in exile?', 14, 5, 'yrs', 0, 40, 'diwali26'),
('How many heads did Ravana have?', 10, 4, '', 0, 25, 'diwali26'),
('How many nights does Navratri last?', 9, 3, '', 0, 25, 'diwali26'),
('How many pheras in a Hindu wedding?', 7, 3, '', 0, 20, 'shaadi26');
