import { html, useState, useEffect, useRef } from 'https://esm.sh/htm@3.1.1/preact/standalone';
import { sb, rpc, toast, fail, usePoll, confetti } from './lib.js';
import { Sheet, ScreenBar, Tabs, fmtDate, signed, uploadPhoto, uploadMedia, isAud, BUCKET } from './hub.js';
import { Capture } from './recorder.js';
import { callAI } from './ai.js';

const QUICK = [['🥰', 'Thinking of you'], ['😘', 'Miss you'], ['🤗', 'Need a hug'], ['☕', 'Chai later?'], ['🌙', 'Sleep well, jaan'], ['💪', 'You got this']];
const TOPICS = [['😔', 'You are sad'], ['😴', "You can't sleep"], ['😤', 'You are angry with me'], ['🎉', 'You did something great'], ['🥺', 'You miss me'], ['🎂', 'Your birthday']];
const ago = (s) => {
  const m = Math.round((Date.now() - new Date(s).getTime()) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  if (m < 1440) return `${Math.round(m / 60)}h ago`;
  return fmtDate(s);
};
const fmtWhen = (s) => new Date(s).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
const pic = (n) => (n.photos && n.photos.length ? ` 📎 ${n.photos.length}` : '');

// the photos that came with a note or letter, shown as a swipeable strip
function NotePhotos({ paths }) {
  const [urls, setUrls] = useState({});
  const key = (paths || []).join('|');
  useEffect(() => { if (paths && paths.length) signed(paths).then(setUrls).catch(fail); }, [key]);
  if (!paths || !paths.length) return null;
  return html`<div class="carousel">${paths.map((p) => isAud(p) ? html`<audio class="car-aud" src=${urls[p] || ''} controls preload="metadata"></audio>` : html`<div class="car-img" style=${urls[p] ? `background-image:url("${urls[p]}")` : ''}></div>`)}</div>`;
}

export function NotesScreen({ home, back }) {
  const [d, setD] = useState(null);
  const [tab, setTab] = useState('all');
  const [composer, setComposer] = useState(null); // {kind}
  const [read, setRead] = useState(null);
  const [letter, setLetter] = useState(null);
  const [pulled, setPulled] = useState(null);
  const me = home.profile.name, partner = home.couple.partner_name;

  const load = () => rpc('love_notes').then(setD).catch(fail);
  useEffect(() => { load(); }, []);
  usePoll(load, 12000, true);

  const quick = async (e, t) => {
    try { await rpc('send_note', { p_kind: 'quick', p_title: null, p_body: t, p_emoji: e }); toast(`Sent to ${partner} ${e}`); load(); }
    catch (err) { fail(err); }
  };
  const openNote = async (n) => {
    setRead(n);
    if (n.unread) { try { await rpc('mark_note_read', { p_id: n.id }); load(); } catch (_) { /* ignore */ } }
  };
  const openLetter = async (l) => {
    try { const x = await rpc('open_letter', { p_id: l.id }); setLetter(x); load(); } catch (e) { fail(e); }
  };
  const pull = async () => {
    try {
      const x = await rpc('pull_jar');
      if (!x) return toast(`${partner} has not filled your jar yet`);
      setPulled(x); if (x.fresh) confetti(); load();
    } catch (e) { fail(e); }
  };
  const del = async (id) => {
    if (!confirm('Delete this for both of you?')) return;
    try {
      const paths = await rpc('delete_note_v2', { p_id: id });
      if (paths && paths.length) { try { await sb.storage.from(BUCKET).remove(paths); } catch (_) { /* files can be cleaned later */ } }
      load(); setRead(null);
    } catch (e) { fail(e); }
  };

  const unread = d ? d.inbox.filter((n) => n.unread).length : 0;
  const Bubble = ({ n, mine }) => html`
    <button class=${'note-card' + (!mine && n.unread ? ' unread' : '') + (n.kind === 'quick' ? ' q' : '')} onClick=${() => (mine ? setRead({ ...n, mine: true }) : openNote(n))}>
      <span class="note-emo">${n.emoji || '💌'}</span>
      <span class="grow">
        <b>${n.title || (n.kind === 'quick' ? n.body : mine ? `To ${partner}` : `From ${partner}`)}</b>
        ${n.title || n.kind !== 'quick' ? html`<span class="small muted note-prev">${n.body}${pic(n)}</span>` : ''}
        <span class="small muted">${mine ? (n.pending ? `⏰ Arrives ${fmtWhen(n.deliver_at)}` : n.seen ? '✓ Read · ' + ago(n.at) : 'Sent · ' + ago(n.at)) : ago(n.at)}</span>
      </span>
      ${!mine && n.unread && html`<i class="dot"></i>`}
    </button>`;

  // Everything in one list per person for the All tab: notes, letters, jar reasons and scheduled notes.
  const fromThem = !d ? [] : [
    ...d.inbox.map((n) => ({ key: n.id, kind: n.kind === 'quick' ? 'Quick note' : 'Note', emo: n.emoji || '💌', title: n.title || (n.kind === 'quick' ? n.body : 'A note for you'), sub: (n.title || n.kind !== 'quick' ? n.body : '') + pic(n), at: n.at, unread: n.unread, go: () => openNote(n) })),
    ...d.openwhen_in.map((l) => ({ key: l.id, kind: 'Open When', emo: l.opened ? '💌' : '✉️', title: `Open when… ${l.topic}`, sub: l.opened ? (l.title || 'Opened') : 'Sealed. Open it when it feels right.', at: l.created_at, unread: !l.opened, go: () => openLetter(l) })),
    ...d.jar_pulled.map((j) => ({ key: j.id, kind: 'Jar', emo: '💗', title: 'A reason from the jar', sub: j.body, at: j.read_at, go: () => setRead({ title: 'A reason from the jar', body: j.body, emoji: '💗' }) })),
    ...(d.jar_left > 0 ? [{ key: 'jarleft', kind: 'Jar', emo: '🫙', title: `${d.jar_left} ${d.jar_left === 1 ? 'reason is' : 'reasons are'} waiting in your jar`, sub: 'Tap to pull one', at: new Date().toISOString(), unread: true, go: () => setTab('jar') }] : []),
    ...d.incoming_scheduled.map((n) => ({ key: n.id, kind: 'Scheduled', emo: '🎁', title: `${partner} scheduled a surprise`, sub: `Arrives ${fmtWhen(n.deliver_at)}`, at: n.deliver_at })),
  ].sort((a, b) => String(b.at).localeCompare(String(a.at)));
  const fromMe = !d ? [] : [
    ...d.sent.map((n) => ({ key: n.id, kind: n.pending ? 'Scheduled' : n.kind === 'quick' ? 'Quick note' : 'Note', emo: n.emoji || '💌', title: n.title || (n.kind === 'quick' ? n.body : `To ${partner}`), sub: n.pending ? `⏰ Arrives ${fmtWhen(n.deliver_at)}` : (n.title || n.kind !== 'quick' ? n.body : '') + pic(n), at: n.at, seen: n.seen, go: () => setRead({ ...n, mine: true }) })),
    ...d.openwhen_out.map((l) => ({ key: l.id, kind: 'Open When', emo: '✉️', title: `Open when… ${l.topic}`, sub: l.title || '', at: l.created_at, go: () => setRead({ ...l, mine: true, emoji: '✉️', title: 'Open when… ' + l.topic }) })),
    ...d.jar_out.map((j) => ({ key: j.id, kind: 'Jar', emo: '💗', title: `In ${partner}'s jar`, sub: j.body, at: j.created_at, go: () => setRead({ id: j.id, mine: true, title: `In ${partner}'s jar`, body: j.body, emoji: '💗' }) })),
  ].sort((a, b) => String(b.at).localeCompare(String(a.at)));
  const FeedItem = ({ x }) => html`
    <button class=${'note-card' + (x.unread ? ' unread' : '')} onClick=${x.go || (() => {})} style=${x.go ? '' : 'cursor:default'}>
      <span class="note-emo">${x.emo}</span>
      <span class="grow">
        <span class="feed-kind">${x.kind}</span>
        <b>${x.title}</b>
        ${x.sub && html`<span class="small muted note-prev">${x.sub}</span>`}
        <span class="small muted">${x.kind === 'Scheduled' && !x.go ? '' : (x.seen ? '✓ Read · ' : '') + ago(x.at)}</span>
      </span>
      ${x.unread && html`<i class="dot"></i>`}
    </button>`;

  return html`
    <div class="stack-lg screen">
      <${ScreenBar} back=${back} title="Love Notes" emo="💌" />
      <p class="muted" style="margin-top:-12px">Little words, big feelings</p>
      <${Tabs} items=${[['all', 'All', unread > 0 || (d && (d.jar_left > 0 || d.openwhen_in.some((l) => !l.opened)))], ['openwhen', 'Open When', d && d.openwhen_in.some((l) => !l.opened)], ['sched', 'Scheduled'], ['jar', 'Jar', d && d.jar_left > 0]]} value=${tab} onChange=${setTab} />
      ${!d ? html`<p class="muted pulse center">Loading…</p>` : html`
        ${tab === 'all' && html`
          <section class="panel stack">
            <h3>Quick note to ${partner}</h3>
            <div class="quick-grid">${QUICK.map(([e, t]) => html`<button class="quick" onClick=${() => quick(e, t)}><span>${e}</span><small>${t}</small></button>`)}</div>
            <button class="btn" onClick=${() => setComposer({ kind: 'note' })}>✍️ Write a love note</button>
          </section>
          <h3>From ${partner}</h3>
          ${fromThem.length === 0 ? html`<p class="muted small">Nothing yet. Maybe nudge ${partner} 😉</p>` : html`<div class="stack">${fromThem.map((x) => html`<${FeedItem} x=${x} />`)}</div>`}
          <h3>From you</h3>
          ${fromMe.length === 0 ? html`<p class="muted small">Nothing sent yet.</p>` : html`<div class="stack">${fromMe.map((x) => html`<${FeedItem} x=${x} />`)}</div>`}`}

        ${tab === 'openwhen' && html`
          <p class="muted small">Letters for hard or happy moments. They stay sealed until the right time.</p>
          <button class="btn" onClick=${() => setComposer({ kind: 'openwhen' })}>＋ Write an Open When letter</button>
          <h3>For you from ${partner}</h3>
          ${d.openwhen_in.length === 0 ? html`<p class="muted small">No letters yet.</p>` : html`<div class="stack">${d.openwhen_in.map((l) => html`
            <button class=${'note-card' + (l.opened ? '' : ' unread')} onClick=${() => openLetter(l)}>
              <span class="note-emo">${l.opened ? '💌' : '✉️'}</span>
              <span class="grow"><b>Open when… ${l.topic}</b><span class="small muted">${l.opened ? (l.title || 'Opened') : 'Sealed. Open it when it feels right.'}</span></span>
            </button>`)}</div>`}
          <h3>You wrote</h3>
          ${d.openwhen_out.length === 0 ? html`<p class="muted small">None yet.</p>` : html`<div class="stack">${d.openwhen_out.map((l) => html`
            <button class="note-card" onClick=${() => setRead({ ...l, mine: true, emoji: '✉️', title: 'Open when… ' + l.topic })}>
              <span class="note-emo">✉️</span><span class="grow"><b>Open when… ${l.topic}</b><span class="small muted">${fmtDate(l.created_at)}</span></span>
            </button>`)}</div>`}`}

        ${tab === 'sched' && html`
          <p class="muted small">Write now, it lands in ${partner}'s inbox at the time you pick. Great for mornings and anniversaries.</p>
          <button class="btn" onClick=${() => setComposer({ kind: 'note', schedule: true })}>⏰ Schedule a note</button>
          <h3>Waiting to be delivered</h3>
          ${d.sent.filter((n) => n.pending).length === 0 ? html`<p class="muted small">Nothing scheduled.</p>` : html`<div class="stack">${d.sent.filter((n) => n.pending).map((n) => html`<${Bubble} n=${n} mine />`)}</div>`}
          ${d.incoming_scheduled.length > 0 && html`
            <h3>Coming for you</h3>
            <div class="stack">${d.incoming_scheduled.map((n) => html`<div class="note-card"><span class="note-emo">🎁</span><span class="grow"><b>${partner} scheduled a surprise</b><span class="small muted">Arrives ${fmtWhen(n.deliver_at)}</span></span></div>`)}</div>`}`}

        ${tab === 'jar' && html`
          <section class="jar-box">
            <div class="jar-art">🫙</div>
            <h3>Jar of reasons</h3>
            <p class="small muted">${partner} fills it with reasons they love you. Pull one when you need it.</p>
            <p><span class="chip">${d.jar_left} unread ${d.jar_left === 1 ? 'reason' : 'reasons'}</span></p>
            <button class="btn" onClick=${pull}>Pull a reason 💗</button>
          </section>
          <button class="btn ghost" onClick=${() => setComposer({ kind: 'jar' })}>＋ Add to ${partner}'s jar</button>
          ${d.jar_out.length > 0 && html`<h3>You added (${d.jar_out.length})</h3><div class="stack">${d.jar_out.map((j) => html`<div class="note-card"><span class="note-emo">💗</span><span class="grow">${j.body}</span><button class="link" onClick=${() => del(j.id)}>Delete</button></div>`)}</div>`}
          ${d.jar_pulled.length > 0 && html`<h3>Reasons you pulled</h3><div class="stack">${d.jar_pulled.map((j) => html`<div class="note-card"><span class="note-emo">💗</span><span class="grow">${j.body}</span></div>`)}</div>`}`}`}

      ${composer && html`<${Composer} kind=${composer.kind} schedule=${composer.schedule} me=${me} partner=${partner} coupleId=${home.couple.id} onClose=${() => setComposer(null)} onSent=${() => { setComposer(null); load(); toast('Sent 💌'); }} />`}
      ${read && html`
        <${Sheet} title=${read.title || (read.mine ? `To ${partner}` : `From ${partner}`)} onClose=${() => setRead(null)}>
          <div class="note-paper">${read.emoji ? read.emoji + ' ' : ''}${read.body}</div>
          <${NotePhotos} paths=${read.photos} />
          ${read.mine && html`<button class="btn ghost" onClick=${() => del(read.id)}>🗑 Delete</button>`}
        </${Sheet}>`}
      ${letter && html`
        <${Sheet} title=${'Open when… ' + letter.topic} onClose=${() => setLetter(null)}>
          ${letter.title && html`<h3>${letter.title}</h3>`}
          <div class="note-paper">${letter.body}</div>
          <${NotePhotos} paths=${letter.photos} />
        </${Sheet}>`}
      ${pulled && html`
        <${Sheet} title=${pulled.fresh ? 'A new reason ✨' : 'A reason again 💗'} onClose=${() => setPulled(null)}>
          <div class="note-paper big">${pulled.body}</div>
          <p class="small muted center">${pulled.left} unread left in the jar</p>
        </${Sheet}>`}
    </div>`;
}

function Composer({ kind, schedule, me, partner, coupleId, onClose, onSent }) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [topic, setTopic] = useState('');
  const [when, setWhen] = useState('');
  const [busy, setBusy] = useState(false);
  const [ai, setAi] = useState(false);
  const [files, setFiles] = useState([]);
  const [prog, setProg] = useState('');
  const canPhoto = kind === 'note' || kind === 'openwhen';
  const previews = useRef(new Map());
  const prev = (f) => { if (!previews.current.has(f)) previews.current.set(f, URL.createObjectURL(f)); return previews.current.get(f); };
  useEffect(() => () => previews.current.forEach((u) => URL.revokeObjectURL(u)), []);
  const addFiles = (e) => {
    const picked = [...e.target.files].filter((f) => f.type.startsWith('image/') || f.type.startsWith('audio/'));
    setFiles((cur) => [...cur, ...picked].slice(0, 3));
    e.target.value = '';
  };

  const heading = kind === 'openwhen' ? 'Open When letter' : kind === 'jar' ? `A reason for ${partner}'s jar` : schedule ? 'Schedule a note' : 'Love note';
  const help = async () => {
    setAi(true);
    try {
      const hint = [kind === 'openwhen' ? `An "open when ${topic || 'you miss me'}" letter` : kind === 'jar' ? 'One short reason I love them' : 'A short love note', body && `My rough idea: ${body}`].filter(Boolean).join('. ');
      const r = await callAI('note', hint, { me, partner });
      setBody((r.data.body || '').slice(0, 1200));
    } catch (e) { fail(e); }
    setAi(false);
  };
  const send = async (e) => {
    e.preventDefault();
    if (schedule && !when) return fail(new Error('Pick when it should arrive'));
    setBusy(true);
    const paths = [];
    try {
      for (let i = 0; i < files.length; i++) {
        setProg(`Uploading ${i + 1} of ${files.length}…`);
        paths.push(await uploadMedia(coupleId, files[i]));
      }
      setProg('');
      await rpc('send_note_v2', {
        p_kind: kind, p_title: title || null, p_body: body, p_emoji: kind === 'jar' ? '💗' : '💌',
        p_topic: kind === 'openwhen' ? topic : null, p_deliver_at: schedule ? new Date(when).toISOString() : null,
        p_paths: paths,
      });
      onSent();
    } catch (err) {
      if (paths.length) { try { sb.storage.from(BUCKET).remove(paths); } catch (_) { /* ignore */ } }
      setProg(''); fail(err); setBusy(false);
    }
  };
  const minDt = new Date(Date.now() + 60000 - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  return html`
    <${Sheet} title=${heading} onClose=${onClose}>
      <form class="stack" onSubmit=${send}>
        ${kind === 'openwhen' && html`
          <div class="stack">
            <span class="small muted">Open when…</span>
            <div class="chips-wrap">${TOPICS.map(([e, t]) => html`<button type="button" class=${'chip-btn' + (topic === t ? ' on' : '')} onClick=${() => setTopic(t)}>${e} ${t}</button>`)}</div>
            <input class="input" maxlength="40" placeholder="Or write your own" value=${topic} onInput=${(e) => setTopic(e.target.value)} aria-label="Open when" />
          </div>`}
        ${kind !== 'jar' && html`<label class="field"><span>Title (optional)</span><input class="input" maxlength="80" value=${title} onInput=${(e) => setTitle(e.target.value)} /></label>`}
        <label class="field"><span>${kind === 'jar' ? 'Why do you love them?' : 'Your words'}</span>
          <textarea class="input" required rows=${kind === 'jar' ? 3 : 7} maxlength="1200" value=${body} onInput=${(e) => setBody(e.target.value)} placeholder=${kind === 'jar' ? 'The way you laugh at your own jokes…' : 'Write from the heart…'}></textarea>
        </label>
        <button type="button" class="btn ghost" disabled=${ai} onClick=${help}>${ai ? 'Writing…' : '✍️ Help me write'}</button>
        ${canPhoto && html`
          <div class="pick-row">
            ${files.map((f, i) => html`<div class="pick-thumb" style=${f.type.startsWith('audio/') ? '' : `background-image:url("${prev(f)}")`}>${f.type.startsWith('audio/') && html`<span class="pick-vid">🎙️</span>`}<button type="button" aria-label="Remove photo" onClick=${() => setFiles(files.filter((_, j) => j !== i))}>✕</button></div>`)}
            ${files.length < 3 && html`<label class="pick-add">📁<span class="small">Gallery</span><input type="file" accept="image/*,audio/*" multiple hidden onChange=${addFiles} /></label>`}
          </div>
          ${files.length < 3 && html`<${Capture} modes=${['photo', 'voice']} accept="image/*,audio/*" onFile=${(f) => setFiles((cur) => [...cur, f].slice(0, 3))} label="Gallery" />`}`}
        ${schedule && html`<label class="field"><span>Deliver at</span><input class="input" type="datetime-local" required min=${minDt} value=${when} onInput=${(e) => setWhen(e.target.value)} /></label>`}
        <button class="btn" disabled=${busy || !body.trim()}>${busy ? (prog || 'Sending…') : schedule ? 'Schedule' : 'Send 💌'}</button>
      </form>
    </${Sheet}>`;
}
