/* ============================================================
   Liste déroulante avec RECHERCHE (clients, fournisseurs…)
   Au lieu de faire défiler toute la liste, on tape quelques lettres du nom :
   seules les personnes correspondantes s'affichent. Flèches ↑ ↓ + Entrée, ou clic.
   La vraie <select> reste en place (cachée) : le reste de l'application ne change pas.
   S'applique tout seul, dans toute la plateforme, à chaque liste de 8 choix ou plus
   (clients, fournisseurs, produits, éléments, modèles, ateliers, employés…), à toute <select data-cherche>,
   et toujours aux listes clients / fournisseurs des bons, versements et crédits.
   Pour l'exclure : <select data-nocherche>.
   ============================================================ */
(function () {
  'use strict';
  const TOUJOURS = 'select#cm-contact, select#cf-vc, select#cf-cc, select[data-cherche]';
  const MIN = 8;      // à partir de 8 choix, la liste devient une case de recherche
  const eligible = s => s.tagName === 'SELECT' && !s.multiple && !(s.size > 1) && !s.dataset.nocherche && !s.closest('header, #zs-panel, .lbrand') &&
    (s.matches(TOUJOURS) || s.options.length >= MIN);
  const ACTIFS = new Set();
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
    sel.parentNode.insertBefore(box, sel); box.append(inp, sel); document.body.appendChild(ul);
    sel.classList.add('ch-cache'); sel.tabIndex = -1; sel.setAttribute('aria-hidden', 'true');
    let vus = [], idx = -1;
    const creerFn = () => sel._chCreer || (sel.dataset.creer && window.chCreer && window.chCreer[sel.dataset.creer]) || null;

    const texte = () => { const o = sel.selectedOptions[0]; return o && o.value ? o.textContent : ''; };
    const maj = () => { if (document.activeElement !== inp) { inp.value = texte(); inp.placeholder = '🔍 Tapez le nom pour rechercher…'; } inp.disabled = sel.disabled; };

    function liste() {
      const q = norm(inp.value).split(/\s+/).filter(Boolean);
      const opts = [...sel.options].filter(o => !o.disabled && !o.hidden);
      vus = opts.filter(o => !q.length || (o.value && q.every(m => norm(o.textContent).includes(m))));
      if (!q.length) { const vide = opts.find(o => !o.value); if (vide && vus[0] !== vide) vus.unshift(vide); }
      const total = vus.length; vus = vus.slice(0, 60);
      // création d'un nouvel élément directement depuis la recherche (ex. bon de réception)
      const creer = creerFn();
      const exact = q.length && opts.some(o => o.value && norm(o.textContent) === norm(inp.value));
      if (creer && !exact) vus.push({ creer: true, value: '__creer__', textContent: inp.value.trim() });
      idx = vus.length ? Math.max(0, vus.findIndex(o => o.value === sel.value && o.value)) : -1;
      if (q.length) idx = vus.length ? 0 : -1;
      ul.innerHTML = vus.length
        ? vus.map((o, i) => o.creer ? '<div class="ch-it ch-new' + (i === idx ? ' on' : '') + '" data-i="' + i + '" role="option">➕ ' + (o.textContent ? 'Créer « ' + esc(o.textContent) + ' »' : (sel.dataset.creerTxt || 'Ajouter un nouveau…')) + '</div>' : '<div class="ch-it' + (o.value ? '' : ' ch-vide') + (i === idx ? ' on' : '') + (o.value && o.value === sel.value ? ' sel' : '') + '" data-i="' + i + '" role="option">' + esc(o.textContent) + '</div>').join('') +
          (total > vus.length ? '<div class="ch-plus">… ' + (total - vus.length) + ' autre(s) : tapez plus de lettres</div>' : '')
        : '<div class="ch-plus">Aucun nom ne correspond à « ' + esc(inp.value) + ' »</div>';
      ul.hidden = false; placer(); montrer();
    }
    // liste « flottante » : jamais coupée par un tableau qui défile
    function placer() {
      if (ul.hidden) return;
      const r = inp.getBoundingClientRect(), h = Math.min(300, ul.scrollHeight || 300), bas = window.innerHeight - r.bottom;
      ul.style.left = Math.max(6, Math.min(r.left, window.innerWidth - Math.max(r.width, 260) - 6)) + 'px';
      ul.style.width = Math.max(r.width, 260) + 'px';
      ul.style.top = (bas < h + 12 && r.top > bas ? r.top - h - 4 : r.bottom + 4) + 'px';
    }
    sel._chScroll = () => { if (!ul.hidden) { if (document.activeElement === inp) placer(); else ul.hidden = true; } };
    function montrer() { const e = ul.querySelector('.ch-it.on'); ul.querySelectorAll('.ch-it').forEach((x, i) => x.classList.toggle('on', i === idx)); if (e && e.scrollIntoView) e.scrollIntoView({ block: 'nearest' }); }
    function choisir(o) {
      ul.hidden = true;
      if (!o) { inp.value = texte(); return; }
      if (o.creer) {
        const nom = o.textContent; inp.value = texte();
        Promise.resolve(creerFn()(sel, nom)).then(v => {
          if (!v) return;
          if (![...sel.options].some(x => x.value === v.value)) { const op = new Option(v.label, v.value); (sel.querySelector(v.groupe || 'nothing') || sel).appendChild(op); }
          sel.value = v.value; inp.value = texte();
          sel.dispatchEvent(new Event('input', { bubbles: true })); sel.dispatchEvent(new Event('change', { bubbles: true }));
          if (v.apres) v.apres();
        }).catch(err => alert('Création impossible : ' + (err && err.message || err)));
        return;
      }
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
    sel._chMaj = maj; sel._chUl = ul; ACTIFS.add(sel);
    maj();
  }

  // valeur changée par le code (sel.value = …) : on resynchronise régulièrement les listes affichées
  setInterval(() => ACTIFS.forEach(s => { if (!document.contains(s)) { ACTIFS.delete(s); if (s._chUl) s._chUl.remove(); } else s._chMaj(); }), 700);
  const auScroll = () => ACTIFS.forEach(s => s._chScroll && s._chScroll());
  window.addEventListener('scroll', auScroll, true); window.addEventListener('resize', auScroll);
  const essayer = s => { if (!s.dataset.chOk && eligible(s)) ameliorer(s); };
  const scanner = racine => {
    if (racine.tagName === 'SELECT') return essayer(racine);
    if (racine.tagName === 'OPTION' || racine.tagName === 'OPTGROUP') { const s = racine.closest('select'); if (s) essayer(s); return; }
    if (racine.querySelectorAll) racine.querySelectorAll('select').forEach(essayer);
  };
  new MutationObserver(ms => ms.forEach(m => {
    m.addedNodes.forEach(n => { if (n.nodeType === 1) scanner(n); });
    if (m.target && m.target.tagName === 'SELECT' && m.addedNodes.length) essayer(m.target);      // options ajoutées par innerHTML
  })).observe(document.documentElement, { childList: true, subtree: true });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => scanner(document)); else scanner(document);
  window.selectCherche = ameliorer;
})();
