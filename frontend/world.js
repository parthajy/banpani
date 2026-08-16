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
const map = L.map('wmap', { zoomControl: false, attributionControl: false, scrollWheelZoom: false,
  doubleClickZoom: false, touchZoom: false, boxZoom: false, keyboard: false, dragging: false, zoomSnap: 0.05 });
const FIT_INDIA = [[6.6, 68.0], [35.6, 97.4]];
function fitIndia() { map.fitBounds(FIT_INDIA, { padding: [10, 10] }); }
fitIndia();
window.addEventListener('resize', () => { clearTimeout(window._wfit); window._wfit = setTimeout(fitIndia, 150); });
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
      // The India map is fixed, so don't move it - just mark the searched place (India fills the view).
      if (smarker) smarker.remove(); smarker = L.marker([+el.dataset.lat, +el.dataset.lng]).addTo(map).bindPopup(esc(el.dataset.name || 'Selected place')).openPopup();
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

load();
