/* Banpani event coordination page (client). Hydrates /e/<slug> from window.EV into a live
   space: a map of reports/photos, add-a-need (recipe chips + tap-to-place), confirm, and a
   photo upload — all scoped to this event. No accounts. Reuses the shared public API. */
(function () {
  const EV = window.EV || {};
  if (!EV.slug) return;
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  function deviceId() { let d = localStorage.getItem('banpani.device'); if (!d) { d = 'd-' + Math.random().toString(36).slice(2) + Date.now().toString(36); localStorage.setItem('banpani.device', d); } return d; }
  let toastT; function toast(m) { const t = $('ev_toast'); t.textContent = m; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2600); }
  function ago(iso) { const s = (Date.now() - new Date(iso).getTime()) / 1000; if (s < 3600) return Math.max(1, Math.round(s / 60)) + 'm ago'; if (s < 86400) return Math.round(s / 3600) + 'h ago'; return Math.round(s / 86400) + 'd ago'; }
  const api = (path, body) => fetch(path, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : undefined);

  const map = L.map('emap', { scrollWheelZoom: false }).setView([EV.lat || 20, EV.lng || 0], 9);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '© OpenStreetMap' }).addTo(map);
  const layer = L.layerGroup().addTo(map);

  function renderMap() {
    layer.clearLayers(); const pts = [];
    (EV.reports || []).forEach(r => {
      if (r.lat == null) return;
      L.circleMarker([r.lat, r.lng], { radius: 7, weight: 1.5, color: '#0b0f14', fillColor: EV.color, fillOpacity: .9 })
        .addTo(layer).bindPopup('<b>' + esc(r.place) + '</b>' + (r.items && r.items.length ? '<br>' + esc(r.items.join(', ')) : ''));
      pts.push([r.lat, r.lng]);
    });
    (EV.floods || []).forEach(fl => {
      if (fl.lat == null) return;
      L.circleMarker([fl.lat, fl.lng], { radius: 6, weight: 1, color: EV.color, opacity: .6, fillColor: EV.color, fillOpacity: .28, dashArray: '2 3' })
        .addTo(layer).bindPopup('🌊 ' + esc(fl.place || 'Flooded area') + (fl.severity ? ' — ' + esc(fl.severity) : ''));
      pts.push([fl.lat, fl.lng]);
    });
    (EV.photos || []).forEach(p => { if (p.lat == null) return; L.marker([p.lat, p.lng]).addTo(layer).bindPopup('<img src="' + esc(p.url) + '" style="width:180px;border-radius:8px">'); });
    if (pts.length > 1) map.fitBounds(pts, { padding: [30, 30], maxZoom: 11 });
  }
  function renderList() {
    const ul = $('needlist');
    ul.innerHTML = (EV.reports || []).length
      ? EV.reports.map(r => `<li data-id="${r.id}"><div class="nl-main"><b>${esc(r.place)}</b>${(r.items && r.items.length) ? ' · <span class="need">' + esc(r.items.join(', ')) + '</span>' : ''}${r.details ? ' — ' + esc(r.details) : ''} <span class="t">${ago(r.created_at)}${r.confirmations ? ' · ✅ ' + r.confirmations : ''}</span></div><button class="nl-ok" data-id="${r.id}">✅ Confirm</button></li>`).join('')
      : '<li class="nl-empty">No reports yet — be the first to add a need below.</li>';
    ul.querySelectorAll('.nl-ok').forEach(b => b.onclick = () => confirmNeed(b.dataset.id));
  }
  async function refresh() {
    try {
      const e = await (await fetch('/api/event/' + EV.slug)).json();
      EV.reports = (e.reports || []).map(r => ({ id: r.id, place: r.place, lat: r.lat, lng: r.lng, items: r.items, details: r.details, confirmations: r.confirmations, created_at: r.created_at }));
      EV.photos = (e.photos || []).map(p => ({ lat: p.lat, lng: p.lng, url: p.url, tag: p.tag }));
      EV.floods = (e.floods || []).map(x => ({ lat: x.lat, lng: x.lng, severity: x.severity, place: x.place }));
      if (e.count) { $('st_r').textContent = e.count.reports; $('st_c').textContent = e.count.confirmations; $('st_p').textContent = e.count.people; }
      renderList(); renderMap();
    } catch {}
  }

  async function confirmNeed(id) { try { await api('/api/reports/' + id + '/vote', { category: 'trust', value: 'confirm', device: deviceId() }); toast('Confirmed ✅'); await refresh(); } catch { toast('Failed'); } }

  // ---- add a need (recipe chips + tap-to-place) ----
  let needLoc = null, needMarker = null;
  const needSel = new Set();
  $('ev_needs').innerHTML = (EV.needs || []).map(n => `<button type="button" data-n="${esc(n)}">${esc(n)}</button>`).join('');
  $('ev_needs').querySelectorAll('button').forEach(b => b.onclick = () => { const n = b.dataset.n; if (needSel.has(n)) { needSel.delete(n); b.classList.remove('on'); } else { needSel.add(n); b.classList.add('on'); } });
  $('ev_addneed').onclick = () => {
    needSel.clear(); $('ev_needs').querySelectorAll('button').forEach(x => x.classList.remove('on'));
    $('ev_place').value = ''; $('ev_details').value = ''; needLoc = { lat: EV.lat, lng: EV.lng };
    if (needMarker) { needMarker.remove(); needMarker = null; }
    $('ev_loc').textContent = 'Tap the map to set the spot 📍 (using event centre until you do)';
    $('ev_sheet').classList.add('show');
  };
  $('ev_cancel').onclick = () => { $('ev_sheet').classList.remove('show'); if (needMarker) { needMarker.remove(); needMarker = null; } };
  map.on('click', e => { if (!$('ev_sheet').classList.contains('show')) return; needLoc = { lat: e.latlng.lat, lng: e.latlng.lng }; if (needMarker) needMarker.remove(); needMarker = L.marker(e.latlng).addTo(map); $('ev_loc').textContent = 'Location set 📍'; });
  $('ev_submit').onclick = async () => {
    if (!$('ev_place').value.trim()) return toast('Add a place name');
    if (!needLoc) return toast('Tap the map to set location');
    try {
      await api('/api/reports', { place: $('ev_place').value.trim(), lat: needLoc.lat, lng: needLoc.lng, disaster_type: EV.disaster_type, items: [...needSel], details: $('ev_details').value.trim(), device: deviceId() });
      $('ev_sheet').classList.remove('show'); if (needMarker) { needMarker.remove(); needMarker = null; }
      toast('Need posted 🙏'); await refresh();
    } catch { toast('Failed'); }
  };

  // ---- photo (client resize + EXIF strip, event-scoped) ----
  function resizePhoto(file) {
    return new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => {
        let w = img.width, h = img.height, M = 1280;
        if (Math.max(w, h) > M) { const s = M / Math.max(w, h); w = Math.round(w * s); h = Math.round(h * s); }
        const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
        cv.getContext('2d').drawImage(img, 0, 0, w, h); URL.revokeObjectURL(img.src);
        res(cv.toDataURL('image/jpeg', 0.72));
      };
      img.onerror = rej; img.src = URL.createObjectURL(file);
    });
  }
  $('ev_photo').onchange = async () => {
    const file = $('ev_photo').files[0]; if (!file) return;
    try {
      const data = await resizePhoto(file);
      await api('/api/photos', { image: data, tag: EV.family === 'fire' ? 'damage' : 'need', lat: EV.lat, lng: EV.lng, device: deviceId() });
      $('ev_photo').value = ''; toast('Photo added 📷'); await refresh();
    } catch { toast('Photo failed'); }
  };

  renderList();
  renderMap();
})();
