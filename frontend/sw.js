// Banpani service worker.
// Strategy: NETWORK-FIRST for everything (so a live crisis tool is always up to date the
// moment it's online), falling back to the last cached copy only when the network fails -
// so the app still opens and the last-seen map still shows on a dead connection.
const CACHE = 'banpani-v67';
const PRECACHE = [
  './', 'index.html', 'styles.css', 'app.js', 'config.js', 'fullscreen.js', 'i18n.js',
  'about.html', 'privacy.html', 'volunteers.html', 'archive.html', 'doc.css', 'doc.js',
  'icon.svg', 'icon-192.png', 'apple-touch-icon.png',
  'manifest.webmanifest', 'data/assam-districts.geojson', 'data/relief-camps.json',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(PRECACHE).catch(() => {})).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const { request } = e;
  if (request.method !== 'GET') return;
  // Network-first: fetch fresh, update the cache, and fall back to cache only if offline.
  e.respondWith(
    fetch(request).then(resp => {
      if (resp && resp.status === 200 && new URL(request.url).origin === location.origin) {
        const copy = resp.clone(); caches.open(CACHE).then(c => c.put(request, copy));
      }
      return resp;
    }).catch(async () => {
      // Offline fallback: serve the cached copy of THIS exact url if we have it. Never substitute a
      // different page - serving index.html for /parthajy/admin, /world, /e/<slug> etc. broke them.
      const hit = await caches.match(request);
      if (hit) return hit;
      // Only the Assam app shell falls back to index.html, and only for the root navigation.
      if (request.mode === 'navigate') {
        const p = new URL(request.url).pathname;
        if (p === '/' || p === '/index.html') { const shell = await caches.match('index.html'); if (shell) return shell; }
      }
      return Response.error();   // a real Response (not undefined) so the fetch handler never throws
    })
  );
});
