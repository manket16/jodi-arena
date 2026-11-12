// Rules for the six Shart games. Pure functions run by the host phone, same shape as duel-engine.js:
// initSG() sets up, startSG() starts a round, actSG() applies a move, tickSG() handles timers.
//   xo     Infinite Cross-Zero   3x3, you keep only 3 pieces, the oldest vanishes. First to 2 rounds.
//   sniper Hidden Grid Sniper    hide 2 treats + 1 trap on a 4x4 grid, then take turns finding theirs.
//   sketch Ganda Sketch          one draws a 2-word prompt, the other spells it with letter tiles. 4 sketches.
//   vault  Secret Emoji Vault    one sets a 3-emoji code, the other has 5 tries. Swap once.
//   tug    Tug-of-War            pull on green, freeze on red. 60 seconds.
//   wheel  Mystery Wheel         5 spins: coin hide, who-is-more, reflex tap, micro-dare.
import { SKETCH, SKETCH_BY, WHO, DARES } from './sg-content.js';

export const SG_GAMES = ['xo', 'sniper', 'sketch', 'vault', 'tug', 'wheel'];
export const isSG = (g) => SG_GAMES.includes(g);
export const SGT = {
  xoTurn: 5000, xoReveal: 2400, xoWins: 2, xoMaxRounds: 5, xoMaxMoves: 40,
  hide: 12000, shot: 7000, shotShow: 900,
  sketch: 20000, sketchRounds: 4, sketchReveal: 2800,
  vSet: 15000, vCrack: 45000, vTries: 5, vReveal: 3200,
  tug: 60000, tugGoal: 25, tugGrace: 250,
  spin: 2600, coin: 7000, who: 6000, tapMin: 1500, tapMax: 4000, tapWindow: 350, tapEnd: 4000, dare: 15000, wReveal: 2600, spins: 5,
};
export const WHEEL = ['coin', 'who', 'tap', 'dare', 'coin', 'who', 'tap', 'dare'];

const clone = (s) => JSON.parse(JSON.stringify(s));
const other = (i) => 1 - i;
function rand(s) {
  let t = (s.seed = (s.seed + 0x6d2b79f5) >>> 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const ri = (s, n) => Math.floor(rand(s) * n);
function pickFrom(s, key, list) {
  s.used = s.used || {};
  const mine = s.used[key] || [];
  const avoid = (s.avoid && s.avoid[key]) || [];
  let pool = [...Array(list.length).keys()].filter((i) => !mine.includes(i) && !avoid.includes(i));
  if (!pool.length) pool = [...Array(list.length).keys()].filter((i) => !mine.includes(i));
  if (!pool.length) pool = [...Array(list.length).keys()];
  const i = pool[ri(s, pool.length)];
  s.used[key] = [...mine, i];
  return list[i];
}
const shuffle = (s, a) => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = ri(s, i + 1); [b[i], b[j]] = [b[j], b[i]]; } return b; };

function finish(s) {
  const [x, y] = s.p;
  let win = s.sc[x] > s.sc[y] ? x : s.sc[y] > s.sc[x] ? y : null;
  if (!win && s.game === 'sketch' && s.time) win = s.time[x] < s.time[y] ? x : s.time[y] < s.time[x] ? y : null;
  s.win = win; s.ph = 'over'; s.over = true; s.dl = null;
  return s;
}

export function initSG(s, opts = {}) {
  s.obs = (opts.dna && opts.dna.obs) || null;
  if (s.game === 'sketch') s.time = { [s.p[0]]: 0, [s.p[1]]: 0 };
  if (s.game === 'tug') s.pos = 0;
  return s;
}

// ---------- start a round ----------
export function startSG(s, now) {
  s.rd += 1; s.gain = 0; s.rr = null;
  const g = s.game;
  if (g === 'xo') {
    s.board = Array(9).fill(null); s.q = [[], []]; s.turn = s.a; s.moves = 0; s.line = null; s.idle = 0;
    s.ph = 'play'; s.dl = now + SGT.xoTurn;
  } else if (g === 'sniper') {
    s.hid = [null, null]; s.shots = [{}, {}]; s.turn = s.a; s.skip = [false, false]; s.last = null; s.idle = 0;
    s.ph = 'hide'; s.dl = now + SGT.hide;
  } else if (g === 'sketch') {
    const list = [...SKETCH, ...((s.obs && SKETCH_BY[s.obs]) || [])];
    s.word = pickFrom(s, 'sketch', list);
    const letters = s.word.toUpperCase().replace(/[^A-Z]/g, '').split('');
    const decoy = 'AEIOURSTLNMKP'.split('');
    const extra = [0, 1, 2].map(() => decoy[ri(s, decoy.length)]);
    s.tiles = shuffle(s, [...letters, ...extra]);
    s.len = s.word.split(' ').map((w) => w.replace(/[^A-Za-z]/g, '').length);
    s.guessed = null; s.wrong = 0; s.t0 = now;
    s.ph = 'draw'; s.dl = now + SGT.sketch;
  } else if (g === 'vault') {
    s.code = null; s.tries = []; s.cracked = null;
    s.ph = 'set'; s.dl = now + SGT.vSet;
  } else if (g === 'tug') {
    s.pos = 0; s.light = 'green'; s.lightAt = now; s.prev = null; s.nextLight = now + 1800 + ri(s, 2200); s.slips = [];
    s.ph = 'play'; s.end = now + SGT.tug; s.dl = s.end;
  } else if (g === 'wheel') {
    const seg = ri(s, WHEEL.length);
    s.seg = seg; s.kind = WHEEL[seg]; s.spinRot = (s.spinRot || 0) + 1440 + (360 - (seg * 360) / WHEEL.length - 180 / WHEEL.length) - ((s.spinRot || 0) % 360);
    s.pick = {}; s.hand = null; s.taps = {}; s.early = null; s.decideAt = null; s.goAt = null;
    s.card = s.kind === 'who' ? pickFrom(s, 'who', WHO) : null;
    s.dare = s.kind === 'dare' ? pickFrom(s, 'dare', DARES) : null;
    s.ph = 'spin'; s.dl = now + SGT.spin;
  }
  return s;
}

// ---------- Cross-Zero ----------
const LINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
function xoLine(b, who) { return LINES.find((l) => l.every((c) => b[c] === who)) || null; }
function xoNext(s, now) { s.turn = other(s.turn); s.dl = now + SGT.xoTurn; return s; }
function xoRoundEnd(s, now, winner) {
  if (winner !== null) s.sc[s.p[winner]] += 1;
  s.rr = { w: winner };
  s.ph = 'reveal'; s.dl = now + SGT.xoReveal;
  return s;
}

// ---------- Grid Sniper ----------
function randHide(s) {
  const cells = shuffle(s, [...Array(16).keys()]);
  return { treats: [cells[0], cells[1]], trap: cells[2] };
}
function validHide(h) {
  if (!h || !Array.isArray(h.treats) || h.treats.length !== 2) return false;
  const all = [...h.treats, h.trap];
  return all.every((c) => Number.isInteger(c) && c >= 0 && c < 16) && new Set(all).size === 3;
}
function sniperTurn(s, now, next) {
  // a player who hit the trap sits out their next turn
  if (s.skip[next]) { s.skip[next] = false; next = other(next); }
  s.turn = next; s.dl = now + SGT.shot;
  return s;
}

// ---------- Vault ----------
function vaultScore(code, guess) {
  return guess.map((e, i) => (code[i] === e ? 'g' : code.includes(e) ? 'y' : 'x'));
}
function vaultEnd(s, now, cracked) {
  const setter = s.p[s.a], breaker = s.p[other(s.a)];
  s.cracked = cracked;
  if (cracked) s.sc[breaker] += SGT.vTries + 1 - s.tries.length; else s.sc[setter] += 2;
  s.ph = 'reveal'; s.dl = now + SGT.vReveal;
  return s;
}

// ---------- Wheel ----------
function wheelEnd(s, now, rr) {
  s.rr = rr;
  s.ph = 'reveal'; s.dl = now + SGT.wReveal;
  return s;
}
function decideTap(s, now) {
  const taps = Object.entries(s.taps).sort((a, b) => a[1] - b[1]);
  const who = taps.length ? taps[0][0] : null;
  if (who) s.sc[who] += 1;
  return wheelEnd(s, now, { tapWin: who, rts: s.taps });
}

// ---------- moves ----------
export function actSG(s, by, a, now, me) {
  const g = s.game;
  const isA = me === s.a;

  if (g === 'xo') {
    if (s.ph !== 'play' || a.t !== 'xo' || me !== s.turn) return null;
    const c = a.c;
    if (!Number.isInteger(c) || c < 0 || c > 8 || s.board[c] !== null) return null;
    s.board[c] = me; s.q[me].push(c); s.moves += 1; s.idle = 0;
    if (s.q[me].length > 3) { const old = s.q[me].shift(); s.board[old] = null; }
    const line = xoLine(s.board, me);
    if (line) { s.line = line; return xoRoundEnd(s, now, me); }
    if (s.moves >= SGT.xoMaxMoves) return xoRoundEnd(s, now, null);
    return xoNext(s, now);
  }

  if (g === 'sniper') {
    if (s.ph === 'hide' && a.t === 'hide' && !s.hid[me] && validHide(a)) {
      s.hid[me] = { treats: a.treats, trap: a.trap };
      if (s.hid[0] && s.hid[1]) { s.ph = 'shoot'; s.turn = s.a; s.dl = now + SGT.shot; }
      return s;
    }
    if (s.ph === 'shoot' && a.t === 'shot' && me === s.turn) {
      const c = a.c, them = other(me);
      if (!Number.isInteger(c) || c < 0 || c > 15 || s.shots[me][c]) return null;
      const h = s.hid[them];
      const res = h.treats.includes(c) ? 'treat' : h.trap === c ? 'trap' : 'miss';
      s.shots[me][c] = res; s.last = { by: me, c, res, at: now }; s.idle = 0;
      if (res === 'treat') {
        s.sc[s.p[me]] += 1;
        if (s.sc[s.p[me]] >= 2) { s.rr = { w: me }; s.ph = 'reveal'; s.dl = now + SGT.xoReveal; return s; }
        s.dl = now + SGT.shot; // bonus turn
        return s;
      }
      if (res === 'trap') s.skip[me] = true;
      return sniperTurn(s, now, them);
    }
    return null;
  }

  if (g === 'sketch') {
    if (s.ph === 'draw' && !isA && a.t === 'spell') {
      const w = String(a.w || '').toUpperCase().replace(/[^A-Z]/g, '');
      if (w && w === s.word.toUpperCase().replace(/[^A-Z]/g, '')) {
        const A = s.p[s.a], B = s.p[other(s.a)], took = now - s.t0;
        s.guessed = true; s.sc[A] += 1; s.time[A] += took;
        if (took < 8000) s.sc[B] += 1; // quick guess bonus for the guesser
        s.took = took; s.ph = 'reveal'; s.dl = now + SGT.sketchReveal;
        return s;
      }
      s.wrong += 1;
      return s;
    }
    return null;
  }

  if (g === 'vault') {
    const ok = (arr) => Array.isArray(arr) && arr.length === 3 && arr.every((e) => Number.isInteger(e) && e >= 0 && e < 6);
    if (s.ph === 'set' && isA && a.t === 'code' && ok(a.code) && new Set(a.code).size === 3) {
      s.code = a.code; s.ph = 'crack'; s.dl = now + SGT.vCrack;
      return s;
    }
    if (s.ph === 'crack' && !isA && a.t === 'try' && ok(a.g) && s.tries.length < SGT.vTries) {
      const fb = vaultScore(s.code, a.g);
      s.tries.push({ g: a.g, fb });
      if (fb.every((x) => x === 'g')) return vaultEnd(s, now, true);
      if (s.tries.length >= SGT.vTries) return vaultEnd(s, now, false);
      return s;
    }
    return null;
  }

  if (g === 'tug') {
    if (s.ph !== 'play' || a.t !== 'pull') return null;
    const n = Math.max(0, Math.min(12, a.n | 0));
    if (!n) return null;
    const at = Number.isFinite(a.at) ? Math.min(now, a.at) : now;
    const dir = me === 0 ? 1 : -1;
    // a tap made just before the light turned red still counts (phone-to-phone delay)
    const red = s.light === 'red' && at >= s.lightAt + SGT.tugGrace;
    if (red) { s.pos -= dir * 3; s.slips = [...s.slips.slice(-3), { who: me, at: now }]; }
    else s.pos += dir * n;
    s.pos = Math.max(-SGT.tugGoal, Math.min(SGT.tugGoal, s.pos));
    if (Math.abs(s.pos) >= SGT.tugGoal) { s.sc[s.p[s.pos > 0 ? 0 : 1]] = 1; return finish(s); }
    return s;
  }

  if (g === 'wheel') {
    if (s.kind === 'coin') {
      if (s.ph === 'hide' && isA && a.t === 'hand' && (a.h === 'L' || a.h === 'R')) { s.hand = a.h; s.ph = 'guess'; s.dl = now + SGT.coin; return s; }
      if (s.ph === 'guess' && !isA && a.t === 'hand' && (a.h === 'L' || a.h === 'R')) {
        const right = a.h === s.hand;
        s.sc[s.p[right ? other(s.a) : s.a]] += 1;
        return wheelEnd(s, now, { guess: a.h, right });
      }
      return null;
    }
    if (s.kind === 'who' && s.ph === 'who' && a.t === 'who' && (a.w === 0 || a.w === 1) && !(by in s.pick)) {
      s.pick[by] = a.w; // 0 = host, 1 = guest
      if (Object.keys(s.pick).length === 2) {
        const same = s.pick[s.p[0]] === s.pick[s.p[1]];
        if (same) { s.sc[s.p[0]] += 1; s.sc[s.p[1]] += 1; s.gain = 10; s.sync += 10; }
        return wheelEnd(s, now, { same, pick: s.pick });
      }
      return s;
    }
    if (s.kind === 'tap' && s.ph === 'tap' && a.t === 'tap' && !(by in s.taps) && !s.early) {
      if (a.early) { s.early = by; s.sc[s.p[other(me)]] += 1; return wheelEnd(s, now, { early: by }); }
      s.taps[by] = Math.max(60, Math.min(5000, +a.rt || 5000));
      if (!s.decideAt) s.decideAt = now + SGT.tapWindow;
      return s;
    }
    if (s.kind === 'dare' && s.ph === 'dare' && !isA && (a.t === 'done' || a.t === 'chicken')) {
      const done = a.t === 'done';
      s.sc[s.p[done ? s.a : other(s.a)]] += 1;
      return wheelEnd(s, now, { done });
    }
    return null;
  }
  return null;
}

// ---------- timers ----------
function nextRound(s, now) {
  const g = s.game;
  if (g === 'xo') {
    if (Object.values(s.sc).some((v) => v >= SGT.xoWins) || s.rd >= SGT.xoMaxRounds) return finish(s);
  }
  if (g === 'sniper') return finish(s);
  if (g === 'sketch' && s.rd >= SGT.sketchRounds) return finish(s);
  if (g === 'vault' && s.rd >= 2) return finish(s);
  if (g === 'wheel' && s.rd >= SGT.spins) return finish(s);
  s.a = other(s.a);
  return startSG(s, now);
}

export function tickSG(s0, now) {
  const g = s0.game;
  // Tug-of-War: the light changes on its own schedule
  if (g === 'tug' && s0.ph === 'play') {
    if (now >= s0.end) {
      const s = clone(s0);
      if (s.pos !== 0) s.sc[s.p[s.pos > 0 ? 0 : 1]] = 1;
      return finish(s);
    }
    if (now >= s0.nextLight) {
      const s = clone(s0);
      s.light = s.light === 'green' ? 'red' : 'green';
      s.lightAt = now;
      s.nextLight = now + (s.light === 'green' ? 1500 + ri(s, 2500) : 1200 + ri(s, 1300));
      return s;
    }
    return s0;
  }
  // Wheel reflex round: decide once the short fairness window closes
  if (g === 'wheel' && s0.ph === 'tap' && s0.decideAt && now >= s0.decideAt) return decideTap(clone(s0), now);
  if (!s0.dl || now < s0.dl) return s0;
  const s = clone(s0);
  if (s.ph === 'reveal') return nextRound(s, now);

  if (g === 'xo' && s.ph === 'play') { s.idle += 1; if (s.idle >= 6) return xoRoundEnd(s, now, null); return xoNext(s, now); } // ran out of time: turn passes
  if (g === 'sniper') {
    if (s.ph === 'hide') {
      for (const i of [0, 1]) if (!s.hid[i]) s.hid[i] = randHide(s);
      s.ph = 'shoot'; s.turn = s.a; s.dl = now + SGT.shot; return s;
    }
    if (s.ph === 'shoot') { s.idle += 1; if (s.idle >= 8) return finish(s); return sniperTurn(s, now, other(s.turn)); }
  }
  if (g === 'sketch' && s.ph === 'draw') {
    s.guessed = false; s.time[s.p[s.a]] += SGT.sketch;
    s.ph = 'reveal'; s.dl = now + SGT.sketchReveal; return s;
  }
  if (g === 'vault') {
    if (s.ph === 'set') { s.code = shuffle(s, [0, 1, 2, 3, 4, 5]).slice(0, 3); s.ph = 'crack'; s.dl = now + SGT.vCrack; return s; }
    if (s.ph === 'crack') return vaultEnd(s, now, false);
  }
  if (g === 'wheel') {
    if (s.ph === 'spin') {
      if (s.kind === 'coin') { s.ph = 'hide'; s.dl = now + SGT.coin; return s; }
      if (s.kind === 'who') { s.ph = 'who'; s.dl = now + SGT.who; return s; }
      if (s.kind === 'tap') { s.ph = 'tap'; s.goAt = now + SGT.tapMin + ri(s, SGT.tapMax - SGT.tapMin); s.dl = s.goAt + SGT.tapEnd; return s; }
      if (s.kind === 'dare') { s.ph = 'dare'; s.dl = now + SGT.dare; return s; }
    }
    if (s.ph === 'hide') { s.hand = rand(s) < 0.5 ? 'L' : 'R'; s.ph = 'guess'; s.dl = now + SGT.coin; return s; }
    if (s.ph === 'guess') { s.sc[s.p[s.a]] += 1; return wheelEnd(s, now, { guess: null, right: false }); }
    if (s.ph === 'who') return wheelEnd(s, now, { same: false, pick: s.pick, late: true });
    if (s.ph === 'tap') return decideTap(s, now);
    if (s.ph === 'dare') { s.sc[s.p[other(s.a)]] += 1; return wheelEnd(s, now, { done: false, late: true }); }
  }
  return s0;
}
