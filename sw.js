/* ============================================================
   MARIA BAG — Service worker (installation + mode hors ligne léger)
   - Pages et scripts du site : réseau d'abord, copie en cache si hors ligne
   - Bibliothèques CDN (supabase, xlsx, jspdf) : cache puis mise à jour
   - Les appels à la base Supabase ne sont JAMAIS mis en cache
   Changez CACHE_VERSION pour forcer la mise à jour chez tous les utilisateurs.
   ============================================================ */
const CACHE_VERSION = 'mariabag-v3';
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/styles.css',
  './css/production.css',
  './js/config.js',
  './js/auth.js',
  './js/app.js',
  './js/ateliers.js',
  './js/employes.js',
  './js/charges.js',
  './js/production.js',
  './js/mobile.js',
  './js/install.js',
  './js/sauvegarde.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      // allSettled-like : un fichier manquant ne bloque pas l'installation
      .then((cache) => Promise.all(SHELL.map((u) => cache.add(u).catch(() => null))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Base de données et API : toujours le réseau, jamais de cache
  if (url.hostname.endsWith('supabase.co') || url.hostname.endsWith('supabase.in')) return;

  // Bibliothèques CDN : cache d'abord, rafraîchi en arrière-plan
  if (url.origin !== self.location.origin) {
    if (!/cdn\.jsdelivr\.net$/.test(url.hostname)) return;
    event.respondWith(
      caches.open(CACHE_VERSION).then((cache) =>
        cache.match(req).then((hit) => {
          const net = fetch(req).then((res) => {
            if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
            return res;
          }).catch(() => hit);
          return hit || net;
        })
      )
    );
    return;
  }

  // Fichiers du site : réseau d'abord (toujours la dernière version), sinon cache
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() =>
        caches.match(req).then((hit) => hit || (req.mode === 'navigate' ? caches.match('./index.html') : undefined))
      )
  );
});