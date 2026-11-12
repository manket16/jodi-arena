// Screens for the six Shart games (rules in sg-engine.js). Few words, big buttons.
import { html, useState, useEffect, useRef } from 'https://esm.sh/htm@3.1.1/preact/standalone';
import { buzz } from './lib.js';
import { send, onMessage } from './live.js';
import { SGT, WHEEL } from './sg-engine.js';
import { XO, SNIPER, VAULT, TUG, themed } from './sg-content.js';
import { getDna } from './dna-skin.js';

const obs = () => (getDna() || {}).obs;
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
const Big = ({ children, sub }) => html`<div class="sg-say"><b>${children}</b>${sub && html`<span>${sub}</span>`}</div>`;
const meIdx = (s, uid) => s.p.indexOf(uid);

// ---------- Cross-Zero ----------
export function Xo({ s, uid, doAct, now, partnerName }) {
  const me = meIdx(s, uid);
  const pcs = themed(XO, obs());
  const myTurn = s.ph === 'play' && s.turn === me;
  const oldest = [0, 1].map((i) => (s.q && s.q[i].length === 3 ? s.q[i][0] : null));
  useEffect(() => { if (myTurn) buzz(20); }, [myTurn, s.moves]);
  const tell = s.ph === 'reveal'
    ? (s.rr.w === null ? '🤝 Draw round' : s.rr.w === me ? '🏆 Round to you!' : `😅 Round to ${partnerName}`)
    : myTurn ? `Your turn ${pcs[me]}` : `${partnerName}’s turn ${pcs[1 - me]}`;
  return html`
    <${Big} sub=${`Round ${s.rd} · first to ${SGT.xoWins}`}>${tell}</${Big}>
    ${s.ph === 'play' && html`<${Clock} s=${s} now=${now} total=${SGT.xoTurn} />`}
    <div class="xo-grid">
      ${s.board.map((v, c) => html`<button class=${'xo-cell' + (v !== null && oldest[v] === c ? ' old' : '') + (s.line && s.line.includes(c) ? ' win' : '')}
        disabled=${!myTurn || v !== null} onClick=${() => doAct({ t: 'xo', c })}>${v === null ? '' : pcs[v]}</button>`)}
    </div>
    <p class="small muted center">You ${pcs[me]} · ${partnerName} ${pcs[1 - me]} · faded one vanishes next</p>`;
}

// ---------- Grid Sniper ----------
export function Sniper({ s, uid, doAct, now, partnerName }) {
  const me = meIdx(s, uid), them = 1 - me;
  const [treat, trap] = themed(SNIPER, obs());
  const [pick, setPick] = useState([]);
  const myTurn = s.ph === 'shoot' && s.turn === me;
  useEffect(() => { if (myTurn) buzz(20); }, [myTurn]);
  useEffect(() => { if (s.last && s.last.res === 'trap') buzz([80, 40, 80]); }, [s.last && s.last.at]);
  if (s.ph === 'hide') {
    const done = !!s.hid[me];
    const tap = (c) => { if (done || pick.includes(c) || pick.length >= 3) return; setPick([...pick, c]); };
    return html`
      <${Big} sub=${done ? `Waiting for ${partnerName}…` : pick.length < 2 ? `Tap 2 spots for ${treat}` : pick.length < 3 ? `Tap 1 spot for ${trap}` : 'Ready?'}>Hide!</${Big}>
      <${Clock} s=${s} now=${now} total=${SGT.hide} />
      <div class="sn-grid">${[...Array(16).keys()].map((c) => { const k = pick.indexOf(c); const mine = done ? (s.hid[me].treats.includes(c) ? treat : s.hid[me].trap === c ? trap : '') : k === 0 || k === 1 ? treat : k === 2 ? trap : '';
        return html`<button class="sn-cell" onClick=${() => tap(c)}>${mine}</button>`; })}</div>
      ${!done && html`<div class="two-btn"><button class="btn ghost" onClick=${() => setPick([])}>Reset</button><button class="btn game" disabled=${pick.length < 3} onClick=${() => doAct({ t: 'hide', treats: [pick[0], pick[1]], trap: pick[2] })}>Hide ✓</button></div>`}`;
  }
  const mark = (res) => (res === 'treat' ? treat : res === 'trap' ? trap : res === 'miss' ? '·' : '');
  const found = (i) => s.sc[s.p[i]];
  const tell = s.ph === 'reveal' ? (s.rr.w === me ? '🏆 You found both!' : `😅 ${partnerName} found both`) : myTurn ? 'Your shot 🎯' : `${partnerName} is aiming…`;
  return html`
    <${Big} sub=${`You ${found(me)}/2 ${treat} · ${partnerName} ${found(them)}/2`}>${tell}</${Big}>
    ${s.ph === 'shoot' && html`<${Clock} s=${s} now=${now} total=${SGT.shot} />`}
    ${s.skip[me] && s.ph === 'shoot' && html`<p class="center small">${trap} You hit the trap. Next turn skipped.</p>`}
    <p class="small muted center">${partnerName}’s grid</p>
    <div class="sn-grid">${[...Array(16).keys()].map((c) => html`<button class=${'sn-cell' + (s.shots[me][c] ? ' hit ' + s.shots[me][c] : '')} disabled=${!myTurn || !!s.shots[me][c]} onClick=${() => doAct({ t: 'shot', c })}>${mark(s.shots[me][c])}</button>`)}</div>
    <p class="small muted center">Your grid</p>
    <div class="sn-grid mini">${[...Array(16).keys()].map((c) => { const h = s.hid[me]; const own = h.treats.includes(c) ? treat : h.trap === c ? trap : ''; const hit = s.shots[them][c];
      return html`<div class=${'sn-cell' + (hit ? ' hit ' + hit : '')}>${hit && hit !== 'miss' ? '💥' : hit ? '·' : own}</div>`; })}</div>`;
}

// ---------- Ganda Sketch ----------
const INK = ['#1f1424', '#E11D5A', '#2563EB'];
export function Sketch({ s, r, d, doAct, now, partnerName }) {
  const cv = useRef(); const buf = useRef([]); const last = useRef(null); const down = useRef(false);
  const [color, setColor] = useState(0);
  const [typed, setTyped] = useState([]); // tile indexes
  useNow(200);
  const drawing = s.ph === 'draw' && r.isA;
  const ctx = () => cv.current && cv.current.getContext('2d');
  const line = (pts, c) => {
    const x = ctx(); if (!x || pts.length < 1) return;
    const W = cv.current.width, H = cv.current.height;
    x.strokeStyle = INK[c] || INK[0]; x.lineWidth = W / 90; x.lineCap = 'round'; x.lineJoin = 'round';
    x.beginPath(); x.moveTo(pts[0][0] * W, pts[0][1] * H); for (const [px, py] of pts.slice(1)) x.lineTo(px * W, py * H);
    if (pts.length === 1) x.lineTo(pts[0][0] * W + 0.1, pts[0][1] * H);
    x.stroke();
  };
  useEffect(() => { const x = ctx(); if (x) { x.fillStyle = '#fff'; x.fillRect(0, 0, cv.current.width, cv.current.height); } last.current = null; setTyped([]); }, [s.rd]);
  useEffect(() => onMessage((m) => { if (m.t === 'ink' && m.id === d.id && m.rd === s.rd) line(m.pts, m.c); }), [s.rd]);
  useEffect(() => {
    if (!r.isA) return;
    const t = setInterval(() => { if (buf.current.length) { send({ t: 'ink', id: d.id, rd: s.rd, pts: buf.current, c: color }); buf.current = buf.current.slice(-1); if (!down.current) buf.current = []; } }, 60);
    return () => clearInterval(t);
  }, [r.isA, s.rd, color]);
  // a wrong spelling clears the letters
  useEffect(() => { if (s.wrong) { setTyped([]); buzz([60, 40, 60]); } }, [s.wrong]);
  const pos = (e) => { const b = cv.current.getBoundingClientRect(); const p = e.touches ? e.touches[0] : e; return [Math.round(((p.clientX - b.left) / b.width) * 1000) / 1000, Math.round(((p.clientY - b.top) / b.height) * 1000) / 1000]; };
  const start = (e) => { if (!drawing) return; e.preventDefault(); down.current = true; const p = pos(e); last.current = p; buf.current = [p]; line([p], color); };
  const move = (e) => { if (!drawing || !down.current) return; e.preventDefault(); const p = pos(e); line([last.current, p], color); last.current = p; buf.current.push(p); };
  const end = () => { down.current = false; };

  const total = s.len ? s.len.reduce((a, b) => a + b, 0) : 0;
  const tap = (i) => {
    if (typed.includes(i) || typed.length >= total) return;
    const nt = [...typed, i]; setTyped(nt); buzz(8);
    if (nt.length === total) doAct({ t: 'spell', w: nt.map((k) => s.tiles[k]).join('') });
  };
  let k = 0;
  const slots = (s.len || []).map((n) => [...Array(n)].map(() => { const t = typed[k++]; return t === undefined ? '' : s.tiles[t]; }));
  return html`
    ${s.ph === 'draw' && (r.isA ? html`<${Big} sub="Draw it. No letters!">${s.word}</${Big}>` : html`<${Big} sub="Tap letters to spell it">What is it?</${Big}>`)}
    ${s.ph === 'reveal' && html`<div class=${'reveal-card ' + (s.guessed ? 'good' : 'bad')}><h2>${s.guessed ? `Got it in ${Math.round(s.took / 1000)}s! 🎉` : 'Time’s up!'}</h2><p><b>${s.word}</b></p></div>`}
    ${s.ph === 'draw' && html`<${Clock} s=${s} now=${now} total=${SGT.sketch} />`}
    <canvas ref=${cv} width="600" height="600" class=${'dpad' + (drawing ? ' live' : '')}
      onMouseDown=${start} onMouseMove=${move} onMouseUp=${end} onMouseLeave=${end}
      onTouchStart=${start} onTouchMove=${move} onTouchEnd=${end}></canvas>
    ${drawing && html`<div class="row" style="justify-content:center">${INK.map((c, i) => html`<button class=${'ink' + (color === i ? ' on' : '')} style=${`background:${c}`} onClick=${() => setColor(i)} aria-label="Colour"></button>`)}</div>`}
    ${s.ph === 'draw' && !r.isA && html`
      <div class="sk-slots">${slots.map((w) => html`<span class="sk-word">${w.map((ch) => html`<i>${ch}</i>`)}</span>`)}</div>
      <div class="sk-tiles">${s.tiles.map((ch, i) => html`<button class=${'sk-tile' + (typed.includes(i) ? ' used' : '')} onClick=${() => tap(i)}>${ch}</button>`)}
        <button class="sk-tile back" onClick=${() => setTyped(typed.slice(0, -1))} aria-label="Delete">⌫</button></div>`}
    ${s.ph === 'draw' && r.isA && html`<p class="small muted center">${partnerName} is spelling…</p>`}`;
}

// ---------- Emoji Vault ----------
export function Vault({ s, r, doAct, now, partnerName }) {
  const keys = themed(VAULT, obs());
  const [code, setCode] = useState([]);
  useEffect(() => setCode([]), [s.rd, s.ph, s.tries && s.tries.length]);
  const add = (i) => { if (code.length < 3 && !code.includes(i)) { setCode([...code, i]); buzz(8); } };
  const slots = html`<div class="v-slots">${[0, 1, 2].map((i) => html`<button class="v-slot" onClick=${() => setCode(code.filter((_, j) => j !== i))}>${code[i] !== undefined ? keys[code[i]] : ''}</button>`)}</div>`;
  const pad = html`<div class="v-keys">${keys.map((e, i) => html`<button class=${'v-key' + (code.includes(i) ? ' used' : '')} onClick=${() => add(i)}>${e}</button>`)}</div>`;
  const tries = html`<div class="v-tries">${(s.tries || []).map((t) => html`<div class="v-try">${t.g.map((e, i) => html`<span class=${'fb ' + t.fb[i]}>${keys[e]}</span>`)}</div>`)}</div>`;
  if (s.ph === 'set') return r.isA ? html`
    <${Big} sub="Pick 3. Order matters.">Lock your code 🔐</${Big}><${Clock} s=${s} now=${now} total=${SGT.vSet} />
    ${slots}${pad}<button class="btn game big-cta" disabled=${code.length < 3} onClick=${() => doAct({ t: 'code', code })}>Lock 🔒</button>` : html`
    <${Big} sub="Get ready to crack it">${partnerName} is locking…</${Big}><div class="lobby-emo pulse center">🔐</div>`;
  if (s.ph === 'crack') return r.isA ? html`
    <${Big} sub=${`${s.tries.length}/${SGT.vTries} tries`}>${partnerName} is cracking…</${Big}><${Clock} s=${s} now=${now} total=${SGT.vCrack} />
    <div class="v-slots">${s.code.map((e) => html`<span class="v-slot">${keys[e]}</span>`)}</div>${tries}` : html`
    <${Big} sub=${`Try ${s.tries.length + 1} of ${SGT.vTries}`}>Crack it!</${Big}><${Clock} s=${s} now=${now} total=${SGT.vCrack} />
    ${tries}${slots}${pad}<button class="btn game big-cta" disabled=${code.length < 3} onClick=${() => doAct({ t: 'try', g: code })}>Try 🔓</button>
    <p class="small muted center">🟩 right spot · 🟨 wrong spot · ⬜ no</p>`;
  return html`
    <div class=${'reveal-card ' + (s.cracked ? 'good' : 'bad')}><h2>${s.cracked ? `Cracked in ${s.tries.length}! 🔓` : 'Vault held! 🔐'}</h2>
      <div class="v-slots">${(s.code || []).map((e) => html`<span class="v-slot">${keys[e]}</span>`)}</div></div>${tries}`;
}

// ---------- Tug-of-War ----------
export function Tug({ s, uid, doAct, now, partnerName }) {
  useNow(80);
  const me = meIdx(s, uid);
  const [emo, prize] = themed(TUG, obs());
  const pending = useRef(0);
  useEffect(() => {
    const t = setInterval(() => { if (pending.current) { const n = pending.current; pending.current = 0; doAct({ t: 'pull', n, at: now() }); } }, 150);
    return () => clearInterval(t);
  }, []);
  useEffect(() => { buzz(s.light === 'red' ? [60, 30, 60] : 15); }, [s.light]);
  const slipped = s.slips && s.slips.length && s.slips[s.slips.length - 1];
  useEffect(() => { if (slipped && slipped.who === me) buzz(120); }, [slipped && slipped.at]);
  // my side is always on the left: pos > 0 means towards the host
  const mine = me === 0 ? s.pos : -s.pos;
  const pct = 50 - (mine / SGT.tugGoal) * 50;
  const left = Math.max(0, Math.ceil((s.end - now()) / 1000));
  const green = s.light === 'green';
  return html`
    <div class=${'tug-light ' + (green ? 'go' : 'stop')}>${green ? '🟢 PULL!' : '🔴 FREEZE!'}</div>
    <div class="tug-track"><span class="tug-end">You</span><div class="tug-rope"><div class="tug-knot" style=${`left:${pct}%`}>${emo}</div></div><span class="tug-end">${partnerName}</span></div>
    <p class="small muted center">Pull the ${prize} to your side · ${left}s</p>
    ${slipped && now() - slipped.at < 1200 && html`<p class="center"><b>${slipped.who === me ? '😱 You slipped!' : `😂 ${partnerName} slipped!`}</b></p>`}
    <button class=${'tug-pad ' + (green ? 'go' : 'stop')} onPointerDown=${(e) => { e.preventDefault(); pending.current += 1; }}>TAP</button>`;
}

// ---------- Mystery Wheel ----------
const SEG = { coin: '🪙', who: '🤔', tap: '👆', dare: '🎭' };
const SEG_NAME = { coin: 'Coin Hide', who: 'Who is more?', tap: 'Fast Tap', dare: 'Dare' };
const WBG = 'conic-gradient(#FDA4AF 0 45deg,#FDE68A 45deg 90deg,#A7F3D0 90deg 135deg,#BAE6FD 135deg 180deg,#C4B5FD 180deg 225deg,#FBCFE8 225deg 270deg,#FED7AA 270deg 315deg,#D9F99D 315deg 360deg)';
export function Wheel({ s, r, uid, doAct, now, name, partnerName, skew }) {
  useNow(80);
  const me = meIdx(s, uid);
  const N = WHEEL.length;
  const head = html`<div class="row between"><span class="lvl-badge">🎡 Spin ${s.rd} of ${SGT.spins}</span><span class="lvl-badge">${SEG[s.kind]} ${SEG_NAME[s.kind]}</span></div>`;
  if (s.ph === 'spin') return html`${head}
    <div class="wheel-wrap"><div class="wheel-pin">▼</div><div class="wheel" style=${`transform:rotate(${s.spinRot}deg);background:${WBG}`}>${WHEEL.map((k, i) => html`<span style=${`transform:rotate(${(i * 360) / N + 180 / N}deg)`}><i>${SEG[k]}</i></span>`)}</div></div>`;
  const A = name(r.A);
  if (s.ph === 'hide') return html`${head}<${Clock} s=${s} now=${now} total=${SGT.coin} />${r.isA ? html`
    <${Big} sub=${`${partnerName} will guess`}>Hide the coin 🪙</${Big}>
    <div class="two-btn"><button class="btn big-cta" onClick=${() => doAct({ t: 'hand', h: 'L' })}>👈 Left</button><button class="btn big-cta" onClick=${() => doAct({ t: 'hand', h: 'R' })}>Right 👉</button></div>` : html`
    <${Big} sub="Watch their face 👀">${A} is hiding the coin…</${Big}>`}`;
  if (s.ph === 'guess') return html`${head}<${Clock} s=${s} now=${now} total=${SGT.coin} />${!r.isA ? html`
    <${Big} sub="Read their mind">Which hand? 🪙</${Big}>
    <div class="two-btn"><button class="btn big-cta" onClick=${() => doAct({ t: 'hand', h: 'L' })}>👈 Left</button><button class="btn big-cta" onClick=${() => doAct({ t: 'hand', h: 'R' })}>Right 👉</button></div>` : html`
    <${Big} sub="Keep a straight face 😐">${partnerName} is guessing…</${Big}>`}`;
  if (s.ph === 'who') {
    const mine = s.pick[uid];
    return html`${head}<${Clock} s=${s} now=${now} total=${SGT.who} />
      <div class="qcard"><div style="font-size:48px">${s.card[0]}</div>${s.card[1]}</div>
      <div class="two-btn">${[0, 1].map((w) => html`<button class=${'btn big-cta' + (mine === w ? ' game' : ' ghost')} disabled=${mine !== undefined} onClick=${() => doAct({ t: 'who', w })}>${w === me ? 'Me' : partnerName}</button>`)}</div>
      <p class="small muted center">${mine !== undefined ? `Waiting for ${partnerName}…` : 'Same pick = +1 each'}</p>`;
  }
  if (s.ph === 'tap') {
    const go = now() >= s.goAt;
    const tapped = uid in s.taps;
    const hit = () => { if (tapped) return; if (!go) { doAct({ t: 'tap', early: true }); buzz(100); return; } doAct({ t: 'tap', rt: now() - s.goAt }); };
    void skew;
    return html`${head}
      <button class=${'tap-pad ' + (go ? 'go' : 'wait')} onPointerDown=${(e) => { e.preventDefault(); hit(); }}>${tapped ? '✓' : go ? 'TAP!' : 'Wait…'}</button>
      <p class="small muted center">Fastest tap +1 · too early gives ${partnerName} +1</p>`;
  }
  if (s.ph === 'dare') return html`${head}<${Clock} s=${s} now=${now} total=${SGT.dare} />${r.isA ? html`
    <${Big} sub="Do it on the call!">🎭 ${s.dare}</${Big}><p class="center small muted">${partnerName} decides if you did it.</p>` : html`
    <${Big} sub=${`${A}’s dare`}>🎭 ${s.dare}</${Big}>
    <div class="two-btn"><button class="btn big-cta ok" onClick=${() => doAct({ t: 'done' })}>Done ✅</button><button class="btn big-cta warn" onClick=${() => doAct({ t: 'chicken' })}>Chickened 🐔</button></div>`}`;
  // reveal
  const rr = s.rr || {};
  let msg = '';
  if (s.kind === 'coin') msg = rr.guess === null ? `Too slow! +1 ${A}` : rr.right ? `Right hand! +1 ${name(r.B)}` : `Fooled! +1 ${A}`;
  if (s.kind === 'who') msg = rr.same ? '💞 Same pick! +1 each' : rr.late ? 'Too slow!' : '😜 You disagree!';
  if (s.kind === 'tap') msg = rr.early ? `${name(rr.early)} tapped early! 😅` : rr.tapWin ? `⚡ ${name(rr.tapWin)} was faster! +1` : 'Nobody tapped';
  if (s.kind === 'dare') msg = rr.done ? `🎉 ${A} did it! +1` : `🐔 ${A} chickened out`;
  return html`${head}<div class=${'reveal-card ' + (msg.includes('+1') ? 'good' : 'bad')}><h2>${msg}</h2></div>`;
}
