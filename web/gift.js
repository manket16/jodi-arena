import { html, useState, useEffect } from 'https://esm.sh/htm@3.1.1/preact/standalone';
import { sb, rpc, fail, toast, usePoll, confetti, buzz } from './lib.js';

// "Make it real" shortcuts. Plain links for now; swap in affiliate links here later.
const MAKE_REAL = {
  food: { label: 'Order on Swiggy', url: 'https://www.swiggy.com/' },
  movie: { label: 'Book on BookMyShow', url: 'https://in.bookmyshow.com/' },
  date: { label: 'Find a place nearby', url: 'https://www.google.com/maps/search/romantic+restaurants+near+me' },
  gift: { label: 'Browse gifts', url: 'https://www.igp.com/' },
};
const KIND = { coupon: '🎟️ Coupon', dare: '🎯 Dare', song: '🎵 Song for you', note: '💌 Note', spark: '✨ Little spark', plan: '📅 Plan' };
const REACTIONS = ['😂', '😍', '🥹', '😈', '🔥', '❤️'];
const TABS = [['plan', 'Plans'], ['dare', 'Dares'], ['song', 'Songs'], ['note', 'Note']];
const EMOJI = ['🎁', '💌', '🍗', '😘', '🔥', '🥰'];
const DARE_POINTS = 50;
const PROOF_BUCKET = 'proofs';

const fmtWhen = (s) => new Date(s).toLocaleString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
const calUrl = (title, startIso) => {
  const f = (d) => new Date(d).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const end = new Date(new Date(startIso).getTime() + 2 * 3600 * 1000);
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(title)}&dates=${f(startIso)}/${f(end)}`;
};
const localInputMin = () => { const d = new Date(Date.now() + 3600 * 1000); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); };

async function compressImg(file, max = 1400, q = 0.82) {
  let bmp;
  try { bmp = await createImageBitmap(file); } catch (_) { throw new Error('Could not read that photo. Try a JPG or PNG.'); }
  const s = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  if (bmp.close) bmp.close();
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Could not read that photo'))), 'image/jpeg', q));
}

// Upload a photo (compressed) or a short video into the private proofs bucket.
async function uploadProof(coupleId, file) {
  const isVideo = (file.type || '').startsWith('video/');
  let blob = file, ext = 'jpg', type = 'image/jpeg';
  if (isVideo) {
    if (file.size > 40 * 1024 * 1024) throw new Error('That video is too big. Keep it to about 20 seconds.');
    type = file.type; ext = type.includes('quicktime') ? 'mov' : type.includes('webm') ? 'webm' : 'mp4';
  } else {
    blob = await compressImg(file);
  }
  const path = `${coupleId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await sb.storage.from(PROOF_BUCKET).upload(path, blob, { contentType: type });
  if (error) throw error;
  return { path, kind: isVideo ? 'video' : 'image' };
}

function ProofMedia({ path, kind }) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    let live = true;
    sb.storage.from(PROOF_BUCKET).createSignedUrl(path, 3600).then(({ data }) => { if (live && data) setUrl(data.signedUrl); });
    return () => { live = false; };
  }, [path]);
  if (!url) return html`<p class="muted pulse center small">Loading proof…</p>`;
  return kind === 'video'
    ? html`<video class="gift-proof" src=${url} controls playsinline preload="metadata"></video>`
    : html`<img class="gift-proof" src=${url} alt="Proof" />`;
}

function Modal({ title, onClose, children }) {
  return html`
    <div class="sheet-bg" onClick=${(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div class="sheet" role="dialog" aria-label=${title}>
        <div class="sheet-head"><h2>${title}</h2><button class="back" onClick=${onClose} aria-label="Close">✕</button></div>
        <div class="stack-lg">${children}</div>
      </div>
    </div>`;
}

// Receiver adds a photo or video as proof of a dare.
function ProofSheet({ gift, coupleId, partner, onClose, onDone }) {
  const [file, setFile] = useState(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const send = async () => {
    if (!file) return;
    setBusy(true);
    try {
      const up = await uploadProof(coupleId, file);
      await rpc('submit_proof', { p_id: gift.id, p_path: up.path, p_kind: up.kind, p_note: note });
      buzz(); toast(`Sent to ${partner} for approval`); onDone();
    } catch (e) { fail(e); setBusy(false); }
  };
  return html`
    <${Modal} title="Show you did it" onClose=${onClose}>
      <div class="stack">
        <b>${gift.emoji} ${gift.title}</b>
        <p class="small muted">${gift.body}</p>
        ${gift.redo_note && html`<p class="gift-redo">${partner} says: ${gift.redo_note}</p>`}
        <input class="input" type="file" accept="image/*,video/*" onChange=${(e) => setFile(e.target.files[0] || null)} />
        <p class="small muted">A photo or a short video, up to about 20 seconds.</p>
        <input class="input" maxlength="120" placeholder="Add a note (optional)" value=${note} onInput=${(e) => setNote(e.target.value)} />
      </div>
      <button class="btn" disabled=${!file || busy} onClick=${send}>${busy ? 'Uploading…' : `Send to ${partner}`}</button>
    </${Modal}>`;
}

// Receiver answers a plan: in, or suggest another time.
function PlanReply({ gift, partner, onDone }) {
  const [other, setOther] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(gift.plan_reply || null);
  const reply = async (r) => {
    setBusy(true);
    try { await rpc('reply_plan', { p_id: gift.id, p_reply: r, p_note: note }); setDone(r); buzz(); if (r === 'in') confetti(); toast(r === 'in' ? `${partner} will be happy!` : `${partner} will see your note`); if (onDone) onDone(); } catch (e) { fail(e); }
    setBusy(false);
  };
  if (done === 'in') return html`<div class="stack"><p class="center"><b>🙌 You're in</b></p><a class="btn ghost" style="text-decoration:none" href=${calUrl(gift.title, gift.plan_at)} target="_blank" rel="noopener noreferrer">📅 Add to calendar</a></div>`;
  if (done === 'other') return html`<p class="center muted">You asked ${partner} for another time.</p>`;
  return html`
    <div class="stack">
      ${!other
        ? html`<div class="gift-actions"><button class="btn" disabled=${busy} onClick=${() => reply('in')}>🙌 I'm in</button><button class="btn ghost" onClick=${() => setOther(true)}>🕐 Other time</button></div>`
        : html`
          <input class="input" maxlength="120" placeholder="Suggest a day or time" value=${note} onInput=${(e) => setNote(e.target.value)} />
          <button class="btn" disabled=${busy} onClick=${() => reply('other')}>Send suggestion</button>`}
    </div>`;
}

function Reveal({ gift, partner, coupleId, onClose, onChanged }) {
  const [react, setReact] = useState(gift.reaction || null);
  const [proofing, setProofing] = useState(false);
  const [proofSent, setProofSent] = useState(false);
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
        ${gift.kind === 'plan' && gift.plan_at && html`<p class="gift-when">📅 ${fmtWhen(gift.plan_at)}</p>`}
        ${gift.kind === 'coupon' && html`<p class="small muted">Saved in your coupons. Use it whenever you like.</p>`}
        ${mr && html`<a class="btn" style="text-decoration:none" href=${mr.url} target="_blank" rel="noopener noreferrer">Make it real: ${mr.label}</a>`}
      </div>
      ${gift.kind === 'plan' && html`<${PlanReply} gift=${gift} partner=${partner} onDone=${onChanged} />`}
      ${gift.kind === 'dare' && !gift.from_system && (proofSent
        ? html`<p class="center"><b>✅ Proof sent.</b> ${partner} will approve it or ask for another try.</p>`
        : html`<button class="btn game" onClick=${() => setProofing(true)}>📸 I did it. Add proof</button>
               <p class="small muted center">Approved dares earn you both ${DARE_POINTS} points. You can also add proof later from Home.</p>`)}
      ${!gift.from_system && html`
        <div class="stack">
          <p class="small muted center">${react ? `You reacted ${react}` : `Tell ${partner} how it landed`}</p>
          <div class="gift-react">${REACTIONS.map((r) => html`<button class=${react === r ? 'on' : ''} onClick=${() => pick(r)} aria-label=${'React ' + r}>${r}</button>`)}</div>
        </div>`}
      <button class="btn ghost" onClick=${onClose}>Done</button>
      ${proofing && html`<${ProofSheet} gift=${gift} coupleId=${coupleId} partner=${partner} onClose=${() => setProofing(false)} onDone=${() => { setProofing(false); setProofSent(true); if (onChanged) onChanged(); }} />`}
    </${Modal}>`;
}

function SendSheet({ partner, onClose, onSent }) {
  const [catalog, setCatalog] = useState(null);
  const [tab, setTab] = useState('plan');
  const [sel, setSel] = useState(null);
  const [custom, setCustom] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [emoji, setEmoji] = useState('🎁');
  const [when, setWhen] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { rpc('gift_catalog').then(setCatalog).catch(fail); }, []);

  const isNote = tab === 'note';
  const isPlan = tab === 'plan';
  const writing = isNote || custom;
  const items = (catalog || []).filter((g) => g.kind === tab);
  const chosen = items.find((g) => g.id === sel);
  const filled = writing ? body.trim().length > 0 && (isNote || title.trim().length > 0) : !!chosen;
  const ready = filled && (!isPlan || !!when);

  const send = async () => {
    setBusy(true);
    const plan_at = isPlan && when ? new Date(when).toISOString() : null;
    try {
      await rpc('send_gift', writing
        ? { p_kind: tab, p_emoji: emoji, p_title: title, p_body: body, p_make_real: null, p_plan_at: plan_at }
        : { p_kind: tab, p_emoji: chosen.emoji, p_title: chosen.title, p_body: chosen.body, p_make_real: chosen.make_real, p_plan_at: plan_at });
      buzz(); onSent();
    } catch (e) { fail(e); setBusy(false); }
  };

  const hint = isPlan ? `Pick a plan and a time. ${partner} can say yes or suggest another time.`
    : tab === 'dare' ? `${partner} does the dare and sends you a photo or video. You approve it and you both earn ${DARE_POINTS} points.`
    : `${partner} sees a wrapped box. They find out what's inside only when they open it.`;

  return html`
    <${Modal} title=${`Surprise ${partner}`} onClose=${onClose}>
      <div class="tabs" role="tablist">${TABS.map(([k, l]) => html`<button role="tab" aria-selected=${tab === k} class=${tab === k ? 'on' : ''} onClick=${() => { setTab(k); setSel(null); setCustom(false); }}>${l}</button>`)}</div>
      <p class="small muted">${hint}</p>
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
          ${!isNote && html`<input class="input" maxlength="60" placeholder=${isPlan ? 'Plan title, like “Sunset at the ghat”' : tab === 'dare' ? 'Dare title' : 'Song title'} value=${title} onInput=${(e) => setTitle(e.target.value)} />`}
          <textarea class="input" rows="3" maxlength="200" placeholder=${isNote ? `A few words for ${partner}…` : 'The details…'} value=${body} onInput=${(e) => setBody(e.target.value)}></textarea>
          ${!isNote && html`<button class="link" onClick=${() => setCustom(false)}>Pick from the list instead</button>`}
        </div>`}
      ${isPlan && html`
        <div class="stack">
          <label class="small muted" for="plan-when">When?</label>
          <input id="plan-when" class="input" type="datetime-local" min=${localInputMin()} value=${when} onInput=${(e) => setWhen(e.target.value)} />
        </div>`}
      <button class="btn" disabled=${!ready || busy} onClick=${send}>${busy ? 'Wrapping…' : '🎁 Send surprise'}</button>
    </${Modal}>`;
}

const sentStatus = (g, partner) => {
  if (g.kind === 'dare') {
    if (g.status === 'approved') return `✅ Approved · you both earned ${g.points} points`;
    if (g.status === 'proof_sent') return `${partner} sent proof. Waiting for you`;
    if (g.status === 'redo') return `You asked ${partner} to try again`;
    return g.opened_at ? `${partner} opened it. Waiting for proof` : `Waiting for ${partner} to open`;
  }
  if (g.kind === 'plan') {
    if (g.plan_reply === 'in') return `🙌 ${partner} is in · ${fmtWhen(g.plan_at)}`;
    if (g.plan_reply === 'other') return `${partner} suggests another time${g.plan_reply_note ? `: ${g.plan_reply_note}` : ''}`;
    return g.opened_at ? `${partner} opened it · ${fmtWhen(g.plan_at)}` : `Waiting for ${partner} to open · ${fmtWhen(g.plan_at)}`;
  }
  if (g.redeemed_at) return `${partner} redeemed it`;
  if (g.reaction) return `${partner} reacted ${g.reaction}`;
  if (g.opened_at) return `${partner} opened it`;
  return `Waiting for ${partner} to open`;
};

// One sent item. A dare with proof shows the photo or video and the Approve / Ask again choice.
function SentRow({ g, isNew, partner, onChanged }) {
  const [redo, setRedo] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const review = g.kind === 'dare' && g.status === 'proof_sent';
  const approve = async () => {
    setBusy(true);
    try { const p = await rpc('approve_dare', { p_id: g.id }); buzz(30); confetti(); toast(`Approved! +${p} points for you two 🎉`); onChanged(); } catch (e) { fail(e); setBusy(false); }
  };
  const sendBack = async () => {
    setBusy(true);
    try { await rpc('redo_dare', { p_id: g.id, p_note: note }); toast(`Sent back to ${partner}`); onChanged(); } catch (e) { fail(e); setBusy(false); }
  };
  return html`
    <div class=${'gift-sent' + (isNew || review ? ' gift-fresh' : '')}>
      <div class="gw-row">
        <span class="gift-item-emo">${g.emoji}</span>
        <span class="grow"><b>${g.title}</b><br/><span class="small muted">${sentStatus(g, partner)}</span></span>
        ${(isNew || review) && html`<span class="chip">${review ? 'Review' : 'New'}</span>`}
      </div>
      ${g.kind === 'dare' && g.status === 'redo' && g.redo_note && html`<p class="small gift-redo">You said: ${g.redo_note}</p>`}
      ${g.kind === 'plan' && g.plan_reply === 'in' && html`<a class="chip" style="text-decoration:none" href=${calUrl(g.title, g.plan_at)} target="_blank" rel="noopener noreferrer">📅 Add to calendar</a>`}
      ${review && html`
        <div class="stack">
          <${ProofMedia} path=${g.proof_path} kind=${g.proof_kind} />
          ${g.proof_note && html`<p class="small">“${g.proof_note}”</p>`}
          ${!redo
            ? html`<div class="gift-actions">
                <button class="btn" disabled=${busy} onClick=${approve}>✅ Approve</button>
                <button class="btn ghost" disabled=${busy} onClick=${() => setRedo(true)}>🔁 Ask again</button>
              </div>`
            : html`
              <input class="input" maxlength="120" placeholder="Tell them what to try (optional)" value=${note} onInput=${(e) => setNote(e.target.value)} />
              <button class="btn" disabled=${busy} onClick=${sendBack}>Send back</button>`}
        </div>`}
    </div>`;
}

function SentSheet({ sent, newIds, partner, onClose, onChanged }) {
  const needs = sent.filter((g) => g.kind === 'dare' && g.status === 'proof_sent');
  const rest = sent.filter((g) => !(g.kind === 'dare' && g.status === 'proof_sent'));
  const fresh = rest.filter((g) => newIds.includes(g.id));
  const older = rest.filter((g) => !newIds.includes(g.id));
  const group = (label, list, isNew) => list.length > 0 && html`<div><p class="gift-kind">${label}</p>${list.map((g) => html`<${SentRow} key=${g.id} g=${g} isNew=${isNew} partner=${partner} onChanged=${onChanged} />`)}</div>`;
  return html`
    <${Modal} title="Sent by you" onClose=${onClose}>
      ${sent.length === 0 && html`<p class="muted center">Nothing sent yet. Surprise ${partner} and it will show up here.</p>`}
      ${group('Needs your review', needs, false)}
      ${group('New', fresh, true)}
      ${group(needs.length || fresh.length ? 'Earlier' : 'Past surprises', older, false)}
    </${Modal}>`;
}

// Surprise gift box: the first thing on Home. Receiver sees a wrapped box; sender sees what happened next.
export function GiftBox({ home, solo, onInvite }) {
  const partner = home.couple.partner_name;
  const coupleId = home.couple.id;
  const [box, setBox] = useState(null);
  const [gift, setGift] = useState(null);
  const [sending, setSending] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sentNew, setSentNew] = useState(null);
  const [proofFor, setProofFor] = useState(null);
  const [planFor, setPlanFor] = useState(null);

  const load = () => rpc('gift_box').then(setBox).catch(() => {});
  useEffect(() => { load(); }, []);
  usePoll(load, 12000, !gift && !sending && !sentNew && !proofFor && !planFor);

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
  const badge = box.badge || 0;
  const openSent = async () => {
    setSentNew(box.events.map((e) => e.id));
    if (box.events.length) { try { await rpc('mark_gifts_seen'); } catch (_) { /* ignore */ } load(); }
  };
  const challenges = box.challenges || [];
  const plans = box.plans || [];

  return html`
    <section class="gift-wrap" aria-label="Surprise box">
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

      ${canSend ? html`
        <div class="gift-actions">
          <button class="btn ghost" onClick=${() => setSending(true)}>🎁 Send gift</button>
          <button class="btn ghost gift-sentbtn" onClick=${openSent}>💌 Sent by you${badge > 0 && html`<span class="gift-badge" aria-label=${badge + ' new'}>${badge}</span>`}</button>
        </div>`
        : solo && html`<button class="btn ghost" onClick=${onInvite}>＋ Invite your partner to send surprises</button>`}

      ${plans.length > 0 && html`
        <div class="gift-wallet">
          <h3>📅 Plans for you</h3>
          ${plans.map((p) => html`
            <div class="gw-row" key=${p.id}>
              <span class="gift-item-emo">${p.emoji}</span>
              <span class="grow"><b>${p.title}</b><br/><span class="small muted">${fmtWhen(p.plan_at)}</span></span>
              <button class="chip" onClick=${() => setPlanFor(p)}>Reply</button>
            </div>`)}
        </div>`}

      ${challenges.length > 0 && html`
        <div class="gift-wallet">
          <h3>🎯 Challenges for you</h3>
          ${challenges.map((c) => html`
            <div class="gw-row" key=${c.id}>
              <span class="gift-item-emo">${c.emoji}</span>
              <span class="grow"><b>${c.title}</b><br/><span class="small muted">${c.status === 'proof_sent' ? `Waiting for ${partner} to approve` : c.status === 'approved' ? `✅ Approved · +${c.points} points` : c.status === 'redo' ? `${partner} asked again${c.redo_note ? `: ${c.redo_note}` : ''}` : c.body}</span></span>
              ${(c.status === 'sent' || c.status === 'redo') && html`<button class="chip" onClick=${() => setProofFor(c)}>Add proof</button>`}
            </div>`)}
        </div>`}

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

      ${gift && html`<${Reveal} gift=${gift} partner=${partner} coupleId=${coupleId} onChanged=${load} onClose=${() => { setGift(null); load(); }} />`}
      ${sentNew && html`<${SentSheet} sent=${box.sent || []} newIds=${sentNew} partner=${partner} onChanged=${load} onClose=${() => { setSentNew(null); load(); }} />`}
      ${proofFor && html`<${ProofSheet} gift=${proofFor} coupleId=${coupleId} partner=${partner} onClose=${() => setProofFor(null)} onDone=${() => { setProofFor(null); load(); }} />`}
      ${planFor && html`<${Modal} title=${planFor.title} onClose=${() => { setPlanFor(null); load(); }}>
        <p class="gift-when center">📅 ${fmtWhen(planFor.plan_at)}</p><p class="center">${planFor.body}</p>
        <${PlanReply} gift=${planFor} partner=${partner} onDone=${load} />
      </${Modal}>`}
      ${sending && html`<${SendSheet} partner=${partner} onClose=${() => setSending(false)} onSent=${() => { setSending(false); toast(`Sent! ${partner} will find a wrapped box 🎁`); load(); }} />`}
    </section>`;
}
