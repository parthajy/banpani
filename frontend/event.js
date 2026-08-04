/* Banpani event coordination page (client). Hydrates /e/<slug> from window.EV into a live
   modular space: map (needs / flood / blocked roads / offers / photos), and the actions its
   recipe enables — add a need, mark a blocked road, offer a resource, confirm, photo. The
   toolbar buttons are rendered per-recipe by the server, so this only wires what exists. */
(function () {
  const EV = window.EV || {};
  if (!EV.slug) return;
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  function deviceId() { let d = localStorage.getItem('banpani.device'); if (!d) { d = 'd-' + Math.random().toString(36).slice(2) + Date.now().toString(36); localStorage.setItem('banpani.device', d); } return d; }
  let toastT; function toast(m) { const t = $('ev_toast'); t.textContent = m; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2600); }
  const api = (path, body) => fetch(path, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : undefined);
  const jpost = async (path, body) => { try { return await (await api(path, body || {})).json(); } catch { return {}; } };
  function ago(iso) { const s = (Date.now() - new Date(iso).getTime()) / 1000; if (s < 3600) return Math.max(1, Math.round(s / 60)) + 'm ago'; if (s < 86400) return Math.round(s / 3600) + 'h ago'; return Math.round(s / 86400) + 'd ago'; }
  function fresh(min) { if (min < 60) return Math.max(1, min) + 'm ago'; if (min < 1440) return Math.round(min / 60) + 'h ago'; return Math.round(min / 1440) + 'd ago'; }
  const OFFER_KINDS = [['oxygen', '🫁 Oxygen'], ['beds', '🛏️ Beds'], ['water', '💧 Water'], ['boat', '🚤 Boat'], ['blood', '🩸 Blood'], ['food', '🍚 Food'], ['power', '🔌 Power'], ['medicine', '💊 Medicine'], ['other', '📦 Other']];
  const kindLabel = k => (OFFER_KINDS.find(x => x[0] === k) || [k, k])[1];

  const map = L.map('emap', { scrollWheelZoom: false }).setView([EV.lat || 20, EV.lng || 0], 9);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '© OpenStreetMap' }).addTo(map);
  const layer = L.layerGroup().addTo(map);
  const emojiIcon = (html, cls) => L.divIcon({ html: '<div class="emoji-pin ' + (cls || '') + '">' + html + '</div>', className: '', iconSize: [26, 26], iconAnchor: [13, 13] });

  const blockedPopup = x => '🚧 <b>' + esc(x.label || 'Blocked road') + '</b><br><small>' + (x.kind === 'partial' ? 'Partly passable' : 'Fully blocked') + ' · seen ' + fresh(x.fresh_min) + '</small><br><button class="pbtn" onclick="BEV.blConfirm(' + x.id + ')">✅ Still blocked</button> <button class="pbtn" onclick="BEV.blClear(' + x.id + ')">✔ Cleared</button>';
  const offerPopup = o => '📦 <b>' + esc(kindLabel(o.kind)) + '</b>' + (o.note ? ' — ' + esc(o.note) : '') + '<br><small>' + (o.fresh_min >= 480 ? '⚠ unconfirmed · last ' : 'confirmed ') + fresh(o.fresh_min) + '</small><br><button class="pbtn" onclick="BEV.ofConfirm(' + o.id + ')">✅ Still here</button> <button class="pbtn" onclick="BEV.ofGone(' + o.id + ')">✖ Gone</button>' + (o.has_contact ? ' <button class="pbtn" onclick="BEV.ofReveal(' + o.id + ')">📞 Contact</button>' : '');

  function renderMap() {
    layer.clearLayers(); const pts = [];
    (EV.reports || []).forEach(r => { if (r.lat == null) return; L.circleMarker([r.lat, r.lng], { radius: 7, weight: 1.5, color: '#0b0f14', fillColor: EV.color, fillOpacity: .9 }).addTo(layer).bindPopup('<b>' + esc(r.place) + '</b>' + (r.items && r.items.length ? '<br>' + esc(r.items.join(', ')) : '')); pts.push([r.lat, r.lng]); });
    (EV.floods || []).forEach(fl => { if (fl.lat == null) return; L.circleMarker([fl.lat, fl.lng], { radius: 6, weight: 1, color: EV.color, opacity: .6, fillColor: EV.color, fillOpacity: .28, dashArray: '2 3' }).addTo(layer).bindPopup('🌊 ' + esc(fl.place || 'Flooded area') + (fl.severity ? ' — ' + esc(fl.severity) : '')); pts.push([fl.lat, fl.lng]); });
    (EV.blocked || []).forEach(x => { if (x.lat == null) return; L.marker([x.lat, x.lng], { icon: emojiIcon('🚧') }).addTo(layer).bindPopup(blockedPopup(x)); pts.push([x.lat, x.lng]); });
    (EV.offers || []).forEach(o => { if (o.lat == null) return; L.marker([o.lat, o.lng], { icon: emojiIcon('📦', o.fresh_min >= 480 ? 'stale' : 'fresh') }).addTo(layer).bindPopup(offerPopup(o)); pts.push([o.lat, o.lng]); });
    (EV.photos || []).forEach(p => { if (p.lat == null) return; L.marker([p.lat, p.lng]).addTo(layer).bindPopup('<img src="' + esc(p.url) + '" style="width:180px;border-radius:8px">'); });
    if (pts.length > 1) map.fitBounds(pts, { padding: [30, 30], maxZoom: 11 });
  }
  function renderList() {
    const ul = $('needlist');
    ul.innerHTML = (EV.reports || []).length
      ? EV.reports.map(r => `<li data-id="${r.id}"><div class="nl-main"><b>${esc(r.place)}</b>${(r.items && r.items.length) ? ' · <span class="need">' + esc(r.items.join(', ')) + '</span>' : ''}${r.details ? ' — ' + esc(r.details) : ''} <span class="t">${ago(r.created_at)}${r.confirmations ? ' · ✅ ' + r.confirmations : ''}</span></div><button class="nl-ok" data-id="${r.id}">✅ Confirm</button></li>`).join('')
      : '<li class="nl-empty">No open needs yet — add one below.</li>';
    ul.querySelectorAll('.nl-ok').forEach(b => b.onclick = () => confirmNeed(b.dataset.id));
  }
  async function refresh() {
    try {
      const e = await (await fetch('/api/event/' + EV.slug)).json();
      EV.reports = (e.reports || []).map(r => ({ id: r.id, place: r.place, lat: r.lat, lng: r.lng, items: r.items, details: r.details, confirmations: r.confirmations, created_at: r.created_at }));
      EV.photos = e.photos || []; EV.floods = e.floods || []; EV.blocked = e.blocked || []; EV.offers = e.offers || [];
      if (e.count) { $('st_r').textContent = e.count.reports; $('st_c').textContent = e.count.confirmations; $('st_p').textContent = e.count.people; }
      renderList(); renderMap();
    } catch {}
  }
  async function confirmNeed(id) { await jpost('/api/reports/' + id + '/vote', { category: 'trust', value: 'confirm', device: deviceId() }); toast('Confirmed ✅'); await refresh(); }

  window.BEV = {
    blConfirm: async id => { await jpost('/api/blocked/' + id + '/confirm', { device: deviceId() }); toast('Thanks — kept current'); map.closePopup(); await refresh(); },
    blClear: async id => { const r = await jpost('/api/blocked/' + id + '/clear', { device: deviceId() }); toast(r.cleared ? 'Marked cleared ✔' : 'Clear vote (' + (r.clears || 1) + '/2)'); map.closePopup(); await refresh(); },
    ofConfirm: async id => { await jpost('/api/offers/' + id + '/confirm', { device: deviceId() }); toast('Confirmed available ✅'); map.closePopup(); await refresh(); },
    ofGone: async id => { const r = await jpost('/api/offers/' + id + '/gone', { device: deviceId() }); toast(r.gone ? 'Marked gone' : 'Gone vote (' + (r.votes || 1) + '/2)'); map.closePopup(); await refresh(); },
    ofReveal: async id => { try { const r = await (await fetch('/api/offers/' + id + '/contact')).json(); toast(r.contact ? ('📞 ' + r.contact) : 'No contact given'); } catch { toast('Failed'); } },
  };

  // ---- shared "place on map + submit" sheets ----
  let placing = null, pMarker = null; const locs = { need: null, blocked: null, offer: null };
  const HINT = { need: 'ev_loc', blocked: 'bl_loc', offer: 'of_loc' };
  function closeSheets() { ['ev_sheet', 'bl_sheet', 'of_sheet'].forEach(id => { const el = $(id); if (el) el.classList.remove('show'); }); if (pMarker) { pMarker.remove(); pMarker = null; } placing = null; }
  function openSheet(which, sheetId) { closeSheets(); placing = which; locs[which] = { lat: EV.lat, lng: EV.lng }; $(HINT[which]).textContent = 'Tap the map to set the spot 📍 (event centre until you do)'; $(sheetId).classList.add('show'); }
  map.on('click', e => { if (!placing) return; locs[placing] = { lat: e.latlng.lat, lng: e.latlng.lng }; if (pMarker) pMarker.remove(); pMarker = L.marker(e.latlng).addTo(map); $(HINT[placing]).textContent = 'Location set 📍'; });

  // needs
  const needSel = new Set();
  $('ev_needs').innerHTML = (EV.needs || []).map(n => `<button type="button" data-n="${esc(n)}">${esc(n)}</button>`).join('');
  $('ev_needs').querySelectorAll('button').forEach(b => b.onclick = () => { const n = b.dataset.n; if (needSel.has(n)) { needSel.delete(n); b.classList.remove('on'); } else { needSel.add(n); b.classList.add('on'); } });
  $('ev_addneed').onclick = () => { needSel.clear(); $('ev_needs').querySelectorAll('button').forEach(x => x.classList.remove('on')); $('ev_place').value = ''; $('ev_details').value = ''; openSheet('need', 'ev_sheet'); };
  $('ev_cancel').onclick = closeSheets;
  $('ev_submit').onclick = async () => { if (!$('ev_place').value.trim()) return toast('Add a place name'); const l = locs.need; if (!l) return toast('Set a location'); await jpost('/api/reports', { place: $('ev_place').value.trim(), lat: l.lat, lng: l.lng, disaster_type: EV.disaster_type, items: [...needSel], details: $('ev_details').value.trim(), event_id: EV.id, device: deviceId() }); closeSheets(); toast('Need posted 🙏'); await refresh(); };

  // blocked road
  if ($('ev_addblocked')) {
    let blKind = 'blocked';
    $('bl_kind').querySelectorAll('button').forEach(b => b.onclick = () => { $('bl_kind').querySelectorAll('button').forEach(x => x.classList.remove('on')); b.classList.add('on'); blKind = b.dataset.k; });
    $('ev_addblocked').onclick = () => { blKind = 'blocked'; $('bl_kind').querySelectorAll('button').forEach((x, i) => x.classList.toggle('on', i === 0)); $('bl_label').value = ''; openSheet('blocked', 'bl_sheet'); };
    $('bl_cancel').onclick = closeSheets;
    $('bl_submit').onclick = async () => { const l = locs.blocked; if (!l) return toast('Set a location'); await jpost('/api/blocked', { event_id: EV.id, lat: l.lat, lng: l.lng, label: $('bl_label').value.trim(), kind: blKind, device: deviceId() }); closeSheets(); toast('Blocked road marked 🚧'); await refresh(); };
  }

  // offer
  if ($('ev_addoffer')) {
    let ofKind = null;
    $('of_kind').innerHTML = OFFER_KINDS.map(([k, l]) => `<button type="button" data-k="${k}">${l}</button>`).join('');
    $('of_kind').querySelectorAll('button').forEach(b => b.onclick = () => { $('of_kind').querySelectorAll('button').forEach(x => x.classList.remove('on')); b.classList.add('on'); ofKind = b.dataset.k; });
    $('ev_addoffer').onclick = () => { ofKind = null; $('of_kind').querySelectorAll('button').forEach(x => x.classList.remove('on')); $('of_note').value = ''; $('of_contact').value = ''; openSheet('offer', 'of_sheet'); };
    $('of_cancel').onclick = closeSheets;
    $('of_submit').onclick = async () => { if (!ofKind) return toast('Pick what you have'); const l = locs.offer; if (!l) return toast('Set a location'); await jpost('/api/offers', { event_id: EV.id, lat: l.lat, lng: l.lng, kind: ofKind, note: $('of_note').value.trim(), contact: $('of_contact').value.trim(), device: deviceId() }); closeSheets(); toast('Offer posted 📦 thank you'); await refresh(); };
  }

  // photo
  if ($('ev_photo')) {
    const resizePhoto = file => new Promise((res, rej) => { const img = new Image(); img.onload = () => { let w = img.width, h = img.height, M = 1280; if (Math.max(w, h) > M) { const s = M / Math.max(w, h); w = Math.round(w * s); h = Math.round(h * s); } const cv = document.createElement('canvas'); cv.width = w; cv.height = h; cv.getContext('2d').drawImage(img, 0, 0, w, h); URL.revokeObjectURL(img.src); res(cv.toDataURL('image/jpeg', 0.72)); }; img.onerror = rej; img.src = URL.createObjectURL(file); });
    $('ev_photo').onchange = async () => { const file = $('ev_photo').files[0]; if (!file) return; try { const data = await resizePhoto(file); await jpost('/api/photos', { image: data, tag: EV.family === 'fire' ? 'damage' : 'need', lat: EV.lat, lng: EV.lng, event_id: EV.id, device: deviceId() }); $('ev_photo').value = ''; toast('Photo added 📷'); await refresh(); } catch { toast('Photo failed'); } };
  }

  renderList();
  renderMap();
})();
