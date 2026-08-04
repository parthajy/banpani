// Disaster families — the colour system + taxonomy for the multi-disaster engine.
// KEEP IN SYNC with frontend/config.js DISASTERS (same keys, colours, types).
export const DISASTERS = {
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
    needs: ['Oxygen', 'Medicines', 'Hospital beds', 'Testing', 'Food delivery', 'Sanitation', 'Volunteers'] },
  tech:    { color: '#D6409F', emoji: '☣️', label: 'Industrial',     types: ['chemical-leak', 'gas-leak', 'nuclear', 'grid-failure', 'water-contamination'],
    needs: ['Evacuation', 'Clean water', 'Medical / decontamination', 'Masks', 'Shelter', 'Power'] },
  infra:   { color: '#64748B', emoji: '🏗️', label: 'Infrastructure', types: ['building-collapse', 'bridge-collapse', 'road-washout', 'train', 'ship', 'aircraft', 'tunnel'],
    needs: ['Search & rescue', 'Medical / trauma', 'Heavy equipment', 'Blood', 'Shelter'] },
  agri:    { color: '#84CC16', emoji: '🌾', label: 'Agriculture',    types: ['locust', 'livestock-disease', 'crop-pest', 'fisheries'],
    needs: ['Pesticide / control', 'Veterinary help', 'Fodder', 'Crop protection', 'Compensation'] },
};

export function familyOf(type) {
  type = type || 'flood';
  if (DISASTERS[type]) return type;
  for (const k in DISASTERS) if (DISASTERS[k].types.includes(type)) return k;
  return 'water';
}
