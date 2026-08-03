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
};
