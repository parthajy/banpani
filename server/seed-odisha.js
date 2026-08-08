// One-time seed of the Odisha Floods 2026 coordination page (a flagship, operator-run response like
// Assam). Idempotent: safe to run more than once. source='seeded' exempts it from auto-archive.
//   node --experimental-sqlite server/seed-odisha.js
import { run, one, now } from './db.js';
import { RECIPES } from './events.js';

const slug = 'odisha-flood-2026';
const existing = one('SELECT id,status FROM events WHERE slug=?', slug);
if (existing) {
  // make sure it's active + flagship, in case it was created differently before
  run("UPDATE events SET source='seeded', listed=1, status='active', dormant_at=NULL, archived_at=NULL, modules=? WHERE slug=?",
    JSON.stringify(RECIPES.water), slug);
  console.log('Odisha event already exists (id ' + existing.id + ') - refreshed to active/seeded.');
} else {
  const r = run(`INSERT INTO events(created_at,slug,title,disaster_type,lat,lng,radius_km,modules,source,listed,status)
    VALUES(?,?,?,?,?,?,?,?,?,?,?)`,
    now(), slug, 'Odisha Floods 2026', 'flood', 20.6, 85.8, 280, JSON.stringify(RECIPES.water), 'seeded', 1, 'active');
  console.log('Created Odisha Floods 2026 event -> /e/' + slug + ' (id ' + r.lastInsertRowid + ')');
}
