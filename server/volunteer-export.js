// OFFLINE MOBILISATION TOOL — run this only on a trusted machine that holds the private key. It is
// the ONLY way any volunteer email is ever readable. The live server cannot do this.
//
//   BANPANI_DB=/path/to/banpani.db node --experimental-sqlite server/volunteer-export.js \
//       --key /path/to/volunteer-private.pem [--country IN] [--family water] [--near LAT,LNG,KM]
//
// Prints the matching volunteers' emails (deduped) so you can send ONE disaster alert. Nothing is
// written back; no plaintext ever touches the server or the DB.
import { privateDecrypt, constants } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { all } from './db.js';

const arg = k => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : null; };
const keyPath = arg('--key');
if (!keyPath) { console.error('Missing --key /path/to/volunteer-private.pem'); process.exit(1); }
const KEY = readFileSync(keyPath, 'utf8');
const country = (arg('--country') || '').toUpperCase();
const family = arg('--family');
const near = arg('--near');   // "lat,lng,km"
let nlat, nlng, nkm;
if (near) { [nlat, nlng, nkm] = near.split(',').map(Number); }
const hav = (a, b, c, d) => { const R = 6371, r = x => x * Math.PI / 180, dLat = r(c - a), dLng = r(d - b); const s = Math.sin(dLat / 2) ** 2 + Math.cos(r(a)) * Math.cos(r(c)) * Math.sin(dLng / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(s)); };

const rows = all('SELECT email_enc,lat,lng,country,families FROM volunteers WHERE hidden=0');
const emails = new Set();
let matched = 0;
for (const v of rows) {
  if (country && v.country !== country) continue;
  if (family) { let f = []; try { f = JSON.parse(v.families || '[]'); } catch {} if (!f.includes(family)) continue; }
  if (near && v.lat != null && hav(nlat, nlng, v.lat, v.lng) > nkm) continue;
  try {
    const email = privateDecrypt({ key: KEY, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' }, Buffer.from(v.email_enc, 'base64')).toString('utf8');
    emails.add(email); matched++;
  } catch { /* skip anything that won't decrypt with this key (e.g. after a key rotation) */ }
}
console.error(`Matched ${matched} rows -> ${emails.size} unique emails`);
for (const e of emails) console.log(e);
