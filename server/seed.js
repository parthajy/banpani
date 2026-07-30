// Seed realistic sample data so the map is demoable immediately.
//   node --experimental-sqlite server/seed.js
// Safe to re-run: it clears existing rows first. Sample data is clearly illustrative,
// modelled on the July 2026 Assam flood districts - NOT live ground truth.

import { db, run, now, today } from './db.js';

for (const t of ['reports', 'routes', 'collection_points', 'ngos', 'flood_polygons', 'actions_log', 'advisory', 'votes', 'messages'])
  db.exec(`DELETE FROM ${t};`);
// reset AUTOINCREMENT so ids start at 1 again - the vote seeding below targets ids 1..8
try { db.exec("DELETE FROM sqlite_sequence;"); } catch {}

// Advisory fallback. The server auto-refreshes this from Open-Meteo on boot + every 3h,
// so this is only shown for the first couple of seconds (or if the forecast fetch fails).
run(`INSERT INTO advisory(id,updated_at,headline,body,source) VALUES(1,?,?,?,?)`,
  now(),
  'Monsoon active over Assam',
  'Live rainfall outlook updates automatically. For official warnings and river levels, check IMD Guwahati and ASDMA.',
  'Banpani');

const yesterday = new Date(Date.now() - 864e5).toISOString().slice(0, 10);

// NEEDS - mix of verified / unverified, some deliberately left as coverage GAPS
const needs = [
  ['Kamalabari camp, Majuli', 26.95, 94.17, ['Drinking water', 'ORS', 'Dettol / antiseptic'], 1500, 'Camp coordinator', 'affected', 'open', 'confirmed'],
  ['Dhemaji town, rooftop', 27.48, 94.58, ['Boat / rescue', 'Baby food'], 20, 'Local youth', 'witness', 'open', 'confirmed'],
  ['Gogamukh, Dhemaji', 27.22, 94.30, ['Rice / dry food', 'Tarpaulin'], 400, '', 'affected', 'open', 'unverified'],
  ['Jonai, remote char', 27.79, 95.13, ['Drinking water', 'Medicines', 'Boat / rescue'], 250, '', 'witness', 'open', 'unverified'],
  ['North Lakhimpur camp', 27.23, 94.10, ['Sanitary pads', 'Medicines', 'Blankets'], 800, 'ASHA worker', 'volunteer', 'open', 'confirmed'],
  ['Kampur, Nagaon', 26.20, 92.75, ['Drinking water', 'Candles / matches'], 300, '', 'affected', 'open', 'unverified'],
  ['Kaziranga fringe village', 26.58, 93.17, ['Cattle feed', 'Mosquito nets'], 60, '', 'witness', 'open', 'confirmed'],
  ['Tezpur riverside ward', 26.63, 92.80, ['Rice / dry food', 'ORS'], 200, '', 'volunteer', 'resolved', 'confirmed'],
];
// n[8] (intended verify state) is illustrative only - real trust comes from the votes seeded below.
for (const n of needs)
  run(`INSERT INTO reports(created_at,place,lat,lng,items,people,contact,reporter_kind,status)
    VALUES(?,?,?,?,?,?,?,?,?)`, now(), n[0], n[1], n[2], JSON.stringify(n[3]), n[4], n[5], n[6], n[7]);

// CONVOYS - note: Udalguri and Tezpur BOTH heading to Majuli with water = overlap the map will flag.
const routes = [
  ['Udalguri Youth Club', 'Udalguri', 26.75, 92.10, 26.95, 94.17, ['Drinking water', 'ORS'], 'leaving 7am', today()],
  ['Tezpur Relief Collective', 'Tezpur', 26.63, 92.80, 26.94, 94.15, ['Drinking water', 'ORS'], 'leaving 7:30am', today()],
  ['Jorhat Sewa Dal', 'Jorhat', 26.75, 94.22, 27.23, 94.10, ['Sanitary pads', 'Medicines'], 'reached', yesterday],
];
for (const r of routes)
  run(`INSERT INTO routes(created_at,name,from_place,from_lat,from_lng,lat,lng,items,eta,covered_date,status)
    VALUES(?,?,?,?,?,?,?,?,?,?,?)`, now(), r[0], r[1], r[2], r[3], r[4], r[5], JSON.stringify(r[6]), r[7], r[8], 'active');

// COLLECTION POINTS
const cps = [
  ['Beltola Community Hall', 26.13, 91.80, ['Clothes', 'Dry food', 'Blankets'], '9am-6pm daily', 'Guwahati Cares'],
  ['Jorhat Gymkhana', 26.75, 94.20, ['Dry food', 'Medicines', 'Water'], '8am-8pm', 'Rotary Jorhat'],
];
for (const c of cps)
  run(`INSERT INTO collection_points(created_at,name,lat,lng,accepts,hours,org,verify_status)
    VALUES(?,?,?,?,?,?,?,?)`, now(), c[0], c[1], c[2], JSON.stringify(c[3]), c[4], c[5], 'confirmed');

// NGO REGISTRY
const ngos = [
  ['Goonj NE', ['relief', 'shelter', 'clothes'], 'Lakhimpur, Dhemaji', '1800-xxx-xxx', 'goonj.org', 'Tarpaulin, dry rations', 'confirmed'],
  ['Assam State Disaster Mgmt Authority', ['rescue', 'medical', 'water'], 'Statewide', 'ASDMA control room', 'asdma.assam.gov.in', 'Boats, coordination', 'confirmed'],
  ['Majuli Boat Volunteers', ['rescue', 'water'], 'Majuli', '', '', 'Fuel, life jackets', 'unverified'],
];
for (const g of ngos)
  run(`INSERT INTO ngos(created_at,name,focus,area,contact,website,needs_now,verify_status,last_active)
    VALUES(?,?,?,?,?,?,?,?,?)`, now(), g[0], JSON.stringify(g[1]), g[2], g[3], g[4], g[5], g[6], now());

// A community-drawn "underwater" polygon over part of Majuli.
run(`INSERT INTO flood_polygons(created_at,geojson,severity,note,source)
  VALUES(?,?,?,?,?)`, now(),
  JSON.stringify({ type: 'Polygon', coordinates: [[[94.10, 26.92], [94.25, 26.93], [94.24, 27.00], [94.08, 26.99], [94.10, 26.92]]] }),
  'high', 'Ward 3-5 chest-deep, reported by ground volunteers', 'community');

// Community-consensus votes - so the demo shows how reports reach "confirmed" (3 confirms)
// and NGOs earn the badge (5 endorsements). Each vote is from a distinct device.
const vote = (type, id, category, value, n) => {
  for (let i = 0; i < n; i++)
    run(`INSERT OR IGNORE INTO votes(created_at,target_type,target_id,device,category,value) VALUES(?,?,?,?,?,?)`,
      now(), type, id, 'seed-dev-' + type + id + '-' + category + '-' + i, category, value);
};
// report ids are 1..8 in insert order
vote('report', 1, 'trust', 'confirm', 4);   // Majuli - confirmed
vote('report', 2, 'trust', 'confirm', 3);   // Dhemaji rooftop - confirmed
vote('report', 5, 'trust', 'confirm', 5);   // Lakhimpur - confirmed
vote('report', 7, 'trust', 'confirm', 3);   // Kaziranga - confirmed
vote('report', 8, 'trust', 'confirm', 3);   // Tezpur
vote('report', 8, 'resolve', 'yes', 2);     // Tezpur - resolved by consensus
// leave reports 3,4,6 unverified so the "needs confirming" queue isn't empty
// NGO endorsements: ngo ids 1..3
vote('ngo', 1, 'endorse', 'yes', 7);        // Goonj NE - community-verified
vote('ngo', 2, 'endorse', 'yes', 12);       // ASDMA - verified
vote('ngo', 3, 'endorse', 'yes', 2);        // Majuli Boat Volunteers - 2/5, not yet

console.log('Seeded (community-consensus model, no accounts).');
console.log('Open http://localhost:8080  -  community verify console: /verify.html');
