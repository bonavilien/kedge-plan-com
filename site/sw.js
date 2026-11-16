/* Plan de com KEDGE · V2 — pour que l'appli s'installe et s'ouvre sans réseau.
   Le réseau d'abord (on a toujours la dernière version), le cache en secours. */
const VERSION = "2.0.0-beta.12";
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
