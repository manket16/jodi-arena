import { html, useState, useEffect } from 'https://esm.sh/htm@3.1.1/preact/standalone';
import { rpc, fail, toast, usePoll, confetti, buzz } from './lib.js';

// "Make it real" shortcuts for coupons. Plain links for now; swap in affiliate links here later.
const MAKE_REAL = {
  food: { label: 'Order on Swiggy', url: 'https://www.swiggy.com/' },
  movie: { label: 'Book on BookMyShow', url: 'https://in.bookmyshow.com/' },
  date: { label: 'Find a place nearby', url: 'https://www.google.com/maps/search/romantic+restaurants+near+me' },
  gift: { label: 'Browse gifts', url: 'https://www.igp.com/' },
};
const KIND = { coupon: '🎟️ Coupon', dare: '🎯 Dare', song: '🎵 Song for you', note: '💌 Note', spark: '✨ Little spark' };
const REACTIONS = ['😂', '😍', '🥹', '😈', '🔥', '❤️'];
const TABS = [['coupon', 'Coupons'], ['dare', 'Dares'], ['song', 'Songs'], ['note', 'Note']];
const EMOJI = ['🎁', '💌', '🍗', '😘', '🔥', '🥰'];

function Modal({ title, onClose, children }) {
  return html`
    <div class="sheet-bg" onClick=${(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div class="sheet" role="dialog" aria-label=${title}>
        <div class="sheet-head"><h2>${title}</h2><button class="back" onClick=${onClose} aria-label="Close">✕</button></div>
        <div class="stack-lg">${children}</div>
      </div>
    </div>`;
}

function Reveal({ gift, partner, onClose }) {
  const [react, setReact] = useState(gift.reaction || null);
  const mr = gift.make_real && MAKE_REAL[gift.make_real];
  const pick = async (r) => {
    try { await rpc('react_gift', { p_id: gift.id, p_reaction: r }); setReact(r); buzz(); toast(`${partner} will see your ${r}`); } catch (e) { fail(e); }
  };
  return html`
    <${Modal} title=${gift.from_system ? 'A free surprise' : `From ${partner}`} onClose=${onClose}>
      <div class="gift-reveal">
        <div class="gift-big gift-pop">${gift.emoji}</div>
        <p class="gift-kind">${KIND[gift.kind] || 'Surprise'}</p>
        <h3 class="gift-title">${gift.title}</h3>
        <p>${gift.body}</p>
        ${gift.kind === 'coupon' && html`<p class="small muted">Saved in your coupons. Use it whenever you like.</p>`}
        ${mr && html`<a class="btn" style="text-decoration:none" href=${mr.url} target="_blank" rel="noopener noreferrer">Make it real: ${mr.label}</a>`}
      </div>
      ${!gift.from_system && html`
        <div class="stack">
          <p class="small muted center">${react ? `You reacted ${react}` : `Tell ${partner} how it landed`}</p>
          <div class="gift-react">${REACTIONS.map((r) => html`<button class=${react === r ? 'on' : ''} onClick=${() => pick(r)} aria-label=${'React ' + r}>${r}</button>`)}</div>
        </div>`}
      <button class="btn ghost" onClick=${onClose}>Done</button>
    </${Modal}>`;
}

function SendSheet({ partner, onClose, onSent }) {
  const [catalog, setCatalog] = useState(null);
  const [tab, setTab] = useState('coupon');
  const [sel, setSel] = useState(null);
  const [custom, setCustom] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [emoji, setEmoji] = useState('🎁');
  const [busy, setBusy] = useState(false);
  useEffect(() => { rpc('gift_catalog').then(setCatalog).catch(fail); }, []);

  const isNote = tab === 'note';
  const writing = isNote || custom;
  const items = (catalog || []).filter((g) => g.kind === tab);
  const chosen = items.find((g) => g.id === sel);
  const ready = writing ? body.trim().length > 0 && (isNote || title.trim().length > 0) : !!chosen;

  const send = async () => {
    setBusy(true);
    try {
      await rpc('send_gift', writing
        ? { p_kind: tab, p_emoji: emoji, p_title: title, p_body: body, p_make_real: null }
        : { p_kind: tab, p_emoji: chosen.emoji, p_title: chosen.title, p_body: chosen.body, p_make_real: chosen.make_real });
      buzz(); onSent();
    } catch (e) { fail(e); setBusy(false); }
  };

  return html`
    <${Modal} title=${`Surprise ${partner}`} onClose=${onClose}>
      <div class="tabs" role="tablist">${TABS.map(([k, l]) => html`<button role="tab" aria-selected=${tab === k} class=${tab === k ? 'on' : ''} onClick=${() => { setTab(k); setSel(null); setCustom(false); }}>${l}</button>`)}</div>
      <p class="small muted">${partner} sees a wrapped box. They find out what's inside only when they open it.</p>
      ${!isNote && !custom && (catalog === null
        ? html`<p class="muted pulse center">Loading…</p>`
        : html`<div class="gift-list">${items.map((g) => html`
            <button class=${'gift-item' + (sel === g.id ? ' on' : '')} onClick=${() => setSel(g.id)}>
              <span class="gift-item-emo">${g.emoji}</span><span class="grow"><b>${g.title}</b><br/><span class="small muted">${g.body}</span></span>
            </button>`)}
            <button class="gift-item" onClick=${() => { setCustom(true); setSel(null); }}><span class="gift-item-emo">✏️</span><span class="grow"><b>Write my own</b></span></button>
          </div>`)}
      ${writing && html`
        <div class="stack">
          <div class="gift-emojis">${EMOJI.map((e) => html`<button class=${emoji === e ? 'on' : ''} onClick=${() => setEmoji(e)}>${e}</button>`)}</div>
          ${!isNote && html`<input class="input" maxlength="60" placeholder=${tab === 'coupon' ? 'Coupon title, like “Free hug on demand”' : tab === 'dare' ? 'Dare title' : 'Song title'} value=${title} onInput=${(e) => setTitle(e.target.value)} />`}
          <textarea class="input" rows="3" maxlength="200" placeholder=${isNote ? `A few words for ${partner}…` : 'The details…'} value=${body} onInput=${(e) => setBody(e.target.value)}></textarea>
          ${!isNote && html`<button class="link" onClick=${() => setCustom(false)}>Pick from the list instead</button>`}
        </div>`}
      <button class="btn" disabled=${!ready || busy} onClick=${send}>${busy ? 'Wrapping…' : '🎁 Send surprise'}</button>
    </${Modal}>`;
}

const eventLine = (e, partner) => {
  const what = `${e.emoji} ${e.title}`;
  if (e.redeemed_at) return `${partner} redeemed your ${what}`;
  if (e.reaction) return `${partner} reacted ${e.reaction} to your ${what}`;
  return `${partner} opened your ${what}`;
};

// Surprise gift box: the first thing on Home. Receiver sees a wrapped box; sender sees what happened next.
export function GiftBox({ home, solo, onInvite }) {
  const partner = home.couple.partner_name;
  const [box, setBox] = useState(null);
  const [gift, setGift] = useState(null);
  const [sending, setSending] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = () => rpc('gift_box').then(setBox).catch(() => {});
  useEffect(() => { load(); }, []);
  usePoll(load, 12000, !gift && !sending);

  if (!box) return null;
  const waiting = box.unopened.length;
  const canSend = box.has_partner && !solo;

  const opened = (g) => { setGift(g); buzz(30); confetti(); load(); };
  const openNext = async () => {
    setBusy(true);
    try { opened(await rpc('open_gift', { p_id: box.unopened[0].id })); } catch (e) { fail(e); }
    setBusy(false);
  };
  const openFree = async () => {
    setBusy(true);
    try { opened(await rpc('claim_free_gift')); } catch (e) { fail(e); load(); }
    setBusy(false);
  };
  const redeem = async (id) => {
    try { await rpc('redeem_gift', { p_id: id }); toast('Coupon used. Tell them to deliver 😄'); load(); } catch (e) { fail(e); }
  };
  const dismiss = async () => { try { await rpc('mark_gifts_seen'); } catch (_) { /* ignore */ } load(); };
  const ev = box.events[0];

  return html`
    <section class="gift-wrap" aria-label="Surprise box">
      ${ev && html`
        <button class="gift-event" onClick=${dismiss}>
          <span class="grow">${eventLine(ev, partner)}${box.events.length > 1 ? ` (+${box.events.length - 1} more)` : ''}</span><span class="small">Got it</span>
        </button>`}

      ${waiting > 0 ? html`
        <button class="gift-card hot" disabled=${busy} onClick=${openNext}>
          <span class="gift-big shake">🎁</span>
          <span class="grow"><b>${partner} left you ${waiting === 1 ? 'a surprise' : `${waiting} surprises`}</b><br/><span class="small">Tap to open. No peeking.</span></span>
        </button>` : box.free_available ? html`
        <button class="gift-card free" disabled=${busy} onClick=${openFree}>
          <span class="gift-big shake">✨</span>
          <span class="grow"><b>A free surprise is waiting</b><br/><span class="small">From Jodi Arena, once a day. Tap to open.</span></span>
        </button>` : html`
        <div class="gift-card idle">
          <span class="gift-big">🎁</span>
          <span class="grow"><b>Nothing waiting right now</b><br/><span class="small muted">${canSend ? `Why not send ${partner} one?` : 'Invite your partner to send and receive surprises.'}</span></span>
        </div>`}

      ${canSend
        ? html`<button class="btn ghost" onClick=${() => setSending(true)}>🎁 Send ${partner} a surprise</button>`
        : solo && html`<button class="btn ghost" onClick=${onInvite}>＋ Invite your partner to send surprises</button>`}

      ${box.wallet.length > 0 && html`
        <div class="gift-wallet">
          <h3>🎟️ Your coupons</h3>
          ${box.wallet.map((w) => { const mr = w.make_real && MAKE_REAL[w.make_real]; return html`
            <div class="gw-row">
              <span class="gift-item-emo">${w.emoji}</span>
              <span class="grow"><b>${w.title}</b><br/><span class="small muted">${w.body}</span></span>
              <span class="gw-acts">
                ${mr && html`<a class="chip" href=${mr.url} target="_blank" rel="noopener noreferrer">${mr.label}</a>`}
                <button class="chip" onClick=${() => redeem(w.id)}>Use it</button>
              </span>
            </div>`; })}
        </div>`}

      ${gift && html`<${Reveal} gift=${gift} partner=${partner} onClose=${() => { setGift(null); load(); }} />`}
      ${sending && html`<${SendSheet} partner=${partner} onClose=${() => setSending(false)} onSent=${() => { setSending(false); toast(`Sent! ${partner} will find a wrapped box 🎁`); load(); }} />`}
    </section>`;
}
