import { html, useState, useEffect, useRef } from 'https://esm.sh/htm@3.1.1/preact/standalone';
import { rpc, fail, useCountdown, Timer, Waiting, Intro, blip, buzz, unlockAudio } from './lib.js';

const isYear = (q) => /which year/i.test(q.q);
export const fmt = (q, v) => (isYear(q) ? String(Math.round(v)) : Number(v).toLocaleString('en-IN', { maximumFractionDigits: 1 }));
const stepFor = (q) => (isYear(q) ? 1 : Math.max(1, Math.pow(10, Math.floor(Math.log10((q.hi - q.lo) / 200)))));

// ---------- Andaaza ----------
export function AndaazaGame({ st, setSt, load, partner }) {
  const qs = st.content.questions;
  const [phase, setPhase] = useState('intro');
  const [i, setI] = useState(0);
  const [val, setVal] = useState(null);
  const guesses = useRef([]);
  const q = qs[i];
  const step = stepFor(q);
  const mid = (qq) => { const s = stepFor(qq); return Math.round((qq.lo + (qq.hi - qq.lo) / 2) / s) * s; };
  useEffect(() => { setVal(mid(qs[i])); }, [i]);

  const lock = (v) => {
    buzz();
    guesses.current[i] = Number(v);
    if (i + 1 < qs.length) setI(i + 1);
    else submit();
  };
  const left = useCountdown(25, phase === 'play', () => lock(val ?? mid(q)), i);

  const submit = async () => {
    setPhase('sending');
    try { setSt(await rpc('submit_andaaza', { p_match: st.id, p_guesses: guesses.current })); }
    catch (e) { fail(e); setPhase('intro'); }
  };

  if (st.me_done) return html`<${Waiting} emo="🎯" title=${`Waiting for ${partner}`} sub="Your jodi's answer is the average of both your guesses. Results once they're done." load=${load} />`;
  if (phase === 'intro') return html`<${Intro} title="Andaaza: how close can you two get?"
    points=${['6 questions with a number answer. Slide to your guess.', `Your jodi's answer is the average of your guess and ${partner}'s. Up to 20 points each.`, 'No discussing! You both guess blind.']}
    onStart=${() => { guesses.current = []; setI(0); setPhase('play'); }} label="Start guessing 🎯" />`;
  if (phase === 'sending') return html`<div class="wait"><div class="emo">🎯</div><p class="muted">Locking your guesses…</p></div>`;

  const v = val ?? mid(q);
  const pct = ((v - q.lo) / (q.hi - q.lo)) * 100;
  const nudge = (d) => setVal(Math.min(q.hi, Math.max(q.lo, v + d)));
  return html`
    <div class="stack">
      <div class="dots">${qs.map((_, k) => html`<i class=${k <= i ? 'on' : ''}></i>`)}</div>
      <${Timer} left=${left} total=${25000} />
      <div class="q q-anim" key=${i} style="font-size:26px;margin:18px 0 8px">${q.q}</div>
      <div class="panel dial">
        <div><span class="val">${fmt(q, v)}</span><span class="unit">${q.unit}</span></div>
        <input class="range" type="range" min=${q.lo} max=${q.hi} step=${step} value=${v} style=${`--p:${pct}%`}
          onInput=${(e) => setVal(Number(e.target.value))} aria-label="Your guess" />
        <div class="row between small muted"><span>${fmt(q, q.lo)}</span><span>${fmt(q, q.hi)}</span></div>
        <div class="nudges" style="margin-top:10px">
          <button onClick=${() => nudge(-step * 10)}>−${fmt(q, step * 10)}</button>
          <button onClick=${() => nudge(-step)}>−${fmt(q, step)}</button>
          <button onClick=${() => nudge(step)}>+${fmt(q, step)}</button>
          <button onClick=${() => nudge(step * 10)}>+${fmt(q, step * 10)}</button>
        </div>
      </div>
      <button class="btn game" onClick=${() => lock(v)}>Lock it in</button>
    </div>`;
}

// ---------- Rhythm Lock ----------
export function RhythmGame({ st, setSt, load, partner }) {
  const beats = st.content.beats;
  const [phase, setPhase] = useState('intro'); // intro | listen | tap | sending
  const [listens, setListens] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [hit, setHit] = useState(0);
  const [taps, setTaps] = useState([]);
  const timers = useRef([]);
  const tapsRef = useRef([]);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const flash = () => { setHit((h) => h + 1); };
  const playBeat = () => {
    if (playing || listens >= 2) return;
    unlockAudio();
    setPlaying(true); setListens((l) => l + 1);
    const lead = 600;
    beats.forEach((t) => timers.current.push(setTimeout(() => { blip(660); flash(); }, lead + t)));
    timers.current.push(setTimeout(() => setPlaying(false), lead + beats[beats.length - 1] + 300));
  };

  const tap = (e) => {
    e.preventDefault();
    if (phase !== 'tap' || tapsRef.current.length >= beats.length) return;
    blip(880); buzz(10); flash();
    tapsRef.current = [...tapsRef.current, Math.round(performance.now())];
    setTaps(tapsRef.current);
    if (tapsRef.current.length === beats.length) setTimeout(submit, 450);
  };
  const reset = () => { tapsRef.current = []; setTaps([]); };

  const submit = async () => {
    setPhase('sending');
    try { setSt(await rpc('submit_rhythm', { p_match: st.id, p_taps: tapsRef.current })); }
    catch (e) { fail(e); setPhase('tap'); reset(); }
  };

  if (st.me_done) return html`<${Waiting} emo="🥁" title=${`Waiting for ${partner}`} sub="We'll compare both your taps with the beat and with each other." load=${load} />`;
  if (phase === 'intro') return html`<${Intro} title="Rhythm Lock"
    points=${[`You'll hear a ${beats.length}-beat rhythm. You can listen twice.`, 'Then tap it back from memory on the big drum.', `Points for matching the beat, bonus for matching ${partner}. Sound on!`]}
    onStart=${() => setPhase('listen')} label="Let's go 🥁" />`;
  if (phase === 'sending') return html`<div class="wait"><div class="emo">🥁</div><p class="muted">Checking your rhythm…</p></div>`;

  const listening = phase === 'listen';
  return html`
    <div class="stack center">
      <h2>${listening ? (playing ? 'Listen…' : listens === 0 ? 'Tap play to hear the beat' : 'Got it? Ready to tap?') : `Tap it back: ${taps.length} / ${beats.length}`}</h2>
      <div class="dots">${beats.map((_, k) => html`<i class=${!listening && k < taps.length ? 'on' : ''}></i>`)}</div>
      <button class=${'pad' + (listening ? ' listen' : '')} onPointerDown=${listening ? undefined : tap}
        aria-label=${listening ? 'Drum (listening)' : 'Tap the drum'}>
        ${hit > 0 && html`<span class="ring" key=${hit}></span>`}
        ${listening ? (playing ? '🎵' : '🥁') : 'TAP'}
      </button>
      ${listening ? html`
        <div class="row">
          <button class="btn ghost" onClick=${playBeat} disabled=${playing || listens >= 2}>${listens === 0 ? '▶ Play beat' : listens === 1 ? '▶ Hear again' : 'No more replays'}</button>
          <button class="btn game" onClick=${() => { unlockAudio(); reset(); setPhase('tap'); }} disabled=${playing || listens === 0}>Ready</button>
        </div>` : html`
        <button class="link" onClick=${reset} disabled=${taps.length === 0}>Start my taps over</button>`}
    </div>`;
}
