/* ============================================================
   GABARITS DU PRODUIT → QUANTITÉS DES LIGNES DE COÛT

   1. Chaque produit garde ses GABARITS (face, dos, soufflet, fond, poche…) : largeur × hauteur (cm)
      et périmètre (2 × (L + H) par défaut, modifiable pour une forme arrondie).
      On les saisit une seule fois ; toutes les lignes du produit les réutilisent.

   2. SURFACE (tissu principal, doublure, PVC…) — « 📐 Gabarits » :
      pièces dans 1 m = (largeur du rouleau ÷ petit côté) × (100 ÷ grand côté)   (avec virgule)
      mètres pour l'élément = nombre par produit ÷ pièces dans 1 m ; total = somme des éléments.

   3. LONGUEUR (fermeture, curseur, tafta, liseré, sangle…) — « 📏 Longueur » :
      longueur = Σ (mesure d'un gabarit × nombre) + ajout (cm, peut être négatif)
      mesures : périmètre, grand côté, petit côté, largeur, hauteur.
      Ex. curseur  = grand côté du soufflet + 3 cm
          tafta    = périmètre face + périmètre dos + périmètre fond − 5 cm
          liseré   = périmètre face + périmètre dos

   Quand un gabarit du produit est modifié, toutes les lignes calculées avec lui sont recalculées.
   ============================================================ */
(function () {
  'use strict';
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const nf = (n, d) => (Number(n) || 0).toLocaleString('fr-FR', { maximumFractionDigits: d == null ? 2 : d });
  const num = v => { const x = parseFloat(String(v ?? '').replace(',', '.')); return isFinite(x) ? x : 0; };
  const r4 = x => Math.round((Number(x) || 0) * 10000) / 10000;
  const COUL = ['#e8a6b4', '#9cc5e8', '#b9dfa6', '#f2d38a', '#c8b3e6', '#f4b183', '#9fd8cf', '#e3b5d0', '#c9c9c9', '#a8c3a0'];
  const LONG = 100;      // 1 mètre de rouleau
  const nid = () => 'g' + Math.random().toString(36).slice(2, 9);
  const MESURES = [['p', 'Périmètre'], ['gc', 'Grand côté'], ['pc', 'Petit côté'], ['l', 'Largeur'], ['h', 'Hauteur']];
  const SURFACE_RE = /tissu|doublure|pvc|mati[eè]re|[ée]ponge|simili|cuir|toile|feutre|mousse/i;

  /* ---------- Gabarits du produit ---------- */
  const produitDe = id => (typeof PRODUITS !== 'undefined' ? PRODUITS : []).find(p => String(p.id) === String(id)) || null;
  const lib = p => (p && p.gabarits && Array.isArray(p.gabarits.items) ? p.gabarits.items : []);
  const FM = () => window.Formes || null;
  const estForme = g => !!(g && g.forme && g.forme !== 'rect' && FM());
  const dimsG = g => estForme(g) ? FM().dims(g) : { l: num(g.l), h: num(g.h) };
  const perimAuto = g => estForme(g) ? FM().perimetre(g) : 2 * (num(g.l) + num(g.h));
  const perim = g => num(g.p) > 0 ? num(g.p) : perimAuto(g);
  const mesure = (g, m) => { if (!g) return 0; const d = dimsG(g); return m === 'p' ? perim(g) : m === 'gc' ? Math.max(d.l, d.h) : m === 'pc' ? Math.min(d.l, d.h) : m === 'l' ? d.l : d.h; };
  const estSurface = l => SURFACE_RE.test(String(l.categorie || '') + ' ' + String(l.designation || ''));
  async function sauverLib(p, items) {
    const gabarits = { items: items.map(g => { const o = { id: g.id || nid(), nom: String(g.nom || '').trim(), l: num(g.l), h: num(g.h), p: num(g.p) > 0 ? num(g.p) : null };
      if (g.forme && g.forme !== 'rect') { o.forme = g.forme; if (g.forme === 'rond' || g.forme === 'carre') o.h = o.l; if (g.forme === 'libre' && Array.isArray(g.pts)) o.pts = g.pts; if (g.forme === 'triangle' && g.sommet != null && g.sommet !== '') o.sommet = num(g.sommet); }
      return o; }) };
    const r = await sb.from('produits').update({ gabarits }).eq('id', p.id).select();
    if (r.error) throw r.error;
    p.gabarits = (r.data && r.data[0] && r.data[0].gabarits) || gabarits;
    return p.gabarits.items;
  }

  /* ---------- Calculs ---------- */
  /* largeur du rouleau en cm (1,40 saisi en mètres → 140 cm) */
  const laizeCm = v => { const x = num(v); return x > 0 && x <= 5 ? x * 100 : x; };
  function calculer(cfg, p) {
    const W = laizeCm(cfg.laize) || 140, marge = Math.max(0, num(cfg.marge)), H = LONG;
    const L = lib(p);
    const tous = (cfg.items || []).map((g, t) => {
      const ref = g.ref ? L.find(x => x.id === g.ref) : null;
      const src = ref || g;
      return { ...g, t, perdu: !!g.ref && !ref, nom: ref ? ref.nom : g.nom, l: num(src.l), h: num(src.forme === 'rond' || src.forme === 'carre' ? src.l : src.h), n: Math.max(0, num(g.n)), forme: src.forme || 'rect', pts: src.pts, sommet: src.sommet };
    });
    const perdus = tous.filter(g => g.perdu);
    const items = tous.filter(g => !g.perdu && g.l > 0 && g.h > 0 && g.n > 0);
    if (perdus.length) return { lignes: [], W, marge, H, erreur: 'Gabarit supprimé des gabarits du produit : choisissez-en un autre ou retirez la ligne (' + perdus.length + ').' };
    if (!items.length) return null;
    const lignes = items.map(g => {
      // forme ronde, triangle, libre : place réellement occupée par une pièce avec l'emboîtement optimisé (quinconce, tête-bêche…)
      const e = estForme(g) ? FM().empreinte(g) : null, a = e ? e.w : g.l, b = e ? e.h : g.h;
      const court = Math.min(a, b) + marge, long = Math.max(a, b) + marge;      // grand côté dans le sens du 1 m
      // pièces côte à côte AVEC décimales : la bande restante sur le côté (chute) est utilisée en production, donc comptée
      const parRang = court <= W ? W / court : 0, pieces = parRang ? parRang * H / long : 0;
      return { g, emb: e, pieces, parRang, long, court, blocs: parRang ? [{ x: 0, y: 0, w: court, h: long, nx: Math.ceil(parRang), ny: Math.ceil(H / long) }] : [], metres: parRang ? g.n / pieces * H / 100 : null };
    });
    const ko = lignes.filter(x => !x.pieces);
    if (ko.length) return { lignes, W, marge, H, erreur: 'Gabarit plus large que le rouleau (' + nf(W, 0) + ' cm), même avec son petit côté en travers : ' + ko.map(x => x.g.nom || 'sans nom').join(', ') + '.' };
    return { lignes, W, H, marge, total: lignes.reduce((s, x) => s + x.metres, 0) };
  }
  function calculerLongueur(cfg, p) {
    const L = lib(p);
    const termes = (cfg.termes || []).map((x, t) => { const g = L.find(y => y.id === x.ref); return { ...x, t, g, cm: g ? mesure(g, x.mesure) * num(x.n) : 0 }; });
    const somme = termes.reduce((s, x) => s + x.cm, 0), cm = somme + num(cfg.ajout);
    return { termes, somme, cm, m: cm / 100, manque: termes.filter(x => !x.g).length };
  }
  /* message : dans la section Produits (toastD) ou ailleurs (toast général) */
  const dire = m => { const pd = document.getElementById('v-produits'); if (pd && pd.classList.contains('on') && typeof toastD === 'function') toastD(m); else if (typeof toast === 'function') toast(m); };
  const prevenir = () => { document.dispatchEvent(new Event('mariabag:produits')); if (typeof window.syncProduction === 'function') window.syncProduction(); };
  const resultatDe = (gab, p) => {
    if (!gab) return null;
    if (gab.type === 'longueur') { const r = calculerLongueur(gab, p); return r.cm > 0 && !r.manque ? r.m : null; }
    const r = calculer(gab, p); return r && !r.erreur && r.total > 0 ? r.total : null;
  };

  /* Contrôles avant d'appliquer : erreurs (bloquent) et avertissements (à vérifier) */
  function controler(cfg, p, type) {
    const err = [], av = [], L = lib(p);
    if (type === 'longueur') {
      const r = calculerLongueur(cfg, p);
      if (r.manque) err.push(r.manque + ' mesure(s) sans gabarit (gabarit supprimé) : choisissez un gabarit ou retirez la ligne.');
      if (!(r.cm > 0)) err.push('La longueur totale doit être supérieure à 0.');
      if ((cfg.termes || []).some(x => num(x.n) < 0)) av.push('Un nombre négatif retire une longueur : vérifiez que c’est voulu.');
      if (r.cm > 2000) av.push('Plus de 20 m pour un seul produit : vérifiez les mesures (en cm) et les nombres.');
      if (Math.abs(num(cfg.ajout)) > Math.max(30, r.somme * 0.5)) av.push('L’ajout / retrait (' + nf(cfg.ajout, 1) + ' cm) est grand par rapport à la somme des mesures (' + nf(r.somme, 1) + ' cm).');
      return { err, av };
    }
    const lz = num(cfg.laize);
    if (lz > 0 && lz <= 5) av.push('Largeur du rouleau lue en mètres : ' + nf(lz, 2) + ' m = ' + nf(lz * 100, 0) + ' cm.');
    if (laizeCm(lz) > 330) av.push('Largeur du rouleau de ' + nf(laizeCm(lz), 0) + ' cm : vérifiez (en cm, ex. 140).');
    if (num(cfg.marge) > 5) av.push('Espace entre pièces de ' + nf(cfg.marge, 1) + ' cm : c’est beaucoup (souvent 0 à 1 cm).');
    const vus = {};
    (cfg.items || []).forEach(g => {
      const ref = g.ref ? L.find(x => x.id === g.ref) : null, nom = ref ? ref.nom : g.nom || 'Gabarit';
      if (g.ref && !ref) return;
      const l = num(ref ? ref.l : g.l), h = num(ref ? ref.h : g.h);
      if ((l > 0) !== (h > 0)) err.push('« ' + nom + ' » : indiquez la largeur ET la hauteur.');
      if (l > 250 || h > 250) av.push('« ' + nom + ' » mesure plus de 2,5 m : les mesures sont-elles bien en cm ?');
      if ((l > 0 && l < 1) || (h > 0 && h < 1)) av.push('« ' + nom + ' » mesure moins de 1 cm : les mesures sont-elles bien en cm ?');
      if (l > 0 && h > 0 && !(num(g.n) > 0)) av.push('« ' + nom + ' » : nombre par produit à 0, il n’est pas compté.');
      if (num(g.n) % 1) av.push('« ' + nom + ' » : nombre par produit à virgule (' + nf(g.n, 2) + ').');
      const k = g.ref || (nom + l + 'x' + h); if (vus[k]) av.push('« ' + nom + ' » apparaît deux fois : il est compté deux fois.'); vus[k] = 1;
    });
    const r = calculer(cfg, p);
    if (r && r.erreur) err.push(r.erreur);
    if (!r) err.push('Indiquez au moins un gabarit (largeur, hauteur, nombre par produit).');
    return { err, av };
  }
  const boiteControle = c => (c.err.length ? '<div class="cp-chk ko">' + c.err.map(x => '<div>⛔ ' + esc(x) + '</div>').join('') + '</div>' : '') +
    (c.av.length ? '<div class="cp-chk av">' + c.av.map(x => '<div>⚠ ' + esc(x) + '</div>').join('') + '</div>' : '');

  /* État d'une ligne calculée avec les gabarits : à jour, décalée (gabarit modifié) ou en erreur */
  function etatLigne(l, p) {
    const g = l && l.gabarits; if (!g || !g.resultat) return null;
    const m = resultatDe(g, p || produitDe(l.produit_id));
    if (m == null) return { k: 'err', t: 'calcul impossible (gabarit supprimé ou mesure manquante)' };
    if (Math.abs(r4(m) - Number(l.quantite || 0)) >= 0.00005) return { k: 'dec', m: r4(m), t: 'gabarits modifiés : ' + nf(m, 4) + ' m au lieu de ' + nf(l.quantite, 4) + ' m' };
    return { k: 'ok' };
  }

  /* Recalcule les lignes du produit calculées avec ses gabarits (après modification d'un gabarit) */
  async function recalculerProduit(p) {
    const lignes = (typeof LIGNES !== 'undefined' ? LIGNES : []).filter(l => String(l.produit_id) === String(p.id) && l.gabarits && l.gabarits.resultat);
    let n = 0;
    for (const l of lignes) {
      const m = resultatDe(l.gabarits, p); if (m == null) continue;
      const q = r4(m); if (Math.abs(q - Number(l.quantite || 0)) < 0.00005) continue;
      const gab = { ...l.gabarits, resultat: { ...l.gabarits.resultat, m_piece: q, le: new Date().toISOString().slice(0, 10) } };
      const r = await sb.from('produit_lignes').update({ quantite: q, gabarits: gab }).eq('id', l.id).select();
      if (!r.error) { Object.assign(l, r.data && r.data[0] ? r.data[0] : { quantite: q, gabarits: gab }); n++; }
    }
    return n;
  }

  /* ---------- Dessin (surface) ---------- */
  function dessin(x, W, H, coul) {
    if (x.emb && FM()) return '<div class="cp-svg cp-fm">' + FM().motif(x.g, coul, 200) + '<small>' + esc(x.emb.txt || 'à la suite') + '</small></div>';
    const sc = 0.62 * Math.min(1, 140 / Math.max(W, H));
    let s = '<svg viewBox="0 0 ' + (W * sc) + ' ' + (H * sc) + '" width="' + Math.round(W * sc) + '" height="' + Math.round(H * sc) + '" class="cp-svg"><rect x="0" y="0" width="' + (W * sc) + '" height="' + (H * sc) + '" fill="#f6f2f3" stroke="#999" stroke-width="0.6"/>';
    (x.blocs || []).forEach(b => { for (let i = 0; i < b.nx; i++) for (let j = 0; j < b.ny; j++)
      s += '<rect x="' + ((b.x + i * b.w) * sc + 0.4) + '" y="' + ((b.y + j * b.h) * sc + 0.4) + '" width="' + Math.max(0.5, b.w * sc - 0.8) + '" height="' + Math.max(0.5, b.h * sc - 0.8) + '" fill="' + coul + '" stroke="#555" stroke-width="0.4"/>'; });
    return s + '</svg>';
  }

  /* ---------- Contexte commun aux fenêtres ---------- */
  function contexte(ligneId, opts) {
    opts = opts || {};
    const l = opts.ligne || (typeof LIGNES !== 'undefined' ? LIGNES : []).find(x => String(x.id) === String(ligneId)); if (!l) return null;
    const p = produitDe(l.produit_id) || (typeof produitCourant === 'function' ? produitCourant() : null);
    return { l, p, opts };
  }
  /* applique / enregistre le résultat (ligne enregistrée ou formulaire) */
  async function terminer(ctx, gab, m, appliquer, bg) {
    const { l, opts } = ctx;
    if (appliquer) gab.resultat = { m_piece: r4(m), le: new Date().toISOString().slice(0, 10) };
    if (opts.onApply) {
      if (appliquer) opts.onApply(gab.resultat.m_piece, gab); else if (opts.onSave) opts.onSave(gab);
      bg.remove(); return;
    }
    const patch = { gabarits: gab };
    if (appliquer) {
      patch.quantite = gab.resultat.m_piece; patch.perte_pct = 0;
      if (l.unite !== 'm') { if (!confirm('Cette ligne est en « ' + l.unite + ' ». Le calcul donne des mètres : passer la ligne en mètres ?')) return; patch.unite = 'm'; }
    }
    const q = await sb.from('produit_lignes').update(patch).eq('id', l.id).select();
    if (q.error) { alert('Erreur : ' + q.error.message); return; }
    Object.assign(l, q.data && q.data[0] ? q.data[0] : patch);
    bg.remove();
    if (typeof renderProduits === 'function') renderProduits();
    prevenir();
    dire(appliquer ? 'Quantité appliquée : ' + nf(patch.quantite, 4) + ' m par produit.' : 'Gabarits enregistrés.');
  }
  const iconeF = g => { const f = g && g.forme && FM() ? FM().FORMES.find(x => x[0] === g.forme) : null; return f && f[0] !== 'rect' ? f[2] + ' ' : ''; };
  const nomG = g => String(g && g.nom || '').trim() || 'Gabarit sans nom';
  const optsLib = (L, sel, vide) => (vide ? '<option value="">' + vide + '</option>' : '') + L.map(g => '<option value="' + esc(g.id) + '"' + (g.id === sel ? ' selected' : '') + '>' + iconeF(g) + esc(nomG(g)) + ' (' + nf(g.l, 1) + ' × ' + nf(g.h, 1) + ')</option>').join('');

  /* ---------- Fenêtre SURFACE ---------- */
  function ouvrir(ligneId, opts) {
    const ctx = contexte(ligneId, opts); if (!ctx) return;
    const { l, p } = ctx;
    const art = window.StockAPI && l.article_id ? StockAPI.byId(l.article_id) : null;
    const g0 = l.gabarits && typeof l.gabarits === 'object' && l.gabarits.type !== 'longueur' ? l.gabarits : {};
    let L = lib(p).slice();
    // largeur du rouleau : celle déjà utilisée pour ce tissu sur une autre ligne, sinon 140 cm
    const laizeConnue = !g0.laize && l.article_id ? ((typeof LIGNES !== 'undefined' ? LIGNES : []).find(x => String(x.article_id) === String(l.article_id) && x.gabarits && x.gabarits.laize) || {}).gabarits : null;
    const cfg = { laize: g0.laize || (laizeConnue && laizeConnue.laize) || 140, marge: g0.marge ?? (laizeConnue ? laizeConnue.marge || 0 : 0),
      items: (g0.items && g0.items.length ? g0.items : (L.length ? L.map(g => ({ ref: g.id, n: 1 })) : [{ nom: 'Face', l: '', h: '', n: 1 }])).map(x => ({ ...x })) };
    const prixM = () => typeof prixLigne === 'function' ? prixLigne(l) : Number(l.prix_unitaire) || 0;
    const bg = document.createElement('div'); bg.className = 'cp-bg'; document.body.appendChild(bg);

    const ligneG = (g, i) => {
      const ref = g.ref ? L.find(x => x.id === g.ref) : null, ro = ref ? ' readonly' : '';
      return '<tr data-i="' + i + '"><td><span class="cp-nm"><i class="cp-c" style="background:' + COUL[i % COUL.length] + '"></i>' +
        (L.length ? '<select data-k="ref" data-nocherche="1" title="Gabarit du produit">' + optsLib(L, g.ref, '✎ Nouveau / autre') + '</select>' : '') +
        (ref && ref.forme && ref.forme !== 'rect' && FM() ? FM().apercu(ref, 28, COUL[i % COUL.length]) : '') +
        (!ref && FM() ? '<select data-k="forme" data-nocherche="1" class="cp-fsel" title="Forme du nouveau gabarit">' + FM().FORMES.map(x => '<option value="' + x[0] + '"' + ((g.forme || 'rect') === x[0] ? ' selected' : '') + '>' + x[2] + ' ' + x[1] + '</option>').join('') + '</select>' + (g.forme === 'libre' ? '<button type="button" class="btn s" data-cpdraw="' + i + '">✏️ ' + (g.pts ? 'Modifier' : 'Dessiner') + '</button>' : '') : '') +
        '<input data-k="nom" value="' + esc(ref ? ref.nom : g.nom || '') + '" placeholder="Face, dos, soufflet…" maxlength="40"' + ro + (ref ? ' style="display:none"' : '') + '></span></td>' +
        '<td data-cap="Largeur (cm)"><input data-k="l" type="number" min="0" step="0.1" inputmode="decimal" value="' + esc(ref ? ref.l : g.l) + '" placeholder="' + (!ref && g.forme === 'rond' ? 'Ø cm' : 'cm') + '"' + (ro || (!ref && g.forme === 'libre') ? ' readonly' : '') + '></td>' +
        '<td data-cap="Hauteur (cm)"><input data-k="h" type="number" min="0" step="0.1" inputmode="decimal" value="' + esc(ref ? ref.h : g.h) + '" placeholder="cm"' + (ro || (!ref && (g.forme === 'libre' || g.forme === 'rond' || g.forme === 'carre')) ? ' readonly' : '') + '></td>' +
        '<td data-cap="Nb / produit"><input data-k="n" type="number" min="0" step="1" inputmode="numeric" value="' + esc(g.n) + '"></td>' +
        '<td class="cp-pc n" data-cap="Pièces dans 1 m"></td><td class="cp-m n" data-cap="Mètres / produit"></td><td class="cp-del"><button type="button" class="btn s d" data-del="' + i + '" title="Retirer de cette ligne">×</button></td></tr>';
    };
    const manquants = () => L.filter(g => !cfg.items.some(x => x.ref === g.id));
    const corps = () => {
      bg.querySelector('#cp-g').innerHTML = cfg.items.map(ligneG).join('');
      const m = manquants(), box = bg.querySelector('#cp-manq');
      if (box) box.innerHTML = m.length ? '<span>Gabarits du produit <b>pas encore dans ce calcul</b> :</span>' + m.map(g => '<button type="button" class="cp-chip" data-addref="' + esc(g.id) + '">＋ ' + (g.forme && g.forme !== 'rect' && FM() ? FM().apercu(g, 18, '#e8a6b4') + ' ' : '') + esc(nomG(g)) + ' <small>' + nf(g.l, 1) + ' × ' + nf(g.h, 1) + '</small></button>').join('') : '';
    };
    bg.innerHTML = '<div class="cp-box"><div class="at-actions" style="margin-top:0"><h3 style="margin:0 auto 0 0">📐 Métrage par gabarits — ' + esc(typeof nomLigne === 'function' ? nomLigne(l) : l.designation) + '</h3><button type="button" class="btn s" id="cp-x">Fermer</button></div>' +
      '<ol class="cp-steps"><li>Choisissez les <b>gabarits du produit</b> coupés dans cette matière (ou saisissez-en un nouveau : il sera <b>enregistré dans le produit</b> pour les autres lignes) et le nombre pour <b>1 produit</b>.</li>' +
      '<li><b>Pièces dans 1 m = (largeur du rouleau ÷ petit côté) × (100 ÷ grand côté)</b>, avec virgule. Le côté le plus long est dans le sens de la longueur.</li>' +
      '<li><b>Métrage du produit = Σ (nombre par produit ÷ pièces dans 1 m)</b>.</li></ol>' +
      '<div class="cp-cfg"><label>Largeur du rouleau (cm)<input id="cp-laize" type="number" min="10" step="1" value="' + esc(cfg.laize) + '"></label>' +
      '<label>Espace entre pièces (cm)<input id="cp-marge" type="number" min="0" step="0.1" value="' + esc(cfg.marge) + '"></label></div>' +
      '<div class="tw"><table class="iv-tbl cp-tbl no-cards"><thead><tr><th>Gabarit</th><th>Largeur (cm)</th><th>Hauteur (cm)</th><th>Nb / produit</th><th class="n">Pièces dans 1 m</th><th class="n">Mètres / produit</th><th></th></tr></thead>' +
      '<tbody id="cp-g"></tbody><tfoot><tr class="cp-tot"><td colspan="5">Total pour 1 produit (assemblage de tous les éléments)</td><td class="n" id="cp-total" colspan="2">—</td></tr></tfoot></table></div>' +
      '<div class="cp-manq" id="cp-manq"></div>' +
      '<div class="at-actions"><button type="button" class="btn s" id="cp-add">+ Ajouter un gabarit</button>' + (L.length ? '<button type="button" class="btn s" id="cp-all">+ Tous les gabarits du produit</button>' : '') + '</div>' +
      '<div id="cp-res"></div><div id="cp-plans" class="cp-plans"></div></div>';
    corps();

    function lire() {
      cfg.laize = num(bg.querySelector('#cp-laize').value) || 140; cfg.marge = Math.max(0, num(bg.querySelector('#cp-marge').value));
      bg.querySelectorAll('#cp-g tr[data-i]').forEach(tr => { const g = cfg.items[+tr.dataset.i]; if (!g) return;
        tr.querySelectorAll('[data-k]').forEach(inp => { g[inp.dataset.k] = inp.value; }); if (!g.ref) delete g.ref;
        if (!g.ref && (g.forme === 'rond' || g.forme === 'carre')) { g.h = g.l; const hi = tr.querySelector('[data-k=h]'); if (hi) hi.value = g.l; } });
    }
    let res = null;
    function calc() {
      lire(); res = calculer(cfg, { gabarits: { items: L } });
      const pm = prixM();
      bg.querySelectorAll('#cp-g tr[data-i]').forEach(tr => {
        const x = res && res.lignes.find(y => y.g.t === +tr.dataset.i);
        tr.querySelector('.cp-pc').innerHTML = x ? (x.pieces ? '<b>' + nf(x.pieces, 2) + '</b><small>' + (x.emb && x.emb.lat ? '(' + nf(res.W, 0) + ' × 100) ÷ ' + nf(x.court * x.long, 0) + ' cm² par pièce' : '(' + nf(res.W, 2) + ' ÷ ' + nf(x.court, 2) + ') × (100 ÷ ' + nf(x.long, 2) + ')') + '</small>' : '<span class="cp-err">trop grand</span>') : '—';
        tr.querySelector('.cp-m').innerHTML = x && x.metres ? '<b>' + nf(x.metres, 4) + ' m</b><small>' + nf(x.g.n, 2) + ' ÷ ' + nf(x.pieces, 2) + (pm ? ' · ' + nf(x.metres * pm, 2) + ' DA' : '') + '</small>' : '—';
      });
      const ctl = controler(cfg, { gabarits: { items: L } }, 'surface');
      const tot = bg.querySelector('#cp-total'), out = bg.querySelector('#cp-res'), plans = bg.querySelector('#cp-plans');
      if (!res || res.erreur || ctl.err.length) {
        tot.textContent = '—';
        out.innerHTML = boiteControle(ctl);
      } else {
        tot.innerHTML = '<b>' + nf(res.total, 4) + ' m</b>';
        const rl = art && window.StockAPI && StockAPI.aCond(art) ? StockAPI.condQte(art) : 0;
        out.innerHTML = boiteControle(ctl) + '<div class="cp-res"><div><span>Tissu pour 1 produit</span><b>' + nf(res.total, 4) + ' m</b><small>' + nf(res.total * 100, 1) + ' cm de rouleau' + (pm ? ' · ' + nf(res.total * pm, 2) + ' DA' : '') + '</small></div>' +
          (rl ? '<div><span>1 ' + esc(art.cond_nom) + ' du stock (' + nf(rl, 2) + ' m)</span><b>' + nf(rl / res.total, 2) + ' produits</b><small>avec ce tissu</small></div>' : '') +
          '<div><span>1 mètre de tissu</span><b>' + nf(1 / res.total, 2) + ' produits</b><small>' + nf(res.W / 100, 2) + ' m × 1 m</small></div></div>' +
          '<div class="at-actions"><button type="button" class="btn p" id="cp-apply">Appliquer au coût : ' + nf(res.total, 4) + ' m par produit</button><button type="button" class="btn" id="cp-save">Enregistrer sans appliquer</button></div>' +
          '<p class="cp-help">Les gabarits saisis ici sont gardés dans le produit : les autres lignes (doublure, fermeture, tafta, liseré…) peuvent les réutiliser.</p>';
      }
      plans.innerHTML = res ? res.lignes.filter(x => x.pieces).map(x => '<figure>' + dessin(x, res.W, res.H, COUL[x.g.t % COUL.length]) + '<figcaption><b>' + esc(x.g.nom || 'Gabarit') + '</b> : ' + nf(x.pieces, 2) + ' pièces dans 1 m</figcaption></figure>').join('') : '';
    }
    async function dessinerCp(i) {
      lire(); const g = cfg.items[i]; if (!g || !FM()) return;
      const r = await FM().editer(Object.assign({}, g, { forme: 'libre' }));
      if (r) Object.assign(g, { forme: 'libre', pts: r.pts, l: r.l, h: r.h }); else if (!g.pts) g.forme = 'rect';
      corps(); calc();
    }
    async function enregistrer(appliquer) {
      lire();
      // les gabarits saisis à la main sont ajoutés aux gabarits du produit (réutilisables partout)
      const nouveaux = cfg.items.filter(g => !g.ref && num(g.l) > 0 && num(g.h) > 0);
      if (nouveaux.length && p) {
        const items = L.slice();
        nouveaux.forEach((g, k) => {
          const nom = String(g.nom || '').trim() || 'Gabarit ' + (items.length + 1);
          let ex = items.find(x => x.nom.toLowerCase() === nom.toLowerCase() && num(x.l) === num(g.l) && num(x.h) === num(g.h) && (x.forme || 'rect') === (g.forme || 'rect'));
          if (!ex) { ex = { id: nid(), nom, l: num(g.l), h: num(g.h), p: null }; if (g.forme && g.forme !== 'rect') { ex.forme = g.forme; if (g.pts) ex.pts = g.pts; } items.push(ex); }
          g.ref = ex.id;
        });
        try { L = await sauverLib(p, items); } catch (e) { alert('Gabarits non enregistrés dans le produit : ' + (e.message || e)); }
      }
      const r = calculer(cfg, { gabarits: { items: L } }), ctl = controler(cfg, { gabarits: { items: L } }, 'surface');
      if (appliquer && (!r || r.erreur || ctl.err.length)) { alert(ctl.err.join('\n') || (r && r.erreur) || 'Calcul impossible.'); return; }
      const gab = { laize: laizeCm(cfg.laize) || 140, marge: cfg.marge, items: cfg.items.filter(g => g.ref || num(g.l) > 0).map(g => g.ref ? { ref: g.ref, n: Math.max(0, num(g.n)) } : Object.assign({ nom: g.nom || '', l: num(g.l), h: num(g.h), n: Math.max(0, num(g.n)) }, g.forme && g.forme !== 'rect' ? { forme: g.forme, pts: g.pts } : {})) };
      await terminer(ctx, gab, r ? r.total : 0, appliquer, bg);
    }

    calc();
    bg.addEventListener('input', e => { if (e.target.closest('.cp-box') && e.target.tagName !== 'SELECT') calc(); });
    bg.addEventListener('change', e => {
      if (e.target.dataset.k === 'ref') { lire(); const tr = e.target.closest('tr'); const g = cfg.items[+tr.dataset.i]; if (g.ref) { delete g.nom; delete g.l; delete g.h; delete g.forme; delete g.pts; } corps(); calc(); }
      if (e.target.dataset.k === 'forme') { lire(); const i = +e.target.closest('tr').dataset.i, g = cfg.items[i]; if (g.forme !== 'libre') delete g.pts; corps(); calc(); if (g.forme === 'libre' && !g.pts) dessinerCp(i); }
    });
    bg.addEventListener('click', e => {
      const t = e.target;
      if (t.id === 'cp-x' || t === bg) { bg.remove(); return; }
      if (t.id === 'cp-add') { lire(); cfg.items.push({ nom: '', l: '', h: '', n: 1 }); corps(); calc(); const ins = bg.querySelectorAll('#cp-g [data-k=nom]'); ins[ins.length - 1].focus(); return; }
      const dr = t.closest('[data-cpdraw]'); if (dr) { dessinerCp(+dr.dataset.cpdraw); return; }
      const ad = t.closest('[data-addref]'); if (ad) { lire(); cfg.items = cfg.items.filter(x => x.ref || num(x.l) > 0 || String(x.nom || '').trim()); cfg.items.push({ ref: ad.dataset.addref, n: 1 }); corps(); calc(); return; }
      if (t.id === 'cp-all') { lire(); L.forEach(g => { if (!cfg.items.some(x => x.ref === g.id)) cfg.items.push({ ref: g.id, n: 1 }); }); corps(); calc(); return; }
      const d = t.closest('[data-del]'); if (d) { lire(); cfg.items.splice(+d.dataset.del, 1); corps(); calc(); return; }
      if (t.id === 'cp-apply') { enregistrer(true); return; }
      if (t.id === 'cp-save') { enregistrer(false); return; }
    });
    bg.addEventListener('keydown', e => { if (e.key === 'Escape') bg.remove(); });
    setTimeout(() => { const f = bg.querySelector('#cp-g [data-k=l]:not([readonly])'); if (f && !f.value) f.focus(); }, 50);
  }

  /* ---------- Fenêtre LONGUEUR (fermeture, curseur, tafta, liseré…) ---------- */
  function ouvrirLongueur(ligneId, opts) {
    const ctx = contexte(ligneId, opts); if (!ctx) return;
    const { l, p } = ctx;
    const L = lib(p);
    const bg = document.createElement('div'); bg.className = 'cp-bg'; document.body.appendChild(bg);
    const titre = esc(typeof nomLigne === 'function' ? nomLigne(l) : l.designation);
    if (!L.length) {
      bg.innerHTML = '<div class="cp-box"><div class="at-actions" style="margin-top:0"><h3 style="margin:0 auto 0 0">📏 Longueur par gabarits — ' + titre + '</h3><button type="button" class="btn s" id="cp-x">Fermer</button></div>' +
        '<p class="cp-help">Ce produit n’a pas encore de gabarits. Ajoutez-les dans la carte <b>« 📐 Gabarits du produit »</b> (au-dessus des lignes de coût) ou via le bouton « 📐 Gabarits » d’une ligne de tissu, puis revenez ici.</p></div>';
      bg.addEventListener('click', e => { if (e.target.id === 'cp-x' || e.target === bg) bg.remove(); });
      return;
    }
    const g0 = l.gabarits && l.gabarits.type === 'longueur' ? l.gabarits : null;
    const cfg = { type: 'longueur', ajout: g0 ? num(g0.ajout) : 0, termes: (g0 && g0.termes && g0.termes.length ? g0.termes : [{ ref: L[0].id, mesure: 'p', n: 1 }]).map(x => ({ ...x })) };
    const prix = typeof prixLigne === 'function' ? prixLigne(l) : Number(l.prix_unitaire) || 0;
    const ligneT = (x, i) => '<tr data-i="' + i + '"><td data-cap="Gabarit"><select data-k="ref" data-nocherche="1">' + optsLib(L, x.ref) + '</select></td>' +
      '<td data-cap="Mesure"><select data-k="mesure" data-nocherche="1">' + MESURES.map(m => '<option value="' + m[0] + '"' + (m[0] === x.mesure ? ' selected' : '') + '>' + m[1] + '</option>').join('') + '</select></td>' +
      '<td data-cap="× nombre"><input data-k="n" type="number" step="any" inputmode="decimal" value="' + esc(x.n) + '"></td>' +
      '<td class="cp-v n" data-cap="Longueur"></td><td class="cp-del"><button type="button" class="btn s d" data-del="' + i + '">×</button></td></tr>';
    bg.innerHTML = '<div class="cp-box"><div class="at-actions" style="margin-top:0"><h3 style="margin:0 auto 0 0">📏 Longueur par gabarits — ' + titre + '</h3><button type="button" class="btn s" id="cp-x">Fermer</button></div>' +
      '<p class="cp-help">Longueur pour <b>1 produit</b> = somme des mesures des gabarits + ajout. Exemples : <b>curseur</b> = grand côté du soufflet + 3 cm ; <b>tafta</b> = périmètre face + périmètre dos + périmètre fond − 5 cm ; <b>liseré</b> = périmètre face + périmètre dos.</p>' +
      '<div class="tw"><table class="iv-tbl cp-tbl cp-lt no-cards"><thead><tr><th>Gabarit</th><th>Mesure</th><th>× nombre</th><th class="n">Longueur</th><th></th></tr></thead><tbody id="cp-t"></tbody>' +
      '<tfoot><tr><td colspan="3">Ajout / retrait (cm) <small>(négatif pour retirer)</small></td><td class="n"><input id="cp-ajout" type="number" step="any" inputmode="decimal" value="' + esc(cfg.ajout || 0) + '" style="max-width:110px;text-align:right"></td><td></td></tr>' +
      '<tr class="cp-tot"><td colspan="3">Longueur pour 1 produit</td><td class="n" id="cp-total" colspan="2">—</td></tr></tfoot></table></div>' +
      '<div class="at-actions"><button type="button" class="btn s" id="cp-add">+ Ajouter une mesure</button></div><div id="cp-res"></div></div>';
    const corps = () => { bg.querySelector('#cp-t').innerHTML = cfg.termes.map(ligneT).join(''); };
    corps();
    function lire() {
      cfg.ajout = num(bg.querySelector('#cp-ajout').value);
      bg.querySelectorAll('#cp-t tr[data-i]').forEach(tr => { const x = cfg.termes[+tr.dataset.i]; if (!x) return; tr.querySelectorAll('[data-k]').forEach(i => { x[i.dataset.k] = i.value; }); });
    }
    let res = null;
    function calc() {
      lire(); res = calculerLongueur(cfg, p);
      bg.querySelectorAll('#cp-t tr[data-i]').forEach(tr => { const x = res.termes[+tr.dataset.i]; tr.querySelector('.cp-v').innerHTML = x && x.g ? '<b>' + nf(x.cm, 2) + ' cm</b><small>' + nf(mesure(x.g, x.mesure), 2) + ' × ' + nf(x.n, 2) + (prix ? ' · ' + nf(x.cm / 100 * prix, 2) + ' DA' : '') + '</small>' : '<span class="cp-err">gabarit supprimé</span>'; });
      bg.querySelector('#cp-total').innerHTML = '<b>' + nf(res.cm, 2) + ' cm = ' + nf(res.m, 4) + ' m</b>';
      const ctl = controler(cfg, p, 'longueur');
      bg.querySelector('#cp-res').innerHTML = boiteControle(ctl) + (!ctl.err.length
        ? '<div class="cp-res"><div><span>Pour 1 produit</span><b>' + nf(res.m, 4) + ' m</b><small>' + nf(res.cm, 1) + ' cm' + (prix ? ' · ' + nf(res.m * prix, 2) + ' DA' : '') + '</small></div></div>' +
          '<div class="at-actions"><button type="button" class="btn p" id="cp-apply">Appliquer au coût : ' + nf(res.m, 4) + ' m par produit</button><button type="button" class="btn" id="cp-save">Enregistrer sans appliquer</button></div>'
        : '');
    }
    async function enregistrer(appliquer) {
      lire(); const r = calculerLongueur(cfg, p), ctl = controler(cfg, p, 'longueur');
      if (appliquer && ctl.err.length) { alert(ctl.err.join('\n')); return; }
      const gab = { type: 'longueur', ajout: num(cfg.ajout), termes: cfg.termes.filter(x => x.ref).map(x => ({ ref: x.ref, mesure: x.mesure || 'p', n: num(x.n) })) };
      await terminer(ctx, gab, r.m, appliquer, bg);
    }
    calc();
    bg.addEventListener('input', e => { if (e.target.closest('.cp-box')) calc(); });
    bg.addEventListener('change', e => { if (e.target.tagName === 'SELECT') calc(); });
    bg.addEventListener('click', e => {
      const t = e.target;
      if (t.id === 'cp-x' || t === bg) { bg.remove(); return; }
      if (t.id === 'cp-add') { lire(); cfg.termes.push({ ref: L[0].id, mesure: 'p', n: 1 }); corps(); calc(); return; }
      const d = t.closest('[data-del]'); if (d) { lire(); cfg.termes.splice(+d.dataset.del, 1); corps(); calc(); return; }
      if (t.id === 'cp-apply') { enregistrer(true); return; }
      if (t.id === 'cp-save') { enregistrer(false); return; }
    });
    bg.addEventListener('keydown', e => { if (e.key === 'Escape') bg.remove(); });
  }

  /* ---------- Carte « Gabarits du produit » (page Produits) ---------- */
  let carteP = null, carteItems = [], modifie = false;
  /* carte(p) : dans la page Produits ; carte(p, element) : dans un autre endroit (ex. section Gabarits) */
  function carte(p, cible) {
    let box;
    if (cible) { box = cible; if (!box._branche) { box._branche = true; brancher(box); } }
    else {
      const lignesCard = document.getElementById('pd-lignes-body'); if (!lignesCard) return;
      const anchor = lignesCard.closest('.card'); if (!anchor) return;
      box = document.getElementById('pd-gabcard');
      if (!box) { box = document.createElement('div'); box.id = 'pd-gabcard'; box.className = 'card'; box.style.marginTop = '16px'; anchor.parentNode.insertBefore(box, anchor); brancher(box); }
    }
    if (!p) { box.style.display = 'none'; return; }
    box.style.display = '';
    if (!carteP || String(carteP.id) !== String(p.id) || !modifie) { carteP = p; carteItems = lib(p).map(g => ({ ...g })); modifie = false; }
    rendreCarte(box);
  }
  function utilisations(id) {
    return (typeof LIGNES !== 'undefined' ? LIGNES : []).filter(l => carteP && String(l.produit_id) === String(carteP.id) && l.gabarits &&
      ((l.gabarits.items || []).some(x => x.ref === id) || (l.gabarits.termes || []).some(x => x.ref === id))).map(l => typeof nomLigne === 'function' ? nomLigne(l) : l.designation);
  }
  function rendreCarte(box) {
    box.innerHTML = '<div class="at-actions" style="margin-top:0"><h2 style="margin-right:auto">📐 Gabarits du produit</h2>' +
      '<button type="button" class="btn s" data-gc="add">+ Ajouter un gabarit</button>' +
      '<button type="button" class="btn s p" data-gc="save"' + (modifie ? '' : ' disabled') + '>Enregistrer' + (modifie ? ' et recalculer' : '') + '</button></div>' +
      '<p class="pr-help">Saisis <b>une seule fois</b> : face, dos, soufflet, fond, poche… Ils servent au métrage du tissu, de la doublure, du PVC (📐) et aux longueurs de fermeture, curseur, tafta, liseré (📏). Choisissez la <b>forme</b> : rectangle, carré, rond, triangle ou <b>forme libre</b> (dessinée sur une grille) — le métrage compte alors l’emboîtement réel (ronds en quinconce, triangles tête-bêche…). Le <b>périmètre</b> est calculé selon la forme. <b>Touche Entrée</b> : case suivante, puis nouveau gabarit.</p>' +
      (carteItems.length ? '<div class="tw"><table class="iv-tbl cp-tbl cp-gc no-cards"><thead><tr><th>Gabarit</th><th>Forme</th><th>Largeur / Ø (cm)</th><th>Hauteur (cm)</th><th>Périmètre (cm)</th><th>Utilisé dans</th><th></th></tr></thead><tbody>' +
        carteItems.map((g, i) => { const u = utilisations(g.id), f = g.forme || 'rect', fm = FM(), lib1 = f === 'libre', egal = f === 'rond' || f === 'carre';
          const ap = fm && f !== 'rect' && (num(g.l) > 0 || (lib1 && g.pts)) ? fm.apercu(g, 34, COUL[i % COUL.length]) : '';
          return '<tr data-gi="' + i + '"><td data-cap="Gabarit"><span class="cp-nm"><i class="cp-c" style="background:' + COUL[i % COUL.length] + '"></i><input data-gk="nom" value="' + esc(g.nom) + '" maxlength="40" placeholder="Face, dos, soufflet…"></span></td>' +
          '<td data-cap="Forme" class="fm-cell">' + (fm ? '<select data-gk="forme" data-nocherche="1">' + fm.FORMES.map(x => '<option value="' + x[0] + '"' + (x[0] === f ? ' selected' : '') + '>' + x[2] + ' ' + x[1] + '</option>').join('') + '</select>' : '') + ap +
            (lib1 ? '<button type="button" class="btn s fm-dr" data-gdraw="' + i + '">✏️ ' + (g.pts && g.pts.length >= 3 ? 'Modifier' : 'Dessiner') + '</button>' : '') + '</td>' +
          '<td data-cap="' + (f === 'rond' ? 'Diamètre (cm)' : f === 'carre' ? 'Côté (cm)' : f === 'triangle' ? 'Base (cm)' : 'Largeur (cm)') + '"><input data-gk="l" type="number" min="0" step="0.1" inputmode="decimal" value="' + esc(g.l || '') + '"' + (lib1 ? ' readonly title="Calculé depuis le dessin"' : '') + ' placeholder="' + (f === 'rond' ? 'Ø' : f === 'triangle' ? 'base' : '') + '"></td>' +
          '<td data-cap="Hauteur (cm)"><input data-gk="h" type="number" min="0" step="0.1" inputmode="decimal" value="' + esc(egal ? (g.l || '') : (g.h || '')) + '"' + (egal || lib1 ? ' readonly tabindex="-1"' : '') + '></td>' +
          '<td data-cap="Périmètre (cm)"><input data-gk="p" type="number" min="0" step="0.1" inputmode="decimal" value="' + esc(num(g.p) > 0 && !lib1 ? g.p : '') + '" placeholder="' + nf(perimAuto(g), 1) + '"></td>' +
          '<td data-cap="Utilisé dans" class="cp-use">' + (u.length ? esc(u.join(', ')) : '<small>—</small>') + '</td>' +
          '<td class="cp-del"><button type="button" class="btn s d" data-gdel="' + i + '" title="Supprimer">×</button></td></tr>'; }).join('') + '</tbody></table></div>'
        : '<p class="cp-help">Aucun gabarit pour ce produit. Cliquez sur « + Ajouter un gabarit ».</p>');
  }
  async function dessinerG(box, i) {
    const g = carteItems[i]; if (!g || !FM()) return;
    const r = await FM().editer(g);
    if (!r) { if (!(g.pts && g.pts.length >= 3)) { g.forme = 'rect'; rendreCarte(box); } return; }
    Object.assign(g, { forme: 'libre', pts: r.pts, l: r.l, h: r.h, p: null });
    modifie = true; rendreCarte(box);
    const b = box.querySelector('[data-gc=save]'); if (b) { b.disabled = false; b.textContent = 'Enregistrer et recalculer'; }
  }
  function brancher(box) {
    // Touche Entrée : case suivante (nom → largeur → hauteur → périmètre) ; à la fin de la dernière ligne, un nouveau gabarit est ajouté
    box.addEventListener('keydown', e => {
      if (e.key !== 'Enter' || e.shiftKey || !e.target.dataset || !e.target.dataset.gk) return;
      e.preventDefault();
      const ins = [...box.querySelectorAll('tr[data-gi] input[data-gk]')], k = ins.indexOf(e.target);
      if (k >= 0 && k < ins.length - 1) { ins[k + 1].focus(); if (ins[k + 1].select) ins[k + 1].select(); return; }
      carteItems.push({ id: nid(), nom: '', l: '', h: '', p: null }); modifie = true; rendreCarte(box);
      const noms = box.querySelectorAll('[data-gk=nom]'); const n = noms[noms.length - 1]; if (n) { n.focus(); n.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
    });
    box.addEventListener('input', e => {
      const tr = e.target.closest('tr[data-gi]'); if (!tr || !e.target.dataset.gk) return;
      const g = carteItems[+tr.dataset.gi]; g[e.target.dataset.gk] = e.target.value;
      if (e.target.dataset.gk === 'forme') {
        if ((g.forme === 'rond' || g.forme === 'carre') && num(g.l) > 0) g.h = g.l;
        g.p = null; modifie = true; rendreCarte(box);
        if (g.forme === 'libre' && !(g.pts && g.pts.length >= 3)) dessinerG(box, +tr.dataset.gi);
        return;
      }
      if ((g.forme === 'rond' || g.forme === 'carre') && e.target.dataset.gk === 'l') { g.h = g.l; const hi = tr.querySelector('[data-gk=h]'); if (hi) hi.value = g.l; }
      if (e.target.dataset.gk !== 'p') { const pi = tr.querySelector('[data-gk=p]'); if (pi) pi.placeholder = nf(perimAuto(g), 1); }
      if (!modifie) { modifie = true; const b = box.querySelector('[data-gc=save]'); b.disabled = false; b.textContent = 'Enregistrer et recalculer'; }
    });
    box.addEventListener('click', async e => {
      const t = e.target;
      if (t.dataset.gc === 'add') { carteItems.push({ id: nid(), nom: '', l: '', h: '', p: null }); modifie = true; rendreCarte(box); const ins = box.querySelectorAll('[data-gk=nom]'); ins[ins.length - 1].focus(); return; }
      const dr = t.closest('[data-gdraw]'); if (dr) { dessinerG(box, +dr.dataset.gdraw); return; }
      const d = t.closest('[data-gdel]');
      if (d) {
        const g = carteItems[+d.dataset.gdel], u = utilisations(g.id);
        if (u.length && !confirm('Le gabarit « ' + g.nom + ' » est utilisé dans : ' + u.join(', ') + '.\nLe supprimer quand même ? (ces lignes ne pourront plus être recalculées avec lui)')) return;
        carteItems.splice(+d.dataset.gdel, 1); modifie = true; rendreCarte(box); return;
      }
      if (t.dataset.gc === 'save') {
        t.disabled = true; t.textContent = 'Enregistrement…';
        try {
          await sauverLib(carteP, carteItems.filter(g => String(g.nom || '').trim() || num(g.l) > 0));
          modifie = false;
          const n = await recalculerProduit(carteP);
          if (typeof renderProduits === 'function') renderProduits();
          prevenir();
          dire('Gabarits enregistrés.' + (n ? ' ' + n + ' ligne(s) recalculée(s) : coût de revient et fiche matières à jour.' : ''));
        } catch (err) { t.disabled = false; t.textContent = 'Enregistrer et recalculer'; alert('Erreur : ' + (err.message || err)); }
      }
    });
  }

  /* Vérification automatique à l'affichage d'un produit : les lignes décalées (gabarit modifié ailleurs,
     sur un autre appareil…) sont recalculées ; une seule fois par produit et par état des gabarits. */
  const vus = {};
  async function verifierProduit(p) {
    if (!p) return 0;
    const lignes = (typeof LIGNES !== 'undefined' ? LIGNES : []).filter(l => String(l.produit_id) === String(p.id) && l.gabarits && l.gabarits.resultat);
    const cle = JSON.stringify([lib(p), lignes.map(l => [l.id, l.quantite])]);
    if (vus[p.id] === cle) return 0; vus[p.id] = cle;
    if (!lignes.some(l => { const e = etatLigne(l, p); return e && e.k === 'dec'; })) return 0;
    const n = await recalculerProduit(p);
    if (n) { if (typeof renderProduits === 'function') renderProduits(); prevenir(); dire(n + ' ligne(s) recalculée(s) avec les gabarits à jour.'); }
    return n;
  }
  /* Une fois par appareil : toutes les lignes calculées avec les gabarits sont remises au calcul
     « pièces entières en largeur » (la chute de côté n'est plus comptée comme utilisable). */
  let toutFait = false;
  async function recalculerTout() {
    const K = 'mariabag_gab_chute_utilisee_v2';
    try { if (toutFait || localStorage.getItem(K)) return 0; } catch (e) {}
    toutFait = true;
    const P = typeof PRODUITS !== 'undefined' ? PRODUITS : []; let n = 0;
    for (const p of P) { try { n += await recalculerProduit(p); } catch (e) {} }
    try { localStorage.setItem(K, new Date().toISOString()); } catch (e) {}
    if (n) { if (typeof renderProduits === 'function') renderProduits(); prevenir(); dire(n + ' ligne(s) recalculée(s) : la chute de côté est maintenant comptée comme utilisée.'); }
    return n;
  }
  window.Calepinage = { recalculerTout, calculer, calculerLongueur, maxPieces: null, ouvrir, ouvrirLongueur, carte, recalculerProduit, estSurface, etatLigne, verifierProduit, controler };
  window.ouvrirCalepinage = ouvrir;
  window.ouvrirLongueurGab = ouvrirLongueur;
})();
