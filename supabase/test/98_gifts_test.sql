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
 ('e1000000-0000-0000-0000-000000000001','g1@x.com',false),('e1000000-0000-0000-0000-000000000002','g2@x.com',false),
 ('e1000000-0000-0000-0000-000000000003','g3@x.com',false),('e1000000-0000-0000-0000-000000000004','g4@x.com',false);
set role authenticated;

select pg_temp.as_user('e1000000-0000-0000-0000-000000000001');
select create_couple('G Jodi', 'Raj')->>'code' as gc \gset
select pg_temp.as_user('e1000000-0000-0000-0000-000000000002');
select join_couple(:'gc', 'Simran')->>'name';

-- catalog: no app-only "spark" boxes, plenty of coupons
select pg_temp.as_user('e1000000-0000-0000-0000-000000000001');
select pg_temp.check(json_array_length(gift_catalog()) >= 15, 'catalog should have 15+ items');
select pg_temp.check(not exists (select 1 from json_array_elements(gift_catalog()) e where e->>'kind' = 'spark'), 'sparks stay out of the sender catalog');

-- Raj sends a coupon
select send_gift('coupon', '🍗', 'Biryani on me tonight', 'Redeem this and I will order your favourite biryani.', 'food') as g1 \gset
select pg_temp.check((gift_box()->'unopened')::jsonb = '[]'::jsonb, 'sender has nothing unopened');
select pg_temp.check((gift_box()->'events')::jsonb = '[]'::jsonb, 'no events before anything happens');

-- Simran sees a wrapped box, no content
select pg_temp.as_user('e1000000-0000-0000-0000-000000000002');
select pg_temp.check(json_array_length(gift_box()->'unopened') = 1, 'one wrapped gift waiting');
select pg_temp.check(not ((gift_box()->'unopened'->0)::jsonb ? 'title') and not ((gift_box()->'unopened'->0)::jsonb ? 'body'), 'content stays hidden until opened');

-- sender history lists what was sent, even after nothing is pending
select pg_temp.as_user('e1000000-0000-0000-0000-000000000001');
select pg_temp.check(json_array_length(gift_box()->'sent') = 1 and (gift_box()->'sent'->0->>'opened_at') is null, 'sent history shows unopened gift');

-- Raj cannot open Simran's gift
select pg_temp.as_user('e1000000-0000-0000-0000-000000000001');
select pg_temp.expect_fail(format($$select open_gift(%L)$$, :'g1'), 'not here');

-- Simran opens it
select pg_temp.as_user('e1000000-0000-0000-0000-000000000002');
select pg_temp.check((open_gift(:'g1')->>'title') = 'Biryani on me tonight' and (open_gift(:'g1')->>'make_real') = 'food', 'opening reveals the coupon');
select pg_temp.check(json_array_length(gift_box()->'unopened') = 0, 'nothing wrapped after opening');
select pg_temp.check(json_array_length(gift_box()->'wallet') = 1, 'opened coupon lands in the wallet');

-- Raj sees it was opened
select pg_temp.as_user('e1000000-0000-0000-0000-000000000001');
select pg_temp.check(json_array_length(gift_box()->'events') = 1 and (gift_box()->'sent'->0->>'opened_at') is not null, 'sender sees the open');

select pg_temp.as_user('e1000000-0000-0000-0000-000000000001');
select mark_gifts_seen();
select pg_temp.check(json_array_length(gift_box()->'events') = 0 and (gift_box()->'sent'->0->>'opened_at') is not null, 'history survives dismissing the banner');
-- reaction
select pg_temp.as_user('e1000000-0000-0000-0000-000000000002');
select pg_temp.expect_fail(format($$select react_gift(%L, 'x')$$, :'g1'), 'Pick a reaction');
select react_gift(:'g1', '😂');
select pg_temp.as_user('e1000000-0000-0000-0000-000000000001');
select pg_temp.check((gift_box()->'sent'->0->>'reaction') = '😂', 'sender sees the reaction');
select pg_temp.expect_fail(format($$select react_gift(%L, '😂')$$, :'g1'), 'Open the gift first');   -- sender cannot react to own gift

-- sender dismisses; events clear
select mark_gifts_seen();
select pg_temp.check(json_array_length(gift_box()->'events') = 0, 'events clear after dismissing');

-- redeem
select pg_temp.as_user('e1000000-0000-0000-0000-000000000002');
select redeem_gift(:'g1');
select pg_temp.check(json_array_length(gift_box()->'wallet') = 0, 'redeemed coupon leaves the wallet');
select pg_temp.expect_fail(format($$select redeem_gift(%L)$$, :'g1'), 'not available');
select pg_temp.as_user('e1000000-0000-0000-0000-000000000001');
select pg_temp.check(json_array_length(gift_box()->'events') = 1 and (gift_box()->'sent'->0->>'redeemed_at') is not null, 'sender sees the redemption');

-- reacting before opening is refused; a dare is not redeemable
select send_gift('dare', '🤪', 'Worst selfie', 'Send it now.') as g2 \gset
select pg_temp.as_user('e1000000-0000-0000-0000-000000000002');
select pg_temp.expect_fail(format($$select react_gift(%L, '🔥')$$, :'g2'), 'Open the gift first');
select open_gift(:'g2')->>'kind';
select pg_temp.expect_fail(format($$select redeem_gift(%L)$$, :'g2'), 'not available');

-- validation
select pg_temp.as_user('e1000000-0000-0000-0000-000000000001');
select pg_temp.expect_fail($$select send_gift('weird', '🎁', 'x', 'y')$$, 'Unknown gift');
select pg_temp.expect_fail($$select send_gift('coupon', '🎁', 'x', '')$$, '1 and 200');
select pg_temp.expect_fail($$select send_gift('coupon', '🎁', 'x', repeat('a', 201))$$, '1 and 200');
select pg_temp.expect_fail($$select send_gift('coupon', '🎁', '', 'body')$$, 'Add a title');
select send_gift('note', null, null, 'Miss you') as g3 \gset
select pg_temp.as_user('e1000000-0000-0000-0000-000000000002');
select pg_temp.check((open_gift(:'g3')->>'title') = 'A note for you' and (open_gift(:'g3')->>'emoji') = '🎁', 'note gets a default title and emoji');

-- daily limit: 30 gifts in a day
reset role;
insert into gifts(couple_id, from_user, to_user, kind, emoji, title, body)
select (select couple_id from profiles where id = 'e1000000-0000-0000-0000-000000000001'),
       'e1000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000002', 'note', '💌', 't', 'b'
from generate_series(1, 30);
set role authenticated;
select pg_temp.as_user('e1000000-0000-0000-0000-000000000001');
select pg_temp.expect_fail($$select send_gift('note', '💌', 't', 'one too many')$$, 'lot of surprises');

-- free daily box
select pg_temp.as_user('e1000000-0000-0000-0000-000000000002');
select pg_temp.check((gift_box()->>'free_available')::boolean, 'free box available at first');
select pg_temp.check((claim_free_gift()->>'from_system')::boolean, 'free box comes from the app');
select pg_temp.check(not (gift_box()->>'free_available')::boolean, 'free box used for today');
select pg_temp.expect_fail($$select claim_free_gift()$$, 'Come back tomorrow');
select pg_temp.check(json_array_length(gift_box()->'wallet') = 0, 'spark is not a coupon');

-- solo player: cannot send, can claim the free box
select pg_temp.as_user('e1000000-0000-0000-0000-000000000003');
select create_couple('Solo Jodi', 'Vik')->>'code';
select pg_temp.check(not (gift_box()->>'has_partner')::boolean, 'solo has no partner');
select pg_temp.expect_fail($$select send_gift('note', '💌', 't', 'hi')$$, 'partner needs to join');
select pg_temp.check((claim_free_gift()->>'title') is not null, 'solo can open the free box');

-- no couple, no data; tables stay locked
select pg_temp.as_user('e1000000-0000-0000-0000-000000000004');
select pg_temp.check(gift_box() is null, 'no couple, no gift box');
select pg_temp.expect_fail($$select claim_free_gift()$$, 'Set up your jodi');
select pg_temp.expect_fail($$select * from gifts$$, 'permission denied');
select pg_temp.expect_fail($$select * from gift_catalog$$, 'permission denied');
select pg_temp.expect_fail($$select _gift_json(null::gifts)$$, 'permission denied');
select 'GIFTS OK';
