import { html, useState, useEffect, useRef } from 'https://esm.sh/htm@3.1.1/preact/standalone';
import { sb, rpc, norm, toast, fail, usePoll, useCountdown, Timer, Waiting, Intro, loadSongs, cachedSongs, nextLetter, buzz } from './lib.js';

// ---------- Sync ----------
export function SyncGame({ st, setSt, load, partner }) {
  const prompts = st.content.prompts;
  const [phase, setPhase] = useState('intro');
  const [i, setI] = useState(0);
  const [picked, setPicked] = useState(null);
  const answers = useRef([]);
  const shownAt = useRef(0);

  const pick = (p) => {
    if (phase !== 'play' || picked !== null) return;
    if (p !== null) buzz();
    answers.current[i] = { pick: p, ms: p === null ? 4000 : Math.round(performance.now() - shownAt.current) };
    setPicked(p === null ? -1 : p);
    setTimeout(() => {
      setPicked(null);
      if (i + 1 < prompts.length) setI(i + 1); else submit();
    }, 220);
  };
  const left = useCountdown(4, phase === 'play' && picked === null, () => pick(null), i);
  useEffect(() => { if (phase === 'play') shownAt.current = performance.now(); }, [i, phase]);

  const submit = async () => {
    setPhase('sending');
    try { setSt(await rpc('submit_sync', { p_match: st.id, p_answers: answers.current })); }
    catch (e) { fail(e); setPhase('intro'); }
  };

  if (st.me_done) return html`<${Waiting} emo="🔗" title=${`Waiting for ${partner}`} sub="You'll both see how in sync you are once they answer." load=${load} />`;
  if (phase === 'intro') return html`<${Intro} title="Are you two in sync?"
    points=${['10 quick questions. 4 seconds each.', `Every answer that matches ${partner}'s scores 10. Both under 2.5 seconds: +5.`, 'No peeking at each other!']}
    onStart=${() => { answers.current = []; setI(0); setPhase('play'); }} label="I'm ready" />`;
  if (phase === 'sending') return html`<div class="wait"><div class="emo">🔗</div><p class="muted">Saving your answers…</p></div>`;
  const p = prompts[i];
  return html`
    <div>
      <div class="dots" aria-label=${`Question ${i + 1} of ${prompts.length}`}>${prompts.map((_, k) => html`<i class=${k <= i ? 'on' : ''}></i>`)}</div>
      <div style="margin-top:14px"><${Timer} left=${left} total=${4000} /></div>
      <div class="q q-anim" key=${i}>${p.q}</div>
      <div class="pair">
        <button class=${'choice' + (picked === 0 ? ' right' : '')} onClick=${() => pick(0)}>${p.a}</button>
        <button class=${'choice' + (picked === 1 ? ' right' : '')} onClick=${() => pick(1)}>${p.b}</button>
      </div>
    </div>`;
}

// ---------- Couple Cricket ----------
const BetCard = ({ partner, bet }) => html`
  <div class="panel stack">
    <h3>🎲 Trust Bet</h3>
    <p class="muted small">Think ${partner} will score 12+ runs? Bet coins. If they do, you get double back.</p>
    <div class="row">${[10, 25, 50].map((s) => html`<button class="btn gold sm" style="flex:1" onClick=${() => bet(s)}>🪙 ${s}</button>`)}</div>
  </div>`;

export function CricketGame({ st, setSt, load, partner }) {
  const qs = st.content.questions.slice((st.slot - 1) * 6, st.slot * 6);
  const balls = (st.my_data && st.my_data.balls) || [];
  const [phase, setPhase] = useState(balls.length ? 'play' : 'intro');
  const [fb, setFb] = useState(null);
  const shownAt = useRef(0);
  const idx = balls.length;
  const total = st.my_score || 0;
  const myBet = st.extra.my_bet, theirBet = st.extra.partner_bet;

  const play = async (p) => {
    if (fb) return;
    const ms = p === null ? 15000 : Math.round(performance.now() - shownAt.current);
    setFb({ pick: p, pending: true });
    try {
      const r = await rpc('cricket_ball', { p_match: st.id, p_idx: idx, p_pick: p, p_ms: ms });
      buzz(r.ok ? 20 : [60, 40, 60]);
      setFb({ pick: p, answer: r.answer, ok: r.ok, runs: r.runs });
      setTimeout(() => { setFb(null); setSt(r.state); }, r.ok ? 1000 : 1700);
    } catch (e) { fail(e); setFb(null); load(); }
  };
  const left = useCountdown(15, phase === 'play' && !st.me_done && !fb, () => play(null), idx);
  useEffect(() => { shownAt.current = performance.now(); }, [idx, phase]);

  const bet = async (s) => { try { setSt(await rpc('place_bet', { p_match: st.id, p_stake: s })); toast(`Bet placed: ${s} coins on ${partner}`); } catch (e) { fail(e); } };
  const BallDots = () => html`<div class="balls">${[0, 1, 2, 3, 4, 5].map((k) => html`<i class=${k < balls.length ? (balls[k].ok ? 'ok' : 'out') : ''}></i>`)}</div>`;

  if (st.me_done) return html`
    <div class="stack-lg">
      <div class="cricket-score"><span>Your innings</span><b>${total}</b></div>
      <${BallDots} />
      ${!st.partner_done && !myBet && html`<${BetCard} partner=${partner} bet=${bet} />`}
      ${myBet && html`<p class="panel small">You bet 🪙 ${myBet.stake} that ${partner} scores 12+.</p>`}
      <${Waiting} emo="🏏" title=${`${partner} is next to bat`} sub="Your jodi's total is both innings added together." load=${load} />
    </div>`;

  if (phase === 'intro') return html`
    <${Intro} title="Your innings: 6 balls" label="Walk out to bat 🏏" onStart=${() => setPhase('play')}
      points=${['Each ball is a trivia question. Easy = 2 runs, medium = 4, hard = 6.', 'Wrong answer or 15 seconds up = OUT.']}>
      ${theirBet && html`<p class="panel"><b>${partner} bet 🪙 ${theirBet.stake}</b> that you'll score 12+. No pressure 😄</p>`}
      ${!myBet && !st.partner_done && html`<${BetCard} partner=${partner} bet=${bet} />`}
      ${myBet && html`<p class="panel small">You bet 🪙 ${myBet.stake} that ${partner} scores 12+.</p>`}
    <//>`;

  const q = qs[idx];
  const diff = ['', 'Easy · 2 runs', 'Medium · 4 runs', 'Hard · 6 runs'][q.difficulty];
  return html`
    <div class="stack">
      <div class="cricket-score"><span>Ball ${idx + 1} of 6</span><b>${total}</b></div>
      <${BallDots} />
      <${Timer} left=${left} total=${15000} />
      <p class="small muted center">${diff}</p>
      <div class="q q-anim" key=${idx} style="font-size:24px;margin:6px 0 16px">${q.q}</div>
      <div class="opts">
        ${q.options.map((o, k) => {
          let cls = 'choice';
          if (fb && !fb.pending) { if (k === fb.answer) cls += ' right'; else if (k === fb.pick) cls += ' wrong'; }
          return html`<button class=${cls} onClick=${() => play(k)} disabled=${!!fb}>${o}</button>`;
        })}
      </div>
      ${fb && !fb.pending && html`<div class=${'flash ' + (fb.ok ? 'good' : 'bad')} aria-live="polite">${fb.ok ? (fb.runs === 6 ? 'SIXER! +6' : `+${fb.runs} runs!`) : 'OUT! ☝️'}</div>`}
    </div>`;
}

// ---------- Antakshari ----------
export function AntakshariGame({ st, setSt, load, partner }) {
  const [songs, setSongs] = useState(cachedSongs());
  const [phase, setPhase] = useState('intro');
  const [letter, setLetter] = useState(st.extra.my_start);
  const [chain, setChain] = useState([]);
  const [text, setText] = useState('');
  const chainRef = useRef([]);
  const inputRef = useRef(null);
  useEffect(() => { if (!songs) loadSongs().then(setSongs).catch(fail); }, []);
  useEffect(() => { setLetter(st.extra.my_start); }, [st.extra.my_start]);

  const used = new Set([...(st.extra.partner_songs || []), ...chain].map(norm));
  const submit = async () => {
    setPhase('sending');
    try { setSt(await rpc('submit_antakshari', { p_match: st.id, p_songs: chainRef.current })); }
    catch (e) { fail(e); load(); }
  };
  const left = useCountdown(60, phase === 'play', submit, 'ak');

  const accept = (title) => {
    const n = norm(title);
    if (!n.startsWith(letter) || used.has(n)) return;
    buzz();
    const next = [...chain, title];
    chainRef.current = next; setChain(next);
    setLetter(nextLetter(n, songs.first)); setText('');
    inputRef.current && inputRef.current.focus();
  };
  const typed = norm(text);
  const sugg = !songs || typed.length < 2 || !typed.startsWith(letter) ? [] :
    songs.norms.filter((n) => n.startsWith(typed) && !used.has(n)).slice(0, 4).map((n) => songs.byNorm.get(n));
  const onKey = (e) => {
    if (e.key !== 'Enter' || !songs) return;
    e.preventDefault();
    if (songs.byNorm.has(typed)) accept(songs.byNorm.get(typed));
    else if (sugg.length === 1) accept(sugg[0]);
  };

  if (st.me_done) return html`<${Waiting} emo="🎶" title=${`Waiting for ${partner}`} sub=${`${partner} continues the chain from where you stopped.`} load=${load} />`;
  if (st.slot === 2 && !st.partner_done) return html`<${Waiting} emo="🎶" title=${`${partner} sings first`} sub="Your turn starts from the letter their chain ends on. We'll bring you in automatically." load=${load} />`;
  if (phase === 'sending') return html`<div class="wait"><div class="emo">🎶</div><p class="muted">Counting your songs…</p></div>`;
  if (phase === 'intro') return html`<${Intro} title=${`Your turn starts with "${(st.extra.my_start || '').toUpperCase()}"`}
    points=${['60 seconds. Name a song starting with the letter shown.', 'Next song starts with the last letter of the previous one.', `10 points per song. No repeats, including ${partner}'s.`]}
    onStart=${() => setPhase('play')} label="Start the clock ⏱️" />`;

  return html`
    <div class="stack">
      <div class="row between small muted"><span>${chain.length} songs · ${chain.length * 10} pts</span><span>${Math.ceil(left / 1000)}s</span></div>
      <${Timer} left=${left} total=${60000} />
      <div class="letter" key=${letter + chain.length} aria-label=${`Letter ${letter}`}>${letter}</div>
      <input ref=${inputRef} class="input" autofocus autocomplete="off" autocapitalize="off" spellcheck="false"
        placeholder=${`Song starting with ${letter.toUpperCase()}…`} value=${text} onInput=${(e) => setText(e.target.value)} onKeyDown=${onKey} aria-label="Song name" />
      <div class="sugg">${sugg.map((s) => html`<button onClick=${() => accept(s)}>🎵 ${s}</button>`)}</div>
      ${typed.length >= 2 && typed.startsWith(letter) && sugg.length === 0 && html`<p class="small muted">No song in our list starts like that. Try another.</p>`}
      ${chain.length > 0 && html`<div class="chain">${chain.map((c) => html`<span>${c}</span>`)}</div>`}
      <button class="btn ghost sm" style="margin-left:auto;display:block" onClick=${submit}>I'm done</button>
    </div>`;
}

// ---------- Hum & Guess ----------
function pickMime() {
  if (!window.MediaRecorder) return null;
  for (const m of ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg']) if (MediaRecorder.isTypeSupported(m)) return m;
  return '';
}

export function HumGame({ st, setSt, load, partner, home }) {
  const recorded = !!st.extra.my_clips;
  const guessed = !!(st.my_data && st.my_data.guess);
  const partnerReady = !!st.extra.partner_clips;
  usePoll(load, 4000, !partnerReady || (recorded && guessed));
  return html`
    <div class="stack-lg">
      <section class="panel stack">
        <div class="row between"><h3>1. Hum your 3 songs</h3>${recorded && html`<span class="done-dot">Done ✓</span>`}</div>
        ${!recorded && html`<${Recorder} st=${st} setSt=${setSt} home=${home} partner=${partner} />`}
        ${recorded && html`<p class="muted small">${partner} will hear your hums and guess.</p>`}
      </section>
      <section class="panel stack">
        <div class="row between"><h3>2. Guess ${partner}'s hums</h3>${guessed && html`<span class="done-dot">Done ✓</span>`}</div>
        ${guessed ? html`<p class="muted small">Your guesses are in.</p>` :
          !partnerReady ? html`<p class="muted small pulse">Waiting for ${partner} to record. ${!recorded ? 'Record yours meanwhile.' : ''}</p>` :
          html`<${Guesser} st=${st} setSt=${setSt} />`}
      </section>
      ${recorded && guessed && html`<p class="muted center pulse">Waiting for ${partner} to finish…</p>`}
    </div>`;
}

function Recorder({ st, setSt, home, partner }) {
  const titles = st.extra.my_set || [];
  const [clips, setClips] = useState([null, null, null]);
  const [recIdx, setRecIdx] = useState(-1);
  const [busy, setBusy] = useState(false);
  const recRef = useRef(null);
  const mime = pickMime();

  const startRec = async (i) => {
    if (mime === null) return fail(new Error('Your browser cannot record audio. Try Chrome or Safari.'));
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      const chunks = [];
      rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunks, { type: rec.mimeType || mime || 'audio/webm' });
        setClips((c) => { const n = [...c]; n[i] = { blob, url: URL.createObjectURL(blob) }; return n; });
        setRecIdx(-1);
      };
      rec.start(); recRef.current = rec; setRecIdx(i);
      setTimeout(() => rec.state === 'recording' && rec.stop(), 8000);
    } catch (e) { fail(new Error('Microphone access is needed to hum. Allow it in your browser settings.')); }
  };
  const stopRec = () => recRef.current && recRef.current.state === 'recording' && recRef.current.stop();

  const send = async () => {
    setBusy(true);
    try {
      const uid = (await sb.auth.getUser()).data.user.id;
      const paths = [];
      for (let i = 0; i < 3; i++) {
        const type = clips[i].blob.type.split(';')[0] || 'audio/webm';
        const ext = type.includes('mp4') ? 'm4a' : type.includes('ogg') ? 'ogg' : 'webm';
        const path = `${st.id}/${home.couple.id}/${uid}/${i}.${ext}`;
        const { error } = await sb.storage.from('hums').upload(path, clips[i].blob, { contentType: type, upsert: true });
        if (error) throw error;
        paths.push(path);
      }
      setSt(await rpc('hum_recorded', { p_match: st.id, p_clips: paths }));
      toast(`Sent! ${partner} can guess now.`);
    } catch (e) { fail(e); }
    setBusy(false);
  };

  return html`
    <p class="muted small">Tap ● and hum each song for up to 8 seconds. No lyrics! Hide your screen from ${partner}.</p>
    ${titles.map((t, i) => html`
      <div class="rec">
        <button class=${'recbtn' + (recIdx === i ? ' on' : '')} onClick=${() => (recIdx === i ? stopRec() : startRec(i))}
          disabled=${recIdx !== -1 && recIdx !== i} aria-label=${recIdx === i ? 'Stop recording' : `Record ${t}`}>${recIdx === i ? '■' : clips[i] ? '↻' : '●'}</button>
        <div style="flex:1;min-width:0">
          <b>${t}</b>
          ${clips[i] && html`<audio controls src=${clips[i].url} style="width:100%;height:36px;margin-top:4px"></audio>`}
        </div>
      </div>`)}
    <button class="btn game" onClick=${send} disabled=${busy || clips.some((c) => !c) || recIdx !== -1}>${busy ? 'Sending…' : 'Send my hums 🎤'}</button>`;
}

function Guesser({ st, setSt }) {
  const opts = st.extra.guess_options || [];
  const [urls, setUrls] = useState([]);
  const [picks, setPicks] = useState([null, null, null]);
  const firstPlay = useRef([0, 0, 0]);
  const ms = useRef([null, null, null]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    Promise.all(st.extra.partner_clips.map((p) => sb.storage.from('hums').createSignedUrl(p, 3600)))
      .then((res) => setUrls(res.map((r) => (r.data ? r.data.signedUrl : null))))
      .catch(fail);
  }, []);

  const choose = (i, k) => {
    if (!firstPlay.current[i]) return toast('Play the hum first');
    buzz();
    ms.current[i] = Math.round(performance.now() - firstPlay.current[i]);
    setPicks((p) => { const n = [...p]; n[i] = k; return n; });
  };
  const submit = async () => {
    setBusy(true);
    try { setSt(await rpc('submit_hum_guess', { p_match: st.id, p_picks: picks.map((p, i) => ({ pick: p, ms: ms.current[i] })) })); }
    catch (e) { fail(e); setBusy(false); }
  };

  return html`
    <p class="muted small">Play each hum, then pick the song. Correct = 10, within 6 seconds = +5.</p>
    ${opts.map((o, i) => html`
      <div class="stack" style="padding-top:8px">
        <b>Hum ${i + 1}</b>
        ${urls[i] ? html`<audio controls src=${urls[i]} style="width:100%" onPlay=${() => { if (!firstPlay.current[i]) firstPlay.current[i] = performance.now(); }}></audio>` : html`<p class="small muted pulse">Loading hum…</p>`}
        <div class="opts">
          ${o.map((t, k) => html`<button class=${'choice' + (picks[i] === k ? ' right' : '')} onClick=${() => choose(i, k)}>${t}</button>`)}
        </div>
      </div>`)}
    <button class="btn game" onClick=${submit} disabled=${busy || picks.some((p) => p === null)}>${busy ? 'Checking…' : 'Lock in my guesses'}</button>`;
}
