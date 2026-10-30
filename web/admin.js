import { html, useState, useEffect } from 'https://esm.sh/htm@3.1.1/preact/standalone';
import { GAMES, rpc } from './lib.js';

const ago = (t) => {
  if (!t) return 'never';
  const m = Math.round((Date.now() - new Date(t).getTime()) / 60000);
  if (m < 60) return `${m}m ago`;
  if (m < 1440) return `${Math.round(m / 60)}h ago`;
  return `${Math.round(m / 1440)}d ago`;
};

export function AdminPanel() {
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');
  const load = () => rpc('admin_stats').then(setD).catch((e) => setErr(e.message));
  useEffect(() => { load(); const id = setInterval(load, 30000); return () => clearInterval(id); }, []);

  if (err) return html`<div class="stack-lg center" style="padding-top:12vh"><h1>🔒 Admins only</h1><p class="muted">${err}. Log in with your owner account.</p><a class="btn" href="/">Back to the app</a></div>`;
  if (!d) return html`<p class="muted pulse center" style="margin-top:30vh">Loading dashboard…</p>`;

  const max = Math.max(1, ...d.signups.map((s) => s.n));
  const games = Object.entries(d.by_game).sort((a, b) => b[1] - a[1]);
  const gmax = Math.max(1, ...games.map(([, n]) => n));
  const match = (x) => !q || JSON.stringify(x).toLowerCase().includes(q.toLowerCase());
  const rows = d.jodis.filter(match);
  const people = (d.people || []).filter(match);
  const csv = () => {
    const head = ['jodi', 'partner1', 'email1', 'partner2', 'email2', 'complete', 'games', 'streak', 'best_streak', 'coins', 'rating', 'created', 'last_active'];
    const lines = d.jodis.map((j) => [j.name, j.n1, j.e1, j.n2, j.e2, j.complete, j.games, j.streak, j.best_streak, j.coins, j.rating, j.created_at, j.last_active]
      .map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','));
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([[head.join(','), ...lines].join('\n')], { type: 'text/csv' }));
    a.download = 'jodi-arena-users.csv'; a.click();
  };

  const csvPeople = () => {
    const head = ['name', 'email', 'jodi', 'partner', 'rounds', 'signed_up', 'last_played'];
    const lines = (d.people || []).map((p) => [p.name, p.email, p.jodi, p.partner, p.rounds, p.created_at, p.last_played]
      .map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','));
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([[head.join(','), ...lines].join('\n')], { type: 'text/csv' }));
    a.download = 'jodi-arena-people.csv'; a.click();
  };

  const Stat = ({ v, l, sub }) => html`<div class="a-stat"><b>${v}</b><span>${l}</span>${sub && html`<em>${sub}</em>`}</div>`;
  return html`
    <div class="stack-lg screen admin">
      <div class="row between">
        <div><h1>Owner dashboard</h1><p class="muted small">Refreshes every 30 seconds</p></div>
        <a class="btn ghost sm" href="/">App</a>
      </div>
      <div class="a-grid">
        <${Stat} v=${d.users} l="People" sub=${`${d.registered} with account · ${d.guests} guests`} />
        <${Stat} v=${d.complete_couples} l="Complete jodis" sub=${`${d.couples - d.complete_couples} waiting for partner`} />
        <${Stat} v=${d.active_today} l="Jodis active today" sub=${`${d.active_7d} in the last 7 days`} />
        <${Stat} v=${d.matches} l="Games finished" sub=${`${d.daily_today} daily challenges today`} />
      </div>
      ${d.loners > 0 && html`<p class="panel small">⚠️ ${d.loners} people signed up but never created or joined a jodi.</p>`}

      <section class="panel stack">
        <div class="row between"><h3>All people (${(d.people || []).length})</h3><button class="btn ghost sm" onClick=${csvPeople}>Download CSV</button></div>
        <input class="input" placeholder="Search name, email or jodi" value=${q} onInput=${(e) => setQ(e.target.value)} />
        <div class="a-list">
          ${people.map((p) => html`
            <div class="a-row">
              <div class="row between"><b style="font-size:17px">${p.name || 'No name yet'}</b><span class=${'tag ' + (p.jodi && p.partner ? 'win' : '')}>${p.guest ? 'Guest' : p.jodi ? (p.partner ? 'In a jodi' : 'Waiting for partner') : 'No jodi yet'}</span></div>
              <div class="small">${p.email}</div>
              <div class="small muted">${p.jodi ? `Jodi: ${p.jodi}${p.partner ? ` · partner ${p.partner}` : ''}` : 'Signed up but has not created or joined a jodi'}</div>
              <div class="small muted">${p.rounds} rounds played · signed up ${ago(p.created_at)} · last played ${ago(p.last_played)}</div>
            </div>`)}
        </div>
      </section>

      <section class="panel stack">
        <h3>New people, last 14 days</h3>
        ${d.signups.length === 0 ? html`<p class="muted small">No signups yet.</p>` : html`
          <div class="bars">${d.signups.map((s) => html`<div class="bar-col" title=${`${s.day}: ${s.n}`}><i style=${`height:${(s.n / max) * 100}%`}></i><span>${s.n}</span><em>${s.day.slice(8)}</em></div>`)}</div>`}
      </section>

      <section class="panel stack">
        <h3>Most played games</h3>
        ${games.length === 0 ? html`<p class="muted small">No finished games yet.</p>` : games.map(([g, n]) => html`
          <div class="hbar"><span>${GAMES[g] ? GAMES[g].emo + ' ' + GAMES[g].name : g}</span><div><i style=${`width:${(n / gmax) * 100}%`}></i></div><b>${n}</b></div>`)}
      </section>

      <section class="panel stack">
        <div class="row between"><h3>All jodis (${d.jodis.length})</h3><button class="btn ghost sm" onClick=${csv}>Download CSV</button></div>
        <div class="a-list">
          ${rows.map((j) => html`
            <div class="a-row">
              <div class="row between"><b>${j.name}</b><span class=${'tag ' + (j.complete ? 'win' : '')}>${j.complete ? `${j.games} games` : 'Partner not joined'}</span></div>
              <div class="small">${j.n1 || '?'} <span class="muted">${j.e1}</span>${j.n2 ? html` & ${j.n2} <span class="muted">${j.e2}</span>` : ''}</div>
              <div class="small muted">🔥 ${j.streak} (best ${j.best_streak}) · ⭐ ${j.rating} · 🪙 ${j.coins} · joined ${ago(j.created_at)} · last played ${ago(j.last_active)}</div>
            </div>`)}
        </div>
      </section>
    </div>`;
}
