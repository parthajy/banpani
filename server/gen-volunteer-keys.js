// Generate the volunteer-registry keypair. Run this OFFLINE (your laptop), once.
//   node server/gen-volunteer-keys.js /path/to/output-dir
// It writes two files:
//   volunteer-public.pem  -> commit this / put it on the server. The server can ONLY encrypt with it.
//   volunteer-private.pem -> KEEP THIS OFFLINE. Never commit it, never put it on the server. It is the
//                            ONLY thing that can ever decrypt a volunteer's email. Lose it = the list is
//                            unreadable forever (which is the point — no contact lives online).
import { generateKeyPairSync } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
const dir = process.argv[2] || '.';
const { publicKey, privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 3072,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});
writeFileSync(join(dir, 'volunteer-public.pem'), publicKey);
writeFileSync(join(dir, 'volunteer-private.pem'), privateKey);
console.log('Wrote volunteer-public.pem (safe to commit) and volunteer-private.pem (KEEP OFFLINE) to', dir);
