/* ============================================================
   CALEPINAGE — mètres de tissu (principal, doublure, PVC…) consommés par pièce,
   calculés à partir des GABARITS (largeur × hauteur de chaque élément : face, dos, soufflet, poche…)

   Le rouleau a une largeur fixe (laize, 140 cm par défaut) et une longueur « infinie ».
   On place toutes les pièces d'une SÉRIE (ex. 100 produits) sur le rouleau, en mélangeant
   les gabarits pour remplir les vides : algorithme « skyline bas-gauche » avec rotation 90°
   (si le sens du tissu le permet), essayé avec plusieurs ordres de tri ; on garde le meilleur.
     longueur utilisée L (m) ÷ nombre de produits = mètres par pièce (chute de coupe incluse)
   On affiche aussi la méthode simple « pièces par mètre » de chaque gabarit pour comparer :
     par rangée = ⌊ laize utile ÷ (largeur + marge) ⌋ ; rangées par mètre = ⌊ 100 ÷ (hauteur + marge) ⌋
     pièces par mètre = par rangée × rangées ; mètres par produit = Σ ( nombre par produit ÷ pièces par mètre )
   ============================================================ */
(function () {
  'use strict';
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const nf = (n, d) => (Number(n) || 0).toLocaleString('fr-FR', { maximumFractionDigits: d == null ? 2 : d });
  const num = v => { const x = parseFloat(String(v ?? '').replace(',', '.')); return isFinite(x) ? x : 0; };
  const COUL = ['#e8a6b4', '#9cc5e8', '#b9dfa6', '#f2d38a', '#c8b3e6', '#f4b183', '#9fd8cf', '#e3b5d0', '#c9c9c9', '#a8c3a0'];
  const MAX_RECTS = 2500;

  /* ---------- Skyline bas-gauche ---------- */
  function skyline(rects, W) {
    let sky = [{ x: 0, y: 0, w: W }];
    const places = [];
    for (const r of rects) {
      let best = null;
      const ors = r.rot && r.w !== r.h ? [[r.w, r.h, false], [r.h, r.w, true]] : [[r.w, r.h, false]];
      for (const [w, h, rt] of ors) {
        if (w > W + 1e-9) continue;
        for (let i = 0; i < sky.length; i++) {
          const x = sky[i].x; if (x + w > W + 1e-9) break;
          let y = 0, reste = w, j = i;
          while (reste > 1e-9 && j < sky.length) { y = Math.max(y, sky[j].y); reste -= sky[j].w; j++; }
          if (reste > 1e-9) continue;
          const top = y + h;
          if (!best || top < best.top - 1e-9 || (Math.abs(top - best.top) < 1e-9 && (y < best.y - 1e-9 || (Math.abs(y - best.y) < 1e-9 && x < best.x)))) best = { x, y, w, h, top, rt };
        }
      }
      if (!best) return null;       // pièce plus large que le rouleau
      places.push({ x: best.x, y: best.y, w: best.w, h: best.h, t: r.t, rt: best.rt });
      // mise à jour de la ligne d'horizon
      const nx = best.x, nw = best.w, ny = best.top, out = [];
      for (const s of sky) {
        const a = s.x, b = s.x + s.w;
        if (b <= nx + 1e-9 || a >= nx + nw - 1e-9) { out.push(s); continue; }
        if (a < nx) out.push({ x: a, y: s.y, w: nx - a });
        if (b > nx + nw) out.push({ x: nx + nw, y: s.y, w: b - nx - nw });
      }
      out.push({ x: nx, y: ny, w: nw });
      out.sort((p, q) => p.x - q.x);
      sky = [];
      for (const s of out) { const l = sky[sky.length - 1]; if (l && Math.abs(l.y - s.y) < 1e-9 && Math.abs(l.x + l.w - s.x) < 1e-9) l.w += s.w; else sky.push({ ...s }); }
    }
    return { places, L: places.reduce((m, p) => Math.max(m, p.y + p.h), 0) };
  }

  /* Calcul complet : renvoie le meilleur placement pour une série de N produits */
  function calculer(cfg) {
    const laize = num(cfg.laize) || 140, lis = Math.max(0, num(cfg.lisiere)), marge = Math.max(0, num(cfg.marge));
    const W = laize - 2 * lis;
    const items = (cfg.items || []).map((g, t) => ({ ...g, t, l: num(g.l), h: num(g.h), n: Math.max(0, Math.round(num(g.n))) })).filter(g => g.l > 0 && g.h > 0 && g.n > 0);
    if (!items.length || !(W > 0)) return null;
    const parProduit = items.reduce((s, g) => s + g.n, 0);
    let N = Math.max(1, Math.round(num(cfg.serie)) || 100), Ncalc = Math.min(N, Math.max(1, Math.floor(MAX_RECTS / parProduit)));
    const trop = items.filter(g => !(g.l + marge <= W + 1e-9 || (g.rot && g.h + marge <= W + 1e-9)));
    if (trop.length) return { erreur: 'Gabarit plus large que le rouleau : ' + trop.map(g => g.nom || 'sans nom').join(', ') + ' (laize utile ' + nf(W, 1) + ' cm).' };
    const rects = [];
    items.forEach(g => { for (let k = 0; k < g.n * Ncalc; k++) rects.push({ w: g.l + marge, h: g.h + marge, rot: !!g.rot, t: g.t }); });
    const tris = {
      'hauteur': (a, b) => Math.max(b.h, b.rot ? b.w : 0) - Math.max(a.h, a.rot ? a.w : 0) || b.w * b.h - a.w * a.h,
      'surface': (a, b) => b.w * b.h - a.w * a.h || b.h - a.h,
      'grand côté': (a, b) => Math.max(b.w, b.h) - Math.max(a.w, a.h) || b.w * b.h - a.w * a.h,
      'largeur': (a, b) => b.w - a.w || b.h - a.h
    };
    let best = null;
    for (const [nom, f] of Object.entries(tris)) {
      const r = skyline(rects.slice().sort(f), W); if (!r) continue;
      if (!best || r.L < best.L - 1e-9) best = { ...r, tri: nom };
    }
    if (!best) return { erreur: 'Placement impossible (gabarit trop large ?).' };
    const surfPieces = items.reduce((s, g) => s + g.l * g.h * g.n, 0) * Ncalc;        // cm², sans les marges
    const Lm = best.L / 100, parPiece = Lm / Ncalc;
    // méthode simple : pièces par mètre de chaque gabarit seul (meilleure orientation)
    const simple = items.map(g => {
      const ori = g.rot ? [[g.l, g.h], [g.h, g.l]] : [[g.l, g.h]];
      let b = null;
      for (const [w, h] of ori) {
        const parRang = Math.floor(W / (w + marge)); if (!parRang) continue;
        const parMetre = parRang * 100 / (h + marge);                // continu (rangées enchaînées sur le rouleau)
        const rangs = Math.floor(100 / (h + marge)), parMetreEntier = parRang * rangs;
        if (!b || parMetre > b.parMetre) b = { w, h, parRang, parMetre, parMetreEntier };
      }
      return { g, ...b, m: b ? g.n / b.parMetre : null };
    });
    const mSimple = simple.reduce((s, x) => s + (x.m || 0), 0);
    return {
      W, laize, lis, marge, N, Ncalc, parProduit, items, simple, mSimple,
      L: Lm * N / Ncalc, parPiece, places: best.places, Lcalc: Lm, tri: best.tri,
      rendement: surfPieces / (W * best.L), chute: 1 - surfPieces / (laize * best.L)
    };
  }

  /* ---------- Fenêtre ---------- */
  function ouvrir(ligneId) {
    const l = (typeof LIGNES !== 'undefined' ? LIGNES : []).find(x => String(x.id) === String(ligneId)); if (!l) return;
    const art = window.StockAPI && l.article_id ? StockAPI.byId(l.article_id) : null;
    const g0 = l.gabarits && typeof l.gabarits === 'object' ? l.gabarits : {};
    const cfg = { laize: g0.laize || 140, lisiere: g0.lisiere ?? 1, marge: g0.marge ?? 0.5, serie: g0.serie || 100, items: (g0.items && g0.items.length ? g0.items : [{ nom: 'Face', l: '', h: '', n: 1, rot: true }]).map(x => ({ ...x })) };
    const bg = document.createElement('div'); bg.className = 'cp-bg';
    document.body.appendChild(bg);
    const prixM = () => typeof prixLigne === 'function' ? prixLigne(l) : Number(l.prix_unitaire) || 0;
    let res = null;

    function lignesG() {
      return cfg.items.map((g, i) => '<tr data-i="' + i + '"><td><i class="cp-c" style="background:' + COUL[i % COUL.length] + '"></i><input data-k="nom" value="' + esc(g.nom || '') + '" placeholder="Face, dos, soufflet…" maxlength="40"></td>' +
        '<td><input data-k="l" type="number" min="0" step="0.1" inputmode="decimal" value="' + esc(g.l) + '" placeholder="cm"></td>' +
        '<td><input data-k="h" type="number" min="0" step="0.1" inputmode="decimal" value="' + esc(g.h) + '" placeholder="cm"></td>' +
        '<td><input data-k="n" type="number" min="1" step="1" inputmode="numeric" value="' + esc(g.n) + '"></td>' +
        '<td style="text-align:center"><input data-k="rot" type="checkbox"' + (g.rot ? ' checked' : '') + ' title="Rotation 90° autorisée (si le sens du tissu le permet)"></td>' +
        '<td class="cp-pm"></td><td><button type="button" class="btn s d" data-del="' + i + '" title="Supprimer">×</button></td></tr>').join('');
    }
    function html() {
      bg.innerHTML = '<div class="cp-box"><div class="at-actions" style="margin-top:0"><h3 style="margin:0 auto 0 0">📐 Calepinage — ' + esc(typeof nomLigne === 'function' ? nomLigne(l) : l.designation) + '</h3><button type="button" class="btn s" id="cp-x">Fermer</button></div>' +
        '<p class="cp-help">Mesurez chaque <b>gabarit</b> (largeur × hauteur en cm, rectangle qui l’entoure) et le nombre de fois qu’il est coupé pour <b>un</b> produit. La plateforme place toutes les pièces d’une série sur le rouleau, en mélangeant les gabarits pour remplir les vides, et calcule les mètres réellement consommés par pièce (chute comprise).</p>' +
        '<div class="at-fields cp-cfg"><label>Laize du rouleau (cm)<input id="cp-laize" type="number" min="10" step="1" value="' + esc(cfg.laize) + '"></label>' +
        '<label>Lisière inutilisable, de chaque côté (cm)<input id="cp-lis" type="number" min="0" step="0.5" value="' + esc(cfg.lisiere) + '"></label>' +
        '<label>Marge de coupe entre pièces (cm)<input id="cp-marge" type="number" min="0" step="0.1" value="' + esc(cfg.marge) + '"></label>' +
        '<label>Série coupée en une fois (produits)<input id="cp-serie" type="number" min="1" step="1" value="' + esc(cfg.serie) + '"></label></div>' +
        '<div class="tw"><table class="iv-tbl cp-tbl"><thead><tr><th>Gabarit</th><th>Largeur (cm)</th><th>Hauteur (cm)</th><th>Nb / produit</th><th title="Rotation 90° autorisée">Tourner</th><th>Pièces / mètre*</th><th></th></tr></thead><tbody id="cp-g">' + lignesG() + '</tbody></table></div>' +
        '<div class="at-actions"><button type="button" class="btn s" id="cp-add">+ Ajouter un gabarit</button></div>' +
        '<div id="cp-res"></div></div>';
    }
    function lire() {
      cfg.laize = num(bg.querySelector('#cp-laize').value); cfg.lisiere = num(bg.querySelector('#cp-lis').value);
      cfg.marge = num(bg.querySelector('#cp-marge').value); cfg.serie = Math.max(1, Math.round(num(bg.querySelector('#cp-serie').value)) || 1);
      bg.querySelectorAll('#cp-g tr[data-i]').forEach(tr => { const g = cfg.items[+tr.dataset.i]; if (!g) return;
        tr.querySelectorAll('[data-k]').forEach(inp => { g[inp.dataset.k] = inp.type === 'checkbox' ? inp.checked : inp.dataset.k === 'nom' ? inp.value : inp.value; }); });
    }
    function svg(r) {
      const maxL = Math.min(r.Lcalc * 100, 300);                // aperçu : 3 premiers mètres au plus
      const sc = 560 / r.laize, Hpx = maxL * sc, off = r.lis * sc;
      let s = '<svg viewBox="0 0 ' + (560) + ' ' + (Hpx + 2) + '" width="100%" style="max-width:560px;background:#faf7f8;border:1px solid #ddd;border-radius:6px">';
      if (r.lis) s += '<rect x="0" y="0" width="' + off + '" height="' + Hpx + '" fill="#eee"/><rect x="' + (560 - off) + '" y="0" width="' + off + '" height="' + Hpx + '" fill="#eee"/>';
      r.places.filter(p => p.y < maxL).forEach(p => {
        const g = r.items.find(x => x.t === p.t) || {}, m = r.marge;
        s += '<rect x="' + (off + p.x * sc) + '" y="' + (p.y * sc) + '" width="' + Math.max(0.5, (p.w - m) * sc) + '" height="' + Math.max(0.5, (p.h - m) * sc) + '" fill="' + COUL[p.t % COUL.length] + '" stroke="#555" stroke-width="0.4"><title>' + esc(g.nom || '') + (p.rt ? ' (tourné)' : '') + '</title></rect>';
      });
      for (let k = 100; k < maxL; k += 100) s += '<line x1="0" x2="560" y1="' + k * sc + '" y2="' + k * sc + '" stroke="#b00020" stroke-dasharray="4 3" stroke-width="0.8"/><text x="4" y="' + (k * sc - 3) + '" font-size="10" fill="#b00020">' + (k / 100) + ' m</text>';
      return s + '</svg>';
    }
    function calc() {
      lire(); res = calculer(cfg);
      const out = bg.querySelector('#cp-res');
      bg.querySelectorAll('#cp-g tr[data-i]').forEach(tr => { const c = tr.querySelector('.cp-pm'); const x = res && res.simple ? res.simple.find(y => y.g.t === +tr.dataset.i) : null;
        c.innerHTML = x && x.parRang ? '<b>' + nf(x.parMetre, 1) + '</b><small>' + x.parRang + ' par rangée' + (x.w !== x.g.l ? ' (tourné)' : '') + '</small>' : '—'; });
      if (!res) { out.innerHTML = '<p class="cp-help">Indiquez au moins un gabarit (largeur, hauteur, nombre).</p>'; return; }
      if (res.erreur) { out.innerHTML = '<p class="cp-err">⚠ ' + esc(res.erreur) + '</p>'; return; }
      const pm = prixM(), gain = res.mSimple - res.parPiece;
      out.innerHTML = '<div class="cp-kpis">' +
        '<div class="cp-k on"><span>Tissu par pièce (calepinage optimisé)</span><b>' + nf(res.parPiece, 4) + ' m</b><small>' + nf(res.parPiece * 100, 1) + ' cm de rouleau' + (pm ? ' · ' + nf(res.parPiece * pm, 2) + ' DA' : '') + '</small></div>' +
        '<div class="cp-k"><span>Méthode simple (pièces par mètre)</span><b>' + nf(res.mSimple, 4) + ' m</b><small>' + (gain > 0.00005 ? 'le mélange économise ' + nf(gain * 100, 1) + ' cm / pièce' + (pm ? ' (' + nf(gain * pm, 2) + ' DA)' : '') : 'même résultat') + '</small></div>' +
        '<div class="cp-k"><span>Série de ' + nf(res.N, 0) + ' produits</span><b>' + nf(res.L, 2) + ' m</b><small>' + (art && window.StockAPI && StockAPI.aCond(art) ? nf(res.L / StockAPI.condQte(art), 2) + ' ' + esc(art.cond_nom) + '(s) · ' : '') + nf(res.parProduit * res.N, 0) + ' pièces coupées</small></div>' +
        '<div class="cp-k"><span>Matière utilisée / chute</span><b>' + nf(res.rendement * 100, 1) + ' %</b><small>chute ' + nf(res.chute * 100, 1) + ' % (marges et lisières comprises)</small></div></div>' +
        '<div class="at-actions"><button type="button" class="btn p" id="cp-apply">Appliquer au coût : ' + nf(res.parPiece, 4) + ' m par pièce</button><button type="button" class="btn" id="cp-save">Enregistrer les gabarits seulement</button></div>' +
        '<p class="cp-help">* Pièces / mètre = ⌊ laize utile ' + nf(res.W, 1) + ' cm ÷ (largeur + marge) ⌋ × 100 ÷ (hauteur + marge). Le calcul optimisé place les ' + nf(res.parProduit * res.Ncalc, 0) + ' pièces' + (res.Ncalc < res.N ? ' de ' + res.Ncalc + ' produits (résultat ramené à la série)' : '') + ' sur le rouleau (ordre : ' + res.tri + ') ; la chute est déjà incluse, la colonne « Chute » de la ligne sera mise à 0 %.</p>' +
        '<h4 style="margin:12px 0 6px">Plan de coupe' + (res.Lcalc > 3 ? ' (3 premiers mètres)' : '') + '</h4>' + '<div class="cp-plan">' + svg(res) + '</div>';
    }
    async function enregistrer(appliquer) {
      lire(); const r = calculer(cfg);
      const gab = { laize: cfg.laize, lisiere: cfg.lisiere, marge: cfg.marge, serie: cfg.serie, items: cfg.items.map(g => ({ nom: g.nom || '', l: num(g.l), h: num(g.h), n: Math.max(1, Math.round(num(g.n)) || 1), rot: !!g.rot })) };
      const patch = { gabarits: gab };
      if (appliquer) {
        if (!r || r.erreur) { alert(r && r.erreur || 'Calcul impossible.'); return; }
        gab.resultat = { m_piece: Math.round(r.parPiece * 10000) / 10000, simple: Math.round(r.mSimple * 10000) / 10000, rendement: Math.round(r.rendement * 1000) / 1000, le: new Date().toISOString().slice(0, 10) };
        patch.quantite = gab.resultat.m_piece; patch.perte_pct = 0;
        if (l.unite !== 'm') { if (!confirm('Cette ligne est en « ' + l.unite + ' ». Le calepinage donne des mètres : passer la ligne en mètres ?')) return; patch.unite = 'm'; }
      }
      const q = await sb.from('produit_lignes').update(patch).eq('id', l.id).select();
      if (q.error) { alert('Erreur : ' + q.error.message); return; }
      Object.assign(l, q.data && q.data[0] ? q.data[0] : patch);
      bg.remove();
      if (typeof renderProduits === 'function') renderProduits();
      if (typeof toastD === 'function') toastD(appliquer ? 'Calepinage appliqué : ' + nf(patch.quantite, 4) + ' m par pièce.' : 'Gabarits enregistrés.');
    }

    html(); calc();
    bg.addEventListener('input', e => { if (e.target.closest('.cp-box')) calc(); });
    bg.addEventListener('change', e => { if (e.target.type === 'checkbox') calc(); });
    bg.addEventListener('click', e => {
      const t = e.target;
      if (t.id === 'cp-x' || t === bg) { bg.remove(); return; }
      if (t.id === 'cp-add') { lire(); cfg.items.push({ nom: '', l: '', h: '', n: 1, rot: true }); bg.querySelector('#cp-g').innerHTML = lignesG(); calc(); const ins = bg.querySelectorAll('#cp-g [data-k=nom]'); ins[ins.length - 1].focus(); return; }
      const d = t.closest('[data-del]'); if (d) { lire(); cfg.items.splice(+d.dataset.del, 1); bg.querySelector('#cp-g').innerHTML = lignesG(); calc(); return; }
      if (t.id === 'cp-apply') { enregistrer(true); return; }
      if (t.id === 'cp-save') { enregistrer(false); return; }
    });
    bg.addEventListener('keydown', e => { if (e.key === 'Escape') bg.remove(); });
    setTimeout(() => { const f = bg.querySelector('#cp-g [data-k=l]'); if (f && !f.value) f.focus(); }, 50);
  }

  window.Calepinage = { calculer, ouvrir };
  window.ouvrirCalepinage = ouvrir;
})();
