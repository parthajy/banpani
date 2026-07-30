// Auto-feed the map's weather/flood advisory from Open-Meteo (FREE, no API key, no signup).
// Pulls the rainfall forecast for the worst-hit districts and writes a plain-language
// outlook into the `advisory` row - so the corner panel updates itself, no admin needed.
//   Cron:  0 */3 * * *  node --experimental-sqlite /path/server/weather.js
//
// Note: Open-Meteo gives rainfall, not official IMD warnings or flood extent. It's the
// free, automatable signal. For authoritative flood delineation, add a Sentinel-1 /
// Copernicus job later (see deploy/README.md); this keeps the outlook honest meanwhile.

import { run, now } from './db.js';
import { fileURLToPath } from 'node:url';

const DISTRICTS = [
  { name: 'Dhemaji', lat: 27.48, lng: 94.58 },
  { name: 'Lakhimpur', lat: 27.23, lng: 94.10 },
  { name: 'Majuli', lat: 26.95, lng: 94.17 },
  { name: 'Dibrugarh', lat: 27.47, lng: 94.91 },
  { name: 'Nagaon', lat: 26.35, lng: 92.68 },
  { name: 'Sonitpur (Tezpur)', lat: 26.63, lng: 92.80 },
  { name: 'Barpeta', lat: 26.32, lng: 91.00 },
  { name: 'Guwahati', lat: 26.14, lng: 91.74 },
];

async function rainFor(d) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${d.lat}&longitude=${d.lng}`
    + `&daily=precipitation_sum,precipitation_probability_max&forecast_days=3&timezone=Asia%2FKolkata`;
  const r = await fetch(url);
  if (!r.ok) throw new Error('open-meteo ' + r.status);
  const j = await r.json();
  const sum48 = (j.daily.precipitation_sum[0] || 0) + (j.daily.precipitation_sum[1] || 0);
  const prob = Math.max(j.daily.precipitation_probability_max[0] || 0, j.daily.precipitation_probability_max[1] || 0);
  return { ...d, mm48: Math.round(sum48), prob };
}

function classify(mm) { return mm >= 115 ? 'very heavy' : mm >= 64 ? 'heavy' : mm >= 15 ? 'moderate' : 'light'; }

export async function updateWeather() {
  const results = [];
  for (const d of DISTRICTS) { try { results.push(await rainFor(d)); } catch (e) { console.warn('skip', d.name, e.message); } }
  if (!results.length) { console.error('No data from Open-Meteo - advisory left unchanged.'); return null; }

  results.sort((a, b) => b.mm48 - a.mm48);
  const heavy = results.filter(r => r.mm48 >= 64);
  const worst = results[0];
  const headline = heavy.length
    ? `Rain outlook: ${classify(worst.mm48)} rain likely - up to ${worst.mm48}mm/48h`
    : `Rain outlook: mostly ${classify(worst.mm48)} over the next 48h`;
  const body = 'Next 48h rainfall (auto, Open-Meteo): '
    + results.slice(0, 6).map(r => `${r.name} ${r.mm48}mm (${r.prob}%)`).join(' · ')
    + (heavy.length ? `. Watch for fresh inundation in ${heavy.map(h => h.name).join(', ')}. Keep boats ready; avoid riverbanks.` : '.');

  run(`INSERT INTO advisory(id,updated_at,headline,body,source) VALUES(1,?,?,?,?)
       ON CONFLICT(id) DO UPDATE SET updated_at=excluded.updated_at, headline=excluded.headline, body=excluded.body, source=excluded.source`,
    now(), headline, body, 'Auto - Open-Meteo rainfall forecast');
  console.log('Advisory updated:', headline);
  return headline;
}

// run directly (cron / manual) → update once
if (process.argv[1] === fileURLToPath(import.meta.url)) updateWeather();
