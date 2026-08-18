// State hubs - one evergreen page per disaster-prone state (/india/<slug>). They rank for
// "<state> disaster relief" year-round, list the live responses in that state (pulled from the
// tracker), point to the disasters that state is most prone to, and carry the official sources.
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const jesc = s => JSON.stringify(s).replace(/</g, '\\u003c');

// name, state (as in the district dataset, for the live-tracker filter), sdma (authority), prone (guide
// slugs), hook (one-line reason it is disaster-prone).
export const STATES = {
  'assam': { name: 'Assam', state: 'Assam', sdma: 'ASDMA (Assam State Disaster Management Authority)', prone: ['flood', 'landslide', 'earthquake'], hook: 'the annual Brahmaputra and Barak valley floods, plus landslides and earthquakes in the North-East' },
  'kerala': { name: 'Kerala', state: 'Kerala', sdma: 'KSDMA (Kerala State Disaster Management Authority)', prone: ['flood', 'landslide', 'disease-outbreak'], hook: 'monsoon floods, Western Ghats landslides (Wayanad, Idukki) and outbreaks such as Nipah' },
  'odisha': { name: 'Odisha', state: 'Odisha', sdma: 'OSDMA (Odisha State Disaster Management Authority)', prone: ['cyclone', 'flood', 'heatwave'], hook: 'Bay of Bengal cyclones, river floods and severe pre-monsoon heat' },
  'tamil-nadu': { name: 'Tamil Nadu', state: 'Tamil Nadu', sdma: 'TNSDMA (Tamil Nadu State Disaster Management Authority)', prone: ['cyclone', 'flood', 'drought'], hook: 'north-east monsoon cyclones and floods (Chennai), and interior drought' },
  'maharashtra': { name: 'Maharashtra', state: 'Maharashtra', sdma: 'Maharashtra State Disaster Management', prone: ['flood', 'drought', 'landslide'], hook: 'city and river floods, Marathwada / Vidarbha drought, and Western Ghats landslides' },
  'uttarakhand': { name: 'Uttarakhand', state: 'Uttarakhand', sdma: 'USDMA (Uttarakhand State Disaster Management Authority)', prone: ['landslide', 'flood', 'earthquake'], hook: 'Himalayan landslides, flash floods and glacial lake outbursts, and forest fires' },
  'himachal-pradesh': { name: 'Himachal Pradesh', state: 'Himachal Pradesh', sdma: 'HPSDMA', prone: ['landslide', 'flood', 'earthquake'], hook: 'monsoon landslides, flash floods and high seismic risk' },
  'gujarat': { name: 'Gujarat', state: 'Gujarat', sdma: 'GSDMA (Gujarat State Disaster Management Authority)', prone: ['cyclone', 'earthquake', 'drought'], hook: 'Arabian Sea cyclones, the Kutch seismic zone, and Saurashtra / Kutch drought' },
  'west-bengal': { name: 'West Bengal', state: 'West Bengal', sdma: 'WBSDMA', prone: ['cyclone', 'flood'], hook: 'Bay of Bengal cyclones (Amphan, Yaas) and delta floods' },
  'andhra-pradesh': { name: 'Andhra Pradesh', state: 'Andhra Pradesh', sdma: 'APSDMA', prone: ['cyclone', 'flood', 'heatwave'], hook: 'east-coast cyclones, river floods and severe heat' },
  'bihar': { name: 'Bihar', state: 'Bihar', sdma: 'BSDMA (Bihar State Disaster Management Authority)', prone: ['flood', 'heatwave'], hook: 'the Kosi and Gandak floods and deadly pre-monsoon heat and lightning' },
  'rajasthan': { name: 'Rajasthan', state: 'Rajasthan', sdma: 'Rajasthan SDMA', prone: ['drought', 'heatwave', 'flood'], hook: 'drought, extreme desert heat, and sudden flash floods' },
  'sikkim': { name: 'Sikkim', state: 'Sikkim', sdma: 'SSDMA', prone: ['earthquake', 'landslide', 'flood'], hook: 'high earthquake risk, landslides and glacial lake outburst floods' },
  'uttar-pradesh': { name: 'Uttar Pradesh', state: 'Uttar Pradesh', sdma: 'UPSDMA', prone: ['flood', 'heatwave'], hook: 'Ganga and Ghaghara floods, and extreme heat and cold waves' },
  'karnataka': { name: 'Karnataka', state: 'Karnataka', sdma: 'KSDMA (Karnataka)', prone: ['flood', 'drought'], hook: 'river floods in the north and coast, and interior drought' },
  'madhya-pradesh': { name: 'Madhya Pradesh', state: 'Madhya Pradesh', sdma: 'MPSDMA', prone: ['flood', 'drought'], hook: 'Narmada and Chambal floods, and Bundelkhand drought' },
};

// Import guide titles lazily to build the "disasters faced" cards without a hard dependency.
import { GUIDES } from './guides.js';
const FAMEMOJI = { water: '💧', storm: '🌪️', geo: '⛰️', fire: '🔥', climate: '☀️', health: '🦠', tech: '☣️' };

export const stateSlugs = () => Object.keys(STATES);

function shell(head, body) { return `<!doctype html>\n<html lang="en">\n<head>\n${head}\n</head>\n<body>\n${body}\n</body>\n</html>`; }

const HEADCSS = '  <style>body{overflow:auto}.gwrap{max-width:820px;margin:0 auto;padding:8px 18px 70px}header.gh{display:flex;align-items:center;gap:10px;padding:11px 16px;background:linear-gradient(180deg,#141b23,#10161d);border-bottom:1px solid var(--line);position:sticky;top:0;z-index:20}header.gh .logo{width:28px;height:28px;border-radius:7px}header.gh .sp{flex:1}header.gh a.cta{color:#fff;text-decoration:none;font-weight:700;font-size:13px;background:linear-gradient(135deg,#ff8a3d,#f5551d);border-radius:16px;padding:7px 14px}h1{font-size:26px;line-height:1.25;margin:20px 0 6px;font-weight:800}.lead{color:var(--muted);font-size:15px;line-height:1.7;margin:8px 0 18px}.lead b{color:var(--text)}h2{font-size:19px;margin:26px 0 10px;font-weight:800}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:10px}.card{display:block;text-decoration:none;background:var(--panel);border:1px solid var(--line);border-radius:13px;padding:13px 15px}.card:hover{border-color:var(--accent)}.card .em{font-size:22px}.card .tt{color:var(--text);font-weight:700;font-size:14px;margin-top:6px}.card .go{color:var(--accent);font-size:12px;font-weight:700;margin-top:6px}.off{background:var(--panel);border:1px solid var(--line);border-left:3px solid var(--accent);border-radius:10px;padding:13px 15px;font-size:14px;color:var(--muted);line-height:1.7}.off b{color:var(--text)}.off a{color:var(--accent)}.cta-row{display:flex;gap:10px;flex-wrap:wrap;margin:18px 0}.cta-row a{text-decoration:none;font-weight:700;font-size:14px;border-radius:12px;padding:11px 16px}.cta-row .p{background:linear-gradient(135deg,#ff8a3d,#f5551d);color:#fff}.cta-row .s{background:var(--panel);border:1px solid var(--line);color:var(--text)}.live{display:flex;flex-direction:column;gap:8px}.sig{background:var(--panel);border:1px solid var(--line);border-radius:11px;padding:10px 13px;font-size:13.5px;color:var(--text)}.sig .m{color:var(--muted);font-size:12px}.muted{color:var(--muted);font-size:13.5px}.gfoot{color:var(--muted);font-size:12px;line-height:1.6;margin-top:28px;padding-top:16px;border-top:1px solid var(--line)}</style>';

function ghead(g) { return `  <header class="gh">\n    <a href="/" aria-label="Banpani home" style="line-height:0"><img class="logo" src="/favicon.png" alt="Banpani" /></a>\n    <div class="sp"></div>\n    <a href="/status" style="color:var(--text);text-decoration:none;font-weight:700;font-size:13px;background:var(--panel2);border:1px solid var(--line);border-radius:16px;padding:6px 12px">📊 Tracker</a>\n    <a class="cta" href="/">🆘 Report / live map</a>\n  </header>`; }

export function stateHubPage(slug) {
  const s = STATES[slug];
  if (!s) return null;
  const url = 'https://banpani.org/india/' + slug;
  const title = `Disaster relief in ${s.name} - live map & how to help`;
  const desc = `Live disaster relief coordination for ${s.name}, India. Facing ${s.hook}. See current responses, report a need, and find how to coordinate relief - no accounts, no money.`;
  const keywords = `${s.name} disaster relief, ${s.name} floods, ${s.name} relief, ${s.name} SDMA, ${s.prone.map(p => (GUIDES[p] ? GUIDES[p].title.replace(/^How to.*coordinate /, '').replace(/^How to /, '') : p)).join(', ')}, help ${s.name}, volunteer ${s.name}`;
  const ld = [
    { '@context': 'https://schema.org', '@type': 'WebPage', name: title, description: desc, url, about: { '@type': 'Place', name: s.name, address: { '@type': 'PostalAddress', addressRegion: s.name, addressCountry: 'IN' } } },
    { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: 'India states', item: 'https://banpani.org/india' }, { '@type': 'ListItem', position: 2, name: s.name, item: url }] },
  ];
  const cards = s.prone.filter(p => GUIDES[p]).map(p => `<a class="card" href="/guide/${p}"><div class="em">${FAMEMOJI[GUIDES[p].family] || '🆘'}</div><div class="tt">${esc(GUIDES[p].title.replace(/ in India$/, ''))}</div><div class="go">Read the guide →</div></a>`).join('\n        ');
  const head = [
    '  <meta charset="utf-8" />', '  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />',
    `  <title>${esc(title)} · Banpani</title>`, `  <meta name="description" content="${esc(desc)}" />`, `  <meta name="keywords" content="${esc(keywords)}" />`,
    `  <link rel="canonical" href="${url}" />`, '  <meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1" />',
    '  <link rel="icon" href="/favicon.ico" sizes="any" /><link rel="icon" href="/favicon.svg" type="image/svg+xml" />', '  <meta name="theme-color" content="#0f1419" />',
    `  <meta property="og:type" content="website" /><meta property="og:title" content="${esc(title)}" /><meta property="og:description" content="${esc(desc)}" /><meta property="og:url" content="${url}" /><meta property="og:image" content="https://banpani.org/og-world.png" />`,
    '  <link rel="stylesheet" href="/styles.css" />', ld.map(x => `  <script type="application/ld+json">${jesc(x)}</script>`).join('\n'), HEADCSS,
  ].join('\n');
  const body = `${ghead()}
  <div class="gwrap">
    <nav style="font-size:12px;color:var(--muted);margin-top:14px"><a href="/" style="color:var(--muted)">Home</a> › <a href="/india" style="color:var(--muted)">States</a> › <span>${esc(s.name)}</span></nav>
    <h1>🆘 Disaster relief in ${esc(s.name)}</h1>
    <p class="lead">${esc(s.name)} faces <b>${esc(s.hook)}</b>. Banpani is a free, community-run live map to coordinate relief - report a stranded family or a need, and volunteers nearby can act. No accounts, no money.</p>
    <div class="cta-row"><a class="p" href="/">🆘 Open the live map</a><a class="s" href="/status">📊 Live tracker</a></div>
    <h2>Live responses in ${esc(s.name)}</h2>
    <div class="live" id="live"><div class="muted">Loading current signals…</div></div>
    <h2>Disasters ${esc(s.name)} faces</h2>
    <div class="grid">
        ${cards}
    </div>
    <h2>Official sources</h2>
    <div class="off">Official state authority: <b>${esc(s.sdma)}</b>.<br>National: <a href="https://ndma.gov.in" target="_blank" rel="noopener">NDMA</a> · disaster helpline <b>1078</b> · emergency <b>112</b>.<br><span class="muted">Banpani is a community tool, not an official agency. Community reports are not official figures - always follow official warnings.</span></div>
    <div class="gfoot">Banpani - a free, open-source live disaster map for India. Made by Partha Borthakur and volunteers. In an emergency call 112.</div>
  </div>
  <script>
    fetch('/api/tracker').then(function(r){return r.json();}).then(function(j){
      var box=document.getElementById('live');
      var sig=(j&&j.signals||[]).filter(function(x){return x.state===${jesc(s.state)};});
      var esc=function(t){return String(t==null?'':t).replace(/[&<>"]/g,function(c){return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'})[c];});};
      if(!sig.length){box.innerHTML='<div class="muted">No active signals in ${esc(s.name)} right now. This fills automatically when something happens - open the <a href="/" style="color:var(--accent)">live map</a> to report.</div>';return;}
      box.innerHTML=sig.slice(0,12).map(function(x){return '<div class="sig">'+esc(x.title)+'<div class="m">'+esc((x.district?x.district+' · ':'')+(x.detail||''))+' · '+esc(x.source)+'</div></div>';}).join('');
    }).catch(function(){document.getElementById('live').innerHTML='<div class="muted">Could not load live signals.</div>';});
  </script>`;
  return shell(head, body);
}

export function stateIndexPage() {
  const url = 'https://banpani.org/india';
  const head = [
    '  <meta charset="utf-8" />', '  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />',
    '  <title>Disaster relief by state in India · Banpani</title>',
    '  <meta name="description" content="Live disaster relief coordination for every disaster-prone state in India - Assam, Kerala, Odisha, Tamil Nadu, Maharashtra, Uttarakhand and more. Report a need, see live responses, find how to help." />',
    '  <meta name="keywords" content="disaster relief India by state, state disaster management, flood relief, cyclone relief, Assam, Kerala, Odisha, Tamil Nadu, help, volunteer" />',
    `  <link rel="canonical" href="${url}" />`, '  <meta name="robots" content="index,follow,max-image-preview:large" />',
    '  <link rel="icon" href="/favicon.ico" sizes="any" />', '  <meta name="theme-color" content="#0f1419" />',
    `  <meta property="og:title" content="Disaster relief by state in India · Banpani" /><meta property="og:url" content="${url}" /><meta property="og:image" content="https://banpani.org/og-world.png" />`,
    '  <link rel="stylesheet" href="/styles.css" />', HEADCSS,
  ].join('\n');
  const cards = Object.keys(STATES).map(k => `<a class="card" href="/india/${k}"><div class="tt">🆘 ${esc(STATES[k].name)}</div><div class="go">Relief in ${esc(STATES[k].name)} →</div></a>`).join('\n      ');
  const body = `${ghead()}
  <div class="gwrap">
    <h1>Disaster relief by state</h1>
    <p class="lead">Banpani coordinates relief across India. Pick a state to see its live responses, the disasters it is most prone to, and how to help. When something strikes, open the <a href="/" style="color:var(--accent)">live map</a>.</p>
    <div class="grid">
      ${cards}
    </div>
  </div>`;
  return shell(head, body);
}
