// Fully automatic Assam flood-risk feed. NO human, NO agent, NO daily editing.
// Every 3 hours the server pulls, for a river point in each district:
//   - GloFAS river discharge (past 90 days + 7-day forecast)  -> is the river high / rising?
//   - rainfall forecast (next 3 days)                          -> is more water coming?
// and derives a per-district severity + trend. It is model-based (Open-Meteo, free, no key), so it is
// labelled as an auto flood-risk estimate, NOT an official ASDMA count. If a fetch fails, the last
// good result is kept and served, so the map never goes blank or shows garbage.
//
// The community reports remain the real, granular, self-updating truth on top of this backdrop.

// One river point per district (name MUST match assam-districts.geojson). Open-Meteo snaps each to
// the nearest modelled river reach, so exact placement is not critical.
// Calibrated to the nearest GloFAS main-river cell so discharge reflects the big river (Brahmaputra /
// Barak), not a roadside stream. Hill districts (Karbi Anglong, Dima Hasao) have no big river, so they
// are driven by rainfall - see the discharge guard in classify().
const POINTS = [
  { d: 'Dhubri', lat: 25.92, lng: 89.88 }, { d: 'South Salmara Mankachar', lat: 25.45, lng: 89.66 },
  { d: 'Goalpara', lat: 26.17, lng: 90.62 }, { d: 'Bongaigaon', lat: 26.28, lng: 90.75 },
  { d: 'Barpeta', lat: 26.22, lng: 90.9 }, { d: 'Kokrajhar', lat: 26.2, lng: 90.37 },
  { d: 'Chirang', lat: 26.45, lng: 90.65 }, { d: 'Baksa', lat: 26.5, lng: 90.9 },
  { d: 'Nalbari', lat: 26.24, lng: 91.24 }, { d: 'Kamrup', lat: 26.13, lng: 91.3 },
  { d: 'Kamrup Metropolitan', lat: 26.18, lng: 91.55 }, { d: 'Darrang', lat: 26.25, lng: 91.93 },
  { d: 'Udalguri', lat: 26.55, lng: 92.3 }, { d: 'Sonitpur', lat: 26.63, lng: 92.7 },
  { d: 'Biswanath', lat: 26.63, lng: 92.95 }, { d: 'Morigaon', lat: 26.45, lng: 92.24 },
  { d: 'Nagaon', lat: 26.15, lng: 92.48 }, { d: 'Hojai', lat: 25.9, lng: 92.75 },
  { d: 'Golaghat', lat: 26.52, lng: 93.86 }, { d: 'Jorhat', lat: 26.95, lng: 94.32 },
  { d: 'Majuli', lat: 26.95, lng: 94.37 }, { d: 'Lakhimpur', lat: 27.03, lng: 94 },
  { d: 'Dhemaji', lat: 27.28, lng: 94.58 }, { d: 'Dibrugarh', lat: 27.37, lng: 94.71 },
  { d: 'Sivasagar', lat: 27.13, lng: 94.49 }, { d: 'Charaideo', lat: 27.25, lng: 95.25 },
  { d: 'Tinsukia', lat: 27.65, lng: 95.1 }, { d: 'Karbi Anglong', lat: 26.10, lng: 93.40 },
  { d: 'West Karbi Anglong', lat: 25.95, lng: 92.90 }, { d: 'Dima Hasao', lat: 25.18, lng: 93.02 },
  { d: 'Cachar', lat: 24.83, lng: 92.78 }, { d: 'Karimganj', lat: 24.87, lng: 92.36 },
  { d: 'Hailakandi', lat: 24.68, lng: 92.56 },
];

// River name shown on the gauge for the districts we surface (rest fall back to the district name).
const RIVER = { Karimganj: 'Kushiyara', Cachar: 'Barak', Hailakandi: 'Katakhal / Barak', Dhubri: 'Brahmaputra',
  Dibrugarh: 'Brahmaputra', Nagaon: 'Kopili / Brahmaputra', Jorhat: 'Brahmaputra', Majuli: 'Brahmaputra' };

// Local control-room helplines. These change at most once a season, so they live here in code, not in
// any daily loop. Shown on top of the national 112 / ASDMA / NDRF numbers.
const HELPLINES = [
  { label: 'Sribhumi flood control room', tel: '03843262335' },
  { label: 'District disaster helpline 1077', tel: '1077' },
];

const pctile = (x, arr) => { if (!arr.length) return 0; return arr.filter(v => v != null && v <= x).length / arr.length; };
function classify(pctPeak, rain3, current) {
  // Only trust the river-discharge signal on a real river (guards against a point that snapped to a
  // tiny stream). Everywhere else, heavy rainfall alone can still raise the risk.
  const river = current != null && current >= 300;
  if ((river && pctPeak >= 0.90) || rain3 >= 150) return 'high';
  if ((river && pctPeak >= 0.72) || rain3 >= 80) return 'medium';
  return null;
}
function trendOf(cur, near) {
  if (!cur) return 'steady';
  if (near > cur * 1.05) return 'rising';
  if (near < cur * 0.95) return 'falling';
  return 'steady';
}

let cache = null;   // last good result, served to everyone

async function fetchJSON(url) {
  const r = await fetch(url, { signal: AbortSignal.timeout(25000) });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
}

export async function refreshFloodAuto() {
  const lats = POINTS.map(p => p.lat).join(',');
  const lngs = POINTS.map(p => p.lng).join(',');
  const floodUrl = `https://flood-api.open-meteo.com/v1/flood?latitude=${lats}&longitude=${lngs}&daily=river_discharge&past_days=90&forecast_days=7`;
  const rainUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lats}&longitude=${lngs}&daily=precipitation_sum&forecast_days=3&timezone=Asia%2FKolkata`;

  let flood, rain;
  try { [flood, rain] = await Promise.all([fetchJSON(floodUrl), fetchJSON(rainUrl)]); }
  catch (e) { console.warn('[flood-auto] fetch failed, keeping last good:', e.message); return cache; }
  if (!Array.isArray(flood)) flood = [flood];
  if (!Array.isArray(rain)) rain = [rain];

  const todayStr = new Date().toISOString().slice(0, 10);
  const districts = {}; const gauges = []; const highs = [];

  POINTS.forEach((p, i) => {
    const f = flood[i], rn = rain[i];
    if (!f || !f.daily || !f.daily.river_discharge) return;
    const disc = f.daily.river_discharge, times = f.daily.time;
    let ti = times.indexOf(todayStr); if (ti < 0) ti = disc.findIndex((v, k) => v == null && k > 0) - 1;
    if (ti < 1) ti = Math.max(1, times.length - 7);
    const baseline = disc.slice(0, ti).filter(v => v != null);
    const current = disc[ti];
    const forecast = disc.slice(ti, ti + 7).filter(v => v != null);
    const peak = forecast.length ? Math.max(...forecast) : current;
    const near = disc[Math.min(ti + 2, disc.length - 1)];
    const rain3 = rn && rn.daily ? (rn.daily.precipitation_sum || []).slice(0, 3).reduce((a, b) => a + (b || 0), 0) : 0;

    const pctPeak = pctile(peak, baseline);
    const sev = classify(pctPeak, rain3, current);
    if (!sev) return;
    districts[p.d] = sev;
    const trend = trendOf(current, near);
    if (sev === 'high') {
      highs.push(p.d);
      gauges.push({ station: `${RIVER[p.d] || p.d} at ${p.d}`, river: RIVER[p.d] || p.d, lat: p.lat, lng: p.lng,
        risk: sev, trend, discharge: current != null ? Math.round(current) : null, pct: Math.round(pctPeak * 100),
        rain3: Math.round(rain3), source: 'GloFAS + rainfall (auto)' });
    }
  });

  const updated = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) + ' IST';
  cache = {
    updated, auto: true,
    source: 'GloFAS river model + rainfall (auto, Open-Meteo)',
    note: 'Auto-updated every 3 hours from modelled river discharge (GloFAS) and rainfall forecasts. This is a flood-RISK estimate, not an official ASDMA count. '
      + (highs.length ? 'High risk right now: ' + highs.join(', ') + '.' : 'No district is at high modelled risk right now.'),
    helplines: HELPLINES,
    gauges,
    districts,
  };
  console.log(`[flood-auto] updated ${updated}: ${Object.keys(districts).length} districts flagged (${highs.length} high)`);
  return cache;
}

export function getFloodAuto() { return cache; }
