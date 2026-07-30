/* Banpani - open community verification console. No login; votes are per-device. */
const C = window.BANPANI, $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
let toastT; const toast = m => { const t = $('toast'); t.textContent = m; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2600); };
function deviceId() { let d = localStorage.getItem('banpani.device'); if (!d) { d = 'd-' + Math.random().toString(36).slice(2) + Date.now().toString(36); localStorage.setItem('banpani.device', d); } return d; }
const api = async (path, opts = {}) => { const r = await fetch(C.API + path, { ...opts, headers: { 'content-type': 'application/json' }, body: opts.body ? JSON.stringify(opts.body) : undefined }); const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error || r.status); return d; };
const ageH = iso => ((Date.now() - new Date(iso).getTime()) / 3.6e6).toFixed(0);

function card(n, gap) {
  return `<div class="card ${gap ? 'open' : 'claimed'}">
    <div class="top"><span class="place">${esc(n.place)}</span><span class="badge ${gap ? 'gap' : 'unverified'}">${gap ? 'GAP' : esc(n.verify_status)}</span></div>
    <div class="items">🆘 ${(n.items || []).map(esc).join(', ')}</div>
    <div class="meta">${n.people ? '~' + n.people + ' ppl · ' : ''}waiting ${ageH(n.created_at)}h · <span class="count">${n.confirmations || 0}/${C.CONFIRM_AT} confirms</span></div>
    <div class="acts">
      <button class="ok" onclick="act(${n.id},'trust','confirm')">✅ Confirm</button>
      <button class="ok" onclick="act(${n.id},'resolve','yes')">✓ Delivered</button>
      <button class="bad" onclick="act(${n.id},'trust','false')">⚑ Not real</button>
    </div></div>`;
}
async function load() {
  try {
    const rep = await api('/api/report');
    $('gaplist').innerHTML = rep.gaps.length ? rep.gaps.map(g => card(g, true)).join('') : '<div class="empty">No unattended needs right now 🙏</div>';
    $('unvlist').innerHTML = rep.unverified.length ? rep.unverified.map(g => card(g, false)).join('') : '<div class="empty">All caught up 🙏</div>';
  } catch (e) { toast('Load failed: ' + e.message); }
}
window.act = async (id, category, value) => {
  try { const r = await api(`/api/reports/${id}/vote`, { method: 'POST', body: { category, value, device: deviceId() } });
    toast(category === 'resolve' ? 'Marked delivered ✓' : value === 'false' ? 'Flagged ⚑' : `Confirmed (${r.confirmations || 0}/${C.CONFIRM_AT}) 🙏`); load(); }
  catch (e) { toast('Failed: ' + e.message); }
};
load(); setInterval(load, 20000);
