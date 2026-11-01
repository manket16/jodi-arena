-- Voice-note proofs: the proof_kind check on gifts and duels only allowed image and video.
alter table public.gifts drop constraint if exists gifts_proof_kind_check;
alter table public.gifts add constraint gifts_proof_kind_check check (proof_kind = any (array['image','video','audio']));
alter table public.duels drop constraint if exists duels_proof_kind_check;
alter table public.duels add constraint duels_proof_kind_check check (proof_kind = any (array['image','video','audio']));
