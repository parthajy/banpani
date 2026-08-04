// Standing volunteer registry — the "ready force" for when disaster strikes.
//
// PRIVACY MODEL (the whole point): the live server holds ONLY the public key. It can ENCRYPT an
// email to store it, but it has NO ability to decrypt — there is no private key anywhere online,
// not in the DB, not in the admin panel, not in backups. Nobody browsing the server (including the
// operator) can read a single volunteer's email. The private key lives offline; a real mobilisation
// means deliberately running server/volunteer-export.js on a trusted offline machine with that key,
// decrypting ONLY the region being activated. Lose the key → the list is unreadable forever.
import { publicEncrypt, constants } from 'node:crypto';
import { all, one, run, now } from './db.js';

// The live public key is the one the operator provisioned from the password room (/parthajy/admin).
// Until they set a password there, sign-up is OFF — this guarantees every stored email is encrypted
// to the room's key and therefore always readable in the room (no orphan rows to a stray key).
function publicKeyPem() {
  const row = one("SELECT v FROM app_kv WHERE k='vol_pubkey'");
  return (row && row.v) || null;
}

export const volunteersEnabled = () => !!publicKeyPem();

// A conservative e-mail check — we never see it again after this, so validate before encrypting.
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,24}$/;
export const validEmail = e => typeof e === 'string' && EMAIL_RE.test(e.trim());

function encryptEmail(email) {
  const buf = Buffer.from(String(email).trim().toLowerCase(), 'utf8');   // lowercase so the room can dedupe
  return publicEncrypt({ key: publicKeyPem(), padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' }, buf).toString('base64');
}

// Register a volunteer. Stores ONLY: encrypted email, a COARSE location (rounded ~11km so it's a
// region not an address), country, and what they can help with. Returns false if the feature is off.
export function addVolunteer({ email, lat, lng, country, region, families, skills }) {
  if (!publicKeyPem() || !validEmail(email)) return false;
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
