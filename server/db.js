// Data layer. Wraps Node's built-in SQLite (Node >= 22, run with --experimental-sqlite).
// No npm dependencies - this is deliberate so banpani can be redeployed for the next
// disaster, years from now, with nothing to install and no supply chain to rot.

import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const DB_PATH = process.env.BANPANI_DB || join(__dirname, 'banpani.db');
export const db = new DatabaseSync(DB_PATH);

// Durability + concurrency-friendliness for a single-file DB under a web server.
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');
db.exec(readFileSync(join(__dirname, 'schema.sql'), 'utf8'));

// Migrations for the live DB (CREATE TABLE IF NOT EXISTS won't add columns to existing tables).
for (const stmt of [
  'ALTER TABLE actions_log ADD COLUMN device TEXT',
  'ALTER TABLE actions_log ADD COLUMN ip_hash TEXT',
  'ALTER TABLE actions_log ADD COLUMN area TEXT',
  'ALTER TABLE flood_reports ADD COLUMN updated_at TEXT',
  "ALTER TABLE reports ADD COLUMN mode TEXT NOT NULL DEFAULT 'relief'",
  'ALTER TABLE reports ADD COLUMN adopted_by TEXT',
  'ALTER TABLE reports ADD COLUMN adopted_at TEXT',
  "ALTER TABLE reports ADD COLUMN disaster_type TEXT NOT NULL DEFAULT 'flood'",
  "ALTER TABLE actions_log ADD COLUMN mode TEXT NOT NULL DEFAULT 'relief'",
  'ALTER TABLE reports ADD COLUMN event_id INTEGER',
  'ALTER TABLE routes ADD COLUMN event_id INTEGER',
  'ALTER TABLE collection_points ADD COLUMN event_id INTEGER',
  'ALTER TABLE photos ADD COLUMN event_id INTEGER',
  'ALTER TABLE flood_reports ADD COLUMN event_id INTEGER',
  'ALTER TABLE facilities ADD COLUMN note TEXT',
  'ALTER TABLE actions_log ADD COLUMN event_id INTEGER',
  'ALTER TABLE events ADD COLUMN dormant_at TEXT',    // when an event auto-stopped (45d idle); 15d reopen window
  'ALTER TABLE events ADD COLUMN archived_at TEXT',   // when an event was archived (permanent record)
]) { try { db.exec(stmt); } catch { /* column already exists */ } }

// Assam is event #1. Create it once (idempotent) and adopt every pre-existing coordination
// row that has no event yet, so nothing is orphaned when events become first-class.
(function seedAssamEvent() {
  const ts = new Date().toISOString();
  const full = JSON.stringify(['needs', 'offers', 'convoys', 'dropoffs', 'blocked', 'facilities', 'hazard', 'photos', 'gaps']);
  db.prepare(`INSERT OR IGNORE INTO events(created_at,slug,title,disaster_type,lat,lng,radius_km,modules,source,listed,status)
    VALUES(?,?,?,?,?,?,?,?,?,?,?)`).run(ts, 'assam-floods-2026', 'Assam Floods 2026', 'flood', 26.5, 92.9, 400, full, 'assam', 1, 'active');
  db.prepare("UPDATE events SET modules=? WHERE slug='assam-floods-2026'").run(full);   // keep recipe fresh
  const row = db.prepare("SELECT id FROM events WHERE slug='assam-floods-2026'").get();
  if (row) for (const t of ['reports', 'routes', 'collection_points', 'photos', 'flood_reports'])
    db.prepare(`UPDATE ${t} SET event_id=? WHERE event_id IS NULL`).run(row.id);
})();

export const now = () => new Date().toISOString();
export const today = () => new Date().toISOString().slice(0, 10);

// Small helpers so callers don't sprinkle prepare() everywhere.
export const all = (sql, ...p) => db.prepare(sql).all(...p);
export const one = (sql, ...p) => db.prepare(sql).get(...p);
export const run = (sql, ...p) => db.prepare(sql).run(...p);

// JSON columns are stored as text; parse on the way out.
export function parseRow(row, jsonCols = []) {
  if (!row) return row;
  const out = { ...row };
  for (const c of jsonCols) {
    try { out[c] = JSON.parse(out[c] ?? '[]'); } catch { out[c] = []; }
  }
  return out;
}
export const parseRows = (rows, jsonCols) => rows.map(r => parseRow(r, jsonCols));

// ---- community-consensus thresholds (how many DIFFERENT people it takes) ----
export const THRESH = {
  CONFIRM: 3,   // distinct 'confirm' votes → report becomes confirmed
  FALSE: 3,     // distinct 'false' votes → report hidden as bogus
  RESOLVE: 2,   // distinct 'resolve' votes → need marked delivered
  ENDORSE: 5,   // distinct endorsements → NGO earns community-verified badge
  FAKE: 3,      // distinct 'fake' flags → NGO hidden
};

// Reports decorated with vote tallies + a DERIVED trust/status (computed, never stored).
export function decoratedReports() {
  const rows = all(`SELECT r.*,
    (SELECT COUNT(DISTINCT device) FROM votes v WHERE v.target_type='report' AND v.target_id=r.id AND v.category='trust' AND v.value='confirm') AS nc,
    (SELECT COUNT(DISTINCT device) FROM votes v WHERE v.target_type='report' AND v.target_id=r.id AND v.category='trust' AND v.value='false')   AS nf,
    (SELECT COUNT(DISTINCT device) FROM votes v WHERE v.target_type='report' AND v.target_id=r.id AND v.category='resolve') AS nr
    FROM reports r WHERE r.hidden=0`);
  return rows.map(r => {
    const o = parseRow(r, ['items']);
    o.confirmations = r.nc; o.false_flags = r.nf; o.resolve_votes = r.nr;
    o.verify_status = r.nf >= THRESH.FALSE ? 'false' : r.nc >= THRESH.CONFIRM ? 'confirmed' : 'unverified';
    o.status = r.nr >= THRESH.RESOLVE ? 'resolved' : (r.status === 'resolved' ? 'resolved' : 'open');
    o.mode = r.mode || 'relief';
    o.adopted = !!r.adopted_by;                 // rehab: someone has opted to undertake it
    o.delivered = o.status === 'resolved';       // rehab: confirmed delivered by consensus
    o.hidden_by_community = r.nf >= THRESH.FALSE;
    return o;
  });
}

export function decoratedNgos() {
  const rows = all(`SELECT n.*,
    (SELECT COUNT(DISTINCT device) FROM votes v WHERE v.target_type='ngo' AND v.target_id=n.id AND v.category='endorse' AND v.value='yes')  AS endorsements,
    (SELECT COUNT(DISTINCT device) FROM votes v WHERE v.target_type='ngo' AND v.target_id=n.id AND v.category='endorse' AND v.value='fake') AS fakes
    FROM ngos n WHERE n.hidden=0`);
  return rows.map(r => {
    const o = parseRow(r, ['focus']);
    o.verify_status = r.endorsements >= THRESH.ENDORSE ? 'confirmed' : 'unverified';
    o.hidden_by_community = r.fakes >= THRESH.FAKE;
    return o;
  }).filter(o => !o.hidden_by_community);
}
