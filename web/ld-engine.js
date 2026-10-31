// Rules for the two long-distance games that live inside the duel engine: Quick Quiz ('quiz') and
// Listen Together ('listen'). Pure functions run by the host phone, same shape as duel-engine.js.
// The Photo Hunt ('scavenger') reuses the photo-round rules in spice-engine.js.
import { QUIZ, SONGS } from './ld-content.js';

export const LD_GAMES = ['quiz', 'listen'];
export const isLD = (g) => LD_GAMES.includes(g);
export const QUIZ_ROUNDS = 8, LISTEN_ROUNDS = 3;
export const LT = { ask: 12000, reveal: 3200, wait: 8000, listen: 40000, react: 25000, rrev: 7000 };

const clone = (s) => JSON.parse(JSON.stringify(s));
function rand(s) {
  let t = (s.seed = (s.seed + 0x6d2b79f5) >>> 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
// pick an index not used in this game or seen recently by this couple
function pickIdx(s, key, n) {
  s.used = s.used || {};
  const mine = s.used[key] || [];
  const avoid = (s.avoid && s.avoid[key]) || [];
  let pool = [...Array(n).keys()].filter((i) => !mine.includes(i) && !avoid.includes(i));
  if (!pool.length) pool = [...Array(n).keys()].filter((i) => !mine.includes(i));
  if (!pool.length) pool = [...Array(n).keys()];
  const i = pool[Math.floor(rand(s) * pool.length)];
  s.used[key] = [...mine, i];
  return i;
}
const shuffle = (s, a) => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(rand(s) * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };

function finish(s) {
  const [x, y] = s.p;
  s.win = s.sc[x] > s.sc[y] ? x : s.sc[y] > s.sc[x] ? y : null;
  s.ph = 'over'; s.over = true; s.dl = null;
  return s;
}

export function initLD(s) { s.ans = {}; s.feels = {}; return s; }

export function startLD(s, now) {
  s.rd += 1; s.gain = 0;
  if (s.game === 'quiz') {
    const [q, o, a] = QUIZ[pickIdx(s, 'quiz', QUIZ.length)];
    const ord = shuffle(s, [0, 1, 2, 3]);
    s.q = q; s.o = ord.map((i) => o[i]); s.right = ord.indexOf(a);
    s.ans = {}; s.rr = null; s.t0 = now; s.ph = 'ask'; s.dl = now + LT.ask;
    return s;
  }
  // listen: s.a picks the song this round
  const idx = [];
  while (idx.length < 4) { const i = pickIdx(s, 'listen', SONGS.length); if (!idx.includes(i)) idx.push(i); }
  s.choices = idx.map((i) => SONGS[i]); s.song = null; s.feels = {}; s.rr = null; s.t0 = null;
  s.ph = 'pick'; s.dl = null;
  return s;
}

function resolveQuiz(s, now) {
  const [x, y] = s.p;
  const ok = (p) => s.ans[p] && s.ans[p].i === s.right;
  const gotX = ok(x), gotY = ok(y);
  if (gotX) s.sc[x] += 1;
  if (gotY) s.sc[y] += 1;
  let fast = null;
  if (gotX && gotY && s.ans[x].at !== s.ans[y].at) { fast = s.ans[x].at < s.ans[y].at ? x : y; s.sc[fast] += 1; }
  s.rr = { gotX, gotY, fast };
  s.ph = 'reveal'; s.dl = now + LT.reveal;
  return s;
}

function resolveListen(s, now) {
  const [x, y] = s.p;
  const hit = (p, o) => !!(s.feels[p] && s.feels[o] && s.feels[p].guess === s.feels[o].mine);
  const hx = hit(x, y), hy = hit(y, x);
  if (hx) s.sc[x] += 1;
  if (hy) s.sc[y] += 1;
  s.gain = (hx ? 10 : 0) + (hy ? 10 : 0); s.sync += s.gain;
  s.rr = { hx, hy };
  s.ph = 'rrev'; s.dl = now + LT.rrev;
  return s;
}

export function actLD(s, by, a, now, me) {
  const isA = me === s.a;
  if (s.game === 'quiz') {
    if (s.ph === 'ask' && a.t === 'ans' && Number.isInteger(a.i) && a.i >= 0 && a.i < 4 && !(by in s.ans)) {
      s.ans[by] = { i: a.i, at: now - s.t0 };
      return Object.keys(s.ans).length === 2 ? resolveQuiz(s, now) : s;
    }
    return null;
  }
  if (s.ph === 'pick' && isA && a.t === 'song' && s.choices[a.i]) {
    s.song = s.choices[a.i]; s.t0 = now + LT.wait; s.ph = 'wait'; s.dl = s.t0 + LT.listen;
    return s;
  }
  if (s.ph === 'react' && a.t === 'feel' && Number.isInteger(a.m) && Number.isInteger(a.g) && a.m >= 0 && a.m < 8 && a.g >= 0 && a.g < 8 && !(by in s.feels)) {
    s.feels[by] = { mine: a.m, guess: a.g };
    return Object.keys(s.feels).length === 2 ? resolveListen(s, now) : s;
  }
  return null;
}

export function tickLD(s0, now) {
  if (!s0.dl || now < s0.dl) return s0;
  const s = clone(s0);
  if (s.game === 'quiz') {
    if (s.ph === 'ask') return resolveQuiz(s, now);
    if (s.ph === 'reveal') { if (s.rd >= QUIZ_ROUNDS) return finish(s); s.a = 1 - s.a; return startLD(s, now); }
    return s0;
  }
  if (s.ph === 'wait') { s.ph = 'react'; s.dl = now + LT.react; return s; }
  if (s.ph === 'react') return resolveListen(s, now);
  if (s.ph === 'rrev') { if (s.rd >= LISTEN_ROUNDS) return finish(s); s.a = 1 - s.a; return startLD(s, now); }
  return s0;
}
