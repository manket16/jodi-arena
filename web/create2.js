import { html, useState, useEffect, useRef } from 'https://esm.sh/htm@3.1.1/preact/standalone';
import { sb, rpc, toast, fail, share, confetti } from './lib.js';
import { SUPABASE_URL } from './config.js';
import { Sheet, ScreenBar, compress, fetchPhoto, signed, todayStr } from './hub.js';
import { callAI } from './ai.js';
import { useAI, Details, Brief, useBrief, copy, shareFile, toBlob, wrap } from './create.js';
import { TEMPLATES, OCCASIONS, TEMPLATE_BY_OCCASION, EXTRA } from './sitetpl.js';

const PHOTO_PREFIX = `${SUPABASE_URL}/storage/v1/object/public/site-photos/`;
const siteUrl = (slug) => `${location.origin}/site.html?s=${slug}`;
const pathOf = (u) => (typeof u === 'string' && u.startsWith(PHOTO_PREFIX) ? decodeURIComponent(u.slice(PHOTO_PREFIX.length)) : null);
const lines = (s) => String(s || '').split('\n').map((x) => x.trim()).filter(Boolean);

async function sha(s) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(s).trim().toLowerCase().replace(/\s+/g, ' ')));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
}

// A photo in the builder is { url } once uploaded, or { blob, url: objectURL } before publishing.
const fromBlob = (blob) => ({ blob, url: URL.createObjectURL(blob), key: crypto.randomUUID() });
const fromUrl = (url) => ({ url, key: url });

function emptyForm(names) {
  return {
    title: `For ${names.partner}`, occasion: 'Just because', nickname: '', headline: '', special_date: '',
    intro: '', story: '', reasons: '', song: '', letter: '', closing: '', secret_q: '', secret_a: '',
    movie_title: '', dialogue: '', event_date: '', age: '', question: '', yes_message: '', sorry_reason: '', promise: '',
    city_me: '', city_partner: '', km: '', dreams: '', songs: '',
  };
}

// One question in the builder form. Top-level so inputs keep focus while typing.
function Q({ f, set, k, label, ph, type, area, max = 600 }) {
  return html`<label class="field"><span>${label}</span>${area
    ? html`<textarea class="input" rows=${area} maxlength=${max} placeholder=${ph || ''} value=${f[k]} onInput=${set(k)}></textarea>`
    : html`<input class="input" type=${type || 'text'} maxlength=${max} placeholder=${ph || ''} value=${f[k]} onInput=${set(k)} />`}</label>`;
}

// ---------- website builder ----------
export function WebsiteBuilder({ home, names, onUsed, back }) {
  const [step, setStep] = useState('list');
  const [sites, setSites] = useState(null);
  const [tpl, setTpl] = useState(null);
  const [id, setId] = useState(null);
  const [oldHash, setOldHash] = useState(null);
  const [f, setF] = useState(() => emptyForm(names));
  const [photos, setPhotos] = useState([]);
  const [moments, setMoments] = useState([]);
  const [busy, setBusy] = useState('');
  const [done, setDone] = useState(null);
  const [occ, setOcc] = useState(null);
  const [changing, setChanging] = useState(false);
  const origPhotos = useRef([]);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));

  const loadSites = () => rpc('list_sites').then(setSites).catch((e) => { fail(e); setSites([]); });
  useEffect(() => { loadSites(); }, []);

  const startNew = (k) => {
    setTpl(k); setId(null); setOldHash(null); setDone(null);
    setF((x) => ({ ...emptyForm(names), occasion: occ || x.occasion || 'Just because' }));
    setPhotos([]); setMoments([]); origPhotos.current = [];
    setStep('form');
  };
  const edit = (s) => {
    const d = s.data || {};
    setTpl(s.template); setId(s.id); setDone(null);
    setF({ ...emptyForm(names), ...Object.fromEntries(Object.entries(d).filter(([, v]) => typeof v === 'string')),
      reasons: (d.reasons || []).join('\n'), dreams: Array.isArray(d.dreams) ? d.dreams.join('\n') : (d.dreams || ''),
      songs: Array.isArray(d.songs) ? d.songs.join('\n') : (d.songs || ''), title: s.title, secret_q: d.secret ? d.secret.q : '', secret_a: '' });
    setOldHash(d.secret ? d.secret.hash : null);
    setPhotos((d.photos || []).map(fromUrl));
    setMoments((d.moments || []).map((m) => ({ ...m, key: crypto.randomUUID(), photo: m.photo ? fromUrl(m.photo) : null })));
    origPhotos.current = [...(d.photos || []), ...(d.moments || []).map((m) => m.photo)].filter(Boolean);
    setStep('form');
  };
  const del = async (s) => {
    if (!confirm(`Delete "${s.title}"? The link will stop working.`)) return;
    try {
      await rpc('delete_site', { p_id: s.id });
      const paths = [...(s.data.photos || []), ...(s.data.moments || []).map((m) => m.photo)].map(pathOf).filter(Boolean);
      if (paths.length) sb.storage.from('site-photos').remove(paths);
      toast('Website deleted'); loadSites();
    } catch (e) { fail(e); }
  };

  // what the page will show (preview uses local photo URLs)
  const buildData = (photoUrl = (p) => p && p.url) => {
    const d = { me: names.me, partner: names.partner };
    for (const [k, v] of Object.entries(f)) if (!['title', 'secret_q', 'secret_a', 'reasons', 'dreams', 'songs'].includes(k) && String(v).trim()) d[k] = String(v).trim();
    d.reasons = lines(f.reasons).slice(0, 12);
    if (f.dreams.trim()) d.dreams = lines(f.dreams).slice(0, 12);
    if (f.songs.trim()) d.songs = lines(f.songs).slice(0, 15);
    d.photos = photos.map(photoUrl).filter(Boolean);
    d.moments = moments.filter((m) => m.title.trim()).map((m) => ({ title: m.title.trim(), date: m.date || '', caption: (m.caption || '').trim(), photo: m.photo ? photoUrl(m.photo) : '' }));
    return d;
  };

  const polish = async () => {
    setBusy('ai');
    try {
      const d = buildData(() => null);
      delete d.photos;
      const r = await callAI('website', JSON.stringify({ template: tpl, ...d, moments: d.moments.map(({ photo, ...m }) => m) }).slice(0, 3500), names);
      {
        const a = r.data;
        setF((x) => ({
          ...x,
          headline: x.headline || a.headline || '', intro: a.intro || x.intro, story: a.story || x.story,
          reasons: (a.reasons && a.reasons.length ? a.reasons : lines(x.reasons)).join('\n'),
          letter: a.letter || x.letter, closing: a.closing || x.closing, dialogue: x.dialogue || a.dialogue || '',
        }));
        if (Array.isArray(a.moments)) setMoments((ms) => ms.map((m, i) => (a.moments[i] && !m.caption ? { ...m, caption: a.moments[i].caption || '' } : m)));
        onUsed && onUsed();
        toast('Polished ✨ Check the preview');
      }
    } catch (e) { fail(e); }
    setBusy('');
  };

  const publish = async () => {
    if (!f.title.trim()) return fail(new Error('Give your website a title'));
    setBusy('pub');
    const uploaded = [];
    try {
      const cache = new Map();
      const up = async (p) => {
        if (!p) return '';
        if (!p.blob) return p.url;
        if (cache.has(p.key)) return cache.get(p.key);
        const blob = await compress(p.blob, 1600, 0.84);
        const path = `${home.couple.id}/${crypto.randomUUID()}.jpg`;
        const { error } = await sb.storage.from('site-photos').upload(path, blob, { contentType: 'image/jpeg' });
        if (error) throw error;
        uploaded.push(path);
        const url = sb.storage.from('site-photos').getPublicUrl(path).data.publicUrl;
        cache.set(p.key, url);
        return url;
      };
      const ph = []; for (const p of photos) ph.push(await up(p));
      const ms = []; for (const m of moments) ms.push(m.photo ? await up(m.photo) : '');
      let i = 0;
      const d = buildData(() => ph[i++]);
      d.moments = moments.filter((m) => m.title.trim()).map((m) => ({ title: m.title.trim(), date: m.date || '', caption: (m.caption || '').trim(), photo: ms[moments.indexOf(m)] || '' }));
      if (f.secret_q.trim() && (f.secret_a.trim() || oldHash)) d.secret = { q: f.secret_q.trim(), hash: f.secret_a.trim() ? await sha(f.secret_a) : oldHash };
      const r = await rpc('save_site', { p_id: id, p_template: tpl, p_title: f.title.trim(), p_data: d });
      // tidy photos that were removed while editing
      const keep = new Set([...d.photos, ...d.moments.map((m) => m.photo)]);
      const gone = origPhotos.current.filter((u) => !keep.has(u)).map(pathOf).filter(Boolean);
      if (gone.length) sb.storage.from('site-photos').remove(gone);
      origPhotos.current = [...keep];
      setId(r.id); setDone(r.slug); confetti(); loadSites();
    } catch (e) {
      if (uploaded.length) sb.storage.from('site-photos').remove(uploaded);
      fail(e);
    }
    setBusy('');
  };

  const t = TEMPLATES.find((x) => x.k === tpl);

  // ---------- list of sites + start ----------
  if (step === 'list') return html`
    <div class="stack-lg screen">
      <${ScreenBar} back=${back} title="Love Websites" emo="🌐" />
      <p class="muted" style="margin-top:-12px">A little website made just for ${names.partner}, with a private link you can send on WhatsApp.</p>
      <button class="btn" onClick=${() => setStep('pick')}>＋ Make a new website</button>
      ${sites === null ? html`<p class="muted pulse center">Loading…</p>` : sites.length > 0 && html`
        <h3>Your websites</h3>
        <div class="stack">${sites.map((s) => { const tt = TEMPLATES.find((x) => x.k === s.template) || TEMPLATES[0]; return html`
          <div class="site-row">
            <span class="site-thumb" style=${`background:${tt.bg};color:${tt.fg}`}>${tt.emo}</span>
            <span class="grow"><b>${s.title}</b><span class="small muted">${tt.name} · 👀 ${s.views} ${s.views === 1 ? 'view' : 'views'}</span></span>
            <span class="site-acts">
              <a class="chip" href=${siteUrl(s.slug)} target="_blank" rel="noopener">Open</a>
              <button class="chip" onClick=${() => share(`I made something for you 💞 ${siteUrl(s.slug)}`)}>Share</button>
              <button class="chip" onClick=${() => edit(s)}>Edit</button>
              <button class="chip" onClick=${() => del(s)} aria-label="Delete">🗑</button>
            </span>
          </div>`; })}</div>`}
    </div>`;

  // ---------- pick a template ----------
  if (step === 'pick') {
    const rec = occ && TEMPLATE_BY_OCCASION[occ];
    return html`
      <div class="stack-lg screen">
        <${ScreenBar} back=${() => (changing ? (setChanging(false), setStep('form')) : setStep('list'))} title="Pick a style" emo="🎨" />
        <div class="stack"><span class="small muted">What’s the occasion?</span>
          <div class="chips-wrap">${OCCASIONS.map((o) => html`<button type="button" class=${'chip-btn' + (occ === o ? ' on' : '')} onClick=${() => setOcc(o)}>${o}</button>`)}</div></div>
        <div class="tpl-grid">${TEMPLATES.map((x) => html`
          <button class=${'tpl' + (rec === x.k ? ' rec' : '')} style=${`background:${x.bg};color:${x.fg}`} onClick=${() => (changing ? (setTpl(x.k), setChanging(false), setStep('form')) : startNew(x.k))}>
            ${rec === x.k && html`<span class="tpl-rec">Best for ${occ}</span>`}
            <span class="tpl-emo">${x.emo}</span><b>${x.name}</b><span class="small">${x.line}</span>
          </button>`)}</div>
      </div>`;
  }

  // ---------- preview ----------
  if (step === 'preview') return html`<${Preview} tpl=${tpl} data=${{ ...buildData(), title: f.title }} back=${() => setStep('form')} publish=${publish} busy=${busy} done=${done} id=${id} />`;

  // ---------- questions ----------
  const extra = EXTRA[tpl] || [];
  return html`
    <div class="stack-lg screen">
      <${ScreenBar} back=${() => setStep(id ? 'list' : 'pick')} title=${t.name} emo=${t.emo} right=${html`<button class="chip" onClick=${() => { setChanging(true); setStep('pick'); }}>Change style</button>`} />
      <p class="muted" style="margin-top:-12px">Answer what you like. Skip anything, empty sections just won’t show.</p>

      <details class="qsec" open><summary>💞 The basics</summary><div class="stack">
        <${Q} f=${f} set=${set} k="title" label="Website title (shows in the browser tab)" ph=${`For ${names.partner}`} max="80" />
        <label class="field"><span>Occasion</span><select class="input" value=${f.occasion} onChange=${set('occasion')}>${OCCASIONS.map((o) => html`<option value=${o}>${o}</option>`)}</select></label>
        <${Q} f=${f} set=${set} k="nickname" label=${`What do you call ${names.partner}?`} ph="Shona, Babu, Jaanu…" max="30" />
        <${Q} f=${f} set=${set} k="headline" label="Big headline (optional, we will write one if empty)" ph="Two years of us" max="80" />
        <${Q} f=${f} set=${set} k="special_date" label="When did your story start? (for the days counter)" type="date" />
      </div></details>

      <details class="qsec" open><summary>📖 Your story</summary><div class="stack">
        <${Q} f=${f} set=${set} k="story" label="How did you two meet?" ph="At Riya’s birthday in Patna. You laughed at my joke…" area="4" max="1500" />
        <${Q} f=${f} set=${set} k="intro" label="A first line they’ll read (optional)" ph="I made this because some things deserve more than a text." area="2" />
        <${Q} f=${f} set=${set} k="reasons" label=${`Reasons you love ${names.partner}, one per line`} ph=${'Your laugh\nHow you remember everything\nYour chai'} area="5" max="1500" />
      </div></details>

      <details class="qsec"><summary>📸 Photos and moments</summary><div class="stack">
        <span class="small muted">Photos (up to 8). The first one is the cover.</span>
        <${PhotoRow} value=${photos} onChange=${setPhotos} max=${8} />
        <span class="small muted">Special moments (up to 6)</span>
        ${moments.map((m, i) => html`<${MomentEdit} m=${m} onChange=${(nm) => setMoments(moments.map((x, j) => (j === i ? nm : x)))} onRemove=${() => setMoments(moments.filter((_, j) => j !== i))} />`)}
        ${moments.length < 6 && html`<button type="button" class="btn ghost" onClick=${() => setMoments([...moments, { key: crypto.randomUUID(), title: '', date: '', caption: '', photo: null }])}>＋ Add a moment</button>`}
      </div></details>

      <details class="qsec"><summary>💌 Letter and song</summary><div class="stack">
        <${Q} f=${f} set=${set} k="letter" label="Your letter to them" ph="Write from the heart. Tap Polish to make it shine." area="7" max="3000" />
        <${Q} f=${f} set=${set} k="closing" label="Last line" ph="Forever yours" max="120" />
        <${Q} f=${f} set=${set} k="song" label="Your song (Song - Film)" ph="Tum Se Hi - Jab We Met" max="100" />
      </div></details>

      ${extra.length > 0 && html`<details class="qsec" open><summary>${t.emo} Just for this style</summary><div class="stack">
        ${extra.map(([k, label, ph, kind]) => html`<${Q} f=${f} set=${set} k=${k} label=${label} ph=${ph} type=${kind === 'date' ? 'date' : 'text'} area=${kind === 'area' ? 4 : 0} max=${kind === 'area' ? 1500 : 200} />`)}
      </div></details>`}

      <details class="qsec"><summary>🔒 Secret question (optional)</summary><div class="stack">
        <p class="small muted">They must answer this before the page opens. Something only they know. It keeps out casual peekers, not hackers.</p>
        <${Q} f=${f} set=${set} k="secret_q" label="Question" ph="Where did we have our first chai?" max="120" />
        <${Q} f=${f} set=${set} k="secret_a" label=${oldHash && !f.secret_a ? 'Answer (leave blank to keep the old one)' : 'Answer'} ph="Tapri near college" max="80" />
      </div></details>

      <div class="build-bar">
        <button class="btn ghost" disabled=${!!busy} onClick=${polish}>${busy === 'ai' ? 'Polishing…' : '✨ Polish my words'}</button>
        <button class="btn" disabled=${!!busy} onClick=${() => setStep('preview')}>Preview 👀</button>
      </div>
    </div>`;
}

function Preview({ tpl, data, back, publish, busy, done }) {
  const fr = useRef();
  const send = () => { try { fr.current && fr.current.contentWindow.postMessage({ type: 'jodi-site-preview', template: tpl, data }, location.origin); } catch (_) { /* not ready */ } };
  useEffect(() => {
    const on = (ev) => { if (ev.origin === location.origin && ev.data && ev.data.type === 'jodi-site-ready') send(); };
    addEventListener('message', on);
    return () => removeEventListener('message', on);
  }, [tpl, data]);
  useEffect(send, [tpl, data]);
  const url = done && siteUrl(done);
  const msg = url && `I made something just for you 💞 Open it: ${url}`;
  return html`
    <div class="stack screen">
      <${ScreenBar} back=${back} title=${done ? 'It’s live! 🎉' : 'Preview'} emo="" />
      <div class="phone-frame"><iframe ref=${fr} src="/site.html?preview=1" title="Website preview" onLoad=${send}></iframe></div>
      ${done ? html`
        <div class="panel stack">
          <p class="small muted">Your private link</p>
          <p class="link-box">${url}</p>
          <a class="btn" style="text-decoration:none" href=${`https://wa.me/?text=${encodeURIComponent(msg)}`} target="_blank" rel="noopener">Send on WhatsApp</a>
          <div class="row"><button class="btn ghost grow" onClick=${() => copy(url)}>Copy link</button><a class="btn ghost grow" style="text-decoration:none" href=${url} target="_blank" rel="noopener">Open</a></div>
          <button class="link" onClick=${back}>Keep editing</button>
        </div>` : html`
        <div class="build-bar">
          <button class="btn ghost" onClick=${back}>✏️ Edit</button>
          <button class="btn" disabled=${!!busy} onClick=${publish}>${busy === 'pub' ? 'Publishing…' : '🚀 Publish'}</button>
        </div>`}
    </div>`;
}

// Photo picker for websites: from Memories or upload. Keeps blobs until publish.
function PhotoRow({ value, onChange, max }) {
  const [open, setOpen] = useState(false);
  const [mems, setMems] = useState(null);
  const [urls, setUrls] = useState({});
  const loadMems = async () => {
    setOpen(true);
    if (mems) return;
    try {
      const ps = (await rpc('list_memories')).flatMap((m) => m.photos).slice(0, 60);
      setMems(ps); if (ps.length) setUrls(await signed(ps));
    } catch (e) { fail(e); setMems([]); }
  };
  const add = (e) => { const fs = [...e.target.files].filter((x) => x.type.startsWith('image/')); e.target.value = ''; onChange([...value, ...fs.map(fromBlob)].slice(0, max)); };
  const addMem = async (p) => { if (value.length >= max) return; try { onChange([...value, fromBlob(await fetchPhoto(p))].slice(0, max)); } catch (e) { fail(e); } };
  return html`
    <div class="pick-row">
      ${value.map((v, i) => html`<div class="pick-thumb" style=${`background-image:url("${v.url}")`}>${i === 0 && max > 1 && html`<span class="cover-tag">Cover</span>`}<button type="button" aria-label="Remove" onClick=${() => onChange(value.filter((x) => x !== v))}>✕</button></div>`)}
      ${value.length < max && html`<label class="pick-add">＋<span class="small">Upload</span><input type="file" accept="image/*" multiple=${max > 1} hidden onChange=${add} /></label>`}
      ${value.length < max && html`<button type="button" class="pick-add" onClick=${loadMems}>📸<span class="small">Memories</span></button>`}
      ${open && html`
        <${Sheet} title="Pick from Memories" onClose=${() => setOpen(false)}>
          ${!mems ? html`<p class="muted pulse center">Loading…</p>` : mems.length === 0 ? html`<p class="muted center">No memory photos yet. Upload from your phone instead.</p>` : html`
            <div class="pick-grid">${mems.map((p) => html`<button type="button" class="pick-cell" style=${urls[p] ? `background-image:url("${urls[p]}")` : ''} onClick=${() => addMem(p)} aria-label="Pick photo"></button>`)}</div>
            <button class="btn" onClick=${() => setOpen(false)}>Done (${value.length}/${max})</button>`}
        </${Sheet}>`}
    </div>`;
}

function MomentEdit({ m, onChange, onRemove }) {
  const up = (k) => (e) => onChange({ ...m, [k]: e.target.value });
  return html`
    <div class="moment-edit">
      <div class="row between"><b class="small">Moment</b><button type="button" class="link" onClick=${onRemove}>Remove</button></div>
      <input class="input" maxlength="80" placeholder="First date at Barbeque Nation" value=${m.title} onInput=${up('title')} aria-label="Moment title" />
      <input class="input" type="date" max=${todayStr()} value=${m.date} onInput=${up('date')} aria-label="Moment date" />
      <input class="input" maxlength="200" placeholder="A line about it (optional, Polish can write it)" value=${m.caption} onInput=${up('caption')} aria-label="Moment caption" />
      <${PhotoRow} value=${m.photo ? [m.photo] : []} onChange=${(v) => onChange({ ...m, photo: v[0] || null })} max=${1} />
    </div>`;
}

// ---------- Love coupons ----------
const COUPON_THEMES = [['#FFE3EC', '#E11D5A'], ['#FFF7CC', '#B45309'], ['#E0F2FE', '#0369A1'], ['#DCFCE7', '#047857'], ['#EDE9FE', '#6D28D9']];
const COUPON = [
  { k: 'kinds', label: 'What kind of coupons?', multi: true, def: ['Pampering', 'Food treats', 'Romantic'], opts: ['Pampering', 'Food treats', 'Romantic', 'Funny', 'Chores I will do', 'Adventures', 'Win an argument'] },
  { k: 'tone', label: 'Tone', opts: ['Cute', 'Funny', 'Flirty', 'Sweet'] },
  { k: 'loves', label: 'What do they love? (optional)', ph: 'Momos, sleeping in, long drives, head massages' },
];
export function CouponsTool({ names, onUsed }) {
  const b = useBrief(COUPON);
  const [list, setList] = useState([]);
  const [theme, setTheme] = useState(0);
  const { busy, run } = useAI('coupons', names, onUsed);
  const gen = async () => { const r = await run(b.text()); if (r && r.coupons) setList(r.coupons.slice(0, 10)); };
  const draw = async (c, i) => {
    const [bg, ac] = COUPON_THEMES[theme];
    const cv = document.createElement('canvas'); cv.width = 1200; cv.height = 560;
    const x = cv.getContext('2d');
    x.fillStyle = bg; x.fillRect(0, 0, 1200, 560);
    x.strokeStyle = ac; x.setLineDash([18, 12]); x.lineWidth = 6; x.strokeRect(30, 30, 1140, 500); x.setLineDash([]);
    x.fillStyle = ac; x.beginPath(); x.arc(0, 280, 50, 0, 7); x.arc(1200, 280, 50, 0, 7); x.fill();
    x.fillStyle = '#fff'; x.beginPath(); x.arc(0, 280, 40, 0, 7); x.arc(1200, 280, 40, 0, 7); x.fill();
    x.textAlign = 'center'; x.fillStyle = ac; x.font = '700 34px Mukta, sans-serif';
    x.fillText(`LOVE COUPON  ·  No. ${String(i + 1).padStart(2, '0')}`, 600, 110);
    x.font = '800 78px Baloo 2, Mukta, sans-serif'; wrap(x, c.title, 600, 230, 1000, 88, 2);
    x.font = 'italic 500 32px Mukta, sans-serif'; x.fillStyle = '#444'; wrap(x, c.fine || '', 600, 400, 960, 40, 2);
    x.font = '600 28px Mukta, sans-serif'; x.fillStyle = ac; x.fillText(`From ${names.me} to ${names.partner}  ·  Valid forever  ·  Jugalbandi`, 600, 490);
    return toBlob(cv, 'image/png');
  };
  const save = async (c, i) => { try { await shareFile(await draw(c, i), `love-coupon-${i + 1}.png`, `A love coupon for you: ${c.title}`); } catch (e) { fail(e); } };
  const sendNote = async (c) => {
    try { await rpc('send_note', { p_kind: 'note', p_title: '🎟️ A love coupon for you', p_body: `${c.title}\n\n${c.fine || ''}\n\nShow me this note to redeem it.`.slice(0, 1200), p_emoji: '🎟️' }); toast(`Coupon sent to ${names.partner} 🎟️`); }
    catch (e) { fail(e); }
  };
  const addOwn = () => setList([...list, { title: 'One free hug, anytime', fine: 'No expiry date.' }]);
  return html`
    <div class="stack">
      <${Brief} fields=${COUPON} v=${b.v} set=${b.set} />
      <button class="btn" disabled=${busy} onClick=${gen}>${busy ? 'Writing…' : list.length ? '↻ New coupons' : '🎟️ Make our coupons'}</button>
      <div class="swatches">${COUPON_THEMES.map(([bg, ac], i) => html`<button type="button" class=${'swatch' + (theme === i ? ' on' : '')} style=${`background:${bg};color:${ac}`} onClick=${() => setTheme(i)} aria-label=${`Theme ${i + 1}`}>🎟️</button>`)}</div>
      ${list.map((c, i) => html`
        <div class="coupon" style=${`--cb:${COUPON_THEMES[theme][0]};--ca:${COUPON_THEMES[theme][1]}`}>
          <span class="small">LOVE COUPON · No. ${i + 1}</span>
          <input class="coupon-title" maxlength="50" value=${c.title} onInput=${(e) => setList(list.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} aria-label="Coupon" />
          <input class="coupon-fine" maxlength="70" value=${c.fine} onInput=${(e) => setList(list.map((x, j) => (j === i ? { ...x, fine: e.target.value } : x)))} aria-label="Fine print" />
          <div class="row"><button class="chip" onClick=${() => save(c, i)}>Save image</button><button class="chip" onClick=${() => sendNote(c)}>Send as note</button><button class="chip" onClick=${() => setList(list.filter((_, j) => j !== i))}>Remove</button></div>
        </div>`)}
      ${list.length > 0 && html`<button class="btn ghost" onClick=${addOwn}>＋ Write my own coupon</button>`}
    </div>`;
}

// ---------- Date ideas ----------
export function DatesTool({ names, onUsed }) {
  const [city, setCity] = useState('');
  const [budget, setBudget] = useState('Under ₹1,000');
  const [vibe, setVibe] = useState('Romantic');
  const { busy, res, run } = useAI('dates', names, onUsed);
  const send = async (x) => {
    try { await rpc('send_note', { p_kind: 'note', p_title: `Date idea: ${x.title}`.slice(0, 80), p_body: `${x.plan}\n\nCost: ${x.cost}. You in? 😉`, p_emoji: '🍿' }); toast(`Sent to ${names.partner}`); }
    catch (e) { fail(e); }
  };
  return html`
    <div class="stack">
      <label class="field"><span>City</span><input class="input" maxlength="40" placeholder="Patna" value=${city} onInput=${(e) => setCity(e.target.value)} /></label>
      <div class="stack"><span class="small muted">Budget</span><div class="chips-wrap">${['Free', 'Under ₹500', 'Under ₹1,000', 'Under ₹3,000', 'Splurge'].map((b) => html`<button type="button" class=${'chip-btn' + (budget === b ? ' on' : '')} onClick=${() => setBudget(b)}>${b}</button>`)}</div></div>
      <div class="stack"><span class="small muted">Vibe</span><div class="chips-wrap">${['Romantic', 'Fun', 'Cozy at home', 'Adventurous', 'Foodie', 'Long distance (online)'].map((b) => html`<button type="button" class=${'chip-btn' + (vibe === b ? ' on' : '')} onClick=${() => setVibe(b)}>${b}</button>`)}</div></div>
      <button class="btn" disabled=${busy} onClick=${() => run(`City: ${city || 'any Indian city'}. Budget: ${budget}. Vibe: ${vibe}.`)}>${busy ? 'Planning…' : res ? '↻ More ideas' : '🍿 Plan our dates'}</button>
      ${res && res.ideas && html`<div class="stack">${res.ideas.map((x) => html`
        <div class="note-card" style="cursor:default">
          <span class="grow"><b>${x.title}</b><span class="small">${x.plan}</span><span class="small muted">💰 ${x.cost} · ${x.vibe}</span></span>
          <button class="chip" onClick=${() => send(x)}>Send</button>
        </div>`)}</div>`}
    </div>`;
}

// ---------- Bucket list ----------
const BUCKET = [
  { k: 'kinds', label: 'What should it have?', multi: true, def: ['Travel', 'Food', 'Romantic'], opts: ['Travel', 'Food', 'Adventure', 'Romantic', 'Silly', 'Festivals', 'Life goals', 'At home'] },
  { k: 'budget', label: 'Budget', opts: ['Mix of all', 'Mostly free', 'Dream big'] },
  { k: 'dreams', label: 'Your dreams together (optional)', ph: 'Never been abroad, want a dog someday, love mountains' },
];
export function BucketTool({ names, onUsed }) {
  const b = useBrief(BUCKET);
  const [done, setDone] = useState(() => { try { return JSON.parse(localStorage.getItem('jodi_bucket_done') || '{}'); } catch (_) { return {}; } });
  const { busy, res, run } = useAI('bucket', names, onUsed);
  const toggle = (x) => { const n = { ...done, [x]: !done[x] }; setDone(n); try { localStorage.setItem('jodi_bucket_done', JSON.stringify(n)); } catch (_) { /* ignore */ } };
  const text = res && res.items ? res.items.map((x, i) => `${i + 1}. ${x}`).join('\n') : '';
  const send = async () => {
    try { await rpc('send_note', { p_kind: 'note', p_title: 'Our bucket list 🗺️', p_body: text.slice(0, 1200), p_emoji: '🗺️' }); toast(`Sent to ${names.partner}`); }
    catch (e) { fail(e); }
  };
  return html`
    <div class="stack">
      <${Brief} fields=${BUCKET} v=${b.v} set=${b.set} />
      <button class="btn" disabled=${busy} onClick=${() => run(b.text())}>${busy ? 'Dreaming…' : res ? '↻ New list' : '🗺️ Make our bucket list'}</button>
      ${res && res.items && html`
        <div class="stack">${res.items.map((x) => html`<label class=${'bucket-item' + (done[x] ? ' done' : '')}><input type="checkbox" checked=${!!done[x]} onChange=${() => toggle(x)} /><span>${x}</span></label>`)}</div>
        <div class="row"><button class="btn ghost grow" onClick=${() => copy(text)}>Copy</button><button class="btn grow" onClick=${send}>Send to ${names.partner}</button></div>`}
    </div>`;
}

// ---------- Captions ----------
const CAPTION = [
  { k: 'photo', label: 'The photo is', opts: ['Couple selfie', 'Travel', 'Date night', 'Wedding / function', 'Festival', 'Anniversary', 'Candid'] },
  { k: 'style', label: 'Caption style', opts: ['Cute', 'Funny', 'Savage', 'Filmy', 'Poetic', 'Short and simple'] },
  { k: 'lang', label: 'Language', opts: ['Hinglish', 'English', 'Hindi'] },
  { k: 'about', label: 'What is in the photo? (optional)', ph: 'Marine Drive at sunset, she is laughing at me' },
];
export function CaptionsTool({ names, onUsed }) {
  const b = useBrief(CAPTION);
  const { busy, res, run } = useAI('captions', names, onUsed);
  return html`
    <div class="stack">
      <${Brief} fields=${CAPTION} v=${b.v} set=${b.set} />
      <button class="btn" disabled=${busy} onClick=${() => run(b.text())}>${busy ? 'Writing…' : res ? '↻ More captions' : '📸 Write captions'}</button>
      ${res && res.captions && html`<div class="stack">${res.captions.map((c) => html`
        <button class="note-card" onClick=${() => copy(c)}><span class="grow">${c}</span><span class="chip">Copy</span></button>`)}</div>`}
    </div>`;
}

// ---------- Nicknames ----------
const NICK = [
  { k: 'style', label: 'Kind of names', multi: true, def: ['Cute'], opts: ['Cute', 'Funny', 'Desi', 'Food-based', 'Royal', 'English', 'Filmy'] },
  { k: 'about', label: 'Tell us about them (optional)', ph: 'Tiny, loves sweets, gets angry when hungry' },
];
export function NicknamesTool({ names, onUsed }) {
  const b = useBrief(NICK);
  const { busy, res, run } = useAI('nicknames', names, onUsed);
  const send = async (n) => {
    try { await rpc('send_note', { p_kind: 'quick', p_title: null, p_body: `New nickname for you: ${n.name} 🐣`, p_emoji: '🐣' }); toast(`Sent to ${names.partner}`); }
    catch (e) { fail(e); }
  };
  return html`
    <div class="stack">
      <${Brief} fields=${NICK} v=${b.v} set=${b.set} />
      <button class="btn" disabled=${busy} onClick=${() => run(b.text())}>${busy ? 'Thinking…' : res ? '↻ More names' : '🐣 Suggest nicknames'}</button>
      ${res && res.names && html`<div class="nick-grid">${res.names.map((n) => html`
        <button class="nick" onClick=${() => send(n)}><b>${n.name}</b><span class="small muted">${n.why}</span><span class="small" style="color:var(--rani)">Tap to send</span></button>`)}</div>`}
    </div>`;
}

// ---------- Time capsule ----------
const CAPSULE = [
  { k: 'tone', label: 'Tone', opts: ['Hopeful', 'Emotional', 'Funny', 'Grateful'] },
  { k: 'lang', label: 'Language', opts: ['Hinglish', 'English', 'Hindi'] },
  { k: 'now', label: 'Where you are right now', ph: 'Just moved to Bengaluru, both working late' },
  { k: 'hopes', label: 'What you hope for by then', ph: 'Our Ladakh trip, our own little flat' },
];
export function CapsuleTool({ names, onUsed }) {
  const b = useBrief(CAPSULE);
  const [when, setWhen] = useState(365);
  const [body, setBody] = useState('');
  const [title, setTitle] = useState('For future us');
  const [busyS, setBusyS] = useState(false);
  const [sent, setSent] = useState(null);
  const { busy, run } = useAI('capsule', names, onUsed);
  const label = { 30: '1 month', 90: '3 months', 180: '6 months', 365: '1 year' }[when];
  const ai = async () => { const r = await run(`Opens in: ${label}\n${b.text()}`); if (r) { setTitle(r.title || title); setBody(r.body || ''); } };
  const seal = async () => {
    if (!body.trim()) return fail(new Error('Write something for your future selves first'));
    setBusyS(true);
    try {
      const at = new Date(Date.now() + when * 864e5);
      await rpc('send_note', { p_kind: 'note', p_title: `⏳ ${title}`.slice(0, 80), p_body: body.slice(0, 1200), p_emoji: '⏳', p_topic: null, p_deliver_at: at.toISOString() });
      setSent(at); confetti();
    } catch (e) { fail(e); }
    setBusyS(false);
  };
  if (sent) return html`<div class="stack center"><div style="font-size:64px">⏳</div><h3>Sealed!</h3><p class="muted">${names.partner} will get it on ${sent.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}. They will only see that a surprise is coming.</p></div>`;
  return html`
    <div class="stack">
      <p class="small muted">Write a letter now. It stays sealed and lands in ${names.partner}’s Love Notes on the day you pick.</p>
      <div class="seg seg4">${[30, 90, 180, 365].map((n) => html`<button type="button" class=${when === n ? 'on' : ''} onClick=${() => setWhen(n)}>${{ 30: '1 month', 90: '3 months', 180: '6 months', 365: '1 year' }[n]}</button>`)}</div>
      <${Brief} fields=${CAPSULE} v=${b.v} set=${b.set} />
      <button class="btn ghost" disabled=${busy} onClick=${ai}>${busy ? 'Writing…' : body ? '↻ Write it again' : '✍️ Write it for me'}</button>
      <input class="input" maxlength="70" value=${title} onInput=${(e) => setTitle(e.target.value)} aria-label="Title" />
      <textarea class="input" rows="8" maxlength="1200" placeholder="Dear future us…" value=${body} onInput=${(e) => setBody(e.target.value)}></textarea>
      <button class="btn" disabled=${busyS} onClick=${seal}>${busyS ? 'Sealing…' : `⏳ Seal for ${label}`}</button>
    </div>`;
}
