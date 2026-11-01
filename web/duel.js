// Live two-phone duels: invites, the "loser has to…" wheel, the game room and results.
// The phone that starts a game is the host: it runs the rules (duel-engine.js) and sends the
// state to the partner's phone. The partner sends its moves back. Everything goes over live.js.
import { html, useState, useEffect, useRef } from 'https://esm.sh/htm@3.1.1/preact/standalone';
import { rpc, toast, fail, confetti, buzz, blip, Mark } from './lib.js';
import { send, onMessage, onPresence } from './live.js';
import { META, SYNC_HOW, HIDDEN, create, act, tick, role, TIMES } from './duel-engine.js';
import { STAKES } from './duel-content.js';
import { STAKES_BY_LEVEL } from './spice-content.js';
import { Sheet } from './hub.js';
import { uploadProof, ProofMedia } from './gift.js';
import { Capture, Chosen } from './recorder.js';
import { Quiz, Listen } from './ld-ui.js';
import { StageCard } from './stages.js';
import { isNew } from './spice-engine.js';
import { PreGame, CameraRoll, KaunBola, UnlockModal, loadProgress, getProgress, usedPrompts, checkUnlock } from './spice-ui.js';

// ---------- tiny store so any screen can start a duel ----------
let duel = null;
const subs = new Set();
const setDuel = (d) => { duel = d; subs.forEach((fn) => fn(d)); };
export const startDuel = (game) => setDuel({ id: crypto.randomUUID(), game, host: true, step: 'lobby' });
export function useDuel() {
  const [d, setD] = useState(duel);
  useEffect(() => { subs.add(setD); return () => subs.delete(setD); }, []);
  return d;
}
export function usePartnerOnline() {
  const [on, setOn] = useState(false);
  useEffect(() => onPresence(setOn), []);
  return on;
}

// ---------- the couple's own 8 spins (shared by both partners) ----------
let spins = null;
const spinSubs = new Set();
export const setSpins = (v) => { spins = Array.isArray(v) && v.length === 8 ? v : null; spinSubs.forEach((fn) => fn(spins)); };
export function useSpins() {
  const [v, setV] = useState(spins);
  useEffect(() => { spinSubs.add(setV); return () => spinSubs.delete(setV); }, []);
  return v;
}
const stakeList = (mine) => mine || STAKES;

const seenKey = (k) => `jodi_seen_${k}`;
function loadAvoid() {
  const out = {};
  for (const k of ['jhooth', 'draw', 'hotseat', 'slider', 'bolti', 'quiz', 'listen', 'scavenger']) { try { out[k] = JSON.parse(localStorage.getItem(seenKey(k)) || '[]'); } catch (_) { out[k] = []; } }
  return out;
}
function saveSeen(s) {
  for (const [k, v] of Object.entries(s.used || {})) {
    try { const old = JSON.parse(localStorage.getItem(seenKey(k)) || '[]'); localStorage.setItem(seenKey(k), JSON.stringify([...old, ...v].slice(-40))); } catch (_) { /* storage off */ }
  }
}

// ---------- the layer that sits over the app ----------
export function DuelLayer({ home, uid }) {
  const d = useDuel();
  const [invite, setInvite] = useState(null);
  const me = home.profile.name, partner = home.couple.partner_name;
  useEffect(() => { rpc('get_spins').then(setSpins).catch(() => {}); loadProgress(); }, [home.couple.id]);
  useEffect(() => onMessage((m) => {
    if (m.t === 'invite' && (!duel || (duel.step === 'lobby' && duel.host))) setInvite(m);
    if (m.t === 'cancel') setInvite((cur) => (cur && cur.id === m.id ? null : cur));
  }), []);
  // auto-hide stale invites
  useEffect(() => { if (!invite) return; const t = setTimeout(() => setInvite(null), 9000); return () => clearTimeout(t); }, [invite && invite.at]);

  const accept = () => {
    const inv = invite; setInvite(null); buzz(30);
    send({ t: 'accept', id: inv.id, by: uid });
    setDuel({ id: inv.id, game: inv.game, host: false, step: 'room', stake: inv.stake, partnerId: inv.from, level: inv.level, mode: inv.mode });
  };
  const decline = () => { send({ t: 'decline', id: invite.id }); setInvite(null); };

  return html`
    ${invite && html`
      <div class="invite-pop" role="dialog" aria-label="Game invite">
        <span class="inv-emo">${META[invite.game].emo}</span>
        <div class="grow"><b>${partner} wants to play ${META[invite.game].name}!</b>
          ${isNew(invite.game) && invite.level > 1 && html`<span class="small">${invite.level === 2 ? '🌶️ Teekha' : '🔥 Jwalamukhi'} mode</span>`}
          ${invite.stake && html`<span class="small">Loser has to: ${invite.stake}</span>`}</div>
        <div class="inv-btns"><button class="btn" onClick=${accept}>Join</button><button class="link" onClick=${decline}>Not now</button></div>
      </div>`}
    ${d && html`<div class="duel-screen">${d.step === 'lobby' ? (isNew(d.game) ? html`<${PreGameHost} d=${d} uid=${uid} me=${me} partner=${partner} />` : html`<${Lobby} d=${d} uid=${uid} me=${me} partner=${partner} />`) : html`<${Room} d=${d} uid=${uid} home=${home} />`}</div>`}
    <${UnlockModal} />`;
}

// the setup screen for the two spice games lives in spice-ui.js; this hands it the wheel and the stage
function PreGameHost({ d, uid, me, partner }) {
  const online = usePartnerOnline();
  const mine = useSpins();
  return html`<${PreGame} d=${d} uid=${uid} me=${me} partner=${partner} online=${online} Wheel=${Wheel} nextSpin=${nextSpin} mineSpins=${mine} setDuel=${setDuel} />`;
}

// ---------- the wheel (used in the lobby and the spin editor) ----------
const WHEEL_BG = 'conic-gradient(#FDA4AF 0 45deg,#FDE68A 45deg 90deg,#A7F3D0 90deg 135deg,#BAE6FD 135deg 180deg,#C4B5FD 180deg 225deg,#FBCFE8 225deg 270deg,#FED7AA 270deg 315deg,#D9F99D 315deg 360deg)';
function Wheel({ items, spin }) {
  const N = items.length;
  const label = (t, i) => { const last = t.split(' ').slice(-1)[0]; return /\p{Extended_Pictographic}/u.test(last) ? last : String(i + 1); };
  return html`<div class="wheel-wrap"><div class="wheel-pin">▼</div>
    <div class="wheel" style=${`transform:rotate(${spin}deg);background:${WHEEL_BG}`}>${items.map((t, i) => html`<span style=${`transform:rotate(${(i * 360) / N + 180 / N}deg)`}><i>${label(t, i)}</i></span>`)}</div></div>`;
}
// spin maths shared by lobby and editor: returns the picked index and the new rotation
function nextSpin(prev, N) {
  const i = Math.floor(Math.random() * N);
  return [i, prev + 1440 + (360 - (i * 360) / N - 180 / N) - (prev % 360)];
}

// ---------- lobby: spin the stake, invite the partner ----------
function Lobby({ d, uid, me, partner }) {
  const online = usePartnerOnline();
  const [stake, setStake] = useState(null);
  const [spin, setSpin] = useState(0);
  const [custom, setCustom] = useState('');
  const [inviting, setInviting] = useState(false);
  const [declined, setDeclined] = useState(false);
  const g = META[d.game];
  const mine = useSpins();
  const list = stakeList(mine);

  const doSpin = () => {
    const [i, rot] = nextSpin(spin, list.length);
    setStake(null); setSpin(rot);
    buzz(20);
    setTimeout(() => { setStake(list[i]); buzz(40); }, 2300);
  };
  useEffect(() => {
    if (!inviting) return;
    const msg = { t: 'invite', id: d.id, game: d.game, stake: stake || '', from: uid };
    send({ ...msg, at: Date.now() });
    const t = setInterval(() => send({ ...msg, at: Date.now() }), 2500);
    const off = onMessage((m) => {
      if (m.id !== d.id) return;
      if (m.t === 'accept') { clearInterval(t); buzz(40); setDuel({ ...d, step: 'room', stake: stake || '', partnerId: m.by }); }
      if (m.t === 'decline') { setDeclined(true); setInviting(false); }
    });
    return () => { clearInterval(t); off(); };
  }, [inviting]);
  const close = () => { if (inviting) send({ t: 'cancel', id: d.id }); setDuel(null); };
  const link = `${location.origin}/?play=1`;

  return html`
    <div class="stack-lg duel-lobby" style=${`--g:${g.color};--g-soft:${g.soft}`}>
      <div class="row between"><button class="back" onClick=${close} aria-label="Close">✕</button><span class=${'online-pill' + (online ? ' on' : '')}>${online ? `🟢 ${partner} is here` : `⚪ ${partner} is not in the app`}</span></div>
      <div class="center stack"><div class="lobby-emo">${g.emo}</div><h1>${g.name}</h1><p class="muted">${g.sub}</p></div>
      <ol class="how">${g.how.map((h) => html`<li>${h}</li>`)}</ol>
      <p class="sync-hint">💞 <b>Sync points:</b> ${SYNC_HOW[d.game]}</p>
      <p class="sync-hint">🎡 The winner spins the wheel after the game to decide what the loser has to do.</p>
      ${inviting ? html`
        <div class="panel stack center">
          <p class="pulse"><b>Waiting for ${partner} to join…</b></p>
          ${!online && html`<p class="small muted">${partner} needs to open Jugalbandi on their phone.</p>
            <a class="btn" style="text-decoration:none" href=${`https://wa.me/?text=${encodeURIComponent(`${me} wants to play ${g.name} with you on Jugalbandi 🎮 Open it now: ${link}`)}`} target="_blank" rel="noopener">Call them on WhatsApp</a>`}
          <button class="link" onClick=${() => { send({ t: 'cancel', id: d.id }); setInviting(false); }}>Cancel</button>
        </div>` : html`
        ${declined && html`<p class="small center muted">${partner} said not now. Try again in a bit.</p>`}
        <button class="btn game big-cta" onClick=${() => { setDeclined(false); setInviting(true); }}>Invite ${partner} to play</button>`}
    </div>`;
}

// ---------- the room: shared state, host runs the rules ----------
function Room({ d, uid, home }) {
  const [s, setS] = useState(null);
  const [left, setLeft] = useState(false);
  const sRef = useRef(null);
  const skew = useRef(0);
  const partnerName = home.couple.partner_name, myName = home.profile.name;
  const saved = useRef(false);
  const g = META[d.game];

  const publish = (ns) => { sRef.current = ns; setS(ns); send({ t: 'state', id: d.id, s: ns, hnow: Date.now() }); };
  const begin = (first = Math.random() < 0.5 ? 0 : 1) => {
    saved.current = false;
    publish(create(d.game, [uid, d.partnerId], { names: { [uid]: myName, [d.partnerId]: partnerName }, seed: (Math.random() * 2 ** 32) >>> 0, stake: d.stake, first, avoid: loadAvoid(), level: d.level, mode: d.mode, customs: sRef.current ? [] : d.customs, used: [...usedPrompts(), ...((sRef.current && sRef.current.newIds) || [])] }));
  };

  useEffect(() => {
    const off = onMessage((m) => {
      if (m.id !== d.id) return;
      if (m.t === 'leave') { setLeft(true); return; }
      if (d.host) {
        if (m.t === 'act' && sRef.current) {
          if (m.a && m.a.t === 'rematch' && sRef.current.over) { begin(sRef.current.a); return; }
          const ns = act(sRef.current, m.by, m.a, Date.now());
          if (ns !== sRef.current) publish(ns);
        }
        if (m.t === 'sync' && sRef.current) send({ t: 'state', id: d.id, s: sRef.current, hnow: Date.now() });
      } else if (m.t === 'state') {
        skew.current = Date.now() - m.hnow;
        sRef.current = m.s; setS(m.s);
      }
    });
    let loop, beat, ask;
    if (d.host) {
      begin();
      loop = setInterval(() => { const cur = sRef.current; if (!cur) return; const ns = tick(cur, Date.now()); if (ns !== cur) publish(ns); }, 80);
      beat = setInterval(() => sRef.current && send({ t: 'state', id: d.id, s: sRef.current, hnow: Date.now() }), 2000);
    } else {
      ask = setInterval(() => { if (!sRef.current) send({ t: 'sync', id: d.id }); else clearInterval(ask); }, 1200);
    }
    return () => { off(); clearInterval(loop); clearInterval(beat); clearInterval(ask); };
  }, []);

  // save the result once, on the host
  useEffect(() => {
    if (!s || !s.over || saved.current) return;
    saved.current = true;
    saveSeen(s);
    if (s.win === uid) confetti();
    const before = isNew(s.game) ? ((getProgress() && getProgress().by_game && getProgress().by_game[s.game]) || 0) : 0;
    if (d.host) {
      rpc('record_duel_sync', { p_game: s.game, p_winner: s.win, p_scores: s.sc, p_stake: s.win ? s.stake : '', p_sync: s.sync || 0 }).catch(() => {});
      if (isNew(s.game) && s.newIds && s.newIds.length) rpc('save_used_prompts', { p_ids: s.newIds, p_reset: s.reset || null }).catch(() => {});
    }
    if (isNew(s.game)) setTimeout(() => checkUnlock(s.game, before), 2200);
  }, [s && s.over]);

  // the host stores the stake once the winner's spin lands
  useEffect(() => {
    if (d.host && s && s.over && s.spin && s.spin.text) rpc('set_duel_stake', { p_stake: s.spin.text }).catch(() => {});
  }, [s && s.spin && s.spin.text]);

  const doAct = (a) => {
    buzz(15);
    if (d.host) { const ns = act(sRef.current, uid, a, Date.now()); if (ns !== sRef.current) publish(ns); }
    else send({ t: 'act', id: d.id, by: uid, a });
  };
  const quit = () => {
    if (s && !s.over && !confirm('Leave this game? It won’t count.')) return;
    send({ t: 'leave', id: d.id }); setDuel(null);
  };
  const now = () => Date.now() - skew.current; // host clock
  const name = (id) => (id === uid ? 'You' : partnerName);

  if (left) return html`
    <div class="stack-lg center" style="padding-top:20vh"><div style="font-size:64px">🚪</div><h2>${partnerName} left the game</h2>
      <button class="btn" onClick=${() => setDuel(null)}>Back to games</button></div>`;
  if (!s) return html`<div class="stack-lg center" style="padding-top:25vh"><div class="lobby-emo pulse">${g.emo}</div><p class="muted">Connecting with ${partnerName}…</p><button class="link" onClick=${quit}>Cancel</button></div>`;

  const r = role(s, uid);
  const rematch = () => (d.host ? begin(s.a) : send({ t: 'act', id: d.id, by: uid, a: { t: 'rematch' } }));
  const P = { s, r, uid, doAct, now, name, partnerName, d, skew, rematch, home };
  return html`
    <div class="room stack" style=${`--g:${g.color};--g-soft:${g.soft}`}>
      <div class="room-top">
        <button class="back" onClick=${quit} aria-label="Leave">✕</button>
        <div class="score-pill"><span class=${r.me === s.p[0] ? 'mine' : ''}>${name(s.p[0])} <b>${s.sc[s.p[0]]}</b></span><span class="vs">${g.emo}</span><span class=${r.me === s.p[1] ? 'mine' : ''}><b>${s.sc[s.p[1]]}</b> ${name(s.p[1])}</span></div>
      </div>
      ${s.stake && !s.over && html`<p class="stake-line">Loser has to: <b>${s.stake}</b></p>`}
      ${s.game !== 'momo' && s.game !== 'quiz' && !s.over && s.ph !== 'intro' && s.ph !== 'go' && html`<p class="sync-line">💞 Jodi Sync <b>${s.sync}</b>${s.ph === 'reveal' && s.gain > 0 ? html` <span class="sync-gain" key=${s.rd + '-' + s.gain}>+${s.gain}</span>` : ''}</p>`}
      ${s.ph === 'intro' ? html`<${Intro} ...${P} />` : s.ph === 'go' ? html`<${Countdown} ...${P} />` : s.over ? html`<${Over} ...${P} />` : html`<${GAMES[s.game]} ...${P} />`}
    </div>`;
}

// ---------- shared bits ----------
function useNow(ms = 100) {
  const [, set] = useState(0);
  useEffect(() => { const t = setInterval(() => set((x) => x + 1), ms); return () => clearInterval(t); }, []);
}
function Timer({ s, now, total }) {
  useNow(100);
  if (!s.dl) return null;
  const left = Math.max(0, s.dl - now());
  return html`<div class="tbar"><i style=${`width:${Math.min(100, (left / total) * 100)}%`}></i><b>${Math.ceil(left / 1000)}s</b></div>`;
}
const Say = ({ you, children }) => html`<div class=${'say' + (you ? ' you' : '')}>${you ? '👉 ' : '⏳ '}${children}</div>`;

function Intro({ s, r, doAct, partnerName }) {
  const g = META[s.game];
  const ready = s.ready.includes(r.me), theyReady = s.ready.includes(r.partner);
  return html`
    <div class="stack-lg center">
      <div class="lobby-emo">${g.emo}</div><h2>${g.name}</h2>
      <ol class="how">${g.how.map((h) => html`<li>${h}</li>`)}</ol>
      ${ready ? html`<p class="pulse muted">${theyReady ? 'Starting…' : `Waiting for ${partnerName} to tap Ready…`}</p>` : html`<button class="btn game big-cta" onClick=${() => doAct({ t: 'ready' })}>I’m ready!</button>`}
      ${theyReady && !ready && html`<p class="small muted">${partnerName} is ready 🟢</p>`}
    </div>`;
}
function Countdown({ s, now }) {
  useNow(100);
  const n = Math.max(1, Math.ceil((s.dl - now()) / 1000));
  useEffect(() => { blip(n === 1 ? 880 : 660); buzz(20); }, [n]);
  return html`<div class="count-big" key=${n}>${n}</div>`;
}

// the "loser has to…" spin lives here, on the result page. The winner spins; the spin and its result are in the shared state, so both phones see it.
function StakeSpin({ s, uid, doAct, d, partnerName }) {
  const mine = useSpins();
  const [rot, setRot] = useState(0);
  const [shown, setShown] = useState(null);
  const [custom, setCustom] = useState('');
  const [busy, setBusy] = useState(false);
  const list = mine || (isNew(s.game) ? STAKES_BY_LEVEL[d.level || 1] : STAKES);
  const iWon = s.win === uid;
  useEffect(() => {
    if (!s.spin) return;
    if (s.spin.custom) { setShown(s.spin.text); return; }
    setRot(s.spin.rot); buzz(20);
    const t = setTimeout(() => { setShown(s.spin.text); buzz(40); if (s.win !== uid) confetti(); }, 2300);
    return () => clearTimeout(t);
  }, [s.spin && s.spin.text]);
  const spin = () => { setBusy(true); const [i, r] = nextSpin(0, list.length); doAct({ t: 'spin', rot: r, text: list[i] }); };
  const useCustom = () => { setBusy(true); doAct({ t: 'spin', rot: 0, text: custom.trim(), custom: true }); };
  const loserName = iWon ? partnerName : 'You';
  return html`
    <section class="panel stack center">
      <h3>${s.spin ? 'The deal' : 'Loser has to…'}</h3>
      <${Wheel} items=${list} spin=${rot} />
      ${shown
        ? html`<p class="stake-result">${shown}</p><p class="small muted">${loserName === 'You' ? 'You have' : `${loserName} has`} to do this. Do it, then attach a photo or video in the Stakes tab.</p>`
        : s.spin ? html`<p class="pulse muted small">Spinning…</p>`
        : iWon ? html`
            <p class="muted small">You won! Spin to decide what ${partnerName} has to do.</p>
            <button class="btn game big-cta" onClick=${spin} disabled=${busy}>🎡 Spin</button>
            <div class="row"><input class="input grow" maxlength="60" placeholder="Or write your own" value=${custom} onInput=${(e) => setCustom(e.target.value)} /><button class="btn ghost" disabled=${!custom.trim() || busy} onClick=${useCustom}>Use</button></div>`
        : html`<p class="pulse muted small">${partnerName} won. Waiting for them to spin…</p>`}
    </section>`;
}

function Over({ s, uid, name, partnerName, d, rematch, doAct }) {
  const won = s.win === uid, tie = !s.win;
  return html`
    <div class="stack-lg center">
      <div style="font-size:72px">${tie ? '🤝' : won ? '🏆' : '😅'}</div>
      <h1>${tie ? 'It’s a tie!' : won ? 'You win!' : `${partnerName} wins!`}</h1>
      <p class="big-score">${s.sc[s.p[0]]} – ${s.sc[s.p[1]]}</p>
      ${s.game === 'draw' && html`<p class="small muted">Drawing time: ${name(s.p[0])} ${Math.round(s.time[s.p[0]] / 1000)}s · ${name(s.p[1])} ${Math.round(s.time[s.p[1]] / 1000)}s</p>`}
      ${s.game !== 'momo' && s.game !== 'quiz' && html`<div class="sync-card"><span class="small">You two know each other</span><b>💞 +${s.sync} Sync points</b><span class="small muted">${s.sync > 0 ? 'Added to your jodi total. See the Sync tab.' : 'Read each other better next round!'}</span></div>`}
      ${!tie && html`<${StakeSpin} s=${s} uid=${uid} doAct=${doAct} d=${d} partnerName=${partnerName} />`}
      <button class="btn game big-cta" onClick=${rematch}>Rematch 🔁</button>
      <button class="btn ghost" onClick=${() => { send({ t: 'leave', id: d.id }); setDuel(null); }}>Back to games</button>
    </div>`;
}

// ---------- 1. Jhooth Pakdo ----------
function Jhooth({ s, r, doAct, now, name, partnerName }) {
  const A = name(r.A);
  if (s.ph === 'choose') return r.isA ? html`
    <${Say} you>Read this question. Decide secretly: will you tell the truth or bluff?</${Say}>
    <div class="qcard">${s.q}</div>
    <div class="two-btn"><button class="btn big-cta ok" onClick=${() => doAct({ t: 'truth' })}>Tell the truth</button><button class="btn big-cta warn" onClick=${() => doAct({ t: 'bluff' })}>Bluff 😏</button></div>
    <p class="small muted center">${partnerName} can’t see what you pick.</p>` : html`
    <${Say}>${A} is reading a question and deciding to lie or not…</${Say}>
    <div class="qcard">${s.q}</div><p class="center muted">Watch their face 👀</p>`;
  if (s.ph === 'speak') return r.isA ? html`
    <${Say} you>Now answer out loud${s.secret === 'bluff' ? ' with a convincing lie' : ' honestly'}. Tap the button when you’re done.</${Say}>
    <div class="qcard">${s.q}</div><p class="center small muted">You chose: ${s.secret === 'bluff' ? 'Bluff 😏' : 'Truth'}</p>
    <button class="btn big-cta game" onClick=${() => doAct({ t: 'spoken' })}>I’ve answered. Judge me!</button>` : html`
    <${Say}>${A} is answering out loud. Listen carefully…</${Say}><div class="qcard">${s.q}</div>`;
  if (s.ph === 'judge') return r.isA ? html`
    <${Say}>${partnerName} is deciding. Keep a straight face 😐</${Say}><${Timer} s=${s} now=${now} total=${TIMES.judge} />` : html`
    <${Say} you>Was ${A} telling the truth? Ask questions, stare them down, then decide.</${Say}>
    <${Timer} s=${s} now=${now} total=${TIMES.judge} />
    <div class="two-btn"><button class="btn big-cta ok" onClick=${() => doAct({ t: 'sach' })}>Sach ✅</button><button class="btn big-cta warn" onClick=${() => doAct({ t: 'jhooth' })}>Jhooth 🚨</button></div>`;
  if (s.ph === 'reveal') { const v = s.verdict; return html`
    <div class="reveal-card ${v.right ? 'good' : 'bad'}">
      <div style="font-size:56px">${v.secret === 'bluff' ? '🤥' : '😇'}</div>
      <h2>It was ${v.secret === 'bluff' ? 'a BLUFF' : 'the TRUTH'}!</h2>
      <p>${v.call === null ? `Time ran out. Point to ${A}.` : v.right ? `${name(r.B)} caught it. Point!` : `${A} fooled them. Point!`}</p></div>`; }
  return null;
}

// ---------- 2. Draw It Badly ----------
const INK = ['#1f1424', '#E11D5A', '#2563EB'];
function Draw({ s, r, d, doAct, now, name, partnerName, skew }) {
  const cv = useRef(); const buf = useRef([]); const last = useRef(null); const down = useRef(false);
  const [color, setColor] = useState(0); const [guess, setGuess] = useState('');
  const drawing = s.ph === 'draw' && r.isA && now() < s.t0 + TIMES.draw;
  useNow(200);
  const ctx = () => cv.current && cv.current.getContext('2d');
  const line = (pts, c) => {
    const x = ctx(); if (!x || pts.length < 1) return;
    const W = cv.current.width, H = cv.current.height;
    x.strokeStyle = INK[c] || INK[0]; x.lineWidth = W / 90; x.lineCap = 'round'; x.lineJoin = 'round';
    x.beginPath(); x.moveTo(pts[0][0] * W, pts[0][1] * H); for (const [px, py] of pts.slice(1)) x.lineTo(px * W, py * H);
    if (pts.length === 1) x.lineTo(pts[0][0] * W + 0.1, pts[0][1] * H);
    x.stroke();
  };
  // clear for each new drawing
  useEffect(() => { const x = ctx(); if (x) { x.fillStyle = '#fff'; x.fillRect(0, 0, cv.current.width, cv.current.height); } last.current = null; }, [s.rd, s.ph === 'pick']);
  // receive strokes from the drawer
  useEffect(() => onMessage((m) => { if (m.t === 'ink' && m.id === d.id && m.rd === s.rd) line(m.pts, m.c); }), [s.rd]);
  // send strokes in small batches
  useEffect(() => { if (!r.isA) return; const t = setInterval(() => { if (buf.current.length) { send({ t: 'ink', id: d.id, rd: s.rd, pts: buf.current, c: color }); buf.current = buf.current.slice(-1); if (!down.current) buf.current = []; } }, 60); return () => clearInterval(t); }, [s.rd, color, r.isA]);
  const pos = (e) => { const b = cv.current.getBoundingClientRect(); const p = e.touches ? e.touches[0] : e; return [Math.round(((p.clientX - b.left) / b.width) * 1000) / 1000, Math.round(((p.clientY - b.top) / b.height) * 1000) / 1000]; };
  const start = (e) => { if (!drawing) return; e.preventDefault(); down.current = true; const p = pos(e); last.current = p; buf.current = [p]; line([p], color); };
  const move = (e) => { if (!drawing || !down.current) return; e.preventDefault(); const p = pos(e); line([last.current, p], color); last.current = p; buf.current.push(p); };
  const end = () => { down.current = false; };
  void skew;

  const submit = (e) => { e.preventDefault(); if (!guess.trim()) return; doAct({ t: 'guess', text: guess.trim() }); setGuess(''); };
  if (s.ph === 'pick') return r.isA ? html`
    <${Say} you>Pick what you want to draw. ${partnerName} won’t see the word.</${Say}>
    <div class="stack">${s.choices.map((c, i) => html`<button class="btn ghost big-cta" onClick=${() => doAct({ t: 'word', i })}>${c}</button>`)}</div>` : html`
    <${Say}>${name(r.A)} is choosing what to draw…</${Say}><div class="lobby-emo pulse center">✏️</div>`;
  const drawLeft = Math.max(0, Math.ceil((s.t0 + TIMES.draw - now()) / 1000));
  return html`
    ${s.ph === 'draw' && (r.isA
      ? html`<${Say} you>Draw <b>${s.word}</b>! ${drawLeft > 0 ? `${drawLeft}s of drawing left.` : 'Pens down. They can still guess!'}</${Say}>`
      : html`<${Say} you>What is ${name(r.A)} drawing? Type your guess or shout it.</${Say}>`)}
    ${s.ph === 'reveal' && html`<div class="reveal-card ${s.guessed ? 'good' : 'bad'}"><h2>${s.guessed ? 'Guessed it! 🎉' : 'Time’s up!'}</h2><p>It was <b>${s.word}</b></p></div>`}
    <${Timer} s=${s} now=${now} total=${TIMES.draw + TIMES.guessExtra} />
    <canvas ref=${cv} width="600" height="600" class=${'dpad' + (drawing ? ' live' : '')}
      onMouseDown=${start} onMouseMove=${move} onMouseUp=${end} onMouseLeave=${end}
      onTouchStart=${start} onTouchMove=${move} onTouchEnd=${end}></canvas>
    ${s.ph === 'draw' && r.isA && html`
      <div class="row between"><div class="row">${INK.map((c, i) => html`<button class=${'ink' + (color === i ? ' on' : '')} style=${`background:${c}`} onClick=${() => setColor(i)} aria-label="Colour"></button>`)}</div>
        <button class="btn ghost" onClick=${() => doAct({ t: 'got' })}>They said it ✅</button></div>
      ${s.guesses.length > 0 && html`<p class="small muted">Guesses: ${s.guesses.join(' · ')}</p>`}`}
    ${s.ph === 'draw' && !r.isA && html`
      <form class="row" onSubmit=${submit}><input class="input grow" maxlength="40" autocomplete="off" placeholder="Your guess" value=${guess} onInput=${(e) => setGuess(e.target.value)} /><button class="btn">Guess</button></form>
      ${s.guesses.length > 0 && html`<p class="small muted">Tried: ${s.guesses.join(' · ')}</p>`}`}`;
}

// ---------- 3. Steal the Momo ----------
function Momo({ s, r, doAct, name, partnerName, skew }) {
  useNow(60);
  const it = s.item;
  const [msg, setMsg] = useState('');
  const sent = useRef(0);
  const localReveal = it ? it.revealAt + skew.current : 0;
  const visible = it && Date.now() >= localReveal;
  const snatch = () => {
    if (!it || it.taken) return;
    if (!visible) { setMsg('Too early! 😅'); buzz(60); return; }
    if (sent.current === it.id) return;
    sent.current = it.id;
    doAct({ t: 'snatch', id: it.id, rt: Date.now() - localReveal });
  };
  useEffect(() => { if (it && it.taken) { const mine = it.taken === r.me; setMsg(`${mine ? 'You' : partnerName} grabbed ${it.label} ${it.good ? '+1' : '−2'}`); buzz(mine ? (it.good ? 25 : 120) : 10); } }, [it && it.taken]);
  return html`
    <${Say} you>Tap SNATCH for good stuff. Leave the traps! First to 5.</${Say}>
    <div class="table">
      <div class=${'plate' + (it && !visible ? ' shake' : '') + (it && it.taken ? ' gone' : '')}>
        ${it && visible ? html`<span class="mitem" key=${it.id}>${it.e}</span>` : it ? html`<span class="mitem q">❔</span>` : html`<span class="mitem empty">🍽️</span>`}
      </div>
      ${it && visible && html`<p class=${'item-label ' + (it.good ? 'good' : 'bad')}>${it.label}${it.good ? '' : ' (trap!)'}</p>`}
    </div>
    <p class="center small muted momo-msg">${msg}</p>
    <button class="btn snatch" onPointerDown=${snatch}>SNATCH 👋</button>
    <div class="mfeed">${s.feed.map((f) => html`<span class=${f.good ? 'good' : 'bad'}>${f.e} ${name(f.who)}</span>`)}</div>`;
}

// ---------- 4. Hot Seat ----------
function HotSeat({ s, r, doAct, now, name }) {
  useNow(100);
  if (s.ph === 'read') return r.isA ? html`
    <${Say} you>Read this out loud to ${name(r.B)}, then hit Start.</${Say}>
    <div class="qcard">${s.q}</div>
    <button class="btn big-cta warn" onClick=${() => doAct({ t: 'start' })}>START 5s TIMER 💣</button>` : html`
    <${Say}>Listen! ${name(r.A)} is reading your question. Get ready to shout 3 answers.</${Say}><div class="lobby-emo pulse center">👂</div>`;
  if (s.ph === 'timer' || s.ph === 'verdict') {
    const left = s.dl ? Math.max(0, (s.dl - now()) / 1000) : 0;
    return html`
      <div class="qcard small-q">${s.q}</div>
      <div class=${'bomb' + (left < 2 ? ' hot' : '')}>${s.ph === 'timer' ? left.toFixed(1) : '0.0'}</div>
      ${r.isA ? html`<${Say} you>Did ${name(r.B)} name 3 good answers?</${Say}>
        <div class="two-btn"><button class="btn big-cta ok" onClick=${() => doAct({ t: 'pass' })}>Pass ✅</button><button class="btn big-cta warn" onClick=${() => doAct({ t: 'choke' })}>Choked ❌</button></div>`
        : html`<${Say} you>GO GO GO! Shout 3 answers!</${Say}>`}`;
  }
  if (s.ph === 'reveal') return html`<div class="reveal-card ${s.result === 'pass' ? 'good' : 'bad'}"><div style="font-size:56px">${s.result === 'pass' ? '😎' : '🥶'}</div><h2>${s.result === 'pass' ? `${name(r.B)} survived!` : `${name(r.B)} choked!`}</h2></div>`;
  return null;
}

// ---------- 5. Mere Hisaab Se ----------
function Slider({ s, r, doAct, name }) {
  const [v, setV] = useState(50);
  useEffect(() => setV(50), [s.rd]);
  const subj = r.A, mineIn = s.vals && r.me in s.vals;
  if (s.ph === 'slide') return html`
    <div class="qcard">${s.q}</div>
    ${r.isA ? html`<${Say} you>${name(r.B)} is secretly rating you. Guess the number they’ll pick!</${Say}>`
      : html`<${Say} you>Rate ${name(subj)} honestly from 0 to 100. They’ll try to guess it.</${Say}>`}
    ${mineIn ? html`<p class="center pulse">Locked in at <b>${s.vals[r.me]}</b>. Waiting for ${name(r.partner)}…</p>` : html`
      <div class="slider-num">${v}</div>
      <input type="range" min="0" max="100" value=${v} class="big-range" onInput=${(e) => setV(+e.target.value)} aria-label="Your number" />
      <button class="btn big-cta game" onClick=${() => doAct({ t: 'val', v })}>Lock in ${v}</button>`}`;
  if (s.ph === 'reveal') {
    const rating = s.vals[r.B], guess = s.vals[r.A];
    return html`
      <div class="qcard small-q">${s.q}</div>
      <div class="reveal-card ${s.hit ? 'good' : 'bad'}">
        <div class="slide-reveal"><div><span class="small">${name(r.B)} rated</span><b>${rating}</b></div><div><span class="small">${name(r.A)} guessed</span><b>${guess}</b></div></div>
        <h2>${s.hit ? 'Bullseye! 🎯' : `Off by ${s.gap} 😬`}</h2>
        <p class="small">${guess > rating + 10 ? `${name(r.A)} thinks too highly of themselves 😂` : guess < rating - 10 ? `${name(r.A)} underestimated your love 🥺` : 'You two are in sync.'}</p>
      </div>
      <button class="btn big-cta game" onClick=${() => doAct({ t: 'next' })}>Next question</button>`;
  }
  return null;
}

// ---------- 6. Bolti Bandh ----------
function Bolti({ s, r, doAct, now, name }) {
  useNow(150);
  const [flash, setFlash] = useState(false);
  useEffect(() => { if (s.caught) { setFlash(true); buzz(150); const t = setTimeout(() => setFlash(false), 900); return () => clearTimeout(t); } }, [s.caught]);
  if (s.ph === 'ready') return r.isA ? html`
    <${Say} you>Your turn to give clues for 60 seconds. Don’t say the word or the banned words!</${Say}>
    <button class="btn big-cta game" onClick=${() => doAct({ t: 'start' })}>Start my 60 seconds</button>` : html`
    <${Say}>${name(r.A)} will give you clues. Shout the word when you get it!</${Say}><div class="lobby-emo pulse center">🤐</div>`;
  if (s.ph === 'play') return html`
    <${Timer} s=${s} now=${now} total=${TIMES.bolti} />
    ${flash && html`<div class="caught-flash">CAUGHT! 🚨 −1</div>`}
    ${r.isA ? html`
      <div class="taboo"><b>${s.word[0]}</b><div class="banned">${s.word.slice(1).map((w) => html`<span>🚫 ${w}</span>`)}</div></div>
      <div class="two-btn"><button class="btn big-cta ok" onClick=${() => doAct({ t: 'got' })}>They said it ✅</button><button class="btn big-cta ghost" onClick=${() => doAct({ t: 'skip' })}>Skip ⏭️</button></div>
      <p class="center">Words: <b>${s.words}</b></p>` : html`
      <${Say} you>Guess the word from ${name(r.A)}’s clues. If they say a banned word or act it out, hit the red button!</${Say}>
      <p class="center big-score">${s.words}</p><p class="center small muted">words so far</p>
      <button class="btn caught" onClick=${() => doAct({ t: 'caught' })}>CAUGHT YOU! 🚨</button>`}`;
  if (s.ph === 'reveal') return html`
    <div class="reveal-card good"><h2>${name(r.A)} got ${s.sc[r.A]} ${s.sc[r.A] === 1 ? 'point' : 'points'}</h2>
      <div class="log">${s.log.map(([e, w]) => html`<span>${e} ${w}</span>`)}</div></div>`;
  return null;
}

const GAMES = { jhooth: Jhooth, draw: Draw, momo: Momo, hotseat: HotSeat, slider: Slider, bolti: Bolti, camera: CameraRoll, kaunbola: KaunBola, quiz: Quiz, listen: Listen, scavenger: CameraRoll };

// ---------- the Play tab ----------
export function PlayScreen({ home, toStakes, toMe }) {
  const online = usePartnerOnline();
  const mineSpins = useSpins();
  const [editing, setEditing] = useState(false);
  const [board, setBoard] = useState(null);
  const partner = home.couple.partner_name;
  const guestLocked = home.couple.guest_locked;
  const free = ['jhooth', 'momo'];
  useEffect(() => { rpc('duel_board').then(setBoard).catch(() => {}); }, []);
  const go = (k) => {
    if (guestLocked && !free.includes(k)) { toast(home.couple.me_guest ? 'Save your account to unlock this game' : `${partner} is a guest. Ask them to save their account.`); if (home.couple.me_guest) toMe(); return; }
    startDuel(k);
  };
  const owed = board ? board.recent.filter((x) => x.stake && x.loser && !x.paid_at) : [];
  return html`
    <div class="stack screen play-screen">
      <div class="row between">
        <div><h1 style="font-size:28px">Play 🎮</h1><p class="small muted">Both phones, same time. Just you two.</p></div>
        <span class=${'online-pill' + (online ? ' on' : '')}>${online ? `🟢 ${partner} is here` : `⚪ ${partner} away`}</span>
      </div>
      <button class=${'spin-card' + (mineSpins ? ' done' : '')} onClick=${() => setEditing(true)}>
        <span class="spin-emo">🎡</span>
        <span class="grow"><b>${mineSpins ? 'Our spins are ready ✓' : 'Add your spins'}</b>
          <span class="small">${mineSpins ? 'Whoever loses a game gets one of your 8 spins. Tap to edit.' : 'Write 8 real-life things the loser has to do, like fetching water or a massage. They replace the default spin in every game.'}</span></span>
        <span class="chip">${mineSpins ? 'Edit' : 'Add'}</span>
      </button>
      ${board && html`<button class="tally" onClick=${toStakes}><span>You <b>${board.my_wins}</b></span><span class="small muted">${owed.length ? `${owed.length} stake${owed.length > 1 ? 's' : ''} pending` : 'All stakes paid'}</span><span><b>${board.partner_wins}</b> ${partner}</span></button>`}
      <div class="duel-grid">
        ${Object.entries(META).filter(([k]) => !HIDDEN.includes(k)).map(([k, g]) => html`
          <button class=${'duel-card' + (guestLocked && !free.includes(k) ? ' locked' : '')} style=${`--g:${g.color};--g-soft:${g.soft}`} onClick=${() => go(k)}>
            ${guestLocked && !free.includes(k) && html`<span class="dlock">🔒</span>`}
            <span class="dc-emo">${g.emo}</span><b>${g.name}</b><span class="dc-sub">${g.sub}</span>
          </button>`)}
      </div>
      ${editing && html`<${SpinEditor} onClose=${() => setEditing(false)} partner=${partner} />`}
    </div>`;
}

// the loser attaches a photo or short video as proof of a stake
function StakeProofSheet({ x, coupleId, partner, onClose, onDone }) {
  const [file, setFile] = useState(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const sendProof = async () => {
    if (!file) return;
    setBusy(true);
    try {
      const up = await uploadProof(coupleId, file);
      await rpc('duel_submit_proof', { p_id: x.id, p_path: up.path, p_kind: up.kind, p_note: note });
      buzz(); toast(`Proof sent to ${partner} 💝`); onDone();
    } catch (e) { fail(e); setBusy(false); }
  };
  return html`
    <${Sheet} title="Show you did it" onClose=${onClose}>
      <div class="stack">
        <b>${x.stake}</b>
        ${file ? html`<${Chosen} file=${file} onClear=${() => setFile(null)} />` : html`<${Capture} accept="image/*,video/*,audio/*" onFile=${setFile} label="Gallery" />`}
        <p class="small muted">Record right here, or pick from your gallery. A photo, a short video or a voice note. ${partner} sees it and taps “Got it”.</p>
        <input class="input" maxlength="120" placeholder="Add a note (optional)" value=${note} onInput=${(e) => setNote(e.target.value)} />
        <button class="btn" disabled=${!file || busy} onClick=${sendProof}>${busy ? 'Uploading…' : `Send to ${partner}`}</button>
      </div>
    </${Sheet}>`;
}

// ---------- the Stakes tab (IOU wallet) ----------
export function StakesScreen({ home, uid }) {
  const [b, setB] = useState(null);
  const [proofFor, setProofFor] = useState(null); // a stake the loser is attaching proof to
  const [viewing, setViewing] = useState(null);   // id of a stake whose proof the winner is looking at
  const partner = home.couple.partner_name;
  const load = () => rpc('duel_board').then(setB).catch(fail);
  useEffect(() => { load(); }, []);
  const paid = async (id, p) => { try { await rpc('duel_paid', { p_id: id, p_paid: p }); load(); if (p) { buzz(30); toast('Marked as done 💝'); } } catch (e) { fail(e); } };
  if (!b) return html`<p class="muted pulse center screen">Loading…</p>`;
  const iOwe = b.recent.filter((x) => x.stake && x.loser === uid && !x.paid_at);
  const theyOwe = b.recent.filter((x) => x.stake && x.loser && x.loser !== uid && !x.paid_at);
  const done = b.recent.filter((x) => x.paid_at).slice(0, 10);
  const ago = (t) => { const h = Math.round((Date.now() - new Date(t)) / 36e5); return h < 1 ? 'just now' : h < 24 ? `${h}h ago` : `${Math.round(h / 24)}d ago`; };
  const Row = ({ x, mine }) => html`
    <div class="iou ${mine ? 'owe' : 'due'}">
      <span class="iou-emo">${META[x.game] ? META[x.game].emo : '🎮'}</span>
      <span class="grow"><b>${x.stake}</b><span class="small muted">${META[x.game] ? META[x.game].name : ''} · ${ago(x.created_at)}</span></span>
      ${mine && (x.proof_path
        ? html`<span class="small muted">Proof sent ✓</span><button class="chip" onClick=${() => setProofFor(x)}>Replace</button>`
        : html`<button class="chip" onClick=${() => setProofFor(x)}>Done it 📸</button>`)}
      ${!mine && x.proof_path && html`<button class="chip" onClick=${() => setViewing(viewing === x.id ? null : x.id)}>${viewing === x.id ? 'Hide' : 'See proof'}</button>`}
      ${!mine && html`<button class="chip" onClick=${() => paid(x.id, true)}>Got it ✓</button>`}
      ${!mine && viewing === x.id && x.proof_path && html`<div class="stack" style="flex-basis:100%;width:100%"><${ProofMedia} path=${x.proof_path} kind=${x.proof_kind} />${x.proof_note && html`<p class="small muted">${x.proof_note}</p>`}</div>`}
    </div>`;
  return html`
    <div class="stack-lg screen">
      <div class="stack"><h1>Stakes 💝</h1><p class="muted">Who owes whom. The winner taps “Got it” once the loser pays up.</p></div>
      <div class="tally big"><span>You<b>${b.my_wins}</b></span><span class="small muted">${b.ties} ties</span><span>${partner}<b>${b.partner_wins}</b></span></div>
      <h3>${partner} owes you (${theyOwe.length})</h3>
      ${theyOwe.length ? html`<div class="stack">${theyOwe.map((x) => html`<${Row} x=${x} />`)}</div>` : html`<p class="small muted">Nothing yet. Go win something 😏</p>`}
      <h3>You owe ${partner} (${iOwe.length})</h3>
      ${iOwe.length ? html`<div class="stack">${iOwe.map((x) => html`<${Row} x=${x} mine />`)}</div>` : html`<p class="small muted">You’re all clear 😇</p>`}
      ${done.length > 0 && html`<h3>Paid up</h3><div class="stack">${done.map((x) => html`<div class="iou done"><span class="iou-emo">✅</span><span class="grow"><b>${x.stake}</b><span class="small muted">${x.loser === uid ? 'You paid' : `${partner} paid`}</span></span></div>`)}</div>`}
      ${proofFor && html`<${StakeProofSheet} x=${proofFor} coupleId=${home.couple.id} partner=${partner} onClose=${() => setProofFor(null)} onDone=${() => { setProofFor(null); load(); }} />`}
      <h3>Head to head</h3>
      <div class="stack">${Object.entries(META).filter(([k]) => !HIDDEN.includes(k) || (b.by_game[k] && (b.by_game[k].me || b.by_game[k].partner))).map(([k, g]) => { const r = b.by_game[k] || { me: 0, partner: 0 }; return html`<div class="h2h"><span>${g.emo} ${g.name}</span><span><b>${r.me}</b> – <b>${r.partner}</b></span></div>`; })}</div>
    </div>`;
}

// ---------- the Sync tab: how well do couples know each other ----------
const medal = (n) => (n === 1 ? '🥇' : n === 2 ? '🥈' : n === 3 ? '🥉' : n);
export function SyncScreen({ home, goPlay }) {
  const [b, setB] = useState(null);
  useEffect(() => { rpc('sync_board').then(setB).catch((e) => { fail(e); setB({ mine: null, top: [] }); }); }, []);
  if (!b) return html`<p class="muted pulse center screen">Loading…</p>`;
  const mine = b.mine || { points: 0, games: 0, rank: null };
  const onBoard = b.top.some((x) => x.me);
  return html`
    <div class="stack-lg screen">
      <div class="stack"><h1>Sync 💞</h1><p class="muted">How well do you really know your partner? Every time one of you reads the other right, your jodi earns points.</p></div>
      <section class="sync-hero">
        <span class="small">${home.couple.name}</span>
        <b>${mine.points}</b>
        <span class="small">${mine.points > 0 && mine.rank ? `Rank #${mine.rank} · ${mine.games} ${mine.games === 1 ? 'game' : 'games'} played` : 'No Sync points yet. Play a game together!'}</span>
        <button class="btn" onClick=${goPlay}>Play to earn points</button>
      </section>
      <${StageCard} />
      <h3>Top jodis</h3>
      ${b.top.length === 0 ? html`<p class="muted center small">Nobody is on the board yet. Be the first!</p>` : html`
        <div class="stack">${b.top.map((x) => html`
          <div class=${'rank-row' + (x.me ? ' me' : '')}>
            <span class="rank-n">${medal(x.rank)}</span>
            <span class="grow"><b>${x.badge || '💞'} ${x.name}</b>${x.me ? html` <span class="chip">You</span>` : ''}<span class="small muted">${x.games} ${x.games === 1 ? 'game' : 'games'}</span></span>
            <b class="rank-pts">${x.points}</b>
          </div>`)}</div>`}
      ${!onBoard && mine.points === 0 && b.top.length > 0 && html`<p class="muted small center">Earn your first points to join the board.</p>`}
      <div class="panel stack small">
        <b>How Sync points work</b>
        ${Object.entries(META).filter(([k]) => k !== 'momo' && k !== 'quiz' && !HIDDEN.includes(k)).map(([k, g]) => html`<p>${g.emo} <b>${g.name}:</b> ${SYNC_HOW[k]}</p>`)}
      </div>
    </div>`;
}

// ---------- "Add your spins": both partners write the 8 options for the wheel ----------
function SpinEditor({ onClose, partner }) {
  const mine = useSpins();
  const [vals, setVals] = useState(() => (mine ? [...mine] : Array(8).fill('')));
  const [spin, setSpin] = useState(0);
  const [pick, setPick] = useState('');
  const [busy, setBusy] = useState(false);
  const full = vals.every((v) => v.trim().length >= 2);
  const set = (i, v) => setVals((a) => a.map((x, j) => (j === i ? v : x)));
  const items = vals.map((v, i) => v.trim() || `Spin ${i + 1}`);
  const tryIt = () => { const [i, rot] = nextSpin(spin, 8); setPick(''); setSpin(rot); buzz(20); setTimeout(() => setPick(`${i + 1}. ${items[i]}`), 2300); };
  const submit = async (e) => {
    e.preventDefault(); if (!full) return; setBusy(true);
    try { setSpins(await rpc('save_spins', { p_items: vals.map((v) => v.trim()) })); toast('Spins saved. They show up in every game 🎡'); buzz(30); onClose(); }
    catch (err) { fail(err); setBusy(false); }
  };
  return html`
    <${Sheet} title="Your own spins" onClose=${busy ? () => {} : onClose}>
      <form class="stack" onSubmit=${submit}>
        <p class="muted small">Write 8 things the loser has to do. Make them real: fetch water from the hostel tap, call mummy, a 5-minute head massage. ${partner} can see and change them too.</p>
        <${Wheel} items=${items} spin=${spin} />
        <div class="center stack"><button type="button" class="btn ghost" onClick=${tryIt}>🎡 Try the spin</button>${pick && html`<p class="stake-result">${pick}</p>`}</div>
        ${vals.map((v, i) => html`
          <label class="field"><span>Spin ${i + 1}</span>
            <input class="input" required minlength="2" maxlength="60" placeholder=${['Bring water from the tap 💧', 'Give a 5-minute massage 💆', 'Make chai or maggi ☕', 'Call my mummy on speaker 📞'][i % 4]} value=${v} onInput=${(e) => set(i, e.target.value)} />
          </label>`)}
        <button class="btn game big-cta" disabled=${busy || !full}>${busy ? 'Saving…' : mine ? 'Save my spins' : 'Create our spins'}</button>
        ${!full && html`<p class="small muted center">All 8 are needed to create the spins.</p>`}
      </form>
    </${Sheet}>`;
}
