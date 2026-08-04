// Demo events - one per disaster family - so every tailored module can be clicked through at
// /e/demo-<family>. Idempotent: clears prior demo data first. Everything is tagged source='demo'
// / device='demo' so it is trivial to remove later:  node --experimental-sqlite server/seed-events.js clear
//   node --experimental-sqlite server/seed-events.js         # (re)seed
import { run, all, now } from './db.js';
import { RECIPES } from './events.js';

function clearDemo() {
  for (const id of all("SELECT id FROM events WHERE source='demo'").map(e => e.id)) {
    for (const t of ['reports', 'offers', 'blocked_roads', 'facilities', 'flood_reports', 'routes', 'collection_points'])
      run(`DELETE FROM ${t} WHERE event_id=?`, id);
  }
  run("DELETE FROM events WHERE source='demo'");
  // also anything else tagged as demo device, just in case
  for (const t of ['reports', 'offers', 'blocked_roads', 'facilities', 'flood_reports', 'routes', 'collection_points'])
    try { run(`DELETE FROM ${t} WHERE device='demo'`); } catch {}
}

clearDemo();
if (process.argv[2] === 'clear') { console.log('demo data cleared.'); process.exit(0); }

const DEMOS = [
  { fam: 'water', type: 'flood', title: 'Kerala Floods 2026 (demo)', lat: 9.98, lng: 76.28,
    needs: [['Kochi', 9.93, 76.27, ['Boat / rescue', 'Drinking water'], 120], ['Aluva', 10.11, 76.35, ['Dry food', 'Medicines'], 60]],
    offers: [['boat', 9.95, 76.30, '2 boats, dawn to dusk'], ['water', 9.90, 76.25, 'Water tanker, refilling']],
    blocked: [['Bridge washed out on NH-66', 9.99, 76.29, 'blocked']] },
  { fam: 'fire', type: 'wildfire', title: 'California Wildfire (demo)', lat: 39.77, lng: -121.6,
    needs: [['Paradise', 39.75, -121.6, ['Evacuation help', 'Shelter'], 200], ['Magalia', 39.81, -121.58, ['Masks / clean air'], 80]],
    offers: [['shelter', 39.76, -121.61, 'Community hall — 50 spaces'], ['transport', 39.78, -121.59, 'Van for evacuation'], ['masks', 39.80, -121.57, 'N95 masks available']],
    facilities: [['shelter', 39.74, -121.63, 'High School shelter', 'open'], ['clinic', 39.74, -121.62, 'Feather River Clinic', 'limited']] },
  { fam: 'storm', type: 'cyclone', title: 'Odisha Cyclone (demo)', lat: 19.30, lng: 84.80,
    needs: [['Gopalpur', 19.26, 84.90, ['Shelter', 'Drinking water'], 150], ['Berhampur', 19.31, 84.79, ['Tarpaulin / roofing', 'Food'], 90]] },
  { fam: 'geo', type: 'earthquake', title: 'Nepal Earthquake (demo)', lat: 28.05, lng: 84.63,
    needs: [['Gorkha', 28.00, 84.63, ['Search & rescue', 'Medical / trauma'], 300], ['Barpak', 28.16, 84.77, ['Tents / shelter', 'Blankets'], 120]],
    blocked: [['Landslide across the Gorkha road', 28.05, 84.60, 'blocked'], ['Rockfall, single lane', 28.10, 84.70, 'partial']] },
  { fam: 'climate', type: 'drought', title: 'Marathwada Drought (demo)', lat: 18.40, lng: 76.57,
    needs: [['Latur', 18.40, 76.57, ['Drinking water', 'Fodder for livestock'], 500]],
    offers: [['water', 18.41, 76.58, 'Tanker, twice daily']],
    facilities: [['water', 18.39, 76.56, 'Community water point', 'open']] },
  { fam: 'health', type: 'pandemic', title: 'City Outbreak (demo)', lat: 28.58, lng: 77.21,
    needs: [['South Delhi', 28.53, 77.24, ['Oxygen', 'Hospital beds'], 400], ['Rohini', 28.74, 77.06, ['Medicines', 'Food delivery'], 150]],
    offers: [['oxygen', 28.55, 77.25, '30 cylinders, refilling daily'], ['beds', 28.56, 77.23, '8 ICU beds free now']],
    facilities: [['pharmacy', 28.60, 77.20, 'Apollo Pharmacy', 'open'], ['hospital', 28.57, 77.19, 'City Hospital', 'limited'], ['grocery', 28.62, 77.23, 'Ration store', 'closed'], ['oxygen', 28.55, 77.25, 'Oxygen refill point', 'open']] },
  { fam: 'tech', type: 'chemical-leak', title: 'Industrial Gas Leak (demo)', lat: 23.26, lng: 77.41,
    needs: [['Old city', 23.26, 77.41, ['Evacuation', 'Medical / decontamination'], 250]],
    facilities: [['hospital', 23.25, 77.40, 'General Hospital', 'open']] },
  { fam: 'infra', type: 'building-collapse', title: 'Building Collapse (demo)', lat: 19.07, lng: 72.88,
    needs: [['Mumbai', 19.07, 72.88, ['Search & rescue', 'Medical / trauma', 'Blood'], 40]],
    blocked: [['Road closed for rescue cranes', 19.071, 72.881, 'blocked']] },
  { fam: 'agri', type: 'locust', title: 'Locust Swarm (demo)', lat: 26.90, lng: 70.90,
    needs: [['Jaisalmer', 26.90, 70.90, ['Pesticide / control', 'Crop protection'], 0]],
    offers: [['other', 26.91, 70.91, 'Sprayer + team available']] },
];

for (const d of DEMOS) {
  const r = run('INSERT INTO events(created_at,slug,title,disaster_type,lat,lng,radius_km,modules,source,listed,status) VALUES(?,?,?,?,?,?,?,?,?,?,?)',
    now(), 'demo-' + d.fam, d.title, d.type, d.lat, d.lng, 80, JSON.stringify(RECIPES[d.fam] || ['needs', 'photos']), 'demo', 1, 'active');
  const eid = Number(r.lastInsertRowid);
  for (const [place, lat, lng, items, people] of (d.needs || []))
    run('INSERT INTO reports(created_at,place,lat,lng,items,people,reporter_kind,mode,disaster_type,event_id,device) VALUES(?,?,?,?,?,?,?,?,?,?,?)',
      now(), place, lat, lng, JSON.stringify(items), people, 'witness', 'relief', d.type, eid, 'demo');
  for (const [kind, lat, lng, note] of (d.offers || []))
    run('INSERT INTO offers(created_at,updated_at,event_id,lat,lng,kind,note,device) VALUES(?,?,?,?,?,?,?,?)', now(), now(), eid, lat, lng, kind, note, 'demo');
  for (const [label, lat, lng, kind] of (d.blocked || []))
    run('INSERT INTO blocked_roads(created_at,updated_at,event_id,lat,lng,label,kind,device) VALUES(?,?,?,?,?,?,?,?)', now(), now(), eid, lat, lng, label, kind, 'demo');
  for (const [kind, lat, lng, name, status] of (d.facilities || []))
    run('INSERT INTO facilities(created_at,updated_at,event_id,lat,lng,kind,name,status,device) VALUES(?,?,?,?,?,?,?,?,?)', now(), now(), eid, lat, lng, kind, name, status, 'demo');
  console.log('seeded', d.title.padEnd(34), '-> /e/demo-' + d.fam);
}
console.log('\ndone -', DEMOS.length, 'demo events. Remove later with: node --experimental-sqlite server/seed-events.js clear');
