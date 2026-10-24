// Envoie les notifications en attente (table outbox) sur les appareils abonnés (table push_subs).
// Appelée chaque minute par la base (pg_cron + pg_net, voir 0002_planification.sql), protégée par un secret partagé.
import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2.117.3";

const env = (k: string) => Deno.env.get(k) ?? "";
const sb = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
webpush.setVapidDetails(env("VAPID_SUBJECT") || "mailto:communication@kedgebs.com", env("VAPID_PUBLIC_KEY"), env("VAPID_PRIVATE_KEY"));

type Row = { id: number; user_id: string; title: string; body: string; url: string };
type Sub = { id: number; user_id: string; endpoint: string; p256dh: string; auth: string };

Deno.serve(async (req) => {
  if (!env("CRON_SECRET") || req.headers.get("x-cron-secret") !== env("CRON_SECRET")) return new Response("non", { status: 401 });
  // les messages en attente sont pris d'un coup : deux appels simultanés ne se partagent jamais le même message
  const { data: rows, error } = await sb.from("outbox").update({ sent_at: new Date().toISOString() }).is("sent_at", null).select("id,user_id,title,body,url");
  if (error) return new Response(error.message, { status: 500 });
  if (!rows?.length) return Response.json({ rows: 0, sent: 0 });
  const users = [...new Set((rows as Row[]).map((r) => r.user_id))];
  const { data: subs, error: e2 } = await sb.from("push_subs").select("id,user_id,endpoint,p256dh,auth").in("user_id", users);
  if (e2) return new Response(e2.message, { status: 500 });
  let sent = 0;
  const gone = new Set<number>();
  for (const r of rows as Row[]) {
    const mine = ((subs ?? []) as Sub[]).filter((s) => s.user_id === r.user_id && !gone.has(s.id));
    const errs: string[] = [];
    if (!mine.length) errs.push("aucun appareil abonné");
    const payload = JSON.stringify({ title: r.title, body: r.body, url: r.url });
    for (const s of mine) {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 86400 });
        sent++;
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        // appareil désabonné ou appli supprimée : on oublie l'abonnement
        if (code === 404 || code === 410) { gone.add(s.id); await sb.from("push_subs").delete().eq("id", s.id); errs.push("abonnement expiré"); }
        else errs.push(`${code ?? ""} ${(e as Error).message}`.trim());
      }
    }
    if (errs.length) await sb.from("outbox").update({ error: errs.join(" | ").slice(0, 500) }).eq("id", r.id);
  }
  return Response.json({ rows: rows.length, sent });
});
