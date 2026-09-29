// Asie 2027 · planning — fonctionnement hors connexion (lecture seule, aucune synchronisation).
// La page et ses bibliothèques sont gardées en cache à l'installation ; les photos et les tuiles de carte
// le sont au fil de la consultation. Changer VERSION à chaque mise à jour du site.
const VERSION = 'asie27-v2';
const IMG = 'asie27-img';          // photos, drapeaux, tuiles de carte (cache séparé, gardé entre les versions)
const IMG_MAX = 600;               // au-delà, les plus anciennes sont supprimées
const CORE = ['./', 'planning.webmanifest', 'appli_planning/icon-192.png', 'appli_planning/icon-512.png', 'appli_planning/apple-touch-icon.png'];
const LIBS = [
  'https://cdn.jsdelivr.net/npm/twemoji@14.0.2/dist/twemoji.min.js',
  'https://cdn.jsdelivr.net/npm/d3@7/dist/d3.min.js',
  'https://cdn.jsdelivr.net/npm/topojson-client@3/dist/topojson-client.min.js',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
  'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then(async (c) => {
    await c.addAll(CORE);
    // Une bibliothèque indisponible n'empêche pas l'installation : elle sera mise en cache à la première visite.
    await Promise.all(LIBS.map((u) => c.add(new Request(u, { mode: 'cors' })).catch(() => {})));
  }).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== VERSION && k !== IMG).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

const isImage = (req, url) => req.destination === 'image'
  || /(^|\.)(unsplash\.com|wikimedia\.org|arcgisonline\.com)$/.test(url.hostname)
  || /\.(png|jpe?g|webp|avif|gif|svg)$/i.test(url.pathname);

async function trim(cache) {
  const keys = await cache.keys();
  if (keys.length > IMG_MAX) await Promise.all(keys.slice(0, keys.length - IMG_MAX).map((k) => cache.delete(k)));
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // La page : réseau d'abord (4 s max) pour recevoir les mises à jour, sinon la copie en cache
  if (req.mode === 'navigate') {
    e.respondWith(caches.open(VERSION).then(async (cache) => {
      const net = fetch(req).then((res) => { if (res && res.ok) cache.put('./', res.clone()); return res; });
      const timeout = new Promise((resolve) => setTimeout(resolve, 4000, null));
      const res = await Promise.race([net.catch(() => null), timeout]);
      return res || (await cache.match('./')) || net;
    }));
    return;
  }

  // Photos, drapeaux, tuiles de carte : cache d'abord (elles ne changent pas)
  if (isImage(req, url)) {
    e.respondWith(caches.open(IMG).then(async (cache) => {
      const hit = await cache.match(req);
      if (hit) return hit;
      try {
        const res = await fetch(req);
        if (res && (res.ok || res.type === 'opaque')) { cache.put(req, res.clone()); e.waitUntil(trim(cache)); }
        return res;
      } catch (err) { return Response.error(); }
    }));
    return;
  }

  // Le reste (bibliothèques, polices, données du globe) : cache d'abord, mise à jour en arrière-plan
  e.respondWith(caches.open(VERSION).then(async (cache) => {
    const hit = await cache.match(req);
    const net = fetch(req).then((res) => {
      if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
      return res;
    }).catch(() => null);
    if (hit) { e.waitUntil(net); return hit; }
    return (await net) || Response.error();
  }));
});
