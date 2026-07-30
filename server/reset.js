// Empty the board - deletes ALL data (reports, convoys, NGOs, volunteers, everything).
// Run this ONCE right before going live, so real users start from a clean map.
// In production you then NEVER run `npm run seed` again.
//   npm run reset
import { db } from './db.js';
import { createInterface } from 'node:readline';

const tables = ['reports', 'routes', 'collection_points', 'ngos', 'flood_polygons', 'flood_reports', 'votes', 'messages', 'actions_log', 'advisory'];

function wipe() {
  for (const t of tables) db.exec(`DELETE FROM ${t};`);
  // reset autoincrement counters so ids start at 1 again
  try { db.exec("DELETE FROM sqlite_sequence;"); } catch {}
  console.log('✅ Board is now empty. Real reports will start from a clean slate.');
  console.log('   Do NOT run `npm run seed` on this production database again.');
}

// Guard against fat-fingering it: require typing YES (skip with --force).
if (process.argv.includes('--force')) { wipe(); process.exit(0); }
const rl = createInterface({ input: process.stdin, output: process.stdout });
rl.question('This DELETES ALL DATA in the database. Type YES to confirm: ', a => {
  if (a.trim() === 'YES') wipe(); else console.log('Cancelled - nothing changed.');
  rl.close();
});
