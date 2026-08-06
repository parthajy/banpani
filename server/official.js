// Official hazard signals so the map is never empty when a disaster hits. Source: GDACS
// (Global Disaster Alert and Coordination System, UN/EC) - a free multi-hazard GeoJSON of
// current events. We keep only Orange/Red (significant) alerts and map each to a family.
// Community reports then enrich a signal that is already on the map. Cached 1h.
const GDACS = 'https://www.gdacs.org/gdacsapi/api/events/geteventlist/MAP';
const TYPE_FAM = { EQ: 'geo', TC: 'storm', FL: 'water', VO: 'geo', WF: 'fire', DR: 'climate', TS: 'water' };

let cache = { at: 0, items: [] };

export async function officialEvents() {
  if (cache.items.length && Date.now() - cache.at < 3600e3) return cache.items;
  try {
    const r = await fetch(GDACS, { headers: { 'user-agent': 'Banpani/1.0 (https://banpani.org)' }, signal: AbortSignal.timeout(8000) });
    const gj = await r.json();
    const rank = { orange: 1, red: 2 }, byId = new Map();     // one marker per event (GDACS lists many episodes)
    for (const f of gj.features || []) {
      const p = f.properties || {}, c = (f.geometry || {}).coordinates || [];
      const fam = TYPE_FAM[p.eventtype];
      const level = String(p.alertlevel || '').toLowerCase();
      if (!fam || c.length < 2 || !rank[level]) continue;
      const id = (p.eventtype || '') + (p.eventid || (c[0] + ',' + c[1]));
      const prev = byId.get(id);
      if (prev && rank[prev.level] >= rank[level]) continue;   // keep the most-severe episode
      byId.set(id, {
        source: 'GDACS', family: fam, level, lat: c[1], lng: c[0],
        title: ((p.name || p.eventname || ('Event in ' + (p.country || 'unknown'))).replace(/,\s*,.*$/, '').slice(0, 64)).replace(/[,\s]+$/, ''),
        country: p.country || '', date: p.todate || p.fromdate || '',
        url: 'https://www.gdacs.org/report.aspx?eventid=' + (p.eventid || '') + '&eventtype=' + p.eventtype,
      });
    }
    const items = [...byId.values()];
    if (items.length) cache = { at: Date.now(), items };
  } catch { /* network hiccup: serve the last good cache */ }
  return cache.items;
}
