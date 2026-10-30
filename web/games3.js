import { html, useState, useEffect, useRef } from 'https://esm.sh/htm@3.1.1/preact/standalone';
import { GAMES, rpc, fail, toast, Waiting, Intro, buzz } from './lib.js';

GAMES.kyj = { name: 'Know Your Jodi', emo: '💭', g: '#7C5CDB', soft: '#ECE6FF', line: 'Answer about yourself, guess your partner. How well do you know each other?', isNew: true };

// ---------- question text ----------
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
export function selfText(q) {
  return cap(q.replace(/\{P's\}/g, 'your').replace(/\{p\}/g, 'you')
    .replace(/\bdoes you\b/g, 'do you').replace(/\byou is\b/g, 'you are')
    .replace(/\byou sees\b/g, 'you see').replace(/\byou wants\b/g, 'you want'));
}
export function partnerText(q, name) {
  return cap(q.replace(/\{P's\}/g, `${name}'s`).replace(/\{p\}/g, name));
}

// ---------- Know Your Jodi ----------
export function KyjGame({ st, setSt, load, partner }) {
  const qs = st.content.questions;
  const [phase, setPhase] = useState('intro');
  const [step, setStep] = useState(0);           // 0..2n-1: even = about you, odd = guess partner
  const [chosen, setChosen] = useState(null);
  const self = useRef([]), guess = useRef([]);
  const i = Math.floor(step / 2), aboutMe = step % 2 === 0;

  const pick = (k) => {
    if (chosen !== null) return;
    buzz(); setChosen(k);
    (aboutMe ? self : guess).current[i] = k;
    setTimeout(() => {
      setChosen(null);
      if (step + 1 < qs.length * 2) setStep(step + 1); else submit();
    }, 260);
  };
  const submit = async () => {
    setPhase('sending');
    try { setSt(await rpc('submit_kyj', { p_match: st.id, p_self: self.current, p_guess: guess.current })); }
    catch (e) { fail(e); setPhase('intro'); }
  };

  if (st.me_done) return html`<${Waiting} emo="💭" title=${`Waiting for ${partner}`} sub=${`Once ${partner} answers, you'll see who knows whom better.`} load=${load} />`;
  if (phase === 'intro') return html`<${Intro} title="How well do you know each other?"
    points=${['5 questions. For each, answer about yourself, then guess what ' + partner + ' answered about themselves.', 'Every correct guess, by either of you, scores 15.', 'Be honest. The fun is in the surprises!']}
    onStart=${() => { self.current = []; guess.current = []; setStep(0); setPhase('play'); }} label="Let's find out 💭" />`;
  if (phase === 'sending') return html`<div class="wait"><div class="emo">💭</div><p class="muted">Saving your answers…</p></div>`;

  const q = qs[i];
  return html`
    <div class="stack">
      <div class="dots">${qs.map((_, k) => html`<i class=${k <= i ? 'on' : ''}></i>`)}</div>
      <p class="center"><span class=${'chip kyj-who' + (aboutMe ? '' : ' guess')}>${aboutMe ? '🙋 About you' : `🔮 Guess ${partner}'s answer`}</span></p>
      <div class="q q-anim" key=${step} style="font-size:26px;margin:12px 0 18px">${aboutMe ? selfText(q.q) : partnerText(q.q, partner)}</div>
      <div class="opts">
        ${q.options.map((o, k) => html`<button class=${'choice' + (chosen === k ? ' right' : '')} onClick=${() => pick(k)}>${o}</button>`)}
      </div>
    </div>`;
}

export function KyjBreakdown({ st, partner }) {
  const qs = st.content.questions, mine = st.my_data, theirs = st.partner_data;
  if (!mine || !theirs) return null;
  return html`<div class="panel stack small">
    <h3>Who knows whom</h3>
    ${qs.map((q, i) => {
      const iKnew = mine.guess[i] === theirs.self[i], theyKnew = theirs.guess[i] === mine.self[i];
      return html`<div class="stack" style="padding:8px 0;border-top:1px solid var(--line)">
        <b>${partnerText(q.q, partner)}</b>
        <span>${partner} said <b>${q.options[theirs.self[i]]}</b>. You guessed ${q.options[mine.guess[i]]} ${iKnew ? '✅' : '❌'}</span>
        <span class="muted">You said <b>${q.options[mine.self[i]]}</b>. ${partner} guessed ${q.options[theirs.guess[i]]} ${theyKnew ? '✅' : '❌'}</span>
      </div>`;
    })}
  </div>`;
}

// ---------- Jodi Report ----------
async function reportImage(r) {
  await document.fonts.ready;
  const W = 1080, H = 1920, c = document.createElement('canvas');
  c.width = W; c.height = H;
  const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, '#F0386B'); g.addColorStop(0.55, '#FF7A59'); g.addColorStop(1, '#FFB627');
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  x.globalAlpha = 0.12; x.font = '420px sans-serif'; x.textAlign = 'left'; x.fillText('💞', 640, 520); x.globalAlpha = 1;

  const text = (s, px, y, weight = 800, color = '#fff') => {
    x.font = `${weight} ${px}px "Baloo 2", sans-serif`; x.fillStyle = color; x.textAlign = 'center'; x.fillText(s, W / 2, y);
  };
  text('JODI REPORT', 44, 190, 800, 'rgba(255,255,255,.85)');
  text(`${r.names[0]} & ${r.names[1]}`, r.names.join('').length > 16 ? 86 : 110, 330);
  text(r.jodi + ' ' + r.badge, 52, 410, 700, 'rgba(255,255,255,.9)');

  // big sync number
  x.fillStyle = 'rgba(255,255,255,.95)';
  roundRect(x, 90, 490, W - 180, 470, 56); x.fill();
  const big = r.sync_pct != null ? `${r.sync_pct}%` : r.kyj_pct != null ? `${r.kyj_pct}%` : '💞';
  text(big, 230, 760, 800, '#F0386B');
  text(r.sync_pct != null ? 'in sync' : r.kyj_pct != null ? 'know each other' : 'just getting started', 60, 860, 700, '#23152B');

  // stat tiles
  const tiles = [
    [r.kyj_pct != null && r.sync_pct != null ? `${r.kyj_pct}%` : `${r.games}`, r.kyj_pct != null && r.sync_pct != null ? 'know each other' : 'games played'],
    [`🔥 ${r.best_streak}`, 'best streak'],
    [`#${r.rank}`, `of ${r.jodis} jodis`],
  ];
  tiles.forEach(([v, l], k) => {
    const tx = 90 + k * 310, ty = 1010;
    x.fillStyle = 'rgba(255,255,255,.22)'; roundRect(x, tx, ty, 280, 220, 40); x.fill();
    x.font = '800 72px "Baloo 2", sans-serif'; x.fillStyle = '#fff'; x.textAlign = 'center'; x.fillText(v, tx + 140, ty + 115);
    x.font = '600 34px "Mukta", sans-serif'; x.fillText(l, tx + 140, ty + 175);
  });

  let y = 1340;
  x.textAlign = 'left';
  if (r.agrees.length) {
    x.font = '800 44px "Baloo 2", sans-serif'; x.fillStyle = '#fff'; x.fillText('We both say…', 90, y); y += 70;
    x.font = '600 40px "Mukta", sans-serif';
    r.agrees.slice(0, 2).forEach((a) => { x.fillText('✓ ' + trim(x, a, W - 200), 110, y); y += 62; });
    y += 20;
  }
  if (r.differs.length) {
    const d = r.differs[0];
    x.font = '800 44px "Baloo 2", sans-serif'; x.fillText('We fight about…', 90, y); y += 70;
    x.font = '600 40px "Mukta", sans-serif';
    x.fillText(trim(x, `${d.q} ${d.a} vs ${d.b}`, W - 200), 110, y);
  }
  x.textAlign = 'center';
  x.font = '700 40px "Mukta", sans-serif'; x.fillStyle = '#23152B';
  x.fillText('How in sync are you two? Play on Jodi Arena', W / 2, H - 150);
  x.font = '800 48px "Baloo 2", sans-serif'; x.fillText(location.host, W / 2, H - 85);
  return new Promise((res) => c.toBlob(res, 'image/png'));
}
function roundRect(x, a, b, w, h, r) { x.beginPath(); if (x.roundRect) x.roundRect(a, b, w, h, r); else x.rect(a, b, w, h); }
function trim(x, s, max) { if (x.measureText(s).width <= max) return s; while (s.length && x.measureText(s + '…').width > max) s = s.slice(0, -1); return s + '…'; }

export function JodiReport({ openGame }) {
  const [r, setR] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { rpc('jodi_report').then(setR).catch(fail); }, []);

  const shareImage = async () => {
    setBusy(true);
    try {
      const blob = await reportImage(r);
      const file = new File([blob], 'jodi-report.png', { type: 'image/png' });
      const text = `Our Jodi Report: ${r.sync_pct ?? '?'}% in sync! How well do you two know each other? ${location.origin}`;
      if (navigator.canShare && navigator.canShare({ files: [file] })) await navigator.share({ files: [file], text });
      else {
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'jodi-report.png'; a.click();
        toast('Report image downloaded. Post it on your story!');
      }
    } catch (e) { if (e.name !== 'AbortError') fail(e); }
    setBusy(false);
  };

  if (!r) return html`<p class="muted pulse center">Loading your report…</p>`;
  const empty = r.sync_pct == null && r.kyj_pct == null;
  return html`
    <div class="stack-lg screen">
      <div class="stack"><h1>Your Jodi Report 💞</h1><p class="muted">What your games say about you two. It updates every time you play.</p></div>
      <section class="report">
        <div class="r-names">${r.names[0]} & ${r.names[1]} ${r.badge}</div>
        <div class="r-big">${r.sync_pct != null ? `${r.sync_pct}%` : '–'}</div>
        <div class="r-label">in sync ${r.sync_total ? html`<span>(${r.sync_total} Sync answers)</span>` : ''}</div>
        <div class="r-tiles">
          <div><b>${r.kyj_pct != null ? r.kyj_pct + '%' : '–'}</b><span>know each other</span></div>
          <div><b>🔥 ${r.best_streak}</b><span>best streak</span></div>
          <div><b>#${r.rank}</b><span>of ${r.jodis} jodis</span></div>
        </div>
      </section>
      ${empty ? html`
        <div class="panel stack center">
          <p>Play <b>Sync</b> and <b>Know Your Jodi</b> to fill your report.</p>
          <div class="row"><button class="btn sm" style="flex:1" onClick=${() => openGame('sync')}>🔗 Sync</button><button class="btn sm" style="flex:1" onClick=${() => openGame('kyj')}>💭 Know Your Jodi</button></div>
        </div>` : html`
        ${r.agrees.length > 0 && html`<div class="panel stack small"><h3>You both say</h3>${r.agrees.map((a) => html`<p>✅ ${a}</p>`)}</div>`}
        ${r.differs.length > 0 && html`<div class="panel stack small"><h3>You don't agree on</h3>${r.differs.map((d) => html`<p>⚡ ${d.q} <b>${r.names[0]}: ${d.a}</b> · <b>${r.names[1]}: ${d.b}</b></p>`)}</div>`}
        <button class="btn" onClick=${shareImage} disabled=${busy}>${busy ? 'Making your image…' : 'Share our Jodi Report 📸'}</button>
        <p class="muted small center">Creates a story-sized image for Instagram or WhatsApp status.</p>`}
    </div>`;
}
