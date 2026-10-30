\set ON_ERROR_STOP on
\pset format unaligned
\pset tuples_only on
create or replace function pg_temp.as_user(u text) returns void language sql as $$ select set_config('request.jwt.claim.sub', u, false) $$;
create or replace function pg_temp.expect_fail(q text, frag text) returns void language plpgsql as $$
begin execute q; raise exception 'FAIL expected error containing % for: %', frag, q;
exception when others then if sqlerrm like 'FAIL%' then raise; end if; if sqlerrm not ilike '%' || frag || '%' then raise exception 'FAIL wrong error [%] expected [%]', sqlerrm, frag; end if; end $$;
grant execute on function pg_temp.expect_fail(text, text) to public;
insert into auth.users(id, email, is_anonymous) values
 ('c1000000-0000-0000-0000-000000000001','d1@x.com',false),('c1000000-0000-0000-0000-000000000002','d2@x.com',false),('c1000000-0000-0000-0000-000000000003','d3@x.com',false);
set role authenticated;
select pg_temp.as_user('c1000000-0000-0000-0000-000000000001');
select create_couple('Duel Jodi', 'Ravi')->>'code' as dc \gset
select pg_temp.expect_fail($$select record_duel('momo', null, '{}'::jsonb, 'x')$$, 'partner');
select pg_temp.as_user('c1000000-0000-0000-0000-000000000002');
select join_couple(:'dc', 'Shivani')->>'name';
select record_duel('momo', 'c1000000-0000-0000-0000-000000000002', '{"a":5,"b":2}'::jsonb, '5-min head massage') as d1 \gset
select 'dedup same id: ' || (record_duel('momo', 'c1000000-0000-0000-0000-000000000002', '{}'::jsonb, 'x') = :'d1');
select pg_temp.expect_fail($$select record_duel('cricket', null, '{}'::jsonb, null)$$, 'Unknown');
select pg_temp.expect_fail($$select record_duel('momo', 'c1000000-0000-0000-0000-000000000003', '{}'::jsonb, null)$$, 'one of you');
reset role; update public.duels set created_at = now() - interval '1 minute'; set role authenticated;
select pg_temp.as_user('c1000000-0000-0000-0000-000000000001');
select record_duel('slider', null, '{}'::jsonb, null) is not null as tie;
select 'board: ' || (duel_board()->>'my_wins') || '-' || (duel_board()->>'partner_wins') || ' ties ' || (duel_board()->>'ties') || ' recent ' || json_array_length(duel_board()->'recent');
select duel_paid(:'d1');
select 'paid set: ' || ((duel_board()->'recent'->1->>'paid_at') is not null);
select pg_temp.as_user('c1000000-0000-0000-0000-000000000003');
select create_couple('Other', 'Z')->>'name';
select pg_temp.expect_fail(format($$select duel_paid(%L)$$, :'d1'), 'not found');
select 'stranger board: ' || json_array_length(duel_board()->'recent');
select 'ALL DUEL TESTS PASSED';
