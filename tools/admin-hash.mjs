// Prints the two hashes the game accepts for an admin passcode (WebCrypto SHA-256, and the
// fallback for browsers without WebCrypto). Paste them into ADMIN_HASHES in src/26-admin.js.
// Usage: node tools/admin-hash.mjs "your passcode"
import { readFileSync } from 'node:fs';
const code = String(process.argv[2] || '').trim().toLowerCase();
if (!code) { console.error('usage: node tools/admin-hash.mjs "passcode"'); process.exit(2); }
const src = readFileSync(new URL('../src/26-accounts.js', import.meta.url), 'utf8');
const { pinHash } = new Function(`${src}\nreturn { pinHash };`)();
console.log(JSON.stringify([await pinHash('admin', code, 's256'), await pinHash('admin', code, 'c53')]));
