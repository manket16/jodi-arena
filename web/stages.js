// Relationship stages, named after the seven swaras of the sargam. A jodi climbs them by earning Sync points.
import { html, useState, useEffect } from 'https://esm.sh/htm@3.1.1/preact/standalone';
import { rpc } from './lib.js';

export const STAGES = [
  { n: 'Sa', at: 0, emo: '🌱', line: 'The first note. Every jodi starts here.' },
  { n: 'Re', at: 100, emo: '🌿', line: 'You are finding your rhythm.' },
  { n: 'Ga', at: 300, emo: '🌸', line: 'Getting gentler and closer.' },
  { n: 'Ma', at: 600, emo: '🔥', line: 'Warm, steady and growing.' },
  { n: 'Pa', at: 1000, emo: '🎶', line: 'The fifth note. Strong and balanced.' },
  { n: 'Dha', at: 1600, emo: '🌙', line: 'Deep understanding between you two.' },
  { n: 'Ni', at: 2400, emo: '✨', line: 'Almost in perfect harmony.' },
  { n: 'Sa', at: 3500, emo: '👑', line: 'The final Sa. Perfect harmony.', top: true },
];

export function stageOf(points) {
  const p = Math.max(0, +points || 0);
  let i = 0;
  STAGES.forEach((s, j) => { if (p >= s.at) i = j; });
  const cur = STAGES[i], next = STAGES[i + 1] || null;
  const pct = next ? Math.round(((p - cur.at) / (next.at - cur.at)) * 100) : 100;
  return { i, cur, next, pct, left: next ? next.at - p : 0 };
}

// the seven-step ladder with the current step lit
export function StageLadder({ points }) {
  const { i } = stageOf(points);
  return html`<div class="ladder">${STAGES.map((s, j) => html`<span class=${'rung' + (j < i ? ' done' : '') + (j === i ? ' now' : '')} title=${`${s.n} from ${s.at} points`}><b>${s.n}${s.top ? '′' : ''}</b></span>`)}</div>`;
}

// the card on the home screen: loads the couple's Sync points itself
export function StageCard({ onOpen }) {
  const [pts, setPts] = useState(null);
  useEffect(() => { rpc('sync_board').then((b) => setPts((b && b.mine && b.mine.points) || 0)).catch(() => setPts(0)); }, []);
  if (pts === null) return null;
  const st = stageOf(pts);
  const Tag = onOpen ? 'button' : 'div';
  return html`
    <${Tag} class="stage-card" onClick=${onOpen}>
      <div class="stage-top">
        <span class="stage-emo">${st.cur.emo}</span>
        <span class="grow"><span class="small">Your relationship stage</span><b class="stage-name">${st.cur.n}${st.cur.top ? '′' : ''}</b><span class="small">${st.cur.line}</span></span>
        <span class="stage-pts"><b>${pts}</b><span class="small">Sync</span></span>
      </div>
      <${StageLadder} points=${pts} />
      <div class="stage-bar"><i style=${`width:${st.pct}%`}></i></div>
      <span class="small">${st.next ? `${st.left} more points to reach ${st.next.n}${st.next.top ? '′' : ''}` : 'You reached the final stage. Perfect harmony!'}</span>
    </${Tag}>`;
}

// the full stage guide, shown under the Sync tab
export function StagesPanel() {
  const [pts, setPts] = useState(0);
  useEffect(() => { rpc('sync_board').then((b) => setPts((b && b.mine && b.mine.points) || 0)).catch(() => {}); }, []);
  const st = stageOf(pts);
  return html`
    <div class="panel stack small">
      <b>Relationship stages</b>
      <p>You are at ${st.cur.emo} <b>${st.cur.n}${st.cur.top ? '′' : ''}</b>. ${st.next ? `${st.left} more Sync points to reach ${st.next.n}${st.next.top ? '′' : ''}.` : 'This is the final stage!'}</p>
      <${StageLadder} points=${pts} />
      ${STAGES.map((x) => html`<p>${x.emo} <b>${x.n}${x.top ? '′' : ''}</b> from ${x.at} points. ${x.line}</p>`)}
    </div>`;
}
