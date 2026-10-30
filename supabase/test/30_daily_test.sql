\set ON_ERROR_STOP on
\pset format unaligned
\pset tuples_only on
create or replace function pg_temp.as_user(u text) returns void language sql as $$ select set_config('request.jwt.claim.sub', u, false) $$;
select 'season: ' || (current_season()).name;
select 'seasonal sync in gen: ' || (select count(*) from jsonb_array_elements((gen_content('sync')).o_content->'prompts') e join sync_prompts s on s.id=(e->>'id')::int where s.season='diwali26');
select 'seasonal trivia in gen: ' || (select count(*) from jsonb_array_elements((gen_content('cricket')).o_content->'questions') e join trivia s on s.id=(e->>'id')::int where s.season='diwali26') || ' of ' || jsonb_array_length((gen_content('cricket')).o_content->'questions');
set role authenticated;
select pg_temp.as_user('11111111-1111-1111-1111-111111111111');
select 'today game: ' || (get_home()->'daily'->>'game');
select start_daily() as d1 \gset
select pg_temp.as_user('22222222-2222-2222-2222-222222222222');
select start_daily() = :'d1' as same_daily;
select pg_temp.as_user('33333333-3333-3333-3333-333333333333');
select start_daily() as d2 \gset
select :'d1' <> :'d2' as separate_match_per_couple;
reset role;
select (select content from matches where id=:'d1') = (select content from matches where id=:'d2') as same_content_for_everyone;
-- force today's daily to sync for a predictable test
update daily_challenges set game='sync', content=(gen_content('sync')).o_content, keys='{}'; update matches set game='sync', content=(select content from daily_challenges limit 1), keys='{}' where daily_day is not null;
select game from matches where id=:'d1';
