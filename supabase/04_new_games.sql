-- Adds two games: Andaaza (blind number estimate, couple answer = average) and Rhythm Lock (tap a beat from memory).

alter table public.matches drop constraint matches_game_check;
alter table public.matches add constraint matches_game_check
  check (game in ('sync','cricket','antakshari','hum','andaaza','rhythm'));

create table public.estimates (
  id serial primary key,
  q text not null,
  answer numeric not null,
  tol numeric not null,          -- guess this far off scores 0
  unit text not null default '',
  lo numeric not null,           -- slider range
  hi numeric not null
);
alter table public.estimates enable row level security;
revoke all on public.estimates from anon, authenticated;

create or replace function public.gen_content(p_game text, out o_content jsonb, out o_keys jsonb)
language plpgsql volatile security definer set search_path = public as $$
declare
  ids int[]; i int; t text; opts text[]; sets jsonb := '[[],[]]'; options jsonb := '[[],[]]';
  answers jsonb := '[[],[]]'; s int; k int; beats jsonb := '[0]'; tms int := 0;
begin
  if p_game = 'sync' then
    select jsonb_agg(jsonb_build_object('id', x.id, 'q', x.prompt, 'a', x.a, 'b', x.b))
      into o_content from (select * from public.sync_prompts order by random() limit 10) x;
    o_content := jsonb_build_object('prompts', o_content);
    o_keys := '{}'::jsonb;
  elsif p_game = 'cricket' then
    with q as (
      select x.*, row_number() over () as rn
      from (select * from public.trivia order by random() limit 12) x
    )
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
      sets := jsonb_set(sets, array[s::text], (sets->s) || jsonb_build_array(t));
      options := jsonb_set(options, array[s::text], (options->s) || jsonb_build_array(to_jsonb(opts)));
      answers := jsonb_set(answers, array[s::text], (answers->s) || to_jsonb(k));
    end loop;
    o_content := '{}'::jsonb;
    o_keys := jsonb_build_object('sets', sets, 'options', options, 'answers', answers);
  elsif p_game = 'andaaza' then
    with q as (
      select x.*, row_number() over () as rn
      from (select * from public.estimates order by random() limit 6) x
    )
    select jsonb_agg(jsonb_build_object('id', q.id, 'q', q.q, 'unit', q.unit, 'lo', q.lo, 'hi', q.hi) order by q.rn),
           jsonb_agg(jsonb_build_object('answer', q.answer, 'tol', q.tol) order by q.rn)
      into o_content, o_keys from q;
    o_content := jsonb_build_object('questions', o_content);
    o_keys := jsonb_build_object('answers', o_keys);
  elsif p_game = 'rhythm' then
    -- 8 beats, gaps chosen from a small musical set so the pattern is memorable
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
  if p_game not in ('sync','cricket','antakshari','hum','andaaza','rhythm') then raise exception 'Unknown game'; end if;
  select id into mid from public.matches
   where game = p_game and ((couple_a = c and not a_done) or (couple_b = c and not b_done))
   order by created_at desc limit 1;
  if mid is not null then return mid; end if;
  select id into mid from public.matches
   where game = p_game and status = 'open' and couple_b is null and not ghost
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

create or replace function public.match_state(p_match uuid) returns json
language plpgsql stable security definer set search_path = public as $$
declare x record; m public.matches; uid uuid := auth.uid();
  mine public.plays; theirs public.plays; rival uuid; extra jsonb := '{}'::jsonb; pslot int;
  my_bet public.bets; their_bet public.bets;
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
    'result', case when m.status <> 'complete' then null
                   when m.winner is null then 'draw'
                   when m.winner = x.o_c then 'win' else 'loss' end,
    'extra', extra);
end $$;

-- Andaaza: each partner guesses blind; the jodi's answer is the average of both guesses.
create or replace function public.submit_andaaza(p_match uuid, p_guesses jsonb) returns json
language plpgsql security definer set search_path = public as $$
declare x record; uid uuid := auth.uid(); theirs public.plays; n int; i int; s int := 0;
  a numeric; b numeric; v_avg numeric; ans numeric; tol numeric; pts int; per jsonb := '[]';
begin
  select * into x from public._ctx(p_match);
  if x.o_game <> 'andaaza' then raise exception 'Wrong game'; end if;
  if exists (select 1 from public.plays where match_id = p_match and user_id = uid and done) then
    raise exception 'You already played this round';
  end if;
  n := jsonb_array_length(x.o_content->'questions');
  if jsonb_typeof(p_guesses) <> 'array' or jsonb_array_length(p_guesses) <> n then raise exception 'Bad guesses'; end if;
  for i in 0..n-1 loop
    if jsonb_typeof(p_guesses->i) <> 'number' then raise exception 'Bad guesses'; end if;
  end loop;

  insert into public.plays(match_id, couple_id, user_id, slot, data, done)
    values (p_match, x.o_c, uid, x.o_slot, jsonb_build_object('guesses', p_guesses), true)
    on conflict (match_id, user_id) do update set data = excluded.data, done = true;

  select * into theirs from public.plays where match_id = p_match and user_id = x.o_partner and done;
  if found then
    for i in 0..n-1 loop
      a := (p_guesses->>i)::numeric; b := (theirs.data->'guesses'->>i)::numeric;
      v_avg := (a + b) / 2;
      ans := (x.o_keys->'answers'->i->>'answer')::numeric;
      tol := (x.o_keys->'answers'->i->>'tol')::numeric;
      pts := greatest(0, round(20 - 20 * abs(v_avg - ans) / tol))::int;
      s := s + pts;
      per := per || to_jsonb(pts);
    end loop;
    update public.plays set score = s, data = data || jsonb_build_object('points', per)
     where match_id = p_match and couple_id = x.o_c;
    perform public.set_couple_done(p_match, x.o_c, s);
  end if;
  return public.match_state(p_match);
end $$;

-- Rhythm Lock: taps are milliseconds; compared as gaps from each player's first tap.
create or replace function public.submit_rhythm(p_match uuid, p_taps jsonb) returns json
language plpgsql security definer set search_path = public as $$
declare x record; uid uuid := auth.uid(); theirs public.plays; beats jsonb; n int; i int; s int := 0;
  ta numeric; tb numeric; bt numeric; a0 numeric; b0 numeric; err numeric; pts int; per jsonb := '[]';
begin
  select * into x from public._ctx(p_match);
  if x.o_game <> 'rhythm' then raise exception 'Wrong game'; end if;
  if exists (select 1 from public.plays where match_id = p_match and user_id = uid and done) then
    raise exception 'You already played this round';
  end if;
  if jsonb_typeof(p_taps) <> 'array' or jsonb_array_length(p_taps) > 20 then raise exception 'Bad taps'; end if;

  insert into public.plays(match_id, couple_id, user_id, slot, data, done)
    values (p_match, x.o_c, uid, x.o_slot, jsonb_build_object('taps', p_taps), true)
    on conflict (match_id, user_id) do update set data = excluded.data, done = true;

  select * into theirs from public.plays where match_id = p_match and user_id = x.o_partner and done;
  if found then
    beats := x.o_content->'beats';
    n := jsonb_array_length(beats);
    a0 := (p_taps->>0)::numeric; b0 := (theirs.data->'taps'->>0)::numeric;
    for i in 0..n-1 loop
      bt := (beats->>i)::numeric;
      ta := (p_taps->>i)::numeric - a0;
      tb := (theirs.data->'taps'->>i)::numeric - b0;
      if ta is null or tb is null then
        per := per || to_jsonb(0);
        continue;
      end if;
      err := (abs(ta - bt) + abs(tb - bt)) / 2;
      pts := greatest(0, round(10 - err / 25))::int + greatest(0, round(5 - abs(ta - tb) / 30))::int;
      s := s + pts;
      per := per || to_jsonb(pts);
    end loop;
    update public.plays set score = s, data = data || jsonb_build_object('points', per)
     where match_id = p_match and couple_id = x.o_c;
    perform public.set_couple_done(p_match, x.o_c, s);
  end if;
  return public.match_state(p_match);
end $$;

create or replace function public.play_ghost(p_match uuid) returns json
language plpgsql security definer set search_path = public as $$
declare x record; m public.matches; gs int;
begin
  select * into x from public._ctx(p_match);
  select * into m from public.matches where id = p_match for update;
  if x.o_side <> 'a' or not m.a_done or m.couple_b is not null or m.status <> 'open' then
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

revoke execute on function public.submit_andaaza(uuid, jsonb), public.submit_rhythm(uuid, jsonb) from public, anon;
grant execute on function public.submit_andaaza(uuid, jsonb), public.submit_rhythm(uuid, jsonb) to authenticated;
revoke execute on function public.gen_content(text) from public, anon, authenticated;

insert into public.estimates(q, answer, tol, unit, lo, hi) values
('How tall is the Statue of Unity?', 182, 60, 'm', 0, 400),
('How tall is the Qutub Minar?', 73, 25, 'm', 0, 200),
('How tall is the Burj Khalifa?', 828, 250, 'm', 0, 1500),
('How tall is Mount Everest?', 8849, 2000, 'm', 0, 15000),
('How long is the Ganga river?', 2525, 800, 'km', 0, 6000),
('How far is the Moon from Earth?', 384400, 120000, 'km', 0, 1000000),
('How many bones are in an adult human body?', 206, 60, '', 0, 500),
('How many keys does a piano have?', 88, 25, '', 0, 200),
('How many players from one team are on a kabaddi court?', 7, 3, '', 0, 20),
('How many hours are there in a week?', 168, 40, 'hrs', 0, 400),
('How many minutes are there in a day?', 1440, 400, 'min', 0, 3000),
('Top speed of a cheetah?', 110, 40, 'km/h', 0, 250),
('How many international centuries did Sachin Tendulkar score?', 100, 30, '', 0, 200),
('How many states and union territories does India have?', 36, 10, '', 0, 80),
('How long is the film Lagaan?', 224, 60, 'min', 0, 400),
('Temperature on the surface of the Sun?', 5500, 2000, '°C', 0, 15000),
('India''s population?', 145, 40, 'crore', 0, 300),
('How many episodes did the 1988 TV Mahabharat have?', 94, 30, '', 0, 250),
('How old was Sachin at his Test debut?', 16, 4, 'yrs', 0, 40),
('In which year was Sholay released?', 1975, 10, '', 1930, 2025),
('In which year was DDLJ released?', 1995, 10, '', 1950, 2025),
('In which year was the first IPL season?', 2008, 6, '', 1990, 2025),
('In which year did Chandrayaan-3 land on the Moon?', 2023, 5, '', 2000, 2030),
('In which year was India''s first feature film, Raja Harishchandra, released?', 1913, 20, '', 1880, 1960),
('How many cards are in a standard deck?', 52, 15, '', 0, 120),
('How long was Gandhi''s Dandi March?', 390, 120, 'km', 0, 1000);
