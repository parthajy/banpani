// The 6-hour situation report. Two jobs:
//  1) buildReport() - live JSON, served at GET /api/report and used by the map's "uncovered" pane.
//  2) run as a script (cron, every 6h) - writes a public static HTML snapshot to frontend/report.html
//     so there is an accountable, shareable record of what was still unverified / uncovered.
//
//   Cron:  0 */6 * * *  node --experimental-sqlite /path/server/report.js

import { all, now, decoratedReports } from './db.js';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const GAP_RADIUS_KM = 6;   // an open need is "covered" if an active convoy heads within this, carrying a shared item

function haversine(aLat, aLng, bLat, bLng) {
  const R = 6371, toR = x => x * Math.PI / 180;
  const dLat = toR(bLat - aLat), dLng = toR(bLng - aLng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toR(aLat)) * Math.cos(toR(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}
const hoursSince = iso => (Date.now() - new Date(iso).getTime()) / 3.6e6;

export function coverageOf(need, activeRoutes) {
  const items = need.items || [];
  let best = null;
  for (const r of activeRoutes) {
    const rItems = JSON.parse(r.items || '[]');
    const d = haversine(need.lat, need.lng, r.lat, r.lng);
    if (d <= GAP_RADIUS_KM && rItems.some(i => items.includes(i))) {
      if (!best || d < best.dist) best = { route: r.name, dist: +d.toFixed(1) };
    }
  }
  return best; // null => nobody coming
}

export function buildReport() {
  const reports = decoratedReports().filter(r => r.verify_status !== 'false'); // consensus-derived
  const activeRoutes = all("SELECT * FROM routes WHERE hidden=0 AND status='active'");
  const ngos = all('SELECT COUNT(*) c FROM ngos WHERE hidden=0')[0].c;

  const open = reports.filter(r => r.status !== 'resolved');
  const unverified = reports.filter(r => r.verify_status === 'unverified' && r.status !== 'resolved');

  // GAPS: a need that is real enough to act on (not marked false/duplicate) with NOBODY inbound.
  const gaps = open
    .filter(r => !['false', 'duplicate'].includes(r.verify_status))
    .map(r => ({ ...r, coverage: coverageOf(r, activeRoutes), age_h: +hoursSince(r.created_at).toFixed(1) }))
    .filter(r => !r.coverage)
    // priority = people affected weighted by how long they've waited
    .map(r => ({ ...r, priority: (r.people || 20) * (1 + r.age_h / 24) }))
    .sort((a, b) => b.priority - a.priority);

  const dayKey = iso => iso.slice(0, 10);
  const todayKey = now().slice(0, 10);
  const yesterdayKey = new Date(Date.now() - 864e5).toISOString().slice(0, 10);

  return {
    generated_at: now(),
    window_hours: 6,
    totals: {
      needs_open: open.length,
      unverified: unverified.length,
      confirmed: reports.filter(r => r.verify_status === 'confirmed').length,
      gaps: gaps.length,
      routes_active: activeRoutes.length,
      ngos,
      covered_today: activeRoutes.filter(r => dayKey(r.covered_date || r.created_at) === todayKey).length,
      covered_yesterday: activeRoutes.filter(r => dayKey(r.covered_date || r.created_at) === yesterdayKey).length,
    },
    // the two lists that demand human attention:
    unverified: unverified.map(slim),
    gaps: gaps.map(g => ({ ...slim(g), age_h: g.age_h, people: g.people })),
  };
}

// note: victim contact is deliberately NOT included - it stays private.
const slim = r => ({ id: r.id, place: r.place, lat: r.lat, lng: r.lng,
  items: r.items || [], people: r.people, confirmations: r.confirmations,
  verify_status: r.verify_status, created_at: r.created_at });

/* ------------------------- static HTML snapshot ------------------------- */
function reportHtml(rep) {
  const esc = s => String(s ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const t = rep.totals;
  const row = r => `<tr><td>${esc(r.place)}</td><td>${(r.items || []).map(esc).join(', ')}</td>
    <td>${r.people ?? '-'}</td><td>${r.age_h != null ? r.age_h + 'h' : ''}</td>
    <td>${r.confirmations ?? 0}</td></tr>`;
  return `<!doctype html><meta charset="utf-8"><title>Banpani - situation report</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{font:15px/1.5 system-ui;max-width:900px;margin:24px auto;padding:0 16px;color:#111}
h1{margin:0}small{color:#666}table{width:100%;border-collapse:collapse;margin:12px 0 28px}
th,td{text-align:left;padding:7px 9px;border-bottom:1px solid #eee;font-size:14px}
th{background:#fafafa}.k{display:inline-block;background:#f2f4f7;border-radius:8px;padding:6px 12px;margin:4px 6px 4px 0}
.gap{color:#c0392b;font-weight:700}.warn{background:#fdecea;border:1px solid #f5b7b1;padding:12px;border-radius:10px}</style>
<h1>🛟 Banpani - Situation Report</h1>
<small>Auto-generated ${esc(rep.generated_at)} · covers a rolling ${rep.window_hours}h window · banpani.org</small>
<p><span class="k">Open needs: <b>${t.needs_open}</b></span><span class="k">Unverified: <b>${t.unverified}</b></span>
<span class="k gap">Coverage gaps: <b>${t.gaps}</b></span><span class="k">Active convoys: <b>${t.routes_active}</b></span>
<span class="k">Covered today: <b>${t.covered_today}</b></span><span class="k">NGOs listed: <b>${t.ngos}</b></span></p>
<div class="warn"><b>⚠ ${t.gaps} area(s) have nobody heading to them.</b> These are the priority - please help verify and route relief.</div>
<h2>Coverage gaps - nobody inbound</h2>
<table><tr><th>Place</th><th>Needs</th><th>People</th><th>Waiting</th><th>Confirms</th></tr>
${rep.gaps.map(row).join('') || '<tr><td colspan=5>None right now 🙏</td></tr>'}</table>
<h2>Unverified reports - need the community to confirm</h2>
<table><tr><th>Place</th><th>Needs</th><th>People</th><th>Age</th><th>Confirms</th></tr>
${rep.unverified.map(r => row({ ...r, age_h: +((Date.now() - new Date(r.created_at)) / 3.6e6).toFixed(1) })).join('') || '<tr><td colspan=5>All caught up 🙏</td></tr>'}</table>
<p><a href="/">← Back to the live map</a></p>`;
}

// run directly → write the static snapshot
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'frontend', 'report.html');
  const rep = buildReport();
  writeFileSync(out, reportHtml(rep));
  console.log(`Wrote report → ${out}  (gaps: ${rep.totals.gaps}, unverified: ${rep.totals.unverified})`);
}
