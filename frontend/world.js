/* Banpani world map (beta). One global map, everything is data, coloured by disaster
   family, filterable + searchable + reportable-from-anywhere. Reads/writes the same
   public API as the relief map. Standalone from app.js so it can never affect Assam. */
const C = window.BANPANI;
const $ = id => document.getElementById(id);
const FAM = C.DISASTERS;
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function deviceId() { let d = localStorage.getItem('banpani.device'); if (!d) { d = 'd-' + Math.random().toString(36).slice(2) + Date.now().toString(36); localStorage.setItem('banpani.device', d); } return d; }

// which family a disaster_type belongs to (accepts a family key directly, else looks it up)
function familyOf(type) { type = type || 'flood'; if (FAM[type]) return type; for (const k in FAM) if (FAM[k].types.includes(type)) return k; return 'water'; }

let toastT; function toast(m) { const t = $('wtoast'); t.textContent = m; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2600); }

const map = L.map('wmap', { worldCopyJump: true, minZoom: C.WORLD.minZoom, maxZoom: 16, zoomControl: false })
  .setView(C.WORLD.center, C.WORLD.zoom);
L.control.zoom({ position: 'topright' }).addTo(map);
L.tileLayer(C.TILE_URL, { attribution: C.TILE_ATTR, maxZoom: C.TILE_MAXZOOM }).addTo(map);

const active = new Set(Object.keys(FAM));   // all families visible by default
const pins = [];                            // { marker, family }
const group = L.layerGroup().addTo(map);

const dot = (lat, lng, color, popup, radius = 7) => L.circleMarker([lat, lng], { radius, weight: 1.5, color: '#0b0f14', fillColor: color, fillOpacity: .9 }).bindPopup(popup);

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
      const f = FAM[ev.family] || FAM.water;
      const radius = 6 + Math.min(16, Math.sqrt(ev.reports) * 3.2);
      const link = ev.promoted ? `<br><a href="/e/${ev.slug}" style="color:${f.color};font-weight:700">Open coordination page →</a>` : '';
      const popup = `<b>${f.emoji} ${esc(ev.title)}</b><br>${ev.reports} report(s)${ev.confirmations ? ' · ' + ev.confirmations + ' confirmed' : ''}<br><span style="color:${f.color};font-weight:700">${esc(f.label)}</span> · <small>community</small>${link}`;
      pins.push({ marker: dot(ev.lat, ev.lng, f.color, popup, radius), family: ev.family });
    });
  } catch {}
  try {
    const off = (await (await fetch((C.API || '') + '/api/official')).json()).official || [];
    off.forEach(o => {
      const f = FAM[o.family] || FAM.water;
      const m = L.circleMarker([o.lat, o.lng], { radius: 12, weight: 3, color: f.color, opacity: .95, fillColor: f.color, fillOpacity: .1, dashArray: '3 4' })
        .bindPopup(`<b>🛰️ ${esc(o.title)}</b><br><span style="color:${f.color};font-weight:700">${esc(f.label)}</span> · <b style="text-transform:capitalize">${esc(o.level)}</b> alert<br><small>Official signal — GDACS${o.country ? ' · ' + esc(o.country) : ''}</small><br><a href="${esc(o.url)}" target="_blank" rel="noopener">Official report →</a>`);
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
      map.flyTo([+el.dataset.lat, +el.dataset.lng], 9);
      if (smarker) smarker.remove(); smarker = L.marker([+el.dataset.lat, +el.dataset.lng]).addTo(map);
      box.classList.remove('show'); $('wsearch').value = el.dataset.name || '';
    });
  }, 300);
};
document.addEventListener('click', e => { if (!$('wsearchbox').contains(e.target)) $('wresults').classList.remove('show'); });

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
    toast('Posted 🌍 — thank you for helping the map');
    await load(false);
  } catch { toast('Could not post — try again'); }
};

load();
