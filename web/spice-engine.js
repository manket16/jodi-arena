// Rules for the two spice games, "camera" (Camera Roll Roulette) and "kaunbola" (Kaun Bola?).
// Same shape as duel-engine.js: pure functions the host phone runs. Photos and video clips never live in the
// state: photos travel over the live channel, clips go through short-lived storage.
import { CAMERA, KAUN, MODS, DECOY_BANK } from './spice-content.js';
import { SCAV } from './ld-content.js';

export const NEW_GAMES = ['camera', 'kaunbola'];
export const isNew = (g) => NEW_GAMES.includes(g);
export const CAM_ROUNDS = 3, KAUN_TURNS = 4;
export const NT = { scramble: 25000, scav: 45000, vote: 22000, score: 5200, guess: 20000, hint: 10000, reveal: 7500 };

const clone = (s) => JSON.parse(JSON.stringify(s));
const norm = (t) => String(t || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '');
function rand(s) {
  let t = (s.seed = (s.seed + 0x6d2b79f5) >>> 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const shuffle = (s, a) => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(rand(s) * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };

// pick an unused prompt: ids already used by this couple (usedIds) or in this match are skipped; when the pool is empty it resets
function pickId(s, prefix, n) {
  const used = new Set([...(s.usedIds || []), ...(s.newIds || [])]);
  let pool = [...Array(n).keys()].filter((i) => !used.has(prefix + i));
  if (!pool.length) {
    s.reset = s.reset || prefix;
    pool = [...Array(n).keys()].filter((i) => !(s.newIds || []).includes(prefix + i));
    if (!pool.length) pool = [...Array(n).keys()];
  }
  const i = pool[Math.floor(rand(s) * pool.length)];
  s.newIds = [...(s.newIds || []), prefix + i];
  return i;
}

export function initNew(s, o) {
  s.level = [1, 2, 3].includes(+o.level) ? +o.level : 1;
  s.mode = o.mode === 'video' ? 'video' : 'couch';
  s.customs = (o.customs || []).map((x) => String(x || '').trim().slice(0, 140)).filter(Boolean).slice(0, 2);
  s.usedIds = (o.used || []).slice(0, 80); s.newIds = [];
  if (s.game === 'camera' || s.game === 'scavenger') { s.lock = {}; s.votes = {}; }
  return s;
}

export function startNew(s, now) {
  s.rd += 1; s.gain = 0;
  if (s.game === 'scavenger') {
    // Photo Hunt: same photo rounds as Camera Roll Roulette, but you snap a fresh photo and get 45 seconds
    s.lock = {}; s.votes = {}; s.rres = null; s.speed = null;
    s.used = s.used || {};
    const seen = [...(s.used.scavenger || []), ...((s.avoid && s.avoid.scavenger) || [])];
    let pool = [...Array(SCAV.length).keys()].filter((i) => !seen.includes(i));
    if (!pool.length) pool = [...Array(SCAV.length).keys()].filter((i) => !(s.used.scavenger || []).includes(i));
    const i = pool[Math.floor(rand(s) * pool.length)];
    s.used.scavenger = [...(s.used.scavenger || []), i];
    s.q = SCAV[i];
    s.ph = 'scramble'; s.dl = now + NT.scav;
    return s;
  }
  if (s.game === 'camera') {
    s.lock = {}; s.votes = {}; s.rres = null; s.speed = null;
    const custom = s.rd >= 2 ? s.customs[s.rd - 2] : null; // a partner's secret prompt is slipped into round 2
    s.q = custom || CAMERA[s.level][pickId(s, `cr${s.level}:`, CAMERA[s.level].length)];
    s.ph = 'scramble'; s.dl = now + NT.scramble;
    return s;
  }
  // kaunbola: s.a is the speaker this turn
  const i = pickId(s, `kb${s.level}:`, KAUN[s.level].length);
  setPhrase(s, KAUN[s.level][i].w, KAUN[s.level][i].d);
  s.mod = MODS[Math.floor(rand(s) * MODS.length)];
  s.ph = 'prep'; s.dl = null; s.cracked = []; s.hint = false; s.tries = 0; s.clip = null; s.res = null; s.t0 = null;
  return s;
}

function setPhrase(s, text, decoys) {
  s.words = text.split(/\s+/).filter(Boolean);
  const real = new Set(s.words.map(norm));
  const want = Math.max(3, Math.min(6, 10 - s.words.length));
  const pool = [...(decoys || []), ...shuffle(s, DECOY_BANK)].filter((w, i, a) => !real.has(norm(w)) && a.findIndex((x) => norm(x) === norm(w)) === i);
  s.chips = shuffle(s, [...s.words, ...pool.slice(0, want)]);
}

function finish(s) {
  const [x, y] = s.p;
  s.win = s.sc[x] > s.sc[y] ? x : s.sc[y] > s.sc[x] ? y : null;
  s.ph = 'over'; s.over = true; s.dl = null;
  return s;
}

function toVote(s, now) {
  const locked = Object.keys(s.lock);
  if (locked.length === 0) { s.rres = { k: 'none' }; s.ph = 'score'; s.dl = now + NT.score; return s; }
  if (locked.length === 1) { s.sc[locked[0]] += 3; s.rres = { k: 'solo', who: locked[0] }; s.ph = 'score'; s.dl = now + NT.score; return s; }
  s.speed = locked.sort((a, b) => s.lock[a] - s.lock[b])[0];
  s.sc[s.speed] += 1;
  s.ph = 'vote'; s.dl = now + NT.vote;
  return s;
}
function resolveVotes(s, now) {
  const [x, y] = s.p;
  const vx = s.votes[x] || x, vy = s.votes[y] || y; // no vote counts as backing your own photo
  if (vx === vy) { s.sc[vx] += 2; s.rres = { k: 'agree', who: vx }; s.gain = 10; }
  else if (vx === y && vy === x) { s.sc[x] += 2; s.sc[y] += 2; s.rres = { k: 'kind' }; s.gain = 10; }
  else s.rres = { k: 'stubborn' };
  s.sync += s.gain; s.ph = 'score'; s.dl = now + NT.score;
  return s;
}
function crack(s, now) {
  const pts = s.hint || now - s.t0 >= NT.hint ? 10 : 20;
  s.sc[s.p[1 - s.a]] += pts; s.sync += pts / 2; s.gain = pts / 2;
  s.res = { ok: true, pts }; s.ph = 'reveal'; s.dl = now + NT.reveal;
  return s;
}

export function actNew(s, by, a, now, me) {
  const isA = me === s.a;
  if (s.game === 'camera' || s.game === 'scavenger') {
    if (s.ph === 'scramble' && a.t === 'lock' && !(by in s.lock)) {
      s.lock[by] = now;
      return Object.keys(s.lock).length === 2 ? toVote(s, now) : s;
    }
    if (s.ph === 'vote' && a.t === 'vote' && s.p.includes(a.for) && !(by in s.votes)) {
      s.votes[by] = a.for;
      return Object.keys(s.votes).length === 2 ? resolveVotes(s, now) : s;
    }
    return null;
  }
  if (s.ph === 'prep' && isA) {
    if (a.t === 'own') {
      const w = String(a.text || '').trim().split(/\s+/).filter(Boolean).slice(0, 6);
      if (!w.length) return null;
      setPhrase(s, w.join(' ').slice(0, 80), []); s.own = true; return s;
    }
    if (a.t === 'start' && s.mode === 'couch') { s.ph = 'guess'; s.t0 = now; s.dl = now + NT.guess; return s; }
    if (a.t === 'clip' && s.mode === 'video' && typeof a.path === 'string') { s.clip = { path: a.path.slice(0, 120) }; s.ph = 'guess'; s.t0 = now; s.dl = now + NT.guess; return s; }
    return null;
  }
  if (s.ph === 'guess') {
    if (s.mode === 'couch' && isA) {
      if (a.t === 'tick' && s.words[a.i] !== undefined) {
        s.cracked = s.cracked.includes(a.i) ? s.cracked.filter((k) => k !== a.i) : [...s.cracked, a.i];
        return s.cracked.length === s.words.length ? crack(s, now) : s;
      }
      if (a.t === 'all') return crack(s, now);
    }
    if (s.mode === 'video' && !isA && a.t === 'submit' && Array.isArray(a.w)) {
      if (norm(a.w.join('')) === norm(s.words.join(''))) return crack(s, now);
      s.tries += 1; return s;
    }
  }
  return null;
}

export function tickNew(s0, now) {
  if (!s0.dl && s0.ph !== 'guess') return s0;
  if (s0.game === 'kaunbola' && s0.ph === 'guess' && !s0.hint && now >= s0.t0 + NT.hint) { const s = clone(s0); s.hint = true; return s; }
  if (!s0.dl || now < s0.dl) return s0;
  const s = clone(s0);
  if (s.game === 'camera' || s.game === 'scavenger') {
    if (s.ph === 'scramble') return toVote(s, now);
    if (s.ph === 'vote') return resolveVotes(s, now);
    if (s.ph === 'score') {
      if (s.rd >= CAM_ROUNDS) return finish(s);
      s.ph = 'go'; s.dl = now + 3000; return s;
    }
    return s0;
  }
  if (s.ph === 'guess') { s.res = { ok: false, pts: 0 }; s.ph = 'reveal'; s.dl = now + NT.reveal; return s; }
  if (s.ph === 'reveal') {
    if (s.rd >= KAUN_TURNS) return finish(s);
    s.a = 1 - s.a;
    return startNew(s, now);
  }
  return s0;
}
