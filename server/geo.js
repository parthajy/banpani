// Country awareness for events outside Assam: an event's coordinates -> ISO2 country -> the right
// emergency number and the right news locale. Reverse-geocode is Nominatim (free, no key) and is
// cached by rounded coords for the process lifetime, so it never runs in a hot request path twice.

const revCache = new Map();   // "lat,lng" (1-decimal) -> ISO2 or null

export async function countryOf(lat, lng) {
  if (lat == null || lng == null) return null;
  const key = (+lat).toFixed(1) + ',' + (+lng).toFixed(1);
  if (revCache.has(key)) return revCache.get(key);
  let cc = null;
  try {
    const u = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=3&lat=${+lat}&lon=${+lng}`;
    const r = await fetch(u, { headers: { 'user-agent': 'Banpani/1.0 (+https://banpani.org)' } });
    if (r.ok) { const j = await r.json(); cc = ((j.address && j.address.country_code) || '').toUpperCase() || null; }
  } catch { /* offline / rate-limited: fall back to null (universal 112 + global English) */ }
  revCache.set(key, cc);
  return cc;
}

// National emergency line + a family-relevant line where we're confident of the number. Countries
// not listed fall back to the GSM-standard 112 (routes to local emergency on most mobile networks)
// with a plain "or your local number" hedge, and a number-free family label - never a wrong number.
const HELP = {
  IN: { name: 'India', emerg: '112', fam: { health: ['Ambulance (108)', '108'], fire: ['Fire (101)', '101'], water: ['Disaster - NDMA (108)', '108'], storm: ['Disaster - NDMA (108)', '108'], geo: ['Disaster - NDMA (108)', '108'] } },
  US: { name: 'United States', emerg: '911', fam: { health: ['Health - CDC-INFO', '18002324636'], water: ['Disaster - FEMA', '18006213362'], storm: ['Disaster - FEMA', '18006213362'], fire: ['Disaster - FEMA', '18006213362'], geo: ['Disaster - FEMA', '18006213362'] } },
  GB: { name: 'United Kingdom', emerg: '999', fam: { health: ['NHS non-emergency (111)', '111'] } },
  CA: { name: 'Canada', emerg: '911', fam: {} },
  AU: { name: 'Australia', emerg: '000', fam: { health: ['Healthdirect', '1800022222'] } },
  NZ: { name: 'New Zealand', emerg: '111', fam: {} },
  IE: { name: 'Ireland', emerg: '112', fam: {} },
  BD: { name: 'Bangladesh', emerg: '999', fam: {} },
  NP: { name: 'Nepal', emerg: '112', fam: { geo: ['Police (100)', '100'] } },
  LK: { name: 'Sri Lanka', emerg: '119', fam: {} },
  PK: { name: 'Pakistan', emerg: '1122', fam: {} },
  PH: { name: 'Philippines', emerg: '911', fam: {} },
  ID: { name: 'Indonesia', emerg: '112', fam: {} },
  MY: { name: 'Malaysia', emerg: '999', fam: {} },
  SG: { name: 'Singapore', emerg: '995', fam: {} },
  NG: { name: 'Nigeria', emerg: '112', fam: {} },
  KE: { name: 'Kenya', emerg: '999', fam: {} },
  ZA: { name: 'South Africa', emerg: '10111', fam: { health: ['Ambulance (10177)', '10177'] } },
  BR: { name: 'Brazil', emerg: '190', fam: { health: ['Ambulance (192)', '192'], fire: ['Fire (193)', '193'] } },
  MX: { name: 'Mexico', emerg: '911', fam: {} },
  CO: { name: 'Colombia', emerg: '123', fam: { health: ['Cruz Roja (132)', '132'], geo: ['Cruz Roja (132)', '132'] } },
  EC: { name: 'Ecuador', emerg: '911', fam: {} },
};

// EU-wide + much of the world route emergency calls through 112; list the ones people expect to see.
for (const cc of ['DE', 'FR', 'ES', 'IT', 'NL', 'BE', 'PT', 'SE', 'NO', 'FI', 'DK', 'PL', 'GR', 'AT', 'CH', 'TR'])
  HELP[cc] = HELP[cc] || { name: null, emerg: '112', fam: {} };

export function helplinesFor(family, cc) {
  const c = HELP[cc];
  const emerg = c ? c.emerg : '112';
  const label = c && c.name ? `Emergency - ${c.name} (${emerg})` : `Emergency (${emerg} - or your local number)`;
  const hl = [{ label, tel: emerg }];
  const extra = c && c.fam && c.fam[family];
  if (extra) hl.push({ label: extra[0], tel: extra[1] });
  return hl;
}

// Google News locale for the event's country, so a fire in California pulls US coverage, not Indian.
const NEWS_LOCALE = {
  IN: ['en-IN', 'IN'], US: ['en-US', 'US'], GB: ['en-GB', 'GB'], CA: ['en-CA', 'CA'], AU: ['en-AU', 'AU'],
  NZ: ['en-NZ', 'NZ'], IE: ['en-IE', 'IE'], BD: ['bn-BD', 'BD'], NP: ['ne-NP', 'NP'], LK: ['en-LK', 'LK'],
  PK: ['en-PK', 'PK'], PH: ['en-PH', 'PH'], ID: ['id-ID', 'ID'], MY: ['en-MY', 'MY'], SG: ['en-SG', 'SG'],
  NG: ['en-NG', 'NG'], KE: ['en-KE', 'KE'], ZA: ['en-ZA', 'ZA'], BR: ['pt-BR', 'BR'], MX: ['es-419', 'MX'],
  CO: ['es-419', 'CO'], EC: ['es-419', 'EC'], PE: ['es-419', 'PE'], CL: ['es-CL', 'CL'], AR: ['es-AR', 'AR'],
  DE: ['de-DE', 'DE'], FR: ['fr-FR', 'FR'], ES: ['es-ES', 'ES'], IT: ['it-IT', 'IT'], NL: ['nl-NL', 'NL'],
  PT: ['pt-PT', 'PT'], SE: ['sv-SE', 'SE'], PL: ['pl-PL', 'PL'], GR: ['el-GR', 'GR'], TR: ['tr-TR', 'TR'],
  JP: ['ja-JP', 'JP'],
};

// Official responders per country, shown on the event page and clearly separated from community
// reports. The posture: Banpani is a free extra tool for local responders, not a replacement.
const OFFICIAL = {
  CO: [
    { name: 'Cruz Roja Colombiana', url: 'https://www.cruzrojacolombiana.org' },
    { name: 'Defensa Civil Colombiana', url: 'https://www.defensacivil.gov.co' },
    { name: 'UNGRD - Gestión del Riesgo', url: 'https://portal.gestiondelriesgo.gov.co' },
    { name: 'Servicio Geológico Colombiano', url: 'https://www.sgc.gov.co' },
  ],
  IN: [
    { name: 'NDMA - National Disaster Management', url: 'https://ndma.gov.in' },
    { name: 'Indian Red Cross Society', url: 'https://indianredcross.org' },
  ],
};
export function officialSourcesFor(cc) { return OFFICIAL[cc] || []; }

export function newsLocale(cc) {
  const [hl, gl] = NEWS_LOCALE[cc] || ['en-US', 'US'];   // sensible default: global English coverage
  return { hl, gl, ceid: `${gl}:${hl.split('-')[0]}` };
}
