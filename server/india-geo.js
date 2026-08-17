// Lightweight India geography helpers - no dependencies, no big datasets. A point is labelled with the
// nearest state/UT centroid (approximate near borders, but fine for a state-level tracker) and tested
// against India's bounding box. Used by the pan-India disaster tracker.
export const STATES = [
  { s: 'Andhra Pradesh', lat: 15.9, lng: 79.7 }, { s: 'Arunachal Pradesh', lat: 28.2, lng: 94.7 },
  { s: 'Assam', lat: 26.2, lng: 92.9 }, { s: 'Bihar', lat: 25.8, lng: 85.5 },
  { s: 'Chhattisgarh', lat: 21.3, lng: 81.9 }, { s: 'Goa', lat: 15.4, lng: 74.0 },
  { s: 'Gujarat', lat: 22.7, lng: 71.8 }, { s: 'Haryana', lat: 29.2, lng: 76.3 },
  { s: 'Himachal Pradesh', lat: 31.9, lng: 77.2 }, { s: 'Jharkhand', lat: 23.6, lng: 85.3 },
  { s: 'Karnataka', lat: 15.0, lng: 76.0 }, { s: 'Kerala', lat: 10.5, lng: 76.3 },
  { s: 'Madhya Pradesh', lat: 23.5, lng: 78.4 }, { s: 'Maharashtra', lat: 19.4, lng: 76.5 },
  { s: 'Manipur', lat: 24.7, lng: 93.9 }, { s: 'Meghalaya', lat: 25.5, lng: 91.4 },
  { s: 'Mizoram', lat: 23.3, lng: 92.8 }, { s: 'Nagaland', lat: 26.1, lng: 94.5 },
  { s: 'Odisha', lat: 20.6, lng: 84.9 }, { s: 'Punjab', lat: 31.0, lng: 75.4 },
  { s: 'Rajasthan', lat: 26.9, lng: 73.8 }, { s: 'Sikkim', lat: 27.5, lng: 88.5 },
  { s: 'Tamil Nadu', lat: 11.1, lng: 78.4 }, { s: 'Telangana', lat: 17.9, lng: 79.3 },
  { s: 'Tripura', lat: 23.7, lng: 91.6 }, { s: 'Uttar Pradesh', lat: 27.0, lng: 80.5 },
  { s: 'Uttarakhand', lat: 30.1, lng: 79.2 }, { s: 'West Bengal', lat: 23.5, lng: 87.8 },
  { s: 'Delhi', lat: 28.6, lng: 77.1 }, { s: 'Jammu & Kashmir', lat: 33.8, lng: 76.0 },
  { s: 'Ladakh', lat: 34.5, lng: 77.5 }, { s: 'Puducherry', lat: 11.9, lng: 79.8 },
  { s: 'Chandigarh', lat: 30.7, lng: 76.8 }, { s: 'Andaman & Nicobar', lat: 11.7, lng: 92.7 },
  { s: 'Dadra, Daman & Diu', lat: 20.3, lng: 73.0 }, { s: 'Lakshadweep', lat: 10.5, lng: 72.6 },
];

export const inIndia = (lat, lng) => lat != null && lng != null && lat >= 6 && lat <= 37.6 && lng >= 67 && lng <= 98;

export function stateOf(lat, lng) {
  if (lat == null || lng == null) return null;
  let best = null, bd = Infinity;
  for (const p of STATES) {
    const dlat = lat - p.lat, dlng = (lng - p.lng) * Math.cos(lat * Math.PI / 180);
    const d = dlat * dlat + dlng * dlng;
    if (d < bd) { bd = d; best = p; }
  }
  return best ? best.s : null;
}
