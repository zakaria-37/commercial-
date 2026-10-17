/* ============================================================
   MARIA BAG — Installation de l'application (Android + iPhone/iPad)
   - Android / Chrome : bouton « Installer » (événement beforeinstallprompt)
   - PC (Chrome / Edge) : même bandeau + bouton « Installer sur ce PC » dans
     l'en-tête : l'application s'ouvre dans sa propre fenêtre, avec une icône
     sur le bureau, et fonctionne sans internet (données sur le PC)
   - iPhone / iPad    : Safari ne propose AUCUNE installation automatique ;
                        on affiche donc un guide « Partager → Sur l'écran d'accueil »
   - Si la page est ouverte dans une appli (WhatsApp, Instagram, Facebook…)
     ou dans un navigateur qui ne peut pas installer, on invite à ouvrir Safari.
   - Rien ne s'affiche si l'application est déjà installée.
   ============================================================ */
(function () {
  'use strict';

  var DISMISS_KEY = 'mariabag_install_dismissed';
  var DISMISS_DAYS = 7;

  /* ---------- Service worker ---------- */
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function () {});
    });
  }

  /* ---------- Détection de l'environnement ---------- */
  var ua = navigator.userAgent || '';
  var isIOS = /iPad|iPhone|iPod/.test(ua) ||
              (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); // iPadOS
  var isStandalone = window.navigator.standalone === true ||
                     (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);
  // Navigateurs intégrés à des applis : impossible d'y « ajouter à l'écran d'accueil »
  var isInApp = /FBAN|FBAV|Instagram|Line\/|WhatsApp|Snapchat|TikTok|MicroMessenger|GSA\/|Twitter|LinkedInApp/i.test(ua);
  // Chrome / Firefox / Edge sur iPhone (iOS 16.4+ : menu Partager possible aussi)
  var isIOSOtherBrowser = isIOS && /CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);

  if (isStandalone) return;                       // déjà installée
  var isDesktop = !isIOS && !/Android|Mobi/i.test(ua);

  /* ---------- PC : bouton « Installer sur ce PC » dans l'en-tête (toujours proposé) ---------- */
  var deferred = null;
  function headerButton() {
    var out = document.getElementById('bLogout');
    if (!isDesktop || !out || document.getElementById('bInstall')) return;
    var b = document.createElement('button');
    b.className = 'btn p'; b.id = 'bInstall'; b.type = 'button'; b.textContent = 'Installer sur ce PC';
    b.title = 'Installer Maria Bag comme une application : icône sur le bureau, fonctionne sans internet';
    b.style.marginLeft = '4px';
    out.parentNode.insertBefore(b, out);
    b.addEventListener('click', function () {
      if (!deferred) return;
      deferred.prompt();
      deferred.userChoice.then(function () { deferred = null; b.remove(); });
    });
  }

  var dismissed = false;
  try {
    var d = parseInt(localStorage.getItem(DISMISS_KEY) || '0', 10);
    dismissed = !!(d && Date.now() - d < DISMISS_DAYS * 86400000);
  } catch (e) {}

  /* ---------- Styles ---------- */
  var css = '' +
    '#instBar{position:fixed;left:12px;right:12px;bottom:calc(12px + env(safe-area-inset-bottom));z-index:200;' +
    'background:#000;color:#fff;border-radius:14px;padding:14px 16px;box-shadow:0 8px 30px rgba(0,0,0,.35);' +
    'font:14px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;max-width:460px;margin:0 auto}' +
    '#instBar .ih{display:flex;align-items:center;gap:12px}' +
    '#instBar img{width:44px;height:44px;border-radius:10px;flex:none}' +
    '#instBar b{display:block;font-size:15px}' +
    '#instBar small{color:#cfcfcf;font-size:12.5px}' +
    '#instBar .ix{margin-left:auto;background:none;border:0;color:#bbb;font-size:22px;line-height:1;padding:4px 6px;cursor:pointer}' +
    '#instBar .ib{display:block;width:100%;margin-top:12px;border:0;border-radius:10px;padding:11px;font-weight:700;' +
    'font-size:15px;background:#d9a8b2;color:#000;cursor:pointer}' +
    '#instBar ol{margin:12px 0 0;padding-left:20px;color:#eee}' +
    '#instBar li{margin:6px 0}' +
    '#instBar .sh{display:inline-block;vertical-align:-3px;width:18px;height:18px;margin:0 2px}' +
    '#instBar .ar{text-align:center;font-size:22px;margin-top:6px;animation:instb 1.2s infinite}' +
    '@keyframes instb{0%,100%{transform:translateY(0)}50%{transform:translateY(5px)}}';
  var st = document.createElement('style');
  st.textContent = css;
  document.head.appendChild(st);

  /* ---------- Bandeau ---------- */
  var shareIcon = '<svg class="sh" viewBox="0 0 24 24" fill="none" stroke="#7ab8ff" stroke-width="2" ' +
    'stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12M8 7l4-4 4 4"/>' +
    '<path d="M6 11H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2h-1"/></svg>';

  var bar = null;
  function build(inner) {
    if (bar) bar.remove();
    bar = document.createElement('div');
    bar.id = 'instBar';
    bar.setAttribute('role', 'dialog');
    bar.innerHTML =
      '<div class="ih"><img src="icons/icon-192.png" alt="">' +
      '<div><b>Installer Maria Bag</b><small>' + (isDesktop ? 'Icône sur le bureau · fonctionne sans internet' : 'Accès rapide depuis votre écran d\'accueil · fonctionne sans internet') + '</small></div>' +
      '<button class="ix" aria-label="Fermer">&times;</button></div>' + inner;
    document.body.appendChild(bar);
    bar.querySelector('.ix').addEventListener('click', dismiss);
    return bar;
  }
  function dismiss() {
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch (e) {}
    if (bar) { bar.remove(); bar = null; }
  }

  /* ---------- iPhone / iPad ---------- */
  function showIOS() {
    if (isInApp) {
      build('<ol><li>Touchez les <b>⋯</b> ou le bouton <b>Partager</b> de cette appli</li>' +
            '<li>Choisissez <b>« Ouvrir dans Safari »</b></li>' +
            '<li>Puis suivez les étapes pour installer</li></ol>');
      return;
    }
    // iPhone : le bouton Partager est en bas dans Safari, en haut à droite dans Chrome iOS
    var where = isIOSOtherBrowser
      ? 'Touchez le bouton <b>Partager</b> ' + shareIcon + ' (en haut à droite de la barre d\'adresse)'
      : 'Touchez le bouton <b>Partager</b> ' + shareIcon + ' (en bas de l\'écran Safari)';
    build('<ol><li>' + where + '</li>' +
          '<li>Faites défiler et touchez <b>« Sur l\'écran d\'accueil »</b></li>' +
          '<li>Touchez <b>« Ajouter »</b> en haut à droite</li></ol>' +
          (isIOSOtherBrowser ? '' : '<div class="ar">⬇</div>'));
  }

  /* ---------- Android / Chrome / Edge (téléphone et PC) ---------- */
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    deferred = e;
    headerButton();
    if (dismissed) return;
    build('<button class="ib" id="instGo">Installer l\'application</button>');
    document.getElementById('instGo').addEventListener('click', function () {
      if (!deferred) return;
      deferred.prompt();
      deferred.userChoice.then(function () { deferred = null; if (bar) { bar.remove(); bar = null; } });
    });
  });
  window.addEventListener('appinstalled', function () {
    if (bar) { bar.remove(); bar = null; }
    var b = document.getElementById('bInstall'); if (b) b.remove();
  });

  if (isIOS && !dismissed) {
    var go = function () { setTimeout(showIOS, 1200); };
    if (document.readyState === 'complete') go(); else window.addEventListener('load', go);
  }
})();
