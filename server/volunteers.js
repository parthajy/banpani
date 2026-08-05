// Standing volunteer registry — the "ready force" for when disaster strikes.
//
// Emails are encrypted AT REST with AES-256-GCM under a key derived from the maintenance key. A
// stolen database alone reveals nothing. After you log into the admin with the maintenance key, the
// server decrypts them so you can see the list in one place — simple, one login, no extra password.
// (Victim phone numbers are protected far more strictly and separately; these are volunteer emails.)
import { createCipheriv, createDecipheriv, scryptSync, randomBytes } from 'node:crypto';
import { all, one, run, now } from './db.js';

const ADMIN_KEY = process.env.BANPANI_ADMIN_KEY || 'change-me-in-production';
const EKEY = scryptSync(ADMIN_KEY, 'banpani-volunteer-emails-v1', 32);   // 32-byte AES key from the maintenance key

export const volunteersEnabled = () => true;   // always on — no separate setup step

const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,24}$/;
export const validEmail = e => typeof e === 'string' && EMAIL_RE.test(e.trim());

function encryptEmail(email) {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', EKEY, iv);
  const ct = Buffer.concat([c.update(String(email).trim().toLowerCase(), 'utf8'), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), ct]).toString('base64');
}
export function decryptEmail(enc) {
  try {
    const b = Buffer.from(enc, 'base64');
    const d = createDecipheriv('aes-256-gcm', EKEY, b.subarray(0, 12));
    d.setAuthTag(b.subarray(12, 28));
    return Buffer.concat([d.update(b.subarray(28)), d.final()]).toString('utf8');
  } catch { return null; }   // e.g. after the maintenance key changed — old rows won't decrypt
}

// Register a volunteer. Stores ONLY: encrypted email, a COARSE location (rounded ~11km so it's a
// region not an address), country, and what they can help with.
export function addVolunteer({ email, lat, lng, country, region, families, skills }) {
  if (!validEmail(email)) return false;
  const coarse = v => (v == null || isNaN(+v)) ? null : Math.round(+v * 10) / 10;
  run(`INSERT INTO volunteers(created_at,email_enc,lat,lng,country,region,families,skills)
       VALUES(?,?,?,?,?,?,?,?)`,
    now(), encryptEmail(email), coarse(lat), coarse(lng),
    (country || '').slice(0, 2).toUpperCase() || null, (region || '').slice(0, 80) || null,
    JSON.stringify(Array.isArray(families) ? families.slice(0, 12) : []),
    JSON.stringify(Array.isArray(skills) ? skills.slice(0, 12) : []));
  return true;
}

// The full list, DECRYPTED — for the admin room only (server.js gates it behind the maintenance key).
export function listVolunteers() {
  return all('SELECT id,created_at,email_enc,country,region,lat,lng,families,skills FROM volunteers WHERE hidden=0 ORDER BY id DESC LIMIT 5000')
    .map(v => {
      let families = [], skills = [];
      try { families = JSON.parse(v.families || '[]'); } catch {}
      try { skills = JSON.parse(v.skills || '[]'); } catch {}
      return { id: v.id, created_at: v.created_at, email: decryptEmail(v.email_enc) || '(unreadable)',
        country: v.country, region: v.region, families, skills };
    });
}

// Public, aggregate-only social proof for the signup page. NEVER exposes emails or precise location.
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
