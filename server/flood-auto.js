// Fully automatic flood-risk feed for our flagship river regions. NO human, NO agent, NO daily editing.
// Every 3 hours the server pulls, per river point:
//   - GloFAS river discharge (past 90 days + 7-day forecast)  -> is the river high / rising?
//   - rainfall forecast (next 3 days)                          -> is more water coming?
// and derives risk + trend. Model-based (Open-Meteo, free, no key), labelled as a flood-RISK estimate,
// not an official count. If a fetch fails, the last good result is kept, so the map never goes blank.
//
// Two modes: 'districts' (Assam - one point per district, drives the shading) and 'gauges' (Bangladesh
// - one point per major river, drives gauge markers on top of the hand-tagged district shading).

const ASSAM_POINTS = [
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
const ASSAM_RIVER = { Karimganj: 'Kushiyara', Cachar: 'Barak', Hailakandi: 'Katakhal / Barak', Dhubri: 'Brahmaputra',
  Dibrugarh: 'Brahmaputra', Nagaon: 'Kopili / Brahmaputra', Jorhat: 'Brahmaputra', Majuli: 'Brahmaputra' };
const ASSAM_HELPLINES = [
  { label: 'Sribhumi flood control room', tel: '03843262335' },
  { label: 'District disaster helpline 1077', tel: '1077' },
];

// Bangladesh major rivers, calibrated to the nearest GloFAS reach (Surma / Kushiyara / Meghna / etc.).
const BD_POINTS = [
  { d: 'Surma at Sylhet', river: 'Surma', lat: 24.8, lng: 91.97 },
  { d: 'Kushiyara at Fenchuganj', river: 'Kushiyara', lat: 24.88, lng: 92.13 },
  { d: 'Surma at Sunamganj', river: 'Surma', lat: 24.97, lng: 91.2 },
  { d: 'Kushiyara at Habiganj', river: 'Kushiyara', lat: 24.57, lng: 91.21 },
  { d: 'Meghna at Bhairab', river: 'Meghna', lat: 23.95, lng: 90.88 },
  { d: 'Gumti at Cumilla', river: 'Gumti', lat: 23.46, lng: 91.08 },
  { d: 'Feni River', river: 'Feni', lat: 22.84, lng: 91.4 },
  { d: 'Karnaphuli at Chattogram', river: 'Karnaphuli', lat: 22.32, lng: 91.8 },
  { d: 'Sangu at Bandarban', river: 'Sangu', lat: 22.19, lng: 92.02 },
  { d: 'Matamuhuri (Cox\'s Bazar)', river: 'Matamuhuri', lat: 21.7, lng: 91.98 },
];

// All-India river network: one point per major river reach, calibrated near known gauge towns so GloFAS
// reads the main channel (not a tributary). Drives the nationwide "rivers on flood alert" layer on the
// gateway map. Points on genuinely large rivers clear the discharge>=300 guard; small ones just read 'low'.
const INDIA_POINTS = [
  // Ganga and tributaries
  { d: 'Ganga at Patna', river: 'Ganga', lat: 25.62, lng: 85.14 },
  { d: 'Ganga at Bhagalpur', river: 'Ganga', lat: 25.25, lng: 86.98 },
  { d: 'Ganga at Varanasi', river: 'Ganga', lat: 25.31, lng: 83.01 },
  { d: 'Ganga at Kanpur', river: 'Ganga', lat: 26.47, lng: 80.32 },
  { d: 'Ganga at Farakka', river: 'Ganga', lat: 24.80, lng: 87.93 },
  { d: 'Yamuna at Prayagraj', river: 'Yamuna', lat: 25.42, lng: 81.88 },
  { d: 'Yamuna at Delhi', river: 'Yamuna', lat: 28.66, lng: 77.23 },
  { d: 'Ghaghara at Ayodhya', river: 'Ghaghara', lat: 26.79, lng: 82.15 },
  { d: 'Kosi at Kursela', river: 'Kosi', lat: 25.41, lng: 87.24 },
  { d: 'Gandak at Hajipur', river: 'Gandak', lat: 25.69, lng: 85.21 },
  { d: 'Chambal at Kota', river: 'Chambal', lat: 25.18, lng: 75.86 },
  // Brahmaputra and the north-east
  { d: 'Brahmaputra at Guwahati', river: 'Brahmaputra', lat: 26.19, lng: 91.69 },
  { d: 'Brahmaputra at Dibrugarh', river: 'Brahmaputra', lat: 27.48, lng: 94.91 },
  { d: 'Barak at Silchar', river: 'Barak', lat: 24.82, lng: 92.80 },
  { d: 'Teesta at Jalpaiguri', river: 'Teesta', lat: 26.52, lng: 88.72 },
  // East-flowing peninsular rivers
  { d: 'Mahanadi at Cuttack', river: 'Mahanadi', lat: 20.47, lng: 85.88 },
  { d: 'Mahanadi at Sambalpur', river: 'Mahanadi', lat: 21.47, lng: 83.97 },
  { d: 'Brahmani (lower)', river: 'Brahmani', lat: 20.95, lng: 85.30 },
  { d: 'Godavari at Rajahmundry', river: 'Godavari', lat: 17.00, lng: 81.78 },
  { d: 'Godavari at Bhadrachalam', river: 'Godavari', lat: 17.67, lng: 80.89 },
  { d: 'Krishna at Vijayawada', river: 'Krishna', lat: 16.51, lng: 80.62 },
  { d: 'Krishna at Nagarjuna Sagar', river: 'Krishna', lat: 16.57, lng: 79.31 },
  { d: 'Cauvery at Tiruchirapalli', river: 'Cauvery', lat: 10.80, lng: 78.69 },
  { d: 'Cauvery at Mettur', river: 'Cauvery', lat: 11.79, lng: 77.80 },
  { d: 'Penna at Nellore', river: 'Penna', lat: 14.44, lng: 79.99 },
  { d: 'Subarnarekha at Jamshedpur', river: 'Subarnarekha', lat: 22.80, lng: 86.18 },
  { d: 'Damodar at Durgapur', river: 'Damodar', lat: 23.50, lng: 87.30 },
  // West-flowing rivers
  { d: 'Narmada at Hoshangabad', river: 'Narmada', lat: 22.75, lng: 77.72 },
  { d: 'Narmada at Bharuch', river: 'Narmada', lat: 21.70, lng: 72.98 },
  { d: 'Tapti at Surat', river: 'Tapti', lat: 21.20, lng: 72.85 },
  { d: 'Periyar (Kerala)', river: 'Periyar', lat: 10.18, lng: 76.40 },
  { d: 'Bharathapuzha (Kerala)', river: 'Bharathapuzha', lat: 10.77, lng: 76.20 },
];
const INDIA_HELPLINES = [
  { label: 'Emergency 112', tel: '112' },
  { label: 'NDMA disaster helpline 1078', tel: '1078' },
];

const REGIONS = {
  assam: { mode: 'districts', points: ASSAM_POINTS, river: ASSAM_RIVER, helplines: ASSAM_HELPLINES, tz: 'Asia/Kolkata', tzLabel: 'IST' },
  bangladesh: { mode: 'gauges', points: BD_POINTS, helplines: [], tz: 'Asia/Dhaka', tzLabel: 'BST' },
  india: { mode: 'gauges', points: INDIA_POINTS, helplines: INDIA_HELPLINES, tz: 'Asia/Kolkata', tzLabel: 'IST' },
};

const pctile = (x, arr) => { if (!arr.length) return 0; return arr.filter(v => v != null && v <= x).length / arr.length; };
function classify(pctPeak, rain3, current) {
  const river = current != null && current >= 300;   // trust the discharge signal only on a real river
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

const cache = {};   // region -> last good result

async function fetchJSON(url) {
  const r = await fetch(url, { signal: AbortSignal.timeout(25000) });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
}

async function refreshRegion(key) {
  const cfg = REGIONS[key], pts = cfg.points;
  const lats = pts.map(p => p.lat).join(','), lngs = pts.map(p => p.lng).join(',');
  const floodUrl = `https://flood-api.open-meteo.com/v1/flood?latitude=${lats}&longitude=${lngs}&daily=river_discharge&past_days=90&forecast_days=7`;
  const rainUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lats}&longitude=${lngs}&daily=precipitation_sum&forecast_days=3&timezone=${encodeURIComponent(cfg.tz)}`;
  let flood, rain;
  try { [flood, rain] = await Promise.all([fetchJSON(floodUrl), fetchJSON(rainUrl)]); }
  catch (e) { console.warn(`[flood-auto:${key}] fetch failed, keeping last good:`, e.message); return cache[key]; }
  if (!Array.isArray(flood)) flood = [flood];
  if (!Array.isArray(rain)) rain = [rain];

  const todayStr = new Date().toISOString().slice(0, 10);
  const districts = {}, gauges = [], highs = [];

  pts.forEach((p, i) => {
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
    const trend = trendOf(current, near);
    const gauge = { lat: p.lat, lng: p.lng, trend, discharge: current != null ? Math.round(current) : null,
      peak: peak != null ? Math.round(peak) : null, pct: Math.round(pctPeak * 100), rain3: Math.round(rain3), source: 'GloFAS + rainfall (auto)' };

    if (cfg.mode === 'districts') {
      if (!sev) return;
      districts[p.d] = sev;
      if (sev === 'high') { highs.push(p.d); gauges.push({ ...gauge, station: `${cfg.river[p.d] || p.d} at ${p.d}`, river: cfg.river[p.d] || p.d, risk: sev }); }
    } else {   // gauges mode: emit every major river with its status (high / medium / low)
      const risk = sev || 'low';
      if (risk === 'high') highs.push(p.river || p.d);
      gauges.push({ ...gauge, station: p.d, river: p.river, risk });
    }
  });

  const updated = new Date().toLocaleString('en-GB', { timeZone: cfg.tz, day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) + ' ' + cfg.tzLabel;
  cache[key] = {
    updated, auto: true,
    source: 'GloFAS river model + rainfall (auto, Open-Meteo)',
    note: 'Auto-updated every 3 hours from modelled river discharge (GloFAS) and rainfall forecasts. This is a flood-RISK estimate, not an official count. '
      + (highs.length ? 'High risk right now: ' + highs.join(', ') + '.' : 'No point is at high modelled risk right now.'),
    helplines: cfg.helplines || [], gauges,
    ...(cfg.mode === 'districts' ? { districts } : {}),
  };
  console.log(`[flood-auto:${key}] updated ${updated}: ${gauges.length} gauges${cfg.mode === 'districts' ? `, ${Object.keys(districts).length} districts` : ''} (${highs.length} high)`);
  return cache[key];
}

export async function refreshFloodAuto() {
  for (const key of Object.keys(REGIONS)) { try { await refreshRegion(key); } catch (e) { console.warn('[flood-auto]', key, e.message); } }
  return cache.assam;
}
export function getFloodAuto(region = 'assam') { return cache[region] || null; }
