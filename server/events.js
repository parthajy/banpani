// Events are FIRST-CLASS and persisted (see schema.sql `events`). Every coordination row
// carries event_id. A report creates-or-joins an event, so every place with activity has a
// live coordination space immediately - no waiting to "graduate" (graduation only affects
// SEO/discovery via `promoted`). Each event enables a recipe of modules per disaster family.
import { all, one, run, now, decoratedReports } from './db.js';
import { familyOf, DISASTERS, TYPE_NEEDS } from './disasters.js';

export const slugify = s => (String(s || '').toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_]+/g, '-').replace(/-+/g, '-').slice(0, 50) || 'area');
const haversine = (aLat, aLng, bLat, bLng) => {
  const toR = x => x * Math.PI / 180;
  const s = Math.sin(toR(bLat - aLat) / 2) ** 2 + Math.cos(toR(aLat)) * Math.cos(toR(bLat)) * Math.sin(toR(bLng - aLng) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(s));
};
const ASSAM = { s: 24.0, w: 89.6, n: 28.4, e: 96.1 };
const inAssam = (lat, lng) => lat >= ASSAM.s && lat <= ASSAM.n && lng >= ASSAM.w && lng <= ASSAM.e;
const assamId = () => one("SELECT id FROM events WHERE slug='assam-floods-2026'")?.id || null;

// The module recipe per family - which coordination modules an event turns on. (6a implements
// `needs` + `photos`; the rest are declared now and light up in later increments.)
// Only BUILT modules: needs · offers · convoys · dropoffs · blocked · facilities · hazard · photos · gaps.
// (Shelters/evac-centres are surfaced via the Facilities module; search-&-rescue via needs.)
export const RECIPES = {
  water:   ['needs', 'offers', 'convoys', 'dropoffs', 'blocked', 'facilities', 'hazard', 'evac', 'photos', 'gaps'],
  fire:    ['needs', 'offers', 'facilities', 'hazard', 'evac', 'photos', 'gaps'],
  storm:   ['needs', 'offers', 'convoys', 'dropoffs', 'facilities', 'hazard', 'evac', 'photos', 'gaps'],
  geo:     ['needs', 'offers', 'blocked', 'facilities', 'hazard', 'photos', 'gaps'],
  climate: ['needs', 'offers', 'facilities', 'photos'],
  health:  ['needs', 'offers', 'facilities', 'photos'],
  tech:    ['needs', 'offers', 'facilities', 'hazard', 'photos'],
  infra:   ['needs', 'offers', 'blocked', 'facilities', 'hazard', 'photos'],
  agri:    ['needs', 'offers', 'facilities', 'hazard', 'photos'],
};

function counts(eventId) {
  const r = one('SELECT COUNT(*) n, COALESCE(SUM(people),0) p FROM reports WHERE hidden=0 AND event_id=?', eventId);
  const fr = one("SELECT COUNT(*) n FROM flood_reports WHERE hidden=0 AND severity!='receded' AND event_id=?", eventId);
  const conf = one("SELECT COUNT(*) n FROM votes v JOIN reports r ON v.target_id=r.id WHERE v.target_type='report' AND v.category='trust' AND v.value='confirm' AND r.event_id=?", eventId);
  return { reports: (r?.n || 0) + (fr?.n || 0), people: r?.p || 0, confirmations: conf?.n || 0 };
}

/* ------------------------- event lifecycle -------------------------
   A response is ACTIVE while a disaster is happening. It winds down in one of two ways:
   - the community votes it is over (100 different people) -> ARCHIVED immediately, or
   - it goes 45 days with no new activity -> DORMANT (auto-stopped).
   A DORMANT response can be REOPENED by 10 people within 15 days (or by a fresh report on the spot);
   after that window it becomes ARCHIVED. Nothing is ever deleted - archived pages stay as a record. */
const DAY = 864e5;
export const LIFECYCLE = { DORMANT_AFTER_DAYS: 45, REOPEN_WINDOW_DAYS: 15, OVER_VOTES: 100, REOPEN_VOTES: 10 };
const PERMANENT = "(source IN ('assam','demo','seeded'))";   // flagship + demos + operator-seeded never auto-wind-down

// Most recent activity across every table that signals a live response.
export function lastActivityAt(eventId) {
  let best = null;
  for (const t of ['reports', 'flood_reports', 'offers', 'blocked_roads', 'facilities', 'evac_routes', 'photos', 'routes', 'collection_points']) {
    const m = one(`SELECT MAX(created_at) m FROM ${t} WHERE event_id=?`, eventId)?.m;
    if (m && (!best || m > best)) best = m;
  }
  return best;
}
const overVotes = id => one("SELECT COUNT(DISTINCT device) c FROM votes WHERE target_type='event' AND target_id=? AND category='over'", id)?.c || 0;
const reopenVotes = id => one("SELECT COUNT(DISTINCT device) c FROM votes WHERE target_type='event' AND target_id=? AND category='reopen'", id)?.c || 0;

// Run periodically (on boot + every few hours): stop idle events, archive dormant ones past the window.
export function sweepLifecycle() {
  const nowMs = Date.now();
  for (const e of all(`SELECT id,created_at FROM events WHERE hidden=0 AND status='active' AND NOT ${PERMANENT}`)) {
    const last = lastActivityAt(e.id) || e.created_at;
    if (nowMs - new Date(last).getTime() > LIFECYCLE.DORMANT_AFTER_DAYS * DAY)
      run("UPDATE events SET status='dormant', dormant_at=? WHERE id=?", now(), e.id);
  }
  for (const e of all("SELECT id,dormant_at FROM events WHERE hidden=0 AND status='dormant'")) {
    const d = e.dormant_at ? new Date(e.dormant_at).getTime() : nowMs;
    if (nowMs - d > LIFECYCLE.REOPEN_WINDOW_DAYS * DAY)
      run("UPDATE events SET status='archived', archived_at=? WHERE id=?", now(), e.id);
  }
}

// Community vote that a response is over. 100 distinct devices -> archived now. Returns {archived, votes}.
export function voteOver(eventId, device) {
  const e = one("SELECT id,source,status FROM events WHERE id=? AND hidden=0", eventId);
  if (!e || e.source === 'assam' || e.source === 'demo' || e.status === 'archived') return { ok: false };
  run(`INSERT INTO votes(created_at,target_type,target_id,device,category,value) VALUES(?,?,?,?,?,?)
       ON CONFLICT(target_type,target_id,device,category) DO NOTHING`, now(), 'event', eventId, device, 'over', 'yes');
  const votes = overVotes(eventId);
  if (votes >= LIFECYCLE.OVER_VOTES) { run("UPDATE events SET status='archived', archived_at=? WHERE id=?", now(), eventId); return { ok: true, archived: true, votes }; }
  return { ok: true, archived: false, votes, need: LIFECYCLE.OVER_VOTES };
}

// Community vote to reopen a dormant response. 10 distinct devices -> active. Returns {reopened, votes}.
export function voteReopen(eventId, device) {
  const e = one("SELECT id,status FROM events WHERE id=? AND hidden=0", eventId);
  if (!e || e.status !== 'dormant') return { ok: false };
  run(`INSERT INTO votes(created_at,target_type,target_id,device,category,value) VALUES(?,?,?,?,?,?)
       ON CONFLICT(target_type,target_id,device,category) DO NOTHING`, now(), 'event', eventId, device, 'reopen', 'yes');
  const votes = reopenVotes(eventId);
  if (votes >= LIFECYCLE.REOPEN_VOTES) { run("UPDATE events SET status='active', dormant_at=NULL WHERE id=?", eventId); return { ok: true, reopened: true, votes }; }
  return { ok: true, reopened: false, votes, need: LIFECYCLE.REOPEN_VOTES };
}

// Persisted events for the world map: ACTIVE and DORMANT (winding down), never ARCHIVED.
export function listEvents() {
  return all("SELECT * FROM events WHERE hidden=0 AND status IN ('active','dormant')").map(e => {
    const c = counts(e.id);
    const score = c.reports + c.confirmations * 2 + (c.people > 50 ? 2 : c.people > 0 ? 1 : 0);
    // "earned its place" = listed, or has a 2nd report / a confirmation. Everything else is shown
    // too, but flagged UNCONFIRMED so the world map can render it faded - a first report must be
    // visible immediately (that's the whole promise), while spam is held back by the per-device
    // create rate-limit and community flag-to-hide, not by hiding genuine reports.
    const active = !!e.listed || c.reports >= 2 || c.confirmations >= 1;
    return {
      slug: e.slug, title: e.title, family: familyOf(e.disaster_type), disaster_type: e.disaster_type,
      lat: e.lat, lng: e.lng, source: e.source, modules: JSON.parse(e.modules || '[]'), listed: !!e.listed,
      reports: c.reports, people: c.people, confirmations: c.confirmations, score,
      // Our hand-built flagship responses (Assam, seeded events like Odisha) are always SEO-worthy,
      // so they belong in the sitemap even before community activity pushes their score up.
      promoted: e.source !== 'demo' && (score >= 3 || e.source === 'assam' || e.source === 'seeded'),
      unconfirmed: !active, status: e.status, reopenVotes: e.status === 'dormant' ? reopenVotes(e.id) : 0,
    };
  });
}

// The full public archive: every response, past and present, newest-first. Nothing is deleted.
export function archiveList() {
  return all('SELECT * FROM events WHERE hidden=0 ORDER BY COALESCE(archived_at, dormant_at, created_at) DESC').map(e => {
    const c = counts(e.id);
    const last = lastActivityAt(e.id) || e.created_at;
    return {
      slug: e.slug, title: e.title, family: familyOf(e.disaster_type), disaster_type: e.disaster_type,
      lat: e.lat, lng: e.lng, source: e.source, status: e.status,
      reports: c.reports, people: c.people, confirmations: c.confirmations,
      created_at: e.created_at, last_activity: last, dormant_at: e.dormant_at || null, archived_at: e.archived_at || null,
    };
  });
}

// A single event with its scoped coordination data (for the /e/<slug> page).
export function eventBySlug(slug) {
  const e = one('SELECT * FROM events WHERE slug=? AND hidden=0', slug);
  if (!e) return null;
  const reports = decoratedReports().filter(r => r.event_id === e.id && r.verify_status !== 'false')
    .map(({ contact, device, ...r }) => ({ ...r, has_contact: !!contact }));
  const photos = all('SELECT id,lat,lng,tag,mode,caption,file,created_at FROM photos WHERE hidden=0 AND event_id=? ORDER BY id DESC LIMIT 100', e.id)
    .map(p => ({ ...p, url: '/uploads/' + p.file, file: undefined }));
  const floods = all("SELECT place,lat,lng,severity FROM flood_reports WHERE hidden=0 AND severity!='receded' AND event_id=? ORDER BY id DESC LIMIT 200", e.id);
  const nowMs = Date.now();
  const blocked = all("SELECT id,lat,lng,label,kind,updated_at FROM blocked_roads WHERE hidden=0 AND status='blocked' AND event_id=? ORDER BY id DESC LIMIT 200", e.id)
    .map(x => ({ ...x, fresh_min: Math.round((nowMs - new Date(x.updated_at).getTime()) / 60000) }));
  const offers = all("SELECT id,lat,lng,kind,note,contact,updated_at FROM offers WHERE hidden=0 AND status='available' AND event_id=? ORDER BY id DESC LIMIT 200", e.id)
    .map(({ contact, ...o }) => ({ ...o, has_contact: !!contact, fresh_min: Math.round((nowMs - new Date(o.updated_at).getTime()) / 60000) }));
  const c = counts(e.id);
  return {
    id: e.id, slug: e.slug, title: e.title, disaster_type: e.disaster_type, family: familyOf(e.disaster_type),
    lat: e.lat, lng: e.lng, source: e.source, modules: JSON.parse(e.modules || '[]'), created_at: e.created_at,
    status: e.status, dormant_at: e.dormant_at || null, archived_at: e.archived_at || null,
    reopenVotes: e.status === 'dormant' ? reopenVotes(e.id) : 0,
    reports, photos, floods, blocked, offers, count: c, needs: TYPE_NEEDS[e.disaster_type] || DISASTERS[familyOf(e.disaster_type)]?.needs || [],
  };
}

// Attach a report to an event: Assam flood → Assam event; else nearest same-family event
// within its radius; else create a new event (recipe from family). Returns event_id.
export function createOrJoinEvent(lat, lng, disasterType, place, device) {
  const fam = familyOf(disasterType);
  if (fam === 'water' && lat != null && inAssam(lat, lng)) { const a = assamId(); if (a) return a; }
  // a fresh report reactivates a dormant response on the spot (clear signal it is still happening)
  const join = id => { run("UPDATE events SET status='active', dormant_at=NULL WHERE id=? AND status='dormant'", id); return id; };
  if (lat != null && lng != null) {
    const cands = all("SELECT id,lat,lng,radius_km,disaster_type FROM events WHERE hidden=0 AND status IN ('active','dormant') AND lat IS NOT NULL").filter(e => familyOf(e.disaster_type) === fam);
    let best = null, bestD = Infinity;
    for (const e of cands) { const d = haversine(lat, lng, e.lat, e.lng); if (d <= (e.radius_km || 30) && d < bestD) { best = e; bestD = d; } }
    if (best) return join(best.id);
  }
  // Rate-limit: a single device can only spin up so many brand-new events per day. Past the cap we
  // attach to the nearest same-family event of ANY distance rather than let one device flood the map
  // with fresh pins. Soft by design - real reports still land, they just join an existing response.
  if (device) {
    const cutoff = new Date(Date.now() - 864e5).toISOString();
    const madeToday = one('SELECT COUNT(*) c FROM events WHERE created_by=? AND created_at > ?', device, cutoff)?.c || 0;
    if (madeToday >= 8 && lat != null && lng != null) {
      const cands = all("SELECT id,lat,lng,disaster_type FROM events WHERE hidden=0 AND status IN ('active','dormant') AND lat IS NOT NULL").filter(e => familyOf(e.disaster_type) === fam);
      let best = null, bestD = Infinity;
      for (const e of cands) { const d = haversine(lat, lng, e.lat, e.lng); if (d < bestD) { best = e; bestD = d; } }
      if (best) return join(best.id);
    }
  }
  const title = (place && place.trim()) ? place.trim() : (DISASTERS[fam]?.label || 'Response');
  let base = slugify(title) + '-' + fam, slug = base, k = 2;
  while (one('SELECT 1 FROM events WHERE slug=?', slug)) slug = base + '-' + (k++);
  // Spam control: a brand-new community event is UNLISTED (link-only) until it gains real
  // activity - listEvents() surfaces it on the world map once it has ≥2 reports or a confirmation.
  const r = run(`INSERT INTO events(created_at,slug,title,disaster_type,lat,lng,radius_km,modules,source,created_by,listed,status)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`, now(), slug, title, disasterType || fam, lat, lng, 30,
    JSON.stringify(RECIPES[fam] || ['needs', 'photos']), 'community', device || null, 0, 'active');
  pingIndexNow('https://banpani.org/e/' + slug);   // automatic fast indexing the moment a disaster spins up an event
  return Number(r.lastInsertRowid);
}

// IndexNow: tell Bing/Yandex/others to crawl a new URL immediately (free, no Google equivalent - Google
// discovers via the sitemap + links). Fire-and-forget; never blocks or throws.
const INDEXNOW_KEY = '52f38b48dff15b5759cc15fedace2c90';
export function pingIndexNow(url) {
  try {
    fetch(`https://api.indexnow.org/indexnow?url=${encodeURIComponent(url)}&key=${INDEXNOW_KEY}&keyLocation=https://banpani.org/${INDEXNOW_KEY}.txt`,
      { signal: AbortSignal.timeout(6000) }).catch(() => {});
  } catch { /* never let indexing break a report */ }
}

// Lighter lookup for rows without a disaster_type (photos, routes, drop-offs): nearest event.
export function eventForLocation(lat, lng) {
  if (lat == null || lng == null) return null;
  if (inAssam(lat, lng)) { const a = assamId(); if (a) return a; }
  let best = null, bestD = Infinity;
  for (const e of all("SELECT id,lat,lng,radius_km FROM events WHERE hidden=0 AND status='active' AND lat IS NOT NULL")) {
    const d = haversine(lat, lng, e.lat, e.lng); if (d <= (e.radius_km || 30) && d < bestD) { best = e; bestD = d; }
  }
  return best ? best.id : null;
}
