-- Fresh every time: track what each jodi has already seen, pick unseen content first,
-- unlock deeper question levels as a jodi plays more, and add a lot more content.

create table public.seen_items (
  couple_id uuid not null references public.couples(id) on delete cascade,
  kind text not null,
  item_id int not null,
  seen_at timestamptz not null default now(),
  primary key (couple_id, kind, item_id)
);
alter table public.seen_items enable row level security;
revoke all on public.seen_items from anon, authenticated;

alter table public.sync_prompts add column depth smallint not null default 1;
alter table public.kyj_questions add column depth smallint not null default 1;
alter table public.future_questions add column depth smallint not null default 1;

-- ---------- levels ----------
create or replace function public._couple_level(p_couple uuid) returns int
language sql stable security definer set search_path = public as $$
  select 1 + (n >= 3)::int + (n >= 8)::int from (
    select count(*) as n from public.matches
     where (couple_a = p_couple and a_done) or (couple_b = p_couple and b_done)) x
$$;

create or replace function public.my_level() returns json
language plpgsql stable security definer set search_path = public as $$
declare c uuid := public.my_couple(); n int; lvl int;
begin
  if c is null then return null; end if;
  select count(*) into n from public.matches where (couple_a = c and a_done) or (couple_b = c and b_done);
  lvl := 1 + (n >= 3)::int + (n >= 8)::int;
  return json_build_object(
    'level', lvl, 'played', n,
    'next_at', case lvl when 1 then 3 when 2 then 8 else null end,
    'name', (array['Masti', 'Gehri Baatein', 'Dil Se'])[lvl],
    'next_name', case lvl when 1 then 'Gehri Baatein' when 2 then 'Dil Se' else null end,
    'seen', (select count(*) from public.seen_items where couple_id = c),
    'total', (select count(*) from public.sync_prompts) + (select count(*) from public.kyj_questions)
           + (select count(*) from public.future_questions) + (select count(*) from public.trivia)
           + (select count(*) from public.estimates) + (select count(*) from public.movies));
end $$;

-- ids of the content items inside a match
create or replace function public._content_ids(p_match uuid) returns table(kind text, item_id int)
language sql stable security definer set search_path = public as $$
  select m.game, (e->>'id')::int
    from public.matches m, jsonb_array_elements(coalesce(m.content->'prompts', m.content->'questions')) e
   where m.id = p_match and m.game in ('sync','cricket','andaaza','kyj','future') and e ? 'id'
  union
  select m.game, coalesce(s.id, mv.id)
    from public.matches m
    cross join lateral jsonb_array_elements(m.keys->'sets') st
    cross join lateral jsonb_array_elements_text(st) t
    left join public.songs s on m.game = 'hum' and s.title = t
    left join public.movies mv on m.game = 'emoji' and mv.title = t
   where m.id = p_match and m.game in ('hum','emoji') and coalesce(s.id, mv.id) is not null
$$;

create or replace function public._mark_seen(p_couple uuid, p_match uuid) returns void
language sql volatile security definer set search_path = public as $$
  insert into public.seen_items(couple_id, kind, item_id)
  select p_couple, kind, item_id from public._content_ids(p_match)
  on conflict do nothing
$$;

create or replace function public._seen_frac(p_couple uuid, p_match uuid) returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce(avg((s.item_id is not null)::int), 0)
    from public._content_ids(p_match) c
    left join public.seen_items s on s.couple_id = p_couple and s.kind = c.kind and s.item_id = c.item_id
$$;

-- backfill from matches already played
insert into public.seen_items(couple_id, kind, item_id)
select c.couple_id, x.kind, x.item_id
  from (select id, couple_a as couple_id from public.matches where couple_a is not null
        union select id, couple_b from public.matches where couple_b is not null) c
  cross join lateral public._content_ids(c.id) x
on conflict do nothing;

-- ---------- content generation, unseen first ----------
create or replace function public.gen_content_for(p_game text, p_couple uuid, out o_content jsonb, out o_keys jsonb)
language plpgsql volatile security definer set search_path = public as $$
declare
  ids int[]; i int; t text; opts text[]; v_sets jsonb := '[[],[]]'; v_options jsonb := '[[],[]]';
  v_answers jsonb := '[[],[]]'; s int; k int; beats jsonb := '[0]'; tms int := 0;
  v_tag text := (public.current_season()).tag;
  lvl int := case when p_couple is null then 2 else public._couple_level(p_couple) end;
begin
  if p_game = 'sync' then
    with c as (
      select p.*, exists (select 1 from public.seen_items x where x.couple_id = p_couple and x.kind = 'sync' and x.item_id = p.id) as sn
        from public.sync_prompts p where p.depth <= lvl and (p.season is null or p.season = v_tag)
    ), r as (select c.*, row_number() over (partition by c.season is not null order by c.sn, random()) as rk from c)
    select jsonb_agg(jsonb_build_object('id', x.id, 'q', x.prompt, 'a', x.a, 'b', x.b) order by random())
      into o_content from (select * from r where season is null or rk <= 4 order by sn, (season is not null) desc, random() limit 10) x;
    o_content := jsonb_build_object('prompts', o_content);
    o_keys := '{}'::jsonb;
  elsif p_game = 'cricket' then
    with c as (
      select p.*, exists (select 1 from public.seen_items x where x.couple_id = p_couple and x.kind = 'cricket' and x.item_id = p.id) as sn
        from public.trivia p where p.season is null or p.season = v_tag
    ), r as (select c.*, row_number() over (partition by c.season is not null order by c.sn, random()) as rk from c),
    picked as (select * from r where season is null or rk <= 4 order by sn, (season is not null) desc, random() limit 12),
    q as (select p.*, row_number() over (order by random()) as rn from picked p)
    select jsonb_agg(jsonb_build_object('id', q.id, 'q', q.q, 'options', q.options, 'difficulty', q.difficulty) order by q.rn),
           jsonb_agg(q.answer order by q.rn)
      into o_content, o_keys from q;
    o_content := jsonb_build_object('questions', o_content);
    o_keys := jsonb_build_object('answers', o_keys);
  elsif p_game = 'antakshari' then
    o_content := jsonb_build_object('start', substr('abcdghjkmprst', floor(random()*13)::int + 1, 1));
    o_keys := '{}'::jsonb;
  elsif p_game in ('hum', 'emoji') then
    if p_game = 'hum' then
      ids := array(select p.id from public.songs p order by exists (select 1 from public.seen_items x where x.couple_id = p_couple and x.kind = 'hum' and x.item_id = p.id), random() limit 6);
    else
      ids := array(select p.id from public.movies p order by exists (select 1 from public.seen_items x where x.couple_id = p_couple and x.kind = 'emoji' and x.item_id = p.id), random() limit 6);
    end if;
    for i in 1..6 loop
      s := case when i <= 3 then 0 else 1 end;
      if p_game = 'hum' then
        select title into t from public.songs where id = ids[i];
        opts := array(select title from public.songs where id <> all(ids) order by random() limit 3) || t;
      else
        select title into t from public.movies where id = ids[i];
        opts := array(select title from public.movies where id <> all(ids) order by random() limit 3) || t;
      end if;
      opts := array(select x from unnest(opts) x order by random());
      k := array_position(opts, t) - 1;
      v_sets := jsonb_set(v_sets, array[s::text], (v_sets->s) || jsonb_build_array(t));
      v_options := jsonb_set(v_options, array[s::text], (v_options->s) || jsonb_build_array(to_jsonb(opts)));
      v_answers := jsonb_set(v_answers, array[s::text], (v_answers->s) || to_jsonb(k));
    end loop;
    o_content := '{}'::jsonb;
    o_keys := jsonb_build_object('sets', v_sets, 'options', v_options, 'answers', v_answers);
  elsif p_game = 'andaaza' then
    with c as (
      select p.*, exists (select 1 from public.seen_items x where x.couple_id = p_couple and x.kind = 'andaaza' and x.item_id = p.id) as sn
        from public.estimates p where p.season is null or p.season = v_tag
    ), r as (select c.*, row_number() over (partition by c.season is not null order by c.sn, random()) as rk from c),
    picked as (select * from r where season is null or rk <= 2 order by sn, (season is not null) desc, random() limit 6),
    q as (select p.*, row_number() over (order by random()) as rn from picked p)
    select jsonb_agg(jsonb_build_object('id', q.id, 'q', q.q, 'unit', q.unit, 'lo', q.lo, 'hi', q.hi) order by q.rn),
           jsonb_agg(jsonb_build_object('answer', q.answer, 'tol', q.tol) order by q.rn)
      into o_content, o_keys from q;
    o_content := jsonb_build_object('questions', o_content);
    o_keys := jsonb_build_object('answers', o_keys);
  elsif p_game = 'kyj' then
    with c as (
      select p.*, exists (select 1 from public.seen_items x where x.couple_id = p_couple and x.kind = 'kyj' and x.item_id = p.id) as sn
        from public.kyj_questions p where p.depth <= lvl and (p.season is null or p.season = v_tag)
    ), r as (select c.*, row_number() over (partition by c.season is not null order by c.sn, random()) as rk from c)
    select jsonb_agg(jsonb_build_object('id', x.id, 'q', x.q, 'options', x.options, 'depth', x.depth) order by x.depth, random())
      into o_content from (
        select * from r where season is null or rk <= 1
         order by sn, (depth = lvl and random() < 0.6) desc, (season is not null) desc, random() limit 5) x;
    o_content := jsonb_build_object('questions', o_content);
    o_keys := '{}'::jsonb;
  elsif p_game = 'future' then
    select jsonb_agg(jsonb_build_object('id', x.id, 'q', x.q, 'options', x.options, 'depth', x.depth) order by x.depth, random())
      into o_content from (
        select p.* from public.future_questions p where p.depth <= lvl
         order by exists (select 1 from public.seen_items x where x.couple_id = p_couple and x.kind = 'future' and x.item_id = p.id),
                  (p.depth = lvl and random() < 0.6) desc, random() limit 8) x;
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
create or replace function public.gen_content(p_game text, out o_content jsonb, out o_keys jsonb)
language sql volatile security definer set search_path = public as $$
  select o_content, o_keys from public.gen_content_for(p_game, null)
$$;
revoke execute on function public.gen_content_for(text, uuid), public.gen_content(text) from public, anon, authenticated;
revoke execute on function public._content_ids(uuid), public._mark_seen(uuid, uuid), public._seen_frac(uuid, uuid),
  public._couple_level(uuid) from public, anon, authenticated;
grant execute on function public.my_level() to authenticated;

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
  -- join a waiting rival only if most of its content is new to us
  select id into mid from public.matches
   where game = p_game and daily_day is null and status = 'open' and couple_b is null and not ghost
     and couple_a <> c and created_at > now() - interval '3 days'
     and public._seen_frac(c, id) <= 0.34
   order by a_done desc, created_at asc
   limit 1 for update skip locked;
  if mid is not null then
    update public.matches set couple_b = c where id = mid;
    perform public._mark_seen(c, mid);
    return mid;
  end if;
  select * into g from public.gen_content_for(p_game, c);
  insert into public.matches(game, content, keys, couple_a)
    values (p_game, g.o_content, g.o_keys, c) returning id into mid;
  perform public._mark_seen(c, mid);
  return mid;
end $$;

-- ---------- more content ----------
insert into public.kyj_questions(q, options, depth) values
('What would {p} grab first in a fire?', '["Phone","Wallet","Old photo album","Me, obviously"]', 1),
('{P''s} karaoke pick?', '["Arijit ballad","Kishore classic","Punjabi party track","Refuses to sing"]', 1),
('How does {p} eat a samosa?', '["Breaks it open first","Big bites with chutney","Only the filling","Shares half"]', 1),
('When someone spoils a movie, {p}…', '["Shrugs and still watches","Gets really angry","Wanted the spoiler anyway","Stops talking to them"]', 1),
('What does {p} pack first for a trip?', '["Snacks","Charger","Clothes","Skincare"]', 1),
('If {p} were a Bollywood character?', '["Raj from DDLJ","Geet from Jab We Met","Bunny from YJHD","Circuit from Munna Bhai"]', 1),
('What is {p} doing at 2am?', '["Fast asleep","Scrolling reels","Raiding the fridge","Overthinking"]', 1),
('{P''s} biggest pet peeve?', '["Loud chewing","Late replies","Messy room","People being late"]', 1),
('At a buffet, {p} goes for…', '["Starters again and again","Main course","Straight to dessert","A bit of everything"]', 1),
('During an India match, {p}…', '["Watches every ball","Only checks the score","Only the last over","Asks who is winning"]', 1),
('{P''s} WhatsApp status is usually…', '["Never updated","Songs and quotes","Travel photos","Good morning flowers"]', 1),
('{P''s} gym story?', '["Goes every day","Paid but never goes","Home workouts","Walking counts"]', 1),
('In an argument, {p} usually…', '["Goes quiet","Brings up old stuff","Wins with logic","Cracks a joke"]', 1),
('{P''s} favourite way to be pampered?', '["Head massage","Breakfast in bed","Surprise shopping","Left alone to sleep"]', 1),
('What would {p} name a pet dog?', '["Bruno","Sheru","Coco","Something very weird"]', 1),
('{P''s} guilty pleasure?', '["Late-night Maggi","Saas-bahu serials","Online shopping","Sleeping in"]', 1),
('A free day alone, {p} would…', '["Sleep","Go shopping","Binge a series","Café with a book"]', 1),
('{P''s} phone wallpaper?', '["Our photo","Family","Nature","Never changed it"]', 1),
('{P''s} dream ride?', '["Thar","Mercedes","Royal Enfield","Anything with AC"]', 1),
('What does {p} forget most?', '["Keys","Birthdays","Where they parked","To eat lunch"]', 1),
('{P''s} favourite chaat?', '["Pani puri","Papdi chaat","Aloo tikki","Bhel puri"]', 1),
('How long does {p} take to get ready?', '["5 minutes","15 minutes","45 minutes","\"Almost ready\" for an hour"]', 1),
('{P''s} childhood TV favourite?', '["Shaktimaan","Doraemon","Tom and Jerry","Pokémon"]', 1),
('When {p} is sick, they…', '["Act like it is the end","Keep working anyway","Want soup and care","Google every symptom"]', 1),
('{P''s} shopping style?', '["Knows exactly what to buy","Window shops for hours","Buys on impulse","Hates shopping"]', 1),
('{P''s} reaction to a surprise party?', '["Happy tears","Pretends they knew","Awkward smile","Starts dancing"]', 1),
('What makes {p} feel most loved?', '["Time together","Sweet words","Little gifts","Help with work"]', 2),
('What does {p} worry about most?', '["Money","Career","Family''s health","Our future"]', 2),
('{P''s} biggest dream right now?', '["Our own home","Travel the world","Start a business","A peaceful life"]', 2),
('What would {p} change about their childhood?', '["Nothing at all","More freedom","More time with parents","Less study pressure"]', 2),
('When stressed, {p} needs…', '["A hug","Space","To talk it out","Food"]', 2),
('Who does {p} go to first for advice?', '["Me","Mummy","A best friend","Figures it out alone"]', 2),
('What is {p} most proud of?', '["Their work","Their family","Us","Something they overcame"]', 2),
('What does {p} secretly want more of from me?', '["Compliments","Surprises","Patience","Time"]', 2),
('{P''s} favourite memory of us?', '["The day we met","A trip together","Our engagement or wedding","A random ordinary day"]', 2),
('With one year off, {p} would…', '["Travel","Learn something new","Be with family","Just rest"]', 2),
('{P''s} biggest fear about the future?', '["Losing someone","Money trouble","Health","Growing apart"]', 2),
('What does {p} think our biggest strength is?', '["We laugh a lot","We trust each other","We back each other''s dreams","We never give up"]', 2),
('If {p} could relive one phase?', '["Childhood","College days","Our early days","Right now is the best"]', 2),
('After a bad day, {p} wants…', '["Silence","Ice cream","A long hug","To vent"]', 2),
('{P''s} idea of success?', '["Lots of money","A happy family","Respect","Doing what they love"]', 2),
('What should our kids learn first, according to {p}?', '["Kindness","Hard work","Respect for elders","Being fearless"]', 2),
('Which of my habits does {p} secretly love?', '["How I laugh","How I care for family","My silly jokes","How excited I get"]', 2),
('What does {p} find hardest to say out loud?', '["Sorry","I need help","I am hurt","I love you"]', 3),
('When did {p} first feel "this is the one"?', '["On our first date","After a long talk","During a tough time","Still deciding 😜"]', 3),
('What would {p} want me to never change?', '["My laugh","My honesty","How I care","My craziness"]', 3),
('What makes {p} feel unappreciated?', '["When I am on my phone","When I forget small things","When effort goes unnoticed","When plans get cancelled"]', 3),
('What does {p} want to be remembered for?', '["Kindness","Achievements","Family","Making people laugh"]', 3),
('How does {p} most like to receive love?', '["Words","Touch","Gifts","Things done for them"]', 3),
('When {p} goes quiet, it usually means…', '["Tired","Upset with me","Thinking about work","Just peaceful"]', 3),
('What does {p} wish we did more together?', '["Travel","Talk deeply","Cook","Pray or meditate"]', 3),
('What would {p} tell their younger self?', '["Don''t worry so much","Work harder","Be braver","You will find your person"]', 3),
('On our 25th anniversary, {p} wants…', '["To renew vows","A big trip","A quiet dinner","A huge party"]', 3),
('What helps {p} forgive fastest?', '["A real sorry","A long hug","Time","A funny gesture"]', 3),
('What would {p} give up for our family?', '["A dream job","Comfort","Their free time","Anything"]', 3);

insert into public.future_questions(q, options, depth) values
('Our signature dish at home?', '[{"e":"🍛","t":"Dal chawal"},{"e":"🍕","t":"Homemade pizza"},{"e":"🥘","t":"Biryani"},{"e":"🥞","t":"Sunday dosa"}]', 1),
('Our holiday style?', '[{"e":"🏨","t":"Luxury resort"},{"e":"🎒","t":"Backpacking"},{"e":"🚗","t":"Road trips"},{"e":"🏕️","t":"Camping"}]', 1),
('Our mornings?', '[{"e":"☕","t":"Chai together"},{"e":"🏃","t":"Workout together"},{"e":"😴","t":"Snooze till late"},{"e":"🧘","t":"Yoga"}]', 1),
('Our living room has…', '[{"e":"📺","t":"A huge TV"},{"e":"📚","t":"A wall of books"},{"e":"🎮","t":"A gaming setup"},{"e":"🪴","t":"An indoor jungle"}]', 1),
('Our date nights?', '[{"e":"🍷","t":"Fancy dinner"},{"e":"🎬","t":"Movie at home"},{"e":"🍜","t":"Street food run"},{"e":"🛋️","t":"Couch and chai"}]', 1),
('Music in our home?', '[{"e":"🎶","t":"Old Bollywood"},{"e":"🎧","t":"Latest hits"},{"e":"🪕","t":"Classical"},{"e":"🔇","t":"Peaceful silence"}]', 1),
('Our money style?', '[{"e":"💰","t":"Big savers"},{"e":"🛍️","t":"Happy spenders"},{"e":"📈","t":"Smart investors"},{"e":"🤷","t":"We''ll figure it out"}]', 1),
('Our balcony has…', '[{"e":"🌿","t":"A little garden"},{"e":"🪑","t":"Two chairs for chai"},{"e":"🧺","t":"Drying clothes"},{"e":"🌃","t":"A city view"}]', 1),
('Where are our parents?', '[{"e":"🏠","t":"Living with us"},{"e":"🏘️","t":"Next door"},{"e":"🌆","t":"Same city"},{"e":"✈️","t":"Far, but visit often"}]', 2),
('Who handles the money?', '[{"e":"🙋‍♂️","t":"Him"},{"e":"🙋‍♀️","t":"Her"},{"e":"🤝","t":"Together"},{"e":"📊","t":"A shared spreadsheet"}]', 2),
('Our work in 10 years?', '[{"e":"🚀","t":"Both chasing big goals"},{"e":"🏢","t":"Our own business"},{"e":"⚖️","t":"Calm and balanced"},{"e":"🏡","t":"One of us at home"}]', 2),
('How we handle fights?', '[{"e":"🗣️","t":"Talk it out the same night"},{"e":"🚶","t":"Cool off, then talk"},{"e":"🍫","t":"Make up with food"},{"e":"😂","t":"Laugh it off"}]', 2),
('What we save for first?', '[{"e":"🏠","t":"Dream house"},{"e":"🌍","t":"World trip"},{"e":"🎓","t":"Kids'' education"},{"e":"🧓","t":"Early retirement"}]', 2),
('Our tradition with friends?', '[{"e":"🎉","t":"Monthly party"},{"e":"✈️","t":"Yearly trip"},{"e":"🍽️","t":"Sunday lunches"},{"e":"📱","t":"Video calls"}]', 2),
('Our weekdays?', '[{"e":"💻","t":"Work from home"},{"e":"🚇","t":"Office commute"},{"e":"🌾","t":"Slow small-town life"},{"e":"✈️","t":"Always travelling"}]', 2),
('Something we learn together?', '[{"e":"💃","t":"Dancing"},{"e":"🍳","t":"Cooking"},{"e":"🗣️","t":"A new language"},{"e":"🎸","t":"An instrument"}]', 2),
('What we never compromise on?', '[{"e":"🤝","t":"Trust"},{"e":"👨‍👩‍👧","t":"Family time"},{"e":"🕊️","t":"Each other''s freedom"},{"e":"🙏","t":"Our values"}]', 3),
('How we care for each other when we''re old?', '[{"e":"🚶","t":"Evening walks"},{"e":"💊","t":"Medicines on time"},{"e":"📖","t":"Reading to each other"},{"e":"🎶","t":"Old songs together"}]', 3),
('What we leave behind?', '[{"e":"🏫","t":"Helping others"},{"e":"👨‍👩‍👧‍👦","t":"A big happy family"},{"e":"💼","t":"Something we built"},{"e":"❤️","t":"A love story"}]', 3),
('When life gets hard, we…', '[{"e":"🙏","t":"Pray together"},{"e":"🧠","t":"Make a plan"},{"e":"🤗","t":"Hold on tight"},{"e":"🧳","t":"Take a break together"}]', 3),
('Our promise every year?', '[{"e":"💌","t":"A letter to each other"},{"e":"🌅","t":"A trip, just us two"},{"e":"🎂","t":"Celebrate every small win"},{"e":"📸","t":"One photo every day"}]', 3),
('The one thing we''ll always do?', '[{"e":"🌙","t":"Say good night, even after fights"},{"e":"🍽️","t":"Eat dinner together"},{"e":"😂","t":"Make each other laugh"},{"e":"🙌","t":"Back each other in public"}]', 3);

insert into public.sync_prompts(prompt, a, b, depth) values
('Rainy day?','Pakode at home','Walk in the rain',1),('Road trip music?','Arijit','Punjabi beats',1),
('Biryani?','Hyderabadi','Lucknowi',1),('Fast food?','Pizza','Burger',1),('Main course?','Paneer','Chicken',1),
('Cold drink?','Thums Up','Limca',1),('Midnight craving?','Maggi','Ice cream',1),('Chips?','Lays','Kurkure',1),
('Cricket format?','T20','Test',1),('Bigger legend?','Dhoni','Virat',1),('Holiday style?','Adventure','Relax',1),
('Photos?','Candid','Posed',1),('Stay?','Hotel','Homestay',1),('Seat?','Window','Aisle',1),
('Horror movies?','Love them','Never',1),('Movie night?','Rom-com','Action',1),('Films?','Bollywood','South',1),
('Shoes?','Sneakers','Chappals',1),('Clothes?','Comfy','Stylish',1),('Room?','AC full blast','Fan is enough',1),
('Blanket?','Share one','One each',1),('Wake up with?','Alarm','Naturally',1),('Bath?','Hot water','Cold water',1),
('Surprises?','Love giving','Love getting',1),('Tea biscuit?','Parle-G','Rusk',1),('Mango?','Alphonso','Langda',1),
('Paratha?','Aloo','Gobi',1),('Weekend food?','Chole bhature','Dosa',1),('Mehendi?','Love it','Skip it',1),
('Who is more jealous?','Him','Her',1),('Who is the better singer?','Him','Her',1),('Who hogs the blanket?','Him','Her',1),
('Who cries in movies?','Him','Her',1),('Who gives better advice?','Him','Her',1),('Who survives longer on an island?','Him','Her',1),
('Who is the better dancer?','Him','Her',1),('Who texts first?','Him','Her',1),('Who is the better photographer?','Him','Her',1),
('Who needs more alone time?','Him','Her',2),('Who worries more?','Him','Her',2),('Who is more patient?','Him','Her',2),
('Who is the bigger dreamer?','Him','Her',2),('Who apologises better?','Him','Her',2),('Who is closer to their family?','Him','Her',2),
('Who fell first?','Him','Her',2),('Who plans the better surprise?','Him','Her',2),('Big decisions?','Head','Heart',2),
('Money?','Save it','Spend it',2),('Kids?','Soon','Later',2),('After marriage?','Live with family','Our own place',2),
('Fights?','Same-day sorry','Sleep on it',2),('Career or home?','Career first','Home first',2),
('Who understands the other better?','Him','Her',3),('Who would move cities for the other?','Him','Her',3),
('Who said sorry when it wasn''t their fault?','Him','Her',3),('Who is the emotional anchor?','Him','Her',3),
('Our love is more…','Calm and steady','Fiery and filmy',3),('Best part of us?','Friendship','Romance',3);

insert into public.estimates(q, answer, tol, unit, lo, hi) values
('How many seats are in the Lok Sabha?', 543, 150, 'seats', 0, 1000),
('How many languages are in the 8th Schedule of the Constitution?', 22, 8, 'languages', 0, 50),
('How tall is the Eiffel Tower?', 330, 100, 'm', 0, 1000),
('How many teeth does an adult have?', 32, 10, 'teeth', 0, 60),
('How many litres of blood are in an adult body?', 5, 2, 'litres', 0, 15),
('How many countries are UN members?', 193, 50, 'countries', 0, 300),
('How deep is the Mariana Trench?', 11000, 3500, 'm', 0, 20000),
('Speed of sound in air?', 343, 100, 'm/s', 0, 1000),
('In which year did India win its first Cricket World Cup?', 1983, 15, '', 1950, 2025),
('In which year did Doordarshan start?', 1959, 20, '', 1930, 2000),
('In which year did India win the first T20 World Cup?', 2007, 8, '', 1990, 2025),
('In which year was Kuch Kuch Hota Hai released?', 1998, 8, '', 1980, 2020),
('In which year was 3 Idiots released?', 2009, 8, '', 1990, 2025),
('How long is the Bandra-Worli Sea Link?', 5.6, 3, 'km', 0, 20),
('Rohit Sharma''s highest ODI score?', 264, 70, 'runs', 0, 400),
('MS Dhoni''s highest ODI score?', 183, 50, 'runs', 0, 300),
('How many medals did India win at the Tokyo Olympics?', 7, 4, 'medals', 0, 30),
('How many hours a day does a koala sleep?', 20, 6, 'hours', 0, 24),
('How long does sunlight take to reach Earth?', 8.3, 4, 'minutes', 0, 60),
('How many rooms are in Rashtrapati Bhavan?', 340, 120, 'rooms', 0, 1000),
('How many years did it take to build the Taj Mahal?', 22, 8, 'years', 0, 60),
('How many squares are on a chess board?', 64, 20, 'squares', 0, 200),
('How many days does Durga Puja''s main festival last?', 5, 3, 'days', 0, 15),
('How many runs did Sachin score in international cricket (all formats)?', 34357, 9000, 'runs', 0, 60000);

insert into public.movies(title) values
('Karan Arjun'),('Border'),('Gadar'),('Jo Jeeta Wohi Sikandar'),('Dil Se'),('Black'),('Lage Raho Munna Bhai'),
('Housefull'),('Dabangg'),('War'),('Tiger Zinda Hai'),('Kick'),('Race'),('Ajab Prem Ki Ghazab Kahani'),
('Aashiqui 2'),('Kesari'),('Shershaah'),('Gangubai Kathiawadi'),('Rocky Aur Rani Kii Prem Kahaani'),('Laapataa Ladies'),
('12th Fail'),('Dunki'),('Stree 2'),('Pink'),('Raazi'),('Chhichhore'),('Super 30'),('Kabhi Alvida Naa Kehna'),
('Vivah'),('Namastey London'),('My Name Is Khan'),('Ready'),('Bodyguard'),('Housefull 2'),
('Dilwale'),('Ek Villain'),('Toilet: Ek Prem Katha'),('Sooryavanshi'),('Fighter')
on conflict do nothing;
