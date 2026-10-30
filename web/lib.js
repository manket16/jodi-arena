import { html, useState, useEffect, useRef } from 'https://esm.sh/htm@3.1.1/preact/standalone';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';

export const sb = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: true, detectSessionInUrl: true } });

export const GAMES = {
  sync: { name: 'Sync', emo: '🔗', g: '#2F6FEB', soft: '#DFEAFF', line: 'Answer blind in 4 seconds. Score when you both pick the same.' },
  cricket: { name: 'Couple Cricket', emo: '🏏', g: '#16A34A', soft: '#DDF5E3', line: 'One trivia innings each. Bet coins on your partner.' },
  antakshari: { name: 'Antakshari', emo: '🎶', g: '#E5306B', soft: '#FFE0EA', line: 'Chain Bollywood songs, letter by letter.' },
  hum: { name: 'Hum & Guess', emo: '🎤', g: '#E07B00', soft: '#FFE8CC', line: 'Hum 3 songs. Your partner guesses them.' },
  andaaza: { name: 'Andaaza', emo: '🎯', g: '#0F9D8A', soft: '#D7F4EF', line: 'Guess numbers blind. Your jodi answer is the average.', isNew: true },
  rhythm: { name: 'Rhythm Lock', emo: '🥁', g: '#D97706', soft: '#FFF0C2', line: 'Hear a beat once. Tap it back together.', isNew: true },
};
export const gameVars = (k) => `--g:${GAMES[k].g};--g-soft:${GAMES[k].soft}`;

export async function rpc(name, args) {
  const { data, error } = await sb.rpc(name, args);
  if (error) throw new Error(error.message);
  return data;
}
export const norm = (t) => (t || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
export const initial = (s) => (s || '?').trim().charAt(0).toUpperCase();

let toastFn = () => {};
export const setToastFn = (fn) => { toastFn = fn; };
export const toast = (msg, err) => toastFn(msg, err);
export const fail = (e) => toast(e.message || String(e), true);

export function usePoll(fn, ms, active) {
  const ref = useRef(fn); ref.current = fn;
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => ref.current(), ms);
    return () => clearInterval(id);
  }, [active, ms]);
}

export function useCountdown(seconds, running, onEnd, resetKey) {
  const [left, setLeft] = useState(seconds * 1000);
  const endRef = useRef(onEnd); endRef.current = onEnd;
  useEffect(() => {
    if (!running) return;
    const start = performance.now();
    setLeft(seconds * 1000);
    let fired = false;
    const id = setInterval(() => {
      const l = Math.max(0, seconds * 1000 - (performance.now() - start));
      setLeft(l);
      if (l === 0 && !fired) { fired = true; clearInterval(id); endRef.current(); }
    }, 100);
    return () => clearInterval(id);
  }, [running, seconds, resetKey]);
  return left;
}

// Animated number that counts up to `to`.
export function CountUp({ to }) {
  const [v, setV] = useState(0);
  useEffect(() => {
    if (to == null) return;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { setV(to); return; }
    const start = performance.now(), dur = 900;
    let raf;
    const tick = (t) => {
      const p = Math.min(1, (t - start) / dur);
      setV(Math.round(to * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [to]);
  return html`${to == null ? '–' : v}`;
}

export function confetti() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const c = document.createElement('canvas');
  c.className = 'confetti'; c.width = innerWidth; c.height = innerHeight;
  document.body.appendChild(c);
  const ctx = c.getContext('2d');
  const colors = ['#F0386B', '#FFB627', '#16A34A', '#2F6FEB', '#0F9D8A'];
  const bits = Array.from({ length: 140 }, () => ({
    x: innerWidth / 2 + (Math.random() - 0.5) * 120, y: innerHeight * 0.35,
    vx: (Math.random() - 0.5) * 12, vy: -Math.random() * 14 - 4,
    s: 6 + Math.random() * 6, r: Math.random() * 6, c: colors[(Math.random() * colors.length) | 0],
  }));
  let frame = 0;
  const step = () => {
    ctx.clearRect(0, 0, c.width, c.height);
    bits.forEach((b) => {
      b.vy += 0.35; b.x += b.vx; b.y += b.vy; b.r += 0.1;
      ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.r); ctx.fillStyle = b.c;
      ctx.fillRect(-b.s / 2, -b.s / 4, b.s, b.s / 2); ctx.restore();
    });
    if (++frame < 150) requestAnimationFrame(step); else c.remove();
  };
  requestAnimationFrame(step);
}

export const Timer = ({ left, total }) => html`
  <div class=${'timer' + (left < total * 0.3 ? ' hot' : '')} role="progressbar" aria-valuemin="0" aria-valuemax=${total} aria-valuenow=${Math.round(left)}>
    <i style=${`width:${(left / total) * 100}%`}></i>
  </div>`;

export const Mark = ({ a, b, big }) => html`<span class=${'mark' + (big ? ' big' : '')} aria-hidden="true"><i>${initial(a)}</i><i>${initial(b)}</i></span>`;

export function Waiting({ emo, title, sub, load }) {
  usePoll(load, 4000, true);
  return html`
    <div class="wait stack">
      <div class="emo">${emo}</div>
      <h2>${title}</h2>
      ${sub && html`<p class="muted">${sub}</p>`}
    </div>`;
}

export function Intro({ title, points, onStart, label = 'Start', children }) {
  return html`
    <div class="stack-lg">
      <div class="panel stack">
        <h2>${title}</h2>
        ${points.map((p) => html`<p class="muted">${p}</p>`)}
      </div>
      ${children}
      <button class="btn game" onClick=${onStart}>${label}</button>
    </div>`;
}

export async function share(text) {
  const url = location.origin;
  try {
    if (navigator.share) await navigator.share({ text, url });
    else { await navigator.clipboard.writeText(`${text} ${url}`); toast('Copied to clipboard'); }
  } catch (_) { /* cancelled */ }
}

let SONGS = null;
export async function loadSongs() {
  if (SONGS) return SONGS;
  const { data, error } = await sb.from('songs').select('title').limit(5000);
  if (error) throw new Error(error.message);
  const list = data.map((r) => r.title);
  const byNorm = new Map(list.map((t) => [norm(t), t]));
  const first = new Set([...byNorm.keys()].map((n) => n[0]));
  SONGS = { list, byNorm, first, norms: [...byNorm.keys()] };
  return SONGS;
}
export const cachedSongs = () => SONGS;
export function nextLetter(n, first) {
  for (let i = n.length - 1; i >= 0; i--) if (/[a-z]/.test(n[i]) && first.has(n[i])) return n[i];
  return 'a';
}

// Short percussive click for Rhythm Lock and taps.
let actx = null;
export function blip(freq = 660, dur = 0.08) {
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    const o = actx.createOscillator(), g = actx.createGain();
    o.type = 'triangle'; o.frequency.value = freq;
    g.gain.setValueAtTime(0.4, actx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + dur);
    o.connect(g).connect(actx.destination);
    o.start(); o.stop(actx.currentTime + dur);
  } catch (_) { /* no audio */ }
}
export function unlockAudio() {
  try { actx = actx || new (window.AudioContext || window.webkitAudioContext)(); if (actx.resume) actx.resume(); } catch (_) { /* no audio */ }
}
export const buzz = (ms = 15) => { try { navigator.vibrate && navigator.vibrate(ms); } catch (_) { /* no vibration */ } };
