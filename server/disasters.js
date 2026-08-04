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
    needs: ['Shelter', 'Drinking water', 'Food', 'Tarpaulin / roofing', 'Medicines', 'Power / lighting', 'Rescue'],
    offerKinds: [['shelter', '🏠 Shelter'], ['water', '💧 Water'], ['food', '🍚 Food'], ['power', '🔌 Power'], ['boat', '🚤 Boat'], ['other', '📦 Other']],
    facilityKinds: [['shelter', '⛺ Shelter'], ['shop', '🏪 Shop'], ['pharmacy', '💊 Pharmacy'], ['fuel', '⛽ Fuel']],
  },
  geo: {
    color: '#B4652A', emoji: '⛰️', label: 'Geological',
    types: ['earthquake', 'landslide', 'mudslide', 'avalanche', 'volcano', 'sinkhole'],
    needs: ['Search & rescue', 'Medical / trauma', 'Tents / shelter', 'Drinking water', 'Food', 'Blankets', 'Heavy equipment'],
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

export function familyOf(type) {
  type = type || 'flood';
  if (DISASTERS[type]) return type;
  for (const k in DISASTERS) if (DISASTERS[k].types.includes(type)) return k;
  return 'water';
}
