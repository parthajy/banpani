// India geography helpers - no runtime dependencies. Backed by a compact district-centroid dataset
// (737 districts, ~44KB, built from udit-001/india-maps-data ADM2 boundaries). A point is labelled by
// its nearest district centroid, which gives an accurate state + district even near state borders
// (nearest-STATE-centroid was too coarse - it put Mumbai in Daman & Diu). Used by the India tracker.
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = dirname(fileURLToPath(import.meta.url));
let DISTRICTS = [];
try { DISTRICTS = JSON.parse(readFileSync(join(DIR, 'data', 'india-districts.json'), 'utf8')); } catch { /* falls back to bbox-only */ }

export const inIndia = (lat, lng) => lat != null && lng != null && lat >= 6 && lat <= 37.6 && lng >= 67 && lng <= 98;

// { d: district, s: state, lat, lng } of the nearest district centroid, or null.
export function districtOf(lat, lng) {
  if (lat == null || lng == null || !DISTRICTS.length) return null;
  let best = null, bd = Infinity;
  for (const p of DISTRICTS) {
    const dlat = lat - p.lat, dlng = (lng - p.lng) * Math.cos(lat * Math.PI / 180);
    const d = dlat * dlat + dlng * dlng;
    if (d < bd) { bd = d; best = p; }
  }
  return best;
}
export function stateOf(lat, lng) { const d = districtOf(lat, lng); return d ? d.s : null; }

// The full state -> districts map, so the tracker page can offer a cascading state/district filter.
export function statesAndDistricts() {
  const m = {};
  for (const p of DISTRICTS) (m[p.s] || (m[p.s] = [])).push(p.d);
  const out = {};
  for (const s of Object.keys(m).sort()) out[s] = [...new Set(m[s])].sort();
  return out;
}
