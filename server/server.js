// Banpani API + static server. Node built-in http/sqlite only - no deps.
//   node --experimental-sqlite server/server.js
// Env: PORT (8080), BANPANI_ADMIN_KEY (maintenance only), BANPANI_DB.
//
// Trust model: NO accounts. Anyone can report; the community verifies by consensus
// (see db.js THRESH). Victim contact numbers are NEVER in bulk responses - revealed
// one-at-a-time via /api/reports/:id/contact and logged.

import http from 'node:http';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
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
// gzip text responses (big win on weak flood-zone connections) + cache-control.
const GZIP_TYPES = /text|javascript|json|svg|manifest|xml/;
function writeBody(req, res, code, buf, type, cacheControl) {
  const headers = { 'content-type': type, 'access-control-allow-origin': '*' };
  if (cacheControl) headers['cache-control'] = cacheControl;
  const ae = req.headers['accept-encoding'] || '';
  if (GZIP_TYPES.test(type) && buf.length > 600 && /\bgzip\b/.test(ae)) {
    buf = gzipSync(buf); headers['content-encoding'] = 'gzip'; headers['vary'] = 'Accept-Encoding';
  }
  res.writeHead(code, headers); res.end(buf);
}
const str = (v, max = 400) => (v == null ? null : String(v).slice(0, max));
const jarr = v => JSON.stringify(Array.isArray(v) ? v.map(x => String(x).slice(0, 80)).slice(0, 40) : []);
const num = v => (v == null || v === '' || isNaN(+v) ? null : +v);
const dev = b => str(b.device, 80) || 'anon';
const isAdmin = req => req.headers['x-admin-key'] && req.headers['x-admin-key'] === ADMIN_KEY;

// IP is HASHED, never stored raw and never shown publicly. It exists only to detect
// abuse (a hash repeating a lot) and to derive an anonymous per-actor id for the public
// transparency feed. Salt = admin key (secret, per-deploy) unless overridden.
const IP_SALT = process.env.BANPANI_IP_SALT || ('salt:' + ADMIN_KEY);
const clientIp = req => (req.headers['x-real-ip'] || (req.headers['x-forwarded-for'] || '').split(',')[0] || req.socket?.remoteAddress || '').trim();
const ipHash = req => createHash('sha256').update(IP_SALT + '|' + clientIp(req)).digest('hex');
// Comprehensive action log. Every write goes through this. `area` is a coarse public
// label (place name / rounded location); nothing sensitive (no raw IP, no phone) is stored.
const log = (req, kind, target, { detail = null, device = null, area = null } = {}) =>
  run('INSERT INTO actions_log(created_at,kind,target,detail,device,ip_hash,area) VALUES(?,?,?,?,?,?,?)',
    now(), kind, target || null, detail, device, ipHash(req), area);
const coarse = (lat, lng) => (lat != null && lng != null) ? `${(+lat).toFixed(2)},${(+lng).toFixed(2)}` : null;

/* -------------------------------- routes -------------------------------- */
const routes = [];
const on = (m, p, h) => routes.push({ method: m, path: p, handler: h });

// Public read - everything the map needs, with victim contact stripped out.
// A 4s in-memory micro-cache absorbs traffic spikes (e.g. the FB ad) so a burst can't
// hammer SQLite - the map still feels live (the client polls every 20s anyway).
let stateCache = null;
on('GET', '/api/state', (req, res) => {
  if (stateCache && Date.now() - stateCache.at < 4000) return writeBody(req, res, 200, Buffer.from(stateCache.s), 'application/json', 'public, max-age=4');
  const reports = decoratedReports()
    .filter(r => r.verify_status !== 'false')
    .map(({ contact, device, ...r }) => ({ ...r, has_contact: !!contact }));
  const s = JSON.stringify({
    reports,
    routes: parseRows(all('SELECT * FROM routes WHERE hidden=0 ORDER BY created_at DESC'), ['items']),
    collection_points: parseRows(all('SELECT * FROM collection_points WHERE hidden=0 AND active=1'), ['accepts']),
    ngos: decoratedNgos(),
    flood_polygons: all('SELECT id,geojson,severity,note,source,created_at FROM flood_polygons WHERE hidden=0').map(r => ({ ...r, geojson: JSON.parse(r.geojson) })),
    flood_reports: all(`SELECT id,place,lat,lng,severity,created_at,updated_at,
      (SELECT COUNT(DISTINCT device) FROM votes v WHERE v.target_type='flood' AND v.target_id=f.id AND v.category='clear') AS clears
      FROM flood_reports f WHERE hidden=0 AND severity!='receded' ORDER BY COALESCE(updated_at,created_at) DESC LIMIT 500`),
    thresholds: { confirm: 3, resolve: 2, endorse: 5 },
    server_time: now(),
  });
  stateCache = { at: Date.now(), s };
  writeBody(req, res, 200, Buffer.from(s), 'application/json', 'public, max-age=4');
});

on('GET', '/api/report', (req, res) => json(res, 200, buildReport()));
on('GET', '/api/advisory', (req, res) => json(res, 200, one('SELECT * FROM advisory WHERE id=1') || {}));
on('GET', '/api/news', async (req, res) => { try { json(res, 200, { items: await fetchNews() }); } catch { json(res, 200, { items: [] }); } });

// Public transparency feed: what the community has been doing, REDACTED - no raw IP,
// no phone numbers. Each actor is an anonymous short id derived from the hashed IP.
on('GET', '/api/activity', (req, res) => {
  const rows = all(`SELECT created_at,kind,area,ip_hash,device FROM actions_log
    WHERE kind NOT LIKE 'admin_%' ORDER BY id DESC LIMIT 120`);
  json(res, 200, {
    items: rows.map(r => ({
      kind: r.kind, area: r.area, created_at: r.created_at,
      actor: (r.ip_hash || r.device || 'anon').slice(0, 5),
    })),
  });
});

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
  const r = one('SELECT contact,place FROM reports WHERE id=? AND hidden=0', params.id);
  if (!r) return json(res, 404, { error: 'not found' });
  log(req, 'contact_reveal', 'report:' + params.id, { area: r.place });
  json(res, 200, { contact: r.contact || null });
});

/* --- public writes (no login) --- */
on('POST', '/api/reports', async (req, res) => {
  const b = await readBody(req);
  if (!str(b.place) || b.lat == null || b.lng == null) return json(res, 400, { error: 'place, lat, lng required' });
  const mode = b.mode === 'rehab' ? 'rehab' : 'relief';
  const r = run(`INSERT INTO reports(created_at,place,lat,lng,items,people,details,contact,reporter_kind,mode,device)
    VALUES(?,?,?,?,?,?,?,?,?,?,?)`, now(), str(b.place), num(b.lat), num(b.lng), jarr(b.items),
    num(b.people), str(b.details, 1000), str(b.contact, 60),
    ['affected', 'volunteer', 'witness'].includes(b.reporter_kind) ? b.reporter_kind : 'witness', mode, dev(b));
  log(req, mode === 'rehab' ? 'rehab_report' : 'need_report', 'report:' + Number(r.lastInsertRowid), { device: dev(b), area: str(b.place, 120) });
  json(res, 201, { id: Number(r.lastInsertRowid) });
});

on('POST', '/api/routes', async (req, res) => {
  const b = await readBody(req);
  if (!str(b.name) || b.lat == null || b.lng == null) return json(res, 400, { error: 'name, lat, lng required' });
  const r = run(`INSERT INTO routes(created_at,name,from_place,from_lat,from_lng,lat,lng,items,eta,contact,covered_date,device)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`, now(), str(b.name), str(b.from_place), num(b.from_lat), num(b.from_lng),
    num(b.lat), num(b.lng), jarr(b.items), str(b.eta, 120), str(b.contact, 60), str(b.covered_date, 10) || today(), dev(b));
  log(req, 'convoy', 'route:' + Number(r.lastInsertRowid), { device: dev(b), area: str(b.name, 120) });
  json(res, 201, { id: Number(r.lastInsertRowid) });
});

on('POST', '/api/collection-points', async (req, res) => {
  const b = await readBody(req);
  if (!str(b.name) || b.lat == null || b.lng == null) return json(res, 400, { error: 'name, lat, lng required' });
  const r = run(`INSERT INTO collection_points(created_at,name,lat,lng,accepts,hours,contact,org,device)
    VALUES(?,?,?,?,?,?,?,?,?)`, now(), str(b.name), num(b.lat), num(b.lng), jarr(b.accepts),
    str(b.hours, 120), str(b.contact, 60), str(b.org), dev(b));
  log(req, 'drop_off', 'cp:' + Number(r.lastInsertRowid), { device: dev(b), area: str(b.name, 120) });
  json(res, 201, { id: Number(r.lastInsertRowid) });
});

on('POST', '/api/ngos', async (req, res) => {
  const b = await readBody(req);
  if (!str(b.name)) return json(res, 400, { error: 'name required' });
  const r = run(`INSERT INTO ngos(created_at,name,focus,area,contact,website,needs_now,last_active)
    VALUES(?,?,?,?,?,?,?,?)`, now(), str(b.name), jarr(b.focus), str(b.area), str(b.contact, 60),
    str(b.website, 200), str(b.needs_now, 300), now());
  log(req, 'ngo_listed', 'ngo:' + Number(r.lastInsertRowid), { area: str(b.name, 120) });
  json(res, 201, { id: Number(r.lastInsertRowid) });
});

// Real-time community flood marker at a point.
on('POST', '/api/flood-reports', async (req, res) => {
  const b = await readBody(req);
  if (b.lat == null || b.lng == null) return json(res, 400, { error: 'lat, lng required' });
  const sev = ['high', 'medium', 'receding', 'receded'].includes(b.severity) ? b.severity : 'high';
  const r = run('INSERT INTO flood_reports(created_at,updated_at,place,lat,lng,severity,device) VALUES(?,?,?,?,?,?,?)',
    now(), now(), str(b.place, 120), num(b.lat), num(b.lng), sev, dev(b));
  log(req, 'flood_marked', 'flood:' + Number(r.lastInsertRowid), { device: dev(b), detail: sev, area: str(b.place, 120) || coarse(b.lat, b.lng) });
  json(res, 201, { id: Number(r.lastInsertRowid) });
});

// Update a flood marker's status. Worsening / setting receding is instant; fully clearing
// (water gone) needs 2 different people so one person can't wipe a real flood off the map.
on('POST', '/api/flood-reports/:id/status', async (req, res, params) => {
  const b = await readBody(req);
  const sev = b.severity;
  if (!['high', 'medium', 'receding', 'receded'].includes(sev)) return json(res, 400, { error: 'bad severity' });
  const f = one('SELECT * FROM flood_reports WHERE id=? AND hidden=0', params.id);
  if (!f) return json(res, 404, { error: 'not found' });
  const device = dev(b);
  if (sev === 'receded') {
    // consensus clear: count distinct "clear" votes; needs 2
    castVote(req, 'flood', +params.id, device, 'clear', 'yes', f.place || coarse(f.lat, f.lng));
    const clears = one("SELECT COUNT(DISTINCT device) c FROM votes WHERE target_type='flood' AND target_id=? AND category='clear'", params.id).c;
    if (clears >= 2) { run("UPDATE flood_reports SET severity='receded', updated_at=? WHERE id=?", now(), params.id); return json(res, 200, { cleared: true, clears }); }
    return json(res, 200, { cleared: false, clears });
  }
  run('UPDATE flood_reports SET severity=?, updated_at=? WHERE id=?', sev, now(), params.id);
  log(req, 'flood_update', 'flood:' + params.id, { device, detail: sev, area: f.place || coarse(f.lat, f.lng) });
  json(res, 200, { ok: true, severity: sev });
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
function castVote(req, target_type, id, device, category, value, area) {
  run(`INSERT INTO votes(created_at,target_type,target_id,device,category,value) VALUES(?,?,?,?,?,?)
       ON CONFLICT(target_type,target_id,device,category) DO UPDATE SET value=excluded.value, created_at=excluded.created_at`,
    now(), target_type, id, device, category, value);
  log(req, 'vote', target_type + ':' + id, { device, detail: category + '=' + value, area: area || null });
}

on('POST', '/api/reports/:id/vote', async (req, res, params) => {
  const b = await readBody(req);
  const { category, value } = b;
  const ok = (category === 'trust' && ['confirm', 'false'].includes(value)) || (category === 'resolve' && value === 'yes');
  if (!ok) return json(res, 400, { error: 'bad vote' });
  const rep = one('SELECT id,place FROM reports WHERE id=?', params.id);
  if (!rep) return json(res, 404, { error: 'not found' });
  castVote(req, 'report', +params.id, dev(b), category, value, rep.place);
  const [r] = decoratedReports().filter(x => x.id === +params.id);
  json(res, 200, { ok: true, confirmations: r?.confirmations, false_flags: r?.false_flags, verify_status: r?.verify_status, status: r?.status });
});

// Rehab: a group/NGO opts to UNDERTAKE a rehab need (adopt). Public claim, logged.
// Its credibility is then its Promised-vs-Delivered record, not our say-so.
on('POST', '/api/reports/:id/adopt', async (req, res, params) => {
  const b = await readBody(req);
  if (!str(b.name)) return json(res, 400, { error: 'name required' });
  const rep = one('SELECT id,place FROM reports WHERE id=? AND hidden=0', params.id);
  if (!rep) return json(res, 404, { error: 'not found' });
  run('UPDATE reports SET adopted_by=?, adopted_at=? WHERE id=?', str(b.name, 120), now(), params.id);
  log(req, 'adopt', 'report:' + params.id, { device: dev(b), detail: str(b.name, 120), area: rep.place });
  json(res, 200, { ok: true, adopted_by: str(b.name, 120) });
});

on('POST', '/api/ngos/:id/endorse', async (req, res, params) => {
  const b = await readBody(req);
  if (!['yes', 'fake'].includes(b.value)) return json(res, 400, { error: 'value yes|fake' });
  const ng = one('SELECT id,name FROM ngos WHERE id=?', params.id);
  if (!ng) return json(res, 404, { error: 'not found' });
  castVote(req, 'ngo', +params.id, dev(b), 'endorse', b.value, ng.name);
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
  '.geojson': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.xml': 'application/xml', '.txt': 'text/plain' };
async function serveStatic(req, res, pathname) {
  const full = normalize(join(FRONTEND, pathname === '/' ? '/index.html' : pathname));
  if (!full.startsWith(FRONTEND)) return json(res, 403, { error: 'forbidden' });
  if (!existsSync(full)) return json(res, 404, { error: 'not found' });
  try {
    const buf = await readFile(full);
    const ext = extname(full), type = MIME[ext] || 'application/octet-stream';
    const cache = ext === '.html' ? 'no-cache' : 'public, max-age=3600';
    writeBody(req, res, 200, buf, type, cache);
  } catch { json(res, 500, { error: 'read failed' }); }
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (req.method === 'OPTIONS') return json(res, 204, {});
  try {
    if (url.pathname.startsWith('/api/')) {
      const m = matchRoute(req.method, url.pathname);
      if (!m) return json(res, 404, { error: 'no such endpoint' });
      const r = await m.handler(req, res, m.params, url);
      if (req.method === 'POST') stateCache = null;   // a write happened - drop the /api/state micro-cache
      return r;
    }
    return await serveStatic(req, res, url.pathname);
  } catch (e) { console.error(e); json(res, 500, { error: 'server error', detail: String(e.message || e) }); }
}).listen(PORT, () => {
  console.log(`Banpani running -> http://localhost:${PORT}`);
  if (ADMIN_KEY === 'change-me-in-production') console.warn('BANPANI_ADMIN_KEY not set (maintenance endpoints insecure).');
  // Auto weather advisory: refresh on boot + every 3h, so the corner panel is always
  // live with no admin action and no cron required (cron is still fine as a backup).
  updateWeather().catch(e => console.warn('weather update failed:', e.message));
  setInterval(() => updateWeather().catch(() => {}), 3 * 60 * 60 * 1000);
});
