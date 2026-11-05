/* ============================================================
   ZACKsmart : données réelles de toute la plateforme (clients, soldes, factures, commandes, paie par jour ou par mois, charges, ateliers, rendez-vous, notes, coût des produits, inventaire, bilan)
   transmises à l'assistant UNIQUEMENT quand la question concerne le sujet (le stock est géré dans zacksmart.js).
   Les salaires ne sont transmis qu'à l'administrateur (ou sans compte, avec l'ancien mot de passe).
   ============================================================ */
(function () {
  'use strict';
  const nz = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  const f2 = n => (Math.round((Number(n) || 0) * 100) / 100).toLocaleString('fr-FR').replace(/[  ]/g, ' ');
  const fd = s => s ? String(s).slice(0, 10).split('-').reverse().join('/') : '';
  const STOP = new Set(['combien', 'quel', 'quelle', 'quels', 'quelles', 'les', 'des', 'une', 'que', 'pour', 'dans', 'avec', 'mon', 'mes', 'est', 'sont', 'qui', 'moi', 'donne', 'dis', 'liste', 'tout', 'tous', 'toutes', 'sur', 'plus', 'moins', 'mois', 'jai', 'doit', 'doivent', 'reste', 'total', 'etat', 'client', 'clients', 'facture', 'factures', 'commande', 'commandes', 'employe', 'employes', 'salaire', 'salaires', 'solde', 'soldes', 'contact', 'contacts', 'fournisseur', 'fournisseurs', 'vente', 'ventes', 'paie', 'cette', 'cet', 'ses', 'son', 'leur', 'leurs', 'chiffre', 'affaires', 'quand', 'comment', 'faire', 'est-ce', 'peux', 'veux', 'voir', 'avoir', 'faut', 'merci', 'bonjour', 'salut', 'salarie', 'salaries', 'salairies', 'employets', 'extrait', 'affiches', 'affiche', 'combient', 'journee']);
  const TOP = {
    contacts: /(client|fournisseur|contact|societe|prospect|solde|credit|dette|doit|doivent|impay|creance|encaiss|reglement|paiement|meilleur|telephone|numero)/,
    factures: /(facture|devis|bon de commande|vente|chiffre d affaires|\bca\b|impay|reste a payer|paye|encaiss)/,
    commandes: /(commande|production|livraison|livrer|retard|atelier|facon|delai|marge)/,
    employes: /(salair|salari|\bpaie\b|\bpaye\b|employe|employ|pointage|pointe|heure|acompte|absent|absence|credit perso|couturier|ouvrier|equipe|retenue|personnel|travailleur|main d oeuvre)/
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
    const sol = v => { try { return window.PayAPI ? PayAPI.soldes(v) : []; } catch (e) { return []; } };
    const sc = sol('client'), sf = sol('fournisseur');
    const m = tk.length ? all.filter(c => flou(tk, [c.nom, c.prenom, c.societe].join(' '))).slice(0, 5) : [];
    // le contact demandé EN PREMIER (la fin du texte est tronquée si la liste est longue)
    if (m.length) {
      t += 'CONTACT(S) TROUVÉ(S) dans la plateforme — réponds avec ces informations exactes (ne dis jamais qu\'il est introuvable) :\n' + m.map(c => {
        const x = sc.concat(sf).find(y => String(y.id) === String(c.id)), solde = x ? ' — solde : ' + (x.solde > 0.004 ? (/client/i.test(c.type || '') ? 'DOIT ' : 'nous lui devons ') + f2(x.solde) + ' DA (vendu/acheté ' + f2(x.facture + x.report) + ' DA, payé ' + f2(x.paye) + ' DA)' : 'à jour (0 DA)') : '';
        return fiche(c) + solde; }).join('\n') + '\n';
    }
    const nb = {}; all.forEach(c => { nb[c.type || 'Autre'] = (nb[c.type || 'Autre'] || 0) + 1; });
    t += 'Contacts : ' + all.length + ' (' + Object.keys(nb).map(k => nb[k] + ' ' + k).join(', ') + ').\n';
    const nbS = m.length ? 5 : 15;
    const cl = sc.filter(x => x.solde > 0.004), fo = sf.filter(x => x.solde > 0.004);
    if (cl.length) t += 'Clients qui doivent de l\'argent (total à encaisser : ' + f2(cl.reduce((s, x) => s + x.solde, 0)) + ' DA) :\n' + cl.slice(0, nbS).map(x => '- ' + x.nom + ' : vendu ' + f2(x.facture + x.report) + ' DA, payé ' + f2(x.paye) + ' DA, SOLDE DÛ ' + f2(x.solde) + ' DA').join('\n') + '\n';
    else t += 'Soldes clients (livraisons moins encaissements) : aucun solde dû enregistré ; regarde aussi la section FACTURES pour les factures impayées.\n';
    if (fo.length) t += 'Fournisseurs à payer (total : ' + f2(fo.reduce((s, x) => s + x.solde, 0)) + ' DA) :\n' + fo.slice(0, m.length ? 4 : 10).map(x => '- ' + x.nom + ' : acheté ' + f2(x.facture + x.report) + ' DA, payé ' + f2(x.paye) + ' DA, reste à payer ' + f2(x.solde) + ' DA').join('\n') + '\n';
    return lim(t, 3300);
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

  function sectionFactures(tk, strict) {
    if (!window.CommerceAPI || !CommerceAPI.docs) return '';
    const docs = CommerceAPI.docs(), ttc = d => CommerceAPI.totaux(d, CommerceAPI.lignesDe(d.id)).ttc;
    const fac = docs.filter(d => d.type === 'facture' && d.statut !== 'annulee').sort((a, b) => String(b.date_doc).localeCompare(String(a.date_doc)));
    let t = '== FACTURES ET VENTES ==\n';
    if (!fac.length) return t + 'Aucune facture enregistrée dans la plateforme.\n';
    const an = new Date().getFullYear(), mois = new Date().toISOString().slice(0, 7);
    const sum = l => l.reduce((s, d) => s + ttc(d), 0), imp = fac.map(d => ({ d, e: CommerceAPI.etatFacture(d) })).filter(x => (x.e.reste || 0) > 0.004);
    t += 'Factures : ' + fac.length + ' ; facturé en ' + an + ' : ' + f2(sum(fac.filter(d => String(d.date_doc).startsWith(String(an))))) + ' DA TTC ; ce mois-ci : ' + f2(sum(fac.filter(d => String(d.date_doc).startsWith(mois)))) + ' DA TTC.\n';
    t += 'Impayées ou partiellement payées : ' + imp.length + ', reste à encaisser ' + f2(imp.reduce((s, x) => s + x.e.reste, 0)) + ' DA.\n';
    const m = tk.length ? fac.filter(d => flou(tk, [d.contact_nom, d.numero].join(' '))) : [];
    if (strict && !m.length) return t + 'Aucune facture enregistrée pour ce contact.\n';
    const sel = (m.length ? m : fac).slice(0, m.length ? 25 : 18);
    t += (m.length ? 'Factures correspondant à la question :\n' : 'Dernières factures :\n') + sel.map(d => { const e = CommerceAPI.etatFacture(d); return '- ' + d.numero + ' · ' + fd(d.date_doc) + ' · ' + (d.contact_nom || 'client ?') + ' · ' + f2(ttc(d)) + ' DA TTC · payé ' + f2(e.p || 0) + ' · reste ' + f2(e.reste || 0) + ' · ' + e.l + (d.echeance ? ' · échéance ' + fd(d.echeance) : ''); }).join('\n') + '\n';
    const dv = docs.filter(d => d.type === 'devis' && d.statut !== 'annulee').sort((a, b) => String(b.date_doc).localeCompare(String(a.date_doc))).slice(0, 6);
    if (dv.length) t += 'Derniers devis :\n' + dv.map(d => '- ' + d.numero + ' · ' + fd(d.date_doc) + ' · ' + (d.contact_nom || 'client ?') + ' · ' + f2(ttc(d)) + ' DA TTC').join('\n') + '\n';
    return lim(t, 3200);
  }

  function sectionCommandes(tk, strict) {
    let t = '== COMMANDES ET PRODUCTIONS ==\n';
    const cmds = (typeof COMMANDES !== 'undefined') ? COMMANDES : [], prods = (typeof PRODUCTIONS !== 'undefined') ? PRODUCTIONS : [];
    const ouv = c => c.statut !== 'Reçue' && c.statut !== 'Annulée';
    const m = tk.length ? cmds.filter(c => flou(tk, [c.commande_numero, c.modele_nom, c.contact_nom].join(' '))) : [];
    if (strict && !m.length) return t + 'Aucune commande enregistrée pour ce contact.\n';
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
      return '- ' + e.nom + ' ' + (e.prenom || '') + (e.poste ? ' (' + e.poste + ')' : '') + ' : SALAIRE FINAL À PAYER ' + f2(reste) + ' DA = paie des heures normales ' + f2(po) + ' DA (' + f2(hn) + ' h × ' + f2(typeof tauxNormal === 'function' ? tauxNormal(e, mois) : e.taux_horaire) + ' DA/h' + (Number(e.salaire_mensuel) > 0 ? ' [salaire mensuel ' + f2(e.salaire_mensuel) + ' DA pour un mois complet]' : '') + ', ' + j + ' jours travaillés) − acomptes ' + f2(ac) + ' DA' + (rt > 0 ? ' − retenue crédit personnel ' + f2(rt) + ' DA' : '') +
        ' ‖ à part, NON inclus dans le salaire : heures sup du mois ' + f2(hs) + ' h (' + f2(ps) + ' DA mis de côté), heures sup cumulées à remettre ' + f2(sup) + ' DA ‖ crédit personnel restant à rembourser ' + f2(cred) + ' DA'; };
    EMPLOYES.forEach(e => { try { tot.po += paieOrdinaire(e, mois); tot.ps += paieSup(e, mois); tot.reste += resteSalaire(e, mois); tot.cred += Math.max(0, soldeCredit(e.id)); tot.sup += Math.max(0, soldeSup(e)); } catch (x) { /* ignoré */ } });
    t += lst.map(e => { try { return ligne(e); } catch (x) { return '- ' + e.nom + ' : calcul indisponible'; } }).join('\n') + '\n';
    t += 'TOTAUX de tous les employés (' + EMPLOYES.length + ') : salaires finaux à payer ' + f2(tot.reste) + ' DA (paie des heures normales ' + f2(tot.po) + ' DA moins acomptes et retenues) ; à part : heures sup du mois ' + f2(tot.ps) + ' DA, heures sup cumulées à remettre ' + f2(tot.sup) + ' DA ; crédits personnels à rembourser ' + f2(tot.cred) + ' DA.\n';
    return lim(t, 3600);
  }


  /* ---------- Période citée dans la question : jour, semaine, mois ---------- */
  const MOISN = ['janvier', 'fevrier', 'mars', 'avril', 'mai', 'juin', 'juillet', 'aout', 'septembre', 'octobre', 'novembre', 'decembre'];
  const isoD = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const finMois = m => m + '-' + String(new Date(+m.slice(0, 4), +m.slice(5, 7), 0).getDate()).padStart(2, '0');
  const moisTxt = m => MOISN[+m.slice(5, 7) - 1] + ' ' + m.slice(0, 4);
  function periode(question) {
    const q = String(question || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/['’]/g, ' ');
    const now = new Date(), y = now.getFullYear(), jour = (yy, mm, dd) => { const d = new Date(yy, mm - 1, dd); return isNaN(d) || d.getDate() !== dd ? null : { du: isoD(d), au: isoD(d), l: 'le ' + fd(isoD(d)) }; };
    let m = q.match(/\b(\d{4})-(\d{2})-(\d{2})\b/); if (m) { const r = jour(+m[1], +m[2], +m[3]); if (r) return r; }
    m = q.match(/\b(\d{1,2})\s*[\/.\-]\s*(\d{1,2})(?:\s*[\/.\-]\s*(\d{2,4}))?\b/);
    if (m && +m[2] >= 1 && +m[2] <= 12) { const yy = m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : y; const r = jour(yy, +m[2], +m[1]); if (r) return r; }
    m = q.match(new RegExp('\\b(\\d{1,2}|1er)\\s+(' + MOISN.join('|') + ')(?:\\s+(\\d{4}))?'));
    if (m) { const r = jour(m[3] ? +m[3] : y, MOISN.indexOf(m[2]) + 1, m[1] === '1er' ? 1 : +m[1]); if (r) return r; }
    const dec = k => { const d = new Date(now); d.setDate(d.getDate() + k); return { du: isoD(d), au: isoD(d), l: 'le ' + fd(isoD(d)) }; };
    if (/avant[ -]?hier/.test(q)) return dec(-2);
    if (/\bhier\b/.test(q)) return dec(-1);
    if (/aujourd ?hui|\bce jour\b|journee d aujourd|\bauj\b/.test(q)) return dec(0);
    if (/\bdemain\b/.test(q)) return dec(1);
    if (/semaine (derniere|passee|precedente)/.test(q)) { const d = new Date(now); d.setDate(d.getDate() - ((d.getDay() + 1) % 7) - 7); const f = new Date(d); f.setDate(f.getDate() + 6); return { du: isoD(d), au: isoD(f), l: 'la semaine du ' + fd(isoD(d)) + ' au ' + fd(isoD(f)) }; }
    if (/cette semaine|semaine en cours/.test(q)) { const d = new Date(now); d.setDate(d.getDate() - ((d.getDay() + 1) % 7)); return { du: isoD(d), au: isoD(now), l: 'cette semaine (du ' + fd(isoD(d)) + ' au ' + fd(isoD(now)) + ')' }; }
    m = q.match(new RegExp('\\b(' + MOISN.join('|') + ')(?:\\s+(\\d{4}))?'));
    if (m) { const mm = (m[2] || y) + '-' + String(MOISN.indexOf(m[1]) + 1).padStart(2, '0'); return { du: mm + '-01', au: finMois(mm), mois: mm, l: moisTxt(mm) }; }
    if (/mois (dernier|passe|precedent)/.test(q)) { const d = new Date(y, now.getMonth() - 1, 1), mm = isoD(d).slice(0, 7); return { du: mm + '-01', au: finMois(mm), mois: mm, l: moisTxt(mm) }; }
    if (/ce mois|mois en cours|mois actuel/.test(q)) { const mm = isoD(now).slice(0, 7); return { du: mm + '-01', au: finMois(mm), mois: mm, l: moisTxt(mm) }; }
    return null;
  }
  const rows = async (table, col, du, au) => { try { const r = await sb.from(table).select('*').gte(col, du).lte(col, au); return r.error ? [] : (r.data || []); } catch (e) { return []; } };
  const somme = (l, k) => l.reduce((s, x) => s + (Number(x[k]) || 0), 0);
  const hm = t => t ? String(t).slice(0, 5) : '';

  /* ---------- Paie et pointage sur une période (jour = détail par employé) ---------- */
  async function sectionPaiePeriode(P) {
    const unJour = P.du === P.au;
    if (!admin()) return '== PAIE ET POINTAGE (' + P.l + ') ==\nLes salaires sont réservés à l\'administrateur : ne donne aucun chiffre de paie, dis-le poliment.\n';
    if (typeof detail !== 'function' || typeof EMPLOYES === 'undefined') return '';
    const pts = await rows('pointages', 'date_pointage', P.du, P.au), acs = await rows('acomptes', 'date_acompte', P.du, P.au);
    let t = '== PAIE ET POINTAGE DES EMPLOYÉS — ' + P.l + ' ==\nRÈGLE : paie normale = heures normales (jusqu\'à la fin normale, pause de midi déduite) × taux horaire. Les heures sup sont payées À PART (mises de côté) : donne-les séparément, jamais ajoutées à la paie normale, sauf si on te demande explicitement le « coût total ».\n';
    let tn = 0, ts = 0, thn = 0, ths = 0; const lignes = [], absents = [];
    EMPLOYES.forEach(e => {
      const mine = pts.filter(p => String(p.employe_id) === String(e.id));
      let hn = 0, hs = 0, pn = 0, ps = 0, j = 0, abs = 0; const det = [];
      mine.forEach(p => { if (p.absent && !(hrs(p) > 0)) { abs++; return; } const d = detail(p, e); if (d.norm + d.sup <= 0) return; j++; hn += d.norm; hs += d.sup; pn += d.norm * (typeof tauxNormal === 'function' ? tauxNormal(e, p.date_pointage) : Number(e.taux_horaire || 0)); ps += d.sup * tauxSup(e); if (unJour) det.push(hm(p.heure_debut) && hm(p.heure_fin) ? hm(p.heure_debut) + '–' + hm(p.heure_fin) : f2(hrs(p)) + ' h'); });
      const ac = somme(acs.filter(a => String(a.employe_id) === String(e.id)), 'montant');
      if (abs && !j) { absents.push(e.nom); return; }
      if (!j && !ac) return;
      tn += pn; ts += ps; thn += hn; ths += hs;
      const rt = unJour || typeof CREDITS === 'undefined' ? 0 : somme(CREDITS.filter(r => String(r.employe_id) === String(e.id) && r.type === 'retenue' && r.date_op >= P.du && r.date_op <= P.au), 'montant');
      lignes.push('- ' + e.nom + (unJour ? ' (' + (det.join(', ') || '—') + ')' : ' (' + j + ' jour' + (j > 1 ? 's' : '') + ')') + ' : ' + f2(hn) + ' h normales = ' + f2(pn) + ' DA' + (hs > 0 ? ' ; heures sup ' + f2(hs) + ' h = ' + f2(ps) + ' DA (à part)' : '') + (ac ? ' ; acompte' + (unJour ? ' versé ' : 's ') + f2(ac) + ' DA' : '') + (rt ? ' ; retenue crédit ' + f2(rt) + ' DA' : '') + (unJour ? '' : ' ; SALAIRE FINAL À PAYER ' + f2(pn - ac - rt) + ' DA'));
    });
    if (!lignes.length && !absents.length) return t + 'Aucun pointage enregistré pour cette période.\n';
    t += lignes.join('\n') + '\n';
    if (absents.length) t += 'Absents : ' + absents.join(', ') + '.\n';
    t += 'TOTAL ' + P.l + ' (' + lignes.length + ' employé(s) pointé(s)) : PAIE NORMALE ' + f2(tn) + ' DA (' + f2(thn) + ' h) ; heures sup à part ' + f2(ts) + ' DA (' + f2(ths) + ' h) ; coût total de main d\'œuvre si on inclut les heures sup ' + f2(tn + ts) + ' DA ; acomptes versés ' + f2(somme(acs, 'montant')) + ' DA.\n';
    return lim(t, 3200);
  }

  /* ---------- Activité d'une journée ou d'une période (hors paie) ---------- */
  async function sectionActivite(P) {
    const unJour = P.du === P.au;
    const [ch, pay, pfm, pa, rdv] = await Promise.all([rows('charges', 'date_charge', P.du, P.au), rows('paiements', 'date_paiement', P.du, P.au), rows('pf_mouvements', 'date_mvt', P.du, P.au), rows('paiements_ateliers', 'date_paiement', P.du, P.au), rows('rendez_vous', 'date_rdv', P.du, P.au)]);
    let t = '== ACTIVITÉ — ' + P.l + ' ==\n';
    let fx = null; if (unJour && window.ChargesAPI) { try { fx = await ChargesAPI.fixesDuJour(P.du); } catch (e) { fx = null; } }
    const chv = ch.filter(c => !(admin() ? false : c.categorie === 'Paie des employés'));
    t += 'Charges saisies : ' + (chv.length ? f2(somme(chv, 'montant')) + ' DA — ' + chv.slice(0, 10).map(c => (c.libelle || c.categorie || 'charge') + ' ' + f2(c.montant) + ' DA').join(', ') : 'aucune') + (fx && fx.total ? ' ; charges fixes du jour ' + f2(fx.total) + ' DA (' + fx.lignes.map(l => l.libelle + ' ' + f2(l.montant)).join(', ') + ')' : '') + '.\n';
    const enc = pay.filter(x => x.sens === 'encaissement'), reg = pay.filter(x => x.sens !== 'encaissement');
    t += 'Encaissements clients : ' + f2(somme(enc, 'montant')) + ' DA' + (enc.length ? ' (' + enc.slice(0, 8).map(x => (x.contact_nom || '?') + ' ' + f2(x.montant)).join(', ') + ')' : '') + ' ; règlements fournisseurs : ' + f2(somme(reg, 'montant')) + ' DA' + (reg.length ? ' (' + reg.slice(0, 6).map(x => (x.contact_nom || '?') + ' ' + f2(x.montant)).join(', ') + ')' : '') + '.\n';
    if (pa.length) t += 'Paiements aux ateliers : ' + f2(somme(pa.filter(x => x.type !== 'report'), 'montant')) + ' DA (' + pa.filter(x => x.type !== 'report').slice(0, 6).map(x => { const a = (typeof ATELIERS !== 'undefined' ? ATELIERS : []).find(y => String(y.id) === String(x.atelier_id)); return (a ? a.nom : 'atelier') + ' ' + f2(x.montant); }).join(', ') + ').\n';
    if (window.CommerceAPI && CommerceAPI.docs) {
      const fac = CommerceAPI.docs().filter(d => d.type === 'facture' && d.statut !== 'annulee' && d.date_doc >= P.du && d.date_doc <= P.au);
      t += 'Factures émises : ' + fac.length + (fac.length ? ' pour ' + f2(fac.reduce((s, d) => s + CommerceAPI.totaux(d, CommerceAPI.lignesDe(d.id)).ttc, 0)) + ' DA TTC (' + fac.slice(0, 6).map(d => d.numero + ' ' + (d.contact_nom || '')).join(', ') + ')' : '') + '.\n';
    }
    const liv = pfm.filter(m => m.type === 'livraison'), ent = pfm.filter(m => m.type === 'entree');
    if (pfm.length) t += 'Produits finis : ' + somme(ent, 'quantite') + ' pièces entrées en stock, ' + somme(liv, 'quantite') + ' pièces livrées' + (liv.length ? ' (' + liv.slice(0, 6).map(m => (m.client_nom || 'client') + ' ' + m.quantite + ' pcs').join(', ') + ')' : '') + '.\n';
    const prods = typeof PRODUCTIONS !== 'undefined' ? PRODUCTIONS : [];
    const lanc = prods.filter(p => p.date_lancement >= P.du && p.date_lancement <= P.au), recu = prods.filter(p => p.date_reception_reelle && p.date_reception_reelle >= P.du && p.date_reception_reelle <= P.au);
    if (lanc.length || recu.length) t += 'Productions lancées : ' + (lanc.map(p => p.modele_nom + ' ' + p.quantite_lancee + ' pcs (' + (p.atelier_nom || 'atelier') + ')').join(', ') || 'aucune') + ' ; reçues : ' + (recu.map(p => p.modele_nom + ' ' + p.quantite_lancee + ' pcs').join(', ') || 'aucune') + '.\n';
    if (rdv.length) t += 'Rendez-vous : ' + rdv.slice(0, 8).map(r => fd(r.date_rdv) + (r.heure ? ' ' + hm(r.heure) : '') + ' ' + r.titre + (r.contact_nom ? ' avec ' + r.contact_nom : '') + ' [' + r.statut + ']').join(' ; ') + '.\n';
    return lim(t, 2400);
  }

  /* ---------- Charges du mois ---------- */
  async function sectionCharges(P) {
    const mm = P && P.mois ? P.mois : isoD(new Date()).slice(0, 7), du = P ? P.du : mm + '-01', au = P ? P.au : finMois(mm), l = P ? P.l : moisTxt(mm);
    const ch = (await rows('charges', 'date_charge', du, au)).filter(c => admin() || c.categorie !== 'Paie des employés');
    let fx = { total: 0 }; if (window.ChargesAPI && ChargesAPI.moisFixes && (!P || P.mois)) { try { fx = await ChargesAPI.moisFixes(mm); } catch (e) {} }
    const cats = {}; ch.forEach(c => { cats[c.categorie || 'Autre'] = (cats[c.categorie || 'Autre'] || 0) + Number(c.montant || 0); });
    let t = '== CHARGES — ' + l + ' ==\nTotal des charges saisies : ' + f2(somme(ch, 'montant')) + ' DA' + '' + '.\n';
    if (Object.keys(cats).length) t += 'Par catégorie : ' + Object.keys(cats).sort((a, b) => cats[b] - cats[a]).map(k => k + ' ' + f2(cats[k]) + ' DA').join(' ; ') + '.\n';
    const fixes = window.ChargesAPI ? ChargesAPI.list() : [];
    if (fixes.length) t += 'Charges fixes (comptées UNIQUEMENT dans la main d’œuvre des produits, pas dans les charges) : ' + fixes.slice(0, 10).map(f => f.libelle + ' ' + f2(f.montant) + ' DA').join(', ') + '.\n';
    const top = ch.slice().sort((a, b) => Number(b.montant) - Number(a.montant)).slice(0, 10);
    if (top.length) t += 'Plus grosses charges : ' + top.map(c => fd(c.date_charge) + ' ' + (c.libelle || c.categorie) + ' ' + f2(c.montant) + ' DA').join(' ; ') + '.\n';
    return lim(t, 1800);
  }

  /* ---------- Ateliers : productions, façon due, payée, reste ---------- */
  async function sectionAteliers(tk) {
    const ats = typeof ATELIERS !== 'undefined' ? ATELIERS : [], prods = typeof PRODUCTIONS !== 'undefined' ? PRODUCTIONS : [];
    if (!ats.length) return '== ATELIERS ==\nAucun atelier enregistré.\n';
    let pay = []; try { const r = await sb.from('paiements_ateliers').select('*'); pay = r.error ? [] : (r.data || []); } catch (e) {}
    const m = tk.length ? ats.filter(a => flou(tk, a.nom)) : [], lst = m.length ? m : ats;
    let t = '== ATELIERS (sous-traitants payés à la façon) ==\n', tot = { du: 0, paye: 0 };
    t += lst.slice(0, 15).map(a => {
      const ps = prods.filter(p => String(p.atelier_id) === String(a.id) && p.statut !== 'Annulée'), mine = pay.filter(x => String(x.atelier_id) === String(a.id));
      const du = ps.reduce((s, p) => s + (Number(p.prix_facon) || 0) * (Number(p.quantite_lancee) || 0), 0) + somme(mine.filter(x => x.type === 'report'), 'montant'), paye = somme(mine.filter(x => x.type !== 'report'), 'montant');
      tot.du += du; tot.paye += paye;
      const enc = ps.filter(p => p.statut !== 'Terminée' && !p.date_reception_reelle);
      return '- ' + a.nom + (a.responsable ? ' (' + a.responsable + ')' : '') + (a.statut ? ' [' + a.statut + ']' : '') + (a.tel ? ' tél ' + a.tel : '') + ' : ' + ps.length + ' production(s), ' + enc.length + ' en cours (' + enc.reduce((s, p) => s + (Number(p.quantite_lancee) || 0), 0) + ' pcs) ; façon due ' + f2(du) + ' DA, payé ' + f2(paye) + ' DA, RESTE À PAYER ' + f2(du - paye) + ' DA' +
        (m.length ? '\n  Productions : ' + ps.slice(0, 8).map(p => p.modele_nom + ' ' + p.quantite_lancee + ' pcs · ' + p.statut + ' · lancée ' + fd(p.date_lancement) + (p.date_reception_prevue ? ' · prévue ' + fd(p.date_reception_prevue) : '') + (Number(p.prix_facon) ? ' · façon ' + f2(p.prix_facon) + ' DA/pc' : ' · façon non renseignée')).join(' | ') : '');
    }).join('\n') + '\n';
    if (!m.length) t += 'TOTAL ateliers : dû ' + f2(tot.du) + ' DA, payé ' + f2(tot.paye) + ' DA, reste à payer ' + f2(tot.du - tot.paye) + ' DA.\n';
    return lim(t, 2400);
  }

  /* ---------- Notes : rendez-vous et notes personnelles ---------- */
  async function sectionNotes(tk) {
    const today = isoD(new Date());
    let rdv = [], np = [];
    try { const r = await sb.from('rendez_vous').select('*').order('date_rdv', { ascending: true }); rdv = r.error ? [] : (r.data || []); } catch (e) {}
    try { const r = await sb.from('notes_perso').select('*'); np = r.error ? [] : (r.data || []); } catch (e) {}
    const m = tk.length ? rdv.filter(r => flou(tk, [r.titre, r.contact_nom, r.lieu, r.objet].join(' '))) : [];
    const futurs = rdv.filter(r => r.date_rdv >= today && (r.statut === 'Prévu' || r.statut === 'Reporté')), passes = rdv.filter(r => r.date_rdv < today).slice(-6).reverse();
    const fr = r => '- ' + fd(r.date_rdv) + (r.heure ? ' ' + hm(r.heure) : '') + ' · ' + r.titre + ' · ' + (r.type || '') + (r.contact_nom ? ' · ' + r.contact_nom : '') + (r.tel ? ' · tél ' + r.tel : '') + (r.lieu ? ' · ' + r.lieu : '') + (r.objet ? ' · objet : ' + String(r.objet).slice(0, 120) : '') + ' · ' + r.statut + (r.resultat ? ' · résultat : ' + String(r.resultat).slice(0, 120) : '') + (r.relance ? ' · relance ' + fd(r.relance) : '');
    let t = '== NOTES : RENDEZ-VOUS ET NOTES PERSONNELLES ==\n';
    if (m.length) t += 'Rendez-vous correspondant à la question :\n' + m.slice(0, 8).map(fr).join('\n') + '\n';
    t += 'Rendez-vous à venir (' + futurs.length + ') :\n' + (futurs.slice(0, 10).map(fr).join('\n') || 'aucun') + '\n';
    if (passes.length && !m.length) t += 'Derniers rendez-vous passés :\n' + passes.map(fr).join('\n') + '\n';
    const act = np.filter(n => !n.fait).sort((a, b) => (b.epingle ? 1 : 0) - (a.epingle ? 1 : 0) || String(a.rappel || '9').localeCompare(String(b.rappel || '9')));
    if (act.length) t += 'Notes personnelles non faites (' + act.length + ') :\n' + act.slice(0, 12).map(n => '- ' + (n.epingle ? '📌 ' : '') + '[' + (n.categorie || '') + '] ' + (n.titre ? n.titre + ' : ' : '') + String(n.contenu).slice(0, 160) + (n.rappel ? ' (rappel ' + fd(n.rappel) + ')' : '')).join('\n') + '\n';
    return lim(t, 2600);
  }

  /* ---------- Produits : coût de revient, prix de vente, marge ---------- */
  function sectionProduits(tk) {
    if (typeof PRODUITS === 'undefined' || typeof recap !== 'function' || !PRODUITS.length) return '';
    const m = tk.length ? PRODUITS.filter(p => flou(tk, p.nom)) : [], lst = (m.length ? m : PRODUITS).slice(0, 15);
    let t = '== PRODUITS : COÛT DE REVIENT D\'UNE PIÈCE ==\n';
    t += lst.map(p => { const r = recap(p), pv = Number(p.prix_vente) || 0;
      return '- ' + p.nom + ' : coût ' + f2(r.total) + ' DA (matières ' + f2(r.mat) + ' DA' + (Number(p.mo_pieces) ? ', main d\'œuvre ' + f2(r.mo) + ' DA' : ', main d\'œuvre NON renseignée') + ')' + (pv ? ' ; prix de vente ' + f2(pv) + ' DA ; marge ' + f2(pv - r.total) + ' DA/pc (' + Math.round((pv - r.total) / pv * 100) + ' %)' : ' ; prix de vente non renseigné') +
        (m.length ? '\n  Détail : ' + r.cats.map(c => c.lbl + ' ' + f2(c.v) + ' DA').join(', ') : ''); }).join('\n') + '\n';
    return lim(t, 2000);
  }

  /* ---------- Inventaires ---------- */
  async function sectionInventaire() {
    let l = []; try { const r = await sb.from('inventaires').select('*').order('date_inventaire', { ascending: false }); l = r.error ? [] : (r.data || []); } catch (e) {}
    if (!l.length) return '== INVENTAIRE ==\nAucun inventaire enregistré (onglet Inventaire).\n';
    return '== INVENTAIRES ==\n' + l.slice(0, 4).map(i => '- ' + i.nom + ' (' + fd(i.date_inventaire) + ', ' + (i.statut === 'cloture' ? 'clôturé' : 'brouillon') + ')' + (i.statut === 'cloture' ? ' : ventes ' + f2(i.ventes) + ' DA, achats ' + f2(i.achats) + ' DA, valeur nette ' + f2(i.valeur_nette) + ' DA' : '')).join('\n') + '\n';
  }

  /* ---------- Bilan général (« comment va l'atelier ? ») ---------- */
  async function sectionBilan() {
    const today = isoD(new Date()), mm = today.slice(0, 7);
    let t = '== BILAN GÉNÉRAL AU ' + fd(today) + ' ==\n';
    const D_ = contactsAll(); t += 'Contacts : ' + D_.length + '.\n';
    if (window.CommerceAPI && CommerceAPI.docs) { const fac = CommerceAPI.docs().filter(d => d.type === 'facture' && d.statut !== 'annulee'), ttc = d => CommerceAPI.totaux(d, CommerceAPI.lignesDe(d.id)).ttc;
      const imp = fac.map(d => CommerceAPI.etatFacture(d)).filter(e => (e.reste || 0) > 0.004);
      t += 'Ventes : facturé ce mois ' + f2(fac.filter(d => String(d.date_doc).startsWith(mm)).reduce((s, d) => s + ttc(d), 0)) + ' DA TTC ; reste à encaisser ' + f2(imp.reduce((s, e) => s + e.reste, 0)) + ' DA (' + imp.length + ' factures).\n'; }
    const cmds = typeof COMMANDES !== 'undefined' ? COMMANDES.filter(c => c.statut !== 'Reçue' && c.statut !== 'Annulée') : [], prods = typeof PRODUCTIONS !== 'undefined' ? PRODUCTIONS.filter(p => p.statut !== 'Terminée' && p.statut !== 'Annulée' && !p.date_reception_reelle) : [];
    t += 'Commandes à livrer : ' + cmds.length + ' (' + cmds.filter(c => c.date_reception_prevue && c.date_reception_prevue < today).length + ' en retard) ; productions en cours : ' + prods.length + ' (' + prods.filter(p => p.date_reception_prevue && p.date_reception_prevue < today).length + ' en retard).\n';
    if (window.StockAPI) { try { const al = StockAPI.list().filter(StockAPI.enAlerte); t += 'Stock matières : ' + StockAPI.list().length + ' articles, ' + al.length + ' en alerte (' + al.slice(0, 6).map(a => a.nom).join(', ') + ').\n'; } catch (e) {} }
    if (window.PFAPI) { try { const s = PFAPI.summary(); t += 'Produits finis : ' + s.pieces + ' pièces en stock, ' + s.aLivrer + ' à livrer.\n'; } catch (e) {} }
    t += (await sectionCharges(null)).replace(/^== [^\n]*\n/, 'Charges du mois : ');
    return lim(t, 2200);
  }

  async function contexte(question) {
    try {
      const q = nz(question), tk = toks(question), want = {};
      Object.keys(TOP).forEach(k => { want[k] = TOP[k].test(q); });
      // un nom propre cité (client, employé) déclenche le sujet correspondant
      if (tk.length) {
        if (contactsAll().some(c => flou(tk, [c.nom, c.prenom, c.societe].join(' ')))) { want.contacts = true; if (!want.factures) want.nomFact = true; if (!want.commandes) want.nomCmd = true; }
        if (typeof EMPLOYES !== 'undefined' && EMPLOYES.some(e => matchTxt(tk, [e.nom, e.prenom].join(' ')))) want.employes = true;
        if (typeof COMMANDES !== 'undefined' && COMMANDES.some(c => c.commande_numero && q.includes(nz(c.commande_numero)))) want.commandes = true;
      }
      if (want.contacts && /(doit|doivent|impay|creance|solde|dette|reste|retard)/.test(q)) want.factures = true;   // « qui me doit de l'argent ? » : soldes ET factures
      const ecrire = /(ecri|redig|message|e-?mail|\bmail\b|whatsapp|\bsms\b|relanc|contacter|envoy|courrier|devis a)/.test(q);
      const dest = /(fournisseur|client|societe|contact|prospect|entreprise)/.test(q) || (tk.length && contactsAll().some(c => flou(tk, [c.nom, c.prenom, c.societe].join(' '))));
      if (ecrire && dest) { want.contacts = false; want.msgContact = true; }
      // autres sections de la plateforme
      const P = periode(question);
      want.paieJour = !!P && /(paie|paye|salair|salari|employ|pointage|pointe|heure|ouvrier|equipe|travaill|presence|present|absent|main d oeuvre|acompte|personnel)/.test(q);
      want.activite = !!P && !want.paieJour && !want.employes || (!!P && /(journee|activite|bilan|resume|qu est ce qui|que s est|fait|recap)/.test(q));
      want.charges = /(charge|depense|loyer|electricite|diner|frais)/.test(q);
      want.ateliers = /(atelier|facon|sous trait|soustrait)/.test(q) || (tk.length && typeof ATELIERS !== 'undefined' && ATELIERS.some(a => flou(tk, a.nom)));
      want.notes = /(rdv|rendez|rendez vous|agenda|planning|note|rappel|pense bete|prospect a contacter|a ne pas oublier)/.test(q);
      want.produits = /(cout de revient|prix de revient|cout d une piece|cout de production|main d oeuvre|rentab|marge par|marge du|marge sur|prix de vente)/.test(q) || (tk.length && typeof PRODUITS !== 'undefined' && PRODUITS.some(p => flou(tk, p.nom)) && !want.employes);
      want.inventaire = /inventaire/.test(q);
      want.bilan = /(bilan|situation|resume general|vue d ensemble|tableau de bord|comment va|etat general|rapport|point sur l atelier|point global)/.test(q) && !P;
      if (want.paieJour) want.employes = false;                       // la période demandée remplace le mois affiché
      if (P && P.mois && !P.au.startsWith(isoD(new Date()).slice(0, 7)) && /(salair|salari|paie|paye|employ|acompte)/.test(q)) { want.paieJour = true; want.employes = false; }
      if (!['msgContact', 'contacts', 'factures', 'commandes', 'employes', 'paieJour', 'activite', 'charges', 'ateliers', 'notes', 'produits', 'inventaire', 'bilan'].some(k => want[k])) return '';
      if (want.factures || want.contacts || want.nomFact || want.activite || want.bilan) await chargerCommerce();
      let t = '';
      if (P) t += 'DATE DU JOUR : ' + fd(isoD(new Date())) + '. Période demandée : ' + P.l + ' (du ' + fd(P.du) + ' au ' + fd(P.au) + ').\n';
      if (want.paieJour) t += await sectionPaiePeriode(P) + '\n';
      if (want.activite) t += await sectionActivite(P) + '\n';
      if (want.bilan) t += await sectionBilan() + '\n';
      if (want.notes) t += await sectionNotes(tk) + '\n';
      if (want.ateliers) t += await sectionAteliers(tk) + '\n';
      if (want.charges && !want.bilan) t += await sectionCharges(P && P.du !== P.au ? P : (P ? { du: P.du, au: P.au, l: P.l } : null)) + '\n';
      if (want.produits) t += sectionProduits(tk) + '\n';
      if (want.inventaire) t += await sectionInventaire() + '\n';
      if (want.msgContact) t += sectionContactsMessage(q, tk) + '\n';
      if (want.contacts) t += sectionContacts(tk) + '\n';
      if (want.factures) t += sectionFactures(tk) + '\n'; else if (want.nomFact) t += sectionFactures(tk, true) + '\n';
      if (want.commandes) t += sectionCommandes(tk) + '\n'; else if (want.nomCmd) t += sectionCommandes(tk, true) + '\n';
      if (want.employes) t += sectionEmployes(tk) + '\n';
      return t.slice(0, 6800);
    } catch (e) { return ''; }
  }
  window.ZSData = { contexte };
})();
