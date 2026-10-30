-- Jodi Arena: the daily question loop.
-- One question a day, each partner answers alone, the reveal opens once both have answered.

create table public.daily_questions (
  id serial primary key,
  kind text not null check (kind in ('who', 'pick')),  -- who: pick a=partner 1 / b=partner 2. pick: a / b are option texts.
  q text not null,
  a text,
  b text,
  check (kind = 'who' or (a is not null and b is not null))
);
alter table public.daily_questions enable row level security;
revoke all on public.daily_questions from anon, authenticated;

create table public.daily_q_answers (
  couple_id uuid not null references public.couples(id) on delete cascade,
  day date not null,
  user_id uuid not null,
  pick text not null check (pick in ('a', 'b')),
  created_at timestamptz not null default now(),
  primary key (couple_id, day, user_id)
);
alter table public.daily_q_answers enable row level security;
revoke all on public.daily_q_answers from anon, authenticated;

insert into public.daily_questions(kind, q, a, b) values
('who', 'Who is the bigger drama queen when sick?', null, null),
('who', 'Who falls asleep first on a movie night?', null, null),
('who', 'Who takes longer to get ready?', null, null),
('who', 'Who forgets things more often?', null, null),
('who', 'Who is more stubborn in a fight?', null, null),
('who', 'Who says sorry first after a fight?', null, null),
('who', 'Who is the better cook?', null, null),
('who', 'Who spends more on online shopping?', null, null),
('who', 'Who is more likely to get lost with Google Maps open?', null, null),
('who', 'Who replies slower on WhatsApp?', null, null),
('who', 'Who is the bigger foodie?', null, null),
('who', 'Who cries more at filmy scenes?', null, null),
('who', 'Who is more scared of cockroaches?', null, null),
('who', 'Who snores louder?', null, null),
('who', 'Who steals more of the blanket?', null, null),
('who', 'Who is the bigger gossip?', null, null),
('who', 'Who is more likely to say “main toh mazaak kar raha tha” and mean it?', null, null),
('who', 'Who gets hangry faster?', null, null),
('who', 'Who is more romantic in real life?', null, null),
('who', 'Who plans the dates?', null, null),
('who', 'Who will be the strict parent?', null, null),
('who', 'Who is the better dancer at a shaadi?', null, null),
('who', 'Who is more likely to forget our anniversary?', null, null),
('who', 'Who has the worse phone addiction?', null, null),
('who', 'Who is more jealous?', null, null),
('who', 'Who tells the better lies?', null, null),
('who', 'Who is the bigger sweet tooth?', null, null),
('who', 'Who is more filmy?', null, null),
('who', 'Who would survive longer without a phone?', null, null),
('who', 'Who loves the other one more? (Be honest.)', null, null),
('pick', 'Perfect Sunday together?', 'Home, chai and a movie', 'Out all day, street food and a walk'),
('pick', 'A trip together?', 'Mountains', 'Beach'),
('pick', 'Dinner tonight?', 'Biryani', 'Pizza'),
('pick', 'Summer or winter together?', 'Summer', 'Winter'),
('pick', 'Our love story is more like…', 'A slow, sweet Bollywood romance', 'A full-on masala entertainer'),
('pick', 'Late night plan?', 'Talk till 3 am', 'Sleep early, wake up fresh'),
('pick', 'Panipuri or momos?', 'Panipuri', 'Momos'),
('pick', 'When we fight, I want…', 'Space first, then talk', 'Talk it out right now'),
('pick', 'Gift preference?', 'A thoughtful handmade thing', 'Something I really wanted to buy'),
('pick', 'Our dream home?', 'Small flat in a big city', 'House in a quiet town'),
('pick', 'Movie night pick?', 'Comedy', 'Romance'),
('pick', 'Morning person or night owl?', 'Morning person', 'Night owl'),
('pick', 'Holiday style?', 'Plan every hour', 'No plan, just vibes'),
('pick', 'Best way to say sorry?', 'A long message', 'A hug and chai');

create or replace function public._dq_pick(p_day date) returns public.daily_questions
language sql stable security definer set search_path = public as $$
  select * from public.daily_questions
  order by id
  offset (abs(p_day - date '2026-01-01') % (select count(*) from public.daily_questions))
  limit 1
$$;

-- consecutive days (ending today, or yesterday if today is not done yet) on which both partners answered
create or replace function public._dq_streak(p_couple uuid) returns int
language plpgsql stable security definer set search_path = public as $$
declare d date := public.today_ist(); n int := 0;
begin
  if (select count(*) from public.daily_q_answers where couple_id = p_couple and day = d) < 2 then d := d - 1; end if;
  while n < 400 and (select count(*) from public.daily_q_answers where couple_id = p_couple and day = d) >= 2 loop
    n := n + 1; d := d - 1;
  end loop;
  return n;
end $$;

create or replace function public.daily_q_today() returns json
language plpgsql stable security definer set search_path = public as $$
declare
  uid uuid := auth.uid(); c uuid := public.my_couple(); d date := public.today_ist();
  q public.daily_questions; mine text; theirs text; partner uuid := public._partner();
  played int; matched int;
begin
  if c is null then return null; end if;
  q := public._dq_pick(d);
  select pick into mine from public.daily_q_answers where couple_id = c and day = d and user_id = uid;
  if partner is not null then
    select pick into theirs from public.daily_q_answers where couple_id = c and day = d and user_id = partner;
  end if;
  select count(*), count(*) filter (where picks = 1) into played, matched from (
    select day, count(distinct pick) as picks from public.daily_q_answers
    where couple_id = c group by day having count(*) = 2) x;
  return json_build_object(
    'day', d,
    'kind', q.kind, 'q', q.q, 'a', q.a, 'b', q.b,
    'mine', mine,
    'partner_answered', theirs is not null,
    'revealed', mine is not null and theirs is not null,
    'partner_pick', case when mine is not null then theirs end,
    'match', case when mine is not null and theirs is not null then mine = theirs end,
    'streak', public._dq_streak(c),
    'played', coalesce(played, 0),
    'matched', coalesce(matched, 0));
end $$;

create or replace function public.daily_q_answer(p_pick text) returns json
language plpgsql security definer set search_path = public as $$
declare c uuid := public.my_couple(); d date := public.today_ist();
begin
  if c is null then raise exception 'Set up your jodi first'; end if;
  if p_pick not in ('a', 'b') then raise exception 'Pick one of the two'; end if;
  insert into public.daily_q_answers(couple_id, day, user_id, pick) values (c, d, auth.uid(), p_pick)
  on conflict (couple_id, day, user_id) do nothing;   -- the first answer is final, so the reveal stays fair
  return public.daily_q_today();
end $$;

revoke execute on function public._dq_pick(date), public._dq_streak(uuid), public.daily_q_today(), public.daily_q_answer(text) from public, anon;
grant execute on function public.daily_q_today(), public.daily_q_answer(text) to authenticated;
