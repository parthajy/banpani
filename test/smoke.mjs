// Load-time smoke test for the front-end. Catches the class of bug that a syntax
// check (node --check) CANNOT: ReferenceErrors and null-derefs that only surface when
// the code actually RUNS in the browser (e.g. using `bp` before window.bp is defined,
// or wiring a handler onto an element id that doesn't exist in index.html).
//
// It runs config.js + i18n.js + app.js exactly as the browser does - concatenated in
// one shared script scope - inside a stubbed DOM. If loading throws (sync) or a boot
// promise rejects (async), the test fails. No browser, no npm deps.
//   node test/smoke.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const FE = join(dirname(fileURLToPath(import.meta.url)), '..', 'frontend');
const read = f => readFileSync(join(FE, f), 'utf8');

// Real ids present in index.html. getElementById returns a live-ish stub for these and
// null for anything else - so `$('typo').onclick = ...` throws here just like in a browser.
const html = read('index.html');
const IDS = new Set([...html.matchAll(/id="([^"]+)"/g)].map(m => m[1]));

// A chainable no-op proxy: any property access returns itself, any call returns itself.
// Stands in for a DOM element / Leaflet handle / anything fluent, without ever throwing.
function chain() {
  const fn = function () { return p; };
  const p = new Proxy(fn, {
    get(_t, k) {
      if (k === 'then') return undefined;                 // must NOT look thenable
      if (k === Symbol.toPrimitive) return () => '';
      if (k === Symbol.iterator) return function* () {}[Symbol.iterator].bind([]);
      if (k === 'length') return 0;
      if (k === 'files') return [];
      if (k === 'checked' || k === 'hidden') return false;
      if (k === 'value' || k === 'textContent' || k === 'innerHTML' || k === 'className') return '';
      return p;
    },
    set() { return true; },
    apply() { return p; },
    construct() { return p; },
    has() { return true; },
  });
  return p;
}

const doc = {
  getElementById: id => (IDS.has(id) ? chain() : null),
  querySelector: () => chain(),
  querySelectorAll: () => [],
  getElementsByClassName: () => [],
  getElementsByTagName: () => [],
  createElement: () => chain(),
  createElementNS: () => chain(),
  createTextNode: () => chain(),
  addEventListener() {}, removeEventListener() {},
  documentElement: chain(), body: chain(), head: chain(),
  cookie: '', title: '', hidden: false, visibilityState: 'visible', readyState: 'complete',
};

const navigatorStub = {
  language: 'en', languages: ['en'], userAgent: 'node-smoke', onLine: true,
  geolocation: { getCurrentPosition() {}, watchPosition() {}, clearWatch() {} },
  clipboard: { writeText: () => Promise.resolve() },
  serviceWorker: { register: () => Promise.resolve(), ready: Promise.resolve(chain()) },
};

function makeWin(eventCfg) {
const win = {};
Object.assign(win, {
  BANPANI: undefined,                                     // set by config.js
  EVENT: eventCfg,                                         // null = homepage; object = /e/<slug> event mode
  document: doc, navigator: navigatorStub, location: { href: 'https://banpani.org/', origin: 'https://banpani.org', search: '', hash: '', pathname: '/', reload() {}, assign() {} },
  localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  history: { pushState() {}, replaceState() {} },
  addEventListener() {}, removeEventListener() {}, dispatchEvent() {},
  matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {} }),
  getComputedStyle: () => chain(),
  requestAnimationFrame: () => 0, cancelAnimationFrame() {},
  performance: { now: () => 0 },
  setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {},
  open: () => null, scrollTo() {}, alert() {}, confirm: () => true, prompt: () => null,
  innerWidth: 390, innerHeight: 780, devicePixelRatio: 2,
  gtag() {}, dataLayer: [],
  fetch: (u = '') => {                                    // return each endpoint's real (empty) shape
    const url = String(u);
    let body = {};
    if (url.includes('/api/state')) body = { reports: [], routes: [], collection_points: [], ngos: [], flood_polygons: [], photos: [], flood_reports: [], thresholds: { confirm: 3, resolve: 2, endorse: 5 }, server_time: '2026-08-01T00:00:00Z' };
    else if (url.includes('/api/news')) body = { items: [] };
    else if (url.includes('/api/geocode')) body = { results: [] };
    else if (url.includes('/api/report')) body = { areas: [], generated_at: '2026-08-01T00:00:00Z' };
    else if (url.includes('geojson')) body = { type: 'FeatureCollection', features: [] };
    else if (url.includes('relief-camps')) body = { camps: [], updated: '' };
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body), text: () => Promise.resolve(JSON.stringify(body)) });
  },
  L: chain(),                                             // Leaflet
  Image: class { set src(_) {} },
  URL, URLSearchParams, console, JSON, Math, Date, Promise, Object, Array, String, Number, Boolean, RegExp, Map, Set, parseInt, parseFloat, isNaN, encodeURIComponent, decodeURIComponent, Intl,
});
win.window = win; win.self = win; win.globalThis = win; win.top = win;
return win;
}

const failures = [];
let mode = '';
process.on('unhandledRejection', e => failures.push('[' + mode + '] async boot rejected: ' + (e && e.stack || e)));

// Concatenate exactly as the three <script> tags load, in order.
const code = ['config.js', 'i18n.js', 'app.js'].map(f => `\n//== ${f} ==\n` + read(f)).join('\n');
// A representative event config, to exercise the /e/<slug> event-mode code path too.
const EVENT_STUB = { id: 1, slug: 'demo-water', title: 'Demo Event', disaster_type: 'flood', family: 'water', color: '#2E77FF', emoji: '💧', center: [26, 92], zoom: 8, minZoom: 5, bounds: [[24, 90], [28, 95]], official: false, items: ['Drinking water', 'Food'], modules: ['needs', 'offers', 'blocked', 'photos'] };

for (const [name, eventCfg] of [['homepage', null], ['event', EVENT_STUB]]) {
  mode = name;
  const ctx = vm.createContext(makeWin(eventCfg));
  try { vm.runInContext(code, ctx, { filename: 'bundle-' + name + '.js' }); }
  catch (e) { failures.push('[' + name + '] load threw: ' + (e && e.stack || e)); }
  await new Promise(r => setImmediate(r));   // flush microtasks so async-boot rejections surface
  await new Promise(r => setImmediate(r));
}

if (failures.length) {
  console.error('✗ smoke test FAILED:\n' + failures.join('\n\n'));
  process.exit(1);
}
console.log('✓ smoke test passed — homepage + event modes load clean (' + IDS.size + ' ids checked)');
