// Faux GitHub pour la page Installer : réponses de l'API REST (avec les en-têtes CORS), secret rouvert avec la clé
// privée du faux dépôt, lancements du robot qui avancent d'une étape à chaque lecture. Utilisé par page.mjs.
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const nacl = require("../../site/vendor/tweetnacl-1.0.3.min.js");
const scelle = require("../../site/installer/scelle.js")(nacl);
export const ETAPES = ["Set up job", "Run actions/checkout@v4", "Créer la base", "Installer les tables", "Régler la connexion", "Créer ton compte", "Installer les notifications et le bouton Mettre à jour", "Brancher le site", "Préparer le site", "Run actions/configure-pages@v5", "Run actions/upload-pages-artifact@v3", "Mettre en ligne", "Ranger les clés", "Complete job"];

export function fauxGitHub({ depotPris = false, echecs = [] } = {}) {
  const cles = nacl.box.keyPair();
  const g = { appels: [], secrets: [], vars: {}, runs: [], depot: depotPris ? "pris" : null, contenus: 0, echecs: [...echecs] };
  g.ouvrir = (b64) => { const c = Buffer.from(b64, "base64"), epk = c.subarray(0, 32); const n = scelle.blake2b(new Uint8Array(Buffer.concat([epk, Buffer.from(cles.publicKey)])), 24); const m = nacl.box.open(new Uint8Array(c.subarray(32)), n, new Uint8Array(epk), cles.secretKey); return m && JSON.parse(Buffer.from(m).toString("utf8")); };
  g.route = async (route) => {
    const req = route.request(), u = new URL(req.url()), p = u.pathname, m = req.method();
    const H = { "access-control-allow-origin": "*", "access-control-allow-headers": "authorization, content-type, accept", "access-control-allow-methods": "GET, POST, PUT, PATCH, DELETE", "access-control-expose-headers": "x-oauth-scopes" };
    if (m === "OPTIONS") return route.fulfill({ status: 204, headers: H });
    const rep = (status, body, extra = {}) => route.fulfill({ status, headers: { ...H, "content-type": "application/json", ...extra }, body: body === undefined ? "" : JSON.stringify(body) });
    const auth = req.headers().authorization || "", corps = req.postData() ? JSON.parse(req.postData()) : null;
    g.appels.push(`${m} ${p}`);
    if (p === "/user") {
      if (auth === "Bearer ghp_bon") return rep(200, { login: "Claire-Kedge", avatar_url: "" }, { "x-oauth-scopes": "repo, workflow" });
      if (auth === "Bearer ghp_court") return rep(200, { login: "Claire-Kedge" }, { "x-oauth-scopes": "repo" });
      return rep(401, { message: "Bad credentials" });
    }
    if (auth !== "Bearer ghp_bon") return rep(401, { message: "Bad credentials" });
    const nomDepot = (p.match(/^\/repos\/Claire-Kedge\/([^/]+)/) || [])[1] || "", R = "/repos/Claire-Kedge/" + nomDepot;
    if (p === R && m === "GET") return g.depot === "pris" ? rep(200, { name: nomDepot, fork: false }) : g.depot === nomDepot ? rep(200, { name: nomDepot, fork: true, parent: { full_name: "bonavilien/kedge-plan-com" } }) : rep(404, { message: "Not Found" });
    if (p === "/repos/bonavilien/kedge-plan-com/forks" && m === "POST") { g.fork = corps; g.depot = corps.name; return rep(202, { name: corps.name, full_name: "Claire-Kedge/" + corps.name }); }
    if (p === `${R}/contents/.github/workflows/installer.yml`) return ++g.contenus > 2 ? rep(200, { name: "installer.yml" }) : rep(404, { message: "Not Found" });
    if (p === `${R}/actions/permissions` && m === "PUT") { g.actions = corps; return rep(204); }
    if (/\/actions\/workflows\/(installer|pages)\.yml\/enable$/.test(p) && m === "PUT") return rep(204);
    if (p === `${R}/pages` && m === "POST") { g.pages = corps; return rep(201, {}); }
    let x = p.match(/\/actions\/variables(?:\/(\w+))?$/);
    if (x && m === "PATCH") { if (!(x[1] in g.vars)) return rep(404, { message: "Not Found" }); g.vars[x[1]] = corps.value; return rep(204); }
    if (x && m === "POST") { g.vars[corps.name] = corps.value; return rep(201, {}); }
    if (p === `${R}/actions/secrets/public-key`) return rep(200, { key_id: "k-42", key: Buffer.from(cles.publicKey).toString("base64") });
    if (p === `${R}/actions/secrets/KPLAN_INSTALLATION` && m === "PUT") { g.secrets.push({ ...corps, clair: g.ouvrir(corps.encrypted_value) }); return rep(201, {}); }
    if (p === `${R}/actions/workflows/installer.yml/dispatches` && m === "POST") { g.runs.push({ id: 100 + g.runs.length, created_at: new Date().toISOString(), html_url: `https://github.com${R}/actions/runs/${100 + g.runs.length}`, vu: 0, rate: g.echecs.shift() }); return rep(204); }
    if (p === `${R}/actions/workflows/installer.yml/runs`) return rep(200, { workflow_runs: [...g.runs].reverse().map(({ id, created_at, html_url }) => ({ id, created_at, html_url })) });
    x = p.match(/\/actions\/runs\/(\d+)(\/jobs)?$/);
    if (x) {
      const run = g.runs.find((r) => r.id === +x[1]), fin = run.rate ? ETAPES.indexOf(run.rate) : ETAPES.length;
      if (x[2]) { run.vu++; }
      const k = Math.min(run.vu, fin);
      const steps = ETAPES.map((name, i) => ({ name, status: i < k || (run.rate && i === fin && run.vu > fin) ? "completed" : i === k ? "in_progress" : "queued", conclusion: i < k ? "success" : run.rate && i === fin && run.vu > fin ? "failure" : null }));
      const fini = run.rate ? run.vu > fin : run.vu >= ETAPES.length;
      if (x[2]) return rep(200, { jobs: [{ id: 9000 + run.id, steps }] });
      return rep(200, { status: fini ? "completed" : "in_progress", conclusion: fini ? (run.rate ? "failure" : "success") : null });
    }
    if (/\/check-runs\/\d+\/annotations$/.test(p)) return rep(200, [{ annotation_level: "failure", message: "Ton compte Supabase a déjà ses 2 projets gratuits. Mets-en un en pause (ou supprime-le) sur supabase.com, puis relance." }, { annotation_level: "failure", message: "Process completed with exit code 1." }]);
    return rep(404, { message: `inconnu ${m} ${p}` });
  };
  return g;
}

