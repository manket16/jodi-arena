import { html, useState, useEffect, useRef } from 'https://esm.sh/htm@3.1.1/preact/standalone';
import { GAMES, rpc, fail, toast, Waiting, Intro, buzz, confetti } from './lib.js';

GAMES.future = { name: 'Future Us', emo: '🏡', g: '#0E8F6E', soft: '#D9F5EA', line: 'Dream up your life together, blind. See how much your futures match.', isNew: true };
GAMES.emoji = { name: 'Filmy Emoji', emo: '🎬', g: '#C2410C', soft: '#FFE6D5', line: 'Describe movies in emojis only. Can your partner guess them?', isNew: true };

// ---------- Future Us ----------
export function FutureGame({ st, setSt, load, partner }) {
  const qs = st.content.questions;
  const [phase, setPhase] = useState('intro');
  const [i, setI] = useState(0);
  const [chosen, setChosen] = useState(null);
  const picks = useRef([]);

  const pick = (k) => {
    if (chosen !== null) return;
    buzz(); setChosen(k);
    picks.current[i] = k;
    setTimeout(() => {
      setChosen(null);
      if (i + 1 < qs.length) setI(i + 1); else submit();
    }, 300);
  };
  const submit = async () => {
    setPhase('sending');
    try { setSt(await rpc('submit_future', { p_match: st.id, p_picks: picks.current })); }
    catch (e) { fail(e); setPhase('intro'); }
  };

  if (st.me_done) return html`<${Waiting} emo="🏡" title=${`Waiting for ${partner}`} sub="Once they've dreamed too, you'll see the future you both chose." load=${load} />`;
  if (phase === 'intro') return html`<${Intro} title="What does your future look like?"
    points=${[`8 questions about your life together. Pick what you really want, without asking ${partner}.`, 'Every dream you both pick the same scores 15.', 'At the end, see your shared future, and the things to talk about 😉']}
    onStart=${() => { picks.current = []; setI(0); setPhase('play'); }} label="Start dreaming 🏡" />`;
  if (phase === 'sending') return html`<div class="wait"><div class="emo">🏡</div><p class="muted">Saving your dreams…</p></div>`;

  const q = qs[i];
  return html`
    <div class="stack">
      <div class="dots">${qs.map((_, k) => html`<i class=${k <= i ? 'on' : ''}></i>`)}</div>
      <div class="q q-anim" key=${i} style="font-size:27px;margin:16px 0 18px">${q.q}</div>
      <div class="dream-grid">
        ${q.options.map((o, k) => html`
          <button class=${'dream' + (chosen === k ? ' on' : '')} onClick=${() => pick(k)}>
            <span class="d-emo">${o.e}</span><span>${o.t}</span>
          </button>`)}
      </div>
    </div>`;
}

export function FutureBreakdown({ st, partner, me = 'You' }) {
  const qs = st.content.questions, a = st.my_data && st.my_data.picks, b = st.partner_data && st.partner_data.picks;
  useEffect(() => { if (a && b && a.filter((x, i) => x === b[i]).length >= qs.length * 0.75) confetti(); }, []);
  if (!a || !b) return null;
  const same = qs.map((q, i) => a[i] === b[i]);
  const pct = Math.round((same.filter(Boolean).length / qs.length) * 100);
  return html`
    <div class="stack">
      <section class="postcard">
        <div class="pc-top">${me} & ${partner} · in 10 years</div>
        <div class="pc-pct">${pct}%</div>
        <div class="pc-sub">of your dreams match</div>
        <div class="pc-scene">${qs.map((q, i) => same[i] ? html`<span title=${q.options[a[i]].t}>${q.options[a[i]].e}</span>` : '')}</div>
      </section>
      <div class="panel stack small">
        <h3>The future you both chose</h3>
        ${qs.map((q, i) => same[i] && html`<p>✅ ${q.q} <b>${q.options[a[i]].e} ${q.options[a[i]].t}</b></p>`)}
        ${same.every((x) => !x) && html`<p class="muted">Nothing matched yet. Plenty to talk about over chai ☕</p>`}
      </div>
      ${same.some((x) => !x) && html`
        <div class="panel stack small">
          <h3>Talk about these tonight 💬</h3>
          ${qs.map((q, i) => !same[i] && html`<p>${q.q}<br/><b>You: ${q.options[a[i]].e} ${q.options[a[i]].t}</b> · <b>${partner}: ${q.options[b[i]].e} ${q.options[b[i]].t}</b></p>`)}
        </div>`}
    </div>`;
}

// ---------- Filmy Emoji ----------
const PALETTE = ['❤️','💔','😂','😭','😡','😱','🤔','😎','👨','👩','👴','👶','👨‍🎓','👮','🤵','👰','💃','🕺','🏏','⚽','🏃','🚂','✈️','🚗','🏍️','🏠','🏰','🏔️','🌊','🎂','💐','🔥','💰','💍','🔫','🗡️','👑','👻','🐎','🐯','🦁','🐍','🎤','🎸','🌹','🌙','⭐','👊','💪','🍛','☕','🎓','🏥','👽','🤖','🕵️'];
const emojiOnly = (s) => !/[A-Za-z0-9ऀ-ॿ]/.test(s);

export function EmojiGame({ st, setSt, load, partner }) {
  const sent = !!st.extra.my_clues;
  const guessed = !!(st.my_data && st.my_data.guess);
  const partnerReady = !!st.extra.partner_clues;
  useEffect(() => {
    if (partnerReady && sent && guessed) return;
    const id = setInterval(load, 4000);
    return () => clearInterval(id);
  }, [partnerReady, sent, guessed]);
  return html`
    <div class="stack-lg">
      <section class="panel stack">
        <div class="row between"><h3>1. Describe 3 movies</h3>${sent && html`<span class="done-dot">Sent ✓</span>`}</div>
        ${!sent ? html`<${EmojiCompose} st=${st} setSt=${setSt} partner=${partner} />` : html`<p class="muted small">${partner} will try to guess your emojis.</p>`}
      </section>
      <section class="panel stack">
        <div class="row between"><h3>2. Guess ${partner}'s movies</h3>${guessed && html`<span class="done-dot">Done ✓</span>`}</div>
        ${guessed ? html`<p class="muted small">Your guesses are in.</p>` :
          !partnerReady ? html`<p class="muted small pulse">Waiting for ${partner}'s emojis. ${!sent ? 'Make yours meanwhile.' : ''}</p>` :
          html`<${EmojiGuess} st=${st} setSt=${setSt} />`}
      </section>
      ${sent && guessed && html`<p class="muted center pulse">Waiting for ${partner} to finish…</p>`}
    </div>`;
}

function EmojiCompose({ st, setSt, partner }) {
  const movies = st.extra.my_set || [];
  const [clues, setClues] = useState(['', '', '']);
  const [cur, setCur] = useState(0);
  const [busy, setBusy] = useState(false);
  const set = (i, v) => setClues((c) => { const n = [...c]; n[i] = v; return n; });
  const add = (e) => { buzz(); set(cur, (clues[cur] + e).slice(0, 40)); };
  const back = () => set(cur, Array.from(clues[cur]).slice(0, -1).join(''));
  const ok = clues.every((c) => c.trim() && emojiOnly(c));
  const send = async () => {
    setBusy(true);
    try { setSt(await rpc('emoji_clues', { p_match: st.id, p_clues: clues })); toast(`Sent! ${partner} can guess now.`); }
    catch (e) { fail(e); }
    setBusy(false);
  };
  return html`
    <p class="muted small">Emojis only: no words, no numbers. Hide your screen from ${partner}! Tap a movie, then tap emojis or use your keyboard.</p>
    ${movies.map((m, i) => html`
      <div class=${'clue' + (cur === i ? ' on' : '')} onClick=${() => setCur(i)}>
        <span class="small muted">🎬 ${m}</span>
        <input class="clue-in" value=${clues[i]} placeholder="Tap emojis…" aria-label=${`Emojis for ${m}`}
          onFocus=${() => setCur(i)} onInput=${(e) => set(i, e.target.value.slice(0, 40))} />
        ${clues[i] && !emojiOnly(clues[i]) && html`<span class="small" style="color:var(--rani)">Emojis only, please</span>`}
      </div>`)}
    <div class="palette">
      ${PALETTE.map((e) => html`<button onClick=${() => add(e)} aria-label=${`Add ${e}`}>${e}</button>`)}
      <button class="del" onClick=${back} aria-label="Delete last emoji">⌫</button>
    </div>
    <button class="btn game" onClick=${send} disabled=${busy || !ok}>${busy ? 'Sending…' : 'Send my emojis 🎬'}</button>`;
}

function EmojiGuess({ st, setSt }) {
  const clues = st.extra.partner_clues, opts = st.extra.guess_options || [];
  const [i, setI] = useState(0);
  const [picks, setPicks] = useState([]);
  const [busy, setBusy] = useState(false);
  const shown = useRef(performance.now());
  useEffect(() => { shown.current = performance.now(); }, [i]);
  const choose = async (k) => {
    buzz();
    const next = [...picks, { pick: k, ms: Math.round(performance.now() - shown.current) }];
    setPicks(next);
    if (i < 2) { setI(i + 1); return; }
    setBusy(true);
    try { setSt(await rpc('submit_emoji_guess', { p_match: st.id, p_picks: next })); }
    catch (e) { fail(e); setBusy(false); setPicks([]); setI(0); }
  };
  if (busy) return html`<p class="muted pulse center">Checking…</p>`;
  return html`
    <p class="muted small">Movie ${i + 1} of 3 · 20 points each, +5 if you get it within 8 seconds.</p>
    <div class="emoji-big q-anim" key=${i}>${clues[i]}</div>
    <div class="opts">${opts[i].map((t, k) => html`<button class="choice" onClick=${() => choose(k)}>${t}</button>`)}</div>`;
}

export function EmojiBreakdown({ st, partner }) {
  const mine = st.my_data, theirs = st.partner_data, opts = st.extra.guess_options || [];
  if (!mine || !theirs || !st.extra.partner_set) return null;
  const myMovies = st.extra.my_set, theirMovies = st.extra.partner_set;
  const myPts = mine.points || [], theirPts = theirs.points || [];
  return html`
    <div class="panel stack small">
      <h3>${partner}'s emojis, your guesses</h3>
      ${theirMovies.map((m, i) => html`<p><span style="font-size:22px">${theirs.clues[i]}</span> → <b>${m}</b> ${myPts[i] > 0 ? '✅' : `❌ (you said ${opts[i][mine.guess[i].pick]})`}</p>`)}
      <h3 style="margin-top:10px">Your emojis, ${partner}'s guesses</h3>
      ${myMovies.map((m, i) => html`<p><span style="font-size:22px">${mine.clues[i]}</span> → <b>${m}</b> ${theirPts[i] > 0 ? '✅' : '❌'}</p>`)}
    </div>`;
}
