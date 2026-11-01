// Jugalbandi service worker: the app opens fast and still opens on a weak or missing connection.
// Same-origin files: network first, but fall back to the saved copy after 3 seconds (or when offline).
// Libraries and fonts: saved copy first, refreshed in the background. Supabase calls are never touched.
const V = 'jb-v1';
const SAME = V + '-app', LIBS = V + '-libs';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (!k.startsWith(V)) await caches.delete(k);
    await self.clients.claim();
  })());
});

const timeout = (ms) => new Promise((_, rej) => setTimeout(() => rej(new Error('slow')), ms));

async function networkFirst(req, key) {
  const cache = await caches.open(SAME);
  const fresh = fetch(req).then((res) => { if (res && res.ok) cache.put(key, res.clone()); return res; });
  try { return await Promise.race([fresh, timeout(3000)]); }
  catch (_) {
    const hit = await cache.match(key);
    if (hit) { fresh.catch(() => {}); return hit; }
    return fresh; // nothing saved yet: keep waiting for the network
  }
}

async function staleWhileRevalidate(req) {
  const cache = await caches.open(LIBS);
  const hit = await cache.match(req);
  const fresh = fetch(req).then((res) => { if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone()); return res; }).catch(() => hit);
  return hit || fresh;
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === self.location.origin) {
    if (url.pathname === '/sw.js' || url.pathname.startsWith('/api/')) return;
    // every page address shows the same app shell
    const key = req.mode === 'navigate' ? '/index.html' : req;
    e.respondWith(networkFirst(req, key));
    return;
  }
  if (['esm.sh', 'fonts.googleapis.com', 'fonts.gstatic.com'].includes(url.hostname)) e.respondWith(staleWhileRevalidate(req));
});
