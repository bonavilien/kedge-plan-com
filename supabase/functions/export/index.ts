// Envoie une fiche dans l'Asana ou le Trello de la personne qui clique, puis l'y garde à jour.
// Elle tourne dans Supabase, jamais dans le navigateur : les clés Asana et Trello restent ici et dans la base.
//   Depuis l'appli (compte connecté) :
//   Chacun son outil : chaque personne (sauf lecture seule) relie son Asana ou son Trello, ses fiches y arrivent.
//     « lister »   la personne donne sa clé : la fonction répond ses projets Asana ou ses listes Trello
//     « relier »   elle choisit la destination : clé et destination sont rangées dans la base (table outils)
//     « delier »   elle retire son outil (ses tâches déjà envoyées y restent, elles ne bougent plus)
//     « envoyer »  elle crée la fiche dans son outil (n'importe quelle fiche : c'est son outil à elle)
//     « arreter »  elle arrête de la synchroniser chez elle (la tâche reste dans l'outil)
//   Depuis la base (déclencheurs de 0029_export_asana_trello.sql, avec le secret partagé) :
//     { item }       la fiche a changé : la tâche ou la carte est réécrite
//     { item }       (suite) chaque personne qui l'a envoyée voit sa tâche ou sa carte réécrite
//     { supprimer }  la fiche a été supprimée : tâche à la corbeille d'Asana, carte aux archives de Trello
//
// Aucun secret à ranger dans Supabase : chacun se règle dans l'appli (Réglages, Mon profil).
// Fournis par Supabase sans rien faire : SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
// À l'installation, désactiver « Verify JWT » : la fonction vérifie elle-même qui l'appelle.
//
// Ce fichier tient seul (aucun autre fichier à copier) : il se colle tel quel dans l'éditeur de Supabase.

export const FONCTION = 1;

type Outil = "asana" | "trello";
type Qui = { id: string; chef: boolean; svc: string; visiteur: boolean };
type Reglage = { user_id: string; outil: Outil; jeton: string; cible: string; cible_nom: string; site: string; app: string };
type Conf = { adresse: string; secret: string };
type Export = { item: string; user_id: string; outil: Outil; ext_id: string; url: string; erreur?: string };
type Fiche = {
  id: string; kind: string; t: string; date: string; flou: string | boolean; svc: string; m: string[]; st: string; partner: string | null;
  lieu: string; note: string; annule_motif?: string; fin?: string | null;
  service: string; messages: string[]; tf: string; docs: { nom: string; url: string }[];
};
type Deps = {
  env: (k: string) => string;
  fetch: typeof fetch;
  qui: (jwt: string) => Promise<Qui | null>;
  db: {
    reglages: (user: string) => Promise<Reglage[]>;
    reglage: (user: string, o: Outil) => Promise<Reglage | null>;
    relier: (r: Reglage) => Promise<void>;
    delier: (user: string, o: Outil) => Promise<void>;
    conf: () => Promise<Conf | null>;
    ecrireConf: (c: Conf) => Promise<void>;
    fiche: (id: string) => Promise<Fiche | null>;
    exports: (item: string) => Promise<Export[]>;
    noter: (e: Export) => Promise<void>;
    oublier: (item: string, user: string, o: Outil) => Promise<void>;
  };
  secret: () => string;
};

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, apikey, content-type, x-client-info",
  "access-control-allow-methods": "POST, OPTIONS",
};
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...CORS, "content-type": "application/json" } });
class Refus extends Error { code: string; status: number; constructor(code: string, message: string, status = 400) { super(message); this.code = code; this.status = status; } }
const NOMS: Record<Outil, string> = { asana: "Asana", trello: "Trello" };
const ETATS: Record<string, string> = { confirmer: "À confirmer", idee: "À confirmer", prevu: "Prévu", planifie: "Prévu", production: "Prévu", diffuse: "Diffusé", retire: "Annulé" };
const fini = (f: Fiche) => f.st === "diffuse" || f.st === "retire";

/* la description de la tâche : l'essentiel de la fiche, puis le lien pour l'ouvrir dans l'appli */
export function description(f: Fiche, r: Pick<Reglage, "site" | "app">, md = false): string {
  const l: string[] = [];
  const ligne = (k: string, v: string) => { if (v) l.push(md ? `**${k}** : ${v}` : `${k} : ${v}`); };
  if (f.st === "retire") ligne("Annulé", f.annule_motif || "oui");
  if (f.flou) ligne("Date", "à préciser dans le mois");
  if (f.fin) ligne("Jusqu'au", f.fin);
  ligne("Service", f.service);
  ligne("Messages", f.messages.join(", "));
  ligne("État", ETATS[f.st] || f.st);
  ligne("Temps fort", f.tf);
  ligne("Média", f.partner || "");
  ligne("Lieu", f.lieu);
  if (f.note) l.push("", f.note);
  if (f.docs.length) l.push("", md ? "**Documents**" : "Documents", ...f.docs.map((d) => md ? `- [${d.nom}](${d.url})` : `- ${d.nom} : ${d.url}`));
  if (r.site) l.push("", md ? `[Ouvrir dans ${r.app || "l'appli"}](${lienApp(r.site, f.id)})` : `Ouvrir dans ${r.app || "l'appli"} : ${lienApp(r.site, f.id)}`);
  return l.join("\n");
}
export const lienApp = (site: string, id: string) => site.replace(/[#?].*$/, "").replace(/\/?$/, "/") + "#item=" + id;
const titre = (f: Fiche) => (f.st === "retire" ? "Annulé · " : "") + f.t;

export function createHandler(d: Deps) {
  /* ---------- Asana ---------- */
  async function asana(jeton: string, chemin: string, init: RequestInit = {}) {
    const r = await d.fetch("https://app.asana.com/api/1.0" + chemin, {
      ...init, headers: { authorization: `Bearer ${jeton.trim()}`, accept: "application/json", ...(init.body ? { "content-type": "application/json" } : {}) },
    });
    if (r.status === 401) throw new Refus("jeton", "Asana refuse la clé : elle a expiré ou elle est mal recopiée.", 502);
    const t = await r.text(); let o: any = {}; try { o = t ? JSON.parse(t) : {}; } catch { o = {}; }
    return { status: r.status, ok: r.ok, data: o.data, message: (o.errors && o.errors[0] && o.errors[0].message) || "" };
  }
  /* ---------- Trello : la clé est « clé:jeton » ---------- */
  async function trello(jeton: string, chemin: string, init: RequestInit = {}, q: Record<string, string> = {}) {
    const [key, token] = jeton.trim().split(":");
    const u = new URL("https://api.trello.com/1" + chemin);
    Object.entries({ ...q, key: key || "", token: token || "" }).forEach(([k, v]) => u.searchParams.set(k, v));
    const r = await d.fetch(u.toString(), { ...init, headers: { accept: "application/json", ...(init.body ? { "content-type": "application/json" } : {}) } });
    if (r.status === 401) throw new Refus("jeton", "Trello refuse la clé ou le jeton : ils ont expiré ou ils sont mal recopiés.", 502);
    const t = await r.text(); let o: any = {}; try { o = t ? JSON.parse(t) : {}; } catch { o = { message: t }; }
    return { status: r.status, ok: r.ok, data: o, message: typeof o === "string" ? o : o.message || "" };
  }

  /* les destinations possibles pour une clé */
  async function lister(outil: Outil, jeton: string) {
    if (!jeton.trim()) throw new Refus("jeton", "Colle d'abord la clé.");
    if (outil === "asana") {
      const ws = await asana(jeton, "/workspaces?opt_fields=name&limit=100");
      if (!ws.ok) throw new Refus("asana", `Asana ne répond pas (${ws.status}) : ${ws.message}`, 502);
      const out: { id: string; nom: string }[] = [];
      for (const w of ws.data || []) {
        const p = await asana(jeton, `/projects?workspace=${w.gid}&archived=false&opt_fields=name&limit=100`);
        if (p.ok) for (const x of p.data || []) out.push({ id: x.gid, nom: `${w.name} · ${x.name}` });
      }
      return out;
    }
    if (!jeton.includes(":")) throw new Refus("jeton", "Il faut la clé et le jeton Trello.");
    const b = await trello(jeton, "/members/me/boards", {}, { filter: "open", fields: "name", lists: "open", list_fields: "name" });
    if (!b.ok) throw new Refus("trello", `Trello ne répond pas (${b.status}) : ${b.message}`, 502);
    return (b.data || []).flatMap((x: any) => (x.lists || []).map((l: any) => ({ id: l.id, nom: `${x.name} · ${l.name}` })));
  }

  /* créer ou réécrire la tâche d'une fiche ; renvoie son identifiant et son adresse */
  async function ecrire(r: Reglage, f: Fiche, ext: Export | null): Promise<{ ext_id: string; url: string } | null> {
    if (r.outil === "asana") {
      const data: Record<string, unknown> = { name: titre(f), notes: description(f, r), due_on: f.date, completed: fini(f) };
      if (ext) {
        const u = await asana(r.jeton, `/tasks/${ext.ext_id}?opt_fields=permalink_url`, { method: "PUT", body: JSON.stringify({ data }) });
        if (u.status === 404) return null; /* effacée dans Asana : on arrête de la suivre */
        if (!u.ok) throw new Refus("asana", `Asana n'a pas pris la mise à jour (${u.status}) : ${u.message}`, 502);
        return { ext_id: ext.ext_id, url: u.data?.permalink_url || ext.url };
      }
      const c = await asana(r.jeton, "/tasks?opt_fields=permalink_url", { method: "POST", body: JSON.stringify({ data: { ...data, projects: [r.cible] } }) });
      if (!c.ok) throw new Refus("asana", `Asana n'a pas créé la tâche (${c.status}) : ${c.message}`, 502);
      return { ext_id: c.data.gid, url: c.data.permalink_url || "" };
    }
    const body = { name: titre(f), desc: description(f, r, true), due: f.date ? `${f.date}T09:00:00.000Z` : null, dueComplete: fini(f), closed: f.st === "retire" };
    if (ext) {
      const u = await trello(r.jeton, `/cards/${ext.ext_id}`, { method: "PUT", body: JSON.stringify(body) });
      if (u.status === 404) return null;
      if (!u.ok) throw new Refus("trello", `Trello n'a pas pris la mise à jour (${u.status}) : ${u.message}`, 502);
      return { ext_id: ext.ext_id, url: u.data?.shortUrl || ext.url };
    }
    const c = await trello(r.jeton, "/cards", { method: "POST", body: JSON.stringify({ ...body, closed: false, idList: r.cible }) });
    if (!c.ok) throw new Refus("trello", `Trello n'a pas créé la carte (${c.status}) : ${c.message}`, 502);
    return { ext_id: c.data.id, url: c.data.shortUrl || c.data.url || "" };
  }
  async function retirer(r: Reglage, ext_id: string) {
    if (r.outil === "asana") await asana(r.jeton, `/tasks/${ext_id}`, { method: "DELETE" });
    else await trello(r.jeton, `/cards/${ext_id}`, { method: "PUT", body: JSON.stringify({ closed: true }) });
  }

  /* la fiche a changé : chaque outil où elle est envoyée est réécrit ; une erreur reste notée sur la ligne */
  async function synchroniser(item: string) {
    const f = await d.db.fiche(item), liste = await d.db.exports(item), fait: string[] = [];
    if (!f) return { fait };
    for (const e of liste) {
      const r = await d.db.reglage(e.user_id, e.outil);
      if (!r) continue;
      try {
        const w = await ecrire(r, f, e);
        if (!w) { await d.db.oublier(item, e.user_id, e.outil); continue; }
        await d.db.noter({ item, user_id: e.user_id, outil: e.outil, ext_id: w.ext_id, url: w.url, erreur: "" }); fait.push(e.outil);
      } catch (x) { await d.db.noter({ ...e, erreur: (x as Error).message.slice(0, 300) }); }
    }
    return { fait };
  }

  const outilDe = (o: unknown): Outil => { if (o === "asana" || o === "trello") return o; throw new Refus("outil", "Outil inconnu."); };

  return async (req: Request): Promise<Response> => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
    if (req.method !== "POST") return json({ erreur: "methode", message: "POST seulement" }, 405);
    try {
      let corps: any = {}; try { corps = await req.json(); } catch { /* corps vide */ }
      /* ---- la base ---- */
      const s = req.headers.get("x-export-secret");
      if (s) {
        const c = await d.db.conf();
        if (!c || !c.secret || c.secret !== s) return json({ erreur: "secret", message: "non" }, 401);
        if (corps.item) return json(await synchroniser(String(corps.item)));
        if (Array.isArray(corps.supprimer)) {
          for (const x of corps.supprimer) { const r = await d.db.reglage(String(x.user_id), outilDe(x.outil)); if (r) await retirer(r, String(x.ext_id)).catch(() => {}); }
          return json({ ok: true });
        }
        return json({ erreur: "action", message: "rien à faire" }, 400);
      }
      /* ---- l'appli : chacun ne touche qu'à son outil ---- */
      const jwt = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
      const q = jwt ? await d.qui(jwt) : null;
      if (!q) return json({ erreur: "connexion", message: "Connecte-toi d'abord." }, 401);
      if (q.visiteur) return json({ erreur: "droits", message: "En lecture seule, pas d'envoi vers Asana ou Trello." }, 403);
      const action = corps.action;
      if (action === "etat") return json({ fonction: FONCTION, outils: (await d.db.reglages(q.id)).map((r) => ({ outil: r.outil, cible_nom: r.cible_nom })) });
      if (action === "lister" || action === "relier" || action === "delier") {
        const outil = outilDe(corps.outil), ancien = await d.db.reglage(q.id, outil);
        if (action === "delier") { await d.db.delier(q.id, outil); return json({ ok: true }); }
        const jeton = String(corps.jeton || "").trim() || (ancien ? ancien.jeton : "");
        if (action === "lister") return json({ choix: await lister(outil, jeton) });
        const choix = await lister(outil, jeton), c = choix.find((x) => x.id === corps.cible);
        if (!c) throw new Refus("cible", `Cette destination n'existe plus dans ${NOMS[outil]}.`);
        /* la première personne qui relie un outil installe le lien entre la base et la fonction */
        if (!(await d.db.conf())) await d.db.ecrireConf({ adresse: d.env("SUPABASE_URL").replace(/\/+$/, "") + "/functions/v1/export", secret: d.secret() });
        await d.db.relier({ user_id: q.id, outil, jeton, cible: c.id, cible_nom: c.nom, site: String(corps.site || "").slice(0, 300), app: String(corps.app || "").slice(0, 60) });
        return json({ outil, cible_nom: c.nom });
      }
      if (action === "envoyer" || action === "arreter") {
        const outil = outilDe(corps.outil), f = await d.db.fiche(String(corps.item || ""));
        if (!f) throw new Refus("fiche", "Cette fiche n'existe plus.", 404);
        if (action === "arreter") { await d.db.oublier(f.id, q.id, outil); return json({ ok: true }); }
        const r = await d.db.reglage(q.id, outil);
        if (!r) throw new Refus("outil", `Ton ${NOMS[outil]} n'est pas relié : Réglages, Mon profil.`);
        const deja = (await d.db.exports(f.id)).find((e) => e.outil === outil && e.user_id === q.id) || null;
        const w = (await ecrire(r, f, deja)) || (await ecrire(r, f, null));
        const e: Export = { item: f.id, user_id: q.id, outil, ext_id: w!.ext_id, url: w!.url, erreur: "" };
        await d.db.noter(e);
        return json(e);
      }
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
  const { createClient } = await import("npm:@supabase/supabase-js@2.117.3");
  const sb = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
  const ok = <T>(r: { data: T; error: { message: string } | null }) => { if (r.error) throw new Error(r.error.message); return r.data; };
  D.serve(createHandler({
    env,
    fetch,
    secret: () => crypto.randomUUID() + crypto.randomUUID(),
    qui: async (jwt) => {
      const { data, error } = await sb.auth.getUser(jwt);
      if (error || !data.user) return null;
      const { data: p } = await sb.from("profiles").select("chef,svc,visiteur").eq("id", data.user.id).maybeSingle();
      return p ? { id: data.user.id, chef: !!p.chef, svc: p.svc || "", visiteur: !!p.visiteur } : null;
    },
    db: {
      reglages: async (u) => ok(await sb.from("outils").select("*").eq("user_id", u)) as Reglage[],
      reglage: async (u, o) => ok(await sb.from("outils").select("*").eq("user_id", u).eq("outil", o).maybeSingle()) as Reglage | null,
      relier: async (r) => { ok(await sb.from("outils").upsert({ ...r, maj: new Date().toISOString() })); },
      delier: async (u, o) => { ok(await sb.from("exports").delete().eq("user_id", u).eq("outil", o)); ok(await sb.from("outils").delete().eq("user_id", u).eq("outil", o)); },
      conf: async () => ok(await sb.from("export_conf").select("adresse,secret").maybeSingle()) as Conf | null,
      ecrireConf: async (c) => { ok(await sb.from("export_conf").upsert({ id: true, ...c })); },
      fiche: async (id) => {
        const it: any = ok(await sb.from("items").select("*").eq("id", id).maybeSingle());
        if (!it) return null;
        const [svc, msgs, tf, links] = await Promise.all([
          sb.from("services").select("nom").eq("k", it.svc).maybeSingle(),
          sb.from("messages").select("n,nom"),
          it.tf ? sb.from("items").select("t").eq("id", it.tf).maybeSingle() : Promise.resolve({ data: null }),
          sb.from("links").select("nom,url").eq("item", id).order("at"),
        ]);
        const nomMsg = (k: string) => { const m = ((msgs.data || []) as { n: number; nom: string }[]).find((x) => String(x.n) === k || (k === "REC" && x.n === 0)); return m ? m.nom : ""; };
        let partenaire = "";
        if (it.partner) { const p: any = (await sb.from("partners").select("nom").eq("k", it.partner).maybeSingle()).data; partenaire = p ? p.nom : ""; }
        return {
          ...it, partner: partenaire || null,
          service: it.svc === "chef" ? "Chefs de projet" : (svc.data as any)?.nom || "",
          messages: (it.m || []).map(nomMsg).filter(Boolean),
          tf: (tf.data as any)?.t || "",
          docs: (links.data || []) as { nom: string; url: string }[],
        } as Fiche;
      },
      exports: async (item) => ok(await sb.from("exports").select("*").eq("item", item)) as Export[],
      noter: async (e) => { ok(await sb.from("exports").upsert({ ...e, maj: new Date().toISOString() })); },
      oublier: async (item, u, o) => { ok(await sb.from("exports").delete().eq("item", item).eq("user_id", u).eq("outil", o)); },
    },
  }));
}
