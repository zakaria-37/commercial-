/* ============================================================
   ACCÈS PAR SECTION — chaque compte ne voit que ses sections
   - Administrateur, ou compte sans liste de sections : toute la plateforme.
   - Compte « équipe » avec sections : seulement ces onglets (ex. Oussama : Production + Produits ;
     Azedine : Bons de sortie). Les données restent les mêmes partout : tout reste synchronisé.
   ============================================================ */
(function () {
  'use strict';
  window.SECTIONS_APP = [
    ['dash', 'Tableau de bord'], ['commerce', 'Commerce'], ['stock', 'Stock'], ['production', 'Production'], ['produits', 'Produits'],
    ['sorties', 'Bons de sortie'], ['ateliers', 'Ateliers'], ['employes', 'Employés'], ['list', 'Contacts'], ['charges', 'Charges'],
    ['inventaire', 'Inventaire'], ['notes', 'Notes']
  ];
  const nav = () => [...document.querySelectorAll('nav button[data-v]')];
  let permises = null;           // null = tout est permis
  window.sectionPermise = v => !permises || v === 'equipe' ? (v !== 'equipe' || !!(window.APP_USER && window.APP_USER.role === 'admin')) : permises.includes(v);

  function appliquer(profil) {
    const admin = profil && profil.role === 'admin';
    permises = profil && !admin && Array.isArray(profil.sections) && profil.sections.length ? profil.sections.slice() : null;
    window.ACCES_LIMITE = !!permises;
    document.body.classList.toggle('acces-limite', !!permises);
    nav().forEach(b => {
      const v = b.dataset.v; if (v === 'equipe') return;
      const ok = !permises || permises.includes(v);
      b.classList.toggle('nav-off', !ok);
      if (permises && ok) b.hidden = false;          // ex. Production / Produits même en mode simple
    });
    if (!permises && typeof window.appliquerModeSimple === 'function') window.appliquerModeSimple();
    const bm = document.getElementById('bMode'); if (bm) bm.style.display = permises ? 'none' : '';
    // section affichée interdite : on ouvre la première permise
    const cur = document.querySelector('section.on'), v = cur ? cur.id.replace(/^v-/, '') : 'dash';
    if (permises && !permises.includes(v)) setTimeout(() => ouvrir(permises[0]), 0);
  }
  function ouvrir(v) { const b = document.querySelector('nav button[data-v="' + v + '"]'); if (b) b.click(); else if (typeof show === 'function') show(v); }

  // garde : un lien interne (tableau de bord, profil…) ne peut pas ouvrir une section interdite
  if (typeof window.show === 'function') {
    const orig = window.show;
    window.show = function (v) { if (permises && v && !permises.includes(v) && v !== 'equipe') v = permises[0]; return orig.call(this, v); };
  }
  document.addEventListener('click', e => {
    const b = e.target.closest && e.target.closest('nav button[data-v]');
    if (b && permises && !permises.includes(b.dataset.v) && b.dataset.v !== 'equipe') { e.preventDefault(); e.stopImmediatePropagation(); ouvrir(permises[0]); }
  }, true);
  document.addEventListener('mariabag:profil', ev => appliquer(ev.detail || null));
  appliquer(window.APP_USER || null);
})();
