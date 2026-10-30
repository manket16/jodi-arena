\set ON_ERROR_STOP on
\pset format unaligned
\pset tuples_only on
create or replace function pg_temp.as_user(u text) returns void language sql as $$ select set_config('request.jwt.claim.sub', u, false) $$;
create or replace function pg_temp.expect_fail(q text, frag text) returns void language plpgsql as $$
begin execute q; raise exception 'FAIL expected error containing % for: %', frag, q;
exception when others then if sqlerrm like 'FAIL%' then raise; end if; if sqlerrm not ilike '%' || frag || '%' then raise exception 'FAIL wrong error [%] expected [%]', sqlerrm, frag; end if; end $$;
grant execute on function pg_temp.expect_fail(text, text) to public;
insert into auth.users(id, email, is_anonymous) values
 ('e3000000-0000-0000-0000-000000000001','p1@x.com',false),('e3000000-0000-0000-0000-000000000002','p2@x.com',false),('e3000000-0000-0000-0000-000000000003','p3@x.com',false);
set role authenticated;
select pg_temp.as_user('e3000000-0000-0000-0000-000000000001');
select create_couple('Spin Jodi', 'S1')->>'code' as sc \gset
select 'none yet: ' || coalesce(get_spins()::text, 'null');
select pg_temp.as_user('e3000000-0000-0000-0000-000000000002');
select join_couple(:'sc', 'S2')->>'name';
select pg_temp.expect_fail($$select save_spins(array['a b','c d'])$$, '8');
select pg_temp.expect_fail($$select save_spins(array['aa','bb','cc','dd','ee','ff','gg',' '])$$, 'few words');
select json_array_length(save_spins(array['Bring water from the tap','Head massage 5 min','Make maggi','Call mummy on speaker','Dance on a reel','Buy ice cream','Say sorry in Bhojpuri','Wash my cup'])) as saved;
select pg_temp.as_user('e3000000-0000-0000-0000-000000000001');
select 'partner sees: ' || (get_spins()->>0) || ' / ' || json_array_length(get_spins());
select json_array_length(save_spins(array['1a','2b','3c','4d','5e','6f','7g','8h'])) as resaved;
select 'overwritten: ' || (get_spins()->>0);
select pg_temp.as_user('e3000000-0000-0000-0000-000000000003');
select create_couple('Other', 'Z')->>'name';
select 'stranger: ' || coalesce(get_spins()::text, 'null');
select 'ALL SPIN TESTS PASSED';
