/* ============================================================
   MARIA BAG — STOCK DES PRODUITS FINIS
   - Un produit fini = un produit de l'onglet Produits (même modèle).
   - Le stock = somme des MOUVEMENTS (pièces) : entrées de production,
     livraisons aux clients, retours, pertes, inventaires.
   - STOCKAGE automatique : les productions terminées (Ateliers) sont
     proposées en entrée de stock, en un clic.
   - DESTOCKAGE : livraison à un client (pris dans les Contacts « Client »),
     liée à une commande : la quantité reçue de la commande (Ateliers >
     Suivi & commandes) et son statut se mettent à jour tout seuls.
   - Calculs croisés : coût de revient et marge (onglet Produits), capacité
     de production avec le stock de matières, commandes à livrer comparées
     au stock disponible, livraisons par client.
   Tout est dans un module isolé (IIFE) : aucun nom global à part PFAPI et
   les fonctions pfXxx appelées par les boutons.
   ============================================================ */
(function () {
  'use strict';

  const $ = s => document.querySelector(s);
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const iso = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const fd = s => s ? s.split('-').reverse().join('/') : '';
  const num = (n, dec) => (Number(n) || 0).toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: dec == null ? 0 : dec });
  const money = (n, dec) => (Number(n) || 0).toLocaleString('fr-FR', { minimumFractionDigits: dec == null ? 0 : dec, maximumFractionDigits: dec == null ? 0 : dec }) + ' DA';
  const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

  let PR = [], MVTS = [], PRODS = [], CMDS = [], CONTACTS = [], MODELES = [], COMPOS = [], ATS = [];
  let QTY = {}, HAS = {};
  let err = '', loading = null;
  let fQ = '', histProduit = '', histClient = '';
  let mvtType = 'livraison', curProduit = null;

  const TYPES = {
    entree: ['Entrée', 'g', 1], livraison: ['Livraison', 'r', -1], retour: ['Retour client', 'g', 1],
    perte: ['Perte / casse', 'o', -1], ajustement: ['Inventaire', 'o', 0]
  };

  function toast(msg) {
    const e = $('#toastS'); if (!e) return;
    e.textContent = msg; e.style.display = 'block';
    clearTimeout(toast.t); toast.t = setTimeout(() => e.style.display = 'none', 7000);
  }
  function errMsg(error) {
    const m = (error && error.message) || String(error);
    if (/schema cache|does not exist|Could not find|column|relation/i.test(m))
      return 'Tables du stock des produits finis introuvables dans Supabase. Exécutez supabase/stock_produits_finis.sql dans SQL Editor, puis rechargez la page. (' + m + ')';
    if (/row-level security|permission denied|policy/i.test(m)) return 'Accès refusé par Supabase (RLS). Réexécutez supabase/stock_produits_finis.sql. (' + m + ')';
    return m;
  }

  /* ---------- Données et liens ---------- */
  const prodFinie = p => p.statut === 'Terminée' || !!p.date_reception_reelle;
  const prodActive = p => !prodFinie(p) && p.statut !== 'Annulée';
  const cmdOuverte = c => c.statut !== 'Reçue' && c.statut !== 'Annulée' && (Number(c.quantite_commandee) || 0) - (Number(c.quantite_recue) || 0) > 0;
  const produitById = id => PR.find(p => String(p.id) === String(id)) || null;
  const qtyOf = id => Math.round(QTY[String(id)] || 0);
  function produitDeProd(p) {                              // production -> produit fini (lien mémorisé, sinon même nom)
    if (!p) return null;
    if (p.produit_id) { const x = produitById(p.produit_id); if (x) return x; }
    const n = norm(p.modele_nom); return PR.find(x => norm(x.nom) === n) || null;
  }
  function produitDeCmd(c) { return produitDeProd(PRODS.find(p => String(p.id) === String(c.production_id))); }
  function clientNom(id, copie) {
    const c = CONTACTS.find(x => String(x.id) === String(id));
    if (!c) return copie || '';
    return [c.prenom, c.nom].filter(Boolean).join(' ') + (c.societe ? ' — ' + c.societe : '');
  }
  const atelierNom = id => (ATS.find(a => String(a.id) === String(id)) || {}).nom || '';
  function cout(p) { try { return typeof recap === 'function' ? recap(p).total : null; } catch (e) { return null; } }

  /* Capacité de production avec le stock de MATIÈRES actuel (fiche matières du modèle lié) */
  function capacite(p) {
    const mid = p.modele_id || (MODELES.find(m => norm(m.nom) === norm(p.nom)) || {}).id;
    if (!mid) return { cap: null, why: 'Aucun modèle lié' };
    const comps = COMPOS.filter(c => String(c.modele_id) === String(mid) && c.type !== 'finition');
    if (!comps.length) return { cap: null, why: 'Fiche matières vide' };
    if (!window.StockAPI) return { cap: null, why: 'Stock matières non chargé' };
    let cap = Infinity, limit = '', nonLies = 0;
    comps.forEach(c => {
      const a = c.article_id ? StockAPI.byId(c.article_id) : null;
      if (!a) { nonLies++; return; }
      const need = StockAPI.toBase(a, Number(c.quantite) * (1 + Number(c.perte_pct || 0) / 100), c.unite);
      if (!(need > 0)) { nonLies++; return; }
      const n = Math.floor(StockAPI.qty(a.id) / need + 1e-9);
      if (n < cap) { cap = n; limit = a.nom; }
    });
    if (cap === Infinity) return { cap: null, why: nonLies + ' composant(s) non lié(s) au stock' };
    return { cap: Math.max(0, cap), limit, nonLies };
  }
  function etat(p) {
    const q = qtyOf(p.id), seuil = Number(p.seuil_pf) || 0;
    if (q < 0) return { l: 'Négatif', c: 'r', rank: 0 };
    if (q === 0) return HAS[String(p.id)] || seuil > 0 ? { l: 'Rupture', c: 'r', rank: 1 } : { l: 'Aucun stock', c: 'n', rank: 3 };
    if (seuil > 0 && q <= seuil) return { l: 'Stock bas', c: 'o', rank: 2 };
    return { l: 'OK', c: 'g', rank: 3 };
  }
  const enAlerte = p => etat(p).rank <= 2;
  const enProduction = p => PRODS.filter(x => prodActive(x) && produitDeProd(x) && String(produitDeProd(x).id) === String(p.id)).reduce((s, x) => s + (Number(x.quantite_lancee) || 0), 0);
  const resteCmd = c => Math.max(0, (Number(c.quantite_commandee) || 0) - (Number(c.quantite_recue) || 0));
  const aLivrer = p => CMDS.filter(c => cmdOuverte(c) && produitDeCmd(c) && String(produitDeCmd(c).id) === String(p.id)).reduce((s, c) => s + resteCmd(c), 0);
  const prodsAEntrer = () => PRODS.filter(p => prodFinie(p) && !MVTS.some(m => String(m.production_id) === String(p.id)));

  /* ---------- Chargement ---------- */
  async function load() {
    if (loading) return loading;
    loading = (async () => {
      try {
        const pr = await sb.from('produits').select('*').order('nom', { ascending: true });
        if (pr.error) { err = errMsg(pr.error); PR = []; MVTS = []; render(); notify(); return false; }
        const mv = await sb.from('pf_mouvements').select('*').order('date_mvt', { ascending: false }).order('created_at', { ascending: false });
        PR = pr.data || [];
        if (mv.error) { err = errMsg(mv.error); MVTS = []; render(); notify(); return false; }
        MVTS = mv.data || [];
        const tol = async q => { try { const r = await q; return r.error ? [] : (r.data || []); } catch (e) { return []; } };
        [PRODS, CMDS, CONTACTS, MODELES, COMPOS, ATS] = await Promise.all([
          tol(sb.from('productions').select('*')), tol(sb.from('commandes').select('*')), tol(sb.from('contacts').select('*')),
          tol(sb.from('modeles').select('*')), tol(sb.from('composants').select('*')), tol(sb.from('ateliers').select('*'))]);
        try { if (window.StockAPI) await StockAPI.load(); } catch (e) { /* stock matières non installé */ }
        QTY = {}; HAS = {};
        MVTS.forEach(m => { QTY[String(m.produit_id)] = (QTY[String(m.produit_id)] || 0) + (Number(m.quantite) || 0); HAS[String(m.produit_id)] = true; });
        err = '';
        render(); notify();
        return true;
      } finally { loading = null; }
    })();
    return loading;
  }
  function notify() { document.dispatchEvent(new Event('mariabag:pf')); }

  /* ---------- Affichage ---------- */
  function render() {
    const has = PR.length > 0;
    $('#pf-main').style.display = has ? '' : 'none';
    $('#pf-stats').style.display = has ? '' : 'none';
    $('#pf-empty').style.display = has ? 'none' : '';
    if (!has) {
      $('#pf-empty').innerHTML = err ? '<p style="color:#b00020">⚠ ' + esc(err) + '</p>'
        : '<h2>Aucun produit fini</h2><p>Les produits finis sont les produits de l’onglet <b>Produits</b> (sac à dos, cabas…). Créez d’abord un produit, il apparaîtra ici avec son stock, son coût de revient et ses livraisons.</p>' +
          '<button class="btn p" type="button" onclick="document.querySelector(\'nav button[data-v=produits]\').click()">Aller aux Produits</button>';
      return;
    }
    if (err) toast(err);
    renderStats(); renderAssoc(); renderProds(); renderCmds(); renderTable(); renderClients(); renderHist();
  }

  /* Productions sans produit fini : création automatique des produits (même nom) ou association */
  const prodsSansProduit = () => PRODS.filter(p => p.statut !== 'Annulée' && !produitDeProd(p));
  function renderAssoc() {
    const list = prodsSansProduit(), box = $('#pf-assoc');
    box.style.display = list.length ? '' : 'none';
    if (!list.length) return;
    const noms = [...new Set(list.map(p => String(p.modele_nom || '').trim()))].filter(Boolean);
    box.innerHTML = '<h2>' + noms.length + ' production(s) sans produit fini associé</h2>' +
      '<p class="pr-help">Les productions d’Ateliers (<b>' + esc(noms.slice(0, 4).join(', ')) + (noms.length > 4 ? '…' : '') + '</b>) n’ont pas le même nom qu’un produit de l’onglet Produits. ' +
      'Créez les produits correspondants en un clic (ils reçoivent ensuite leur prix de revient et leur fiche matières dans Produits), ou associez-les un par un dans les listes ci-dessous.</p>' +
      '<div class="at-actions" style="margin-top:0"><button class="btn p" type="button" onclick="pfCreerProduits()">Créer les ' + noms.length + ' produit(s) manquant(s)</button></div>';
  }
  /* Crée le produit fini correspondant à une production (nom identique) et l'associe */
  async function creerProduitPour(prod) {
    const nom = String(prod.modele_nom || '').trim(); if (!nom) return null;
    let p = PR.find(x => norm(x.nom) === norm(nom));
    if (!p) {
      const r = await sb.from('produits').insert([{ nom, description: 'Créé depuis la production (Ateliers)', mo_date: iso(new Date()) }]).select();
      if (r.error || !r.data || !r.data[0]) { toast('Erreur : ' + errMsg(r.error || { message: 'création du produit impossible' })); return null; }
      p = r.data[0]; PR.push(p);
    }
    const u = await sb.from('productions').update({ produit_id: p.id }).eq('id', prod.id);
    if (u.error) { toast('Erreur : ' + errMsg(u.error)); return null; }
    prod.produit_id = p.id;
    return p;
  }
  async function creerProduits() {
    const list = prodsSansProduit(); if (!list.length) return;
    let n = 0;
    for (const prod of list) { if (!produitDeProd(prod)) { const p = await creerProduitPour(prod); if (p) n++; } }
    toast(n + ' production(s) associée(s) à un produit fini. Complétez leurs prix et leur fiche matières dans l’onglet Produits.');
    await load();
    if (typeof loadProduits === 'function') loadProduits();
  }

  function renderStats() {
    const q = p => Math.max(0, qtyOf(p.id));
    const pieces = PR.reduce((s, p) => s + q(p), 0);
    const vCout = PR.reduce((s, p) => s + q(p) * (cout(p) || 0), 0), vVente = PR.reduce((s, p) => s + q(p) * (Number(p.prix_vente) || 0), 0);
    const al = PR.filter(enAlerte).length, livrer = CMDS.filter(cmdOuverte).reduce((s, c) => s + resteCmd(c), 0);
    $('#pf-stats').innerHTML =
      '<div class="at-stat"><span>Pièces en stock</span><b>' + num(pieces) + '</b><small style="color:var(--mut)">' + PR.length + ' produits</small></div>' +
      '<div class="at-stat"><span>Valeur au coût de revient</span><b>' + money(vCout) + '</b><small style="color:var(--mut)">vente : ' + money(vVente) + '</small></div>' +
      '<div class="at-stat' + (al ? ' st-warn' : '') + '"><span>À surveiller</span><b>' + al + '</b><small style="color:var(--mut)">stock bas ou en rupture</small></div>' +
      '<div class="at-stat"><span>À livrer aux clients</span><b>' + num(livrer) + '</b><small style="color:var(--mut)">pièces en commande</small></div>';
  }

  /* Productions terminées : entrée en stock en un clic */
  function renderProds() {
    const list = prodsAEntrer();
    $('#pf-prod-card').style.display = list.length ? '' : 'none';
    $('#pf-prod-body').innerHTML = list.map(p => {
      const m = produitDeProd(p);
      return '<tr><td><b>' + esc(p.modele_nom) + '</b><small>' + esc(atelierNom(p.atelier_id)) + '</small></td>' +
        '<td><select id="pfp-prod-' + esc(p.id) + '" style="min-width:170px"><option value="">— Choisir le produit —</option>' + (m ? '' : '<option value="__new__">＋ Créer le produit « ' + esc(p.modele_nom) + ' »</option>') + PR.map(x => '<option value="' + esc(x.id) + '"' + (m && String(m.id) === String(x.id) ? ' selected' : '') + '>' + esc(x.nom) + '</option>').join('') + '</select></td>' +
        '<td><input id="pfp-qte-' + esc(p.id) + '" type="number" min="0" step="1" value="' + (Number(p.quantite_lancee) || 0) + '" style="width:90px"></td>' +
        '<td>' + fd(p.date_reception_reelle || p.date_reception_prevue) + '</td>' +
        '<td class="emp-act"><button class="btn s p" type="button" onclick="pfEntrerProd(\'' + esc(p.id) + '\')">Entrer en stock</button> ' +
        '<button class="btn s" type="button" title="Ne pas ajouter ces pièces au stock (déjà livrées…)" onclick="pfIgnorerProd(\'' + esc(p.id) + '\')">Ne pas stocker</button></td></tr>';
    }).join('');
  }

  /* Commandes clients à livrer, comparées au stock disponible */
  function renderCmds() {
    const list = CMDS.filter(cmdOuverte).sort((a, b) => (a.date_reception_prevue || '9999').localeCompare(b.date_reception_prevue || '9999'));
    const today = iso(new Date());
    $('#pf-cmd-body').innerHTML = list.length ? list.map(c => {
      const p = produitDeCmd(c), reste = resteCmd(c), stock = p ? qtyOf(p.id) : 0, prod = PRODS.find(x => String(x.id) === String(c.production_id));
      const retard = c.date_reception_prevue && c.date_reception_prevue < today;
      const prodTd = p ? '<b>' + esc(p.nom) + '</b>' : (prod ? '<select data-assoc="' + esc(prod.id) + '"><option value="">Associer « ' + esc(prod.modele_nom) + ' » à un produit…</option><option value="__new__">＋ Créer le produit « ' + esc(prod.modele_nom) + ' »</option>' + PR.map(x => '<option value="' + esc(x.id) + '">' + esc(x.nom) + '</option>').join('') + '</select>' : '<small>—</small>');
      return '<tr><td><b>' + esc(c.commande_numero || '—') + '</b>' + (c.date_reception_prevue ? '<small' + (retard ? ' style="color:var(--r)"' : '') + '>prévue le ' + fd(c.date_reception_prevue) + (retard ? ' (en retard)' : '') + '</small>' : '') + '</td>' +
        '<td>' + esc(clientNom(c.contact_id) || '—') + '</td><td>' + prodTd + '</td>' +
        '<td><b>' + num(reste) + '</b> pcs<small>' + num(c.quantite_recue) + ' / ' + num(c.quantite_commandee) + ' déjà livrées</small></td>' +
        '<td>' + (p ? (stock >= reste ? '<span class="bd g">Suffisant</span><small>' + num(stock) + ' en stock</small>' : '<span class="bd ' + (stock > 0 ? 'o' : 'r') + '">Manque ' + num(reste - stock) + '</span><small>' + num(stock) + ' en stock · à produire</small>') : '<small>—</small>') + '</td>' +
        '<td class="emp-act">' + (p ? '<button class="btn s p" type="button" onclick="pfLivrer(\'' + esc(c.id) + '\')">Livrer</button>' : '') + '</td></tr>';
    }).join('') : '<tr><td colspan="6" class="at-empty">Aucune commande à livrer. Les commandes se créent dans Ateliers › Suivi & commandes.</td></tr>';
  }

  function renderTable() {
    const q = fQ;
    const list = PR.filter(p => !q || norm(p.nom + ' ' + (p.description || '')).includes(norm(q)));
    $('#pf-tbody').innerHTML = list.length ? list.map(p => {
      const st = qtyOf(p.id), e = etat(p), c = cout(p), pv = Number(p.prix_vente) || 0, cap = capacite(p), prod = enProduction(p), liv = aLivrer(p);
      const marge = c > 0 && pv > 0 ? pv - c : null;
      return '<tr><td><b>' + esc(p.nom) + '</b>' + '<small>' + esc([p.marque || 'MARIA BAG', p.description].filter(Boolean).join(' · ')) + '</small>' + '</td>' +
        '<td><b>' + num(st) + '</b> pcs' + (Number(p.seuil_pf) ? '<small>seuil ' + num(p.seuil_pf) + '</small>' : '') + '</td>' +
        '<td>' + (prod || liv ? (prod ? '<span class="pf-l">En prod. :</span> ' + num(prod) + ' pcs' : '') + (prod && liv ? '<br>' : '') + (liv ? '<span class="pf-l">À livrer :</span> <b>' + num(liv) + '</b> pcs' + (liv > st + prod ? '<small style="color:var(--r)">manque ' + num(liv - st - prod) + ' à lancer</small>' : '') : '') : '<small>—</small>') + '</td>' +
        '<td>' + (c > 0 ? '<b>' + money(c, 2) + '</b>' : '<small>à calculer (Produits)</small>') + '</td>' +
        '<td>' + (pv ? '<b>' + money(pv, 2) + '</b>' + (marge != null ? '<small style="color:' + (marge >= 0 ? 'var(--g)' : 'var(--r)') + '">marge ' + money(marge, 2) + ' (' + num(pv ? marge / pv * 100 : 0, 1) + ' %)</small>' : '') : '<small>à renseigner</small>') + '</td>' +
        '<td>' + (cap.cap != null ? '<b>≈ ' + num(cap.cap) + '</b> pcs' + '<small>limité par ' + esc(cap.limit) + (cap.nonLies ? ' · ' + cap.nonLies + ' non lié(s)' : '') + '</small>' : '<small>' + esc(cap.why) + '</small>') + '</td>' +
        '<td><span class="bd ' + e.c + '">' + e.l + '</span></td>' +
        '<td class="emp-act"><button class="btn s p" type="button" onclick="pfShowMvt(\'entree\',\'' + esc(p.id) + '\')">+ Entrée</button> ' +
        '<button class="btn s" type="button" onclick="pfShowMvt(\'livraison\',\'' + esc(p.id) + '\')">Livrer</button> ' +
        '<button class="btn s" type="button" onclick="pfShowProduit(\'' + esc(p.id) + '\')">Prix / seuil</button> ' +
        '<button class="btn s" type="button" onclick="pfVoirHist(\'' + esc(p.id) + '\')">Historique</button></td></tr>';
    }).join('') : '<tr><td colspan="8" class="at-empty">Aucun produit ne correspond.</td></tr>';
  }

  /* Livraisons par client */
  function livraisons() {
    const by = {};
    MVTS.filter(m => m.type === 'livraison' || m.type === 'retour').forEach(m => {
      const key = m.contact_id ? 'c:' + m.contact_id : 'n:' + norm(m.client_nom || 'sans client');
      const g = by[key] = by[key] || { key, id: m.contact_id, nom: clientNom(m.contact_id, m.client_nom) || 'Sans client', pieces: 0, valeur: 0, dernier: '', parProduit: {} };
      const p = produitById(m.produit_id), n = -(Number(m.quantite) || 0), pv = m.prix_vente != null ? Number(m.prix_vente) : (p ? Number(p.prix_vente) || 0 : 0);
      g.pieces += n; g.valeur += n * pv;
      if (m.type === 'livraison' && m.date_mvt > g.dernier) g.dernier = m.date_mvt;
      if (p) g.parProduit[p.nom] = (g.parProduit[p.nom] || 0) + n;
    });
    return Object.values(by).filter(g => g.dernier || g.pieces > 0).sort((a, b) => b.pieces - a.pieces);
  }
  function renderClients() {
    const list = livraisons().filter(g => !fQ || norm(g.nom).includes(norm(fQ)));
    $('#pf-cli-body').innerHTML = list.length ? list.map(g =>
      '<tr><td><b>' + esc(g.nom) + '</b></td><td><b>' + num(g.pieces) + '</b> pcs</td>' +
      '<td>' + esc(Object.keys(g.parProduit).filter(k => g.parProduit[k]).map(k => k + ' ' + num(g.parProduit[k])).join(' · ')) + '</td>' +
      '<td>' + money(g.valeur) + '</td><td>' + (g.dernier ? fd(g.dernier) : '—') + '</td>' +
      '<td class="emp-act"><button class="btn s" type="button" onclick="pfVoirClient(\'' + esc(g.key) + '\')">Historique</button></td></tr>'
    ).join('') : '<tr><td colspan="6" class="at-empty">Aucune livraison enregistrée. Utilisez « Livraison à un client ».</td></tr>';
  }

  function renderHist() {
    const art = histProduit ? produitById(histProduit) : null;
    const cli = histClient ? livraisons().find(g => g.key === histClient) : null;
    $('#pf-hist-title').textContent = art ? 'Historique — ' + art.nom : (cli ? 'Historique — ' + cli.nom : 'Derniers mouvements');
    $('#pf-hist-all').style.display = art || cli ? '' : 'none';
    const list = MVTS.filter(m => (!histProduit || String(m.produit_id) === String(histProduit)) &&
      (!histClient || (m.contact_id ? 'c:' + m.contact_id : 'n:' + norm(m.client_nom || 'sans client')) === histClient)).slice(0, histProduit || histClient ? 300 : 40);
    $('#pf-hist-body').innerHTML = list.length ? list.map(m => {
      const p = produitById(m.produit_id), t = TYPES[m.type] || [m.type, 'n'], q = Number(m.quantite) || 0;
      const cmd = m.commande_id ? CMDS.find(c => String(c.id) === String(m.commande_id)) : null;
      return '<tr><td>' + fd(m.date_mvt) + '</td><td><b>' + esc(p ? p.nom : '—') + '</b></td><td><span class="bd ' + t[1] + '">' + t[0] + '</span></td>' +
        '<td><b class="' + (q < 0 ? 'st-neg' : 'st-pos') + '">' + (q < 0 ? '−' : '+') + num(Math.abs(q)) + '</b>' + (m.prix_vente ? '<small>' + money(m.prix_vente, 2) + ' / pièce</small>' : '') + '</td>' +
        '<td>' + esc(clientNom(m.contact_id, m.client_nom) || '—') + '</td>' +
        '<td>' + esc([m.reference, cmd ? 'cmd ' + (cmd.commande_numero || '') : '', m.note].filter(Boolean).join(' · ')) + '</td>' +
        '<td class="emp-act">' + (m.type === 'livraison' && m.reference ? '<button class="btn s" type="button" onclick="pfBonLivraison(\'' + esc(m.reference) + '\')">Bon PDF</button> ' : '') +
        '<button class="btn s d" type="button" onclick="pfRemoveMvt(\'' + esc(m.id) + '\')">Annuler</button></td></tr>';
    }).join('') : '<tr><td colspan="7" class="at-empty">Aucun mouvement.</td></tr>';
  }
  function voirHist(id) { histProduit = id; histClient = ''; renderHist(); $('#pf-hist-card').scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  function voirClient(key) { histClient = key; histProduit = ''; renderHist(); $('#pf-hist-card').scrollIntoView({ behavior: 'smooth', block: 'start' }); }

  /* ---------- Formulaire produit : prix de vente, seuil, modèle ---------- */
  function showProduit(id) {
    const p = produitById(id); if (!p) return;
    curProduit = id;
    $('#pf-pform-title').textContent = 'Produit fini — ' + p.nom;
    $('#pf-pprix').value = Number(p.prix_vente) || '';
    $('#pf-pseuil').value = Number(p.seuil_pf) || '';
    $('#pf-pmodele').innerHTML = '<option value="">Automatique (même nom que le produit)</option>' + MODELES.map(m => '<option value="' + esc(m.id) + '"' + (String(p.modele_id) === String(m.id) ? ' selected' : '') + '>' + esc(m.nom) + '</option>').join('');
    const c = cout(p);
    $('#pf-phint').textContent = c != null ? 'Coût de revient actuel : ' + money(c, 2) + ' par pièce (onglet Produits).' : '';
    $('#pf-mform').style.display = 'none'; $('#pf-pform').style.display = 'block';
    $('#pf-pform').scrollIntoView({ behavior: 'smooth', block: 'start' }); $('#pf-pprix').focus();
  }
  function cancelProduit() { curProduit = null; $('#pf-pform').style.display = 'none'; }
  async function saveProduit() {
    if (!curProduit) return;
    const r = await sb.from('produits').update({ prix_vente: parseFloat($('#pf-pprix').value) || 0, seuil_pf: Math.round(parseFloat($('#pf-pseuil').value) || 0), modele_id: $('#pf-pmodele').value || null }).eq('id', curProduit);
    if (r.error) { toast('Erreur : ' + errMsg(r.error)); return; }
    toast('Produit enregistré.'); cancelProduit(); await load();
    if (typeof loadProduits === 'function') loadProduits();
  }

  /* ---------- Formulaire mouvement ---------- */
  const clientsList = () => CONTACTS.filter(c => c.type === 'Client').sort((a, b) => clientNom(a.id).localeCompare(clientNom(b.id), 'fr'));
  function refDefaut() {
    const today = iso(new Date()).replace(/-/g, '');
    const n = new Set(MVTS.filter(m => m.type === 'livraison' && (m.reference || '').startsWith('BL-' + today)).map(m => m.reference)).size + 1;
    return 'BL-' + today + '-' + String(n).padStart(2, '0');
  }
  function showMvt(type, produitId, opt) {
    if (!PR.length) { toast('Créez d’abord un produit dans l’onglet Produits.'); return; }
    opt = opt || {};
    mvtType = type || 'livraison';
    $('#pf-mtype').value = mvtType;
    $('#pf-mproduit').innerHTML = PR.map(p => '<option value="' + esc(p.id) + '">' + esc(p.nom) + ' — ' + num(qtyOf(p.id)) + ' pcs</option>').join('');
    if (produitId) $('#pf-mproduit').value = produitId;
    const pSel = produitById($('#pf-mproduit').value);
    $('#pf-mprix').value = mvtType === 'livraison' && pSel ? (Number(pSel.prix_vente) || '') : '';
    $('#pf-mclient').innerHTML = '<option value="">— Aucun client —</option>' + clientsList().map(c => '<option value="' + esc(c.id) + '">' + esc(clientNom(c.id)) + '</option>').join('') + '<option value="__new__">＋ Nouveau client…</option>';
    $('#pf-mclient').value = opt.client || '';
    $('#pf-mdate').value = iso(new Date());
    $('#pf-mqte').value = opt.qte || ''; $('#pf-mnote').value = '';
    $('#pf-mref').value = mvtType === 'livraison' ? refDefaut() : '';
    majSelects(opt);
    majMvt();
    $('#pf-pform').style.display = 'none'; $('#pf-mform').style.display = 'block';
    $('#pf-mform').scrollIntoView({ behavior: 'smooth', block: 'start' });
    $('#pf-mqte').focus();
  }
  function cancelMvt() { $('#pf-mform').style.display = 'none'; }

  /* Commandes et productions proposées selon le produit et le client choisis */
  function majSelects(opt) {
    opt = opt || {};
    const p = produitById($('#pf-mproduit').value), client = $('#pf-mclient').value;
    const cmds = CMDS.filter(c => cmdOuverte(c) && (!p || (produitDeCmd(c) && String(produitDeCmd(c).id) === String(p.id))) && (!client || client === '__new__' || String(c.contact_id) === String(client)));
    const cur = opt.commande || $('#pf-mcmd').value;
    $('#pf-mcmd').innerHTML = '<option value="">— Aucune commande —</option>' + cmds.map(c => '<option value="' + esc(c.id) + '">' + esc((c.commande_numero || '—') + ' · ' + (clientNom(c.contact_id) || 'sans client') + ' · reste ' + resteCmd(c)) + '</option>').join('');
    if (cur && cmds.some(c => String(c.id) === String(cur))) $('#pf-mcmd').value = cur;
    const prods = PRODS.filter(x => !p || (produitDeProd(x) && String(produitDeProd(x).id) === String(p.id)));
    const curP = opt.production || $('#pf-mprod').value;
    $('#pf-mprod').innerHTML = '<option value="">— Aucune production —</option>' + prods.map(x => '<option value="' + esc(x.id) + '">' + esc(x.modele_nom + ' · ' + atelierNom(x.atelier_id) + ' · ' + (x.quantite_lancee || 0) + ' pcs · ' + (x.statut || '')) + '</option>').join('');
    if (curP) $('#pf-mprod').value = curP;
  }
  function majMvt() {
    mvtType = $('#pf-mtype').value;
    const p = produitById($('#pf-mproduit').value); if (!p) return;
    const liv = mvtType === 'livraison', ret = mvtType === 'retour', ent = mvtType === 'entree';
    $('#pf-mclient-wrap').style.display = liv || ret ? '' : 'none';
    $('#pf-mcmd-wrap').style.display = liv || ret ? '' : 'none';
    $('#pf-mprod-wrap').style.display = ent ? '' : 'none';
    $('#pf-mprix-wrap').style.display = liv || ret ? '' : 'none';
    $('#pf-mref-wrap').style.display = mvtType === 'ajustement' || mvtType === 'perte' ? 'none' : '';
    $('#pf-mqte-lbl').textContent = mvtType === 'ajustement' ? 'Quantité réelle comptée (pièces) *' : 'Quantité (pièces) *';
    $('#pf-mform-title').textContent = { entree: 'Entrée en stock (production terminée)', livraison: 'Livraison à un client', retour: 'Retour d’un client', perte: 'Perte / casse / défaut', ajustement: 'Inventaire : corriger le stock' }[mvtType];
    $('#pf-msubmit').textContent = { entree: 'Enregistrer l’entrée', livraison: 'Enregistrer la livraison', retour: 'Enregistrer le retour', perte: 'Enregistrer la perte', ajustement: 'Corriger le stock' }[mvtType];
    const q = Math.round(parseFloat($('#pf-mqte').value) || 0), cur = qtyOf(p.id);
    const delta = mvtType === 'ajustement' ? q - cur : (TYPES[mvtType][2] * q);
    let h = 'Stock actuel de « ' + esc(p.nom) + ' » : <b>' + num(cur) + '</b> pièces';
    if (q > 0 || mvtType === 'ajustement' && $('#pf-mqte').value !== '') h += ' → après : <b class="' + (cur + delta < 0 ? 'st-neg' : '') + '">' + num(cur + delta) + '</b>';
    if (liv) {
      const pv = parseFloat($('#pf-mprix').value) || 0;
      if (q > 0 && pv > 0) h += '<br>Montant de la livraison : <b>' + money(q * pv) + '</b>';
      const cmd = CMDS.find(c => String(c.id) === String($('#pf-mcmd').value));
      if (cmd) h += '<br>Commande ' + esc(cmd.commande_numero || '') + ' : reste <b>' + num(resteCmd(cmd)) + '</b> pièces' + (q > resteCmd(cmd) ? ' <span class="st-neg">(vous livrez plus que le reste)</span>' : (q > 0 ? ' → après : ' + num(resteCmd(cmd) - q) : ''));
    }
    $('#pf-mhint').innerHTML = h;
  }
  async function nouveauClient() {
    const nom = (prompt('Nom du nouveau client :') || '').trim();
    if (!nom) { $('#pf-mclient').value = ''; return; }
    const r = await sb.from('contacts').insert([{ nom, prenom: '', type: 'Client', statut: 'Confirmé' }]).select();
    if (r.error || !r.data || !r.data[0]) { toast('Erreur : ' + errMsg(r.error || { message: 'création impossible' })); $('#pf-mclient').value = ''; return; }
    const ct = await sb.from('contacts').select('*'); CONTACTS = ct.error ? CONTACTS : (ct.data || CONTACTS);
    if (typeof loadContacts === 'function') loadContacts();         // la liste des contacts se met à jour
    toast('Client « ' + nom + ' » ajouté aux Contacts.');
    showMvtSelects(r.data[0].id);
  }
  function showMvtSelects(selectId) {
    $('#pf-mclient').innerHTML = '<option value="">— Aucun client —</option>' + clientsList().map(c => '<option value="' + esc(c.id) + '">' + esc(clientNom(c.id)) + '</option>').join('') + '<option value="__new__">＋ Nouveau client…</option>';
    $('#pf-mclient').value = selectId || ''; majSelects(); majMvt();
  }

  /* Met à jour la commande liée (quantité reçue et statut) — sens = +1 livraison, −1 annulation / retour */
  async function majCommande(commandeId, delta) {
    const c = CMDS.find(x => String(x.id) === String(commandeId)); if (!c) return;
    const nr = Math.max(0, (Number(c.quantite_recue) || 0) + delta), cmd = Number(c.quantite_commandee) || 0;
    const statut = nr >= cmd ? 'Reçue' : (nr > 0 ? 'Partiellement reçue' : (c.statut === 'Reçue' || c.statut === 'Partiellement reçue' ? 'En attente' : c.statut));
    const r = await sb.from('commandes').update({ quantite_recue: nr, statut }).eq('id', commandeId);
    if (r.error) { toast('Mouvement enregistré, mais la commande n’a pas pu être mise à jour : ' + errMsg(r.error)); return; }
    c.quantite_recue = nr; c.statut = statut;
  }
  async function refreshAteliers() {
    try { if (typeof loadCommandes === 'function') await loadCommandes(); if (typeof refreshAtelierViews === 'function') refreshAtelierViews(); } catch (e) { /* Ateliers non chargé */ }
  }

  async function saveMvt() {
    const p = produitById($('#pf-mproduit').value); if (!p) { toast('Choisissez un produit.'); return; }
    const type = $('#pf-mtype').value, qIn = Math.round(parseFloat($('#pf-mqte').value));
    if (isNaN(qIn) || qIn < 0 || (type !== 'ajustement' && qIn < 1)) { toast('Indiquez une quantité en pièces (au moins 1).'); return; }
    const cur = qtyOf(p.id);
    const delta = type === 'ajustement' ? qIn - cur : TYPES[type][2] * qIn;
    if (delta === 0) { toast('Le stock est déjà égal à cette quantité.'); return; }
    if (delta < 0 && cur + delta < 0 && !confirm('Stock insuffisant : il reste ' + num(cur) + ' pièces et vous en sortez ' + num(-delta) + '.\nLe stock deviendra négatif. Continuer ?')) return;
    const liv = type === 'livraison', ret = type === 'retour';
    let client = (liv || ret) ? $('#pf-mclient').value : '';
    if (client === '__new__') client = '';
    const cmdId = (liv || ret) ? ($('#pf-mcmd').value || null) : null;
    const cmd = cmdId ? CMDS.find(c => String(c.id) === String(cmdId)) : null;
    if (liv && cmd && qIn > resteCmd(cmd) && !confirm('Vous livrez ' + num(qIn) + ' pièces, mais il ne reste que ' + num(resteCmd(cmd)) + ' à livrer pour la commande ' + (cmd.commande_numero || '') + '.\nContinuer ?')) return;
    const pv = parseFloat($('#pf-mprix').value);
    const row = {
      produit_id: p.id, date_mvt: $('#pf-mdate').value || iso(new Date()), type, quantite: delta,
      contact_id: client || (cmd && cmd.contact_id) || null, client_nom: client ? clientNom(client) : (cmd && cmd.contact_id ? clientNom(cmd.contact_id) : ''),
      commande_id: cmdId, production_id: type === 'entree' ? ($('#pf-mprod').value || null) : null,
      prix_vente: liv && pv > 0 ? pv : null, reference: $('#pf-mref').value.trim(), note: $('#pf-mnote').value.trim() || (type === 'ajustement' ? 'Inventaire' : '')
    };
    const r = await sb.from('pf_mouvements').insert([row]);
    if (r.error) { toast('Erreur : ' + errMsg(r.error)); return; }
    // le prix de vente saisi à la livraison devient le prix du produit s'il n'en avait pas
    if (liv && pv > 0 && !(Number(p.prix_vente) > 0)) await sb.from('produits').update({ prix_vente: pv }).eq('id', p.id);
    // la commande suit : quantité reçue et statut
    if (cmd && (liv || ret)) { await majCommande(cmd.id, liv ? qIn : -qIn); }
    toast({ entree: 'Entrée enregistrée : +' + num(qIn) + ' pièces', livraison: 'Livraison enregistrée : −' + num(qIn) + ' pièces' + (cmd ? ' (commande ' + (cmd.commande_numero || '') + ' mise à jour)' : ''),
      retour: 'Retour enregistré : +' + num(qIn) + ' pièces', perte: 'Perte enregistrée : −' + num(qIn) + ' pièces', ajustement: 'Stock corrigé : ' + num(cur + delta) + ' pièces' }[type]);
    cancelMvt();
    await load(); await refreshAteliers();
    if (liv && row.reference && confirm('Livraison enregistrée. Télécharger le bon de livraison PDF ?')) bonLivraison(row.reference);
  }

  async function removeMvt(id) {
    const m = MVTS.find(x => String(x.id) === String(id)); if (!m) return;
    const p = produitById(m.produit_id), q = Number(m.quantite) || 0;
    if (!confirm('Annuler ce mouvement (' + (TYPES[m.type] || [m.type])[0] + ' de ' + num(Math.abs(q)) + ' pièces' + (p ? ' « ' + p.nom + ' »' : '') + ' le ' + fd(m.date_mvt) + ') ?\nLe stock sera recalculé' + (m.commande_id ? ' et la commande liée remise à jour' : '') + '.')) return;
    const r = await sb.from('pf_mouvements').delete().eq('id', id);
    if (r.error) { toast('Erreur : ' + errMsg(r.error)); return; }
    // annuler = inverser l'effet sur la commande : livraison (q < 0) fait baisser la quantité reçue, retour (q > 0) la fait remonter
    if (m.commande_id && (m.type === 'livraison' || m.type === 'retour')) await majCommande(m.commande_id, q);
    toast('Mouvement annulé : stock recalculé.');
    await load(); await refreshAteliers();
  }

  /* Supprime des mouvements (sans question) et remet la commande liée à jour : stock recalculé comme avant */
  async function annulerPar(pred) {
    const l = MVTS.filter(pred);
    for (const m of l) {
      const q = Number(m.quantite) || 0;
      const r = await sb.from('pf_mouvements').delete().eq('id', m.id);
      if (r.error) return { error: r.error };
      if (m.commande_id && (m.type === 'livraison' || m.type === 'retour')) await majCommande(m.commande_id, q);
    }
    await load(); await refreshAteliers();
    return { n: l.length, mouvements: l };
  }

  /* ---------- Stockage automatique depuis les productions terminées ---------- */
  async function entrerProd(prodId) {
    const prod = PRODS.find(x => String(x.id) === String(prodId)); if (!prod) return;
    let pid = $('#pfp-prod-' + prodId).value;
    const q = Math.round(parseFloat($('#pfp-qte-' + prodId).value) || 0);
    if (pid === '__new__') { const np = await creerProduitPour(prod); if (!np) return; pid = np.id; }
    if (!pid) { toast('Choisissez le produit fini correspondant à « ' + prod.modele_nom + ' ».'); return; }
    if (q < 1) { toast('Indiquez le nombre de pièces à entrer en stock.'); return; }
    const r = await sb.from('pf_mouvements').insert([{ produit_id: pid, date_mvt: prod.date_reception_reelle || iso(new Date()), type: 'entree', quantite: q, production_id: prod.id,
      reference: 'PROD-' + String(prod.id).slice(0, 6).toUpperCase(), note: 'Production ' + prod.modele_nom + (atelierNom(prod.atelier_id) ? ' · ' + atelierNom(prod.atelier_id) : '') }]);
    if (r.error) { toast('Erreur : ' + errMsg(r.error)); return; }
    if (String(prod.produit_id) !== String(pid)) await sb.from('productions').update({ produit_id: pid }).eq('id', prod.id);   // le lien est mémorisé
    toast('+' + num(q) + ' pièces « ' + (produitById(pid) || {}).nom + ' » entrées en stock.');
    await load(); await refreshAteliers();
  }
  async function ignorerProd(prodId) {
    const prod = PRODS.find(x => String(x.id) === String(prodId)); if (!prod) return;
    const pid = $('#pfp-prod-' + prodId).value || (PR[0] && PR[0].id);
    if (!pid || !confirm('Ne pas ajouter la production « ' + prod.modele_nom + ' » au stock des produits finis ?\nElle n’apparaîtra plus dans cette liste.')) return;
    const r = await sb.from('pf_mouvements').insert([{ produit_id: pid, date_mvt: iso(new Date()), type: 'ajustement', quantite: 0, production_id: prod.id, reference: 'PROD-IGNOREE', note: 'Production non stockée' }]);
    if (r.error) { toast('Erreur : ' + errMsg(r.error)); return; }
    await load();
  }
  /* Associer une production à un produit fini (depuis la liste des commandes) */
  async function associer(prodId, produitId) {
    if (!produitId) return;
    const prod = PRODS.find(x => String(x.id) === String(prodId)); if (!prod) return;
    if (produitId === '__new__') { if (!(await creerProduitPour(prod))) return; if (typeof loadProduits === 'function') loadProduits(); }
    else { const r = await sb.from('productions').update({ produit_id: produitId }).eq('id', prodId); if (r.error) { toast('Erreur : ' + errMsg(r.error)); return; } }
    toast('Production associée au produit.'); await load();
  }
  /* « Livrer » depuis une commande : formulaire prérempli (client, produit, commande, quantité possible) */
  function livrer(cmdId) {
    const c = CMDS.find(x => String(x.id) === String(cmdId)), p = c ? produitDeCmd(c) : null; if (!c || !p) return;
    showMvt('livraison', p.id, { client: c.contact_id || '', commande: c.id, qte: Math.max(1, Math.min(resteCmd(c), Math.max(qtyOf(p.id), 0)) || resteCmd(c)) });
    $('#pf-mprix').value = Number(p.prix_vente) || '';
    majMvt();
  }

  /* ---------- Bon de livraison PDF ---------- */
  const pdfT = v => (typeof pdfTxt === 'function' ? pdfTxt(v) : String(v ?? ''));
  function creerBL(ref) {
    if (!(window.jspdf && window.jspdf.jsPDF)) throw new Error('Bibliothèque PDF non chargée.');
    const lignes = MVTS.filter(m => m.type === 'livraison' && m.reference === ref);
    if (!lignes.length) throw new Error('Aucune livraison avec cette référence.');
    const doc = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4' });
    const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), M = 14;
    const date = lignes[0].date_mvt, client = clientNom(lignes[0].contact_id, lignes[0].client_nom) || '....................';
    if (typeof LOGO_PDF !== 'undefined' && LOGO_PDF) doc.addImage(LOGO_PDF, 'PNG', M, 9, 22, 22);
    doc.setTextColor(0); doc.setFont('helvetica', 'bold'); doc.setFontSize(17); doc.text(pdfT('BON DE LIVRAISON'), M + 26, 18);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(90); doc.text(pdfT('MARIA BAG'), M + 26, 25);
    doc.setTextColor(0); doc.setFont('helvetica', 'bold'); doc.setFontSize(12);
    doc.text(pdfT('N° ' + ref), W - M, 17, { align: 'right' }); doc.text(pdfT(fd(date)), W - M, 24, { align: 'right' });
    doc.setDrawColor(0); doc.setLineWidth(0.8); doc.line(M, 34, W - M, 34);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(90); doc.text(pdfT('Client'), M, 43);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(0); doc.text(pdfT(client), M, 49.5);
    const cmds = [...new Set(lignes.map(l => (CMDS.find(c => String(c.id) === String(l.commande_id)) || {}).commande_numero).filter(Boolean))];
    if (cmds.length) { doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(90); doc.text(pdfT('Commande(s) : ' + cmds.join(', ')), M, 56); }
    let total = 0;
    const body = lignes.map((l, i) => {
      const p = produitById(l.produit_id), q = -(Number(l.quantite) || 0), pv = l.prix_vente != null ? Number(l.prix_vente) : (p ? Number(p.prix_vente) || 0 : 0);
      total += q * pv;
      return [i + 1, p ? p.nom : '', num(q), pv ? money(pv, 2) : '', pv ? money(q * pv, 2) : ''].map(pdfT);
    });
    doc.autoTable({
      startY: 62, margin: { left: M, right: M, bottom: 18 },
      head: [['N°', 'Produit', 'Quantité', 'Prix unitaire', 'Montant'].map(pdfT)], body,
      foot: [['', pdfT('Total'), pdfT(num(lignes.reduce((s, l) => s - (Number(l.quantite) || 0), 0))), '', pdfT(total ? money(total, 2) : '')]],
      theme: 'grid', styles: { font: 'helvetica', fontSize: 10.5, cellPadding: 3, textColor: 0, lineColor: 0, lineWidth: 0.2 },
      headStyles: { fillColor: [235, 235, 235], textColor: 0, fontStyle: 'bold' }, footStyles: { fillColor: [245, 245, 245], textColor: 0, fontStyle: 'bold' },
      columnStyles: { 0: { halign: 'center', cellWidth: 12 }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right', fontStyle: 'bold' } }
    });
    let y = doc.lastAutoTable.finalY + 26; if (y > H - 40) { doc.addPage(); y = 30; }
    const colW = (W - 2 * M - 12) / 2;
    ['Livreur (Maria Bag)', 'Reçu par le client'].forEach((t, i) => {
      const x = M + i * (colW + 12); doc.setLineWidth(0.3); doc.line(x, y, x + colW, y);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.text(pdfT(t), x + colW / 2, y + 5, { align: 'center' });
    });
    doc.setFontSize(8); doc.setTextColor(120); doc.text(pdfT('MARIA BAG - Bon de livraison ' + ref), W / 2, H - 8, { align: 'center' });
    return { doc, name: ('Bon_de_livraison_' + ref + '_' + client).replace(/[^\w\-]+/g, '_') + '.pdf' };
  }
  async function bonLivraison(ref) {
    let r; try { r = creerBL(ref); } catch (e) { toast('Erreur PDF : ' + e.message); return; }
    const file = new File([r.doc.output('blob')], r.name, { type: 'application/pdf' });
    if (navigator.canShare && navigator.canShare({ files: [file] }) && /Android|iPhone|iPad|Mobi/i.test(navigator.userAgent)) {
      try { await navigator.share({ files: [file], title: 'Bon de livraison ' + ref }); return; } catch (e) { if (e && e.name === 'AbortError') return; }
    }
    r.doc.save(r.name); toast('Bon de livraison enregistré : ' + r.name);
  }

  /* ---------- Export Excel ---------- */
  function exportExcel() {
    if (typeof XLSX === 'undefined') { toast('Bibliothèque Excel non chargée.'); return; }
    const stock = PR.map(p => { const c = cout(p), pv = Number(p.prix_vente) || 0, cap = capacite(p); return {
      Produit: p.nom, 'Stock (pièces)': qtyOf(p.id), 'En production': enProduction(p), 'À livrer (commandes)': aLivrer(p), 'Coût de revient (DA)': c != null ? Math.round(c * 100) / 100 : '',
      'Prix de vente (DA)': pv || '', 'Marge (DA)': c != null && pv ? Math.round((pv - c) * 100) / 100 : '', 'Valeur du stock au coût (DA)': c != null ? Math.round(Math.max(0, qtyOf(p.id)) * c) : '',
      'Capacité avec le stock de matières': cap.cap != null ? cap.cap : '', 'Seuil d\'alerte': Number(p.seuil_pf) || 0, 'État': etat(p).l }; });
    const cli = livraisons().map(g => ({ Client: g.nom, 'Pièces livrées': g.pieces, Produits: Object.keys(g.parProduit).map(k => k + ' ' + g.parProduit[k]).join(' · '), 'Valeur (DA)': Math.round(g.valeur), 'Dernière livraison': fd(g.dernier) }));
    const mv = MVTS.map(m => { const p = produitById(m.produit_id), cmd = CMDS.find(c => String(c.id) === String(m.commande_id)); return {
      Date: fd(m.date_mvt), Produit: p ? p.nom : '', Opération: (TYPES[m.type] || [m.type])[0], Pièces: Number(m.quantite) || 0, Client: clientNom(m.contact_id, m.client_nom),
      Commande: cmd ? cmd.commande_numero : '', 'Prix de vente (DA)': m.prix_vente != null ? Number(m.prix_vente) : '', Référence: m.reference || '', Note: m.note || '' }; });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(stock), 'Produits finis');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(cli), 'Livraisons par client');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(mv), 'Mouvements');
    XLSX.writeFile(wb, 'MARIA-BAG_stock_produits_finis_' + iso(new Date()) + '.xlsx');
  }

  /* ---------- Saisie directe (écran « Stock simple ») ---------- */
  async function creerClient(nom) {
    nom = String(nom || '').trim(); if (!nom) return null;
    const r = await sb.from('contacts').insert([{ nom, prenom: '', type: 'Client', statut: 'Confirmé' }]).select();
    if (r.error || !r.data || !r.data[0]) { toast('Erreur : ' + errMsg(r.error || { message: 'création impossible' })); return null; }
    const ct = await sb.from('contacts').select('*'); if (!ct.error) CONTACTS = ct.data || CONTACTS;
    if (typeof loadContacts === 'function') loadContacts();
    return r.data[0].id;
  }
  /* o : { type, produitId, quantite (pièces, positif), clientId, commandeId, prix, note, reference, date } */
  async function saisir(o) {
    const p = produitById(o.produitId); if (!p) return { error: { message: 'Produit introuvable' } };
    const type = o.type, qIn = Math.round(Number(o.quantite) || 0), cur = qtyOf(p.id);
    const delta = type === 'ajustement' ? qIn - cur : TYPES[type][2] * qIn;
    if (!delta) return { error: { message: 'Quantité nulle' } };
    const cmd = o.commandeId ? CMDS.find(c => String(c.id) === String(o.commandeId)) : null;
    const liv = type === 'livraison', ret = type === 'retour';
    const clientId = o.clientId || (cmd && cmd.contact_id) || null;
    const row = { produit_id: p.id, date_mvt: o.date || iso(new Date()), type, quantite: delta, contact_id: clientId, client_nom: clientId ? clientNom(clientId) : '',
      commande_id: cmd ? cmd.id : null, production_id: o.productionId || null, prix_vente: liv && o.prix > 0 ? o.prix : null,
      reference: o.reference != null ? o.reference : (liv ? refDefaut() : ''), note: o.note || '' };
    const r = await sb.from('pf_mouvements').insert([row]);
    if (r.error) return { error: r.error };
    if (liv && o.prix > 0 && !(Number(p.prix_vente) > 0)) await sb.from('produits').update({ prix_vente: o.prix }).eq('id', p.id);
    if (cmd && (liv || ret)) await majCommande(cmd.id, liv ? qIn : -qIn);
    await load(); await refreshAteliers();
    return { ok: true, reference: row.reference, delta };
  }

  /* ---------- Onglets : Stock (simple) / Modèles finis (détail) / Éléments (détail) ---------- */
  function openPane(k) {
    $('#st-pane-simple').style.display = k === 'simple' ? '' : 'none';
    $('#st-pane-mat').style.display = k === 'mat' ? '' : 'none';
    $('#st-pane-pf').style.display = k === 'pf' ? '' : 'none';
    document.querySelectorAll('#st-tabs button').forEach(b => b.classList.toggle('on', b.dataset.stp === k));
    try { sessionStorage.setItem('mariabag_stock_pane', k); } catch (e) {}
    if (k === 'pf') load();
    document.dispatchEvent(new CustomEvent('mariabag:stockpane', { detail: k }));
  }

  /* ---------- API pour le Tableau de bord ---------- */
  window.PFAPI = {
    load, list: () => PR, qty: qtyOf, open: () => openPane('pf'), openPane, etat, saisir, creerClient, bonLivraison,
    annulerPar, mouvements: () => MVTS, produits: () => PR, commandes: () => CMDS, reste: resteCmd, coutProduit: cout,
    clients: () => clientsList().map(c => ({ id: c.id, nom: clientNom(c.id) })),
    commandesOuvertes: (produitId, clientId) => CMDS.filter(c => cmdOuverte(c) && (!produitId || (produitDeCmd(c) && String(produitDeCmd(c).id) === String(produitId))) && (!clientId || String(c.contact_id) === String(clientId)))
      .map(c => ({ id: c.id, numero: c.commande_numero || '—', reste: resteCmd(c), client: clientNom(c.contact_id) })),
    summary() {
      const q = p => Math.max(0, qtyOf(p.id));
      const cmds = CMDS.filter(cmdOuverte);
      return {
        produits: PR.length, pieces: PR.reduce((s, p) => s + q(p), 0), valeurCout: PR.reduce((s, p) => s + q(p) * (cout(p) || 0), 0),
        valeurVente: PR.reduce((s, p) => s + q(p) * (Number(p.prix_vente) || 0), 0),
        alertes: PR.filter(enAlerte).map(p => ({ nom: p.nom, stock: qtyOf(p.id), etat: etat(p) })).sort((a, b) => a.etat.rank - b.etat.rank),
        aEntrer: prodsAEntrer().map(p => ({ id: p.id, nom: p.modele_nom, pieces: Number(p.quantite_lancee) || 0 })),
        aLivrer: cmds.reduce((s, c) => s + resteCmd(c), 0), nbCommandes: cmds.length,
        manques: cmds.filter(c => { const p = produitDeCmd(c); return p && qtyOf(p.id) < resteCmd(c); }).length,
        derniers: MVTS.filter(m => m.type === 'livraison').slice(0, 5).map(m => ({ date: m.date_mvt, produit: (produitById(m.produit_id) || {}).nom || '', pieces: -(Number(m.quantite) || 0), client: clientNom(m.contact_id, m.client_nom) }))
      };
    }
  };
  window.loadPF = load;
  Object.assign(window, {
    pfShowMvt: showMvt, pfCancelMvt: cancelMvt, pfShowProduit: showProduit, pfCancelProduit: cancelProduit, pfVoirHist: voirHist, pfVoirClient: voirClient,
    pfLivrer: livrer, pfCreerProduits: creerProduits, pfEntrerProd: entrerProd, pfIgnorerProd: ignorerProd, pfRemoveMvt: removeMvt, pfBonLivraison: bonLivraison, pfExport: exportExcel
  });

  /* ---------- Événements ---------- */
  $('#pf-mform').addEventListener('submit', ev => { ev.preventDefault(); saveMvt(); });
  $('#pf-pform').addEventListener('submit', ev => { ev.preventDefault(); saveProduit(); });
  $('#pf-mtype').addEventListener('change', () => {
    const t = $('#pf-mtype').value; $('#pf-mref').value = t === 'livraison' ? ($('#pf-mref').value || refDefaut()) : ($('#pf-mref').value.startsWith('BL-') ? '' : $('#pf-mref').value);
    majSelects(); majMvt();
  });
  $('#pf-mproduit').addEventListener('change', () => {
    const p = produitById($('#pf-mproduit').value); if (p && $('#pf-mtype').value === 'livraison') $('#pf-mprix').value = Number(p.prix_vente) || '';
    majSelects(); majMvt();
  });
  $('#pf-mclient').addEventListener('change', () => { if ($('#pf-mclient').value === '__new__') nouveauClient(); else { majSelects(); majMvt(); } });
  $('#pf-mcmd').addEventListener('change', () => {
    const c = CMDS.find(x => String(x.id) === String($('#pf-mcmd').value));
    if (c) { if (c.contact_id) $('#pf-mclient').value = c.contact_id; if (!$('#pf-mqte').value) $('#pf-mqte').value = resteCmd(c) || ''; }
    majMvt();
  });
  ['#pf-mqte', '#pf-mprix', '#pf-mdate'].forEach(s => $(s).addEventListener('input', majMvt));
  $('#pf-q').addEventListener('input', () => { fQ = $('#pf-q').value; renderTable(); renderClients(); });
  $('#pf-hist-all').addEventListener('click', () => { histProduit = ''; histClient = ''; renderHist(); });
  $('#pf-cmd-body').addEventListener('change', ev => { const s = ev.target.closest('select[data-assoc]'); if (s) associer(s.dataset.assoc, s.value); });
  $('#st-tabs').addEventListener('click', ev => { const b = ev.target.closest('button[data-stp]'); if (b) openPane(b.dataset.stp); });
  document.querySelector('nav button[data-v="stock"]').addEventListener('click', () => load());
  document.addEventListener('mariabag:authenticated', () => load());
  // le stock de matières a changé : les capacités de production se recalculent
  document.addEventListener('mariabag:stock', () => { if (PR.length) { renderTable(); } });
  try { openPane(sessionStorage.getItem('mariabag_stock_pane') || 'simple'); } catch (e) { openPane('simple'); }
  if (!document.getElementById('app').classList.contains('hide')) load();
})();
