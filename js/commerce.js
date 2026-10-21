/* ============================================================
   COMMERCE : devis, factures clients (avec prix), bons de commande fournisseurs et réceptions
   Tables : documents, document_lignes, parametres (supabase/commerce.sql)
   - Facture : lignes avec prix, TVA, remise, PDF, encaissements rattachés (solde, statut payée / en retard)
   - Devis : transformé en facture en un clic
   - Bon de commande : réception partielle ou totale → entrée en stock (prix, fournisseur) → dette fournisseur
   ============================================================ */
(function () {
  'use strict';
  const $ = s => document.querySelector(s);
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  const r2 = x => Math.round((Number(x) + Number.EPSILON) * 100) / 100;
  const r4 = x => Math.round((Number(x) + Number.EPSILON) * 10000) / 10000;
  const nf = (n, d) => (Number(n) || 0).toLocaleString('fr-FR', { maximumFractionDigits: d == null ? 2 : d });
  const money = n => nf(n, 2) + ' DA';
  const fd = s => s ? String(s).slice(0, 10).split('-').reverse().join('/') : '—';
  const iso = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const today = () => iso(new Date());
  const say = t => { if (typeof toast === 'function') toast(t); };
  const num = v => { const x = parseFloat(String(v).replace(',', '.')); return isFinite(x) ? x : 0; };

  const TYPES = {
    facture: { l: 'Facture', lp: 'Factures', pre: 'FA', cible: 'Client', btn: '+ Nouvelle facture' },
    devis: { l: 'Devis', lp: 'Devis', pre: 'DV', cible: 'Client', btn: '+ Nouveau devis' },
    bon_commande: { l: 'Bon de commande', lp: 'Bons de commande', pre: 'BC', cible: 'Fournisseur', btn: '+ Nouveau bon de commande' }
  };
  const STATUTS_DEVIS = { brouillon: 'Brouillon', envoye: 'Envoyé', accepte: 'Accepté', refuse: 'Refusé', facture: 'Facturé' };

  let DOCS = [], LIGS = [], ENT = {}, ENTID = null, err = '';
  let tab = 'facture', ed = null, recForm = null, payForm = null, fromLiv = false, filtre = '';

  /* ---------- Chargement ---------- */
  async function load(force) {
    const root = $('#cm-root'); if (!root) return;
    const a = document.activeElement;
    if (!force && ed) return;
    if (!force && a && root.contains(a) && /INPUT|SELECT|TEXTAREA/.test(a.tagName)) return;
    const d = await sb.from('documents').select('*').order('date_doc', { ascending: false }).order('created_at', { ascending: false });
    if (d.error) { err = /does not exist|relation|schema cache/i.test(d.error.message) ? 'Tables « documents » introuvables dans Supabase. Exécutez supabase/commerce.sql dans SQL Editor, puis rechargez la page.' : d.error.message; DOCS = []; LIGS = []; render(); return; }
    const l = await sb.from('document_lignes').select('*').order('ordre', { ascending: true });
    const p = await sb.from('parametres').select('*').eq('cle', 'entreprise');
    err = ''; DOCS = d.data || []; LIGS = l.data || [];
    if (p.data && p.data[0]) { ENT = p.data[0].valeur || {}; ENTID = p.data[0].id; }
    if (window.PayAPI) await PayAPI.load();
    render();
  }
  const docById = id => DOCS.find(x => String(x.id) === String(id));
  const lignesDe = id => LIGS.filter(l => String(l.document_id) === String(id));
  const contacts = () => (typeof D !== 'undefined' && Array.isArray(D)) ? D : [];
  const cById = id => contacts().find(c => String(c.id) === String(id));
  const lbl = c => window.PartAPI ? PartAPI.label(c) : (c.societe || c.nom);
  const pays = () => window.PayAPI ? PayAPI.list() : [];

  /* ---------- Calculs ---------- */
  function totaux(doc, lignes) {
    const sous = r2(lignes.reduce((s, l) => s + r2(num(l.quantite) * num(l.prix_unitaire)), 0));
    const remise = Math.min(sous, r2(num(doc.remise))), ht = r2(sous - remise), tva = r2(ht * num(doc.tva_taux) / 100), ttc = r2(ht + tva);
    return { sous, remise, ht, tva, ttc };
  }
  function payeDoc(doc) { return r2(pays().filter(p => String(p.document_id) === String(doc.id)).reduce((s, p) => s + Number(p.montant), 0)); }
  function etatFacture(doc) {
    if (doc.statut === 'annulee') return { l: 'Annulée', c: 'x' };
    const t = totaux(doc, lignesDe(doc.id)), p = payeDoc(doc), reste = r2(t.ttc - p);
    if (t.ttc > 0 && reste <= 0.004) return { l: 'Payée', c: 'g', reste: 0, p };
    if (doc.echeance && doc.echeance < today() && reste > 0.004) return { l: 'En retard', c: 'r', reste, p };
    return { l: p > 0 ? 'Partiellement payée' : 'Non payée', c: p > 0 ? 'b' : 'o', reste, p };
  }
  function etatBC(doc) {
    const ls = lignesDe(doc.id).filter(l => num(l.quantite) > 0);
    if (!ls.length) return { l: 'Brouillon', c: 'x' };
    const tout = ls.every(l => num(l.quantite_recue) + 0.0001 >= num(l.quantite)), un = ls.some(l => num(l.quantite_recue) > 0);
    if (tout) return { l: 'Reçu', c: 'g' };
    if (un) return { l: 'Reçu partiellement', c: 'b' };
    return doc.statut === 'brouillon' ? { l: 'Brouillon', c: 'x' } : { l: 'Commandé', c: 'o' };
  }
  function nextNumero(type, date) {
    const an = String(date || today()).slice(0, 4), pre = TYPES[type].pre + '-' + an + '-';
    const mx = DOCS.filter(d => d.type === type && String(d.numero).startsWith(pre)).reduce((m, d) => Math.max(m, parseInt(String(d.numero).slice(pre.length), 10) || 0), 0);
    return pre + String(mx + 1).padStart(4, '0');
  }

  /* ---------- Montant en lettres (français) ---------- */
  const U = ['zéro', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix', 'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize', 'dix-sept', 'dix-huit', 'dix-neuf'];
  const TT = ['', '', 'vingt', 'trente', 'quarante', 'cinquante', 'soixante'];
  function m100(n) {
    if (n < 20) return U[n];
    if (n < 70) { const t = Math.floor(n / 10), u = n % 10; return TT[t] + (u === 1 ? ' et un' : u > 1 ? '-' + U[u] : ''); }
    if (n < 80) { const r = n - 60; return 'soixante' + (r === 11 ? ' et onze' : '-' + U[r]); }
    const r = n - 80; return r === 0 ? 'quatre-vingts' : 'quatre-vingt-' + U[r];
  }
  function m1000(n) {
    const h = Math.floor(n / 100), r = n % 100;
    if (h === 0) return m100(r);
    if (h === 1) return 'cent' + (r ? ' ' + m100(r) : '');
    return U[h] + ' cent' + (r ? ' ' + m100(r) : 's');
  }
  const sansS = s => s.replace(/(cents|vingts)$/, m => m.slice(0, -1));
  function enLettres(n) {
    n = Math.floor(n); if (n === 0) return 'zéro';
    const mrd = Math.floor(n / 1e9), mil = Math.floor(n % 1e9 / 1e6), k = Math.floor(n % 1e6 / 1e3), r = n % 1e3, p = [];
    if (mrd) p.push(m1000(mrd) + ' milliard' + (mrd > 1 ? 's' : ''));
    if (mil) p.push(m1000(mil) + ' million' + (mil > 1 ? 's' : ''));
    if (k) p.push(k === 1 ? 'mille' : sansS(m1000(k)) + ' mille');
    if (r) p.push(m1000(r));
    return p.join(' ');
  }
  function montantLettres(x) {
    const e = Math.floor(x + 1e-9), c = Math.round((x - e) * 100);
    return enLettres(e) + (e >= 1e6 && e % 1e6 === 0 ? ' de' : '') + ' dinar' + (e > 1 ? 's' : '') + ' algérien' + (e > 1 ? 's' : '') + (c ? ' et ' + enLettres(c) + ' centime' + (c > 1 ? 's' : '') : '');
  }

  /* ---------- Affichage : listes ---------- */
  function render() {
    const root = $('#cm-root'); if (!root) return;
    if (err) { root.innerHTML = '<div class="card"><div class="iv-err">' + esc(err) + '</div></div>'; return; }
    if (ed) { root.innerHTML = editeur(); return; }
    let h = '<div class="hello"><span class="fl">&#10047;</span><div><h2>Commerce</h2><p>Devis, factures avec prix, bons de commande fournisseurs et réceptions de marchandises.</p></div></div>';
    h += '<div class="at-tabs" id="cm-tabs">' + ['facture', 'devis', 'bon_commande'].map(t => '<button type="button" data-t="' + t + '" class="' + (tab === t ? 'on' : '') + '">' + TYPES[t].lp + '</button>').join('') + '<button type="button" data-t="entreprise" class="' + (tab === 'entreprise' ? 'on' : '') + '">Mon entreprise</button></div>';
    h += tab === 'entreprise' ? paneEntreprise() : paneListe(tab);
    root.innerHTML = h;
  }

  function paneListe(type) {
    const T = TYPES[type], liste = DOCS.filter(d => d.type === type && (!filtre || norm([d.numero, d.contact_nom].join(' ')).includes(norm(filtre))));
    const tousType = DOCS.filter(d => d.type === type);
    let h = '';
    if (type === 'facture') {
      const fac = tousType.filter(d => d.statut !== 'annulee'), tot = fac.reduce((s, d) => s + totaux(d, lignesDe(d.id)).ttc, 0), pay = fac.reduce((s, d) => s + payeDoc(d), 0);
      const retard = fac.filter(d => (etatFacture(d).l === 'En retard')).length;
      h += '<div class="ct-kpis"><div class="ct-kpi"><span>Total facturé</span><b>' + money(tot) + '</b><small>' + fac.length + ' facture(s)</small></div><div class="ct-kpi"><span>Encaissé sur factures</span><b class="py-av">' + money(pay) + '</b><small>paiements rattachés</small></div><div class="ct-kpi"><span>Reste à encaisser</span><b class="py-due">' + money(tot - pay) + '</b><small>' + retard + ' en retard</small></div></div>';
    }
    if (type === 'bon_commande') {
      const bc = tousType, tot = bc.reduce((s, d) => s + totaux(d, lignesDe(d.id)).ttc, 0);
      h += '<div class="ct-kpis"><div class="ct-kpi"><span>Total commandé</span><b>' + money(tot) + '</b><small>' + bc.length + ' bon(s)</small></div><div class="ct-kpi"><span>En attente de réception</span><b>' + bc.filter(d => etatBC(d).l !== 'Reçu' && d.statut !== 'annulee').length + '</b><small>bon(s) à réceptionner</small></div></div>';
    }
    h += '<div class="card"><div class="at-actions" style="margin-top:0"><input id="cm-q" type="search" placeholder="Rechercher : numéro, nom…" value="' + esc(filtre) + '" style="padding:9px;border:1px solid #ccc;border-radius:8px;min-width:220px">' +
      '<span style="margin-left:auto"></span>' + (type === 'facture' ? '<button class="btn" type="button" id="cm-liv">Facturer des livraisons</button>' : '') + '<button class="btn p" type="button" id="cm-new">' + T.btn + '</button></div>';
    if (fromLiv && type === 'facture') h += formLivraisons();
    h += liste.length ? '<div class="tw"><table class="iv-tbl"><thead><tr><th>N°</th><th>Date</th><th>' + T.cible + '</th><th class="n">Total TTC</th>' + (type === 'facture' ? '<th class="n iv-opt">Payé</th>' : '') + '<th>État</th></tr></thead><tbody>' +
      liste.map(d => { const t = totaux(d, lignesDe(d.id)), e = type === 'facture' ? etatFacture(d) : type === 'bon_commande' ? etatBC(d) : { l: STATUTS_DEVIS[d.statut] || d.statut, c: d.statut === 'accepte' || d.statut === 'facture' ? 'g' : d.statut === 'refuse' ? 'r' : 'o' };
        return '<tr class="row" data-open="' + esc(d.id) + '"><td><b>' + esc(d.numero) + '</b></td><td>' + fd(d.date_doc) + '</td><td>' + esc(d.contact_nom || '—') + '</td><td class="n"><b>' + money(t.ttc) + '</b></td>' +
          (type === 'facture' ? '<td class="n iv-opt">' + money(payeDoc(d)) + '</td>' : '') + '<td><span class="cm-bdg ' + e.c + '">' + e.l + '</span></td></tr>'; }).join('') + '</tbody></table></div>'
      : '<div class="iv-empty">Aucun document. Cliquez sur « ' + T.btn + ' ».</div>';
    return h + '</div>';
  }

  function paneEntreprise() {
    const f = (k, l, ph) => '<label>' + l + '<input data-ent="' + k + '" maxlength="120" value="' + esc(ENT[k] || '') + '" placeholder="' + (ph || '') + '"></label>';
    return '<div class="card"><h2 style="margin-top:0">Informations de l’entreprise</h2><p class="iv-help">Ces informations apparaissent sur vos devis, factures et bons de commande (PDF). Vérifiez avec votre comptable les mentions légales obligatoires (NIF, RC, NIS, AI, TVA…).</p>' +
      '<div class="at-fields">' + f('nom', 'Nom commercial', 'MARIA BAG') + f('forme', 'Raison sociale / forme juridique') + f('adresse', 'Adresse') + f('ville', 'Ville') + f('tel', 'Téléphone') + f('email', 'E-mail') + f('nif', 'NIF') + f('rc', 'N° du registre de commerce (RC)') + f('nis', 'NIS') + f('ai', 'Article d’imposition (AI)') + f('rib', 'RIB / compte bancaire') + f('pied', 'Pied de page des PDF', 'Merci pour votre confiance') + '</div>' +
      '<div class="at-actions"><button class="btn p" type="button" id="cm-ent-save">Enregistrer</button></div></div>';
  }

  function formLivraisons() {
    const cs = contacts().filter(c => c.type === 'Client').sort((a, b) => lbl(a).localeCompare(lbl(b), 'fr'));
    const d30 = new Date(); d30.setDate(d30.getDate() - 30);
    return '<form id="cm-livform" class="at-form" style="display:block"><h3 style="margin-top:0">Facturer des livraisons</h3><p class="iv-help">Regroupe par produit les livraisons (moins les retours) d’un client sur une période. <b>Attention</b> : la plateforme ne retient pas les livraisons déjà facturées, ne facturez pas deux fois la même période.</p>' +
      '<div class="at-fields"><label>Client *<select id="cm-lcl"><option value="">— choisir —</option>' + cs.map(c => '<option value="' + esc(c.id) + '">' + esc(lbl(c)) + '</option>').join('') + '</select></label><label>Du<input id="cm-ld1" type="date" value="' + iso(d30) + '"></label><label>Au<input id="cm-ld2" type="date" value="' + today() + '"></label></div>' +
      '<div class="at-actions"><button class="btn p" type="submit">Préparer la facture</button><button class="btn" type="button" id="cm-livno">Annuler</button></div></form>';
  }

  /* Stock actuel du produit (ou de l'élément) visé par la ligne : repère à chaque opération */
  function stockTxt(type, l) {
    if (type === 'bon_commande') {
      const a = l.article_id && window.StockAPI ? StockAPI.byId(l.article_id) : null; if (!a) return '<small>—</small>';
      const f = StockAPI.fmtQty(a, StockAPI.qty(a.id));
      return '<b>' + esc(f.main) + '</b>' + (f.sub ? '<small>' + esc(f.sub) + '</small>' : '');
    }
    if (!l.produit_id || !window.PFAPI) return '<small>—</small>';
    const st = PFAPI.qty(l.produit_id), demande = ed.lignes.filter(x => String(x.produit_id) === String(l.produit_id)).reduce((s, x) => s + num(x.quantite), 0), reste = st - demande;
    return '<b>' + nf(st, 0) + '</b> pcs<small class="' + (reste < 0 ? 'cm-neg' : '') + '">' + (reste < 0 ? 'manque ' + nf(-reste, 0) : 'reste ' + nf(reste, 0) + ' après') + '</small>';
  }
  function majStocks() { document.querySelectorAll('#cm-lignes tr[data-i]').forEach(tr => { const l = ed.lignes[Number(tr.dataset.i)], c = tr.querySelector('.cm-st'); if (l && c) c.innerHTML = stockTxt(ed.doc.type, l); }); }

  /* ---------- Éditeur ---------- */
  function nouveauDoc(type, base) {
    const date = today(), ech = new Date(); ech.setDate(ech.getDate() + (type === 'devis' ? 30 : type === 'facture' ? 30 : 15));
    ed = { doc: Object.assign({ id: null, type, numero: nextNumero(type, date), date_doc: date, echeance: iso(ech), contact_id: null, contact_nom: '', statut: type === 'facture' ? 'emise' : 'brouillon', source_id: null, commande_id: null, tva_taux: Number(ENT.tva_defaut) || 0, remise: 0, notes: '' }, base || {}), lignes: [], supprimes: [] };
  }
  const ligneVide = () => ({ id: null, produit_id: null, article_id: null, designation: '', unite: 'pcs', quantite: 1, prix_unitaire: 0, quantite_recue: 0 });

  function optsRef(type, l) {
    if (type === 'bon_commande') {
      const arts = (window.StockAPI ? StockAPI.list() : []).slice().sort((a, b) => (a.categorie + a.nom).localeCompare(b.categorie + b.nom, 'fr'));
      return '<option value="">— Élément du stock —</option>' + arts.map(a => '<option value="' + esc(a.id) + '"' + (String(l.article_id) === String(a.id) ? ' selected' : '') + '>' + esc(a.nom) + '</option>').join('');
    }
    const prods = (window.PFAPI ? PFAPI.produits() : []).slice().sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
    return '<option value="">— Produit —</option>' + prods.map(p => '<option value="' + esc(p.id) + '"' + (String(l.produit_id) === String(p.id) ? ' selected' : '') + '>' + esc(p.nom) + '</option>').join('');
  }

  function editeur() {
    const doc = ed.doc, T = TYPES[doc.type], t = totaux(doc, ed.lignes), nouveau = !doc.id, bc = doc.type === 'bon_commande', fac = doc.type === 'facture';
    const cs = contacts().filter(c => c.type === T.cible).sort((a, b) => lbl(a).localeCompare(lbl(b), 'fr'));
    const verrou = fac && !nouveau && etatFacture(doc).l === 'Annulée';
    let h = '<div class="at-actions" style="margin:0 0 10px"><button class="btn" type="button" id="cm-back">← Retour à la liste</button><span style="margin-left:auto" class="iv-save" id="cm-msg"></span></div>';
    h += '<div class="card"><div class="at-actions" style="margin-top:0"><h2 style="margin-right:auto">' + T.l + ' ' + esc(doc.numero) + (nouveau ? ' <span class="cm-bdg o">nouveau</span>' : fac ? ' <span class="cm-bdg ' + etatFacture(doc).c + '">' + etatFacture(doc).l + '</span>' : bc ? ' <span class="cm-bdg ' + etatBC(doc).c + '">' + etatBC(doc).l + '</span>' : '') + '</h2></div>';
    h += '<div class="at-fields"><label>' + T.cible + ' *<select id="cm-contact"><option value="">— choisir —</option>' + cs.map(c => '<option value="' + esc(c.id) + '"' + (String(c.id) === String(doc.contact_id) ? ' selected' : '') + '>' + esc(lbl(c)) + '</option>').join('') + '</select></label>' +
      '<label>Numéro<input id="cm-num" value="' + esc(doc.numero) + '" maxlength="30"></label><label>Date<input id="cm-date" type="date" value="' + esc(doc.date_doc) + '"></label>' +
      '<label>' + (doc.type === 'devis' ? 'Valable jusqu’au' : fac ? 'Échéance de paiement' : 'Livraison prévue') + '<input id="cm-ech" type="date" value="' + esc(doc.echeance || '') + '"></label>' +
      '<label>TVA<select id="cm-tva">' + [0, 9, 19].map(v => '<option value="' + v + '"' + (Number(doc.tva_taux) === v ? ' selected' : '') + '>' + (v ? v + ' %' : 'Sans TVA') + '</option>').join('') + '</select></label>' +
      '<label>Remise (DA)<input id="cm-remise" type="number" min="0" step="any" inputmode="decimal" value="' + (Number(doc.remise) || '') + '" placeholder="0"></label>' +
      (doc.type === 'devis' ? '<label>Statut<select id="cm-statut">' + Object.keys(STATUTS_DEVIS).map(k => '<option value="' + k + '"' + (doc.statut === k ? ' selected' : '') + '>' + STATUTS_DEVIS[k] + '</option>').join('') + '</select></label>' : '') +
      '<label style="grid-column:1/-1">Note<input id="cm-notes" maxlength="300" value="' + esc(doc.notes || '') + '" placeholder="Facultatif : conditions, délai…"></label></div></div>';
    h += '<div class="card" style="margin-top:12px"><h3 style="margin-top:0">Lignes</h3><div class="tw"><table class="iv-tbl iv-in"><thead><tr><th>' + (bc ? 'Élément' : 'Produit') + '</th><th>Désignation</th><th>' + (bc ? 'Unité' : 'Qté') + '</th><th>' + (bc ? 'Qté' : 'Prix (DA)') + '</th>' + (bc ? '<th>Prix (DA)</th>' : '') + '<th class="n">En stock</th><th class="n">Montant</th>' + (bc ? '<th class="n iv-opt">Reçu</th>' : '') + '<th></th></tr></thead><tbody id="cm-lignes">' +
      ed.lignes.map((l, i) => '<tr data-i="' + i + '"><td><select data-f="ref">' + optsRef(doc.type, l) + '</select></td><td><input class="iv-t" data-f="des" maxlength="200" value="' + esc(l.designation) + '" placeholder="Désignation"></td>' +
        (bc ? '<td><input class="iv-t" data-f="uni" maxlength="20" style="width:90px" value="' + esc(l.unite) + '"></td><td><input class="iv-q" data-f="qte" type="number" min="0" step="any" inputmode="decimal" value="' + (l.quantite || '') + '"></td><td><input class="iv-p" data-f="pu" type="number" min="0" step="any" inputmode="decimal" value="' + (l.prix_unitaire || '') + '"></td>'
          : '<td><input class="iv-q" data-f="qte" type="number" min="0" step="any" inputmode="decimal" value="' + (l.quantite || '') + '"></td><td><input class="iv-p" data-f="pu" type="number" min="0" step="any" inputmode="decimal" value="' + (l.prix_unitaire || '') + '"></td>') +
        '<td class="n cm-st">' + stockTxt(doc.type, l) + '</td><td class="n cm-mt">' + money(r2(num(l.quantite) * num(l.prix_unitaire))) + '</td>' + (bc ? '<td class="n iv-opt">' + nf(l.quantite_recue || 0, 2) + '</td>' : '') + '<td class="n"><button class="btn s d" type="button" data-rm="' + i + '">×</button></td></tr>').join('') + '</tbody></table></div>' +
      '<div class="at-actions"><button class="btn s" type="button" id="cm-addl">+ Ajouter une ligne</button></div>' +
      (bc ? '' : '<p class="iv-help">« En stock » = pièces finies disponibles dans le Stock. La facture ne modifie pas le stock : enregistrez la livraison dans <b>Stock → Sortir</b> (client + commande).</p>') +
      '<div class="cm-tot" id="cm-tot">' + totHtml(t, doc) + '</div></div>';
    // paiements rattachés (factures et bons de commande)
    if (!nouveau && (fac || bc)) {
      const ps = pays().filter(p => String(p.document_id) === String(doc.id)), paye = payeDoc(doc), reste = r2(t.ttc - paye);
      h += '<div class="card" style="margin-top:12px"><h3 style="margin-top:0">' + (fac ? 'Encaissements' : 'Règlements') + '</h3>' +
        '<p>Total TTC <b>' + money(t.ttc) + '</b> · ' + (fac ? 'encaissé' : 'réglé') + ' <b class="py-av">' + money(paye) + '</b> · reste <b class="' + (reste > 0.004 ? 'py-due' : 'py-av') + '">' + money(Math.max(0, reste)) + '</b></p>' +
        (ps.length ? '<div class="tw"><table class="iv-tbl"><tbody>' + ps.map(p => '<tr><td>' + fd(p.date_paiement) + '</td><td>' + esc(({ especes: 'Espèces', cheque: 'Chèque', virement: 'Virement', autre: 'Autre' })[p.mode] || '') + '</td><td class="n"><b>' + money(p.montant) + '</b></td><td>' + esc(p.reference || '') + '</td></tr>').join('') + '</tbody></table></div>' : '') +
        (payForm ? formPaiement(doc, reste) : (reste > 0.004 ? '<div class="at-actions"><button class="btn p" type="button" id="cm-pay">' + (fac ? 'Encaisser' : 'Régler') + '</button></div>' : '')) + '</div>';
    }
    if (!nouveau && bc && recForm) h += formReception(doc);
    // actions
    h += '<div class="at-actions" style="margin-top:12px">' + (verrou ? '' : '<button class="btn p" type="button" id="cm-save">Enregistrer</button>');
    if (!nouveau) {
      h += '<button class="btn" type="button" id="cm-pdf">PDF</button>';
      if (doc.type === 'devis' && doc.statut !== 'facture') h += '<button class="btn" type="button" id="cm-tofac">Transformer en facture</button>';
      if (bc) h += '<button class="btn" type="button" id="cm-rec">Réceptionner</button>';
      if (fac && etatFacture(doc).l !== 'Annulée') h += '<button class="btn" type="button" id="cm-annul">Annuler la facture</button>';
      h += '<button class="btn d" type="button" id="cm-del">Supprimer</button>';
    }
    return h + '</div>';
  }
  function totHtml(t, doc) {
    return '<table class="cm-tt"><tr><td>Sous-total</td><td>' + money(t.sous) + '</td></tr>' + (t.remise ? '<tr><td>Remise</td><td>− ' + money(t.remise) + '</td></tr>' : '') + '<tr><td>Total HT</td><td>' + money(t.ht) + '</td></tr>' +
      (Number(doc.tva_taux) ? '<tr><td>TVA ' + nf(doc.tva_taux, 2) + ' %</td><td>' + money(t.tva) + '</td></tr>' : '') + '<tr class="cm-ttc"><td>TOTAL TTC</td><td>' + money(t.ttc) + '</td></tr></table>';
  }
  function formPaiement(doc, reste) {
    const fac = doc.type === 'facture';
    return '<form id="cm-payform" class="at-form" style="display:block"><div class="at-fields"><label>Montant (DA) *<input id="cm-pm" type="number" min="0" step="any" inputmode="decimal" value="' + (reste > 0 ? reste : '') + '"></label><label>Date<input id="cm-pd" type="date" value="' + today() + '"></label>' +
      '<label>Mode<select id="cm-pmode"><option value="especes">Espèces</option><option value="cheque">Chèque</option><option value="virement">Virement</option><option value="autre">Autre</option></select></label><label>Référence<input id="cm-pref" maxlength="80" placeholder="N° de chèque, reçu…"></label></div>' +
      '<div class="at-actions"><button class="btn p" type="submit">' + (fac ? 'Enregistrer l’encaissement' : 'Enregistrer le règlement') + '</button><button class="btn" type="button" id="cm-pno">Annuler</button></div></form>';
  }
  function formReception(doc) {
    const ls = lignesDe(doc.id).filter(l => l.article_id && num(l.quantite) > num(l.quantite_recue) + 0.0001);
    if (!ls.length) return '<div class="card" style="margin-top:12px"><div class="iv-empty">Toutes les lignes avec un élément du stock sont déjà reçues.</div></div>';
    return '<form id="cm-recform" class="card" style="margin-top:12px"><h3 style="margin-top:0">Réception de marchandise</h3><p class="iv-help">Indiquez ce que vous recevez <b>aujourd’hui</b> : l’entrée en stock est créée avec le prix du bon, le fournisseur et le numéro du bon (dette fournisseur mise à jour).</p>' +
      '<div class="at-fields"><label>Date de réception<input id="cm-rdate" type="date" value="' + today() + '"></label><label>Bon de livraison du fournisseur<input id="cm-rref" maxlength="60" placeholder="Facultatif"></label></div>' +
      '<div class="tw"><table class="iv-tbl iv-in"><thead><tr><th>Élément</th><th class="n">Commandé</th><th class="n">Déjà reçu</th><th>Reçu maintenant</th></tr></thead><tbody>' +
      ls.map(l => { const rest = r4(num(l.quantite) - num(l.quantite_recue)); return '<tr data-lid="' + esc(l.id) + '"><td><b>' + esc(l.designation) + '</b><small>' + esc(l.unite) + '</small></td><td class="n">' + nf(l.quantite, 2) + '</td><td class="n">' + nf(l.quantite_recue || 0, 2) + '</td><td><input class="iv-q" data-rq type="number" min="0" step="any" inputmode="decimal" value="' + rest + '"></td></tr>'; }).join('') + '</tbody></table></div>' +
      '<div class="at-actions"><button class="btn p" type="submit">Enregistrer la réception</button><button class="btn" type="button" id="cm-rno">Annuler</button></div></form>';
  }

  /* ---------- Sauvegarde ---------- */
  function lireEntete() {
    if (!ed || !$('#cm-contact')) return;
    const d = ed.doc, c = cById($('#cm-contact').value);
    d.contact_id = c ? c.id : null; d.contact_nom = c ? lbl(c) : '';
    d.numero = $('#cm-num').value.trim(); d.date_doc = $('#cm-date').value; d.echeance = $('#cm-ech').value || null;
    d.tva_taux = num($('#cm-tva').value); d.remise = Math.max(0, num($('#cm-remise').value)); d.notes = $('#cm-notes').value.trim();
    if ($('#cm-statut')) d.statut = $('#cm-statut').value;
  }
  async function enregistrer(silencieux) {
    lireEntete();
    const d = ed.doc;
    if (!d.contact_id) { say('Choisissez le ' + TYPES[d.type].cible.toLowerCase() + '.'); return false; }
    if (!d.numero) { say('Le numéro est obligatoire.'); return false; }
    if (DOCS.some(x => x.type === d.type && x.numero === d.numero && String(x.id) !== String(d.id))) { say('Ce numéro existe déjà.'); return false; }
    const ls = ed.lignes.filter(l => String(l.designation).trim() || num(l.quantite) > 0);
    if (!ls.length) { say('Ajoutez au moins une ligne.'); return false; }
    if (ls.some(l => !String(l.designation).trim())) { say('Chaque ligne doit avoir une désignation.'); return false; }
    const row = { type: d.type, numero: d.numero, date_doc: d.date_doc, echeance: d.echeance, contact_id: d.contact_id, contact_nom: d.contact_nom, statut: d.statut, source_id: d.source_id, commande_id: d.commande_id, tva_taux: d.tva_taux, remise: r2(d.remise), notes: d.notes };
    let id = d.id;
    if (id) { const u = await sb.from('documents').update(row).eq('id', id); if (u.error) { say('Erreur : ' + u.error.message); return false; } }
    else { const i = await sb.from('documents').insert([row]).select(); if (i.error || !i.data || !i.data[0]) { say('Erreur : ' + ((i.error && i.error.message) || 'enregistrement impossible')); return false; } id = i.data[0].id; d.id = id; }
    for (const sid of ed.supprimes) await sb.from('document_lignes').delete().eq('id', sid);
    ed.supprimes = [];
    for (let k = 0; k < ls.length; k++) {
      const l = ls[k], lr = { document_id: id, produit_id: l.produit_id || null, article_id: l.article_id || null, designation: String(l.designation).trim(), unite: l.unite || 'pcs', quantite: r4(num(l.quantite)), prix_unitaire: r4(num(l.prix_unitaire)), ordre: k };
      if (l.id) { const u = await sb.from('document_lignes').update(lr).eq('id', l.id); if (u.error) { say('Erreur ligne : ' + u.error.message); return false; } }
      else { const i = await sb.from('document_lignes').insert([lr]).select(); if (i.error || !i.data) { say('Erreur ligne : ' + ((i.error && i.error.message) || '')); return false; } l.id = i.data[0].id; }
    }
    ed.lignes = ls;
    await load(true); ed = { doc: Object.assign({}, docById(id)), lignes: lignesDe(id).map(x => Object.assign({}, x)), supprimes: [] };
    if (!silencieux) say(TYPES[d.type].l + ' enregistré' + (d.type === 'facture' ? 'e' : '') + ' : ' + d.numero);
    render(); return true;
  }

  function ouvrir(id) {
    const d = docById(id); if (!d) return;
    ed = { doc: Object.assign({}, d), lignes: lignesDe(id).map(x => Object.assign({}, x)), supprimes: [] }; payForm = null; recForm = null; render(); window.scrollTo(0, 0);
  }

  /* ---------- Lignes : saisie ---------- */
  function majTotaux() { lireEntete(); const t = totaux(ed.doc, ed.lignes), e = $('#cm-tot'); if (e) e.innerHTML = totHtml(t, ed.doc); }
  function onInput(e) {
    const el = e.target, tr = el.closest('tr[data-i]');
    if (!ed) return;
    if (el.id === 'cm-remise' || el.id === 'cm-tva') { majTotaux(); return; }
    if (!tr) return;
    const l = ed.lignes[Number(tr.dataset.i)], f = el.dataset.f; if (!l || !f) return;
    if (f === 'ref') {
      const doc = ed.doc;
      if (doc.type === 'bon_commande') {
        l.article_id = el.value || null; const a = l.article_id && window.StockAPI ? StockAPI.byId(l.article_id) : null;
        if (a) { const c = StockAPI.aCond(a); l.designation = a.nom; l.unite = c ? a.cond_nom : a.unite; l.prix_unitaire = Number(a.prix_achat) || 0; tr.querySelector('[data-f=des]').value = l.designation; tr.querySelector('[data-f=uni]').value = l.unite; tr.querySelector('[data-f=pu]').value = l.prix_unitaire || ''; }
      } else {
        l.produit_id = el.value || null; const p = l.produit_id && window.PFAPI ? PFAPI.produits().find(x => String(x.id) === String(l.produit_id)) : null;
        if (p) { l.designation = p.nom; l.prix_unitaire = Number(p.prix_vente) || 0; tr.querySelector('[data-f=des]').value = l.designation; tr.querySelector('[data-f=pu]').value = l.prix_unitaire || ''; }
      }
    } else if (f === 'des') l.designation = el.value;
    else if (f === 'uni') l.unite = el.value;
    else if (f === 'qte') l.quantite = Math.max(0, num(el.value));
    else if (f === 'pu') l.prix_unitaire = Math.max(0, num(el.value));
    tr.querySelector('.cm-mt').textContent = money(r2(num(l.quantite) * num(l.prix_unitaire)));
    majStocks(); majTotaux();
  }

  /* ---------- Création depuis une commande, des livraisons, un devis ---------- */
  async function facturerCommande(cmdId) {
    if (typeof show === 'function') show('commerce');
    await load(true);
    const r = await sb.from('commandes').select('*, productions(modele_nom, produit_id)').eq('id', cmdId).single();
    if (r.error || !r.data) { say('Commande introuvable.'); return; }
    const c = r.data, existante = DOCS.find(d => d.type === 'facture' && String(d.commande_id) === String(cmdId) && d.statut !== 'annulee');
    if (existante && !confirm('Une facture existe déjà pour cette commande (' + existante.numero + ').\nEn créer une autre ?')) { ouvrir(existante.id); return; }
    const nom = (c.productions && c.productions.modele_nom) || 'Produit';
    const pf = window.PFAPI ? PFAPI.produits() : [];
    const prod = (c.productions && c.productions.produit_id && pf.find(p => String(p.id) === String(c.productions.produit_id))) || pf.find(p => norm(p.nom) === norm(nom)) || null;
    const ct = c.contact_id ? cById(c.contact_id) : null;
    tab = 'facture'; nouveauDoc('facture', { commande_id: cmdId, contact_id: ct ? ct.id : null, contact_nom: ct ? lbl(ct) : '', notes: 'Commande ' + (c.commande_numero || '') });
    ed.lignes = [{ id: null, produit_id: prod ? prod.id : null, article_id: null, designation: nom, unite: 'pcs', quantite: Number(c.quantite_commandee) || 1, prix_unitaire: Number(c.prix_unitaire) || (prod ? Number(prod.prix_vente) : 0) || 0, quantite_recue: 0 }];
    render();
  }
  function depuisLivraisons() {
    const cl = $('#cm-lcl').value, a = $('#cm-ld1').value, b = $('#cm-ld2').value;
    if (!cl) { say('Choisissez le client.'); return; }
    const prods = new Map((window.PFAPI ? PFAPI.produits() : []).map(p => [String(p.id), p]));
    const g = new Map();
    (window.PFAPI ? PFAPI.mouvements() : []).forEach(m => {
      if ((m.type !== 'livraison' && m.type !== 'retour') || String(m.contact_id) !== String(cl)) return;
      const d = String(m.date_mvt || ''); if ((a && d < a) || (b && d > b)) return;
      const p = prods.get(String(m.produit_id)), n = -(Number(m.quantite) || 0), pv = m.prix_vente != null ? Number(m.prix_vente) : (p ? Number(p.prix_vente) || 0 : 0);
      const k = String(m.produit_id) + '|' + pv, x = g.get(k) || { produit_id: m.produit_id, designation: p ? p.nom : 'Produit', q: 0, pu: pv }; x.q += n; g.set(k, x);
    });
    const ls = [...g.values()].filter(x => x.q > 0);
    if (!ls.length) { say('Aucune livraison pour ce client sur cette période.'); return; }
    const c = cById(cl); fromLiv = false;
    nouveauDoc('facture', { contact_id: cl, contact_nom: c ? lbl(c) : '', notes: 'Livraisons du ' + fd(a) + ' au ' + fd(b) });
    ed.lignes = ls.map(x => ({ id: null, produit_id: x.produit_id, article_id: null, designation: x.designation, unite: 'pcs', quantite: x.q, prix_unitaire: x.pu, quantite_recue: 0 }));
    render();
  }
  async function devisEnFacture() {
    if (!(await enregistrer(true))) return;
    const d = ed.doc;
    const base = { contact_id: d.contact_id, contact_nom: d.contact_nom, tva_taux: d.tva_taux, remise: d.remise, notes: d.notes, source_id: d.id };
    const lig = ed.lignes.map(l => Object.assign({}, l, { id: null }));
    const src = d.id; tab = 'facture'; nouveauDoc('facture', base); ed.lignes = lig; render();      // affiche la nouvelle facture avant de l'enregistrer
    if (!(await enregistrer(true))) return;
    await sb.from('documents').update({ statut: 'facture' }).eq('id', src);
    await load(true); say('Facture créée à partir du devis.'); render();
  }

  /* ---------- Paiement et réception ---------- */
  async function payer() {
    lireEntete();
    const doc = ed.doc, m = num($('#cm-pm').value), fac = doc.type === 'facture';
    if (!(m > 0)) { say('Indiquez un montant supérieur à 0.'); return; }
    const reste = r2(totaux(doc, ed.lignes).ttc - payeDoc(doc));
    if (m > reste + 0.004 && !confirm('Ce montant dépasse le reste à ' + (fac ? 'encaisser' : 'payer') + ' (' + money(reste) + '). Continuer ?')) return;
    const c = cById(doc.contact_id);
    const r = await sb.from('paiements').insert([{ date_paiement: $('#cm-pd').value || today(), sens: fac ? 'encaissement' : 'reglement', contact_id: doc.contact_id, contact_nom: c ? lbl(c) : doc.contact_nom, montant: r2(m), mode: $('#cm-pmode').value, reference: $('#cm-pref').value.trim() || doc.numero, note: (fac ? 'Facture ' : 'Bon de commande ') + doc.numero, document_id: doc.id }]);
    if (r.error) { say('Erreur : ' + r.error.message); return; }
    payForm = null; if (window.PayAPI) await PayAPI.load(); say((fac ? 'Encaissement' : 'Règlement') + ' enregistré : ' + money(m)); render();
  }
  function prixMouvement(a, unite, pu) { if (StockAPI.aCond(a)) { if (unite === a.cond_nom) return pu; if (unite === a.unite) return pu * StockAPI.condQte(a); } return pu; }
  async function receptionner() {
    const doc = ed.doc, date = $('#cm-rdate').value || today(), ref = $('#cm-rref').value.trim();
    const saisies = [...document.querySelectorAll('#cm-recform tr[data-lid]')].map(tr => ({ id: tr.dataset.lid, q: num(tr.querySelector('[data-rq]').value) })).filter(x => x.q > 0);
    if (!saisies.length) { say('Indiquez au moins une quantité reçue.'); return; }
    const c = cById(doc.contact_id), echecs = [];
    for (const s of saisies) {
      const l = LIGS.find(x => String(x.id) === String(s.id)), a = l && l.article_id ? StockAPI.byId(l.article_id) : null; if (!l || !a) continue;
      const base = StockAPI.toBase(a, s.q, l.unite); if (base == null) { echecs.push(l.designation + ' : unité « ' + l.unite + ' » incompatible'); continue; }
      const pu = prixMouvement(a, l.unite, num(l.prix_unitaire));
      const r = await StockAPI.mouvement({ article_id: a.id, type: 'entree', quantite: base, prix_achat: pu, fournisseur: c ? lbl(c) : doc.contact_nom, contact_id: doc.contact_id, reference: ref || doc.numero, note: 'Réception ' + doc.numero, date });
      if (r.error) { echecs.push(l.designation + ' : ' + r.error.message); continue; }
      if (pu > 0 && Math.abs(pu - Number(a.prix_achat)) > 0.0001) await StockAPI.setPrix(a.id, pu);
      await sb.from('document_lignes').update({ quantite_recue: r4(num(l.quantite_recue) + s.q) }).eq('id', l.id);
    }
    await load(true);
    const d2 = docById(doc.id), e = etatBC(d2); await sb.from('documents').update({ statut: e.l === 'Reçu' ? 'recu' : e.l === 'Reçu partiellement' ? 'recu_partiel' : d2.statut }).eq('id', doc.id);
    recForm = null; await load(true); ouvrir(doc.id);
    say(echecs.length ? 'Réception partielle : ' + echecs.join(' ; ') : 'Réception enregistrée : le stock et la dette fournisseur sont à jour.');
  }

  /* ---------- PDF ---------- */
  const pdfT = s => String(s ?? '').replace(/œ/g, 'oe').replace(/Œ/g, 'OE').replace(/[  ]/g, ' ');
  function pdf() {
    if (!(window.jspdf && window.jspdf.jsPDF)) { say('Bibliothèque PDF non chargée.'); return; }
    lireEntete();
    const d = ed.doc, T = TYPES[d.type], t = totaux(d, ed.lignes), doc = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4' }), M = 14, W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight();
    const c = cById(d.contact_id), fac = d.type === 'facture';
    if (typeof LOGO_PDF !== 'undefined' && LOGO_PDF) doc.addImage(LOGO_PDF, 'PNG', M, 9, 22, 22);
    doc.setTextColor(0); doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.text(pdfT(ENT.nom || 'MARIA BAG'), M + 26, 17);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(90);
    const info = [ENT.forme, [ENT.adresse, ENT.ville].filter(Boolean).join(', '), [ENT.tel && 'Tel : ' + ENT.tel, ENT.email].filter(Boolean).join('  -  '), [ENT.nif && 'NIF : ' + ENT.nif, ENT.rc && 'RC : ' + ENT.rc, ENT.nis && 'NIS : ' + ENT.nis, ENT.ai && 'AI : ' + ENT.ai].filter(Boolean).join('  -  ')].filter(Boolean);
    info.forEach((l, i) => doc.text(pdfT(l), M + 26, 22 + i * 4));
    doc.setTextColor(0); doc.setFont('helvetica', 'bold'); doc.setFontSize(17); doc.text(pdfT(T.l.toUpperCase()), W - M, 17, { align: 'right' });
    doc.setFontSize(11); doc.text(pdfT('N° ' + d.numero), W - M, 24, { align: 'right' });
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.text(pdfT('Date : ' + fd(d.date_doc)), W - M, 30, { align: 'right' });
    if (d.echeance) doc.text(pdfT((d.type === 'devis' ? 'Valable jusqu\'au : ' : fac ? 'Echeance : ' : 'Livraison prevue : ') + fd(d.echeance)), W - M, 35, { align: 'right' });
    doc.setDrawColor(0); doc.setLineWidth(0.6); doc.line(M, 44, W - M, 44);
    doc.setFontSize(8.5); doc.setTextColor(90); doc.text(pdfT(T.cible === 'Client' ? 'FACTURE A / CLIENT' : 'FOURNISSEUR'), M, 50);
    doc.setTextColor(0); doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.text(pdfT(c ? lbl(c) : d.contact_nom), M, 56);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); if (c) doc.text(pdfT([c.ville, c.tel].filter(Boolean).join('  -  ')), M, 61);
    const body = ed.lignes.filter(l => String(l.designation).trim()).map((l, i) => [i + 1, l.designation, nf(l.quantite, 2) + (d.type === 'bon_commande' ? ' ' + l.unite : ''), nf(l.prix_unitaire, 2), nf(r2(num(l.quantite) * num(l.prix_unitaire)), 2)].map(pdfT));
    doc.autoTable({ startY: 67, margin: { left: M, right: M, bottom: 30 }, head: [['N°', 'Designation', 'Quantite', 'Prix unitaire (DA)', 'Montant (DA)'].map(pdfT)], body, theme: 'grid',
      styles: { font: 'helvetica', fontSize: 9.5, cellPadding: 2.6, textColor: 0, lineColor: 120, lineWidth: 0.15 }, headStyles: { fillColor: [0, 0, 0], textColor: 255 },
      columnStyles: { 0: { cellWidth: 10 }, 2: { halign: 'right', cellWidth: 28 }, 3: { halign: 'right', cellWidth: 36 }, 4: { halign: 'right', cellWidth: 34 } } });
    let y = doc.lastAutoTable.finalY + 6; if (y > H - 70) { doc.addPage(); y = 18; }
    const ligne = (l, v, bold) => { doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(bold ? 11 : 9.5); doc.text(pdfT(l), W - M - 62, y); doc.text(pdfT(v), W - M, y, { align: 'right' }); y += bold ? 7 : 5.5; };
    ligne('Sous-total', nf(t.sous, 2) + ' DA'); if (t.remise) ligne('Remise', '- ' + nf(t.remise, 2) + ' DA'); ligne('Total HT', nf(t.ht, 2) + ' DA'); if (Number(d.tva_taux)) ligne('TVA ' + nf(d.tva_taux, 2) + ' %', nf(t.tva, 2) + ' DA');
    doc.setDrawColor(0); doc.line(W - M - 64, y - 3.5, W - M, y - 3.5); ligne('TOTAL TTC', nf(t.ttc, 2) + ' DA', true);
    if (fac && d.id) { const p = payeDoc(d); if (p > 0) { ligne('Deja regle', nf(p, 2) + ' DA'); ligne('Reste a payer', nf(Math.max(0, r2(t.ttc - p)), 2) + ' DA', true); } }
    y += 3; doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5);
    const phrase = (fac ? 'Arretee la presente facture a la somme de : ' : d.type === 'devis' ? 'Arrete le present devis a la somme de : ' : 'Arrete le present bon de commande a la somme de : ') + montantLettres(t.ttc) + '.';
    doc.text(doc.splitTextToSize(pdfT(phrase), W - 2 * M), M, y); y += 12;
    if (d.notes) { doc.setFontSize(9); doc.setTextColor(90); doc.text(doc.splitTextToSize(pdfT('Note : ' + d.notes), W - 2 * M), M, y); y += 10; doc.setTextColor(0); }
    if (ENT.rib && fac) { doc.setFontSize(9); doc.text(pdfT('Reglement par virement : ' + ENT.rib), M, y); y += 6; }
    doc.setFontSize(8.5); doc.setTextColor(110); doc.text(pdfT(ENT.pied || 'Merci pour votre confiance'), W / 2, H - 8, { align: 'center' });
    doc.save(norm(T.l).replace(/ /g, '-') + '-' + String(d.numero).replace(/[^A-Za-z0-9-]/g, '') + '.pdf');
  }

  /* ---------- Événements ---------- */
  document.addEventListener('click', async e => {
    const root = $('#cm-root'); if (!root || !root.contains(e.target)) return;
    const t = e.target;
    const tb = t.closest('#cm-tabs [data-t]'); if (tb) { tab = tb.dataset.t; filtre = ''; fromLiv = false; render(); return; }
    if (t.closest('#cm-new')) { nouveauDoc(tab); payForm = recForm = null; render(); return; }
    if (t.closest('#cm-liv')) { fromLiv = true; render(); return; }
    if (t.closest('#cm-livno')) { fromLiv = false; render(); return; }
    const op = t.closest('tr[data-open]'); if (op) { ouvrir(op.dataset.open); return; }
    if (t.closest('#cm-back')) { ed = null; payForm = recForm = null; await load(true); return; }
    if (t.closest('#cm-save')) { await enregistrer(); return; }
    if (t.closest('#cm-addl')) { lireEntete(); ed.lignes.push(ligneVide()); render(); return; }
    const rm = t.closest('[data-rm]'); if (rm) { lireEntete(); const l = ed.lignes[Number(rm.dataset.rm)]; if (l && l.id) { if (num(l.quantite_recue) > 0) { say('Cette ligne a déjà été reçue : impossible de la supprimer.'); return; } ed.supprimes.push(l.id); } ed.lignes.splice(Number(rm.dataset.rm), 1); render(); return; }
    if (t.closest('#cm-pdf')) { pdf(); return; }
    if (t.closest('#cm-tofac')) { await devisEnFacture(); return; }
    if (t.closest('#cm-pay')) { lireEntete(); payForm = true; render(); return; }
    if (t.closest('#cm-pno')) { payForm = null; render(); return; }
    if (t.closest('#cm-rec')) { if (!(await enregistrer(true))) return; recForm = true; render(); const f = $('#cm-recform'); if (f) f.scrollIntoView({ behavior: 'smooth' }); return; }
    if (t.closest('#cm-rno')) { recForm = null; render(); return; }
    if (t.closest('#cm-annul')) {
      const p = payeDoc(ed.doc);
      if (!confirm('Annuler la facture ' + ed.doc.numero + ' ?' + (p > 0 ? '\n\nElle a déjà ' + money(p) + ' d’encaissements : ils restent enregistrés (supprimez-les dans Paiements et soldes si besoin).' : ''))) return;
      const u = await sb.from('documents').update({ statut: 'annulee' }).eq('id', ed.doc.id); if (u.error) { say('Erreur : ' + u.error.message); return; }
      await load(true); ouvrir(ed.doc.id); return;
    }
    if (t.closest('#cm-del')) {
      const d = ed.doc, p = d.type !== 'devis' ? payeDoc(d) : 0, recu = lignesDe(d.id).some(l => num(l.quantite_recue) > 0);
      if (p > 0) { say('Ce document a des paiements rattachés : supprimez-les d’abord (Paiements et soldes).'); return; }
      if (recu) { say('Des marchandises ont déjà été reçues avec ce bon : il ne peut pas être supprimé.'); return; }
      if (!confirm('Supprimer définitivement ' + TYPES[d.type].l.toLowerCase() + ' ' + d.numero + ' ?')) return;
      const x = await sb.from('documents').delete().eq('id', d.id); if (x.error) { say('Erreur : ' + x.error.message); return; }
      ed = null; await load(true); return;
    }
    if (t.closest('#cm-ent-save')) {
      const v = {}; root.querySelectorAll('[data-ent]').forEach(i => { v[i.dataset.ent] = i.value.trim(); }); v.tva_defaut = ENT.tva_defaut || 0;
      const r = ENTID ? await sb.from('parametres').update({ valeur: v }).eq('id', ENTID) : await sb.from('parametres').insert([{ cle: 'entreprise', valeur: v }]).select();
      if (r.error) { say('Erreur : ' + r.error.message); return; }
      say('Informations enregistrées.'); await load(true);
    }
  });
  document.addEventListener('submit', async e => {
    if (e.target.id === 'cm-livform') { e.preventDefault(); depuisLivraisons(); }
    else if (e.target.id === 'cm-payform') { e.preventDefault(); await payer(); }
    else if (e.target.id === 'cm-recform') { e.preventDefault(); await receptionner(); }
  });
  document.addEventListener('input', e => {
    const root = $('#cm-root'); if (!root || !root.contains(e.target)) return;
    if (e.target.id === 'cm-q') { filtre = e.target.value; const pos = e.target.selectionStart; render(); const q = $('#cm-q'); if (q) { q.focus(); q.setSelectionRange(pos, pos); } return; }
    if (ed) onInput(e);
  });
  document.addEventListener('change', e => {
    const root = $('#cm-root'); if (!root || !root.contains(e.target)) return;
    if (ed && e.target.closest && e.target.closest('tr[data-i]') && e.target.dataset.f === 'ref') onInput(e);
    if (ed && (e.target.id === 'cm-tva')) majTotaux();
  });
  ['mariabag:paiements', 'mariabag:stock', 'mariabag:pf'].forEach(ev => document.addEventListener(ev, () => { if (!ed && $('#v-commerce') && $('#v-commerce').classList.contains('on')) render(); }));
  document.addEventListener('mariabag:authenticated', () => load(true));

  window.loadCommerce = load;
  window.CommerceAPI = { load, facturerCommande, montantLettres, totaux, etatFacture };
})();
