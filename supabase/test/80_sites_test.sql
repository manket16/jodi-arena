\set ON_ERROR_STOP on
\pset format unaligned
\pset tuples_only on
create or replace function pg_temp.as_user(u text) returns void language sql as $$ select set_config('request.jwt.claim.sub', u, false) $$;
create or replace function pg_temp.expect_fail(q text, frag text) returns void language plpgsql as $$
begin execute q; raise exception 'FAIL expected error containing % for: %', frag, q;
exception when others then if sqlerrm like 'FAIL%' then raise; end if; if sqlerrm not ilike '%' || frag || '%' then raise exception 'FAIL wrong error [%] expected [%]', sqlerrm, frag; end if; end $$;
grant execute on function pg_temp.expect_fail(text, text) to public;
insert into auth.users(id, email, is_anonymous) values
 ('b1000000-0000-0000-0000-000000000001','s1@x.com',false),('b1000000-0000-0000-0000-000000000002','s2@x.com',false),
 ('b1000000-0000-0000-0000-000000000003','s3@x.com',false);
set role authenticated;
select pg_temp.as_user('b1000000-0000-0000-0000-000000000001');
select create_couple('Site Jodi', 'Ravi')->>'code' as sc \gset
select pg_temp.as_user('b1000000-0000-0000-0000-000000000002');
select join_couple(:'sc', 'Shivani')->>'name';
select save_site(null, 'proposal', 'For Shivani', '{"headline":"Will you?"}'::jsonb) as s1 \gset
select (:'s1'::json->>'slug') ~ '^[a-z0-9]{8}$' as slug_ok;
select pg_temp.expect_fail($$select save_site(null, 'hacker', 'x', '{}'::jsonb)$$, 'template');
select pg_temp.expect_fail($$select save_site(null, 'classic', '', '{}'::jsonb)$$, 'title');
select pg_temp.expect_fail($$select save_site(null, 'classic', 'x', '[]'::jsonb)$$, 'Nothing');
select pg_temp.expect_fail(format($$select save_site(null, 'classic', 'x', %L::jsonb)$$, json_build_object('a', repeat('x', 70000))), 'too much');
select save_site((:'s1'::json->>'id')::uuid, 'stars', 'For Shivani v2', '{"headline":"Stars"}'::jsonb)->>'slug' = (:'s1'::json->>'slug') as same_slug;
select pg_temp.as_user('b1000000-0000-0000-0000-000000000001');
select 'partner lists: ' || json_array_length(list_sites()) || ' tpl=' || (list_sites()->0->>'template') || ' mine=' || (list_sites()->0->>'mine');
select pg_temp.as_user('b1000000-0000-0000-0000-000000000003');
select create_couple('Lonely', 'Z')->>'name';
select 'stranger lists: ' || json_array_length(list_sites());
select pg_temp.expect_fail(format($$select delete_site(%L)$$, :'s1'::json->>'id'), 'not found');
select pg_temp.expect_fail(format($$select save_site(%L, 'classic', 'hijack', '{}'::jsonb)$$, :'s1'::json->>'id'), 'not found');
reset role;
set role anon;
select 'public get: ' || (get_site(:'s1'::json->>'slug')->>'title');
select 'bad slug: ' || coalesce(get_site('nope')::text, 'null');
select 'views: ' || (select 1);
reset role;
select 'view count: ' || views from public.sites where slug = (:'s1'::json->>'slug');
set role anon;
do $$ begin perform public.list_sites(); raise exception 'FAIL anon list'; exception when insufficient_privilege then null; end $$;
reset role;
set role authenticated;
select pg_temp.as_user('b1000000-0000-0000-0000-000000000002');
select my_couple()::text as cid \gset
insert into storage.objects(bucket_id, name) values ('site-photos', :'cid' || '/p.jpg');
do $$ begin
  begin insert into storage.objects(bucket_id, name) values ('site-photos', '11111111-1111-1111-1111-111111111111/bad.jpg'); raise exception 'FAIL foreign site photo';
  exception when insufficient_privilege then null; end;
end $$;
select delete_site((:'s1'::json->>'id')::uuid);
select 'after delete: ' || json_array_length(list_sites());
select 'ALL SITES TESTS PASSED';
