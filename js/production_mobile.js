/* ============================================================
   PRODUCTION sur smartphone — parcours simple en 3 étapes
     ① Composition   : les composants du modèle, une ligne compacte chacun (toucher = modifier)
     ② Fabrication   : quantité à fabriquer (− / + et raccourcis), besoins et stock disponible
     ③ Bon de sortie : atelier, date, n° du bon, puis valider la sortie / PDF / WhatsApp
   Rien n'est changé sur ordinateur : tout est activé par le CSS (écran ≤ 700 px).
   ============================================================ */
(function () {
  'use strict';
  const sec = document.getElementById('v-production'), main = document.getElementById('pr-main');
  if (!sec || !main) return;
  const $ = q => sec.querySelector(q);
  const KEY = 'mariabag_pr_etape';
  const mobile = () => window.matchMedia('(max-width:700px)').matches;

  /* ----- Barre des étapes ----- */
  const bar = document.createElement('div'); bar.id = 'pr-steps'; bar.setAttribute('role', 'tablist');
  bar.innerHTML = [['1', 'Composition'], ['2', 'Fabrication'], ['3', 'Bon']].map(s =>
    '<button type="button" role="tab" data-step="' + s[0] + '"><i>' + s[0] + '</i><span>' + s[1] + '</span></button>').join('');
  main.insertBefore(bar, main.firstChild);
  function etape(n, defiler) {
    n = String(n || '1'); sec.dataset.step = n;
    bar.querySelectorAll('button').forEach(b => { const on = b.dataset.step === n; b.classList.toggle('on', on); b.setAttribute('aria-selected', on); });
    try { sessionStorage.setItem(KEY, n); } catch (e) {}
    majResume();
    if (defiler && mobile()) window.scrollTo({ top: Math.max(0, bar.getBoundingClientRect().top + window.scrollY - (parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--hdr-h')) || 0) - 8), behavior: 'smooth' });
  }
  bar.addEventListener('click', e => { const b = e.target.closest('[data-step]'); if (b) etape(b.dataset.step, true); });

  /* ----- Quantité : − / + et raccourcis ----- */
  const qte = $('#pr-qte'), calc = $('.pr-calc');
  const qbar = document.createElement('div'); qbar.id = 'pr-qbar';
  qbar.innerHTML = '<span class="pq-l">Quantité à fabriquer</span><div class="pq-row"><button type="button" class="pq-b" data-d="-1" aria-label="Moins">−</button>' +
    '<input id="pr-qte-m" type="number" min="1" step="1" inputmode="numeric" aria-label="Quantité à fabriquer"><button type="button" class="pq-b" data-d="1" aria-label="Plus">+</button></div>' +
    '<div class="pq-chips">' + [50, 100, 250, 500, 1000].map(n => '<button type="button" data-n="' + n + '">' + n + '</button>').join('') + '</div>';
  if (calc) calc.parentNode.insertBefore(qbar, calc);
  const qm = qbar.querySelector('#pr-qte-m');
  const pas = v => v >= 1000 ? 100 : v >= 200 ? 50 : v >= 50 ? 10 : 1;
  function setQ(v) {
    v = Math.max(1, Math.round(Number(v) || 1)); qte.value = v; qm.value = v;
    qte.dispatchEvent(new Event('input', { bubbles: true }));
    qbar.querySelectorAll('.pq-chips button').forEach(b => b.classList.toggle('on', Number(b.dataset.n) === v));
    majResume();
  }
  qbar.addEventListener('click', e => {
    const d = e.target.closest('[data-d]'), n = e.target.closest('[data-n]'), cur = Number(qte.value) || 0;
    if (d) setQ(Number(d.dataset.d) > 0 ? cur + pas(cur) : cur - pas(cur - 1));
    if (n) setQ(n.dataset.n);
  });
  qm.addEventListener('input', () => { if (qm.value) { qte.value = qm.value; qte.dispatchEvent(new Event('input', { bubbles: true })); majResume(); } });
  qm.addEventListener('blur', () => setQ(qm.value));
  qte.addEventListener('input', () => { if (document.activeElement !== qm) qm.value = qte.value; });

  /* ----- Boutons « Suivant » et résumé de l'étape 3 ----- */
  const cards = main.querySelectorAll(':scope > .card');
  const nx1 = document.createElement('button'); nx1.type = 'button'; nx1.className = 'btn p pr-next'; nx1.dataset.go = '2'; nx1.textContent = 'Suivant : quantité à fabriquer →';
  if (cards[0]) cards[0].appendChild(nx1);
  const nx2 = document.createElement('button'); nx2.type = 'button'; nx2.className = 'btn p pr-next pr-next2'; nx2.dataset.go = '3'; nx2.textContent = 'Suivant : bon de sortie →';
  const resume = document.createElement('div'); resume.id = 'pr-resume';
  const help = $('#pr-stock-help');
  if (help) { help.parentNode.insertBefore(nx2, help); help.parentNode.insertBefore(resume, help); }
  main.addEventListener('click', e => { const b = e.target.closest('.pr-next'); if (b) etape(b.dataset.go, true); });
  function majResume() {
    const sel = $('#pr-modele'), nom = sel && sel.selectedOptions[0] ? sel.selectedOptions[0].textContent : '';
    const tot = [...sec.querySelectorAll('#pr-stats .at-stat')].pop(), manq = sec.querySelectorAll('#pr-need-body .pn-manque').length;
    resume.innerHTML = '<b>' + (Number(qte.value) || 0).toLocaleString('fr-FR') + ' pièces</b> — ' + nom.replace(/[&<>]/g, '') +
      (manq ? '<span class="pr-r-ko">⚠ ' + manq + ' composant(s) en stock insuffisant</span>' : sec.querySelector('#pr-need-body .pn-ok') ? '<span class="pr-r-ok">✔ Stock suffisant</span>' : '');
  }
  const stats = $('#pr-stats'); if (stats) new MutationObserver(majResume).observe(stats, { childList: true });

  /* ----- Actions du modèle regroupées derrière « ⋯ » ----- */
  const tools = $('.tools');
  if (tools) {
    const plus = document.createElement('button'); plus.type = 'button'; plus.className = 'btn pr-plus'; plus.textContent = '⋯'; plus.title = 'Actions sur le modèle'; plus.setAttribute('aria-label', 'Actions sur le modèle');
    const lbl = tools.querySelector('label'); if (lbl) lbl.after(plus); else tools.prepend(plus);
    plus.addEventListener('click', () => tools.classList.toggle('pr-open'));
    tools.addEventListener('click', e => { if (e.target.closest('.btn') && !e.target.closest('.pr-plus')) tools.classList.remove('pr-open'); });
  }

  /* ----- Toucher une ligne de composition = la modifier (téléphone) ----- */
  sec.addEventListener('click', e => {
    if (!mobile()) return;
    const tr = e.target.closest('#pr-comp-body tr.pc-row'); if (!tr || e.target.closest('button, a, input, select')) return;
    if (typeof showFormComposant === 'function') showFormComposant(tr.dataset.cid);
  });
  // dans le formulaire « Modifier », un bouton pour supprimer le composant (les boutons de ligne sont cachés sur téléphone)
  const supp = document.createElement('button'); supp.type = 'button'; supp.className = 'btn d pr-csupp'; supp.textContent = 'Supprimer ce composant';
  supp.addEventListener('click', () => { try { if (typeof curComposant !== 'undefined' && curComposant && typeof removeComposant === 'function') removeComposant(curComposant); } catch (e) {} });
  // formulaire de composant ouvert : on revient à l'étape Composition
  const cform = $('#pr-cform');
  if (cform) {
    const act = cform.querySelector('.at-actions'); if (act) act.appendChild(supp);
    new MutationObserver(() => {
      const ouvert = getComputedStyle(cform).display !== 'none';
      if (ouvert && sec.dataset.step !== '1') etape('1');
      let edition = false; try { edition = typeof curComposant !== 'undefined' && !!curComposant; } catch (e) {}
      supp.style.display = ouvert && edition ? '' : 'none';
    }).observe(cform, { attributes: true, attributeFilter: ['style'] });
  }

  let depart = '1'; try { depart = sessionStorage.getItem(KEY) || '1'; } catch (e) {}
  qm.value = qte.value; etape(depart);
  const sel = $('#pr-modele'); if (sel) sel.addEventListener('change', () => { setTimeout(majResume, 50); });
})();
