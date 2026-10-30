-- Know Your Jodi game, invite preview for the one-tap join link, and the Jodi Report.

alter table public.matches drop constraint matches_game_check;
alter table public.matches add constraint matches_game_check
  check (game in ('sync','cricket','antakshari','hum','andaaza','rhythm','kyj'));

create table public.kyj_questions (
  id serial primary key,
  q text not null,        -- {p} = partner name, {P's} = partner's (rendered as you/your when answering about yourself)
  options jsonb not null,
  season text
);
alter table public.kyj_questions enable row level security;
revoke all on public.kyj_questions from anon, authenticated;

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
  if p_game not in ('sync','cricket','antakshari','hum','andaaza','rhythm','kyj') then raise exception 'Unknown game'; end if;
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
          else 30 + floor(random() * 46)::int end;
  update public.matches set ghost = true, b_done = true, score_b = gs where id = p_match;
  perform public.finalize_match(p_match);
  return public.match_state(p_match);
end $$;


-- Know Your Jodi: answer about yourself, and guess your partner's answer, for the same 5 questions.
create or replace function public.submit_kyj(p_match uuid, p_self jsonb, p_guess jsonb) returns json
language plpgsql security definer set search_path = public as $$
declare x record; uid uuid := auth.uid(); theirs public.plays; n int; i int; s int := 0; pts int; per jsonb := '[]';
begin
  select * into x from public._ctx(p_match);
  if x.o_game <> 'kyj' then raise exception 'Wrong game'; end if;
  if exists (select 1 from public.plays where match_id = p_match and user_id = uid and done) then
    raise exception 'You already played this round';
  end if;
  n := jsonb_array_length(x.o_content->'questions');
  if jsonb_typeof(p_self) <> 'array' or jsonb_array_length(p_self) <> n
     or jsonb_typeof(p_guess) <> 'array' or jsonb_array_length(p_guess) <> n then
    raise exception 'Answer every question';
  end if;
  insert into public.plays(match_id, couple_id, user_id, slot, data, done)
    values (p_match, x.o_c, uid, x.o_slot, jsonb_build_object('self', p_self, 'guess', p_guess), true)
    on conflict (match_id, user_id) do update set data = excluded.data, done = true;
  select * into theirs from public.plays where match_id = p_match and user_id = x.o_partner and done;
  if found then
    for i in 0..n-1 loop
      pts := (case when p_guess->>i = theirs.data->'self'->>i then 15 else 0 end)
           + (case when theirs.data->'guess'->>i = p_self->>i then 15 else 0 end);
      s := s + pts;
      per := per || to_jsonb(pts);
    end loop;
    update public.plays set score = s, data = data || jsonb_build_object('points', per)
     where match_id = p_match and couple_id = x.o_c;
    perform public.set_couple_done(p_match, x.o_c, s);
  end if;
  return public.match_state(p_match);
end $$;

-- Public preview for invite links: who is inviting, so the join screen can greet the partner.
create or replace function public.invite_info(p_code text) returns json
language sql stable security definer set search_path = public as $$
  select json_build_object('jodi', c.name, 'from', p.name, 'open', c.p2 is null)
  from public.couples c left join public.profiles p on p.id = c.p1
  where c.code = upper(trim(coalesce(p_code, '')))
$$;

-- The Jodi Report: what the games say about this couple.
create or replace function public.jodi_report() returns json
language plpgsql stable security definer set search_path = public as $$
declare c uuid := public.my_couple(); cp public.couples; res json;
  sync_total int; sync_match int; kyj_total int; kyj_right int; rnk int; games int;
  agrees jsonb; differs jsonb; n1 text; n2 text;
begin
  if c is null then raise exception 'Create or join a jodi first'; end if;
  select * into cp from public.couples where id = c;
  select name into n1 from public.profiles where id = cp.p1;
  select name into n2 from public.profiles where id = cp.p2;

  with pairs as (
    select m.content->'prompts' pr, a.data->'answers' aa, b.data->'answers' bb
    from public.plays a join public.plays b on b.match_id = a.match_id and b.couple_id = a.couple_id and b.slot = 2
    join public.matches m on m.id = a.match_id
    where a.couple_id = c and a.slot = 1 and a.done and b.done and m.game = 'sync'
  ), items as (
    select pr->(x.i::int - 1) p, x.e->>'pick' pa, bb->(x.i::int - 1)->>'pick' pb
    from pairs, jsonb_array_elements(aa) with ordinality x(e, i)
  )
  select count(*) filter (where pa is not null and pb is not null),
         count(*) filter (where pa is not null and pa = pb),
         (select jsonb_agg(t) from (select distinct on (p->>'q') (p->>'q') || ' ' || case pa when '0' then p->>'a' else p->>'b' end as t
            from items where pa is not null and pa = pb order by p->>'q', random() limit 3) z),
         (select jsonb_agg(t) from (select distinct on (p->>'q') jsonb_build_object('q', p->>'q',
              'a', case pa when '0' then p->>'a' else p->>'b' end, 'b', case pb when '0' then p->>'a' else p->>'b' end) as t
            from items where pa is not null and pb is not null and pa <> pb order by p->>'q', random() limit 2) z)
    into sync_total, sync_match, agrees, differs from items;

  with pairs as (
    select a.data a1, b.data b1
    from public.plays a join public.plays b on b.match_id = a.match_id and b.couple_id = a.couple_id and b.slot = 2
    join public.matches m on m.id = a.match_id
    where a.couple_id = c and a.slot = 1 and a.done and b.done and m.game = 'kyj'
  ), items as (
    select (a1->'guess'->>(i - 1)) = (b1->'self'->>(i - 1)) as r1, (b1->'guess'->>(i - 1)) = (a1->'self'->>(i - 1)) as r2
    from pairs, generate_series(1, jsonb_array_length(a1->'self')) i
  )
  select count(*) * 2, count(*) filter (where r1) + count(*) filter (where r2) into kyj_total, kyj_right from items;

  select count(*) into games from public.matches m
   where m.status = 'complete' and (m.couple_a = c or m.couple_b = c);
  select 1 + count(*) into rnk from public.couples o where o.p2 is not null and o.rating > cp.rating;

  return json_build_object(
    'names', json_build_array(n1, n2), 'jodi', cp.name, 'badge', cp.badge,
    'games', games, 'wins', cp.wins, 'losses', cp.losses, 'rating', cp.rating, 'rank', rnk,
    'jodis', (select count(*) from public.couples where p2 is not null),
    'streak', public.effective_streak(cp), 'best_streak', cp.best_streak,
    'sync_pct', case when sync_total > 0 then round(100.0 * sync_match / sync_total) end, 'sync_total', sync_total,
    'kyj_pct', case when kyj_total > 0 then round(100.0 * kyj_right / kyj_total) end, 'kyj_total', kyj_total,
    'agrees', coalesce(agrees, '[]'::jsonb), 'differs', coalesce(differs, '[]'::jsonb));
end $$;

revoke execute on function public.submit_kyj(uuid, jsonb, jsonb), public.jodi_report(), public.invite_info(text) from public;
grant execute on function public.submit_kyj(uuid, jsonb, jsonb), public.jodi_report() to authenticated;
grant execute on function public.invite_info(text) to anon, authenticated;
revoke execute on function public.gen_content(text) from public, anon, authenticated;

insert into public.kyj_questions(q, options, season) values
('What would {p} order at a dhaba?', '["Paneer butter masala", "Dal makhani", "Butter chicken", "Aloo paratha"]'::jsonb, null),
('{P''s} ideal Sunday?', '["Sleep till noon", "Long drive", "Movie marathon", "Family lunch"]'::jsonb, null),
('What scares {p} the most?', '["Cockroaches", "Heights", "The dark", "Interviews and exams"]'::jsonb, null),
('{P''s} go-to comfort food?', '["Maggi", "Khichdi", "Biryani", "Ice cream"]'::jsonb, null),
('Which superpower would {p} pick?', '["Teleport", "Read minds", "Become invisible", "Time travel"]'::jsonb, null),
('{P''s} dream holiday?', '["Maldives", "Switzerland", "Ladakh road trip", "Bali"]'::jsonb, null),
('What does {p} do when angry?', '["Goes silent", "Raises voice", "Eats something", "Sleeps it off"]'::jsonb, null),
('If {p} won ₹1 crore, the first thing?', '["Buy a house", "Buy a car", "Trip abroad", "Save it all"]'::jsonb, null),
('{P''s} morning mood?', '["Fresh and chirpy", "Don''t talk to me", "Chai first, then talk", "Snooze five times"]'::jsonb, null),
('Which chore does {p} hate most?', '["Dishes", "Laundry", "Cleaning", "Grocery runs"]'::jsonb, null),
('{P''s} favourite season?', '["Summer", "Monsoon", "Winter", "Spring"]'::jsonb, null),
('Where would {p} rather live?', '["Mumbai", "Delhi", "Bengaluru", "Hometown"]'::jsonb, null),
('What would {p} binge-watch?', '["Crime thriller", "Rom-com", "Comedy", "Reality show"]'::jsonb, null),
('{P''s} biggest weakness?', '["Sweets", "Shopping", "Phone", "Sleep"]'::jsonb, null),
('How does {p} show love?', '["Gifts", "Sweet words", "Time together", "Doing little things"]'::jsonb, null),
('At a party, {p} is…', '["On the dance floor", "Near the food", "Running the music", "First to leave"]'::jsonb, null),
('Which pet would {p} choose?', '["Dog", "Cat", "Fish", "No pet"]'::jsonb, null),
('{P''s} favourite street food?', '["Pani puri", "Momos", "Chaat", "Vada pav"]'::jsonb, null),
('What does {p} spend most on?', '["Food", "Clothes", "Gadgets", "Travel"]'::jsonb, null),
('{P''s} most-used app?', '["Instagram", "YouTube", "WhatsApp", "Games"]'::jsonb, null),
('On a long journey, {p} wants…', '["Window seat", "Aisle seat", "To sleep all the way", "Snacks, lots of snacks"]'::jsonb, null),
('{P''s} ideal date?', '["Fancy dinner", "Street food walk", "Movie night", "Long drive"]'::jsonb, null),
('When {p} sees a cockroach…', '["Kills it", "Screams", "Calls for help", "Leaves the room"]'::jsonb, null),
('{P''s} hidden talent?', '["Singing", "Dancing", "Cooking", "Mimicry"]'::jsonb, null),
('What makes {p} cry fastest?', '["Emotional movies", "Fights", "Missing family", "Only onions"]'::jsonb, null),
('{P''s} chai style?', '["Kadak", "Extra sugar", "Elaichi wali", "Coffee, not chai"]'::jsonb, null),
('If {p} could switch careers?', '["Chef", "Travel vlogger", "Actor or singer", "Own business"]'::jsonb, null),
('In a zombie apocalypse, {p}…', '["Leads the group", "Hides well", "Survives somehow", "Goes first 😅"]'::jsonb, null),
('{P''s} favourite festival?', '["Diwali", "Holi", "Eid", "Christmas"]'::jsonb, null),
('What would {p} never share?', '["Food", "Phone charger", "Blanket", "TV remote"]'::jsonb, null),
('{P''s} Diwali job?', '["Lights and decor", "Rangoli", "Mithai tasting", "Avoiding cleaning"]'::jsonb, 'diwali26'),
('{P''s} favourite Diwali sweet?', '["Kaju katli", "Gulab jamun", "Rasgulla", "Soan papdi"]'::jsonb, 'diwali26'),
('At a shaadi, {p} is mostly…', '["Dancing", "At the food counters", "Clicking photos", "Meeting relatives"]'::jsonb, 'shaadi26'),
('{P''s} wedding-day look?', '["Grand and heavy", "Simple and elegant", "Trendy", "Whatever is comfy"]'::jsonb, 'shaadi26');
