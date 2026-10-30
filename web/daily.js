import { html, useState, useEffect, useRef } from 'https://esm.sh/htm@3.1.1/preact/standalone';
import { rpc, fail, usePoll, confetti, share } from './lib.js';
import { startDuel } from './duel.js';
import { GiftBox } from './gift.js';

// The top of Home: the surprise gift box, then the daily question underneath it.
export function DailyCard(props) {
  return html`<${GiftBox} ...${props} /><${DailyQuestion} ...${props} />`;
}

// Daily question card. Each partner answers alone; the reveal opens once both have.
function DailyQuestion({ home, solo, onInvite }) {
  const c = home.couple, me = home.profile.name, partner = c.partner_name;
  const [d, setD] = useState(null);
  const [busy, setBusy] = useState(false);
  const celebrated = useRef(false);

  const load = () => rpc('daily_q_today').then(setD).catch(() => {});
  useEffect(() => { load(); }, []);
  const waiting = !!(d && d.mine && !d.revealed);
  usePoll(load, 8000, waiting);

  useEffect(() => {
    if (d && d.revealed && d.match && !celebrated.current) { celebrated.current = true; confetti(); }
  }, [d && d.revealed, d && d.match]);

  if (!d) return null;

  // 'who' questions: option a is partner 1, option b is partner 2
  const p1 = c.slot === 1 ? me : partner, p2 = c.slot === 1 ? partner : me;
  const label = (k) => (d.kind === 'who' ? (k === 'a' ? p1 : p2) : (k === 'a' ? d.a : d.b));

  const answer = async (k) => {
    setBusy(true);
    try { setD(await rpc('daily_q_answer', { p_pick: k })); } catch (e) { fail(e); }
    setBusy(false);
  };

  const nudge = `${me} answered today's Jodi question 👀 Your turn, it takes 5 seconds. No peeking until you answer:`;
  const sentence = d.revealed
    ? (d.kind === 'who'
      ? (d.match ? `We both said ${label(d.mine)}` : `${me} said ${label(d.mine)}, ${partner} said ${label(d.partner_pick)}`)
      : (d.match ? `We both picked “${label(d.mine)}”` : `${me}: “${label(d.mine)}” · ${partner}: “${label(d.partner_pick)}”`))
    : '';

  const makeCard = async () => {
    const W = 1080, H = 1350, cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const g = cv.getContext('2d');
    try { await document.fonts.ready; } catch (_) { /* fonts optional */ }
    const bg = g.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, d.match ? '#F0386B' : '#7C3AED'); bg.addColorStop(1, d.match ? '#F59E0B' : '#DB2777');
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    g.fillStyle = '#fff'; g.textAlign = 'center';
    const wrap = (text, y, size, weight, maxW, lh) => {
      g.font = `${weight} ${size}px "Baloo 2", system-ui, sans-serif`;
      const words = text.split(' '); let line = '', yy = y;
      for (const w of words) {
        const t = line ? line + ' ' + w : w;
        if (g.measureText(t).width > maxW && line) { g.fillText(line, W / 2, yy); line = w; yy += lh; } else line = t;
      }
      g.fillText(line, W / 2, yy);
      return yy + lh;
    };
    g.globalAlpha = .85; wrap('JODI ARENA · TODAY’S QUESTION', 130, 40, 700, 900, 50); g.globalAlpha = 1;
    let y = wrap(d.q, 290, 76, 800, 900, 92) + 40;
    g.font = '200px serif'; g.fillText(d.match ? '🎉' : '🔥', W / 2, y + 190);
    y += 290;
    y = wrap(d.match ? 'Same brain!' : 'Kalesh alert', y, 110, 800, 900, 120) + 10;
    y = wrap(sentence, y, 52, 600, 900, 66) + 30;
    if (d.streak > 0) y = wrap(`🔥 ${d.streak} day streak · matched ${d.matched} of ${d.played} days`, y, 44, 700, 900, 56);
    g.globalAlpha = .9; wrap('Bringing couples closer', H - 120, 44, 700, 900, 56); g.globalAlpha = 1;
    return new Promise((res) => cv.toBlob(res, 'image/png'));
  };

  const shareResult = async () => {
    const text = d.match ? `We matched on today's Jodi question 💞 Can you two beat us?` : `Kalesh alert 🔥 We clashed on today's Jodi question. Can you two beat us?`;
    try {
      const blob = await makeCard();
      const file = new File([blob], 'jodi-today.png', { type: 'image/png' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], text: `${text} ${location.origin}` }); return; }
    } catch (e) { if (e && e.name === 'AbortError') return; }
    share(text);
  };

  const Streak = () => d.streak > 0 || d.played > 0 ? html`
    <div class="dq-meta">${d.streak > 0 ? html`<span class="dq-streak">🔥 ${d.streak} day${d.streak === 1 ? '' : 's'} in a row</span>` : html`<span class="muted small">Answer together tomorrow to start a streak</span>`}
      ${d.played > 0 && html`<span class="small muted">Matched ${d.matched} of ${d.played}</span>`}</div>` : null;

  return html`
    <section class=${'dq-card' + (d.revealed ? (d.match ? ' match' : ' clash') : '')} aria-label="Today's question">
      <p class="dq-tag">${d.revealed ? (d.match ? '🎉 Same brain' : '🔥 Kalesh alert') : '💭 Today’s question'}</p>
      <h2 class="dq-q">${d.q}</h2>

      ${!d.mine && html`
        <div class="dq-opts">
          ${['a', 'b'].map((k) => html`<button class="dq-opt" disabled=${busy} onClick=${() => answer(k)}>${label(k)}${d.kind === 'who' && (k === 'a' ? c.slot === 1 : c.slot === 2) ? html` <span class="small">(you)</span>` : ''}</button>`)}
        </div>
        <p class="small muted center">${solo ? 'Answer now. The reveal opens when your partner joins and answers.' : partner + ' can’t see your answer until they pick theirs.'}</p>`}

      ${d.mine && !d.revealed && html`
        <div class="dq-wait"><b>✓ Locked in: ${label(d.mine)}</b>
          <span class="small muted">${solo ? 'Your partner’s answer will show here once they join.' : `Waiting for ${partner}…`}</span></div>
        ${solo
          ? html`<button class="btn" onClick=${onInvite}>＋ Invite your partner</button>`
          : html`<a class="btn" style="text-decoration:none" href=${`https://wa.me/?text=${encodeURIComponent(nudge + ' ' + location.origin)}`} target="_blank" rel="noopener">Nudge ${partner} on WhatsApp</a>`}`}

      ${d.revealed && html`
        <div class="dq-reveal">
          <div class="dq-pick"><span class="small muted">${me}</span><b>${label(d.mine)}</b></div>
          <span class="dq-vs">${d.match ? '=' : 'vs'}</span>
          <div class="dq-pick"><span class="small muted">${partner}</span><b>${label(d.partner_pick)}</b></div>
        </div>
        <p class="center muted small">${d.match ? 'You two think alike. That’s a point for the jodi.' : 'You two disagree. Time to settle it.'}</p>
        ${!d.match && html`<button class="btn game" onClick=${() => startDuel('momo')}>⚡ Settle it now: Steal the Momo</button>`}
        <button class=${'btn' + (d.match ? '' : ' ghost')} onClick=${shareResult}>Share on WhatsApp</button>`}

      <${Streak} />
    </section>`;
}
