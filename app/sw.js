// SchoolMate AI app: works offline. Pages and timetable.json come from the network first (so updates show
// right away) and from the cache when offline. Fonts are cached after the first load.
const VERSION = '__VERSION__';
const CACHE = 'schoolmate-' + VERSION;
const SHELL = ['./', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'maskable-512.png', 'timetable.json'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE)
    .then((c) => Promise.all(SHELL.map((u) => c.add(new Request(u, { cache: 'reload' })).catch(() => {}))))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k.startsWith('schoolmate-') && k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

const put = (req, res) => caches.open(CACHE).then((c) => c.put(req, res)).catch(() => {});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === self.location.origin) {
    // index.html and ./ are the same page: keep one copy under ./
    const key = req.mode === 'navigate' ? new URL('./', self.registration.scope).href : req;
    e.respondWith(fetch(req)
      .then((res) => { if (res.ok) put(key, res.clone()); return res; })
      .catch(() => caches.match(key, { ignoreSearch: true }).then((hit) => hit || Response.error())));
    return;
  }
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => { if (res.ok || res.type === 'opaque') put(req, res.clone()); return res; })));
  }
});
