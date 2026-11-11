/* ============================================================
   MARIA BAG — Service worker (installation sur PC / téléphone + hors ligne)
   - Pages et scripts du site : réseau d'abord (4 s maximum), sinon la copie
     enregistrée sur l'appareil : l'application s'ouvre même sans internet
   - Bibliothèques du dossier lib/ (supabase, xlsx, jspdf) : copie locale d'abord
   - Les appels à la base Supabase ne sont JAMAIS mis en cache (les données
     hors ligne sont gérées par js/local-db.js)
   Changez CACHE_VERSION pour forcer la mise à jour chez tous les utilisateurs.
   ============================================================ */
const CACHE_VERSION = 'mariabag-v154';
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/styles.css',
  './css/login.css',
  './css/production.css',
  './css/produits.css',
  './css/stock.css',
  './css/pf.css',
  './css/simple.css',
  './css/theme_mca.css',
  './css/themes.css',
  './icons/theme/mca.svg',
  './css/partenaires.css',
  './css/inventaire.css',
  './css/paiements.css',
  './css/commerce.css',
  './css/employes.css',
  './css/ateliers_paiements.css',
  './css/dashboard.css',
  './css/mobile.css',
  './lib/supabase.min.js',
  './lib/591.supabase.js',
  './lib/xlsx.full.min.js',
  './lib/jspdf.umd.min.js',
  './lib/jspdf.plugin.autotable.min.js',
  './js/config.js',
  './js/local-db.js',
  './js/auth.js',
  './js/app.js',
  './js/recherche_select.js',
  './js/ateliers.js',
  './js/employes.js',
  './js/hs_cumul.js',
  './js/fiche_paie.js',
  './js/charges.js',
  './js/stock.js',
  './js/pf.js',
  './js/partenaires.js',
  './js/paiements.js',
  './js/commerce.js',
  './js/commerce_fin.js',
  './js/profil.js',
  './js/onglets.js',
  './css/profil.css',
  './js/equipe.js',
  './js/notes.js',
  './js/zacksmart_data.js',
  './js/zacksmart.js',
  './css/zacksmart.css',
  './css/notes.css',
  './js/inventaire.js',
  './js/simple.js',
  './js/acces.js',
  './js/themes.js',
  './js/sorties.js',
  './js/yards.js',
  './js/ateliers_paiements.js',
  './js/production.js',
  './js/production_mobile.js',
  './js/produits.js',
  './js/calepinage.js',
  './js/produits_mobile.js',
  './js/gabarits_vue.js',
  './js/dashboard.js',
  './js/mobile.js',
  './js/install.js',
  './js/version.js',
  './js/sauvegarde.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      // allSettled-like : un fichier manquant ne bloque pas l'installation
      .then((cache) => Promise.all(SHELL.map((u) => cache.add(new Request(u, { cache: 'reload' })).catch(() => null))))      // jamais une copie périmée du navigateur
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

  // Bibliothèques incluses (lib/) : ne changent jamais, copie locale d'abord
  if (url.pathname.includes('/lib/')) {
    event.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res && res.ok) { const copy = res.clone(); caches.open(CACHE_VERSION).then((c) => c.put(req, copy)); }
      return res;
    })));
    return;
  }

  // Fichiers du site : réseau d'abord (toujours la dernière version), sinon cache.
  // Connexion lente ou coupée : au bout de 4 s on ouvre la copie enregistrée.
  const fromCache = () => caches.match(req, { ignoreSearch: true })
    .then((hit) => hit || (req.mode === 'navigate' ? caches.match('./index.html') : undefined));
  // « no-cache » : le téléphone redemande toujours au serveur si le fichier a changé (Safari gardait d'anciens styles)
  let netReq; try { netReq = req.mode === 'navigate' ? new Request(req.url, { cache: 'no-cache', credentials: 'same-origin' }) : new Request(req, { cache: 'no-cache' }); } catch (e) { netReq = req; }
  const network = fetch(netReq).then((res) => {
    if (res && res.ok) {
      const copy = res.clone();
      caches.open(CACHE_VERSION).then((c) => c.put(req, copy));
    }
    return res;
  });
  event.respondWith(new Promise((resolve) => {
    let done = false;
    const finish = (r) => { if (!done && r) { done = true; resolve(r); } };
    const timer = setTimeout(() => fromCache().then(finish), 4000);
    network.then((res) => { clearTimeout(timer); finish(res); })
      .catch(() => { clearTimeout(timer); fromCache().then((hit) => { finish(hit); if (!done) { done = true; resolve(Response.error()); } }); });
  }));
});