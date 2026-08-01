/* Banpani - public map app. Vanilla JS + Leaflet. Community-consensus, no accounts. */
const C = window.BANPANI;
const $ = id => document.getElementById(id);

/* --------------------------- utilities --------------------------- */
const api = async (path, opts = {}) => {
  const r = await fetch(C.API + path, { ...opts, headers: { 'content-type': 'application/json' }, body: opts.body ? JSON.stringify(opts.body) : undefined });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || r.status);
  return data;
};
function deviceId() {
  let d = localStorage.getItem('banpani.device');
  if (!d) { d = 'd-' + Math.random().toString(36).slice(2) + Date.now().toString(36); localStorage.setItem('banpani.device', d); }
  return d;
}
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
let toastT; function toast(m) { const t = $('toast'); t.textContent = m; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2800); }
function waShare(text) { window.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank'); }
function mapUrl(lat, lng) { return location.origin + location.pathname + `#@${lat.toFixed(4)},${lng.toFixed(4)}`; }

function haversine(a, b) {
  const R = 6371, toR = x => x * Math.PI / 180;
  const dLat = toR(b[0] - a[0]), dLng = toR(b[1] - a[1]);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toR(a[0])) * Math.cos(toR(b[0])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}
const todayStr = () => new Date().toISOString().slice(0, 10);
const ageH = iso => (Date.now() - new Date(iso).getTime()) / 3.6e6;

/* ------------------------------- state -------------------------------- */
let STATE = { reports: [], routes: [], collection_points: [], ngos: [], flood_polygons: [] };
let currentView = 'live';

function coverageOf(need) {
  let best = null;
  for (const r of STATE.routes) {
    if (r.status !== 'active') continue;
    const d = haversine([need.lat, need.lng], [r.lat, r.lng]);
    if (d <= C.GAP_RADIUS_KM && (r.items || []).some(i => need.items.includes(i))) { if (!best || d < best.dist) best = { r, dist: d }; }
  }
  return best;
}
const isGap = n => n.status !== 'resolved' && n.verify_status !== 'false' && !coverageOf(n);

/* -------------------------------- map --------------------------------- */
const B = L.latLngBounds(C.BOUNDS);
const map = L.map('map', { zoomControl: false, minZoom: C.MIN_ZOOM, maxZoom: C.MAX_ZOOM, maxBounds: B, maxBoundsViscosity: 1.0 }).setView(C.CENTER, C.ZOOM);
L.control.zoom({ position: 'topright' }).addTo(map);   // top-right, away from the View controls
L.tileLayer(C.TILE_URL, { attribution: C.TILE_ATTR, maxZoom: C.TILE_MAXZOOM, bounds: B }).addTo(map);
map.setMaxBounds(B);
map.on('drag', () => map.panInsideBounds(B, { animate: false }));  // hard clamp - no drift off Assam
// deep-link support (#@lat,lng)
const h = location.hash.match(/@(-?\d+\.?\d*),(-?\d+\.?\d*)/);
if (h) map.setView([+h[1], +h[2]], 11);

const layers = { official: L.layerGroup().addTo(map), flood: L.layerGroup().addTo(map), needs: L.layerGroup().addTo(map), cover: L.layerGroup().addTo(map), ngo: L.layerGroup().addTo(map) };
const floodColor = s => ({ high: '#f0453a', medium: '#f5a623', receding: '#8fbaff' }[s] || '#f0453a');

function pinIcon(status, verify, emoji, gap) {
  const cls = `pin ${status} ${verify === 'unverified' ? 'unverified' : ''} ${gap ? 'gap' : ''}`;
  return L.divIcon({ html: `<div class="${cls}"><span>${emoji}</span></div>`, className: '', iconSize: [24, 24], iconAnchor: [12, 24], popupAnchor: [0, -22] });
}
const emojiIcon = e => L.divIcon({ html: `<div class="emoji">${e}</div>`, className: '', iconSize: [24, 24], iconAnchor: [12, 12] });

/* ------------------------------ rendering ----------------------------- */
let officialFlood = null, officialCamps = { camps: [], updated: '' };
async function loadOfficialFlood() {
  try { officialFlood = await (await fetch(C.FLOOD_GEOJSON)).json(); } catch { officialFlood = { type: 'FeatureCollection', features: [] }; }
  try { officialCamps = await (await fetch('data/relief-camps.json')).json(); } catch { officialCamps = { camps: [], updated: '' }; }
}
// Official ASDMA layer: affected-district shading (dated + sourced) + relief-camp summaries.
function renderOfficial() {
  layers.official.clearLayers();
  if (!$('ly_official').checked || !officialFlood) return;
  L.geoJSON(officialFlood, {
    filter: f => f.properties.severity,
    style: f => ({ color: floodColor(f.properties.severity), weight: 1.4, fillColor: floodColor(f.properties.severity), fillOpacity: 0.22 }),
    onEachFeature: (f, l) => l.bindPopup(`<b>${esc(f.properties.name)}</b><br>${t('officialAffected')} · <b>${esc(f.properties.severity)}</b><br><small>${t('sourceASDMA')} · ${esc(f.properties.updated || '')}</small>`),
  }).addTo(layers.official);
  for (const c of (officialCamps.camps || [])) {
    L.marker([c.lat, c.lng], { icon: emojiIcon('🏕️') }).addTo(layers.official)
      .bindPopup(`<b>🏕️ ${esc(c.district)}</b><br>${c.camps ? c.camps + ' ' + t('reliefCamps') + '<br>' : ''}${c.people ? '~' + Number(c.people).toLocaleString() + ' ' + t('sheltered') + '<br>' : ''}<small>${t('sourceASDMA')} · ${esc(officialCamps.updated || '')}</small>`);
  }
}
function renderFlood() {
  layers.flood.clearLayers();
  if (!$('ly_flood').checked) return;
  // faint district outlines for geographic context (official shading lives in the Official layer)
  if (officialFlood) L.geoJSON(officialFlood, { style: () => ({ color: '#3a4757', weight: 0.7, fill: false, opacity: 0.5 }) }).addTo(layers.flood);
  for (const p of STATE.flood_polygons) {
    L.geoJSON({ type: 'Feature', geometry: p.geojson, properties: {} }, { style: { color: floodColor(p.severity), weight: 2, dashArray: '4 4', fillColor: floodColor(p.severity), fillOpacity: 0.30 } })
      .bindPopup(`<b>Community-reported flooding</b><br>${esc(p.note || '')}<br><small>${esc(p.severity)}</small>`).addTo(layers.flood);
  }
  // real-time community flood markers: newest-wins within ~1km, colour by severity, fade with age
  const fresh = (STATE.flood_reports || []).filter(f => f.severity !== 'receded' && ageH(f.updated_at || f.created_at) <= 48)
    .sort((a, b) => new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at));
  const shown = [];
  for (const f of fresh) {
    if (shown.some(s => haversine([s.lat, s.lng], [f.lat, f.lng]) < 1)) continue;  // a newer nearby marker already shown
    shown.push(f);
    const when = f.updated_at || f.created_at, age = ageH(when);
    const op = Math.max(0.15, 0.5 - age / 96);
    L.circle([f.lat, f.lng], { radius: 2500, color: floodColor(f.severity), weight: 1, fillColor: floodColor(f.severity), fillOpacity: op })
      .bindPopup(`<b>🌊 ${t('floodedHere')}</b><br>${f.place ? esc(f.place) + '<br>' : ''}${t('status')}: <b>${esc(f.severity)}</b><br><small>${agoText(when)}</small>
        <div class="pmeta" style="margin-top:6px">${t('updateStatus')}:</div>
        <div class="vbtns">
          <button onclick="bp.floodStatus(${f.id},'high')">${t('sevSevere')}</button>
          <button onclick="bp.floodStatus(${f.id},'medium')">${t('sevModerate')}</button>
          <button onclick="bp.floodStatus(${f.id},'receding')">${t('sevReceding')}</button>
        </div>
        <div class="vbtns"><button onclick="bp.floodStatus(${f.id},'receded')">💧 ${t('sevGone')} (${f.clears || 0}/2)</button></div>`).addTo(layers.flood);
  }
}
function agoText(iso) {
  const m = (Date.now() - new Date(iso).getTime()) / 60000;
  if (m < 1) return 'just now';
  if (m < 60) return Math.round(m) + 'm ago';
  if (m < 48 * 60) return Math.round(m / 60) + 'h ago';
  return Math.round(m / 1440) + 'd ago';
}

function needMatchesView(n, gap) { return currentView === 'uncovered' ? gap : true; }
function routeMatchesView(r) {
  const d = (r.covered_date || r.created_at || '').slice(0, 10);
  if (currentView === 'today') return d === todayStr();
  if (currentView === 'older') return d < todayStr();
  if (currentView === 'uncovered') return false;
  return true;
}

function needPopup(n) {
  const cov = coverageOf(n);
  const covTxt = n.status === 'resolved' ? '' : cov
    ? `<div style="color:#7fe6b0">🚚 ${esc(cov.r.name)} inbound (~${cov.dist.toFixed(1)}km)</div>`
    : `<div style="color:#ff8079">⚠️ nobody heading here yet</div>`;
  return `<b>${esc(n.place)}</b> <span class="pmeta">${n.status} · ${n.verify_status}${n.confirmations ? ' · ' + n.confirmations + '✅' : ''}</span>
    <div style="margin:4px 0">🆘 ${n.items.map(esc).join(', ')}</div>
    ${n.people ? '~' + n.people + ' people<br>' : ''}${n.details ? esc(n.details) + '<br>' : ''}${covTxt}
    <div class="vbtns">
      <button onclick="bp.vote(${n.id},'trust','confirm')">✅ ${t('confirm')} (${n.confirmations || 0})</button>
      <button onclick="bp.vote(${n.id},'resolve','yes')">✓ ${t('delivered')}</button>
      <button onclick="bp.vote(${n.id},'trust','false')">⚑ ${t('notReal')}</button>
    </div>
    <div class="vbtns">
      <button onclick="bp.directions(${n.id})">🧭 ${t('directions')}</button>
      ${n.has_contact ? `<button onclick="bp.reveal(${n.id})">📞 ${t('getContact')}</button>` : ''}
      <button onclick="bp.share(${n.id})">↗ ${t('waShare')}</button>
    </div>
    <div id="c${n.id}" class="contactline"></div>`;
}

function renderNeeds() {
  layers.needs.clearLayers();
  if (!$('ly_needs').checked) return;
  for (const n of STATE.reports) {
    const gap = isGap(n);
    if (!needMatchesView(n, gap)) continue;
    const emoji = n.status === 'resolved' ? '✓' : (n.confirmations >= C.CONFIRM_AT ? '!' : '?');
    L.marker([n.lat, n.lng], { icon: pinIcon(n.status, n.verify_status, emoji, gap && currentView !== 'today') }).addTo(layers.needs).bindPopup(needPopup(n));
  }
}
function renderCover() {
  layers.cover.clearLayers();
  if (!$('ly_cover').checked) return;
  const showRoutes = $('ly_routes').checked;
  for (const r of STATE.routes) {
    if (r.status !== 'active' || !routeMatchesView(r)) continue;
    // the from→to route line + a start flag, only when the routes layer is on and origin is known
    if (showRoutes && r.from_lat != null) {
      L.polyline([[r.from_lat, r.from_lng], [r.lat, r.lng]], { color: '#2f81f7', weight: 2.5, dashArray: '6 7', opacity: .7 }).addTo(layers.cover);
      L.marker([r.from_lat, r.from_lng], { icon: emojiIcon('🚩') }).addTo(layers.cover)
        .bindPopup(`<b>🚩 ${t('start')}</b>${r.from_place ? '<br>' + esc(r.from_place) : ''}<br>→ 🚚 ${esc(r.name)}`);
    }
    const details = showRoutes
      ? `<div style="margin:4px 0">${r.from_place ? '📍 ' + esc(r.from_place) + ' → ' : ''}🎯 ${t('destination')}</div>
         🧺 ${(r.items || []).map(esc).join(', ')}<br>${r.eta ? '🕑 ' + esc(r.eta) + '<br>' : ''}${r.covered_date ? '📅 ' + esc(r.covered_date) + '<br>' : ''}${r.contact ? '📞 ' + esc(r.contact) : ''}`
      : `Carrying: ${(r.items || []).map(esc).join(', ')}`;
    L.marker([r.lat, r.lng], { icon: emojiIcon('🚚') }).addTo(layers.cover)
      .bindPopup(`<b>🚚 ${esc(r.name)}</b><br>${details}`);
  }
}
function renderNgo() {
  layers.ngo.clearLayers();
  if (!$('ly_ngo').checked) return;
  for (const c of STATE.collection_points) {
    L.marker([c.lat, c.lng], { icon: emojiIcon('📦') }).addTo(layers.ngo)
      .bindPopup(`<b>📦 ${esc(c.name)}</b><br>Accepts: ${(c.accepts || []).map(esc).join(', ')}<br>${c.hours ? esc(c.hours) + '<br>' : ''}${c.org ? esc(c.org) + '<br>' : ''}${c.contact ? '📞 ' + esc(c.contact) : ''}`);
  }
}
function renderPane() {
  const gaps = STATE.reports.filter(isGap).map(n => ({ ...n, age: ageH(n.created_at), pri: (n.people || 20) * (1 + ageH(n.created_at) / 24) })).sort((a, b) => b.pri - a.pri).slice(0, 8);
  const box = $('gaps');
  if (!gaps.length) { box.innerHTML = `<div class="none">${t('noneUnattended')}</div>`; return; }
  box.innerHTML = gaps.map(g => `<div class="gaprow"><div data-lat="${g.lat}" data-lng="${g.lng}" class="gp-go" style="flex:1">
      <b>${esc(g.place)}</b><br><span class="p">${g.items.slice(0, 2).map(esc).join(', ')}</span></div>
      <div class="p" style="text-align:right">${g.people ? g.people + '<br>' : ''}${g.age.toFixed(0)}h</div>
      <button class="wa" title="Directions" onclick="bp.directions(${g.id})">🧭</button>
      <button class="wa" title="Share on WhatsApp" onclick="bp.share(${g.id})">↗</button></div>`).join('');
  box.querySelectorAll('.gp-go').forEach(el => el.onclick = () => map.setView([+el.dataset.lat, +el.dataset.lng], 11));
}
function renderStats() {
  const r = STATE.reports;
  $('s_open').textContent = r.filter(n => n.status !== 'resolved').length;
  $('s_unv').textContent = r.filter(n => n.verify_status === 'unverified' && n.status !== 'resolved').length;
  $('s_cov').textContent = STATE.routes.filter(x => x.status === 'active').length;
  $('s_gap').textContent = r.filter(isGap).length;
}
function renderFeed() {
  const list = $('feedlist'); if (!list) return;
  const rows = STATE.reports.slice().sort((a, b) => {
    const rank = n => n.status === 'resolved' ? 4 : isGap(n) ? 0 : n.verify_status === 'unverified' ? 1 : 2;
    return rank(a) - rank(b);
  });
  if (!rows.length) { list.innerHTML = `<div class="empty">${t('noReports')}</div>`; return; }
  list.innerHTML = rows.map(n => {
    const gap = isGap(n);
    return `<div class="card ${n.status}" data-lat="${n.lat}" data-lng="${n.lng}">
      <div class="top"><span class="place">${esc(n.place)} ${gap ? '<span class="badge gap">GAP</span>' : ''}</span>
        <span class="badge ${n.verify_status === 'confirmed' ? 'confirmed' : 'unverified'}">${esc(n.verify_status)}${n.confirmations ? ' ' + n.confirmations + '✅' : ''}</span></div>
      <div class="items">🆘 ${n.items.map(esc).join(', ')}</div>
      <div class="meta">${n.people ? '~' + n.people + ' ppl · ' : ''}${n.status}${gap ? ' · <span style="color:#ff8079">no convoy inbound</span>' : ''}</div>
      <div class="fcard-acts">
        <button onclick="event.stopPropagation();bp.locate(${n.id})">📍 ${t('showMap')}</button>
        <button onclick="event.stopPropagation();bp.directions(${n.id})">🧭 ${t('directions')}</button>
        <button onclick="event.stopPropagation();bp.share(${n.id})">↗ ${t('waShare')}</button>
      </div>
    </div>`;
  }).join('');
  list.querySelectorAll('.card').forEach(el => el.onclick = () => map.setView([+el.dataset.lat, +el.dataset.lng], 12));
}
function renderNgoList() {
  const box = $('ngolist'); if (!box) return;
  if (!STATE.ngos.length) { box.innerHTML = `<div class="empty">${t('noNgos')}</div>`; return; }
  box.innerHTML = STATE.ngos.map(g => {
    const verified = g.verify_status === 'confirmed';
    return `<div class="card ${verified ? 'resolved' : 'open'}">
      <div class="top"><span class="place">${esc(g.name)} ${verified ? '<span class="badge confirmed">✅ ' + t('communityVerified') + '</span>' : ''}</span></div>
      <div class="items">${(g.focus || []).map(esc).join(', ')}</div>
      <div class="meta">${g.area ? esc(g.area) + ' · ' : ''}${g.contact ? '📞 ' + esc(g.contact) : ''}${g.needs_now ? '<br>needs: ' + esc(g.needs_now) : ''}</div>
      <div class="endorse"><span class="tally">👍 ${g.endorsements || 0}/${C.ENDORSE_AT} ${t('vouch')}</span>
        <button onclick="bp.endorse(${g.id},'yes')">${t('seenWorking')}</button>
        <button class="flag" onclick="bp.endorse(${g.id},'fake')">⚑</button></div>
    </div>`;
  }).join('');
}
function renderAll() { renderOfficial(); renderFlood(); renderNeeds(); renderCover(); renderNgo(); renderPane(); renderStats(); renderFeed(); renderNgoList(); renderFloodNow(); }

function renderFloodNow() {
  const box = $('floodNowList'), tick = $('floodTicker');
  if (box) {
    const recent = (STATE.flood_reports || []).filter(f => f.severity !== 'receded' && ageH(f.created_at) <= 24)
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    if (tick) {
      if (!STATE.flood_reports || !STATE.flood_reports.length) { tick.textContent = t('floodNoneYet'); tick.className = 'flood-tick stale'; }
      else {
        const latest = STATE.flood_reports.reduce((a, b) => new Date(a.created_at) > new Date(b.created_at) ? a : b);
        const mins = (Date.now() - new Date(latest.created_at).getTime()) / 60000;
        if (mins > 180) { tick.textContent = `⚠ ${t('floodStale')} ${agoText(latest.created_at)}`; tick.className = 'flood-tick stale'; }
        else { tick.textContent = `● ${t('floodUpdated')} ${agoText(latest.created_at)}`; tick.className = 'flood-tick live'; }
      }
    }
    box.innerHTML = recent.length
      ? recent.slice(0, 10).map(f => `<div class="fnow" data-lat="${f.lat}" data-lng="${f.lng}"><span class="fz ${f.severity}">${esc(f.place || t('floodedArea'))}</span><span class="fago">${agoText(f.created_at)}</span></div>`).join('')
      : `<div class="none">${t('floodReportPrompt')}</div>`;
    box.querySelectorAll('.fnow').forEach(el => el.onclick = () => map.setView([+el.dataset.lat, +el.dataset.lng], 12));
  }
}
async function renderAdvisory() {
  renderFloodNow();
  try {
    const a = await api('/api/advisory');
    $('advHeadline').textContent = a.headline || '';
    $('advText').textContent = a.body || '';
    $('advMeta').textContent = (a.source ? a.source + ' · ' : '') + (a.updated_at ? t('updated') + ' ' + new Date(a.updated_at).toLocaleString() : '');
  } catch {}
}

/* ------------------------- consensus / actions ------------------------- */
window.bp = {
  vote: async (id, category, value) => {
    try {
      const r = await api(`/api/reports/${id}/vote`, { method: 'POST', body: { category, value, device: deviceId() } });
      toast(category === 'resolve' ? t('markedDelivered') : value === 'false' ? t('flagged') : `${t('confirmed')} (${r.confirmations || 0}/${C.CONFIRM_AT})`);
      map.closePopup(); await refresh();
    } catch (e) { toast('Failed: ' + e.message); }
  },
  endorse: async (id, value) => {
    try { const r = await api(`/api/ngos/${id}/endorse`, { method: 'POST', body: { value, device: deviceId() } }); toast(value === 'fake' ? t('flagged') : `👍 ${r.endorsements || 0}/${C.ENDORSE_AT}`); await refresh(); }
    catch (e) { toast('Failed: ' + e.message); }
  },
  reveal: async (id) => {
    try { const r = await api(`/api/reports/${id}/contact`); const el = $('c' + id);
      if (r.contact) { if (el) el.innerHTML = `📞 <a href="tel:${esc(r.contact)}">${esc(r.contact)}</a>`; else toast('📞 ' + r.contact); }
      else if (el) el.textContent = t('noContact'); }
    catch (e) { toast('Failed: ' + e.message); }
  },
  share: (id) => {
    const n = STATE.reports.find(x => x.id === id); if (!n) return;
    const text = `🆘 ${n.place} needs: ${n.items.join(', ')}${n.people ? ` (~${n.people} people)` : ''}. ${isGap(n) ? 'NOBODY is going there yet.' : ''} Help via Banpani → ${mapUrl(n.lat, n.lng)}`;
    waShare(text);
  },
  shareMap: () => waShare(`Banpani - live Assam flood relief map. See who needs help & where nobody has reached: ${location.origin}`),
  directions: (id) => { const n = STATE.reports.find(x => x.id === id); if (n) window.open(`https://www.google.com/maps/dir/?api=1&destination=${n.lat},${n.lng}`, '_blank'); },
  locate: (id) => { const n = STATE.reports.find(x => x.id === id); if (n) { map.setView([n.lat, n.lng], 13); } },
  floodStatus: async (id, severity) => {
    try {
      const r = await api(`/api/flood-reports/${id}/status`, { method: 'POST', body: { severity, device: deviceId() } });
      if (severity === 'receded') toast(r.cleared ? t('floodCleared') : `${t('floodClearVote')} (${r.clears}/2)`);
      else toast(t('floodStatusSet'));
      map.closePopup(); await refresh();
    } catch (e) { toast('Failed: ' + e.message); }
  },
};

async function refresh() { STATE = await api('/api/state'); renderAll(); }

/* ------------------------------ controls ------------------------------ */
$('timeseg').querySelectorAll('button').forEach(b => b.onclick = () => {
  $('timeseg').querySelectorAll('button').forEach(x => x.classList.remove('on'));
  b.classList.add('on'); currentView = b.dataset.v; renderAll();
});
['ly_official', 'ly_flood', 'ly_needs', 'ly_cover', 'ly_routes', 'ly_ngo'].forEach(id => $(id).onchange = renderAll);

let pickMode = 'need';
const pending = { need: {}, r: {}, rf: {}, c: {}, f: {} };
let convoyTarget = 'dest';                        // which convoy point a map tap sets
const modeKeys = { need: ['need'], convoy: ['r', 'rf'], drop: ['c'], flood: ['f'] };
document.querySelectorAll('.tab').forEach(tb => tb.onclick = () => {
  document.querySelectorAll('.tab').forEach(x => x.classList.remove('on')); tb.classList.add('on');
  document.querySelectorAll('[data-body]').forEach(s => s.hidden = s.dataset.body !== tb.dataset.tab);
  pickMode = { need: 'need', convoy: 'r', drop: 'c', flood: 'f' }[tb.dataset.tab] || null;
  $('modehint').classList.toggle('show', !!pickMode);
  syncMarkers(tb.dataset.tab);
});
$('modehint').classList.add('show');
if (window.innerWidth <= 860) { $('overlay').classList.add('min'); $('overlayToggle').firstChild.textContent = '▸ '; }

// Draggable location pickers - one marker per point (need / drop / flood / convoy start+dest).
const coordId = { need: 'n_coord', r: 'r_coord', rf: 'rf_coord', c: 'c_coord', f: 'f_coord' };
const pickEmoji = { rf: '🚩', r: '🎯' };
const pickMarkers = {};
function setReadout(key, lat, lng, gps) {
  const el = $(coordId[key]); if (!el) return;
  el.textContent = `📍 ${lat.toFixed(3)}, ${lng.toFixed(3)}${gps ? ' (GPS)' : ''}`; el.classList.add('set');
}
function placeMarker(key, lat, lng) {
  if (!pickMarkers[key]) {
    const m = L.marker([lat, lng], { draggable: true, autoPan: true,
      icon: L.divIcon({ html: `<div class="pickpin">${pickEmoji[key] || '📍'}</div>`, className: '', iconSize: [30, 30], iconAnchor: [15, 30] }) }).addTo(map);
    m.on('dragend', () => { const p = m.getLatLng(); pending[key] = { lat: p.lat, lng: p.lng }; setReadout(key, p.lat, p.lng); if (key === 'r') checkOverlap(); });
    pickMarkers[key] = m;
  } else pickMarkers[key].setLatLng([lat, lng]);
}
function removeMarker(key) { if (pickMarkers[key]) { map.removeLayer(pickMarkers[key]); delete pickMarkers[key]; } }
function syncMarkers(tab) {
  const keep = modeKeys[tab] || [];
  Object.keys(pickMarkers).forEach(k => { if (!keep.includes(k)) removeMarker(k); });
  keep.forEach(k => { if (pending[k]?.lat != null) placeMarker(k, pending[k].lat, pending[k].lng); });
}
function setPick(key, lat, lng, gps) { pending[key] = { lat, lng }; setReadout(key, lat, lng, gps); placeMarker(key, lat, lng); if (key === 'r') checkOverlap(); }
function activeKey() { return pickMode === 'r' ? (convoyTarget === 'start' ? 'rf' : 'r') : pickMode; }

map.on('click', e => { if (pickMode) setPick(activeKey(), e.latlng.lat, e.latlng.lng); });
function useGPS(key) {
  if (!navigator.geolocation) return toast('No GPS');
  toast('Getting location…');
  navigator.geolocation.getCurrentPosition(p => { setPick(key, p.coords.latitude, p.coords.longitude, true); map.setView([p.coords.latitude, p.coords.longitude], 12); },
    () => toast('Could not get GPS'));
}
$('convoyTarget').querySelectorAll('button').forEach(b => b.onclick = () => {
  $('convoyTarget').querySelectorAll('button').forEach(x => x.classList.remove('on')); b.classList.add('on'); convoyTarget = b.dataset.t;
  toast(convoyTarget === 'start' ? t('tapStart') : t('tapDest'));
});
$('n_gps').onclick = () => useGPS('need');
$('r_gps').onclick = () => useGPS('r');
$('rf_gps').onclick = () => useGPS('rf');
$('c_gps').onclick = () => useGPS('c');
$('f_gps').onclick = () => useGPS('f');

// flood severity selector
let fSev = 'high';
$('f_sev').querySelectorAll('button').forEach(b => b.onclick = () => { $('f_sev').querySelectorAll('button').forEach(x => x.classList.remove('on')); b.classList.add('on'); fSev = b.dataset.s; });
$('f_submit').onclick = async () => {
  if (pending.f.lat == null) return toast('Set location (tap map or GPS)');
  try {
    await api('/api/flood-reports', { method: 'POST', body: { place: $('f_place').value.trim(), lat: pending.f.lat, lng: pending.f.lng, severity: fSev, device: deviceId() } });
    $('f_place').value = ''; pending.f = {}; $('f_coord').textContent = t('noLoc'); $('f_coord').classList.remove('set'); removeMarker('f');
    await refresh(); await renderAdvisory(); toast(t('floodMarked'));
  } catch (e) { toast('Failed: ' + e.message); }
};

function chips(elId, arr, set) { const el = $(elId); el.innerHTML = ''; arr.forEach(it => { const c = document.createElement('div'); c.className = 'chip' + (set.has(it) ? ' on' : ''); c.textContent = it; c.onclick = () => { set.has(it) ? set.delete(it) : set.add(it); c.classList.toggle('on'); if (elId === 'r_items') checkOverlap(); }; el.appendChild(c); }); }
const nItems = new Set(), rItems = new Set(), cItems = new Set(), gFocus = new Set();
chips('n_items', C.ITEMS, nItems); chips('r_items', C.ITEMS, rItems); chips('c_items', C.ACCEPTS, cItems); chips('g_focus', C.FOCUS, gFocus);

function checkOverlap() {
  const w = $('r_warn'), dest = pending.r;
  if (dest.lat == null || rItems.size === 0) return w.classList.remove('show');
  const clash = STATE.routes.filter(r => r.status === 'active' && haversine([dest.lat, dest.lng], [r.lat, r.lng]) <= C.OVERLAP_RADIUS_KM && (r.items || []).some(i => rItems.has(i)));
  if (clash.length) {
    const c = clash[0], shared = c.items.filter(i => rItems.has(i));
    w.classList.add('show');
    w.innerHTML = `⚠️ <b>Possible overkill.</b> <b>${esc(c.name)}</b> is already heading within ${haversine([dest.lat, dest.lng], [c.lat, c.lng]).toFixed(1)}km carrying <b>${shared.map(esc).join(', ')}</b>. Check the <b>Gaps</b> view.`;
  } else w.classList.remove('show');
}

$('n_submit').onclick = async () => {
  if (!$('n_place').value.trim()) return toast('Add a place name');
  if (pending.need.lat == null) return toast('Set location (tap map or GPS)');
  if (nItems.size === 0) return toast('Pick at least one item');
  try {
    await api('/api/reports', { method: 'POST', body: { place: $('n_place').value.trim(), lat: pending.need.lat, lng: pending.need.lng, items: [...nItems], people: $('n_people').value || null, details: $('n_details').value.trim(), reporter_kind: $('n_kind').value, contact: $('n_contact').value.trim(), device: deviceId() } });
    ['n_place', 'n_people', 'n_details', 'n_contact'].forEach(i => $(i).value = ''); nItems.clear(); chips('n_items', C.ITEMS, nItems);
    pending.need = {}; $('n_coord').textContent = t('noLoc'); $('n_coord').classList.remove('set'); removeMarker('need');
    await refresh(); toast(t('needPosted'));
  } catch (e) { toast('Failed: ' + e.message); }
};
$('r_submit').onclick = async () => {
  if (!$('r_name').value.trim()) return toast('Add convoy name');
  if (pending.r.lat == null) return toast('Set destination');
  if (rItems.size === 0) return toast('Pick what you carry');
  try {
    await api('/api/routes', { method: 'POST', body: { name: $('r_name').value.trim(), from_place: $('r_from').value.trim(), from_lat: pending.rf.lat ?? null, from_lng: pending.rf.lng ?? null, lat: pending.r.lat, lng: pending.r.lng, items: [...rItems], eta: $('r_eta').value.trim(), contact: $('r_contact').value.trim(), device: deviceId() } });
    ['r_name', 'r_from', 'r_eta', 'r_contact'].forEach(i => $(i).value = ''); rItems.clear(); chips('r_items', C.ITEMS, rItems);
    pending.r = {}; pending.rf = {}; $('r_coord').textContent = t('noDest'); $('rf_coord').textContent = t('noStart'); $('r_coord').classList.remove('set'); $('rf_coord').classList.remove('set'); $('r_warn').classList.remove('show'); removeMarker('r'); removeMarker('rf');
    await refresh(); toast(t('convoyAnnounced'));
  } catch (e) { toast('Failed: ' + e.message); }
};
$('c_submit').onclick = async () => {
  if (!$('c_name').value.trim()) return toast('Add a name');
  if (pending.c.lat == null) return toast('Set location');
  try {
    await api('/api/collection-points', { method: 'POST', body: { name: $('c_name').value.trim(), lat: pending.c.lat, lng: pending.c.lng, accepts: [...cItems], hours: $('c_hours').value.trim(), org: $('c_org').value.trim(), contact: $('c_contact').value.trim(), device: deviceId() } });
    ['c_name', 'c_hours', 'c_org', 'c_contact'].forEach(i => $(i).value = ''); cItems.clear(); chips('c_items', C.ACCEPTS, cItems);
    pending.c = {}; $('c_coord').textContent = t('noLoc'); $('c_coord').classList.remove('set'); removeMarker('c');
    await refresh(); toast(t('dropRegistered'));
  } catch (e) { toast('Failed: ' + e.message); }
};
$('g_submit').onclick = async () => {
  if (!$('g_name').value.trim()) return toast('Add NGO name');
  try {
    await api('/api/ngos', { method: 'POST', body: { name: $('g_name').value.trim(), focus: [...gFocus], area: $('g_area').value.trim(), needs_now: $('g_needs').value.trim(), contact: $('g_contact').value.trim(), website: $('g_website').value.trim() } });
    ['g_name', 'g_area', 'g_needs', 'g_contact', 'g_website'].forEach(i => $(i).value = ''); gFocus.clear(); chips('g_focus', C.FOCUS, gFocus);
    await refresh(); toast(t('addedRegistry'));
  } catch (e) { toast('Failed: ' + e.message); }
};

/* language, advisory toggle, helplines, share */
$('lang').value = getLang();
$('lang').onchange = e => setLang(e.target.value);
document.addEventListener('langchange', () => { renderAll(); renderAdvisory(); });
$('advToggle').onclick = () => $('advisory').classList.toggle('collapsed');
// collapsible side columns (so the full map is visible)
$('overlayToggle').onclick = () => { const o = $('overlay'); o.classList.toggle('min'); $('overlayToggle').firstChild.textContent = o.classList.contains('min') ? '▸ ' : '▾ '; };
const mainEl = document.querySelector('.main');
$('panelToggle').onclick = () => { mainEl.classList.add('hide-panel'); setTimeout(() => map.invalidateSize(), 60); };
$('panelReopen').onclick = () => { mainEl.classList.remove('hide-panel'); setTimeout(() => map.invalidateSize(), 60); };
// mobile: floating toggle for the bottom report panel
$('panelFab').onclick = () => { const collapsed = mainEl.classList.toggle('panel-collapsed'); $('panelFab').textContent = collapsed ? '☰' : '▾'; setTimeout(() => map.invalidateSize(), 240); };
// start collapsed on phones so the map fills the screen
if (window.innerWidth <= 860) { mainEl.classList.add('panel-collapsed'); $('panelFab').textContent = '☰'; }
$('shareMap').onclick = () => bp.shareMap();
// activity / transparency feed
const ACT_LABEL = { need_report: '🆘', convoy: '🚚', drop_off: '📦', ngo_listed: '🏳️', flood_marked: '🌊', flood_update: '🌊', vote: '✅', contact_reveal: '📞' };
$('activityBtn').onclick = async () => {
  $('activityModal').classList.add('show');
  $('activityList').innerHTML = `<div class="none">${t('loading')}</div>`;
  try {
    const { items } = await api('/api/activity');
    $('activityList').innerHTML = items.length ? items.map(a => `<div class="act-item">
      <span class="ae">${ACT_LABEL[a.kind] || '•'}</span>
      <span class="at">${esc((a.kind || '').replace(/_/g, ' '))}${a.area ? ' · ' + esc(a.area) : ''}</span>
      <span class="am">${agoText(a.created_at)} · ${esc(a.actor)}</span></div>`).join('')
      : `<div class="none">${t('noActivity')}</div>`;
  } catch { $('activityList').innerHTML = `<div class="none">${t('noActivity')}</div>`; }
};
$('activity_close').onclick = () => $('activityModal').classList.remove('show');
$('activityModal').onclick = e => { if (e.target === $('activityModal')) $('activityModal').classList.remove('show'); };
// tutorial / first-visit welcome
function openTutorial() { $('tutorialModal').classList.add('show'); }
function loadTutVideo() {
  const v = $('tutVideo'); if (v.querySelector('iframe')) return;
  v.innerHTML = `<iframe src="https://www.youtube.com/embed/${v.dataset.id}?autoplay=1&rel=0" allow="autoplay; encrypted-media" allowfullscreen></iframe>`;
}
$('guideBtn').onclick = openTutorial;
$('tutVideo').onclick = loadTutVideo;
$('tut_close').onclick = () => { $('tutorialModal').classList.remove('show'); localStorage.setItem('banpani.tutorial', '1'); };
$('tutorialModal').onclick = e => { if (e.target === $('tutorialModal')) { $('tutorialModal').classList.remove('show'); localStorage.setItem('banpani.tutorial', '1'); } };
if (!localStorage.getItem('banpani.tutorial')) setTimeout(openTutorial, 600);   // first visit
// news modal
$('newsBtn').onclick = async () => {
  $('newsModal').classList.add('show');
  $('newsList').innerHTML = `<div class="none">${t('loading')}</div>`;
  try {
    const { items } = await api('/api/news');
    $('newsList').innerHTML = items.length ? items.map(n => `<a class="news-item" href="${esc(n.link)}" target="_blank" rel="noopener">
      <div class="nt">${esc(n.title)}</div><div class="nm">${esc(n.source || '')}${n.pubDate ? ' · ' + agoText(n.pubDate) : ''}</div></a>`).join('')
      : `<div class="none">${t('newsNone')}</div>`;
  } catch { $('newsList').innerHTML = `<div class="none">${t('newsNone')}</div>`; }
};
$('news_close').onclick = () => $('newsModal').classList.remove('show');
$('newsModal').onclick = e => { if (e.target === $('newsModal')) $('newsModal').classList.remove('show'); };
// contact modal
$('contactBtn').onclick = () => $('contactModal').classList.add('show');
$('m_close').onclick = () => $('contactModal').classList.remove('show');
$('contactModal').onclick = e => { if (e.target === $('contactModal')) $('contactModal').classList.remove('show'); };
$('m_send').onclick = async () => {
  if (!$('m_message').value.trim()) return toast('Write a message first');
  try {
    await api('/api/messages', { method: 'POST', body: { name: $('m_name').value.trim(), contact: $('m_contact').value.trim(), message: $('m_message').value.trim(), device: deviceId() } });
    $('m_name').value = $('m_contact').value = $('m_message').value = '';
    $('contactModal').classList.remove('show'); toast(t('messageSent'));
  } catch (e) { toast('Failed: ' + e.message); }
};
// helplines dropdown
$('helpBtn').onclick = () => $('helpMenu').classList.toggle('show');
$('helpMenu').innerHTML = C.HELPLINES.map(h => `<a href="tel:${h.tel}">☎ ${esc(h.label)}</a>`).join('');
// hamburger menu (mobile)
$('menuBtn').onclick = e => { e.stopPropagation(); $('hdrActions').classList.toggle('show'); };
document.addEventListener('click', e => { if (!$('hdrActions').contains(e.target) && e.target !== $('menuBtn')) $('hdrActions').classList.remove('show'); });
$('hdrActions').addEventListener('click', e => { if (!e.target.closest('#helpBtn')) $('hdrActions').classList.remove('show'); });
// one-time disclaimer
if (!localStorage.getItem('banpani.disclaimer2')) $('disclaimer').classList.add('show');
$('discOk').onclick = () => { $('disclaimer').classList.remove('show'); localStorage.setItem('banpani.disclaimer2', '1'); };

/* ------------------------------- boot --------------------------------- */
(async function () {
  applyI18n();
  await loadOfficialFlood();
  try { await refresh(); await renderAdvisory(); } catch (e) { toast('Cannot reach server - is it running? ' + e.message); }
  setInterval(() => { refresh().catch(() => {}); renderAdvisory().catch(() => {}); }, 20000);
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
})();
