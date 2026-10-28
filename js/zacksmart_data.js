/* ============================================================
   ZACKsmart : données réelles de la plateforme (clients, soldes, factures, commandes, employés)
   transmises à l'assistant UNIQUEMENT quand la question concerne le sujet (le stock est géré dans zacksmart.js).
   Les salaires ne sont transmis qu'à l'administrateur (ou sans compte, avec l'ancien mot de passe).
   ============================================================ */
(function () {
  'use strict';
  const nz = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  const f2 = n => (Math.round((Number(n) || 0) * 100) / 100).toLocaleString('fr-FR').replace(/[  ]/g, ' ');
  const fd = s => s ? String(s).slice(0, 10).split('-').reverse().join('/') : '';
  const STOP = new Set(['combien', 'quel', 'quelle', 'quels', 'quelles', 'les', 'des', 'une', 'que', 'pour', 'dans', 'avec', 'mon', 'mes', 'est', 'sont', 'qui', 'moi', 'donne', 'dis', 'liste', 'tout', 'tous', 'toutes', 'sur', 'plus', 'moins', 'mois', 'jai', 'doit', 'doivent', 'reste', 'total', 'etat', 'client', 'clients', 'facture', 'factures', 'commande', 'commandes', 'employe', 'employes', 'salaire', 'salaires', 'solde', 'soldes', 'contact', 'contacts', 'fournisseur', 'fournisseurs', 'vente', 'ventes', 'paie', 'cette', 'cet', 'ses', 'son', 'leur', 'leurs', 'chiffre', 'affaires', 'quand', 'comment', 'faire', 'est-ce', 'peux', 'veux', 'voir', 'avoir', 'faut', 'merci', 'bonjour', 'salut']);
  const TOP = {
    contacts: /(client|fournisseur|contact|societe|prospect|solde|credit|dette|doit|doivent|impay|creance|encaiss|reglement|paiement|meilleur|telephone|numero)/,
    factures: /(facture|devis|bon de commande|vente|chiffre d affaires|\bca\b|impay|reste a payer|paye|encaiss)/,
    commandes: /(commande|production|livraison|livrer|retard|atelier|facon|delai|marge)/,
    employes: /(salaire|paie|employe|pointage|heure|acompte|absent|absence|credit perso|couturier|ouvrier|equipe|retenue)/
  };
  const lim = (s, n) => s.length > n ? s.slice(0, n - 20).replace(/\n[^\n]*$/, '') + '\n(… liste tronquée)' : s;
  const lbl = c => window.PartAPI ? PartAPI.label(c) : (c.societe || [c.prenom, c.nom].filter(Boolean).join(' '));
  const toks = q => nz(q).split(' ').filter(w => w.length >= 3 && !STOP.has(w));
  const matchTxt = (tk, txt) => { const h = nz(txt); return tk.some(t => h.includes(t) || (t.length > 4 && h.includes(t.slice(0, -1)))); };
  /* Tolérance aux fautes de frappe : « bougofa » trouve « Bougoffa » */
  function lev(a, b) { if (a === b) return 0; const m = a.length, n = b.length; if (!m || !n) return Math.max(m, n); let p = Array.from({ length: n + 1 }, (_, j) => j);
    for (let i = 1; i <= m; i++) { const c = [i]; for (let j = 1; j <= n; j++) c[j] = Math.min(p[j] + 1, c[j - 1] + 1, p[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); p = c; } return p[n]; }
  const flou = (tk, txt) => { const mots = nz(txt).split(' ').filter(Boolean); return tk.some(t => mots.some(w => w === t || (t.length >= 4 && (w.startsWith(t) || t.startsWith(w) && w.length >= 4)) || (t.length >= 5 && w.length >= 4 && lev(t, w) <= (t.length >= 8 ? 2 : 1)))); };
  const contactsAll = () => (typeof D !== 'undefined' && Array.isArray(D)) ? D : [];
  const admin = () => { const u = window.APP_USER; return !u || u.role === 'admin'; };   // sans compte (ancien mot de passe) : pas de rôle connu

  async function chargerCommerce() {
    try { if (window.CommerceAPI && CommerceAPI.docs && !CommerceAPI.docs().length && navigator.onLine && Date.now() - (chargerCommerce.t || 0) > 60000) { chargerCommerce.t = Date.now(); await CommerceAPI.load(); } } catch (e) { /* on continue avec ce qui est chargé */ }
  }

  function sectionContacts(tk) {
    const all = contactsAll(); let t = '== CONTACTS ET SOLDES ==\n';
    const nb = {}; all.forEach(c => { nb[c.type || 'Autre'] = (nb[c.type || 'Autre'] || 0) + 1; });
    t += 'Contacts : ' + all.length + ' (' + Object.keys(nb).map(k => nb[k] + ' ' + k).join(', ') + ').\n';
    const sol = v => { try { return window.PayAPI ? PayAPI.soldes(v) : []; } catch (e) { return []; } };
    const cl = sol('client').filter(x => x.solde > 0.004), fo = sol('fournisseur').filter(x => x.solde > 0.004);
    if (cl.length) t += 'Clients qui doivent de l\'argent (total à encaisser : ' + f2(cl.reduce((s, x) => s + x.solde, 0)) + ' DA) :\n' + cl.slice(0, 15).map(x => '- ' + x.nom + ' : vendu ' + f2(x.facture + x.report) + ' DA, payé ' + f2(x.paye) + ' DA, SOLDE DÛ ' + f2(x.solde) + ' DA').join('\n') + '\n';
    else t += 'Soldes clients (livraisons moins encaissements) : aucun solde dû enregistré ; regarde aussi la section FACTURES pour les factures impayées.\n';
    if (fo.length) t += 'Fournisseurs à payer (total : ' + f2(fo.reduce((s, x) => s + x.solde, 0)) + ' DA) :\n' + fo.slice(0, 10).map(x => '- ' + x.nom + ' : acheté ' + f2(x.facture + x.report) + ' DA, payé ' + f2(x.paye) + ' DA, reste à payer ' + f2(x.solde) + ' DA').join('\n') + '\n';
    const m = tk.length ? all.filter(c => flou(tk, [lbl(c), c.nom, c.prenom, c.societe].join(' '))).slice(0, 6) : [];
    if (m.length) t += 'Contacts correspondant à la question :\n' + m.map(c => '- ' + lbl(c) + ' (' + (c.type || '') + (c.statut ? ', ' + c.statut : '') + ')' + (c.tel ? ' — tél ' + c.tel : '') + (c.email ? ' — ' + c.email : '') + (c.ville ? ' — ' + c.ville : '') + (c.notes ? ' — notes : ' + String(c.notes).slice(0, 120) : '')).join('\n') + '\n';
    return lim(t, 3000);
  }

  /* Détail complet d'un contact (pour personnaliser un message) */
  const fiche = c => '- ' + [c.prenom, c.nom].filter(Boolean).join(' ') + (c.poste ? ' — poste : ' + c.poste : '') + (c.societe ? ' — société : ' + c.societe : '') + ' — type : ' + (c.type || '?') + (c.statut ? ' — statut : ' + c.statut : '') +
    (c.tel ? ' — tél : ' + c.tel : '') + (c.email ? ' — e-mail : ' + c.email : '') + (c.ville ? ' — ville : ' + c.ville : '') + (c.produits ? ' — produits d\'intérêt : ' + c.produits : '') + (c.source ? ' — source : ' + c.source : '') + (c.derniere ? ' — dernière action : ' + fd(c.derniere) : '') + (c.notes ? ' — notes : ' + String(c.notes).slice(0, 200) : '');
  function sectionContactsMessage(q, tk) {
    const all = contactsAll(); if (!all.length) return '';
    const m = tk.length ? all.filter(c => flou(tk, [c.nom, c.prenom, c.societe].join(' '))).slice(0, 4) : [];
    const veutFour = /fournisseur/.test(q), veutCli = /client/.test(q);
    let t = '== CONTACTS ENREGISTRÉS (pour rédiger le message) ==\nCONSIGNE : le destinataire se trouve dans cette liste. Utilise ses informations RÉELLES (prénom et nom, poste, société, produits d\'intérêt, notes) pour personnaliser la salutation et le contenu du message. Ne dis JAMAIS que tu n\'as pas accès aux contacts. Si le nom demandé ne correspond exactement à personne, propose les contacts les plus proches ci-dessous ou rédige avec [crochets].\n';
    if (m.length) t += 'Contact(s) correspondant à la demande :\n' + m.map(fiche).join('\n') + '\n';
    const pool = all.filter(c => !m.includes(c) && (!(veutFour || veutCli) || (veutFour && /fournisseur/i.test(c.type || '')) || (veutCli && /client/i.test(c.type || '')))).slice(0, m.length ? 15 : 35);
    if (pool.length) t += (m.length ? 'Autres contacts' : 'Annuaire') + (veutFour ? ' (fournisseurs)' : veutCli ? ' (clients)' : '') + ' :\n' + pool.map(c => '- ' + [c.prenom, c.nom].filter(Boolean).join(' ') + (c.societe ? ' — ' + c.societe : '') + ' (' + (c.type || '?') + (c.ville ? ', ' + c.ville : '') + ')').join('\n') + '\n';
    return lim(t, 3300);
  }

  function sectionFactures(tk) {
    if (!window.CommerceAPI || !CommerceAPI.docs) return '';
    const docs = CommerceAPI.docs(), ttc = d => CommerceAPI.totaux(d, CommerceAPI.lignesDe(d.id)).ttc;
    const fac = docs.filter(d => d.type === 'facture' && d.statut !== 'annulee').sort((a, b) => String(b.date_doc).localeCompare(String(a.date_doc)));
    let t = '== FACTURES ET VENTES ==\n';
    if (!fac.length) return t + 'Aucune facture enregistrée dans la plateforme.\n';
    const an = new Date().getFullYear(), mois = new Date().toISOString().slice(0, 7);
    const sum = l => l.reduce((s, d) => s + ttc(d), 0), imp = fac.map(d => ({ d, e: CommerceAPI.etatFacture(d) })).filter(x => (x.e.reste || 0) > 0.004);
    t += 'Factures : ' + fac.length + ' ; facturé en ' + an + ' : ' + f2(sum(fac.filter(d => String(d.date_doc).startsWith(String(an))))) + ' DA TTC ; ce mois-ci : ' + f2(sum(fac.filter(d => String(d.date_doc).startsWith(mois)))) + ' DA TTC.\n';
    t += 'Impayées ou partiellement payées : ' + imp.length + ', reste à encaisser ' + f2(imp.reduce((s, x) => s + x.e.reste, 0)) + ' DA.\n';
    const m = tk.length ? fac.filter(d => matchTxt(tk, [d.contact_nom, d.numero].join(' '))) : [];
    const sel = (m.length ? m : fac).slice(0, m.length ? 25 : 18);
    t += (m.length ? 'Factures correspondant à la question :\n' : 'Dernières factures :\n') + sel.map(d => { const e = CommerceAPI.etatFacture(d); return '- ' + d.numero + ' · ' + fd(d.date_doc) + ' · ' + (d.contact_nom || 'client ?') + ' · ' + f2(ttc(d)) + ' DA TTC · payé ' + f2(e.p || 0) + ' · reste ' + f2(e.reste || 0) + ' · ' + e.l + (d.echeance ? ' · échéance ' + fd(d.echeance) : ''); }).join('\n') + '\n';
    const dv = docs.filter(d => d.type === 'devis' && d.statut !== 'annulee').sort((a, b) => String(b.date_doc).localeCompare(String(a.date_doc))).slice(0, 6);
    if (dv.length) t += 'Derniers devis :\n' + dv.map(d => '- ' + d.numero + ' · ' + fd(d.date_doc) + ' · ' + (d.contact_nom || 'client ?') + ' · ' + f2(ttc(d)) + ' DA TTC').join('\n') + '\n';
    return lim(t, 3200);
  }

  function sectionCommandes(tk) {
    let t = '== COMMANDES ET PRODUCTIONS ==\n';
    const cmds = (typeof COMMANDES !== 'undefined') ? COMMANDES : [], prods = (typeof PRODUCTIONS !== 'undefined') ? PRODUCTIONS : [];
    const ouv = c => c.statut !== 'Reçue' && c.statut !== 'Annulée';
    const m = tk.length ? cmds.filter(c => matchTxt(tk, [c.commande_numero, c.modele_nom, c.contact_nom].join(' '))) : [];
    const lst = (m.length ? m : cmds.filter(ouv)).slice(0, 20);
    t += 'Commandes : ' + cmds.length + ' en tout, ' + cmds.filter(ouv).length + ' à livrer/en cours.\n';
    if (lst.length) t += (m.length ? 'Commandes correspondant à la question :\n' : 'Commandes en cours :\n') + lst.map(c => '- ' + (c.commande_numero || '—') + ' · ' + (c.modele_nom || '') + ' · client ' + (c.contact_nom && c.contact_nom !== 'N/A' ? c.contact_nom : 'non indiqué') + ' · ' + (Number(c.quantite_recue) || 0) + '/' + (Number(c.quantite_commandee) || 0) + ' livrées · ' + (c.statut || '') + (c.date_reception_prevue ? ' · prévue le ' + fd(c.date_reception_prevue) : '') +
      (Number(c.prix_unitaire) > 0 ? ' · vente ' + f2(c.prix_unitaire) + ' DA/pc' : '') + (Number(c.cout_unitaire) > 0 ? ' · coût ' + f2(c.cout_unitaire) + ' DA/pc' : '') + (Number(c.prix_unitaire) > 0 && Number(c.cout_unitaire) > 0 ? ' · marge ' + f2((c.prix_unitaire - c.cout_unitaire) * (Number(c.quantite_commandee) || 0)) + ' DA' : '')).join('\n') + '\n';
    const act = prods.filter(p => p.statut !== 'Terminée' && p.statut !== 'Annulée' && !p.date_reception_reelle).slice(0, 12);
    t += 'Productions en cours : ' + act.length + '.\n' + act.map(p => '- ' + p.modele_nom + ' · atelier ' + (p.atelier_nom || '?') + ' · ' + (Number(p.quantite_lancee) || 0) + ' pièces · ' + (p.statut || '') + (p.date_reception_prevue ? ' · prévue le ' + fd(p.date_reception_prevue) : '') + (Number(p.prix_facon) > 0 ? ' · façon ' + f2(p.prix_facon) + ' DA/pc' : '')).join('\n') + '\n';
    return lim(t, 3000);
  }

  function sectionEmployes(tk) {
    if (!admin()) return '== EMPLOYÉS ==\nLes salaires sont réservés à l\'administrateur : tu n\'as pas le droit de donner de chiffres de paie. Dis-le poliment.\n';
    if (typeof EMPLOYES === 'undefined' || !EMPLOYES.length) return '== EMPLOYÉS ==\nAucun employé enregistré.\n';
    const mois = (typeof curMonth === 'function') ? curMonth() : new Date().toISOString().slice(0, 7);
    const m = tk.length ? EMPLOYES.filter(e => matchTxt(tk, [e.nom, e.prenom, e.poste].join(' '))) : [];
    const lst = (m.length ? m : EMPLOYES).slice(0, 25);
    let t = '== EMPLOYÉS (mois affiché dans la page Employés : ' + mois + ') ==\nRÈGLE ABSOLUE : « le salaire » d\'un employé = SALAIRE FINAL À PAYER = paie des heures normales (jusqu\'à 19h) − acomptes − retenue de crédit personnel. Les heures supplémentaires sont gardées à part par l\'employeur : ne les ajoute JAMAIS au salaire et ne calcule aucun « total brut » avec elles. Donne en premier le SALAIRE FINAL.\n';
    let tot = { po: 0, ps: 0, reste: 0, cred: 0, sup: 0 };
    const ligne = e => { const po = paieOrdinaire(e, mois), ps = paieSup(e, mois), ac = totalAcomptes(e.id, mois), rt = retenueMois(e.id, mois), reste = resteSalaire(e, mois), cred = soldeCredit(e.id), sup = soldeSup(e), hn = heuresNormales(e, mois), hs = heuresSup(e, mois), j = joursTravailles(e.id, mois);
      return '- ' + e.nom + ' ' + (e.prenom || '') + (e.poste ? ' (' + e.poste + ')' : '') + ' : SALAIRE FINAL À PAYER ' + f2(reste) + ' DA = paie des heures normales ' + f2(po) + ' DA (' + f2(hn) + ' h × ' + f2(e.taux_horaire) + ' DA/h, ' + j + ' jours travaillés) − acomptes ' + f2(ac) + ' DA' + (rt > 0 ? ' − retenue crédit personnel ' + f2(rt) + ' DA' : '') +
        ' ‖ à part, NON inclus dans le salaire : heures sup du mois ' + f2(hs) + ' h (' + f2(ps) + ' DA mis de côté), heures sup cumulées à remettre ' + f2(sup) + ' DA ‖ crédit personnel restant à rembourser ' + f2(cred) + ' DA'; };
    EMPLOYES.forEach(e => { try { tot.po += paieOrdinaire(e, mois); tot.ps += paieSup(e, mois); tot.reste += resteSalaire(e, mois); tot.cred += Math.max(0, soldeCredit(e.id)); tot.sup += Math.max(0, soldeSup(e)); } catch (x) { /* ignoré */ } });
    t += lst.map(e => { try { return ligne(e); } catch (x) { return '- ' + e.nom + ' : calcul indisponible'; } }).join('\n') + '\n';
    t += 'TOTAUX de tous les employés (' + EMPLOYES.length + ') : salaires finaux à payer ' + f2(tot.reste) + ' DA (paie des heures normales ' + f2(tot.po) + ' DA moins acomptes et retenues) ; à part : heures sup du mois ' + f2(tot.ps) + ' DA, heures sup cumulées à remettre ' + f2(tot.sup) + ' DA ; crédits personnels à rembourser ' + f2(tot.cred) + ' DA.\n';
    return lim(t, 3600);
  }

  async function contexte(question) {
    try {
      const q = nz(question), tk = toks(question), want = {};
      Object.keys(TOP).forEach(k => { want[k] = TOP[k].test(q); });
      // un nom propre cité (client, employé) déclenche le sujet correspondant
      if (tk.length) {
        if (contactsAll().some(c => flou(tk, [c.nom, c.prenom, c.societe].join(' ')))) want.contacts = true;
        if (typeof EMPLOYES !== 'undefined' && EMPLOYES.some(e => matchTxt(tk, [e.nom, e.prenom].join(' ')))) want.employes = true;
        if (typeof COMMANDES !== 'undefined' && COMMANDES.some(c => c.commande_numero && q.includes(nz(c.commande_numero)))) want.commandes = true;
      }
      if (want.contacts && /(doit|doivent|impay|creance|solde|dette|reste|retard)/.test(q)) want.factures = true;   // « qui me doit de l'argent ? » : soldes ET factures
      const ecrire = /(ecri|redig|message|e-?mail|\bmail\b|whatsapp|\bsms\b|relanc|contacter|envoy|courrier|devis a)/.test(q);
      const dest = /(fournisseur|client|societe|contact|prospect|entreprise)/.test(q) || (tk.length && contactsAll().some(c => flou(tk, [c.nom, c.prenom, c.societe].join(' '))));
      if (ecrire && dest) { want.contacts = false; want.msgContact = true; }
      if (!want.msgContact && !want.contacts && !want.factures && !want.commandes && !want.employes) return '';
      if (want.factures || want.contacts) await chargerCommerce();
      let t = '';
      if (want.msgContact) t += sectionContactsMessage(q, tk) + '\n';
      if (want.contacts) t += sectionContacts(tk) + '\n';
      if (want.factures) t += sectionFactures(tk) + '\n';
      if (want.commandes) t += sectionCommandes(tk) + '\n';
      if (want.employes) t += sectionEmployes(tk) + '\n';
      return t;
    } catch (e) { return ''; }
  }
  window.ZSData = { contexte };
})();
