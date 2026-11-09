/* ============================================================
   GABARITS → MÉTRAGE DE TISSU PAR PRODUIT (tissu principal, doublure, PVC…)

   Méthode (celle de l'atelier) :
   1. Surface de référence = largeur du rouleau (1,40 m) × 1 m de longueur.
   2. Pour chaque élément (face, dos, soufflet, poche…) : combien de pièces de ce gabarit
      on coupe dans cette surface. La plateforme cherche le MEILLEUR rangement :
      rangées dans un sens, puis le reste rempli avec le gabarit tourné (si autorisé).
   3. Mètres pour l'élément = nombre de cet élément dans 1 produit ÷ pièces dans 1 m.
   4. Assemblage : métrage du produit = somme des mètres de tous ses éléments.
   ============================================================ */
(function () {
  'use strict';
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const nf = (n, d) => (Number(n) || 0).toLocaleString('fr-FR', { maximumFractionDigits: d == null ? 2 : d });
  const num = v => { const x = parseFloat(String(v ?? '').replace(',', '.')); return isFinite(x) ? x : 0; };
  const COUL = ['#e8a6b4', '#9cc5e8', '#b9dfa6', '#f2d38a', '#c8b3e6', '#f4b183', '#9fd8cf', '#e3b5d0', '#c9c9c9', '#a8c3a0'];
  const LONG = 100;      // 1 mètre de longueur

  /* Nombre maximum de rectangles w × h dans W × H (cm).
     On essaie : a rangées dans le sens normal + le reste de la longueur en rangées tournées,
     et la même chose en colonnes. Renvoie le nombre et le plan (pour le dessin). */
  function maxPieces(W, H, w, h, rot) {
    let best = { n: 0, blocs: [] };
    const essai = blocs => { const n = blocs.reduce((s, b) => s + b.nx * b.ny, 0); if (n > best.n) best = { n, blocs }; };
    // rangées : a rangées (w × h) puis rangées tournées (h × w) dans la hauteur restante
    for (let a = 0; a <= Math.floor(H / h); a++) {
      const b1 = { x: 0, y: 0, w, h, nx: Math.floor(W / w), ny: a };
      const resteH = H - a * h;
      const b2 = rot ? { x: 0, y: a * h, w: h, h: w, nx: Math.floor(W / h), ny: Math.floor(resteH / w) } : { nx: 0, ny: 0 };
      essai([b1, b2].filter(b => b.nx > 0 && b.ny > 0));
    }
    if (rot) {
      // colonnes : c colonnes (w × h) puis colonnes tournées dans la largeur restante
      for (let c = 0; c <= Math.floor(W / w); c++) {
        const b1 = { x: 0, y: 0, w, h, nx: c, ny: Math.floor(H / h) };
        const b2 = { x: c * w, y: 0, w: h, h: w, nx: Math.floor((W - c * w) / h), ny: Math.floor(H / w) };
        essai([b1, b2].filter(b => b.nx > 0 && b.ny > 0));
      }
      // tout tourné
      essai([{ x: 0, y: 0, w: h, h: w, nx: Math.floor(W / h), ny: Math.floor(H / w) }].filter(b => b.nx > 0 && b.ny > 0));
    }
    return best;
  }

  function calculer(cfg) {
    const W = num(cfg.laize) || 140, marge = Math.max(0, num(cfg.marge));
    const items = (cfg.items || []).map((g, t) => ({ ...g, t, l: num(g.l), h: num(g.h), n: Math.max(0, num(g.n)) })).filter(g => g.l > 0 && g.h > 0 && g.n > 0);
    if (!items.length) return null;
    const lignes = items.map(g => {
      const r = maxPieces(W, LONG, g.l + marge, g.h + marge, !!g.rot);
      return { g, pieces: r.n, blocs: r.blocs, metres: r.n ? g.n / r.n : null };
    });
    const ko = lignes.filter(x => !x.pieces);
    if (ko.length) return { lignes, W, marge, erreur: 'Gabarit trop grand pour 1 m × ' + nf(W / 100, 2) + ' m : ' + ko.map(x => x.g.nom || 'sans nom').join(', ') + '.' };
    const total = lignes.reduce((s, x) => s + x.metres, 0);
    return { lignes, W, marge, total };
  }

  /* petit dessin de la surface 1,40 m × 1 m remplie par un gabarit */
  function dessin(x, W, coul) {
    const sc = 0.62, m = x.g ? 0 : 0;
    let s = '<svg viewBox="0 0 ' + (W * sc) + ' ' + (LONG * sc) + '" width="' + Math.round(W * sc) + '" height="' + Math.round(LONG * sc) + '" class="cp-svg"><rect x="0" y="0" width="' + (W * sc) + '" height="' + (LONG * sc) + '" fill="#f6f2f3" stroke="#999" stroke-width="0.6"/>';
    (x.blocs || []).forEach(b => { for (let i = 0; i < b.nx; i++) for (let j = 0; j < b.ny; j++)
      s += '<rect x="' + ((b.x + i * b.w) * sc + 0.4) + '" y="' + ((b.y + j * b.h) * sc + 0.4) + '" width="' + Math.max(0.5, b.w * sc - 0.8) + '" height="' + Math.max(0.5, b.h * sc - 0.8) + '" fill="' + coul + '" stroke="#555" stroke-width="0.4"/>'; });
    return s + '</svg>';
  }

  /* ---------- Fenêtre ---------- */
  function ouvrir(ligneId) {
    const l = (typeof LIGNES !== 'undefined' ? LIGNES : []).find(x => String(x.id) === String(ligneId)); if (!l) return;
    const art = window.StockAPI && l.article_id ? StockAPI.byId(l.article_id) : null;
    const g0 = l.gabarits && typeof l.gabarits === 'object' ? l.gabarits : {};
    const cfg = { laize: g0.laize || 140, marge: g0.marge ?? 0, items: (g0.items && g0.items.length ? g0.items : [{ nom: 'Face', l: '', h: '', n: 1, rot: true }]).map(x => ({ ...x })) };
    const prixM = () => typeof prixLigne === 'function' ? prixLigne(l) : Number(l.prix_unitaire) || 0;
    const bg = document.createElement('div'); bg.className = 'cp-bg'; document.body.appendChild(bg);

    const ligneG = (g, i) => '<tr data-i="' + i + '"><td><span class="cp-nm"><i class="cp-c" style="background:' + COUL[i % COUL.length] + '"></i><input data-k="nom" value="' + esc(g.nom || '') + '" placeholder="Face, dos, soufflet…" maxlength="40"></span></td>' +
      '<td><input data-k="l" type="number" min="0" step="0.1" inputmode="decimal" value="' + esc(g.l) + '" placeholder="cm"></td>' +
      '<td><input data-k="h" type="number" min="0" step="0.1" inputmode="decimal" value="' + esc(g.h) + '" placeholder="cm"></td>' +
      '<td><input data-k="n" type="number" min="1" step="1" inputmode="numeric" value="' + esc(g.n) + '"></td>' +
      '<td style="text-align:center"><input data-k="rot" type="checkbox"' + (g.rot ? ' checked' : '') + ' title="Peut être tourné (sens du tissu)"></td>' +
      '<td class="cp-pc n"></td><td class="cp-m n"></td><td><button type="button" class="btn s d" data-del="' + i + '" title="Supprimer">×</button></td></tr>';
    bg.innerHTML = '<div class="cp-box"><div class="at-actions" style="margin-top:0"><h3 style="margin:0 auto 0 0">📐 Métrage par gabarits — ' + esc(typeof nomLigne === 'function' ? nomLigne(l) : l.designation) + '</h3><button type="button" class="btn s" id="cp-x">Fermer</button></div>' +
      '<ol class="cp-steps"><li>Pour chaque élément du produit, mesurez le <b>gabarit</b> (largeur × hauteur en cm) et combien il en faut pour <b>1 produit</b>.</li>' +
      '<li>La plateforme compte combien de pièces de cet élément tiennent dans <b>' + '<span id="cp-surf">1,40 m × 1 m</span></b> de tissu (meilleur rangement).</li>' +
      '<li>Elle assemble tous les éléments : <b>métrage du produit = Σ (nombre par produit ÷ pièces dans 1 m)</b>.</li></ol>' +
      '<div class="cp-cfg"><label>Largeur du rouleau (cm)<input id="cp-laize" type="number" min="10" step="1" value="' + esc(cfg.laize) + '"></label>' +
      '<label>Espace entre pièces (cm)<input id="cp-marge" type="number" min="0" step="0.1" value="' + esc(cfg.marge) + '"></label></div>' +
      '<div class="tw"><table class="iv-tbl cp-tbl"><thead><tr><th>Élément</th><th>Largeur (cm)</th><th>Hauteur (cm)</th><th>Nb / produit</th><th>Tourner</th><th class="n">Pièces dans 1 m</th><th class="n">Mètres / produit</th><th></th></tr></thead>' +
      '<tbody id="cp-g">' + cfg.items.map(ligneG).join('') + '</tbody><tfoot><tr class="cp-tot"><td colspan="6">Total pour 1 produit (assemblage de tous les éléments)</td><td class="n" id="cp-total">—</td><td></td></tr></tfoot></table></div>' +
      '<div class="at-actions"><button type="button" class="btn s" id="cp-add">+ Ajouter un élément</button></div>' +
      '<div id="cp-res"></div><div id="cp-plans" class="cp-plans"></div></div>';

    function lire() {
      cfg.laize = num(bg.querySelector('#cp-laize').value) || 140; cfg.marge = Math.max(0, num(bg.querySelector('#cp-marge').value));
      bg.querySelectorAll('#cp-g tr[data-i]').forEach(tr => { const g = cfg.items[+tr.dataset.i]; if (!g) return;
        tr.querySelectorAll('[data-k]').forEach(inp => { g[inp.dataset.k] = inp.type === 'checkbox' ? inp.checked : inp.value; }); });
    }
    let res = null;
    function calc() {
      lire(); res = calculer(cfg);
      bg.querySelector('#cp-surf').textContent = nf(cfg.laize / 100, 2) + ' m × 1 m';
      const pm = prixM();
      bg.querySelectorAll('#cp-g tr[data-i]').forEach(tr => {
        const x = res && res.lignes.find(y => y.g.t === +tr.dataset.i);
        tr.querySelector('.cp-pc').innerHTML = x ? (x.pieces ? '<b>' + x.pieces + '</b>' : '<span class="cp-err">trop grand</span>') : '—';
        tr.querySelector('.cp-m').innerHTML = x && x.metres ? '<b>' + nf(x.metres, 4) + ' m</b><small>' + nf(x.g.n, 2) + ' ÷ ' + x.pieces + '</small>' : '—';
      });
      const tot = bg.querySelector('#cp-total'), out = bg.querySelector('#cp-res'), plans = bg.querySelector('#cp-plans');
      if (!res || res.erreur) {
        tot.textContent = '—';
        out.innerHTML = res && res.erreur ? '<p class="cp-err">⚠ ' + esc(res.erreur) + '</p>' : '<p class="cp-help">Indiquez au moins un élément (largeur, hauteur, nombre par produit).</p>';
      } else {
        tot.innerHTML = '<b>' + nf(res.total, 4) + ' m</b>';
        const rl = art && window.StockAPI && StockAPI.aCond(art) ? StockAPI.condQte(art) : 0;
        out.innerHTML = '<div class="cp-res"><div><span>Tissu pour 1 produit</span><b>' + nf(res.total, 4) + ' m</b><small>' + nf(res.total * 100, 1) + ' cm de rouleau' + (pm ? ' · ' + nf(res.total * pm, 2) + ' DA' : '') + '</small></div>' +
          (rl ? '<div><span>1 ' + esc(art.cond_nom) + ' du stock (' + nf(rl, 2) + ' m)</span><b>' + nf(Math.floor(rl / res.total), 0) + ' produits</b><small>avec ce tissu</small></div>' : '') +
          '<div><span>1 mètre de tissu</span><b>' + nf(1 / res.total, 2) + ' produits</b><small>' + nf(cfg.laize / 100, 2) + ' m × 1 m</small></div></div>' +
          '<div class="at-actions"><button type="button" class="btn p" id="cp-apply">Appliquer au coût : ' + nf(res.total, 4) + ' m par produit</button><button type="button" class="btn" id="cp-save">Enregistrer sans appliquer</button></div>' +
          '<p class="cp-help">La chute est déjà comptée (pièces entières dans 1 m) : la colonne « Chute » de la ligne sera mise à 0 %.</p>';
      }
      plans.innerHTML = res ? res.lignes.filter(x => x.pieces).map(x => '<figure>' + dessin(x, res.W, COUL[x.g.t % COUL.length]) + '<figcaption><b>' + esc(x.g.nom || 'Élément') + '</b> : ' + x.pieces + ' pièces dans 1 m</figcaption></figure>').join('') : '';
    }
    async function enregistrer(appliquer) {
      lire(); const r = calculer(cfg);
      const gab = { laize: cfg.laize, marge: cfg.marge, items: cfg.items.filter(g => num(g.l) > 0 || (g.nom || '').trim()).map(g => ({ nom: g.nom || '', l: num(g.l), h: num(g.h), n: Math.max(1, num(g.n) || 1), rot: !!g.rot })) };
      const patch = { gabarits: gab };
      if (appliquer) {
        if (!r || r.erreur) { alert(r && r.erreur || 'Calcul impossible.'); return; }
        gab.resultat = { m_piece: Math.round(r.total * 10000) / 10000, le: new Date().toISOString().slice(0, 10) };
        patch.quantite = gab.resultat.m_piece; patch.perte_pct = 0;
        if (l.unite !== 'm') { if (!confirm('Cette ligne est en « ' + l.unite + ' ». Le calcul donne des mètres : passer la ligne en mètres ?')) return; patch.unite = 'm'; }
      }
      const q = await sb.from('produit_lignes').update(patch).eq('id', l.id).select();
      if (q.error) { alert('Erreur : ' + q.error.message); return; }
      Object.assign(l, q.data && q.data[0] ? q.data[0] : patch);
      bg.remove();
      if (typeof renderProduits === 'function') renderProduits();
      if (typeof toastD === 'function') toastD(appliquer ? 'Métrage appliqué : ' + nf(patch.quantite, 4) + ' m par produit.' : 'Gabarits enregistrés.');
    }

    calc();
    bg.addEventListener('input', e => { if (e.target.closest('.cp-box')) calc(); });
    bg.addEventListener('change', e => { if (e.target.type === 'checkbox') calc(); });
    bg.addEventListener('click', e => {
      const t = e.target;
      if (t.id === 'cp-x' || t === bg) { bg.remove(); return; }
      if (t.id === 'cp-add') { lire(); cfg.items.push({ nom: '', l: '', h: '', n: 1, rot: true }); bg.querySelector('#cp-g').innerHTML = cfg.items.map(ligneG).join(''); calc(); const ins = bg.querySelectorAll('#cp-g [data-k=nom]'); ins[ins.length - 1].focus(); return; }
      const d = t.closest('[data-del]'); if (d) { lire(); cfg.items.splice(+d.dataset.del, 1); bg.querySelector('#cp-g').innerHTML = cfg.items.map(ligneG).join(''); calc(); return; }
      if (t.id === 'cp-apply') { enregistrer(true); return; }
      if (t.id === 'cp-save') { enregistrer(false); return; }
    });
    bg.addEventListener('keydown', e => { if (e.key === 'Escape') bg.remove(); });
    setTimeout(() => { const f = bg.querySelector('#cp-g [data-k=l]'); if (f && !f.value) f.focus(); }, 50);
  }

  window.Calepinage = { calculer, maxPieces, ouvrir };
  window.ouvrirCalepinage = ouvrir;
})();
