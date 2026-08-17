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
    needs: [['Latur', 18.40, 76.57, ['Drinking water', 'Water tanker'], 500], ['Ausa', 18.24, 76.50, ['Fodder for livestock', 'Cattle camp / care'], 300], ['Nilanga', 18.12, 76.75, ['Crop / farm support', 'Work / MGNREGA'], 200]],
    offers: [['water', 18.41, 76.58, 'Tanker, twice daily'], ['fodder', 18.25, 76.51, 'Fodder depot - 5 tonnes'], ['food', 18.13, 76.74, 'Ration kits available']],
    facilities: [['water', 18.39, 76.56, 'Community water point', 'open'], ['water', 18.23, 76.49, 'Cattle camp water tank', 'open'], ['clinic', 18.40, 76.58, 'Rural health clinic', 'open']] },
  { fam: 'health', type: 'pandemic', title: 'Delhi COVID Surge (demo)', lat: 28.58, lng: 77.21,
    needs: [['South Delhi', 28.53, 77.24, ['Oxygen', 'ICU / hospital bed'], 400], ['Rohini', 28.74, 77.06, ['Medicines', 'Meals (isolation)'], 150], ['Dwarka', 28.59, 77.05, ['Ambulance', 'Testing'], 90]],
    offers: [['oxygen', 28.55, 77.25, '30 cylinders, refilling daily'], ['beds', 28.56, 77.23, '8 ICU beds free now'], ['plasma', 28.57, 77.22, 'Recovered donors available'], ['ambulance', 28.60, 77.20, 'Ambulance on call, 24x7']],
    facilities: [['pharmacy', 28.60, 77.20, 'Apollo Pharmacy', 'open'], ['hospital', 28.57, 77.19, 'City Hospital', 'limited'], ['oxygen', 28.55, 77.25, 'Oxygen refill point', 'open'], ['testing', 28.58, 77.23, 'RT-PCR test centre', 'open'], ['vaccination', 28.56, 77.21, 'Vaccination centre', 'open'], ['grocery', 28.62, 77.23, 'Ration store', 'closed']] },
  { fam: 'health', type: 'zoonotic', slug: 'demo-nipah', title: 'Kerala Nipah Outbreak (demo)', lat: 11.25, lng: 75.78,
    needs: [['Kozhikode', 11.25, 75.78, ['Isolation / quarantine', 'PPE / masks', 'Contact tracing'], 40], ['Perambra', 11.57, 75.77, ['Testing (human)', 'Veterinary teams'], 20]],
    offers: [['medical', 11.26, 75.79, 'Isolation-ward team'], ['ppe', 11.25, 75.77, 'PPE kits available'], ['veterinary', 11.55, 75.78, 'Vet team - fruit-bat survey']],
    facilities: [['hospital', 11.25, 75.78, 'Medical College isolation', 'open'], ['testing', 11.26, 75.80, 'Virology lab (NIV)', 'open'], ['quarantine', 11.30, 75.76, 'Quarantine ward', 'open']] },
  { fam: 'health', type: 'animal-disease', slug: 'demo-lumpy', title: 'Rajasthan Lumpy Skin Disease (demo)', lat: 26.29, lng: 73.02,
    needs: [['Jodhpur', 26.29, 73.02, ['Veterinary teams', 'Animal vaccination'], 5000], ['Bikaner', 28.02, 73.31, ['Safe culling & disposal', 'Fodder (quarantined)', 'Compensation help'], 3000]],
    offers: [['veterinary', 26.30, 73.03, 'Mobile vet unit'], ['vaccine', 26.28, 73.01, 'Goat-pox vaccine stock'], ['disinfectant', 28.03, 73.30, 'Disinfectant + sprayers'], ['fodder', 28.01, 73.32, 'Fodder for quarantined cattle']],
    facilities: [['veterinary', 26.29, 73.02, 'Govt Veterinary Hospital', 'open'], ['vaccination', 28.02, 73.31, 'Cattle vaccination camp', 'open'], ['disposal', 26.25, 73.05, 'Safe carcass disposal site', 'open']] },
  { fam: 'tech', type: 'gas-leak', title: 'Visakhapatnam Gas Leak (demo)', lat: 17.72, lng: 83.20,
    needs: [['RR Venkatapuram', 17.72, 83.20, ['Evacuation', 'Masks / respirators'], 800], ['Gopalapatnam', 17.76, 83.21, ['Medical / decontamination', 'Antidote / oxygen'], 300]],
    offers: [['transport', 17.73, 83.19, 'Buses for evacuation'], ['masks', 17.72, 83.21, 'Respirator masks'], ['medical', 17.71, 83.18, 'Decontamination unit']],
    hazard: [['LG Polymers plant - leak source', 17.72, 83.20, 'high', 'leak'], ['Downwind villages', 17.75, 83.22, 'high', 'plume']],
    facilities: [['hospital', 17.71, 83.18, 'King George Hospital', 'open'], ['clinic', 17.73, 83.21, 'Decontamination point', 'open'], ['shelter', 17.69, 83.17, 'Upwind relief shelter', 'open']] },
  { fam: 'infra', type: 'building-collapse', title: 'Mumbai Building Collapse (demo)', lat: 19.07, lng: 72.88,
    needs: [['Dongri', 19.07, 72.88, ['Search & rescue', 'People trapped', 'Medical / trauma'], 40], ['Bhendi Bazaar', 19.06, 72.83, ['Heavy equipment (cranes/cutters)', 'Blood'], 15]],
    offers: [['medical', 19.069, 72.879, 'Ambulance + medics'], ['blood', 19.072, 72.882, 'Blood donors ready'], ['equipment', 19.070, 72.880, 'Crane + cutters']],
    hazard: [['Collapsed wing - rubble', 19.07, 72.88, 'high', 'rubble'], ['Adjacent unstable block', 19.071, 72.881, 'medium', 'cordon']],
    facilities: [['hospital', 19.068, 72.878, 'JJ Hospital', 'open'], ['clinic', 19.066, 72.876, 'First-aid post', 'open']],
    blocked: [['Lane closed for rescue cranes', 19.071, 72.881, 'blocked']] },
  { fam: 'agri', type: 'locust', title: 'Rajasthan Locust Swarm (demo)', lat: 26.90, lng: 70.90,
    needs: [['Jaisalmer', 26.90, 70.90, ['Pesticide / spraying', 'Aerial spray support'], 0], ['Barmer', 25.75, 71.39, ['Crop protection', 'Compensation'], 0]],
    offers: [['pesticide', 26.91, 70.91, 'Pesticide stock + team'], ['sprayer', 26.89, 70.92, 'Tractor sprayers'], ['drone', 26.92, 70.88, 'Spray drone available']],
    hazard: [['Swarm over Jaisalmer', 26.90, 70.90, 'high', 'swarm'], ['Damaged bajra fields', 25.76, 71.40, 'medium', 'cropdamage']],
    facilities: [['shop', 26.90, 70.89, 'Agri supplies', 'open'], ['warehouse', 26.91, 70.90, 'Pesticide depot', 'open']] },
];

for (const d of DEMOS) {
  const r = run('INSERT INTO events(created_at,slug,title,disaster_type,lat,lng,radius_km,modules,source,listed,status) VALUES(?,?,?,?,?,?,?,?,?,?,?)',
    now(), d.slug || ('demo-' + d.fam), d.title, d.type, d.lat, d.lng, 80, JSON.stringify(RECIPES[d.fam] || ['needs', 'photos']), 'demo', 1, 'active');
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
  console.log('seeded', d.title.padEnd(34), '-> /e/' + (d.slug || ('demo-' + d.fam)));
}
console.log('\ndone -', DEMOS.length, 'demo events. Remove later with: node --experimental-sqlite server/seed-events.js clear');
