# Banpani SEO runbook

How Banpani ranks - what happens automatically, what a human does once, and the playbook when a big
disaster hits. The goal: when *anything* strikes, the response page ranks for the right local terms
within hours, with zero manual SEO.

## What is automatic (no action needed)

Every event page (`/e/<slug>`) is born SEO-complete:

- **Title / description / keywords** auto-built from the event, its family, and its **reverse-geocoded
  district + state** (e.g. a Kerala event auto-gets "Kozhikode, Kerala" in its meta and keywords). See
  `seoFor()` + `districtOf()` in `server/server.js`.
- **Structured data**: `SpecialAnnouncement` (Google's emergency schema) with `spatialCoverage` +
  `addressRegion`, plus `BreadcrumbList`.
- **Crawlable `<noscript>`** body, canonical, OG/Twitter tags, `max-image-preview:large`.
- **Family keywords** (`FAMILY_KEYWORDS` in `server/disasters.js`) - every flood, cyclone, quake, gas
  leak, outbreak etc. indexes for its real terms.
- **Sitemap** (`/sitemap.xml`) auto-includes every promoted event, the guides, the state hubs and the
  core pages, with a fresh `lastmod`.
- **IndexNow ping** to Bing/Yandex fires the moment a new event is created (`pingIndexNow()` in
  `server/events.js`). Key file: `/<key>.txt`.
- **Demos are `noindex`** and excluded from the sitemap, map and tracker - they never compete with real
  disasters in search. They live in `/sandbox`.

## Evergreen ranking assets

- **Guides** `/guide` + `/guide/<slug>` - one per disaster type, with Article + HowTo + FAQ structured
  data. Rank year-round for head terms, funnel to the live map. Add a guide in `server/guides.js`.
  Add a tutorial video by setting `video: '<youTubeId>'` on a guide.
- **State hubs** `/india` + `/india/<slug>` - "disaster relief in <state>" pages that rank for place
  terms and show live responses in that state. Add/extend in `server/statehubs.js`.

## One-time human setup (do this once)

1. **Google Search Console** - verify `https://banpani.org/` (DNS TXT or the HTML meta tag). Submit
   `sitemap.xml`. This is how Google discovers everything.
2. **Bing Webmaster Tools** - verify + submit the sitemap (Bing also honours the IndexNow pings).
3. **Favicon** - after any icon change, open the homepage in GSC → URL Inspection → **Request indexing**
   (Google refreshes the SERP favicon slowly - days to weeks).
4. Optional: a few quality backlinks (the press page, partner NGOs, the founder's posts) build the
   domain authority that makes new event pages rank fast.

## Playbook: when a big disaster hits

1. It mostly takes care of itself - the first report spins up an event that is instantly SEO-complete
   and pinged to IndexNow.
2. For a **major** event, add a hand-tuned `EVENT_SEO` block in `server/server.js` (like Assam /
   Kerala) with a rich, local, bilingual description - it beats the auto text for a flagship.
3. In **GSC → URL Inspection**, paste the event URL and **Request indexing** to jump the queue.
4. Make sure the event is linked from the homepage masthead + the `/status` tracker + the relevant
   state hub (these internal links speed crawling and pass authority).
5. If it is a new disaster *type* or region, add/extend the matching **guide** and **state hub**.

## Health checks

- `curl -s https://banpani.org/sitemap.xml | grep -c '<loc>'` - sitemap populated, no `/world`, no
  `demo-` URLs.
- `curl -sI https://banpani.org/favicon.ico` - 200, `image/png`.
- View-source any `/e/<slug>` - title has the place, `<meta name="keywords">` has district + state,
  one `SpecialAnnouncement` JSON-LD block.
- Demo pages (`/e/demo-*`) - `<meta name="robots" content="noindex,follow">`.

## Languages (SEO + reach)

Event pages adapt the language dropdown to the state (TN → Tamil, Maharashtra → Marathi; English +
Hindi always) via `langsForState()` in `server/india-geo.js`. Add a language by shipping its `STR`
block in `frontend/i18n.js`, adding its label in `app.js`, and mapping its state in `STATE_LANG`.
