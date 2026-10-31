// Screens for Quick Quiz and Listen Together (rules live in ld-engine.js).
import { html, useState, useEffect } from 'https://esm.sh/htm@3.1.1/preact/standalone';
import { buzz } from './lib.js';
import { FEELS } from './ld-content.js';
import { QUIZ_ROUNDS, LISTEN_ROUNDS, LT } from './ld-engine.js';

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
const Say = ({ you, children }) => html`<div class=${'say' + (you ? ' you' : '')}>${you ? '👉 ' : '⏳ '}${children}</div>`;

// ---------- Quick Quiz ----------
export function Quiz({ s, r, uid, doAct, now, name, partnerName }) {
  const mine = s.ans && s.ans[uid], theirs = s.ans && s.ans[r.partner];
  const head = html`<div class="row between"><span class="lvl-badge">⚡ Question ${s.rd} of ${QUIZ_ROUNDS}</span></div>`;
  useEffect(() => { if (s.ph === 'reveal') buzz(mine && mine.i === s.right ? 30 : 15); }, [s.ph, s.rd]);
  if (s.ph === 'ask') return html`
    ${head}
    <${Clock} s=${s} now=${now} total=${LT.ask} />
    <div class="qcard">${s.q}</div>
    <div class="opts">${s.o.map((o, i) => html`<button class=${'choice' + (mine && mine.i === i ? ' right' : '')} disabled=${!!mine} onClick=${() => doAct({ t: 'ans', i })}>${o}</button>`)}</div>
    ${mine ? html`<p class="center pulse muted">Locked in. ${theirs ? 'Revealing…' : `Waiting for ${partnerName}…`}</p>`
      : theirs ? html`<p class="center small">⚡ ${partnerName} already answered. Hurry!</p>` : html`<p class="center small muted">Right answer +1. Faster right answer +1 more.</p>`}`;
  const rr = s.rr || {};
  const myOk = rr[s.p[0] === uid ? 'gotX' : 'gotY'], theirOk = rr[s.p[0] === uid ? 'gotY' : 'gotX'];
  const tell = rr.fast ? `${name(rr.fast)} was faster: +2` : myOk && theirOk ? 'Both right at the same moment! +1 each' : myOk ? 'You got it! +1' : theirOk ? `${partnerName} got it. +1 for them` : 'Nobody got that one 😅';
  return html`
    ${head}
    <div class="qcard small-q">${s.q}</div>
    <div class="opts">${s.o.map((o, i) => html`<div class=${'choice ' + (i === s.right ? 'right' : (mine && mine.i === i) || (theirs && theirs.i === i) ? 'wrong' : '')}>${o}${mine && mine.i === i ? ' 🙋' : ''}${theirs && theirs.i === i ? ' 👤' : ''}</div>`)}</div>
    <p class="small muted center">🙋 you · 👤 ${partnerName}</p>
    <div class=${'reveal-card ' + (myOk ? 'good' : 'bad')}><h2>${tell}</h2></div>`;
}

// ---------- Listen Together ----------
const ytLink = (t, f) => `https://www.youtube.com/results?search_query=${encodeURIComponent(`${t} ${f} song`)}`;
const spLink = (t) => `https://open.spotify.com/search/${encodeURIComponent(t)}`;

function SongLinks({ song }) {
  return html`<div class="two-btn">
    <a class="btn ghost" style="text-decoration:none" href=${ytLink(song[0], song[1])} target="_blank" rel="noopener noreferrer">▶️ YouTube</a>
    <a class="btn ghost" style="text-decoration:none" href=${spLink(song[0])} target="_blank" rel="noopener noreferrer">🟢 Spotify</a></div>`;
}

export function Listen({ s, r, uid, doAct, now, name, partnerName }) {
  const [m, setM] = useState(null), [g, setG] = useState(null);
  useEffect(() => { setM(null); setG(null); }, [s.rd]);
  useNow(200);
  const head = html`<div class="row between"><span class="lvl-badge">🎧 Song ${s.rd} of ${LISTEN_ROUNDS}</span></div>`;

  if (s.ph === 'pick') return r.isA ? html`
    ${head}
    <${Say} you>Pick the song you both listen to. ${partnerName} sees it right away.</${Say}>
    <div class="opts">${s.choices.map((c, i) => html`<button class="choice" onClick=${() => doAct({ t: 'song', i })}>${c[0]}<br/><span class="small muted">${c[1]}</span></button>`)}</div>` : html`
    ${head}
    <${Say}>${name(r.A)} is choosing a song…</${Say}><div class="lobby-emo pulse center">🎧</div>`;

  if (s.ph === 'wait') {
    const toGo = Math.ceil((s.t0 - now()) / 1000);
    const playing = now() >= s.t0;
    return html`
      ${head}
      <div class="qcard">${s.song[0]}<br/><span class="small muted">${s.song[1]}</span></div>
      <${SongLinks} song=${s.song} />
      ${playing ? html`
        <div class="reveal-card good"><h2>▶️ PRESS PLAY NOW</h2><p class="small">Both of you, together. Close your eyes and listen.</p></div>
        <${Clock} s=${s} now=${now} total=${LT.listen} />`
      : html`
        <p class="center small muted">Open the song on YouTube or Spotify and get ready on the first second.</p>
        <div class="count-big" key=${toGo}>${Math.max(1, toGo)}</div>
        <p class="center muted">Press play when this hits 0</p>`}`;
  }

  if (s.ph === 'react') {
    const done = s.feels && uid in s.feels;
    if (done) return html`${head}<p class="center pulse muted">Locked in. Waiting for ${partnerName}…</p><${Clock} s=${s} now=${now} total=${LT.react} />`;
    const grid = (sel, pick) => html`<div class="chips-wrap">${FEELS.map(([e, l], i) => html`<button type="button" class=${'chip-btn' + (sel === i ? ' on' : '')} onClick=${() => pick(i)}>${e} ${l}</button>`)}</div>`;
    return html`
      ${head}
      <div class="qcard small-q">${s.song[0]}</div>
      <${Clock} s=${s} now=${now} total=${LT.react} />
      <b>How did it make YOU feel?</b>
      ${grid(m, setM)}
      <b>How do you think it made ${partnerName} feel?</b>
      ${grid(g, setG)}
      <button class="btn game big-cta" disabled=${m === null || g === null} onClick=${() => doAct({ t: 'feel', m, g })}>Lock in</button>`;
  }

  // round result
  const f = s.feels || {}, mine = f[uid], theirs = f[r.partner];
  const iHit = !!(mine && theirs && mine.guess === theirs.mine);
  const theyHit = !!(mine && theirs && theirs.guess === mine.mine);
  const lab = (k) => (k === undefined || k === null ? '—' : `${FEELS[k][0]} ${FEELS[k][1]}`);
  return html`
    ${head}
    <div class="qcard small-q">${s.song[0]}</div>
    <div class=${'reveal-card ' + (iHit || theyHit ? 'good' : 'bad')}>
      <p>You felt <b>${lab(mine && mine.mine)}</b> · ${partnerName} felt <b>${lab(theirs && theirs.mine)}</b></p>
      <p class="small">You guessed ${lab(mine && mine.guess)} for ${partnerName} ${iHit ? '✅ +1' : '❌'}</p>
      <p class="small">${partnerName} guessed ${lab(theirs && theirs.guess)} for you ${theyHit ? '✅ +1' : '❌'}</p>
    </div>`;
}
