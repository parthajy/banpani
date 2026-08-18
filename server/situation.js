// Pan-India disaster tracker. One live, filterable picture of what is happening across every state:
//   - community-reported needs (all events, aggregated by state + disaster family)
//   - modelled river flood-risk on India's major rivers (GloFAS, auto)
//   - official multi-hazard alerts - earthquakes, floods, cyclones, droughts, wildfires (GDACS)
//   - active tropical cyclones near India (GDACS)
// Each signal is tagged with a disaster family + state so the page can filter by state / district /
// disaster. Computed on demand from live data - nothing stored, nothing edited by hand.
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decoratedReports, all } from './db.js';
import { getFloodAuto, ASSAM_DISTRICTS } from './flood-auto.js';
import { officialEvents, tropicalCyclones } from './official.js';
import { familyOf, DISASTERS } from './disasters.js';
import { districtOf, inIndia } from './india-geo.js';

const FRONTEND = join(dirname(fileURLToPath(import.meta.url)), '..', 'frontend');
let CAMPS = [];
try { CAMPS = (JSON.parse(readFileSync(join(FRONTEND, 'data', 'relief-camps.json'), 'utf8')).camps) || []; } catch { /* optional */ }

const num = x => (x != null ? Number(x).toLocaleString('en-IN') : null);

export async function trackerData() {
  const signals = [];

  // 1. River flood-risk across India (modelled, auto)
  const fr = getFloodAuto('india');
  if (fr && fr.gauges) for (const g of fr.gauges) {
    if (g.risk !== 'high' && g.risk !== 'medium') continue;
    const dd = districtOf(g.lat, g.lng);
    signals.push({
      family: 'water', kind: 'flood-risk', title: g.station || g.river || 'River', state: g.state || (dd && dd.s),
      district: dd ? dd.d : null, lat: g.lat, lng: g.lng, level: g.risk,
      detail: `${g.river ? g.river + ' · ' : ''}Flow ${num(g.discharge)} m³/s · ${g.pct}th percentile · ${g.trend}`, source: 'GloFAS river model',
    });
  }

  // 2. Official multi-hazard alerts (GDACS), India only
  try {
    for (const o of (await officialEvents())) {
      if (!inIndia(o.lat, o.lng)) continue;
      const dd = districtOf(o.lat, o.lng);
      signals.push({
        family: o.family, kind: 'official', title: o.title, state: dd ? dd.s : null, district: dd ? dd.d : null,
        lat: o.lat, lng: o.lng, level: o.level || 'info', detail: 'Official alert (GDACS)' + (o.date ? ' · ' + o.date : ''),
        source: 'GDACS', url: o.url,
      });
    }
  } catch { /* keep going */ }

  // 3. Tropical cyclones near India
  try {
    for (const c of (await tropicalCyclones())) {
      if (c.lat == null || c.lng == null || c.lat < 0 || c.lat > 40 || c.lng < 55 || c.lng > 100) continue;
      const dd = inIndia(c.lat, c.lng) ? districtOf(c.lat, c.lng) : null;
      signals.push({
        family: 'storm', kind: 'cyclone', title: c.name, state: dd ? dd.s : 'Offshore / sea',
        district: dd ? dd.d : null, lat: c.lat, lng: c.lng, level: c.level || 'info',
        detail: 'Tropical cyclone' + (c.wind != null ? ' · ' + c.wind + ' km/h winds' : ''), source: 'GDACS', url: c.url,
      });
    }
  } catch { /* keep going */ }

  // 4. Community-reported needs (all India events), aggregated by state + family
  const demoIds = new Set(all("SELECT id FROM events WHERE source='demo'").map(e => e.id));   // keep sandbox demos out of the live tracker
  const reports = decoratedReports().filter(r => r.lat != null && r.lng != null && inIndia(r.lat, r.lng) && r.status !== 'resolved' && !demoIds.has(r.event_id));
  const agg = {};
  for (const r of reports) {
    const fam = familyOf(r.disaster_type || 'flood');
    const dd = districtOf(r.lat, r.lng);
    const st = (dd && dd.s) || 'India', di = (dd && dd.d) || null;
    const k = st + '|' + di + '|' + fam;
    const a = agg[k] || (agg[k] = { family: fam, state: st, district: di, count: 0, needs: {}, lat: r.lat, lng: r.lng });
    a.count++;
    for (const it of (r.items || [])) a.needs[it] = (a.needs[it] || 0) + 1;
  }
  for (const k in agg) {
    const a = agg[k];
    const top = Object.entries(a.needs).sort((x, y) => y[1] - x[1]).slice(0, 3).map(e => e[0]).join(', ');
    signals.push({
      family: a.family, kind: 'community', title: `${a.count} open need${a.count > 1 ? 's' : ''}`, state: a.state,
      district: a.district, lat: a.lat, lng: a.lng, level: 'need', detail: top || 'Community-reported', source: 'community',
    });
  }

  // rollups for the filter UI and headline counts
  const rank = { high: 3, red: 3, medium: 2, orange: 2, need: 2, info: 1, green: 1 };
  signals.sort((x, y) => (rank[y.level] || 0) - (rank[x.level] || 0) || String(x.state).localeCompare(String(y.state)));

  const families = {}, states = {};
  for (const s of signals) {
    families[s.family] = (families[s.family] || 0) + 1;
    if (s.state) states[s.state] = (states[s.state] || 0) + 1;
  }
  const famList = Object.keys(families).map(k => ({ key: k, label: (DISASTERS[k] || {}).label || k, emoji: (DISASTERS[k] || {}).emoji || '•', color: (DISASTERS[k] || {}).color || '#888', count: families[k] }))
    .sort((a, b) => b.count - a.count);
  const stateList = Object.keys(states).sort();

  return {
    updated: (fr && fr.updated) || null,
    totals: { signals: signals.length, states: stateList.length, communityNeeds: reports.length, floodRisk: signals.filter(s => s.kind === 'flood-risk').length },
    families: famList, states: stateList, signals,
  };
}

// Kept for the older Assam-only district view (internal). The pan-India tracker above is the /status page.
export function situationFor(eventId) {
  const reports = decoratedReports().filter(r => r.event_id === eventId);
  const live = getFloodAuto('assam') || {};
  const risk = live.districts || {};
  const dist = {};
  const ensure = name => (dist[name] || (dist[name] = { district: name, open: 0, resolved: 0, reports: 0, needs: {}, camps: 0, people: 0, risk: risk[name] || null }));
  const nearest = (lat, lng) => { let b = null, bd = Infinity; for (const p of ASSAM_DISTRICTS) { const dl = lat - p.lat, dn = (lng - p.lng) * Math.cos(lat * Math.PI / 180), d = dl * dl + dn * dn; if (d < bd) { bd = d; b = p; } } return b; };
  for (const r of reports) { if (r.lat == null) continue; const p = nearest(r.lat, r.lng); if (!p) continue; const e = ensure(p.d); e.reports++; if (r.status === 'resolved') e.resolved++; else e.open++; for (const it of (r.items || [])) e.needs[it] = (e.needs[it] || 0) + 1; }
  for (const c of CAMPS) { if (c.lat == null) continue; const p = nearest(c.lat, c.lng); if (!p) continue; const e = ensure(p.d); e.camps += (c.camps || 0); e.people += (c.people || 0); }
  for (const name of Object.keys(risk)) ensure(name);
  const rank = { high: 2, medium: 1 };
  const districts = Object.values(dist).map(e => ({ district: e.district, risk: e.risk, open: e.open, resolved: e.resolved, reports: e.reports, camps: e.camps, people: e.people, topNeeds: Object.entries(e.needs).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([item, count]) => ({ item, count })), gap: !!e.risk && e.reports === 0 })).sort((a, b) => (rank[b.risk] || 0) - (rank[a.risk] || 0) || b.open - a.open || b.reports - a.reports);
  return { updated: live.updated || null, districts };
}
