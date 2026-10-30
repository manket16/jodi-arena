-- Sender keeps a history of what they sent and how it landed, even after dismissing the banner
create or replace function public.gift_box() returns json
language plpgsql stable security definer set search_path = public as $$
declare uid uuid := auth.uid(); c uuid := public.my_couple();
begin
  if c is null then return null; end if;
  return json_build_object(
    'has_partner', public._partner() is not null,
    'unopened', (select coalesce(json_agg(json_build_object('id', id, 'created_at', created_at) order by created_at desc), '[]'::json)
                 from (select id, created_at from public.gifts where to_user = uid and opened_at is null order by created_at desc limit 20) g),
    'free_available', not exists (select 1 from public.gift_free_claims where user_id = uid and day = public.today_ist()),
    'events', (select coalesce(json_agg(json_build_object('id', id, 'kind', kind, 'emoji', emoji, 'title', title, 'opened_at', opened_at,
                                                          'reaction', reaction, 'redeemed_at', redeemed_at) order by at desc), '[]'::json)
               from (select *, greatest(coalesce(opened_at, '-infinity'), coalesce(reacted_at, '-infinity'), coalesce(redeemed_at, '-infinity')) as at
                     from public.gifts where from_user = uid) s
               where s.at > coalesce(s.sender_seen_at, '-infinity') and s.at > '-infinity'),
    'sent', (select coalesce(json_agg(json_build_object('id', id, 'kind', kind, 'emoji', emoji, 'title', title, 'created_at', created_at,
                                                       'opened_at', opened_at, 'reaction', reaction, 'redeemed_at', redeemed_at) order by created_at desc), '[]'::json)
             from (select * from public.gifts where from_user = uid order by created_at desc limit 30) t),
    'wallet', (select coalesce(json_agg(json_build_object('id', id, 'emoji', emoji, 'title', title, 'body', body, 'make_real', make_real) order by opened_at desc), '[]'::json)
               from (select * from public.gifts where to_user = uid and kind = 'coupon' and opened_at is not null and redeemed_at is null
                     order by opened_at desc limit 30) w));
end $$;

