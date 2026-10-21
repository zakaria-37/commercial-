/* ============================================================
   FOURNISSEURS & CLIENTS
   1) Choix du fournisseur (liste des contacts « Fournisseur ») dans le Stock
   2) Onglet Contacts : « Meilleurs fournisseurs » et « Meilleurs clients »
      - fournisseurs : achats du Stock (stock_mouvements, type entrée) → total acheté,
        prix comparé aux autres fournisseurs du même article
      - clients : livraisons / retours des produits finis (pf_mouvements) → chiffre d'affaires,
        marge estimée (prix de vente − coût de revient), régularité
   ============================================================ */
(function () {
  'use strict';
  const $ = s => document.querySelector(s);
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  const num = n => Math.round(Number(n) || 0).toLocaleString('fr-FR');
  const money = n => num(n) + ' DA';
  const pct = (x, d) => (x > 0 ? '+' : x < 0 ? '−' : '') + Math.abs(x * 100).toFixed(d == null ? 1 : d).replace('.', ',') + ' %';
  const fd = s => s ? String(s).slice(0, 10).split('-').reverse().join('/') : '—';
  const say = t => { if (typeof toast === 'function') toast(t); };

  /* ---------- Contacts ---------- */
  const contacts = () => (typeof D !== 'undefined' && Array.isArray(D)) ? D : [];
  const fullNom = c => [c.prenom, c.nom].filter(Boolean).join(' ').trim();
  const label = c => (c.societe || fullNom(c) || c.nom || '').trim();
  const byId = id => contacts().find(c => String(c.id) === String(id));
  const trouveParNom = (nom, type) => {
    const n = norm(nom); if (!n) return null;
    return contacts().find(c => (!type || c.type === type) && (norm(label(c)) === n || norm(fullNom(c)) === n || norm(c.societe) === n || norm(c.nom) === n)) || null;
  };

  /* ---------- 1) Choix du fournisseur ---------- */
  const el = s => typeof s === 'string' ? $(s) : s;

  function fill(sel, o) {
    const s = el(sel); if (!s) return;
    o = o || {};
    const list = contacts().filter(c => c.type === 'Fournisseur').sort((a, b) => label(a).localeCompare(label(b), 'fr'));
    let h = '<option value="">— Aucun —</option>' + list.map(c => '<option value="' + esc(c.id) + '">' + esc(label(c)) + '</option>').join('');
    let val = '';
    delete s.dataset.txt;
    if (o.id) {
      const c = byId(o.id);
      if (c) { if (!list.includes(c)) h += '<option value="' + esc(c.id) + '">' + esc(label(c)) + '</option>'; val = String(c.id); }
    }
    if (!val && o.nom) {
      const m = trouveParNom(o.nom, 'Fournisseur');
      if (m) val = String(m.id);
      else { h += '<option value="__txt">' + esc(o.nom) + ' (non lié aux contacts)</option>'; val = '__txt'; s.dataset.txt = o.nom; }
    }
    h += '<option value="__new">➕ Nouveau fournisseur…</option>';
    s.innerHTML = h;
    s.value = val;
    if (!s.dataset.pb) { s.dataset.pb = '1'; s.addEventListener('change', () => nouveau(s)); }
  }

  /* → { fournisseur: 'nom', contact_id: id|null } */
  function read(sel) {
    const s = el(sel), v = s ? s.value : '';
    if (!v || v === '__new') return { fournisseur: '', contact_id: null };
    if (v === '__txt') return { fournisseur: s.dataset.txt || '', contact_id: null };
    const c = byId(v);
    return c ? { fournisseur: label(c), contact_id: c.id } : { fournisseur: '', contact_id: null };
  }

  async function creer(nom, type) {
    nom = String(nom || '').trim(); if (!nom) return null;
    const r = await sb.from('contacts').insert([{ nom, prenom: '', societe: '', type, statut: 'Confirmé' }]).select();
    if (r.error || !r.data || !r.data[0]) { say('Erreur : ' + ((r.error && r.error.message) || 'création impossible')); return null; }
    if (typeof loadContacts === 'function') await loadContacts();
    return r.data[0].id;
  }
  async function nouveau(s) {
    if (s.value !== '__new') return;
    const nom = prompt('Nom du nouveau fournisseur :');
    const id = nom && nom.trim() ? await creer(nom, 'Fournisseur') : null;
    fill(s, { id });
    if (id) say('Fournisseur « ' + nom.trim() + ' » ajouté aux Contacts.');
  }

  /* ---------- 2) Classements ---------- */
  let tab = 'liste', periode = 'all', tri = { four: 'prix', cli: 'ca' };

  const depuis = () => {
    if (periode === 'all') return '';
    const d = new Date();
    if (periode === 'year') d.setMonth(0, 1); else if (periode === 'month') d.setDate(1); else d.setDate(d.getDate() - Number(periode));
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  };
  const dansPeriode = d => { const s = depuis(); return !s || String(d || '') >= s; };

  function cle(m, nomChamp, type) {
    if (m.contact_id && byId(m.contact_id)) return { key: 'c:' + m.contact_id, id: m.contact_id, nom: label(byId(m.contact_id)) };
    const nom = m[nomChamp] || '';
    const c = trouveParNom(nom, type);
    if (c) return { key: 'c:' + c.id, id: c.id, nom: label(c) };
    if (nom) return { key: 't:' + norm(nom), id: null, nom };
    return { key: 'none', id: null, nom: '' };
  }

  /* ----- Fournisseurs ----- */
  function calculFournisseurs() {
    if (!window.StockAPI) return null;
    const arts = new Map(StockAPI.list().map(a => [String(a.id), a]));
    const groupes = new Map(), parArt = new Map();
    StockAPI.mouvements().forEach(m => {
      if (m.type !== 'entree' || !(Number(m.quantite) > 0) || !dansPeriode(m.date_mvt)) return;
      const a = arts.get(String(m.article_id)); if (!a) return;
      const k = cle(m, 'fournisseur', 'Fournisseur');
      const pu = Number(m.prix_achat) || 0;
      const unit = pu > 0 ? (StockAPI.aCond(a) ? pu / StockAPI.condQte(a) : pu) : null;      // prix par mètre / pièce
      const base = Number(m.quantite), montant = unit != null ? unit * base : 0;
      const g = groupes.get(k.key) || { key: k.key, id: k.id, nom: k.nom || 'Fournisseur non indiqué', nb: 0, total: 0, arts: new Set(), dernier: '', sansPrix: 0, pa: new Map() };
      g.nb++; g.total += montant; g.arts.add(String(a.id)); if (unit == null) g.sansPrix++;
      if (String(m.date_mvt || '') > g.dernier) g.dernier = String(m.date_mvt || '');
      if (unit != null) { const x = g.pa.get(String(a.id)) || { montant: 0, qte: 0 }; x.montant += montant; x.qte += base; g.pa.set(String(a.id), x); }
      groupes.set(k.key, g);
    });
    // Prix moyen du marché par article = moyenne des prix moyens de chaque fournisseur (≥ 2 fournisseurs)
    groupes.forEach(g => { if (g.key === 'none') return; g.pa.forEach((x, aid) => { const l = parArt.get(aid) || []; l.push({ g, p: x.montant / x.qte, montant: x.montant }); parArt.set(aid, l); }); });
    const compar = [];
    parArt.forEach((l, aid) => {
      if (l.length < 2) return;
      const marche = l.reduce((s, x) => s + x.p, 0) / l.length, a = arts.get(aid);
      l.forEach(x => { x.g.cmp = x.g.cmp || { somme: 0, poids: 0, n: 0 }; x.g.cmp.somme += (x.p / marche - 1) * x.montant; x.g.cmp.poids += x.montant; x.g.cmp.n++; });
      const best = l.slice().sort((x, y) => x.p - y.p);
      compar.push({ art: a, marche, lignes: best });
    });
    const liste = [...groupes.values()].map(g => Object.assign(g, { ecart: g.cmp && g.cmp.poids > 0 ? g.cmp.somme / g.cmp.poids : null, nbArts: g.arts.size }));
    return { liste, compar };
  }

  function renderFournisseurs(box) {
    const r = calculFournisseurs();
    if (!r || !r.liste.length) { box.insertAdjacentHTML('beforeend', '<div class="card"><div class="ct-empty">Aucun achat enregistré sur cette période.<br>Dans <b>Stock → + Entrer</b>, choisissez le fournisseur et le prix : le classement se construit tout seul.</div></div>'); return; }
    const reels = r.liste.filter(g => g.key !== 'none');
    const total = reels.reduce((s, g) => s + g.total, 0);
    const avecEcart = reels.filter(g => g.ecart != null).sort((a, b) => a.ecart - b.ecart);
    const meilleurPrix = avecEcart[0] || null;
    const gros = reels.slice().sort((a, b) => b.total - a.total)[0] || null;
    const t = tri.four;
    const tries = r.liste.slice().sort((a, b) => {
      if (a.key === 'none') return 1; if (b.key === 'none') return -1;
      if (t === 'prix') { if ((a.ecart == null) !== (b.ecart == null)) return a.ecart == null ? 1 : -1; if (a.ecart != null && a.ecart !== b.ecart) return a.ecart - b.ecart; }
      if (t === 'nb' && a.nb !== b.nb) return b.nb - a.nb;
      return b.total - a.total;
    });
    let h = '<div class="ct-kpis">' +
      '<div class="ct-kpi"><span>Total acheté</span><b>' + money(total) + '</b><small>' + reels.length + ' fournisseur' + (reels.length > 1 ? 's' : '') + ' · ' + reels.reduce((s, g) => s + g.nb, 0) + ' achats</small></div>' +
      '<div class="ct-kpi"><span>★ Meilleur prix</span><b>' + (meilleurPrix ? esc(meilleurPrix.nom) : '—') + '</b><small>' + (meilleurPrix ? pct(meilleurPrix.ecart) + ' par rapport au prix moyen du marché' : 'Comparaison possible dès 2 fournisseurs pour un même article') + '</small></div>' +
      '<div class="ct-kpi"><span>★ Plus gros volume</span><b>' + (gros ? esc(gros.nom) : '—') + '</b><small>' + (gros && total ? Math.round(gros.total / total * 100) + ' % des achats' : '') + '</small></div></div>';
    h += '<div class="card"><div class="tw"><table class="ct-tbl"><thead><tr><th>#</th><th>Fournisseur</th><th class="n">Achats</th><th class="n">Total acheté</th><th class="n ct-col-opt">Articles</th><th class="n">Prix vs marché</th><th class="ct-col-opt">Dernier achat</th></tr></thead><tbody>' +
      tries.map((g, i) => {
        const b = [];
        if (meilleurPrix && g === meilleurPrix) b.push('<span class="ct-bdg g">★ Meilleur prix</span>');
        if (gros && g === gros && reels.length > 1) b.push('<span class="ct-bdg b">★ Plus gros volume</span>');
        if (g.key !== 'none' && g.ecart == null) b.push('<span class="ct-bdg x">Prix à comparer</span>');
        if (g.ecart != null && g.ecart >= 0.05) b.push('<span class="ct-bdg o">Plus cher que la moyenne</span>');
        if (g.sansPrix) b.push('<span class="ct-bdg x">' + g.sansPrix + ' achat' + (g.sansPrix > 1 ? 's' : '') + ' sans prix</span>');
        if (g.key !== 'none' && !g.id) b.push('<span class="ct-bdg x">Pas dans les Contacts</span>');
        return '<tr' + (g.id ? ' class="row" data-cid="' + esc(g.id) + '"' : '') + '><td><span class="ct-rk' + (i === 0 && g.key !== 'none' ? ' r1' : '') + '">' + (g.key === 'none' ? '–' : i + 1) + '</span></td>' +
          '<td><b>' + esc(g.nom) + '</b><small>' + b.join('') + '</small></td><td class="n">' + g.nb + '</td><td class="n"><b>' + money(g.total) + '</b></td><td class="n ct-col-opt">' + g.nbArts + '</td>' +
          '<td class="n">' + (g.ecart == null ? '—' : '<span class="' + (g.ecart <= 0 ? 'ct-neg' : 'ct-pos') + '">' + pct(g.ecart) + '</span>') + '</td><td class="ct-col-opt">' + fd(g.dernier) + '</td></tr>';
      }).join('') + '</tbody></table></div>' +
      '<p class="ct-note">« Prix vs marché » : pour chaque article acheté chez au moins 2 fournisseurs, on compare le prix par mètre (ou par pièce) du fournisseur à la moyenne des fournisseurs. <b>Négatif = moins cher que la moyenne.</b> Le résultat est pondéré par les montants achetés.</p></div>';
    if (r.compar.length) {
      h += '<div class="card" style="margin-top:12px"><h2 style="margin-top:0">Où acheter chaque article ?</h2><div class="tw"><table class="ct-tbl"><thead><tr><th>Article</th><th>Le moins cher</th><th class="n">Prix</th><th class="n">Écart avec le plus cher</th></tr></thead><tbody>' +
        r.compar.sort((a, b) => a.art.nom.localeCompare(b.art.nom, 'fr')).map(c => {
          const lo = c.lignes[0], hi = c.lignes[c.lignes.length - 1], u = c.art.unite || '';
          return '<tr><td><b>' + esc(c.art.nom) + '</b><small>' + esc(c.art.categorie) + '</small></td><td>' + esc(lo.g.nom) + '</td><td class="n">' + money(lo.p) + ' / ' + esc(u) + '</td><td class="n"><span class="ct-neg">' + pct(lo.p / hi.p - 1) + '</span><small>' + esc(hi.g.nom) + ' : ' + money(hi.p) + '</small></td></tr>';
        }).join('') + '</tbody></table></div></div>';
    }
    box.insertAdjacentHTML('beforeend', h);
  }

  /* ----- Clients ----- */
  function calculClients() {
    if (!window.PFAPI) return null;
    const prods = new Map(PFAPI.produits().map(p => [String(p.id), p]));
    const groupes = new Map();
    PFAPI.mouvements().forEach(m => {
      if ((m.type !== 'livraison' && m.type !== 'retour') || !dansPeriode(m.date_mvt)) return;
      const p = prods.get(String(m.produit_id));
      const k = cle(m, 'client_nom', 'Client');
      const q = Number(m.quantite) || 0, n = -q;                                      // livraison : +pièces ; retour : −pièces
      const pv = m.prix_vente != null ? Number(m.prix_vente) : (p ? Number(p.prix_vente) || 0 : 0);
      const c = p ? PFAPI.coutProduit(p) : null;
      const g = groupes.get(k.key) || { key: k.key, id: k.id, nom: k.nom || 'Client non indiqué', liv: 0, pieces: 0, ca: 0, cout: 0, coutOk: true, retours: 0, livrees: 0, dernier: '' };
      g.pieces += n; g.ca += n * pv;
      if (c != null && c > 0) g.cout += n * c; else g.coutOk = false;
      if (m.type === 'livraison') { g.liv++; g.livrees += n; if (String(m.date_mvt || '') > g.dernier) g.dernier = String(m.date_mvt || ''); }
      else g.retours += -n;
      groupes.set(k.key, g);
    });
    const liste = [...groupes.values()].map(g => Object.assign(g, { marge: g.coutOk ? g.ca - g.cout : null }));
    const actifs = new Set(liste.map(g => g.id).filter(Boolean));
    const sansAchat = contacts().filter(c => c.type === 'Client' && !actifs.has(c.id)).length;
    return { liste, sansAchat };
  }

  function renderClients(box) {
    const r = calculClients();
    if (!r || !r.liste.length) { box.insertAdjacentHTML('beforeend', '<div class="card"><div class="ct-empty">Aucune livraison enregistrée sur cette période.<br>Dans <b>Stock → Sortir</b> un modèle fini, choisissez le client : le classement se construit tout seul.</div></div>'); return; }
    const reels = r.liste.filter(g => g.key !== 'none');
    const ca = reels.reduce((s, g) => s + g.ca, 0);
    const margeOk = reels.filter(g => g.marge != null);
    const margeTot = margeOk.reduce((s, g) => s + g.marge, 0);
    const top = reels.slice().sort((a, b) => b.ca - a.ca)[0] || null;
    const topMarge = margeOk.slice().sort((a, b) => b.marge - a.marge)[0] || null;
    const fidele = reels.slice().sort((a, b) => b.liv - a.liv)[0] || null;
    const t = tri.cli;
    const tries = r.liste.slice().sort((a, b) => {
      if (a.key === 'none') return 1; if (b.key === 'none') return -1;
      if (t === 'marge') { const x = a.marge == null ? -Infinity : a.marge, y = b.marge == null ? -Infinity : b.marge; if (x !== y) return y - x; }
      if (t === 'pieces' && a.pieces !== b.pieces) return b.pieces - a.pieces;
      if (t === 'liv' && a.liv !== b.liv) return b.liv - a.liv;
      return b.ca - a.ca;
    });
    const limite = new Date(); limite.setDate(limite.getDate() - 90);
    const lim = limite.getFullYear() + '-' + String(limite.getMonth() + 1).padStart(2, '0') + '-' + String(limite.getDate()).padStart(2, '0');
    let h = '<div class="ct-kpis">' +
      '<div class="ct-kpi"><span>Chiffre d’affaires livré</span><b>' + money(ca) + '</b><small>' + reels.length + ' client' + (reels.length > 1 ? 's' : '') + ' actif' + (reels.length > 1 ? 's' : '') + '</small></div>' +
      '<div class="ct-kpi"><span>★ Meilleur client</span><b>' + (top ? esc(top.nom) : '—') + '</b><small>' + (top && ca > 0 ? Math.round(top.ca / ca * 100) + ' % du chiffre d’affaires' : '') + '</small></div>' +
      '<div class="ct-kpi"><span>Marge estimée</span><b>' + (margeOk.length ? money(margeTot) : '—') + '</b><small>' + (margeOk.length ? (ca > 0 ? Math.round(margeTot / ca * 100) + ' % du CA · ' : '') + 'prix de vente − coût de revient' : 'Renseignez les coûts dans Produits') + '</small></div></div>';
    h += '<div class="card"><div class="tw"><table class="ct-tbl"><thead><tr><th>#</th><th>Client</th><th class="n">Livraisons</th><th class="n">Pièces</th><th class="n">Chiffre d’affaires</th><th class="n ct-col-opt">Marge estimée</th><th class="n ct-col-opt">Retours</th><th class="ct-col-opt">Dernière livraison</th></tr></thead><tbody>' +
      tries.map((g, i) => {
        const b = [];
        if (top && g === top) b.push('<span class="ct-bdg g">★ Meilleur client</span>');
        if (topMarge && g === topMarge && reels.length > 1) b.push('<span class="ct-bdg b">★ Meilleure marge</span>');
        if (fidele && g === fidele && g.liv >= 3 && reels.length > 1) b.push('<span class="ct-bdg b">Le plus régulier</span>');
        if (g.key !== 'none' && g.dernier && g.dernier < lim) b.push('<span class="ct-bdg o">Inactif depuis 90 jours</span>');
        if (g.key !== 'none' && !g.id) b.push('<span class="ct-bdg x">Pas dans les Contacts</span>');
        return '<tr' + (g.id ? ' class="row" data-cid="' + esc(g.id) + '"' : '') + '><td><span class="ct-rk' + (i === 0 && g.key !== 'none' ? ' r1' : '') + '">' + (g.key === 'none' ? '–' : i + 1) + '</span></td>' +
          '<td><b>' + esc(g.nom) + '</b><small>' + b.join('') + '</small></td><td class="n">' + g.liv + '</td><td class="n">' + num(g.pieces) + '</td><td class="n"><b>' + money(g.ca) + '</b></td>' +
          '<td class="n ct-col-opt">' + (g.marge == null ? '—' : '<span class="' + (g.marge >= 0 ? 'ct-neg' : 'ct-pos') + '">' + money(g.marge) + '</span>') + '</td>' +
          '<td class="n ct-col-opt">' + (g.retours ? num(g.retours) + ' pc' : '—') + '</td><td class="ct-col-opt">' + fd(g.dernier) + '</td></tr>';
      }).join('') + '</tbody></table></div>' +
      '<p class="ct-note">Classement d’après les livraisons (moins les retours) du Stock des modèles finis. La marge utilise le coût de revient de l’onglet Produits' + (margeOk.length < reels.length ? ' (« — » = coût de revient manquant pour un modèle livré)' : '') + '.' +
      (r.sansAchat ? ' <b>' + r.sansAchat + '</b> client' + (r.sansAchat > 1 ? 's' : '') + ' de vos Contacts ' + (r.sansAchat > 1 ? 'n’ont' : 'n’a') + ' encore aucune livraison enregistrée.' : '') + '</p></div>';
    box.insertAdjacentHTML('beforeend', h);
  }

  /* ----- Chiffre d'affaires : toutes les opérations avec l'atelier (achats fournisseurs + ventes clients) ----- */
  let qui = 'tous', ouvert = '';
  const MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  const moisLbl = k => MOIS[Number(k.slice(5, 7)) - 1] + ' ' + k.slice(0, 4);

  function operations(opts) {
    const ops = [];
    const ok = opts ? (d => { d = String(d || ''); return (!opts.depuis || d > opts.depuis) && (!opts.jusqua || d <= opts.jusqua); }) : dansPeriode;
    if (window.StockAPI) {
      const arts = new Map(StockAPI.list().map(a => [String(a.id), a]));
      StockAPI.mouvements().forEach(m => {
        if (m.type !== 'entree' || !(Number(m.quantite) > 0) || !ok(m.date_mvt)) return;
        const a = arts.get(String(m.article_id)); if (!a) return;
        const k = cle(m, 'fournisseur', 'Fournisseur');
        const pu = Number(m.prix_achat) || 0, unit = pu > 0 ? (StockAPI.aCond(a) ? pu / StockAPI.condQte(a) : pu) : 0;
        ops.push({ sens: 'achat', date: String(m.date_mvt || ''), key: k.key, id: k.id, nom: k.nom || 'Fournisseur non indiqué', libelle: a.nom, qte: StockAPI.fmtQty(a, Number(m.quantite)).main, montant: unit * Number(m.quantite), ref: m.reference || '', sansPrix: !(pu > 0) });
      });
    }
    if (window.PFAPI) {
      const prods = new Map(PFAPI.produits().map(p => [String(p.id), p]));
      PFAPI.mouvements().forEach(m => {
        if ((m.type !== 'livraison' && m.type !== 'retour') || !ok(m.date_mvt)) return;
        const p = prods.get(String(m.produit_id)), k = cle(m, 'client_nom', 'Client');
        const n = -(Number(m.quantite) || 0), pv = m.prix_vente != null ? Number(m.prix_vente) : (p ? Number(p.prix_vente) || 0 : 0);
        ops.push({ sens: 'vente', date: String(m.date_mvt || ''), key: k.key, id: k.id, nom: k.nom || 'Client non indiqué', libelle: (p ? p.nom : 'Produit') + (m.type === 'retour' ? ' (retour)' : ''), qte: num(Math.abs(n)) + ' pc', montant: n * pv, ref: m.reference || '', sansPrix: !(pv > 0) });
      });
    }
    return ops;
  }

  function renderCA(box) {
    const toutes = operations();
    const ops = toutes.filter(o => qui === 'tous' || (qui === 'clients') === (o.sens === 'vente'));
    const ventes = toutes.filter(o => o.sens === 'vente').reduce((s, o) => s + o.montant, 0);
    const achats = toutes.filter(o => o.sens === 'achat').reduce((s, o) => s + o.montant, 0);
    const bar = '<div class="ct-bar"><label>Période <select id="ct-per">' +
      [['all', 'Depuis le début'], ['year', 'Cette année'], ['month', 'Ce mois-ci'], ['365', '12 derniers mois'], ['90', '3 derniers mois'], ['30', '30 derniers jours']].map(o => '<option value="' + o[0] + '"' + (periode === o[0] ? ' selected' : '') + '>' + o[1] + '</option>').join('') + '</select></label>' +
      '<label>Afficher <select id="ct-qui">' + [['tous', 'Clients et fournisseurs'], ['clients', 'Clients seulement'], ['fournisseurs', 'Fournisseurs seulement']].map(o => '<option value="' + o[0] + '"' + (qui === o[0] ? ' selected' : '') + '>' + o[1] + '</option>').join('') + '</select></label>' +
      '<button class="btn s" type="button" id="ct-xls">Exporter Excel</button></div>';
    let h = bar + '<div class="ct-kpis">' +
      '<div class="ct-kpi"><span>Ventes aux clients</span><b class="ct-neg">' + money(ventes) + '</b><small>livraisons moins retours</small></div>' +
      '<div class="ct-kpi"><span>Achats aux fournisseurs</span><b class="ct-pos">' + money(achats) + '</b><small>entrées de stock avec prix</small></div>' +
      '<div class="ct-kpi"><span>Ventes − achats</span><b>' + money(ventes - achats) + '</b><small>' + toutes.length + ' opération' + (toutes.length > 1 ? 's' : '') + '</small></div></div>';
    if (!ops.length) { box.innerHTML = h + '<div class="card"><div class="ct-empty">Aucune opération sur cette période.<br>Les achats viennent de <b>Stock → + Entrer</b> (avec fournisseur et prix), les ventes de <b>Stock → Sortir</b> un modèle fini (avec client).</div></div>'; return; }

    // Par mois
    const mois = new Map();
    ops.forEach(o => { const k = o.date.slice(0, 7); if (k.length < 7) return; const x = mois.get(k) || { v: 0, a: 0 }; if (o.sens === 'vente') x.v += o.montant; else x.a += o.montant; mois.set(k, x); });
    const ks = [...mois.keys()].sort().reverse().slice(0, 12);
    const max = Math.max(1, ...ks.map(k => Math.max(mois.get(k).v, mois.get(k).a)));
    h += '<div class="card"><h2 style="margin-top:0">Par mois</h2><div class="tw"><table class="ct-tbl"><thead><tr><th>Mois</th><th>Ventes</th><th>Achats</th><th class="n">Ventes − achats</th></tr></thead><tbody>' +
      ks.map(k => { const x = mois.get(k); return '<tr><td><b>' + moisLbl(k) + '</b></td>' +
        '<td>' + (qui === 'fournisseurs' ? '—' : '<div class="ct-b g" style="width:' + Math.max(2, Math.round(x.v / max * 100)) + '%"></div><small>' + money(x.v) + '</small>') + '</td>' +
        '<td>' + (qui === 'clients' ? '—' : '<div class="ct-b o" style="width:' + Math.max(2, Math.round(x.a / max * 100)) + '%"></div><small>' + money(x.a) + '</small>') + '</td>' +
        '<td class="n"><span class="' + (x.v - x.a >= 0 ? 'ct-neg' : 'ct-pos') + '">' + money(x.v - x.a) + '</span></td></tr>'; }).join('') + '</tbody></table></div></div>';

    // Par contact
    const g = new Map();
    ops.forEach(o => { const x = g.get(o.key + o.sens) || { key: o.key, id: o.id, nom: o.nom, sens: o.sens, nb: 0, total: 0, dernier: '', ops: [] }; x.nb++; x.total += o.montant; if (o.date > x.dernier) x.dernier = o.date; x.ops.push(o); g.set(o.key + o.sens, x); });
    const liste = [...g.values()].sort((a, b) => b.total - a.total);
    const totalSens = s => liste.filter(x => x.sens === s).reduce((t, x) => t + x.total, 0);
    const cmds = window.PFAPI ? PFAPI.commandes() : [];
    h += '<div class="card" style="margin-top:12px"><h2 style="margin-top:0">Par client et par fournisseur</h2><div class="tw"><table class="ct-tbl"><thead><tr><th>#</th><th>Contact</th><th class="n">Opérations</th><th class="n">Chiffre d’affaires</th><th class="n ct-col-opt">Part</th><th class="ct-col-opt">Dernière opération</th></tr></thead><tbody>' +
      liste.map((x, i) => {
        const part = totalSens(x.sens) > 0 ? Math.round(x.total / totalSens(x.sens) * 100) + ' %' : '—';
        const cl = x.sens === 'vente' && x.id ? cmds.filter(c => String(c.contact_id) === String(x.id)) : [];
        const cmdTxt = cl.length ? ' · ' + cl.length + ' commande' + (cl.length > 1 ? 's' : '') + ' (' + cl.reduce((s, c) => s + (Number(PFAPI.reste(c)) || 0), 0) + ' pc à livrer)' : '';
        const id = x.key + x.sens, op = ouvert === id;
        let r = '<tr class="row" data-ca="' + esc(id) + '"><td><span class="ct-rk">' + (i + 1) + '</span></td><td><b>' + esc(x.nom) + '</b><small><span class="ct-bdg ' + (x.sens === 'vente' ? 'g' : 'o') + '">' + (x.sens === 'vente' ? 'Client' : 'Fournisseur') + '</span>' + esc(cmdTxt) + '</small></td>' +
          '<td class="n">' + x.nb + '</td><td class="n"><b>' + money(x.total) + '</b></td><td class="n ct-col-opt">' + part + '</td><td class="ct-col-opt">' + fd(x.dernier) + '</td></tr>';
        if (op) r += '<tr class="ct-det"><td></td><td colspan="5"><table class="ct-tbl"><thead><tr><th>Date</th><th>' + (x.sens === 'vente' ? 'Produit' : 'Article') + '</th><th class="n">Qté</th><th class="n">Montant</th><th>Réf.</th></tr></thead><tbody>' +
          x.ops.sort((a, b) => b.date.localeCompare(a.date)).map(o => '<tr><td>' + fd(o.date) + '</td><td>' + esc(o.libelle) + '</td><td class="n">' + esc(o.qte) + '</td><td class="n">' + (o.sansPrix ? '<small>sans prix</small>' : money(o.montant)) + '</td><td>' + esc(o.ref) + '</td></tr>').join('') + '</tbody></table></td></tr>';
        return r;
      }).join('') + '</tbody></table></div>' +
      '<p class="ct-note">Chiffre d’affaires <b>réel</b>, calculé uniquement à partir des mouvements enregistrés : <b>clients</b> = livraisons (prix de vente) moins retours ; <b>fournisseurs</b> = entrées de stock (quantité × prix d’achat). Les achats saisis sans prix comptent 0 DA. Cliquez sur une ligne pour voir le détail des opérations.</p></div>';
    box.innerHTML = h;
    box._rows = liste;
  }

  function exporterCA() {
    if (typeof XLSX === 'undefined') { say('Export indisponible.'); return; }
    const ops = operations().filter(o => qui === 'tous' || (qui === 'clients') === (o.sens === 'vente'));
    const wb = XLSX.utils.book_new();
    const g = new Map();
    ops.forEach(o => { const x = g.get(o.key + o.sens) || { Contact: o.nom, Type: o.sens === 'vente' ? 'Client' : 'Fournisseur', Opérations: 0, 'Chiffre d’affaires (DA)': 0 }; x.Opérations++; x['Chiffre d’affaires (DA)'] += Math.round(o.montant * 100) / 100; g.set(o.key + o.sens, x); });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([...g.values()].sort((a, b) => b['Chiffre d’affaires (DA)'] - a['Chiffre d’affaires (DA)'])), 'Par contact');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(ops.sort((a, b) => b.date.localeCompare(a.date)).map(o => ({ Date: fd(o.date), Type: o.sens === 'vente' ? 'Vente' : 'Achat', Contact: o.nom, 'Produit / article': o.libelle, Quantité: o.qte, 'Montant (DA)': Math.round(o.montant * 100) / 100, Référence: o.ref }))), 'Opérations');
    XLSX.writeFile(wb, 'chiffre-affaires-' + new Date().toISOString().slice(0, 10) + '.xlsx');
  }

  function render() {
    const box = $('#ct-rank'); if (!box) return;
    const liste = tab === 'liste';
    box.hidden = liste;
    const tools = $('#v-list > .tools'), tw = $('#v-list > .tw');
    if (tools) tools.style.display = liste ? '' : 'none';
    if (tw) tw.style.display = liste ? '' : 'none';
    document.querySelectorAll('#ct-tabs [data-ctp]').forEach(b => b.classList.toggle('on', b.dataset.ctp === tab));
    if (liste) return;
    if (tab === 'ca') { renderCA(box); return; }
    if (tab === 'pay') { if (window.PayAPI) PayAPI.render(box); return; }
    const four = tab === 'four';
    const tris = four ? [['prix', 'Meilleur prix'], ['vol', 'Plus gros achats'], ['nb', 'Plus d’achats']] : [['ca', 'Chiffre d’affaires'], ['marge', 'Marge'], ['pieces', 'Pièces livrées'], ['liv', 'Nombre de livraisons']];
    box.innerHTML = '<div class="ct-bar"><label>Période <select id="ct-per">' +
      [['all', 'Depuis le début'], ['year', 'Cette année'], ['month', 'Ce mois-ci'], ['365', '12 derniers mois'], ['90', '3 derniers mois'], ['30', '30 derniers jours']].map(o => '<option value="' + o[0] + '"' + (periode === o[0] ? ' selected' : '') + '>' + o[1] + '</option>').join('') + '</select></label>' +
      '<label>Classer par <select id="ct-tri">' + tris.map(o => '<option value="' + o[0] + '"' + (tri[tab] === o[0] ? ' selected' : '') + '>' + o[1] + '</option>').join('') + '</select></label></div>';
    if (four) renderFournisseurs(box); else renderClients(box);
  }

  document.addEventListener('click', e => {
    const b = e.target.closest('#ct-tabs [data-ctp]');
    if (b) { tab = b.dataset.ctp; render(); return; }
    if (e.target.closest('#ct-xls')) { exporterCA(); return; }
    const ca = e.target.closest('#ct-rank tr[data-ca]');
    if (ca) { ouvert = ouvert === ca.dataset.ca ? '' : ca.dataset.ca; render(); return; }
    const row = e.target.closest('#ct-rank tr[data-cid]');
    if (row && typeof edit === 'function') edit(row.dataset.cid);
  });
  document.addEventListener('change', e => {
    if (e.target.id === 'ct-per') { periode = e.target.value; render(); }
    else if (e.target.id === 'ct-qui') { qui = e.target.value; render(); }
    else if (e.target.id === 'ct-tri') { tri[tab] = e.target.value; render(); }
  });
  ['mariabag:stock', 'mariabag:pf'].forEach(ev => document.addEventListener(ev, () => { if (tab !== 'liste' && $('#v-list').classList.contains('on')) render(); }));

  window.PartAPI = { fill, read, creer, contacts, label, render, ops: operations };
})();
