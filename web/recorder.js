// In-app camera and voice recorder: take a photo, record a short video, or record a voice note without leaving the app.
import { html, useState, useEffect, useRef } from 'https://esm.sh/htm@3.1.1/preact/standalone';
import { fail } from './lib.js';

const LIMIT = { video: 20, voice: 60 };
const pickMime = (list) => (window.MediaRecorder && list.find((m) => MediaRecorder.isTypeSupported(m))) || '';
const VIDEO_MIME = ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm'];
const AUDIO_MIME = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg'];

function RecordSheet({ modes, onFile, onClose }) {
  const [mode, setMode] = useState(modes[0]);
  const [facing, setFacing] = useState('user');
  const [recording, setRecording] = useState(false);
  const [secs, setSecs] = useState(0);
  const [shot, setShot] = useState(null); // { file, url }
  const [err, setErr] = useState('');
  const vid = useRef(null), stream = useRef(null), rec = useRef(null), timer = useRef(null);

  const stopStream = () => { if (stream.current) stream.current.getTracks().forEach((t) => t.stop()); stream.current = null; };
  useEffect(() => {
    if (shot) return;
    let dead = false;
    stopStream(); setErr('');
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { setErr('This browser cannot open the camera or mic here.'); return; }
    const want = mode === 'voice' ? { audio: true } : { video: { facingMode: facing, ...(mode === 'video' ? { width: { ideal: 640 }, height: { ideal: 480 } } : {}) }, audio: mode === 'video' };
    navigator.mediaDevices.getUserMedia(want).then((s) => {
      if (dead) { s.getTracks().forEach((t) => t.stop()); return; }
      stream.current = s;
      if (vid.current) { vid.current.srcObject = s; vid.current.play().catch(() => {}); }
    }).catch(() => !dead && setErr('Allow the camera and microphone in your browser settings, then try again.'));
    return () => { dead = true; stopStream(); };
  }, [mode, facing, !!shot]);
  useEffect(() => () => { clearInterval(timer.current); stopStream(); if (shot) URL.revokeObjectURL(shot.url); }, []);

  const keep = (blob, name) => { const file = new File([blob], name, { type: blob.type }); setShot({ file, url: URL.createObjectURL(blob) }); stopStream(); };
  const snap = () => {
    const v = vid.current;
    if (!v || !v.videoWidth) return;
    const c = document.createElement('canvas'); c.width = v.videoWidth; c.height = v.videoHeight;
    c.getContext('2d').drawImage(v, 0, 0);
    c.toBlob((b) => b && keep(b, 'photo.jpg'), 'image/jpeg', 0.9);
  };
  const start = () => {
    if (!stream.current) return;
    const mime = pickMime(mode === 'voice' ? AUDIO_MIME : VIDEO_MIME);
    let mr;
    try { mr = new MediaRecorder(stream.current, mime ? { mimeType: mime, ...(mode === 'video' ? { videoBitsPerSecond: 800000 } : {}) } : undefined); } catch (e) { return fail(new Error('This phone cannot record here.')); }
    const chunks = [];
    mr.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    mr.onstop = () => {
      clearInterval(timer.current); setRecording(false);
      const type = (mr.mimeType || mime || (mode === 'voice' ? 'audio/webm' : 'video/webm')).split(';')[0];
      keep(new Blob(chunks, { type }), mode === 'voice' ? 'voice' : 'clip');
    };
    mr.start(); rec.current = mr; setRecording(true); setSecs(0);
    const t0 = Date.now();
    timer.current = setInterval(() => {
      const s = Math.floor((Date.now() - t0) / 1000); setSecs(s);
      if (s >= LIMIT[mode]) stop();
    }, 250);
  };
  const stop = () => { if (rec.current && rec.current.state === 'recording') rec.current.stop(); };
  const retake = () => { if (shot) URL.revokeObjectURL(shot.url); setShot(null); setSecs(0); };
  const pick = (m) => { if (!recording) { retake(); setMode(m); } };
  const done = () => { onFile(shot.file); onClose(); };
  const NAMES = { photo: '📷 Photo', video: '🎥 Video', voice: '🎙️ Voice' };

  return html`
    <div class="sheet-bg" onClick=${(e) => { if (e.target === e.currentTarget && !recording) onClose(); }}>
      <div class="sheet" role="dialog" aria-label="Record">
        <div class="sheet-head"><h2>Record</h2><button class="back" onClick=${() => { if (!recording) onClose(); }} aria-label="Close">✕</button></div>
        <div class="stack-lg">
          ${modes.length > 1 && html`<div class="chips-wrap">${modes.map((m) => html`<button type="button" class=${'chip-btn' + (mode === m ? ' on' : '')} onClick=${() => pick(m)}>${NAMES[m]}</button>`)}</div>`}
          ${err ? html`<p class="gift-redo">${err}</p>` : shot
            ? (mode === 'photo' ? html`<img class="gift-proof" src=${shot.url} alt="Your photo" />`
              : mode === 'video' ? html`<video class="gift-proof" src=${shot.url} controls playsinline></video>`
              : html`<audio src=${shot.url} controls style="width:100%"></audio>`)
            : mode === 'voice'
              ? html`<div class="center" style="padding:28px 0"><div style="font-size:54px">${recording ? '🔴' : '🎙️'}</div><b>${recording ? `${secs}s` : 'Tap record and speak'}</b></div>`
              : html`<video ref=${vid} class="gift-proof" muted playsinline autoplay style=${facing === 'user' ? 'transform:scaleX(-1)' : ''}></video>`}
          ${!err && !shot && html`<div class="row between">
            ${mode !== 'voice' && !recording ? html`<button type="button" class="btn ghost" onClick=${() => setFacing(facing === 'user' ? 'environment' : 'user')}>🔄 Flip</button>` : html`<span></span>`}
            ${mode === 'photo' ? html`<button type="button" class="btn" onClick=${snap}>📸 Take photo</button>`
              : recording ? html`<button type="button" class="btn" onClick=${stop}>⏹ Stop · ${secs}s / ${LIMIT[mode]}s</button>`
              : html`<button type="button" class="btn" onClick=${start}>⏺ Record</button>`}
          </div>`}
          ${shot && html`<div class="row between"><button type="button" class="btn ghost" onClick=${retake}>🔁 Retake</button><button type="button" class="btn" onClick=${done}>Use this</button></div>`}
        </div>
      </div>
    </div>`;
}

// Buttons: record in the app, or pick a file from the gallery. Calls onFile(file).
export function Capture({ modes = ['photo', 'video', 'voice'], accept = 'image/*,video/*', onFile, label = 'Upload' }) {
  const [open, setOpen] = useState(false);
  return html`
    <div class="chips-wrap">
      ${modes.includes('photo') && html`<button type="button" class="chip-btn" onClick=${() => setOpen(['photo'])}>📷 Photo</button>`}
      ${modes.includes('video') && html`<button type="button" class="chip-btn" onClick=${() => setOpen(['video'])}>🎥 Video</button>`}
      ${modes.includes('voice') && html`<button type="button" class="chip-btn" onClick=${() => setOpen(['voice'])}>🎙️ Voice</button>`}
      <label class="chip-btn" style="cursor:pointer">📁 ${label}<input type="file" accept=${accept} hidden onChange=${(e) => { const f = e.target.files[0]; if (f) onFile(f); e.target.value = ''; }} /></label>
    </div>
    ${open && html`<${RecordSheet} modes=${open} onFile=${onFile} onClose=${() => setOpen(false)} />`}`;
}

// Small preview of a chosen file
export function Chosen({ file, onClear }) {
  const [url, setUrl] = useState('');
  useEffect(() => { const u = URL.createObjectURL(file); setUrl(u); return () => URL.revokeObjectURL(u); }, [file]);
  const t = file.type || '';
  return html`<div class="stack">
    ${t.startsWith('video/') ? html`<video class="gift-proof" src=${url} controls playsinline></video>`
      : t.startsWith('audio/') ? html`<audio src=${url} controls style="width:100%"></audio>`
      : html`<img class="gift-proof" src=${url} alt="Chosen" />`}
    <button type="button" class="btn ghost" onClick=${onClear}>✕ Remove</button>
  </div>`;
}
