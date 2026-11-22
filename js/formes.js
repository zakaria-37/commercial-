/* ============================================================
   FORMES DES GABARITS : rectangle, carré, rond, triangle, forme libre (dessinée sur une grille)
   - aire, périmètre, contour (polygone en cm)
   - EMBOÎTEMENT OPTIMISÉ pour le métrage : place occupée par UNE pièce quand on les coupe à la suite
       rectangle / carré : la pièce elle-même
       rond              : en quinconce (rangées décalées) → D × D·√3/2
       triangle          : tête-bêche → base/2 × hauteur
       forme libre       : la meilleure façon parmi « à la suite », « retournée à 180° » (tête-bêche),
                           dans un sens ou dans l'autre, calculée sur le vrai contour
   - éditeur « forme libre » : on clique les points du contour sur une grille en cm
   ============================================================ */
(function () {
  'use strict';
  const num = v => { const x = parseFloat(String(v ?? '').replace(',', '.')); return isFinite(x) ? x : 0; };
  const nf = (n, d) => (Number(n) || 0).toLocaleString('fr-FR', { maximumFractionDigits: d == null ? 1 : d });
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const FORMES = [['rect', 'Rectangle', '▭'], ['carre', 'Carré', '□'], ['rond', 'Rond', '◯'], ['triangle', 'Triangle', '△'], ['libre', 'Forme libre', '✏️']];
  const forme = g => (g && FORMES.some(f => f[0] === g.forme) ? g.forme : 'rect');

  /* ---------- contour (cm, origine en bas à gauche, y vers le haut) ---------- */
  function normaliser(pts) {
    if (!pts || !pts.length) return [];
    const mx = Math.min(...pts.map(p => p[0])), my = Math.min(...pts.map(p => p[1]));
    return pts.map(p => [Math.round((p[0] - mx) * 10) / 10, Math.round((p[1] - my) * 10) / 10]);
  }
  function cercle(d, n) { n = n || 48; const r = d / 2; return Array.from({ length: n }, (_, i) => [r + r * Math.cos(2 * Math.PI * i / n), r + r * Math.sin(2 * Math.PI * i / n)]); }
  function contour(g) {
    const f = forme(g), l = num(g.l), h = num(g.h);
    if (f === 'rond') return cercle(l);
    if (f === 'carre') return [[0, 0], [l, 0], [l, l], [0, l]];
    if (f === 'triangle') { const s = g.sommet == null || g.sommet === '' ? 50 : Math.max(0, Math.min(100, num(g.sommet))); return [[0, 0], [l, 0], [l * s / 100, h]]; }
    if (f === 'libre' && Array.isArray(g.pts) && g.pts.length >= 3) return normaliser(g.pts);
    return [[0, 0], [l, 0], [l, h], [0, h]];
  }
  const bbox = P => { const xs = P.map(p => p[0]), ys = P.map(p => p[1]); return { w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) }; };
  function airePoly(P) { let a = 0; for (let i = 0; i < P.length; i++) { const p = P[i], q = P[(i + 1) % P.length]; a += p[0] * q[1] - q[0] * p[1]; } return Math.abs(a) / 2; }
  function perimPoly(P) { let s = 0; for (let i = 0; i < P.length; i++) { const p = P[i], q = P[(i + 1) % P.length]; s += Math.hypot(q[0] - p[0], q[1] - p[1]); } return s; }
  function aire(g) { const f = forme(g); if (f === 'rond') return Math.PI * Math.pow(num(g.l) / 2, 2); if (f === 'rect') return num(g.l) * num(g.h); return airePoly(contour(g)); }
  function perimetre(g) { const f = forme(g); if (f === 'rond') return Math.PI * num(g.l); if (f === 'rect') return 2 * (num(g.l) + num(g.h)); return perimPoly(contour(g)); }
  /* dimensions d'encombrement (le rectangle autour de la forme) */
  function dims(g) { const f = forme(g); if (f === 'rond' || f === 'carre') return { l: num(g.l), h: num(g.l) }; if (f === 'libre' && Array.isArray(g.pts) && g.pts.length >= 3) { const b = bbox(contour(g)); return { l: b.w, h: b.h }; } return { l: num(g.l), h: num(g.h) }; }

  /* ---------- emboîtement : décalage minimal pour que B (à droite de A) ne touche pas A ----------
     Coupe horizontale tous les h/240 : à chaque hauteur, B doit commencer après la fin de A. */
  function etendue(P, y) {
    let mn = Infinity, mx = -Infinity;
    for (let i = 0; i < P.length; i++) {
      const a = P[i], b = P[(i + 1) % P.length];
      if ((a[1] <= y && y < b[1]) || (b[1] <= y && y < a[1])) { const x = a[0] + (y - a[1]) * (b[0] - a[0]) / (b[1] - a[1]); if (x < mn) mn = x; if (x > mx) mx = x; }
    }
    return mn <= mx ? [mn, mx] : null;
  }
  function decalage(A, B, h) {
    let d = 0; const N = 240;
    for (let k = 0; k < N; k++) { const y = (k + 0.5) * h / N, a = etendue(A, y), b = etendue(B, y); if (a && b) d = Math.max(d, a[1] - b[0]); }
    return d;
  }
  const tourne180 = (P, w, h) => P.map(p => [w - p[0], h - p[1]]);
  const transpose = P => P.map(p => [p[1], p[0]]);
  /* place occupée par une pièce : { w, h, mode, txt } (w × h = surface réellement consommée par pièce, hors marge) */
  const cacheE = new Map();
  function empreinte(g) {
    const f = forme(g), l = num(g.l), h = num(g.h);
    if (f === 'rect') return { w: l, h, mode: 'rect', txt: '' };
    if (f === 'carre') return { w: l, h: l, mode: 'rect', txt: '' };
    if (f === 'rond') return { w: l, h: l * Math.sqrt(3) / 2, mode: 'quinconce', txt: 'en quinconce (rangées décalées)' };
    const P = contour(g); if (P.length < 3) return { w: l, h, mode: 'rect', txt: '' };
    const cle = JSON.stringify(P); if (cacheE.has(cle)) return cacheE.get(cle);
    const b = bbox(P), opts = [{ w: b.w, h: b.h, mode: 'rect', txt: '', axe: 'x', pas: b.w }];
    [false, true].forEach(tr => {
      const Q = tr ? transpose(P) : P, bb = tr ? { w: b.h, h: b.w } : b;
      const same = decalage(Q, Q, bb.h), R = tourne180(Q, bb.w, bb.h), tb = Math.max(decalage(Q, R, bb.h), same / 2);
      const mk = (pas, mode, txt) => tr ? { w: bb.h, h: pas, mode, txt, axe: 'y', pas } : { w: pas, h: bb.h, mode, txt, axe: 'x', pas };
      if (same > 0) opts.push(mk(same, 'suite', 'à la suite, emboîtées'));
      if (tb > 0) opts.push(mk(tb, 'tetebeche', 'tête-bêche (une sur deux retournée)'));
    });
    const best = opts.reduce((m, o) => (o.w * o.h < m.w * m.h - 1e-6 ? o : m));
    cacheE.set(cle, best); return best;
  }

  /* ---------- dessins SVG ---------- */
  const chemin = (P, k, ox, oy, H) => 'M' + P.map(p => ((ox + p[0]) * k).toFixed(1) + ' ' + ((oy + H - p[1]) * k).toFixed(1)).join('L') + 'Z';
  function apercu(g, taille, coul) {
    const P = contour(g); if (P.length < 3 && forme(g) !== 'rond') return '';
    const d = dims(g), m = Math.max(d.l, d.h, 1), k = (taille - 4) / m;
    const body = forme(g) === 'rond' ? '<circle cx="' + (d.l * k / 2 + 2) + '" cy="' + (d.l * k / 2 + 2) + '" r="' + (d.l * k / 2) + '"/>' : '<path d="' + chemin(P, k, 2 / k, 2 / k, d.h) + '"/>';
    return '<svg class="fm-ap" width="' + taille + '" height="' + taille + '" viewBox="0 0 ' + taille + ' ' + taille + '"><g fill="' + (coul || '#e8a6b4') + '" stroke="#333" stroke-width="1">' + body + '</g></svg>';
  }
  /* motif : quelques pièces placées comme dans la coupe (quinconce, tête-bêche…) */
  function motif(g, coul, larg) {
    const f = forme(g), e = empreinte(g), d = dims(g); larg = larg || 300;
    let pieces = [];
    if (f === 'rond') { const D = d.l; for (let r = 0; r < 3; r++) for (let c = 0; c < 5; c++) pieces.push({ c: [c * D + (r % 2 ? D / 2 : 0) + D / 2, r * e.h + D / 2], D }); }
    else {
      const P = contour(g), b = bbox(P), axe = e.axe || 'x', pas = e.pas || (axe === 'x' ? b.w : b.h);
      for (let i = 0; i < 6; i++) {
        const Q = e.mode === 'tetebeche' && i % 2 === 1 ? tourne180(P, b.w, b.h) : P;
        pieces.push({ P: Q.map(p => axe === 'x' ? [p[0] + i * pas, p[1]] : [p[0], p[1] + i * pas]) });
      }
    }
    const all = pieces.flatMap(p => p.P ? p.P : [[p.c[0] - p.D / 2, p.c[1] - p.D / 2], [p.c[0] + p.D / 2, p.c[1] + p.D / 2]]);
    const W = Math.max(...all.map(p => p[0])), H = Math.max(...all.map(p => p[1]));
    const k = Math.min(larg / W, 140 / H);
    const body = pieces.map(p => p.P ? '<path d="' + chemin(p.P, k, 0, 0, H) + '"/>' : '<circle cx="' + (p.c[0] * k) + '" cy="' + ((H - p.c[1]) * k) + '" r="' + (p.D / 2 * k) + '"/>').join('');
    return '<svg class="fm-motif" viewBox="-2 -2 ' + (W * k + 4) + ' ' + (H * k + 4) + '" width="' + (W * k + 4) + '" height="' + (H * k + 4) + '"><g fill="' + (coul || '#e8a6b4') + '" stroke="#444" stroke-width=".8">' + body + '</g></svg>';
  }

  /* ============================================================
     ÉDITEUR « FORME LIBRE » : grille en cm, on clique les points du contour
     - clic sur la grille : ajoute un point (aimanté au 0,5 cm)
     - glisser un point : le déplace ; double-clic (ou appui long) sur un point : le supprime
     - « + » au milieu d'un côté : insère un point
     - départ rapide : rectangle, rond, triangle, puis on modifie
     ============================================================ */
  function editer(g, opts) {
    opts = opts || {};
    return new Promise(resolve => {
      let pts = (Array.isArray(g.pts) && g.pts.length >= 3 ? normaliser(g.pts) : (num(g.l) > 0 && num(g.h) > 0 ? contour(Object.assign({}, g, { forme: forme(g) === 'libre' ? 'rect' : forme(g) })) : [])).map(p => [p[0] + 2, p[1] + 2]);
      if (forme(g) === 'rond' && pts.length) pts = cercle(num(g.l), 24).map(p => [p[0] + 2, p[1] + 2]);
      const hist = [];
      const bg = document.createElement('div'); bg.className = 'fm-bg';
      bg.innerHTML = '<div class="fm-dlg" role="dialog" aria-label="Dessiner le gabarit">' +
        '<div class="fm-top"><div><span class="fm-k">Forme libre</span><h3>' + esc(g.nom || 'Gabarit') + '</h3></div><div class="fm-mes" id="fm-mes"></div></div>' +
        '<div class="fm-tools"><span>Départ :</span><button type="button" class="btn s" data-fm="rect">▭ Rectangle</button><button type="button" class="btn s" data-fm="rond">◯ Rond</button><button type="button" class="btn s" data-fm="tri">△ Triangle</button>' +
        '<span class="fm-sep"></span><button type="button" class="btn s" data-fm="undo">↶ Annuler</button><button type="button" class="btn s" data-fm="miroir" title="Symétrie gauche / droite">⇋ Miroir</button><button type="button" class="btn s d" data-fm="vider">Effacer</button>' +
        '<span class="fm-sep"></span><label>Zoom<select id="fm-zoom"><option value="30">30 cm</option><option value="50">50 cm</option><option value="80">80 cm</option><option value="120">120 cm</option></select></label></div>' +
        '<div class="fm-zone"><svg id="fm-svg" xmlns="http://www.w3.org/2000/svg"></svg></div>' +
        '<p class="fm-help"><b>Cliquez sur la grille</b> pour poser les points du contour, dans l’ordre. <b>Glissez</b> un point pour le déplacer, <b>double-cliquez</b> (ou appui long) sur un point pour le supprimer, cliquez le <b>＋</b> au milieu d’un côté pour ajouter un point. Pour un arrondi, mettez plusieurs points rapprochés. 1 carreau = 1 cm.</p>' +
        '<div class="fm-size"><label>Largeur totale (cm)<input id="fm-w" type="number" min="0" step="0.1" inputmode="decimal"></label><label>Hauteur totale (cm)<input id="fm-h" type="number" min="0" step="0.1" inputmode="decimal"></label><small>Changer une mesure agrandit ou réduit la forme.</small></div>' +
        '<div class="fm-act"><button type="button" class="btn p" data-fm="ok">✔ Utiliser cette forme</button><button type="button" class="btn" data-fm="annuler">Annuler</button></div></div>';
      document.body.appendChild(bg);
      const svg = bg.querySelector('#fm-svg'), zoomSel = bg.querySelector('#fm-zoom');
      let S = 50; const b0 = pts.length ? bbox(pts) : { w: 0, h: 0 };
      S = [30, 50, 80, 120].find(z => z >= Math.max(b0.w, b0.h) + 6) || 120; zoomSel.value = S;
      const snap = v => Math.round(v * 2) / 2;
      const sauve = () => { hist.push(JSON.stringify(pts)); if (hist.length > 60) hist.shift(); };
      function dessiner() {
        const k = 600 / S; let s = '';
        svg.setAttribute('viewBox', '0 0 600 600');
        // grille : le 0 est au coin bas-gauche de la forme (O = 2 cm de marge pour pouvoir cliquer)
        const O = 2;
        for (let i = 0; i <= S; i++) { const j = i - O, maj = j % 10 === 0, mid = j % 5 === 0, w = maj ? 1.2 : mid ? .7 : .3, c = maj ? '#9c8f93' : '#d9d1d3'; s += '<line x1="' + i * k + '" y1="0" x2="' + i * k + '" y2="600" stroke="' + c + '" stroke-width="' + w + '"/><line x1="0" y1="' + (600 - i * k) + '" x2="600" y2="' + (600 - i * k) + '" stroke="' + c + '" stroke-width="' + w + '"/>'; if (maj && j >= 0) s += '<text x="' + (i * k + 2) + '" y="596" class="fm-t">' + j + '</text>' + (j ? '<text x="2" y="' + (600 - i * k - 2) + '" class="fm-t">' + j + '</text>' : ''); }
        if (pts.length >= 2) s += '<path d="M' + pts.map(p => p[0] * k + ' ' + (600 - p[1] * k)).join('L') + (pts.length >= 3 ? 'Z' : '') + '" fill="' + (pts.length >= 3 ? 'rgba(232,166,180,.55)' : 'none') + '" stroke="#b3261e" stroke-width="2"/>';
        if (pts.length >= 3) pts.forEach((p, i) => { const q = pts[(i + 1) % pts.length], mx = (p[0] + q[0]) / 2, my = (p[1] + q[1]) / 2; s += '<g class="fm-mid" data-mid="' + i + '"><circle cx="' + mx * k + '" cy="' + (600 - my * k) + '" r="7"/><text x="' + mx * k + '" y="' + (600 - my * k + 4) + '" text-anchor="middle">+</text></g>'; });
        // cotes : longueur de chaque côté (à l'extérieur de la forme) + largeur et hauteur totales
        if (pts.length >= 2) {
          let sa = 0; for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; sa += a[0] * b[1] - b[0] * a[1]; }
          const sens = sa >= 0 ? 1 : -1, nE = pts.length >= 3 ? pts.length : 1;
          for (let i = 0; i < nE; i++) {
            const a = pts[i], b = pts[(i + 1) % pts.length], dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy); if (L < 0.25) continue;
            const nx = dy / L * sens, ny = -dx / L * sens, off = 15 / k, mx = (a[0] + b[0]) / 2 + nx * off, my = (a[1] + b[1]) / 2 + ny * off;
            s += '<text class="fm-cote" x="' + (mx * k) + '" y="' + (600 - my * k + 4) + '" text-anchor="middle">' + nf(L) + '</text>';
          }
          if (pts.length >= 3) {
            const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]), x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
            const yb = 600 - y1 * k - 26, xg = x1 * k + 26;
            s += '<g class="fm-tot"><line x1="' + x0 * k + '" y1="' + yb + '" x2="' + x1 * k + '" y2="' + yb + '"/><line x1="' + x0 * k + '" y1="' + (yb - 6) + '" x2="' + x0 * k + '" y2="' + (yb + 6) + '"/><line x1="' + x1 * k + '" y1="' + (yb - 6) + '" x2="' + x1 * k + '" y2="' + (yb + 6) + '"/>' +
              '<text x="' + ((x0 + x1) / 2 * k) + '" y="' + (yb - 6) + '" text-anchor="middle">largeur ' + nf(x1 - x0) + ' cm</text>' +
              '<line x1="' + xg + '" y1="' + (600 - y0 * k) + '" x2="' + xg + '" y2="' + (600 - y1 * k) + '"/><line x1="' + (xg - 6) + '" y1="' + (600 - y0 * k) + '" x2="' + (xg + 6) + '" y2="' + (600 - y0 * k) + '"/><line x1="' + (xg - 6) + '" y1="' + (600 - y1 * k) + '" x2="' + (xg + 6) + '" y2="' + (600 - y1 * k) + '"/>' +
              '<text transform="translate(' + (xg + 16) + ' ' + (600 - (y0 + y1) / 2 * k) + ') rotate(90)" text-anchor="middle">hauteur ' + nf(y1 - y0) + ' cm</text></g>';
          }
        }
        pts.forEach((p, i) => { s += '<circle class="fm-pt' + (i === 0 ? ' fm-p0' : '') + '" data-pt="' + i + '" cx="' + p[0] * k + '" cy="' + (600 - p[1] * k) + '" r="8"/>'; });
        svg.innerHTML = s;
        const ok = pts.length >= 3, b = ok ? bbox(pts) : { w: 0, h: 0 };
        bg.querySelector('#fm-mes').innerHTML = ok ? '<b>' + nf(b.w) + ' × ' + nf(b.h) + ' cm</b><span>surface ' + nf(airePoly(pts)) + ' cm² · périmètre ' + nf(perimPoly(pts)) + ' cm · ' + pts.length + ' points</span>' : '<span>Posez au moins 3 points</span>';
        const iw = bg.querySelector('#fm-w'), ih = bg.querySelector('#fm-h');
        if (document.activeElement !== iw) iw.value = ok ? Math.round(b.w * 10) / 10 : '';
        if (document.activeElement !== ih) ih.value = ok ? Math.round(b.h * 10) / 10 : '';
        bg.querySelector('[data-fm=ok]').disabled = !ok;
      }
      const pos = ev => { const pt = svg.createSVGPoint(); pt.x = ev.clientX; pt.y = ev.clientY; const p = pt.matrixTransform(svg.getScreenCTM().inverse()), k = 600 / S; return [Math.max(0, Math.min(S, snap(p.x / k))), Math.max(0, Math.min(S, snap((600 - p.y) / k)))]; };
      let drag = null, appui = null, bouge = false;
      svg.addEventListener('pointerdown', ev => {
        const c = ev.target.closest('[data-pt]'), m = ev.target.closest('[data-mid]');
        if (c) { ev.preventDefault(); sauve(); drag = +c.dataset.pt; bouge = false; svg.setPointerCapture(ev.pointerId); clearTimeout(appui); appui = setTimeout(() => { if (!bouge && drag != null && pts.length > 3) { pts.splice(drag, 1); drag = null; dessiner(); } }, 650); return; }
        if (m) { ev.preventDefault(); sauve(); const i = +m.dataset.mid, p = pts[i], q = pts[(i + 1) % pts.length]; pts.splice(i + 1, 0, [snap((p[0] + q[0]) / 2), snap((p[1] + q[1]) / 2)]); drag = i + 1; bouge = false; svg.setPointerCapture(ev.pointerId); dessiner(); return; }
        sauve(); pts.push(pos(ev)); dessiner();
      });
      svg.addEventListener('pointermove', ev => { if (drag == null) return; const p = pos(ev); if (!pts[drag] || (p[0] === pts[drag][0] && p[1] === pts[drag][1])) return; bouge = true; clearTimeout(appui); pts[drag] = p; dessiner(); });
      const fin = () => { clearTimeout(appui); drag = null; };
      svg.addEventListener('pointerup', fin); svg.addEventListener('pointercancel', fin);
      svg.addEventListener('dblclick', ev => { const c = ev.target.closest('[data-pt]'); if (c && pts.length > 3) { sauve(); pts.splice(+c.dataset.pt, 1); dessiner(); } });
      zoomSel.addEventListener('change', () => { S = +zoomSel.value; dessiner(); });
      const redim = (axe, v) => { if (pts.length < 3 || !(v > 0)) return; const b = bbox(pts), base = axe === 'w' ? b.w : b.h; if (!(base > 0)) return; sauve(); const f = v / base, mx = Math.min(...pts.map(p => p[0])), my = Math.min(...pts.map(p => p[1])); pts = pts.map(p => axe === 'w' ? [Math.round((mx + (p[0] - mx) * f) * 10) / 10, p[1]] : [p[0], Math.round((my + (p[1] - my) * f) * 10) / 10]); const nb = bbox(pts); if (Math.max(nb.w, nb.h) + 4 > S) { S = [30, 50, 80, 120].find(z => z >= Math.max(nb.w, nb.h) + 4) || 120; zoomSel.value = S; } dessiner(); };
      bg.querySelector('#fm-w').addEventListener('change', e => redim('w', num(e.target.value)));
      bg.querySelector('#fm-h').addEventListener('change', e => redim('h', num(e.target.value)));
      const fermer = v => { document.removeEventListener('keydown', clav, true); bg.remove(); resolve(v); };
      const clav = e => { if (e.key === 'Escape') { e.stopPropagation(); fermer(null); } else if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); if (hist.length) { pts = JSON.parse(hist.pop()); dessiner(); } } };
      document.addEventListener('keydown', clav, true);
      bg.addEventListener('click', e => {
        const a = e.target.closest('[data-fm]'); if (!a) { if (e.target === bg) fermer(null); return; }
        const t = a.dataset.fm, L = Math.max(num(g.l), 10), H = Math.max(num(g.h), 10);
        if (t === 'annuler') return fermer(null);
        if (t === 'ok') { if (pts.length < 3) return; const P = normaliser(pts), b = bbox(P); return fermer({ pts: P, l: Math.round(b.w * 10) / 10, h: Math.round(b.h * 10) / 10, p: Math.round(perimPoly(P) * 10) / 10 }); }
        if (t === 'undo') { if (hist.length) { pts = JSON.parse(hist.pop()); dessiner(); } return; }
        sauve();
        if (t === 'vider') pts = [];
        if (t === 'rect') pts = [[2, 2], [2 + L, 2], [2 + L, 2 + H], [2, 2 + H]];
        if (t === 'rond') pts = cercle(Math.min(L, H), 24).map(p => [Math.round((p[0] + 2) * 10) / 10, Math.round((p[1] + 2) * 10) / 10]);
        if (t === 'tri') pts = [[2, 2], [2 + L, 2], [2 + L / 2, 2 + H]];
        if (t === 'miroir' && pts.length) { const b = bbox(pts), mx = Math.min(...pts.map(p => p[0])); pts = pts.map(p => [Math.round((mx + b.w - (p[0] - mx)) * 10) / 10, p[1]]).reverse(); }
        const nb = pts.length ? bbox(pts) : { w: 0, h: 0 }; if (Math.max(nb.w, nb.h) + 4 > S) { S = [30, 50, 80, 120].find(z => z >= Math.max(nb.w, nb.h) + 4) || 120; zoomSel.value = S; }
        dessiner();
      });
      dessiner();
    });
  }

  window.Formes = { FORMES, forme, contour, aire, perimetre, dims, empreinte, apercu, motif, editer };
})();
