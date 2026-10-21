/* Contenu d'un rouleau saisi en YARDS : conversion automatique en mètres (1 yard = 0,9144 m).
   Ajoute un champ « en yards » à côté du champ en mètres, dans le formulaire Stock et dans le formulaire simplifié. */
(function () {
  'use strict';
  const YARD = 0.9144;
  const r2 = n => Math.round(n * 100) / 100;

  function brancher(mId, uniteId) {
    const m = document.getElementById(mId), unite = document.getElementById(uniteId);
    if (!m || !unite || !m.parentElement) return;
    const wrap = m.parentElement;
    const lab = document.createElement('label');
    lab.innerHTML = '<span>Contenu d’un rouleau en yards</span><input type="number" min="0" step="0.01" inputmode="decimal" placeholder="Ex : 50 yards">' +
      '<small class="yd-note" style="color:#7a6a64;font-weight:400">1 yard = 0,9144 m — converti automatiquement en mètres</small>';
    wrap.insertAdjacentElement('afterend', lab);
    const y = lab.querySelector('input'), note = lab.querySelector('.yd-note');

    const visible = () => wrap.style.display !== 'none' && unite.value === 'm';
    const maj = () => { lab.style.display = visible() ? '' : 'none'; };
    const depuisM = () => { const v = parseFloat(m.value); y.value = v > 0 ? r2(v / YARD) : ''; note.textContent = '1 yard = 0,9144 m — converti automatiquement en mètres'; };

    y.addEventListener('input', () => {
      const v = parseFloat(y.value);
      m.value = v > 0 ? r2(v * YARD) : '';
      note.textContent = v > 0 ? v + ' yards = ' + r2(v * YARD) + ' m' : '1 yard = 0,9144 m — converti automatiquement en mètres';
      m.dispatchEvent(new Event('input', { bubbles: true }));
    });
    m.addEventListener('input', e => { if (e.isTrusted) depuisM(); });
    m.addEventListener('change', depuisM);
    unite.addEventListener('change', maj);
    new MutationObserver(() => { maj(); }).observe(wrap, { attributes: true, attributeFilter: ['style'] });
    // le formulaire remplit le champ en mètres par script (modification d'un article) : on resynchronise régulièrement
    setInterval(() => { if (document.activeElement !== y && visible()) { const v = parseFloat(m.value); const cur = parseFloat(y.value); if (!(v > 0)) { if (y.value) y.value = ''; } else if (!(Math.abs(cur * YARD - v) < 0.011)) y.value = r2(v / YARD); } maj(); }, 400);
    maj();
  }
  function init() { brancher('st-acqte', 'st-aunite'); brancher('sp-ncqte', 'sp-nunite'); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
