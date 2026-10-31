// Public couple website. Opened as /site.html?s=<slug>, or /site.html?preview=1 inside the builder.
// Everything a couple typed is escaped before it touches the page.
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';

const qs = new URLSearchParams(location.search);
const PREVIEW = qs.has('preview');
const PHOTO_PREFIX = `${SUPABASE_URL}/storage/v1/object/public/site-photos/`;
const root = document.getElementById('site');

const e = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const paras = (s) => String(s ?? '').split(/\n{2,}|\n/).map((p) => p.trim()).filter(Boolean).map((p) => `<p>${e(p)}</p>`).join('');
const lines = (v) => (Array.isArray(v) ? v : String(v ?? '').split('\n')).map((x) => String(x).trim()).filter(Boolean);
const okUrl = (u) => typeof u === 'string' && !/["'()\\<>\s]/.test(u) && (u.startsWith(PHOTO_PREFIX) || (PREVIEW && u.startsWith('blob:' + location.origin)));
const img = (u, cls = '', alt = '') => (okUrl(u) ? `<img class="${cls}" src="${e(u)}" alt="${e(alt)}" loading="lazy">` : '');
const fmtDate = (s) => { const d = new Date(String(s) + 'T00:00:00'); return isNaN(d) ? '' : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }); };
const daysSince = (s) => { const d = new Date(String(s) + 'T00:00:00'); return isNaN(d) ? null : Math.max(0, Math.floor((Date.now() - d) / 864e5)); };
const yt = (q) => `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`;

// ---------- sections ----------
const S = {
  counter(d, label) {
    const n = daysSince(d.special_date);
    if (n === null) return '';
    return `<section class="sec counter reveal"><div class="big" data-count="${n}">0</div><div class="lbl">${e(label || 'days of us')}</div><div class="since">since ${e(fmtDate(d.special_date))}</div></section>`;
  },
  countdown(d, label) {
    if (!d.event_date) return '';
    return `<section class="sec countdown reveal" data-target="${e(d.event_date)}"><div class="lbl">${e(label)}</div><div class="cd"><span><b>0</b>days</span><span><b>0</b>hrs</span><span><b>0</b>min</span><span><b>0</b>sec</span></div></section>`;
  },
  intro: (d) => (d.intro ? `<section class="sec intro reveal">${paras(d.intro)}</section>` : ''),
  story: (d, title = 'How it all began') => (d.story ? `<section class="sec story reveal"><h2>${e(title)}</h2>${paras(d.story)}</section>` : ''),
  reasons(d, title, cls = 'reasons') {
    const r = lines(d.reasons);
    if (!r.length) return '';
    return `<section class="sec ${cls} reveal"><h2>${e(title || `${r.length} reasons I love you`)}</h2><div class="rgrid">${r.map((x, i) => `<div class="rcard" style="--i:${i}"><span class="rn">${i + 1}</span><span>${e(x)}</span></div>`).join('')}</div></section>`;
  },
  moments(d, title = 'Our moments', cls = 'moments') {
    const m = (d.moments || []).filter((x) => x && x.title);
    if (!m.length) return '';
    return `<section class="sec ${cls} reveal"><h2>${e(title)}</h2><div class="mlist">${m.map((x, i) => `
      <article class="moment" style="--i:${i}">${img(x.photo, 'mph', x.title)}<div class="mtxt"><h3>${e(x.title)}</h3>${x.date ? `<time>${e(fmtDate(x.date))}</time>` : ''}${x.caption ? `<p>${e(x.caption)}</p>` : ''}</div></article>`).join('')}</div></section>`;
  },
  gallery(d, title = 'Us', cls = 'gallery') {
    const p = (d.photos || []).filter(okUrl);
    if (!p.length) return '';
    return `<section class="sec ${cls} reveal"><h2>${e(title)}</h2><div class="ggrid">${p.map((u, i) => `<figure style="--i:${i}">${img(u)}</figure>`).join('')}</div></section>`;
  },
  song(d, title = 'Our song') {
    if (!d.song) return '';
    return `<section class="sec song reveal"><h2>${e(title)}</h2><a class="songcard" href="${e(yt(d.song))}" target="_blank" rel="noopener"><span class="disc">♫</span><span>${e(d.song)}</span><span class="play">▶ Play</span></a></section>`;
  },
  letter: (d, title = 'A letter for you') => (d.letter ? `<section class="sec letter reveal"><h2>${e(title)}</h2><div class="paper">${paras(d.letter)}<p class="sign">${e(d.me)}</p></div></section>` : ''),
  dreams(d, title = 'Still to come') {
    const r = lines(d.dreams);
    if (!r.length) return '';
    return `<section class="sec dreams reveal"><h2>${e(title)}</h2><ul>${r.map((x) => `<li>${e(x)}</li>`).join('')}</ul></section>`;
  },
  closing: (d) => `<section class="sec closing reveal"><p class="cl">${e(d.closing || `Forever yours, ${d.me}`)}</p></section>`,
  foot: () => `<footer class="foot">Made with 💞 on <a href="/" target="_blank" rel="noopener">Jugalbandi</a>. Make one for your partner.</footer>`,
};

const hello = (d) => `${e(d.nickname || d.partner)}`;
const heroPhoto = (d) => d.hero || (d.photos || [])[0];

// ---------- templates ----------
const T = {
  classic: (d) => `
    <header class="hero">${img(heroPhoto(d), 'hbg')}<div class="hin"><p class="kick">For ${hello(d)}</p><h1>${e(d.headline || `${d.me} ♥ ${d.partner}`)}</h1><p class="sub">${e(d.occasion || '')}</p></div><div class="scroll">↓</div></header>
    ${S.intro(d)}${S.counter(d)}${S.story(d)}${S.reasons(d)}${S.moments(d)}${S.gallery(d)}${S.song(d)}${S.letter(d)}${S.closing(d)}`,

  filmy: (d) => `
    <header class="hero poster">${img(heroPhoto(d), 'hbg')}<div class="hin"><p class="kick">${e(d.me)} Productions presents</p><h1>${e(d.movie_title || d.headline || 'Ek Prem Kahani')}</h1><p class="star">Starring <b>${e(d.me)}</b> &amp; <b>${e(d.partner)}</b></p>${d.dialogue ? `<p class="dlg">“${e(d.dialogue)}”</p>` : ''}<p class="rating">★★★★★ “A blockbuster” — Their mothers</p></div></header>
    ${S.intro(d)}${S.story(d, 'The plot')}${S.moments(d, 'Best scenes', 'moments scenes')}${S.reasons(d, 'Critics say', 'reasons reviews')}${S.song(d, 'Soundtrack')}${S.gallery(d, 'Behind the scenes')}${S.letter(d, 'The climax')}
    <section class="sec closing reveal"><p class="cl">${e(d.closing || 'The End.')}</p><p class="cl2">…ya bas shuruaat? 🎬</p></section>`,

  stars: (d) => `
    <canvas id="sky"></canvas>
    <header class="hero"><div class="hin"><p class="kick">For ${hello(d)}, my brightest star</p><h1>${e(d.headline || 'Every star is a day with you')}</h1></div><div class="scroll">↓</div></header>
    ${S.counter(d, 'nights under the same sky')}${S.intro(d)}${S.story(d)}${S.reasons(d, 'Stars I wished on', 'reasons starry')}${S.moments(d)}${S.gallery(d)}${S.dreams(d, 'Our wishes')}${S.letter(d)}${S.closing(d)}`,

  scrapbook: (d) => `
    <header class="hero"><div class="hin"><p class="kick">our little scrapbook</p><h1>${e(d.headline || `${d.me} + ${d.partner}`)}</h1>${img(heroPhoto(d), 'polaroid tilt')}</div></header>
    ${S.intro(d)}${S.story(d, 'page 1: how it started')}${S.gallery(d, 'snapshots', 'gallery polas')}${S.reasons(d, 'sticky notes for you', 'reasons sticky')}${S.moments(d, 'pages we love', 'moments polas')}${S.song(d)}${S.letter(d, 'last page')}${S.closing(d)}`,

  envelope: (d) => `
    <header class="hero env"><div class="hin"><p class="kick">You’ve got mail, ${hello(d)}</p>
      <button class="envelope" id="env" aria-label="Open the letter"><span class="flap"></span><span class="seal">💌</span><span class="tap">Tap to open</span></button>
      <div class="opened" id="opened" hidden><h1>${e(d.headline || 'Open me slowly')}</h1><div class="paper">${paras(d.letter || d.intro || '')}<p class="sign">${e(d.me)}</p></div></div>
    </div></header>
    <div id="after" hidden>${S.reasons(d)}${S.moments(d)}${S.gallery(d)}${S.song(d)}${S.closing(d)}</div>`,

  birthday: (d) => `
    <header class="hero"><div class="hin"><p class="kick">🎈 It’s your day 🎈</p><h1>Happy ${d.age ? e(d.age) + suffix(d.age) + ' ' : ''}Birthday, ${hello(d)}!</h1><p class="sub">${e(d.headline || '')}</p>
      <div class="cake" id="cake" role="button" tabindex="0" aria-label="Blow the candles"><div class="candles"><i></i><i></i><i></i></div><div class="tier t1"></div><div class="tier t2"></div><p class="tap">Tap to blow the candles</p></div></div></header>
    ${S.countdown(d, 'Your birthday is in')}${S.intro(d)}${S.reasons(d, 'Birthday wishes, one for every reason I love you', 'reasons wishes')}${S.gallery(d, 'Another year of us')}${S.moments(d)}${S.song(d, 'Your birthday song')}${S.letter(d, 'A birthday letter')}${S.closing(d)}`,

  timeline: (d) => `
    <header class="hero">${img(heroPhoto(d), 'hbg')}<div class="hin"><p class="kick">${e(d.occasion || 'Our anniversary')}</p><h1>${e(d.headline || `${d.me} & ${d.partner}`)}</h1></div></header>
    ${S.counter(d, 'days together')}${S.intro(d)}${S.story(d)}${S.moments(d, 'Our journey', 'moments tl')}${S.reasons(d)}${S.gallery(d)}${S.dreams(d, 'What’s next for us')}${S.song(d)}${S.letter(d)}${S.closing(d)}`,

  proposal: (d) => `
    <header class="hero">${img(heroPhoto(d), 'hbg')}<div class="hin"><p class="kick">${hello(d)}, read till the end</p><h1>${e(d.headline || 'I have something to ask you')}</h1></div><div class="scroll">↓</div></header>
    ${S.intro(d)}${S.story(d)}${S.moments(d)}${S.reasons(d)}${S.gallery(d)}${S.letter(d)}
    <section class="sec ask reveal" id="ask"><div class="ring">💍</div><h2>${e(d.question || 'Will you be mine forever?')}</h2><div class="btns"><button id="yes" class="yes">Yes! 💖</button><button id="no" class="no">No</button></div>
      <div id="yesmsg" class="yesmsg" hidden><h2>Yes! 🎉</h2><p>${e(d.yes_message || 'Best decision of your life.')}</p></div></section>`,

  sorry: (d) => `
    <header class="hero"><div class="hin"><div class="teddy">🧸</div><p class="kick">${hello(d)}…</p><h1>${e(d.headline || 'I’m really sorry')}</h1>${d.sorry_reason ? `<p class="sub">${e(d.sorry_reason)}</p>` : ''}</div></header>
    ${S.letter(d, 'Please read this')}${d.promise ? `<section class="sec promise reveal"><h2>My promise</h2><p class="pr">🤞 ${e(d.promise)}</p></section>` : ''}${S.reasons(d, 'I love you even when I mess up, because…')}${S.gallery(d, 'Remember us like this?')}
    <section class="sec ask reveal"><h2>Maaf kar do?</h2><div class="btns"><button id="yes" class="yes">Haan, maaf kiya 💕</button><button id="no" class="no">Nahi 😤</button></div><p id="plead" class="plead"></p><div id="yesmsg" class="yesmsg" hidden><h2>Yay! 🥰</h2><p>${e(d.closing || 'Chai pe milte hain. My treat.')}</p></div></section>`,

  distance: (d) => `
    <header class="hero"><div class="hin"><p class="kick">${hello(d)}, distance means so little</p><h1>${e(d.headline || 'Miles apart, hearts together')}</h1>
      <div class="map"><div class="city a"><span>📍</span>${e(d.city_me || 'Me')}</div><div class="route"><span class="plane">✈️</span></div><div class="city b"><span>📍</span>${e(d.city_partner || 'You')}</div></div>
      ${d.km ? `<p class="km"><b>${e(d.km)} km</b> apart, and still the closest person to me</p>` : ''}</div></header>
    ${S.countdown(d, 'Until I see you again')}${S.counter(d, 'days of loving you')}${S.intro(d)}${S.story(d)}${S.dreams(d, 'When we meet, we will…')}${S.reasons(d)}${S.moments(d)}${S.gallery(d)}${S.song(d, 'Play this when you miss me')}${S.letter(d)}${S.closing(d)}`,

  letter: (d) => `
    <header class="hero"><div class="hin"><p class="kick">${e(fmtDate(new Date().toISOString().slice(0, 10)))}</p><h1>${e(d.headline || `Dear ${d.nickname || d.partner}`)}</h1></div></header>
    <section class="sec letter solo reveal"><div class="paper">${paras(d.letter || d.intro || '')}<p class="sign">${e(d.closing || 'Yours,')}<br>${e(d.me)}</p></div>${img(heroPhoto(d), 'lph')}</section>
    ${S.reasons(d, 'P.S.', 'reasons ps')}`,

  mixtape: (d) => {
    const songs = lines(d.songs).length ? lines(d.songs) : (d.song ? [d.song] : []);
    return `
    <header class="hero"><div class="hin"><div class="cassette"><div class="label">${e(d.headline || `For ${d.partner}`)}<small>${e(d.me)}’s mix · side A</small></div><div class="reels"><i></i><i></i></div></div><p class="kick">Press play, ${hello(d)}</p></div></header>
    ${songs.length ? `<section class="sec tracks reveal"><h2>Side A: our songs</h2><ol>${songs.map((s) => `<li><a href="${e(yt(s))}" target="_blank" rel="noopener"><span>${e(s)}</span><span class="play">▶</span></a></li>`).join('')}</ol></section>` : ''}
    ${(d.moments || []).filter((m) => m && m.title).length ? `<section class="sec tracks reveal"><h2>Side B: our moments</h2><ol>${d.moments.filter((m) => m && m.title).map((m) => `<li><div><b>${e(m.title)}</b>${m.caption ? `<small>${e(m.caption)}</small>` : ''}</div>${m.date ? `<time>${e(fmtDate(m.date))}</time>` : ''}</li>`).join('')}</ol></section>` : ''}
    ${S.intro(d)}${S.story(d, 'Liner notes')}${S.reasons(d, 'Bonus tracks: why I love you')}${S.gallery(d, 'Album art')}${S.letter(d, 'Hidden track')}${S.closing(d)}`;
  },
};
function suffix(n) { n = +n; if (!n) return ''; const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return s[(v - 20) % 10] || s[v] || s[0]; }

// ---------- behaviour ----------
function confetti(n = 120, chars = ['💖', '🎉', '✨', '💕', '🌸']) {
  const wrap = document.createElement('div'); wrap.className = 'confetti';
  for (let i = 0; i < n; i++) {
    const s = document.createElement('span');
    s.textContent = chars[i % chars.length];
    s.style.left = Math.random() * 100 + 'vw';
    s.style.animationDelay = Math.random() * 1.2 + 's';
    s.style.fontSize = 14 + Math.random() * 20 + 'px';
    wrap.appendChild(s);
  }
  document.body.appendChild(wrap);
  setTimeout(() => wrap.remove(), 4500);
}

function wire(tpl) {
  // reveal on scroll
  const io = 'IntersectionObserver' in window ? new IntersectionObserver((es) => es.forEach((x) => { if (x.isIntersecting) { x.target.classList.add('in'); io.unobserve(x.target); } }), { threshold: 0.12 }) : null;
  document.querySelectorAll('.reveal').forEach((el) => (io ? io.observe(el) : el.classList.add('in')));
  // count up
  document.querySelectorAll('[data-count]').forEach((el) => {
    const to = +el.dataset.count, t0 = performance.now();
    const step = (t) => { const p = Math.min(1, (t - t0) / 1600); el.textContent = Math.round(to * (1 - Math.pow(1 - p, 3))).toLocaleString('en-IN'); if (p < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  });
  // countdown
  document.querySelectorAll('.countdown').forEach((el) => {
    const target = new Date(el.dataset.target + 'T00:00:00');
    if (isNaN(target)) { el.remove(); return; }
    const b = el.querySelectorAll('b');
    const tick = () => {
      let ms = target - Date.now();
      if (tpl === 'birthday' && ms < 0) { const t = new Date(target); t.setFullYear(new Date().getFullYear()); if (t - Date.now() < -864e5) t.setFullYear(t.getFullYear() + 1); ms = t - Date.now(); }
      if (ms <= 0) { el.querySelector('.cd').innerHTML = `<span class="today">${tpl === 'birthday' ? 'It’s today! 🎉' : 'Today! 💞'}</span>`; return; }
      const v = [Math.floor(ms / 864e5), Math.floor(ms / 36e5) % 24, Math.floor(ms / 6e4) % 60, Math.floor(ms / 1e3) % 60];
      v.forEach((x, i) => { b[i].textContent = x; });
      setTimeout(tick, 1000);
    };
    tick();
  });
  // star sky
  const sky = document.getElementById('sky');
  if (sky) {
    const ctx = sky.getContext('2d'); let W, H, stars;
    const size = () => { W = sky.width = innerWidth; H = sky.height = innerHeight; stars = Array.from({ length: 160 }, () => ({ x: Math.random() * W, y: Math.random() * H, r: Math.random() * 1.6 + 0.2, p: Math.random() * 6 })); };
    size(); addEventListener('resize', size);
    const draw = (t) => { ctx.clearRect(0, 0, W, H); for (const s of stars) { ctx.globalAlpha = 0.4 + 0.6 * Math.abs(Math.sin(t / 900 + s.p)); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, 7); ctx.fill(); } requestAnimationFrame(draw); };
    requestAnimationFrame(draw);
  }
  // envelope
  const env = document.getElementById('env');
  if (env) env.addEventListener('click', () => {
    env.classList.add('open');
    setTimeout(() => { env.hidden = true; document.getElementById('opened').hidden = false; document.getElementById('after').hidden = false; confetti(40, ['💌', '💕']); document.querySelectorAll('#after .reveal').forEach((x) => x.classList.add('in')); }, 700);
  });
  // cake
  const cake = document.getElementById('cake');
  if (cake) { const blow = () => { if (cake.classList.contains('out')) return; cake.classList.add('out'); cake.querySelector('.tap').textContent = 'Make a wish! 🎉'; confetti(140, ['🎉', '🎈', '✨', '🎂', '💖']); }; cake.addEventListener('click', blow); cake.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') blow(); }); }
  // yes / no
  const yes = document.getElementById('yes'), no = document.getElementById('no');
  if (yes && no) {
    const PLEAD = ['Pakka? 🥺', 'Ek baar aur soch lo…', 'Main chai bana dunga ☕', 'Golgappe bhi khilaunga!', 'Please na 🙏', 'Okay, the button is gone now 😌'];
    let n = 0;
    const dodge = () => {
      n++;
      if (tpl === 'proposal') {
        const box = no.parentElement.getBoundingClientRect();
        no.style.position = 'relative';
        no.style.left = (Math.random() * box.width * 0.6 - box.width * 0.3) + 'px';
        no.style.top = (Math.random() * 120 - 60) + 'px';
      } else {
        const pl = document.getElementById('plead'); if (pl) pl.textContent = PLEAD[Math.min(n - 1, PLEAD.length - 1)];
        no.style.transform = `scale(${Math.max(0.3, 1 - n * 0.15)})`;
        yes.style.transform = `scale(${1 + n * 0.12})`;
      }
      if (n >= 6) no.style.display = 'none';
    };
    no.addEventListener('mouseenter', dodge); no.addEventListener('click', (ev) => { ev.preventDefault(); dodge(); });
    no.addEventListener('touchstart', (ev) => { ev.preventDefault(); dodge(); }, { passive: false });
    yes.addEventListener('click', () => { document.getElementById('yesmsg').hidden = false; yes.parentElement.hidden = true; const pl = document.getElementById('plead'); if (pl) pl.textContent = ''; confetti(160, tpl === 'sorry' ? ['💕', '🥰', '🤗', '☕'] : ['💖', '💍', '🎉', '✨', '🌹']); });
  }
}

async function sha(s) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(s).trim().toLowerCase().replace(/\s+/g, ' ')));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
}

function gate(d, then) {
  if (!d.secret || !d.secret.q || !d.secret.hash || PREVIEW) return then();
  root.innerHTML = `<div class="gate"><div class="gbox"><div class="lock">🔒</div><p class="kick">Only ${e(d.partner)} can open this</p><h2>${e(d.secret.q)}</h2><form id="gf"><input id="ga" autocomplete="off" placeholder="Your answer" aria-label="Answer"><button>Open 💞</button></form><p id="gerr" class="gerr"></p></div></div>`;
  document.getElementById('gf').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    if ((await sha(document.getElementById('ga').value)) === d.secret.hash) then();
    else { document.getElementById('gerr').textContent = 'Hmm, not quite. Try again 😉'; }
  });
}

export function render(template, data) {
  const tpl = T[template] ? template : 'classic';
  const d = { me: 'Me', partner: 'You', ...data };
  document.body.className = 't-' + tpl;
  document.title = d.title || `For ${d.partner}`;
  const show = () => { root.innerHTML = `<main class="page">${T[tpl](d)}</main>${S.foot()}`; wire(tpl); if (!PREVIEW && (tpl === 'birthday' || tpl === 'classic')) setTimeout(() => confetti(tpl === 'birthday' ? 80 : 30), 400); };
  gate(d, show);
}

async function load() {
  if (PREVIEW) {
    root.innerHTML = '<p class="loading">Preview loading…</p>';
    addEventListener('message', (ev) => {
      if (ev.origin !== location.origin || !ev.data || ev.data.type !== 'jodi-site-preview') return;
      render(ev.data.template, ev.data.data);
      scrollTo(0, 0);
    });
    if (parent !== window) parent.postMessage({ type: 'jodi-site-ready' }, location.origin);
    return;
  }
  const slug = qs.get('s');
  if (!slug) { root.innerHTML = '<p class="loading">This link is missing something. Ask for the link again.</p>'; return; }
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_site`, {
      method: 'POST', headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_slug: slug }),
    });
    const s = await r.json();
    if (!r.ok || !s) { root.innerHTML = '<p class="loading">This website was not found. It may have been deleted.</p>'; return; }
    render(s.template, { ...s.data, title: s.title });
  } catch (_) {
    root.innerHTML = '<p class="loading">Could not load. Check your internet and refresh.</p>';
  }
}
load();
