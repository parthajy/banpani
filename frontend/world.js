/* Banpani world map (beta). One global map, everything is data, coloured by disaster
   family, filterable + searchable + reportable-from-anywhere. Reads/writes the same
   public API as the relief map. Standalone from app.js so it can never affect Assam. */
const C = window.BANPANI;
const $ = id => document.getElementById(id);
const FAM = C.DISASTERS;
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function deviceId() { let d = localStorage.getItem('banpani.device'); if (!d) { d = 'd-' + Math.random().toString(36).slice(2) + Date.now().toString(36); localStorage.setItem('banpani.device', d); } return d; }

const S = C.saved;              // client-side saved-events store
const evBySlug = {};            // slug -> minimal event, so a saved bookmark can be rebuilt from a popup

// which family a disaster_type belongs to (accepts a family key directly, else looks it up)
function familyOf(type) { type = type || 'flood'; if (FAM[type]) return type; for (const k in FAM) if (FAM[k].types.includes(type)) return k; return 'water'; }

let toastT; function toast(m) { const t = $('wtoast'); t.textContent = m; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2600); }

// India-focused front door. The world is visible but greyed out; India is big and FIXED (unzoomable),
// filling the view on both mobile and desktop. Tapping a dot opens that response's own zoomable map.
// Zoomable, but leashed to India: minZoom keeps India filling the view, maxBounds stops it drifting off
// the country. This lets people search a town, zoom in, and drop a precise pin - while staying India-only.
const map = L.map('wmap', { zoomControl: true, attributionControl: false, zoomSnap: 0.25,
  minZoom: 4, maxZoom: 16, maxBounds: L.latLngBounds([[6.0, 67.0], [37.6, 98.0]]).pad(0.1), maxBoundsViscosity: 1.0 });
const FIT_INDIA = [[6.6, 68.0], [35.6, 97.4]];
function fitIndia() { map.fitBounds(FIT_INDIA, { padding: [10, 10] }); }
fitIndia();
window.addEventListener('resize', () => { clearTimeout(window._wfit); window._wfit = setTimeout(() => map.invalidateSize(), 150); });
if (window.attachFullscreen) window.attachFullscreen(document.getElementById('wexpandBtn'), document.documentElement, map);   // full-screen the India map
C.addBasemap(map);   // CARTO Dark Matter, auto-falls back to OSM if it ever fails
// Spotlight India: grey out everything OUTSIDE India (a big rectangle with India cut out as a hole),
// so it reads as "India is in scope, the rest is out of scope". File coords are [lng,lat].
fetch('data/india-outline.json').then(r => r.json()).then(rings => {
  const outer = [[-40, 30], [-40, 140], [60, 140], [60, 30]];              // [lat,lng] rect over the whole view
  const holes = rings.map(r => r.map(p => [p[1], p[0]]));                  // India rings, swapped to [lat,lng]
  // Soft grey so the world's countries stay visible underneath but read as out-of-scope; India (the
  // hole) shows the full dark basemap and pops. A faint outline frames India.
  L.polygon([outer, ...holes], { stroke: false, fill: true, fillColor: '#aeb6bf', fillOpacity: 0.6, interactive: false }).addTo(map);
  holes.forEach(h => L.polyline(h, { color: '#5b6470', weight: 1, opacity: 0.6, interactive: false }).addTo(map));
}).catch(() => {});

const active = new Set(Object.keys(FAM));   // all families visible by default
const pins = [];                            // { marker, family }
const group = L.layerGroup().addTo(map);

// Live rain radar (RainViewer, free, no key): where it is raining hard right now = danger forming.
let rainLayer = null;
window.toggleRain = async function () {
  const btn = $('wrainBtn');
  if (rainLayer) { map.removeLayer(rainLayer); rainLayer = null; if (btn) btn.classList.remove('on'); return false; }
  try {
    const j = await (await fetch('https://api.rainviewer.com/public/weather-maps.json')).json();
    const past = (j.radar && j.radar.past) || [];
    const f = past[past.length - 1];
    if (!f) { toast('Rain data unavailable'); return false; }
    rainLayer = L.tileLayer(j.host + f.path + '/256/{z}/{x}/{y}/2/1_1.png', { opacity: 0.6, zIndex: 350, attribution: 'Rain radar © RainViewer' }).addTo(map);
    if (btn) btn.classList.add('on');
    toast('Live rain radar on - blue/green = rain, red = intense');
  } catch { toast('Could not load rain radar'); }
  return false;
};

// Live heatwave alerts: today's forecast max temperature for major Indian cities (Open-Meteo, free, no key).
// Cities at 40C+ glow orange->red, so the gateway map shows where India is baking right now.
let heatLayer = null;
const HEAT_CITIES = [
  { n: 'Delhi', lat: 28.61, lng: 77.21 }, { n: 'Mumbai', lat: 19.07, lng: 72.87 }, { n: 'Kolkata', lat: 22.57, lng: 88.36 },
  { n: 'Chennai', lat: 13.08, lng: 80.27 }, { n: 'Bengaluru', lat: 12.97, lng: 77.59 }, { n: 'Hyderabad', lat: 17.38, lng: 78.48 },
  { n: 'Ahmedabad', lat: 23.02, lng: 72.57 }, { n: 'Pune', lat: 18.52, lng: 73.85 }, { n: 'Jaipur', lat: 26.91, lng: 75.79 },
  { n: 'Lucknow', lat: 26.85, lng: 80.95 }, { n: 'Kanpur', lat: 26.45, lng: 80.33 }, { n: 'Nagpur', lat: 21.15, lng: 79.09 },
  { n: 'Patna', lat: 25.59, lng: 85.14 }, { n: 'Indore', lat: 22.72, lng: 75.86 }, { n: 'Bhopal', lat: 23.26, lng: 77.41 },
  { n: 'Prayagraj', lat: 25.44, lng: 81.85 }, { n: 'Agra', lat: 27.18, lng: 78.01 }, { n: 'Varanasi', lat: 25.32, lng: 82.97 },
  { n: 'Ranchi', lat: 23.34, lng: 85.31 }, { n: 'Raipur', lat: 21.25, lng: 81.63 }, { n: 'Guwahati', lat: 26.14, lng: 91.74 },
  { n: 'Bhubaneswar', lat: 20.30, lng: 85.82 }, { n: 'Visakhapatnam', lat: 17.69, lng: 83.22 }, { n: 'Vijayawada', lat: 16.51, lng: 80.65 },
  { n: 'Coimbatore', lat: 11.02, lng: 76.96 }, { n: 'Madurai', lat: 9.93, lng: 78.12 }, { n: 'Kochi', lat: 9.93, lng: 76.27 },
  { n: 'Amritsar', lat: 31.63, lng: 74.87 }, { n: 'Ludhiana', lat: 30.90, lng: 75.86 }, { n: 'Jodhpur', lat: 26.24, lng: 73.02 },
  { n: 'Bikaner', lat: 28.02, lng: 73.31 }, { n: 'Gwalior', lat: 26.22, lng: 78.18 }, { n: 'Jabalpur', lat: 23.18, lng: 79.99 },
  { n: 'Surat', lat: 21.17, lng: 72.83 }, { n: 'Nashik', lat: 19.99, lng: 73.79 }, { n: 'Srinagar', lat: 34.08, lng: 74.80 },
];
window.toggleHeat = async function () {
  const btn = $('wheatBtn');
  if (heatLayer) { map.removeLayer(heatLayer); heatLayer = null; if (btn) btn.classList.remove('on'); return false; }
  try {
    const lats = HEAT_CITIES.map(c => c.lat).join(','), lngs = HEAT_CITIES.map(c => c.lng).join(',');
    const data = await (await fetch('https://api.open-meteo.com/v1/forecast?latitude=' + lats + '&longitude=' + lngs + '&daily=temperature_2m_max&forecast_days=1&timezone=auto')).json();
    const arr = Array.isArray(data) ? data : [data];
    heatLayer = L.layerGroup();
    let hot = 0, hottest = null;
    arr.forEach((d, i) => {
      const c = HEAT_CITIES[i]; if (!c) return;
      const t = d && d.daily && d.daily.temperature_2m_max && d.daily.temperature_2m_max[0];
      if (t == null) return;
      if (!hottest || t > hottest.t) hottest = { n: c.n, t };
      if (t < 37) return;   // below "hot" - don't clutter the map (most of India in the monsoon)
      if (t >= 40) hot++;
      const color = t >= 45 ? '#c81e1e' : t >= 42 ? '#f5551d' : t >= 40 ? '#f59e0b' : '#eab308';
      const level = t >= 45 ? 'Severe heatwave' : t >= 42 ? 'Heatwave' : t >= 40 ? 'Heatwave level' : 'Hot';
      L.circleMarker([c.lat, c.lng], { radius: 7 + Math.min(10, t - 37), weight: 1, color: '#0b0f14', fillColor: color, fillOpacity: .5 })
        .bindPopup(`<b>🌡️ ${esc(c.n)}</b><br><b style="color:${color};font-size:15px">${Math.round(t)}°C</b> forecast today<br><span style="color:${color};font-weight:700">${level}</span><br><small>Source: Open-Meteo · official: IMD. Heatwave = 40°C+ in the plains.</small>`)
        .addTo(heatLayer);
    });
    heatLayer.addTo(map);
    if (btn) btn.classList.add('on');
    toast(hot ? `Heat layer on - ${hot} city(s) at heatwave level (40°C+) today`
      : hottest ? `Heat layer on - hottest now: ${hottest.n} ${Math.round(hottest.t)}°C. No heatwave-level heat, normal during the monsoon.`
        : 'Could not read temperatures right now');
  } catch { toast('Could not load heat data'); }
  return false;
};

// Live flood-risk on India's rivers: reads the server's auto GloFAS feed (/api/live?region=india) and
// plots the reaches at high/medium modelled risk. Same engine as the Assam and Bangladesh gauges.
let riskLayer = null;
window.toggleFloodRisk = async function () {
  const btn = $('wriskBtn');
  if (riskLayer) { map.removeLayer(riskLayer); riskLayer = null; if (btn) btn.classList.remove('on'); return false; }
  try {
    const j = await (await fetch((C.API || '') + '/api/live?region=india')).json();
    if (j && j.warming) { toast('Flood-risk feed is still warming up - try again in a minute'); return false; }
    const gauges = (j && j.gauges) || [];
    riskLayer = L.layerGroup();
    let n = 0;
    const num = x => (x != null ? Number(x).toLocaleString('en-IN') : 'n/a');
    gauges.forEach(g => {
      if (g.risk !== 'high' && g.risk !== 'medium') return;
      n++;
      const color = g.risk === 'high' ? '#e11d1d' : '#f59e0b';
      const arrow = g.trend === 'rising' ? '↑ rising' : g.trend === 'falling' ? '↓ falling' : '→ steady';
      const risingWarn = g.trend === 'rising' && g.peak != null && g.discharge != null && g.peak > g.discharge * 1.1
        ? `<br>⚠️ Still rising - modelled to peak near <b>${num(g.peak)} m³/s</b> within 7 days` : '';
      const popup = `<b>🌊 ${esc(g.station || g.river || 'River')}</b>`
        + `<br><b style="color:${color};text-transform:capitalize">${esc(g.risk)} flood risk</b> · ${esc(arrow)}`
        + `<br>Flow now: <b>${num(g.discharge)} m³/s</b> <small>(${g.pct}th percentile of the last 90 days)</small>`
        + risingWarn
        + `<br>Rain next 3 days: <b>${g.rain3} mm</b>`
        + `<br><a href="tel:112" style="color:${color};font-weight:700">Emergency 112</a> · <a href="tel:1078">Disaster 1078</a>`
        + `<br><small>Auto-updated ${esc(j.updated || '')} · GloFAS river model. A flood-RISK estimate, not an official count.</small>`;
      L.circleMarker([g.lat, g.lng], { radius: g.risk === 'high' ? 10 : 8, weight: 2, color, fillColor: color, fillOpacity: .3 })
        .bindPopup(popup).addTo(riskLayer);
    });
    riskLayer.addTo(map);
    if (btn) btn.classList.add('on');
    toast(n ? `Flood-risk layer on - ${n} river reach(es) elevated` : 'No river at elevated modelled risk right now');
  } catch { toast('Could not load flood-risk data'); }
  return false;
};

// Live drought stress: approximate dryness (soil moisture + last-14-day rain) for India's drought-prone
// belts, from Open-Meteo. Labelled as an estimate, not an official IMD drought declaration.
let droughtLayer = null;
const DROUGHT_POINTS = [
  { n: 'Aurangabad', lat: 19.88, lng: 75.34 }, { n: 'Beed', lat: 18.99, lng: 75.76 }, { n: 'Latur', lat: 18.40, lng: 76.58 },
  { n: 'Osmanabad', lat: 18.19, lng: 76.04 }, { n: 'Amravati', lat: 20.93, lng: 77.75 }, { n: 'Yavatmal', lat: 20.39, lng: 78.13 },
  { n: 'Kalaburagi', lat: 17.33, lng: 76.83 }, { n: 'Vijayapura', lat: 16.83, lng: 75.71 }, { n: 'Ballari', lat: 15.14, lng: 76.92 },
  { n: 'Raichur', lat: 16.20, lng: 77.36 }, { n: 'Anantapur', lat: 14.68, lng: 77.60 }, { n: 'Kurnool', lat: 15.83, lng: 78.04 },
  { n: 'Kadapa', lat: 14.47, lng: 78.82 }, { n: 'Mahbubnagar', lat: 16.74, lng: 78.00 }, { n: 'Nalgonda', lat: 17.05, lng: 79.27 },
  { n: 'Jhansi', lat: 25.45, lng: 78.57 }, { n: 'Banda', lat: 25.48, lng: 80.34 }, { n: 'Chhatarpur', lat: 24.92, lng: 79.59 },
  { n: 'Tikamgarh', lat: 24.74, lng: 78.83 }, { n: 'Bhawanipatna', lat: 19.91, lng: 83.16 }, { n: 'Bolangir', lat: 20.71, lng: 83.48 },
  { n: 'Rajkot', lat: 22.30, lng: 70.80 }, { n: 'Bhuj', lat: 23.25, lng: 69.67 }, { n: 'Jamnagar', lat: 22.47, lng: 70.06 },
  { n: 'Barmer', lat: 25.75, lng: 71.39 }, { n: 'Jaisalmer', lat: 26.92, lng: 70.92 }, { n: 'Bikaner', lat: 28.02, lng: 73.31 },
  { n: 'Nagaur', lat: 27.20, lng: 73.73 }, { n: 'Ramanathapuram', lat: 9.37, lng: 78.83 }, { n: 'Thoothukudi', lat: 8.76, lng: 78.13 },
];
window.toggleDrought = async function () {
  const btn = $('wdroughtBtn');
  if (droughtLayer) { map.removeLayer(droughtLayer); droughtLayer = null; if (btn) btn.classList.remove('on'); return false; }
  try {
    const lats = DROUGHT_POINTS.map(c => c.lat).join(','), lngs = DROUGHT_POINTS.map(c => c.lng).join(',');
    const data = await (await fetch('https://api.open-meteo.com/v1/forecast?latitude=' + lats + '&longitude=' + lngs + '&hourly=soil_moisture_0_to_7cm,soil_moisture_7_to_28cm&daily=precipitation_sum&past_days=14&forecast_days=1&timezone=auto')).json();
    const arr = Array.isArray(data) ? data : [data];
    const avgTail = (a, k) => { if (!a) return null; const v = a.filter(x => x != null); if (!v.length) return null; const s = v.slice(-k); return s.reduce((x, y) => x + y, 0) / s.length; };
    droughtLayer = L.layerGroup();
    let dry = 0;
    arr.forEach((d, i) => {
      const c = DROUGHT_POINTS[i]; if (!c || !d) return;
      const h = d.hourly || {};
      const sm07 = avgTail(h.soil_moisture_0_to_7cm, 24), sm728 = avgTail(h.soil_moisture_7_to_28cm, 24);
      const sm = sm07 != null && sm728 != null ? (sm07 + sm728) / 2 : (sm07 != null ? sm07 : sm728);
      if (sm == null) return;
      const rain14 = d.daily && d.daily.precipitation_sum ? d.daily.precipitation_sum.reduce((a, b) => a + (b || 0), 0) : 0;
      let level = null, color = null;
      if (sm < 0.09 && rain14 < 12) { level = 'Severe dry'; color = '#8a4b1a'; }
      else if (sm < 0.15 && rain14 < 35) { level = 'Dry stress'; color = '#c98a3a'; }
      if (!level) return;
      dry++;
      L.circleMarker([c.lat, c.lng], { radius: level === 'Severe dry' ? 10 : 8, weight: 1, color: '#0b0f14', fillColor: color, fillOpacity: .5 })
        .bindPopup(`<b>🏜️ ${esc(c.n)}</b><br><span style="color:${color};font-weight:700">${level}</span><br>Soil moisture ~${Math.round(sm * 100)}% · ${Math.round(rain14)}mm rain in 14 days<br><small>Approximate (soil moisture + rainfall, Open-Meteo) · official: IMD</small>`)
        .addTo(droughtLayer);
    });
    droughtLayer.addTo(map);
    if (btn) btn.classList.add('on');
    toast(dry ? `Drought-stress layer on - ${dry} area(s) dry` : 'No notable dry-stress areas right now');
  } catch { toast('Could not load drought data'); }
  return false;
};

// Live earthquakes: USGS feed of M2.5+ quakes in the last 7 days, filtered to India and its neighbouring
// seismic zones (Himalaya, Hindu Kush, Andaman). Shows where the ground has actually moved, in near-real-time.
let quakeLayer = null;
window.toggleQuakes = async function () {
  const btn = $('wquakeBtn');
  if (quakeLayer) { map.removeLayer(quakeLayer); quakeLayer = null; if (btn) btn.classList.remove('on'); return false; }
  try {
    const j = await (await fetch('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_week.geojson')).json();
    const feats = (j && j.features) || [];
    quakeLayer = L.layerGroup();
    let n = 0, biggest = 0;
    feats.forEach(f => {
      const c = f.geometry && f.geometry.coordinates; if (!c) return;
      const lng = c[0], lat = c[1], depth = c[2], m = f.properties && f.properties.mag;
      if (m == null || lat < 5 || lat > 40 || lng < 65 || lng > 100) return;   // India + neighbouring zones
      n++; if (m > biggest) biggest = m;
      const color = m >= 6 ? '#c81e1e' : m >= 5 ? '#f5551d' : m >= 4 ? '#f59e0b' : '#eab308';
      const ageH = Math.round((Date.now() - f.properties.time) / 3.6e6);
      const ageStr = ageH < 1 ? 'just now' : ageH < 24 ? ageH + 'h ago' : Math.round(ageH / 24) + 'd ago';
      L.circleMarker([lat, lng], { radius: 4 + m * 2, weight: 1.5, color, fillColor: color, fillOpacity: .25 })
        .bindPopup(`<b>🫨 M${m.toFixed(1)} earthquake</b><br>${esc(f.properties.place || 'Location unknown')}<br>Depth ${Math.round(depth)} km · ${ageStr}<br><small>Source: USGS (live)</small><br><a href="${esc(f.properties.url || '#')}" target="_blank" rel="noopener" style="color:${color};font-weight:700">USGS details →</a>`)
        .addTo(quakeLayer);
    });
    quakeLayer.addTo(map);
    if (btn) btn.classList.add('on');
    toast(n ? `Earthquakes on - ${n} quake(s) M2.5+ near India in 7 days (biggest M${biggest.toFixed(1)})` : 'No M2.5+ quakes near India in the last 7 days');
  } catch { toast('Could not load earthquake data'); }
  return false;
};

const dot = (lat, lng, color, popup, radius = 7, unconfirmed = false) => L.circleMarker([lat, lng], {
  radius, weight: unconfirmed ? 2 : 1.5, color: unconfirmed ? color : '#0b0f14',
  fillColor: color, fillOpacity: unconfirmed ? .3 : .9, dashArray: unconfirmed ? '2 3' : null,
}).bindPopup(popup);
// Pulsing ring under an active response, in its disaster-family colour, so live crises draw the eye.
const pulseMarker = (lat, lng, color) => L.marker([lat, lng], { interactive: false, zIndexOffset: -100,
  icon: L.divIcon({ className: '', iconSize: [30, 30], iconAnchor: [15, 15], html: `<span class="pulse-ring" style="background:${color}"></span>` }) });
const INDIA_B = (C.INDIA && C.INDIA.bounds) || [[6, 67], [37.6, 98]];
const inIndia = (lat, lng) => lat != null && lng != null && lat >= INDIA_B[0][0] && lat <= INDIA_B[1][0] && lng >= INDIA_B[0][1] && lng <= INDIA_B[1][1];
// These flagship responses live at their own URLs but are NOT shown on the India front door.
const FOREIGN = new Set(['colombia-earthquake-2026', 'bangladesh-floods-2026']);

function render() {
  group.clearLayers();
  let shown = 0;
  for (const p of pins) if (active.has(p.family)) { p.marker.addTo(group); shown++; }
  $('wc').textContent = shown;
}
// The world map layers two things: community EVENTS (solid dots, one per clustered report
// group, sized by count) and OFFICIAL signals (dashed rings, from GDACS) so it's never empty.
async function load() {
  pins.length = 0;
  try {
    const evs = (await (await fetch((C.API || '') + '/api/events')).json()).events || [];
    evs.forEach(ev => {
      if (FOREIGN.has(ev.slug) || !inIndia(ev.lat, ev.lng)) return;   // India front door only
      const f = FAM[ev.family] || FAM.water;
      const radius = 6 + Math.min(16, Math.sqrt(ev.reports || 1) * 3.2);
      evBySlug[ev.slug] = { slug: ev.slug, title: ev.title, family: ev.family, emoji: f.emoji };
      const sv = S.has(ev.slug), dormant = ev.status === 'dormant';
      const note = dormant
        ? `<br><span style="color:#c9a227;font-size:12px">⏳ Winding down - no recent activity. Still happening? <a href="#" onclick="return reopenEvent('${esc(ev.slug)}')" style="color:#c9a227;font-weight:700">Reopen</a> (${ev.reopenVotes || 0}/10)</span>`
        : ev.unconfirmed
          ? `<br><span style="color:#c9a227;font-size:12px">⏳ Unconfirmed - needs a 2nd report or a confirmation to be verified.</span>` : '';
      const popup = `<b>${f.emoji} ${esc(ev.title)}</b><br>${ev.reports} report(s)${ev.confirmations ? ' · ' + ev.confirmations + ' confirmed' : ''}${note}<br><span style="color:${f.color};font-weight:700">${esc(f.label)}</span><br><a href="/e/${ev.slug}" style="color:${f.color};font-weight:700">Open coordination page →</a><br><a href="#" onclick="return toggleSave('${esc(ev.slug)}',this)" style="color:#c9a227;font-size:12px">${sv ? '★ Saved' : '☆ Save'}</a> · <a href="#" onclick="return flagEvent('${esc(ev.slug)}')" style="color:#8a94a6;font-size:12px">⚑ Flag</a>`;
      pins.push({ marker: dot(ev.lat, ev.lng, f.color, popup, radius, ev.unconfirmed || dormant), family: ev.family });
      if (!dormant && !ev.unconfirmed) pins.push({ marker: pulseMarker(ev.lat, ev.lng, f.color), family: ev.family });   // live response pulses
    });
  } catch {}
  try {
    const off = (await (await fetch((C.API || '') + '/api/official')).json()).official || [];
    off.forEach(o => {
      if (!inIndia(o.lat, o.lng)) return;   // India front door only
      const f = FAM[o.family] || FAM.water;
      const m = L.circleMarker([o.lat, o.lng], { radius: 12, weight: 3, color: f.color, opacity: .95, fillColor: f.color, fillOpacity: .1, dashArray: '3 4' })
        .bindPopup(`<b>🛰️ ${esc(o.title)}</b><br><span style="color:${f.color};font-weight:700">${esc(f.label)}</span> · <b style="text-transform:capitalize">${esc(o.level)}</b> alert<br><small>Official signal - GDACS${o.country ? ' · ' + esc(o.country) : ''}</small><br><a href="${esc(o.url)}" target="_blank" rel="noopener">Official report →</a>`);
      pins.push({ marker: m, family: o.family, official: true });
    });
  } catch {}
  render();
}

// filter / legend chips (also the colour key)
$('wfilters').innerHTML = Object.entries(FAM).map(([k, v]) => `<button class="wchip on" data-k="${k}" style="--c:${v.color}">${v.emoji} ${v.label}</button>`).join('');
$('wfilters').querySelectorAll('.wchip').forEach(b => b.onclick = () => {
  const k = b.dataset.k;
  if (active.has(k)) { active.delete(k); b.classList.remove('on'); } else { active.add(k); b.classList.add('on'); }
  render();
});

// global place search
let st, smarker;
$('wsearch').oninput = () => {
  clearTimeout(st);
  const q = $('wsearch').value.trim(), box = $('wresults');
  if (q.length < 2) { box.classList.remove('show'); return; }
  st = setTimeout(async () => {
    let list = [];
    try { list = (await (await fetch((C.API || '') + '/api/geocode?world=1&q=' + encodeURIComponent(q))).json()).results || []; } catch {}
    if (!list.length) { box.classList.remove('show'); return; }
    box.innerHTML = list.map(x => `<div class="sr" data-lat="${x.lat}" data-lng="${x.lng}" data-name="${esc(x.name)}">🔎 ${esc(x.name.split(',')[0])}<div class="sub">${esc(x.name)}</div></div>`).join('');
    box.classList.add('show');
    box.querySelectorAll('.sr').forEach(el => el.onclick = () => {
      // Zoom to the searched place so people can drop a precise pin there (search Jorhat -> zoom -> Report).
      const lat = +el.dataset.lat, lng = +el.dataset.lng;
      if (smarker) smarker.remove();
      smarker = L.marker([lat, lng]).addTo(map).bindPopup(esc(el.dataset.name || 'Selected place') + '<br><small>Tap ＋ Report to drop a pin here</small>').openPopup();
      map.flyTo([lat, lng], 11, { duration: 0.8 });
      box.classList.remove('show'); $('wsearch').value = el.dataset.name || '';
    });
  }, 300);
};
document.addEventListener('click', e => { if (!e.target.closest('.wsearch-wrap')) $('wresults').classList.remove('show'); });

/* ---------------- report a disaster from anywhere ---------------- */
let placing = false, repMarker = null, repFam = null, repNeeds = new Set();
$('wr_fam').innerHTML = Object.entries(FAM).map(([k, v]) => `<button type="button" data-k="${k}" style="--c:${v.color}">${v.emoji} ${v.label}</button>`).join('');
$('wr_fam').querySelectorAll('button').forEach(b => b.onclick = () => {
  $('wr_fam').querySelectorAll('button').forEach(x => x.classList.remove('on')); b.classList.add('on'); repFam = b.dataset.k;
  buildNeeds(repFam);   // recipe: show this family's relevant needs
});
// per-family need chips (the "disasters are recipes" mechanic)
function buildNeeds(fam) {
  repNeeds.clear();
  const needs = (FAM[fam] && FAM[fam].needs) || [];
  $('wr_needs').innerHTML = needs.map(n => `<button type="button" data-n="${esc(n)}">${esc(n)}</button>`).join('');
  $('wr_needs').querySelectorAll('button').forEach(b => b.onclick = () => {
    const n = b.dataset.n;
    if (repNeeds.has(n)) { repNeeds.delete(n); b.classList.remove('on'); } else { repNeeds.add(n); b.classList.add('on'); }
  });
}
$('wreportBtn').onclick = () => { placing = true; $('whint').classList.add('show'); };
map.on('click', e => { if (!placing) return; placing = false; $('whint').classList.remove('show'); openReport(e.latlng); });
function openReport(ll) {
  if (repMarker) repMarker.remove();
  repMarker = L.marker(ll, { draggable: true }).addTo(map);
  repFam = null; repNeeds.clear(); $('wr_fam').querySelectorAll('button').forEach(x => x.classList.remove('on')); $('wr_needs').innerHTML = '';
  $('wr_place').value = ''; $('wr_details').value = '';
  $('wreportPanel').classList.add('show');
}
function closeReport() { $('wreportPanel').classList.remove('show'); if (repMarker) { repMarker.remove(); repMarker = null; } placing = false; $('whint').classList.remove('show'); }
$('wr_cancel').onclick = closeReport;
$('wr_submit').onclick = async () => {
  if (!repFam) return toast('Pick a disaster type');
  if (!$('wr_place').value.trim()) return toast('Add a place name');
  if (!repMarker) return;
  const ll = repMarker.getLatLng();
  try {
    const res = await fetch((C.API || '') + '/api/reports', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ place: $('wr_place').value.trim(), lat: ll.lat, lng: ll.lng, disaster_type: FAM[repFam].types[0], items: [...repNeeds], details: $('wr_details').value.trim(), device: deviceId() })
    });
    if (!res.ok) throw 0;
    $('wreportPanel').classList.remove('show'); repMarker.remove(); repMarker = null;
    toast('Posted 🌍 - thank you for helping the map');
    await load(false);
  } catch { toast('Could not post - try again'); }
};

// Saved events (client-side bookmarks). ★ Save from any popup; the Saved sheet lists them.
function updateSavedBtn() { const n = S.list().length; $('wsavedBtn').textContent = n ? `★ Saved (${n})` : '★ Saved'; }
function renderSaved() {
  const l = S.list(), box = $('wsaved_list');
  box.innerHTML = l.length
    ? l.map(e => `<div class="wsaved-item"><a href="/e/${esc(e.slug)}">${esc(e.emoji || '')} ${esc(e.title)}</a><button class="rm" onclick="return unsave('${esc(e.slug)}')" title="Remove">✕</button></div>`).join('')
    : '<div class="wsaved-empty">No saved events yet. Open any event and tap <b>☆ Save</b> to keep it here - stored only on this device, no account.</div>';
}
window.toggleSave = function (slug, el) {
  const ev = evBySlug[slug]; if (!ev) return false;
  const nowSaved = S.toggle(ev);
  if (el) { el.textContent = nowSaved ? '★ Saved' : '☆ Save'; }
  toast(nowSaved ? '★ Saved - see it under ★ Saved' : 'Removed from Saved');
  updateSavedBtn(); renderSaved();
  return false;
};
window.unsave = function (slug) { S.remove(slug); updateSavedBtn(); renderSaved(); return false; };
$('wsavedBtn').onclick = () => { renderSaved(); $('wsavedPanel').classList.toggle('show'); return false; };
$('wsaved_close').onclick = () => $('wsavedPanel').classList.remove('show');
updateSavedBtn();

// Community flag: one tap reports an event as fake/duplicate/wrong. Three distinct devices hide it.
window.flagEvent = async function (slug) {
  if (!confirm('Flag this event as fake, duplicate, or wrong? A few flags will hide it from the map.')) return false;
  try {
    const res = await fetch((C.API || '') + '/api/events/' + encodeURIComponent(slug) + '/flag', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ device: deviceId() })
    });
    const j = await res.json();
    toast(j.hidden ? 'Flagged - this event has been hidden. Thank you.' : 'Flag recorded - thank you.');
    if (j.hidden) await load(false);
  } catch { toast('Could not flag - try again'); }
  return false;
};

// Community reopen: bring a dormant (winding-down) response back to active. 10 distinct devices.
window.reopenEvent = async function (slug) {
  try {
    const res = await fetch((C.API || '') + '/api/events/' + encodeURIComponent(slug) + '/reopen', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ device: deviceId() })
    });
    const j = await res.json();
    if (!res.ok) throw 0;
    toast(j.reopened ? 'Reopened - thank you.' : `Reopen vote recorded (${j.votes || 0}/${j.need || 10}).`);
    if (j.reopened) await load(false);
  } catch { toast('Could not reopen - try again'); }
  return false;
};

// header hamburger menu (Assam map / About / Privacy)
(function () {
  const b = $('wmenuBtn'), m = $('wmenu');
  if (!b || !m) return;
  b.onclick = e => { e.stopPropagation(); m.classList.toggle('show'); };
  document.addEventListener('click', e => { if (!m.contains(e.target) && !b.contains(e.target)) m.classList.remove('show'); });
  m.addEventListener('click', () => m.classList.remove('show'));
  document.addEventListener('keydown', e => { if (e.key === 'Escape') m.classList.remove('show'); });
})();

// Collapsible legend - what every marker and live layer means.
(function () {
  const b = $('wlegendBtn'), p = $('wlegend'), x = $('wlegendX');
  if (!b || !p) return;
  b.onclick = () => p.hidden = !p.hidden;
  if (x) x.onclick = () => p.hidden = true;
})();

// Share the India map (native share sheet, or copy the link as a fallback).
const wshare = $('wshareBtn');
if (wshare) wshare.onclick = async () => {
  const url = location.origin + '/';
  const text = 'Banpani - live India disaster map. See who needs help and where nobody has reached: ' + url;
  try {
    if (navigator.share) { await navigator.share({ title: 'Banpani - India disaster map', text, url }); return; }
    await navigator.clipboard.writeText(url); toast('Link copied - share it anywhere');
  } catch {}
};
// Guide: open the how-to video (defaults to the flood tutorial).
const wguide = $('wguideBtn');
if (wguide) wguide.onclick = () => {
  const id = (C.TUTORIAL_VIDEO && C.TUTORIAL_VIDEO.water) || '';
  window.open(id ? 'https://www.youtube.com/watch?v=' + id : '/how-it-works', '_blank', 'noopener');
};

load();
