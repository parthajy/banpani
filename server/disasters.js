// Disaster families - colour + taxonomy + the TAILORED options each module offers per family.
// `needs` = report/demand items · `offerKinds` = supply (Offers module) · `facilityKinds` =
// what the "open / closed" Facility module lists. KEEP IN SYNC with frontend/config.js (needs).
export const DISASTERS = {
  water: {
    color: '#2E77FF', emoji: '💧', label: 'Water',
    types: ['flood', 'flash-flood', 'urban-flood', 'coastal-flood', 'storm-surge', 'tsunami', 'dam-failure', 'glof'],
    needs: ['Drinking water', 'Boat / rescue', 'Dry food', 'Medicines', 'Shelter', 'Sanitation', 'Baby food', 'Cattle feed'],
    offerKinds: [['boat', '🚤 Boat'], ['water', '💧 Water'], ['food', '🍚 Food'], ['medicine', '💊 Medicine'], ['shelter', '🏠 Shelter'], ['power', '🔌 Power'], ['other', '📦 Other']],
    facilityKinds: [['shelter', '⛺ Relief camp'], ['pharmacy', '💊 Pharmacy'], ['clinic', '🩺 Clinic'], ['shop', '🏪 Shop'], ['fuel', '⛽ Fuel'], ['water', '🚰 Water point']],
  },
  fire: {
    color: '#F5551D', emoji: '🔥', label: 'Fire',
    types: ['wildfire', 'urban-fire', 'industrial-fire', 'explosion', 'oil-spill'],
    needs: ['Evacuation help', 'Shelter', 'Masks / clean air', 'Drinking water', 'Medical / burns', 'Firefighting support', 'Animal rescue'],
    offerKinds: [['shelter', '🏠 Shelter'], ['transport', '🚗 Transport'], ['water', '💧 Water'], ['masks', '😷 Masks'], ['medical', '🩹 Medical'], ['other', '📦 Other']],
    facilityKinds: [['shelter', '⛺ Shelter'], ['clinic', '🩺 Clinic'], ['hospital', '🏥 Hospital'], ['shop', '🏪 Shop']],
  },
  storm: {
    color: '#8B5CF6', emoji: '🌪️', label: 'Storm & wind',
    types: ['cyclone', 'hurricane', 'typhoon', 'tornado', 'thunderstorm', 'hailstorm', 'blizzard', 'ice-storm', 'dust-storm'],
    needs: ['Evacuation help', 'Storm shelter', 'Roofing / tarpaulin', 'Drinking water', 'Food', 'Power line down', 'Tree / debris clearing', 'Boat / surge rescue', 'Medicines'],
    offerKinds: [['shelter', '🏠 Shelter'], ['water', '💧 Water'], ['food', '🍚 Food'], ['power', '🔌 Power restore'], ['clearing', '🪚 Debris clearing'], ['boat', '🚤 Boat'], ['other', '📦 Other']],
    facilityKinds: [['shelter', '⛺ Cyclone shelter'], ['shop', '🏪 Shop'], ['pharmacy', '💊 Pharmacy'], ['fuel', '⛽ Fuel']],
  },
  geo: {
    color: '#B4652A', emoji: '⛰️', label: 'Geological',
    types: ['earthquake', 'landslide', 'mudslide', 'avalanche', 'volcano', 'sinkhole'],
    needs: ['Search & rescue', 'People trapped', 'Medical / trauma', 'Drinking water', 'Food', 'Tents / shelter', 'Blankets', 'Heavy equipment', 'Sanitation', 'Power / lighting'],
    offerKinds: [['medical', '🩹 Medical'], ['blood', '🩸 Blood'], ['shelter', '🏠 Shelter'], ['water', '💧 Water'], ['equipment', '🚜 Equipment'], ['other', '📦 Other']],
    facilityKinds: [['hospital', '🏥 Hospital'], ['clinic', '🩺 Clinic'], ['shelter', '⛺ Shelter']],
  },
  climate: {
    color: '#EAB308', emoji: '☀️', label: 'Climate extreme',
    types: ['heatwave', 'coldwave', 'drought', 'water-scarcity'],
    needs: ['Drinking water', 'Cooling / shade', 'ORS / electrolytes', 'Medical', 'Fodder for livestock', 'Food'],
    offerKinds: [['water', '💧 Water'], ['fodder', '🌾 Fodder'], ['food', '🍚 Food'], ['other', '📦 Other']],
    facilityKinds: [['water', '🚰 Water point'], ['shop', '🏪 Shop'], ['clinic', '🩺 Clinic']],
  },
  // PANDEMIC / OUTBREAK - the coordination problem is finding SUPPLY (oxygen, beds, medicine) and
  // knowing which shops/clinics are OPEN. Tailored top to bottom; no flood-relief items.
  health: {
    color: '#12B5A5', emoji: '🦠', label: 'Health',
    types: ['pandemic', 'epidemic', 'outbreak'],
    needs: ['Oxygen', 'Hospital bed (ICU)', 'Medicines', 'Plasma / blood', 'Testing', 'Ambulance', 'Food / meals', 'Groceries / essentials', 'Home care', 'Vaccination help'],
    offerKinds: [['oxygen', '🫁 Oxygen'], ['beds', '🛏️ Beds'], ['plasma', '🩸 Plasma / blood'], ['medicine', '💊 Medicine'], ['ambulance', '🚑 Ambulance'], ['food', '🍚 Food / meals'], ['groceries', '🛒 Groceries'], ['volunteer', '🙋 Volunteer']],
    facilityKinds: [['pharmacy', '💊 Pharmacy'], ['grocery', '🛒 Grocery / ration'], ['hospital', '🏥 Hospital'], ['clinic', '🩺 Clinic'], ['testing', '🧪 Test centre'], ['vaccination', '💉 Vaccination'], ['oxygen', '🫁 Oxygen refill']],
  },
  tech: {
    color: '#D6409F', emoji: '☣️', label: 'Industrial',
    types: ['chemical-leak', 'gas-leak', 'nuclear', 'grid-failure', 'water-contamination'],
    needs: ['Evacuation', 'Clean water', 'Medical / decontamination', 'Masks', 'Shelter', 'Power'],
    offerKinds: [['transport', '🚗 Transport'], ['water', '💧 Clean water'], ['medical', '🩹 Medical'], ['masks', '😷 Masks'], ['shelter', '🏠 Shelter'], ['other', '📦 Other']],
    facilityKinds: [['hospital', '🏥 Hospital'], ['clinic', '🩺 Clinic'], ['shelter', '⛺ Shelter']],
  },
  infra: {
    color: '#64748B', emoji: '🏗️', label: 'Infrastructure',
    types: ['building-collapse', 'bridge-collapse', 'road-washout', 'train', 'ship', 'aircraft', 'tunnel'],
    needs: ['Search & rescue', 'Medical / trauma', 'Heavy equipment', 'Blood', 'Shelter'],
    offerKinds: [['medical', '🩹 Medical'], ['blood', '🩸 Blood'], ['equipment', '🚜 Equipment'], ['other', '📦 Other']],
    facilityKinds: [['hospital', '🏥 Hospital'], ['clinic', '🩺 Clinic']],
  },
  agri: {
    color: '#84CC16', emoji: '🌾', label: 'Agriculture',
    types: ['locust', 'livestock-disease', 'crop-pest', 'fisheries'],
    needs: ['Pesticide / control', 'Veterinary help', 'Fodder', 'Crop protection', 'Compensation'],
    offerKinds: [['pesticide', '🧴 Pesticide'], ['sprayer', '💦 Sprayer'], ['fodder', '🌾 Fodder'], ['veterinary', '🐄 Veterinary'], ['other', '📦 Other']],
    facilityKinds: [['veterinary', '🐄 Vet centre'], ['shop', '🏪 Agri shop']],
  },
};

// The "danger zone" (hazard) module - generalized from flood extent. Same mechanism (a place +
// severity marker), retitled per disaster. Only families here get the module. Severity KEYS stay
// high/medium/receding/receded (server + colours unchanged); only the labels differ.
export const HAZARD = {
  water: { label: 'Flood', sev: [['high', 'Severe'], ['medium', 'Moderate'], ['receding', 'Receding'], ['receded', 'Water gone']] },
  fire:  { label: 'Fire zone', sev: [['high', 'Active'], ['medium', 'Spreading'], ['receding', 'Contained'], ['receded', 'Out']] },
  storm: { label: 'Storm damage', sev: [['high', 'Severe'], ['medium', 'Moderate'], ['receding', 'Easing'], ['receded', 'Passed']] },
  geo:   { label: 'Damage', sev: [['high', 'Heavy damage'], ['medium', 'Some damage'], ['receding', 'Minor'], ['receded', 'Cleared']] },
  tech:  { label: 'Contamination', sev: [['high', 'Dangerous'], ['medium', 'Moderate'], ['receding', 'Easing'], ['receded', 'Cleared']] },
};

// Hazard "kinds" a family can mark on the map. A storm marks WIND and SURGE separately (a cyclone is a
// dual hazard); most families have a single kind. First entry is the default. Colours drive the map.
export const HAZARD_KINDS = {
  storm: [
    { k: 'wind', label: 'Wind / structural damage', emoji: '🌪️', color: '#8B5CF6' },
    { k: 'surge', label: 'Storm surge / flooding', emoji: '🌊', color: '#2E77FF' },
  ],
  fire: [
    { k: 'fire', label: 'Active fire / burn zone', emoji: '🔥', color: '#F5551D' },
    { k: 'smoke', label: 'Smoke / hazardous air', emoji: '💨', color: '#9CA3AF' },
  ],
  geo: [
    { k: 'collapse', label: 'Collapsed / damaged building', emoji: '🏚️', color: '#EF4444' },
    { k: 'landslide', label: 'Landslide / ground failure', emoji: '⛰️', color: '#B4652A' },
  ],
};
// Neutral group label for a multi-kind hazard tab (the kinds themselves are the sub-choices).
export const HAZARD_TAB = { storm: 'Storm hazards', fire: 'Fire & smoke', geo: 'Damage & landslides' };

// Per-subtype need lists, where one family's subtypes need OPPOSITE things (a heatwave vs a coldwave).
// Used when an event has no custom needs; falls back to the family's generic list otherwise.
export const TYPE_NEEDS = {
  drought:          ['Drinking water', 'Water tanker', 'Fodder for livestock', 'Cattle camp / care', 'Crop / farm support', 'Food ration', 'Work / MGNREGA'],
  'water-scarcity': ['Drinking water', 'Water tanker', 'Borewell / source repair', 'Fodder for livestock', 'Food ration'],
  heatwave:         ['Drinking water', 'ORS / electrolytes', 'Cooling / shade', 'Cool shelter (fan/AC)', 'Heat-stroke medical', 'Shade & water for cattle'],
  coldwave:         ['Blankets', 'Warm clothes', 'Night shelter', 'Firewood / heating', 'Hot food', 'Medical'],
};

// Family-level default search keywords, so EVERY event of a family indexes for its real terms even
// without a hand-written per-event SEO block. Appended to the event title in the generic SEO path.
export const FAMILY_KEYWORDS = {
  water: 'flood, flooding, flood relief, rescue, boat, drinking water, relief camp, evacuation',
  storm: 'cyclone, storm, wind damage, storm surge, landfall, IMD cyclone warning, super cyclone, gale, evacuation, cyclone shelter, roofing, power outage, tree fall, coastal flooding, relief',
  geo: 'earthquake, quake, tremor, aftershock, magnitude, epicentre, landslide, collapsed building, trapped, search and rescue, NDRF, Himalayan earthquake, seismic, relief',
  fire: 'wildfire, forest fire, bushfire, fire, evacuation, smoke, air quality, burns, firefighting, fire line, shelter, Uttarakhand forest fire, relief',
  climate: 'drought, heatwave, coldwave, water scarcity, water tanker, fodder, crop failure, cattle camp, cooling shelter, ORS, heat stroke, blankets, relief',
  health: 'outbreak, epidemic, oxygen, hospital bed, medicine, relief',
};

export function familyOf(type) {
  type = type || 'flood';
  if (DISASTERS[type]) return type;
  for (const k in DISASTERS) if (DISASTERS[k].types.includes(type)) return k;
  return 'water';
}
