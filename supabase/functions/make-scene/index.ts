// Dream Scenes: starts an image-to-video job at fal.ai and, when it is done, saves the video in the couple's private folder.
// Secrets (Supabase > Edge Functions > Secrets): FAL_KEY (required), FAL_MODEL (optional, a fal image-to-video model id).
import { createClient } from 'jsr:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  const auth = req.headers.get('Authorization') ?? '';
  const url = Deno.env.get('SUPABASE_URL')!;
  const user = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } } });
  const { data: u } = await user.auth.getUser();
  if (!u?.user) return json({ error: 'Please sign in' }, 401);

  let body: { action?: string; id?: string };
  try { body = await req.json(); } catch { return json({ error: 'Bad request' }, 400); }
  const id = String(body.id ?? '');
  const { data: scene } = await user.rpc('scene_get', { p_id: id });
  if (!scene) return json({ error: 'Video not found' }, 404);

  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const falKey = Deno.env.get('FAL_KEY');
  const model = Deno.env.get('FAL_MODEL') ?? 'fal-ai/minimax/hailuo-02/standard/image-to-video';
  const fail = async (msg: string) => {
    await admin.from('scenes').update({ status: 'failed', error: msg.slice(0, 200) }).eq('id', id);
    return json({ status: 'failed', error: msg });
  };

  if (body.action === 'start') {
    if (scene.status !== 'queued') return json({ status: scene.status });
    if (!falKey) return fail('Video making is not switched on yet. The app owner needs to add the video key.');
    const { data: signed } = await admin.storage.from('scenes').createSignedUrl(scene.photo_path, 3600);
    if (!signed?.signedUrl) return fail('Could not read your photo. Try another one.');
    const res = await fetch(`https://queue.fal.run/${model}`, {
      method: 'POST',
      headers: { Authorization: `Key ${falKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: scene.prompt, image_url: signed.signedUrl, duration: '6' }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok || !j.request_id) return fail(typeof j?.detail === 'string' ? j.detail : 'The video service said no. Try a different photo or scene.');
    await admin.from('scenes').update({ status: 'running', provider_ref: { status_url: j.status_url, response_url: j.response_url } }).eq('id', id);
    return json({ status: 'running' });
  }

  if (body.action === 'check') {
    if (scene.status === 'done' || scene.status === 'failed') return json({ status: scene.status, error: scene.error });
    if (scene.status !== 'running' || !scene.provider_ref || !falKey) return json({ status: scene.status });
    if (Date.now() - new Date(scene.created_at).getTime() > 20 * 60 * 1000) return fail('This took too long. Please try again.');
    const st = await fetch(scene.provider_ref.status_url, { headers: { Authorization: `Key ${falKey}` } }).then((r) => r.json()).catch(() => null);
    if (!st) return json({ status: 'running' });
    if (st.status !== 'COMPLETED') return json({ status: 'running' });
    const out = await fetch(scene.provider_ref.response_url, { headers: { Authorization: `Key ${falKey}` } }).then((r) => r.json()).catch(() => null);
    const vurl = out?.video?.url;
    if (!vurl) return fail('The video service could not make this one. Try a different photo or scene.');
    const vres = await fetch(vurl);
    if (!vres.ok) return fail('Could not save the video. Please try again.');
    const bytes = new Uint8Array(await vres.arrayBuffer());
    const path = `${scene.couple_id}/${id}.mp4`;
    const { error: ue } = await admin.storage.from('scenes').upload(path, bytes, { contentType: 'video/mp4', upsert: true });
    if (ue) return fail('Could not save the video. Please try again.');
    await admin.from('scenes').update({ status: 'done', video_path: path, error: null }).eq('id', id);
    return json({ status: 'done' });
  }
  return json({ error: 'Unknown action' }, 400);
});
