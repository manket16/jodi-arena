// Dream Scenes: pick a couple photo, pick a scene template, add details, get a short AI video.
import { html, useState, useEffect, useRef } from 'https://esm.sh/htm@3.1.1/preact/standalone';
import { sb, rpc, toast, fail, buzz } from './lib.js';
import { ScreenBar, compress } from './hub.js';

const BUCKET = 'scenes';
const KEEP = 'Keep the two people from the photo, their faces and clothes. Smooth, gentle camera movement, warm natural light, realistic, romantic and wholesome.';
export const TEMPLATES = [
  { k: 'date', emo: '🕯️', name: 'Date night', hint: 'Candlelight dinner on a rooftop', ph: 'Rooftop in Patna, fairy lights, she is wearing a red saree', base: 'A romantic candlelight dinner date for the couple, soft glowing candles, fairy lights, slow romantic mood.' },
  { k: 'beach', emo: '🌅', name: 'Beach sunset', hint: 'Walking on the sand at sunset', ph: 'Goa beach, holding hands, waves on their feet', base: 'The couple walking hand in hand along a beach at golden hour sunset, gentle waves.' },
  { k: 'rain', emo: '🌧️', name: 'Rain & chai', hint: 'First rain, chai, balcony', ph: 'Balcony, two cups of chai, first monsoon rain', base: 'The couple on a cozy balcony in the monsoon rain sharing hot chai, raindrops, soft mood.' },
  { k: 'shaadi', emo: '💍', name: 'Shaadi entry', hint: 'Filmy wedding entry', ph: 'Grand mandap, flower shower, dhol and baraat', base: 'A grand filmy Indian wedding entry of the couple, flower petals falling, festive lights, joyful celebration.' },
  { k: 'hills', emo: '🏔️', name: 'Mountain trip', hint: 'Hill station together', ph: 'Manali, snow, wrapped in one blanket', base: 'The couple on a scenic mountain trip, misty hills, wrapped warmly together, cinematic travel mood.' },
  { k: 'dance', emo: '💃', name: 'Dance together', hint: 'Slow dance under the stars', ph: 'Slow dance on the terrace, night sky, old Hindi song vibe', base: 'The couple slow dancing together under a starry night sky, dreamy romantic mood.' },
  { k: 'ghat', emo: '🪔', name: 'Ganga aarti', hint: 'Evening at the ghat with diyas', ph: 'Ganga ghat, evening aarti, floating diyas', base: 'The couple sitting by a river ghat at evening, floating diyas on the water, peaceful devotional glow.' },
  { k: 'own', emo: '✨', name: 'Write my own', hint: 'Imagine any scene', ph: 'Describe the scene in your own words', base: 'A beautiful cinematic scene of the couple.' },
];

async function signedVideo(path) {
  const { data } = await sb.storage.from(BUCKET).createSignedUrl(path, 3600);
  return data ? data.signedUrl : null;
}

function VideoCard({ it, onDelete }) {
  const [url, setUrl] = useState(null);
  useEffect(() => { if (it.status === 'done' && it.video_path) signedVideo(it.video_path).then(setUrl); }, [it.id, it.status]);
  const t = TEMPLATES.find((x) => x.name === it.template);
  return html`
    <div class="scene-card">
      <div class="row between"><b>${t ? t.emo : '🎬'} ${it.template}</b>
        <button class="back" onClick=${() => onDelete(it)} aria-label="Delete video">🗑</button></div>
      ${it.status === 'done' && (url
        ? html`<video class="scene-vid" src=${url} controls playsinline loop preload="metadata"></video><a class="chip" style="text-decoration:none" href=${url} download=${'scene.mp4'} target="_blank" rel="noopener">⬇️ Save video</a>`
        : html`<p class="muted pulse small">Loading video…</p>`)}
      ${(it.status === 'queued' || it.status === 'running') && html`<div class="scene-wait"><span class="gift-big shake">🎬</span><p class="pulse"><b>Making your video…</b></p><p class="small muted">This takes 1 to 3 minutes. You can leave this screen and come back.</p></div>`}
      ${it.status === 'failed' && html`<p class="gift-redo">${it.error || 'This one did not work. It does not count against your limit.'}</p>`}
      <p class="small muted">${it.prompt.slice(0, 140)}${it.prompt.length > 140 ? '…' : ''}</p>
    </div>`;
}

export function ScenesScreen({ home, back }) {
  const coupleId = home.couple.id;
  const [data, setData] = useState(null);
  const [tpl, setTpl] = useState(TEMPLATES[0]);
  const [detail, setDetail] = useState('');
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const preview = useRef(null);
  const load = () => rpc('scene_list').then(setData).catch(fail);
  useEffect(() => { load(); }, []);
  const items = (data && data.items) || [];
  const active = items.filter((i) => i.status === 'queued' || i.status === 'running');

  // while a video is being made, ask the server every few seconds
  useEffect(() => {
    if (!active.length) return;
    const t = setInterval(async () => {
      for (const it of active) { try { await sb.functions.invoke('make-scene', { body: { action: 'check', id: it.id } }); } catch (_) { /* try again next tick */ } }
      load();
    }, 6000);
    return () => clearInterval(t);
  }, [active.map((i) => i.id + i.status).join()]);

  const left = data ? Math.max(0, data.limit - data.used) : 0;
  const pickFile = (e) => {
    const f = e.target.files && e.target.files[0]; e.target.value = '';
    if (!f) return;
    if (preview.current) URL.revokeObjectURL(preview.current);
    preview.current = URL.createObjectURL(f); setFile(f);
  };
  const make = async () => {
    if (!file || busy) return;
    setBusy(true);
    try {
      const blob = await compress(file, 1280, 0.85);
      const path = `${coupleId}/src-${crypto.randomUUID()}.jpg`;
      const up = await sb.storage.from(BUCKET).upload(path, blob, { contentType: 'image/jpeg' });
      if (up.error) throw up.error;
      const text = `${tpl.base} ${detail.trim()} ${KEEP}`.slice(0, 900);
      let id;
      try { id = await rpc('scene_create', { p_template: tpl.name, p_prompt: text, p_photo_path: path }); }
      catch (e) { sb.storage.from(BUCKET).remove([path]); throw e; }
      buzz(30); toast('Your video is being made 🎬');
      setFile(null); setDetail('');
      sb.functions.invoke('make-scene', { body: { action: 'start', id } }).then(load).catch(load);
      await load();
    } catch (e) { fail(e); }
    setBusy(false);
  };
  const del = async (it) => {
    if (!confirm('Delete this video?')) return;
    try { const paths = await rpc('scene_delete', { p_id: it.id }); await sb.storage.from(BUCKET).remove((paths || []).filter(Boolean)); load(); } catch (e) { fail(e); }
  };

  return html`
    <div class="stack-lg screen">
      <${ScreenBar} back=${back} title="Dream Scenes" emo="🎬" />
      <p class="muted" style="margin-top:-12px">Pick a photo of you two, imagine a scene, and get a short video of it.</p>

      <section class="panel stack">
        <h3>1. Pick your photo</h3>
        <label class="scene-pick" style=${file ? `background-image:url("${preview.current}")` : ''}>
          ${!file && html`<span>＋ Choose a photo of you two</span>`}
          <input type="file" accept="image/*" hidden onChange=${pickFile} />
        </label>
        <p class="small muted">Best with a clear photo where both faces are visible.</p>

        <h3>2. Pick a scene</h3>
        <div class="scene-tpls">${TEMPLATES.map((t) => html`
          <button class=${'scene-tpl' + (tpl.k === t.k ? ' on' : '')} onClick=${() => setTpl(t)}><span>${t.emo}</span><b>${t.name}</b><i>${t.hint}</i></button>`)}</div>

        <h3>3. Add details</h3>
        <textarea class="input" rows="3" maxlength="300" placeholder=${tpl.ph} value=${detail} onInput=${(e) => setDetail(e.target.value)}></textarea>

        <button class="btn game big-cta" disabled=${!file || busy || left < 1 || active.length > 0 || (tpl.k === 'own' && detail.trim().length < 5)} onClick=${make}>${busy ? 'Starting…' : active.length ? 'A video is being made…' : '🎬 Make my video'}</button>
        <p class="small muted center">${data ? `${left} of ${data.limit} videos left this month for you two.` : ''}</p>
      </section>

      ${items.length > 0 && html`<h3>Your videos</h3><div class="stack">${items.map((it) => html`<${VideoCard} key=${it.id} it=${it} onDelete=${del} />`)}</div>`}
    </div>`;
}
