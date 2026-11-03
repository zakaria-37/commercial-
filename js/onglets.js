/* ============================================================
   ONGLETS (comme un navigateur) — sous le menu principal
   - Chaque section ouverte reste dans un onglet : on passe de l'une à l'autre sans rien perdre
     (formulaire en cours, bon de livraison en saisie, filtres…).
   - Retour sur un onglet : s'il y a un travail en cours, la section est affichée telle quelle ;
     sinon elle est actualisée (données à jour venant des autres sections ou d'un autre appareil).
   - Un point « ● » signale un onglet dont les données ont changé pendant qu'il était caché.
   - Ctrl+Tab / Ctrl+Maj+Tab : onglet suivant / précédent. Les onglets ouverts sont gardés sur cet appareil.
   ============================================================ */
(function () {
  'use strict';
  const KEY = 'mariabag_onglets';
  const $ = s => document.querySelector(s);
  const navBtn = v => document.querySelector('nav button[data-v="' + v + '"]');
  const nom = v => { const b = navBtn(v); return b ? b.textContent.trim() : v; };
  let T = { ouverts: ['dash'], actif: 'dash' }, maj = new Set(), interne = false;
  const defil = {};      // position de défilement de chaque onglet
  try { const x = JSON.parse(localStorage.getItem(KEY) || 'null'); if (x && Array.isArray(x.ouverts) && x.ouverts.length) T = x; } catch (e) {}
  const garder = () => { try { localStorage.setItem(KEY, JSON.stringify(T)); } catch (e) {} };

  /* Travail en cours dans une section : formulaire ouvert avec quelque chose de saisi, ou document en édition */
  function aTravail(v) {
    const sec = document.getElementById('v-' + v); if (!sec) return false;
    if (v === 'commerce' && sec.querySelector('#cm-lignes, #cf-vform, #cf-cform, #cf-jform')) return true;
    const forms = [...sec.querySelectorAll('form, .at-form')].filter(f => getComputedStyle(f).display !== 'none');      // formulaires ouverts (même si la section est cachée)
    return forms.some(f => [...f.querySelectorAll('input:not([type=hidden]):not([type=checkbox]):not([type=radio]), textarea')].some(i => String(i.value || '').trim() !== '' && i.defaultValue !== i.value));
  }

  function rendre() {
    let bar = $('#tabbar');
    if (!bar) {
      bar = document.createElement('div'); bar.id = 'tabbar'; bar.setAttribute('role', 'tablist');
      const main = document.querySelector('main'); if (!main) return; main.parentNode.insertBefore(bar, main);
      bar.addEventListener('click', e => {
        const x = e.target.closest('[data-tclose]'); if (x) { e.stopPropagation(); fermer(x.dataset.tclose); return; }
        const t = e.target.closest('[data-tab]'); if (t) activer(t.dataset.tab);
      });
      bar.addEventListener('auxclick', e => { const t = e.target.closest('[data-tab]'); if (e.button === 1 && t && t.dataset.tab !== 'dash') { e.preventDefault(); fermer(t.dataset.tab); } });
    }
    T.ouverts = T.ouverts.filter(v => navBtn(v));
    if (!T.ouverts.includes('dash')) T.ouverts.unshift('dash');
    bar.innerHTML = T.ouverts.map(v => '<button type="button" role="tab" class="tb' + (v === T.actif ? ' on' : '') + '" data-tab="' + v + '" title="' + nom(v) + '">' +
      '<span class="tb-n">' + nom(v) + '</span>' + (maj.has(v) && v !== T.actif ? '<i class="tb-maj" title="Données mises à jour">●</i>' : '') +
      (v === 'dash' ? '' : '<span class="tb-x" data-tclose="' + v + '" title="Fermer l’onglet">×</span>') + '</button>').join('');
    const on = bar.querySelector('.tb.on'); if (on && on.scrollIntoView) on.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  /* Ouvrir / afficher un onglet */
  function activer(v) {
    if (!navBtn(v)) return;
    if (!T.ouverts.includes(v)) T.ouverts.push(v);
    const travail = aTravail(v);
    if (T.actif && T.actif !== v) defil[T.actif] = window.scrollY;
    T.actif = v; maj.delete(v); garder(); rendre();
    if (travail) {
      // travail en cours : on affiche la section telle quelle, sans la recharger
      document.querySelectorAll('nav button').forEach(b => b.classList.toggle('on', b.dataset.v === v));
      document.querySelectorAll('section').forEach(s => s.classList.toggle('on', s.id === 'v-' + v));
      const nb = document.getElementById('bNew'); if (nb) nb.style.display = v === 'list' ? '' : 'none';
      document.body.dataset.view = v;
    } else { interne = true; try { navBtn(v).click(); } finally { interne = false; } }
    requestAnimationFrame(() => window.scrollTo(0, defil[v] || 0));
  }
  function fermer(v) {
    if (v === 'dash') return;
    if (aTravail(v) && !confirm('L’onglet « ' + nom(v) + ' » contient un travail en cours. Le fermer quand même ?')) return;
    const i = T.ouverts.indexOf(v); if (i < 0) return;
    T.ouverts.splice(i, 1); maj.delete(v);
    if (T.actif === v) activer(T.ouverts[Math.max(0, i - 1)] || 'dash'); else { garder(); rendre(); }
  }

  // un clic dans le menu ouvre (ou affiche) l'onglet correspondant
  document.querySelectorAll('nav button').forEach(b => b.addEventListener('click', () => {
    if (interne) return;
    const v = b.dataset.v; if (!T.ouverts.includes(v)) T.ouverts.push(v);
    T.actif = v; maj.delete(v); garder(); rendre();
  }));

  // sections ouvertes par un lien interne (profil → Commerce, raccourcis du tableau de bord…) : elles ont aussi leur onglet
  if (typeof window.show === 'function') {
    const showOrig = window.show;
    window.show = function (v) { const r = showOrig.apply(this, arguments); if (v && navBtn(v)) { if (!T.ouverts.includes(v)) T.ouverts.push(v); T.actif = v; maj.delete(v); garder(); rendre(); } return r; };
  }

  // données modifiées (cette section, une autre, ou un autre appareil) : point sur les onglets cachés
  if (window.LocalDB && LocalDB.onChange) LocalDB.onChange(() => { T.ouverts.forEach(v => { if (v !== T.actif) maj.add(v); }); rendre(); });

  document.addEventListener('keydown', e => {
    if (!e.ctrlKey || e.key !== 'Tab' || T.ouverts.length < 2) return;
    e.preventDefault(); const i = T.ouverts.indexOf(T.actif), n = T.ouverts.length;
    activer(T.ouverts[(i + (e.shiftKey ? n - 1 : 1)) % n]);
  });

  // au démarrage (après connexion) : onglets gardés, on réaffiche le dernier actif
  function demarrer() { rendre(); if (T.actif && T.actif !== 'dash' && navBtn(T.actif)) setTimeout(() => activer(T.actif), 300); }
  document.addEventListener('mariabag:authenticated', demarrer);
  if (document.getElementById('app') && !document.getElementById('app').classList.contains('hide')) demarrer(); else rendre();

  window.Onglets = { ouvrir: activer, fermer };
})();
