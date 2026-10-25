// Envoie les notifications en attente (table outbox) sur les appareils abonnés (table push_subs).
// Appelée chaque minute par la base (pg_cron + pg_net, voir 0002_planification.sql), protégée par un secret partagé.
import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2.117.3";

const env = (k: string) => Deno.env.get(k) ?? "";
const sb = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
webpush.setVapidDetails(env("VAPID_SUBJECT") || "mailto:communication@kedgebs.com", env("VAPID_PUBLIC_KEY"), env("VAPID_PRIVATE_KEY"));

type Row = { id: number; user_id: string; title: string; body: string; url: string; tries: number };
type Sub = { id: number; user_id: string; endpoint: string; p256dh: string; auth: string };

Deno.serve(async (req) => {
  if (!env("CRON_SECRET") || req.headers.get("x-cron-secret") !== env("CRON_SECRET")) return new Response("non", { status: 401 });
  // les messages en attente sont pris d'un coup : deux appels simultanés ne se partagent jamais le même message
  const { data: rows, error } = await sb.from("outbox").update({ sent_at: new Date().toISOString() }).is("sent_at", null).select("id,user_id,title,body,url,tries");
  if (error) return new Response(error.message, { status: 500 });
  if (!rows?.length) return Response.json({ rows: 0, sent: 0 });
  const users = [...new Set((rows as Row[]).map((r) => r.user_id))];
  const { data: subs, error: e2 } = await sb.from("push_subs").select("id,user_id,endpoint,p256dh,auth").in("user_id", users);
  if (e2) return new Response(e2.message, { status: 500 });
  let sent = 0;
  const gone = new Set<number>();
  // une notification trop lourde est refusée par les services push (4 Ko) : titre et texte raccourcis
  // coupé par caractère (Array.from) : un emoji n'est jamais coupé en deux
  const cut = (x: string, n: number) => { const c = Array.from(x); return c.length > n ? c.slice(0, n - 1).join("").trimEnd() + "…" : x; };
  for (const r of rows as Row[]) {
    const mine = ((subs ?? []) as Sub[]).filter((s) => s.user_id === r.user_id && !gone.has(s.id));
    const errs: string[] = [];
    let ok = 0, retry = false;
    const payload = JSON.stringify({ title: cut(r.title, 120), body: cut(r.body, 400), url: r.url });
    for (const s of mine) {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 86400 });
        sent++; ok++;
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        // appareil désabonné ou appli supprimée : on oublie l'abonnement
        if (code === 404 || code === 410) { gone.add(s.id); await sb.from("push_subs").delete().eq("id", s.id); errs.push("abonnement expiré"); }
        else {
          // panne passagère (réseau, 429, 5xx) : on réessaiera
          // une clé d'abonnement invalide n'est pas passagère : inutile de réessayer
          const badKey = !code && /p256dh|auth secret|public key|invalid key|keys? (must|should)/i.test((e as Error).message);
          if ((!code && !badKey) || code === 429 || (code ?? 0) >= 500) retry = true;
          errs.push(`${code ?? ""} ${(e as Error).message}`.trim());
        }
      }
    }
    // rien n'est parti et c'est passager : le message repart à la minute suivante, cinq essais au plus
    if (!ok && retry && r.tries < 4) { await sb.from("outbox").update({ sent_at: null, tries: r.tries + 1, error: errs.join(" | ").slice(0, 500) }).eq("id", r.id); continue; }
    if (!mine.length) errs.push("aucun appareil abonné");
    // reçu sur au moins un appareil : ce n'est pas une erreur
    if (!ok && errs.length) await sb.from("outbox").update({ error: errs.join(" | ").slice(0, 500) }).eq("id", r.id);
    else if (ok && r.tries) await sb.from("outbox").update({ error: null }).eq("id", r.id);
  }
  return Response.json({ rows: rows.length, sent });
});
