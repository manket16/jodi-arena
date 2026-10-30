-- ============ helpers ============

create or replace function public.my_couple() returns uuid
language sql stable security definer set search_path = public as $$
  select couple_id from public.profiles where id = auth.uid()
$$;

create or replace function public.norm_title(t text) returns text
language sql immutable set search_path = public as $$
  select trim(regexp_replace(regexp_replace(lower(coalesce(t,'')), '[^a-z0-9]+', ' ', 'g'), '\s+', ' ', 'g'))
$$;

-- Next Antakshari letter: last letter of the title that at least one song starts with.
create or replace function public.next_letter(n text) returns text
language plpgsql stable set search_path = public as $$
declare i int; ch text;
begin
  for i in reverse char_length(n)..1 loop
    ch := substr(n, i, 1);
    if ch ~ '[a-z]' and exists (select 1 from public.songs where first_letter = ch) then
      return ch;
    end if;
  end loop;
  return 'a';
end $$;

create or replace function public.gen_code() returns text
language plpgsql volatile set search_path = public as $$
declare c text;
begin
  loop
    select string_agg(substr('ABCDEFGHJKMNPQRSTUVWXYZ23456789', floor(random()*31)::int + 1, 1), '')
      into c from generate_series(1,6);
    exit when not exists (select 1 from public.couples where code = c);
  end loop;
  return c;
end $$;

-- ============ couple setup ============

create or replace function public.create_couple(p_team text, p_name text) returns json
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); cid uuid; v_code text;
begin
  if uid is null then raise exception 'Please sign in first'; end if;
  p_team := trim(coalesce(p_team,'')); p_name := trim(coalesce(p_name,''));
  if char_length(p_team) < 2 or char_length(p_team) > 30 then raise exception 'Jodi name must be 2 to 30 characters'; end if;
  if char_length(p_name) < 1 or char_length(p_name) > 30 then raise exception 'Please enter your name'; end if;
  if exists (select 1 from public.profiles where id = uid and couple_id is not null) then
    raise exception 'You are already in a jodi';
  end if;
  v_code := public.gen_code();
  insert into public.couples(name, code, p1) values (p_team, v_code, uid) returning id into cid;
  insert into public.profiles(id, name, couple_id) values (uid, p_name, cid)
    on conflict (id) do update set name = excluded.name, couple_id = excluded.couple_id;
  return json_build_object('couple_id', cid, 'code', v_code);
end $$;

create or replace function public.join_couple(p_code text, p_name text) returns json
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); c public.couples;
begin
  if uid is null then raise exception 'Please sign in first'; end if;
  p_name := trim(coalesce(p_name,''));
  if char_length(p_name) < 1 or char_length(p_name) > 30 then raise exception 'Please enter your name'; end if;
  if exists (select 1 from public.profiles where id = uid and couple_id is not null) then
    raise exception 'You are already in a jodi';
  end if;
  select * into c from public.couples where code = upper(trim(coalesce(p_code,''))) for update;
  if not found then raise exception 'No jodi found with that code'; end if;
  if c.p1 = uid then raise exception 'That is your own code. Share it with your partner'; end if;
  if c.p2 is not null then raise exception 'This jodi already has two partners'; end if;
  update public.couples set p2 = uid where id = c.id;
  insert into public.profiles(id, name, couple_id) values (uid, p_name, c.id)
    on conflict (id) do update set name = excluded.name, couple_id = excluded.couple_id;
  return json_build_object('couple_id', c.id, 'name', c.name);
end $$;

-- ============ content generation ============

create or replace function public.gen_content(p_game text, out o_content jsonb, out o_keys jsonb)
language plpgsql volatile security definer set search_path = public as $$
declare
  ids int[]; i int; t text; opts text[]; sets jsonb := '[[],[]]'; options jsonb := '[[],[]]';
  answers jsonb := '[[],[]]'; s int; k int;
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
  else
    raise exception 'Unknown game';
  end if;
end $$;

-- ============ matchmaking ============

create or replace function public.start_match(p_game text) returns uuid
language plpgsql security definer set search_path = public as $$
declare c uuid := public.my_couple(); mid uuid; g record;
begin
  if c is null then raise exception 'Create or join a jodi first'; end if;
  if (select p2 from public.couples where id = c) is null then
    raise exception 'Your partner needs to join with your code first';
  end if;
  if p_game not in ('sync','cricket','antakshari','hum') then raise exception 'Unknown game'; end if;

  -- 1. an unfinished match for this couple (so both partners land in the same one)
  select id into mid from public.matches
   where game = p_game and ((couple_a = c and not a_done) or (couple_b = c and not b_done))
   order by created_at desc limit 1;
  if mid is not null then return mid; end if;

  -- 2. join another couple's open match
  select id into mid from public.matches
   where game = p_game and status = 'open' and couple_b is null and not ghost
     and couple_a <> c and created_at > now() - interval '3 days'
   order by a_done desc, created_at asc
   limit 1 for update skip locked;
  if mid is not null then
    update public.matches set couple_b = c where id = mid;
    return mid;
  end if;

  -- 3. create a new one
  select * into g from public.gen_content(p_game);
  insert into public.matches(game, content, keys, couple_a)
    values (p_game, g.o_content, g.o_keys, c) returning id into mid;
  return mid;
end $$;

-- Shared context loader for a match the caller belongs to.
create or replace function public._ctx(p_match uuid,
  out o_c uuid, out o_side text, out o_slot int, out o_partner uuid,
  out o_game text, out o_content jsonb, out o_keys jsonb, out o_couple_done boolean, out o_status text)
language plpgsql stable security definer set search_path = public as $$
declare uid uuid := auth.uid(); m public.matches; cp public.couples;
begin
  o_c := public.my_couple();
  select * into m from public.matches where id = p_match;
  if not found or o_c is null or (m.couple_a <> o_c and m.couple_b is distinct from o_c) then
    raise exception 'Match not found';
  end if;
  select * into cp from public.couples where id = o_c;
  o_side := case when m.couple_a = o_c then 'a' else 'b' end;
  o_slot := case when cp.p1 = uid then 1 else 2 end;
  o_partner := case when cp.p1 = uid then cp.p2 else cp.p1 end;
  o_game := m.game; o_content := m.content; o_keys := m.keys; o_status := m.status;
  o_couple_done := case when o_side = 'a' then m.a_done else m.b_done end;
end $$;

create or replace function public.finalize_match(p_match uuid) returns void
language plpgsql security definer set search_path = public as $$
declare m public.matches; ra int; rb int; ea float; sa float; w uuid;
  ghost_id constant uuid := '00000000-0000-0000-0000-000000000000';
begin
  select * into m from public.matches where id = p_match for update;
  if m.status = 'complete' or not (m.a_done and m.b_done) then return; end if;

  if m.score_a > m.score_b then w := m.couple_a; sa := 1;
  elsif m.score_a < m.score_b then w := coalesce(m.couple_b, ghost_id); sa := 0;
  else w := null; sa := 0.5; end if;

  select rating into ra from public.couples where id = m.couple_a;
  rb := coalesce((select rating from public.couples where id = m.couple_b), 1000);
  ea := 1.0 / (1.0 + power(10.0, (rb - ra) / 400.0));

  update public.couples set
    rating = rating + round(32 * (sa - ea))::int,
    coins = coins + case when m.ghost then (case when sa = 1 then 30 when sa = 0 then 5 else 15 end)
                         else (case when sa = 1 then 50 when sa = 0 then 10 else 25 end) end,
    wins = wins + (sa = 1)::int, losses = losses + (sa = 0)::int, draws = draws + (sa = 0.5)::int
  where id = m.couple_a;

  if m.couple_b is not null then
    update public.couples set
      rating = rating + round(32 * ((1 - sa) - (1 - ea)))::int,
      coins = coins + case when sa = 0 then 50 when sa = 1 then 10 else 25 end,
      wins = wins + (sa = 0)::int, losses = losses + (sa = 1)::int, draws = draws + (sa = 0.5)::int
    where id = m.couple_b;
  end if;

  update public.matches set status = 'complete', winner = w, completed_at = now() where id = p_match;
end $$;

create or replace function public.set_couple_done(p_match uuid, p_couple uuid, p_score int) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.matches set a_done = true, score_a = p_score where id = p_match and couple_a = p_couple and not a_done;
  update public.matches set b_done = true, score_b = p_score where id = p_match and couple_b = p_couple and not b_done;
  perform public.finalize_match(p_match);
end $$;

-- ============ state ============

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

create or replace function public.get_home() returns json
language plpgsql stable security definer set search_path = public as $$
declare uid uuid := auth.uid(); p public.profiles; cp public.couples; partner uuid; res json;
begin
  if uid is null then raise exception 'Please sign in first'; end if;
  select * into p from public.profiles where id = uid;
  if p.couple_id is null then
    return json_build_object('profile', json_build_object('name', p.name), 'couple', null, 'matches', '[]'::json);
  end if;
  select * into cp from public.couples where id = p.couple_id;
  partner := case when cp.p1 = uid then cp.p2 else cp.p1 end;
  select json_build_object(
    'profile', json_build_object('name', p.name),
    'couple', json_build_object(
      'id', cp.id, 'name', cp.name, 'code', cp.code, 'coins', cp.coins, 'rating', cp.rating,
      'wins', cp.wins, 'losses', cp.losses, 'draws', cp.draws, 'badge', cp.badge, 'badges', cp.badges,
      'slot', case when cp.p1 = uid then 1 else 2 end,
      'partner_name', (select name from public.profiles where id = partner),
      'complete', cp.p2 is not null),
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
        where (m.couple_a = cp.id or m.couple_b = cp.id)
          and (m.status = 'open' or m.completed_at > now() - interval '2 days')
        order by m.created_at desc limit 20) r), '[]'::json)
  ) into res;
  return res;
end $$;

-- ============ game submissions ============

create or replace function public.submit_sync(p_match uuid, p_answers jsonb) returns json
language plpgsql security definer set search_path = public as $$
declare x record; uid uuid := auth.uid(); theirs public.plays; n int; i int; s int := 0;
  pa text; pb text; ma int; mb int;
begin
  select * into x from public._ctx(p_match);
  if x.o_game <> 'sync' then raise exception 'Wrong game'; end if;
  if exists (select 1 from public.plays where match_id = p_match and user_id = uid and done) then
    raise exception 'You already played this round';
  end if;
  n := jsonb_array_length(x.o_content->'prompts');
  if jsonb_typeof(p_answers) <> 'array' or jsonb_array_length(p_answers) <> n then raise exception 'Bad answers'; end if;

  insert into public.plays(match_id, couple_id, user_id, slot, data, done)
    values (p_match, x.o_c, uid, x.o_slot, jsonb_build_object('answers', p_answers), true)
    on conflict (match_id, user_id) do update set data = excluded.data, done = true;

  select * into theirs from public.plays where match_id = p_match and user_id = x.o_partner and done;
  if found then
    for i in 0..n-1 loop
      pa := p_answers->i->>'pick'; pb := theirs.data->'answers'->i->>'pick';
      ma := coalesce((p_answers->i->>'ms')::int, 99999); mb := coalesce((theirs.data->'answers'->i->>'ms')::int, 99999);
      if pa is not null and pa = pb then
        s := s + 10;
        if ma < 2500 and mb < 2500 then s := s + 5; end if;
      end if;
    end loop;
    update public.plays set score = s where match_id = p_match and couple_id = x.o_c;
    perform public.set_couple_done(p_match, x.o_c, s);
  end if;
  return public.match_state(p_match);
end $$;

create or replace function public.place_bet(p_match uuid, p_stake int) returns json
language plpgsql security definer set search_path = public as $$
declare x record; uid uuid := auth.uid();
begin
  select * into x from public._ctx(p_match);
  if x.o_game <> 'cricket' then raise exception 'Bets are only for Couple Cricket'; end if;
  if p_stake not in (10, 25, 50) then raise exception 'Stake must be 10, 25 or 50'; end if;
  if exists (select 1 from public.plays where match_id = p_match and user_id = x.o_partner) then
    raise exception 'Your partner has already started batting';
  end if;
  if exists (select 1 from public.bets where match_id = p_match and bettor = uid) then
    raise exception 'You already placed a bet';
  end if;
  update public.couples set coins = coins - p_stake where id = x.o_c and coins >= p_stake;
  if not found then raise exception 'Not enough coins'; end if;
  insert into public.bets(match_id, couple_id, bettor, target, stake)
    values (p_match, x.o_c, uid, x.o_partner, p_stake);
  return public.match_state(p_match);
end $$;

create or replace function public.cricket_ball(p_match uuid, p_idx int, p_pick int, p_ms int) returns json
language plpgsql security definer set search_path = public as $$
declare x record; uid uuid := auth.uid(); mine public.plays; theirs public.plays; balls jsonb;
  q jsonb; ans int; ok boolean; r int; total int; over boolean; b public.bets;
begin
  select * into x from public._ctx(p_match);
  if x.o_game <> 'cricket' then raise exception 'Wrong game'; end if;
  select * into mine from public.plays where match_id = p_match and user_id = uid for update;
  if mine.done then raise exception 'Your innings is over'; end if;
  balls := coalesce(mine.data->'balls', '[]'::jsonb);
  if p_idx <> jsonb_array_length(balls) or p_idx > 5 then raise exception 'Ball out of order'; end if;

  q := x.o_content->'questions'->((x.o_slot - 1) * 6 + p_idx);
  ans := (x.o_keys->'answers'->>((x.o_slot - 1) * 6 + p_idx))::int;
  ok := p_pick is not null and p_pick = ans;
  r := case when not ok then 0 when (q->>'difficulty')::int = 1 then 2 when (q->>'difficulty')::int = 2 then 4 else 6 end;
  balls := balls || jsonb_build_object('pick', p_pick, 'ms', p_ms, 'ok', ok, 'runs', r);
  total := coalesce(mine.score, 0) + r;
  over := (not ok) or p_idx = 5;

  insert into public.plays as pl (match_id, couple_id, user_id, slot, data, score, done)
    values (p_match, x.o_c, uid, x.o_slot, jsonb_build_object('balls', balls), total, over)
    on conflict (match_id, user_id) do update set data = jsonb_build_object('balls', balls), score = total, done = over;

  if over then
    select * into b from public.bets where match_id = p_match and target = uid and not resolved for update;
    if found then
      update public.bets set resolved = true, won = (total >= b.threshold) where id = b.id;
      if total >= b.threshold then
        update public.couples set coins = coins + b.stake * 2 where id = x.o_c;
      end if;
    end if;
    select * into theirs from public.plays where match_id = p_match and user_id = x.o_partner and done;
    if found then
      perform public.set_couple_done(p_match, x.o_c, total + theirs.score);
    end if;
  end if;

  return json_build_object('ok', ok, 'answer', ans, 'runs', r, 'total', total, 'out', not ok, 'over', over,
                           'state', public.match_state(p_match));
end $$;

create or replace function public.submit_antakshari(p_match uuid, p_songs jsonb) returns json
language plpgsql security definer set search_path = public as $$
declare x record; uid uuid := auth.uid(); theirs public.plays; expected text; used text[] := '{}';
  mine text[] := '{}'; t text; n text; valid int := 0;
begin
  select * into x from public._ctx(p_match);
  if x.o_game <> 'antakshari' then raise exception 'Wrong game'; end if;
  if exists (select 1 from public.plays where match_id = p_match and user_id = uid and done) then
    raise exception 'You already played your turn';
  end if;
  if jsonb_typeof(p_songs) <> 'array' or jsonb_array_length(p_songs) > 60 then raise exception 'Bad songs'; end if;

  select * into theirs from public.plays where match_id = p_match and user_id = x.o_partner and done;
  if x.o_slot = 2 then
    if not found then raise exception 'Wait for your partner to finish their turn first'; end if;
    expected := theirs.data->>'next';
    used := array(select public.norm_title(v) from jsonb_array_elements_text(theirs.data->'songs') v);
  else
    expected := x.o_content->>'start';
  end if;

  for t in select v from jsonb_array_elements_text(p_songs) v loop
    n := public.norm_title(t);
    exit when not exists (select 1 from public.songs where norm = n);
    exit when left(n, 1) <> expected;
    exit when n = any(used);
    used := used || n;
    mine := mine || (select title from public.songs where norm = n);
    valid := valid + 1;
    expected := public.next_letter(n);
  end loop;

  insert into public.plays(match_id, couple_id, user_id, slot, data, score, done)
    values (p_match, x.o_c, uid, x.o_slot, jsonb_build_object('songs', to_jsonb(mine), 'next', expected), valid * 10, true)
    on conflict (match_id, user_id) do update set data = excluded.data, score = excluded.score, done = true;

  if x.o_slot = 2 then
    perform public.set_couple_done(p_match, x.o_c, valid * 10 + theirs.score);
  end if;
  return public.match_state(p_match);
end $$;

create or replace function public._hum_check(p_match uuid, p_couple uuid) returns void
language plpgsql security definer set search_path = public as $$
declare total int;
begin
  update public.plays set done = (data ? 'clips' and data ? 'guess')
   where match_id = p_match and couple_id = p_couple;
  if (select count(*) from public.plays where match_id = p_match and couple_id = p_couple and done) = 2 then
    select sum(score) into total from public.plays where match_id = p_match and couple_id = p_couple;
    perform public.set_couple_done(p_match, p_couple, total);
  end if;
end $$;

create or replace function public.hum_recorded(p_match uuid, p_clips jsonb) returns json
language plpgsql security definer set search_path = public as $$
declare x record; uid uuid := auth.uid(); prefix text; v text;
begin
  select * into x from public._ctx(p_match);
  if x.o_game <> 'hum' then raise exception 'Wrong game'; end if;
  if jsonb_typeof(p_clips) <> 'array' or jsonb_array_length(p_clips) <> 3 then raise exception 'Record all 3 hums'; end if;
  prefix := p_match::text || '/' || x.o_c::text || '/' || uid::text || '/';
  for v in select e from jsonb_array_elements_text(p_clips) e loop
    if left(v, char_length(prefix)) <> prefix then raise exception 'Bad clip path'; end if;
  end loop;
  insert into public.plays as pl (match_id, couple_id, user_id, slot, data)
    values (p_match, x.o_c, uid, x.o_slot, jsonb_build_object('clips', p_clips))
    on conflict (match_id, user_id) do update set data = pl.data || jsonb_build_object('clips', p_clips);
  perform public._hum_check(p_match, x.o_c);
  return public.match_state(p_match);
end $$;

create or replace function public.submit_hum_guess(p_match uuid, p_picks jsonb) returns json
language plpgsql security definer set search_path = public as $$
declare x record; uid uuid := auth.uid(); i int; s int := 0; pslot int; pick text;
begin
  select * into x from public._ctx(p_match);
  if x.o_game <> 'hum' then raise exception 'Wrong game'; end if;
  if not exists (select 1 from public.plays where match_id = p_match and user_id = x.o_partner and data ? 'clips') then
    raise exception 'Your partner has not recorded their hums yet';
  end if;
  if exists (select 1 from public.plays where match_id = p_match and user_id = uid and data ? 'guess') then
    raise exception 'You already guessed';
  end if;
  pslot := 3 - x.o_slot;
  for i in 0..2 loop
    pick := p_picks->i->>'pick';
    if pick is not null and pick::int = (x.o_keys->'answers'->(pslot - 1)->>i)::int then
      s := s + 10;
      if coalesce((p_picks->i->>'ms')::int, 99999) < 6000 then s := s + 5; end if;
    end if;
  end loop;
  insert into public.plays as pl (match_id, couple_id, user_id, slot, data, score)
    values (p_match, x.o_c, uid, x.o_slot, jsonb_build_object('guess', p_picks), s)
    on conflict (match_id, user_id) do update
      set data = pl.data || jsonb_build_object('guess', p_picks), score = s;
  perform public._hum_check(p_match, x.o_c);
  return public.match_state(p_match);
end $$;

-- Play against a ghost if no real couple has joined yet.
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
          else 30 + floor(random() * 46)::int end;
  update public.matches set ghost = true, b_done = true, score_b = gs where id = p_match;
  perform public.finalize_match(p_match);
  return public.match_state(p_match);
end $$;

-- ============ social & shop ============

create or replace function public.leaderboard() returns json
language sql stable security definer set search_path = public as $$
  select coalesce(json_agg(r), '[]'::json) from (
    select c.name, c.badge, c.rating, c.wins, c.losses,
      (select count(*) from public.matches m where m.winner = c.id and m.completed_at >= date_trunc('week', now())) as week_wins,
      c.id = public.my_couple() as me
    from public.couples c where c.p2 is not null
    order by c.rating desc, c.wins desc limit 50) r
$$;

create or replace function public.buy_badge(p_badge text) returns json
language plpgsql security definer set search_path = public as $$
declare c uuid := public.my_couple(); price int;
  prices constant jsonb := '{"💞":0,"🌻":100,"🏏":120,"🎤":120,"🔥":150,"🪔":200,"👑":300}';
begin
  if c is null then raise exception 'Create or join a jodi first'; end if;
  if not prices ? p_badge then raise exception 'Unknown badge'; end if;
  price := (prices->>p_badge)::int;
  if not exists (select 1 from public.couples where id = c and p_badge = any(badges)) then
    update public.couples set coins = coins - price, badges = badges || p_badge
     where id = c and coins >= price;
    if not found then raise exception 'Not enough coins'; end if;
  end if;
  update public.couples set badge = p_badge where id = c;
  return public.get_home();
end $$;

-- ============ permissions ============

revoke execute on all functions in schema public from public, anon;
grant execute on function
  public.my_couple(), public.create_couple(text, text), public.join_couple(text, text),
  public.start_match(text), public.match_state(uuid), public.get_home(),
  public.submit_sync(uuid, jsonb), public.place_bet(uuid, int), public.cricket_ball(uuid, int, int, int),
  public.submit_antakshari(uuid, jsonb), public.hum_recorded(uuid, jsonb), public.submit_hum_guess(uuid, jsonb),
  public.play_ghost(uuid), public.leaderboard(), public.buy_badge(text), public.norm_title(text)
to authenticated;
revoke execute on function public.gen_content(text), public._ctx(uuid), public.finalize_match(uuid),
  public.set_couple_done(uuid, uuid, int), public._hum_check(uuid, uuid), public.gen_code(), public.next_letter(text)
from authenticated;

-- ============ storage for hum clips ============

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('hums', 'hums', false, 3145728, array['audio/webm','audio/mp4','audio/ogg','audio/mpeg','audio/aac','audio/x-m4a','audio/wav'])
on conflict (id) do nothing;

create policy "hum upload own couple" on storage.objects for insert to authenticated
  with check (bucket_id = 'hums' and (storage.foldername(name))[2] = public.my_couple()::text
              and (storage.foldername(name))[3] = auth.uid()::text);
create policy "hum update own" on storage.objects for update to authenticated
  using (bucket_id = 'hums' and (storage.foldername(name))[3] = auth.uid()::text);
create policy "hum read own couple" on storage.objects for select to authenticated
  using (bucket_id = 'hums' and (storage.foldername(name))[2] = public.my_couple()::text);
