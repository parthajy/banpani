// Banpani API + static server. Node built-in http/sqlite only - no deps.
//   node --experimental-sqlite server/server.js
// Env: PORT (8080), BANPANI_ADMIN_KEY (maintenance only), BANPANI_DB.
//
// Trust model: NO accounts. Anyone can report; the community verifies by consensus
// (see db.js THRESH). Victim contact numbers are NEVER in bulk responses - revealed
// one-at-a-time via /api/reports/:id/contact and logged.

import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, normalize, extname } from 'node:path';
import { db, all, one, run, now, today, parseRows, decoratedReports, decoratedNgos } from './db.js';
import { buildReport } from './report.js';
import { updateWeather } from './weather.js';
import { fetchNews } from './news.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FRONTEND = join(__dirname, '..', 'frontend');
const PORT = process.env.PORT || 8080;
const ADMIN_KEY = process.env.BANPANI_ADMIN_KEY || 'change-me-in-production';

/* ----------------------------- helpers ----------------------------- */
const json = (res, code, obj) => {
  res.writeHead(code, { 'content-type': 'application/json', 'access-control-allow-origin': '*',
    'access-control-allow-headers': 'content-type,x-admin-key',
    'access-control-allow-methods': 'GET,POST,OPTIONS' });
  res.end(JSON.stringify(obj));
};
const readBody = req => new Promise((resolve, reject) => {
  let b = ''; req.on('data', c => { b += c; if (b.length > 1e6) req.destroy(); });
  req.on('end', () => { try { resolve(b ? JSON.parse(b) : {}); } catch (e) { reject(e); } });
  req.on('error', reject);
});
const str = (v, max = 400) => (v == null ? null : String(v).slice(0, max));
const jarr = v => JSON.stringify(Array.isArray(v) ? v.map(x => String(x).slice(0, 80)).slice(0, 40) : []);
const num = v => (v == null || v === '' || isNaN(+v) ? null : +v);
const dev = b => str(b.device, 80) || 'anon';
const isAdmin = req => req.headers['x-admin-key'] && req.headers['x-admin-key'] === ADMIN_KEY;
const logAction = (kind, target, detail, device) =>
  run('INSERT INTO actions_log(created_at,volunteer_id,kind,target,detail) VALUES(?,?,?,?,?)', now(), null, kind, target, (detail || '') + (device ? ' @' + device : ''));

/* -------------------------------- routes -------------------------------- */
const routes = [];
const on = (m, p, h) => routes.push({ method: m, path: p, handler: h });

// Public read - everything the map needs, with victim contact stripped out.
on('GET', '/api/state', (req, res) => {
  const reports = decoratedReports()
    .filter(r => r.verify_status !== 'false')                 // community-hidden bogus reports drop out
    .map(({ contact, device, ...r }) => ({ ...r, has_contact: !!contact }));
  json(res, 200, {
    reports,
    routes: parseRows(all('SELECT * FROM routes WHERE hidden=0 ORDER BY created_at DESC'), ['items']),
    collection_points: parseRows(all('SELECT * FROM collection_points WHERE hidden=0 AND active=1'), ['accepts']),
    ngos: decoratedNgos(),
    flood_polygons: all('SELECT id,geojson,severity,note,source,created_at FROM flood_polygons WHERE hidden=0').map(r => ({ ...r, geojson: JSON.parse(r.geojson) })),
    flood_reports: all('SELECT id,place,lat,lng,severity,created_at FROM flood_reports WHERE hidden=0 ORDER BY created_at DESC LIMIT 500'),
    thresholds: { confirm: 3, resolve: 2, endorse: 5 },
    server_time: now(),
  });
});

on('GET', '/api/report', (req, res) => json(res, 200, buildReport()));
on('GET', '/api/advisory', (req, res) => json(res, 200, one('SELECT * FROM advisory WHERE id=1') || {}));
on('GET', '/api/news', async (req, res) => { try { json(res, 200, { items: await fetchNews() }); } catch { json(res, 200, { items: [] }); } });

// Private message to the maintainers. Public write; only readable via the maintenance page.
on('POST', '/api/messages', async (req, res) => {
  const b = await readBody(req);
  if (!str(b.message)) return json(res, 400, { error: 'message required' });
  run('INSERT INTO messages(created_at,name,contact,message,device) VALUES(?,?,?,?,?)',
    now(), str(b.name, 80), str(b.contact, 80), str(b.message, 2000), dev(b));
  json(res, 201, { ok: true });
});
on('GET', '/api/admin/messages', (req, res) => {
  if (!isAdmin(req)) return json(res, 403, { error: 'admin only' });
  json(res, 200, all('SELECT * FROM messages ORDER BY id DESC LIMIT 200'));
});

// Reveal one victim contact on demand (kept out of bulk data; every reveal is logged).
on('GET', '/api/reports/:id/contact', (req, res, params) => {
  const r = one('SELECT contact FROM reports WHERE id=? AND hidden=0', params.id);
  if (!r) return json(res, 404, { error: 'not found' });
  logAction('contact_reveal', 'report:' + params.id, null, null);
  json(res, 200, { contact: r.contact || null });
});

/* --- public writes (no login) --- */
on('POST', '/api/reports', async (req, res) => {
  const b = await readBody(req);
  if (!str(b.place) || b.lat == null || b.lng == null) return json(res, 400, { error: 'place, lat, lng required' });
  const r = run(`INSERT INTO reports(created_at,place,lat,lng,items,people,details,contact,reporter_kind,device)
    VALUES(?,?,?,?,?,?,?,?,?,?)`, now(), str(b.place), num(b.lat), num(b.lng), jarr(b.items),
    num(b.people), str(b.details, 1000), str(b.contact, 60),
    ['affected', 'volunteer', 'witness'].includes(b.reporter_kind) ? b.reporter_kind : 'witness', dev(b));
  json(res, 201, { id: Number(r.lastInsertRowid) });
});

on('POST', '/api/routes', async (req, res) => {
  const b = await readBody(req);
  if (!str(b.name) || b.lat == null || b.lng == null) return json(res, 400, { error: 'name, lat, lng required' });
  const r = run(`INSERT INTO routes(created_at,name,from_place,from_lat,from_lng,lat,lng,items,eta,contact,covered_date,device)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`, now(), str(b.name), str(b.from_place), num(b.from_lat), num(b.from_lng),
    num(b.lat), num(b.lng), jarr(b.items), str(b.eta, 120), str(b.contact, 60), str(b.covered_date, 10) || today(), dev(b));
  json(res, 201, { id: Number(r.lastInsertRowid) });
});

on('POST', '/api/collection-points', async (req, res) => {
  const b = await readBody(req);
  if (!str(b.name) || b.lat == null || b.lng == null) return json(res, 400, { error: 'name, lat, lng required' });
  const r = run(`INSERT INTO collection_points(created_at,name,lat,lng,accepts,hours,contact,org,device)
    VALUES(?,?,?,?,?,?,?,?,?)`, now(), str(b.name), num(b.lat), num(b.lng), jarr(b.accepts),
    str(b.hours, 120), str(b.contact, 60), str(b.org), dev(b));
  json(res, 201, { id: Number(r.lastInsertRowid) });
});

on('POST', '/api/ngos', async (req, res) => {
  const b = await readBody(req);
  if (!str(b.name)) return json(res, 400, { error: 'name required' });
  const r = run(`INSERT INTO ngos(created_at,name,focus,area,contact,website,needs_now,last_active)
    VALUES(?,?,?,?,?,?,?,?)`, now(), str(b.name), jarr(b.focus), str(b.area), str(b.contact, 60),
    str(b.website, 200), str(b.needs_now, 300), now());
  json(res, 201, { id: Number(r.lastInsertRowid) });
});

// Real-time community flood marker at a point.
on('POST', '/api/flood-reports', async (req, res) => {
  const b = await readBody(req);
  if (b.lat == null || b.lng == null) return json(res, 400, { error: 'lat, lng required' });
  const r = run('INSERT INTO flood_reports(created_at,place,lat,lng,severity,device) VALUES(?,?,?,?,?,?)',
    now(), str(b.place, 120), num(b.lat), num(b.lng),
    ['high', 'medium', 'receding', 'receded'].includes(b.severity) ? b.severity : 'high', dev(b));
  json(res, 201, { id: Number(r.lastInsertRowid) });
});

on('POST', '/api/flood/polygons', async (req, res) => {
  const b = await readBody(req);
  if (!b.geojson || b.geojson.type !== 'Polygon') return json(res, 400, { error: 'geojson Polygon required' });
  const r = run(`INSERT INTO flood_polygons(created_at,geojson,severity,note,source) VALUES(?,?,?,?,?)`,
    now(), JSON.stringify(b.geojson), ['high', 'medium', 'receding'].includes(b.severity) ? b.severity : 'high',
    str(b.note, 200), 'community');
  json(res, 201, { id: Number(r.lastInsertRowid) });
});

/* --- community consensus votes (no login; one device, one vote per category) --- */
function castVote(target_type, id, device, category, value) {
  run(`INSERT INTO votes(created_at,target_type,target_id,device,category,value) VALUES(?,?,?,?,?,?)
       ON CONFLICT(target_type,target_id,device,category) DO UPDATE SET value=excluded.value, created_at=excluded.created_at`,
    now(), target_type, id, device, category, value);
  logAction('vote', target_type + ':' + id, category + '=' + value, device);
}

on('POST', '/api/reports/:id/vote', async (req, res, params) => {
  const b = await readBody(req);
  const { category, value } = b;
  const ok = (category === 'trust' && ['confirm', 'false'].includes(value)) || (category === 'resolve' && value === 'yes');
  if (!ok) return json(res, 400, { error: 'bad vote' });
  if (!one('SELECT id FROM reports WHERE id=?', params.id)) return json(res, 404, { error: 'not found' });
  castVote('report', +params.id, dev(b), category, value);
  const [r] = decoratedReports().filter(x => x.id === +params.id);
  json(res, 200, { ok: true, confirmations: r?.confirmations, false_flags: r?.false_flags, verify_status: r?.verify_status, status: r?.status });
});

on('POST', '/api/ngos/:id/endorse', async (req, res, params) => {
  const b = await readBody(req);
  if (!['yes', 'fake'].includes(b.value)) return json(res, 400, { error: 'value yes|fake' });
  if (!one('SELECT id FROM ngos WHERE id=?', params.id)) return json(res, 404, { error: 'not found' });
  castVote('ngo', +params.id, dev(b), 'endorse', b.value);
  const [n] = decoratedNgos().filter(x => x.id === +params.id) || [];
  json(res, 200, { ok: true, endorsements: n?.endorsements });
});

/* --- admin: MAINTENANCE ONLY (the site runs without it) --- */
on('POST', '/api/admin/advisory', async (req, res) => {
  if (!isAdmin(req)) return json(res, 403, { error: 'admin only' });
  const b = await readBody(req);
  run(`INSERT INTO advisory(id,updated_at,headline,body,source) VALUES(1,?,?,?,?)
       ON CONFLICT(id) DO UPDATE SET updated_at=excluded.updated_at, headline=excluded.headline, body=excluded.body, source=excluded.source`,
    now(), str(b.headline, 200), str(b.body, 2000), str(b.source, 200));
  json(res, 200, { ok: true });
});
on('POST', '/api/admin/:kind/:id/hide', async (req, res, params) => {
  if (!isAdmin(req)) return json(res, 403, { error: 'admin only' });
  const table = { reports: 'reports', routes: 'routes', 'collection-points': 'collection_points', ngos: 'ngos', flood: 'flood_polygons' }[params.kind];
  if (!table) return json(res, 400, { error: 'bad kind' });
  run(`UPDATE ${table} SET hidden=1 WHERE id=?`, params.id);
  json(res, 200, { ok: true });
});
on('GET', '/api/admin/audit', (req, res) => {
  if (!isAdmin(req)) return json(res, 403, { error: 'admin only' });
  json(res, 200, all('SELECT * FROM actions_log ORDER BY id DESC LIMIT 200'));
});

/* --------------------------- dispatch --------------------------- */
function matchRoute(method, pathname) {
  for (const r of routes) {
    if (r.method !== method) continue;
    if (!r.path.includes(':')) { if (r.path === pathname) return { handler: r.handler, params: {} }; continue; }
    const rp = r.path.split('/'), pp = pathname.split('/');
    if (rp.length !== pp.length) continue;
    const params = {}; let ok = true;
    for (let i = 0; i < rp.length; i++) {
      if (rp[i].startsWith(':')) params[rp[i].slice(1)] = decodeURIComponent(pp[i]);
      else if (rp[i] !== pp[i]) { ok = false; break; }
    }
    if (ok) return { handler: r.handler, params };
  }
  return null;
}
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.geojson': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
async function serveStatic(res, pathname) {
  const full = normalize(join(FRONTEND, pathname === '/' ? '/index.html' : pathname));
  if (!full.startsWith(FRONTEND)) return json(res, 403, { error: 'forbidden' });
  if (!existsSync(full)) return json(res, 404, { error: 'not found' });
  try {
    const buf = await readFile(full);
    res.writeHead(200, { 'content-type': MIME[extname(full)] || 'application/octet-stream' });
    res.end(buf);
  } catch { json(res, 500, { error: 'read failed' }); }
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (req.method === 'OPTIONS') return json(res, 204, {});
  try {
    if (url.pathname.startsWith('/api/')) {
      const m = matchRoute(req.method, url.pathname);
      if (!m) return json(res, 404, { error: 'no such endpoint' });
      return await m.handler(req, res, m.params, url);
    }
    return await serveStatic(res, url.pathname);
  } catch (e) { console.error(e); json(res, 500, { error: 'server error', detail: String(e.message || e) }); }
}).listen(PORT, () => {
  console.log(`Banpani running -> http://localhost:${PORT}`);
  if (ADMIN_KEY === 'change-me-in-production') console.warn('BANPANI_ADMIN_KEY not set (maintenance endpoints insecure).');
  // Auto weather advisory: refresh on boot + every 3h, so the corner panel is always
  // live with no admin action and no cron required (cron is still fine as a backup).
  updateWeather().catch(e => console.warn('weather update failed:', e.message));
  setInterval(() => updateWeather().catch(() => {}), 3 * 60 * 60 * 1000);
});
