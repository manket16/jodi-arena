\set ON_ERROR_STOP on
\pset format unaligned
\pset tuples_only on
create or replace function pg_temp.as_user(u text) returns void language sql as $$ select set_config('request.jwt.claim.sub', u, false) $$;
insert into auth.users(id, email, is_anonymous) values
 ('d2000000-0000-0000-0000-000000000001','s1@x.com',false),('d2000000-0000-0000-0000-000000000002','s2@x.com',false),
 ('d2000000-0000-0000-0000-000000000003','s3@x.com',false),('d2000000-0000-0000-0000-000000000004','s4@x.com',false);
set role authenticated;
select pg_temp.as_user('d2000000-0000-0000-0000-000000000001');
select create_couple('Sync A', 'A1')->>'code' as ca \gset
select pg_temp.as_user('d2000000-0000-0000-0000-000000000002');
select join_couple(:'ca', 'A2')->>'name';
select pg_temp.as_user('d2000000-0000-0000-0000-000000000003');
select create_couple('Sync B', 'B1')->>'code' as cb \gset
select pg_temp.as_user('d2000000-0000-0000-0000-000000000004');
select join_couple(:'cb', 'B2')->>'name';
-- couple A earns 60 + 5000 (trimmed to the 120 cap for jhooth)
select pg_temp.as_user('d2000000-0000-0000-0000-000000000001');
select record_duel_sync('slider', null, '{}'::jsonb, null, 60) is not null;
reset role; update public.duels set created_at = now() - interval '1 minute'; set role authenticated;
select pg_temp.as_user('d2000000-0000-0000-0000-000000000001');
select record_duel_sync('jhooth', null, '{}'::jsonb, null, 5000) is not null;
select record_duel_sync('momo', null, '{}'::jsonb, null, 99) is not null as momo_ignored;
select pg_temp.as_user('d2000000-0000-0000-0000-000000000003');
reset role; update public.duels set created_at = now() - interval '1 minute'; set role authenticated;
select pg_temp.as_user('d2000000-0000-0000-0000-000000000003');
select record_duel_sync('draw', null, '{}'::jsonb, null, 45) is not null;
select pg_temp.as_user('d2000000-0000-0000-0000-000000000001');
select 'mine A: ' || (sync_board()->'mine'->>'points') || ' rank ' || (sync_board()->'mine'->>'rank');
select 'top: ' || (sync_board()->'top'->0->>'name') || ' ' || (sync_board()->'top'->0->>'points') || ' then ' || (sync_board()->'top'->1->>'name') || ' ' || (sync_board()->'top'->1->>'points') || ' count ' || json_array_length(sync_board()->'top');
select 'me flag: ' || (sync_board()->'top'->0->>'me');
select pg_temp.as_user('d2000000-0000-0000-0000-000000000003');
select 'mine B: ' || (sync_board()->'mine'->>'points') || ' rank ' || (sync_board()->'mine'->>'rank');
select 'ALL SYNC TESTS PASSED';
