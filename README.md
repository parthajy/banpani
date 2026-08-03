# 🛟 Banpani · বান পানী

**A free, community-run live map to coordinate flood relief — so no area is left stranded, and no two convoys collide on the same village.**

Built during the July 2026 Assam floods. Designed to be redeployed for the *next* flood, anywhere, by anyone — hence: open source, open data, no paid services, and no npm dependencies to rot.

> _Baan (বান) = flood · Pani (পানী) = water._ Intended home: **banpani.org**

---

## The three problems it solves

1. **Stranded areas nobody reached.** Anyone — a stranded family, a neighbour, a passer-by — can drop a need on the map. No app, no login. The **"Nobody coming" pane** and the **Gaps view** automatically surface needs that have *no* relief heading to them, ranked by people affected × how long they've waited.
2. **Overlap / overkill.** Relief groups announce where their convoy is going. When you announce a convoy, the map **warns you if another group is already covering that spot with the same supplies** — and points you at the gaps instead.
3. **Fragmented effort.** A public **NGO registry** and **collection-point map** unite the dozens of separate WhatsApp groups around one shared source of truth. WhatsApp stays; everyone just points at the same map.

Plus: **specific-item signalling with fulfilment** — a place asks for *Dettol*; it shows as an open need; a volunteer marks it *resolved* when delivered ("the stamp").

## Trust model (open reporting, community consensus — no accounts, no gatekeeper)

- **Anyone can report.** Every report is born `unverified` and shows with a hollow pin.
- **Anyone can verify.** No login. A report becomes **confirmed** when **3 different people** confirm it; it's hidden when it's false-flagged by a few. NGOs earn a **community-verified** badge at **5 endorsements**. Votes are one-per-device.
- **No admin in the loop.** The operator's only job after launch is maintenance. There is an optional `/admin.html` for overrides, but the site runs entirely on community consensus without it.
- **Victim phone numbers are never public** — kept out of all bulk data, revealed one-at-a-time via a logged endpoint, only when someone actually needs to coordinate.
- **Every 6 hours a public situation report** (`/report.html`, cron) lists everything still unverified and every coverage gap — full transparency so nothing quietly slips through.

## The map (the hero)

- **Layers:** 🌊 flood extent · 🆘 needs · 🚚 coverage/convoys · 🏳️ NGOs & drop-offs — each toggleable.
- **Flood extent** = official admin-boundary severity zones (from the ASDMA daily bulletin) **+** community-drawn "this area is under water" polygons from ground volunteers. See [Flood data](#flood-data) to wire in satellite layers later.
- **Time views:** _Live_ · _Today's coverage_ · _Earlier_ · _Gaps only_.

---

## Run it locally (60 seconds)

Requires **Node ≥ 22** (for built-in SQLite). Nothing to `npm install`.

```bash
npm run seed     # creates banpani.db + realistic Assam sample data
npm start        # serves API + site at http://localhost:8080
```

Open **http://localhost:8080**. Try:
- The **Gaps** view (top-left) — see the areas nobody is covering.
- Pre-seeded so **Udalguri + Tezpur convoys both stack on Majuli** — announce a third water convoy there and watch the overlap warning fire.
- Tap any need → **Confirm / Delivered / Not real** (community voting, no login). Or open the **/verify.html** console.
- **Share** any need to WhatsApp; **☎ Help** for official helplines. It's a PWA — installable, and the last-seen map survives a dead signal.

Handy scripts:
```bash
npm run report    # regenerate the public 6h situation report → frontend/report.html
npm run weather   # auto-fill the weather advisory from Open-Meteo (free, no key)
npm run reset     # EMPTY the board — run once, right before going live
```

## Architecture

```
frontend/            static site — deploy anywhere (Cloudflare Pages / Netlify / the droplet)
  index.html app.js  the live map + report/convoy/drop-off/NGO forms
  volunteer.html .js  volunteer sign-in + verification console
  config.js          ← edit to point at your API / change map tiles
  data/*.geojson     flood-severity zones (swap for real ASDMA boundaries)
  report.html        generated 6h situation snapshot
server/              Node built-in http + sqlite, ZERO npm deps
  server.js          JSON API + static file serving
  db.js schema.sql   one SQLite file holds everything (easy backup: copy the file)
  seed.js report.js  sample data + the 6h report generator
deploy/              DigitalOcean + Cloudflare + banpani.org guide, nginx, systemd
```

Data layer is isolated in `server/db.js`; the front-end only ever calls the JSON API. A future **WhatsApp/SMS intake** just needs to `POST /api/reports` — the map picks it up automatically.

## Flood data

The flood layer stacks three free sources, best-to-have first (details in `deploy/README.md`):
1. **Official admin boundaries** shaded by severity — `frontend/data/assam-circles.geojson` (bundled sample is approximate; replace with real ASDMA revenue-circle boundaries).
2. **Satellite flood extent** — free from Copernicus EMS / Global Flood Monitoring, ISRO **Bhuvan** WMS, or a scheduled Google Earth Engine (Sentinel-1) export. Add as a raster/WMS overlay.
3. **Community polygons** — volunteers draw underwater areas in the field (`POST /api/flood/polygons`).

## Deploy for real

See **[deploy/README.md](deploy/README.md)** — a $6–12/month DigitalOcean droplet + free Cloudflare Pages, pointed at `banpani.org`, with **zero recurring map cost** via self-hosted Protomaps tiles.

## License & spirit

**Code:** MIT — see [LICENSE](LICENSE). Created and maintained by **Partha Borthakur**; code © 2026 Partha Borthakur. There is no CLA — external contributions are accepted under GitHub's inbound=outbound terms, i.e. licensed under this repo's MIT license.

**Data:** community-submitted content (needs, listings, photos) is published as **open data, dedicated to the public domain under [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/)**. Third-party data is openly licensed: basemap © OpenStreetMap contributors (ODbL), weather from Open-Meteo, official bulletins from ASDMA (public government data).

**Privacy & do-no-harm:** victim phone numbers are never shown publicly and never appear in any bulk/API response (revealed one-at-a-time via a logged endpoint); no accounts or logins; one vote per device; IP addresses are hashed, never stored raw. Full policy: [privacy.html](frontend/privacy.html). Banpani never asks for or displays any way to collect money — no donations flow through it.

This is **not a product or a startup.** Use it, fork it, run it for Bihar or Kerala or wherever the water rises next. Keep it free. Keep the data open. Keep people safe.

_Contributions welcome. The most valuable ones right now: real ASDMA boundary GeoJSON, a Sentinel-1 flood-extent job, Assamese/Bengali/Bodo translations, and a WhatsApp intake bot._
