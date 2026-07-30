# Deploying Banpani to banpani.org — for ~$10/month, zero map fees

Goal: a durable, cheap, no-lock-in deployment a volunteer can reproduce in an afternoon.

- **Server + DB + API:** one small DigitalOcean droplet ($6–12/mo).
- **Frontend:** can be served by the same droplet, or free on Cloudflare Pages / Netlify.
- **Map tiles:** free. Start with OpenStreetMap raster tiles; graduate to **self-hosted Protomaps** for zero-cost-at-scale + offline. **No Google/Mapbox key, ever.**

---

## 1. The droplet (DigitalOcean)

Create the smallest Ubuntu droplet. Then:

```bash
# install Node 22 (built-in SQLite — no build tools needed)
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs git nginx

git clone <your-fork> /opt/banpani && cd /opt/banpani
npm run seed                      # first-time data (skip if restoring a real DB)
```

Set the admin key (needed to approve volunteers) and run as a service:

```bash
sudo tee /etc/banpani.env >/dev/null <<'EOF'
PORT=8080
BANPANI_ADMIN_KEY=<a-long-random-string>   # only for the optional maintenance page
BANPANI_DB=/opt/banpani/server/banpani.db
EOF
sudo cp deploy/banpani.service /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now banpani
systemctl status banpani           # should be active
```

## 2. nginx + HTTPS + banpani.org

Point the `banpani.org` DNS **A record** at the droplet's IP (and `www` too). Then:

```bash
sudo cp deploy/nginx.conf /etc/nginx/sites-available/banpani
sudo ln -s /etc/nginx/sites-available/banpani /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

# free HTTPS
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d banpani.org -d www.banpani.org
```

## 3. The 6-hour situation report (cron)

```bash
sudo crontab -e
# regenerate the public snapshot every 6 hours:
0 */6 * * * cd /opt/banpani && /usr/bin/node --experimental-sqlite server/report.js
```

## 4. No admin work — it's community-run

There is **nothing to approve**. Reports and NGOs are verified by community consensus
(3 confirmations / 5 endorsements). Your only ongoing job is keeping the box running.

`/admin.html` exists purely for **maintenance** (paste `BANPANI_ADMIN_KEY`): override the
weather advisory or clean up abuse the community hasn't caught, and view the audit log.
You normally never open it.

### Auto weather advisory (cron)
```bash
crontab -e
0 */3 * * *  cd /opt/banpani && /usr/bin/node --experimental-sqlite server/weather.js
```
This pulls the rainfall forecast from **Open-Meteo** (free, no key) and writes the map's
corner advisory automatically. No admin input.

### Going live — clear the sample data
The repo ships with demo data. **Once, right before launch:** `npm run reset` (empties the board).
Then never run `npm run seed` again on the production DB.

## 5. Back up (do this — it's one file)

```bash
# SQLite in WAL mode: safest copy is via the sqlite3 backup, but a plain copy is fine for snapshots
0 * * * * cp /opt/banpani/server/banpani.db /opt/banpani/backups/banpani-$(date +\%H).db
```

---

## Maps for free — the important part

**Default (works immediately):** `frontend/config.js` already uses free OpenStreetMap raster tiles. Fine for modest relief traffic. If load grows, switch `TILE_URL` to a free tier (MapTiler / Stadia) — but better:

**Zero-cost-at-scale + offline: self-host Protomaps (PMTiles).**
1. Download a **single vector extract of just Assam / Northeast India** from <https://protomaps.com> (a `.pmtiles` file, tens of MB).
2. Put it on the droplet (or DO Spaces object storage) and serve the static file.
3. Render with **MapLibre GL + the `pmtiles` protocol** instead of Leaflet raster tiles.

Result: **no API key, no per-view billing, no rate limit, and the map works even when connectivity is poor** — exactly what a flood needs. This is the recommended long-term setup; the README calls it the "for generations" choice.

## Flood-extent layers (all free)

- **Official:** replace `frontend/data/assam-circles.geojson` with real ASDMA revenue-circle boundaries (Survey of India / OSM / data.gov.in) and update `severity`/`people` from the daily ASDMA bulletin.
- **Satellite:** add a WMS/raster overlay from **ISRO Bhuvan** (India flood layers), **Copernicus EMS / Global Flood Monitoring**, or export a Sentinel-1 water mask from **Google Earth Engine** (free, non-commercial) on a schedule.
- **Community:** already built in — approved volunteers `POST /api/flood/polygons`.

## Hardening notes (before real traffic)

- Put a rate-limiter in front of `POST /api/reports` (nginx `limit_req`) — the `device` field is already stored to help.
- Consider phone-OTP for volunteer sign-up if abuse appears; the token model already supports issuing per-person tokens.
- The API sends permissive CORS so the frontend can live on a different host; tighten `access-control-allow-origin` to `https://banpani.org` in `server/server.js` once the frontend's home is fixed.
