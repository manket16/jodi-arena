-- Voice notes: allow audio files in the proofs and memories buckets, and let dare / stake proofs be audio.
-- Additive: photos and videos keep working exactly as before.
update storage.buckets
set allowed_mime_types = array['image/jpeg','image/png','image/webp','video/mp4','video/quicktime','video/webm',
                               'audio/mp4','audio/x-m4a','audio/aac','audio/mpeg','audio/webm','audio/ogg']
where id in ('proofs', 'memories');

create or replace function public.submit_proof(p_id uuid, p_path text, p_kind text, p_note text default null)
returns void language plpgsql security definer set search_path to 'public' as $$
declare c uuid := public.my_couple();
begin
  if c is null then raise exception 'Set up your jodi first'; end if;
  if p_kind not in ('image', 'video', 'audio') then raise exception 'Add a photo, a video or a voice note'; end if;
  if p_path is null or p_path not like c::text || '/%' or p_path like '%..%' or char_length(p_path) > 200 then raise exception 'Invalid file'; end if;
  p_note := left(nullif(trim(coalesce(p_note, '')), ''), 120);
  update public.gifts set status = 'proof_sent', proof_path = p_path, proof_kind = p_kind, proof_note = p_note, proof_at = now()
  where id = p_id and to_user = auth.uid() and kind = 'dare' and opened_at is not null and status in ('sent', 'redo');
  if not found then raise exception 'That challenge is not open'; end if;
end $$;

create or replace function public.duel_submit_proof(p_id uuid, p_path text, p_kind text, p_note text default null)
returns void language plpgsql security definer set search_path to 'public' as $$
declare c uuid := public.my_couple();
begin
  if c is null then raise exception 'Set up your jodi first'; end if;
  if p_kind not in ('image', 'video', 'audio') then raise exception 'Add a photo, a video or a voice note'; end if;
  if p_path is null or p_path not like c::text || '/%' or p_path like '%..%' or char_length(p_path) > 200 then raise exception 'Invalid file'; end if;
  p_note := left(nullif(trim(coalesce(p_note, '')), ''), 120);
  update public.duels set proof_path = p_path, proof_kind = p_kind, proof_note = p_note, proof_at = now()
   where id = p_id and couple_id = c and loser = auth.uid() and stake is not null and paid_at is null;
  if not found then raise exception 'That stake is not open'; end if;
end $$;
