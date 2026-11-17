/* Plan de com KEDGE · V2 — pour que l'appli s'installe et s'ouvre sans réseau.
   Le réseau d'abord (on a toujours la dernière version), le cache en secours. */
const VERSION = "2.0.1";
const CACHE = "kplan-v2-" + VERSION;
const FILES = ["./", "index.html", "version.json", "manifest.webmanifest", "css/v2.css", "fonts/krc-serif.woff", "assets/kedge-logo-blanc.png", "icons/icon-192.png",
  "js/version.js", "js/icons.js", "js/data.js", "js/ui.js", "js/suggestions.js", "js/fiche.js", "js/plan.js", "js/accueil.js", "js/reunion.js", "js/reglages.js", "js/app.js", "js/remote.js", "config.js", "vendor/supabase-2.117.3.js"];
self.addEventListener("install", (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener("activate", (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith("kplan-v2-") && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.origin !== location.origin) return;
  e.respondWith(fetch(e.request, { cache: "no-cache" }).then((r) => { if (r.ok) { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); } return r; })
    .catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match("index.html"))));
});

/* une notification envoyée par la base (fonction push) */
self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data.json(); } catch (x) { d = { body: e.data ? e.data.text() : "" }; }
  e.waitUntil(self.registration.showNotification(d.title || "Plan de com", { body: d.body || "", icon: "icons/icon-192.png", tag: d.tag || undefined, data: { url: d.url || "" } }));
});
/* toucher la notification ouvre la fiche concernée, dans l'appli déjà ouverte s'il y en a une */
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = new URL(e.notification.data && e.notification.data.url || "", self.registration.scope).href;
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const w = wins.find((c) => c.url.startsWith(self.registration.scope));
    if (w) { await w.focus(); w.postMessage({ type: "open", url }); return; }
    await self.clients.openWindow(url);
  })());
});
