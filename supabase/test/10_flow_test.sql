\set ON_ERROR_STOP on
\pset format unaligned
\pset tuples_only on

insert into auth.users(id, email) values
 ('11111111-1111-1111-1111-111111111111','raj@x.com'),
 ('22222222-2222-2222-2222-222222222222','simran@x.com'),
 ('33333333-3333-3333-3333-333333333333','rahul@x.com'),
 ('44444444-4444-4444-4444-444444444444','anjali@x.com');

create or replace function pg_temp.as_user(u text) returns void language sql as
$$ select set_config('request.jwt.claim.sub', u, false) $$;

set role authenticated;

-- ---------- couples ----------
select pg_temp.as_user('11111111-1111-1111-1111-111111111111');
select create_couple('Raj Simran', 'Raj')->>'code' as code_a \gset
select pg_temp.as_user('22222222-2222-2222-2222-222222222222');
select join_couple(:'code_a', 'Simran')->>'name';
select pg_temp.as_user('33333333-3333-3333-3333-333333333333');
select create_couple('Rahul Anjali', 'Rahul')->>'code' as code_b \gset
select pg_temp.as_user('44444444-4444-4444-4444-444444444444');
select join_couple(:'code_b', 'Anjali')->>'name';

-- direct table access must be blocked
do $$ begin
  perform * from public.matches;
  raise exception 'FAIL: direct select on matches allowed';
exception when insufficient_privilege then raise notice 'OK: matches locked down';
end $$;

-- ---------- SYNC ----------
select pg_temp.as_user('11111111-1111-1111-1111-111111111111');
select start_match('sync') as m_sync \gset
select pg_temp.as_user('22222222-2222-2222-2222-222222222222');
select start_match('sync') = :'m_sync' as same_match_for_partner;
select pg_temp.as_user('11111111-1111-1111-1111-111111111111');
select submit_sync(:'m_sync', (select jsonb_agg(jsonb_build_object('pick',0,'ms',1000)) from generate_series(1,10)))->>'couple_done';
select pg_temp.as_user('22222222-2222-2222-2222-222222222222');
select 'sync couple A score: ' || (submit_sync(:'m_sync', (select jsonb_agg(jsonb_build_object('pick',0,'ms',1500)) from generate_series(1,10)))->>'couple_score');
-- couple B joins the same match
select pg_temp.as_user('33333333-3333-3333-3333-333333333333');
select start_match('sync') = :'m_sync' as rival_joined;
select submit_sync(:'m_sync', (select jsonb_agg(jsonb_build_object('pick', g % 2,'ms',1000)) from generate_series(1,10) g))->>'status';
select pg_temp.as_user('44444444-4444-4444-4444-444444444444');
select 'sync result for B: ' || (submit_sync(:'m_sync', (select jsonb_agg(jsonb_build_object('pick',0,'ms',3000)) from generate_series(1,10)))::jsonb ->> 'result');
select pg_temp.as_user('11111111-1111-1111-1111-111111111111');
select 'sync result for A: ' || (match_state(:'m_sync')->>'result') || ' vs ' || (match_state(:'m_sync')->>'rival_name')
  || ' ' || (match_state(:'m_sync')->>'couple_score') || '-' || (match_state(:'m_sync')->>'rival_score');

-- ---------- CRICKET + TRUST BET ----------
select start_match('cricket') as m_cr \gset
select set_config('my.cr', :'m_cr', false);
select pg_temp.as_user('22222222-2222-2222-2222-222222222222');
select 'bet placed: ' || (place_bet(:'m_cr', 25)->'extra'->'my_bet'->>'stake');
reset role;
select 'coins before raj bats: ' || coins from couples where name = 'Raj Simran';
create temp table k as select keys from matches where id = :'m_cr';
grant select on k to authenticated;
set role authenticated;
select pg_temp.as_user('11111111-1111-1111-1111-111111111111');
select 'ball ' || i || ': ' || (cricket_ball(:'m_cr', i, (select (keys->'answers'->>i)::int from k), 2000)->>'total')
  from generate_series(0,5) i;
do $$ begin perform cricket_ball(current_setting('my.cr')::uuid, 6, 0, 1); exception when others then raise notice 'OK after innings: %', sqlerrm; end $$;
reset role;
select 'coins after (bet should pay 50): ' || coins || ', bet won=' || (select won from bets where match_id = :'m_cr') from couples where name = 'Raj Simran';
set role authenticated;
select pg_temp.as_user('22222222-2222-2222-2222-222222222222');
select 'sim ball0: ' || (cricket_ball(:'m_cr', 0, (select (keys->'answers'->>6)::int from k), 1000)->>'runs');
select 'sim ball1 wrong: out=' || (r->>'out') || ' couple total=' || (r->'state'->>'couple_score')
  from (select cricket_ball(:'m_cr', 1, ((select (keys->'answers'->>7)::int from k) + 1) % 4, 1000) r) z;
select 'ghost: ' || (play_ghost(:'m_cr')->>'result');

-- ---------- ANTAKSHARI ----------
select pg_temp.as_user('22222222-2222-2222-2222-222222222222');
select start_match('antakshari') as m_ak \gset
select set_config('my.m', :'m_ak', false);
do $$ begin
  perform submit_antakshari(current_setting('my.m')::uuid, '[]');
  raise exception 'FAIL: slot 2 played first';
exception when raise_exception then raise notice 'slot-2 check: %', sqlerrm; end $$;
reset role;
-- build a valid 4-song chain from the start letter (as admin, for test only)
create temp table chain(i int, title text);
do $$ declare l text; t text; n text; i int; used text[] := '{}';
begin
  select content->>'start' into l from matches where game = 'antakshari' order by created_at desc limit 1;
  for i in 1..4 loop
    select title, norm into t, n from songs where first_letter = l and norm <> all(used) order by id limit 1;
    insert into chain values (i, t); used := used || n; l := next_letter(n);
  end loop;
end $$;
select jsonb_agg(title order by i) as ak_songs from chain \gset
select jsonb_build_array((select title from songs where first_letter = next_letter((select norm from songs where title = (select title from chain where i = 4))) order by id desc limit 1), 'Not A Real Song') as ak_songs2 \gset
grant select on chain to authenticated;
set role authenticated;
select pg_temp.as_user('11111111-1111-1111-1111-111111111111');
select 'raj antakshari: ' || (submit_antakshari(:'m_ak', :'ak_songs')->>'my_score') || ' pts';
select pg_temp.as_user('22222222-2222-2222-2222-222222222222');
select 'simran starts at: ' || (match_state(:'m_ak')->'extra'->>'my_start');
select 'antakshari couple: ' || (submit_antakshari(:'m_ak', :'ak_songs2')->>'couple_score');
select pg_temp.as_user('11111111-1111-1111-1111-111111111111');
select 'ghost: ' || (play_ghost(:'m_ak')->>'result');

-- ---------- HUM ----------
select start_match('hum') as m_hum \gset
select get_home()->'couple'->>'id' as ca \gset
select 'raj set: ' || (match_state(:'m_hum')->'extra'->>'my_set');
select hum_recorded(:'m_hum', jsonb_build_array(:'m_hum' || '/' || :'ca' || '/11111111-1111-1111-1111-111111111111/0.webm',
  :'m_hum' || '/' || :'ca' || '/11111111-1111-1111-1111-111111111111/1.webm',
  :'m_hum' || '/' || :'ca' || '/11111111-1111-1111-1111-111111111111/2.webm'))->>'me_done';
select set_config('my.x', :'m_hum', false);
do $$ begin
  perform hum_recorded(current_setting('my.x', true)::uuid, '["evil/path/a","b","c"]');
exception when others then raise notice 'OK bad path rejected: %', sqlerrm; end $$;
select pg_temp.as_user('22222222-2222-2222-2222-222222222222');
select 'simran guess options: ' || (match_state(:'m_hum')->'extra'->>'guess_options');
reset role;
select jsonb_agg(jsonb_build_object('pick', (keys->'answers'->0->>i)::int, 'ms', 3000)) as sim_guess
  from matches, generate_series(0,2) i where id = :'m_hum' \gset
select jsonb_agg(jsonb_build_object('pick', 0, 'ms', 9000)) as raj_guess from generate_series(0,2) \gset
set role authenticated;
select pg_temp.as_user('22222222-2222-2222-2222-222222222222');
select 'simran guess score: ' || (submit_hum_guess(:'m_hum', :'sim_guess')->>'my_score');
select hum_recorded(:'m_hum', jsonb_build_array(:'m_hum' || '/' || :'ca' || '/22222222-2222-2222-2222-222222222222/0.webm',
  :'m_hum' || '/' || :'ca' || '/22222222-2222-2222-2222-222222222222/1.webm',
  :'m_hum' || '/' || :'ca' || '/22222222-2222-2222-2222-222222222222/2.webm'))->>'me_done';
select pg_temp.as_user('11111111-1111-1111-1111-111111111111');
select 'hum couple score: ' || (submit_hum_guess(:'m_hum', :'raj_guess')->>'couple_score');
select 'ghost: ' || (play_ghost(:'m_hum')->>'result');

-- ---------- home, leaderboard, shop ----------
select 'home: ' || (get_home()->'couple')::text;
select 'matches on home: ' || json_array_length(get_home()->'matches');
select 'leaderboard: ' || leaderboard()::text;
select 'after buying 🌻: ' || (buy_badge('🌻')->'couple'->>'badge') || ' coins=' || (get_home()->'couple'->>'coins');
