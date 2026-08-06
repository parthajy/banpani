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

let vols = [], shown = [];
const famLabel = k => (C.DISASTERS[k] ? C.DISASTERS[k].emoji + ' ' + C.DISASTERS[k].label : k);
async function loadVolunteers() {
  try {
    vols = (await api('/api/admin/volunteers')).volunteers || [];
    // populate the country + relief-type dropdowns from what's actually in the list
    const countries = [...new Set(vols.map(v => v.country).filter(Boolean))].sort();
    $('v_country').innerHTML = '<option value="">All countries</option>' + countries.map(c => `<option value="${esc(c)}">${esc(c)} (${vols.filter(v => v.country === c).length})</option>`).join('');
    const fams = [...new Set(vols.flatMap(v => v.families || []))].sort();
    $('v_relief').innerHTML = '<option value="">All relief types</option>' + fams.map(f => `<option value="${esc(f)}">${esc(famLabel(f))} (${vols.filter(v => (v.families || []).includes(f)).length})</option>`).join('');
    applyVolFilters();
  } catch (e) { toast('Volunteers: ' + e.message); }
}
function applyVolFilters() {
  const country = $('v_country').value, relief = $('v_relief').value, q = $('v_filter').value.toLowerCase().trim();
  shown = vols.filter(v =>
    (!country || v.country === country) &&
    (!relief || (v.families || []).includes(relief)) &&
    (!q || [v.email, v.country, v.region, (v.families || []).map(famLabel).join(' '), (v.skills || []).join(' ')].join(' ').toLowerCase().includes(q))
  ).sort((a, b) => (a.country || '~').localeCompare(b.country || '~') || (a.email || '').localeCompare(b.email || ''));   // grouped by country
  $('v_count').textContent = shown.length + ' of ' + vols.length + ' shown';
  $('vols').querySelector('tbody').innerHTML = shown.map(v =>
    `<tr><td>${esc(v.email)}</td><td>${esc(v.country || '')}</td><td>${esc(v.region || '')}</td><td>${esc((v.families || []).map(famLabel).join(', '))}</td><td>${esc((v.skills || []).join(', '))}</td><td>${esc((v.created_at || '').slice(0, 10))}</td></tr>`
  ).join('') || '<tr><td colspan=6 style="color:var(--muted)">No volunteers match. (Share banpani.org/volunteers to grow the list.)</td></tr>';
}
$('v_country').onchange = applyVolFilters;
$('v_relief').onchange = applyVolFilters;
$('v_filter').oninput = applyVolFilters;
$('v_copy').onclick = async () => {
  const emails = shown.map(v => v.email).filter(e => e && e.includes('@'));
  if (!emails.length) return toast('No emails to copy');
  try { await navigator.clipboard.writeText(emails.join(', ')); toast('Copied ' + emails.length + ' email' + (emails.length === 1 ? '' : 's') + ' - paste into BCC'); }
  catch { toast('Copy failed - use CSV instead'); }
};
$('v_csv').onclick = () => {
  const rows = [['email', 'country', 'area', 'can_help', 'skills', 'joined'],
    ...shown.map(v => [v.email, v.country || '', v.region || '', (v.families || []).map(famLabel).join('; '), (v.skills || []).join('; '), (v.created_at || '').slice(0, 10)])];
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
