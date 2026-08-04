// Banpani front-end config. Edit this one file to point at your server / change map tiles.
window.BANPANI = {
  API: '',   // '' = same origin (the Node server serves this page too)

  TILE_URL: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  TILE_ATTR: '© OpenStreetMap contributors · <a href="https://github.com/parthajy/banpani" target="_blank" rel="noopener">Banpani — open source (MIT)</a>',
  TILE_MAXZOOM: 18,

  // Locked on Assam - tight bounds + a min zoom where Assam fills the screen, so the
  // view can't drift off the state.
  CENTER: [26.5, 92.9],
  ZOOM: 7,
  BOUNDS: [[24.0, 89.6], [28.4, 96.1]],   // SW, NE - Assam
  MIN_ZOOM: 7,
  MAX_ZOOM: 16,

  FLOOD_GEOJSON: 'data/assam-districts.geojson',

  // Community-consensus thresholds (kept in sync with server db.js THRESH, for display).
  CONFIRM_AT: 3, RESOLVE_AT: 2, ENDORSE_AT: 5,

  GAP_RADIUS_KM: 6,
  OVERLAP_RADIUS_KM: 4,

  // Official emergency contacts, always one tap away (this map does NOT replace them).
  HELPLINES: [
    { label: 'Emergency 112', tel: '112' },
    { label: 'ASDMA control room', tel: '1079' },
    { label: 'NDRF', tel: '18001801551' },
  ],

  ITEMS: ['Drinking water', 'ORS', 'Dettol / antiseptic', 'Rice / dry food', 'Baby food',
    'Tarpaulin', 'Blankets', 'Sanitary pads', 'Medicines', 'Candles / matches',
    'Boat / rescue', 'Mosquito nets', 'Cattle feed', 'First aid'],
  // Rehabilitation phase — what people need to recover, not just survive.
  REHAB_ITEMS: ['House rebuild (full)', 'House repair (partial)', 'Roofing / tin', 'Seeds & saplings',
    'Livestock', 'Farming tools', 'Fishing net / boat', 'School kit / books', 'Clothes & bedding',
    'Utensils', 'Well / water repair', 'Medical follow-up', 'Compensation help', 'Cash / debt relief'],
  ACCEPTS: ['Dry food', 'Water', 'Clothes', 'Blankets', 'Medicines', 'Tarpaulin', 'Baby food', 'Cash'],
  // Photo tags per phase (anyone can snap + upload as proof)
  PHOTO_TAGS: {
    relief: [{ k: 'flooded', l: '🌊 Flooded' }, { k: 'need', l: '🆘 Relief needed' }, { k: 'done', l: '✅ Work done' }],
    rehab: [{ k: 'damage', l: '🔨 Damage' }, { k: 'done', l: '✅ Work done' }],
  },
  FOCUS: ['rescue', 'food', 'water', 'medical', 'shelter', 'sanitation', 'cattle', 'rebuild'],

  // ---- disaster families: the colour system + taxonomy for the world map and the
  // future multi-disaster engine. A report's disaster_type maps to one family (colour). ----
  DISASTERS: {
    water:   { color: '#2E77FF', emoji: '💧', label: 'Water',          types: ['flood', 'flash-flood', 'urban-flood', 'coastal-flood', 'storm-surge', 'tsunami', 'dam-failure', 'glof'],
      needs: ['Drinking water', 'Boat / rescue', 'Dry food', 'Medicines', 'Shelter', 'Sanitation', 'Baby food', 'Cattle feed'] },
    fire:    { color: '#F5551D', emoji: '🔥', label: 'Fire',           types: ['wildfire', 'urban-fire', 'industrial-fire', 'explosion', 'oil-spill'],
      needs: ['Evacuation help', 'Shelter', 'Masks / clean air', 'Drinking water', 'Medical / burns', 'Firefighting support', 'Animal rescue'] },
    storm:   { color: '#8B5CF6', emoji: '🌪️', label: 'Storm & wind',   types: ['cyclone', 'hurricane', 'typhoon', 'tornado', 'thunderstorm', 'hailstorm', 'blizzard', 'ice-storm', 'dust-storm'],
      needs: ['Shelter', 'Drinking water', 'Food', 'Tarpaulin / roofing', 'Medicines', 'Power / lighting', 'Rescue'] },
    geo:     { color: '#B4652A', emoji: '⛰️', label: 'Geological',     types: ['earthquake', 'landslide', 'mudslide', 'avalanche', 'volcano', 'sinkhole'],
      needs: ['Search & rescue', 'Medical / trauma', 'Tents / shelter', 'Drinking water', 'Food', 'Blankets', 'Heavy equipment'] },
    climate: { color: '#EAB308', emoji: '☀️', label: 'Climate extreme', types: ['heatwave', 'coldwave', 'drought', 'water-scarcity'],
      needs: ['Drinking water', 'Cooling / shade', 'ORS / electrolytes', 'Medical', 'Fodder for livestock', 'Food'] },
    health:  { color: '#12B5A5', emoji: '🦠', label: 'Health',         types: ['pandemic', 'epidemic', 'outbreak'],
      needs: ['Oxygen', 'Hospital bed (ICU)', 'Medicines', 'Plasma / blood', 'Testing', 'Ambulance', 'Food / meals', 'Groceries / essentials', 'Home care', 'Vaccination help'] },
    tech:    { color: '#D6409F', emoji: '☣️', label: 'Industrial',     types: ['chemical-leak', 'gas-leak', 'nuclear', 'grid-failure', 'water-contamination'],
      needs: ['Evacuation', 'Clean water', 'Medical / decontamination', 'Masks', 'Shelter', 'Power'] },
    infra:   { color: '#64748B', emoji: '🏗️', label: 'Infrastructure', types: ['building-collapse', 'bridge-collapse', 'road-washout', 'train', 'ship', 'aircraft', 'tunnel'],
      needs: ['Search & rescue', 'Medical / trauma', 'Heavy equipment', 'Blood', 'Shelter'] },
    agri:    { color: '#84CC16', emoji: '🌾', label: 'Agriculture',    types: ['locust', 'livestock-disease', 'crop-pest', 'fisheries'],
      needs: ['Pesticide / control', 'Veterinary help', 'Fodder', 'Crop protection', 'Compensation'] },
  },
  WORLD: { center: [20, 60], zoom: 3, minZoom: 2 },
};
