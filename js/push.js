/* ============================================================
   NOTIFICATIONS SUR LE TÉLÉPHONE (Web Push) — même application fermée
   • Dépôt (Hamza dépôt) : une notification à chaque nouvelle commande d'un magasin.
   • Magasins (Idris, Fatah) : une notification quand le dépôt envoie (ou refuse) leur commande.
   L'appareil s'abonne une fois (bouton « Activer les notifications ») ; l'abonnement est enregistré
   dans la table push_abonnements avec les sections du compte. La base envoie ensuite la notification
   toute seule (déclencheur → fonction « notifier »).
   iPhone : il faut ouvrir la plateforme depuis l'icône de l'écran d'accueil (iOS 16.4 ou plus).
   ============================================================ */
(function () {
  'use strict';
  const CLE = 'BKZw4ycRLP0CYgKZVEUq7xbmKXvZYL0SIztN7QlUlE-8BuVdLyhqaJuzRIxU5KVi9bwH33UZvfrVbF23rMjsNVg';
  const ios = () => /iPhone|iPad|iPod/i.test(navigator.userAgent);
  const installee = () => (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true || /^android-app:/.test(document.referrer);
  const possible = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  const remote = () => (window.LocalDB && LocalDB.remote) ? LocalDB.remote() : null;
  const say = t => { if (typeof toast === 'function') toast(t); };
  const b64 = s => { const p = '='.repeat((4 - s.length % 4) % 4), r = atob((s + p).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from([...r].map(c => c.charCodeAt(0))); };
  let actif = null;          // null = inconnu, true / false

  async function abonnement() { if (!possible()) return null; const r = await navigator.serviceWorker.ready; return r.pushManager.getSubscription(); }
  // enregistre (ou met à jour) l'abonnement de cet appareil avec le compte connecté
  async function enregistrer(sub) {
    const db = remote(); if (!db || !sub) return { error: { message: 'Hors ligne' } };
    const j = sub.toJSON(), u = window.APP_USER || {};
    return db.from('push_abonnements').upsert([{ endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth, user_id: u.id || null, nom: u.nom || u.email || '',
      sections: Array.isArray(u.sections) ? u.sections : null, magasin_id: u.magasin_id || null, role: u.role || '', appareil: navigator.userAgent.slice(0, 160), updated_at: new Date().toISOString() }], { onConflict: 'endpoint' });
  }
  async function activer() {
    if (!possible()) { say(ios() && !installee() ? 'Sur iPhone : ajoutez d’abord la plateforme à l’écran d’accueil (Partager › Sur l’écran d’accueil), puis ouvrez-la depuis son icône.' : 'Ce téléphone ne permet pas les notifications.'); return false; }
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') { say('Notifications refusées : autorisez-les dans les réglages du téléphone (Notifications › MARIA BAG / Chrome).'); actif = false; maj(); return false; }
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64(CLE) });
    const r = await enregistrer(sub);
    if (r && r.error) { say('Erreur : ' + r.error.message); return false; }
    actif = true; maj(); say('🔔 Notifications activées sur ce téléphone.');
    tester(sub);
    return true;
  }
  async function desactiver() {
    const sub = await abonnement(); if (sub) { const db = remote(); if (db) await db.from('push_abonnements').delete().eq('endpoint', sub.endpoint); await sub.unsubscribe(); }
    actif = false; maj(); say('Notifications désactivées sur ce téléphone.');
  }
  async function tester(sub) {
    sub = sub || await abonnement(); if (!sub) return;
    try { await fetch(SUPABASE_URL + '/functions/v1/notifier', { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY }, body: JSON.stringify({ test: true, endpoint: sub.endpoint }) }); } catch (e) {}
  }

  /* Carte affichée en haut des sections Dépôt et Magasin */
  function html(qui) {
    const pourQuoi = qui === 'depot' ? 'à chaque nouvelle commande d’un magasin' : 'quand le dépôt envoie votre commande';
    if (actif === true) return '<div class="push-card on"><span>🔔</span><p>Notifications activées sur ce téléphone : vous êtes prévenu ' + pourQuoi + '.</p><button type="button" class="btn s" data-push="test">Tester</button><button type="button" class="btn s" data-push="off">Désactiver</button></div>';
    if (ios() && !installee()) return '<div class="push-card"><span>🔔</span><p><b>Recevoir une notification ' + pourQuoi + '</b><br>Sur iPhone : touchez <b>Partager › Sur l’écran d’accueil</b>, puis ouvrez la plateforme depuis cette icône pour activer les notifications.</p></div>';
    if (!possible()) return '';
    return '<div class="push-card"><span>🔔</span><p><b>Recevoir une notification ' + pourQuoi + '</b><br>Même quand l’application est fermée.</p><button type="button" class="btn p" data-push="on">Activer les notifications</button></div>';
  }
  function maj() { document.querySelectorAll('[data-push-zone]').forEach(z => { z.innerHTML = html(z.dataset.pushZone); }); }
  window.PushMB = { zone: qui => '<div data-push-zone="' + qui + '">' + html(qui) + '</div>', activer, desactiver, tester };

  document.addEventListener('click', e => {
    const b = e.target.closest && e.target.closest('[data-push]'); if (!b) return;
    const k = b.dataset.push; b.disabled = true;
    (k === 'on' ? activer() : k === 'off' ? desactiver() : tester().then(() => say('Notification de test envoyée.'))).finally(() => { b.disabled = false; });
  });

  // au démarrage : état de l'abonnement, et mise à jour du compte lié (sections, magasin) si l'appareil est abonné
  async function init() {
    try { const sub = await abonnement(); actif = !!(sub && Notification.permission === 'granted'); if (actif && window.APP_USER) await enregistrer(sub); } catch (e) { actif = false; }
    maj();
  }
  document.addEventListener('mariabag:profil', init);
  document.addEventListener('mariabag:authenticated', init);
  // ouverture depuis une notification : #depot / #magasins → la bonne section
  function suivreLien(h) {
    const v = String(h || location.hash).replace('#', ''); if (!/^(depot|magasins)$/.test(v)) return;
    const go = () => { const b = document.querySelector('nav button[data-v="' + v + '"]'); if (b) b.click(); else if (typeof show === 'function') show(v); };
    setTimeout(go, 600);
  }
  if ('serviceWorker' in navigator) navigator.serviceWorker.addEventListener('message', e => { if (e.data && e.data.type === 'ouvrir') suivreLien(e.data.hash); });
  document.addEventListener('mariabag:authenticated', () => suivreLien());
  window.addEventListener('hashchange', () => suivreLien());
})();
