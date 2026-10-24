// Service worker : l'appli s'ouvre même sans réseau (dernière version vue) et reçoit les notifications.
const CACHE = "kplan-v1";
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
  await self.clients.claim();
})()));
// le réseau d'abord, pour toujours avoir la dernière version ; le cache seulement hors ligne. La base n'est jamais mise en cache.
self.addEventListener("fetch", (e) => {
  const r = e.request;
  if (r.method !== "GET" || new URL(r.url).origin !== location.origin) return;
  // no-cache : revalide auprès de GitHub Pages au lieu de reprendre une copie du navigateur vieille de 10 minutes
  e.respondWith(fetch(r, { cache: "no-cache" }).then((res) => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(r, copy)); }
    return res;
  }).catch(async () => (await caches.match(r)) || (r.mode === "navigate" ? caches.match("./") : Response.error())));
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
