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
