// Le chiffrement des clés dans la page Installer (site/installer/scelle.js) : BLAKE2b comparé à celui de Python
// (hashlib), puis une « sealed box » rouverte comme le fait GitHub (libsodium : crypto_box_seal_open).
// Usage : node test/installer/scelle.mjs
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
const require = createRequire(import.meta.url);
const nacl = require("../../site/vendor/tweetnacl-1.0.3.min.js");
const S = require("../../site/installer/scelle.js")(nacl);
let bad = 0;
const ok = (c, label) => { console.log((c ? "ok   " : "FAIL ") + label); if (!c) bad++; };
let tous = true;
for (const n of [0, 1, 64, 127, 128, 129, 256, 1000]) for (const out of [24, 32, 64]) {
  const d = crypto.randomBytes(n);
  const py = execFileSync("python3", ["-c", `import hashlib,sys;print(hashlib.blake2b(bytes.fromhex(sys.argv[1]),digest_size=${out}).hexdigest())`, d.toString("hex")]).toString().trim();
  if (Buffer.from(S.blake2b(new Uint8Array(d), out)).toString("hex") !== py) { tous = false; console.log(`  écart : ${n} octets, sortie ${out}`); }
}
ok(tous, "BLAKE2b identique à celui de Python (24 tailles)");
// crypto_box_seal_open : nonce = BLAKE2b-192(clé éphémère ‖ clé du dépôt), puis crypto_box_open
const depot = nacl.box.keyPair(), clair = JSON.stringify({ supabase: "sbp_x", github: "ghp_y", mdp: "été 2027 ✓" });
const c = Buffer.from(S.pourGitHub(clair, Buffer.from(depot.publicKey).toString("base64")), "base64");
const epk = new Uint8Array(c.subarray(0, 32)), nonce = S.blake2b(new Uint8Array([...epk, ...depot.publicKey]), 24);
const m = nacl.box.open(new Uint8Array(c.subarray(32)), nonce, epk, depot.secretKey);
ok(m && Buffer.from(m).toString("utf8") === clair && c.length === 32 + 16 + Buffer.byteLength(clair), "sealed box : rouverte avec la clé privée du dépôt, accents compris");
ok(S.pourGitHub(clair, Buffer.from(depot.publicKey).toString("base64")) !== S.pourGitHub(clair, Buffer.from(depot.publicKey).toString("base64")), "chaque chiffrement est différent (clé éphémère)");
console.log(bad ? `${bad} échec(s)` : "Chiffrement : tout est bon");
process.exit(bad ? 1 : 0);
