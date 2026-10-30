\set ON_ERROR_STOP on
\pset format unaligned
\pset tuples_only on
create or replace function pg_temp.as_user(u text) returns void language sql as $$ select set_config('request.jwt.claim.sub', u, false) $$;
select id as d1 from matches where daily_day is not null and couple_a=(select couple_id from profiles where id='11111111-1111-1111-1111-111111111111') \gset
select id as d2 from matches where daily_day is not null and couple_a=(select couple_id from profiles where id='33333333-3333-3333-3333-333333333333') \gset
select game, jsonb_array_length(content->'prompts') from matches where id=:'d1';
update couples set streak=4, best_streak=4, last_daily=today_ist()-1 where name='Raj Simran';
select coins as before from couples where name='Raj Simran' \gset
set role authenticated;
select pg_temp.as_user('11111111-1111-1111-1111-111111111111');
select submit_sync(:'d1', (select jsonb_agg(jsonb_build_object('pick',0,'ms',1000)) from generate_series(1,10)))->>'couple_done';
select pg_temp.as_user('22222222-2222-2222-2222-222222222222');
select 'daily: ' || (submit_sync(:'d1', (select jsonb_agg(jsonb_build_object('pick',0,'ms',1000)) from generate_series(1,10)))->>'daily');
select pg_temp.as_user('33333333-3333-3333-3333-333333333333');
select submit_sync(:'d2', (select jsonb_agg(jsonb_build_object('pick',1,'ms',1000)) from generate_series(1,10)))->>'status';
select pg_temp.as_user('44444444-4444-4444-4444-444444444444');
select 'B daily: ' || (submit_sync(:'d2', (select jsonb_agg(jsonb_build_object('pick',g%2,'ms',1000)) from generate_series(1,10) g))->>'daily');
select pg_temp.as_user('11111111-1111-1111-1111-111111111111');
select 'home daily: ' || (get_home()->>'daily');
select 'streak: ' || (get_home()->'couple'->>'streak') || ' best ' || (get_home()->'couple'->>'best_streak');
select 'season: ' || (get_home()->>'season');
select 'sync tile not hijacked by daily: ' || (start_match('sync') <> :'d1');
select 'season board: ' || season_board()::text;
select 'buy season badge: ' || (buy_badge('🎆')->'couple'->>'badge');
reset role;
select 'coins gained from daily (expect 35): ' || (select coins from couples where name='Raj Simran') - :before + 150;
