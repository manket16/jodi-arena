import { html, useState, useEffect, useRef } from 'https://esm.sh/htm@3.1.1/preact/standalone';
import { rpc, toast, fail, share } from './lib.js';
import { Sheet, ScreenBar, signed, fetchPhoto, compress } from './hub.js';
import { callAI, callSticker } from './ai.js';
import { WebsiteBuilder, CouponsTool, DatesTool, BucketTool, CaptionsTool, CapsuleTool, NicknamesTool } from './create2.js';

const TOOLS = [
  ['Websites', [['website', '🌐', 'Love Website', '12 templates, a private link just for them', 'wide']]],
  ['Cards', [['card', '🖼️', 'Greeting Card', '16 themes for every occasion'], ['poster', '🎬', 'Filmy Poster', 'Raj-Simran, rom-com, masala and more'], ['coupons', '🎟️', 'Love Coupons', 'Cute vouchers they can redeem'], ['sticker', '💬', 'WhatsApp Sticker', '9 stickers of the two of you in one picture']]],
  ['Music & Video', [['song', '🎵', 'Our Song', 'Your story as a song, in your style'], ['playlist', '🎧', 'Our Playlist', '8 real songs with a reason each'], ['video', '🎞️', 'Memories Video', 'Pick a style, add photos, get a reel']]],
  ['Words', [['letter', '💌', 'Love Letter', 'A letter in your voice'], ['shayari', '🌹', 'Shayari', 'Three short couplets for them'], ['poem', '📜', 'Love Poem', 'Hindi, English or Hinglish'], ['sorry', '🥺', 'Sorry Note', 'A sweet manao message'], ['capsule', '⏳', 'Time Capsule', 'A letter they open in a year']]],
  ['Plans & Fun', [['dates', '🍿', 'Date Ideas', 'Plans for your city and budget'], ['bucket', '🗺️', 'Bucket List', '20 things to do together'], ['captions', '📸', 'Insta Captions', 'For your next couple post'], ['nicknames', '🐣', 'Cute Nicknames', 'New pet names for them']]],
];

export const download = (blob, name) => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
};
export const shareFile = async (blob, name, text) => {
  const f = new File([blob], name, { type: blob.type });
  if (navigator.canShare && navigator.canShare({ files: [f] })) { try { await navigator.share({ files: [f], text }); return; } catch (e) { if (e.name === 'AbortError') return; } }
  download(blob, name);
};
export const copy = async (t) => { try { await navigator.clipboard.writeText(t); toast('Copied'); } catch (_) { toast('Could not copy. Select the text instead.', true); } };
export const toBlob = (c, type, q) => new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Your browser could not make that file'))), type, q));

export function drawCover(ctx, img, x, y, w, h, zoom = 1, ox = 0, oy = 0) {
  const s = Math.max(w / img.width, h / img.height) * zoom;
  const dw = img.width * s, dh = img.height * s;
  ctx.drawImage(img, x + (w - dw) / 2 + ox, y + (h - dh) / 2 + oy, dw, dh);
}
export function wrap(ctx, text, x, y, maxW, lh, maxLines = 6) {
  const words = String(text).split(/\s+/); let line = '', n = 0;
  for (const w of words) {
    const t = line ? line + ' ' + w : w;
    if (ctx.measureText(t).width > maxW && line) { ctx.fillText(line, x, y); y += lh; line = w; if (++n >= maxLines) return y; } else line = t;
  }
  if (line) ctx.fillText(line, x, y);
  return y + lh;
}
export const bitmap = (b) => createImageBitmap(b);

// ---------- photo picker (from Memories or device) ----------
export function PhotoPick({ max = 1, value, onChange }) {
  const [mems, setMems] = useState(null);
  const [urls, setUrls] = useState({});
  const [open, setOpen] = useState(false);
  const loadMems = async () => {
    setOpen(true);
    if (mems) return;
    try {
      const l = (await rpc('list_memories')).filter((m) => m.photos.length);
      const ps = l.flatMap((m) => m.photos).slice(0, 60);
      setMems(ps);
      if (ps.length) setUrls(await signed(ps));
    } catch (e) { fail(e); setMems([]); }
  };
  const addFiles = (e) => {
    const f = [...e.target.files].filter((x) => x.type.startsWith('image/'));
    e.target.value = '';
    onChange([...value, ...f.map((b) => ({ blob: b, key: crypto.randomUUID() }))].slice(0, max));
  };
  const addMem = async (p) => {
    if (value.length >= max) return;
    try { const b = await fetchPhoto(p); onChange([...value, { blob: b, key: p + Date.now() }].slice(0, max)); } catch (e) { fail(e); }
  };
  const [prev, setPrev] = useState({});
  useEffect(() => {
    const next = {};
    for (const v of value) next[v.key] = prev[v.key] || URL.createObjectURL(v.blob);
    for (const k in prev) if (!next[k]) URL.revokeObjectURL(prev[k]);
    setPrev(next);
  }, [value]);
  return html`
    <div class="stack">
      <div class="pick-row">
        ${value.map((v) => html`<div class="pick-thumb" style=${prev[v.key] ? `background-image:url("${prev[v.key]}")` : ''}><button type="button" aria-label="Remove" onClick=${() => onChange(value.filter((x) => x !== v))}>✕</button></div>`)}
        ${value.length < max && html`<label class="pick-add">＋<span class="small">Upload</span><input type="file" accept="image/*" multiple=${max > 1} hidden onChange=${addFiles} /></label>`}
        ${value.length < max && html`<button type="button" class="pick-add" onClick=${loadMems}>📸<span class="small">Memories</span></button>`}
      </div>
      ${max > 1 && html`<span class="small muted">${value.length} of ${max} photos</span>`}
      ${open && html`
        <${Sheet} title="Pick from Memories" onClose=${() => setOpen(false)}>
          ${!mems ? html`<p class="muted pulse center">Loading…</p>` : mems.length === 0 ? html`<p class="muted center">No memory photos yet. Add some in Memories first, or upload from your phone.</p>` : html`
            <div class="pick-grid">${mems.map((p) => html`<button type="button" class="pick-cell" style=${urls[p] ? `background-image:url("${urls[p]}")` : ''} onClick=${() => addMem(p)} aria-label="Pick photo"></button>`)}</div>
            <button class="btn" onClick=${() => setOpen(false)}>Done (${value.length}/${max})</button>`}
        </${Sheet}>`}
    </div>`;
}

// ---------- screen ----------
export function CreateScreen({ home, back }) {
  const [tool, setTool] = useState(null);
  const [left, setLeft] = useState(null);
  const guest = !!home.couple.me_guest;
  const refresh = () => rpc('hub_counts').then((n) => setLeft(n.ai_left)).catch(() => {});
  useEffect(() => { refresh(); }, []);
  const names = { me: home.profile.name, partner: home.couple.partner_name };
  const props = { names, home, onUsed: refresh, close: () => setTool(null), guest };
  const T = { song: SongTool, playlist: PlaylistTool, video: VideoTool, card: CardTool, poster: PosterTool, sticker: StickerTool, letter: WordsTool, shayari: WordsTool, poem: WordsTool, sorry: WordsTool,
    coupons: CouponsTool, dates: DatesTool, bucket: BucketTool, captions: CaptionsTool, capsule: CapsuleTool, nicknames: NicknamesTool }[tool];
  const info = TOOLS.flatMap(([, l]) => l).find((x) => x[0] === tool);
  if (tool === 'website') return html`<${WebsiteBuilder} home=${home} names=${names} onUsed=${refresh} back=${() => setTool(null)} />`;
  return html`
    <div class="stack-lg screen">
      <${ScreenBar} back=${back} title="Create" emo="✨" />
      <p class="muted" style="margin-top:-12px">Make something special for ${names.partner}</p>
      <div class="ai-meter">
        ${guest ? html`<span>🔓 Save your account (Me tab) to unlock letters, songs and posters. Photo tools work for everyone.</span>` : html`<span>✨ ${left === null ? '…' : left} creations left today</span>`}
      </div>
      ${TOOLS.map(([sec, items]) => html`
        <section class="stack">
          <h3>${sec}</h3>
          <div class="tool-grid">${items.map(([k, e, n, l, wide]) => html`
            <button class=${'tool' + (wide ? ' tool-wide' : '')} onClick=${() => setTool(k)}><span class="tool-emo">${e}</span><b>${n}</b><span class="small muted">${l}</span>${wide && html`<span class="tool-new">New</span>`}</button>`)}</div>
        </section>`)}
      ${tool && html`<${Sheet} title=${info[2]} onClose=${() => setTool(null)}><${T} kind=${tool} ...${props} /></${Sheet}>`}
    </div>`;
}

// ---------- shared generator hook ----------
export function useAI(kind, names, onUsed) {
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState(null);
  const run = async (details, n) => {
    setBusy(true);
    try {
      const r = await callAI(kind, details, { me: names.me, partner: names.partner }, n);
      setRes(r.data);
      onUsed && onUsed();
      return r.data;
    } catch (e) { fail(e); } finally { setBusy(false); }
    return null;
  };
  return { busy, res, run };
}
export const Details = ({ v, set, ph, label }) => html`<label class="field"><span>${label || 'Tell us about you two (optional)'}</span><textarea class="input" rows="3" maxlength="400" placeholder=${ph || 'We met in college, love momos, fight about the AC…'} value=${v} onInput=${(e) => set(e.target.value)}></textarea></label>`;

// ---------- guided brief: templates, chips and a few short answers ----------
// A field is { k, label, opts } for chips (multi for many), { k, label, cards } for template cards
// ([name, emoji, line shown, hint sent along]), or { k, label, ph, area } for a short answer.
const ON = 'border:2px solid var(--rani);background:#FFF0F5';
export function Brief({ fields, v, set }) {
  const up = (k, x) => set({ ...v, [k]: x });
  return html`<div class="stack">${fields.map((f) => {
    if (f.cards) return html`<div class="stack"><span class="small muted">${f.label}</span><div class="tool-grid">${f.cards.map(([name, emo, line]) => html`
      <button type="button" class="tool" style=${v[f.k] === name ? ON : ''} onClick=${() => up(f.k, name)}><span class="tool-emo" style="font-size:24px">${emo}</span><b>${name}</b>${line && html`<span class="small muted">${line}</span>`}</button>`)}</div></div>`;
    if (f.opts) return html`<div class="stack"><span class="small muted">${f.label}</span><div class="chips-wrap">${f.opts.map((o) => {
      const on = f.multi ? (v[f.k] || []).includes(o) : v[f.k] === o;
      const next = f.multi ? (on ? (v[f.k] || []).filter((x) => x !== o) : [...(v[f.k] || []), o]) : o;
      return html`<button type="button" class=${'chip-btn' + (on ? ' on' : '')} onClick=${() => up(f.k, next)}>${o}</button>`;
    })}</div></div>`;
    return html`<label class="field"><span>${f.label}</span>${f.area
      ? html`<textarea class="input" rows=${f.area} maxlength=${f.max || 400} placeholder=${f.ph || ''} value=${v[f.k] || ''} onInput=${(e) => up(f.k, e.target.value)}></textarea>`
      : html`<input class="input" maxlength=${f.max || 120} placeholder=${f.ph || ''} value=${v[f.k] || ''} onInput=${(e) => up(f.k, e.target.value)} />`}</label>`;
  })}</div>`;
}
export const briefStart = (fields) => Object.fromEntries(fields.filter((f) => f.cards || f.opts).map((f) => [f.k, f.def !== undefined ? f.def : f.multi ? [] : f.cards ? f.cards[0][0] : f.opts[0]]));
export const briefText = (fields, v) => fields.map((f) => {
  const x = v[f.k];
  const s = Array.isArray(x) ? x.join(', ') : String(x || '').trim();
  if (!s) return '';
  const card = f.cards && f.cards.find((c) => c[0] === x);
  return `${f.label}: ${s}${card && card[3] ? ` (${card[3]})` : ''}`;
}).filter(Boolean).join('\n');
export function useBrief(fields) {
  const [v, set] = useState(() => briefStart(fields));
  return { v, set, text: () => briefText(fields, v) };
}
const LANG = { k: 'lang', label: 'Language', opts: ['Hinglish', 'English', 'Hindi'] };

// ---------- Music ----------
const SONG = [
  { k: 'style', label: 'Pick a sound', cards: [
    ['90s Bollywood duet', '📻', 'Melody, la-la-la hooks', '90s Bollywood romantic duet in the spirit of Kumar Sanu and Alka Yagnik, melodious with a humming hook'],
    ['Soft romantic ballad', '🎸', 'Slow, emotional, guitar', 'modern Bollywood soft ballad, emotional, acoustic guitar and piano'],
    ['Punjabi banger', '🥁', 'Dhol and bhangra energy', 'upbeat Punjabi pop with dhol and bhangra energy, Punjabi words mixed in'],
    ['Sufi love', '🕌', 'Soulful, qawwali feel', 'Sufi qawwali-inspired, harmonium, tabla and claps, soulful love imagery'],
    ['Lo-fi chill', '🌙', 'Cozy late-night vibe', 'lo-fi Hindi chill track, mellow beats, cozy late-night mood'],
    ['Desi rap', '🎤', 'Rap verses, sung hook', 'desi hip-hop with rap verses and a melodic sung hook'],
    ['Shaadi song', '💍', 'Sangeet and celebration', 'wedding sangeet song, festive, dholak and claps'],
    ['Lori', '🌜', 'Soft and sweet', 'gentle lori-style lullaby, soft and tender'],
  ] },
  { k: 'voice', label: 'Who sings it', opts: ['Duet', 'Male voice', 'Female voice'] },
  { k: 'lang', label: 'Language', opts: ['Hinglish', 'Hindi', 'Punjabi', 'English'] },
  { k: 'occasion', label: 'Occasion', opts: ['Just because', 'Anniversary', 'Birthday', 'Proposal', 'Wedding', 'Long distance'] },
  { k: 'include', label: 'Put these in the song', multi: true, def: ['Both our names'], opts: ['Both our names', 'Their nickname', 'How we met', 'A trip we took', 'Our inside jokes', 'Their favourite food'] },
  { k: 'nick', label: 'Their nickname', ph: 'Bubu, jaan, motu…' },
  { k: 'story', label: 'Your story bits', area: 3, ph: 'Met at a cousin’s wedding in Patna, our first trip to Rishikesh, she steals my fries…' },
];
function SongTool({ names, onUsed }) {
  const b = useBrief(SONG);
  const { busy, res, run } = useAI('song', names, onUsed);
  return html`
    <div class="stack">
      <${Brief} fields=${SONG} v=${b.v} set=${b.set} />
      <button class="btn" disabled=${busy} onClick=${() => run(b.text())}>${busy ? 'Composing…' : res ? '↻ Make another version' : '🎵 Make our song'}</button>
      ${res && html`
        <div class="note-paper"><b>${res.title}</b>\n\n${res.lyrics}</div>
        <div class="row"><button class="btn ghost grow" onClick=${() => copy(`${res.title}\n\n${res.lyrics}`)}>Copy lyrics</button><button class="btn ghost grow" onClick=${() => share(`${res.title}\n\n${res.lyrics}`)}>Share</button></div>
        <div class="panel stack small">
          <b>Hear it sung 🎶</b>
          <p class="muted">Paste the lyrics and this sound description into a music app such as Suno or Udio.</p>
          <p class="note-paper" style="font-size:14px">${res.music_prompt}</p>
          <button class="btn ghost" onClick=${() => copy(res.music_prompt)}>Copy sound description</button>
        </div>`}
    </div>`;
}
const PLAYLIST = [
  { k: 'mood', label: 'Mood', opts: ['Romantic', 'Happy', 'Missing you', 'Road trip', 'Rainy day', 'Party', 'Sad and sweet'] },
  { k: 'era', label: 'Era', opts: ['Mix of all', '90s', '2000s', '2010s', 'Latest'] },
  { k: 'lang', label: 'Songs in', opts: ['Hindi', 'Punjabi', 'Hindi + Punjabi', 'English'] },
  { k: 'extra', label: 'Anything else (optional)', ph: 'She loves Arijit, I love old Kishore songs' },
];
function PlaylistTool({ names, onUsed }) {
  const b = useBrief(PLAYLIST);
  const { busy, res, run } = useAI('playlist', names, onUsed);
  const yt = (s) => `https://www.youtube.com/results?search_query=${encodeURIComponent(`${s.title} ${s.film}`)}`;
  return html`
    <div class="stack">
      <${Brief} fields=${PLAYLIST} v=${b.v} set=${b.set} />
      <button class="btn" disabled=${busy} onClick=${() => run(b.text(), 8)}>${busy ? 'Picking…' : res ? '↻ New playlist' : '🎧 Make our playlist'}</button>
      ${res && res.songs && html`<div class="stack">${res.songs.map((s, i) => html`
        <a class="note-card" style="text-decoration:none;color:inherit" href=${yt(s)} target="_blank" rel="noopener">
          <span class="note-emo">${i + 1}</span><span class="grow"><b>${s.title}</b><span class="small muted">${s.film}</span><span class="small">${s.why}</span></span><span class="chip">▶ YouTube</span>
        </a>`)}</div>`}
    </div>`;
}

// ---------- Cards ----------
// [background, accent, text, decoration]
const FRAMES = {
  Rose: ['#FFE3EC', '#E11D5A', '#5B1230', '🌸'], Sunflower: ['#FFF7CC', '#E0A100', '#4A3500', '🌻'], Lavender: ['#EDE9FE', '#7C3AED', '#2E1065', '💜'],
  Night: ['#1E1B3A', '#F9C74F', '#FFFFFF', '✨'], Mint: ['#DCFCE7', '#0E8F6E', '#064E3B', '🍃'], Ocean: ['#DBEAFE', '#1D4ED8', '#172554', '🌊'],
  Valentine: ['#B91C1C', '#FFFFFF', '#FFE4E6', '❤️'], Diwali: ['#4A0D1E', '#F5B700', '#FFF3CD', '🪔'], Holi: ['#FFF1F8', '#DB2777', '#4C0519', '🎨'],
  Birthday: ['#FEF3C7', '#DB2777', '#831843', '🎈'], Vintage: ['#EFE3CF', '#7C4A1E', '#3E2410', '🕰️'], Chai: ['#F3E2CC', '#8B4513', '#3B1F0B', '☕'],
  Monsoon: ['#E0F2F1', '#00796B', '#004D40', '🌧️'], Wedding: ['#7F1D1D', '#FCD34D', '#FEF3C7', '💍'], Peach: ['#FFE4D6', '#F97316', '#7C2D12', '🍑'], Midnight: ['#0F172A', '#F472B6', '#E2E8F0', '🌙'],
};
const OCCASION_FRAME = {
  'Just because': 'Rose', 'Anniversary': 'Wedding', 'Birthday': 'Birthday', 'Valentine’s Day': 'Valentine', 'Diwali': 'Diwali', 'Holi': 'Holi',
  'Karwa Chauth': 'Night', 'Miss you': 'Ocean', 'Sorry': 'Peach', 'Thank you': 'Sunflower', 'Good morning': 'Chai', 'Good night': 'Midnight',
};
const CARD = [
  { k: 'occasion', label: 'Occasion', opts: Object.keys(OCCASION_FRAME) },
  { k: 'tone', label: 'Feel', opts: ['Sweet', 'Funny', 'Filmy', 'Emotional', 'Poetic'] },
  LANG,
  { k: 'memory', label: 'A memory or detail to use (optional)', ph: 'Our first Diwali together at her place' },
];
const LAYOUTS = ['Framed', 'Polaroid', 'Full photo'];
function CardTool({ names, onUsed }) {
  const [photos, setPhotos] = useState([]);
  const b = useBrief(CARD);
  const [frame, setFrame] = useState('Rose');
  const [layout, setLayout] = useState('Framed');
  const [head, setHead] = useState('');
  const [cap, setCap] = useState('');
  const { busy, run } = useAI('card', names, onUsed);
  const cv = useRef();
  const setBrief = (v) => { if (v.occasion !== b.v.occasion) setFrame(OCCASION_FRAME[v.occasion] || frame); b.set(v); };
  useEffect(() => {
    let dead = false;
    (async () => {
      const c = cv.current; if (!c) return;
      const [bg, ac, tx, deco] = FRAMES[frame], ctx = c.getContext('2d');
      c.width = 1080; c.height = 1350;
      ctx.fillStyle = bg; ctx.fillRect(0, 0, 1080, 1350);
      const img = photos[0] ? await bitmap(photos[0].blob) : null; if (dead) return;
      const signature = `${names.me} & ${names.partner}  ·  Jodi Arena`;
      if (layout === 'Full photo') {
        if (img) drawCover(ctx, img, 0, 0, 1080, 1350); else { ctx.font = '320px serif'; ctx.textAlign = 'center'; ctx.fillText(deco, 540, 640); }
        const g = ctx.createLinearGradient(0, 700, 0, 1350); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.78)'); ctx.fillStyle = g; ctx.fillRect(0, 700, 1080, 650);
        ctx.textAlign = 'center'; ctx.fillStyle = '#fff'; ctx.font = '800 100px Baloo 2, Mukta, sans-serif';
        ctx.fillText(head.slice(0, 26), 540, 1080);
        ctx.font = '500 44px Mukta, sans-serif'; wrap(ctx, cap, 540, 1150, 900, 58, 2);
        ctx.font = '600 30px Mukta, sans-serif'; ctx.globalAlpha = 0.8; ctx.fillText(signature, 540, 1300); ctx.globalAlpha = 1;
      } else if (layout === 'Polaroid') {
        ctx.font = '70px serif'; ctx.textAlign = 'center';
        [[110, 130], [970, 150], [120, 1250], [960, 1230]].forEach(([x, y]) => ctx.fillText(deco, x, y));
        ctx.save(); ctx.translate(540, 560); ctx.rotate(-0.04);
        ctx.shadowColor = 'rgba(0,0,0,.25)'; ctx.shadowBlur = 40; ctx.fillStyle = '#fff'; ctx.fillRect(-380, -400, 760, 860); ctx.shadowBlur = 0;
        if (img) { ctx.save(); ctx.beginPath(); ctx.rect(-340, -360, 680, 640); ctx.clip(); drawCover(ctx, img, -340, -360, 680, 640); ctx.restore(); }
        else { ctx.fillStyle = ac + '33'; ctx.fillRect(-340, -360, 680, 640); ctx.font = '200px serif'; ctx.fillText(deco, 0, 40); }
        ctx.fillStyle = '#3B2A1A'; ctx.font = '700 64px Caveat, Baloo 2, cursive'; ctx.fillText(head.slice(0, 22), 0, 380);
        ctx.restore();
        ctx.textAlign = 'center'; ctx.fillStyle = tx; ctx.font = '500 42px Mukta, sans-serif'; wrap(ctx, cap, 540, 1100, 860, 56, 2);
        ctx.fillStyle = ac; ctx.font = '600 30px Mukta, sans-serif'; ctx.fillText(signature, 540, 1290);
      } else {
        ctx.strokeStyle = ac; ctx.lineWidth = 10; ctx.strokeRect(36, 36, 1008, 1278);
        ctx.font = '56px serif'; ctx.textAlign = 'center'; ctx.fillText(deco, 80, 100); ctx.fillText(deco, 1000, 1290);
        if (img) { ctx.save(); ctx.beginPath(); ctx.roundRect(90, 90, 900, 840, 36); ctx.clip(); drawCover(ctx, img, 90, 90, 900, 840); ctx.restore(); }
        else { ctx.fillStyle = ac + '33'; ctx.beginPath(); ctx.roundRect(90, 90, 900, 840, 36); ctx.fill(); ctx.font = '220px serif'; ctx.fillStyle = ac; ctx.fillText(deco, 540, 580); }
        ctx.fillStyle = ac; ctx.font = '700 92px Baloo 2, Mukta, sans-serif';
        ctx.fillText(head.slice(0, 28), 540, 1050);
        ctx.fillStyle = tx; ctx.font = '500 42px Mukta, sans-serif';
        wrap(ctx, cap, 540, 1120, 820, 56, 3);
        ctx.fillStyle = ac; ctx.font = '600 32px Mukta, sans-serif';
        ctx.fillText(signature, 540, 1280);
      }
      if (img && img.close) img.close();
    })().catch(fail);
    return () => { dead = true; };
  }, [photos, frame, head, cap, layout]);
  const gen = async () => { const r = await run(b.text()); if (r) { setHead(r.headline || ''); setCap(r.caption || ''); } };
  const save = async () => { if (!head.trim()) return fail(new Error('Tap “Write my card” first')); try { await shareFile(await toBlob(cv.current, 'image/png'), 'our-card.png', 'Made with Jodi Arena'); } catch (e) { fail(e); } };
  return html`
    <div class="stack">
      <${Brief} fields=${CARD} v=${b.v} set=${setBrief} />
      <${PhotoPick} max=${1} value=${photos} onChange=${setPhotos} />
      <button class="btn" disabled=${busy} onClick=${gen}>${busy ? 'Writing…' : head ? '↻ Write it differently' : '💌 Write my card'}</button>
      <canvas ref=${cv} class="preview-cv" style="aspect-ratio:4/5"></canvas>
      <div class="seg seg3">${LAYOUTS.map((l) => html`<button type="button" class=${layout === l ? 'on' : ''} onClick=${() => setLayout(l)}>${l}</button>`)}</div>
      <div class="swatches">${Object.entries(FRAMES).map(([f, [bg, ac, , deco]]) => html`<button type="button" class=${'swatch' + (frame === f ? ' on' : '')} style=${`background:${bg};color:${ac}`} onClick=${() => setFrame(f)} aria-label=${f} title=${f}>${deco}<small>${f}</small></button>`)}</div>
      ${head && html`<input class="input" maxlength="28" value=${head} onInput=${(e) => setHead(e.target.value)} aria-label="Headline" />
      <textarea class="input" rows="2" maxlength="140" value=${cap} onInput=${(e) => setCap(e.target.value)} aria-label="Caption"></textarea>`}
      <button class="btn ghost" onClick=${save}>Save or share card</button>
    </div>`;
}

// ---------- Filmy poster ----------
// [name, emoji, line, hint, background top, background bottom, accent]
const POSTERS = [
  ['Raj & Simran', '🌻', 'Mustard fields, a train, big family drama', '90s Yash Raj style romance like DDLJ: mustard fields, a train journey, a strict father, Europe trip; invent an original title', '#5A2D0C', '#1A0B02', '#FFD23F'],
  ['Road-trip romance', '🚂', 'Chatty, fun, runaway love', 'chatty road-trip romance in the spirit of Jab We Met: trains, highways, a bubbly heroine; invent an original title', '#0B3954', '#04151F', '#FF9F1C'],
  ['Family drama', '🪔', 'Festivals, tears, togetherness', 'grand Karan Johar style family drama like K3G: festivals, big house, emotions; invent an original title', '#4A0D1E', '#14030A', '#F5B700'],
  ['Masala action', '💥', '90s hero, villain, dhishoom', '90s masala action-romance: hero, villain, fights, mother’s blessings, slow-motion entry; invent an original title', '#3A0303', '#0D0101', '#FF4D2E'],
  ['Rom-com', '😂', 'Fights, laughs, love', 'modern Bollywood rom-com: fights over silly things, friends, a big wedding; invent an original title', '#7A1F5C', '#22061A', '#FFC6E0'],
  ['Tragic epic', '🥀', 'Devdas-level drama', 'grand tragic love epic in the spirit of Devdas: chandeliers, rain, poetry, longing (but they end up together); invent an original title', '#2B0A3D', '#0A0210', '#E0B0FF'],
  ['Horror comedy', '👻', 'Spooky but funny', 'horror-comedy like Stree: small town, a funny ghost, a couple solving it together; invent an original title', '#0F2E1F', '#030B07', '#9BFF8A'],
  ['Hollywood epic', '🎞️', 'English blockbuster vibe', 'Hollywood blockbuster romance poster in English, epic scale; invent an original title', '#0B132B', '#020409', '#5BC0EB'],
];
const POSTER = [
  { k: 'tpl', label: 'Pick your film', cards: POSTERS.map(([n, e, l, h]) => [n, e, l, h]) },
  { k: 'occasion', label: 'Releasing for', opts: ['Just because', 'Anniversary', 'Birthday', 'Valentine’s Day', 'Wedding'] },
  { k: 'met', label: 'How you met', ph: 'In the college library, fighting over the last copy of a book' },
  { k: 'thing', label: 'Your thing as a couple', ph: 'Midnight Maggi, endless bickering about the AC' },
  { k: 'place', label: 'Your place (optional)', ph: 'Marine Drive, Patna ghats, her hostel gate' },
];
function PosterTool({ names, onUsed }) {
  const [photos, setPhotos] = useState([]);
  const b = useBrief(POSTER);
  const [p, setP] = useState(null);
  const { busy, run } = useAI('poster', names, onUsed);
  const cv = useRef();
  const tpl = POSTERS.find((t) => t[0] === b.v.tpl) || POSTERS[0];
  useEffect(() => {
    let dead = false;
    (async () => {
      const c = cv.current; if (!c) return;
      const ctx = c.getContext('2d'); c.width = 1080; c.height = 1620;
      const col = (p && p.colors) || {}, accent = hexOr(col.accent, tpl[6]);
      const g0 = ctx.createLinearGradient(0, 0, 0, 1620); g0.addColorStop(0, hexOr(col.from, tpl[4])); g0.addColorStop(1, hexOr(col.to, tpl[5])); ctx.fillStyle = g0; ctx.fillRect(0, 0, 1080, 1620);
      if (photos[0]) { const img = await bitmap(photos[0].blob); if (dead) return; drawCover(ctx, img, 0, 0, 1080, 1620); if (img.close) img.close(); }
      if (!p) {
        ctx.textAlign = 'center'; ctx.font = '200px serif'; if (!photos[0]) ctx.fillText(tpl[1], 540, 760);
        ctx.fillStyle = '#ffffffcc'; ctx.font = '700 52px Baloo 2, Mukta, sans-serif'; wrap(ctx, `${tpl[0]} · your poster appears here`, 540, 1380, 860, 66, 2); return;
      }
      const g = ctx.createLinearGradient(0, 700, 0, 1620); g.addColorStop(0, 'rgba(10,3,20,0)'); g.addColorStop(0.65, 'rgba(10,3,20,.92)'); ctx.fillStyle = g; ctx.fillRect(0, 700, 1080, 920);
      const gt = ctx.createLinearGradient(0, 0, 0, 260); gt.addColorStop(0, 'rgba(10,3,20,.7)'); gt.addColorStop(1, 'rgba(10,3,20,0)'); ctx.fillStyle = gt; ctx.fillRect(0, 0, 1080, 260);
      ctx.textAlign = 'center';
      ctx.fillStyle = accent; ctx.font = '600 36px Mukta, sans-serif'; ctx.fillText(String(p.starring || `${names.me} & ${names.partner}`).toUpperCase().slice(0, 48), 540, 100);
      ctx.fillStyle = '#FFFFFF'; ctx.font = '800 124px Baloo 2, Mukta, sans-serif';
      const y = wrap(ctx, p.title || '', 540, 1120, 960, 126, 2);
      ctx.fillStyle = accent; ctx.font = 'italic 500 46px Mukta, sans-serif'; wrap(ctx, p.tagline || '', 540, y + 10, 900, 60, 3);
      ctx.fillStyle = '#FFFFFFAA'; ctx.font = '600 32px Mukta, sans-serif'; ctx.fillText(String(p.genre || '').toUpperCase(), 540, 1468);
      ctx.font = '500 27px Mukta, sans-serif'; ctx.fillText(String(p.credit || '').slice(0, 70), 540, 1520);
      ctx.fillStyle = accent; ctx.font = '700 32px Mukta, sans-serif'; ctx.fillText(String(p.release || '').toUpperCase().slice(0, 40), 540, 1580);
    })().catch(fail);
    return () => { dead = true; };
  }, [photos, p, tpl]);
  const gen = async () => { const r = await run(b.text()); if (r) setP(r); };
  const save = async () => { if (!p) return fail(new Error('Tap “Make our poster” first')); try { await shareFile(await toBlob(cv.current, 'image/png'), 'our-filmy-poster.png', 'Our movie poster'); } catch (e) { fail(e); } };
  return html`
    <div class="stack">
      <${Brief} fields=${POSTER} v=${b.v} set=${b.set} />
      <${PhotoPick} max=${1} value=${photos} onChange=${setPhotos} />
      <button class="btn" disabled=${busy} onClick=${gen}>${busy ? 'Rolling camera…' : p ? '↻ Make another' : '🎬 Make our poster'}</button>
      <canvas ref=${cv} class="preview-cv" style="aspect-ratio:2/3"></canvas>
      ${p && html`<input class="input" maxlength="40" value=${p.title} onInput=${(e) => setP({ ...p, title: e.target.value })} aria-label="Movie title" />
      <input class="input" maxlength="90" value=${p.tagline} onInput=${(e) => setP({ ...p, tagline: e.target.value })} aria-label="Tagline" />
      <button class="btn ghost" onClick=${save}>Save or share poster</button>`}
    </div>`;
}

// ---------- Sticker sheet: 9 stickers of the two of you in one picture ----------
const STICKER = [
  { k: 'theme', label: 'Pick a sticker pack', cards: [
    ['Funny reactions', '😂', 'Memes and reactions', ''],
    ['Daily life', '☕', 'Chai, texting, good night', ''],
    ['Bollywood', '🎬', 'Filmy poses and drama', ''],
    ['Cute & romantic', '🥰', 'Hugs, hearts, miss you', ''],
    ['Fight & manao', '🥺', 'Gussa, sorry, patch-up', ''],
    ['Festivals & shaadi', '🪔', 'Diwali, Holi, sangeet', ''],
  ] },
  { k: 'art', label: 'Drawing style', opts: ['Cartoon', '3D animated', 'Anime', 'Comic pop'] },
  { k: 'lang', label: 'Words on stickers', opts: ['Hinglish', 'English', 'Hindi'] },
  { k: 'extra', label: 'Anything to include (optional)', ph: 'She always holds a chai cup, I wear a red cap, we love momos' },
];
const toB64 = (blob) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.onerror = () => rej(new Error('Could not read the photo')); r.readAsDataURL(blob); });
function StickerTool({ names, onUsed }) {
  const [mine, setMine] = useState([]);
  const [theirs, setTheirs] = useState([]);
  const [out, setOut] = useState(null);
  const [busy, setBusy] = useState(false);
  const b = useBrief(STICKER);
  useEffect(() => () => { if (out) URL.revokeObjectURL(out.url); }, [out]);
  const gen = async () => {
    const list = [...mine, ...theirs];
    if (!list.length) return fail(new Error('Add a photo of yourself first'));
    setBusy(true);
    try {
      const photos = [];
      for (const p of list) photos.push(await toB64(await compress(p.blob, 768, 0.8)));
      const r = await callSticker({ photos, theme: b.v.theme, art: b.v.art, lang: b.v.lang, extra: b.v.extra || '' });
      const bytes = Uint8Array.from(atob(r.image), (c) => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: r.mime || 'image/png' });
      setOut({ blob, url: URL.createObjectURL(blob) });
      onUsed && onUsed();
    } catch (e) { fail(e); }
    setBusy(false);
  };
  const saveSheet = async () => { try { await shareFile(out.blob, 'our-sticker-sheet.png', 'Our sticker sheet'); } catch (e) { fail(e); } };
  // tap one sticker on the sheet to save just that one as a 512 x 512 file
  const saveOne = async (ev) => {
    const el = ev.currentTarget, r = el.getBoundingClientRect();
    const col = Math.min(2, Math.max(0, Math.floor(((ev.clientX - r.left) / r.width) * 3))), row = Math.min(2, Math.max(0, Math.floor(((ev.clientY - r.top) / r.height) * 3)));
    try {
      const img = await bitmap(out.blob), cw = img.width / 3, ch = img.height / 3;
      const o = document.createElement('canvas'); o.width = 512; o.height = 512;
      const x = o.getContext('2d'); x.clearRect(0, 0, 512, 512);
      const s = Math.min(512 / cw, 512 / ch);
      x.drawImage(img, col * cw, row * ch, cw, ch, (512 - cw * s) / 2, (512 - ch * s) / 2, cw * s, ch * s);
      if (img.close) img.close();
      const bl = await toBlob(o, 'image/webp', 0.9);
      await shareFile(bl, `sticker-${row * 3 + col + 1}.${bl.type === 'image/webp' ? 'webp' : 'png'}`, 'Sticker');
    } catch (e) { fail(e); }
  };
  return html`
    <div class="stack">
      <div class="two">
        <div class="stack"><span class="small muted">Photo of ${names.me}</span><${PhotoPick} max=${1} value=${mine} onChange=${setMine} /></div>
        <div class="stack"><span class="small muted">Photo of ${names.partner}</span><${PhotoPick} max=${1} value=${theirs} onChange=${setTheirs} /></div>
      </div>
      <p class="small muted">A clear, front-facing photo of each of you works best. Using both gives you as a couple.</p>
      <${Brief} fields=${STICKER} v=${b.v} set=${b.set} />
      <button class="btn" disabled=${busy || (!mine.length && !theirs.length)} onClick=${gen}>${busy ? 'Drawing your stickers… about 20 seconds' : out ? '↻ Make a new sheet' : '✨ Make my 9 stickers'}</button>
      ${out && html`
        <img src=${out.url} onClick=${saveOne} alt="Sticker sheet with 9 stickers" class="preview-cv" style="width:100%;max-width:460px;margin:auto;background:#fff;cursor:pointer" />
        <p class="small muted center">Nine stickers in one picture. Tap any sticker to save it on its own.</p>
        <button class="btn" onClick=${saveSheet}>Save the whole sheet</button>`}
      <p class="small muted">WhatsApp does not import stickers straight from a browser. Save single stickers, then add them to a pack in a free sticker-maker app such as "Sticker Maker" and tap Add to WhatsApp.</p>
    </div>`;
}

// ---------- Words ----------
const WORDS = {
  letter: { btn: '💌 Write our letter', title: 'A letter for you', emoji: '💌', fields: [
    { k: 'style', label: 'Letter style', cards: [
      ['Classic love letter', '💌', 'Warm and heartfelt', 'a sincere, classic love letter'],
      ['Filmy, Raj-Simran style', '🎬', 'Big Bollywood feels', 'dramatic and filmy like a 90s Yash Raj hero writing to his heroine, with one original filmy line'],
      ['Purana khat', '📜', 'Old-school Hindi chitthi', 'an old handwritten Hindi khat in Roman script, opening with Priya, respectful and poetic'],
      ['Funny and cute', '😜', 'Makes them laugh', 'light, teasing, full of their inside jokes, still loving at the end'],
      ['Long distance', '✈️', 'Miles apart, close at heart', 'about missing each other across the distance and counting the days'],
      ['Proposal', '💍', 'Ask the big question', 'building up to asking them to marry, or to be together forever'],
    ] },
    { k: 'occasion', label: 'Occasion', opts: ['Just because', 'Anniversary', 'Birthday', 'Missing you', 'After a fight', 'Thank you', 'Good morning'] },
    LANG,
    { k: 'length', label: 'Length', opts: ['Short', 'Medium', 'Long'], def: 'Medium' },
    { k: 'nick', label: 'What you call them', ph: 'Bubu, jaan, motu…' },
    { k: 'memory', label: 'A memory to mention', ph: 'Our first chai at the station, the day it rained in Lonavala' },
    { k: 'love', label: 'What you love most about them', ph: 'Her laugh, how she looks after everyone' },
    { k: 'extra', label: 'Anything else you want to say (optional)', area: 2, ph: 'Sorry I have been busy lately, I will make it up to you' },
  ] },
  shayari: { btn: '🌹 Write shayari', title: 'A shayari for you', emoji: '🌹', fields: [
    { k: 'mood', label: 'Mood', opts: ['Romantic', 'Playful', 'Missing you', 'Dard bhari', 'Good night', 'Birthday'] },
    { k: 'lang', label: 'Language', opts: ['Roman Hindi', 'Urdu-style', 'Hinglish'] },
    { k: 'words', label: 'Words to weave in (optional)', ph: 'chai, baarish, chaand, her smile' },
  ] },
  poem: { btn: '📜 Write our poem', title: 'A poem for you', emoji: '📜', fields: [
    { k: 'form', label: 'Poem type', cards: [
      ['Rhyming poem', '🎶', 'Sing-song and sweet', 'rhyming couplets, easy to read aloud'],
      ['Free verse', '🍃', 'Modern, no rhyme', 'modern free verse with vivid images'],
      ['Ghazal-style', '🕯️', 'Urdu-flavoured couplets', 'ghazal-style couplets with a repeating end word'],
      ['Tiny poem', '✨', '4 to 6 lines', 'a very short poem of 4 to 6 lines'],
    ] },
    { k: 'mood', label: 'Mood', opts: ['Romantic', 'Nostalgic', 'Missing you', 'Grateful', 'Playful'] },
    LANG,
    { k: 'about', label: 'What should it be about?', area: 2, ph: 'Our first trip to the mountains, her cold hands in mine' },
  ] },
  sorry: { btn: '🥺 Write my sorry', title: 'Sorry, na?', emoji: '🥺', fields: [
    { k: 'size', label: 'How big was it?', opts: ['Small oops', 'Real fight', 'I really messed up'] },
    { k: 'tone', label: 'Tone', opts: ['Cute manao', 'Sincere', 'Funny'] },
    LANG,
    { k: 'what', label: 'What happened?', area: 2, ph: 'I forgot our date night and snapped at her when she asked' },
    { k: 'promise', label: 'What will you do to fix it? (optional)', ph: 'Golgappa date this weekend, phone off' },
  ] },
};
function WordsTool({ kind, names, onUsed }) {
  const cfg = WORDS[kind];
  const b = useBrief(cfg.fields);
  const { busy, res, run } = useAI(kind, names, onUsed);
  const [sent, setSent] = useState(false);
  const text = res ? (res.items ? res.items.join('\n\n') : res.body) : '';
  const sendNote = async () => {
    try { await rpc('send_note', { p_kind: 'note', p_title: (res.title || cfg.title).slice(0, 80), p_body: text.slice(0, 1200), p_emoji: cfg.emoji }); setSent(true); toast(`Sent to ${names.partner} 💌`); }
    catch (e) { fail(e); }
  };
  return html`
    <div class="stack">
      <${Brief} fields=${cfg.fields} v=${b.v} set=${b.set} />
      <button class="btn" disabled=${busy} onClick=${() => { setSent(false); run(b.text()); }}>${busy ? 'Writing…' : res ? '↻ Write another' : cfg.btn}</button>
      ${res && html`
        <div class="note-paper">${res.title ? html`<b>${res.title}</b>\n\n` : ''}${text}</div>
        <div class="row"><button class="btn ghost grow" onClick=${() => copy(text)}>Copy</button><button class="btn ghost grow" onClick=${() => share(text)}>Share</button></div>
        <button class="btn" disabled=${sent} onClick=${sendNote}>${sent ? 'Sent ✓' : `Send to ${names.partner} as a Love Note`}</button>`}
    </div>`;
}

// ---------- Video ----------
const hexOr = (v, d) => (/^#[0-9a-fA-F]{6}$/.test(v || '') ? v : d);
// [name, emoji, line, hint, intro colour 1, intro colour 2, default music]
const VIDEOS = [
  ['Filmy love story', '🎬', 'Raj-Simran style montage', 'a dramatic Bollywood love-story montage like a 90s Yash Raj film trailer, filmy captions', '#B91C1C', '#F59E0B', 'Soft'],
  ['Anniversary film', '💍', 'From day one to today', 'an anniversary film that walks from the first day to today, warm and grateful', '#7F1D1D', '#FCD34D', 'Dreamy'],
  ['Birthday surprise', '🎂', 'Make them smile', 'a birthday surprise reel for the partner, playful and celebratory, ends with a birthday wish', '#DB2777', '#F59E0B', 'Upbeat'],
  ['Travel diaries', '🧳', 'Trips and adventures', 'a travel-diary reel of trips together, places and little adventures', '#0369A1', '#14B8A6', 'Upbeat'],
  ['Funny reel', '😂', 'Inside jokes and chaos', 'a funny Instagram-style reel full of their inside jokes and chaos', '#7C3AED', '#EC4899', 'Upbeat'],
  ['Missing you', '🌙', 'For long-distance days', 'a long-distance missing-you video, tender and hopeful, counting the days', '#1E1B4B', '#6D28D9', 'Dreamy'],
];
const VIDEO = [
  { k: 'tpl', label: 'Pick a video style', cards: VIDEOS.map(([n, e, l, h]) => [n, e, l, h]) },
  { k: 'lang', label: 'Caption language', opts: ['Hinglish', 'English', 'Hindi'] },
  { k: 'pace', label: 'Pace', opts: ['Slow', 'Normal', 'Fast'], def: 'Normal' },
  { k: 'story', label: 'The story of these photos', area: 3, ph: 'Our first date at the café, Goa trip, her birthday, the day we got our puppy…' },
];
const MUSIC = {
  Soft: { notes: [220, 277.18, 329.63, 440], type: 'sine', vol: 0.12, pulse: 0 },
  Dreamy: { notes: [261.63, 329.63, 392, 523.25], type: 'sine', vol: 0.1, pulse: 0.25 },
  Upbeat: { notes: [293.66, 369.99, 440, 587.33], type: 'triangle', vol: 0.09, pulse: 4 },
};
function VideoTool({ names, onUsed }) {
  const [photos, setPhotos] = useState([]);
  const b = useBrief(VIDEO);
  const [title, setTitle] = useState('');
  const [caps, setCaps] = useState([]);
  const [look, setLook] = useState({});
  const [music, setMusic] = useState('Auto');
  const [prog, setProg] = useState(null);
  const [out, setOut] = useState(null);
  const { busy, run } = useAI('video', names, onUsed);
  useEffect(() => () => { if (out) URL.revokeObjectURL(out.url); }, [out]);
  const supported = typeof MediaRecorder !== 'undefined' && !!HTMLCanvasElement.prototype.captureStream;
  const tpl = VIDEOS.find((t) => t[0] === b.v.tpl) || VIDEOS[0];

  const write = async () => {
    const r = await run(b.text(), Math.max(3, photos.length));
    if (r) { setTitle(r.title || ''); setCaps(Array.isArray(r.captions) ? r.captions : []); setLook({ outro: r.outro, colors: r.colors }); return r; }
    return null;
  };
  const make = async () => {
    if (photos.length < 2) return fail(new Error('Pick at least 2 photos'));
    let c = caps, t = title, l = look;
    if (!c.length) { const r = await write(); if (!r) return; c = r.captions || []; t = r.title || ''; l = { outro: r.outro, colors: r.colors }; }
    setProg(0); setOut(null);
    const seg = { Slow: 4200, Normal: 3200, Fast: 2200 }[b.v.pace] || 3200;
    const m = music === 'Auto' ? tpl[6] : music;
    try { setOut(await renderVideo({ photos, title: t, caps: c, music: MUSIC[m] || null, names, look: { ...l, from: tpl[4], to: tpl[5] }, seg, onProg: setProg })); }
    catch (e) { fail(e); }
    setProg(null);
  };
  if (!supported) return html`<p class="muted">This browser cannot record videos. Try Chrome on Android or Safari 14.5 or newer.</p>`;
  const secs = Math.round(photos.length * ({ Slow: 4.2, Normal: 3.2, Fast: 2.2 }[b.v.pace] || 3.2) + 4);
  return html`
    <div class="stack">
      <${PhotoPick} max=${8} value=${photos} onChange=${(v) => { setPhotos(v); setCaps([]); }} />
      <${Brief} fields=${VIDEO} v=${b.v} set=${(v) => { b.set(v); setCaps([]); }} />
      <div class="stack"><span class="small muted">Music</span><div class="chips-wrap">${['Auto', 'Soft', 'Dreamy', 'Upbeat', 'None'].map((o) => html`<button type="button" class=${'chip-btn' + (music === o ? ' on' : '')} onClick=${() => setMusic(o)}>${o === 'Auto' ? `Auto (${tpl[6]})` : o}</button>`)}</div></div>
      <button class="btn" disabled=${busy || prog !== null || photos.length < 2} onClick=${make}>${busy ? 'Writing the story…' : prog !== null ? `Making video… ${Math.round(prog * 100)}%` : out ? '🎞️ Make it again' : '🎞️ Make our video'}</button>
      ${photos.length < 2 && html`<p class="small muted">Pick 2 to 8 photos to start.</p>`}
      ${caps.length > 0 && html`<details class="panel small"><summary>Edit the captions</summary><div class="stack" style="margin-top:8px">
        <input class="input" maxlength="30" value=${title} onInput=${(e) => setTitle(e.target.value)} aria-label="Video title" />
        ${caps.map((c, i) => html`<input class="input" maxlength="60" value=${c} onInput=${(e) => setCaps(caps.map((x, j) => (j === i ? e.target.value : x)))} aria-label=${`Caption ${i + 1}`} />`)}
        <button class="btn ghost" disabled=${busy} onClick=${write}>↻ Write new captions</button></div></details>`}
      ${prog !== null && html`<p class="small muted pulse">Keep this screen open. It records in real time, about ${secs} seconds.</p>`}
      ${out && html`
        <video src=${out.url} controls playsinline class="preview-cv" style="aspect-ratio:9/16;max-height:60vh;background:#000"></video>
        <button class="btn" onClick=${() => shareFile(out.blob, `our-story.${out.ext}`, 'Our story, made with Jodi Arena')}>Save or share video</button>`}
    </div>`;
}

async function renderVideo({ photos, title, caps, music, names, look = {}, seg = 3200, onProg }) {
  const W = 720, H = 1280, FPS = 30, SEG = seg, FADE = 600, INTRO = 2000, OUTRO = 2400;
  const imgs = [];
  for (const p of photos) imgs.push(await bitmap(await compress(p.blob, 1280, 0.85)));
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  const stream = c.captureStream(FPS);
  let ac = null;
  if (music && (window.AudioContext || window.webkitAudioContext)) {
    try {
      ac = new (window.AudioContext || window.webkitAudioContext)();
      const dest = ac.createMediaStreamDestination();
      const gain = ac.createGain(); gain.gain.value = 0.0001; gain.gain.linearRampToValueAtTime(music.vol, ac.currentTime + 1.5); gain.connect(dest);
      let bus = gain;
      if (music.pulse) { const trem = ac.createGain(); trem.gain.value = 0.6; const lfo = ac.createOscillator(); lfo.frequency.value = music.pulse; const depth = ac.createGain(); depth.gain.value = 0.4; lfo.connect(depth); depth.connect(trem.gain); lfo.start(); trem.connect(gain); bus = trem; }
      music.notes.forEach((f, i) => { const o = ac.createOscillator(); o.type = music.type; o.frequency.value = f; const g = ac.createGain(); g.gain.value = 0.5; o.connect(g); g.connect(bus); o.detune.value = i * 3; o.start(); });
      dest.stream.getAudioTracks().forEach((t) => stream.addTrack(t));
    } catch (_) { ac = null; }
  }
  const mime = ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm'].find((m) => MediaRecorder.isTypeSupported(m)) || '';
  const rec = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: 3500000 } : undefined);
  const chunks = [];
  rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  const total = INTRO + imgs.length * SEG + OUTRO;
  const grad = (a, b) => { const g = ctx.createLinearGradient(0, 0, W, H); g.addColorStop(0, a); g.addColorStop(1, b); return g; };
  const text = (t, y, size, color, weight = 700) => { ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.font = `${weight} ${size}px Baloo 2, Mukta, sans-serif`; wrap(ctx, t, W / 2, y, W - 120, size * 1.25, 3); };
  const c1 = hexOr(look.colors && look.colors.from, look.from || '#E11D5A'), c2 = hexOr(look.colors && look.colors.to, look.to || '#F59E0B');
  const frame = (t) => {
    ctx.globalAlpha = 1; ctx.fillStyle = '#12061A'; ctx.fillRect(0, 0, W, H);
    if (t < INTRO) {
      ctx.fillStyle = grad(c1, c2); ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = Math.min(1, t / 600); text(title, H / 2 - 20, 92, '#fff', 800); text(`${names.me} & ${names.partner}`, H / 2 + 150, 44, '#FFF3CD', 600); ctx.globalAlpha = 1;
      return;
    }
    const tt = t - INTRO;
    if (tt < imgs.length * SEG) {
      const i = Math.floor(tt / SEG), local = tt - i * SEG;
      const draw = (k, alpha, loc) => {
        const z = 1 + 0.12 * (loc / SEG), dir = k % 2 ? -1 : 1;
        ctx.globalAlpha = alpha; drawCover(ctx, imgs[k], 0, 0, W, H, z, dir * 30 * (loc / SEG), 0); ctx.globalAlpha = 1;
      };
      draw(i, 1, local);
      if (i > 0 && local < FADE) { draw(i - 1, 1 - local / FADE, SEG); /* previous on top fading out */ }
      const g = ctx.createLinearGradient(0, H - 420, 0, H); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.75)'); ctx.fillStyle = g; ctx.fillRect(0, H - 420, W, 420);
      const cap = caps[i];
      if (cap) { ctx.globalAlpha = Math.min(1, local / 500) * Math.min(1, (SEG - local) / 400 + 0.3); text(cap, H - 170, 50, '#fff', 700); ctx.globalAlpha = 1; }
      return;
    }
    const lo = tt - imgs.length * SEG;
    ctx.fillStyle = grad(c2, c1); ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = Math.min(1, lo / 500); text(look.outro || `${names.me} ❤️ ${names.partner}`, H / 2 - 40, 66, '#fff', 800); text('💞', H / 2 + 150, 100, '#fff'); text('Made with Jodi Arena', H - 90, 30, '#ffffffaa', 600); ctx.globalAlpha = 1;
  };
  frame(0);
  const done = new Promise((res) => { rec.onstop = res; });
  rec.start(500);
  if (ac && ac.state === 'suspended') await ac.resume();
  const t0 = performance.now();
  await new Promise((res) => {
    const tick = () => {
      const t = performance.now() - t0;
      frame(Math.min(t, total - 1)); onProg(Math.min(1, t / total));
      if (t >= total) res(); else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  rec.stop(); await done;
  if (ac) ac.close();
  imgs.forEach((b) => b.close && b.close());
  const type = (rec.mimeType || mime || 'video/webm').split(';')[0];
  const blob = new Blob(chunks, { type });
  return { blob, url: URL.createObjectURL(blob), ext: type.includes('mp4') ? 'mp4' : 'webm' };
}
