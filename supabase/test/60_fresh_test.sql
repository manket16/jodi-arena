\set ON_ERROR_STOP on
\pset format unaligned
\pset tuples_only on
create or replace function pg_temp.as_user(u text) returns void language sql as $$ select set_config('request.jwt.claim.sub', u, false) $$;
insert into auth.users(id, email) values ('77777777-7777-7777-7777-777777777777','f1@x.com'),('88888888-8888-8888-8888-888888888888','f2@x.com');
set role authenticated;
select pg_temp.as_user('77777777-7777-7777-7777-777777777777');
select create_couple('Fresh Jodi', 'Kabir')->>'code' as fc \gset
select pg_temp.as_user('88888888-8888-8888-8888-888888888888');
select join_couple(:'fc', 'Meera')->>'name';
select 'level start: ' || (my_level()->>'level') || ' ' || (my_level()->>'name');
reset role;
create temp table rounds(game text, mid uuid);
grant all on rounds to authenticated;
set role authenticated;
do $$ declare m uuid; c uuid := my_couple(); begin
  for i in 1..10 loop
    m := start_match(case when i % 2 = 0 then 'sync' else 'kyj' end);
    insert into rounds values (case when i % 2 = 0 then 'sync' else 'kyj' end, m);
    -- pretend both partners finished
    perform set_config('role','postgres',true);
    reset role;
    update matches set a_done = true where id = m and couple_a = c;
    update matches set b_done = true where id = m and couple_b = c;
    set role authenticated;
  end loop; end $$;
select 'level after 10: ' || (my_level()->>'level') || ' ' || (my_level()->>'name') || ' seen=' || (my_level()->>'seen');
reset role;
select 'dup sync prompts: ' || (select count(*) - count(distinct x) from (select e->>'id' x from rounds r join matches m on m.id=r.mid, jsonb_array_elements(m.content->'prompts') e where r.game='sync') z);
select 'dup kyj questions: ' || (select count(*) - count(distinct x) from (select e->>'id' x from rounds r join matches m on m.id=r.mid, jsonb_array_elements(m.content->'questions') e where r.game='kyj') z);
select 'max kyj depth seen: ' || (select max((e->>'depth')::int) from rounds r join matches m on m.id=r.mid, jsonb_array_elements(m.content->'questions') e where r.game='kyj');
select 'hum seen tracked: ' || (select count(*) from (select * from public.gen_content_for('hum', (select id from couples where name='Fresh Jodi'))) g);
