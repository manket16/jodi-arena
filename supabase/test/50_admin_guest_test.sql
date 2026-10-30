\set ON_ERROR_STOP on
\pset format unaligned
\pset tuples_only on
create or replace function pg_temp.as_user(u text) returns void language sql as $$ select set_config('request.jwt.claim.sub', u, false) $$;
insert into auth.users(id, email, is_anonymous) values
 ('55555555-5555-5555-5555-555555555555', null, true),
 ('66666666-6666-6666-6666-666666666666', null, true);
insert into public.admins values ('11111111-1111-1111-1111-111111111111');
set role authenticated;
-- guest couple
select pg_temp.as_user('55555555-5555-5555-5555-555555555555');
select create_couple('Guest Jodi', 'Aman')->>'code' as gc \gset
select pg_temp.as_user('66666666-6666-6666-6666-666666666666');
select join_couple(:'gc', 'Riya')->>'name';
select 'guest flags: ' || (get_home()->'couple'->>'me_guest') || ' locked=' || (get_home()->'couple'->>'guest_locked') || ' admin=' || (get_home()->>'is_admin');
select 'sync allowed: ' || (start_match('sync') is not null);
select 'kyj allowed: ' || (start_match('kyj') is not null);
select set_config('my.x','',false);
do $$ begin perform start_match('cricket'); raise exception 'FAIL guest got cricket';
exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; raise notice 'OK locked: %', sqlerrm; end $$;
select 'daily for guests: ' || (start_daily() is not null);
-- guest saves account -> unlock
reset role;
update auth.users set is_anonymous = false, email = 'riya@x.com' where id = '66666666-6666-6666-6666-666666666666';
set role authenticated;
do $$ begin perform start_match('cricket'); raise exception 'FAIL still unlocked with one guest';
exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; raise notice 'OK still locked (Aman is guest)'; end $$;
reset role;
update auth.users set is_anonymous = false, email = 'aman@x.com' where id = '55555555-5555-5555-5555-555555555555';
set role authenticated;
select 'cricket after both saved: ' || (start_match('cricket') is not null);
-- non-admin blocked
do $$ begin perform admin_stats(); raise exception 'FAIL non-admin saw stats';
exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; raise notice 'OK admin blocked: %', sqlerrm; end $$;
-- future us
select pg_temp.as_user('11111111-1111-1111-1111-111111111111');
select start_match('future') as f \gset
select 'future q: ' || (match_state(:'f')->'content'->'questions'->0->>'q') || ' opts=' || jsonb_array_length((match_state(:'f')->'content'->'questions'->0->'options')::jsonb);
select submit_future(:'f', '[0,1,2,3,0,1,2,3]')->>'couple_done';
select pg_temp.as_user('22222222-2222-2222-2222-222222222222');
select 'future (expect 90): ' || (submit_future(:'f', '[0,1,2,3,0,1,0,0]')->>'couple_score');
-- emoji
select pg_temp.as_user('11111111-1111-1111-1111-111111111111');
select start_match('emoji') as e \gset
select 'raj set: ' || (match_state(:'e')->'extra'->>'my_set');
do $$ begin perform emoji_clues(current_setting('my.e')::uuid, '["abc","🔥","🔥"]'); exception when others then raise notice 'skip'; end $$;
select set_config('my.e', :'e', false);
do $$ begin perform emoji_clues(current_setting('my.e')::uuid, '["🔥 abc","🔥","🔥"]'); raise exception 'FAIL letters allowed';
exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; raise notice 'OK: %', sqlerrm; end $$;
select emoji_clues(:'e', '["🐎🔫🔥","👨‍🎓👨‍🎓👨‍🎓","🏏🇮🇳"]')->>'me_done';
select pg_temp.as_user('22222222-2222-2222-2222-222222222222');
select 'sim sees clues: ' || (match_state(:'e')->'extra'->>'partner_clues');
reset role;
select jsonb_agg(jsonb_build_object('pick', (keys->'answers'->0->>i)::int, 'ms', 3000)) as g2 from matches, generate_series(0,2) i where id = :'e' \gset
set role authenticated;
select pg_temp.as_user('22222222-2222-2222-2222-222222222222');
select 'sim guess score (expect 75): ' || (submit_emoji_guess(:'e', :'g2')->>'my_score');
select emoji_clues(:'e', '["💃🕺","👻🏚️","🚂❤️"]')->>'me_done';
select pg_temp.as_user('11111111-1111-1111-1111-111111111111');
select 'emoji couple (expect 75): ' || (submit_emoji_guess(:'e', '[{"pick":9,"ms":1},{"pick":9,"ms":1},{"pick":9,"ms":1}]')->>'couple_score');
select 'partner set revealed: ' || (match_state(:'e')->'extra'->>'partner_set');
select 'admin: ' || (admin_stats()->>'users') || ' users, ' || (admin_stats()->>'guests') || ' guests, by_game=' || (admin_stats()->>'by_game');
select 'admin jodi row: ' || (admin_stats()->'jodis'->0)::text;
select 'is_admin: ' || (get_home()->>'is_admin');
