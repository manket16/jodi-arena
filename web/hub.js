import { html, useState, useEffect, useRef } from 'https://esm.sh/htm@3.1.1/preact/standalone';
import { sb, rpc, toast, fail, usePoll, Mark } from './lib.js';
import { DailyCard } from './daily.js';
import { Capture } from './recorder.js';

export const BUCKET = 'memories';

// ---------- shared helpers ----------
export const todayStr = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
export const fmtDate = (s) => new Date(String(s).length === 10 ? s + 'T00:00:00' : s).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

export async function compress(file, max = 1400, q = 0.82) {
  let bmp;
  try { bmp = await createImageBitmap(file); } catch (_) { throw new Error('Could not read that photo. Try a JPG or PNG.'); }
  const s = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  if (bmp.close) bmp.close();
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Could not read that photo'))), 'image/jpeg', q));
}

const urlCache = new Map();
export async function signed(paths) {
  const now = Date.now();
  const need = [...new Set(paths)].filter((p) => !urlCache.has(p) || urlCache.get(p).exp < now);
  for (let i = 0; i < need.length; i += 100) {
    const { data, error } = await sb.storage.from(BUCKET).createSignedUrls(need.slice(i, i + 100), 3600);
    if (error) throw error;
    for (const r of data) if (r.signedUrl) urlCache.set(r.path, { url: r.signedUrl, exp: now + 3300 * 1000 });
  }
  return Object.fromEntries(paths.map((p) => [p, urlCache.get(p) && urlCache.get(p).url]));
}
// shrink a picked photo and upload it into the couple's private folder; returns the storage path
export async function uploadPhoto(coupleId, file) {
  const blob = await compress(file);
  const path = `${coupleId}/${crypto.randomUUID()}.jpg`;
  const { error } = await sb.storage.from(BUCKET).upload(path, blob, { contentType: 'image/jpeg' });
  if (error) throw error;
  return path;
}
export const isAud = (p) => /\.(m4a|weba|ogg|mp3)$/i.test(p || '');
export const isVid = (p) => /\.(mp4|mov|webm)$/i.test(p || '');
export const coverOf = (m) => (m.photos || []).find((p) => !isVid(p) && !isAud(p));
export async function uploadMedia(coupleId, file) {
  if ((file.type || '').startsWith('audio/')) {
    const type = file.type.split(';')[0];
    const ext = /mp4|m4a|aac/.test(type) ? 'm4a' : type.includes('ogg') ? 'ogg' : type.includes('mpeg') ? 'mp3' : 'weba';
    const apath = `${coupleId}/${crypto.randomUUID()}.${ext}`;
    const { error: aerr } = await sb.storage.from(BUCKET).upload(apath, new Blob([file], { type }), { contentType: type });
    if (aerr) throw aerr;
    return apath;
  }
  if (!(file.type || '').startsWith('video/')) return uploadPhoto(coupleId, file);
  if (file.size > 40 * 1024 * 1024) throw new Error('That video is too big. Keep it to about 20 seconds.');
  const ext = file.type.includes('quicktime') ? 'mov' : file.type.includes('webm') ? 'webm' : 'mp4';
  const path = `${coupleId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await sb.storage.from(BUCKET).upload(path, file, { contentType: file.type });
  if (error) throw error;
  return path;
}
export async function fetchPhoto(path) {
  const { data, error } = await sb.storage.from(BUCKET).download(path);
  if (error) throw error;
  return data;
}

export function Sheet({ title, onClose, children }) {
  useEffect(() => {
    const k = (e) => { if (e.key === 'Escape') onClose(); };
    addEventListener('keydown', k);
    document.body.style.overflow = 'hidden';
    return () => { removeEventListener('keydown', k); document.body.style.overflow = ''; };
  }, []);
  return html`
    <div class="sheet-bg" onClick=${(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div class="sheet" role="dialog" aria-label=${title}>
        <div class="sheet-head"><h2>${title}</h2><button class="back" onClick=${onClose} aria-label="Close">✕</button></div>
        <div class="stack-lg">${children}</div>
      </div>
    </div>`;
}

export function ScreenBar({ back, title, emo, right }) {
  return html`
    <div class="bar">
      <button class="back" onClick=${back} aria-label="Back">←</button>
      <div class="grow"><h2 style="font-size:26px">${emo ? emo + ' ' : ''}${title}</h2></div>
      ${right || ''}
    </div>`;
}

export function Tabs({ items, value, onChange }) {
  return html`<div class="tabs" role="tablist">${items.map(([k, label, dot]) => html`
    <button role="tab" aria-selected=${value === k} class=${value === k ? 'on' : ''} onClick=${() => onChange(k)}>${label}${dot ? html`<i class="dot"></i>` : ''}</button>`)}</div>`;
}

// ---------- Home hub ----------
export function Hub({ home, open, goPlay, onInvite }) {
  const c = home.couple, me = home.profile.name, partner = c.partner_name;
  const [n, setN] = useState(null);
  const load = () => rpc('hub_counts').then(setN).catch(() => {});
  useEffect(() => { load(); }, []);
  usePoll(load, 15000, true);
  const hour = new Date().getHours();
  const hi = hour < 5 ? 'Still up' : hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const unread = n ? n.unread_notes + n.letters : 0;

  const tiles = [
    { k: 'create', emo: '✨', name: 'Create', line: 'Letters, songs, filmy posters and reels for you two', cls: 't-create', badge: '' },
    { k: 'play', emo: '🎲', name: 'Play', line: '8 live games for you two, loser pays up', cls: 't-play', badge: '' },
    { k: 'memories', emo: '📸', name: 'Memories', line: 'Your photo timeline together', cls: 't-mem', badge: n && n.memories ? String(n.memories) : '' },
    { k: 'notes', emo: '💌', name: 'Love Notes', line: 'Notes, letters and a jar of reasons', cls: 't-notes', badge: unread ? `${unread} new` : '', hot: unread > 0 },
  ];

  return html`
    <div class="stack-lg screen">
      <section class="hub-hero">
        <${Mark} a=${onInvite ? me : c.slot === 1 ? me : partner} b=${onInvite ? '?' : c.slot === 1 ? partner : me} big />
        <div>
          <p class="small" style="opacity:.9">${hi}, ${me}</p>
          <h1>${c.name} ${c.badge}</h1>
          <p class="small" style="opacity:.95;font-weight:600;letter-spacing:.3px">Bringing couples closer</p>
          ${onInvite ? html`<button class="chip" style="border:0;cursor:pointer;margin-top:6px;background:#fff;color:var(--ink);font-weight:700" onClick=${onInvite}>＋ Invite your partner</button>` : html`<p class="small" style="opacity:.9">${me} & ${partner}</p>`}
        </div>
      </section>

      <${DailyCard} home=${home} solo=${!!onInvite} onInvite=${onInvite} />

      <button class="nudge-card" onClick=${() => open('scenes')}>
        <span style="font-size:28px">🎬</span>
        <span class="grow"><b>Dream Scenes</b><br/><span class="small muted">Turn a photo of you two into a short video: date night, beach, shaadi…</span></span>
        <span class="chip">New</span>
      </button>

      ${n && n.unread_notes > 0 && html`
        <button class="nudge-card" onClick=${() => open('notes')}>
          <span style="font-size:28px">💌</span>
          <span class="grow"><b>${partner} sent you ${n.unread_notes} new ${n.unread_notes === 1 ? 'note' : 'notes'}</b><br/><span class="small muted">Tap to read</span></span>
          <span class="chip">Read</span>
        </button>`}
      ${n && n.on_this_day > 0 && html`
        <button class="nudge-card" onClick=${() => open('memories', { tab: 'otd' })}>
          <span style="font-size:28px">📸</span>
          <span class="grow"><b>On this day, ${n.on_this_day} ${n.on_this_day === 1 ? 'memory' : 'memories'}</b><br/><span class="small muted">Look back at what you did in past years</span></span>
          <span class="chip">Open</span>
        </button>`}

      <div class="hub-grid">
        ${tiles.map((t) => html`
          <button class=${'hub-tile ' + t.cls} onClick=${() => (t.k === 'play' ? goPlay() : open(t.k))}>
            ${t.badge && html`<span class=${'hub-badge' + (t.hot ? ' hot' : '')}>${t.badge}</span>`}
            <span class="hub-emo">${t.emo}</span>
            <h3>${t.name}</h3>
            <p>${t.line}</p>
          </button>`)}
      </div>
      ${n && n.letters > 0 && html`<p class="muted small center">✉️ ${partner} left you ${n.letters} ${n.letters === 1 ? 'letter' : 'letters'} to open when the time is right.</p>`}
    </div>`;
}

// ---------- Memories ----------
const monthLabel = (s) => new Date(s + 'T00:00:00').toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

export function MemoriesScreen({ home, back, initialTab }) {
  const [list, setList] = useState(null);
  const [urls, setUrls] = useState({});
  const [tab, setTab] = useState(initialTab || 'timeline');
  const [newest, setNewest] = useState(true);
  const [favOnly, setFavOnly] = useState(false);
  const [q, setQ] = useState('');
  const [searching, setSearching] = useState(false);
  const [adding, setAdding] = useState(false);
  const [view, setView] = useState(null);
  const [group, setGroup] = useState(null);

  const load = async () => {
    try {
      const l = await rpc('list_memories');
      setList(l);
      const firsts = l.map((m) => coverOf(m)).filter(Boolean);
      if (firsts.length) { const m = await signed(firsts); setUrls((u) => ({ ...u, ...m })); }
    } catch (e) { fail(e); setList([]); }
  };
  useEffect(() => { load(); }, []);

  const all = list || [];
  const now = new Date(), md = String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
  const match = (m) => (!favOnly || m.fav) && (!q || [m.title, m.caption, m.album, m.place].join(' ').toLowerCase().includes(q.toLowerCase()))
    && (!group || (group.by === 'album' ? (m.album || 'Unsorted') : (m.place || 'No place')) === group.key);
  const rows = all.filter(match).sort((a, b) => (newest ? -1 : 1) * a.happened_on.localeCompare(b.happened_on));
  const otd = all.filter((m) => m.happened_on.slice(5) === md && +m.happened_on.slice(0, 4) < now.getFullYear());

  const Card = ({ m }) => html`
    <button class="mem-card" onClick=${() => setView(m.id)}>
      <div class="mem-img" style=${coverOf(m) && urls[coverOf(m)] ? `background-image:url("${urls[coverOf(m)]}")` : ''}>
        ${m.photos.length === 0 && html`<span class="mem-none">📝</span>`}
        ${m.photos.length > 0 && !coverOf(m) && html`<span class="mem-none">🎬</span>`}
        ${m.photos.length > 1 && html`<span class="mem-count">${m.photos.some(isVid) ? '🎬' : '🖼'} ${m.photos.length}</span>`}
        ${m.fav && html`<span class="mem-fav">★</span>`}
      </div>
      <b>${m.title}</b>
      <span class="small muted">📅 ${fmtDate(m.happened_on)}</span>
      ${m.caption && html`<span class="small muted mem-cap">${m.caption}</span>`}
    </button>`;

  const Timeline = ({ items }) => {
    const groups = [];
    for (const m of items) {
      const k = monthLabel(m.happened_on);
      if (!groups.length || groups[groups.length - 1].k !== k) groups.push({ k, items: [] });
      groups[groups.length - 1].items.push(m);
    }
    return html`<div class="timeline">${groups.map((g) => html`
      <div class="tl-month"><span class="tl-dot"></span><h3>${g.k}</h3></div>
      <div class="mem-grid">${g.items.map((m) => html`<${Card} m=${m} />`)}</div>`)}</div>`;
  };

  const Groups = ({ by }) => {
    const map = new Map();
    for (const m of all) { const k = (by === 'album' ? m.album : m.place) || (by === 'album' ? 'Unsorted' : 'No place'); if (!map.has(k)) map.set(k, []); map.get(k).push(m); }
    const arr = [...map.entries()];
    if (!arr.length) return html`<p class="muted center">Nothing here yet. Add a memory with ${by === 'album' ? 'an album' : 'a place'} name.</p>`;
    return html`<div class="mem-grid">${arr.map(([k, ms]) => { const cover = ms.find((m) => coverOf(m)); return html`
      <button class="mem-card" onClick=${() => { setGroup({ by, key: k }); setTab('timeline'); }}>
        <div class="mem-img" style=${cover && urls[coverOf(cover)] ? `background-image:url("${urls[coverOf(cover)]}")` : ''}>${!cover && html`<span class="mem-none">${by === 'album' ? '📁' : '📍'}</span>`}</div>
        <b>${by === 'album' ? '' : '📍 '}${k}</b><span class="small muted">${ms.length} ${ms.length === 1 ? 'memory' : 'memories'}</span>
      </button>`; })}</div>`;
  };

  const viewing = view && all.find((m) => m.id === view);

  return html`
    <div class="stack-lg screen">
      <${ScreenBar} back=${back} title="Our Memories" emo="💞" right=${html`<button class="back" onClick=${() => { setSearching(!searching); setQ(''); }} aria-label="Search">🔍</button>`} />
      <p class="muted" style="margin-top:-12px">Our story, one moment at a time</p>
      ${searching && html`<input class="input" autofocus placeholder="Search title, place or caption" value=${q} onInput=${(e) => setQ(e.target.value)} />`}
      <${Tabs} items=${[['timeline', 'Timeline'], ['albums', 'Albums'], ['places', 'Places'], ['otd', 'On This Day', otd.length > 0]]} value=${tab} onChange=${(k) => { setTab(k); setGroup(null); }} />

      <section class="mem-hero">
        <div class="mem-hero-art">🫶</div>
        <div class="stack">
          <p class="hero-line">Collect the moments that make our story beautiful</p>
          <button class="btn" onClick=${() => setAdding(true)}>＋ Add Memory</button>
        </div>
      </section>

      ${list === null ? html`<p class="muted pulse center">Loading…</p>` : html`
        ${tab === 'timeline' && html`
          <div class="row between">
            <h3>${group ? group.key : 'All'} ${group && html`<button class="link" onClick=${() => setGroup(null)}>show all</button>`}</h3>
            <button class="link" onClick=${() => setNewest(!newest)}>${newest ? 'Latest First' : 'Oldest First'} ↕</button>
          </div>
          <div class="row"><button class=${'chip-btn' + (favOnly ? ' on' : '')} onClick=${() => setFavOnly(!favOnly)}>${favOnly ? '♥' : '♡'} Favorites</button></div>
          ${rows.length === 0 ? html`<p class="muted center" style="padding:24px 0">${all.length === 0 ? 'No memories yet. Add your first photo together 💕' : 'No memories match.'}</p>` : html`<${Timeline} items=${rows} />`}`}
        ${tab === 'albums' && html`<${Groups} by="album" />`}
        ${tab === 'places' && html`<${Groups} by="place" />`}
        ${tab === 'otd' && (otd.length === 0
          ? html`<p class="muted center" style="padding:24px 0">No memories from this day in past years yet. Come back on a date you have added a memory for.</p>`
          : html`<div class="mem-grid">${otd.map((m) => html`<${Card} m=${m} />`)}</div>`)}`}

      ${adding && html`<${AddMemory} home=${home} albums=${[...new Set(all.map((m) => m.album).filter(Boolean))]} onClose=${() => setAdding(false)} onSaved=${() => { setAdding(false); load(); toast('Memory saved 💞'); }} />`}
      ${viewing && html`<${MemoryView} m=${viewing} home=${home} albums=${[...new Set(all.map((x) => x.album).filter(Boolean))]} onClose=${() => setView(null)} onChanged=${() => { setView(null); load(); }} />`}
    </div>`;
}

// one form for adding a memory and for editing a saved one (edit = the memory being changed)
function AddMemory({ home, albums, edit, urls, onClose, onSaved }) {
  const [files, setFiles] = useState([]);
  const [kept, setKept] = useState(edit ? edit.photos : []);
  const [title, setTitle] = useState(edit ? edit.title : '');
  const [date, setDate] = useState(edit ? edit.happened_on : todayStr());
  const [place, setPlace] = useState(edit && edit.place ? edit.place : '');
  const [album, setAlbum] = useState(edit && edit.album ? edit.album : '');
  const [caption, setCaption] = useState(edit && edit.caption ? edit.caption : '');
  const [prog, setProg] = useState('');
  const previews = useRef(new Map());
  const prev = (f) => { if (!previews.current.has(f)) previews.current.set(f, URL.createObjectURL(f)); return previews.current.get(f); };
  useEffect(() => () => previews.current.forEach((u) => URL.revokeObjectURL(u)), []);

  const addFiles = (e) => {
    const picked = [...e.target.files].filter((f) => f.type.startsWith('image/') || f.type.startsWith('video/') || f.type.startsWith('audio/'));
    setFiles((cur) => [...cur, ...picked].slice(0, 6 - kept.length));
    e.target.value = '';
  };
  const save = async (e) => {
    e.preventDefault();
    const paths = [];
    try {
      for (let i = 0; i < files.length; i++) {
        setProg(`Uploading ${i + 1} of ${files.length}…`);
        paths.push(await uploadMedia(home.couple.id, files[i]));
      }
      setProg('Saving…');
      if (edit) {
        const dropped = await rpc('update_memory', { p_id: edit.id, p_title: title, p_caption: caption, p_date: date, p_album: album, p_place: place, p_paths: [...kept, ...paths] });
        if (dropped && dropped.length) { try { await sb.storage.from(BUCKET).remove(dropped); } catch (_) { /* old files can be cleaned later */ } }
      } else {
        await rpc('add_memory', { p_title: title, p_caption: caption, p_date: date, p_album: album, p_place: place, p_paths: paths });
      }
      onSaved();
    } catch (err) {
      if (paths.length) sb.storage.from(BUCKET).remove(paths);
      setProg(''); fail(err);
    }
  };
  const busy = !!prog;
  return html`
    <${Sheet} title=${edit ? 'Edit memory' : 'Add a memory'} onClose=${busy ? () => {} : onClose}>
      <form class="stack" onSubmit=${save}>
        <div class="pick-row">
          ${kept.map((p) => html`<div class="pick-thumb" style=${urls && urls[p] && !isVid(p) && !isAud(p) ? `background-image:url("${urls[p]}")` : ''}>${isVid(p) && html`<span class="pick-vid">🎬</span>`}${isAud(p) && html`<span class="pick-vid">🎙️</span>`}<button type="button" aria-label="Remove photo" onClick=${() => setKept(kept.filter((x) => x !== p))}>✕</button></div>`)}
          ${files.map((f, i) => html`<div class="pick-thumb" style=${f.type.startsWith('video/') || f.type.startsWith('audio/') ? '' : `background-image:url("${prev(f)}")`}>${f.type.startsWith('video/') && html`<video src=${prev(f)} muted playsinline preload="metadata"></video>`}${f.type.startsWith('audio/') && html`<span class="pick-vid">🎙️</span>`}<button type="button" aria-label="Remove photo" onClick=${() => setFiles(files.filter((_, j) => j !== i))}>✕</button></div>`)}
          ${kept.length + files.length < 6 && html`<label class="pick-add">＋<span class="small">Gallery</span><input type="file" accept="image/*,video/*,audio/*" multiple hidden onChange=${addFiles} /></label>`}
        </div>
        ${kept.length + files.length < 6 && html`<${Capture} accept="image/*,video/*,audio/*" onFile=${(f) => setFiles((cur) => [...cur, f].slice(0, 6 - kept.length))} label="Gallery" />`}
        <label class="field"><span>What was it?</span><input class="input" required maxlength="80" placeholder="Barbeque Nation date" value=${title} onInput=${(e) => setTitle(e.target.value)} /></label>
        <div class="two">
          <label class="field"><span>Date</span><input class="input" type="date" required max=${todayStr()} value=${date} onInput=${(e) => setDate(e.target.value)} /></label>
          <label class="field"><span>Place (optional)</span><input class="input" maxlength="60" placeholder="Patna" value=${place} onInput=${(e) => setPlace(e.target.value)} /></label>
        </div>
        <label class="field"><span>Album (optional)</span>
          <input class="input" maxlength="40" list="albums" placeholder="Dates, Trips, Festivals…" value=${album} onInput=${(e) => setAlbum(e.target.value)} />
          <datalist id="albums">${albums.map((a) => html`<option value=${a}></option>`)}</datalist>
        </label>
        <label class="field"><span>A line to remember it by (optional)</span><textarea class="input" rows="3" maxlength="600" placeholder="Her eyes…" value=${caption} onInput=${(e) => setCaption(e.target.value)}></textarea></label>
        <button class="btn" disabled=${busy}>${busy ? prog : edit ? 'Save changes' : 'Save memory'}</button>
      </form>
    </${Sheet}>`;
}

function MemoryView({ m, home, albums, onClose, onChanged }) {
  const [urls, setUrls] = useState({});
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [fav, setFav] = useState(m.fav);
  useEffect(() => { if (m.photos.length) signed(m.photos).then(setUrls).catch(fail); }, [m.id]);
  const toggle = async () => { try { setFav(await rpc('toggle_memory_fav', { p_id: m.id })); } catch (e) { fail(e); } };
  const del = async () => {
    if (!confirm('Delete this memory for both of you? This cannot be undone.')) return;
    setBusy(true);
    try {
      const paths = await rpc('delete_memory', { p_id: m.id });
      if (paths && paths.length) await sb.storage.from(BUCKET).remove(paths);
      toast('Memory deleted'); onChanged();
    } catch (e) { fail(e); setBusy(false); }
  };
  return html`
    <${Sheet} title=${m.title} onClose=${onClose}>
      ${m.photos.length > 0 && html`<div class="carousel">${m.photos.map((p) => isAud(p)
        ? html`<audio class="car-aud" src=${urls[p] || ''} controls preload="metadata"></audio>`
        : isVid(p)
        ? html`<video class="car-img car-vid" src=${urls[p] || ''} controls playsinline preload="metadata"></video>`
        : html`<div class="car-img" style=${urls[p] ? `background-image:url("${urls[p]}")` : ''}></div>`)}</div>`}
      <div class="stack">
        <p class="small muted">📅 ${fmtDate(m.happened_on)}${m.place ? ` · 📍 ${m.place}` : ''}${m.album ? ` · 📁 ${m.album}` : ''}</p>
        ${m.caption && html`<p>${m.caption}</p>`}
        <p class="small muted">Added by ${m.mine ? 'you' : m.by_name}</p>
      </div>
      <div class="row">
        <button class="btn ghost grow" onClick=${toggle}>${fav ? '★ Favorite' : '☆ Add to favorites'}</button>
        <button class="btn ghost" disabled=${busy} onClick=${() => setEditing(true)} aria-label="Edit memory">✏️ Edit</button>
        <button class="btn ghost" disabled=${busy} onClick=${del} aria-label="Delete memory">🗑</button>
      </div>
      ${editing && html`<${AddMemory} home=${home} albums=${albums} edit=${m} urls=${urls} onClose=${() => setEditing(false)} onSaved=${() => { toast('Memory updated 💞'); onChanged(); }} />`}
    </${Sheet}>`;
}
