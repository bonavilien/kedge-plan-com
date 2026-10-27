// Service worker : l'appli s'ouvre même sans réseau (dernière version vue) et reçoit les notifications.
const CACHE = "kplan-v14"; // à changer à chaque mise en ligne qui touche plusieurs fichiers : hors ligne, deux versions ne se mélangent pas
// tout ce que la page charge, mis de côté dès l'installation : l'appli s'ouvre hors ligne dès la première visite
const CORE = ["./", "index.html", "manifest.webmanifest", "theme/tokens.css", "theme/base.css", "components/components.css", "components/brand.css", "app.css",
  "components/icons.js", "components/ui.js", "vendor/supabase-2.117.3.js", "config.js", "store.js", "app.js", "boot.js",
  "fonts/krc-serif.woff", "assets/kedge-logo-anthracite.png", "assets/kedge-logo-blanc.png", "icons/icon-192.png", "icons/apple-touch-icon.png"];
self.addEventListener("install", (e) => e.waitUntil((async () => {
  // un fichier qui manque ne bloque pas l'installation : il sera mis en cache à sa première lecture
  const c = await caches.open(CACHE);
  await Promise.all(CORE.map((u) => fetch(u, { cache: "no-cache" }).then((r) => (r.ok ? c.put(u, r) : null)).catch(() => null)));
  await self.skipWaiting();
})()));
self.addEventListener("activate", (e) => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
  await self.clients.claim();
})()));
// le réseau d'abord, pour toujours avoir la dernière version ; le cache seulement hors ligne. La base n'est jamais mise en cache.
self.addEventListener("fetch", (e) => {
  const r = e.request;
  if (r.method !== "GET" || new URL(r.url).origin !== location.origin) return;
  // no-cache : revalide auprès de GitHub Pages au lieu de reprendre une copie du navigateur vieille de 10 minutes
  // une page ouverte avec un paramètre (?…) ou un #… retrouve la même copie hors ligne
  e.respondWith(fetch(r, { cache: "no-cache" }).then((res) => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(r, copy)); }
    return res;
  }).catch(async () => (await caches.match(r, { ignoreSearch: r.mode === "navigate" })) || (r.mode === "navigate" ? (await caches.match("./")) || caches.match("index.html") : Response.error())));
});

// une notification envoyée par la base (fonction push)
self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data.json(); } catch (x) { d = { body: e.data ? e.data.text() : "" }; }
  e.waitUntil(self.registration.showNotification(d.title || "Plan de com", {
    body: d.body || "", icon: "icons/icon-192.png", tag: d.tag || undefined, data: { url: d.url || "" },
  }));
});
// toucher la notification ouvre la fiche concernée, dans l'appli déjà ouverte s'il y en a une
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = new URL(e.notification.data?.url || "", self.registration.scope).href;
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const w = wins.find((c) => c.url.startsWith(self.registration.scope));
    if (w) { await w.focus(); w.postMessage({ type: "open", url }); return; }
    await self.clients.openWindow(url);
  })());
});
