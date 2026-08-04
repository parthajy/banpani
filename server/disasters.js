// Disaster families — the colour system + taxonomy for the multi-disaster engine.
// KEEP IN SYNC with frontend/config.js DISASTERS (same keys, colours, types).
export const DISASTERS = {
  water:   { color: '#2E77FF', emoji: '💧', label: 'Water',          types: ['flood', 'flash-flood', 'urban-flood', 'coastal-flood', 'storm-surge', 'tsunami', 'dam-failure', 'glof'] },
  fire:    { color: '#F5551D', emoji: '🔥', label: 'Fire',           types: ['wildfire', 'urban-fire', 'industrial-fire', 'explosion', 'oil-spill'] },
  storm:   { color: '#8B5CF6', emoji: '🌪️', label: 'Storm & wind',   types: ['cyclone', 'hurricane', 'typhoon', 'tornado', 'thunderstorm', 'hailstorm', 'blizzard', 'ice-storm', 'dust-storm'] },
  geo:     { color: '#B4652A', emoji: '⛰️', label: 'Geological',     types: ['earthquake', 'landslide', 'mudslide', 'avalanche', 'volcano', 'sinkhole'] },
  climate: { color: '#EAB308', emoji: '☀️', label: 'Climate extreme', types: ['heatwave', 'coldwave', 'drought', 'water-scarcity'] },
  health:  { color: '#12B5A5', emoji: '🦠', label: 'Health',         types: ['pandemic', 'epidemic', 'outbreak'] },
  tech:    { color: '#D6409F', emoji: '☣️', label: 'Industrial',     types: ['chemical-leak', 'gas-leak', 'nuclear', 'grid-failure', 'water-contamination'] },
  infra:   { color: '#64748B', emoji: '🏗️', label: 'Infrastructure', types: ['building-collapse', 'bridge-collapse', 'road-washout', 'train', 'ship', 'aircraft', 'tunnel'] },
  agri:    { color: '#84CC16', emoji: '🌾', label: 'Agriculture',    types: ['locust', 'livestock-disease', 'crop-pest', 'fisheries'] },
};

export function familyOf(type) {
  type = type || 'flood';
  if (DISASTERS[type]) return type;
  for (const k in DISASTERS) if (DISASTERS[k].types.includes(type)) return k;
  return 'water';
}
