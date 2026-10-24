// Teste la fonction push sous Deno : une fausse API Supabase et deux faux services push (un actif, un expiré),
// puis déchiffre la notification reçue comme le ferait le téléphone.
// Deno.serve écoute sur le port 8000.
// node test/push/run.mjs <dossier contenant node_modules avec deno, web-push, http_ece>
import http from "http";
import https from "https";
import fs from "fs";
import os from "os";
import { execFileSync } from "child_process";
import crypto from "crypto";
import path from "path";
import { spawn } from "child_process";
import { createRequire } from "module";
const deps = path.resolve(process.argv[2]);
const require = createRequire(path.join(deps, "x.js"));
const webpush = require("web-push"), ece = require("http_ece");
const here = path.dirname(new URL(import.meta.url).pathname);
const b64u = (b) => Buffer.from(b).toString("base64url");

const vapid = webpush.generateVAPIDKeys();
const phone = crypto.createECDH("prime256v1"); phone.generateKeys();
const auth = crypto.randomBytes(16);
const PORT = 8791, PUSH = 8793, A = "aaaaaaaa-0000-0000-0000-000000000001", B = "bbbbbbbb-0000-0000-0000-000000000002";
const outbox = [
  { id: 1, user_id: A, title: "J-15 : CP de rentrée", body: "As-tu besoin d'éléments ?", url: "#afaire", sent_at: null, error: null },
  { id: 2, user_id: B, title: "Nouvelle action", body: "Julien : Reel alumni", url: "#item=x", sent_at: null, error: null },
];
let subs = [
  { id: 10, user_id: A, endpoint: `https://localhost:${PUSH}/push/ok`, p256dh: b64u(phone.getPublicKey()), auth: b64u(auth) },
  { id: 11, user_id: A, endpoint: `https://localhost:${PUSH}/push/gone`, p256dh: b64u(phone.getPublicKey()), auth: b64u(auth) },
];
const received = [];
// les services push parlent https : un certificat jetable pour le faux service
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "kplan-push-"));
execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", `${tmp}/k.pem`, "-out", `${tmp}/c.pem`, "-days", "1", "-subj", "/CN=localhost", "-addext", "subjectAltName=DNS:localhost"], { stdio: "ignore" });
const pushServer = https.createServer({ key: fs.readFileSync(`${tmp}/k.pem`), cert: fs.readFileSync(`${tmp}/c.pem`) }, (req, res) => {
  const body = []; req.on("data", (c) => body.push(c)); req.on("end", () => {
    if (req.url === "/push/ok") { received.push({ headers: req.headers, body: Buffer.concat(body) }); res.writeHead(201); return res.end(); }
    res.writeHead(410); res.end();
  });
}).listen(PUSH);
// Deno fait confiance au certificat jetable en plus des autorités habituelles
fs.writeFileSync(`${tmp}/ca.pem`, (fs.existsSync("/root/.ccr/ca-bundle.crt") ? fs.readFileSync("/root/.ccr/ca-bundle.crt", "utf8") + "\n" : "") + fs.readFileSync(`${tmp}/c.pem`, "utf8"));
const eqOf = (q, k) => { const v = q.get(k); return v && v.startsWith("eq.") ? v.slice(3) : null; };
const server = http.createServer((req, res) => {
  const u = new URL(req.url, "http://x"); let body = [];
  req.on("data", (c) => body.push(c)); req.on("end", () => {
    body = Buffer.concat(body);
    const json = (x, s = 200) => { res.writeHead(s, { "content-type": "application/json" }); res.end(JSON.stringify(x)); };
    if (u.pathname === "/rest/v1/outbox" && req.method === "PATCH") {
      const patch = JSON.parse(body.toString()), id = eqOf(u.searchParams, "id");
      const rows = id ? outbox.filter((r) => r.id === +id) : outbox.filter((r) => r.sent_at === null);
      rows.forEach((r) => Object.assign(r, patch));
      return json(rows.map(({ id, user_id, title, body, url }) => ({ id, user_id, title, body, url })));
    }
    if (u.pathname === "/rest/v1/push_subs" && req.method === "GET") {
      const ids = (u.searchParams.get("user_id") || "").replace(/^in\.\(|\)$/g, "").split(",").map((s) => s.replace(/"/g, ""));
      return json(subs.filter((s) => ids.includes(s.user_id)));
    }
    if (u.pathname === "/rest/v1/push_subs" && req.method === "DELETE") { subs = subs.filter((s) => s.id !== +eqOf(u.searchParams, "id")); res.writeHead(204); return res.end(); }
    json({ message: "inconnu " + req.method + " " + u.pathname }, 404);
  });
}).listen(PORT);

const env = { ...process.env, SUPABASE_URL: `http://localhost:${PORT}`, SUPABASE_SERVICE_ROLE_KEY: "cle-de-test", VAPID_PUBLIC_KEY: vapid.publicKey, VAPID_PRIVATE_KEY: vapid.privateKey, CRON_SECRET: "secret-de-test", DENO_CERT: `${tmp}/ca.pem`, NODE_EXTRA_CA_CERTS: `${tmp}/c.pem`, NO_PROXY: "localhost,127.0.0.1" };
const deno = spawn(path.join(deps, "node_modules/.bin/deno"), ["run", "-A", path.join(here, "../../supabase/functions/push/index.ts")], { env, stdio: ["ignore", "pipe", "pipe"] });
process.on("exit", () => deno.kill());
let log = ""; deno.stdout.on("data", (d) => (log += d)); deno.stderr.on("data", (d) => (log += d));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let up = false;
for (let i = 0; i < 120 && !up; i++) { await wait(1000); try { await fetch("http://localhost:8000/"); up = true; } catch (e) {} }
if (!up) { console.log("Deno n'a pas démarré :\n" + log); process.exit(1); }
let fails = 0; const ok = (c, m) => { console.log(`${c ? "OK  " : "FAIL"} ${m}`); if (!c) fails++; };
const r0 = await fetch("http://localhost:8000/", { method: "POST", headers: { "x-cron-secret": "mauvais" } });
ok(r0.status === 401, "mauvais secret refusé");
const r1 = await fetch("http://localhost:8000/", { method: "POST", headers: { "x-cron-secret": "secret-de-test" } });
const out = await r1.json();
console.log("     réponse :", JSON.stringify(out));
ok(out.rows === 2 && out.sent === 1, "deux messages pris, un envoyé");
ok(outbox.every((r) => r.sent_at), "messages marqués envoyés");
console.log("     erreurs :", JSON.stringify(outbox.map((r) => r.error)));
ok(outbox[1].error === "aucun appareil abonné", "sans appareil : noté");
ok(outbox[0].error === "abonnement expiré" && !subs.some((s) => s.id === 11), "abonnement expiré supprimé");
ok(received.length === 1 && /^vapid t=/.test(received[0].headers.authorization || ""), "envoi signé VAPID");
const clear = ece.decrypt(received[0].body, { version: "aes128gcm", privateKey: phone, authSecret: auth });
const msg = JSON.parse(clear.toString());
ok(msg.title === "J-15 : CP de rentrée" && msg.url === "#afaire", "le téléphone déchiffre : " + clear.toString());
const r2 = await fetch("http://localhost:8000/", { method: "POST", headers: { "x-cron-secret": "secret-de-test" } });
ok((await r2.json()).rows === 0, "deuxième appel : rien en attente");
deno.kill(); server.close(); pushServer.close();
console.log(fails ? `${fails} échec(s)` : "tout est bon");
process.exit(fails ? 1 : 0);
