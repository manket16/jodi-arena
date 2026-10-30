\set ON_ERROR_STOP on
\pset format unaligned
\pset tuples_only on
create or replace function pg_temp.as_user(u text) returns void language sql as $$ select set_config('request.jwt.claim.sub', u, false) $$;
create or replace function pg_temp.expect_fail(q text, frag text) returns void language plpgsql as $$
begin execute q; raise exception 'FAIL expected error containing % for: %', frag, q;
exception when others then if sqlerrm like 'FAIL%' then raise; end if; if sqlerrm not ilike '%' || frag || '%' then raise exception 'FAIL wrong error [%] expected [%]', sqlerrm, frag; end if; end $$;
grant execute on function pg_temp.expect_fail(text, text) to public;
insert into auth.users(id, email, is_anonymous) values
 ('a1000000-0000-0000-0000-000000000001','h1@x.com',false),('a1000000-0000-0000-0000-000000000002','h2@x.com',false),
 ('a1000000-0000-0000-0000-000000000003','h3@x.com',false),('a1000000-0000-0000-0000-000000000004','h4@x.com',false),
 ('a1000000-0000-0000-0000-000000000005', null, true),('a1000000-0000-0000-0000-000000000006', null, true);
set role authenticated;
select pg_temp.as_user('a1000000-0000-0000-0000-000000000001');
select create_couple('Hub Jodi', 'Arjun')->>'code' as hc \gset
select pg_temp.as_user('a1000000-0000-0000-0000-000000000002');
select join_couple(:'hc', 'Tara')->>'name';
select pg_temp.as_user('a1000000-0000-0000-0000-000000000003');
select create_couple('Other Jodi', 'Vik')->>'code' as oc \gset
select pg_temp.as_user('a1000000-0000-0000-0000-000000000004');
select join_couple(:'oc', 'Mina')->>'name';

-- memories
select pg_temp.as_user('a1000000-0000-0000-0000-000000000001');
select my_couple()::text as hid \gset
select add_memory('Barbeque Nation', 'Her eyes', current_date - 400, 'Dates', 'Patna', array[:'hid' || '/a.jpg', :'hid' || '/b.jpg']) as m1 \gset
select add_memory('Same day last year', null, (current_date - interval '1 year')::date, null, null, '{}') as m2 \gset
select pg_temp.expect_fail($$select add_memory('Sneaky', null, current_date, null, null, array['00000000-0000-0000-0000-000000000000/x.jpg'])$$, 'Invalid photo');
select pg_temp.expect_fail($$select add_memory('', null, current_date, null, null, '{}')$$, 'title');
select pg_temp.expect_fail($$select add_memory('Future', null, current_date + 30, null, null, '{}')$$, 'date');
select 'memories listed: ' || json_array_length(list_memories());
select 'newest first: ' || (list_memories()->0->>'title');
select pg_temp.as_user('a1000000-0000-0000-0000-000000000002');
select 'partner sees them: ' || json_array_length(list_memories()) || ' mine=' || (list_memories()->0->>'mine');
select 'fav toggled: ' || toggle_memory_fav(:'m1');
select pg_temp.as_user('a1000000-0000-0000-0000-000000000003');
select 'stranger sees: ' || json_array_length(list_memories());
select pg_temp.expect_fail(format($$select toggle_memory_fav(%L)$$, :'m1'), 'not found');
select pg_temp.expect_fail(format($$select delete_memory(%L)$$, :'m1'), 'not found');
select pg_temp.as_user('a1000000-0000-0000-0000-000000000001');
select 'on this day: ' || (hub_counts()->>'on_this_day') || ' total ' || (hub_counts()->>'memories');
select 'deleted paths: ' || array_to_string(delete_memory(:'m1'), ',');

-- storage policy (bucket folder = couple)
insert into storage.objects(bucket_id, name) values ('memories', :'hid' || '/ok.jpg');
do $$ begin
  begin insert into storage.objects(bucket_id, name) values ('memories', '11111111-1111-1111-1111-111111111111/bad.jpg'); raise exception 'FAIL foreign folder upload allowed';
  exception when insufficient_privilege then null; end;
end $$;
select 'storage visible to own couple: ' || count(*) from storage.objects where bucket_id = 'memories';
select pg_temp.as_user('a1000000-0000-0000-0000-000000000003');
select 'storage visible to stranger: ' || count(*) from storage.objects where bucket_id = 'memories';

-- love notes
select pg_temp.as_user('a1000000-0000-0000-0000-000000000001');
select send_note('quick', 'Hug', 'Sending you a big hug', '🧸') is not null as q;
select send_note('note', 'Hi', 'Thinking about you') as n1 \gset
select send_note('note', 'Anniversary', 'Happy anniversary jaan', '💌', null, now() + interval '2 days') as n2 \gset
select send_note('openwhen', 'Feeling low', 'You are stronger than you think', null, 'feeling low') as l1 \gset
select send_note('openwhen', null, 'Come here, I will make chai', null, 'we fight') is not null as l2;
select send_note('jar', null, 'The way you laugh at your own jokes') is not null as j1;
select send_note('jar', null, 'You remember every birthday') is not null as j2;
select pg_temp.expect_fail($$select send_note('openwhen', null, 'x')$$, 'when');
select pg_temp.expect_fail($$select send_note('note', null, 'x', null, null, now() - interval '1 hour')$$, 'future');
select pg_temp.expect_fail($$select send_note('quick', null, 'x', null, null, now() + interval '1 day')$$, 'scheduled');
select pg_temp.expect_fail($$select send_note('note', null, '   ')$$, 'characters');
select 'sender sees sent: ' || json_array_length(love_notes()->'sent') || ' pending=' || (select count(*) from json_array_elements(love_notes()->'sent') x where (x->>'pending')::boolean);
select 'sender inbox empty: ' || json_array_length(love_notes()->'inbox');
select pg_temp.as_user('a1000000-0000-0000-0000-000000000002');
select 'receiver counts: ' || hub_counts()::text;
select 'inbox (no scheduled): ' || json_array_length(love_notes()->'inbox') || ' incoming_scheduled=' || json_array_length(love_notes()->'incoming_scheduled');
select 'scheduled body leaked: ' || ((love_notes()->'incoming_scheduled'->0)::jsonb ? 'body');
select 'letters hidden: ' || (select count(*) from json_array_elements(love_notes()->'openwhen_in') x where x->>'title' is not null);
select 'letter body via list: ' || (love_notes()::text like '%stronger than you think%');
select 'open letter: ' || (open_letter(:'l1')->>'body');
select 'letter title now visible: ' || (select count(*) from json_array_elements(love_notes()->'openwhen_in') x where x->>'title' is not null);
select mark_note_read(:'n1');
select 'unread after read: ' || (hub_counts()->>'unread_notes');
select 'jar pull: ' || (pull_jar()->>'left') || ' left';
select 'jar pull 2: ' || (pull_jar()->>'left') || ' left';
select 'jar pull 3 (repeat, not fresh): ' || (pull_jar()->>'fresh');
select pg_temp.as_user('a1000000-0000-0000-0000-000000000003');
select pg_temp.expect_fail(format($$select open_letter(%L)$$, :'l1'), 'not found');
select pg_temp.expect_fail(format($$select delete_note(%L)$$, :'n1'), 'not found');
select 'stranger inbox: ' || json_array_length(love_notes()->'inbox');
select pg_temp.as_user('a1000000-0000-0000-0000-000000000001');
select 'sender sees seen flag: ' || (select (x->>'seen') from json_array_elements(love_notes()->'sent') x where x->>'id' = :'n1');
select delete_note(:'n2');
select 'after delete sent: ' || json_array_length(love_notes()->'sent');

-- AI quota + guests
select 'ai left start: ' || (hub_counts()->>'ai_left');
select 'quota 1: ' || (ai_quota_take(2)->>'left');
select 'quota 2: ' || (ai_quota_take(2)->>'left');
select pg_temp.expect_fail($$select ai_quota_take(2)$$, 'all 2 AI');
select 'ai left end: ' || (hub_counts()->>'ai_left');
select 'names: ' || (ai_quota_take(5)->>'partner');
select pg_temp.as_user('a1000000-0000-0000-0000-000000000005');
select create_couple('Guest Hub', 'Gia')->>'code' as gc \gset
select pg_temp.as_user('a1000000-0000-0000-0000-000000000006');
select join_couple(:'gc', 'Gus')->>'name';
select pg_temp.expect_fail($$select ai_quota_take()$$, 'Save your account');
select 'guest can use memories: ' || (add_memory('Guest day', null, current_date, null, null, '{}') is not null);
select 'guest can send notes: ' || (send_note('quick', 'Hug', 'hug') is not null);
