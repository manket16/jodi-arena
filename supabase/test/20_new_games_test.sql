\set ON_ERROR_STOP on
\pset format unaligned
\pset tuples_only on
create or replace function pg_temp.as_user(u text) returns void language sql as $$ select set_config('request.jwt.claim.sub', u, false) $$;
set role authenticated;
-- andaaza
select pg_temp.as_user('11111111-1111-1111-1111-111111111111');
select start_match('andaaza') as m \gset
select 'questions: ' || jsonb_array_length((match_state(:'m')->'content'->'questions')::jsonb);
select 'answers hidden before done: ' || coalesce(match_state(:'m')->'extra'->>'answers','(hidden)');
reset role;
select jsonb_agg(((keys->'answers'->i->>'answer')::numeric)) as exact, jsonb_agg(((keys->'answers'->i->>'answer')::numeric + (keys->'answers'->i->>'tol')::numeric)) as off
  from matches, generate_series(0,5) i where id = :'m' \gset
set role authenticated;
select submit_andaaza(:'m', :'exact')->>'couple_done';
select pg_temp.as_user('22222222-2222-2222-2222-222222222222');
select 'andaaza couple score (expect 60: avg is half tol off on each of 6): ' || (submit_andaaza(:'m', :'off')->>'couple_score');
select 'answers revealed: ' || jsonb_array_length((match_state(:'m')->'extra'->'answers')::jsonb);
-- rhythm
select start_match('rhythm') as r \gset
select match_state(:'r')->'content'->>'beats' as beats \gset
select 'beats: ' || :'beats';
reset role;
select jsonb_agg(((content->'beats'->>i)::int + 5000)) as perfect from matches, generate_series(0,7) i where id = :'r' \gset
select jsonb_agg(((content->'beats'->>i)::int + 100 + case when i>0 then 60 else 0 end)) as close from matches, generate_series(0,7) i where id = :'r' \gset
set role authenticated;
select pg_temp.as_user('22222222-2222-2222-2222-222222222222');
select submit_rhythm(:'r', :'perfect')->>'couple_done';
select pg_temp.as_user('11111111-1111-1111-1111-111111111111');
select 'rhythm couple (perfect+60ms off): ' || (submit_rhythm(:'r', :'close')->>'couple_score');
select 'ghost: ' || (play_ghost(:'r')->>'result');
