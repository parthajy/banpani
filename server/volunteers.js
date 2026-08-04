// Standing volunteer registry — the "ready force" for when disaster strikes.
//
// PRIVACY MODEL (the whole point): the live server holds ONLY the public key. It can ENCRYPT an
// email to store it, but it has NO ability to decrypt — there is no private key anywhere online,
// not in the DB, not in the admin panel, not in backups. Nobody browsing the server (including the
// operator) can read a single volunteer's email. The private key lives offline; a real mobilisation
// means deliberately running server/volunteer-export.js on a trusted offline machine with that key,
// decrypting ONLY the region being activated. Lose the key → the list is unreadable forever.
import { publicEncrypt, constants } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { all, one, run, now } from './db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
// Public key: env wins (PEM), else the committed server/volunteer-public.pem. Public keys are safe
// to commit — they can only encrypt. If neither is present the feature is simply disabled.
const PUBKEY = (() => {
  if (process.env.BANPANI_VOL_PUBKEY) return process.env.BANPANI_VOL_PUBKEY.replace(/\\n/g, '\n');
  const p = join(__dirname, 'volunteer-public.pem');
  return existsSync(p) ? readFileSync(p, 'utf8') : null;
})();

export const volunteersEnabled = () => !!PUBKEY;

// A conservative e-mail check — we never see it again after this, so validate before encrypting.
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,24}$/;
export const validEmail = e => typeof e === 'string' && EMAIL_RE.test(e.trim());

function encryptEmail(email) {
  const buf = Buffer.from(String(email).trim().toLowerCase(), 'utf8');   // lowercase so the offline tool can dedupe
  return publicEncrypt({ key: PUBKEY, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' }, buf).toString('base64');
}

// Register a volunteer. Stores ONLY: encrypted email, a COARSE location (rounded ~11km so it's a
// region not an address), country, and what they can help with. Returns false if the feature is off.
export function addVolunteer({ email, lat, lng, country, region, families, skills }) {
  if (!PUBKEY || !validEmail(email)) return false;
  const coarse = v => (v == null || isNaN(+v)) ? null : Math.round(+v * 10) / 10;
  run(`INSERT INTO volunteers(created_at,email_enc,lat,lng,country,region,families,skills)
       VALUES(?,?,?,?,?,?,?,?)`,
    now(), encryptEmail(email), coarse(lat), coarse(lng),
    (country || '').slice(0, 2).toUpperCase() || null, (region || '').slice(0, 80) || null,
    JSON.stringify(Array.isArray(families) ? families.slice(0, 12) : []),
    JSON.stringify(Array.isArray(skills) ? skills.slice(0, 12) : []));
  return true;
}

// Public, aggregate-only social proof for the signup page + world map. NEVER exposes emails or
// precise locations — just how big the standing force is, by country and by disaster family.
export function volunteerSummary() {
  const total = one('SELECT COUNT(*) c FROM volunteers WHERE hidden=0')?.c || 0;
  const byCountry = all("SELECT country, COUNT(*) c FROM volunteers WHERE hidden=0 AND country IS NOT NULL GROUP BY country ORDER BY c DESC LIMIT 60");
  const fam = {};
  for (const r of all('SELECT families FROM volunteers WHERE hidden=0')) {
    let list = []; try { list = JSON.parse(r.families || '[]'); } catch {}
    for (const f of list) fam[f] = (fam[f] || 0) + 1;
  }
  return { total, countries: byCountry.length, byCountry, byFamily: fam };
}
