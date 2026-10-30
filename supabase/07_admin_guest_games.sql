-- Admin dashboard, guest mode (2 free games), and two new games: Future Us and Filmy Emoji.

alter table public.matches drop constraint matches_game_check;
alter table public.matches add constraint matches_game_check
  check (game in ('sync','cricket','antakshari','hum','andaaza','rhythm','kyj','future','emoji'));

create table public.admins (user_id uuid primary key references auth.users(id) on delete cascade);
alter table public.admins enable row level security;
revoke all on public.admins from anon, authenticated;

create table public.future_questions (id serial primary key, q text not null, options jsonb not null);
create table public.movies (id serial primary key, title text not null unique);
alter table public.future_questions enable row level security;
alter table public.movies enable row level security;
revoke all on public.future_questions, public.movies from anon, authenticated;

create or replace function public.couple_has_guest(p_couple uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.couples c join auth.users u on u.id in (c.p1, c.p2)
                 where c.id = p_couple and u.is_anonymous)
$$;

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
  elsif p_game = 'kyj' then
    select jsonb_agg(jsonb_build_object('id', x.id, 'q', x.q, 'options', x.options) order by random())
      into o_content from (
        select * from (
          (select id, q, options, 0 as pri from public.kyj_questions where season = v_tag order by random() limit 2)
          union all
          (select id, q, options, 1 from public.kyj_questions where season is null order by random() limit 5)
        ) u order by pri, random() limit 5) x;
    o_content := jsonb_build_object('questions', o_content);
    o_keys := '{}'::jsonb;
  elsif p_game = 'future' then
    select jsonb_agg(jsonb_build_object('id', x.id, 'q', x.q, 'options', x.options) order by random())
      into o_content from (select * from public.future_questions order by random() limit 8) x;
    o_content := jsonb_build_object('questions', o_content);
    o_keys := '{}'::jsonb;
  elsif p_game = 'emoji' then
    ids := array(select id from public.movies order by random() limit 6);
    for i in 1..6 loop
      s := case when i <= 3 then 0 else 1 end;
      select title into t from public.movies where id = ids[i];
      opts := array(select title from public.movies where id <> all(ids) order by random() limit 3) || t;
      opts := array(select x from unnest(opts) x order by random());
      k := array_position(opts, t) - 1;
      v_sets := jsonb_set(v_sets, array[s::text], (v_sets->s) || jsonb_build_array(t));
      v_options := jsonb_set(v_options, array[s::text], (v_options->s) || jsonb_build_array(to_jsonb(opts)));
      v_answers := jsonb_set(v_answers, array[s::text], (v_answers->s) || to_jsonb(k));
    end loop;
    o_content := '{}'::jsonb;
    o_keys := jsonb_build_object('sets', v_sets, 'options', v_options, 'answers', v_answers);
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

create or replace function public.start_match(p_game text) returns uuid
language plpgsql security definer set search_path = public as $$
declare c uuid := public.my_couple(); mid uuid; g record;
begin
  if c is null then raise exception 'Create or join a jodi first'; end if;
  if (select p2 from public.couples where id = c) is null then
    raise exception 'Your partner needs to join with your code first';
  end if;
  if public.couple_has_guest(c) and p_game not in ('sync','kyj') then
    raise exception 'Guest jodis can play Sync and Know Your Jodi. Save your account (Me tab) to unlock every game';
  end if;
  if p_game not in ('sync','cricket','antakshari','hum','andaaza','rhythm','kyj','future','emoji') then raise exception 'Unknown game'; end if;
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
          when 'kyj' then 45 + floor(random() * 61)::int
          when 'future' then 45 + floor(random() * 61)::int
          when 'emoji' then 50 + floor(random() * 71)::int
          else 30 + floor(random() * 46)::int end;
  update public.matches set ghost = true, b_done = true, score_b = gs where id = p_match;
  perform public.finalize_match(p_match);
  return public.match_state(p_match);
end $$;


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
  elsif x.o_game = 'emoji' then
    extra := jsonb_build_object(
      'my_set', x.o_keys->'sets'->(x.o_slot - 1),
      'guess_options', x.o_keys->'options'->(pslot - 1),
      'partner_clues', theirs.data->'clues',
      'my_clues', mine.data->'clues',
      'partner_set', case when x.o_couple_done then x.o_keys->'sets'->(pslot - 1) end);
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
    return json_build_object('profile', json_build_object('name', p.name), 'couple', null, 'matches', '[]'::json,
      'is_admin', exists (select 1 from public.admins where user_id = uid));
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
      'streak', public.effective_streak(cp), 'best_streak', cp.best_streak,
      'me_guest', coalesce((select is_anonymous from auth.users where id = uid), false),
      'partner_guest', coalesce((select is_anonymous from auth.users where id = partner), false),
      'guest_locked', public.couple_has_guest(cp.id),
      'free_games', json_build_array('sync', 'kyj')),
    'is_admin', exists (select 1 from public.admins where user_id = uid),
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


-- Future Us: both pick your shared future blind; every matching dream scores 15.
create or replace function public.submit_future(p_match uuid, p_picks jsonb) returns json
language plpgsql security definer set search_path = public as $$
declare x record; uid uuid := auth.uid(); theirs public.plays; n int; i int; s int := 0; pts int; per jsonb := '[]';
begin
  select * into x from public._ctx(p_match);
  if x.o_game <> 'future' then raise exception 'Wrong game'; end if;
  if exists (select 1 from public.plays where match_id = p_match and user_id = uid and done) then
    raise exception 'You already played this round';
  end if;
  n := jsonb_array_length(x.o_content->'questions');
  if jsonb_typeof(p_picks) <> 'array' or jsonb_array_length(p_picks) <> n then raise exception 'Answer every question'; end if;
  insert into public.plays(match_id, couple_id, user_id, slot, data, done)
    values (p_match, x.o_c, uid, x.o_slot, jsonb_build_object('picks', p_picks), true)
    on conflict (match_id, user_id) do update set data = excluded.data, done = true;
  select * into theirs from public.plays where match_id = p_match and user_id = x.o_partner and done;
  if found then
    for i in 0..n-1 loop
      pts := case when p_picks->>i = theirs.data->'picks'->>i then 15 else 0 end;
      s := s + pts; per := per || to_jsonb(pts);
    end loop;
    update public.plays set score = s, data = data || jsonb_build_object('points', per)
     where match_id = p_match and couple_id = x.o_c;
    perform public.set_couple_done(p_match, x.o_c, s);
  end if;
  return public.match_state(p_match);
end $$;

-- Filmy Emoji: describe 3 movies in emojis only, then guess your partner's 3.
create or replace function public._emoji_check(p_match uuid, p_couple uuid) returns void
language plpgsql security definer set search_path = public as $$
declare total int;
begin
  update public.plays set done = (data ? 'clues' and data ? 'guess') where match_id = p_match and couple_id = p_couple;
  if (select count(*) from public.plays where match_id = p_match and couple_id = p_couple and done) = 2 then
    select sum(score) into total from public.plays where match_id = p_match and couple_id = p_couple;
    perform public.set_couple_done(p_match, p_couple, total);
  end if;
end $$;

create or replace function public.emoji_clues(p_match uuid, p_clues jsonb) returns json
language plpgsql security definer set search_path = public as $$
declare x record; uid uuid := auth.uid(); v text;
begin
  select * into x from public._ctx(p_match);
  if x.o_game <> 'emoji' then raise exception 'Wrong game'; end if;
  if exists (select 1 from public.plays where match_id = p_match and user_id = uid and data ? 'clues') then
    raise exception 'You already sent your emojis';
  end if;
  if jsonb_typeof(p_clues) <> 'array' or jsonb_array_length(p_clues) <> 3 then raise exception 'Describe all 3 movies'; end if;
  for v in select e from jsonb_array_elements_text(p_clues) e loop
    if char_length(trim(v)) = 0 then raise exception 'Add at least one emoji for every movie'; end if;
    if char_length(v) > 40 then raise exception 'Too many emojis. Keep it short'; end if;
    if v ~ '[A-Za-z0-9]' or v ~ '[\u0900-\u097F]' then raise exception 'Emojis only! No letters or numbers'; end if;
  end loop;
  insert into public.plays as pl (match_id, couple_id, user_id, slot, data)
    values (p_match, x.o_c, uid, x.o_slot, jsonb_build_object('clues', p_clues))
    on conflict (match_id, user_id) do update set data = pl.data || jsonb_build_object('clues', p_clues);
  perform public._emoji_check(p_match, x.o_c);
  return public.match_state(p_match);
end $$;

create or replace function public.submit_emoji_guess(p_match uuid, p_picks jsonb) returns json
language plpgsql security definer set search_path = public as $$
declare x record; uid uuid := auth.uid(); i int; s int := 0; pslot int; pick text; per jsonb := '[]'; pts int;
begin
  select * into x from public._ctx(p_match);
  if x.o_game <> 'emoji' then raise exception 'Wrong game'; end if;
  if not exists (select 1 from public.plays where match_id = p_match and user_id = x.o_partner and data ? 'clues') then
    raise exception 'Your partner has not sent their emojis yet';
  end if;
  if exists (select 1 from public.plays where match_id = p_match and user_id = uid and data ? 'guess') then
    raise exception 'You already guessed';
  end if;
  pslot := 3 - x.o_slot;
  for i in 0..2 loop
    pick := p_picks->i->>'pick';
    pts := 0;
    if pick is not null and pick::int = (x.o_keys->'answers'->(pslot - 1)->>i)::int then
      pts := 20 + case when coalesce((p_picks->i->>'ms')::int, 99999) < 8000 then 5 else 0 end;
    end if;
    s := s + pts; per := per || to_jsonb(pts);
  end loop;
  insert into public.plays as pl (match_id, couple_id, user_id, slot, data, score)
    values (p_match, x.o_c, uid, x.o_slot, jsonb_build_object('guess', p_picks, 'points', per), s)
    on conflict (match_id, user_id) do update
      set data = pl.data || jsonb_build_object('guess', p_picks, 'points', per), score = s;
  perform public._emoji_check(p_match, x.o_c);
  return public.match_state(p_match);
end $$;

-- Owner dashboard.
create or replace function public.admin_stats() returns json
language plpgsql stable security definer set search_path = public as $$
declare res json; d date := public.today_ist();
begin
  if not exists (select 1 from public.admins where user_id = auth.uid()) then raise exception 'Not authorized'; end if;
  select json_build_object(
    'users', (select count(*) from auth.users),
    'guests', (select count(*) from auth.users where is_anonymous),
    'registered', (select count(*) from auth.users where not is_anonymous),
    'couples', (select count(*) from public.couples),
    'complete_couples', (select count(*) from public.couples where p2 is not null),
    'guest_couples', (select count(*) from public.couples c where public.couple_has_guest(c.id)),
    'matches', (select count(*) from public.matches where status = 'complete'),
    'daily_today', (select count(*) from public.matches where daily_day = d and status = 'complete'),
    'active_today', (select count(distinct couple_id) from public.plays where (created_at at time zone 'Asia/Kolkata')::date = d),
    'active_7d', (select count(distinct couple_id) from public.plays where created_at > now() - interval '7 days'),
    'by_game', (select coalesce(json_object_agg(game, n), '{}'::json) from
                 (select game, count(*) n from public.matches where status = 'complete' group by game) g),
    'signups', (select coalesce(json_agg(r order by r.day), '[]'::json) from
                 (select (created_at at time zone 'Asia/Kolkata')::date as day, count(*) n
                  from auth.users where created_at > now() - interval '14 days' group by 1) r),
    'jodis', (select coalesce(json_agg(r), '[]'::json) from (
       select c.name, c.code, c.created_at, c.p2 is not null as complete, public.effective_streak(c) as streak,
         c.best_streak, c.coins, c.rating, c.wins, c.losses,
         (select name from public.profiles where id = c.p1) n1, (select name from public.profiles where id = c.p2) n2,
         (select case when u.is_anonymous then 'guest' else u.email end from auth.users u where u.id = c.p1) e1,
         (select case when u.is_anonymous then 'guest' else u.email end from auth.users u where u.id = c.p2) e2,
         (select count(*) from public.matches m where m.status = 'complete' and (m.couple_a = c.id or m.couple_b = c.id)) games,
         (select max(created_at) from public.plays p where p.couple_id = c.id) last_active
       from public.couples c order by c.created_at desc limit 300) r),
    'loners', (select count(*) from auth.users u where not exists (select 1 from public.profiles p where p.id = u.id and p.couple_id is not null))
  ) into res;
  return res;
end $$;

revoke execute on function public.submit_future(uuid, jsonb), public.emoji_clues(uuid, jsonb),
  public.submit_emoji_guess(uuid, jsonb), public.admin_stats() from public, anon;
grant execute on function public.submit_future(uuid, jsonb), public.emoji_clues(uuid, jsonb),
  public.submit_emoji_guess(uuid, jsonb), public.admin_stats() to authenticated;
revoke execute on function public.gen_content(text), public._emoji_check(uuid, uuid), public.couple_has_guest(uuid)
  from public, anon, authenticated;

insert into public.future_questions(q, options) values
('Where do we live in 10 years?', '[{"e": "🏙️", "t": "Big city flat"}, {"e": "🏡", "t": "House in our hometown"}, {"e": "🏔️", "t": "Cottage in the hills"}, {"e": "🌊", "t": "Home by the sea"}]'::jsonb),
('Our home vibe?', '[{"e": "🪴", "t": "Plants everywhere"}, {"e": "🛋️", "t": "Cosy and colourful"}, {"e": "✨", "t": "Modern and minimal"}, {"e": "📚", "t": "Books and fairy lights"}]'::jsonb),
('How many kids?', '[{"e": "🙅", "t": "None, just us"}, {"e": "👶", "t": "One"}, {"e": "👧👦", "t": "Two"}, {"e": "🏏", "t": "A cricket team"}]'::jsonb),
('Our first pet?', '[{"e": "🐶", "t": "Dog"}, {"e": "🐱", "t": "Cat"}, {"e": "🐠", "t": "Fish"}, {"e": "🦜", "t": "Parrot"}]'::jsonb),
('Sunday morning, 10 years from now?', '[{"e": "☕", "t": "Chai on the balcony"}, {"e": "🛌", "t": "Sleeping till noon"}, {"e": "🏃", "t": "Morning walk together"}, {"e": "🥞", "t": "Big family breakfast"}]'::jsonb),
('Our dream trip together?', '[{"e": "🗼", "t": "Paris"}, {"e": "🏝️", "t": "Maldives"}, {"e": "🏔️", "t": "Ladakh road trip"}, {"e": "🗾", "t": "Japan"}]'::jsonb),
('Who cooks dinner?', '[{"e": "👨‍🍳", "t": "Him"}, {"e": "👩‍🍳", "t": "Her"}, {"e": "🤝", "t": "Together"}, {"e": "📱", "t": "Swiggy, obviously"}]'::jsonb),
('Our car?', '[{"e": "🚙", "t": "Big SUV"}, {"e": "🚗", "t": "Small hatchback"}, {"e": "🏍️", "t": "A bike for two"}, {"e": "🚇", "t": "We take the metro"}]'::jsonb),
('How we celebrate anniversaries?', '[{"e": "🕯️", "t": "Candlelight dinner"}, {"e": "✈️", "t": "Surprise trip"}, {"e": "🏠", "t": "Quiet night at home"}, {"e": "🎉", "t": "Big party with friends"}]'::jsonb),
('When we''re 60?', '[{"e": "🌍", "t": "Travel the world"}, {"e": "🚜", "t": "Farmhouse life"}, {"e": "👵", "t": "Spoil the grandkids"}, {"e": "💼", "t": "Still running our business"}]'::jsonb),
('Our biggest dream together?', '[{"e": "🏠", "t": "Our own big home"}, {"e": "🌏", "t": "See the whole world"}, {"e": "🚀", "t": "Build a business"}, {"e": "🧘", "t": "A peaceful, simple life"}]'::jsonb),
('The festival we host every year?', '[{"e": "🪔", "t": "Diwali party"}, {"e": "🎨", "t": "Holi bash"}, {"e": "🎄", "t": "Christmas dinner"}, {"e": "🌙", "t": "Eid feast"}]'::jsonb),
('Our Friday nights?', '[{"e": "🍿", "t": "Movie at home"}, {"e": "🍻", "t": "Out with friends"}, {"e": "🍜", "t": "Trying a new restaurant"}, {"e": "😴", "t": "Asleep by 10"}]'::jsonb),
('Our weekend getaway spot?', '[{"e": "🏖️", "t": "Goa"}, {"e": "🌲", "t": "Rishikesh"}, {"e": "🏰", "t": "Jaipur"}, {"e": "☁️", "t": "Shimla"}]'::jsonb);

insert into public.movies(title) values
('Sholay'),
('Dilwale Dulhania Le Jayenge'),
('Kuch Kuch Hota Hai'),
('Kabhi Khushi Kabhie Gham'),
('3 Idiots'),
('Lagaan'),
('Dangal'),
('PK'),
('Om Shanti Om'),
('Chak De India'),
('Dil Chahta Hai'),
('Zindagi Na Milegi Dobara'),
('Yeh Jawaani Hai Deewani'),
('Jab We Met'),
('Queen'),
('Taare Zameen Par'),
('Munna Bhai MBBS'),
('Hera Pheri'),
('Andaz Apna Apna'),
('Baahubali'),
('RRR'),
('KGF'),
('Pushpa'),
('Kal Ho Naa Ho'),
('Main Hoon Na'),
('Mohabbatein'),
('Kaho Naa Pyaar Hai'),
('Dhoom'),
('Krrish'),
('Koi Mil Gaya'),
('Don'),
('Mr. India'),
('Mughal-e-Azam'),
('Mother India'),
('Devdas'),
('Bajirao Mastani'),
('Padmaavat'),
('Gully Boy'),
('Bhaag Milkha Bhaag'),
('Mary Kom'),
('Sultan'),
('Bajrangi Bhaijaan'),
('Ek Tha Tiger'),
('Pathaan'),
('Jawan'),
('Chennai Express'),
('Barfi'),
('Rockstar'),
('Tamasha'),
('Wake Up Sid'),
('Kabir Singh'),
('Animal'),
('Stree'),
('Bhool Bhulaiyaa'),
('Golmaal'),
('Welcome'),
('Singham'),
('Drishyam'),
('Andhadhun'),
('Badhaai Ho'),
('Dil Dhadakne Do'),
('English Vinglish'),
('Piku'),
('Kahaani'),
('Rang De Basanti'),
('Swades'),
('Jodhaa Akbar'),
('Fanaa'),
('Hum Aapke Hain Koun'),
('Maine Pyar Kiya'),
('Baazigar'),
('Dil To Pagal Hai'),
('Veer-Zaara'),
('Rab Ne Bana Di Jodi'),
('Bunty Aur Babli'),
('Band Baaja Baaraat'),
('Tanu Weds Manu'),
('2 States'),
('Brahmastra'),
('Ae Dil Hai Mushkil'),
('Jab Tak Hai Jaan'),
('Ghajini'),
('Taal'),
('Hum Dil De Chuke Sanam'),
('Kantara'),
('Sanju'),
('Uri'),
('Tumbbad'),
('Dhamaal'),
('Phir Hera Phera');
