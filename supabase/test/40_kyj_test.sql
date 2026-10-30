\set ON_ERROR_STOP on
\pset format unaligned
\pset tuples_only on
create or replace function pg_temp.as_user(u text) returns void language sql as $$ select set_config('request.jwt.claim.sub', u, false) $$;
select set_config('request.jwt.claim.sub', '', false);
select code from couples where name='Raj Simran' \gset
set role anon;
select 'invite: ' || invite_info(:'code')::text;
select 'bad code: ' || coalesce(invite_info('ZZZZZZ')::text, 'null');
reset role;
set role authenticated;
select pg_temp.as_user('11111111-1111-1111-1111-111111111111');
select start_match('kyj') as k \gset
select 'q: ' || (match_state(:'k')->'content'->'questions'->0->>'q');
select submit_kyj(:'k', '[0,1,2,3,0]', '[1,1,2,0,0]')->>'couple_done';
select pg_temp.as_user('22222222-2222-2222-2222-222222222222');
-- her self = [1,1,2,3,3] -> Raj guessed right on 1,2,3 (45); her guess [0,1,0,3,0] vs raj self [0,1,2,3,0] -> right on 0,1,3,4 (60) => 105
select 'kyj couple (expect 105): ' || (submit_kyj(:'k', '[1,1,2,3,3]', '[0,1,0,3,0]')->>'couple_score');
select 'report: ' || jodi_report()::text;
