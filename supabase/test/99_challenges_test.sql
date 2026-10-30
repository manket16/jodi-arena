\set ON_ERROR_STOP on
\pset format unaligned
\pset tuples_only on
create or replace function pg_temp.as_user(u text) returns void language sql as $$ select set_config('request.jwt.claim.sub', u, false) $$;
create or replace function pg_temp.expect_fail(q text, frag text) returns void language plpgsql as $$
begin execute q; raise exception 'FAIL expected error containing % for: %', frag, q;
exception when others then if sqlerrm like 'FAIL%' then raise; end if; if sqlerrm not ilike '%' || frag || '%' then raise exception 'FAIL wrong error [%] expected [%]', sqlerrm, frag; end if; end $$;
create or replace function pg_temp.check(ok boolean, msg text) returns void language plpgsql as $$ begin if not ok then raise exception 'FAIL %', msg; end if; end $$;
grant execute on function pg_temp.as_user(text), pg_temp.expect_fail(text, text), pg_temp.check(boolean, text) to public;

insert into auth.users(id, email, is_anonymous) values
 ('f1000000-0000-0000-0000-000000000001','c1@x.com',false),('f1000000-0000-0000-0000-000000000002','c2@x.com',false),
 ('f1000000-0000-0000-0000-000000000003','c3@x.com',false);
set role authenticated;
select pg_temp.as_user('f1000000-0000-0000-0000-000000000001');
select create_couple('C Jodi', 'Raj')->>'code' as cc \gset
select pg_temp.as_user('f1000000-0000-0000-0000-000000000002');
select join_couple(:'cc', 'Simran')->>'name';
select pg_temp.as_user('f1000000-0000-0000-0000-000000000001');
select id as cid from (select my_couple() id) x \gset

-- catalog: plans and dares, never coupons or sparks
select pg_temp.check(exists (select 1 from json_array_elements(gift_catalog()) e where e->>'kind' = 'plan'), 'catalog has plans');
select pg_temp.check(not exists (select 1 from json_array_elements(gift_catalog()) e where e->>'kind' in ('coupon','spark')), 'no coupons in the sender catalog');

-- plans need a future time
select pg_temp.expect_fail($$select send_gift('plan', '🕯️', 'Candlelight dinner', 'dinner', 'date')$$, 'future');
select pg_temp.expect_fail($$select send_gift('plan', '🕯️', 'Candlelight dinner', 'dinner', 'date', now() - interval '1 hour')$$, 'future');
select send_gift('plan', '🕯️', 'Candlelight dinner', 'A proper dinner date.', 'date', now() + interval '3 days') as p1 \gset

-- Simran opens the plan, sees it pending, accepts
select pg_temp.as_user('f1000000-0000-0000-0000-000000000002');
select pg_temp.check((open_gift(:'p1')->>'plan_at') is not null, 'plan time is visible once opened');
select pg_temp.check(json_array_length(gift_box()->'plans') = 1, 'plan waits for an answer');
select pg_temp.expect_fail(format($$select reply_plan(%L, 'maybe')$$, :'p1'), 'Pick an answer');
select reply_plan(:'p1', 'other', 'Can we do Saturday?');
select pg_temp.as_user('f1000000-0000-0000-0000-000000000001');
select pg_temp.check((gift_box()->'sent'->0->>'plan_reply') = 'other' and (gift_box()->'sent'->0->>'plan_reply_note') = 'Can we do Saturday?', 'sender sees the reply');
select pg_temp.check((gift_box()->>'badge')::int = 1, 'badge counts the plan reply');
select mark_gifts_seen();
select pg_temp.check((gift_box()->>'badge')::int = 0, 'badge clears');

-- a dare with proof
select send_gift('dare', '🤪', 'Worst selfie', 'Send your worst selfie now.') as d1 \gset
select pg_temp.as_user('f1000000-0000-0000-0000-000000000002');
select pg_temp.expect_fail(format($$select submit_proof(%L, %L, 'image')$$, :'d1', :'cid' || '/a.jpg'), 'not open');   -- not opened yet
select open_gift(:'d1')->>'kind';
select pg_temp.check(json_array_length(gift_box()->'challenges') = 1, 'dare is waiting for proof');
select pg_temp.expect_fail(format($$select submit_proof(%L, 'other-couple/a.jpg', 'image')$$, :'d1'), 'Invalid file');
select pg_temp.expect_fail(format($$select submit_proof(%L, %L, 'gif')$$, :'d1', :'cid' || '/a.gif'), 'photo or a video');
select submit_proof(:'d1', :'cid' || '/a.mp4', 'video', 'Here you go');
select pg_temp.check((gift_box()->'challenges'->0->>'status') = 'proof_sent', 'status is proof_sent');
select pg_temp.expect_fail(format($$select approve_dare(%L)$$, :'d1'), 'Nothing to approve');   -- receiver cannot approve

-- sender: badge shows a review waiting, sees the proof
select pg_temp.as_user('f1000000-0000-0000-0000-000000000001');
select pg_temp.check((gift_box()->>'badge')::int = 1, 'badge shows the proof waiting');
select mark_gifts_seen();
select pg_temp.check((gift_box()->>'badge')::int = 1, 'badge stays until reviewed');
select pg_temp.check((gift_box()->'sent'->0->>'id') = :'d1' and (gift_box()->'sent'->0->>'proof_kind') = 'video', 'review item sorts first with proof');

-- ask again with a note
select redo_dare(:'d1', 'Try with a funny face');
select pg_temp.check((gift_box()->>'badge')::int = 0, 'badge clears after sending back');
select pg_temp.as_user('f1000000-0000-0000-0000-000000000002');
select pg_temp.check((gift_box()->'challenges'->0->>'status') = 'redo' and (gift_box()->'challenges'->0->>'redo_note') = 'Try with a funny face', 'receiver sees the redo note');
select submit_proof(:'d1', :'cid' || '/b.jpg', 'image');

-- approve: couple earns 50 points, shows on the Sync board
select pg_temp.as_user('f1000000-0000-0000-0000-000000000001');
select pg_temp.expect_fail(format($$select redo_dare(%L)$$, '00000000-0000-0000-0000-000000000000'), 'Nothing to send back');
select pg_temp.check(approve_dare(:'d1') = 50, 'approval gives 50 points');
select pg_temp.expect_fail(format($$select approve_dare(%L)$$, :'d1'), 'Nothing to approve');
select pg_temp.check((sync_board()->'mine'->>'points')::int = 50, 'points reach the Sync board');
select pg_temp.as_user('f1000000-0000-0000-0000-000000000002');
select pg_temp.check((gift_box()->'challenges'->0->>'status') = 'approved', 'receiver sees approved for a day');
select pg_temp.check((sync_board()->'mine'->>'points')::int = 50, 'both partners share the points');

-- no couple, no access
select pg_temp.as_user('f1000000-0000-0000-0000-000000000003');
select pg_temp.expect_fail(format($$select approve_dare(%L)$$, :'d1'), 'Nothing to approve');
select 'CHALLENGES OK';
