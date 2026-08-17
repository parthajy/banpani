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
    blocked: [['Bridge washed out on NH-66', 9.99, 76.29, 'blocked']],
    facilities: [['shelter', 9.94, 76.28, 'Town Hall relief camp', 'open'], ['water', 9.92, 76.26, 'Water point', 'open'], ['pharmacy', 10.10, 76.34, 'Aluva Pharmacy', 'limited']],
    hazard: [['Kochi - submerged', 9.93, 76.27, 'high'], ['Aluva - rising', 10.11, 76.35, 'medium']] },
  { fam: 'fire', type: 'wildfire', title: 'Uttarakhand Forest Fire (demo)', lat: 29.38, lng: 79.45,
    needs: [['Nainital', 29.38, 79.45, ['Evacuation help', 'Masks / clean air'], 150], ['Bhowali', 29.39, 79.50, ['Shelter', 'Medical / burns'], 60]],
    offers: [['shelter', 29.37, 79.46, 'Community hall - 60 spaces'], ['transport', 29.39, 79.44, 'Jeeps for evacuation'], ['masks', 29.38, 79.47, 'N95 masks available']],
    hazard: [['Fire front above Nainital', 29.40, 79.45, 'high', 'fire'], ['Spot fire near Bhowali', 29.39, 79.50, 'medium', 'fire'], ['Heavy smoke over the lake', 29.38, 79.46, 'high', 'smoke']],
    evac: [[29.40, 79.45, 29.36, 79.47, 'Down to the lakeside shelter - avoid the ridge road']],
    facilities: [['shelter', 29.36, 79.47, 'Lakeside relief shelter', 'open'], ['clinic', 29.37, 79.45, 'BD Pandey Clinic', 'limited']] },
  { fam: 'storm', type: 'cyclone', title: 'Odisha Cyclone (demo)', lat: 19.30, lng: 84.80,
    needs: [['Gopalpur', 19.26, 84.90, ['Shelter', 'Drinking water'], 150], ['Berhampur', 19.31, 84.79, ['Tarpaulin / roofing', 'Food'], 90]],
    offers: [['shelter', 19.28, 84.85, 'Cyclone shelter - 200 spaces'], ['water', 19.30, 84.80, 'Water tanker'], ['power', 19.29, 84.82, 'Generator + fuel']],
    facilities: [['shelter', 19.27, 84.88, 'Govt cyclone shelter', 'open'], ['pharmacy', 19.31, 84.79, 'Berhampur Medical', 'open'], ['fuel', 19.30, 84.81, 'HP pump', 'limited']],
    hazard: [['Gopalpur coast - surge', 19.26, 84.90, 'high', 'surge'], ['Berhampur - high winds', 19.31, 84.79, 'medium', 'wind']] },
  { fam: 'geo', type: 'earthquake', title: 'Sikkim Earthquake (demo)', lat: 27.55, lng: 88.50,
    needs: [['Mangan', 27.51, 88.53, ['Search & rescue', 'Medical / trauma'], 300], ['Chungthang', 27.60, 88.64, ['Tents / shelter', 'Blankets', 'Heavy equipment'], 120]],
    offers: [['medical', 27.52, 88.52, 'Trauma team on site'], ['blood', 27.53, 88.54, 'Blood donors available'], ['shelter', 27.50, 88.51, 'Tents - 100 families']],
    facilities: [['hospital', 27.51, 88.53, 'District Hospital Mangan', 'limited'], ['shelter', 27.49, 88.50, 'School shelter', 'open']],
    blocked: [['NH-10 blocked by landslide', 27.45, 88.55, 'blocked'], ['Rockfall, single lane near Chungthang', 27.58, 88.62, 'partial']],
    hazard: [['Mangan - collapsed buildings', 27.51, 88.53, 'high', 'collapse'], ['Chungthang - cracked structures', 27.60, 88.64, 'medium', 'collapse'], ['Landslide on NH-10', 27.45, 88.55, 'high', 'landslide']] },
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
    offers: [['transport', 23.27, 77.42, 'Buses for evacuation'], ['masks', 23.26, 77.41, 'Gas masks available'], ['medical', 23.25, 77.40, 'Decontamination unit']],
    hazard: [['Leak epicentre', 23.26, 77.41, 'high'], ['Downwind zone', 23.28, 77.44, 'medium']],
    facilities: [['hospital', 23.25, 77.40, 'General Hospital', 'open'], ['clinic', 23.27, 77.39, 'Decon point', 'open']] },
  { fam: 'infra', type: 'building-collapse', title: 'Building Collapse (demo)', lat: 19.07, lng: 72.88,
    needs: [['Mumbai', 19.07, 72.88, ['Search & rescue', 'Medical / trauma', 'Blood'], 40]],
    offers: [['medical', 19.069, 72.879, 'Ambulance + medics'], ['blood', 19.072, 72.882, 'Blood donors ready'], ['equipment', 19.070, 72.880, 'Crane + cutters']],
    facilities: [['hospital', 19.068, 72.878, 'Sion Hospital', 'open']],
    blocked: [['Road closed for rescue cranes', 19.071, 72.881, 'blocked']] },
  { fam: 'agri', type: 'locust', title: 'Locust Swarm (demo)', lat: 26.90, lng: 70.90,
    needs: [['Jaisalmer', 26.90, 70.90, ['Pesticide / control', 'Crop protection'], 0]],
    offers: [['sprayer', 26.91, 70.91, 'Sprayer + team available'], ['pesticide', 26.89, 70.92, 'Pesticide stock'], ['veterinary', 26.92, 70.88, 'Vet on call']],
    facilities: [['veterinary', 26.90, 70.89, 'Govt Vet Centre', 'open'], ['shop', 26.91, 70.90, 'Agri supplies', 'open']] },
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
  for (const [place, lat, lng, severity, kind] of (d.hazard || []))
    run('INSERT INTO flood_reports(created_at,updated_at,place,lat,lng,severity,kind,event_id,device) VALUES(?,?,?,?,?,?,?,?,?)', now(), now(), place, lat, lng, severity, kind || 'flood', eid, 'demo');
  for (const [fl, fg, tl, tg, label] of (d.evac || []))
    run('INSERT INTO evac_routes(created_at,updated_at,event_id,from_lat,from_lng,to_lat,to_lng,label,device) VALUES(?,?,?,?,?,?,?,?,?)', now(), now(), eid, fl, fg, tl, tg, label, 'demo');
  console.log('seeded', d.title.padEnd(34), '-> /e/demo-' + d.fam);
}
console.log('\ndone -', DEMOS.length, 'demo events. Remove later with: node --experimental-sqlite server/seed-events.js clear');
