// Banpani service worker - makes the app installable and usable when signal drops.
// Strategy: cache-first for the app shell (so it opens instantly / offline);
// network-first for API + map tiles (so live data is fresh but the last-seen map
// survives a dead connection).
const SHELL = 'banpani-shell-v12';
const RUNTIME = 'banpani-runtime-v12';
const SHELL_FILES = [
  './', 'index.html', 'styles.css', 'app.js', 'config.js', 'i18n.js',
  'icon.svg', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png',
  'manifest.webmanifest', 'data/assam-districts.geojson', 'data/relief-camps.json',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(SHELL).then(c => c.addAll(SHELL_FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => ![SHELL, RUNTIME].includes(k)).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const { request } = e;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  const isApi = url.pathname.startsWith('/api/');
  const isTile = /tile\.openstreetmap|unpkg\.com/.test(url.host + url.pathname);

  if (isApi || isTile) {
    // network-first, fall back to whatever we last cached (stale map beats blank map)
    e.respondWith(
      fetch(request).then(resp => {
        const copy = resp.clone(); caches.open(RUNTIME).then(c => c.put(request, copy)); return resp;
      }).catch(() => caches.match(request))
    );
  } else {
    // app shell: cache-first
    e.respondWith(caches.match(request).then(hit => hit || fetch(request)));
  }
});
