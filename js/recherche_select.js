/* ============================================================
   Liste déroulante avec RECHERCHE (clients, fournisseurs…)
   Au lieu de faire défiler toute la liste, on tape quelques lettres du nom :
   seules les personnes correspondantes s'affichent. Flèches ↑ ↓ + Entrée, ou clic.
   La vraie <select> reste en place (cachée) : le reste de l'application ne change pas.
   S'applique tout seul aux listes : bons de livraison / réception (#cm-contact),
   versements (#cf-vc), crédits (#cf-cc) et à toute <select data-cherche>.
   ============================================================ */
(function () {
  'use strict';
  const CIBLES = 'select#cm-contact, select#cf-vc, select#cf-cc, select[data-cherche]';
  const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function ameliorer(sel) {
    if (sel.dataset.chOk) return; sel.dataset.chOk = '1';
    const box = document.createElement('div'); box.className = 'ch-box';
    const inp = document.createElement('input');
    inp.type = 'text'; inp.className = 'ch-inp'; inp.autocomplete = 'off'; inp.spellcheck = false;
    inp.placeholder = '🔍 Tapez le nom pour rechercher…';
    if (sel.id) inp.id = sel.id + '-ch';
    const ul = document.createElement('div'); ul.className = 'ch-list'; ul.hidden = true; ul.setAttribute('role', 'listbox');
    sel.parentNode.insertBefore(box, sel); box.append(inp, ul, sel);
    sel.classList.add('ch-cache'); sel.tabIndex = -1; sel.setAttribute('aria-hidden', 'true');
    let vus = [], idx = -1;

    const texte = () => { const o = sel.selectedOptions[0]; return o && o.value ? o.textContent : ''; };
    const maj = () => { if (document.activeElement !== inp) { inp.value = texte(); inp.placeholder = '🔍 Tapez le nom pour rechercher…'; } inp.disabled = sel.disabled; };

    function liste() {
      const q = norm(inp.value).split(/\s+/).filter(Boolean);
      const opts = [...sel.options].filter(o => !o.disabled && !o.hidden);
      vus = opts.filter(o => !q.length || (o.value && q.every(m => norm(o.textContent).includes(m))));
      if (!q.length) { const vide = opts.find(o => !o.value); if (vide && vus[0] !== vide) vus.unshift(vide); }
      const total = vus.length; vus = vus.slice(0, 60);
      idx = vus.length ? Math.max(0, vus.findIndex(o => o.value === sel.value && o.value)) : -1;
      if (q.length) idx = vus.length ? 0 : -1;
      ul.innerHTML = vus.length
        ? vus.map((o, i) => '<div class="ch-it' + (o.value ? '' : ' ch-vide') + (i === idx ? ' on' : '') + (o.value && o.value === sel.value ? ' sel' : '') + '" data-i="' + i + '" role="option">' + esc(o.textContent) + '</div>').join('') +
          (total > vus.length ? '<div class="ch-plus">… ' + (total - vus.length) + ' autre(s) : tapez plus de lettres</div>' : '')
        : '<div class="ch-plus">Aucun nom ne correspond à « ' + esc(inp.value) + ' »</div>';
      ul.hidden = false; montrer();
    }
    function montrer() { const e = ul.querySelector('.ch-it.on'); ul.querySelectorAll('.ch-it').forEach((x, i) => x.classList.toggle('on', i === idx)); if (e && e.scrollIntoView) e.scrollIntoView({ block: 'nearest' }); }
    function choisir(o) {
      ul.hidden = true;
      if (!o) { inp.value = texte(); return; }
      const change = sel.value !== o.value;
      sel.value = o.value; inp.value = o.value ? o.textContent : '';
      if (change) { sel.dispatchEvent(new Event('input', { bubbles: true })); sel.dispatchEvent(new Event('change', { bubbles: true })); }
    }

    // à l'entrée dans la case : elle se vide pour taper directement (le nom choisi reste affiché en gris)
    const ouvrir = () => { const t = texte(); inp.placeholder = t ? t + '  —  tapez pour changer' : '🔍 Tapez le nom pour rechercher…'; inp.value = ''; liste(); };
    inp.addEventListener('focus', ouvrir);
    inp.addEventListener('click', () => { if (ul.hidden) ouvrir(); });
    inp.addEventListener('input', liste);
    inp.addEventListener('beforeinput', () => { if (ul.hidden && inp.value === texte()) { inp.value = ''; } });
    inp.addEventListener('keydown', e => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); if (ul.hidden) return liste(); if (!vus.length) return; idx = (idx + (e.key === 'ArrowDown' ? 1 : vus.length - 1)) % vus.length; ul.querySelectorAll('.ch-it').forEach((x, i) => x.classList.toggle('on', i === idx)); montrer(); }
      else if (e.key === 'Enter') { if (!ul.hidden) { e.preventDefault(); choisir(vus[idx]); } }
      else if (e.key === 'Escape') { if (!ul.hidden) { e.preventDefault(); e.stopPropagation(); ul.hidden = true; inp.value = ''; } }
      else if (e.key === 'Tab') { if (!ul.hidden && inp.value.trim() && vus[idx]) choisir(vus[idx]); else ul.hidden = true; }
    });
    ul.addEventListener('mousedown', e => { const it = e.target.closest('.ch-it'); e.preventDefault(); if (it) choisir(vus[+it.dataset.i]); });
    inp.addEventListener('blur', () => setTimeout(() => {
      if (document.activeElement === inp) return;
      ul.hidden = true; inp.placeholder = '🔍 Tapez le nom pour rechercher…'; inp.value = texte();
    }, 120));
    sel.addEventListener('change', maj);
    new MutationObserver(maj).observe(sel, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled'] });
    // valeur changée par le code (sel.value = …) : on resynchronise régulièrement tant que la liste existe
    const t = setInterval(() => { if (!document.contains(sel)) return clearInterval(t); maj(); }, 700);
    maj();
  }

  const scanner = racine => { (racine.querySelectorAll ? racine : document).querySelectorAll(CIBLES).forEach(ameliorer); if (racine.matches && racine.matches(CIBLES)) ameliorer(racine); };
  new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => { if (n.nodeType === 1) scanner(n); }))).observe(document.documentElement, { childList: true, subtree: true });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => scanner(document)); else scanner(document);
  window.selectCherche = ameliorer;
})();
