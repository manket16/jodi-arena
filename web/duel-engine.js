// Game rules for the six couple duels. Pure functions, no DOM: the host phone runs them and sends
// the resulting state to the partner's phone. create() starts a game, act() applies a player's move,
// tick() handles timers. Every function returns a new state object (or the same one if nothing changed).
import { JHOOTH, DRAW, HOTSEAT, SLIDER, BOLTI, MOMO_GOOD, MOMO_TRAP } from './duel-content.js';
import { isNew, initNew, startNew, actNew, tickNew } from './spice-engine.js';

export const META = {
  jhooth: { name: 'Jhooth Pakdo', emo: '🕵️', color: '#7C3AED', soft: '#EDE9FE', sub: 'Tell a truth or a lie. Can your partner read your face?',
    how: ['One of you gets a question and secretly taps Truth or Bluff.', 'Answer it out loud. Your partner has 15 seconds to stare you down.', 'They tap Sach or Jhooth. Fool them to score. First to 3 wins.'] },
  draw: { name: 'Draw It Badly', emo: '✏️', color: '#0891B2', soft: '#CFFAFE', sub: '15 seconds, one finger. Can they guess your doodle?',
    how: ['Pick one of 3 prompts and draw it with your finger in 15 seconds.', 'Your partner watches it appear live and types or shouts guesses.', 'Most drawings guessed after 4 rounds wins. Ties go to the faster jodi.'] },
  momo: { name: 'Steal the Momo', emo: '🥟', color: '#EA580C', soft: '#FFEDD5', sub: 'Snatch the good stuff first. Don’t grab the dirty dishes!',
    how: ['Things drop on the plate every second or so.', 'Tap SNATCH fast for good things (+1). Don’t touch traps like karela (−2).', 'Watch out for fake shakes. First to 5 points wins.'] },
  hotseat: { name: 'Hot Seat', emo: '💣', color: '#DC2626', soft: '#FEE2E2', sub: 'Name 3 things in 5 seconds before your brain freezes!',
    how: ['One of you reads a "Name 3…" question out loud, then taps Start.', 'The other has 5 seconds to shout 3 answers.', 'The reader taps Pass or Choked. 6 rounds, most passes wins.'] },
  slider: { name: 'Mere Hisaab Se', emo: '🎚️', color: '#DB2777', soft: '#FCE7F3', sub: 'Rate your partner 0 to 100. Can they guess your score?',
    how: ['A question about one of you pops up.', 'The other secretly rates them 0–100. They guess the rating.', 'Within 10 points is a bullseye. 6 questions, most bullseyes wins.'] },
  bolti: { name: 'Bolti Bandh', emo: '🤐', color: '#059669', soft: '#D1FAE5', sub: 'Make them say the word without the 3 banned words!',
    how: ['You see a word and 3 words you can’t say. Give clues out loud.', 'Your partner shouts guesses. Tap ✅ when they say it.', 'They can tap CAUGHT YOU if you cheat. 60 seconds each, most words wins.'] },
  camera: { name: 'Camera Roll Roulette', emo: '📸', color: '#E11D5A', soft: '#FFE4EC', sub: '25 seconds to scroll your phone gallery and drop the funniest matching photo!',
    how: ['You both see the same photo challenge. You have 25 seconds to find a matching photo in your gallery.', 'Both photos flip over side by side. Fastest finger gets +1.', 'Each of you votes for the best photo. Agree on a photo and it gets +2. Best of 3 rounds.'] },
  kaunbola: { name: 'Kaun Bola?', emo: '👄', color: '#9333EA', soft: '#F3E8FF', sub: 'Muted mic, dramatic lips! Mouth the secret phrase while your partner tries to read your lips in 20 seconds.',
    how: ['The speaker mouths a secret phrase with no sound, in a funny style.', 'The other one has 20 seconds to read the lips. A hint appears at 10 seconds.', 'Crack it fast for more points. 4 turns, you swap every turn.'] },
};

// How each game earns Sync points: points for a partner who reads you right. Shown in the lobby.
export const SYNC_HOW = {
  jhooth: 'Your partner calls your truth or bluff correctly: +10',
  draw: 'Your partner guesses your drawing: +10, +5 if within 8 seconds',
  momo: 'This one is just for fun, no Sync points',
  hotseat: 'Your partner names 3 right answers about you: +10',
  slider: 'Guess within 10 of their rating: +20, within 20: +10',
  bolti: 'Your partner says the word from your clues: +5 each',
  camera: 'You and your partner pick the same photo, or each pick the other’s: +10 a round',
  kaunbola: 'Your partner reads your lips: +10 or +5 a turn',
};

const WIN = { jhooth: 3, momo: 5 };
export const ROUNDS = { draw: 4, hotseat: 6, slider: 6 };
export const TIMES = { judge: 15000, draw: 15000, guessExtra: 5000, hot: 5000, bolti: 60000, reveal: 2600, momoEvery: 1500, momoShow: 1250, momoShake: 650, momoWindow: 220 };

// ---------- tiny seeded random ----------
function rand(s) {
  let t = (s.seed = (s.seed + 0x6d2b79f5) >>> 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
// Pick an index from a list, avoiding ones already used this game and ones the couple saw recently.
function pick(s, key, n, avoid = []) {
  s.used = s.used || {};
  const used = new Set([...(s.used[key] || []), ...avoid]);
  let pool = [...Array(n).keys()].filter((i) => !used.has(i));
  if (!pool.length) pool = [...Array(n).keys()].filter((i) => !(s.used[key] || []).includes(i));
  if (!pool.length) pool = [...Array(n).keys()];
  const i = pool[Math.floor(rand(s) * pool.length)];
  s.used[key] = [...(s.used[key] || []), i];
  return i;
}

const clone = (s) => JSON.parse(JSON.stringify(s));
export const norm = (t) => String(t || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '');
const other = (i) => 1 - i;

// ---------- create ----------
// players: [hostId, guestId]; names: {id: name}; opts.avoid: {key: [indices seen recently]}
export function create(game, players, opts = {}) {
  const s = {
    game, p: players, names: opts.names || {}, sc: { [players[0]]: 0, [players[1]]: 0 }, rd: 0,
    a: opts.first ?? 0, ph: 'intro', ready: [], stake: opts.stake || '', seed: (opts.seed >>> 0) || 1, sync: 0, gain: 0, over: false, win: null, dl: null, avoid: opts.avoid || {},
  };
  if (game === 'draw') s.time = { [players[0]]: 0, [players[1]]: 0 };
  if (game === 'bolti') s.turn = 0;
  if (isNew(game)) initNew(s, opts);
  return s;
}

function startRound(s, now) {
  if (isNew(s.game)) return startNew(s, now);
  s.rd += 1; s.gain = 0;
  const A = s.p[s.a];
  if (s.game === 'jhooth') { s.q = JHOOTH[pick(s, 'jhooth', JHOOTH.length, s.avoid.jhooth)]; s.ph = 'choose'; s.secret = null; s.verdict = null; s.dl = null; }
  if (s.game === 'hotseat') { s.q = HOTSEAT[pick(s, 'hotseat', HOTSEAT.length, s.avoid.hotseat)]; s.ph = 'read'; s.dl = null; s.result = null; }
  if (s.game === 'slider') {
    s.q = SLIDER[pick(s, 'slider', SLIDER.length, s.avoid.slider)].replaceAll('{S}', s.names[A] || 'your partner');
    s.ph = 'slide'; s.vals = {}; s.dl = null; s.hit = null;
  }
  if (s.game === 'draw') {
    s.choices = [0, 1, 2].map(() => DRAW[pick(s, 'draw', DRAW.length, s.avoid.draw)]);
    s.word = null; s.ph = 'pick'; s.dl = null; s.guessed = null; s.guesses = [];
  }
  if (s.game === 'bolti') { s.ph = 'ready'; s.dl = null; s.words = 0; s.word = null; s.log = []; }
  if (s.game === 'momo') { s.ph = 'play'; s.item = null; s.next = now + 1200; s.n = 0; s.feed = []; }
  return s;
}

function finish(s) {
  const [x, y] = s.p;
  let win = s.sc[x] > s.sc[y] ? x : s.sc[y] > s.sc[x] ? y : null;
  if (!win && s.game === 'draw') win = s.time[x] < s.time[y] ? x : s.time[y] < s.time[x] ? y : null;
  s.ph = 'over'; s.over = true; s.win = win; s.dl = null; s.item = null;
  return s;
}

function nextBolti(s) {
  s.word = BOLTI[pick(s, 'bolti', BOLTI.length, s.avoid.bolti)];
}

// ---------- actions ----------
export function act(state, by, a, now) {
  // after the game: only the winner spins (or writes) the stake, once. Both phones read it from the shared state.
  if (state && state.over && a && a.t === 'spin') {
    const text = String(a.text || '').trim().slice(0, 60);
    if (!state.win || by !== state.win || state.spin || !text) return state;
    const s = clone(state);
    s.spin = { text, rot: Number.isFinite(a.rot) ? a.rot : 0, custom: !!a.custom };
    s.stake = text;
    return s;
  }
  if (!state || state.over || !a) return state;
  const s = clone(state);
  const me = s.p.indexOf(by);
  if (me < 0) return state;
  const isA = me === s.a;

  if (s.ph === 'intro') {
    if (a.t !== 'ready' || s.ready.includes(by)) return state;
    s.ready.push(by);
    if (s.ready.length === 2) { s.ph = 'go'; s.dl = now + 3000; }
    return s;
  }

  if (isNew(s.game)) return actNew(s, by, a, now, me) || state;

  switch (s.game) {
    case 'jhooth':
      if (s.ph === 'choose' && isA && (a.t === 'truth' || a.t === 'bluff')) { s.secret = a.t; s.ph = 'speak'; return s; }
      if (s.ph === 'speak' && isA && a.t === 'spoken') { s.ph = 'judge'; s.dl = now + TIMES.judge; return s; }
      if (s.ph === 'judge' && !isA && (a.t === 'sach' || a.t === 'jhooth')) return judgeJhooth(s, a.t, now);
      return state;

    case 'hotseat':
      if (s.ph === 'read' && isA && a.t === 'start') { s.ph = 'timer'; s.dl = now + TIMES.hot; return s; }
      if ((s.ph === 'timer' || s.ph === 'verdict') && isA && (a.t === 'pass' || a.t === 'choke')) {
        s.result = a.t; if (a.t === 'pass') { s.sc[s.p[other(s.a)]] += 1; s.sync += 10; s.gain = 10; }
        s.ph = 'reveal'; s.dl = now + TIMES.reveal; return s;
      }
      return state;

    case 'slider':
      if (s.ph === 'slide' && a.t === 'val' && Number.isFinite(+a.v) && !(by in s.vals)) {
        s.vals[by] = Math.max(0, Math.min(100, Math.round(+a.v)));
        if (Object.keys(s.vals).length === 2) {
          const subj = s.p[s.a], rater = s.p[other(s.a)];
          s.gap = Math.abs(s.vals[subj] - s.vals[rater]); s.hit = s.gap <= 10;
          if (s.hit) s.sc[subj] += 1;
          s.gain = s.gap <= 10 ? 20 : s.gap <= 20 ? 10 : 0; s.sync += s.gain;
          s.ph = 'reveal'; s.dl = null;
        }
        return s;
      }
      if (s.ph === 'reveal' && a.t === 'next') return advance(s, now);
      return state;

    case 'draw':
      if (s.ph === 'pick' && isA && a.t === 'word' && s.choices[a.i]) { s.word = s.choices[a.i]; s.ph = 'draw'; s.t0 = now; s.dl = now + TIMES.draw + TIMES.guessExtra; return s; }
      if (s.ph === 'draw') {
        const B = s.p[other(s.a)], A = s.p[s.a];
        if (!isA && a.t === 'guess') {
          const g = String(a.text || '').slice(0, 40);
          s.guesses = [...s.guesses.slice(-5), g];
          if (norm(g) && (norm(s.word).includes(norm(g)) && norm(g).length >= Math.min(4, norm(s.word).length) || norm(g) === norm(s.word))) return drawGuessed(s, A, now);
          return s;
        }
        if (isA && a.t === 'got') return drawGuessed(s, A, now);
        void B;
      }
      return state;

    case 'bolti':
      if (s.ph === 'ready' && isA && a.t === 'start') { s.ph = 'play'; s.dl = now + TIMES.bolti; nextBolti(s); return s; }
      if (s.ph === 'play') {
        const A = s.p[s.a];
        if (isA && a.t === 'got') { s.sc[A] += 1; s.words += 1; s.sync += 5; s.log.push(['✅', s.word[0]]); nextBolti(s); return s; }
        if (isA && a.t === 'skip') { s.log.push(['⏭️', s.word[0]]); nextBolti(s); return s; }
        if (!isA && a.t === 'caught') { s.sc[A] -= 1; s.log.push(['🚨', s.word[0]]); s.caught = now; nextBolti(s); return s; }
      }
      return state;

    case 'momo':
      if (s.ph === 'play' && a.t === 'snatch' && s.item && a.id === s.item.id && !s.item.taken) {
        const rt = Math.max(30, Math.min(5000, +a.rt || 5000));
        s.item.taps = { ...(s.item.taps || {}), [by]: Math.min(rt, (s.item.taps || {})[by] ?? Infinity) };
        if (!s.item.decideAt) s.item.decideAt = now + TIMES.momoWindow;
        return s;
      }
      return state;
  }
  return state;
}

function judgeJhooth(s, call, now) {
  const A = s.p[s.a], B = s.p[other(s.a)];
  const right = (call === 'sach' && s.secret === 'truth') || (call === 'jhooth' && s.secret === 'bluff');
  s.verdict = { call, right, secret: s.secret };
  s.sc[right ? B : A] += 1;
  if (right) { s.sync += 10; s.gain = 10; }
  s.ph = 'reveal'; s.dl = now + TIMES.reveal;
  return s;
}

function drawGuessed(s, A, now) {
  s.guessed = true; s.sc[A] += 1; s.time[A] += now - s.t0;
  s.gain = now - s.t0 < 8000 ? 15 : 10; s.sync += s.gain;
  s.ph = 'reveal'; s.dl = now + TIMES.reveal;
  return s;
}

function advance(s, now) {
  const g = s.game;
  if (WIN[g] && Object.values(s.sc).some((v) => v >= WIN[g])) return finish(s);
  if (ROUNDS[g] && s.rd >= ROUNDS[g]) return finish(s);
  if (g === 'bolti') { s.turn += 1; if (s.turn >= 2) return finish(s); }
  s.a = other(s.a);
  return startRound(s, now);
}

// ---------- timers (host only, call every ~100ms) ----------
export function tick(state, now) {
  const s0 = state;
  if (!s0 || s0.over) return s0;
  if (s0.ph === 'go' && now >= s0.dl) return startRound(clone(s0), now);

  if (isNew(s0.game)) return tickNew(s0, now);
  if (s0.game === 'momo' && s0.ph === 'play') return tickMomo(s0, now);
  if (!s0.dl || now < s0.dl) return s0;
  const s = clone(s0);
  switch (s.ph) {
    case 'judge': return judgeJhooth(s, null, now); // no call in time: the bluffer scores
    case 'timer': s.ph = 'verdict'; s.dl = null; return s;
    case 'draw': if (s.guessed === null) { s.guessed = false; s.time[s.p[s.a]] += TIMES.draw + TIMES.guessExtra; } s.ph = 'reveal'; s.dl = now + TIMES.reveal; return s;
    case 'play': if (s.game === 'bolti') { s.ph = 'reveal'; s.dl = now + TIMES.reveal + 1400; return s; } return s0;
    case 'reveal': return advance(s, now);
  }
  return s0;
}

function tickMomo(s0, now) {
  const it = s0.item;
  // decide a snatch once the short fairness window closes: fastest reaction wins
  if (it && it.decideAt && !it.taken && now >= it.decideAt) {
    const s = clone(s0);
    const taps = Object.entries(s.item.taps).sort((x, y) => x[1] - y[1]);
    const [who] = taps[0];
    s.item.taken = who;
    s.sc[who] += s.item.good ? 1 : -2;
    s.feed = [{ who, e: s.item.e, good: s.item.good }, ...s.feed].slice(0, 6);
    s.item.goneAt = now + 700;
    if (Object.values(s.sc).some((v) => v >= WIN.momo)) { s.item.final = true; }
    return s;
  }
  if (it && it.final && now >= it.goneAt) return finish(clone(s0));
  if (it && ((it.taken && now >= it.goneAt) || (!it.taken && !it.decideAt && now >= it.revealAt + TIMES.momoShow))) {
    const s = clone(s0); s.item = null; s.next = now + 250 + Math.floor(rand(s) * 600); return s;
  }
  if (!it && now >= s0.next) {
    const s = clone(s0);
    if (s.n >= 60) return finish(s);
    s.n += 1;
    const good = rand(s) < 0.62;
    const list = good ? MOMO_GOOD : MOMO_TRAP;
    const [e, label] = list[Math.floor(rand(s) * list.length)];
    const shake = rand(s) < 0.45; // the plate wobbles first: could be a momo, could be karela
    s.item = { id: s.n, e, label, good, shake, revealAt: now + (shake ? TIMES.momoShake : 0) };
    return s;
  }
  return s0;
}

// What each phone should show, so the UI can say who does what. Returns null for the intro.
export function role(s, uid) {
  if (!s) return null;
  const i = s.p.indexOf(uid);
  return { me: uid, partner: s.p[other(i)], isA: i === s.a, A: s.p[s.a], B: s.p[other(s.a)] };
}
