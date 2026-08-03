/* Banpani world map (beta). One global map, everything is data, coloured by disaster
   family, filterable + searchable. Reads the same public /api/state as the relief map.
   Standalone from app.js so it can never affect the live Assam page. */
const C = window.BANPANI;
const $ = id => document.getElementById(id);
const FAM = C.DISASTERS;
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// which family a report's disaster_type belongs to (defaults to water — today's data is flood)
function familyOf(type) { type = type || 'flood'; for (const k in FAM) if (FAM[k].types.includes(type)) return k; return 'water'; }

const map = L.map('wmap', { worldCopyJump: true, minZoom: C.WORLD.minZoom, maxZoom: 16, zoomControl: false })
  .setView(C.WORLD.center, C.WORLD.zoom);
L.control.zoom({ position: 'topright' }).addTo(map);
L.tileLayer(C.TILE_URL, { attribution: C.TILE_ATTR, maxZoom: C.TILE_MAXZOOM }).addTo(map);

const active = new Set(Object.keys(FAM));   // all families visible by default
const pins = [];                            // { marker, family }
const group = L.layerGroup().addTo(map);

function dot(lat, lng, color, popup) {
  return L.circleMarker([lat, lng], { radius: 7, weight: 1.5, color: '#0b0f14', fillColor: color, fillOpacity: .92 }).bindPopup(popup);
}
function render() {
  group.clearLayers();
  let shown = 0;
  for (const p of pins) if (active.has(p.family)) { p.marker.addTo(group); shown++; }
  $('wc').textContent = shown;
}

function add(lat, lng, family, title, sub) {
  if (lat == null || lng == null) return;
  const f = FAM[family] || FAM.water;
  const popup = `<b>${f.emoji} ${esc(title)}</b>${sub ? '<br>' + esc(sub) : ''}<br><span style="color:${f.color};font-weight:700">${esc(f.label)}</span> · <a href="/">Open relief map →</a>`;
  pins.push({ marker: dot(lat, lng, f.color, popup), family });
}

async function load() {
  let s; try { s = await (await fetch((C.API || '') + '/api/state')).json(); } catch { return; }
  (s.reports || []).forEach(r => add(r.lat, r.lng, familyOf(r.disaster_type), r.place, (r.items || []).slice(0, 3).join(', ')));
  (s.flood_reports || []).forEach(f => add(f.lat, f.lng, 'water', f.place || 'Flood report', f.severity));
  render();
  const pts = pins.map(p => p.marker.getLatLng());
  if (pts.length) map.fitBounds(L.latLngBounds(pts).pad(0.35), { maxZoom: 8 });
}

// filter / legend chips (also act as the colour key)
function buildFilters() {
  $('wfilters').innerHTML = Object.entries(FAM)
    .map(([k, v]) => `<button class="wchip on" data-k="${k}" style="--c:${v.color}">${v.emoji} ${v.label}</button>`).join('');
  $('wfilters').querySelectorAll('.wchip').forEach(b => b.onclick = () => {
    const k = b.dataset.k;
    if (active.has(k)) { active.delete(k); b.classList.remove('on'); } else { active.add(k); b.classList.add('on'); }
    render();
  });
}

// global place search (server geocode proxy, world scope)
let st, smarker;
$('wsearch').oninput = () => {
  clearTimeout(st);
  const q = $('wsearch').value.trim();
  const box = $('wresults');
  if (q.length < 2) { box.classList.remove('show'); return; }
  st = setTimeout(async () => {
    let list = [];
    try { list = (await (await fetch((C.API || '') + '/api/geocode?world=1&q=' + encodeURIComponent(q))).json()).results || []; } catch {}
    if (!list.length) { box.classList.remove('show'); return; }
    box.innerHTML = list.map(x => `<div class="sr" data-lat="${x.lat}" data-lng="${x.lng}" data-name="${esc(x.name)}">🔎 ${esc(x.name.split(',')[0])}<div class="sub">${esc(x.name)}</div></div>`).join('');
    box.classList.add('show');
    box.querySelectorAll('.sr').forEach(el => el.onclick = () => {
      const la = +el.dataset.lat, ln = +el.dataset.lng;
      map.flyTo([la, ln], 9);
      if (smarker) smarker.remove();
      smarker = L.marker([la, ln]).addTo(map);
      box.classList.remove('show'); $('wsearch').value = el.dataset.name || '';
    });
  }, 300);
};
document.addEventListener('click', e => { if (!$('wsearchbox').contains(e.target)) $('wresults').classList.remove('show'); });

buildFilters();
load();
