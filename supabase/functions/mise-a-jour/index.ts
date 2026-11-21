// Mise à jour en un clic d'une copie de l'appli (bouton « Mettre à jour » de Réglages > Version).
// Elle tourne dans le Supabase de la copie, jamais dans le navigateur : la clé GitHub et l'accès complet à la base restent ici.
//   « etat » : la version de la copie, celle du dépôt d'origine, ce qui change, les scripts de base qui manquent.
//   « base » : applique dans l'ordre les scripts de supabase/migrations du dépôt d'origine que la base n'a pas encore.
//   « code » : récupère le code du dépôt d'origine dans la copie (« Sync fork » de GitHub), puis relance la publication.
//   « auto » : base puis code, chaque nuit, appelé par la base elle-même (pg_cron, migration 0033) avec le secret
//              du coffre « kplan_maj_secret » dans l'en-tête x-kplan-auto. Aucun clic, aucun compte.
// Sinon, seul un pilote (profiles.chef) peut l'appeler. La base passe avant le code : le site ne charge jamais un code
// qui attend une table absente. À chaque visite d'un pilote, la fonction inscrit son adresse et un secret dans le
// coffre : la mise à jour de nuit démarre donc d'elle-même, même sur une copie installée à la main.
//
// Secrets à ranger dans Supabase (Edge Functions > Secrets) : voir DEPLOYER.md, étape 6.
//   GITHUB_TOKEN   jeton GitHub « fine-grained » limité à la copie : Contents, Workflows et Actions en lecture et écriture
//   GITHUB_REPO    la copie, « compte/nom-du-depot »
//   GITHUB_BRANCH  facultatif, « main » par défaut
// Fournis par Supabase sans rien faire : SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_DB_URL.
//
// Ce fichier tient seul (aucun autre fichier à copier) : il se colle tel quel dans l'éditeur de Supabase.

export const FONCTION = 2; // monte quand cette fonction change : l'appli propose alors de la recoller

type Pilote = { id: string } | null;
type Deps = {
  env: (k: string) => string;
  fetch: typeof fetch;
  pilote: (jwt: string) => Promise<Pilote | "pas-pilote">;
  base: {
    faites: () => Promise<string[]>;
    appliquer: (nom: string, sql: string) => Promise<void>;
    /* la mise à jour de nuit : le secret rangé dans le coffre, et l'inscription de la fonction dans le coffre */
    secretAuto: () => Promise<string>;
    inscrire: (url: string) => Promise<void>;
  };
  /* tâche de fond (EdgeRuntime.waitUntil dans Supabase) : la réponse part tout de suite, le travail continue */
  fond?: (p: Promise<unknown>) => void;
};

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, apikey, content-type, x-client-info, x-kplan-auto",
  "access-control-allow-methods": "POST, OPTIONS",
};
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...CORS, "content-type": "application/json" } });
class Refus extends Error { code: string; status: number; constructor(code: string, message: string, status = 400) { super(message); this.code = code; this.status = status; } }

/* « 2.10.0 » vient après « 2.9.1 » ; « 2.0.0-beta.3 » avant « 2.0.0 » */
export function plusRecente(a: string, b: string): boolean {
  const p = (v: string) => { const [core, pre] = String(v || "0").split("-"); return { n: core.split(".").map((x) => +x || 0), pre: pre ? +(pre.split(".")[1] || 0) : Infinity }; };
  const x = p(a), y = p(b);
  for (let i = 0; i < 3; i++) if ((x.n[i] || 0) !== (y.n[i] || 0)) return (x.n[i] || 0) > (y.n[i] || 0);
  return x.pre > y.pre;
}

/* les nouveautés écrites dans site/js/version.js du dépôt d'origine, plus récentes que la version de la copie */
export function nouveautes(versionJs: string, depuis: string): { n: string; date: string; notes: string[] }[] {
  const out: { n: string; date: string; notes: string[] }[] = [];
  for (const l of versionJs.split("\n")) {
    const m = /^\s*\{ n: "([^"]+)", date: "([^"]+)", notes: (\[.*\]) \},?\s*$/.exec(l);
    if (!m) continue;
    if (!plusRecente(m[1], depuis)) break;
    try { out.push({ n: m[1], date: m[2], notes: JSON.parse(m[3]) }); } catch { out.push({ n: m[1], date: m[2], notes: [] }); }
  }
  return out;
}

export function createHandler(d: Deps) {
  const repo = () => d.env("GITHUB_REPO").trim().replace(/^https:\/\/github\.com\//, "").replace(/\.git$/, "").replace(/\/+$/, "");
  const branche = () => d.env("GITHUB_BRANCH").trim() || "main";

  async function gh(path: string, init: RequestInit = {}, raw = false) {
    const r = await d.fetch("https://api.github.com" + path, {
      ...init,
      headers: {
        authorization: `Bearer ${d.env("GITHUB_TOKEN").trim()}`,
        accept: raw ? "application/vnd.github.raw+json" : "application/vnd.github+json",
        "x-github-api-version": "2022-11-28",
        "user-agent": "plan-de-com-mise-a-jour",
        ...(init.body ? { "content-type": "application/json" } : {}),
      },
    });
    if (r.status === 401) throw new Refus("jeton", "GitHub refuse le jeton : il a expiré ou il est mal recopié (secret GITHUB_TOKEN).", 502);
    if (r.status === 403 || r.status === 404) {
      const t = await r.text();
      throw new Refus("droits", `GitHub refuse l'accès (${r.status}) à ${path.split("?")[0]} : vérifie GITHUB_REPO et les droits du jeton (Contents, Workflows, Actions en lecture et écriture). ${t.slice(0, 160)}`, 502);
    }
    return r;
  }
  const ghJson = async (path: string, init: RequestInit = {}) => { const r = await gh(path, init); const t = await r.text(); let o: any = {}; try { o = t ? JSON.parse(t) : {}; } catch { o = { message: t }; } return { status: r.status, ok: r.ok, o }; };
  const ghTexte = async (depot: string, chemin: string, ref: string) => { const r = await gh(`/repos/${depot}/contents/${chemin}?ref=${encodeURIComponent(ref)}`, {}, true); if (!r.ok) throw new Refus("lecture", `Lecture impossible de ${chemin} dans ${depot} (${r.status}).`, 502); return await r.text(); };

  /* la copie et son dépôt d'origine, tels que GitHub les connaît */
  async function depots() {
    if (!d.env("GITHUB_TOKEN") || !repo()) throw new Refus("secrets", "Il manque les secrets GITHUB_TOKEN et GITHUB_REPO dans Supabase (Edge Functions > Secrets).", 500);
    const { ok, o } = await ghJson(`/repos/${repo()}`);
    if (!ok) throw new Refus("depot", `Dépôt ${repo()} introuvable sur GitHub.`, 502);
    if (!o.parent) return { copie: o.full_name as string, source: null as null | { depot: string; branche: string } };
    return { copie: o.full_name as string, source: { depot: o.parent.full_name as string, branche: o.parent.default_branch as string } };
  }
  async function scripts(src: { depot: string; branche: string }) {
    const { ok, o } = await ghJson(`/repos/${src.depot}/contents/supabase/migrations?ref=${encodeURIComponent(src.branche)}`);
    if (!ok || !Array.isArray(o)) throw new Refus("lecture", "Liste des scripts de base illisible sur le dépôt d'origine.", 502);
    return (o as { name: string; type: string }[]).filter((f) => f.type === "file" && /^\d{4}_[\w-]+\.sql$/.test(f.name)).map((f) => f.name).sort();
  }
  const versionDe = async (depot: string, ref: string) => { try { return JSON.parse(await ghTexte(depot, "site/version.json", ref)).version as string; } catch { return ""; } };

  async function etat() {
    const { copie, source } = await depots();
    if (!source) return { fonction: FONCTION, copie, source: null, origine: true };
    const [ici, amont, liste, faites, vjs, fonctionAmont] = await Promise.all([
      versionDe(copie, branche()), versionDe(source.depot, source.branche), scripts(source), d.base.faites(),
      ghTexte(source.depot, "site/js/version.js", source.branche).catch(() => ""),
      ghTexte(source.depot, "supabase/functions/mise-a-jour/index.ts", source.branche).then((t) => +((/export const FONCTION = (\d+)/.exec(t) || [])[1] || 0)).catch(() => 0),
    ]);
    const cmp = await ghJson(`/repos/${source.depot}/compare/${encodeURIComponent(source.branche)}...${encodeURIComponent(copie.split("/")[0] + ":" + branche())}`);
    const fait = new Set(faites);
    return {
      fonction: FONCTION, fonctionAmont, copie, source: source.depot, origine: false,
      version: { ici, amont }, retard: cmp.ok ? cmp.o.behind_by ?? null : null, avance: cmp.ok ? cmp.o.ahead_by ?? null : null,
      base: liste.filter((n) => !fait.has(n)),
      nouveautes: ici ? nouveautes(vjs, ici) : [],
      aJour: !!amont && amont === ici && liste.every((n) => fait.has(n)),
    };
  }

  async function base() {
    const { source } = await depots();
    if (!source) throw new Refus("origine", "Cette appli est le dépôt d'origine : rien à récupérer.");
    const fait = new Set(await d.base.faites());
    const manque = (await scripts(source)).filter((n) => !fait.has(n));
    const faites: string[] = [];
    for (const nom of manque) {
      const sql = await ghTexte(source.depot, `supabase/migrations/${nom}`, source.branche);
      try { await d.base.appliquer(nom, sql); }
      catch (e) { throw new Refus("script", `Le script ${nom} n'est pas passé, rien n'a été changé par lui : ${(e as Error).message}`.slice(0, 600), 500); }
      faites.push(nom);
    }
    return { faites };
  }

  async function code() {
    const { copie, source } = await depots();
    if (!source) throw new Refus("origine", "Cette appli est le dépôt d'origine : rien à récupérer.");
    const m = await ghJson(`/repos/${copie}/merge-upstream`, { method: "POST", body: JSON.stringify({ branch: branche() }) });
    if (m.status === 409) throw new Refus("conflit", "Ta copie a été modifiée à la main sur GitHub : elle ne peut plus suivre l'origine toute seule. Sur GitHub, « Sync fork » puis « Discard commits » remet la copie d'aplomb (tes réglages, dans les variables, ne bougent pas).", 409);
    if (!m.ok) throw new Refus("code", `GitHub n'a pas pu récupérer le code (${m.status}) : ${m.o.message || ""}`, 502);
    /* la publication démarre d'elle-même à la réception du code ; on la relance quand même, au cas où */
    let publication = false;
    if (m.o.merge_type !== "none") {
      const w = await gh(`/repos/${copie}/actions/workflows/pages.yml/dispatches`, { method: "POST", body: JSON.stringify({ ref: branche() }) }).catch(() => null);
      publication = !!w && w.status === 204;
    }
    return { fusion: m.o.merge_type || "none", publication, version: await versionDe(copie, branche()) };
  }

  /* chaque nuit : la base d'abord, puis le code ; une copie déjà à jour ne bouge pas */
  async function auto() {
    const { source } = await depots();
    if (!source) return { origine: true };
    const b = await base(), c = await code();
    console.log(`mise à jour de nuit : ${b.faites.length} script(s), code ${c.fusion}`);
    return { faites: b.faites, fusion: c.fusion, version: c.version };
  }
  const egal = (a: string, b: string) => { if (!a || a.length !== b.length) return false; let x = 0; for (let i = 0; i < a.length; i++) x |= a.charCodeAt(i) ^ b.charCodeAt(i); return x === 0; };

  return async (req: Request): Promise<Response> => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
    if (req.method !== "POST") return json({ erreur: "methode", message: "POST seulement" }, 405);
    try {
      const cle = req.headers.get("x-kplan-auto");
      if (cle !== null) {
        if (!egal(cle, await d.base.secretAuto())) return json({ erreur: "auto", message: "Secret de la mise à jour de nuit refusé." }, 401);
        const travail = auto();
        if (d.fond) { d.fond(travail.catch((e) => console.error("mise à jour de nuit :", (e as Error).message))); return json({ auto: "lancée" }, 202); }
        return json(await travail);
      }
      const jwt = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
      const qui = jwt ? await d.pilote(jwt) : null;
      if (!qui) return json({ erreur: "connexion", message: "Connecte-toi d'abord." }, 401);
      if (qui === "pas-pilote") return json({ erreur: "pilote", message: "Seul un pilote peut mettre l'appli à jour." }, 403);
      let action = "etat"; try { action = (await req.json()).action || "etat"; } catch { /* corps vide : état */ }
      if (action === "etat") {
        const e = await etat();
        if (e.origine) return json(e);
        /* une copie : la mise à jour de nuit s'inscrit dans le coffre (une fois, rien n'est remplacé) */
        let auto = false;
        try { await d.base.inscrire(d.env("SUPABASE_URL").replace(/\/+$/, "") + "/functions/v1/mise-a-jour"); auto = true; } catch (x) { console.error("inscription de nuit :", (x as Error).message); }
        return json({ ...e, auto });
      }
      if (action === "base") return json(await base());
      if (action === "code") return json(await code());
      return json({ erreur: "action", message: "Action inconnue" }, 400);
    } catch (e) {
      if (e instanceof Refus) return json({ erreur: e.code, message: e.message }, e.status);
      console.error(e);
      return json({ erreur: "panne", message: (e as Error).message || "Erreur inattendue" }, 500);
    }
  };
}

/* ---------- dans Supabase ---------- */
// deno-lint-ignore no-explicit-any
const D = (globalThis as any).Deno;
if (D && D.serve && !D.env.get("KPLAN_TEST")) {
  const env = (k: string) => D.env.get(k) ?? "";
  const { default: postgres } = await import("npm:postgres@3.4.5");
  const { createClient } = await import("npm:@supabase/supabase-js@2.117.3");
  const sb = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
  const db = () => postgres(env("SUPABASE_DB_URL"), { prepare: false, max: 1, idle_timeout: 5, onnotice: () => {} });
  const SUIVI = "create schema if not exists kplan_private; create table if not exists kplan_private.migrations (name text primary key, at timestamptz not null default now());";
  D.serve(createHandler({
    env,
    fetch,
    pilote: async (jwt) => {
      const { data, error } = await sb.auth.getUser(jwt);
      if (error || !data.user) return null;
      const { data: p } = await sb.from("profiles").select("chef").eq("id", data.user.id).maybeSingle();
      return p && p.chef ? { id: data.user.id } : "pas-pilote";
    },
    base: {
      faites: async () => { const sql = db(); try { await sql.unsafe(SUIVI); return (await sql`select name from kplan_private.migrations`).map((r: { name: string }) => r.name); } finally { await sql.end(); } },
      /* un script = une transaction : il passe en entier ou pas du tout ; deux clics en même temps attendent leur tour */
      appliquer: async (nom, texte) => {
        const sql = db();
        try {
          await sql.begin(async (tx: any) => {
            await tx`select pg_advisory_xact_lock(4242)`;
            if ((await tx`select 1 from kplan_private.migrations where name = ${nom}`).length) return;
            await tx.unsafe(texte);
            await tx`insert into kplan_private.migrations (name) values (${nom})`;
          });
        } finally { await sql.end(); }
      },
      secretAuto: async () => { const sql = db(); try { const r = await sql`select decrypted_secret from vault.decrypted_secrets where name = 'kplan_maj_secret'`; return r.length ? r[0].decrypted_secret : ""; } finally { await sql.end(); } },
      inscrire: async (url) => {
        const sql = db();
        try {
          const secret = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
          await sql`select vault.create_secret(${url}, 'kplan_maj_url') where not exists (select 1 from vault.secrets where name = 'kplan_maj_url')`;
          await sql`select vault.create_secret(${secret}, 'kplan_maj_secret') where not exists (select 1 from vault.secrets where name = 'kplan_maj_secret')`;
        } finally { await sql.end(); }
      },
    },
    // deno-lint-ignore no-explicit-any
    fond: (globalThis as any).EdgeRuntime ? (p) => (globalThis as any).EdgeRuntime.waitUntil(p) : undefined,
  }));
}
