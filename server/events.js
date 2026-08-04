// Events are FIRST-CLASS and persisted (see schema.sql `events`). Every coordination row
// carries event_id. A report creates-or-joins an event, so every place with activity has a
// live coordination space immediately — no waiting to "graduate" (graduation only affects
// SEO/discovery via `promoted`). Each event enables a recipe of modules per disaster family.
import { all, one, run, now, decoratedReports } from './db.js';
import { familyOf, DISASTERS } from './disasters.js';

export const slugify = s => (String(s || '').toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_]+/g, '-').replace(/-+/g, '-').slice(0, 50) || 'area');
const haversine = (aLat, aLng, bLat, bLng) => {
  const toR = x => x * Math.PI / 180;
  const s = Math.sin(toR(bLat - aLat) / 2) ** 2 + Math.cos(toR(aLat)) * Math.cos(toR(bLat)) * Math.sin(toR(bLng - aLng) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(s));
};
const ASSAM = { s: 24.0, w: 89.6, n: 28.4, e: 96.1 };
const inAssam = (lat, lng) => lat >= ASSAM.s && lat <= ASSAM.n && lng >= ASSAM.w && lng <= ASSAM.e;
const assamId = () => one("SELECT id FROM events WHERE slug='assam-floods-2026'")?.id || null;

// The module recipe per family — which coordination modules an event turns on. (6a implements
// `needs` + `photos`; the rest are declared now and light up in later increments.)
// Only BUILT modules: needs · offers · convoys · dropoffs · blocked · facilities · hazard · photos · gaps.
// (Shelters/evac-centres are surfaced via the Facilities module; search-&-rescue via needs.)
export const RECIPES = {
  water:   ['needs', 'offers', 'convoys', 'dropoffs', 'blocked', 'facilities', 'hazard', 'photos', 'gaps'],
  fire:    ['needs', 'offers', 'facilities', 'photos', 'gaps'],
  storm:   ['needs', 'offers', 'convoys', 'dropoffs', 'facilities', 'photos', 'gaps'],
  geo:     ['needs', 'offers', 'blocked', 'facilities', 'photos', 'gaps'],
  climate: ['needs', 'offers', 'facilities', 'photos'],
  health:  ['needs', 'offers', 'facilities', 'photos'],
  tech:    ['needs', 'offers', 'facilities', 'photos'],
  infra:   ['needs', 'offers', 'blocked', 'facilities', 'photos'],
  agri:    ['needs', 'offers', 'facilities', 'photos'],
};

function counts(eventId) {
  const r = one('SELECT COUNT(*) n, COALESCE(SUM(people),0) p FROM reports WHERE hidden=0 AND event_id=?', eventId);
  const fr = one("SELECT COUNT(*) n FROM flood_reports WHERE hidden=0 AND severity!='receded' AND event_id=?", eventId);
  const conf = one("SELECT COUNT(*) n FROM votes v JOIN reports r ON v.target_id=r.id WHERE v.target_type='report' AND v.category='trust' AND v.value='confirm' AND r.event_id=?", eventId);
  return { reports: (r?.n || 0) + (fr?.n || 0), people: r?.p || 0, confirmations: conf?.n || 0 };
}

// Persisted events for the world map, with live counts + a promoted flag (SEO/discovery only).
export function listEvents() {
  return all("SELECT * FROM events WHERE hidden=0 AND status='active'").map(e => {
    const c = counts(e.id);
    const score = c.reports + c.confirmations * 2 + (c.people > 50 ? 2 : c.people > 0 ? 1 : 0);
    return {
      slug: e.slug, title: e.title, family: familyOf(e.disaster_type), disaster_type: e.disaster_type,
      lat: e.lat, lng: e.lng, source: e.source, modules: JSON.parse(e.modules || '[]'),
      reports: c.reports, people: c.people, confirmations: c.confirmations, score, promoted: score >= 3,
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
    reports, photos, floods, blocked, offers, count: c, needs: DISASTERS[familyOf(e.disaster_type)]?.needs || [],
  };
}

// Attach a report to an event: Assam flood → Assam event; else nearest same-family event
// within its radius; else create a new event (recipe from family). Returns event_id.
export function createOrJoinEvent(lat, lng, disasterType, place, device) {
  const fam = familyOf(disasterType);
  if (fam === 'water' && lat != null && inAssam(lat, lng)) { const a = assamId(); if (a) return a; }
  if (lat != null && lng != null) {
    const cands = all("SELECT id,lat,lng,radius_km,disaster_type FROM events WHERE hidden=0 AND status='active' AND lat IS NOT NULL").filter(e => familyOf(e.disaster_type) === fam);
    let best = null, bestD = Infinity;
    for (const e of cands) { const d = haversine(lat, lng, e.lat, e.lng); if (d <= (e.radius_km || 30) && d < bestD) { best = e; bestD = d; } }
    if (best) return best.id;
  }
  const title = (place && place.trim()) ? place.trim() : (DISASTERS[fam]?.label || 'Response');
  let base = slugify(title) + '-' + fam, slug = base, k = 2;
  while (one('SELECT 1 FROM events WHERE slug=?', slug)) slug = base + '-' + (k++);
  const r = run(`INSERT INTO events(created_at,slug,title,disaster_type,lat,lng,radius_km,modules,source,created_by,listed,status)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`, now(), slug, title, disasterType || fam, lat, lng, 30,
    JSON.stringify(RECIPES[fam] || ['needs', 'photos']), 'community', device || null, 1, 'active');
  return Number(r.lastInsertRowid);
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
