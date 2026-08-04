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
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, normalize, extname } from 'node:path';
import { db, all, one, run, now, today, parseRows, decoratedReports, decoratedNgos } from './db.js';
import { buildReport } from './report.js';
import { updateWeather } from './weather.js';
import { fetchNews } from './news.js';
import { listEvents, eventBySlug, createOrJoinEvent, eventForLocation } from './events.js';
import { DISASTERS, familyOf } from './disasters.js';
import { officialEvents } from './official.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FRONTEND = join(__dirname, '..', 'frontend');
const PORT = process.env.PORT || 8080;
const ADMIN_KEY = process.env.BANPANI_ADMIN_KEY || 'change-me-in-production';
const UPLOADS = process.env.BANPANI_UPLOADS || join(__dirname, '..', 'uploads');
try { mkdirSync(UPLOADS, { recursive: true }); } catch {}

/* ----------------------------- helpers ----------------------------- */
const json = (res, code, obj) => {
  res.writeHead(code, { 'content-type': 'application/json', 'access-control-allow-origin': '*',
    'access-control-allow-headers': 'content-type,x-admin-key',
    'access-control-allow-methods': 'GET,POST,OPTIONS' });
  res.end(JSON.stringify(obj));
};
const readBody = req => new Promise((resolve, reject) => {
  let b = ''; req.on('data', c => { b += c; if (b.length > 6e6) req.destroy(); });   // 6MB cap (photos are ~300-800KB base64)
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
const log = (req, kind, target, { detail = null, device = null, area = null, mode = 'relief', event_id = null } = {}) =>
  run('INSERT INTO actions_log(created_at,kind,target,detail,device,ip_hash,area,mode,event_id) VALUES(?,?,?,?,?,?,?,?,?)',
    now(), kind, target || null, detail, device, ipHash(req), area, mode, event_id);
const coarse = (lat, lng) => (lat != null && lng != null) ? `${(+lat).toFixed(2)},${(+lng).toFixed(2)}` : null;

/* -------------------------------- routes -------------------------------- */
const routes = [];
const on = (m, p, h) => routes.push({ method: m, path: p, handler: h });

// Public read - everything the map needs, with victim contact stripped out.
// A 4s in-memory micro-cache absorbs traffic spikes (e.g. the FB ad) so a burst can't
// hammer SQLite - the map still feels live (the client polls every 20s anyway).
let stateCache = null;
on('GET', '/api/state', (req, res, params, url) => {
  const evSlug = url && url.searchParams.get('event');
  let eid = null;
  if (evSlug) { const e = one('SELECT id FROM events WHERE slug=?', evSlug); if (!e) return json(res, 404, { error: 'no such event' }); eid = e.id; }
  if (!eid && stateCache && Date.now() - stateCache.at < 4000) return writeBody(req, res, 200, Buffer.from(stateCache.s), 'application/json', 'public, max-age=4');
  const A = eid != null ? ' AND event_id=' + eid : '';   // eid is a server-derived integer, safe to inline
  const reports = decoratedReports()
    .filter(r => r.verify_status !== 'false' && (eid == null || r.event_id === eid))
    .map(({ contact, device, ...r }) => ({ ...r, has_contact: !!contact }));
  const s = JSON.stringify({
    reports,
    routes: parseRows(all('SELECT * FROM routes WHERE hidden=0' + A + ' ORDER BY created_at DESC'), ['items']),
    collection_points: parseRows(all('SELECT * FROM collection_points WHERE hidden=0 AND active=1' + A), ['accepts']),
    ngos: decoratedNgos(),
    flood_polygons: all('SELECT id,geojson,severity,note,source,created_at FROM flood_polygons WHERE hidden=0').map(r => ({ ...r, geojson: JSON.parse(r.geojson) })),
    photos: all('SELECT id,report_id,lat,lng,tag,mode,caption,file,created_at FROM photos WHERE hidden=0' + A + ' ORDER BY id DESC LIMIT 300').map(p => ({ ...p, url: '/uploads/' + p.file, file: undefined })),
    flood_reports: all(`SELECT id,place,lat,lng,severity,created_at,updated_at,
      (SELECT COUNT(DISTINCT device) FROM votes v WHERE v.target_type='flood' AND v.target_id=f.id AND v.category='clear') AS clears
      FROM flood_reports f WHERE hidden=0 AND severity!='receded'${A} ORDER BY COALESCE(updated_at,created_at) DESC LIMIT 500`),
    offers: all('SELECT id,lat,lng,kind,note,contact,updated_at FROM offers WHERE hidden=0 AND status=\'available\'' + A + ' ORDER BY id DESC LIMIT 300')
      .map(({ contact, ...o }) => ({ ...o, has_contact: !!contact, fresh_min: Math.round((Date.now() - new Date(o.updated_at).getTime()) / 60000) })),
    blocked: all('SELECT id,lat,lng,label,kind,updated_at FROM blocked_roads WHERE hidden=0 AND status=\'blocked\'' + A + ' ORDER BY id DESC LIMIT 300')
      .map(x => ({ ...x, fresh_min: Math.round((Date.now() - new Date(x.updated_at).getTime()) / 60000) })),
    facilities: all('SELECT id,lat,lng,kind,name,note,status,updated_at FROM facilities WHERE hidden=0' + A + ' ORDER BY id DESC LIMIT 300')
      .map(x => ({ ...x, fresh_min: Math.round((Date.now() - new Date(x.updated_at).getTime()) / 60000) })),
    thresholds: { confirm: 3, resolve: 2, endorse: 5 },
    server_time: now(),
  });
  if (!eid) stateCache = { at: Date.now(), s };   // cache only the hot homepage query
  writeBody(req, res, 200, Buffer.from(s), 'application/json', eid ? 'no-cache' : 'public, max-age=4');
});

on('GET', '/api/report', (req, res) => json(res, 200, buildReport()));
on('GET', '/api/advisory', (req, res) => json(res, 200, one('SELECT * FROM advisory WHERE id=1') || {}));
// News keywords per family; an event's feed = its place (title) + the family's terms.
const NEWS_TERMS = { water: 'flood', fire: 'wildfire fire', storm: 'cyclone storm', geo: 'earthquake landslide', climate: 'drought heatwave', health: 'outbreak OR pandemic OR virus', tech: 'chemical OR gas leak', infra: 'collapse', agri: 'locust' };
function newsQueryFor(title, family) {
  const place = String(title || '').replace(/\(demo\)/ig, '').replace(/\b20\d\d\b/g, '').trim();
  return [`${place} ${NEWS_TERMS[family] || ''}`.replace(/\s+/g, ' ').trim()];
}
on('GET', '/api/news', async (req, res, params, url) => {
  try {
    const slug = url && url.searchParams.get('event');
    let queries;
    if (slug) { const e = one('SELECT title,disaster_type FROM events WHERE slug=?', slug); if (e) queries = newsQueryFor(e.title, familyOf(e.disaster_type)); }
    json(res, 200, { items: await fetchNews(queries) });
  } catch { json(res, 200, { items: [] }); }
});
// Events: first-class persisted responses (for the world map). `promoted` = SEO-worthy.
on('GET', '/api/events', (req, res) => json(res, 200, { events: listEvents() }));
// A single event with its scoped coordination data (drives the /e/<slug> coordination page).
on('GET', '/api/event/:slug', (req, res, params) => { const e = eventBySlug(params.slug); e ? json(res, 200, e) : json(res, 404, { error: 'no such event' }); });
// Official multi-hazard signals (GDACS) so the world map is never empty when disaster hits.
on('GET', '/api/official', async (req, res) => { try { json(res, 200, { official: await officialEvents() }); } catch { json(res, 200, { official: [] }); } });

// Place search - proxied to OpenStreetMap Nominatim (bounded to Assam), cached, proper UA
// (so it respects the usage policy and the key/UA stays server-side).
const geoCache = new Map();
on('GET', '/api/geocode', async (req, res, params, url) => {
  const q = (url.searchParams.get('q') || '').trim();
  if (q.length < 2) return json(res, 200, { results: [] });
  const world = url.searchParams.get('world') === '1';          // world map = global search; Assam map = bounded
  const key = (world ? 'w:' : '') + q.toLowerCase();
  if (geoCache.has(key)) return json(res, 200, { results: geoCache.get(key) });
  try {
    const u = world
      ? 'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&q=' + encodeURIComponent(q)
      : 'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&countrycodes=in&bounded=1'
        + '&viewbox=89.5,28.6,96.3,24.0&q=' + encodeURIComponent(q);
    const r = await fetch(u, { headers: { 'user-agent': 'Banpani/1.0 (https://banpani.org)' } });
    const arr = await r.json();
    const results = (Array.isArray(arr) ? arr : []).map(x => ({ name: x.display_name, lat: +x.lat, lng: +x.lon })).slice(0, 6);
    geoCache.set(key, results); if (geoCache.size > 500) geoCache.clear();
    json(res, 200, { results });
  } catch { json(res, 200, { results: [] }); }
});

// Public transparency feed: what the community has been doing, REDACTED - no raw IP,
// no phone numbers. Each actor is an anonymous short id derived from the hashed IP.
on('GET', '/api/activity', (req, res, params, url) => {
  const slug = url && url.searchParams.get('event');
  let A = '';
  if (slug) { const e = one('SELECT id FROM events WHERE slug=?', slug); A = ' AND event_id=' + (e ? e.id : -1); }
  const rows = all(`SELECT created_at,kind,area,ip_hash,device,mode FROM actions_log
    WHERE kind NOT LIKE 'admin_%'${A} ORDER BY id DESC LIMIT 200`);
  json(res, 200, {
    items: rows.map(r => ({
      kind: r.kind, area: r.area, created_at: r.created_at, mode: r.mode || 'relief',
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
  const dtype = str(b.disaster_type, 40) || 'flood';
  // every report lives in an event: honor an explicit event_id (added on an event page), else create-or-join
  const eventId = num(b.event_id) || createOrJoinEvent(num(b.lat), num(b.lng), dtype, str(b.place), dev(b));
  const r = run(`INSERT INTO reports(created_at,place,lat,lng,items,people,details,contact,reporter_kind,mode,disaster_type,event_id,device)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`, now(), str(b.place), num(b.lat), num(b.lng), jarr(b.items),
    num(b.people), str(b.details, 1000), str(b.contact, 60),
    ['affected', 'volunteer', 'witness'].includes(b.reporter_kind) ? b.reporter_kind : 'witness', mode, dtype, eventId, dev(b));
  log(req, mode === 'rehab' ? 'rehab_report' : 'need_report', 'report:' + Number(r.lastInsertRowid), { device: dev(b), area: str(b.place, 120), mode, event_id: eventId });
  json(res, 201, { id: Number(r.lastInsertRowid) });
});

on('POST', '/api/routes', async (req, res) => {
  const b = await readBody(req);
  if (!str(b.name) || b.lat == null || b.lng == null) return json(res, 400, { error: 'name, lat, lng required' });
  const r = run(`INSERT INTO routes(created_at,name,from_place,from_lat,from_lng,lat,lng,items,eta,contact,covered_date,event_id,device)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`, now(), str(b.name), str(b.from_place), num(b.from_lat), num(b.from_lng),
    num(b.lat), num(b.lng), jarr(b.items), str(b.eta, 120), str(b.contact, 60), str(b.covered_date, 10) || today(), (num(b.event_id) || eventForLocation(num(b.lat), num(b.lng))), dev(b));
  log(req, 'convoy', 'route:' + Number(r.lastInsertRowid), { device: dev(b), area: str(b.name, 120) });
  json(res, 201, { id: Number(r.lastInsertRowid) });
});

on('POST', '/api/collection-points', async (req, res) => {
  const b = await readBody(req);
  if (!str(b.name) || b.lat == null || b.lng == null) return json(res, 400, { error: 'name, lat, lng required' });
  const r = run(`INSERT INTO collection_points(created_at,name,lat,lng,accepts,hours,contact,org,event_id,device)
    VALUES(?,?,?,?,?,?,?,?,?,?)`, now(), str(b.name), num(b.lat), num(b.lng), jarr(b.accepts),
    str(b.hours, 120), str(b.contact, 60), str(b.org), (num(b.event_id) || eventForLocation(num(b.lat), num(b.lng))), dev(b));
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
  const r = run('INSERT INTO flood_reports(created_at,updated_at,place,lat,lng,severity,event_id,device) VALUES(?,?,?,?,?,?,?,?)',
    now(), now(), str(b.place, 120), num(b.lat), num(b.lng), sev, (num(b.event_id) || eventForLocation(num(b.lat), num(b.lng))), dev(b));
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

// Photo upload (no account). Image is a base64 data URL, already resized + EXIF-stripped
// client-side. Stored on disk; only the URL goes into the DB.
on('POST', '/api/photos', async (req, res) => {
  const b = await readBody(req);
  const m = /^data:image\/(jpeg|jpg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(b.image || '');
  if (!m) return json(res, 400, { error: 'image (base64 data URL) required' });
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length < 100 || buf.length > 5 * 1024 * 1024) return json(res, 400, { error: 'image size out of range' });
  const mode = b.mode === 'rehab' ? 'rehab' : 'relief';
  const tag = str(b.tag, 20) || (mode === 'rehab' ? 'damage' : 'need');
  const eid = num(b.event_id) || eventForLocation(num(b.lat), num(b.lng));
  const r = run(`INSERT INTO photos(created_at,report_id,lat,lng,tag,mode,caption,file,event_id,device)
    VALUES(?,?,?,?,?,?,?,?,?,?)`, now(), num(b.report_id), num(b.lat), num(b.lng), tag, mode, str(b.caption, 200), '', eid, dev(b));
  const id = Number(r.lastInsertRowid);
  const file = `p${id}.${m[1] === 'png' ? 'png' : 'jpg'}`;
  try { writeFileSync(join(UPLOADS, file), buf); } catch { return json(res, 500, { error: 'save failed' }); }
  run('UPDATE photos SET file=? WHERE id=?', file, id);
  log(req, 'photo', 'photo:' + id, { device: dev(b), detail: tag, area: str(b.caption, 120), mode, event_id: eid });
  json(res, 201, { id, url: '/uploads/' + file });
});
on('POST', '/api/photos/:id/flag', async (req, res, params) => {
  const b = await readBody(req);
  if (!one('SELECT id FROM photos WHERE id=?', params.id)) return json(res, 404, { error: 'not found' });
  castVote(req, 'photo', +params.id, dev(b), 'flag', 'yes');
  const n = one("SELECT COUNT(DISTINCT device) c FROM votes WHERE target_type='photo' AND target_id=? AND category='flag'", params.id).c;
  if (n >= 2) run('UPDATE photos SET hidden=1 WHERE id=?', params.id);
  json(res, 200, { ok: true, hidden: n >= 2 });
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
/* ---- MODULE: blocked / damaged roads ---- */
on('POST', '/api/blocked', async (req, res) => {
  const b = await readBody(req);
  if (b.lat == null || b.lng == null) return json(res, 400, { error: 'lat, lng required' });
  const eid = num(b.event_id) || eventForLocation(num(b.lat), num(b.lng));
  const r = run('INSERT INTO blocked_roads(created_at,updated_at,event_id,lat,lng,label,kind,device) VALUES(?,?,?,?,?,?,?,?)',
    now(), now(), eid, num(b.lat), num(b.lng), str(b.label, 160), b.kind === 'partial' ? 'partial' : 'blocked', dev(b));
  log(req, 'blocked_road', 'blocked:' + Number(r.lastInsertRowid), { device: dev(b), area: str(b.label, 120) || coarse(b.lat, b.lng), event_id: eid });
  json(res, 201, { id: Number(r.lastInsertRowid) });
});
on('POST', '/api/blocked/:id/confirm', async (req, res, params) => { run('UPDATE blocked_roads SET updated_at=? WHERE id=? AND hidden=0', now(), params.id); json(res, 200, { ok: true }); });
on('POST', '/api/blocked/:id/clear', async (req, res, params) => {
  const b = await readBody(req);
  const row = one('SELECT * FROM blocked_roads WHERE id=? AND hidden=0', params.id);
  if (!row) return json(res, 404, { error: 'not found' });
  castVote(req, 'blocked', +params.id, dev(b), 'clear', 'yes', row.label || coarse(row.lat, row.lng));
  const clears = one("SELECT COUNT(DISTINCT device) c FROM votes WHERE target_type='blocked' AND target_id=? AND category='clear'", params.id).c;
  if (clears >= 2) { run("UPDATE blocked_roads SET status='cleared', updated_at=? WHERE id=?", now(), params.id); return json(res, 200, { cleared: true, clears }); }
  json(res, 200, { cleared: false, clears });
});

/* ---- MODULE: offers / available resources (supply side; freshness + consensus retire) ---- */
on('POST', '/api/offers', async (req, res) => {
  const b = await readBody(req);
  if (b.lat == null || b.lng == null) return json(res, 400, { error: 'lat, lng required' });
  const eid = num(b.event_id) || eventForLocation(num(b.lat), num(b.lng));
  const r = run('INSERT INTO offers(created_at,updated_at,event_id,lat,lng,kind,note,contact,device) VALUES(?,?,?,?,?,?,?,?,?)',
    now(), now(), eid, num(b.lat), num(b.lng), str(b.kind, 30) || 'other', str(b.note, 200), str(b.contact, 60), dev(b));
  log(req, 'offer', 'offer:' + Number(r.lastInsertRowid), { device: dev(b), detail: str(b.kind, 30), area: coarse(b.lat, b.lng), event_id: eid });
  json(res, 201, { id: Number(r.lastInsertRowid) });
});
on('POST', '/api/offers/:id/confirm', async (req, res, params) => { run('UPDATE offers SET updated_at=? WHERE id=? AND hidden=0', now(), params.id); json(res, 200, { ok: true }); });
on('POST', '/api/offers/:id/gone', async (req, res, params) => {
  const b = await readBody(req);
  const row = one('SELECT * FROM offers WHERE id=? AND hidden=0', params.id);
  if (!row) return json(res, 404, { error: 'not found' });
  castVote(req, 'offer', +params.id, dev(b), 'gone', 'yes', coarse(row.lat, row.lng));
  const g = one("SELECT COUNT(DISTINCT device) c FROM votes WHERE target_type='offer' AND target_id=? AND category='gone'", params.id).c;
  if (g >= 2) { run("UPDATE offers SET status='gone', updated_at=? WHERE id=?", now(), params.id); return json(res, 200, { gone: true, votes: g }); }
  json(res, 200, { gone: false, votes: g });
});
on('GET', '/api/offers/:id/contact', (req, res, params) => {
  const row = one('SELECT contact,lat,lng FROM offers WHERE id=? AND hidden=0', params.id);
  if (!row) return json(res, 404, { error: 'not found' });
  log(req, 'offer_contact', 'offer:' + params.id, { area: coarse(row.lat, row.lng) });
  json(res, 200, { contact: row.contact || null });
});

/* ---- MODULE: facility status (open / limited / closed) ---- */
const FAC_STATUS = s => (['open', 'limited', 'closed'].includes(s) ? s : 'open');
on('POST', '/api/facilities', async (req, res) => {
  const b = await readBody(req);
  if (b.lat == null || b.lng == null) return json(res, 400, { error: 'lat, lng required' });
  const eid = num(b.event_id) || eventForLocation(num(b.lat), num(b.lng));
  const r = run('INSERT INTO facilities(created_at,updated_at,event_id,lat,lng,kind,name,note,status,device) VALUES(?,?,?,?,?,?,?,?,?,?)',
    now(), now(), eid, num(b.lat), num(b.lng), str(b.kind, 30) || 'other', str(b.name, 120), str(b.note, 160), FAC_STATUS(b.status), dev(b));
  log(req, 'facility', 'facility:' + Number(r.lastInsertRowid), { device: dev(b), detail: str(b.kind, 30), area: str(b.name, 120) || coarse(b.lat, b.lng), event_id: eid });
  json(res, 201, { id: Number(r.lastInsertRowid) });
});
on('POST', '/api/facilities/:id/status', async (req, res, params) => {
  const b = await readBody(req);
  run('UPDATE facilities SET status=?, updated_at=? WHERE id=? AND hidden=0', FAC_STATUS(b.status), now(), params.id);
  json(res, 200, { ok: true });
});

function castVote(req, target_type, id, device, category, value, area, mode = 'relief') {
  run(`INSERT INTO votes(created_at,target_type,target_id,device,category,value) VALUES(?,?,?,?,?,?)
       ON CONFLICT(target_type,target_id,device,category) DO UPDATE SET value=excluded.value, created_at=excluded.created_at`,
    now(), target_type, id, device, category, value);
  log(req, 'vote', target_type + ':' + id, { device, detail: category + '=' + value, area: area || null, mode });
}

on('POST', '/api/reports/:id/vote', async (req, res, params) => {
  const b = await readBody(req);
  const { category, value } = b;
  const ok = (category === 'trust' && ['confirm', 'false'].includes(value)) || (category === 'resolve' && value === 'yes');
  if (!ok) return json(res, 400, { error: 'bad vote' });
  const rep = one('SELECT id,place,mode FROM reports WHERE id=?', params.id);
  if (!rep) return json(res, 404, { error: 'not found' });
  castVote(req, 'report', +params.id, dev(b), category, value, rep.place, rep.mode || 'relief');
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
  log(req, 'adopt', 'report:' + params.id, { device: dev(b), detail: str(b.name, 120), area: rep.place, mode: 'rehab' });
  json(res, 200, { ok: true, adopted_by: str(b.name, 120) });
});

// Community can DISPUTE an adoption ("this isn't actually happening / false claim").
// 2 distinct disputes clear the adoption, sending it back to the unadopted "gap" pool.
on('POST', '/api/reports/:id/dispute', async (req, res, params) => {
  const b = await readBody(req);
  const rep = one('SELECT id,place,adopted_by FROM reports WHERE id=? AND hidden=0', params.id);
  if (!rep) return json(res, 404, { error: 'not found' });
  if (!rep.adopted_by) return json(res, 400, { error: 'not adopted' });
  castVote(req, 'report', +params.id, dev(b), 'dispute', 'yes', rep.place, 'rehab');
  const n = one("SELECT COUNT(DISTINCT device) c FROM votes WHERE target_type='report' AND target_id=? AND category='dispute'", params.id).c;
  if (n >= 2) {
    run('UPDATE reports SET adopted_by=NULL, adopted_at=NULL WHERE id=?', params.id);
    run("DELETE FROM votes WHERE target_type='report' AND target_id=? AND category='dispute'", params.id); // reset so it can be re-adopted cleanly
    log(req, 'dispute_cleared', 'report:' + params.id, { area: rep.place, mode: 'rehab' });
    return json(res, 200, { cleared: true });
  }
  json(res, 200, { cleared: false, disputes: n });
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
// Cookieless, first-party visitor count. Only the app shell counts (not assets/API), and we
// store nothing but a daily mobile/desktop tally - no IP, no cookie, no per-visitor row.
function countView(req, pathname) {
  if (pathname !== '/' && pathname !== '/index.html') return;
  try {
    const mobile = /Mobi|Android|iPhone|iPad|iPod/i.test(req.headers['user-agent'] || '') ? 1 : 0;
    run('INSERT INTO pageviews(day,mobile,n) VALUES(?,?,1) ON CONFLICT(day,mobile) DO UPDATE SET n=n+1', today(), mobile);
  } catch { /* counting must never break page serving */ }
}
// Admin-only: the numbers Google Analytics used to give us, now first-party.
on('GET', '/api/admin/stats', (req, res) => {
  if (!isAdmin(req)) return json(res, 403, { error: 'forbidden' });
  const rows = all('SELECT day, mobile, n FROM pageviews ORDER BY day DESC LIMIT 120');
  const byDay = {}; let m = 0, d = 0;
  for (const r of rows) {
    byDay[r.day] = byDay[r.day] || { day: r.day, mobile: 0, desktop: 0 };
    if (r.mobile) { byDay[r.day].mobile = r.n; m += r.n; } else { byDay[r.day].desktop = r.n; d += r.n; }
  }
  const total = m + d;
  json(res, 200, { total, mobile: m, desktop: d, mobile_pct: total ? Math.round(m / total * 100) : 0,
    days: Object.values(byDay).sort((a, b) => b.day.localeCompare(a.day)) });
});

/* ---- server-rendered event pages (the crawlable SEO surface) + dynamic sitemap ---- */
const htmlEsc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function timeAgo(iso) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 3600) return Math.max(1, Math.round(s / 60)) + 'm ago';
  if (s < 86400) return Math.round(s / 3600) + 'h ago';
  return Math.round(s / 86400) + 'd ago';
}
// Event helplines. Assam keeps its specific set (app falls back to C.HELPLINES); elsewhere show a
// universal emergency line + a family-appropriate one, clearly labelled (per-country is a TODO).
function helplinesFor(ev) {
  if (ev.source === 'assam') return null;
  const hl = [{ label: 'Emergency — 112 (or your local number)', tel: '112' }];
  if (ev.family === 'health') hl.push({ label: 'Health helpline (India 104)', tel: '104' });
  else if (ev.family === 'fire') hl.push({ label: 'Fire (India 101)', tel: '101' });
  else if (['water', 'storm', 'geo'].includes(ev.family)) hl.push({ label: 'Disaster relief (India NDRF)', tel: '18001801551' });
  return hl;
}
// Serve the FULL app (index.html + app.js) scoped to one event by injecting window.EVENT
// before config.js loads. Same battle-tested app, running per-event with its disaster recipe.
async function serveEventApp(req, res, ev) {
  const f = DISASTERS[ev.family] || DISASTERS.water;
  const isAssam = ev.source === 'assam';
  const cfg = {
    id: ev.id, slug: ev.slug, title: ev.title, disaster_type: ev.disaster_type, family: ev.family,
    color: f.color, emoji: f.emoji,
    center: isAssam ? [26.5, 92.9] : [ev.lat, ev.lng],
    zoom: isAssam ? 7 : 9, minZoom: isAssam ? 7 : 5,
    bounds: isAssam ? [[24.0, 89.6], [28.4, 96.1]] : [[ev.lat - 1.4, ev.lng - 1.6], [ev.lat + 1.4, ev.lng + 1.6]],
    official: isAssam, items: ev.needs || [], modules: ev.modules || [],
    offerKinds: f.offerKinds || [], facilityKinds: f.facilityKinds || [], helplines: helplinesFor(ev),
  };
  let html;
  try { html = await readFile(join(FRONTEND, 'index.html'), 'utf8'); } catch { return json(res, 500, { error: 'read failed' }); }
  const inject = '<script>window.EVENT=' + JSON.stringify(cfg).replace(/</g, '\\u003c') + '</script>\n  ';
  html = html
    // served under /e/<slug>, so relative asset URLs (styles.css, app.js…) must resolve from root
    .replace('<head>', '<head>\n  <base href="/">')
    .replace('<script src="config.js"></script>', inject + '<script src="config.js"></script>')
    .replace(/<title>[\s\S]*?<\/title>/, '<title>' + htmlEsc(ev.title + ' — ' + f.label + ' relief coordination · Banpani') + '</title>')
    .replace(/(<meta name="description" content=")[^"]*(")/, '$1' + htmlEsc('Live community relief coordination for ' + ev.title + ' — report needs, offers, blocked roads and photos. No accounts, no money, open to everyone.') + '$2');
  writeBody(req, res, 200, Buffer.from(html), 'text/html; charset=utf-8', 'no-cache');
}

function eventPage(ev) {
  const f = DISASTERS[ev.family] || DISASTERS.water;
  const c = ev.count || { reports: 0, people: 0, confirmations: 0 };
  const title = `${ev.title} — ${f.label} relief coordination · Banpani`;
  const desc = `Live community relief for ${ev.title}: ${c.reports} report(s), ${c.confirmations} confirmed, ~${c.people} people affected. Report needs, confirm them, add photos — no accounts, no money.`;
  const needli = ev.reports.length ? ev.reports.map(r =>
    `<li data-id="${r.id}"><div class="nl-main"><b>${htmlEsc(r.place)}</b>${(r.items && r.items.length) ? ' · <span class="need">' + htmlEsc(r.items.join(', ')) + '</span>' : ''}${r.details ? ' — ' + htmlEsc(r.details) : ''} <span class="t">${timeAgo(r.created_at)}${r.confirmations ? ' · ✅ ' + r.confirmations : ''}</span></div><button class="nl-ok" data-id="${r.id}">✅ Confirm</button></li>`).join('')
    : '<li class="nl-empty">No reports yet — be the first to add a need below.</li>';
  const photostrip = ev.photos.length ? '<div class="pstrip">' + ev.photos.slice(0, 20).map(p => `<a href="${htmlEsc(p.url)}" target="_blank"><img loading="lazy" src="${htmlEsc(p.url)}" alt="${htmlEsc(p.tag || '')}"></a>`).join('') + '</div>' : '';
  const EV = JSON.stringify({
    id: ev.id, slug: ev.slug, family: ev.family, color: f.color, label: f.label, emoji: f.emoji, disaster_type: ev.disaster_type,
    lat: ev.lat, lng: ev.lng, needs: ev.needs,
    reports: ev.reports.map(r => ({ id: r.id, place: r.place, lat: r.lat, lng: r.lng, items: r.items, details: r.details, confirmations: r.confirmations, created_at: r.created_at })),
    photos: ev.photos.map(p => ({ lat: p.lat, lng: p.lng, url: p.url, tag: p.tag })),
    floods: (ev.floods || []).map(x => ({ lat: x.lat, lng: x.lng, severity: x.severity, place: x.place })),
    blocked: (ev.blocked || []).map(x => ({ id: x.id, lat: x.lat, lng: x.lng, label: x.label, kind: x.kind, fresh_min: x.fresh_min })),
    offers: (ev.offers || []).map(o => ({ id: o.id, lat: o.lat, lng: o.lng, kind: o.kind, note: o.note, has_contact: o.has_contact, fresh_min: o.fresh_min })),
    modules: ev.modules,
  }).replace(/</g, '\\u003c');
  return `<!doctype html><html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${htmlEsc(title)}</title>
<meta name="description" content="${htmlEsc(desc)}">
<link rel="canonical" href="https://banpani.org/e/${ev.slug}">
<meta property="og:title" content="${htmlEsc(ev.title)} — ${htmlEsc(f.label)} relief · Banpani">
<meta property="og:description" content="${htmlEsc(desc)}">
<meta property="og:type" content="website"><meta property="og:url" content="https://banpani.org/e/${ev.slug}"><meta property="og:image" content="https://banpani.org/og.png">
<meta name="theme-color" content="#0f1419"><link rel="icon" href="/icon.svg" type="image/svg+xml">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"><link rel="stylesheet" href="/styles.css">
<script async src="https://www.googletagmanager.com/gtag/js?id=G-VHTJ828EM6"></script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','G-VHTJ828EM6');</script>
<style>body{overflow:auto}.wrap{max-width:760px;margin:0 auto;padding:0 16px 80px}
.ehead{border-top:6px solid ${f.color};padding:18px 0 2px}
.ebadge{display:inline-block;background:${f.color};color:#fff;font-weight:700;font-size:12px;padding:4px 11px;border-radius:20px}
.wrap h1{font-size:24px;margin:10px 0 4px}.estat{color:var(--muted);font-size:14px;margin:2px 0 12px}
.ebar{display:flex;gap:8px;flex-wrap:wrap;margin:0 0 14px}
.ebar button,.ebar label,.ebar a{display:inline-flex;align-items:center;gap:6px;font-weight:700;font-size:14px;cursor:pointer;border-radius:11px;padding:11px 16px;border:1px solid var(--line);background:var(--panel2);color:var(--text);text-decoration:none}
.ebar .prim{background:${f.color};border-color:${f.color};color:#fff}
#emap{height:300px;border-radius:14px;border:1px solid var(--line);margin-bottom:16px;background:#0b0f14}
.rlist{list-style:none;padding:0;margin:0}.rlist li{display:flex;gap:10px;align-items:center;padding:11px 2px;border-bottom:1px solid var(--line);font-size:14px;color:#c3cdda;line-height:1.5}
.rlist .nl-main{flex:1}.rlist .need{color:${f.color};font-weight:600}.rlist .t{color:var(--muted);font-size:12px}
.nl-ok{flex:0 0 auto;background:var(--panel2);border:1px solid var(--line);color:var(--muted);border-radius:8px;padding:7px 10px;font-size:12px;font-weight:600;cursor:pointer}
.nl-ok:hover{color:#fff;border-color:${f.color}}.nl-empty{color:var(--muted)}
.pstrip{display:flex;gap:8px;overflow-x:auto;margin:6px 0 4px;padding-bottom:4px}.pstrip img{height:96px;width:96px;object-fit:cover;border-radius:10px;border:1px solid var(--line)}
.esheet{position:fixed;left:0;right:0;bottom:0;z-index:1000;max-width:560px;margin:0 auto;background:var(--panel);border-top:1px solid var(--line);border-radius:18px 18px 0 0;box-shadow:0 -12px 34px rgba(0,0,0,.5);padding:16px 16px calc(16px + env(safe-area-inset-bottom));transform:translateY(115%);transition:transform .34s cubic-bezier(.32,.72,0,1)}
.esheet.show{transform:translateY(0)}.esheet h3{margin:0 0 4px;font-size:15px}.ehint{color:var(--muted);font-size:12.5px;margin:0 0 10px}
.echips{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px}.echips button{background:var(--panel2);border:1px solid var(--line);color:var(--muted);border-radius:16px;padding:7px 11px;font-size:12.5px;font-weight:600;cursor:pointer}.echips button.on{background:${f.color};border-color:${f.color};color:#fff}
.esheet input,.esheet textarea{width:100%;background:var(--panel2);border:1px solid var(--line);color:var(--text);border-radius:10px;padding:11px;margin-bottom:10px;font-size:16px;font-family:inherit}
.erow{display:flex;gap:8px}.erow button{flex:1;font-weight:700;border-radius:11px;padding:12px;border:none;cursor:pointer}.e-go{background:${f.color};color:#fff}.e-x{background:var(--panel2);color:var(--muted);border:1px solid var(--line)}
.etoast{position:fixed;left:50%;bottom:90px;transform:translateX(-50%);z-index:2000;background:#1c2530;color:#fff;padding:10px 16px;border-radius:22px;font-size:13px;opacity:0;pointer-events:none;transition:opacity .25s;box-shadow:var(--shadow)}.etoast.show{opacity:1}
.emoji-pin{font-size:20px;line-height:1;text-align:center;filter:drop-shadow(0 1px 2px rgba(0,0,0,.7))}.emoji-pin.stale{opacity:.5;filter:grayscale(1)}
.leaflet-popup-content .pbtn{background:var(--panel2);border:1px solid var(--line);color:var(--text);border-radius:7px;padding:5px 8px;font-size:11.5px;font-weight:600;cursor:pointer;margin:4px 4px 0 0}
.emuted{color:var(--muted);font-size:13px;margin-top:22px;line-height:1.6}.emuted a{color:var(--accent)}</style></head><body>
<header><img class="logo" src="/icon.svg" width="28" height="28" alt="Banpani"><div><h1 style="font-size:15px;margin:0">Banpani</h1><div class="sub">Coordinating Community Relief</div></div><div class="spacer"></div><a class="link" href="/world">🌍 World map</a></header>
<div class="wrap">
<div class="ehead"><span class="ebadge">${f.emoji} ${htmlEsc(f.label)}</span></div>
<h1>${htmlEsc(ev.title)}</h1>
<p class="estat"><span id="st_r">${c.reports}</span> report(s) · <span id="st_c">${c.confirmations}</span> confirmed · ~<span id="st_p">${c.people}</span> people affected</p>
<div class="ebar">
  <button class="prim" id="ev_addneed">＋ Add a need</button>
  ${ev.modules.includes('blocked') ? '<button id="ev_addblocked">🚧 Blocked road</button>' : ''}
  ${ev.modules.includes('offers') ? '<button id="ev_addoffer">📦 Offer help</button>' : ''}
  ${ev.modules.includes('photos') ? '<label id="ev_photolbl">📷 Photo<input type="file" id="ev_photo" accept="image/*" capture="environment" hidden></label>' : ''}
  <a href="/world">🌍 Map</a>
</div>
<div id="emap"></div>
<h2 style="margin-top:22px">Needs on the ground</h2>
<ul class="rlist" id="needlist">${needli}</ul>
${photostrip}
<p class="emuted">This page is community-powered and updates live. Anyone can add a need or confirm one — no accounts. Banpani never collects money and never shows a victim's phone number publicly. Open source, owned by everyone. <a href="/about.html">About</a> · <a href="/privacy.html">Privacy</a></p>
</div>
<div class="esheet" id="ev_sheet">
  <h3>Add a need here</h3>
  <p class="ehint" id="ev_loc">Tap the map to set the exact spot 📍</p>
  <div class="echips" id="ev_needs"></div>
  <input id="ev_place" maxlength="80" placeholder="Place name (village, area)">
  <textarea id="ev_details" rows="2" maxlength="500" placeholder="Any details (optional)"></textarea>
  <div class="erow"><button class="e-go" id="ev_submit">Post need</button><button class="e-x" id="ev_cancel">Cancel</button></div>
</div>
<div class="esheet" id="bl_sheet">
  <h3>🚧 Mark a blocked road</h3>
  <p class="ehint" id="bl_loc">Tap the map where the road is blocked 📍</p>
  <input id="bl_label" maxlength="160" placeholder="What & where (e.g. Landslide across NH-37)">
  <div class="echips" id="bl_kind"><button type="button" data-k="blocked" class="on">⛔ Fully blocked</button><button type="button" data-k="partial">⚠️ Partly passable</button></div>
  <div class="erow"><button class="e-go" id="bl_submit">Mark blocked</button><button class="e-x" id="bl_cancel">Cancel</button></div>
</div>
<div class="esheet" id="of_sheet">
  <h3>📦 Offer a resource</h3>
  <p class="ehint" id="of_loc">Tap the map where it's available 📍</p>
  <div class="echips" id="of_kind"></div>
  <input id="of_note" maxlength="200" placeholder="Details (e.g. 20 oxygen cylinders, refilling daily)">
  <input id="of_contact" maxlength="60" placeholder="Contact to arrange — kept private, shown only on request">
  <div class="erow"><button class="e-go" id="of_submit">Post offer</button><button class="e-x" id="of_cancel">Cancel</button></div>
</div>
<div class="etoast" id="ev_toast"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>window.EV=${EV};</script>
<script src="/event.js"></script></body></html>`;
}
const eventNotFound = () => `<!doctype html><meta charset="utf-8"><title>Not found · Banpani</title><meta name="viewport" content="width=device-width,initial-scale=1"><body style="font-family:system-ui;background:#0f1419;color:#e7edf2;text-align:center;padding:14vh 20px"><h1>🌊 Nothing here (yet)</h1><p style="color:#9fb0bd">This response may have receded, or the link is old.</p><p><a href="/world" style="color:#4fc3f7">Open the world map →</a></p></body>`;
function sitemapXml() {
  const evs = listEvents().filter(e => e.promoted);
  const urls = [['/', 'hourly', '1.0'], ['/world', 'hourly', '0.9'], ['/about.html', 'weekly', '0.7'], ['/privacy.html', 'monthly', '0.4']]
    .concat(evs.map(e => ['/e/' + e.slug, 'hourly', '0.8']));
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`
    + urls.map(([loc, cf, pr]) => `  <url><loc>https://banpani.org${loc}</loc><changefreq>${cf}</changefreq><priority>${pr}</priority></url>`).join('\n')
    + `\n</urlset>`;
}

const PRETTY = { '/': '/index.html', '/world': '/world.html' };   // clean URLs → files
async function serveStatic(req, res, pathname) {
  countView(req, pathname);
  const full = normalize(join(FRONTEND, PRETTY[pathname] || pathname));
  if (!full.startsWith(FRONTEND)) return json(res, 403, { error: 'forbidden' });
  if (!existsSync(full)) return json(res, 404, { error: 'not found' });
  try {
    const buf = await readFile(full);
    const ext = extname(full), type = MIME[ext] || 'application/octet-stream';
    // code + data revalidate every load (always fresh); images/manifest can cache a day
    const revalidate = ['.html', '.js', '.css', '.json', '.geojson', '.xml', '.txt'].includes(ext);
    writeBody(req, res, 200, buf, type, revalidate ? 'no-cache' : 'public, max-age=86400');
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
    if (url.pathname.startsWith('/uploads/')) {                 // serve uploaded photos
      const name = url.pathname.slice('/uploads/'.length);
      if (!/^[\w.-]+$/.test(name)) return json(res, 403, { error: 'bad name' });
      const full = join(UPLOADS, name);
      if (!existsSync(full)) return json(res, 404, { error: 'not found' });
      const buf = await readFile(full);
      res.writeHead(200, { 'content-type': name.endsWith('.png') ? 'image/png' : 'image/jpeg', 'cache-control': 'public, max-age=604800' });
      return res.end(buf);
    }
    if (url.pathname === '/sitemap.xml') return writeBody(req, res, 200, Buffer.from(sitemapXml()), 'application/xml', 'public, max-age=3600');
    if (url.pathname.startsWith('/e/')) {                        // the FULL app, scoped to one event
      const slug = decodeURIComponent(url.pathname.slice(3)).replace(/\/+$/, '');
      const ev = eventBySlug(slug);
      if (!ev) { res.writeHead(404, { 'content-type': 'text/html; charset=utf-8' }); return res.end(eventNotFound()); }
      return await serveEventApp(req, res, ev);
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
  // Pre-warm official GDACS signals so the world map is populated on first load.
  officialEvents().catch(() => {});
});
