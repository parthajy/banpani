/* Banpani - public map app. Vanilla JS + Leaflet. Community-consensus, no accounts. */
const C = window.BANPANI;
// When window.EVENT is present (served by /e/<slug>) the SAME app runs scoped to ONE event:
// its bounds, its data, its disaster recipe. Absent = the Assam homepage, exactly as before.
const EVENT = window.EVENT || null;
const ITEMS = (EVENT && EVENT.items && EVENT.items.length) ? EVENT.items : C.ITEMS;
// Tailored per-family option catalogs (Offers supply kinds, Facility types) - injected by the
// server from disasters.js; fall back to a generic set on the homepage / if an event lacks them.
const DEFAULT_OFFER_KINDS = [['water', '💧 Water'], ['food', '🍚 Food'], ['medicine', '💊 Medicine'], ['shelter', '🏠 Shelter'], ['transport', '🚗 Transport'], ['other', '📦 Other']];
const DEFAULT_FACILITY_KINDS = [['shop', '🏪 Shop'], ['pharmacy', '💊 Pharmacy'], ['clinic', '🩺 Clinic'], ['hospital', '🏥 Hospital'], ['water', '🚰 Water point']];
const OFFER_KINDS = (EVENT && EVENT.offerKinds && EVENT.offerKinds.length) ? EVENT.offerKinds : DEFAULT_OFFER_KINDS;
const FACILITY_KINDS = (EVENT && EVENT.facilityKinds && EVENT.facilityKinds.length) ? EVENT.facilityKinds : DEFAULT_FACILITY_KINDS;
const OFFER_LABEL = Object.fromEntries(OFFER_KINDS.map(([k, l]) => [k, l]));
const FAC_LABEL = Object.fromEntries(FACILITY_KINDS.map(([k, l]) => [k, l]));
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
let currentMode = localStorage.getItem('banpani.mode') === 'rehab' ? 'rehab' : 'relief';
const inMode = r => (r.mode || 'relief') === currentMode;   // reports belong to relief OR rehab

// Which coordination modules apply here. Homepage = the classic Assam behavior (convoys only).
const hasModule = m => EVENT ? (EVENT.modules || []).includes(m) : (m === 'convoys');
// Does an available offer meet this need? Match the offer's kind/label words against the need items
// (offer 'oxygen' ↔ need "Oxygen"; 'beds' ↔ "Hospital bed"; 'water' ↔ "Drinking water", ...).
function offerMatchesNeed(o, need) {
  const hay = (need.items || []).join(' · ').toLowerCase();
  const key = String(o.kind || '').toLowerCase().replace(/s$/, '');
  if (key.length > 2 && hay.includes(key)) return true;
  return String(OFFER_LABEL[o.kind] || '').toLowerCase().replace(/[^a-z ]/g, ' ').split(/\s+/).some(w => w.length > 3 && hay.includes(w.replace(/s$/, '')));
}
// "coverage" = someone/something is already addressing this need. Recipe-aware: a convoy inbound
// (relief logistics) OR a matching supply Offer nearby (pandemic/drought supply↔demand).
function coverageOf(need) {
  let best = null;
  if (hasModule('convoys')) {
    for (const r of STATE.routes) {
      if (r.status !== 'active') continue;
      const d = haversine([need.lat, need.lng], [r.lat, r.lng]);
      if (d <= C.GAP_RADIUS_KM && (r.items || []).some(i => need.items.includes(i)) && (!best || d < best.dist)) best = { type: 'convoy', r, dist: d };
    }
  }
  if (hasModule('offers')) {
    for (const o of (STATE.offers || [])) {
      if (o.lat == null) continue;
      const d = haversine([need.lat, need.lng], [o.lat, o.lng]);
      if (d <= C.GAP_RADIUS_KM && offerMatchesNeed(o, need) && (!best || d < best.dist)) best = { type: 'offer', o, dist: d };
    }
  }
  return best;
}
// a "gap" = something real that nobody is on. Relief: no convoy inbound. Rehab: not yet adopted.
function isGap(n) {
  if (n.status === 'resolved' || n.verify_status === 'false') return false;
  if ((n.mode || 'relief') === 'rehab') return !n.adopted;
  return !coverageOf(n);
}

/* -------------------------------- map --------------------------------- */
const B = L.latLngBounds(EVENT ? EVENT.bounds : C.BOUNDS);
const map = L.map('map', { zoomControl: false, minZoom: EVENT ? (EVENT.minZoom || 5) : C.MIN_ZOOM, maxZoom: C.MAX_ZOOM, maxBounds: B, maxBoundsViscosity: 1.0 }).setView(EVENT ? EVENT.center : C.CENTER, EVENT ? EVENT.zoom : C.ZOOM);
L.control.zoom({ position: 'topright' }).addTo(map);   // top-right, away from the View controls
// Full-screen control lives ON the map (top-right, below zoom) so it's always visible - even in the
// default view where the side panel covers the window's right edge. Hides the side panels
// (body.map-max) + requests browser full screen. Guarded so the smoke test (no fullscreen.js) skips it.
if (window.attachFullscreen) {
  const FsCtl = L.Control.extend({
    options: { position: 'topright' },
    onAdd() {
      const c = L.DomUtil.create('div', 'leaflet-bar leaflet-control fs-ctl');
      const a = L.DomUtil.create('a', '', c); a.href = '#'; a.title = 'Full screen'; a.setAttribute('role', 'button'); a.innerHTML = '⛶';
      L.DomEvent.disableClickPropagation(c);
      window.attachFullscreen(a, document.documentElement, map, on => document.body.classList.toggle('map-max', on));
      return c;
    },
  });
  map.addControl(new FsCtl());
}
// Layers control: on phones there is no floating left panel - this button (grouped with zoom + full
// screen on the right edge) opens the Layers + Status controls as a bottom-sheet, the pattern people
// already know from map apps. On desktop it is hidden (the left panel is always visible there).
const LayersCtl = L.Control.extend({
  options: { position: 'topright' },
  onAdd() {
    const c = L.DomUtil.create('div', 'leaflet-bar leaflet-control layers-ctl');
    const a = L.DomUtil.create('a', '', c); a.href = '#'; a.title = 'Layers'; a.setAttribute('role', 'button'); a.setAttribute('aria-label', 'Layers');
    a.innerHTML = '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 2 8l10 5 10-5-10-5Z"/><path d="M2 13l10 5 10-5"/></svg>';
    L.DomEvent.disableClickPropagation(c);
    L.DomEvent.on(a, 'click', e => { L.DomEvent.preventDefault(e); toggleLayersSheet(); });
    return c;
  },
});
map.addControl(new LayersCtl());
function openLayersSheet() { const o = $('overlay'); o.classList.remove('min'); o.classList.add('sheet-open'); const b = $('ovlBackdrop'); if (b) b.classList.add('on'); }
function closeLayersSheet() { $('overlay').classList.remove('sheet-open'); const b = $('ovlBackdrop'); if (b) b.classList.remove('on'); }
function toggleLayersSheet() { $('overlay').classList.contains('sheet-open') ? closeLayersSheet() : openLayersSheet(); }

C.addBasemap(map, { bounds: B });   // CARTO Dark Matter, auto-falls back to OSM if it ever fails
map.setMaxBounds(B);
map.on('drag', () => map.panInsideBounds(B, { animate: false }));  // hard clamp - no drift off Assam
// deep-link support (#@lat,lng)
const h = location.hash.match(/@(-?\d+\.?\d*),(-?\d+\.?\d*)/);
if (h) map.setView([+h[1], +h[2]], 11);

const layers = { official: L.layerGroup().addTo(map), flood: L.layerGroup().addTo(map), needs: L.layerGroup().addTo(map), photos: L.layerGroup().addTo(map), cover: L.layerGroup().addTo(map), ngo: L.layerGroup().addTo(map), offers: L.layerGroup().addTo(map), blocked: L.layerGroup().addTo(map), facilities: L.layerGroup().addTo(map), evac: L.layerGroup().addTo(map) };
const freshIcon = (emoji, stale) => L.divIcon({ html: `<div class="fresh-pin ${stale ? 'stale' : ''}">${emoji}</div>`, className: '', iconSize: [24, 24], iconAnchor: [12, 12] });
const freshTxt = m => (m < 60 ? Math.max(1, m) + 'm' : m < 1440 ? Math.round(m / 60) + 'h' : Math.round(m / 1440) + 'd') + ' ago';
const floodColor = s => ({ high: '#f0453a', medium: '#f5a623', receding: '#8fbaff' }[s] || '#f0453a');

function pinIcon(status, verify, emoji, gap) {
  const cls = `pin ${status} ${verify === 'unverified' ? 'unverified' : ''} ${gap ? 'gap' : ''}`;
  return L.divIcon({ html: `<div class="${cls}"><span>${emoji}</span></div>`, className: '', iconSize: [24, 24], iconAnchor: [12, 24], popupAnchor: [0, -22] });
}
const emojiIcon = e => L.divIcon({ html: `<div class="emoji">${e}</div>`, className: '', iconSize: [24, 24], iconAnchor: [12, 12] });

/* ------------------------------ rendering ----------------------------- */
let officialFlood = null, officialCamps = { camps: [], updated: '' };
async function loadOfficialFlood() {
  if (EVENT && !EVENT.official) { officialFlood = { type: 'FeatureCollection', features: [] }; officialCamps = { camps: [], updated: '' }; return; }
  // Which official dataset: homepage = Assam; flagship events name their own (assam / odisha / …).
  const od = EVENT ? (EVENT.officialData || 'assam') : 'assam';
  const geo = od === 'assam' ? C.FLOOD_GEOJSON : `data/${od}-districts.geojson`;
  const camps = od === 'assam' ? 'data/relief-camps.json' : `data/${od}-camps.json`;
  try { officialFlood = await (await fetch(geo)).json(); } catch { officialFlood = { type: 'FeatureCollection', features: [] }; }
  try { officialCamps = await (await fetch(camps)).json(); } catch { officialCamps = { camps: [], updated: '' }; }
}
// Official affected-areas layer: district shading (dated + sourced) + relief-camp summaries.
function renderOfficial() {
  layers.official.clearLayers();
  if (!$('ly_official').checked || !officialFlood) return;
  // shading is purely visual (interactive:false) so taps pass through to place a pin
  L.geoJSON(officialFlood, {
    filter: f => f.properties.severity,
    interactive: false,
    style: f => ({ color: floodColor(f.properties.severity), weight: 1.4, fillColor: floodColor(f.properties.severity), fillOpacity: 0.20 }),
  }).addTo(layers.official);
  const src = officialCamps.source ? '🏛️ Official · ' + officialCamps.source : t('sourceASDMA');
  const dn = $('officialDate'); if (dn) dn.textContent = officialCamps.updated ? `${src} · ${officialCamps.updated}` : '';
  for (const c of (officialCamps.camps || [])) {
    L.marker([c.lat, c.lng], { icon: emojiIcon('🏕️') }).addTo(layers.official)
      .bindPopup(`<b>🏕️ ${esc(c.district)}</b><br>${c.camps ? c.camps + ' ' + t('reliefCamps') + '<br>' : ''}${c.people ? '~' + Number(c.people).toLocaleString() + ' ' + t('sheltered') + '<br>' : ''}${c.note ? esc(c.note) + '<br>' : ''}<small>${src} · ${esc(officialCamps.updated || '')}</small>`);
  }
}
function renderFlood() {
  layers.flood.clearLayers();
  if (!$('ly_flood').checked) return;
  // faint district outlines for geographic context (official shading lives in the Official layer)
  if (officialFlood) L.geoJSON(officialFlood, { style: () => ({ color: '#3a4757', weight: 0.7, fill: false, opacity: 0.5 }) }).addTo(layers.flood);
  if (currentMode !== 'relief') return;   // live flood markers are a relief-phase signal
  for (const p of STATE.flood_polygons) {
    L.geoJSON({ type: 'Feature', geometry: p.geojson, properties: {} }, { interactive: false, style: { color: floodColor(p.severity), weight: 2, dashArray: '4 4', fillColor: floodColor(p.severity), fillOpacity: 0.30 } }).addTo(layers.flood);
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
  const rehab = (n.mode || 'relief') === 'rehab';
  let statusTxt, actionRow;
  if (rehab) {
    statusTxt = n.delivered
      ? `<div style="color:#7fe6b0">✅ ${t('deliveredConfirmed')}${n.adopted_by ? ' - ' + esc(n.adopted_by) : ''}</div>`
      : n.adopted
        ? `<div style="color:#8fbaff">🤝 ${t('beingHandled')}: <b>${esc(n.adopted_by)}</b></div>`
        : `<div style="color:#ff8079">⚠️ ${t('notAdopted')}</div>`;
    actionRow = !n.adopted
      ? `<div class="vbtns">
          <button onclick="bp.vote(${n.id},'trust','confirm')">✅ ${t('confirm')} (${n.confirmations || 0})</button>
          <button onclick="bp.adopt(${n.id})">🤝 ${t('adopt')}</button>
          <button onclick="bp.vote(${n.id},'trust','false')">⚑ ${t('notReal')}</button>
        </div>`
      : `<div class="vbtns">
          <button onclick="bp.vote(${n.id},'resolve','yes')">✓ ${t('markDelivered')} (${n.resolve_votes || 0}/2)</button>
          <button onclick="bp.dispute(${n.id})" title="${t('disputeHint')}">🚩 ${t('dispute')}</button>
        </div>`;
  } else {
    const cov = coverageOf(n);
    statusTxt = n.status === 'resolved' ? '' : cov
      ? (cov.type === 'offer'
        ? `<div style="color:#7fe6b0">✅ ${esc(OFFER_LABEL[cov.o.kind] || 'Supply')} available nearby (~${cov.dist.toFixed(1)}km)</div>`
        : `<div style="color:#7fe6b0">🚚 ${esc(cov.r.name)} inbound (~${cov.dist.toFixed(1)}km)</div>`)
      : `<div style="color:#ff8079">⚠️ ${hasModule('offers') && !hasModule('convoys') ? 'no matching supply nearby' : 'nobody heading here yet'}</div>`;
    actionRow = `<div class="vbtns">
        <button onclick="bp.vote(${n.id},'trust','confirm')">✅ ${t('confirm')} (${n.confirmations || 0})</button>
        <button onclick="bp.vote(${n.id},'resolve','yes')">✓ ${t('delivered')}</button>
        <button onclick="bp.vote(${n.id},'trust','false')">⚑ ${t('notReal')}</button>
      </div>`;
  }
  return `<b>${esc(n.place)}</b> <span class="pmeta">${n.verify_status}${n.confirmations ? ' · ' + n.confirmations + '✅' : ''}</span>
    <div style="margin:4px 0">${rehab ? '🔨' : '🆘'} ${n.items.map(esc).join(', ')}</div>
    ${n.people ? '~' + n.people + (rehab ? ' families<br>' : ' people<br>') : ''}${n.details ? esc(n.details) + '<br>' : ''}${statusTxt}
    ${actionRow}
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
    if (!inMode(n)) continue;
    const gap = isGap(n);
    if (!needMatchesView(n, gap)) continue;
    const st = n.delivered ? 'resolved' : (n.adopted ? 'claimed' : n.status);
    const emoji = n.delivered ? '✓' : n.adopted ? '🤝' : (n.confirmations >= C.CONFIRM_AT ? '!' : '?');
    L.marker([n.lat, n.lng], { icon: pinIcon(st, n.verify_status, emoji, gap && currentView !== 'today') }).addTo(layers.needs).bindPopup(needPopup(n));
  }
}
function renderCover() {
  layers.cover.clearLayers();
  if (currentMode !== 'relief' || !$('ly_cover').checked) return;
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
  if (currentMode !== 'relief' || !$('ly_ngo').checked) return;
  for (const c of STATE.collection_points) {
    L.marker([c.lat, c.lng], { icon: emojiIcon('📦') }).addTo(layers.ngo)
      .bindPopup(`<b>📦 ${esc(c.name)}</b><br>Accepts: ${(c.accepts || []).map(esc).join(', ')}<br>${c.hours ? esc(c.hours) + '<br>' : ''}${c.org ? esc(c.org) + '<br>' : ''}${c.contact ? '📞 ' + esc(c.contact) : ''}`);
  }
}
function renderPane() {
  const gaps = STATE.reports.filter(n => inMode(n) && isGap(n)).map(n => ({ ...n, age: ageH(n.created_at), pri: (n.people || 20) * (1 + ageH(n.created_at) / 24) })).sort((a, b) => b.pri - a.pri).slice(0, 8);
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
  const r = STATE.reports.filter(inMode);
  if (currentMode === 'rehab') {
    // Promised vs Delivered
    $('s_open').textContent = r.filter(n => !n.delivered).length;
    $('s_unv').textContent = r.filter(n => n.adopted && !n.delivered).length;   // promised (adopted, not yet done)
    $('s_cov').textContent = r.filter(n => n.delivered).length;                 // delivered (confirmed)
    $('s_gap').textContent = r.filter(isGap).length;                            // not adopted
    $('lbl_unv').textContent = t('promised'); $('lbl_cov').textContent = t('deliveredLbl'); $('lbl_gap').textContent = t('notAdoptedLbl');
  } else {
    $('s_open').textContent = r.filter(n => n.status !== 'resolved').length;
    $('s_unv').textContent = r.filter(n => n.verify_status === 'unverified' && n.status !== 'resolved').length;
    $('s_cov').textContent = STATE.routes.filter(x => x.status === 'active').length;
    $('s_gap').textContent = r.filter(isGap).length;
    $('lbl_unv').textContent = t('unverif'); $('lbl_cov').textContent = t('convoys'); $('lbl_gap').textContent = t('gapsStat');
  }
}
function renderFeed() {
  const list = $('feedlist'); if (!list) return;
  const rows = STATE.reports.filter(inMode).sort((a, b) => {
    const rank = n => n.delivered ? 4 : isGap(n) ? 0 : n.verify_status === 'unverified' ? 1 : 2;
    return rank(a) - rank(b);
  });
  if (!rows.length) { list.innerHTML = `<div class="empty">${t('noReports')}</div>`; return; }
  const rehab = currentMode === 'rehab';
  list.innerHTML = rows.map(n => {
    const gap = isGap(n);
    const cardCls = n.delivered ? 'resolved' : n.adopted ? 'claimed' : n.status;
    const rightBadge = rehab
      ? (n.delivered ? '<span class="badge confirmed">✓ ' + t('deliveredLbl') + '</span>' : n.adopted ? '<span class="badge claimed">🤝 ' + esc(n.adopted_by) + '</span>' : '<span class="badge gap">' + t('notAdoptedLbl') + '</span>')
      : `<span class="badge ${n.verify_status === 'confirmed' ? 'confirmed' : 'unverified'}">${esc(n.verify_status)}${n.confirmations ? ' ' + n.confirmations + '✅' : ''}</span>`;
    const metaTail = rehab ? '' : (gap ? ' · <span style="color:#ff8079">no convoy inbound</span>' : '');
    return `<div class="card ${cardCls}" data-lat="${n.lat}" data-lng="${n.lng}">
      <div class="top"><span class="place">${esc(n.place)} ${gap && !rehab ? '<span class="badge gap">GAP</span>' : ''}</span>${rightBadge}</div>
      <div class="items">${rehab ? '🔨' : '🆘'} ${n.items.map(esc).join(', ')}</div>
      <div class="meta">${n.people ? '~' + n.people + (rehab ? ' families · ' : ' ppl · ') : ''}${n.delivered ? t('deliveredLbl') : n.adopted ? t('promised') : n.status}${metaTail}</div>
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
function renderOffers() {
  layers.offers.clearLayers();
  if (!$('ly_offers').checked) return;
  for (const o of (STATE.offers || [])) {
    if (o.lat == null) continue;
    const stale = o.fresh_min >= 480;
    const pop = `<b>${esc(OFFER_LABEL[o.kind] || '📦')}</b>${o.note ? '<br>' + esc(o.note) : ''}<br><small>${stale ? '⚠ ' : '✅ '}${freshTxt(o.fresh_min)}</small>`
      + `<div class="vbtns"><button onclick="bp.offConfirm(${o.id})">✅ Still here</button><button onclick="bp.offGone(${o.id})">✖ Gone</button>${o.has_contact ? `<button onclick="bp.offContact(${o.id})">📞 Contact</button>` : ''}</div>`;
    L.marker([o.lat, o.lng], { icon: freshIcon('📦', stale) }).addTo(layers.offers).bindPopup(pop);
  }
}
function renderBlocked() {
  layers.blocked.clearLayers();
  if (!$('ly_blocked').checked) return;
  for (const x of (STATE.blocked || [])) {
    if (x.lat == null) continue;
    const pop = `<b>🚧 ${esc(x.label || 'Blocked road')}</b><br><small>${x.kind === 'partial' ? 'Partly passable' : 'Fully blocked'} · ${freshTxt(x.fresh_min)}</small>`
      + `<div class="vbtns"><button onclick="bp.blConfirm(${x.id})">✅ Still blocked</button><button onclick="bp.blClear(${x.id})">✔ Cleared</button></div>`;
    L.marker([x.lat, x.lng], { icon: freshIcon('🚧') }).addTo(layers.blocked).bindPopup(pop);
  }
}
function renderFacilities() {
  layers.facilities.clearLayers();
  if (!$('ly_facilities').checked) return;
  for (const f of (STATE.facilities || [])) {
    if (f.lat == null) continue;
    const st = f.status || 'open';
    const dot = st === 'closed' ? '🔴' : st === 'limited' ? '🟡' : '🟢';
    const stTxt = st === 'closed' ? '⛔ Closed' : st === 'limited' ? '🟡 Limited' : '✅ Open';
    const pop = `<b>${esc(FAC_LABEL[f.kind] || '📍 Facility')}${f.name ? ' · ' + esc(f.name) : ''}</b>${f.note ? '<br>' + esc(f.note) : ''}<br><small>${stTxt} · ${freshTxt(f.fresh_min)}</small>`
      + `<div class="vbtns"><button onclick="bp.facSet(${f.id},'open')">✅ Open</button><button onclick="bp.facSet(${f.id},'limited')">🟡 Limited</button><button onclick="bp.facSet(${f.id},'closed')">⛔ Closed</button></div>`;
    L.marker([f.lat, f.lng], { icon: freshIcon(dot) }).addTo(layers.facilities).bindPopup(pop);
  }
}
function renderEvac() {
  layers.evac.clearLayers();
  if (!$('ly_evac').checked) return;
  for (const e of (STATE.evac || [])) {
    if (e.from_lat == null || e.to_lat == null) continue;
    L.polyline([[e.from_lat, e.from_lng], [e.to_lat, e.to_lng]], { color: '#22c55e', weight: 4, opacity: .85, dashArray: '9 7' }).addTo(layers.evac)
      .bindPopup(`<b>🏃 Escape route</b>${e.label ? '<br>' + esc(e.label) : ''}<br><small>seen ${freshTxt(e.fresh_min)}</small><div class="vbtns"><button onclick="bp.evacConfirm(${e.id})">✅ Still safe</button><button onclick="bp.evacClose(${e.id})">✖ Blocked</button></div>`);
    L.marker([e.from_lat, e.from_lng], { icon: freshIcon('⚠️') }).addTo(layers.evac).bindPopup('⚠️ Evacuate from here');
    L.marker([e.to_lat, e.to_lng], { icon: freshIcon('🏁') }).addTo(layers.evac).bindPopup('🏁 Safe: ' + esc(e.label || 'this way'));
  }
}
function renderAll() { renderOfficial(); renderFlood(); renderNeeds(); renderPhotos(); renderCover(); renderNgo(); renderOffers(); renderBlocked(); renderFacilities(); renderEvac(); renderPane(); renderStats(); renderFeed(); renderNgoList(); renderFloodNow(); }

/* -------------------------------- photos -------------------------------- */
function photoTagLabel(k) { for (const m of ['relief', 'rehab']) { const f = (C.PHOTO_TAGS[m] || []).find(x => x.k === k); if (f) return f.l; } return k || ''; }
function renderPhotos() {
  layers.photos.clearLayers();
  if (!$('ly_photos').checked) return;
  for (const p of (STATE.photos || [])) {
    if ((p.mode || 'relief') !== currentMode || p.lat == null) continue;
    L.marker([p.lat, p.lng], { icon: emojiIcon('📷') }).addTo(layers.photos)
      .bindPopup(`<div class="photopop"><img src="${esc(p.url)}" loading="lazy" onclick="bp.enlarge('${esc(p.url)}')"/>
        <div class="pt">${esc(photoTagLabel(p.tag))}${p.caption ? ' · ' + esc(p.caption) : ''} <span class="pmeta">${agoText(p.created_at)}</span></div>
        <div class="vbtns"><button onclick="bp.dirTo(${p.lat},${p.lng})">🧭 ${t('directions')}</button><button onclick="bp.flagPhoto(${p.id})">⚑ ${t('flag')}</button></div></div>`, { maxWidth: 260 });
  }
}
// resize + re-encode client-side (shrinks big phone photos AND strips EXIF/GPS metadata)
function resizePhoto(file, maxDim = 1280, quality = 0.72) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      let w = img.width, h = img.height;
      if (Math.max(w, h) > maxDim) { const s = maxDim / Math.max(w, h); w = Math.round(w * s); h = Math.round(h * s); }
      const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
      cv.getContext('2d').drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(img.src);
      resolve(cv.toDataURL('image/jpeg', quality));
    };
    img.onerror = reject; img.src = URL.createObjectURL(file);
  });
}
let photoTag = null, photoData = null;
function buildPhotoTags() {
  const el = $('p_tag'); if (!el) return;
  const tags = C.PHOTO_TAGS[currentMode] || C.PHOTO_TAGS.relief;
  photoTag = tags[0].k;
  el.innerHTML = tags.map((t, i) => `<button data-k="${t.k}" class="${i === 0 ? 'on' : ''}">${esc(t.l)}</button>`).join('');
  el.querySelectorAll('button').forEach(b => b.onclick = () => { el.querySelectorAll('button').forEach(x => x.classList.remove('on')); b.classList.add('on'); photoTag = b.dataset.k; });
}
$('p_file').onchange = async () => {
  const f = $('p_file').files[0]; if (!f) return;
  try { photoData = await resizePhoto(f); $('p_preview').innerHTML = `<img src="${photoData}"/>`; }
  catch { toast('Could not read image'); }
};
$('p_gps').onclick = () => useGPS('p');
$('p_submit').onclick = async () => {
  if (!photoData) return toast(t('pickPhoto'));
  if (pending.p.lat == null) return toast(t('setPhotoLoc'));
  try {
    await api('/api/photos', { method: 'POST', body: { image: photoData, tag: photoTag, mode: currentMode, lat: pending.p.lat, lng: pending.p.lng, caption: $('p_caption').value.trim(), event_id: EVENT ? EVENT.id : undefined, device: deviceId() } });
    photoData = null; $('p_file').value = ''; $('p_preview').innerHTML = ''; $('p_caption').value = '';
    pending.p = {}; $('p_coord').textContent = t('noLoc'); $('p_coord').classList.remove('set'); removeMarker('p');
    await refresh(); toast(t('photoUploaded')); maybeCert('');
  } catch (e) { toast('Failed: ' + e.message); }
};
// gallery
function openGallery() {
  $('galleryModal').classList.add('show');
  const grid = $('galleryGrid');
  const ps = (STATE.photos || []).filter(p => (p.mode || 'relief') === currentMode);
  grid.innerHTML = ps.length ? ps.map(p => `<div class="gcell" onclick="bp.enlarge('${esc(p.url)}')"><img src="${esc(p.url)}" loading="lazy"/><span>${esc(photoTagLabel(p.tag))}</span></div>`).join('') : `<div class="none">${t('noPhotos')}</div>`;
}
$('galleryBtn2').onclick = openGallery;
$('gallery_close').onclick = () => $('galleryModal').classList.remove('show');
$('galleryModal').onclick = e => { if (e.target === $('galleryModal')) $('galleryModal').classList.remove('show'); };

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
let evtWx = null, evtWxAt = 0;
async function renderAdvisory() {
  renderFloodNow();
  // Non-Assam events: the outlook must be for THIS place, not Assam. Fetch it from Open-Meteo
  // (free, no key) for the event's location, cached ~30 min. Assam homepage/event keep the server feed.
  const isAssam = EVENT && (EVENT.officialData === 'assam' || EVENT.source === 'assam');
  if (EVENT && !isAssam && Array.isArray(EVENT.center)) {
    try {
      if (!evtWx || Date.now() - evtWxAt > 30 * 60 * 1000) {
        const [lat, lng] = EVENT.center;
        const j = await (await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&daily=precipitation_sum&forecast_days=3&timezone=auto`)).json();
        const p = ((j.daily && j.daily.precipitation_sum) || []).map(x => Math.round(x || 0));
        const total = p.reduce((a, b) => a + b, 0);
        evtWx = {
          headline: total >= 100 ? '⚠️ Heavy rain ahead' : '🌧️ ' + t('outlook'),
          body: p.length ? `Rain outlook (next 3 days): ${p.map(x => x + 'mm').join(' · ')}.` + (total >= 100 ? ' Heavy rain expected - flooding may worsen.' : total >= 30 ? ' Moderate rain expected.' : ' Little rain expected.') : '',
          meta: 'Open-Meteo · ' + t('updated') + ' ' + new Date().toLocaleString(),
        };
        evtWxAt = Date.now();
      }
      $('advHeadline').textContent = evtWx.headline; $('advText').textContent = evtWx.body; $('advMeta').textContent = evtWx.meta;
      return;
    } catch {}
  }
  try {
    const a = await api('/api/advisory');
    $('advHeadline').textContent = a.headline || '';
    $('advText').textContent = a.body || '';
    $('advMeta').textContent = (a.source ? a.source + ' · ' : '') + (a.updated_at ? t('updated') + ' ' + new Date(a.updated_at).toLocaleString() : '');
  } catch {}
}

/* ------------------------- consensus / actions ------------------------- */
window.bp = {
  dirTo: (lat, lng) => window.open(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`, '_blank'),
  flagPhoto: async (id) => { try { const r = await api(`/api/photos/${id}/flag`, { method: 'POST', body: { device: deviceId() } }); toast(r.hidden ? t('photoRemoved') : t('flagged')); map.closePopup(); await refresh(); } catch (e) { toast('Failed: ' + e.message); } },
  enlarge: (url) => { const d = document.createElement('div'); d.className = 'lightbox'; d.innerHTML = `<img src="${url}"/>`; d.onclick = () => d.remove(); document.body.appendChild(d); },
  offConfirm: async id => { try { await api(`/api/offers/${id}/confirm`, { method: 'POST', body: { device: deviceId() } }); toast('Confirmed available ✅'); map.closePopup(); await refresh(); } catch (e) { toast('Failed: ' + e.message); } },
  offGone: async id => { try { const r = await api(`/api/offers/${id}/gone`, { method: 'POST', body: { device: deviceId() } }); toast(r.gone ? 'Marked gone' : `Gone vote (${r.votes}/2)`); map.closePopup(); await refresh(); } catch (e) { toast('Failed: ' + e.message); } },
  offContact: async id => { try { const r = await api(`/api/offers/${id}/contact`); toast(r.contact ? '📞 ' + r.contact : t('noContact')); } catch (e) { toast('Failed: ' + e.message); } },
  blConfirm: async id => { try { await api(`/api/blocked/${id}/confirm`, { method: 'POST', body: { device: deviceId() } }); toast('Thanks - kept current'); map.closePopup(); await refresh(); } catch (e) { toast('Failed: ' + e.message); } },
  blClear: async id => { try { const r = await api(`/api/blocked/${id}/clear`, { method: 'POST', body: { device: deviceId() } }); toast(r.cleared ? 'Marked cleared ✔' : `Clear vote (${r.clears}/2)`); map.closePopup(); await refresh(); } catch (e) { toast('Failed: ' + e.message); } },
  facSet: async (id, status) => { try { await api(`/api/facilities/${id}/status`, { method: 'POST', body: { status, device: deviceId() } }); toast(status === 'open' ? '✅ Marked open' : status === 'limited' ? '🟡 Marked limited' : '⛔ Marked closed'); map.closePopup(); await refresh(); } catch (e) { toast('Failed: ' + e.message); } },
  evacConfirm: async id => { try { await api(`/api/evac/${id}/confirm`, { method: 'POST', body: { device: deviceId() } }); toast('Thanks - kept current'); map.closePopup(); await refresh(); } catch (e) { toast('Failed: ' + e.message); } },
  evacClose: async id => { try { const r = await api(`/api/evac/${id}/close`, { method: 'POST', body: { device: deviceId() } }); toast(r.closed ? 'Marked blocked' : `Blocked vote (${r.votes}/2)`); map.closePopup(); await refresh(); } catch (e) { toast('Failed: ' + e.message); } },
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
    const text = `🆘 ${n.place} needs: ${n.items.join(', ')}${n.people ? ` (~${n.people} people)` : ''}. ${isGap(n) ? 'No help has reached this yet.' : ''} Help via Banpani → ${mapUrl(n.lat, n.lng)}`;
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
  adopt: (id) => { adoptTargetId = id; $('adopt_name').value = ''; $('adoptModal').classList.add('show'); setTimeout(() => $('adopt_name').focus(), 60); },
  dispute: async (id) => {
    try { const r = await api(`/api/reports/${id}/dispute`, { method: 'POST', body: { device: deviceId() } });
      toast(r.cleared ? t('disputeCleared') : `${t('disputed')} (${r.disputes}/2)`); map.closePopup(); await refresh(); }
    catch (e) { toast('Failed: ' + e.message); }
  },
};
// adopt modal
let adoptTargetId = null;
$('adopt_ok').onclick = async () => {
  const name = $('adopt_name').value.trim(); if (!name) return toast(t('enterName'));
  try { await api(`/api/reports/${adoptTargetId}/adopt`, { method: 'POST', body: { name, device: deviceId() } }); $('adoptModal').classList.remove('show'); toast(t('adopted')); await refresh(); }
  catch (e) { toast('Failed: ' + e.message); }
};
$('adopt_cancel').onclick = () => $('adoptModal').classList.remove('show');
$('adoptModal').onclick = e => { if (e.target === $('adoptModal')) $('adoptModal').classList.remove('show'); };

/* -------- shareable volunteer certificate (fires on a device's FIRST pin) --------
   100% client-side: nothing is collected, stored, or sent. The name (optional) only
   ever touches the canvas. It's a braggable share card to pull more helpers in. */
const CERT_THEME = { relief: { a: '#0d2b66', b: '#2f7bff', emoji: '🌊', tag: 'FLOOD RELIEF' },
                     rehab:  { a: '#5a3906', b: '#f59e0b', emoji: '🔨', tag: 'FLOOD REHABILITATION' } };
let certPlace = '';
function certWrap(g, text, x, y, maxW, lh) {
  const words = String(text).split(' '); let line = '', yy = y;
  for (const w of words) { const test = line ? line + ' ' + w : w;
    if (g.measureText(test).width > maxW && line) { g.fillText(line, x, yy); line = w; yy += lh; } else line = test; }
  g.fillText(line, x, yy); return yy;
}
function drawCert(name) {
  const cv = $('certCanvas'); if (!cv || !cv.getContext) return;
  const g = cv.getContext('2d'), W = cv.width, H = cv.height, th = CERT_THEME[currentMode] || CERT_THEME.relief;
  const grad = g.createLinearGradient(0, 0, 0, H); grad.addColorStop(0, th.a); grad.addColorStop(1, th.b);
  g.fillStyle = grad; g.fillRect(0, 0, W, H);
  const rg = g.createRadialGradient(W / 2, H * 0.4, 40, W / 2, H * 0.4, W * 0.75);
  rg.addColorStop(0, 'rgba(255,255,255,.16)'); rg.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = rg; g.fillRect(0, 0, W, H);
  g.strokeStyle = 'rgba(255,255,255,.32)'; g.lineWidth = 3; g.strokeRect(46, 46, W - 92, H - 92);
  g.textAlign = 'center';
  g.fillStyle = 'rgba(255,255,255,.95)'; g.font = '800 46px system-ui,-apple-system,sans-serif';
  g.fillText('B A N P A N I', W / 2, 152);
  g.font = '600 25px system-ui,sans-serif'; g.fillStyle = 'rgba(255,255,255,.62)';
  g.fillText(th.tag + ' · VOLUNTEER', W / 2, 196);
  g.beginPath(); g.arc(W / 2, 338, 92, 0, 6.2832); g.fillStyle = 'rgba(255,255,255,.13)'; g.fill();
  g.font = '94px system-ui,"Apple Color Emoji","Segoe UI Emoji"'; g.fillText(th.emoji, W / 2, 372);
  g.fillStyle = '#fff'; g.font = '900 76px system-ui,-apple-system,sans-serif';
  g.fillText('CERTIFICATE', W / 2, 514);
  g.font = '500 29px system-ui,sans-serif'; g.fillStyle = 'rgba(255,255,255,.72)';
  g.fillText('of Community Service', W / 2, 558);
  g.fillStyle = '#fff'; g.font = 'italic 700 62px Georgia,"Times New Roman",serif';
  const nm = ((name || '').trim() || t('aVolunteer')).slice(0, 24);
  g.fillText(nm, W / 2, 674);
  g.strokeStyle = 'rgba(255,255,255,.38)'; g.lineWidth = 2; g.beginPath(); g.moveTo(W / 2 - 240, 702); g.lineTo(W / 2 + 240, 702); g.stroke();
  g.font = '400 34px system-ui,sans-serif'; g.fillStyle = 'rgba(255,255,255,.92)';
  const body = certPlace ? `helped coordinate flood relief in ${certPlace},` : 'helped coordinate flood relief,';
  const y2 = certWrap(g, body, W / 2, 784, W - 200, 46);
  g.fillText('because no one should be stranded.', W / 2, y2 + 46);
  g.font = '800 36px system-ui,sans-serif'; g.fillStyle = '#fff';
  g.fillText('banpani.org', W / 2, H - 150);
  g.font = '400 26px system-ui,sans-serif'; g.fillStyle = 'rgba(255,255,255,.72)';
  g.fillText('No accounts. Just neighbours helping neighbours.', W / 2, H - 106);
}
function openCert(place) { certPlace = (place || '').slice(0, 40); drawCert($('cert_name').value); $('certModal').classList.add('show'); }
function maybeCert(place) { if (!localStorage.getItem('banpani.hero')) { localStorage.setItem('banpani.hero', '1'); openCert(place); } }
$('cert_name').oninput = () => drawCert($('cert_name').value);
$('cert_close').onclick = () => $('certModal').classList.remove('show');
$('certModal').onclick = e => { if (e.target === $('certModal')) $('certModal').classList.remove('show'); };
const certBlob = () => new Promise(r => $('certCanvas').toBlob(r, 'image/png'));
async function saveCert() { const b = await certBlob(); const u = URL.createObjectURL(b); const a = document.createElement('a'); a.href = u; a.download = 'banpani-certificate.png'; a.click(); URL.revokeObjectURL(u); toast(t('certSaved')); }
$('cert_share').onclick = async () => {
  try { const b = await certBlob(); const file = new File([b], 'banpani-certificate.png', { type: 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], text: t('certShareText') }); return; }
  } catch (e) { if (e && e.name === 'AbortError') return; }
  saveCert();
};
$('cert_dl').onclick = saveCert;
$('cert_wa').onclick = () => waShare(t('certShareText'));
$('cert_x').onclick = () => window.open('https://twitter.com/intent/tweet?text=' + encodeURIComponent(t('certShareText')), '_blank');
$('cert_fb').onclick = () => window.open('https://www.facebook.com/sharer/sharer.php?u=https%3A%2F%2Fbanpani.org&quote=' + encodeURIComponent(t('certShareText')), '_blank');
$('adopt_name').onkeydown = e => { if (e.key === 'Enter') $('adopt_ok').click(); };

/* ------------------------- Relief ⇄ Rehab mode ------------------------- */
function applyMode() {
  document.body.classList.toggle('rehab', currentMode === 'rehab');
  $('modeswitch').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.mode === currentMode));
  const rehab = currentMode === 'rehab';
  // relabel the report tab + form for the phase
  $('tab-need').textContent = rehab ? t('tRehabReport') : t('tNeed');
  const intro = document.querySelector('[data-body="need"] .intro'); if (intro) intro.textContent = rehab ? t('rehabIntro') : t('needIntro');
  $('n_submit').textContent = rehab ? t('postRehab') : t('postNeed');
  $('whatNeededLbl') && ($('whatNeededLbl').textContent = rehab ? t('whatRehab') : t('whatNeeded'));
  // swap the item vocabulary
  nItems.clear(); chips('n_items', rehab ? C.REHAB_ITEMS : ITEMS, nItems);
  buildPhotoTags();
  // if a relief-only tab was active, fall back to the Need tab
  if (rehab && ['flood', 'convoy', 'drop', 'ngo'].includes(currentTab())) { document.querySelector('.tab[data-tab="need"]').click(); }
  renderAll();
}
function currentTab() { const a = document.querySelector('.tab.on'); return a ? a.dataset.tab : 'need'; }
$('modeswitch').querySelectorAll('button').forEach(b => b.onclick = () => {
  currentMode = b.dataset.mode; localStorage.setItem('banpani.mode', currentMode);
  applyMode();
  toast(currentMode === 'rehab' ? t('modeRehabOn') : t('modeReliefOn'));
});

// A signature of the MEANINGFUL state (ids + status), ignoring time-derived fields like fresh_min /
// server_time. Lets the 20s poll skip the full map redraw when nothing actually changed - which is
// most of the time - so we don't wipe and rebuild every marker every 20s (a real mobile stutter).
function stateSig(s) {
  const j = (a, f) => (a || []).map(f).join(',');
  return [
    j(s.reports, r => r.id + r.verify_status + r.status + r.has_contact + (r.adopted_by || '')),
    j(s.offers, o => o.id + o.kind), j(s.blocked, b => b.id),
    j(s.facilities, f => f.id + f.status), j(s.evac, e => e.id),
    j(s.flood_reports, f => f.id + f.severity), j(s.photos, p => p.id),
    j(s.routes, r => r.id), j(s.collection_points, c => c.id),
    j(s.ngos, n => n.id + n.verify_status), j(s.flood_polygons, p => p.id),
  ].join('|');
}
let lastStateSig = null;
async function refresh(force) {
  STATE = await api('/api/state' + (EVENT ? '?event=' + encodeURIComponent(EVENT.slug) : ''));
  if (!EVENT) {
    // Assam homepage: keep only reports inside Assam bounds so disasters reported elsewhere
    // on the world map never pollute this feed / gaps / hotspot. Event pages come pre-scoped.
    const bb = C.BOUNDS;
    STATE.reports = (STATE.reports || []).filter(r => r.lat >= bb[0][0] && r.lat <= bb[1][0] && r.lng >= bb[0][1] && r.lng <= bb[1][1]);
  }
  const sig = stateSig(STATE);
  if (!force && sig === lastStateSig) return;   // nothing meaningful changed -> skip the full redraw
  lastStateSig = sig;
  renderAll();
}

/* ------------------------------ controls ------------------------------ */
$('timeseg').querySelectorAll('button').forEach(b => b.onclick = () => {
  $('timeseg').querySelectorAll('button').forEach(x => x.classList.remove('on'));
  b.classList.add('on'); currentView = b.dataset.v; renderAll();
});
['ly_official', 'ly_flood', 'ly_needs', 'ly_photos', 'ly_cover', 'ly_routes', 'ly_ngo', 'ly_offers', 'ly_blocked', 'ly_facilities', 'ly_evac'].forEach(id => $(id).onchange = renderAll);
// Live rain radar (RainViewer, free, no key) - a togglable danger layer, off by default.
let rainLayer = null;
async function toggleRainLayer() {
  const on = $('ly_rain') && $('ly_rain').checked;
  if (!on) { if (rainLayer) { map.removeLayer(rainLayer); rainLayer = null; } return; }
  if (rainLayer) return;
  try {
    const j = await (await fetch('https://api.rainviewer.com/public/weather-maps.json')).json();
    const past = (j.radar && j.radar.past) || [], f = past[past.length - 1];
    if (!f) throw 0;
    rainLayer = L.tileLayer(j.host + f.path + '/256/{z}/{x}/{y}/2/1_1.png', { opacity: 0.6, zIndex: 350, attribution: 'Rain radar © RainViewer' }).addTo(map);
    toast('Live rain on - blue/green = rain, red = intense');
  } catch { toast('Could not load rain radar'); if ($('ly_rain')) $('ly_rain').checked = false; }
}
if ($('ly_rain')) $('ly_rain').onchange = toggleRainLayer;

let pickMode = 'need';
const pending = { need: {}, r: {}, rf: {}, c: {}, f: {}, p: {}, o: {}, bl: {}, fa: {}, ef: {}, et: {} };
let convoyTarget = 'dest';                        // which convoy point a map tap sets
const modeKeys = { need: ['need'], convoy: ['r', 'rf'], drop: ['c'], flood: ['f'], photo: ['p'], offer: ['o'], blocked: ['bl'], facility: ['fa'], evac: ['ef', 'et'] };
document.querySelectorAll('.tab').forEach(tb => tb.onclick = () => {
  document.querySelectorAll('.tab').forEach(x => x.classList.remove('on')); tb.classList.add('on');
  document.querySelectorAll('[data-body]').forEach(s => s.hidden = s.dataset.body !== tb.dataset.tab);
  pickMode = { need: 'need', convoy: 'r', drop: 'c', flood: 'f', photo: 'p', offer: 'o', blocked: 'bl', facility: 'fa', evac: 'ev' }[tb.dataset.tab] || null;
  $('modehint').classList.toggle('show', !!pickMode);
  syncMarkers(tb.dataset.tab);
});
$('modehint').classList.add('show');
// (mobile: the left panel is replaced by the Layers button + bottom-sheet - see LayersCtl above)

// Draggable location pickers - one marker per point (need / drop / flood / convoy start+dest).
const coordId = { need: 'n_coord', r: 'r_coord', rf: 'rf_coord', c: 'c_coord', f: 'f_coord', p: 'p_coord', o: 'o_coord', bl: 'bl_coord', fa: 'fa_coord', ef: 'ef_coord', et: 'et_coord' };
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
let evacTarget = 'from';
function activeKey() {
  if (pickMode === 'r') return convoyTarget === 'start' ? 'rf' : 'r';
  if (pickMode === 'ev') return evacTarget === 'from' ? 'ef' : 'et';
  return pickMode;
}

map.on('click', e => { if (pickMode) { setPick(activeKey(), e.latlng.lat, e.latlng.lng); if (window.raiseSheet) window.raiseSheet(); } });
function useGPS(key) {
  if (!navigator.geolocation) return toast('No GPS');
  toast('Getting location…');
  navigator.geolocation.getCurrentPosition(p => { setPick(key, p.coords.latitude, p.coords.longitude, true); map.setView([p.coords.latitude, p.coords.longitude], 12); if (window.raiseSheet) window.raiseSheet(); },
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
$('o_gps').onclick = () => useGPS('o'); $('bl_gps').onclick = () => useGPS('bl'); $('fa_gps').onclick = () => useGPS('fa');
$('ef_gps').onclick = () => useGPS('ef'); $('et_gps').onclick = () => useGPS('et');
$('evacTarget').querySelectorAll('button').forEach(b => b.onclick = () => { $('evacTarget').querySelectorAll('button').forEach(x => x.classList.remove('on')); b.classList.add('on'); evacTarget = b.dataset.t; });

// flood severity selector
let fSev = 'high';
$('f_sev').querySelectorAll('button').forEach(b => b.onclick = () => { $('f_sev').querySelectorAll('button').forEach(x => x.classList.remove('on')); b.classList.add('on'); fSev = b.dataset.s; });
$('f_submit').onclick = async () => {
  if (pending.f.lat == null) return toast('Set location (tap map or GPS)');
  try {
    const fPlaceName = $('f_place').value.trim();
    await api('/api/flood-reports', { method: 'POST', body: { place: $('f_place').value.trim(), lat: pending.f.lat, lng: pending.f.lng, severity: fSev, event_id: EVENT ? EVENT.id : undefined, device: deviceId() } });
    $('f_place').value = ''; pending.f = {}; $('f_coord').textContent = t('noLoc'); $('f_coord').classList.remove('set'); removeMarker('f');
    await refresh(); await renderAdvisory(); toast(t('floodMarked')); maybeCert(fPlaceName);
  } catch (e) { toast('Failed: ' + e.message); }
};

function chips(elId, arr, set) { const el = $(elId); el.innerHTML = ''; arr.forEach(it => { const c = document.createElement('div'); c.className = 'chip' + (set.has(it) ? ' on' : ''); c.textContent = it; c.onclick = () => { set.has(it) ? set.delete(it) : set.add(it); c.classList.toggle('on'); if (elId === 'r_items') checkOverlap(); }; el.appendChild(c); }); }
const nItems = new Set(), rItems = new Set(), cItems = new Set(), gFocus = new Set();
chips('n_items', ITEMS, nItems); chips('r_items', ITEMS, rItems); chips('c_items', C.ACCEPTS, cItems); chips('g_focus', C.FOCUS, gFocus);

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
    const certPlaceName = $('n_place').value.trim();
    await api('/api/reports', { method: 'POST', body: { place: $('n_place').value.trim(), lat: pending.need.lat, lng: pending.need.lng, items: [...nItems], people: $('n_people').value || null, details: $('n_details').value.trim(), reporter_kind: $('n_kind').value, contact: $('n_contact').value.trim(), mode: currentMode, disaster_type: EVENT ? EVENT.disaster_type : undefined, event_id: EVENT ? EVENT.id : undefined, device: deviceId() } });
    ['n_place', 'n_people', 'n_details', 'n_contact'].forEach(i => $(i).value = ''); nItems.clear(); chips('n_items', currentMode === 'rehab' ? C.REHAB_ITEMS : ITEMS, nItems);
    pending.need = {}; $('n_coord').textContent = t('noLoc'); $('n_coord').classList.remove('set'); removeMarker('need');
    await refresh(); toast(t('needPosted')); maybeCert(certPlaceName);
  } catch (e) { toast('Failed: ' + e.message); }
};
$('r_submit').onclick = async () => {
  if (!$('r_name').value.trim()) return toast('Add convoy name');
  if (pending.r.lat == null) return toast('Set destination');
  if (rItems.size === 0) return toast('Pick what you carry');
  try {
    await api('/api/routes', { method: 'POST', body: { name: $('r_name').value.trim(), from_place: $('r_from').value.trim(), from_lat: pending.rf.lat ?? null, from_lng: pending.rf.lng ?? null, lat: pending.r.lat, lng: pending.r.lng, items: [...rItems], eta: $('r_eta').value.trim(), contact: $('r_contact').value.trim(), event_id: EVENT ? EVENT.id : undefined, device: deviceId() } });
    ['r_name', 'r_from', 'r_eta', 'r_contact'].forEach(i => $(i).value = ''); rItems.clear(); chips('r_items', ITEMS, rItems);
    pending.r = {}; pending.rf = {}; $('r_coord').textContent = t('noDest'); $('rf_coord').textContent = t('noStart'); $('r_coord').classList.remove('set'); $('rf_coord').classList.remove('set'); $('r_warn').classList.remove('show'); removeMarker('r'); removeMarker('rf');
    await refresh(); toast(t('convoyAnnounced'));
  } catch (e) { toast('Failed: ' + e.message); }
};
$('c_submit').onclick = async () => {
  if (!$('c_name').value.trim()) return toast('Add a name');
  if (pending.c.lat == null) return toast('Set location');
  try {
    await api('/api/collection-points', { method: 'POST', body: { name: $('c_name').value.trim(), lat: pending.c.lat, lng: pending.c.lng, accepts: [...cItems], hours: $('c_hours').value.trim(), org: $('c_org').value.trim(), contact: $('c_contact').value.trim(), event_id: EVENT ? EVENT.id : undefined, device: deviceId() } });
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
// Language options adapt to the response's region (Assam -> Assamese; Odisha -> Odia; …).
(function initLang() {
  const LABEL = { en: 'EN', as: 'অস', hi: 'हि', or: 'ଓଡ଼ି' };
  const opts = (EVENT && Array.isArray(EVENT.langs)) ? EVENT.langs : ['en', 'as', 'hi'];
  $('lang').innerHTML = opts.map(l => `<option value="${l}">${LABEL[l] || l.toUpperCase()}</option>`).join('');
  if (!opts.includes(getLang())) setLang('en');   // saved language not offered here -> fall back to English
  $('lang').value = getLang();
})();
$('lang').onchange = e => setLang(e.target.value);
document.addEventListener('langchange', () => { renderAll(); renderAdvisory(); });
$('advToggle').onclick = () => $('advisory').classList.toggle('collapsed');
// collapsible side columns (so the full map is visible)
$('overlayToggle').onclick = () => { const o = $('overlay'); o.classList.toggle('min'); $('overlayToggle').firstChild.textContent = o.classList.contains('min') ? '▸ ' : '▾ '; };
// close the mobile layers bottom-sheet by tapping the backdrop or the grab handle
{ const b = $('ovlBackdrop'); if (b) b.onclick = closeLayersSheet; const g = document.querySelector('.ovl-grab'); if (g) g.onclick = closeLayersSheet; }
// left-panel tabs (Layers / Status) - one frame at a time, so no scrolling
document.querySelectorAll('.ovl-tab').forEach(tb => tb.onclick = () => {
  document.querySelectorAll('.ovl-tab').forEach(x => x.classList.toggle('on', x === tb));
  document.querySelectorAll('.ovl-pane').forEach(p => p.classList.toggle('hide', p.dataset.pane !== tb.dataset.pane));
});
const mainEl = document.querySelector('.main');
$('panelToggle').onclick = () => { mainEl.classList.add('hide-panel'); setTimeout(() => map.invalidateSize(), 60); };
$('panelReopen').onclick = () => { mainEl.classList.remove('hide-panel'); setTimeout(() => map.invalidateSize(), 60); };
/* ---------- mobile: drag-to-snap bottom sheet (peek / half / full) ---------- */
(function initSheet() {
  const panel = document.querySelector('.panel');
  const handle = $('sheetHandle');
  if (!panel || !handle) return;
  const mq = window.matchMedia('(max-width:860px)');
  let snap = 'peek', dragging = false, moved = false, startY = 0, startTY = 0, curTY = 0, lastY = 0, lastT = 0, vel = 0;
  // translateY (px) for each detent, measured from the sheet's own height
  // Use a CACHED viewport height, not live window.innerHeight, so the mobile address bar showing/
  // hiding (which changes innerHeight constantly) does not make the sheet recompute and jump.
  let vpH = window.innerHeight;
  const detents = () => { const h = panel.offsetHeight, peekPx = 138, halfPx = Math.round(vpH * 0.52);
    return { full: 4, half: Math.max(60, h - halfPx), peek: Math.max(0, h - peekPx) }; };
  const put = ty => { curTY = ty; panel.style.transform = `translateY(${ty}px)`; };
  function go(s) { snap = s; put(detents()[s]); mainEl.dataset.snap = s; mainEl.classList.toggle('sheet-full', s === 'full'); }
  function nearest(ty, v) {
    const d = detents(), order = ['full', 'half', 'peek']; let best = 'half', bd = 1e9;
    for (const k of order) { const dist = Math.abs(ty - d[k]); if (dist < bd) { bd = dist; best = k; } }
    const i = order.indexOf(best);                                    // velocity bias: flick snaps one detent further
    if (v > 0.55 && i < 2) best = order[i + 1];
    else if (v < -0.55 && i > 0) best = order[i - 1];
    return best;
  }
  handle.addEventListener('pointerdown', e => {
    if (!mq.matches) return;
    dragging = true; moved = false; panel.classList.add('dragging');
    startY = e.clientY; startTY = curTY; lastY = e.clientY; lastT = e.timeStamp; vel = 0;
    e.preventDefault();
  });
  window.addEventListener('pointermove', e => {
    if (!dragging) return;
    const dy = e.clientY - startY; if (Math.abs(dy) > 6) moved = true;
    const d = detents(); put(Math.min(d.peek + 48, Math.max(-8, startTY + dy)));   // rubber-band at the ends
    const dt = e.timeStamp - lastT; if (dt > 0) { vel = (e.clientY - lastY) / dt; lastY = e.clientY; lastT = e.timeStamp; }
    e.preventDefault();
  }, { passive: false });
  window.addEventListener('pointerup', () => {
    if (!dragging) return; dragging = false; panel.classList.remove('dragging');
    go(nearest(curTY, vel));
  });
  handle.addEventListener('click', () => { if (moved) { moved = false; return; }   // tap the handle to cycle up
    go(snap === 'peek' ? 'half' : snap === 'half' ? 'full' : 'peek'); });
  // tapping any tab opens the sheet from its peek state
  document.querySelectorAll('.tab').forEach(tb => tb.addEventListener('click', () => { if (mq.matches && snap === 'peek') go('half'); }));
  // + FAB starts a report: jump to the Need tab and open to half
  $('panelFab').onclick = () => { const tb = document.querySelector('.tab[data-tab="need"]'); if (tb) tb.click(); go('half'); };
  // After dropping a location pin while reporting, slide the form into view (place -> fill, one motion).
  window.raiseSheet = () => { if (mq.matches && snap === 'peek') go('half'); };
  const bd = $('sheetBackdrop'); if (bd) bd.addEventListener('click', () => go('half'));
  function sync() {
    if (mq.matches) requestAnimationFrame(() => go(snap));
    else { panel.style.transform = ''; mainEl.classList.remove('sheet-full'); delete mainEl.dataset.snap; }
    setTimeout(() => map.invalidateSize(), 80);
  }
  mq.addEventListener('change', sync);
  // Only re-lay-out on a REAL viewport change (orientation / big delta), never on the constant tiny
  // address-bar resizes - those were the main source of the mobile jitter.
  window.addEventListener('resize', () => {
    if (!mq.matches || dragging) return;
    if (Math.abs(window.innerHeight - vpH) < 100) return;   // address-bar toggle: ignore
    vpH = window.innerHeight; put(detents()[snap]);
    clearTimeout(window._rsz); window._rsz = setTimeout(() => { try { map.invalidateSize(); } catch (e) {} }, 150);
  });
  sync();
})();
$('shareMap').onclick = () => bp.shareMap();
// activity / transparency feed
const ACT_LABEL = { need_report: '🆘', rehab_report: '🔨', convoy: '🚚', drop_off: '📦', ngo_listed: '🏳️', flood_marked: '🌊', flood_update: '🌊', vote: '✅', adopt: '🤝', dispute_cleared: '🚩', contact_reveal: '📞' };
$('activityBtn').onclick = async () => {
  $('activityModal').classList.add('show');
  $('actTitle') && ($('actTitle').textContent = (currentMode === 'rehab' ? '🔨 ' : '🆘 ') + t('activityTitle') + ' - ' + (currentMode === 'rehab' ? t('modeRehabOn') : t('modeReliefOn')));
  $('activityList').innerHTML = `<div class="none">${t('loading')}</div>`;
  try {
    const { items } = await api('/api/activity' + (EVENT ? '?event=' + encodeURIComponent(EVENT.slug) : ''));
    const mine = items.filter(a => (a.mode || 'relief') === currentMode);   // relief vs rehab are different stories
    $('activityList').innerHTML = mine.length ? mine.map(a => `<div class="act-item">
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
    const { items } = await api('/api/news' + (EVENT ? '?event=' + encodeURIComponent(EVENT.slug) : ''));
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
$('helpMenu').innerHTML = ((EVENT && EVENT.helplines) ? EVENT.helplines : C.HELPLINES).map(h => `<a href="tel:${h.tel}">☎ ${esc(h.label)}</a>`).join('');
// hamburger menu (the ☰ dropdown, on every screen size)
$('menuBtn').onclick = e => { e.stopPropagation(); $('hdrActions').classList.toggle('show'); };
document.addEventListener('click', e => { if (!$('hdrActions').contains(e.target) && !$('menuBtn').contains(e.target)) $('hdrActions').classList.remove('show'); });
$('hdrActions').addEventListener('click', () => $('hdrActions').classList.remove('show'));
document.addEventListener('keydown', e => { if (e.key === 'Escape') $('hdrActions').classList.remove('show'); });
// Assam-only tools (community verify console + the Assam situation report) do not apply to other events
if (EVENT) { const v = $('mVerify'), r = $('mReport'); if (v) v.hidden = true; if (r) r.hidden = true; }

// Event lifecycle: a banner for dormant/archived responses, and a "mark as over" action for active ones.
function lifecycleBar() {
  const st = EVENT.status;
  if (!st || st === 'active') { if (EVENT.source === 'community') addOverLink(); return; }
  const bar = document.createElement('div');
  bar.className = 'lifebar lifebar-' + st;
  if (st === 'dormant') {
    bar.innerHTML = `<span>⏳ This response is <b>winding down</b> - no recent activity. If it is still happening, reopen it.</span>`
      + `<button id="lifeReopen">Reopen</button><span class="lc-votes" id="lifeVotes">${(EVENT.reopenVotes || 0)}/${EVENT.reopenNeed} people</span>`;
  } else {
    bar.innerHTML = `<span>📁 This is an <b>archived</b> response - a past disaster. You are viewing it as a record.</span><a href="/archive">See the archive →</a>`;
  }
  const h = document.querySelector('header'); if (h) h.insertAdjacentElement('afterend', bar);
  const rb = $('lifeReopen');
  if (rb) rb.onclick = async () => {
    rb.disabled = true;
    try {
      const r = await api('/api/events/' + EVENT.slug + '/reopen', { method: 'POST', body: { device: deviceId() } });
      if (r.reopened) { toast('Reopened - thank you'); setTimeout(() => location.reload(), 700); }
      else { const lv = $('lifeVotes'); if (lv) lv.textContent = (r.votes || 0) + '/' + (r.need || EVENT.reopenNeed) + ' people'; toast('Vote recorded'); rb.disabled = false; }
    } catch { toast('Could not reopen - try again'); rb.disabled = false; }
  };
}
function addOverLink() {
  const menu = $('hdrActions'); if (!menu) return;
  const a = document.createElement('button');
  a.className = 'link ic-btn'; a.id = 'markOver';
  a.innerHTML = '<span class="e">🏁</span><span class="t">Mark as over</span>';
  menu.appendChild(a);
  a.onclick = async () => {
    if (!confirm('Mark this response as over? When ' + EVENT.overNeed + ' people agree, it moves to the archive.')) return;
    try {
      const r = await api('/api/events/' + EVENT.slug + '/over', { method: 'POST', body: { device: deviceId() } });
      if (r.archived) { toast('Archived - thank you'); setTimeout(() => location.reload(), 700); }
      else toast('Recorded (' + (r.votes || 0) + '/' + (r.need || EVENT.overNeed) + ' say it is over)');
    } catch { toast('Could not record - try again'); }
  };
}
// one-time disclaimer
if (!localStorage.getItem('banpani.disclaimer2')) $('disclaimer').classList.add('show');
$('discOk').onclick = () => { $('disclaimer').classList.remove('show'); localStorage.setItem('banpani.disclaimer2', '1'); };
// soft-open banner: homepage only (never on an event page), and dismissible
if (!EVENT && $('worldBar') && !localStorage.getItem('banpani.worldbar')) $('worldBar').hidden = false;
if ($('worldBarX')) $('worldBarX').onclick = () => { $('worldBar').hidden = true; localStorage.setItem('banpani.worldbar', '1'); };

/* ------------------------------- boot --------------------------------- */
// Zoom to where the action is, so a first-time visitor lands ON the hotspot, not empty terrain.
function hotspotBounds() {
  const pts = [];
  STATE.reports.filter(inMode).forEach(r => pts.push([r.lat, r.lng]));
  (STATE.flood_reports || []).forEach(f => pts.push([f.lat, f.lng]));
  if (pts.length) return L.latLngBounds(pts);                       // 1) live pins = the real action
  const camps = (officialCamps.camps || []).map(c => [c.lat, c.lng]);
  if (camps.length) return L.latLngBounds(camps);                   // 2) relief camps = the worst-hit cluster
  if (officialFlood) {                                              // 3) only the HIGH-severity districts (not all 8)
    const high = officialFlood.features.filter(f => f.properties.severity === 'high');
    const feats = high.length ? high : officialFlood.features.filter(f => f.properties.severity);
    if (feats.length) return L.geoJSON({ type: 'FeatureCollection', features: feats }).getBounds();
  }
  return null;
}
function fitToHotspot() { const b = hotspotBounds(); if (b && b.isValid()) map.fitBounds(b, { padding: [40, 40], maxZoom: 9 }); }
$('recenter').onclick = fitToHotspot;

/* ------------------------------ place search ------------------------------ */
let searchT, searchMarker = null;
function localMatches(q) {
  q = q.toLowerCase(); const seen = new Set(), out = [];
  for (const r of STATE.reports) {
    if (inMode(r) && r.place && r.place.toLowerCase().includes(q) && !seen.has(r.place)) { seen.add(r.place); out.push({ name: r.place, lat: r.lat, lng: r.lng, local: true }); if (out.length >= 4) break; }
  }
  return out;
}
function showSearchResults(list) {
  const box = $('searchResults');
  if (!list.length) { box.classList.remove('show'); box.innerHTML = ''; return; }
  box.innerHTML = list.map(r => `<div class="sr ${r.local ? 'local' : ''}" data-lat="${r.lat}" data-lng="${r.lng}" data-name="${esc(r.name)}">${r.local ? '📍 ' : '🔎 '}${esc(r.name.split(',')[0])}<div class="sub">${esc(r.name)}</div></div>`).join('');
  box.classList.add('show');
  box.querySelectorAll('.sr').forEach(el => el.onclick = () => {
    map.setView([+el.dataset.lat, +el.dataset.lng], 12);
    if (searchMarker) map.removeLayer(searchMarker);
    searchMarker = L.marker([+el.dataset.lat, +el.dataset.lng], { icon: emojiIcon('📍') }).addTo(map).bindPopup(esc(el.dataset.name.split(',')[0])).openPopup();
    box.classList.remove('show'); $('searchInput').blur();
  });
}
$('searchInput').oninput = () => {
  const q = $('searchInput').value.trim();
  clearTimeout(searchT);
  if (q.length < 2) { $('searchResults').classList.remove('show'); return; }
  const loc = localMatches(q); showSearchResults(loc);        // instant local matches
  searchT = setTimeout(async () => {
    try { const { results } = await api('/api/geocode?q=' + encodeURIComponent(q)); showSearchResults([...loc, ...results]); } catch {}
  }, 350);
};
$('searchInput').onkeydown = e => { if (e.key === 'Escape') { $('searchResults').classList.remove('show'); $('searchInput').blur(); } };
document.addEventListener('click', e => { if (!$('searchbox').contains(e.target)) $('searchResults').classList.remove('show'); });

/* ---- new modules: offers / blocked roads / facilities (shown per event recipe) ---- */
let oKind = 'other', blKind = 'blocked', faKind = 'other', faStatus = 'open';
function segPick(elId, attr, setter) { const el = $(elId); if (!el) return; el.querySelectorAll('button').forEach(b => b.onclick = () => { el.querySelectorAll('button').forEach(x => x.classList.remove('on')); b.classList.add('on'); setter(b.dataset[attr]); }); }
// build the offer / facility kind chips from THIS event's tailored catalog (first = selected)
function buildKindSeg(elId, kinds, setter) {
  const el = $(elId); if (!el) return null;
  el.innerHTML = kinds.map(([k, l], i) => `<button type="button" data-k="${k}" class="${i === 0 ? 'on' : ''}">${l}</button>`).join('');
  el.querySelectorAll('button').forEach(b => b.onclick = () => { el.querySelectorAll('button').forEach(x => x.classList.remove('on')); b.classList.add('on'); setter(b.dataset.k); });
  return kinds[0] ? kinds[0][0] : null;
}
oKind = buildKindSeg('o_kind', OFFER_KINDS, v => oKind = v) || 'other';
faKind = buildKindSeg('fa_kind', FACILITY_KINDS, v => faKind = v) || 'other';
segPick('bl_kind', 'k', v => blKind = v); segPick('fa_status', 's', v => faStatus = v);
$('o_submit').onclick = async () => {
  if (pending.o.lat == null) return toast('Set a location - tap the map or GPS');
  try {
    await api('/api/offers', { method: 'POST', body: { kind: oKind, note: $('o_note').value.trim(), contact: $('o_contact').value.trim(), lat: pending.o.lat, lng: pending.o.lng, event_id: EVENT ? EVENT.id : undefined, device: deviceId() } });
    $('o_note').value = ''; $('o_contact').value = ''; pending.o = {}; $('o_coord').textContent = t('noLoc'); $('o_coord').classList.remove('set'); removeMarker('o');
    await refresh(); toast('🤝 Offer posted');
  } catch (e) { toast('Failed: ' + e.message); }
};
$('bl_submit').onclick = async () => {
  if (pending.bl.lat == null) return toast('Set a location - tap the map or GPS');
  try {
    await api('/api/blocked', { method: 'POST', body: { label: $('bl_label').value.trim(), kind: blKind, lat: pending.bl.lat, lng: pending.bl.lng, event_id: EVENT ? EVENT.id : undefined, device: deviceId() } });
    $('bl_label').value = ''; pending.bl = {}; $('bl_coord').textContent = t('noLoc'); $('bl_coord').classList.remove('set'); removeMarker('bl');
    await refresh(); toast('🚧 Blocked road marked');
  } catch (e) { toast('Failed: ' + e.message); }
};
$('fa_submit').onclick = async () => {
  if (pending.fa.lat == null) return toast('Set a location - tap the map or GPS');
  try {
    await api('/api/facilities', { method: 'POST', body: { kind: faKind, status: faStatus, name: $('fa_name').value.trim(), note: $('fa_note').value.trim(), lat: pending.fa.lat, lng: pending.fa.lng, event_id: EVENT ? EVENT.id : undefined, device: deviceId() } });
    $('fa_name').value = ''; $('fa_note').value = ''; pending.fa = {}; $('fa_coord').textContent = t('noLoc'); $('fa_coord').classList.remove('set'); removeMarker('fa');
    await refresh(); toast('🏪 Status posted');
  } catch (e) { toast('Failed: ' + e.message); }
};
$('evac_submit').onclick = async () => {
  if (pending.ef.lat == null) return toast('Set the danger point (tap the map)');
  if (pending.et.lat == null) return toast('Set the safe point (tap the map)');
  try {
    await api('/api/evac', { method: 'POST', body: { from_lat: pending.ef.lat, from_lng: pending.ef.lng, to_lat: pending.et.lat, to_lng: pending.et.lng, label: $('evac_label').value.trim(), event_id: EVENT ? EVENT.id : undefined, device: deviceId() } });
    $('evac_label').value = ''; pending.ef = {}; pending.et = {};
    $('ef_coord').textContent = t('evacNoFrom'); $('et_coord').textContent = t('evacNoTo'); $('ef_coord').classList.remove('set'); $('et_coord').classList.remove('set');
    removeMarker('ef'); removeMarker('et');
    await refresh(); toast('🏃 Escape route added');
  } catch (e) { toast('Failed: ' + e.message); }
};
// show only the tabs / layers this event's recipe enables (the homepage keeps its classic set)
function gateModules() {
  if (!EVENT) return;
  const mods = EVENT.modules || [];
  document.querySelectorAll('[data-module]').forEach(el => {
    const m = el.dataset.module;
    const on = m === 'official' ? !!EVENT.official : mods.includes(m);
    el.classList.toggle('mod-off', !on);
  });
}

(async function () {
  applyI18n();
  gateModules();
  if (EVENT) {   // event mode: badge the header with this event, and don't auto-fly (bounds already fit)
    const sub = document.querySelector('header .sub'); if (sub) { sub.textContent = EVENT.emoji + ' ' + EVENT.title; sub.removeAttribute('data-i18n'); }
    lifecycleBar();
    // ★ Save this event - client-side bookmark (no account); mirrors the world map's Saved list
    const svBtn = $('saveEventBtn');
    if (svBtn) {
      const ev = { slug: EVENT.slug, title: EVENT.title, family: EVENT.family, emoji: EVENT.emoji };
      const paint = () => { const on = C.saved.has(EVENT.slug); svBtn.querySelector('.e').textContent = on ? '★' : '☆'; svBtn.querySelector('.t').textContent = on ? 'Saved' : 'Save'; svBtn.classList.toggle('on', on); };
      svBtn.hidden = false;
      svBtn.onclick = () => { const on = C.saved.toggle(ev); toast(on ? '★ Saved - find it on the world map' : 'Removed from Saved'); paint(); };
      paint();
    }
    // the "gap" pane is convoy-framed by default; relabel it for supply-matched disasters
    const mods = EVENT.modules || [], gapEl = document.querySelector('[data-i18n="nobody"]');
    if (gapEl && !mods.includes('convoys')) { gapEl.textContent = mods.includes('offers') ? '⚠ No supply nearby' : '⚠ Unattended needs'; gapEl.removeAttribute('data-i18n'); }
    if (EVENT.family !== 'water') {   // "Relief / Rehab" is flood framing → neutral for other disasters
      const rb = document.querySelector('.modeswitch [data-mode="relief"]'), hb = document.querySelector('.modeswitch [data-mode="rehab"]');
      const relabel = (btn, emoji, word) => { if (!btn) return; const e = btn.querySelector('.mse'), t = btn.querySelector('.mst'); if (e) e.textContent = emoji; if (t) { t.textContent = word; t.removeAttribute('data-i18n'); } };
      relabel(rb, '🆘', 'Response'); relabel(hb, '🌱', 'Recovery');
    }
    // generalized hazard module: retitle the flood tab / layer / pane / severity per disaster
    if (EVENT.hazardLabel && EVENT.family !== 'water') {
      const hz = EVENT.hazardLabel, set = (sel, txt) => { const e = document.querySelector(sel); if (e) { e.textContent = txt; e.removeAttribute('data-i18n'); } };
      set('.tab[data-tab="flood"]', EVENT.emoji + ' ' + hz);
      set('[data-i18n="floodExtent"]', hz);
      set('[data-i18n="floodNow"]', EVENT.emoji + ' ' + hz);
      set('[data-i18n="floodIntro"]', 'Mark the ' + hz.toLowerCase() + ' area so the map shows the real danger zone. Tap the map or use GPS.');
      set('#f_submit', '⚠️ Mark ' + hz.toLowerCase());
      if (EVENT.hazardSev && EVENT.hazardSev.length) {
        $('f_sev').innerHTML = EVENT.hazardSev.map((x, i) => `<button data-s="${x[0]}" class="${i === 0 ? 'on' : ''}">${esc(x[1])}</button>`).join('');
        fSev = EVENT.hazardSev[0][0];
        $('f_sev').querySelectorAll('button').forEach(b => b.onclick = () => { $('f_sev').querySelectorAll('button').forEach(x => x.classList.remove('on')); b.classList.add('on'); fSev = b.dataset.s; });
      }
    }
  }
  applyMode();
  await loadOfficialFlood();
  try { await refresh(); await renderAdvisory(); } catch (e) { toast('Cannot reach server - is it running? ' + e.message); }
  if (!location.hash.match(/@/)) fitToHotspot();   // first load: fly to the worst-hit area (unless a deep-link says otherwise)
  setInterval(() => { refresh().catch(() => {}); renderAdvisory().catch(() => {}); }, 20000);
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
})();
