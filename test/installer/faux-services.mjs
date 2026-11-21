// Faux Supabase (API de gestion + Auth) et faux GitHub, pour tester scripts/installer.mjs sans compte réel.
// Les requêtes SQL partent vraiment dans une base Postgres locale (psql), préparée comme une base Supabase neuve.
// Usage : import { demarrer } from "./faux-services.mjs" ; const f = await demarrer({ base: "kplan_installer" })
import http from "http";
import { spawnSync } from "child_process";

export const PSQL = (process.env.PSQL || "psql -h /tmp/kplan-pgdata -p 54329 -U postgres").split(" ");
const psql = (db, args, input) => spawnSync(PSQL[0], [...PSQL.slice(1), "-X", "-q", "-v", "ON_ERROR_STOP=1", ...(db ? ["-d", db] : []), ...args], { input, encoding: "utf8" });

/* une base locale « comme Supabase » : rôles, auth, coffre, pg_cron et pg_net imités */
export function baseNeuve(db) {
  let r = psql("", ["-c", `drop database if exists ${db}`, "-c", `create database ${db}`]); if (r.status) throw new Error(r.stderr);
  for (const f of ["test/db/supabase-stub.sql", "test/db/planif-stub.sql"]) { r = psql(db, ["-f", f]); if (r.status && !/already exists/.test(r.stderr)) throw new Error(r.stderr); }
  r = psql(db, ["-c", `create table vault.secrets (id uuid primary key default gen_random_uuid(), name text unique, secret text);
    create function vault.create_secret(s text, n text) returns uuid language sql as $$ insert into vault.decrypted_secrets values (n, s) on conflict (name) do update set decrypted_secret = excluded.decrypted_secret; insert into vault.secrets (name, secret) values (n, s) returning id $$;
    create function vault.update_secret(i uuid, s text) returns void language sql as $$ update vault.decrypted_secrets d set decrypted_secret = s from vault.secrets v where v.id = i and d.name = v.name; update vault.secrets set secret = s where id = i $$;`]);
  if (r.status) throw new Error(r.stderr);
}
export function requete(db, q) {
  // pg_cron et pg_net n'existent pas en local : planif-stub.sql les imite
  q = q.split("\n").filter((l) => !/^\s*create extension/i.test(l)).join("\n");
  const seul = /^\s*select\b/i.test(q) && !q.trim().replace(/;\s*$/, "").includes(";");
  const r = seul ? psql(db, ["-At", "-c", `select coalesce(json_agg(t), '[]') from (${q.trim().replace(/;\s*$/, "")}) t`]) : psql(db, ["-f", "-"], q);
  if (r.status) return { erreur: (r.stderr || "").trim() };
  return { lignes: seul ? JSON.parse(r.stdout.trim() || "[]") : [] };
}

export async function demarrer({ base = "kplan_installer", orgs = [{ id: "perso", slug: "perso", name: "Perso" }], regionSelection = true, limite = false, supabase = "sbp_" + "0123456789abcdef".repeat(2) + "01234567", github = "ghp_test", sansCles = false } = {}) {
  const f = { orgs, projets: [], auth: null, secrets: {}, fonctions: {}, vars: {}, secretsGh: { KPLAN_INSTALLATION: 1 }, appels: [], comptes: 0, base };
  const lire = (req) => new Promise((ok) => { const c = []; req.on("data", (d) => c.push(d)); req.on("end", () => ok(Buffer.concat(c))); });
  const json = (res, code, o) => { res.writeHead(code, { "content-type": "application/json" }); res.end(o === undefined ? "" : JSON.stringify(o)); };
  const srv = http.createServer(async (req, res) => {
    const u = new URL(req.url, "http://x"), p = u.pathname, corps = await lire(req), m = req.method;
    f.appels.push(`${m} ${p}`);
    const j = () => { try { return JSON.parse(corps.toString() || "null"); } catch (e) { return null; } };
    /* ---------- Supabase, API de gestion ---------- */
    if (p.startsWith("/sb/")) {
      if (req.headers.authorization !== `Bearer ${supabase}`) return json(res, 401, { message: "Unauthorized" });
      const q = p.slice(3);
      if (q === "/v1/organizations" && m === "GET") return json(res, 200, f.orgs);
      if (q === "/v1/projects" && m === "GET") return json(res, 200, f.projets.map((x) => ({ ...x })));
      if (q === "/v1/projects" && m === "POST") {
        const b = j();
        if (!b.name || !b.db_pass || !b.organization_slug) return json(res, 400, { message: "name, db_pass, organization_slug required" });
        if (limite) return json(res, 400, { message: "The following organization members have reached their maximum limits for the number of active free projects" });
        if (b.region_selection && !regionSelection) return json(res, 400, { message: "property region_selection should not exist" });
        const region = b.region_selection ? b.region_selection.code : b.region;
        const pr = { ref: "abcdefghijklmnopqrst", id: "abcdefghijklmnopqrst", name: b.name, organization_slug: b.organization_slug, region, status: "COMING_UP", vus: 0 };
        f.projets.push(pr); return json(res, 201, { ...pr });
      }
      const mm = q.match(/^\/v1\/projects\/([a-z]+)(\/.*)?$/); const pr = mm && f.projets.find((x) => x.ref === mm[1]);
      if (!pr) return json(res, 404, { message: "project not found" });
      const s = mm[2] || "";
      if (!s && m === "GET") { if (++pr.vus > 2) pr.status = "ACTIVE_HEALTHY"; return json(res, 200, { ...pr }); }
      if (s === "/database/query" && m === "POST") { const r = requete(base, j().query); return r.erreur ? json(res, 400, { message: r.erreur }) : json(res, 201, r.lignes); }
      if (s === "/config/auth" && m === "PATCH") { f.auth = j(); return json(res, 200, f.auth); }
      if (s === "/api-keys" && m === "GET") return json(res, 200, sansCles ? [] : [
        { name: "anon", type: "legacy", api_key: "eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoiYW5vbiJ9.x" },
        { name: "service_role", type: "legacy", api_key: "eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.y" },
        { name: "default", type: "publishable", api_key: "sb_publishable_abc" },
        { name: "default", type: "secret", api_key: "sb_secret_xyz" }]);
      if (s === "/api-keys" && m === "POST") { sansCles = false; return json(res, 201, {}); }
      if (s === "/secrets" && m === "POST") { for (const x of j()) f.secrets[x.name] = x.value; return json(res, 201, {}); }
      if (s.startsWith("/functions/deploy") && m === "POST") {
        const t = corps.toString(), slug = u.searchParams.get("slug");
        const meta = (t.match(/name="metadata"\r\n\r\n([^\r]*)/) || [])[1];
        if (!/multipart\/form-data/.test(req.headers["content-type"] || "") || !meta || !/name="file"; filename="index.ts"/.test(t)) return json(res, 400, { message: "bad deploy" });
        f.fonctions[slug] = { ...JSON.parse(meta), taille: t.length };
        return json(res, 201, { slug, verify_jwt: JSON.parse(meta).verify_jwt });
      }
      return json(res, 404, { message: `inconnu ${m} ${q}` });
    }
    /* ---------- Supabase Auth du projet ---------- */
    const ma = p.match(/^\/auth-([a-z]+)\/auth\/v1\/admin\/users(?:\/([0-9a-f-]+))?$/);
    if (ma) {
      if (req.headers.apikey !== "sb_secret_xyz") return json(res, 401, { message: "Invalid API key" });
      const b = j();
      if (m === "PUT") { f.mdp = b.password; return json(res, 200, { id: ma[2] }); }
      if (!b.email || !b.password || b.email_confirm !== true) return json(res, 400, { message: "email, password, email_confirm" });
      const deja = requete(base, `select id from auth.users where lower(email) = lower('${b.email.replace(/'/g, "''")}')`).lignes;
      if (deja.length) return json(res, 422, { code: "email_exists", msg: "A user with this email address has already been registered" });
      const r = requete(base, `insert into auth.users (email) values ('${b.email.replace(/'/g, "''")}');`);
      if (r.erreur) return json(res, 500, { message: r.erreur });
      f.comptes++; f.mdp = b.password; return json(res, 200, { email: b.email });
    }
    /* ---------- GitHub ---------- */
    if (p.startsWith("/gh/")) {
      if (req.headers.authorization !== `Bearer ${github}`) return json(res, 401, { message: "Bad credentials" });
      const q = p.slice(3);
      let g = q.match(/^\/repos\/([^/]+)\/([^/]+)\/actions\/variables(?:\/(\w+))?$/);
      if (g && m === "PATCH") { if (!(g[3] in f.vars)) return json(res, 404, { message: "Not Found" }); f.vars[g[3]] = j().value; return json(res, 204); }
      if (g && m === "POST") { const b = j(); f.vars[b.name] = b.value; return json(res, 201, {}); }
      g = q.match(/^\/repos\/([^/]+)\/([^/]+)\/actions\/secrets\/(\w+)$/);
      if (g && m === "DELETE") { if (!f.secretsGh[g[3]]) return json(res, 404, { message: "Not Found" }); delete f.secretsGh[g[3]]; return json(res, 204); }
      return json(res, 404, { message: `inconnu ${m} ${q}` });
    }
    json(res, 404, {});
  });
  await new Promise((ok) => srv.listen(0, "127.0.0.1", ok));
  const port = srv.address().port;
  f.env = { KPLAN_API_SUPABASE: `http://127.0.0.1:${port}/sb`, KPLAN_API_GITHUB: `http://127.0.0.1:${port}/gh`, KPLAN_HOTE: `http://127.0.0.1:${port}/auth-{ref}` };
  f.fermer = () => new Promise((ok) => srv.close(ok));
  f.regler = (o) => { if ("limite" in o) limite = o.limite; if ("regionSelection" in o) regionSelection = o.regionSelection; if ("sansCles" in o) sansCles = o.sansCles; if ("orgs" in o) f.orgs = o.orgs; };
  return f;
}
