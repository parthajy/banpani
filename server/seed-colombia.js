// One-time seed of the Colombia Earthquake 2026 coordination page (a flagship, operator-run response
// like Assam / Odisha). Idempotent: safe to run more than once. source='seeded' exempts it from
// auto-archive. The M7.4 quake of 10 Aug 2026 struck near San Jose del Palmar, western Colombia.
//   node --experimental-sqlite server/seed-colombia.js
import { run, one, now } from './db.js';
import { RECIPES } from './events.js';

const slug = 'colombia-earthquake-2026';
const existing = one('SELECT id,status FROM events WHERE slug=?', slug);
if (existing) {
  run("UPDATE events SET source='seeded', listed=1, status='active', dormant_at=NULL, archived_at=NULL, modules=? WHERE slug=?",
    JSON.stringify(RECIPES.geo), slug);
  console.log('Colombia event already exists (id ' + existing.id + ') - refreshed to active/seeded.');
} else {
  const r = run(`INSERT INTO events(created_at,slug,title,disaster_type,lat,lng,radius_km,modules,source,listed,status)
    VALUES(?,?,?,?,?,?,?,?,?,?,?)`,
    now(), slug, 'Colombia Earthquake 2026', 'earthquake', 4.9, -76.24, 260, JSON.stringify(RECIPES.geo), 'seeded', 1, 'active');
  console.log('Created Colombia Earthquake 2026 event -> /e/' + slug + ' (id ' + r.lastInsertRowid + ')');
}
