-- Banpani (banpani.org) — flood relief coordination
-- One SQLite file holds everything. Human-readable, trivially backed up (just copy the file).
-- Trust is community consensus: verify_status is DERIVED from the votes table on read
-- (see db.js), never stored on the row.

-- NEEDS: anyone can post (no login).
CREATE TABLE IF NOT EXISTS reports (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at   TEXT NOT NULL,               -- ISO timestamp
  place        TEXT NOT NULL,
  lat          REAL NOT NULL,
  lng          REAL NOT NULL,
  items        TEXT NOT NULL DEFAULT '[]',  -- JSON array of item strings
  people       INTEGER,                     -- approx people affected (for prioritisation)
  details      TEXT,
  contact      TEXT,                         -- private; never returned in bulk /api/state
  reporter_kind TEXT DEFAULT 'witness',     -- affected | volunteer | witness
  status       TEXT NOT NULL DEFAULT 'open',      -- open | resolved (resolved/delivered set by consensus votes)
  mode         TEXT NOT NULL DEFAULT 'relief',    -- relief | rehab  (the two phases; same map, different loop)
  disaster_type TEXT NOT NULL DEFAULT 'flood',     -- which hazard (world-map colour + filter); maps to a DISASTERS family
  adopted_by   TEXT,                         -- rehab: the group/NGO that opted to undertake it
  adopted_at   TEXT,
  device       TEXT,                         -- opaque per-device id, for light rate-limiting
  hidden       INTEGER NOT NULL DEFAULT 0
);

-- COVERAGE / convoys: a group announces where relief is going. Anti-overlap + time views.
CREATE TABLE IF NOT EXISTS routes (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at   TEXT NOT NULL,
  name         TEXT NOT NULL,               -- group / convoy name
  ngo_id       INTEGER,                      -- optional link to registry
  from_place   TEXT,
  from_lat     REAL,
  from_lng     REAL,
  lat          REAL NOT NULL,               -- destination
  lng          REAL NOT NULL,
  items        TEXT NOT NULL DEFAULT '[]',
  eta          TEXT,
  contact      TEXT,
  covered_date TEXT,                         -- YYYY-MM-DD it serves / served (time views)
  status       TEXT NOT NULL DEFAULT 'active', -- active | completed
  device       TEXT,
  hidden       INTEGER NOT NULL DEFAULT 0
);

-- COLLECTION POINTS: where the public can drop food/clothes/supplies.
CREATE TABLE IF NOT EXISTS collection_points (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at   TEXT NOT NULL,
  name         TEXT NOT NULL,
  lat          REAL NOT NULL,
  lng          REAL NOT NULL,
  accepts      TEXT NOT NULL DEFAULT '[]',
  hours        TEXT,
  contact      TEXT,
  org          TEXT,
  active       INTEGER NOT NULL DEFAULT 1,
  verify_status TEXT NOT NULL DEFAULT 'unverified',
  device       TEXT,
  hidden       INTEGER NOT NULL DEFAULT 0
);

-- NGO / GROUP REGISTRY: the unification layer. Who is working, where, on what.
CREATE TABLE IF NOT EXISTS ngos (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at   TEXT NOT NULL,
  name         TEXT NOT NULL,
  focus        TEXT NOT NULL DEFAULT '[]',  -- rescue | food | medical | water | shelter | cattle | rebuild
  area         TEXT,                         -- districts / circles they cover
  contact      TEXT,
  website      TEXT,
  needs_now    TEXT,                         -- what THEY need donated right now
  verify_status TEXT NOT NULL DEFAULT 'unverified',
  last_active  TEXT,                         -- heartbeat
  hidden       INTEGER NOT NULL DEFAULT 0
);

-- ADVISORY: a single editable block for the map's corner — current IMD outlook,
-- rainfall warnings, assumptions. Admin updates it; everyone reads it.
CREATE TABLE IF NOT EXISTS advisory (
  id           INTEGER PRIMARY KEY CHECK (id = 1),
  updated_at   TEXT,
  headline     TEXT,
  body         TEXT,
  source       TEXT
);

-- COMMUNITY FLOOD POLYGONS: volunteers/admin draw "this area is under water".
-- Fills gaps that admin boundaries and satellites miss.
CREATE TABLE IF NOT EXISTS flood_polygons (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at   TEXT NOT NULL,
  geojson      TEXT NOT NULL,               -- a GeoJSON Polygon geometry
  severity     TEXT NOT NULL DEFAULT 'high',-- high | medium | receding
  note         TEXT,
  source       TEXT NOT NULL DEFAULT 'community', -- community | admin
  verify_status TEXT NOT NULL DEFAULT 'unverified',
  created_by   INTEGER,
  hidden       INTEGER NOT NULL DEFAULT 0
);

-- FLOOD REPORTS: real-time, community-reported flood status at a point. There is NO
-- hardcoded flood data anywhere - "under flood now" is derived entirely from these,
-- with freshness shown so people know how recent the picture is.
CREATE TABLE IF NOT EXISTS flood_reports (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at  TEXT NOT NULL,
  place       TEXT,
  lat         REAL NOT NULL,
  lng         REAL NOT NULL,
  severity    TEXT NOT NULL DEFAULT 'high',  -- high | medium | receding | receded
  device      TEXT,
  updated_at  TEXT,                          -- last status change (used for map freshness)
  hidden      INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_flood_reports ON flood_reports(created_at, hidden);

-- PHOTOS: anyone can upload a photo (no account) tagged flooded / relief-needed / work-done
-- (relief) or damage / work-done (rehab). Standalone (its own pin) or attached to a report.
-- Stored on disk; the row keeps the filename. Metadata is stripped client-side before upload.
CREATE TABLE IF NOT EXISTS photos (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at  TEXT NOT NULL,
  report_id   INTEGER,                       -- optional: photo attached to a specific need
  lat         REAL, lng REAL,
  tag         TEXT,                           -- flooded | need | done | damage
  mode        TEXT NOT NULL DEFAULT 'relief',
  caption     TEXT,
  file        TEXT NOT NULL,                  -- filename under the uploads dir
  device      TEXT,
  hidden      INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_photos ON photos(created_at, hidden);

-- VOTES: the community-consensus trust layer. No accounts — one device, one vote per
-- (target, category). Reports become confirmed/hidden and NGOs earn a badge purely by
-- how many DIFFERENT people vouch. Derivation happens on read (see db.js).
CREATE TABLE IF NOT EXISTS votes (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at  TEXT NOT NULL,
  target_type TEXT NOT NULL,   -- report | ngo
  target_id   INTEGER NOT NULL,
  device      TEXT NOT NULL,
  category    TEXT NOT NULL,   -- trust | resolve | endorse
  value       TEXT NOT NULL,   -- trust: confirm|false · resolve: yes · endorse: yes|fake
  UNIQUE(target_type, target_id, device, category)
);
CREATE INDEX IF NOT EXISTS idx_votes ON votes(target_type, target_id, category, value);

-- MESSAGES: people can reach the maintainers privately (ask a question, report an issue)
-- WITHOUT any phone number being exposed either way. Read from the maintenance page.
CREATE TABLE IF NOT EXISTS messages (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at  TEXT NOT NULL,
  name        TEXT,
  contact     TEXT,            -- how THEY want to be reached back (optional)
  message     TEXT NOT NULL,
  device      TEXT,
  handled     INTEGER NOT NULL DEFAULT 0
);

-- ACTION LOG: every write goes here (transparency / accountability). ip_hash is a SALTED
-- hash of the client IP - never the raw IP, never shown publicly; used only for abuse
-- detection and to derive an anonymous per-actor id for the public activity feed.
CREATE TABLE IF NOT EXISTS actions_log (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at   TEXT NOT NULL,
  kind         TEXT,                         -- need_report | convoy | vote | flood_marked ...
  target       TEXT,                         -- "report:12"
  detail       TEXT,
  device       TEXT,
  ip_hash      TEXT,                          -- sha256(salt|ip) - NOT the raw IP
  area         TEXT,                          -- coarse public label (place name / rounded latlng)
  mode         TEXT NOT NULL DEFAULT 'relief' -- relief | rehab (so the feed can split them)
);
CREATE INDEX IF NOT EXISTS idx_actions ON actions_log(id);

CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status, hidden);
CREATE INDEX IF NOT EXISTS idx_routes_status ON routes(status, hidden);

-- Cookieless, first-party visitor counter (replaces Google Analytics). Stores ONLY a daily
-- tally split by mobile/desktop - no IP, no cookie, no per-visitor record, no third party.
CREATE TABLE IF NOT EXISTS pageviews (
  day     TEXT NOT NULL,               -- YYYY-MM-DD
  mobile  INTEGER NOT NULL DEFAULT 0,  -- 1 = mobile UA, 0 = desktop
  n       INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, mobile)
);
