/* ============================================================
   MARIA BAG — Confort d'utilisation sur smartphone
   - Étiquette chaque cellule des tableaux avec le titre de sa colonne
     (le CSS transforme alors les tableaux en fiches sur téléphone)
   - Mémorise l'onglet affiché (body[data-view]) pour adapter l'en-tête
   Aucun autre fichier JS n'est modifié : tout se base sur la page.
   ============================================================ */
(function () {
  'use strict';

  /* ---------- Tableaux -> fiches : data-label sur chaque <td> ---------- */
  function labelTable(table) {
    const ths = table.querySelectorAll('thead th');
    if (!ths.length) return;                       // petits tableaux du tableau de bord : inchangés
    table.classList.add('m-cards');
    const labels = Array.from(ths).map(th => th.textContent.replace(/[▲▼]/g, '').trim());
    table.querySelectorAll('tbody tr').forEach(tr => {
      let col = 0;
      Array.from(tr.children).forEach(td => {
        const span = td.colSpan || 1;
        if (span > 1) td.setAttribute('data-span', '1');
        else td.setAttribute('data-label', labels[col] || '');
        col += span;
      });
    });
  }
  function labelAll() { document.querySelectorAll('table').forEach(labelTable); }

  let timer = null;
  function schedule() { clearTimeout(timer); timer = setTimeout(labelAll, 30); }
  new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
  labelAll();

  /* ---------- Onglet affiché ---------- */
  function setView(v) {
    document.body.setAttribute('data-view', v || 'dash');
    // barre du bas défilante : centre l'onglet actif
    const nav = document.querySelector('nav'), b = nav && nav.querySelector('button[data-v="' + (v || 'dash') + '"]');
    if (b && nav.scrollWidth > nav.clientWidth) nav.scrollTo({ left: b.offsetLeft - (nav.clientWidth - b.offsetWidth) / 2, behavior: 'smooth' });
  }
  setView('dash');
  document.querySelectorAll('nav button[data-v]').forEach(b =>
    b.addEventListener('click', () => { setView(b.dataset.v); window.scrollTo(0, 0); }));
})();
