// Events emerge from reports — they are NOT created by anyone. Nearby same-family reports
// are single-link clustered into an event. An event "graduates" (gets its own /e/<slug>
// SEO page) when its SEVERITY-WEIGHTED score clears the bar — reports + confirmations +
// people affected, NOT raw count, so a small but confirmed/severe event isn't invisible.
import { all, decoratedReports } from './db.js';
import { familyOf } from './disasters.js';

const RADIUS_KM = 30;     // single-link cluster radius
const PROMOTE_AT = 3;     // graduation bar on the severity score

const haversine = (a, b) => {
  const toR = x => x * Math.PI / 180;
  const s = Math.sin(toR(b.lat - a.lat) / 2) ** 2 + Math.cos(toR(a.lat)) * Math.cos(toR(b.lat)) * Math.sin(toR(b.lng - a.lng) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(s));
};
export const slugify = s => (String(s || '').toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_]+/g, '-').replace(/-+/g, '-').slice(0, 50) || 'area');

function points() {
  const reports = decoratedReports().filter(r => r.verify_status !== 'false').map(r => ({
    place: r.place, lat: r.lat, lng: r.lng, fam: familyOf(r.disaster_type),
    conf: r.confirmations || 0, people: r.people || 0, details: r.details || '', items: r.items || [],
    created_at: r.created_at, status: r.status,
  }));
  const floods = all("SELECT place,lat,lng,severity,created_at FROM flood_reports WHERE hidden=0 AND severity!='receded'").map(f => ({
    place: f.place || 'Flooded area', lat: f.lat, lng: f.lng, fam: 'water',
    conf: 0, people: 0, details: f.severity ? f.severity + ' water' : '', items: [], created_at: f.created_at, status: 'open',
  }));
  return reports.concat(floods).filter(p => p.lat != null && p.lng != null);
}

function build(fam, members, taken) {
  members.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));   // earliest = stable anchor
  const anchor = members[0], n = members.length;
  const confirmations = members.reduce((s, m) => s + m.conf, 0);
  const people = members.reduce((s, m) => s + (m.people || 0), 0);
  const lat = members.reduce((s, m) => s + m.lat, 0) / n;
  const lng = members.reduce((s, m) => s + m.lng, 0) / n;
  const lastUpdate = members.reduce((mx, m) => (m.created_at > mx ? m.created_at : mx), anchor.created_at);
  const score = n + confirmations * 2 + (people > 50 ? 2 : people > 0 ? 1 : 0);
  let base = slugify(anchor.place) + '-' + fam, slug = base, k = 2;
  while (taken[slug]) slug = base + '-' + (k++);
  taken[slug] = 1;
  return {
    slug, family: fam, title: anchor.place, lat, lng,
    reports: n, confirmations, people, score, promoted: score >= PROMOTE_AT, lastUpdate,
    members: members.map(m => ({ place: m.place, lat: m.lat, lng: m.lng, details: m.details, items: m.items, created_at: m.created_at })),
  };
}

// All events, most-severe first. Pass {light:true} to drop per-member detail (for the map).
export function clusterEvents({ light = false } = {}) {
  const byFam = {};
  for (const p of points()) (byFam[p.fam] ??= []).push(p);
  const events = [], taken = {};
  for (const fam in byFam) {
    const ps = byFam[fam], used = new Array(ps.length).fill(false);
    for (let i = 0; i < ps.length; i++) {
      if (used[i]) continue;
      const cl = [i]; used[i] = true;
      for (let a = 0; a < cl.length; a++) for (let j = 0; j < ps.length; j++) if (!used[j] && haversine(ps[cl[a]], ps[j]) <= RADIUS_KM) { used[j] = true; cl.push(j); }
      events.push(build(fam, cl.map(k => ps[k]), taken));
    }
  }
  events.sort((a, b) => b.score - a.score);
  return light ? events.map(({ members, ...e }) => e) : events;
}

export const findEvent = slug => clusterEvents().find(e => e.slug === slug) || null;
