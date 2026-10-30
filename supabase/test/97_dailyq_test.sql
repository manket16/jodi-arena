\set ON_ERROR_STOP on
\pset format unaligned
\pset tuples_only on
create or replace function pg_temp.as_user(u text) returns void language sql as $$ select set_config('request.jwt.claim.sub', u, false) $$;
create or replace function pg_temp.expect_fail(q text, frag text) returns void language plpgsql as $$
begin execute q; raise exception 'FAIL expected error containing % for: %', frag, q;
exception when others then if sqlerrm like 'FAIL%' then raise; end if; if sqlerrm not ilike '%' || frag || '%' then raise exception 'FAIL wrong error [%] expected [%]', sqlerrm, frag; end if; end $$;
create or replace function pg_temp.check(ok boolean, msg text) returns void language plpgsql as $$ begin if not ok then raise exception 'FAIL %', msg; end if; end $$;
grant execute on function pg_temp.as_user(text), pg_temp.expect_fail(text, text), pg_temp.check(boolean, text) to public;

insert into auth.users(id, email, is_anonymous) values
 ('d1000000-0000-0000-0000-000000000001','q1@x.com',false),('d1000000-0000-0000-0000-000000000002','q2@x.com',false),
 ('d1000000-0000-0000-0000-000000000003','q3@x.com',false),('d1000000-0000-0000-0000-000000000004','q4@x.com',false);
set role authenticated;

-- a full couple
select pg_temp.as_user('d1000000-0000-0000-0000-000000000001');
select create_couple('Q Jodi', 'Raj')->>'code' as qc \gset
select pg_temp.as_user('d1000000-0000-0000-0000-000000000002');
select join_couple(:'qc', 'Simran')->>'name';

-- before anyone answers
select pg_temp.as_user('d1000000-0000-0000-0000-000000000001');
select pg_temp.check((daily_q_today()->>'mine') is null and (daily_q_today()->>'revealed')::boolean = false, 'fresh day should be unanswered');
select pg_temp.check((daily_q_today()->>'q') is not null, 'question should exist');
select pg_temp.check((daily_q_today()->>'streak')::int = 0, 'streak starts at 0');

-- bad input
select pg_temp.expect_fail($$select daily_q_answer('c')$$, 'Pick one');

-- Raj answers: waiting, partner pick hidden
select daily_q_answer('a')->>'mine';
select pg_temp.check((daily_q_today()->>'mine') = 'a', 'my pick saved');
select pg_temp.check((daily_q_today()->>'partner_answered')::boolean = false and (daily_q_today()->>'revealed')::boolean = false, 'waiting for partner');
select pg_temp.check((daily_q_today()->>'partner_pick') is null, 'no partner pick yet');

-- first answer is final
select daily_q_answer('b')->>'mine';
select pg_temp.check((daily_q_today()->>'mine') = 'a', 'answer cannot be changed');

-- Simran has not answered, so she cannot see Raj's pick
select pg_temp.as_user('d1000000-0000-0000-0000-000000000002');
select pg_temp.check((daily_q_today()->>'mine') is null and (daily_q_today()->>'partner_pick') is null, 'partner pick hidden until I answer');
select pg_temp.check((daily_q_today()->>'partner_answered')::boolean = true, 'she sees that he answered');

-- Simran answers the other way: reveal, clash, streak 1
select daily_q_answer('b')->>'mine';
select pg_temp.check((daily_q_today()->>'revealed')::boolean and (daily_q_today()->>'partner_pick') = 'a', 'revealed to Simran');
select pg_temp.check((daily_q_today()->>'match')::boolean = false, 'clash');
select pg_temp.check((daily_q_today()->>'streak')::int = 1, 'streak 1 after both answer');
select pg_temp.as_user('d1000000-0000-0000-0000-000000000001');
select pg_temp.check((daily_q_today()->>'revealed')::boolean and (daily_q_today()->>'partner_pick') = 'b', 'revealed to Raj');

-- streak across days (back-dated rows, as the owner)
reset role;
insert into daily_q_answers(couple_id, day, user_id, pick)
select my.cid, d, u, 'a' from (select (select couple_id from profiles where id = 'd1000000-0000-0000-0000-000000000001') as cid) my,
  generate_series(today_ist() - 3, today_ist() - 1, interval '1 day') d,
  unnest(array['d1000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000002']::uuid[]) u;
set role authenticated;
select pg_temp.as_user('d1000000-0000-0000-0000-000000000001');
select pg_temp.check((daily_q_today()->>'streak')::int = 4, 'streak counts 4 consecutive days');
select pg_temp.check((daily_q_today()->>'played')::int = 4 and (daily_q_today()->>'matched')::int = 3, 'played 4, matched 3 (today was a clash)');

-- a gap breaks the streak
reset role;
delete from daily_q_answers where day = today_ist() - 2;
set role authenticated;
select pg_temp.as_user('d1000000-0000-0000-0000-000000000001');
select pg_temp.check((daily_q_today()->>'streak')::int = 2, 'gap breaks the streak (today + yesterday)');

-- solo player (no partner yet) can answer, nothing is revealed
select pg_temp.as_user('d1000000-0000-0000-0000-000000000003');
select create_couple('Solo Jodi', 'Vik')->>'code';
select daily_q_answer('a')->>'mine';
select pg_temp.check((daily_q_today()->>'revealed')::boolean = false and (daily_q_today()->>'partner_answered')::boolean = false, 'solo waits');

-- couples never see each other's answers; no couple means no data
select pg_temp.as_user('d1000000-0000-0000-0000-000000000004');
select pg_temp.check(daily_q_today() is null, 'no couple, no question');
select pg_temp.expect_fail($$select daily_q_answer('a')$$, 'Set up your jodi');
select pg_temp.expect_fail($$select * from daily_q_answers$$, 'permission denied');
select pg_temp.expect_fail($$select _dq_streak(gen_random_uuid())$$, 'permission denied');
select 'DAILY Q OK';
