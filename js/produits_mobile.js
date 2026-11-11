/* ============================================================
   PRODUITS (coût de revient) sur smartphone — simple et fluide
     ① Matières      : une ligne compacte par matière (toucher = modifier), bouton « + Ajouter »
     ② Gabarits      : face, dos, soufflet… du produit
     ③ Main d'œuvre  : salaires et charges fixes du jour de référence
     ④ Coût          : coût de revient, simulation, fiche matières, sortie de stock
   Rien ne change sur ordinateur (tout est activé par le CSS, écran ≤ 700 px).
   ============================================================ */
(function () {
  'use strict';
  const sec = document.getElementById('v-produits'), main = document.getElementById('pd-main');
  if (!sec || !main) return;
  const $ = q => sec.querySelector(q);
  const KEY = 'mariabag_pd_etape';
  const mobile = () => window.matchMedia('(max-width:700px)').matches;

  // repère chaque bloc pour l'afficher à la bonne étape
  function marquer() {
    const lc = $('#pd-lignes-body'); if (lc && lc.closest('.card')) lc.closest('.card').dataset.pdStep = '1';
    const gc = $('#pd-gabcard'); if (gc) gc.dataset.pdStep = '2';
    const mo = $('#pd-mo-date'); if (mo && mo.closest('.card')) mo.closest('.card').dataset.pdStep = '3';
    const cf = $('#cf-card'); if (cf) cf.dataset.pdStep = '3';
    const ct = $('#pd-cout-body'); if (ct && ct.closest('.card')) ct.closest('.card').dataset.pdStep = '4';
  }

  const bar = document.createElement('div'); bar.id = 'pd-steps'; bar.setAttribute('role', 'tablist');
  bar.innerHTML = [['1', 'Matières'], ['2', 'Gabarits'], ['3', 'Main d’œuvre'], ['4', 'Coût']].map(x =>
    '<button type="button" role="tab" data-step="' + x[0] + '"><i>' + x[0] + '</i><span>' + x[1] + '</span></button>').join('');
  const stats = $('#pd-stats'); main.insertBefore(bar, stats ? stats.nextSibling : main.firstChild);
  function etape(n, defiler) {
    n = String(n || '1'); sec.dataset.step = n; marquer();
    bar.querySelectorAll('button').forEach(b => { const on = b.dataset.step === n; b.classList.toggle('on', on); b.setAttribute('aria-selected', on); });
    try { sessionStorage.setItem(KEY, n); } catch (e) {}
    if (defiler && mobile()) window.scrollTo({ top: Math.max(0, bar.getBoundingClientRect().top + window.scrollY - (parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--hdr-h')) || 0) - 8), behavior: 'smooth' });
  }
  bar.addEventListener('click', e => { const b = e.target.closest('[data-step]'); if (b) etape(b.dataset.step, true); });
  // les cartes des stats (matières / main d'œuvre / coût) mènent à leur étape
  if (stats) stats.addEventListener('click', e => { if (!mobile()) return; const c = e.target.closest('.at-stat'); if (!c) return; const i = [...stats.children].indexOf(c); etape(i === 0 ? '1' : i === 1 ? '3' : '4', true); });

  /* actions du produit derrière « ⋯ » */
  const tools = $('.tools');
  if (tools) {
    const plus = document.createElement('button'); plus.type = 'button'; plus.className = 'btn pd-plus'; plus.textContent = '⋯'; plus.setAttribute('aria-label', 'Actions sur le produit');
    const lbl = tools.querySelector('label'); if (lbl) lbl.after(plus); else tools.prepend(plus);
    plus.addEventListener('click', () => tools.classList.toggle('pd-open'));
    tools.addEventListener('click', e => { if (e.target.closest('.btn') && !e.target.closest('.pd-plus')) tools.classList.remove('pd-open'); });
  }

  /* toucher une ligne = la modifier */
  sec.addEventListener('click', e => {
    if (!mobile()) return;
    const tr = e.target.closest('#pd-lignes-body tr.pl-row'); if (!tr || e.target.closest('button, a, input, select')) return;
    const f = tr.dataset.pack ? window.showFormPack : window.showFormLigne; if (typeof f === 'function') f(tr.dataset.lid);
  });
  // un formulaire de ligne / pack ouvert ramène à l'étape Matières
  ['#pd-lform', '#pd-pkform'].forEach(q => { const f = $(q); if (f) new MutationObserver(() => { if (getComputedStyle(f).display !== 'none' && sec.dataset.step !== '1') etape('1'); }).observe(f, { attributes: true, attributeFilter: ['style'] }); });

  // bouton « Supprimer cette ligne » dans le formulaire (les boutons de ligne sont cachés sur téléphone)
  const lform = $('#pd-lform');
  if (lform) {
    const supp = document.createElement('button'); supp.type = 'button'; supp.className = 'btn d pd-lsupp'; supp.textContent = 'Supprimer cette ligne';
    supp.addEventListener('click', () => { try { if (typeof curLigne !== 'undefined' && curLigne && typeof removeLigne === 'function') removeLigne(curLigne); } catch (e) {} });
    const act = lform.querySelector('.at-actions'); if (act) act.appendChild(supp);
    new MutationObserver(() => { let ed = false; try { ed = typeof curLigne !== 'undefined' && !!curLigne; } catch (e) {} supp.style.display = getComputedStyle(lform).display !== 'none' && ed ? '' : 'none'; })
      .observe(lform, { attributes: true, attributeFilter: ['style'] });
  }

  // la carte des gabarits est créée plus tard (au premier affichage d'un produit)
  new MutationObserver(marquer).observe(main, { childList: true });
  let depart = '1'; try { depart = sessionStorage.getItem(KEY) || '1'; } catch (e) {}
  etape(depart);
})();
