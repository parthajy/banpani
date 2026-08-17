// District situation rollup for a flood event: aggregates community reports + the auto flood-risk feed
// + official relief-camp totals into a per-district picture. One view that serves the affected (where are
// camps / where is help), volunteers + NGOs (where the open needs and gaps are) and government (ground
// truth vs official). Computed on demand from live data - nothing stored, nothing edited by hand.
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decoratedReports } from './db.js';
import { getFloodAuto, ASSAM_DISTRICTS } from './flood-auto.js';

const FRONTEND = join(dirname(fileURLToPath(import.meta.url)), '..', 'frontend');
let CAMPS = [];
try { CAMPS = (JSON.parse(readFileSync(join(FRONTEND, 'data', 'relief-camps.json'), 'utf8')).camps) || []; } catch { /* optional */ }

// nearest district centroid (equirectangular approximation - fine at state scale)
function nearest(lat, lng, pts) {
  let best = null, bd = Infinity;
  for (const p of pts) {
    const dlat = lat - p.lat, dlng = (lng - p.lng) * Math.cos(lat * Math.PI / 180);
    const d = dlat * dlat + dlng * dlng;
    if (d < bd) { bd = d; best = p; }
  }
  return best;
}

export function situationFor(eventId) {
  const reports = decoratedReports().filter(r => r.event_id === eventId);
  const live = getFloodAuto('assam') || {};
  const risk = live.districts || {};
  const dist = {};
  const ensure = name => (dist[name] || (dist[name] = { district: name, open: 0, resolved: 0, reports: 0, needs: {}, camps: 0, people: 0, risk: risk[name] || null }));

  for (const r of reports) {
    if (r.lat == null || r.lng == null) continue;
    const p = nearest(r.lat, r.lng, ASSAM_DISTRICTS); if (!p) continue;
    const e = ensure(p.d); e.reports++;
    if (r.status === 'resolved') e.resolved++; else e.open++;
    for (const it of (r.items || [])) e.needs[it] = (e.needs[it] || 0) + 1;
  }
  for (const c of CAMPS) {   // official camp totals -> nearest district centroid (robust to name spellings)
    if (c.lat == null || c.lng == null) continue;
    const p = nearest(c.lat, c.lng, ASSAM_DISTRICTS); if (!p) continue;
    const e = ensure(p.d); e.camps += (c.camps || 0); e.people += (c.people || 0);
  }
  for (const name of Object.keys(risk)) ensure(name);   // a district at risk with 0 reports is a gap to watch

  const rank = { high: 2, medium: 1 };
  const districts = Object.values(dist).map(e => ({
    district: e.district, risk: e.risk, open: e.open, resolved: e.resolved, reports: e.reports,
    camps: e.camps, people: e.people,
    topNeeds: Object.entries(e.needs).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([item, count]) => ({ item, count })),
    gap: !!e.risk && e.reports === 0,
  })).sort((a, b) => (rank[b.risk] || 0) - (rank[a.risk] || 0) || b.open - a.open || b.reports - a.reports);

  const needAll = {};
  for (const e of Object.values(dist)) for (const [k, v] of Object.entries(e.needs)) needAll[k] = (needAll[k] || 0) + v;
  const topNeeds = Object.entries(needAll).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([item, count]) => ({ item, count }));

  const totals = {
    openNeeds: districts.reduce((s, d) => s + d.open, 0),
    resolved: districts.reduce((s, d) => s + d.resolved, 0),
    districtsAffected: districts.filter(d => d.reports > 0).length,
    highRisk: districts.filter(d => d.risk === 'high').length,
    camps: districts.reduce((s, d) => s + d.camps, 0),
    peopleInCamps: districts.reduce((s, d) => s + d.people, 0),
    gaps: districts.filter(d => d.gap).length,
  };
  return { updated: live.updated || null, riskNote: live.note || null, totals, topNeeds, districts };
}
