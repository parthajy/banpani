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

const map = L.map('wmap', { worldCopyJump: true, minZoom: C.WORLD.minZoom, maxZoom: 16, zoomControl: false })
  .setView(C.WORLD.center, C.WORLD.zoom);
L.control.zoom({ position: 'topright' }).addTo(map);
if (window.attachFullscreen) window.attachFullscreen(document.getElementById('wexpandBtn'), document.documentElement, map);   // expand the whole world map
L.tileLayer(C.TILE_URL, { attribution: C.TILE_ATTR, maxZoom: C.TILE_MAXZOOM }).addTo(map);

const active = new Set(Object.keys(FAM));   // all families visible by default
const pins = [];                            // { marker, family }
const group = L.layerGroup().addTo(map);

const dot = (lat, lng, color, popup, radius = 7, unconfirmed = false) => L.circleMarker([lat, lng], {
  radius, weight: unconfirmed ? 2 : 1.5, color: unconfirmed ? color : '#0b0f14',
  fillColor: color, fillOpacity: unconfirmed ? .3 : .9, dashArray: unconfirmed ? '2 3' : null,
}).bindPopup(popup);

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
      const radius = 6 + Math.min(16, Math.sqrt(ev.reports || 1) * 3.2);
      evBySlug[ev.slug] = { slug: ev.slug, title: ev.title, family: ev.family, emoji: f.emoji };
      const sv = S.has(ev.slug);
      const unconf = ev.unconfirmed
        ? `<br><span style="color:#c9a227;font-size:12px">⏳ Unconfirmed - needs a 2nd report or a confirmation to be verified.</span>` : '';
      const popup = `<b>${f.emoji} ${esc(ev.title)}</b><br>${ev.reports} report(s)${ev.confirmations ? ' · ' + ev.confirmations + ' confirmed' : ''}${unconf}<br><span style="color:${f.color};font-weight:700">${esc(f.label)}</span><br><a href="/e/${ev.slug}" style="color:${f.color};font-weight:700">Open coordination page →</a><br><a href="#" onclick="return toggleSave('${esc(ev.slug)}',this)" style="color:#c9a227;font-size:12px">${sv ? '★ Saved' : '☆ Save'}</a> · <a href="#" onclick="return flagEvent('${esc(ev.slug)}')" style="color:#8a94a6;font-size:12px">⚑ Flag</a>`;
      pins.push({ marker: dot(ev.lat, ev.lng, f.color, popup, radius, ev.unconfirmed), family: ev.family });
    });
  } catch {}
  try {
    const off = (await (await fetch((C.API || '') + '/api/official')).json()).official || [];
    off.forEach(o => {
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
