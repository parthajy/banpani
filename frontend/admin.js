/* Banpani - maintenance console (optional). Advisory override + audit log. */
const C = window.BANPANI, $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
let toastT; const toast = m => { const t = $('toast'); t.textContent = m; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2600); };

let KEY = sessionStorage.getItem('banpani.adminkey') || '';
const api = async (path, opts = {}) => { const r = await fetch(C.API + path, { ...opts, headers: { 'content-type': 'application/json', 'x-admin-key': KEY }, body: opts.body ? JSON.stringify(opts.body) : undefined }); const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error || r.status); return d; };

function openPanel() { $('keybox').style.display = 'none'; $('panel').style.display = 'block'; loadAdvisory(); loadMsgs(); loadVolunteers(); }
$('unlock').onclick = async () => {
  KEY = $('adminkey').value.trim(); if (!KEY) return toast('Enter the key');
  try { await loadAudit(); sessionStorage.setItem('banpani.adminkey', KEY); openPanel(); }
  catch (e) { toast('Wrong key or unreachable: ' + e.message); }
};

let vols = [];
const famLabel = k => (C.DISASTERS[k] ? C.DISASTERS[k].emoji + ' ' + C.DISASTERS[k].label : k);
async function loadVolunteers() {
  try {
    vols = (await api('/api/admin/volunteers')).volunteers || [];
    renderVols(vols);
  } catch (e) { toast('Volunteers: ' + e.message); }
}
function renderVols(list) {
  $('v_count').textContent = list.length + ' volunteer' + (list.length === 1 ? '' : 's');
  $('vols').querySelector('tbody').innerHTML = list.map(v =>
    `<tr><td>${esc(v.email)}</td><td>${esc(v.country || '')}</td><td>${esc(v.region || '')}</td><td>${esc((v.families || []).map(famLabel).join(', '))}</td><td>${esc((v.skills || []).join(', '))}</td><td>${esc((v.created_at || '').slice(0, 10))}</td></tr>`
  ).join('') || '<tr><td colspan=6 style="color:var(--muted)">No volunteers yet. Share banpani.org/volunteers to build the force.</td></tr>';
}
$('v_filter').oninput = e => {
  const q = e.target.value.toLowerCase().trim();
  renderVols(!q ? vols : vols.filter(v => [v.email, v.country, v.region, (v.families || []).map(famLabel).join(' '), (v.skills || []).join(' ')].join(' ').toLowerCase().includes(q)));
};
$('v_csv').onclick = () => {
  const rows = [['email', 'country', 'area', 'can_help', 'skills', 'joined'],
    ...vols.map(v => [v.email, v.country || '', v.region || '', (v.families || []).map(famLabel).join('; '), (v.skills || []).join('; '), (v.created_at || '').slice(0, 10)])];
  const csv = rows.map(r => r.map(c => '"' + String(c).replace(/"/g, '""') + '"').join(',')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = 'banpani-volunteers.csv'; a.click();
};
async function loadAdvisory() { try { const a = await (await fetch(C.API + '/api/advisory')).json(); $('a_head').value = a.headline || ''; $('a_body').value = a.body || ''; $('a_src').value = a.source || ''; } catch {} }
$('a_save').onclick = async () => { try { await api('/api/admin/advisory', { method: 'POST', body: { headline: $('a_head').value.trim(), body: $('a_body').value.trim(), source: $('a_src').value.trim() } }); toast('Saved ✓'); } catch (e) { toast('Failed: ' + e.message); } };
async function loadAudit() {
  const rows = await api('/api/admin/audit');
  $('audit').querySelector('tbody').innerHTML = rows.map(r => `<tr><td>${esc((r.created_at || '').slice(5, 16).replace('T', ' '))}</td><td>${esc(r.kind)}</td><td>${esc(r.target || '')}</td><td>${esc(r.detail || '')}</td></tr>`).join('') || '<tr><td colspan=4 style="color:var(--muted)">No activity yet.</td></tr>';
}
async function loadMsgs() {
  const rows = await api('/api/admin/messages');
  $('msgs').querySelector('tbody').innerHTML = rows.map(m => `<tr><td>${esc((m.created_at || '').slice(5, 16).replace('T', ' '))}</td><td>${esc(m.name || '-')}</td><td>${esc(m.contact || '-')}</td><td>${esc(m.message)}</td></tr>`).join('') || '<tr><td colspan=4 style="color:var(--muted)">No messages yet.</td></tr>';
}
if (KEY) { loadAudit().then(openPanel).catch(() => { KEY = ''; sessionStorage.removeItem('banpani.adminkey'); }); }
