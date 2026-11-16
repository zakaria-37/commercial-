/* ============================================================
   VERSION DE L'APPLICATION : affichage dans le pied de page + alerte « nouvelle version disponible »
   La version est lue dans sw.js (CACHE_VERSION, incrémentée à chaque mise à jour du code).
   ============================================================ */
(function () {
  'use strict';
  let chargee = null;
  const lire = () => fetch('sw.js?t=' + Date.now(), { cache: 'no-store' }).then(r => r.text()).then(t => { const m = t.match(/CACHE_VERSION\s*=\s*['"]([^'"]+)['"]/); return m ? m[1] : null; }).catch(() => null);
  const court = v => v ? v.replace('mariabag-', '') : '?';

  function afficher() {
    const f = document.querySelector('footer'); if (!f) return;
    let s = document.getElementById('appver');
    if (!s) { s = document.createElement('small'); s.id = 'appver'; s.style.cssText = 'display:block;color:#9a9a9a;font-size:11px;margin-top:6px;cursor:pointer'; s.title = 'Cliquez pour vérifier et charger la dernière version'; f.appendChild(s); s.addEventListener('click', () => majMaintenant()); }
    s.textContent = 'Version ' + court(chargee) + (location.protocol === 'app:' ? ' · logiciel PC' : ' · actualiser');
    // tout le monde peut reprendre exactement les données de la base (comme l'administrateur)
    let rs = document.getElementById('appresync');
    if (!rs) { rs = document.createElement('small'); rs.id = 'appresync'; rs.style.cssText = 'display:block;color:#9a9a9a;font-size:11px;margin-top:4px;cursor:pointer;text-decoration:underline'; rs.textContent = '🔄 Resynchroniser toutes mes données';
      rs.title = 'Reprend exactement les données de la base commune (celles de l’administrateur) sur cet appareil';
      rs.addEventListener('click', async () => { if (!window.LocalDB || !LocalDB.resync) return; rs.textContent = 'Resynchronisation…'; const r = await LocalDB.resync();
        rs.textContent = '🔄 Resynchroniser toutes mes données'; if (typeof toast === 'function') toast(r.ok ? 'Toutes les données sont à jour avec la base commune.' + (r.attente ? ' (' + r.attente + ' changement(s) de cet appareil encore à envoyer)' : '') : 'Pas d’internet : réessayez quand la connexion revient.'); });
      f.appendChild(rs); }
    // Android (dans le navigateur, pas dans l'application) : lien de téléchargement de l'APK MARIA BAG
    let dansApp = false;
    try { if (/^android-app:\/\/com\.mariabag\.app/.test(document.referrer)) sessionStorage.setItem('mb_twa', '1'); dansApp = sessionStorage.getItem('mb_twa') === '1'; } catch (e) {}
    if (/Android/i.test(navigator.userAgent) && !dansApp && !document.getElementById('appapk')) {
      const a = document.createElement('a'); a.id = 'appapk'; a.href = 'maria-bag.apk'; a.setAttribute('download', 'MARIA-BAG.apk');
      a.style.cssText = 'display:block;color:#9b5d6b;font-size:12px;margin-top:6px;font-weight:600'; a.textContent = '📱 Télécharger l’application Android';
      f.appendChild(a);
    }
  }
  async function majMaintenant() {
    try { const rs = await navigator.serviceWorker.getRegistrations(); await Promise.all(rs.map(r => r.unregister())); } catch (e) {}
    try { const ks = await caches.keys(); await Promise.all(ks.map(k => caches.delete(k))); } catch (e) {}
    location.reload();
  }
  function bandeau(v) {
    if (document.getElementById('maj-bandeau')) return;
    const b = document.createElement('div'); b.id = 'maj-bandeau';
    b.style.cssText = 'position:fixed;left:12px;right:12px;bottom:calc(var(--navh,60px) + 12px);z-index:200;background:#111;color:#fff;border-radius:12px;padding:12px 14px;display:flex;gap:10px;align-items:center;box-shadow:0 8px 30px rgba(0,0,0,.35);font-size:14px;max-width:520px;margin:0 auto';
    b.innerHTML = '<span style="flex:1">Une <b>nouvelle version</b> (' + court(v) + ') est disponible.</span><button type="button" style="background:#d9a8b2;color:#111;border:0;border-radius:8px;padding:8px 12px;font-weight:700;cursor:pointer">Mettre à jour</button><button type="button" aria-label="Fermer" style="background:none;border:0;color:#bbb;font-size:18px;cursor:pointer">×</button>';
    b.querySelectorAll('button')[0].addEventListener('click', majMaintenant);
    b.querySelectorAll('button')[1].addEventListener('click', () => b.remove());
    document.body.appendChild(b);
  }
  async function verifier() {
    const v = await lire(); if (!v) return;
    if (!chargee) { chargee = v; afficher(); return; }
    if (v !== chargee) bandeau(v);
  }
  window.addEventListener('load', () => { verifier(); setInterval(verifier, 5 * 60 * 1000); });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') verifier(); });
})();
