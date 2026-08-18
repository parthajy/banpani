// Evergreen SEO guides - one per major disaster type. These rank year-round for the head terms
// ("how to coordinate flood relief in India", "cyclone relief", "earthquake rescue") and funnel
// people to the live map + the right response the moment something strikes. Pure content, rendered
// server-side with full SEO (Article + HowTo + FAQ + Breadcrumb structured data).

const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const jesc = s => JSON.stringify(s).replace(/</g, '\\u003c');

// Each guide: slug, family (for the OG image + colour), title, desc, keywords, intro, steps (HowTo),
// needs line, faqs. Kept concise and India-specific.
export const GUIDES = {
  flood: {
    family: 'water', video: '9LYnup1Mq1A',   // add a YouTube id to any guide to embed its tutorial
    title: 'How to coordinate flood relief in India',
    desc: 'A practical guide to coordinating community flood relief in India - what to do in the first hours, what help is needed, and how to map it so volunteers reach the right people fast.',
    keywords: 'flood relief India, flood rescue, how to help flood victims, flood coordination, boat rescue, relief camp, drinking water, ASDMA, NDRF, monsoon flood',
    intro: 'Floods are India\'s most frequent disaster. In the first hours the problem is never a lack of goodwill - it is that nobody knows <b>who is stranded where</b>, and which areas relief has not reached. This guide covers how to coordinate flood relief on the ground, and how a live map turns scattered reports into fast, de-duplicated action.',
    steps: [
      ['Call 112 first', 'For anyone in immediate danger - trapped by rising water, medical emergency - call 112, and the NDRF/SDRF control room. A map complements official rescue; it never replaces it.'],
      ['Report exactly where help is needed', 'Drop a pin at the stranded family or the unmet need (boat, drinking water, medicine, baby food). Precise location beats a WhatsApp forward that no one can act on.'],
      ['Mark the flood extent', 'Show which areas are under water and how deep, so volunteers and boats route around the worst of it and find safe approaches.'],
      ['Match needs to nearby help', 'Boat owners, relief camps and NGOs work the open needs closest to them, and mark them done - so two teams do not cover one village while the next is missed.'],
    ],
    needs: 'Boats and rescue, drinking water, dry food and baby food, ORS and medicines, tarpaulin, sanitary pads, mosquito nets, cattle feed, and safe relief camps.',
    faqs: [
      ['What number do I call in a flood in India?', 'Call 112 (national emergency) and your state disaster helpline. In Assam that is the ASDMA control room 1079; NDRF is 1800-180-1551.'],
      ['How can I help flood victims if I am not nearby?', 'Share the exact location and need so nearby volunteers can act, spread the map so more eyes see the gaps, and route donations to vetted NGOs working the affected districts.'],
      ['Is Banpani official?', 'No. Banpani is a free, community-run coordination map. Community reports are not official government figures - always follow official warnings and call 112 in an emergency.'],
    ],
  },
  cyclone: {
    family: 'storm', title: 'How to coordinate cyclone relief in India',
    desc: 'Coordinating relief before and after a cyclone in India - evacuation, storm surge, wind damage and power restoration - and how to map wind and surge zones so people move to safety.',
    keywords: 'cyclone relief India, cyclone shelter, storm surge, evacuation, landfall, IMD cyclone warning, super cyclone, Bay of Bengal, wind damage, power restoration',
    intro: 'A cyclone is a triple hazard - violent <b>wind</b>, <b>storm surge</b> along the coast, and <b>heavy rain</b> inland. The window to act is before landfall (evacuation) and in the first day after (rescue, shelter, power). This guide covers coordinating that response and mapping wind vs surge zones separately.',
    steps: [
      ['Evacuate before landfall', 'Follow IMD warnings and local orders. Map the nearest open cyclone shelters and the routes to them while there is still time.'],
      ['Mark wind and surge separately', 'Wind damage (roofs, trees, power lines) and storm surge / coastal flooding are different response problems - map them as distinct zones.'],
      ['Coordinate shelter and power', 'Surface open shelters with capacity, and where power lines are down so restoration and generators are prioritised.'],
      ['Clear routes and rescue', 'Report trees and debris blocking roads, and stranded people needing boat or surge rescue.'],
    ],
    needs: 'Evacuation help, cyclone shelters, roofing and tarpaulin, drinking water, food, power restoration, tree and debris clearing, and boats for surge rescue.',
    faqs: [
      ['When is cyclone season in India?', 'The North Indian Ocean has two seasons - April to June and October to December - affecting the Bay of Bengal and Arabian Sea coasts.'],
      ['What is a storm surge?', 'A wall of seawater pushed ashore by the cyclone\'s winds. It is the deadliest part of a cyclone and floods low-lying coastal areas - move inland and to higher ground.'],
      ['Where do I see official cyclone warnings?', 'The India Meteorological Department (IMD) issues cyclone warnings and colour-coded alerts. Always follow them and local administration orders.'],
    ],
  },
  earthquake: {
    family: 'geo', title: 'How to coordinate earthquake rescue and relief in India',
    desc: 'Coordinating search and rescue after an earthquake in India - collapsed buildings, landslides, trapped people, trauma care - and how to map damage so heavy equipment reaches the right sites.',
    keywords: 'earthquake relief India, search and rescue, collapsed building, trapped, landslide, aftershock, NDRF, Himalayan earthquake, trauma care, heavy equipment',
    intro: 'After an earthquake the first 72 hours decide survival. The two problems are <b>collapsed structures</b> (urban search and rescue) and <b>landslides</b> blocking access - especially in the Himalaya and the North-East. This guide covers coordinating rescue and mapping both.',
    steps: [
      ['Report trapped people first', 'Mark exactly where people are trapped so search and rescue teams and sniffer dogs are sent to the right rubble, not a whole neighbourhood.'],
      ['Map collapse and landslides', 'Mark collapsed or unstable buildings, and landslides / blocked roads separately - rescue needs heavy equipment; access needs clearing.'],
      ['Surface trauma care and blood', 'Show open hospitals with capacity, blood needs, and where ambulances can reach - trauma and crush injuries dominate.'],
      ['Watch for aftershocks', 'Keep people clear of damaged structures; mark cordons around buildings that could still fall.'],
    ],
    needs: 'Search and rescue, medical and trauma care, blood, heavy equipment (cranes and cutters), tents and blankets, drinking water, and sanitation.',
    faqs: [
      ['What should I do during an earthquake?', 'Drop, cover and hold on. After shaking stops, move away from damaged buildings to open ground and expect aftershocks. Call 112 for anyone trapped or injured.'],
      ['Which parts of India are earthquake-prone?', 'The Himalayan belt (J&K, Himachal, Uttarakhand, Sikkim, North-East), and Kutch in Gujarat are the highest-risk seismic zones.'],
      ['How can volunteers help after an earthquake?', 'Report trapped people and damage precisely, donate blood, and support vetted rescue and medical teams - never enter unstable rubble untrained.'],
    ],
  },
  landslide: {
    family: 'geo', title: 'How to coordinate landslide relief in India',
    desc: 'Coordinating relief after a landslide in the Himalaya or Western Ghats - trapped people, blocked roads, cut-off villages - and how mapping speeds rescue and access.',
    keywords: 'landslide relief India, landslide rescue, blocked road, cut off village, Himalaya, Western Ghats, Wayanad, monsoon landslide, search and rescue',
    intro: 'Monsoon landslides cut off hill villages across the Himalaya and the Western Ghats (Wayanad, Idukki, the Nilgiris, the Konkan). The core problems are <b>people trapped</b> and <b>access blocked</b> by debris. This guide covers coordinating that response.',
    steps: [
      ['Report trapped people and buried homes', 'Mark exactly where people are buried or cut off so rescue reaches them fast.'],
      ['Map blocked roads and alternate routes', 'Show which roads are gone and which detours still work, so relief and ambulances get through.'],
      ['Surface shelter and medical', 'Open shelters, medical posts and where heavy equipment is needed to clear debris.'],
      ['Watch the rain', 'More rain on saturated slopes means more slides - keep people off unstable hillsides.'],
    ],
    needs: 'Search and rescue, heavy equipment, medical and trauma care, temporary shelter, food and water for cut-off villages, and road clearing.',
    faqs: [
      ['What triggers landslides in India?', 'Heavy or prolonged monsoon rain on steep, deforested or saturated slopes - common in the Himalaya and Western Ghats.'],
      ['How do cut-off villages get help?', 'Mapping which roads are blocked and which alternate routes work lets relief teams and air support prioritise the isolated communities.'],
    ],
  },
  fire: {
    family: 'fire', title: 'How to coordinate wildfire and fire relief in India',
    desc: 'Coordinating response to a wildfire or urban fire in India - evacuation, the fire front, smoke and hazardous air - and how mapping fire and smoke zones keeps people safe.',
    keywords: 'wildfire India, forest fire, Uttarakhand forest fire, fire evacuation, smoke, air quality, burns, firefighting, shelter',
    intro: 'Whether a forest fire in the hills or an urban blaze, the two hazards are the <b>fire front</b> and the <b>smoke plume</b> - and smoke travels far, driving evacuation and breathing risk. This guide covers coordinating evacuation and relief.',
    steps: [
      ['Evacuate early, downwind is dangerous', 'Move away from the fire and out of the smoke path. Map safe routes and shelters.'],
      ['Mark the fire front and smoke zones', 'The burn zone and the hazardous-air (smoke) zone are different - map them separately so people avoid both.'],
      ['Surface shelter, masks and medical', 'Open shelters upwind, N95 masks, and medical care for burns and smoke inhalation.'],
      ['Support firefighting and animal rescue', 'Mark where firefighting help and water are needed, and where livestock must be moved.'],
    ],
    needs: 'Evacuation help, masks and clean air, shelter (upwind), drinking water, medical and burns care, firefighting support, and animal rescue.',
    faqs: [
      ['Where are wildfires common in India?', 'Forest fires are frequent in Uttarakhand, Himachal, the North-East and central India, especially in the dry pre-monsoon months.'],
      ['Why is smoke dangerous far from a fire?', 'Wind carries fine particulate smoke for many kilometres, harming breathing - people with asthma, the elderly and children should move upwind and indoors.'],
    ],
  },
  drought: {
    family: 'climate', title: 'How to coordinate drought relief in India',
    desc: 'Coordinating drought relief in India - drinking water, fodder and cattle camps, crop loss and rural livelihoods - and how mapping needs directs tankers and support.',
    keywords: 'drought relief India, water scarcity, water tanker, fodder, cattle camp, crop failure, Marathwada, Bundelkhand, MGNREGA, compensation',
    intro: 'Drought is a slow disaster. Its impact is <b>water scarcity</b>, <b>livestock at risk</b> and <b>lost farm livelihoods</b> across belts like Marathwada, Bundelkhand and Rayalaseema. This guide covers coordinating relief and support.',
    steps: [
      ['Map water-scarce villages', 'Show where drinking water has run out so tankers are routed to the driest villages first.'],
      ['Support livestock', 'Surface fodder needs and cattle camps - livestock is a family\'s savings in rural India.'],
      ['Direct livelihood support', 'Map crop loss, compensation help and work (MGNREGA) needs.'],
      ['Track the rain outlook', 'Watch whether rain is coming so relief planning matches the season.'],
    ],
    needs: 'Drinking water and tankers, fodder for livestock, cattle camps, crop and farm support, food ration, and work / MGNREGA.',
    faqs: [
      ['Which regions in India face drought most?', 'Marathwada and Vidarbha (Maharashtra), Bundelkhand (UP/MP), Rayalaseema (AP), north Karnataka, Saurashtra and western Rajasthan.'],
      ['What do drought-hit families need most?', 'Reliable drinking water, fodder to keep livestock alive, and income support - not just one-time handouts.'],
    ],
  },
  heatwave: {
    family: 'climate', title: 'How to coordinate heatwave relief in India',
    desc: 'Coordinating heatwave relief in India - drinking water, ORS, cooling shelters and heat-stroke care - and how to reach the most vulnerable during extreme heat.',
    keywords: 'heatwave India, heat stroke, cooling shelter, ORS, drinking water, extreme heat, summer, IMD heatwave warning',
    intro: 'Heatwaves kill quietly - the outdoor worker, the elderly, the homeless. India\'s plains cross 45°C in April-June. This guide covers coordinating relief during extreme heat.',
    steps: [
      ['Reach the most exposed', 'Map where outdoor workers, the homeless and the elderly need water and shade most.'],
      ['Surface cooling and water', 'Open cooling shelters (with fans/AC), water points and ORS distribution.'],
      ['Watch heat-stroke cases', 'Show where medical help for heat stroke is needed, and keep advice simple - hydrate, stay indoors 12-4pm.'],
      ['Protect livestock too', 'Shade and water for cattle during the peak.'],
    ],
    needs: 'Drinking water, ORS and electrolytes, cooling and shade, cool shelters, heat-stroke medical care, and shade and water for cattle.',
    faqs: [
      ['When are heatwaves worst in India?', 'April to June, before the monsoon, across the northern and central plains. The IMD issues heatwave warnings at 40°C+ in the plains.'],
      ['How do you treat heat stroke?', 'Move the person to shade, cool them with water, give fluids if conscious, and get medical help fast - heat stroke is a medical emergency.'],
    ],
  },
  'disease-outbreak': {
    family: 'health', title: 'How to coordinate a disease outbreak response in India',
    desc: 'Coordinating a response to a pandemic or outbreak in India - oxygen, hospital beds, testing and vaccines for human disease, and vets and quarantine for animal or zoonotic outbreaks.',
    keywords: 'pandemic response India, disease outbreak, oxygen, ICU bed, testing, vaccination, dengue, cholera, Nipah, bird flu, zoonotic, one health',
    intro: 'A disease outbreak - human, animal or crossing between the two (zoonotic, like Nipah or bird flu) - overwhelms the system fastest. COVID showed what community coordination can do. This guide covers organising that response.',
    steps: [
      ['Match critical needs to supply', 'For a human outbreak: map oxygen, ICU beds, medicines and ambulances against who has them. This saved lives during COVID.'],
      ['Surface testing and vaccination', 'Show open testing centres and vaccination points so people find them without spreading rumours.'],
      ['For animal / zoonotic outbreaks', 'Coordinate veterinary teams, animal vaccination, safe culling and disposal, and quarantine / movement bans.'],
      ['Care for the isolated', 'Meals and home care for people isolating, and clear public advisories to counter panic.'],
    ],
    needs: 'Oxygen, ICU beds, ventilators, medicines, PPE, testing, ambulances, vaccination - and for animal outbreaks: vets, vaccine, safe disposal and quarantine.',
    faqs: [
      ['What did COVID teach about coordination?', 'That the bottleneck is matching - a bed or an oxygen cylinder exists, but the family in need cannot find it in time. A live, shared map fixes that.'],
      ['What is a zoonotic outbreak?', 'A disease that jumps between animals and people - like Nipah (fruit bats) or bird flu. It needs both human isolation measures and animal control (vets, culling, quarantine) together.'],
      ['Does Banpani share private health data?', 'No. There are no accounts and no phone numbers shown publicly. It coordinates needs and resources, not personal medical records.'],
    ],
  },
  'gas-leak': {
    family: 'tech', title: 'How to respond to a gas leak or industrial accident in India',
    desc: 'Responding to a chemical or gas leak in India - evacuating upwind of the toxic plume, decontamination and medical care - and how live wind data shows which way the gas is drifting.',
    keywords: 'gas leak India, chemical leak, toxic gas, Bhopal, Vizag, styrene, ammonia, chlorine, evacuation, decontamination, HAZMAT, plume, downwind',
    intro: 'From Bhopal to the 2020 Vizag styrene leak, industrial gas releases turn deadly in minutes - and the danger is not just the leak, it is the <b>plume</b> the wind carries downwind. This guide covers responding safely.',
    steps: [
      ['Move upwind and crosswind - never downwind', 'The toxic plume drifts with the wind. Banpani shows the live wind-driven plume direction so you evacuate the right way.'],
      ['Mark the leak source and the plume', 'Map the release point and the downwind hazardous-air zone separately.'],
      ['Surface decontamination and medical', 'Open decontamination points, hospitals, masks and respirators, and antidote/oxygen where relevant.'],
      ['Follow official evacuation orders', 'A wind estimate guides you, but the district administration\'s orders are final.'],
    ],
    needs: 'Evacuation, masks and respirators, medical and decontamination, antidote and oxygen, clean water, and shelter upwind.',
    faqs: [
      ['Which way do I run from a gas leak?', 'Upwind (into the wind) or crosswind - never downwind, where the gas is drifting. Banpani\'s live plume layer shows the direction from current wind.'],
      ['What was the Vizag gas leak?', 'A 2020 styrene vapour leak at LG Polymers in Visakhapatnam that killed 12 and hospitalised hundreds - a modern reminder of industrial risk.'],
    ],
  },
};

const FAM = { water: '💧', storm: '🌪️', geo: '⛰️', fire: '🔥', climate: '☀️', health: '🦠', tech: '☣️' };

export const guideSlugs = () => Object.keys(GUIDES);

function guideShell(head, body) {
  return `<!doctype html>\n<html lang="en">\n<head>\n${head}\n</head>\n<body>\n${body}\n</body>\n</html>`;
}

export function guidePage(slug) {
  const g = GUIDES[slug];
  if (!g) return null;
  const url = 'https://banpani.org/guide/' + slug;
  const emoji = FAM[g.family] || '🆘';
  const ld = [
    { '@context': 'https://schema.org', '@type': 'Article', headline: g.title, description: g.desc, url, mainEntityOfPage: url, author: { '@type': 'Organization', name: 'Banpani' }, publisher: { '@type': 'Organization', name: 'Banpani', logo: { '@type': 'ImageObject', url: 'https://banpani.org/favicon-96.png' } }, image: `https://banpani.org/og-${g.family}.png` },
    { '@context': 'https://schema.org', '@type': 'HowTo', name: g.title, description: g.desc, step: g.steps.map((s, i) => ({ '@type': 'HowToStep', position: i + 1, name: s[0], text: s[1] })) },
    { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: g.faqs.map(f => ({ '@type': 'Question', name: f[0], acceptedAnswer: { '@type': 'Answer', text: f[1] } })) },
    { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: 'Guides', item: 'https://banpani.org/guide' }, { '@type': 'ListItem', position: 2, name: g.title, item: url }] },
  ];
  const head = [
    '  <meta charset="utf-8" />',
    '  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />',
    `  <title>${esc(g.title)} · Banpani</title>`,
    `  <meta name="description" content="${esc(g.desc)}" />`,
    `  <meta name="keywords" content="${esc(g.keywords)}" />`,
    `  <link rel="canonical" href="${url}" />`,
    '  <meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1" />',
    '  <link rel="icon" href="/favicon.ico" sizes="any" />',
    '  <link rel="icon" href="/favicon.svg" type="image/svg+xml" />',
    '  <meta name="theme-color" content="#0f1419" />',
    `  <meta property="og:type" content="article" /><meta property="og:title" content="${esc(g.title)}" /><meta property="og:description" content="${esc(g.desc)}" /><meta property="og:url" content="${url}" /><meta property="og:image" content="https://banpani.org/og-${g.family}.png" />`,
    '  <link rel="stylesheet" href="/styles.css" />',
    ld.map(x => `  <script type="application/ld+json">${jesc(x)}</script>`).join('\n'),
    '  <style>body{overflow:auto}.gwrap{max-width:760px;margin:0 auto;padding:8px 18px 70px}header.gh{display:flex;align-items:center;gap:10px;padding:11px 16px;background:linear-gradient(180deg,#141b23,#10161d);border-bottom:1px solid var(--line);position:sticky;top:0;z-index:20}header.gh .logo{width:28px;height:28px;border-radius:7px}header.gh .sp{flex:1}header.gh a.cta{color:#fff;text-decoration:none;font-weight:700;font-size:13px;background:linear-gradient(135deg,#ff8a3d,#f5551d);border-radius:16px;padding:7px 14px;white-space:nowrap}.gh a.map{color:var(--text);text-decoration:none;font-weight:700;font-size:13px;background:var(--panel2);border:1px solid var(--line);border-radius:16px;padding:6px 12px}h1.gt{font-size:26px;line-height:1.25;margin:22px 0 6px;font-weight:800}.glead{color:var(--muted);font-size:15px;line-height:1.7;margin:10px 0 18px}.glead b{color:var(--text)}.cta-row{display:flex;gap:10px;flex-wrap:wrap;margin:18px 0 26px}.cta-row a{text-decoration:none;font-weight:700;font-size:14px;border-radius:12px;padding:11px 16px}.cta-row .p{background:linear-gradient(135deg,#ff8a3d,#f5551d);color:#fff}.cta-row .s{background:var(--panel);border:1px solid var(--line);color:var(--text)}h2.gs{font-size:19px;margin:28px 0 4px;font-weight:800}.step{display:flex;gap:12px;margin:16px 0}.step .n{flex:0 0 28px;height:28px;border-radius:50%;background:var(--panel2);border:1px solid var(--line);color:var(--accent);font-weight:800;display:flex;align-items:center;justify-content:center;font-size:14px}.step .b{flex:1}.step .b b{display:block;font-size:15px;margin-bottom:2px}.step .b span{color:var(--muted);font-size:14px;line-height:1.6}.needs{background:var(--panel);border:1px solid var(--line);border-left:3px solid var(--accent);border-radius:10px;padding:13px 15px;font-size:14px;color:var(--muted);line-height:1.6;margin:8px 0 4px}.needs b{color:var(--text)}.vid{position:relative;padding-bottom:56.25%;height:0;overflow:hidden;border-radius:12px;border:1px solid var(--line);margin:10px 0 4px}.vid iframe{position:absolute;inset:0;width:100%;height:100%;border:0}details.faq{border-bottom:1px solid var(--line);padding:12px 2px}details.faq summary{font-weight:700;cursor:pointer;font-size:15px;list-style:none}details.faq summary::-webkit-details-marker{display:none}details.faq p{color:var(--muted);font-size:14px;line-height:1.65;margin:9px 0 2px}.rel{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px}.rel a{text-decoration:none;background:var(--panel);border:1px solid var(--line);border-radius:16px;padding:7px 13px;font-size:13px;color:var(--text);font-weight:600}.rel a:hover{border-color:var(--accent)}.gfoot{color:var(--muted);font-size:12px;line-height:1.6;margin-top:30px;padding-top:16px;border-top:1px solid var(--line)}.disc{color:#c9a227;font-size:13px;margin:18px 0}</style>',
  ].join('\n');
  const related = Object.keys(GUIDES).filter(s => s !== slug).map(s => `<a href="/guide/${s}">${FAM[GUIDES[s].family] || ''} ${esc(GUIDES[s].title.replace(/^How to (respond to |coordinate )?/i, '').replace(/ in India$/, ''))}</a>`).join('');
  const body = `  <header class="gh">
    <a href="/" aria-label="Banpani home" style="line-height:0"><img class="logo" src="/favicon.png" alt="Banpani" /></a>
    <div class="sp"></div>
    <a class="map" href="/status">📊 Live tracker</a>
    <a class="cta" href="/">🆘 Report / live map</a>
  </header>
  <div class="gwrap">
    <nav style="font-size:12px;color:var(--muted);margin-top:14px"><a href="/" style="color:var(--muted)">Home</a> › <a href="/guide" style="color:var(--muted)">Guides</a> › <span>${esc(g.title.replace(/ in India$/, ''))}</span></nav>
    <h1 class="gt">${emoji} ${esc(g.title)}</h1>
    <p class="glead">${g.intro}</p>
    <div class="cta-row"><a class="p" href="/">🆘 Open the live India map</a><a class="s" href="/sandbox">🧪 Try a practice scenario</a></div>
    <h2 class="gs">What to do</h2>
    ${g.steps.map((s, i) => `<div class="step"><div class="n">${i + 1}</div><div class="b"><b>${esc(s[0])}</b><span>${esc(s[1])}</span></div></div>`).join('\n    ')}
    <h2 class="gs">What help is usually needed</h2>
    <div class="needs">${esc(g.needs)}</div>
    <h2 class="gs">How Banpani helps</h2>
    <p class="glead">Banpani is a free, community-run live map. Anyone can report a need or a hazard in seconds - no account, no login. Reports cluster by area so relief is not duplicated, and the map shows the gaps nobody has reached. It is open source and owned by no one.</p>
    ${g.video ? `<h2 class="gs">Watch: how to use Banpani</h2>\n    <div class="vid"><iframe src="https://www.youtube-nocookie.com/embed/${esc(g.video)}" title="${esc(g.title)} - Banpani tutorial" loading="lazy" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe></div>` : ''}
    <h2 class="gs">Questions</h2>
    ${g.faqs.map(f => `<details class="faq"><summary>${esc(f[0])}</summary><p>${esc(f[1])}</p></details>`).join('\n    ')}
    <p class="disc">⚠️ Banpani is a community tool, not an official agency. Always follow official warnings and call <b>112</b> in an emergency.</p>
    <h2 class="gs">Other guides</h2>
    <div class="rel">${related}</div>
    <div class="gfoot">Banpani - a free, open-source live disaster map for India. Made by Partha Borthakur and volunteers. In an emergency call 112.</div>
  </div>`;
  return guideShell(head, body);
}

export function guideIndexPage() {
  const url = 'https://banpani.org/guide';
  const head = [
    '  <meta charset="utf-8" />',
    '  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />',
    '  <title>Disaster relief guides for India · Banpani</title>',
    '  <meta name="description" content="Practical guides to coordinating relief for every kind of disaster in India - floods, cyclones, earthquakes, landslides, fires, drought, heatwaves, disease outbreaks and industrial accidents." />',
    '  <meta name="keywords" content="disaster relief India, how to help, flood relief, cyclone relief, earthquake rescue, drought, heatwave, pandemic response, gas leak, guides" />',
    `  <link rel="canonical" href="${url}" />`,
    '  <meta name="robots" content="index,follow,max-image-preview:large" />',
    '  <link rel="icon" href="/favicon.ico" sizes="any" />',
    '  <meta name="theme-color" content="#0f1419" />',
    `  <meta property="og:title" content="Disaster relief guides for India · Banpani" /><meta property="og:url" content="${url}" /><meta property="og:image" content="https://banpani.org/og-world.png" />`,
    '  <link rel="stylesheet" href="/styles.css" />',
    '  <style>body{overflow:auto}.gwrap{max-width:820px;margin:0 auto;padding:8px 18px 70px}header.gh{display:flex;align-items:center;gap:10px;padding:11px 16px;background:linear-gradient(180deg,#141b23,#10161d);border-bottom:1px solid var(--line);position:sticky;top:0;z-index:20}header.gh .logo{width:28px;height:28px;border-radius:7px}header.gh .sp{flex:1}header.gh a.cta{color:#fff;text-decoration:none;font-weight:700;font-size:13px;background:linear-gradient(135deg,#ff8a3d,#f5551d);border-radius:16px;padding:7px 14px}h1{font-size:26px;margin:22px 0 6px;font-weight:800}.lead{color:var(--muted);font-size:15px;line-height:1.7;margin:8px 0 22px}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:12px}.card{display:block;text-decoration:none;background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:15px 16px}.card:hover{border-color:var(--accent)}.card .em{font-size:24px}.card .tt{color:var(--text);font-weight:800;font-size:15px;margin-top:8px;line-height:1.3}.card .go{color:var(--accent);font-size:12.5px;font-weight:700;margin-top:8px}</style>',
  ].join('\n');
  const cards = Object.keys(GUIDES).map(s => {
    const g = GUIDES[s];
    return `<a class="card" href="/guide/${s}"><div class="em">${FAM[g.family] || '🆘'}</div><div class="tt">${esc(g.title)}</div><div class="go">Read the guide →</div></a>`;
  }).join('\n      ');
  const body = `  <header class="gh">
    <a href="/" aria-label="Banpani home" style="line-height:0"><img class="logo" src="/favicon.png" alt="Banpani" /></a>
    <div class="sp"></div>
    <a class="cta" href="/">🆘 Live map</a>
  </header>
  <div class="gwrap">
    <h1>Disaster relief guides for India</h1>
    <p class="lead">How to coordinate community relief for every kind of disaster - what to do in the first hours, what help is needed, and how a live map gets it to the right people fast. When something strikes, open the <a href="/" style="color:var(--accent)">live map</a>.</p>
    <div class="grid">
      ${cards}
    </div>
  </div>`;
  return guideShell(head, body);
}
