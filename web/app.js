import { html, render, useState, useEffect, useCallback } from 'https://esm.sh/htm@3.1.1/preact/standalone';
import { sb, rpc, toast, fail, setToastFn, usePoll, Mark, share, confetti } from './lib.js';
import { AdminPanel } from './admin.js';
import { Hub, MemoriesScreen } from './hub.js';
import { ScenesScreen } from './scenes.js';
import { NotesScreen } from './notes.js';
import { CreateScreen } from './create.js';
import { DuelLayer, PlayScreen, StakesScreen, SyncScreen } from './duel.js';
import { connect, disconnect } from './live.js';
import { META } from './duel-engine.js';
import { StagesPanel } from './stages.js';
import { PendingStakes } from './spice-ui.js';

// ---------- quick start (no signup) ----------
async function quickStart() {
  const { error } = await sb.auth.signInAnonymously();
  if (error) {
    if (/anonymous/i.test(error.message)) throw new Error('Quick start is not switched on yet. Use "I already have an account" for now.');
    throw error;
  }
}

function Welcome({ toLogin, toSignup }) {
  return html`
    <div class="stack-lg center screen" style="min-height:calc(100dvh - 130px);display:flex;flex-direction:column;justify-content:center">
      <img src="/logo.png" alt="Jugalbandi" style="width:min(300px,78vw);height:auto;display:block;margin:0 auto" />
      <div class="stack">
        <h1 style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)">Jugalbandi</h1>
        <p style="font-weight:700;color:var(--rani);letter-spacing:.3px;margin:0">Bringing couples closer</p>
        <p class="muted">Couple games for two. Find out how in sync you are, then take on other jodis.</p>
      </div>
      <p style="font-size:30px;letter-spacing:6px">💭🔗🏡🎬🎯🥁</p>
      <button class="btn" onClick=${toLogin}>Log in</button>
      <button class="btn ghost" onClick=${toSignup}>Don't have an account? Sign up</button>
    </div>`;
}

// Partner opened an invite link: show who invited them and get them in with just a name.
function InviteJoin({ code, session, onDone, toLogin }) {
  const [info, setInfo] = useState(undefined);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { rpc('invite_info', { p_code: code }).then(setInfo).catch(() => setInfo(null)); }, [code]);

  const finish = async (nm) => {
    await rpc('join_couple', { p_code: code, p_name: nm });
    sessionStorage.removeItem('pending_join');
    history.replaceState(null, '', '/');
    onDone();
  };
  // resume after the guest sign-in re-renders the app
  useEffect(() => {
    let pending = null;
    try { pending = JSON.parse(sessionStorage.getItem('pending_join') || 'null'); } catch (_) { /* ignore */ }
    if (session && pending && pending.code === code) { setBusy(true); finish(pending.name).catch((e) => { fail(e); setBusy(false); sessionStorage.removeItem('pending_join'); }); }
  }, [session]);

  const join = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    try {
      if (session) await finish(name.trim());
      else { sessionStorage.setItem('pending_join', JSON.stringify({ code, name: name.trim() })); await quickStart(); }
    } catch (err) { fail(err); setBusy(false); }
  };

  if (info === undefined) return html`<div class="boot pulse">Jugalbandi</div>`;
  if (!info || !info.open) return html`
    <div class="stack-lg center screen" style="padding-top:10vh">
      <h1>${info ? 'This jodi is already complete' : 'Invite link not found'}</h1>
      <p class="muted">${info ? 'Both partners have already joined.' : 'Ask your partner to send the link again.'}</p>
      <button class="btn" onClick=${() => { history.replaceState(null, '', '/'); location.reload(); }}>Start your own jodi</button>
    </div>`;
  return html`
    <form class="stack-lg center screen" style="padding-top:7vh" onSubmit=${join}>
      <${Mark} a=${info.from} b=${name || '?'} big />
      <div class="stack">
        <h1>${info.from} invited you 💞</h1>
        <p class="muted">Join <b>${info.jodi}</b> and play as a couple. No signup needed.</p>
      </div>
      <div class="panel stack" style="text-align:left">
        <label class="field"><span>Your name</span>
          <input class="input" required maxlength="30" autofocus value=${name} onInput=${(e) => setName(e.target.value)} placeholder="Simran" />
        </label>
        <button class="btn" disabled=${busy || !name.trim()}>${busy ? 'Joining…' : `Join ${info.from}`}</button>
      </div>
      ${!session && html`<button type="button" class="link" onClick=${toLogin}>I already have an account</button>`}
    </form>`;
}

// ---------- auth ----------
function SignIn({ signup }) {
  const [isNew, setIsNew] = useState(!!signup);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState('password');
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  const withPassword = async (create) => {
    if (!email.trim() || password.length < 6) return fail(new Error('Enter your email and a password of at least 6 characters'));
    setBusy(true);
    const creds = { email: email.trim(), password };
    const { data, error } = create ? await sb.auth.signUp(creds) : await sb.auth.signInWithPassword(creds);
    setBusy(false);
    if (error) {
      if (/invalid login/i.test(error.message)) return fail(new Error('Wrong email or password. New here? Tap Create account.'));
      return fail(error);
    }
    if (create && !data.session) toast('That email already has an account. Log in instead, or use another email.');
  };
  const send = async (e) => {
    e.preventDefault(); setBusy(true);
    const { error } = await sb.auth.signInWithOtp({ email: email.trim(), options: { emailRedirectTo: location.origin } });
    setBusy(false);
    if (error) return fail(error); setSent(true);
  };
  const verify = async (e) => {
    e.preventDefault(); setBusy(true);
    const { error } = await sb.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: 'email' });
    setBusy(false);
    if (error) fail(error);
  };

  const emailField = html`
    <label class="field"><span>Your email</span>
      <input class="input" type="email" required autocomplete="email" inputmode="email" value=${email} onInput=${(e) => setEmail(e.target.value)} placeholder="you@example.com" />
    </label>`;

  return html`
    <div class="stack-lg" style="min-height:calc(100dvh - 130px);display:flex;flex-direction:column;justify-content:center">
      <div class="center stack">
        <img src="/logo.png" alt="Jugalbandi" style="width:min(300px,78vw);height:auto;display:block;margin:0 auto" />
        <h1 style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)">Jugalbandi</h1>
        <p style="font-weight:700;color:var(--rani);letter-spacing:.3px;margin:0">Bringing couples closer</p>
        <p class="muted">${isNew ? 'Create your account.' : 'Log in to your jodi.'}</p>
      </div>
      ${mode === 'password' ? html`
        <form class="panel stack" onSubmit=${(e) => { e.preventDefault(); withPassword(isNew); }}>
          ${emailField}
          <label class="field"><span>Password (6+ characters)</span>
            <input class="input" type="password" required minlength="6" autocomplete="current-password" value=${password} onInput=${(e) => setPassword(e.target.value)} />
          </label>
          <button class="btn" disabled=${busy}>${busy ? 'Please wait…' : isNew ? 'Create account' : 'Log in'}</button>
          <button type="button" class="btn ghost" disabled=${busy} onClick=${() => setIsNew(!isNew)}>${isNew ? 'I already have an account' : 'New here? Create account'}</button>
          <button type="button" class="link" onClick=${() => setMode('code')}>Email me a login code instead</button>
        </form>` : !sent ? html`
        <form class="panel stack" onSubmit=${send}>
          ${emailField}
          <button class="btn" disabled=${busy}>${busy ? 'Sending…' : 'Send login code'}</button>
          <button type="button" class="link" onClick=${() => setMode('password')}>Back to password login</button>
        </form>` : html`
        <form class="panel stack" onSubmit=${verify}>
          <p>We emailed a code to <b>${email}</b>. Enter it below, or tap the link in the email.</p>
          <input class="input code-input" inputmode="numeric" autocomplete="one-time-code" maxlength="10" value=${code} onInput=${(e) => setCode(e.target.value.replace(/\D/g, ''))} placeholder="000000" aria-label="Login code" />
          <button class="btn" disabled=${busy || code.length < 6}>${busy ? 'Checking…' : 'Log in'}</button>
          <button type="button" class="link" onClick=${() => { setSent(false); setCode(''); setMode('password'); }}>Back to password login</button>
        </form>`}
    </div>`;
}

// ---------- onboarding ----------
function Onboard({ onDone, defaultName }) {
  const join = new URLSearchParams(location.search).get('join') || '';
  const [mode, setMode] = useState(join ? 'join' : 'create');
  const [name, setName] = useState(defaultName || '');
  const [team, setTeam] = useState('');
  const [code, setCode] = useState(join);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault(); setBusy(true);
    try {
      if (mode === 'create') await rpc('create_couple', { p_team: team, p_name: name });
      else await rpc('join_couple', { p_code: code, p_name: name });
      history.replaceState(null, '', '/');
      onDone();
    } catch (err) { fail(err); }
    setBusy(false);
  };

  return html`
    <form class="stack-lg screen" style="padding-top:4vh" onSubmit=${submit}>
      <div class="stack">
        <h1>Set up your jodi 💞</h1>
        <p class="muted">Create your jodi, then send your partner the invite link. They join with one tap.</p>
      </div>
      <div class="seg" role="tablist">
        <button type="button" role="tab" aria-selected=${mode === 'create'} class=${mode === 'create' ? 'on' : ''} onClick=${() => setMode('create')}>Create jodi</button>
        <button type="button" role="tab" aria-selected=${mode === 'join'} class=${mode === 'join' ? 'on' : ''} onClick=${() => setMode('join')}>Join with code</button>
      </div>
      <div class="panel stack">
        <label class="field"><span>Your name</span>
          <input class="input" required maxlength="30" value=${name} onInput=${(e) => setName(e.target.value)} placeholder="Raj" />
        </label>
        ${mode === 'create' ? html`
          <label class="field"><span>Jodi name (other couples will see this)</span>
            <input class="input" required minlength="2" maxlength="30" value=${team} onInput=${(e) => setTeam(e.target.value)} placeholder="Raj & Simran" />
          </label>` : html`
          <label class="field"><span>Partner's code</span>
            <input class="input code-input" required maxlength="6" value=${code} onInput=${(e) => setCode(e.target.value.toUpperCase())} placeholder="ABC123" />
          </label>`}
        <button class="btn" disabled=${busy}>${mode === 'create' ? 'Create jodi' : 'Join jodi'}</button>
      </div>
    </form>`;
}

// ---------- solo mode: the couple exists but the partner has not joined yet ----------
const inviteMsg = (home) => `${home.profile.name} invited you to be their jodi on Jugalbandi 💞 Tap to join:`;
const inviteLink = (home) => `${location.origin}/?join=${home.couple.code}`;

function InvitePanel({ home }) {
  const msg = inviteMsg(home), link = inviteLink(home);
  return html`
    <div class="panel stack center">
      <h3>Invite your partner to join the app</h3>
      <p class="muted small">They tap the link, type their name, and they're in. No signup needed.</p>
      <div class="code-input" style="font-size:36px">${home.couple.code}</div>
      <a class="btn" style="text-decoration:none" href=${`https://wa.me/?text=${encodeURIComponent(msg + ' ' + link)}`} target="_blank" rel="noopener">Send invite on WhatsApp</a>
      <button class="btn ghost" onClick=${() => share(msg + ' ' + link)}>Share another way</button>
      <p class="muted small">Or they can enter code <b>${home.couple.code}</b></p>
    </div>`;
}

function SoloLocked({ home, title, line, back, games }) {
  return html`
    <div class="stack-lg screen">
      ${back && html`<button class="back" onClick=${back} aria-label="Back">←</button>`}
      <div class="stack"><h1>${title} 🔒</h1><p class="muted">${line}</p></div>
      ${games && html`<div class="stack">${Object.values(META).map((g) => html`
        <div class="panel row" style="opacity:.9"><span style="font-size:28px">${g.emo}</span><div class="grow"><b>${g.name}</b><br/><span class="small muted">${g.sub}</span></div><span>🔒</span></div>`)}</div>`}
      <${InvitePanel} home=${home} />
    </div>`;
}

function SaveAccount({ onSaved }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const save = async (e) => {
    e.preventDefault(); setBusy(true);
    const { error } = await sb.auth.updateUser({ email: email.trim(), password });
    setBusy(false);
    if (error) return fail(error);
    await sb.auth.refreshSession();
    toast('Saved! All games unlocked 🎉 You can log in with this email on any phone.');
    confetti();
    onSaved && onSaved();
  };
  return html`
    <form class="panel stack" onSubmit=${save} style="border:2px dashed var(--marigold)">
      <h3>🔓 Unlock all games</h3>
      <p class="muted small">You're playing as a guest with 2 games. Add an email and password to unlock every game and keep your streak safe, even on a new phone.</p>
      <input class="input" type="email" required placeholder="you@example.com" value=${email} onInput=${(e) => setEmail(e.target.value)} aria-label="Email" />
      <input class="input" type="password" required minlength="6" placeholder="Password (6+ characters)" value=${password} onInput=${(e) => setPassword(e.target.value)} aria-label="Password" />
      <button class="btn gold" disabled=${busy}>${busy ? 'Saving…' : 'Save account and unlock'}</button>
    </form>`;
}

function MeScreen({ home, guest, reload }) {
  const c = home.couple;
  const solo = !c.complete;
  const link = `${location.origin}/?join=${c.code}`;
  return html`
    <div class="stack-lg screen">
      <div class="stack"><h1>${home.profile.name} 💞</h1><p class="muted">${c.name} · ${solo ? 'waiting for your partner' : 'with ' + c.partner_name}</p></div>
      ${guest && html`<${SaveAccount} onSaved=${reload} />`}
      <div class="panel stack small">
        <p><b>How playing works.</b> Pick a game on the Play tab, spin the “Loser has to…” wheel and invite your partner. Their phone pops up a Join button. You both play live at the same time.</p>
        <p>Every win and every stake is saved in the Stakes tab.</p>
        ${!solo && html`<p class="muted">Your jodi invite link: ${link}</p>`}
      </div>
      ${solo && html`<${InvitePanel} home=${home} />`}
      ${home.is_admin && html`<a class="btn gold" style="text-decoration:none" href="/?admin">📊 Owner dashboard</a>`}
      <button class="btn ghost" onClick=${() => { if (!guest || confirm('You are a guest. Logging out loses this jodi unless you saved an email. Log out anyway?')) sb.auth.signOut(); }}>Log out</button>
    </div>`;
}

// ---------- app ----------
function App() {
  const [session, setSession] = useState(undefined);
  const [home, setHome] = useState(null);
  const [tab, setTab] = useState(new URLSearchParams(location.search).has('play') ? 'play' : 'home');
  const [sub, setSub] = useState(null);
  const [t, setT] = useState(null);
  const [login, setLogin] = useState(false);
  const joinCode = new URLSearchParams(location.search).get('join');
  const isAdminPage = /^\/admin/.test(location.pathname) || new URLSearchParams(location.search).has('admin');

  useEffect(() => {
    let tid;
    setToastFn((msg, err) => { setT({ msg, err }); clearTimeout(tid); tid = setTimeout(() => setT(null), 3500); });
    sb.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = sb.auth.onAuthStateChange((_e, s) => { setSession(s); if (!s) { setHome(null); setSub(null); disconnect(); } });
    return () => data.subscription.unsubscribe();
  }, []);

  const reload = useCallback(() => rpc('get_home').then(setHome).catch(fail), []);
  useEffect(() => { if (session) reload(); }, [session && session.user.id]);
  const uid = session && session.user.id;
  const live = !!(home && home.couple && home.couple.complete && uid);
  const solo = !!(home && home.couple && !home.couple.complete);
  usePoll(reload, 5000, solo);
  const hv = solo ? { ...home, couple: { ...home.couple, partner_name: 'your partner' } } : home;
  useEffect(() => { if (live) connect(home.couple.id, uid, home.profile.name); }, [live && home.couple.id, uid]);

  let screen;
  if (session === undefined || (session && !home)) screen = html`<div class="boot pulse">Jugalbandi</div>`;
  else if (isAdminPage && !session) screen = html`<${SignIn} />`;
  else if (isAdminPage) screen = html`<${AdminPanel} />`;
  else if (!session && login) screen = html`<${SignIn} signup=${login === 'signup'} /><p class="center" style="margin-top:16px"><button class="link" onClick=${() => setLogin(false)}>Back</button></p>`;
  else if (!session && joinCode) screen = html`<${InviteJoin} code=${joinCode} session=${null} onDone=${reload} toLogin=${() => setLogin(true)} />`;
  else if (!session) screen = html`<${Welcome} toLogin=${() => setLogin('login')} toSignup=${() => setLogin('signup')} />`;
  else if (!home.couple && joinCode) screen = html`<${InviteJoin} code=${joinCode} session=${session} onDone=${reload} toLogin=${() => {}} />`;
  else if (!home.couple) screen = html`<${Onboard} onDone=${reload} defaultName=${home.profile && home.profile.name} />`;
  else if (sub) screen = html`
    ${sub.k === 'memories' && html`<${MemoriesScreen} home=${hv} back=${() => setSub(null)} initialTab=${sub.tab} />`}
    ${sub.k === 'notes' && (solo
      ? html`<${SoloLocked} home=${home} title="Love Notes" line="Notes and letters open up as soon as your partner joins. Until then, try Memories and Create." back=${() => setSub(null)} />`
      : html`<${NotesScreen} home=${home} back=${() => setSub(null)} />`)}
    ${sub.k === 'scenes' && html`<${ScenesScreen} home=${hv} back=${() => setSub(null)} />`}
    ${sub.k === 'create' && html`<${CreateScreen} home=${hv} back=${() => setSub(null)} />`}`;
  else screen = html`
    ${tab === 'home' && html`${solo ? '' : html`<${PendingStakes} uid=${uid} go=${() => setTab('stakes')} />`}<${Hub} home=${hv} onInvite=${solo ? () => share(inviteMsg(home) + ' ' + inviteLink(home)) : null} open=${(k, o) => setSub({ k, ...(o || {}) })} goPlay=${() => setTab('play')} />`}
    ${tab === 'play' && (solo
      ? html`<${SoloLocked} home=${home} title="Play together" line="Live games for two phones. Have a look, they unlock the moment your partner joins." games />`
      : html`<${PlayScreen} home=${home} toStakes=${() => setTab('stakes')} toMe=${() => setTab('me')} />`)}
    ${tab === 'sync' && (solo
      ? html`<${SoloLocked} home=${home} title="Sync Score" line="Your points and relationship stage build up as the two of you play. Invite your partner to start." />`
      : html`<${SyncScreen} home=${home} goPlay=${() => setTab('play')} /><div class="stage-wrap last"><${StagesPanel} /></div>`)}
    ${tab === 'stakes' && (solo
      ? html`<${SoloLocked} home=${home} title="Stakes" line="Losers pay up here. Invite your partner to start the first game." />`
      : html`<${StakesScreen} home=${home} uid=${uid} />`)}
    ${tab === 'me' && html`<${MeScreen} home=${hv} guest=${!!home.couple.me_guest} reload=${reload} />`}
    <nav class="nav"><div>
      ${[['home', '🏠', 'Home'], ['play', '🎮', 'Play'], ['sync', '🏆', 'Sync'], ['stakes', '💝', 'Stakes'], ['me', '🙂', 'Me']].map(([k, i, l]) => html`
        <button class=${tab === k ? 'on' : ''} aria-current=${tab === k ? 'page' : null} onClick=${() => { setTab(k); if (k === 'home') reload(); }}><b>${i}</b>${l}</button>`)}
    </div></nav>`;

  return html`${screen}${live && !isAdminPage && html`<${DuelLayer} home=${home} uid=${uid} />`}${t && html`<div class=${'toast' + (t.err ? ' err' : '')} role="status">${t.msg}</div>`}`;
}

render(html`<${App} />`, document.getElementById('app'));
