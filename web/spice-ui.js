// The screens for the two spice games, the pre-game setup, the "new level unlocked" pop-up and the
// pending-stakes card on Home. Everything here only touches camera and kaunbola, so the six older games stay as they were.
import { html, useState, useEffect, useRef } from 'https://esm.sh/htm@3.1.1/preact/standalone';
import { sb, rpc, toast, fail, buzz, confetti } from './lib.js';
import { send, onMessage, me as myId } from './live.js';
import { META } from './duel-engine.js';
import { LEVELS, STAKES_BY_LEVEL } from './spice-content.js';

// ---------- progress: how many matches of each game this couple has played ----------
let prog = null;
const psubs = new Set();
export const getProgress = () => prog;
const setProgress = (v) => { prog = v; psubs.forEach((fn) => fn(v)); };
export const loadProgress = () => rpc('get_progress').then((p) => { setProgress(p); return p; }).catch(() => prog);
export function useProgress() {
  const [v, setV] = useState(prog);
  useEffect(() => { psubs.add(setV); return () => psubs.delete(setV); }, []);
  return v;
}
const played = (p, game) => (p && p.by_game && p.by_game[game]) || 0;
const nightOwl = () => { const h = new Date().getHours(); return h >= 22 || h < 4; };
export function levelOpen(p, game, level) {
  const g = played(p, game);
  if (level === 1) return true;
  if (level === 2) return g >= 3;
  return g >= 8 || (g >= 5 && nightOwl());
}
const usedFor = (p) => (p && p.used) || [];

// ---------- "new spice level unlocked" pop-up ----------
let unlock = null;
const usubs = new Set();
const setUnlock = (v) => { unlock = v; usubs.forEach((fn) => fn(v)); };
// after a match: compare the count before and after; 3 and 8 are the unlock moments
export async function checkUnlock(game, before) {
  const p = await loadProgress();
  const n = played(p, game);
  if (n > before && (n === 3 || n === 8)) { setUnlock({ game, level: n === 3 ? 2 : 3 }); confetti(); buzz([40, 60, 40]); }
}
export function UnlockModal() {
  const [u, setU] = useState(unlock);
  useEffect(() => { usubs.add(setU); return () => usubs.delete(setU); }, []);
  if (!u) return null;
  const L = LEVELS[u.level - 1];
  return html`
    <div class="unlock-back" role="dialog" aria-label="New spice level unlocked">
      <div class="unlock-card">
        <div class="unlock-emo">${L.emo}</div>
        <h2>🔓 New spice level unlocked!</h2>
        <p><b>${L.name}</b> is now open for ${META[u.game].name}.</p>
        <p class="small muted">${L.vibe}</p>
        <button class="btn game big-cta" onClick=${() => setUnlock(null)}>Awesome</button>
      </div>
    </div>`;
}

// ---------- pre-game setup: pick the mood, spin the stake, invite ----------
const memo = (k, d) => { try { return localStorage.getItem(k) || d; } catch (_) { return d; } };
const keep = (k, v) => { try { localStorage.setItem(k, v); } catch (_) { /* storage off */ } };

export function PreGame({ d, uid, me, partner, online, Wheel, nextSpin, mineSpins, setDuel }) {
  const p = useProgress();
  const g = META[d.game];
  const [level, setLevel] = useState(() => { const l = +memo(`jodi_lv_${d.game}`, 1); return levelOpen(getProgress(), d.game, l) ? l : 1; });
  const [mode, setMode] = useState(() => memo('jodi_kb_mode', 'couch'));
  const [src, setSrc] = useState('level');
  const [stake, setStake] = useState(null);
  const [spin, setSpin] = useState(0);
  const [custom, setCustom] = useState('');
  const [trap, setTrap] = useState('');
  const [trapOpen, setTrapOpen] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [declined, setDeclined] = useState(false);
  useEffect(() => { loadProgress(); }, []);
  useEffect(() => { setStake(null); }, [level, src]);
  const list = src === 'ours' && mineSpins ? mineSpins : STAKES_BY_LEVEL[level];
  const n = played(p, d.game);

  const pick = (L) => {
    if (!levelOpen(p, d.game, L.n)) {
      toast(L.n === 2 ? `Play ${Math.max(0, 3 - n)} more ${g.name} ${3 - n === 1 ? 'match' : 'matches'} to unlock Teekha` : `Play ${Math.max(0, 8 - n)} more ${g.name} matches to unlock Jwalamukhi`);
      buzz(40); return;
    }
    setLevel(L.n); keep(`jodi_lv_${d.game}`, L.n);
  };
  const doSpin = () => { const [i, rot] = nextSpin(spin, list.length); setStake(null); setSpin(rot); buzz(20); setTimeout(() => { setStake(list[i]); buzz(40); }, 2300); };
  const chooseMode = (m) => { setMode(m); keep('jodi_kb_mode', m); };
  const customs = trap.trim() ? [trap.trim()] : [];

  useEffect(() => {
    if (!inviting) return;
    const msg = { t: 'invite', id: d.id, game: d.game, stake: stake || '', level, mode, from: uid };
    send({ ...msg, at: Date.now() });
    const t = setInterval(() => send({ ...msg, at: Date.now() }), 2500);
    const off = onMessage((m) => {
      if (m.id !== d.id) return;
      if (m.t === 'accept') { clearInterval(t); buzz(40); setDuel({ ...d, step: 'room', stake: stake || '', partnerId: m.by, level, mode, customs }); }
      if (m.t === 'decline') { setDeclined(true); setInviting(false); }
    });
    return () => { clearInterval(t); off(); };
  }, [inviting]);
  const close = () => { if (inviting) send({ t: 'cancel', id: d.id }); setDuel(null); };
  const link = `${location.origin}/?play=1`;

  return html`
    <div class="stack-lg duel-lobby pregame" style=${`--g:${g.color};--g-soft:${g.soft}`}>
      <div class="row between"><button class="back" onClick=${close} aria-label="Close">✕</button><span class=${'online-pill' + (online ? ' on' : '')}>${online ? `🟢 ${partner} is here` : `⚪ ${partner} is not in the app`}</span></div>
      <div class="center stack"><div class="lobby-emo">${g.emo}</div><h1>${g.name}</h1><p class="muted">${g.sub}</p></div>
      <ol class="how">${g.how.map((h) => html`<li>${h}</li>`)}</ol>

      ${d.game === 'kaunbola' && html`
        <section class="stack">
          <h3>1. How are you sitting?</h3>
          <div class="two-btn">
            <button class=${'mode-btn' + (mode === 'couch' ? ' on' : '')} onClick=${() => chooseMode('couch')} disabled=${inviting}><b>🛋️ Same room</b><span class="small">One phone shows the phrase, the other person just watches</span></button>
            <button class=${'mode-btn' + (mode === 'video' ? ' on' : '')} onClick=${() => chooseMode('video')} disabled=${inviting}><b>📱 Two phones</b><span class="small">Record a 5-second clip, your partner guesses</span></button>
          </div>
        </section>`}

      <section class="stack">
        <h3>${d.game === 'kaunbola' ? '2' : '1'}. How spicy tonight?</h3>
        <div class="tiers">
          ${LEVELS.map((L) => {
            const open = levelOpen(p, d.game, L.n);
            const need = L.need || 0;
            return html`
              <button class=${'tier' + (level === L.n ? ' on' : '') + (open ? '' : ' locked')} onClick=${() => !inviting && pick(L)} aria-pressed=${level === L.n}>
                <span class="tier-emo">${open ? L.emo : '🔒'}</span>
                <span class="grow"><b>${L.name}</b><span class="small">${L.tag}</span>
                  ${open ? html`<span class="small">${L.vibe}</span>` : html`
                    <span class="tbar tier-bar"><i style=${`width:${Math.min(100, (n / need) * 100)}%`}></i></span>
                    <span class="small">${L.n === 2 ? `${Math.min(n, need)}/${need} matches played to unlock Teekha` : `Play ${Math.max(0, need - n)} more ${need - n === 1 ? 'match' : 'matches'} to unlock${nightOwl() ? ` (or ${Math.max(0, 5 - n)} more tonight)` : ''}`}</span>`}
                </span>
              </button>`;
          })}
        </div>
      </section>

      <section class="panel stack center">
        <h3>${d.game === 'kaunbola' ? '3' : '2'}. Loser has to…</h3>
        ${mineSpins && html`<div class="seg"><button type="button" class=${src === 'level' ? 'on' : ''} onClick=${() => setSrc('level')} disabled=${inviting}>${LEVELS[level - 1].emo} ${LEVELS[level - 1].name} stakes</button><button type="button" class=${src === 'ours' ? 'on' : ''} onClick=${() => setSrc('ours')} disabled=${inviting}>🎡 Our spins</button></div>`}
        <${Wheel} items=${list} spin=${spin} />
        ${stake ? html`<p class="stake-result">${stake}</p>` : html`<p class="muted small">Tap Spin to pick, or write your own below.</p>`}
        <div class="row"><button class="btn ghost grow" onClick=${doSpin} disabled=${inviting}>🎡 Spin</button></div>
        <div class="row"><input class="input grow" maxlength="60" placeholder="Or write your own stake" value=${custom} onInput=${(e) => setCustom(e.target.value)} disabled=${inviting} /><button class="btn ghost" disabled=${!custom.trim() || inviting} onClick=${() => setStake(custom.trim())}>Use</button></div>
      </section>

      ${d.game === 'camera' && html`
        <section class="stack">
          ${trapOpen ? html`
            <div class="panel stack">
              <b>✍️ Sneak in your own challenge</b>
              <p class="small muted">${partner} will see it in round 2 and think the app asked it.</p>
              <input class="input" maxlength="120" placeholder="Example: A photo of the last thing you ate" value=${trap} onInput=${(e) => setTrap(e.target.value)} disabled=${inviting} />
            </div>` : html`<button class="link" onClick=${() => setTrapOpen(true)} disabled=${inviting}>✍️ Sneak in a challenge for ${partner} (optional)</button>`}
        </section>`}

      ${inviting ? html`
        <div class="panel stack center">
          <p class="pulse"><b>Waiting for ${partner} to join…</b></p>
          ${!online && html`<p class="small muted">${partner} needs to open Jodi Arena on their phone.</p>
            <a class="btn" style="text-decoration:none" href=${`https://wa.me/?text=${encodeURIComponent(`${me} wants to play ${g.name} with you on Jodi Arena 🎮 Open it now: ${link}`)}`} target="_blank" rel="noopener">Call them on WhatsApp</a>`}
          <button class="link" onClick=${() => { send({ t: 'cancel', id: d.id }); setInviting(false); }}>Cancel</button>
        </div>` : html`
        ${declined && html`<p class="small center muted">${partner} said not now. Try again in a bit.</p>`}
        <button class="btn game big-cta" onClick=${() => { setDeclined(false); setInviting(true); }}>Invite ${partner} to play</button>`}
    </div>`;
}
export const usedPrompts = () => usedFor(prog);

// ---------- small helpers for the two games ----------
function useNow(ms = 100) {
  const [, set] = useState(0);
  useEffect(() => { const t = setInterval(() => set((x) => x + 1), ms); return () => clearInterval(t); }, []);
}
function Clock({ s, now, total }) {
  useNow(100);
  if (!s.dl) return null;
  const left = Math.max(0, s.dl - now());
  return html`<div class="tbar"><i style=${`width:${Math.min(100, (left / total) * 100)}%`}></i><b>${Math.ceil(left / 1000)}s</b></div>`;
}
const Say = ({ you, children }) => html`<div class=${'say' + (you ? ' you' : '')}>${children}</div>`;
const Badge = ({ level }) => html`<span class="lvl-badge">${LEVELS[level - 1].emo} ${LEVELS[level - 1].name}</span>`;

// ---------- Camera Roll Roulette ----------
// Photos are shrunk on the phone and sent to the partner in small pieces. They are never stored anywhere.
const photos = new Map(), chunks = new Map(), photoSubs = new Set();
const pkey = (id, rd, who) => `${id}:${rd}:${who}`;
const putPhoto = (k, v) => { photos.set(k, v); photoSubs.forEach((fn) => fn()); };
onMessage((m) => {
  if (m.t === 'photo') {
    const k = pkey(m.id, m.rd, m.from);
    const c = chunks.get(k) || { n: m.n, parts: [] };
    c.parts[m.i] = m.data; chunks.set(k, c);
    if (c.parts.filter(Boolean).length === c.n) { putPhoto(k, c.parts.join('')); chunks.delete(k); }
  }
  if (m.t === 'need') { const v = photos.get(pkey(m.id, m.rd, myId())); if (v) sendPhoto(m.id, m.rd, v); }
});
function sendPhoto(id, rd, data) {
  const size = 30000, n = Math.ceil(data.length / size);
  for (let i = 0; i < n; i++) setTimeout(() => send({ t: 'photo', id, rd, i, n, data: data.slice(i * size, (i + 1) * size) }), i * 70);
}
async function loadBitmap(file) {
  try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); }
  catch (_) {
    return new Promise((res, rej) => { const u = URL.createObjectURL(file); const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = u; });
  }
}
// shrink to at most 800px wide and under about 100KB
export async function compress(file, maxW = 800) {
  const bmp = await loadBitmap(file);
  let w = Math.min(maxW, bmp.width || bmp.naturalWidth), out = '';
  for (let tries = 0; tries < 5; tries++) {
    const h = Math.round(w * ((bmp.height || bmp.naturalHeight) / (bmp.width || bmp.naturalWidth)));
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    cv.getContext('2d').drawImage(bmp, 0, 0, w, h);
    for (const q of [0.6, 0.5, 0.4, 0.3]) {
      out = cv.toDataURL('image/webp', q);
      if (!out.startsWith('data:image/webp')) out = cv.toDataURL('image/jpeg', q);
      if (out.length <= 100000) return out;
    }
    w = Math.round(w * 0.8);
  }
  return out;
}

function Polaroid({ src, label, mine, speed, flip }) {
  return html`
    <div class=${'polaroid' + (flip ? ' flip' : '')}>
      <div class="pol-inner">
        <div class="pol-back"><span>📸</span></div>
        <div class="pol-front">
          ${src ? html`<img src=${src} alt=${label} />` : html`<div class="pol-empty">${src === undefined ? 'Photo coming…' : 'No photo'}</div>`}
          <b>${label}${mine ? ' (you)' : ''}</b>${speed && html`<span class="speed-badge">⚡ Fastest Finger: +1</span>`}
        </div>
      </div>
    </div>`;
}

export function CameraRoll({ s, r, uid, doAct, now, name, partnerName, d }) {
  const [, bump] = useState(0);
  const [busy, setBusy] = useState(false);
  useEffect(() => { const f = () => bump((x) => x + 1); photoSubs.add(f); return () => photoSubs.delete(f); }, []);
  const partner = r.partner;
  const myLock = s.lock && uid in s.lock, theirLock = s.lock && partner in s.lock;
  const mine = photos.get(pkey(d.id, s.rd, uid)), theirs = photos.get(pkey(d.id, s.rd, partner));
  const alerted = useRef(0);
  useEffect(() => { if (s.ph === 'scramble' && theirLock && !myLock && alerted.current !== s.rd) { alerted.current = s.rd; buzz([80, 40, 80]); } }, [theirLock, myLock, s.rd, s.ph]);
  useNow(250);

  // ask for a photo that has not shown up yet
  const asked = useRef(0);
  useEffect(() => {
    if (s.ph !== 'vote' && s.ph !== 'score') return;
    if (!theirs && theirLock && asked.current !== s.rd) { const t = setTimeout(() => { asked.current = s.rd; send({ t: 'need', id: d.id, rd: s.rd }); }, 2200); return () => clearTimeout(t); }
  }, [s.ph, s.rd, !!theirs, theirLock]);

  const choose = async (e) => {
    const f = e.target.files && e.target.files[0]; e.target.value = '';
    if (!f || myLock || busy) return;
    setBusy(true);
    try {
      const data = await compress(f);
      putPhoto(pkey(d.id, s.rd, uid), data);
      doAct({ t: 'lock' });
      sendPhoto(d.id, s.rd, data);
    } catch (err) { fail(new Error('That photo would not open. Try another one.')); }
    setBusy(false);
  };

  const left = Math.max(0, Math.ceil((s.dl - now()) / 1000));
  const head = html`<div class="row between"><${Badge} level=${s.level} /><span class="small muted">Round ${s.rd} of 3</span></div>`;

  if (s.ph === 'scramble') return html`
    ${head}
    ${theirLock && !myLock && html`<div class="panic" role="alert">🚨 ${partnerName} just dropped a photo! ${left} seconds left!</div>`}
    <${Clock} s=${s} now=${now} total=${25000} />
    <div class="qcard">${s.q}</div>
    ${myLock ? html`
      <div class="locked-card">${mine && html`<img src=${mine} alt="Your photo" />`}<b>Locked in ✅</b><span class="small muted">${theirLock ? 'Both photos are in…' : `Waiting for ${partnerName}…`}</span></div>`
      : html`
      <label class=${'btn game big-cta file-btn' + (busy ? ' disabled' : '')}>${busy ? 'Getting your photo ready…' : 'Open Gallery & Pick Photo 📸'}
        <input type="file" accept="image/*" onChange=${choose} disabled=${busy} />
      </label>
      <p class="small muted center">Pick the photo that matches best. The faster you are, the more points you get.</p>`}`;

  if (s.ph === 'vote' || s.ph === 'score') {
    const voted = s.votes && uid in s.votes;
    const showRes = s.ph === 'score';
    const x = s.p[0], y = s.p[1];
    const rr = s.rres || {};
    const tell = rr.k === 'agree' ? `${name(rr.who)} won the vote: +2` : rr.k === 'kind' ? 'You both picked each other’s photo. Both get +2! 💞' : rr.k === 'stubborn' ? 'Both of you are too stubborn! Only the Speed Point counts.' : rr.k === 'solo' ? `Only ${name(rr.who)} dropped a photo: +3` : 'Nobody found a photo in time 😅';
    return html`
      ${head}
      <div class="qcard small-q">${s.q}</div>
      <div class="pol-pair">
        <${Polaroid} src=${photos.get(pkey(d.id, s.rd, x))} label=${name(x)} mine=${x === uid} speed=${s.speed === x} flip=${true} />
        <${Polaroid} src=${photos.get(pkey(d.id, s.rd, y))} label=${name(y)} mine=${y === uid} speed=${s.speed === y} flip=${true} />
      </div>
      ${!showRes && html`
        <${Say}>If you both vote for your own photo, <b>nobody</b> gets the +2 points!</${Say}>
        ${voted ? html`<p class="center pulse">Vote locked. Waiting for ${partnerName}…</p>` : html`
          <div class="two-btn"><button class="btn big-cta ok" onClick=${() => doAct({ t: 'vote', for: uid })}>Vote mine</button><button class="btn big-cta warn" onClick=${() => doAct({ t: 'vote', for: partner })}>Vote ${partnerName}’s</button></div>`}
        <${Clock} s=${s} now=${now} total=${22000} />`}
      ${showRes && html`<div class=${'reveal-card ' + (rr.k === 'stubborn' || rr.k === 'none' ? 'bad' : 'good')}><h2>${tell}</h2>
        <p class="small">${s.rd >= 3 ? 'That was the last round!' : 'Next round starting soon…'}</p></div>`}`;
  }
  return null;
}

// ---------- Kaun Bola? ----------
const CLIP_MS = 5000;
function pickMime() {
  const opts = ['video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'];
  return (window.MediaRecorder && opts.find((m) => MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(m))) || '';
}
const boxes = (words, shown) => words.map((w, i) => (shown.includes(i) ? w : '_'.repeat(Math.max(2, Math.min(w.length, 7))))).join('  ');

function Recorder({ onDone, home, d, s, name }) {
  const vid = useRef(); const mr = useRef(); const stream = useRef();
  const [st, setSt] = useState('idle'); const [left, setLeft] = useState(CLIP_MS / 1000);
  useEffect(() => () => { try { stream.current && stream.current.getTracks().forEach((t) => t.stop()); } catch (_) { /* done */ } }, []);
  const open = async () => {
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: 480, height: 360 }, audio: true });
      if (vid.current) { vid.current.srcObject = stream.current; vid.current.play().catch(() => {}); }
      setSt('ready');
    } catch (_) { fail(new Error('Allow camera and microphone to record. Or choose Same room mode.')); }
  };
  const rec = () => {
    const mime = pickMime();
    const chunksArr = [];
    try { mr.current = new MediaRecorder(stream.current, mime ? { mimeType: mime, videoBitsPerSecond: 350000 } : undefined); } catch (_) { fail(new Error('This phone cannot record here. Try Same room mode.')); return; }
    mr.current.ondataavailable = (e) => e.data && e.data.size && chunksArr.push(e.data);
    mr.current.onstop = async () => {
      setSt('sending');
      try {
        const type = mr.current.mimeType || mime || 'video/webm';
        const blob = new Blob(chunksArr, { type });
        const ext = type.includes('mp4') ? 'mp4' : 'webm';
        const path = `${home.couple.id}/${d.id}-${s.rd}.${ext}`;
        const { error } = await sb.storage.from('clips').upload(path, blob, { contentType: type.split(';')[0], upsert: true });
        if (error) throw error;
        onDone(path);
      } catch (e) { fail(e); setSt('ready'); }
    };
    mr.current.start(); setSt('rec'); setLeft(CLIP_MS / 1000);
    const t0 = Date.now();
    const iv = setInterval(() => setLeft(Math.max(0, Math.ceil((CLIP_MS - (Date.now() - t0)) / 1000))), 200);
    setTimeout(() => { clearInterval(iv); try { mr.current.state !== 'inactive' && mr.current.stop(); } catch (_) { /* stopped */ } }, CLIP_MS);
  };
  return html`
    <div class="rec-box">
      <video ref=${vid} muted playsinline class="rec-vid"></video>
      ${st === 'idle' && html`<button class="btn game big-cta" onClick=${open}>Turn on my camera 🎥</button>`}
      ${st === 'ready' && html`<button class="btn game big-cta" onClick=${rec}>Record 5 seconds ⏺️</button><p class="small muted center">Mouth the phrase while saying it out loud. ${name} will see it with no sound first.</p>`}
      ${st === 'rec' && html`<div class="rec-dot">● Recording… ${left}s</div>`}
      ${st === 'sending' && html`<p class="center pulse">Sending your clip…</p>`}
    </div>`;
}

function Clip({ s, reveal }) {
  const [url, setUrl] = useState(null);
  const v = useRef();
  const path = s.clip && s.clip.path;
  useEffect(() => {
    setUrl(null); if (!path) return;
    let dead = false;
    const get = (n) => sb.storage.from('clips').createSignedUrl(path, 240).then(({ data, error }) => { if (dead) return; if (data && data.signedUrl) setUrl(data.signedUrl); else if (n < 3) setTimeout(() => get(n + 1), 1200); else if (error) fail(error); });
    get(0); return () => { dead = true; };
  }, [path]);
  const hear = () => { if (v.current) { v.current.muted = false; v.current.currentTime = 0; v.current.play().catch(() => {}); } };
  useEffect(() => { if (reveal && v.current) { v.current.muted = false; v.current.currentTime = 0; v.current.play().catch(() => {}); } }, [reveal, url]);
  if (!path) return null;
  return html`
    <div class="clip-box">
      ${url ? html`<video ref=${v} src=${url} muted=${!reveal} autoplay loop playsinline class="clip-vid"></video>` : html`<div class="clip-vid wait">Loading the clip…</div>`}
      ${reveal && url && html`<button class="btn ghost" onClick=${hear}>🔊 Hear it</button>`}
    </div>`;
}

export function KaunBola({ s, r, uid, doAct, now, name, partnerName, d, home }) {
  const [own, setOwn] = useState(''); const [ownOpen, setOwnOpen] = useState(false);
  const [chosen, setChosen] = useState([]);
  useNow(250);
  useEffect(() => { setChosen([]); setOwn(''); setOwnOpen(false); }, [s.rd]);
  useEffect(() => { setChosen([]); }, [s.tries]);
  useEffect(() => { if (s.hint && s.ph === 'guess') buzz([60, 40, 60]); }, [s.hint]);
  // the speaker's phone removes the clip once its turn is over
  useEffect(() => {
    if (s.ph === 'reveal' && r.isA && s.clip) { const path = s.clip.path; const t = setTimeout(() => { sb.storage.from('clips').remove([path]).catch(() => {}); }, 7000); return () => clearTimeout(t); }
  }, [s.ph, s.rd]);
  const video = s.mode === 'video';
  const head = html`<div class="row between"><${Badge} level=${s.level} /><span class="small muted">Turn ${s.rd} of 4</span></div>`;
  const Mod = () => html`<div class="mod-badge">${s.mod}</div>`;

  if (s.ph === 'prep') return html`
    ${head}
    ${r.isA ? html`
      <${Say} you>Your phrase. Do not say it out loud yet!</${Say}>
      <div class="qcard phrase">${s.words.join(' ')}</div><${Mod} />
      ${ownOpen ? html`<form class="row" onSubmit=${(e) => { e.preventDefault(); if (own.trim()) { doAct({ t: 'own', text: own }); setOwn(''); setOwnOpen(false); } }}>
          <input class="input grow" maxlength="60" placeholder="Your own phrase, up to 6 words" value=${own} onInput=${(e) => setOwn(e.target.value)} /><button class="btn ghost" disabled=${!own.trim()}>Use</button></form>`
        : html`<button class="link" onClick=${() => setOwnOpen(true)}>✍️ Write my own phrase (max 6 words)</button>`}
      ${video ? html`<${Recorder} onDone=${(path) => doAct({ t: 'clip', path })} home=${home} d=${d} s=${s} name=${partnerName} />`
        : html`<button class="btn game big-cta" onClick=${() => doAct({ t: 'start' })}>Start 20s guessing timer</button><p class="small muted center">Then mouth the phrase to ${partnerName}. No sound!</p>`}`
      : html`<${Say}>${name(r.A)} is getting ready…</${Say}><div class="lobby-emo pulse center">👄</div>
        <p class="center muted">${video ? 'A short clip is coming. Watch their lips!' : 'Look right at their lips. No sound allowed!'}</p>`}`;

  if (s.ph === 'guess') {
    const shown = s.hint ? [0, ...(s.cracked || [])] : (s.cracked || []);
    return html`
      ${head}
      <${Clock} s=${s} now=${now} total=${20000} />
      <div class="word-boxes">[${s.words.length} words: ${boxes(s.words, r.isA ? s.words.map((_, i) => i) : shown)}]</div>
      ${s.hint && !r.isA && html`<${Say}>💡 Hint: the first word is <b>${s.words[0]}</b></${Say}>`}
      ${r.isA ? html`
        <${Mod} />
        ${video ? html`<${Say}>${partnerName} is watching your clip with the sound off…</${Say}>`
          : html`
          <${Say} you>Mouth it! Tap each word as ${partnerName} cracks it.</${Say}>
          <div class="word-toggles">${s.words.map((w, i) => html`<button class=${'wtog' + ((s.cracked || []).includes(i) ? ' on' : '')} onClick=${() => doAct({ t: 'tick', i })}>${w}</button>`)}</div>
          <button class="btn big-cta ok" onClick=${() => doAct({ t: 'all' })}>Cracked whole sentence! ✅</button>`}`
      : html`
        ${video ? html`
          <${Clip} s=${s} reveal=${false} />
          <div class="chosen">${chosen.length ? chosen.map((ci, i) => html`<button class="chip-w picked" onClick=${() => setChosen(chosen.filter((_, k) => k !== i))}>${s.chips[ci]}</button>`) : html`<span class="small muted">Tap the words in order</span>`}</div>
          <div class="chips">${s.chips.map((w, i) => html`<button class="chip-w" disabled=${chosen.includes(i)} onClick=${() => {
            const next = [...chosen, i]; setChosen(next); buzz(10);
            if (next.length === s.words.length) doAct({ t: 'submit', w: next.map((k) => s.chips[k]) });
          }}>${w}</button>`)}</div>
          ${s.tries > 0 && html`<p class="small center muted">Not quite. Try again! (${s.tries} ${s.tries === 1 ? 'try' : 'tries'})</p>`}`
        : html`<${Say} you>Watch ${name(r.A)}’s lips and shout your guess out loud!</${Say}><div class="lobby-emo pulse center">👀</div>`}`}`;
  }

  if (s.ph === 'reveal') {
    const ok = s.res && s.res.ok;
    return html`
      ${head}
      <div class=${'reveal-card ' + (ok ? 'good' : 'bad')}>
        <div style="font-size:52px">${ok ? '🎉' : '⏰'}</div>
        <h2>${ok ? `${name(r.B)} cracked it! +${s.res.pts}` : 'Time’s up!'}</h2>
        <p class="phrase-line">“${s.words.join(' ')}”</p>
      </div>
      ${video && html`<${Clip} s=${s} reveal=${true} />`}
      <p class="small center muted">${s.rd >= 4 ? 'That was the last turn!' : 'Swapping roles next…'}</p>`;
  }
  return null;
}

// ---------- Home: stakes waiting to be paid ----------
export function PendingStakes({ uid, go }) {
  const [b, setB] = useState(null);
  useEffect(() => { rpc('duel_board').then(setB).catch(() => {}); }, []);
  if (!b) return null;
  const open = b.recent.filter((x) => x.stake && x.loser && !x.paid_at);
  if (!open.length) return null;
  const mineOwed = open.filter((x) => x.loser === uid).length;
  return html`
    <div class="pend-wrap"><button class="pend-card" onClick=${go}>
      <span class="pend-emo">💝</span>
      <span class="grow"><b>${open.length} ${open.length === 1 ? 'stake is' : 'stakes are'} waiting</b>
        <span class="small">${open.slice(0, 2).map((x) => (x.loser === uid ? 'You: ' : 'Them: ') + x.stake).join(' · ')}</span>
        <span class="small muted">${mineOwed ? `${mineOwed} to pay` : 'Waiting for them to pay up'}</span></span>
      <span class="chip">Open</span>
    </button></div>`;
}
