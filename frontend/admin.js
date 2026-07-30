/* Banpani - maintenance console (optional). Advisory override + audit log. */
const C = window.BANPANI, $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
let toastT; const toast = m => { const t = $('toast'); t.textContent = m; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2600); };

let KEY = sessionStorage.getItem('banpani.adminkey') || '';
const api = async (path, opts = {}) => { const r = await fetch(C.API + path, { ...opts, headers: { 'content-type': 'application/json', 'x-admin-key': KEY }, body: opts.body ? JSON.stringify(opts.body) : undefined }); const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error || r.status); return d; };

$('unlock').onclick = async () => {
  KEY = $('adminkey').value.trim(); if (!KEY) return toast('Enter the key');
  try { await loadAudit(); sessionStorage.setItem('banpani.adminkey', KEY); $('keybox').style.display = 'none'; $('panel').style.display = 'block'; loadAdvisory(); loadMsgs(); }
  catch (e) { toast('Wrong key or unreachable: ' + e.message); }
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
if (KEY) { loadAudit().then(() => { $('keybox').style.display = 'none'; $('panel').style.display = 'block'; loadAdvisory(); loadMsgs(); }).catch(() => { KEY = ''; sessionStorage.removeItem('banpani.adminkey'); }); }
