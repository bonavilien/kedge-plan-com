// Vérifie la fonction « mise-a-jour » sans réseau : faux GitHub, fausse base.
// Usage : node --experimental-strip-types test/maj/fonction.mjs   (Node 22.6 ou plus : il lit le TypeScript en retirant les types)
import fs from "fs";
import os from "os";
import path from "path";
import assert from "assert/strict";
import { fileURLToPath, pathToFileURL } from "url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "kplan-maj-"));
const f = path.join(tmp, "index.mts");
fs.copyFileSync(path.join(ROOT, "supabase/functions/mise-a-jour/index.ts"), f);
const { createHandler, plusRecente, nouveautes, FONCTION } = await import(pathToFileURL(f));

let ok = 0;
const check = (c, m) => { assert.ok(c, m); ok++; };

/* versions */
check(plusRecente("2.10.0", "2.9.1"), "2.10 > 2.9.1");
check(!plusRecente("2.1.0", "2.1.0"), "égales");
check(plusRecente("2.0.0", "2.0.0-beta.14"), "finale > bêta");
check(plusRecente("2.0.0-beta.10", "2.0.0-beta.9"), "bêta 10 > bêta 9");
const vjs = fs.readFileSync(path.join(ROOT, "site/js/version.js"), "utf8");
const nv = nouveautes(vjs, "2.0.3");
check(nv.length >= 1 && nv.every((x) => plusRecente(x.n, "2.0.3")) && nv[0].notes.length > 0, "nouveautés depuis 2.0.3 lues dans version.js");

/* faux GitHub */
function github(o = {}) {
  const calls = [];
  const up = { depot: "origine/plan", branche: "main" };
  const files = {
    "copie/plan:site/version.json": JSON.stringify({ version: o.ici || "2.1.0" }),
    "origine/plan:site/version.json": JSON.stringify({ version: o.amont || "2.2.0" }),
    "origine/plan:site/js/version.js": `window.KP.VERSIONS = [\n  { n: "2.2.0", date: "2026-11-19", notes: ["Mise à jour en un clic"] },\n  { n: "2.1.0", date: "2026-11-17", notes: ["Avant"] },\n];`,
    "origine/plan:supabase/functions/mise-a-jour/index.ts": "export const FONCTION = 1;",
    "origine/plan:supabase/migrations/0001_schema.sql": "create table a();",
    "origine/plan:supabase/migrations/0027_nouveau.sql": "create table b();",
    "origine/plan:supabase/migrations/0028_encore.sql": o.casse ? "casse;" : "create table c();",
  };
  const res = (status, body) => new Response(typeof body === "string" ? body : JSON.stringify(body), { status });
  const fetch = async (url, init = {}) => {
    const u = new URL(url), p = u.pathname, method = init.method || "GET";
    calls.push(`${method} ${p}`);
    assert.equal(init.headers.authorization, "Bearer jeton-test");
    if (o.jetonFaux) return res(401, { message: "Bad credentials" });
    if (p === "/repos/copie/plan") return res(200, o.origine ? { full_name: "copie/plan" } : { full_name: "copie/plan", parent: { full_name: up.depot, default_branch: up.branche } });
    if (p === "/repos/origine/plan/contents/supabase/migrations") return res(200, ["0001_schema.sql", "0027_nouveau.sql", "0028_encore.sql", "LISEZMOI.md"].map((name) => ({ name, type: "file" })));
    let m = /^\/repos\/([^/]+\/[^/]+)\/contents\/(.+)$/.exec(p);
    if (m) { const k = `${m[1]}:${decodeURIComponent(m[2])}`; return k in files ? res(200, files[k]) : res(404, { message: "Not Found" }); }
    if (/^\/repos\/origine\/plan\/compare\//.test(p)) return res(200, { behind_by: 3, ahead_by: 0 });
    if (p === "/repos/copie/plan/merge-upstream") { if (o.conflit) return res(409, { message: "conflict" }); files["copie/plan:site/version.json"] = files["origine/plan:site/version.json"]; return res(200, { merge_type: "fast-forward", message: "ok" }); }
    if (p === "/repos/copie/plan/actions/workflows/pages.yml/dispatches") return new Response(null, { status: 204 });
    return res(404, { message: "Not Found" });
  };
  return { fetch, calls };
}
function make(o = {}) {
  const g = github(o), faites = ["0001_schema.sql", ...(o.faites || [])], applied = [], coffre = { ...(o.coffre || {}) }, fonds = [];
  const env = { GITHUB_TOKEN: "jeton-test", GITHUB_REPO: o.repo ?? "copie/plan", GITHUB_BRANCH: "", SUPABASE_URL: "https://abcd.supabase.co/" };
  const handler = createHandler({
    env: (k) => env[k] || "",
    fetch: g.fetch,
    pilote: async (jwt) => (jwt === "pilote" ? { id: "u1" } : jwt === "service" ? "pas-pilote" : null),
    base: {
      faites: async () => [...faites],
      appliquer: async (nom, sql) => { if (sql.startsWith("casse")) throw new Error("syntax error at or near \"casse\""); applied.push(nom); faites.push(nom); },
      secretAuto: async () => coffre.kplan_maj_secret || "",
      inscrire: async (url) => { if (o.coffrePanne) throw new Error("coffre fermé"); coffre.kplan_maj_url ??= url; coffre.kplan_maj_secret ??= "s".repeat(64); },
    },
    fond: o.fond ? (p) => fonds.push(p) : undefined,
  });
  const call = async (action, jwt = "pilote", extra = {}) => { const r = await handler(new Request("https://x/functions/v1/mise-a-jour", { method: "POST", headers: { ...(jwt ? { authorization: `Bearer ${jwt}` } : {}), ...extra }, body: JSON.stringify({ action }) })); return { status: r.status, body: await r.json(), cors: r.headers.get("access-control-allow-origin") }; };
  return { call, applied, g, handler, coffre, fonds };
}

{ const { call } = make(); const r = await call("etat", ""); check(r.status === 401 && r.cors === "*", "sans connexion : 401, avec CORS"); }
{ const { call } = make(); const r = await call("etat", "service"); check(r.status === 403 && /pilote/.test(r.body.message), "un service ne peut pas"); }
{ const { handler } = make(); const r = await handler(new Request("https://x", { method: "OPTIONS" })); check(r.status === 200 && r.headers.get("access-control-allow-headers").includes("authorization"), "pré-requête CORS"); }
{
  const { call } = make();
  const r = await call("etat");
  check(r.status === 200, "état : 200");
  check(r.body.version.ici === "2.1.0" && r.body.version.amont === "2.2.0", "état : versions ici et à l'origine");
  check(JSON.stringify(r.body.base) === JSON.stringify(["0027_nouveau.sql", "0028_encore.sql"]), "état : scripts de base manquants, dans l'ordre, sans le .md");
  check(r.body.nouveautes.length === 1 && r.body.nouveautes[0].n === "2.2.0", "état : nouveautés depuis la version de la copie");
  check(r.body.retard === 3 && r.body.aJour === false && r.body.fonction === FONCTION && r.body.fonctionAmont === 1, "état : retard, pas à jour, version de la fonction");
}
{
  const { call, applied, g } = make();
  const b = await call("base");
  check(b.status === 200 && JSON.stringify(applied) === JSON.stringify(["0027_nouveau.sql", "0028_encore.sql"]), "base : scripts appliqués dans l'ordre");
  const b2 = await call("base");
  check(b2.body.faites.length === 0, "base : relancer ne refait rien");
  const c = await call("code");
  check(c.status === 200 && c.body.fusion === "fast-forward" && c.body.publication === true && c.body.version === "2.2.0", "code : récupéré et publication relancée");
  check(g.calls.includes("POST /repos/copie/plan/merge-upstream"), "code : Sync fork appelé sur la copie");
  const e = await call("etat");
  check(e.body.aJour === true && e.body.base.length === 0, "après : à jour");
}
{ const { call, applied } = make({ casse: true }); const r = await call("base"); check(r.status === 500 && r.body.erreur === "script" && /0028_encore/.test(r.body.message) && applied.length === 1, "un script cassé s'arrête là et le dit"); }
{ const { call } = make({ conflit: true }); const r = await call("code"); check(r.status === 409 && /Sync fork/.test(r.body.message), "copie modifiée à la main : 409 expliqué"); }
{ const { call } = make({ origine: true }); const r = await call("etat"); check(r.body.origine === true, "dépôt d'origine reconnu"); const c = await call("code"); check(c.status === 400, "l'origine ne se met pas à jour elle-même"); }
{ const { call } = make({ jetonFaux: true }); const r = await call("etat"); check(r.status === 502 && r.body.erreur === "jeton", "jeton refusé : dit clairement"); }
{ const { call } = make({ repo: "" }); const r = await call("etat"); check(r.status === 500 && r.body.erreur === "secrets", "secrets manquants : dit lesquels"); }

/* la mise à jour de nuit : aucune personne, un secret du coffre */
{
  const { call, coffre } = make();
  const r = await call("etat");
  check(r.body.auto === true && coffre.kplan_maj_url === "https://abcd.supabase.co/functions/v1/mise-a-jour" && coffre.kplan_maj_secret.length === 64, "un pilote ouvre Réglages : la fonction inscrit son adresse et un secret dans le coffre");
  coffre.kplan_maj_secret = "deja-la"; await call("etat");
  check(coffre.kplan_maj_secret === "deja-la", "inscription : rien n'est remplacé une fois en place");
}
{ const { call } = make({ coffrePanne: true }); const r = await call("etat"); check(r.status === 200 && r.body.auto === false && r.body.version.ici === "2.1.0", "coffre en panne : l'état s'affiche quand même, sans la mise à jour de nuit"); }
{ const { call, coffre } = make({ origine: true }); const r = await call("etat"); check(r.body.origine === true && !("kplan_maj_url" in coffre), "l'appli d'origine ne s'inscrit pas : elle ne se met pas à jour"); }
{
  const { call, applied, g } = make({ coffre: { kplan_maj_secret: "x".repeat(64) } });
  const r = await call("auto", "", { "x-kplan-auto": "x".repeat(64) });
  check(r.status === 200 && JSON.stringify(applied) === JSON.stringify(["0027_nouveau.sql", "0028_encore.sql"]) && r.body.fusion === "fast-forward" && r.body.version === "2.2.0", "de nuit : la base puis le code, sans compte ni clic");
  check(g.calls.indexOf("POST /repos/copie/plan/merge-upstream") > g.calls.lastIndexOf("GET /repos/origine/plan/contents/supabase/migrations/0028_encore.sql"), "de nuit : le code arrive après la base");
  const r2 = await call("auto", "", { "x-kplan-auto": "x".repeat(64) });
  check(r2.status === 200 && r2.body.faites.length === 0, "de nuit, déjà à jour : rien ne bouge");
}
{
  const { call, applied } = make({ coffre: { kplan_maj_secret: "x".repeat(64) } });
  for (const faux of ["y".repeat(64), "x", ""]) { const r = await call("auto", "", { "x-kplan-auto": faux }); check(r.status === 401, `de nuit, mauvais secret « ${faux.slice(0, 4)}… » : refusé`); }
  check(applied.length === 0, "mauvais secret : rien n'est appliqué");
}
{ const { call } = make(); const r = await call("auto", "", { "x-kplan-auto": "" }); check(r.status === 401, "coffre vide : la mise à jour de nuit est refusée, même avec un secret vide"); }
{ const { call } = make(); const r = await call("auto"); check(r.status === 400, "un pilote ne passe pas par « auto » (il a ses boutons)"); }
{ const { call, applied } = make({ casse: true, coffre: { kplan_maj_secret: "x".repeat(64) } }); const r = await call("auto", "", { "x-kplan-auto": "x".repeat(64) }); check(r.status === 500 && /0028_encore/.test(r.body.message) && applied.length === 1, "de nuit, un script cassé : on s'arrête avant le code"); }
{
  const { call, fonds, applied } = make({ fond: true, coffre: { kplan_maj_secret: "x".repeat(64) } });
  const r = await call("auto", "", { "x-kplan-auto": "x".repeat(64) });
  check(r.status === 202 && fonds.length === 1, "dans Supabase : réponse immédiate, le travail continue en tâche de fond");
  await fonds[0];
  check(applied.length === 2, "tâche de fond terminée : base à jour");
}
check(FONCTION === 2, "FONCTION monte à 2 : l'appli propose de recoller la fonction");

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`Fonction mise-a-jour : ${ok} vérifications, tout est bon`);
