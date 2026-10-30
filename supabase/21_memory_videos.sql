-- Short videos in memories: same private bucket, now also accepts video files up to 40 MB
update storage.buckets
set file_size_limit = 41943040,
    allowed_mime_types = array['image/jpeg','image/png','image/webp','video/mp4','video/quicktime','video/webm']
where id = 'memories';
