// Banpani front-end config. Edit this one file to point at your server / change map tiles.
window.BANPANI = {
  API: '',   // '' = same origin (the Node server serves this page too)

  TILE_URL: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  TILE_ATTR: '© OpenStreetMap contributors',
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
  ACCEPTS: ['Dry food', 'Water', 'Clothes', 'Blankets', 'Medicines', 'Tarpaulin', 'Baby food', 'Cash'],
  FOCUS: ['rescue', 'food', 'water', 'medical', 'shelter', 'sanitation', 'cattle', 'rebuild'],
};
