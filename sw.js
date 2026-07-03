const CACHE = "scontrini-v14";
const SHELL = ["./", "./index.html", "./manifest.json", "./icon-192.png", "./icon-512.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Pagina principale: prima la rete (così gli aggiornamenti arrivano subito),
// cache solo come ripiego offline. no-cache scavalca anche la cache HTTP del
// CDN di GitHub Pages. Il resto della shell resta cache-first; le chiamate
// API (POST) non passano di qui.
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  if (e.request.mode === "navigate"){
    e.respondWith(
      fetch(e.request, { cache: "no-cache" }).then((r) => {
        const copia = r.clone();
        caches.open(CACHE).then((c) => c.put("./index.html", copia));
        return r;
      }).catch(() => caches.match("./index.html"))
    );
    return;
  }
  e.respondWith(
    caches.match(e.request).then((r) => r || fetch(e.request))
  );
});
