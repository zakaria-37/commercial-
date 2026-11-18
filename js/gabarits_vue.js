/* ============================================================
   SECTION « GABARITS » — où et comment chaque gabarit se place dans le rouleau
   Mêmes calculs que le coût de revient (📐 / 📏) avec plus de détails :
   - pour chaque matière (tissu, doublure, PVC…) : chaque gabarit dessiné sur la largeur du rouleau,
     pièces côte à côte, chute de largeur, pièces dans 1 m, mètres par produit ;
   - plan de coupe pour une production de N produits : rangées réelles, longueur totale, rouleaux ;
   - longueurs (fermeture, curseur, tafta, liseré…) détaillées pour 1 produit et pour N.
   ============================================================ */
(function () {
  'use strict';
  const root = () => document.getElementById('gb-root');
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const nf = (n, d) => (Number(n) || 0).toLocaleString('fr-FR', { maximumFractionDigits: d == null ? 2 : d });
  const num = v => { const x = parseFloat(String(v ?? '').replace(',', '.')); return isFinite(x) ? x : 0; };
  const COUL = ['#e8a6b4', '#9cc5e8', '#b9dfa6', '#f2d38a', '#c8b3e6', '#f4b183', '#9fd8cf', '#e3b5d0', '#c9c9c9', '#a8c3a0'];
  const MES = { p: 'Périmètre', gc: 'Grand côté', pc: 'Petit côté', l: 'Largeur', h: 'Hauteur' };
  let sel = null, N = 100, manuel = {};
  try { sel = sessionStorage.getItem('mariabag_gb_produit'); manuel = JSON.parse(sessionStorage.getItem('mariabag_gb_nmanuel') || '{}') || {}; } catch (e) {}
  /* Quantité suivie : celle de la DERNIÈRE production lancée (bon de sortie) du modèle de ce produit.
     Si l'utilisateur tape une autre quantité, elle est gardée pour ce produit jusqu'au bouton « Production ». */
  const derniereProd = p => {
    if (!p || !p.modele_id || !window.BonsSortie) return null;
    return (BonsSortie.liste() || []).filter(b => b.statut !== 'annule' && String(b.modele_id) === String(p.modele_id) && Number(b.quantite) > 0)
      .sort((a, b) => String(b.date_bon || '').localeCompare(String(a.date_bon || '')) || String(b.created_at || '').localeCompare(String(a.created_at || '')))[0] || null;
  };
  const qteProd = () => { const q = parseInt(document.getElementById('pr-qte') && document.getElementById('pr-qte').value, 10); return q > 0 ? q : 0; };
  function fixerN(p) {
    const m = p && manuel[p.id], b = derniereProd(p);
    N = m > 0 ? m : b ? Math.round(Number(b.quantite)) : (qteProd() || 100);
    return { m: m > 0, b };
  }
  const garderManuel = () => { try { sessionStorage.setItem('mariabag_gb_nmanuel', JSON.stringify(manuel)); } catch (x) {} };

  const produits = () => (typeof PRODUITS !== 'undefined' ? PRODUITS : []);
  const lignes = id => (typeof LIGNES !== 'undefined' ? LIGNES : []).filter(l => String(l.produit_id) === String(id) && !l.sous_produit_id);
  const lib = p => (p && p.gabarits && Array.isArray(p.gabarits.items) ? p.gabarits.items : []);
  const nomL = l => typeof nomLigne === 'function' ? nomLigne(l) : l.designation;
  const prixL = l => typeof prixLigne === 'function' ? prixLigne(l) : Number(l.prix_unitaire) || 0;
  const article = l => window.StockAPI && l.article_id ? StockAPI.byId(l.article_id) : null;

  /* ---------- dessin : un gabarit sur la largeur du rouleau (1 rangée + cotes) ---------- */
  function rangee(x, W, coul) {
    const court = x.court, long = x.long, n = Math.floor(W / court), reste = W - n * court;
    const S = 300 / W, h = Math.max(40, Math.min(160, long * S)), w = 300;
    let s = '<svg viewBox="-6 -14 ' + (w + 52) + ' ' + (h + 34) + '" class="gb-row" role="img" aria-label="' + n + ' pièces dans la largeur">';
    s += '<rect x="0" y="0" width="' + w + '" height="' + h + '" fill="#f6f2f3" stroke="#8a8085" stroke-width="1"/>';
    for (let i = 0; i < n; i++) s += '<rect x="' + (i * court * S + .6) + '" y=".6" width="' + Math.max(1, court * S - 1.2) + '" height="' + (h - 1.2) + '" fill="' + coul + '" stroke="#555" stroke-width=".6"/>';
    if (reste > 0.01) s += '<rect x="' + (n * court * S) + '" y="0" width="' + (reste * S) + '" height="' + h + '" fill="url(#gbHach)"/>';
    s += '<defs><pattern id="gbHach" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="#fde7e3"/><line x1="0" y1="0" x2="0" y2="6" stroke="#e08a7c" stroke-width="2"/></pattern></defs>';
    // cotes
    s += '<text x="' + (w / 2) + '" y="-4" text-anchor="middle" class="gb-c">largeur du rouleau ' + nf(W, 0) + ' cm</text>';
    s += '<text x="' + (w + 6) + '" y="' + (h / 2 + 4) + '" class="gb-c">' + nf(long, 1) + ' cm</text>';
    if (n) s += '<text x="' + (court * S / 2) + '" y="' + (h + 14) + '" text-anchor="middle" class="gb-c">' + nf(court, 1) + '</text>';
    if (reste > 0.01) s += '<text x="' + (n * court * S + reste * S / 2) + '" y="' + (h + 14) + '" text-anchor="middle" class="gb-c gb-k">' + nf(reste, 1) + '</text>';
    return s + '</svg>';
  }

  /* ---------- plan de coupe pour N produits — dessiné COMME le gabarit : largeur du rouleau à l'horizontale,
     longueur du rouleau vers le bas, MÊME échelle dans les deux sens (pas de déformation) ---------- */
  const HACH = id => '<defs><pattern id="' + id + '" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="5" height="5" fill="#fde7e3"/><line x1="0" y1="0" x2="0" y2="5" stroke="#e08a7c" stroke-width="1.6"/></pattern></defs>';
  function cadre(total, W, corps, id) {
    // dessin calculé « vertical » (x = travers, y = longueur) puis transposé : la longueur du rouleau défile à l'HORIZONTALE
    const S = Math.min(1.6, 180 / W), lab = [], geo = corps(S, lab), hR = W * S, lT = total * S, G = 22;
    let s = '<div class="gb-plan gb-planh"><svg width="' + Math.ceil(lT + G + 20) + '" height="' + Math.ceil(hR + 66) + '" viewBox="' + (-G) + ' -22 ' + Math.ceil(lT + G + 20) + ' ' + Math.ceil(hR + 66) + '">';
    s += '<g transform="matrix(0 1 1 0 0 0)">' + geo + '</g>';
    s += '<text transform="translate(-8 ' + (hR / 2) + ') rotate(-90)" text-anchor="middle" class="gb-c">' + nf(W, 0) + ' cm</text>';
    const pas = total > 3000 ? 100 : 50;
    for (let m = 0; m <= total + 1; m += pas) s += '<line x1="' + (m * S) + '" y1="-6" x2="' + (m * S) + '" y2="0" stroke="#b00020" stroke-width="1"/>' + (m % 100 === 0 || total <= 3000 ? '<text x="' + (m * S) + '" y="-9" text-anchor="middle" class="gb-c gb-k">' + nf(m / 100, 1) + ' m</text>' : '');
    lab.forEach(l => { s += '<text x="' + (l.y0 + 2) + '" y="' + (hR + 15) + '" class="gb-c"><tspan font-weight="700">' + esc(l.nom) + '</tspan></text><text x="' + (l.y0 + 2) + '" y="' + (hR + 29) + '" class="gb-c">' + nf(l.m, 2) + ' m</text><line x1="' + l.y0 + '" y1="' + hR + '" x2="' + l.y0 + '" y2="' + (hR + 32) + '" stroke="#999" stroke-width=".6"/>'; });
    return s + HACH(id) + '</svg></div>';
  }
  function plan(res, W) {
    const blocs = res.lignes.map((x, i) => {
      const n = Math.max(1, Math.floor(W / x.court + 1e-9)), besoin = x.g.n * N, rangs = Math.ceil(besoin / n);
      return { x, i, n, besoin, rangs, lg: rangs * x.long };
    });
    const total = blocs.reduce((s, b) => s + b.lg, 0);
    const html = cadre(total, W, (S, lab) => {
      let s = '', y0 = 0;
      blocs.forEach(b => {
        const h = b.lg * S, cw = b.x.court * S, rh = b.x.long * S, reste = W - b.n * b.x.court;
        s += '<rect x="0" y="' + y0 + '" width="' + (b.n * cw) + '" height="' + h + '" fill="' + COUL[b.i % COUL.length] + '" stroke="#555" stroke-width=".6"/>';
        for (let k = 1; k < b.n; k++) s += '<line x1="' + (k * cw) + '" y1="' + y0 + '" x2="' + (k * cw) + '" y2="' + (y0 + h) + '" stroke="rgba(0,0,0,.3)" stroke-width=".5"/>';
        for (let k = 1; k < b.rangs; k++) s += '<line x1="0" y1="' + (y0 + k * rh) + '" x2="' + (b.n * cw) + '" y2="' + (y0 + k * rh) + '" stroke="rgba(0,0,0,.3)" stroke-width=".5"/>';
        if (reste > .01) s += '<rect x="' + (b.n * cw) + '" y="' + y0 + '" width="' + (reste * S) + '" height="' + h + '" fill="url(#gbHach2)"/>';
        s += '<line x1="0" y1="' + (y0 + h) + '" x2="' + (W * S) + '" y2="' + (y0 + h) + '" stroke="#333" stroke-width="1"/>';
        lab.push({ y0, nom: b.x.g.nom || 'Gabarit', m: b.lg / 100 });
        y0 += h;
      });
      return s;
    }, 'gbHach2');
    return { html, total, blocs };
  }

  /* ---------- SUPPLÉMENT : réutilisation des chutes de côté (n'influence PAS le prix de revient) ----------
     Plan réel à rangées entières : chaque grand gabarit laisse une bande sur le côté (largeur W − n × petit côté)
     sur toute la longueur de son bloc. On y place des pièces plus petites (dans un sens ou l'autre) → moins de rangées
     pour ces petits gabarits → moins de mètres. Les grands gabarits sont traités en premier. */
  function reutiliser(res, W) {
    const G = res.lignes.map((x, i) => ({ x, i, besoin: x.g.n * N, place: 0, aire: x.court * x.long, n: Math.max(1, Math.floor(W / x.court + 1e-9)) }));
    const ordre = G.slice().sort((a, b) => b.aire - a.aire);
    const hotes = [];
    ordre.forEach(h => {
      const reste = h.besoin - h.place; if (reste <= 0) return;
      const rangs = Math.ceil(reste / h.n), lg = rangs * h.x.long, bande = W - h.n * h.x.court;
      const hote = { h, rangs, lg, bande, poses: [] };
      hotes.push(hote);
      if (bande < 0.5) return;
      let libre = lg;
      G.filter(c => c !== h && c.aire < h.aire && c.besoin - c.place > 0).sort((a, b) => b.aire - a.aire).forEach(c => {
        if (libre <= 0) return;
        // meilleur sens dans la bande : le plus de pièces par cm de longueur
        const sens = [[c.x.court, c.x.long], [c.x.long, c.x.court]].map(([tr, le]) => ({ tr, le, col: Math.floor(bande / tr + 1e-9) })).filter(o => o.col > 0 && o.le <= libre + 1e-9);
        if (!sens.length) return;
        const o = sens.sort((a, b) => b.col / b.le - a.col / a.le)[0];
        const manque = c.besoin - c.place, rg = Math.min(Math.ceil(manque / o.col), Math.floor(libre / o.le + 1e-9));
        const nb = Math.min(manque, rg * o.col); if (nb <= 0) return;
        hote.poses.push({ c, nb, rg, col: o.col, tr: o.tr, le: o.le, debut: lg - libre });
        c.place += nb; libre -= rg * o.le;
      });
    });
    hotes.sort((a, b) => a.h.i - b.h.i);
    const total = hotes.reduce((s, b) => s + b.lg, 0);
    return { G, hotes, total };
  }

  function planReutil(R, W) {
    return cadre(R.total, W, (S, lab) => {
      let s = '', y0 = 0;
      R.hotes.forEach(b => {
        const x = b.h.x, h = b.lg * S, cw = x.court * S, larg = b.h.n * cw;
        s += '<rect x="0" y="' + y0 + '" width="' + larg + '" height="' + h + '" fill="' + COUL[b.h.i % COUL.length] + '" stroke="#555" stroke-width=".6"/>';
        for (let k = 1; k < b.h.n; k++) s += '<line x1="' + (k * cw) + '" y1="' + y0 + '" x2="' + (k * cw) + '" y2="' + (y0 + h) + '" stroke="rgba(0,0,0,.3)" stroke-width=".5"/>';
        for (let k = 1; k < b.rangs; k++) s += '<line x1="0" y1="' + (y0 + k * x.long * S) + '" x2="' + larg + '" y2="' + (y0 + k * x.long * S) + '" stroke="rgba(0,0,0,.3)" stroke-width=".5"/>';
        if (b.bande > .01) s += '<rect x="' + larg + '" y="' + y0 + '" width="' + (b.bande * S) + '" height="' + h + '" fill="url(#gbHach3)"/>';
        b.poses.forEach(p => {
          const c = COUL[p.c.i % COUL.length];
          for (let k = 0; k < p.col; k++) for (let r = 0; r < p.rg; r++) s += '<rect x="' + (larg + k * p.tr * S) + '" y="' + (y0 + (p.debut + r * p.le) * S) + '" width="' + Math.max(.8, p.tr * S - .4) + '" height="' + Math.max(.8, p.le * S - .4) + '" fill="' + c + '" stroke="#555" stroke-width=".4"/>';
        });
        s += '<line x1="0" y1="' + (y0 + h) + '" x2="' + (W * S) + '" y2="' + (y0 + h) + '" stroke="#333" stroke-width="1"/>';
        lab.push({ y0, nom: x.g.nom || 'Gabarit', m: b.lg / 100 });
        y0 += h;
      });
      return s;
    }, 'gbHach3');
  }

  function carteReutil(res, W, mReel, pu) {
    const R = reutiliser(res, W), m = R.total / 100, gain = Math.max(0, mReel - m);
    const poses = R.hotes.reduce((a, b) => a.concat(b.poses.map(p => ({ ...p, hote: b }))), []);
    let h = '<div class="gb-reu"><h4 class="gb-h4">♻️ Réutilisation des chutes — supplément (' + nf(N, 0) + ' produits)</h4>';
    if (!poses.length) return h + '<p class="gb-help">Aucune pièce plus petite ne rentre dans les bandes restantes sur le côté : rien à récupérer pour cette matière.</p></div>';
    h += '<div class="gb-kpis"><div><span>Plan réel (rangées entières)</span><b>' + nf(mReel, 2) + ' m</b><small>' + (pu ? nf(mReel * pu, 0) + ' DA' : '') + '</small></div>' +
      '<div><span>Avec les chutes réutilisées</span><b>' + nf(m, 2) + ' m</b><small>' + (pu ? nf(m * pu, 0) + ' DA' : '') + '</small></div>' +
      '<div class="gb-k1m"><span>Tissu économisé</span><b>' + nf(gain, 2) + ' m</b><small>' + (pu ? nf(gain * pu, 0) + ' DA · ' : '') + nf(gain / N, 4) + ' m par produit' + (mReel > 0 ? ' · ' + nf(gain / mReel * 100, 1) + ' %' : '') + '</small></div></div>';
    h += '<div class="gb-reul">' + poses.map(p => '<div><i class="cp-c" style="background:' + COUL[p.c.i % COUL.length] + '"></i><b>' + nf(p.nb, 0) + ' × ' + esc(p.c.x.g.nom || 'Gabarit') + '</b><span>dans la chute de <b>' + esc(p.hote.h.x.g.nom || 'Gabarit') + '</b> (bande ' + nf(p.hote.bande, 1) + ' cm) · ' + p.col + ' en travers × ' + p.rg + ' rangée(s), pièce ' + nf(p.tr, 1) + ' × ' + nf(p.le, 1) + ' cm</span></div>').join('') + '</div>';
    h += planReutil(R, W) + '<p class="gb-help">Supplément d’information pour la coupe : le prix de revient reste calculé avec la méthode principale (chute de côté comptée), il ne change pas. Ici, les petites pièces sont coupées dans les bandes restantes des grands gabarits, ce qui réduit les rangées et les mètres à couper.</p></div>';
    return h;
  }

  /* ---------- une matière (ligne 📐) ---------- */
  function carteSurface(l, p) {
    const g = l.gabarits, res = window.Calepinage ? Calepinage.calculer(g, p) : null;
    const a = article(l), pu = prixL(l);
    if (!res || res.erreur) return '<div class="card gb-card"><div class="gb-ttl"><h3>📐 ' + esc(nomL(l)) + '</h3>' + btnModif(l, 'surface') + '</div><p class="cp-err">⛔ ' + esc(res && res.erreur || 'Gabarits incomplets : touchez « Modifier le calcul ».') + '</p></div>';
    const W = res.W, pl = plan(res, W), rl = a && window.StockAPI && StockAPI.aCond(a) ? StockAPI.condQte(a) : 0;
    const mN = res.total * N, mReel = pl.total / 100;
    let h = '<div class="card gb-card"><div class="gb-ttl"><h3>📐 ' + esc(nomL(l)) + '</h3><span class="gb-tag">rouleau ' + nf(W, 0) + ' cm' + (res.marge ? ' · espace ' + nf(res.marge, 1) + ' cm' : '') + '</span>' + btnModif(l, 'surface') + '</div>';
    // Dans 1 m de cette matière : produits complets, et pièces (tous gabarits) = pièces d'un produit ÷ mètres d'un produit
    const pcsProd = res.lignes.reduce((x, l) => x + (Number(l.g.n) || 0), 0), parM = res.total > 0 ? 1 / res.total : 0;
    // tissu utile (surface des pièces) et CHUTE (largeur perdue + espaces) : comptés tous les deux dans les mètres d'un produit
    const utile = l => (Number(l.g.n) || 0) * (Number(l.g.l) || 0) * (Number(l.g.h) || 0) / (W * 100);
    const mUtile = res.lignes.reduce((x, l) => x + utile(l), 0), mChute = Math.max(0, res.total - mUtile), pcChute = res.total > 0 ? mChute / res.total * 100 : 0;
    h += '<div class="gb-kpis"><div><span>Pour 1 produit</span><b>' + nf(res.total, 4) + ' m</b><small>' + (pu ? nf(res.total * pu, 2) + ' DA' : '') + (mChute >= 0.00005 ? ' · dont espaces ' + nf(mChute, 4) + ' m (' + nf(pcChute, 1) + ' %)' : ' · chutes de côté utilisées') + '</small></div>' +
      '<div class="gb-k1m"><span>Dans 1 m de tissu</span><b>' + nf(parM * pcsProd, 2) + ' pièces</b><small>= ' + nf(parM, 2) + ' produit' + (parM >= 2 ? 's' : '') + ' complet' + (parM >= 2 ? 's' : '') + ' (' + nf(pcsProd, 2) + ' pièces ÷ ' + nf(res.total, 4) + ' m)</small></div>' +
      '<div><span>Pour ' + nf(N, 0) + ' produits (calcul du coût)</span><b>' + nf(mN, 2) + ' m</b><small>' + (pu ? nf(mN * pu, 0) + ' DA' : '') + '</small></div>' +
      '<div><span>Plan de coupe réel</span><b>' + nf(mReel, 2) + ' m</b><small>rangées entières' + (mReel > mN ? ' · +' + nf(mReel - mN, 2) + ' m' : '') + '</small></div>' +
      (rl ? '<div><span>' + esc(StockAPI.plur ? StockAPI.plur(a.cond_nom, 2) : a.cond_nom) + ' de ' + nf(rl, 2) + ' m</span><b>' + nf(mReel / rl, 2) + '</b><small>en stock : ' + nf(StockAPI.qty(a.id) / rl, 2) + '</small></div>' : '') + '</div>';
    h += '<div class="gb-list">' + res.lignes.map((x, i) => {
      const n = Math.floor(W / x.court + 1e-9), reste = W - n * x.court, besoin = x.g.n * N, rangs = Math.ceil(besoin / Math.max(1, n));
      return '<div class="gb-item"><div class="gb-ih"><i class="cp-c" style="background:' + COUL[i % COUL.length] + '"></i><b>' + esc(x.g.nom || 'Gabarit') + '</b><span>' + nf(Math.min(x.g.l, x.g.h), 1) + ' × ' + nf(Math.max(x.g.l, x.g.h), 1) + ' cm · ' + nf(x.g.n, 2) + ' par produit</span></div>' +
        rangee(x, W, COUL[i % COUL.length]) +
        '<div class="gb-det"><div><span>Côte à côte (largeur)</span><b>' + nf(x.parRang, 2) + '</b><small>' + n + ' pièces entières' + (reste > .01 ? ' + chute ' + nf(reste, 1) + ' cm utilisée (comptée)' : '') + '</small></div>' +
        '<div><span>Pièces dans 1 m</span><b>' + nf(x.pieces, 2) + '</b><small>(' + nf(W, 0) + ' ÷ ' + nf(x.court, 1) + ') × (100 ÷ ' + nf(x.long, 1) + ')</small></div>' +
        '<div><span>Mètres / produit (chute comprise)</span><b>' + nf(x.metres, 4) + ' m</b><small>' + nf(x.g.n, 2) + ' ÷ ' + nf(x.pieces, 2) + (pu ? ' · ' + nf(x.metres * pu, 2) + ' DA' : '') + '</small></div>' +
        (function () { const u = utile(x), c = Math.max(0, x.metres - u); if (c < 0.00005) return ''; return '<div class="gb-chute"><span>Dont chute</span><b>' + nf(c, 4) + ' m</b><small>tissu de la pièce ' + nf(u, 4) + ' m · chute ' + nf(x.metres > 0 ? c / x.metres * 100 : 0, 1) + ' %' + (pu ? ' · ' + nf(c * pu, 2) + ' DA' : '') + '</small></div>'; })() +
        '<div><span>Pour ' + nf(N, 0) + ' produits</span><b>' + nf(besoin, 0) + ' pièces</b><small>' + rangs + ' rangée(s) de ' + n + ' → ' + nf(rangs * x.long / 100, 2) + ' m</small></div></div></div>';
    }).join('') + '</div>';
    h += '<h4 class="gb-h4">Plan de coupe — ' + nf(N, 0) + ' produits, rouleau déroulé (' + nf(mReel, 2) + ' m)</h4>' + pl.html +
      '<p class="gb-help">Rouleau déroulé de gauche à droite, à la même échelle dans les deux sens : la largeur du rouleau (' + nf(W, 0) + ' cm) en hauteur, la longueur à l’horizontale (faites défiler). Chaque bloc = un gabarit coupé rangée après rangée ; la largeur du gabarit est en travers du rouleau, sa hauteur dans le sens de la longueur. Les zones hachurées sont la bande restante sur le côté : elle est comptée dans le calcul du prix (pièces côte à côte avec décimales).</p>';
    h += carteReutil(res, W, mReel, pu) + '</div>';
    return h;
  }

  const btnModif = (l, type) => '<button type="button" class="btn s p gb-mod" data-gbmod="' + esc(l.id) + '" data-type="' + type + '">' + (type === 'longueur' ? '📏' : '📐') + ' Modifier le calcul</button>';
  /* ---------- une longueur (ligne 📏) ---------- */
  function carteLongueur(l, p) {
    const g = l.gabarits, r = window.Calepinage ? Calepinage.calculerLongueur(g, p) : null, pu = prixL(l);
    if (!r || r.manque || !(r.cm > 0)) return '<div class="card gb-card"><div class="gb-ttl"><h3>📏 ' + esc(nomL(l)) + '</h3>' + btnModif(l, 'longueur') + '</div><p class="cp-err">⛔ Longueur incomplète (gabarit supprimé ?) : touchez « Modifier le calcul ».</p></div>';
    const tot = r.cm, maxv = Math.max(...r.termes.map(x => Math.abs(x.cm)), Math.abs(num(g.ajout)), 1);
    return '<div class="card gb-card"><div class="gb-ttl"><h3>📏 ' + esc(nomL(l)) + '</h3><span class="gb-tag">' + nf(tot, 1) + ' cm / produit</span>' + btnModif(l, 'longueur') + '</div>' +
      '<div class="gb-kpis"><div><span>Pour 1 produit</span><b>' + nf(r.m, 4) + ' m</b><small>' + (pu ? nf(r.m * pu, 2) + ' DA' : '') + '</small></div><div><span>Pour ' + nf(N, 0) + ' produits</span><b>' + nf(r.m * N, 2) + ' m</b><small>' + (pu ? nf(r.m * N * pu, 0) + ' DA' : '') + '</small></div></div>' +
      '<div class="gb-lt">' + r.termes.map((x, i) => '<div class="gb-lr"><span>' + esc(x.g ? x.g.nom : '?') + ' — ' + (MES[x.mesure] || x.mesure) + (num(x.n) !== 1 ? ' × ' + nf(x.n, 2) : '') + '</span><i style="width:' + Math.max(2, Math.abs(x.cm) / maxv * 100) + '%;background:' + COUL[i % COUL.length] + '"></i><b>' + nf(x.cm, 1) + ' cm</b></div>').join('') +
      (num(g.ajout) ? '<div class="gb-lr"><span>' + (num(g.ajout) > 0 ? 'Ajout' : 'Retrait') + '</span><i style="width:' + Math.max(2, Math.abs(num(g.ajout)) / maxv * 100) + '%;background:' + (num(g.ajout) > 0 ? '#9fd8cf' : '#f4b4a8') + '"></i><b>' + (num(g.ajout) > 0 ? '+' : '') + nf(g.ajout, 1) + ' cm</b></div>' : '') +
      '<div class="gb-lr gb-lt-tot"><span>Total</span><i></i><b>' + nf(tot, 1) + ' cm</b></div></div></div>';
  }

  function render() {
    const el = root(); if (!el) return;
    const P = produits();
    if (!P.length) { el.innerHTML = '<div class="card">Chargement des produits…</div>'; return; }
    if (!P.some(p => String(p.id) === String(sel))) sel = (P.find(p => lib(p).length) || P[0]).id;
    const p = P.find(x => String(x.id) === String(sel)), L = lib(p), lg = lignes(p.id);
    const src = fixerN(p);
    const srcTxt = src.m ? '✎ quantité saisie' + (src.b || qteProd() ? ' · <button type="button" class="gb-src" data-gbprod>↺ revenir à la production</button>' : '')
      : src.b ? '🏭 production ' + esc(src.b.numero || '') + (src.b.date_bon ? ' du ' + esc(String(src.b.date_bon).split('-').reverse().join('/')) : '') + (src.b.atelier ? ' · ' + esc(src.b.atelier) : '')
      : qteProd() ? '🏭 quantité de la section Production' : 'aucune production lancée pour ce modèle';
    const surf = lg.filter(l => l.gabarits && l.gabarits.type !== 'longueur' && (l.gabarits.items || []).length);
    const lon = lg.filter(l => l.gabarits && l.gabarits.type === 'longueur');
    let h = '<div class="hello"><span class="fl"></span><div><h2>Gabarits</h2><p>Où et comment chaque gabarit se place dans le rouleau, avec les mêmes calculs que le coût de revient.</p></div></div>' +
      '<div class="gb-top"><label>Produit<select id="gb-prod">' + P.slice().sort((a, b) => a.nom.localeCompare(b.nom, 'fr')).map(x => '<option value="' + esc(x.id) + '"' + (String(x.id) === String(sel) ? ' selected' : '') + '>' + esc(x.nom) + (lib(x).length ? ' · 📐 ' + lib(x).length : '') + '</option>').join('') + '</select></label>' +
      '<label>Produits à fabriquer<span class="gb-n"><button type="button" data-n="-">−</button><input id="gb-n" type="number" min="1" step="1" inputmode="numeric" value="' + N + '"><button type="button" data-n="+">+</button></span><small class="gb-nsrc">' + srcTxt + '</small></label>' +
      '<button type="button" class="btn" id="gb-edit">✎ Modifier dans Produits</button></div>';
    // gabarits du produit : modifiables ici (même carte que dans Produits, avec recalcul automatique)
    h += '<div class="card gb-card" id="gb-libcard"></div>';
    h += surf.map(l => carteSurface(l, p)).join('') + lon.map(l => carteLongueur(l, p)).join('');
    // lignes du coût de revient pas encore calculées avec les gabarits
    const autres = lg.filter(l => !(l.gabarits && l.gabarits.resultat) && l.categorie !== 'Finition' && (l.unite === 'm' || (window.Calepinage && Calepinage.estSurface(l))));
    if (autres.length) h += '<div class="card gb-card"><div class="gb-ttl"><h3>À calculer avec les gabarits</h3><span class="gb-tag">' + autres.length + ' ligne(s)</span></div><div class="gb-todo">' +
      autres.map(l => { const surfL = window.Calepinage && Calepinage.estSurface(l); return '<div class="gb-td"><div><b>' + esc(nomL(l)) + '</b><small>' + nf(l.quantite, 4) + ' ' + esc(l.unite) + ' / produit (saisi à la main)</small></div><button type="button" class="btn s p" data-gbmod="' + esc(l.id) + '" data-type="' + (surfL ? 'surface' : 'longueur') + '">' + (surfL ? '📐 Calculer' : '📏 Calculer') + '</button></div>'; }).join('') + '</div></div>';
    if (!surf.length && !lon.length && !autres.length) h += '<div class="card gb-card"><p class="gb-help">Ce produit n’a pas encore de lignes de tissu ou de longueur dans son coût de revient.</p></div>';
    el.innerHTML = h;
    const libc = document.getElementById('gb-libcard'); if (libc && window.Calepinage) Calepinage.carte(p, libc);
    const ed = document.getElementById('gb-edit'); if (ed && typeof window.sectionPermise === 'function' && !window.sectionPermise('produits')) ed.style.display = 'none';
  }

  async function load() {
    if (!produits().length && typeof loadProduits === 'function') { try { await loadProduits(); } catch (e) {} }
    if (window.StockAPI && !StockAPI.list().length) { try { await StockAPI.load(); } catch (e) {} }
    if (window.BonsSortie && !BonsSortie.liste().length) { try { await BonsSortie.load(); } catch (e) {} }
    render();
  }
  document.addEventListener('change', e => {
    if (e.target.id === 'gb-prod') { sel = e.target.value; try { sessionStorage.setItem('mariabag_gb_produit', sel); } catch (x) {} render(); }
  });
  document.addEventListener('input', e => {
    if (e.target.id !== 'gb-n') return;
    N = Math.max(1, Math.round(num(e.target.value)) || 1); manuel[sel] = N; garderManuel();
    clearTimeout(window.__gbT); window.__gbT = setTimeout(() => { const pos = e.target.selectionStart; render(); const i = document.getElementById('gb-n'); if (i) { i.focus(); try { i.setSelectionRange(pos, pos); } catch (x) {} } }, 350);
  });
  document.addEventListener('click', e => {
    const el = root(); if (!el || !el.contains(e.target)) return;
    const b = e.target.closest('[data-n]'); if (b) { const pas = N >= 1000 ? 100 : N >= 200 ? 50 : N >= 50 ? 10 : 1; N = Math.max(1, b.dataset.n === '+' ? N + pas : N - pas); manuel[sel] = N; garderManuel(); render(); return; }
    if (e.target.closest('[data-gbprod]')) { delete manuel[sel]; garderManuel(); render(); return; }
    if (e.target.closest('#gb-edit')) { if (typeof window.selProduitDepuis === 'function') window.selProduitDepuis(sel); return; }
    const m = e.target.closest('[data-gbmod]');
    if (m && window.Calepinage) { (m.dataset.type === 'longueur' ? Calepinage.ouvrirLongueur : Calepinage.ouvrir)(m.dataset.gbmod); }
  });
  document.addEventListener('mariabag:produits', () => { if (document.getElementById('v-gabarits') && document.getElementById('v-gabarits').classList.contains('on')) render(); });
  window.loadGabarits = load;
})();
