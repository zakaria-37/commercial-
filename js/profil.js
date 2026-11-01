/* ============================================================
   PROFIL D'UN CLIENT OU D'UN FOURNISSEUR (bouton « Profil » dans Contacts)
   Tout ce qui concerne la personne, au même endroit :
   - résumé : ventes, achats, versements, solde, crédits ;
   - relevé de compte chronologique avec le solde après chaque opération (+ PDF) ;
   - ventes (livraisons), achats (entrées en stock, bons de réception), versements, crédits, documents (factures, bons, devis).
   Données : PartAPI.ops (ventes / achats), PayAPI (versements et soldes), CommerceAPI (documents), table credits_tiers.
   ============================================================ */
(function () {
  'use strict';
  const $ = s => document.querySelector(s);
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const r2 = n => Math.round((Number(n) || 0) * 100) / 100;
  const money = n => (Number(n) || 0).toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + ' DA';
  const fd = s => s ? String(s).slice(0, 10).split('-').reverse().join('/') : '';
  const pdfT = s => String(s ?? '').replace(/œ/g, 'oe').replace(/Œ/g, 'OE').replace(/[\u00a0\u202f]/g, ' ');
  const say = t => { if (typeof toast === 'function') toast(t); };
  const contacts = () => (typeof D !== 'undefined' && Array.isArray(D)) ? D : [];
  const lbl = c => window.PartAPI ? PartAPI.label(c) : (c.societe || c.nom);
  const MODES = { especes: 'Espèces', cheque: 'Chèque', virement: 'Virement', autre: 'Autre' };
  const TDOC = { facture: 'Facture', bon_livraison: 'Bon de livraison', bon_reception: 'Bon de réception', devis: 'Devis', bon_commande: 'Bon de commande' };
  const NAT = { pret_donne: ['Prêt donné', 1], remb_recu: ['Remboursement reçu', -1], pret_recu: ['Prêt reçu', -1], remb_fait: ['Remboursement fait', 1] };

  let cur = null, onglet = 'releve', CR = [], P = null;

  /* Bénéfice avec un client : pour chaque pièce livrée (moins les retours) : prix de vente − coût de la pièce
     (prix d'achat ou de fabrication actuel), puis moins les remises des bons et factures. */
  function benefice(c, docs) {
    if (!window.PFAPI) return null;
    const prods = new Map(PFAPI.produits().map(p => [String(p.id), p])), nomC = norm(lbl(c)), lignes = [];
    let ben = 0, ca = 0, sansCout = 0;
    PFAPI.mouvements().forEach(m => {
      if (m.type !== 'livraison' && m.type !== 'retour') return;
      if (!(String(m.contact_id) === String(c.id) || (!m.contact_id && m.client_nom && norm(m.client_nom) === nomC))) return;
      const p = prods.get(String(m.produit_id)), n = -(Number(m.quantite) || 0), pv = m.prix_vente != null ? Number(m.prix_vente) : (p ? Number(p.prix_vente) || 0 : 0);
      const cout = p ? Number(PFAPI.coutProduit(p)) || 0 : 0;
      ca += pv * n;
      if (cout > 0) { const b = (pv - cout) * n; ben += b; lignes.push({ id: m.id, b, cout }); } else { sansCout++; lignes.push({ id: m.id, b: null, cout: 0 }); }
    });
    // remises des bons de livraison et factures qui ont sorti des pièces du stock
    const mv = PFAPI.mouvements();
    let remises = 0;
    (docs || []).forEach(d => {
      if (d.statut === 'annulee' || !['bon_livraison', 'facture'].includes(d.type)) return;
      const mk = d.type === 'facture' ? 'Facture ' + d.numero : 'Bon de livraison ' + d.numero;
      if (!mv.some(m => String(m.note || '') === mk || String(m.note || '').startsWith(mk + ' '))) return;
      remises += CommerceAPI.totaux(d, CommerceAPI.lignesDe(d.id)).remise || 0;
    });
    return { ben: r2(ben - remises), ca: r2(ca - remises), remises: r2(remises), sansCout, parMvt: new Map(lignes.map(x => [String(x.id), x])) };
  }
  const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

  async function charger(id) {
    const c = contacts().find(x => String(x.id) === String(id)); if (!c) return null;
    try { if (window.CommerceAPI && !CommerceAPI.docs().length) await CommerceAPI.load(true); } catch (e) {}
    try { if (window.PayAPI) await PayAPI.load(); } catch (e) {}
    try { if (window.PFAPI && !PFAPI.produits().length) await PFAPI.load(); } catch (e) {}
    try { if (window.StockAPI && !StockAPI.list().length) await StockAPI.load(); } catch (e) {}
    try { const r = await sb.from('credits_tiers').select('*').eq('contact_id', id); CR = r.error ? [] : (r.data || []); } catch (e) { CR = []; }
    const k = 'c:' + id, ops = (window.PartAPI ? PartAPI.ops({}) : []).filter(o => o.key === k);
    const ventes = ops.filter(o => o.sens === 'vente'), achats = ops.filter(o => o.sens === 'achat');
    const pays = (window.PayAPI ? PayAPI.list() : []).filter(p => String(p.contact_id) === String(id));
    const sc = window.PayAPI ? PayAPI.soldes('client').find(x => String(x.id) === String(id)) : null, sf = window.PayAPI ? PayAPI.soldes('fournisseur').find(x => String(x.id) === String(id)) : null;
    const docs = window.CommerceAPI ? CommerceAPI.docs().filter(d => String(d.contact_id) === String(id)).sort((a, b) => String(b.date_doc).localeCompare(String(a.date_doc))) : [];
    const cred = r2(CR.reduce((s, o) => s + NAT[o.nature][1] * Number(o.montant || 0), 0));
    const ben = benefice(c, docs);
    return { c, ventes, achats, pays, sc, sf, docs, cred, ben, client: /client/i.test(c.type || '') || ventes.length > 0, four: /fournisseur/i.test(c.type || '') || achats.length > 0 };
  }

  /* Relevé : opérations datées ; « débit » augmente ce que la personne nous doit (client) ou ce que nous lui devons (fournisseur) */
  function releve(sens) {
    const cl = sens === 'client', L = [];
    // une ligne par modèle : nom du modèle, quantité, prix d'une unité, prix total
    (cl ? P.ventes : P.achats).forEach(o => { const n = o.qte ? parseFloat(String(o.qte).replace(/[^\d,.-]/g, '').replace(',', '.')) || 0 : 0;
      L.push({ d: o.date, op: o.libelle, qte: o.qte || '', pu: n ? Math.abs(o.montant) / n : null, ref: o.ref || '', debit: o.montant > 0 ? o.montant : 0, credit: o.montant < 0 ? -o.montant : 0 }); });
    P.pays.filter(p => p.sens === (cl ? 'report_client' : 'report_fournisseur')).forEach(p => L.push({ d: p.date_paiement, op: 'Solde de départ', ref: p.reference || '', debit: Number(p.montant), credit: 0 }));
    P.pays.filter(p => p.sens === (cl ? 'encaissement' : 'reglement')).forEach(p => L.push({ d: p.date_paiement, op: (cl ? 'Versement reçu' : 'Versement fait') + ' (' + (MODES[p.mode] || p.mode || '') + ')' + (p.note ? ' · ' + p.note : ''), ref: p.reference || '', debit: 0, credit: Number(p.montant) }));
    L.sort((a, b) => String(a.d).localeCompare(String(b.d)) || (b.debit - a.debit));
    let s = 0; L.forEach(x => { s = r2(s + x.debit - x.credit); x.solde = s; });
    return L;
  }

  /* Case « Différence » : + = reste à payer, − = payé en plus (avance), 0 = soldé */
  function diff(v, plus, moins) {
    v = r2(v); const z = Math.abs(v) < 0.005;
    return '<div class="ct-kpi"><span>Différence</span><b class="' + (z ? 'py-av' : v > 0 ? 'py-due' : 'pr-moins') + '">' + (z ? '0 DA' : (v > 0 ? '+ ' : '− ') + money(Math.abs(v))) + '</b><small>' + (z ? '✔ compte soldé' : v > 0 ? plus : moins) + '</small></div>';
  }
  function html() {
    const c = P.c, tel = String(c.tel || '').split(/[\s\/,;-]+/).map(t => t.replace(/[^\d+]/g, '')).filter(t => t.length >= 9)[0] || '';
    const wa = tel.replace(/^\+/, '').replace(/^00/, '').replace(/^0/, '213');
    const sum = l => l.reduce((s, o) => s + o.montant, 0);
    const enc = P.pays.filter(p => p.sens === 'encaissement').reduce((s, p) => s + Number(p.montant), 0), reg = P.pays.filter(p => p.sens === 'reglement').reduce((s, p) => s + Number(p.montant), 0);
    let h = '<div class="pr-head"><div class="pr-av">' + esc((lbl(c) || '?').trim().charAt(0).toUpperCase()) + '</div><div class="pr-id"><h2>' + esc(lbl(c)) + '</h2>' +
      '<p>' + esc([c.type, c.statut, c.poste, c.ville].filter(Boolean).join(' · ')) + '</p><p class="pr-co">' + (c.tel ? '☎ ' + esc(c.tel) : '') + (c.email ? ' · ✉ ' + esc(c.email) : '') + '</p></div>' +
      '<div class="pr-act">' + (tel ? '<a class="btn s" href="tel:' + esc(tel) + '">Appeler</a><a class="btn s" target="_blank" rel="noopener" href="https://wa.me/' + esc(wa) + '">WhatsApp</a>' : '') +
      '<button class="btn s" type="button" data-pr="edit">Modifier</button><button class="btn s p" type="button" data-pr="pdf">Relevé PDF</button><button class="btn s" type="button" data-pr="close" aria-label="Fermer">✕</button></div></div>';
    // chiffres clés
    h += '<div class="ct-kpis">';
    if (P.client) h += '<div class="ct-kpi"><span>Ventes (livraisons)</span><b>' + money(sum(P.ventes)) + '</b><small>' + P.ventes.length + ' opération(s)</small></div><div class="ct-kpi"><span>Versements reçus</span><b class="py-av">' + money(enc) + '</b><small>' + P.pays.filter(p => p.sens === 'encaissement').length + ' versement(s)</small></div>' +
      diff(P.sc ? P.sc.solde : 0, 'le client nous doit encore', 'le client a payé en plus (avance)');
    if (P.four) h += '<div class="ct-kpi"><span>Achats</span><b>' + money(sum(P.achats)) + '</b><small>' + P.achats.length + ' opération(s)</small></div><div class="ct-kpi"><span>Versements faits</span><b>' + money(reg) + '</b><small>' + P.pays.filter(p => p.sens === 'reglement').length + ' versement(s)</small></div>' +
      diff(P.sf ? P.sf.solde : 0, 'nous lui devons encore', 'nous avons payé en plus (avance chez lui)');
    if (P.client && P.ben && P.ventes.length) { const b = P.ben;
      h += '<div class="ct-kpi"><span>Bénéfice avec ce client</span><b class="' + (b.ben < 0 ? 'py-due' : 'py-av') + '">' + money(b.ben) + '</b><small>' + (b.ca > 0 ? Math.round(b.ben / b.ca * 100) + ' % des ventes' : '') + (b.remises ? ' · remises déduites : ' + money(b.remises) : '') + (b.sansCout ? ' · ⚠ ' + b.sansCout + ' vente(s) sans coût renseigné' : '') + '</small></div>'; }
    h += '</div>';
    // Crédits : ce que nous lui avons prêté, ce qu'il nous a prêté, et la différence ; puis la position globale (crédits + compte commercial)
    if (CR.length) {
      const som = n => r2(CR.filter(o => o.nature === n).reduce((x, o) => x + Number(o.montant || 0), 0));
      const donne = r2(som('pret_donne') - som('remb_recu')), recu = r2(som('pret_recu') - som('remb_fait')), dc = r2(donne - recu);
      const com = P.four && !P.client ? -(P.sf ? P.sf.solde : 0) : (P.sc ? P.sc.solde : 0) - (P.sf ? P.sf.solde : 0);      // + = il nous doit
      const net = r2(dc + com), sg = v => (Math.abs(v) < 0.005 ? '0 DA' : (v > 0 ? '+ ' : '− ') + money(Math.abs(v)));
      h += '<h3 class="pr-sous">Crédits (prêts)</h3><div class="ct-kpis">' +
        '<div class="ct-kpi"><span>Nous lui avons prêté</span><b>' + money(donne) + '</b><small>prêts donnés' + (som('remb_recu') ? ' − remboursés ' + money(som('remb_recu')) : '') + '</small></div>' +
        '<div class="ct-kpi"><span>Il nous a prêté</span><b>' + money(recu) + '</b><small>prêts reçus' + (som('remb_fait') ? ' − remboursés ' + money(som('remb_fait')) : '') + '</small></div>' +
        '<div class="ct-kpi"><span>Différence des crédits</span><b class="' + (Math.abs(dc) < 0.005 ? 'py-av' : dc > 0 ? 'py-due' : 'pr-moins') + '">' + sg(dc) + '</b><small>' + (Math.abs(dc) < 0.005 ? '✔ crédits soldés' : dc > 0 ? 'il nous doit (prêts)' : 'nous lui devons (prêts)') + '</small></div>' +
        '<div class="ct-kpi pr-net"><span>Position globale</span><b class="' + (Math.abs(net) < 0.005 ? 'py-av' : net > 0 ? 'py-due' : 'pr-moins') + '">' + sg(net) + '</b><small>' + (Math.abs(net) < 0.005 ? '✔ tout est soldé' : net > 0 ? 'au total, il nous doit' : 'au total, nous lui devons') + ' (crédits ' + sg(dc) + ' et compte ' + sg(com) + ')</small></div></div>';
    }
    // onglets
    const T = [['releve', 'Relevé de compte'], P.client ? ['ventes', 'Ventes (' + P.ventes.length + ')'] : null, P.four ? ['achats', 'Achats (' + P.achats.length + ')'] : null, ['versements', 'Versements (' + P.pays.length + ')'], ['credits', 'Crédits (' + CR.length + ')'], ['docs', 'Documents (' + P.docs.length + ')']].filter(Boolean);
    if (!T.some(t => t[0] === onglet)) onglet = 'releve';
    h += '<div class="at-tabs pr-tabs">' + T.map(t => '<button type="button" data-prt="' + t[0] + '" class="' + (onglet === t[0] ? 'on' : '') + '">' + t[1] + '</button>').join('') + '</div><div class="pr-body">';
    const table = (head, rows, vide) => rows.length ? '<div class="tw"><table class="iv-tbl"><thead><tr>' + head.map(x => '<th' + (/^n:/.test(x) ? ' class="n"' : '') + '>' + x.replace(/^n:/, '') + '</th>').join('') + '</tr></thead><tbody>' + rows.join('') + '</tbody></table></div>' : '<div class="iv-empty">' + vide + '</div>';
    if (onglet === 'releve') {
      [P.client ? 'client' : null, P.four ? 'fournisseur' : null].filter(Boolean).forEach(s => {
        const L = releve(s), cl = s === 'client';
        h += '<h3>' + (cl ? 'Compte client' : 'Compte fournisseur') + '</h3>' + table(['Date', 'Modèle / opération', 'n:Quantité', 'n:Prix unité', 'n:Prix total', 'n:' + (cl ? 'Versé' : 'Payé'), 'n:Solde', 'Réf.'],
          L.map(x => '<tr><td>' + fd(x.d) + '</td><td>' + (x.qte ? '<b>' + esc(x.op) + '</b>' : esc(x.op)) + '</td><td class="n">' + esc(x.qte || '') + '</td><td class="n">' + (x.pu != null ? money(x.pu) : '') + '</td><td class="n">' + (x.debit ? money(x.debit) : x.qte && x.credit ? '− ' + money(x.credit) : '') + '</td><td class="n">' + (x.credit && !x.qte ? '<span class="py-av">' + money(x.credit) + '</span>' : '') + '</td><td class="n"><b class="' + (x.solde > 0.004 ? 'py-due' : '') + '">' + money(x.solde) + '</b></td><td>' + esc(x.ref) + '</td></tr>'), 'Aucune opération.');
      });
      if (!P.client && !P.four) h += '<div class="iv-empty">Aucune vente ni achat pour ce contact.</div>';
    }
    if (onglet === 'ventes') {
      // bénéfice de chaque vente (prix de vente − coût de la pièce) ; les lignes « Remise » le diminuent
      const ventesB = venteBen();
      h += table(['Date', 'Produit', 'n:Quantité', 'n:Montant', 'n:Bénéfice', 'Réf.'], ventesB.sort((a, b) => String(b.o.date).localeCompare(String(a.o.date))).map(x => '<tr><td>' + fd(x.o.date) + '</td><td>' + esc(x.o.libelle) + '</td><td class="n">' + esc(x.o.qte || '') + '</td><td class="n"><b>' + money(x.o.montant) + '</b></td><td class="n">' + (x.b == null ? '<small>coût non renseigné</small>' : '<b class="' + (x.b < 0 ? 'py-due' : 'py-av') + '">' + money(x.b) + '</b>') + '</td><td>' + esc(x.o.ref || '') + '</td></tr>'), 'Aucune vente.');
      if (P.ben) h += '<p class="iv-help" style="margin-top:10px">Bénéfice total : <b>' + money(P.ben.ben) + '</b> = prix de vente − coût de chaque pièce (prix d’achat ou de fabrication, Stock › Produits finis) − remises. Le coût utilisé est le coût actuel du produit.</p>';
    }
    if (onglet === 'achats') h += table(['Date', 'Article', 'n:Quantité', 'n:Montant', 'Réf.'], P.achats.slice().sort((a, b) => String(b.date).localeCompare(String(a.date))).map(o => '<tr><td>' + fd(o.date) + '</td><td>' + esc(o.libelle) + '</td><td class="n">' + esc(o.qte || '') + '</td><td class="n"><b>' + money(o.montant) + '</b>' + (o.sansPrix ? '<small>sans prix</small>' : '') + '</td><td>' + esc(o.ref || '') + '</td></tr>'), 'Aucun achat.');
    if (onglet === 'versements') h += table(['Date', 'Type', 'n:Montant', 'Mode', 'Réf.', 'Note'], P.pays.slice().sort((a, b) => String(b.date_paiement).localeCompare(String(a.date_paiement))).map(p => '<tr><td>' + fd(p.date_paiement) + '</td><td>' + ({ encaissement: 'Versement reçu', reglement: 'Versement fait', report_client: 'Solde de départ (client)', report_fournisseur: 'Solde de départ (fournisseur)' }[p.sens] || p.sens) + '</td><td class="n"><b>' + money(p.montant) + '</b></td><td>' + esc(MODES[p.mode] || p.mode || '') + '</td><td>' + esc(p.reference || '') + '</td><td>' + esc(p.note || '') + '</td></tr>'), 'Aucun versement.') +
      '<div class="at-actions"><button class="btn p" type="button" data-pr="vers">+ Nouveau versement</button></div>';
    if (onglet === 'credits') h += table(['Date', 'Opération', 'n:Montant', 'Mode', 'Échéance', 'Note'], CR.slice().sort((a, b) => String(b.date_op).localeCompare(String(a.date_op))).map(o => '<tr><td>' + fd(o.date_op) + '</td><td>' + NAT[o.nature][0] + '</td><td class="n"><b>' + money(o.montant) + '</b></td><td>' + esc(MODES[o.mode] || '') + '</td><td>' + fd(o.echeance) + '</td><td>' + esc(o.note || '') + '</td></tr>'), 'Aucun crédit avec ce contact.') +
      '<div class="at-actions"><button class="btn" type="button" data-pr="cred">Ouvrir les crédits</button></div>';
    if (onglet === 'docs') h += table(['Date', 'Document', 'N°', 'n:Total TTC', 'État'], P.docs.map(d => { const t = CommerceAPI.totaux(d, CommerceAPI.lignesDe(d.id)).ttc, e = d.type === 'facture' || d.type === 'bon_livraison' || d.type === 'bon_reception' ? CommerceAPI.etatFacture(d) : null;
      return '<tr class="row" data-prdoc="' + esc(d.id) + '" data-prtype="' + esc(d.type) + '"><td>' + fd(d.date_doc) + '</td><td>' + (TDOC[d.type] || d.type) + '</td><td><b>' + esc(d.numero) + '</b></td><td class="n">' + money(t) + '</td><td>' + (d.statut === 'annulee' ? 'Annulé' : e ? esc(e.l) : esc(d.statut)) + '</td></tr>'; }), 'Aucun document (facture, bon, devis) pour ce contact.');
    return h + '</div>';
  }

  // ventes du contact avec le bénéfice de chacune (même ordre que PartAPI.ops : par mouvement de stock, puis ajustements de documents)
  function venteBen() {
    const prods = window.PFAPI ? new Map(PFAPI.produits().map(p => [String(p.id), p])) : new Map();
    return P.ventes.map(o => {
      if (!o.qte) { const t = P.docs.find(d => d.numero === o.ref); const rem = t ? (CommerceAPI.totaux(t, CommerceAPI.lignesDe(t.id)).remise || 0) : 0; return { o, b: rem ? -rem : null }; }
      const p = [...prods.values()].sort((x, y) => y.nom.length - x.nom.length).find(x => o.libelle.startsWith(x.nom)), c = p ? Number(PFAPI.coutProduit(p)) || 0 : 0, n = parseFloat(String(o.qte).replace(/[^\d,.-]/g, '').replace(',', '.')) || 0;
      return { o, b: c > 0 && n ? r2(o.montant - c * n * (o.montant < 0 ? -1 : 1)) : null };
    });
  }
  function afficher() {
    let bg = $('#pr-bg');
    if (!bg) { bg = document.createElement('div'); bg.id = 'pr-bg'; bg.innerHTML = '<div id="pr-box"></div>'; document.body.appendChild(bg); bg.addEventListener('click', e => { if (e.target === bg) fermer(); }); }
    $('#pr-box').innerHTML = html(); document.body.classList.add('pr-open');
  }
  function fermer() { const bg = $('#pr-bg'); if (bg) bg.remove(); document.body.classList.remove('pr-open'); cur = null; }

  async function ouvrir(id, tab) {
    cur = id; onglet = tab || 'releve';
    P = await charger(id); if (!P) { say('Contact introuvable.'); return; }
    afficher();
  }

  function relevePdf() {
    if (!(window.jspdf && window.jspdf.jsPDF)) { say('Bibliothèque PDF non chargée.'); return; }
    const doc = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4' }), W = doc.internal.pageSize.getWidth(), M = 14, c = P.c;
    if (typeof LOGO_PDF !== 'undefined' && LOGO_PDF) doc.addImage(LOGO_PDF, 'PNG', M, 9, 20, 20);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.text(pdfT('RELEVE DE COMPTE'), W - M, 16, { align: 'right' });
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.text(pdfT('Edite le ' + fd(new Date().toISOString())), W - M, 22, { align: 'right' });
    doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.text(pdfT(lbl(c)), M, 38); doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.text(pdfT([c.type, c.ville, c.tel].filter(Boolean).join('  -  ')), M, 43);
    let y = 50;
    [P.client ? 'client' : null, P.four ? 'fournisseur' : null].filter(Boolean).forEach(s => {
      const L = releve(s), cl = s === 'client';
      doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.text(pdfT(cl ? 'Compte client' : 'Compte fournisseur'), M, y);
      doc.autoTable({ startY: y + 3, margin: { left: M, right: M }, head: [['Date', 'Modele / operation', 'Qte', 'Prix unite', 'Prix total', cl ? 'Verse' : 'Paye', 'Solde'].map(pdfT)],
        body: L.map(x => [fd(x.d), x.op + (x.ref ? ' (' + x.ref + ')' : ''), x.qte || '', x.pu != null ? money(x.pu) : '', x.debit ? money(x.debit) : x.qte && x.credit ? '- ' + money(x.credit) : '', x.credit && !x.qte ? money(x.credit) : '', money(x.solde)].map(pdfT)), theme: 'grid',
        styles: { fontSize: 8.5, cellPadding: 2 }, headStyles: { fillColor: [0, 0, 0], textColor: 255 }, columnStyles: { 0: { cellWidth: 19 }, 2: { halign: 'right', cellWidth: 16 }, 3: { halign: 'right', cellWidth: 22 }, 4: { halign: 'right', cellWidth: 25 }, 5: { halign: 'right', cellWidth: 24 }, 6: { halign: 'right', cellWidth: 25 } } });
      y = doc.lastAutoTable.finalY + 7;
      const fin = L.length ? L[L.length - 1].solde : 0;
      doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.text(pdfT((cl ? (fin >= 0 ? 'Reste du a MARIA BAG : ' : 'Avance du client : ') : (fin >= 0 ? 'Reste a payer par MARIA BAG : ' : 'Avance au fournisseur : ')) + money(Math.abs(fin))), W - M, y, { align: 'right' });
      y += 12;
    });
    doc.save('releve-' + String(lbl(c)).replace(/[^A-Za-z0-9]+/g, '-').slice(0, 40) + '.pdf');
  }

  document.addEventListener('click', async e => {
    const box = $('#pr-box'); if (!box || !box.contains(e.target)) return;
    const t = e.target.closest('[data-prt]'); if (t) { onglet = t.dataset.prt; afficher(); return; }
    const d = e.target.closest('[data-prdoc]'); if (d) { const id = d.dataset.prdoc; fermer(); if (typeof show === 'function') show('commerce'); setTimeout(() => { const tb = document.querySelector('#cm-tabs [data-t="' + d.dataset.prtype + '"]'); if (tb) tb.click(); setTimeout(() => { const r = document.querySelector('#cm-root tr[data-open="' + id + '"]'); if (r) r.click(); }, 150); }, 150); return; }
    const b = e.target.closest('[data-pr]'); if (!b) return;
    const a = b.dataset.pr;
    if (a === 'close') return fermer();
    if (a === 'pdf') return relevePdf();
    if (a === 'edit') { const id = cur; fermer(); if (typeof edit === 'function') edit(id); return; }
    if (a === 'vers' || a === 'cred') { fermer(); if (typeof show === 'function') show('commerce'); setTimeout(() => { const tb = document.querySelector('#cm-tabs [data-t="' + (a === 'vers' ? 'versements' : 'credits') + '"]'); if (tb) tb.click(); }, 150); return; }
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && $('#pr-bg')) fermer(); });

  window.ouvrirProfil = ouvrir;
})();
