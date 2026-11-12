// Jodi DNA: a few taps about the couple. They only rename and re-theme the games. Rules, timers and scoring never change.
import { html, useState } from 'https://esm.sh/htm@3.1.1/preact/standalone';
import { rpc, fail, toast } from './lib.js';
import { META } from './duel-engine.js';
import { Sheet } from './hub.js';

export const MET = [['college', '🎓 College or hostel'], ['office', '💼 Office'], ['app', '📱 Dating app'], ['family', '👪 Family setup'], ['school', '🏫 School friends']];
export const OBS = [['food', '🥟 Street food & chai'], ['movies', '🎬 Movies & Maggi'], ['hills', '⛰️ Hill trips'], ['cricket', '🏏 Cricket & IPL'], ['gym', '💪 Fitness & gym']];
export const VIBE = [['filmy', '🎭 Full filmy'], ['roast', '😜 Roasting each other'], ['clingy', '🥺 Secretly clingy'], ['rebels', '😎 Sanskari rebels']];

// game id -> name, per shared obsession
const NAMES = {
  food:    { xo: 'Chai vs Samosa', sniper: 'Momo Sniper', sketch: 'Ganda Chaat Sketch', vault: 'Masala Vault', tug: 'Paneer Tikka Tug', wheel: 'Tapri Wheel', momo: 'Steal the Golgappa', hotseat: 'Chai Tapri Hot Seat', slider: 'Tapri Hisaab', quiz: 'Street Food Quiz', scavenger: 'Chaat Photo Hunt', listen: 'Chai-Time Listen' },
  movies:  { xo: 'Popcorn vs Clapper', sniper: 'Popcorn Sniper', sketch: 'Filmy Sketch', vault: 'Box Office Vault', tug: 'Remote Tug', wheel: 'Filmy Wheel', momo: 'Steal the Maggi', hotseat: 'Late-Night Hot Seat', slider: 'Filmy Hisaab', quiz: 'Bollywood Quick Quiz', scavenger: 'Filmy Photo Hunt', listen: 'Movie-Night Listen' },
  hills:   { xo: 'Pahad vs Maggi', sniper: 'Maggi Sniper', sketch: 'Trip Sketch', vault: 'Snow Vault', tug: 'Blanket Tug', wheel: 'Road Trip Wheel', momo: 'Steal the Hill Maggi', hotseat: 'Hill-Station Hot Seat', slider: 'Pahadi Hisaab', quiz: 'Trip Quick Quiz', scavenger: 'Pahadi Photo Hunt', listen: 'Road-Trip Listen' },
  cricket: { xo: 'Bat vs Ball', sniper: 'Trophy Sniper', sketch: 'Stadium Sketch', vault: 'Dressing Room Vault', tug: 'Trophy Tug', wheel: 'Super Over Wheel', momo: 'IPL Snack Snatch', hotseat: 'Super Over Hot Seat', slider: 'Strike Rate Hisaab', quiz: 'IPL Quick Quiz', scavenger: 'Stadium Photo Hunt', listen: 'Match-Day Listen' },
  gym:     { xo: 'Dumbbell vs Shake', sniper: 'Protein Sniper', sketch: 'Gym Sketch', vault: 'Locker Vault', tug: 'Shake Tug', wheel: 'Gym Bro Wheel', momo: 'Steal the Protein Shake', hotseat: 'Gym Bro Hot Seat', slider: 'Rep Count Hisaab', quiz: 'Fitness Quick Quiz', scavenger: 'Sweaty Photo Hunt', listen: 'Workout Playlist Listen' },
};
const lab = (list, k) => (list.find((x) => x[0] === k) || [])[1] || '';

let current = null;
export const getDna = () => current;

// Rename the games for this couple. Safe to call again; pass null to go back to the standard names.
export function applySkin(dna) {
  current = dna && Object.keys(dna).length ? dna : null;
  for (const k of Object.keys(META)) {
    const m = META[k];
    if (m.baseName === undefined) { m.baseName = m.name; m.baseSub = m.sub; }
    m.name = m.baseName; m.sub = m.baseSub;
  }
  if (!current) return;
  const names = NAMES[current.obs];
  if (names) for (const k of Object.keys(names)) if (META[k]) META[k].name = names[k];
  const route = current.cityA && current.cityB ? `${current.cityA} ↔ ${current.cityB}` : '';
  if (route) {
    if (META.scavenger) META.scavenger.sub = `Same photo hunt for ${route}. 45 seconds, then vote.`;
    if (META.listen) META.listen.sub = `Press play together, ${route}, and guess each other’s feeling.`;
  }
}

export function dnaLine(d) {
  if (!d) return '';
  const route = d.cityA && d.cityB ? `${d.cityA} ↔ ${d.cityB}` : '';
  return [route, lab(MET, d.met).replace(/^\S+\s/, ''), lab(VIBE, d.vibe).replace(/^\S+\s/, '')].filter(Boolean).join(' · ');
}

const KEY = () => 'jb-dna';
export async function loadDna(uid) {
  try { const c = localStorage.getItem(KEY(uid)); if (c) applySkin(JSON.parse(c)); } catch (_) { /* ignore */ }
  try {
    const d = await rpc('get_couple_dna');
    applySkin(d);
    try { localStorage.setItem(KEY(uid), JSON.stringify(d || {})); } catch (_) { /* ignore */ }
    return d;
  } catch (_) { return null; } // the database part may not be switched on yet; the games just keep their usual names
}

function Chips({ list, value, set }) {
  return html`<div class="chips-wrap">${list.map(([k, l]) => html`<button type="button" class=${'chip-btn' + (value === k ? ' on' : '')} onClick=${() => set(value === k ? '' : k)}>${l}</button>`)}</div>`;
}

function DnaSheet({ uid, mine, partner, initial, onClose, onSaved }) {
  const [d, setD] = useState({ cityA: '', cityB: '', met: '', obs: '', vibe: '', ...(initial || {}) });
  const [busy, setBusy] = useState(false);
  const up = (k) => (v) => setD((cur) => ({ ...cur, [k]: v }));
  const save = async () => {
    setBusy(true);
    try {
      await rpc('set_couple_dna', { p_dna: d });
      const clean = Object.fromEntries(Object.entries(d).filter(([, v]) => v));
      applySkin(clean);
      try { localStorage.setItem(KEY(uid), JSON.stringify(clean)); } catch (_) { /* ignore */ }
      toast('Your games are now themed for you two ✨');
      onSaved(clean); onClose();
    } catch (e) { fail(e); setBusy(false); }
  };
  return html`
    <${Sheet} title="Our Jodi DNA" onClose=${onClose}>
      <div class="stack-lg">
        <p class="small muted">Four quick taps. The games get your names, cities and vibe. Rules and scoring stay exactly the same.</p>
        <label class="field"><span class="small muted">${mine}'s city</span><input class="input" maxlength="24" placeholder="e.g. Bengaluru" value=${d.cityA} onInput=${(e) => up('cityA')(e.target.value)} /></label>
        <label class="field"><span class="small muted">${partner}'s city</span><input class="input" maxlength="24" placeholder="e.g. Delhi" value=${d.cityB} onInput=${(e) => up('cityB')(e.target.value)} /></label>
        <div><p class="small muted">How you met</p><${Chips} list=${MET} value=${d.met} set=${up('met')} /></div>
        <div><p class="small muted">Your shared obsession</p><${Chips} list=${OBS} value=${d.obs} set=${up('obs')} /></div>
        <div><p class="small muted">Your vibe</p><${Chips} list=${VIBE} value=${d.vibe} set=${up('vibe')} /></div>
        <button class="btn" disabled=${busy} onClick=${save}>${busy ? 'Saving…' : 'Save'}</button>
      </div>
    </${Sheet}>`;
}

// Card for the Play screen
export function DnaCard({ uid, mine, partner, dna, onSaved }) {
  const [open, setOpen] = useState(false);
  const has = dna && Object.keys(dna).length;
  return html`
    <button class="iou" style="width:100%;text-align:left" onClick=${() => setOpen(true)}>
      <span class="iou-emo">🧬</span>
      <span class="grow"><b>${has ? 'Our Jodi DNA' : 'Make the games yours'}</b><span class="small muted">${has ? dnaLine(dna) || 'Tap to edit' : 'Add your cities and vibe. The games get renamed for you two.'}</span></span>
      <span class="small muted">${has ? '✏️' : '→'}</span>
    </button>
    ${open && html`<${DnaSheet} uid=${uid} mine=${mine} partner=${partner} initial=${dna} onClose=${() => setOpen(false)} onSaved=${onSaved} />`}`;
}
