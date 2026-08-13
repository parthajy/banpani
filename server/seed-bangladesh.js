// One-time seed of the Bangladesh Floods 2026 coordination page (a flagship, operator-run response
// like Assam / Odisha). Idempotent: safe to run more than once. source='seeded' exempts it from
// auto-archive. The 2026 monsoon floods marooned ~1M people across NE (Sylhet) and SE (Chattogram).
//   node --experimental-sqlite server/seed-bangladesh.js
import { run, one, now } from './db.js';
import { RECIPES } from './events.js';

const slug = 'bangladesh-floods-2026';
const existing = one('SELECT id,status FROM events WHERE slug=?', slug);
if (existing) {
  run("UPDATE events SET source='seeded', listed=1, status='active', dormant_at=NULL, archived_at=NULL, modules=? WHERE slug=?",
    JSON.stringify(RECIPES.water), slug);
  console.log('Bangladesh event already exists (id ' + existing.id + ') - refreshed to active/seeded.');
} else {
  const r = run(`INSERT INTO events(created_at,slug,title,disaster_type,lat,lng,radius_km,modules,source,listed,status)
    VALUES(?,?,?,?,?,?,?,?,?,?,?)`,
    now(), slug, 'Bangladesh Floods 2026', 'flood', 23.3, 91.7, 260, JSON.stringify(RECIPES.water), 'seeded', 1, 'active');
  console.log('Created Bangladesh Floods 2026 event -> /e/' + slug + ' (id ' + r.lastInsertRowid + ')');
}
