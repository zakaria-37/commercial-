/* ============================================================
   INVENTAIRE ANNUEL
   Photo figée de l'atelier à une date : stock des éléments et des produits finis (comptés),
   créances clients, avances aux employés, autres créances / trésorerie (ACTIFS)
   moins dettes fournisseurs, sommes dues aux employés, autres dettes (PASSIFS)
   = VALEUR NETTE. On compare la valeur nette et le chiffre d'affaires d'une année à l'autre.
   Tables : inventaires, inventaire_lignes (supabase/inventaire.sql)
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
  const num = v => { const x = parseFloat(String(v).replace(',', '.')); return isFinite(x) ? x : null; };
  const say = t => { if (typeof toast === 'function') toast(t); };

  const SEC = {
    matiere: { l: 'Éléments de production', actif: true },
    produit_fini: { l: 'Produits finis', actif: true },
    client: { l: 'Créances clients', actif: true },
    employe_creance: { l: 'Avances aux employés', actif: true },
    autre_actif: { l: 'Autres créances / trésorerie', actif: true },
    fournisseur: { l: 'Dettes fournisseurs', actif: false },
    employe_dette: { l: 'Sommes dues aux employés', actif: false },
    autre_passif: { l: 'Autres dettes', actif: false }
  };
  const ORDRE = ['matiere', 'produit_fini', 'client', 'employe_creance', 'autre_actif', 'fournisseur', 'employe_dette', 'autre_passif'];
  const STOCKS = ['matiere', 'produit_fini'];

  let INV = [], LIG = [], CHG = [], err = '', sel = null, onglet = 'resume', nouveau = false;
  let cmp = { a: '', b: '', sec: 'matiere' };
  const dirty = new Set();
  let timer = null, saveMsg = '';

  const inv = id => INV.find(i => String(i.id) === String(id));
  const linesOf = id => LIG.filter(l => String(l.inventaire_id) === String(id));
  const ligne = id => LIG.find(l => String(l.id) === String(id));
  const ro = i => !i || i.statut === 'cloture';

  /* ---------- Calculs ---------- */
  function recalc(l) {
    if (STOCKS.includes(l.section)) l.montant = l.quantite == null ? 0 : r2(Number(l.quantite) * Number(l.prix_unitaire || 0));
    else l.montant = r2(Math.max(0, Number(l.montant) || 0));
  }
  function totaux(lines) {
    const par = {}; ORDRE.forEach(s => { par[s] = 0; });
    lines.forEach(l => { par[l.section] = r2((par[l.section] || 0) + (Number(l.montant) || 0)); });
    const actifs = r2(ORDRE.filter(s => SEC[s].actif).reduce((t, s) => t + par[s], 0));
    const passifs = r2(ORDRE.filter(s => !SEC[s].actif).reduce((t, s) => t + par[s], 0));
    return { par, actifs, passifs, net: r2(actifs - passifs) };
  }
  const nonComptes = lines => lines.filter(l => STOCKS.includes(l.section) && l.quantite == null);
  const periode = i => ({ depuis: i.debut_periode || '', jusqua: i.date_inventaire });
  function caPeriode(i) {
    const ops = window.PartAPI ? PartAPI.ops(periode(i)) : [];
    return { ventes: r2(ops.filter(o => o.sens === 'vente').reduce((s, o) => s + o.montant, 0)), achats: r2(ops.filter(o => o.sens === 'achat').reduce((s, o) => s + o.montant, 0)), ops };
  }
  function precedent(date, sauf) {
    return INV.filter(i => i.statut === 'cloture' && i.date_inventaire < date && String(i.id) !== String(sauf)).sort((a, b) => b.date_inventaire.localeCompare(a.date_inventaire))[0] || null;
  }

  /* ---------- Chargement ---------- */
  async function load(force) {
    const root = $('#inv-root'); if (!root) return;
    const a = document.activeElement;
    if (!force && (dirty.size || (a && root.contains(a) && /INPUT|SELECT|TEXTAREA/.test(a.tagName)))) return;
    const r = await sb.from('inventaires').select('*').order('date_inventaire', { ascending: false });
    if (r.error) { err = /does not exist|relation|schema cache/i.test(r.error.message) ? 'Tables « inventaires » introuvables dans Supabase. Exécutez supabase/inventaire.sql dans SQL Editor, puis rechargez la page.' : r.error.message; INV = []; LIG = []; render(); return; }
    const l = await sb.from('inventaire_lignes').select('*').order('ordre', { ascending: true });
    err = ''; INV = r.data || []; LIG = l.data || [];
    try { const ch = await sb.from('charges').select('date_charge,montant,categorie'); CHG = ch.error ? [] : (ch.data || []); } catch (e) { CHG = []; }
    if (sel && !inv(sel)) sel = null;
    render();
    // inventaires en cours : on ajoute les éléments créés dans le Stock depuis leur création
    for (const i of INV.filter(x => x.statut !== 'cloture')) await completer(i.id);
  }

  /* ---------- Sauvegarde automatique des lignes modifiées ---------- */
  function schedule() { saveMsg = 'Modifications en cours…'; majMsg(); clearTimeout(timer); timer = setTimeout(flush, 700); }
  async function flush() {
    clearTimeout(timer);
    const ids = [...dirty]; if (!ids.length) return true;
    for (const id of ids) {
      const l = ligne(id); if (!l) { dirty.delete(id); continue; }
      const r = await sb.from('inventaire_lignes').update({ quantite: l.quantite, prix_unitaire: l.prix_unitaire, montant: l.montant, libelle: l.libelle, note: l.note || '' }).eq('id', id);
      if (r.error) { saveMsg = '⚠ Erreur d’enregistrement : ' + r.error.message; majMsg(); return false; }
      dirty.delete(id);
    }
    saveMsg = 'Enregistré ✓ ' + new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }); majMsg();
    return true;
  }
  const majMsg = () => { const e = $('#inv-save'); if (e) e.textContent = saveMsg; };

  /* ---------- Création d'un inventaire, prérempli depuis la plateforme ---------- */
  async function creer() {
    const nom = $('#inv-nnom').value.trim(), date = $('#inv-ndate').value, notes = $('#inv-nnotes').value.trim();
    if (!nom) { say('Donnez un nom à l’inventaire (ex. Inventaire 2026).'); return; }
    if (!date) { say('Indiquez la date de l’inventaire.'); return; }
    if (INV.some(i => norm(i.nom) === norm(nom))) { say('Un inventaire porte déjà ce nom.'); return; }
    const dernier = INV.filter(i => i.statut === 'cloture').sort((a, b) => b.date_inventaire.localeCompare(a.date_inventaire))[0];
    if (dernier && date <= dernier.date_inventaire) { say('La date doit être après le dernier inventaire clôturé (' + fd(dernier.date_inventaire) + ').'); return; }
    if (INV.some(i => i.statut === 'brouillon') && !confirm('Un autre inventaire est encore en cours (brouillon). Créer quand même celui-ci ?')) return;
    const btn = $('#inv-ncreer'); btn.disabled = true; btn.textContent = 'Préparation…';
    try {
      if (window.StockAPI) await StockAPI.load();
      if (window.PFAPI) await PFAPI.load();
      if (typeof loadEmployes === 'function') await loadEmployes();
      const prev = precedent(date);
      const ri = await sb.from('inventaires').insert([{ nom, annee: Number(date.slice(0, 4)), date_inventaire: date, statut: 'brouillon', debut_periode: prev ? prev.date_inventaire : null, notes }]).select();
      if (ri.error || !ri.data || !ri.data[0]) { say('Erreur : ' + ((ri.error && ri.error.message) || 'création impossible')); return; }
      const id = ri.data[0].id, rows = []; let o = 0;
      const add = x => rows.push(Object.assign({ inventaire_id: id, ordre: o++ }, x));
      (window.StockAPI ? StockAPI.list() : []).slice().sort((a, b) => (a.categorie + a.nom).localeCompare(b.categorie + b.nom, 'fr')).forEach(a => {
        const cond = StockAPI.aCond(a);
        add({ section: 'matiere', ref_id: a.id, libelle: a.nom, detail: a.categorie, unite: a.unite, cond_nom: cond ? a.cond_nom : '', cond_qte: cond ? StockAPI.condQte(a) : 0,
          quantite_theorique: StockAPI.qty(a.id), quantite: null, prix_unitaire: StockAPI.unitPrice(a), montant: 0 });
      });
      (window.PFAPI ? PFAPI.produits() : []).slice().sort((a, b) => a.nom.localeCompare(b.nom, 'fr')).forEach(p => {
        add({ section: 'produit_fini', ref_id: p.id, libelle: p.nom, detail: p.marque || 'MARIA BAG', unite: 'pcs', quantite_theorique: PFAPI.qty(p.id), quantite: null,
          prix_unitaire: PFAPI.coutProduit(p) || 0, prix_vente: Number(p.prix_vente) || 0, montant: 0 });
      });
      const all = window.PartAPI ? PartAPI.ops({}) : [];
      const vus = new Set();
      if (window.PayAPI) {            // soldes calculés (ventes/achats + soldes de départ − paiements) : reportés tels quels
        if (PayAPI.load) await PayAPI.load();
        PayAPI.soldes('client').filter(x => x.id).forEach(x => { vus.add('c' + x.id); add({ section: 'client', ref_id: x.id, libelle: x.nom, detail: 'Client', montant: r2(Math.max(0, x.solde)), note: x.solde > 0.004 ? 'Solde calculé par la plateforme' : '' }); });
        PayAPI.soldes('fournisseur').filter(x => x.id).forEach(x => { vus.add('f' + x.id); add({ section: 'fournisseur', ref_id: x.id, libelle: x.nom, detail: 'Fournisseur', montant: r2(Math.max(0, x.solde)), note: x.solde > 0.004 ? 'Solde calculé par la plateforme' : '' }); });
      }
      all.filter(x => x.sens === 'vente' && x.id).forEach(x => { if (vus.has('c' + x.id)) return; vus.add('c' + x.id); add({ section: 'client', ref_id: x.id, libelle: x.nom, detail: 'Client', montant: 0 }); });
      all.filter(x => x.sens === 'achat' && x.id).forEach(x => { if (vus.has('f' + x.id)) return; vus.add('f' + x.id); add({ section: 'fournisseur', ref_id: x.id, libelle: x.nom, detail: 'Fournisseur', montant: 0 }); });
      (typeof EMPLOYES !== 'undefined' ? EMPLOYES : []).forEach(e => {
        const n = [e.prenom, e.nom].filter(Boolean).join(' ');
        add({ section: 'employe_creance', ref_id: e.id, libelle: n, detail: e.poste || '', montant: 0 });
        add({ section: 'employe_dette', ref_id: e.id, libelle: n, detail: e.poste || '', montant: 0 });
      });
      ['Caisse', 'Banque'].forEach(n => add({ section: 'autre_actif', libelle: n, detail: 'Trésorerie', montant: 0 }));
      if (rows.length) {
        const rl = await sb.from('inventaire_lignes').insert(rows).select();
        if (rl.error) { await sb.from('inventaires').delete().eq('id', id); say('Erreur : ' + rl.error.message); return; }
      }
      nouveau = false; sel = id; onglet = 'resume';
      await load(true);
      await majFinancier(id, true);
      say('Inventaire créé : ' + rows.filter(r => STOCKS.includes(r.section)).length + ' éléments et produits à compter.');
    } finally { btn.disabled = false; btn.textContent = 'Créer l’inventaire'; }
  }

  /* Inventaire en cours (brouillon) : les éléments et produits finis ajoutés au Stock APRÈS sa création y sont ajoutés automatiquement */
  let completant = false;
  async function completer(id) {
    const i = inv(id); if (!i || i.statut === 'cloture' || completant) return 0;
    completant = true;
    try {
      if (window.StockAPI && !StockAPI.list().length) await StockAPI.load();
      if (window.PFAPI && !PFAPI.produits().length) await PFAPI.load();
      const deja = new Set(LIG.filter(l => String(l.inventaire_id) === String(id) && STOCKS.includes(l.section)).map(l => l.section + ':' + l.ref_id));
      let o = Math.max(-1, ...LIG.filter(l => String(l.inventaire_id) === String(id)).map(l => Number(l.ordre) || 0)) + 1;
      const rows = [];
      (window.StockAPI ? StockAPI.list() : []).forEach(a => { if (deja.has('matiere:' + a.id)) return; const cond = StockAPI.aCond(a);
        rows.push({ inventaire_id: id, ordre: o++, section: 'matiere', ref_id: a.id, libelle: a.nom, detail: a.categorie, unite: a.unite, cond_nom: cond ? a.cond_nom : '', cond_qte: cond ? StockAPI.condQte(a) : 0,
          quantite_theorique: StockAPI.qty(a.id), quantite: null, prix_unitaire: StockAPI.unitPrice(a), montant: 0, note: 'Ajouté au Stock après la création de l’inventaire' }); });
      (window.PFAPI ? PFAPI.produits() : []).forEach(p => { if (deja.has('produit_fini:' + p.id)) return;
        rows.push({ inventaire_id: id, ordre: o++, section: 'produit_fini', ref_id: p.id, libelle: p.nom, detail: p.marque || 'MARIA BAG', unite: 'pcs', quantite_theorique: PFAPI.qty(p.id), quantite: null,
          prix_unitaire: PFAPI.coutProduit(p) || 0, prix_vente: Number(p.prix_vente) || 0, montant: 0, note: 'Ajouté au Stock après la création de l’inventaire' }); });
      if (!rows.length) return 0;
      const r = await sb.from('inventaire_lignes').insert(rows).select();
      if (r.error) { say('Erreur : ' + r.error.message); return 0; }
      LIG.push(...(r.data || []));
      if (String(sel) === String(id)) render();
      say(rows.length + ' nouvel(s) élément(s) ou produit(s) du Stock ajouté(s) à l’inventaire « ' + i.nom + ' ».');
      return rows.length;
    } finally { completant = false; }
  }

  /* ---------- Créances et dettes calculées par la plateforme ----------
     Crédits (prêts donnés = créance, prêts reçus = dette), soldes clients et fournisseurs, reste à payer aux ateliers,
     crédit personnel des employés (avance) et heures sup à leur remettre (dette). */
  async function financier() {
    const L = [], cle = (sec, ref, tag) => sec + '|' + (ref || '') + '|' + (tag || '');
    const add = (section, ref_id, libelle, detail, montant, note) => { montant = r2(montant); if (Math.abs(montant) < 0.005) return; L.push({ k: cle(section, ref_id, detail), section, ref_id: ref_id || null, libelle, detail, montant, note: note || 'Calculé par la plateforme' }); };
    try { if (window.PayAPI && PayAPI.load) await PayAPI.load(); } catch (e) {}
    if (window.PayAPI) {
      PayAPI.soldes('client').filter(x => x.id && x.solde > 0.004).forEach(x => add('client', x.id, x.nom, 'Client', x.solde));
      PayAPI.soldes('fournisseur').filter(x => x.id && x.solde > 0.004).forEach(x => add('fournisseur', x.id, x.nom, 'Fournisseur', x.solde));
      PayAPI.soldes('fournisseur').filter(x => x.id && x.solde < -0.004).forEach(x => add('autre_actif', x.id, 'Avance chez ' + x.nom, 'Avance fournisseur', -x.solde));
    }
    // crédits (prêts) : donnés et reçus, séparément
    let CR = []; try { const r = await sb.from('credits_tiers').select('*'); CR = r.error ? [] : (r.data || []); } catch (e) {}
    const per = new Map();
    CR.forEach(o => { const k = o.contact_id ? 'c' + o.contact_id : 'n' + norm(o.personne); const x = per.get(k) || { id: o.contact_id || null, nom: o.personne || '—', d: 0, r: 0 }; const m = Number(o.montant) || 0;
      if (o.nature === 'pret_donne') x.d += m; else if (o.nature === 'remb_recu') x.d -= m; else if (o.nature === 'pret_recu') x.r += m; else if (o.nature === 'remb_fait') x.r -= m;
      if (o.contact_id && typeof D !== 'undefined') { const c = D.find(y => String(y.id) === String(o.contact_id)); if (c && window.PartAPI) x.nom = PartAPI.label(c); } per.set(k, x); });
    per.forEach(x => { if (x.d > 0.004) add('autre_actif', x.id, 'Prêt accordé — ' + x.nom, 'Crédit (prêt)', x.d); if (x.r > 0.004) add('autre_passif', x.id, 'Prêt reçu — ' + x.nom, 'Crédit (prêt)', x.r); });
    // ateliers : façon due − paiements
    try {
      const pa = await sb.from('paiements_ateliers').select('*'), PA = pa.error ? [] : (pa.data || []);
      (typeof ATELIERS !== 'undefined' ? ATELIERS : []).forEach(a => {
        const du = (typeof PRODUCTIONS !== 'undefined' ? PRODUCTIONS : []).filter(p => String(p.atelier_id) === String(a.id) && p.statut !== 'Annulée').reduce((t, p) => t + (Number(p.prix_facon) || 0) * (Number(p.quantite_lancee) || 0), 0);
        const mine = PA.filter(x => String(x.atelier_id) === String(a.id)), rep2 = mine.filter(x => x.type === 'report').reduce((t, x) => t + Number(x.montant || 0), 0), paye = mine.filter(x => x.type !== 'report').reduce((t, x) => t + Number(x.montant || 0), 0);
        const reste = du + rep2 - paye;
        if (reste > 0.004) add('fournisseur', a.id, 'Atelier ' + a.nom, 'Atelier (façon)', reste); else if (reste < -0.004) add('autre_actif', a.id, 'Avance à l’atelier ' + a.nom, 'Atelier (façon)', -reste);
      });
    } catch (e) {}
    // employés : avances (crédit personnel) et heures sup à remettre
    (typeof EMPLOYES !== 'undefined' ? EMPLOYES : []).forEach(e => {
      const n = [e.prenom, e.nom].filter(Boolean).join(' ');
      try { const c = soldeCredit(e.id); if (c > 0.004) add('employe_creance', e.id, n, e.poste || '', c, 'Crédit personnel à rembourser'); } catch (x) {}
      try { const h = soldeSup(e); if (h > 0.004) add('employe_dette', e.id, n, e.poste || '', h, 'Heures sup à remettre'); } catch (x) {}
    });
    return L;
  }
  async function majFinancier(id, silencieux) {
    const i = inv(id); if (ro(i)) return;
    if (!silencieux && !confirm('Mettre à jour les créances et dettes de « ' + i.nom + ' » ?\n\nCrédits (prêts), soldes clients et fournisseurs, ateliers, crédits et heures sup des employés sont recalculés par la plateforme. Les lignes saisies à la main ne sont pas touchées.')) return;
    await flush();
    const L = await financier(), mine = linesOf(id).filter(l => !STOCKS.includes(l.section));
    const k = l => l.section + '|' + (l.ref_id || '') + '|' + (['client', 'fournisseur', 'autre_actif', 'autre_passif'].includes(l.section) ? (l.detail || '') : '');
    let n = 0, o = Math.max(-1, ...linesOf(id).map(l => Number(l.ordre) || 0)) + 1;
    for (const x of L) {
      const key = x.section + '|' + (x.ref_id || '') + '|' + (['client', 'fournisseur', 'autre_actif', 'autre_passif'].includes(x.section) ? x.detail : '');
      const ex = mine.find(l => k(l) === key);
      if (ex) { if (Math.abs((Number(ex.montant) || 0) - x.montant) > 0.004) { const r = await sb.from('inventaire_lignes').update({ montant: x.montant, libelle: x.libelle, note: x.note }).eq('id', ex.id); if (!r.error) { Object.assign(ex, { montant: x.montant, libelle: x.libelle, note: x.note }); n++; } } }
      else { const r = await sb.from('inventaire_lignes').insert([{ inventaire_id: id, ordre: o++, section: x.section, ref_id: x.ref_id, libelle: x.libelle, detail: x.detail, montant: x.montant, note: x.note }]).select(); if (!r.error && r.data) { LIG.push(r.data[0]); n++; } }
    }
    // lignes calculées auparavant et désormais soldées : remises à 0
    for (const l of mine) { if (/Calculé par la plateforme|Crédit personnel à rembourser|Heures sup à remettre/.test(l.note || '') && !L.some(x => (x.section + '|' + (x.ref_id || '') + '|' + (['client', 'fournisseur', 'autre_actif', 'autre_passif'].includes(x.section) ? x.detail : '')) === k(l)) && Number(l.montant)) {
      const r = await sb.from('inventaire_lignes').update({ montant: 0 }).eq('id', l.id); if (!r.error) { l.montant = 0; n++; } } }
    render();
    if (!silencieux) { const t = totaux(linesOf(id)); say(n + ' ligne(s) de créances / dettes mises à jour — actifs ' + money(t.actifs) + ', passifs ' + money(t.passifs) + '.'); }
  }

  /* Synchroniser avec le Stock actuel : chaque élément et produit fini de l'inventaire prend la quantité et le prix du Stock
     (« Selon la plateforme » ET « Compté »). Sert à faire l'inventaire de départ juste après avoir rempli le Stock. */
  async function synchroniserStock() {
    const i = inv(sel); if (ro(i)) return;
    if (!confirm('Synchroniser « ' + i.nom + ' » avec le Stock actuel ?\n\nPour chaque élément et chaque produit fini :\n• la quantité comptée devient le stock actuel de la plateforme ;\n• le prix devient le prix actuel du Stock.\n\nLes quantités déjà saisies dans l’inventaire seront remplacées.\n\n⚠ Le stock ACTUEL est repris, y compris les réceptions faites après la date de l’inventaire (' + fd(i.date_inventaire) + ').')) return;
    await flush();
    if (window.StockAPI) await StockAPI.load();
    if (window.PFAPI) await PFAPI.load();
    await completer(sel);
    const ls = linesOf(sel).filter(l => STOCKS.includes(l.section) && l.ref_id);
    let n = 0, err = 0;
    for (const l of ls) {
      let maj = null;
      if (l.section === 'matiere' && window.StockAPI) {
        const a = StockAPI.byId(l.ref_id); if (!a) continue; const cond = StockAPI.aCond(a), q = r4(Math.max(0, StockAPI.qty(a.id))), pu = StockAPI.unitPrice(a);
        maj = { libelle: a.nom, detail: a.categorie, unite: a.unite, cond_nom: cond ? a.cond_nom : '', cond_qte: cond ? StockAPI.condQte(a) : 0, quantite_theorique: q, quantite: q, prix_unitaire: pu > 0 ? pu : Number(l.prix_unitaire) || 0 };
      } else if (l.section === 'produit_fini' && window.PFAPI) {
        const p = PFAPI.produits().find(x => String(x.id) === String(l.ref_id)); if (!p) continue; const q = Math.max(0, PFAPI.qty(p.id)), c = PFAPI.coutProduit(p);
        maj = { libelle: p.nom, quantite_theorique: q, quantite: q, prix_unitaire: c > 0 ? c : Number(l.prix_unitaire) || 0, prix_vente: Number(p.prix_vente) || 0 };
      }
      if (!maj) continue;
      Object.assign(l, maj); recalc(l); maj.montant = l.montant;
      const r = await sb.from('inventaire_lignes').update(maj).eq('id', l.id);
      if (r.error) err++; else n++;
      dirty.delete(String(l.id));
    }
    saveMsg = 'Synchronisé avec le Stock ✓ ' + new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    render();
    const t = totaux(linesOf(sel));
    say(n + ' ligne(s) synchronisée(s) avec le Stock' + (err ? ' · ⚠ ' + err + ' erreur(s)' : '') + ' — éléments : ' + money(t.par.matiere) + ' · produits finis : ' + money(t.par.produit_fini) + '.');
  }

  /* Marchandise retrouvée (ex. cachée dans le dépôt) : on l'ajoute au stock initial de cet inventaire.
     Produit / élément existant ou nouveau ; la quantité s'ajoute à la ligne de l'inventaire et,
     si coché, au Stock (entrée datée du jour de l'inventaire, donc le stock actuel reste juste). */
  function trouve(sec) {
    const i = inv(sel); if (ro(i)) return;
    const pf = sec === 'produit_fini';
    const items = pf ? (window.PFAPI ? PFAPI.produits() : []) : (window.StockAPI ? StockAPI.list() : []);
    const cats = typeof STK_CATS !== 'undefined' ? STK_CATS : [{ k: 'Autre', unite: 'pcs' }];
    const bg = document.createElement('div'); bg.className = 'cm-nv-bg';
    bg.innerHTML = '<form class="cm-nv" autocomplete="off"><h3 style="margin:0 0 4px">' + (pf ? 'Produit fini' : 'Élément') + ' trouvé au dépôt</h3>' +
      '<p class="cm-nv-p">Ajouté au stock initial de « ' + esc(i.nom) + ' » (au ' + fd(i.date_inventaire) + ').</p><div class="at-fields">' +
      '<label style="grid-column:1/-1">' + (pf ? 'Produit fini' : 'Élément') + ' *<select id="tv-it" data-cherche="1" data-creer-txt="' + (pf ? 'Nouveau produit fini…' : 'Nouvel élément…') + '"><option value="">— tapez le nom —</option>' +
        items.slice().sort((a, b) => a.nom.localeCompare(b.nom, 'fr')).map(x => '<option value="' + esc(x.id) + '">' + esc(x.nom) + (pf ? '' : ' (' + esc(x.categorie) + ')') + '</option>').join('') + '</select></label>' +
      (pf ? '' : '<label class="tv-new" style="display:none">Catégorie<select id="tv-cat" data-nocherche="1">' + cats.map(c => '<option>' + esc(c.k) + '</option>').join('') + '</select></label>' +
        '<label class="tv-new" style="display:none">Unité<select id="tv-uni" data-nocherche="1">' + ['m', 'pcs', 'kg', 'bobine', 'rouleau', 'paquet', 'sachet', 'l'].map(u => '<option>' + u + '</option>').join('') + '</select></label>') +
      '<label>Quantité trouvée * <small id="tv-u"></small><input id="tv-q" type="number" min="0" step="any" inputmode="decimal" required></label>' +
      '<label>' + (pf ? 'Coût / pièce' : 'Prix unitaire') + ' (DA)<input id="tv-pu" type="number" min="0" step="any" inputmode="decimal" placeholder="0"></label></div>' +
      '<label class="st-check" style="margin-top:8px"><input id="tv-stock" type="checkbox" checked> Ajouter aussi au Stock actuel (entrée datée du ' + fd(i.date_inventaire) + ')</label>' +
      '<div id="tv-msg" class="cm-nv-p" style="color:#b00020"></div>' +
      '<div class="at-actions"><button class="btn p" type="submit">Ajouter à l’inventaire</button><button class="btn" type="button" id="tv-x">Annuler</button></div></form>';
    document.body.appendChild(bg);
    const $t = q => bg.querySelector(q), fermer = () => bg.remove();
    let nouveauNom = null;
    const selIt = $t('#tv-it');
    const majIt = () => {
      const x = items.find(y => String(y.id) === String(selIt.value));
      bg.querySelectorAll('.tv-new').forEach(e => e.style.display = nouveauNom ? '' : 'none');
      $t('#tv-u').textContent = pf ? '(pièces)' : nouveauNom ? '' : x ? '(' + x.unite + (StockAPI.aCond(x) ? ' — 1 ' + x.cond_nom + ' = ' + StockAPI.condQte(x) + ' ' + x.unite : '') + ')' : '';
      if (x && !$t('#tv-pu').value) { const p0 = pf ? PFAPI.coutProduit(x) : StockAPI.unitPrice(x); if (p0) $t('#tv-pu').value = Math.round(p0 * 100) / 100; }
    };
    selIt._chCreer = (s, nom) => {
      nom = String(nom || '').trim() || prompt('Nom du nouveau ' + (pf ? 'produit fini' : 'élément') + ' :') || '';
      if (!nom.trim()) return null;
      nouveauNom = nom.trim(); return { value: '__nv__', label: '➕ ' + nouveauNom + ' (nouveau)' };
    };
    selIt.addEventListener('change', () => { if (selIt.value !== '__nv__') nouveauNom = null; majIt(); });
    if (!pf) $t('#tv-cat').addEventListener('change', () => { const c = cats.find(x => x.k === $t('#tv-cat').value); if (c && c.unite) $t('#tv-uni').value = c.unite; });
    $t('#tv-x').onclick = fermer;
    bg.addEventListener('mousedown', e => { if (e.target === bg) fermer(); });
    bg.addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); fermer(); } });
    setTimeout(() => { const c = bg.querySelector('.ch-inp'); if (c) c.focus(); }, 60);
    $t('form').onsubmit = async ev => {
      ev.preventDefault();
      const q = r4(Math.max(0, Number($t('#tv-q').value) || 0)), pu = Math.max(0, Number($t('#tv-pu').value) || 0), auStock = $t('#tv-stock').checked;
      if (!selIt.value) { $t('#tv-msg').textContent = 'Choisissez ou créez le ' + (pf ? 'produit' : 'élément') + '.'; return; }
      if (!(q > 0)) { $t('#tv-msg').textContent = 'Indiquez la quantité trouvée.'; return; }
      const btn = $t('button[type=submit]'); btn.disabled = true;
      try {
        let id = selIt.value;
        if (id === '__nv__') {
          const ex = items.find(x => norm(x.nom) === norm(nouveauNom));
          if (ex) id = ex.id;
          else {
            const r = pf ? await sb.from('produits').insert([{ nom: nouveauNom, prix_achat: pu }]).select()
              : await sb.from('stock_articles').insert([{ nom: nouveauNom, categorie: $t('#tv-cat').value, unite: $t('#tv-uni').value, prix_achat: pu }]).select();
            if (r.error) throw r.error; id = r.data[0].id;
          }
        }
        if (auStock) {
          const note = 'Trouvé au dépôt — ' + i.nom;
          const r = pf ? await sb.from('pf_mouvements').insert([{ produit_id: id, type: 'entree', quantite: q, prix_achat: pu || null, date_mvt: i.date_inventaire, reference: 'INVENTAIRE', note }])
            : await sb.from('stock_mouvements').insert([{ article_id: id, type: 'entree', quantite: q, prix_achat: pu || null, date_mvt: i.date_inventaire, reference: 'INVENTAIRE', note }]);
          if (r.error) throw r.error;
        }
        if (pf) { await PFAPI.load(); document.dispatchEvent(new Event('mariabag:pf')); } else { await StockAPI.load(); document.dispatchEvent(new Event('mariabag:stock')); }
        // ligne de l'inventaire : on ajoute la quantité (ou on crée la ligne)
        const l = linesOf(sel).find(x => x.section === sec && String(x.ref_id) === String(id));
        const noteL = '+' + nf(q, 2) + ' trouvé(s) au dépôt';
        if (l) {
          const base = l.quantite != null ? Number(l.quantite) : Number(l.quantite_theorique) || 0;
          const patch = { quantite: r4(base + q), note: [l.note, noteL].filter(Boolean).join(' · ') };
          if (auStock) patch.quantite_theorique = r4((Number(l.quantite_theorique) || 0) + q);
          if (pu && !(Number(l.prix_unitaire) > 0)) patch.prix_unitaire = pu;
          patch.montant = r4(patch.quantite * Number(patch.prix_unitaire != null ? patch.prix_unitaire : l.prix_unitaire || 0));
          const r = await sb.from('inventaire_lignes').update(patch).eq('id', l.id); if (r.error) throw r.error;
          Object.assign(l, patch);
        } else {
          const x = pf ? PFAPI.produits().find(y => String(y.id) === String(id)) : StockAPI.byId(id);
          const cond = !pf && x && StockAPI.aCond(x);
          const nl = await addLigne({ section: sec, ref_id: id, libelle: x ? x.nom : nouveauNom, detail: pf ? (x && x.marque) || 'MARIA BAG' : (x && x.categorie) || '', unite: pf ? 'pcs' : (x && x.unite) || 'pcs',
            cond_nom: cond ? x.cond_nom : '', cond_qte: cond ? StockAPI.condQte(x) : 0, quantite_theorique: auStock ? q : 0, quantite: q, prix_unitaire: pu,
            prix_vente: pf && x ? Number(x.prix_vente) || 0 : 0, montant: r4(q * pu), note: noteL });
          if (!nl) throw new Error('ligne non ajoutée');
        }
        fermer(); render();
        say(nf(q, 2) + ' ajouté(s) au stock initial' + (auStock ? ' et au Stock actuel' : '') + '.');
      } catch (err) { btn.disabled = false; $t('#tv-msg').textContent = 'Erreur : ' + (err && err.message || err); }
    };
    majIt();
  }

  async function addLigne(x) {
    const i = inv(sel); if (ro(i)) return null;
    const max = Math.max(-1, ...linesOf(sel).map(l => Number(l.ordre) || 0));
    const r = await sb.from('inventaire_lignes').insert([Object.assign({ inventaire_id: sel, ordre: max + 1, montant: 0 }, x)]).select();
    if (r.error || !r.data || !r.data[0]) { say('Erreur : ' + ((r.error && r.error.message) || 'ajout impossible')); return null; }
    LIG.push(r.data[0]); return r.data[0];
  }
  async function supprLigne(id) {
    const r = await sb.from('inventaire_lignes').delete().eq('id', id);
    if (r.error) { say('Erreur : ' + r.error.message); return; }
    dirty.delete(id); LIG = LIG.filter(l => String(l.id) !== String(id));
  }

  /* ---------- Clôture ---------- */
  async function cloturer() {
    const i = inv(sel); if (!i || ro(i)) return;
    if (!(await flush())) { alert('Les dernières modifications n’ont pas pu être enregistrées. Réessayez.'); return; }
    const lines = linesOf(i.id), pb = [];
    const nc = nonComptes(lines);
    if (nc.length) pb.push(nc.length + ' élément(s) ou produit(s) pas encore comptés (onglets Éléments et Produits finis).');
    lines.filter(l => (l.section === 'autre_actif' || l.section === 'autre_passif') && Number(l.montant) > 0 && !String(l.libelle).trim()).forEach(() => pb.push('Une ligne « Autres » a un montant sans libellé.'));
    if (!i.date_inventaire) pb.push('La date de l’inventaire est manquante.');
    const tard = INV.filter(x => x.statut === 'cloture' && String(x.id) !== String(i.id) && x.date_inventaire >= i.date_inventaire);
    if (tard.length) pb.push('Un inventaire clôturé existe à la même date ou après (' + fd(tard[0].date_inventaire) + ').');
    if (pb.length) { alert('Impossible de clôturer :\n\n• ' + [...new Set(pb)].join('\n• ')); return; }
    const t = totaux(lines), ca = caPeriode(i);
    const apply = $('#inv-apply') && $('#inv-apply').checked;
    const ecarts = apply ? lines.filter(l => STOCKS.includes(l.section) && l.ref_id).length : 0;
    if (!confirm('Clôturer « ' + i.nom + ' » au ' + fd(i.date_inventaire) + ' ?\n\nActifs : ' + money(t.actifs) + '\nPassifs : ' + money(t.passifs) + '\nValeur nette : ' + money(t.net) +
      '\nChiffre d’affaires de la période : ' + money(ca.ventes) + '\n\n' + (apply ? 'Le stock de la plateforme sera ramené exactement aux quantités comptées.\n' : 'Le stock de la plateforme ne sera pas modifié.\n') + 'Les chiffres seront figés (vous pourrez rouvrir en cas d’erreur).')) return;
    if (apply) {
      const echecs = [];
      for (const l of lines.filter(x => x.section === 'matiere' && x.ref_id)) {
        const a = StockAPI.byId(l.ref_id); if (!a) continue;
        const delta = r4(Number(l.quantite) - StockAPI.qty(a.id)); if (delta === 0) continue;
        const r = await StockAPI.mouvement({ article_id: a.id, type: 'ajustement', quantite: delta, date: i.date_inventaire, note: 'Inventaire : ' + i.nom });
        if (r.error) echecs.push(l.libelle + ' : ' + r.error.message);
      }
      for (const l of lines.filter(x => x.section === 'produit_fini' && x.ref_id)) {
        const cur = PFAPI.qty(l.ref_id); if (Math.round(Number(l.quantite)) === cur) continue;
        const r = await PFAPI.saisir({ type: 'ajustement', produitId: l.ref_id, quantite: Math.round(Number(l.quantite)), date: i.date_inventaire, note: 'Inventaire : ' + i.nom });
        if (r.error) echecs.push(l.libelle + ' : ' + r.error.message);
      }
      if (echecs.length) { alert('Le stock n’a pas pu être entièrement corrigé, l’inventaire n’est PAS clôturé :\n\n• ' + echecs.slice(0, 8).join('\n• ') + '\n\nCorrigez puis relancez la clôture (les corrections déjà faites ne seront pas refaites).'); return; }
    }
    const u = await sb.from('inventaires').update({ statut: 'cloture', ventes: ca.ventes, achats: ca.achats, valeur_nette: t.net, stock_applique: apply || !!i.stock_applique, cloture_le: new Date().toISOString() }).eq('id', i.id);
    if (u.error) { alert('Erreur : ' + u.error.message); return; }
    await load(true); say('Inventaire clôturé : valeur nette ' + money(t.net) + '.');
  }
  async function rouvrir() {
    const i = inv(sel); if (!i || i.statut !== 'cloture') return;
    const apres = INV.filter(x => x.debut_periode && x.debut_periode >= i.date_inventaire);
    if (!confirm('Rouvrir « ' + i.nom + ' » pour corriger une erreur ?' + (apres.length ? '\n\nAttention : « ' + apres[0].nom + ' » part de cet inventaire ; pensez à le vérifier ensuite.' : '') + '\n\nLes comparaisons seront à nouveau calculées à la prochaine clôture.')) return;
    const u = await sb.from('inventaires').update({ statut: 'brouillon', cloture_le: null }).eq('id', i.id);
    if (u.error) { say('Erreur : ' + u.error.message); return; }
    await load(true);
  }
  async function supprimer(id) {
    const i = inv(id); if (!i) return;
    if (i.statut === 'cloture') { say('Rouvrez d’abord cet inventaire pour pouvoir le supprimer.'); return; }
    if (!confirm('Supprimer définitivement « ' + i.nom + ' » et toutes ses lignes ?')) return;
    const r = await sb.from('inventaires').delete().eq('id', id);
    if (r.error) { say('Erreur : ' + r.error.message); return; }
    if (sel === id) sel = null; await load(true);
  }

  /* ---------- Affichage ---------- */
  const badge = i => '<span class="iv-bdg ' + (i.statut === 'cloture' ? 'ok' : 'br') + '">' + (i.statut === 'cloture' ? 'Clôturé' : 'En cours') + '</span>';

  function render() {
    const root = $('#inv-root'); if (!root) return;
    if (err) { root.innerHTML = '<div class="card"><div class="iv-err">' + esc(err) + '</div></div>'; return; }
    const i = sel ? inv(sel) : null;
    root.innerHTML = i ? editeur(i) : accueil();
  }

  function accueil() {
    const an = new Date().getFullYear();
    let h = '<div class="hello"><span class="fl">&#10047;</span><div><h2>Inventaire</h2><p>Une photo complète de l’atelier à une date : stock, créances, dettes. Comparez d’une année à l’autre pour savoir si votre valeur nette augmente.</p></div></div>';
    h += '<div class="card"><div class="at-actions" style="margin-top:0"><h2 style="margin-right:auto">Mes inventaires</h2><button class="btn" type="button" id="inv-fiche">Fiche de comptage (PDF)</button><button class="btn p" type="button" id="inv-new">+ Nouvel inventaire</button></div>' +
      '<label class="st-check" style="margin:0 0 8px"><input id="inv-fshow" type="checkbox"> Afficher le stock actuel de la plateforme sur la fiche <small>(décoché = comptage à l’aveugle, plus fiable)</small></label>';
    h += '<form id="inv-nform" class="at-form" style="display:' + (nouveau ? 'block' : 'none') + '"><div class="at-fields">' +
      '<label>Nom *<input id="inv-nnom" maxlength="80" value="Inventaire ' + an + '"></label>' +
      '<label>Date de l’inventaire *<input id="inv-ndate" type="date" value="' + iso(new Date()) + '"></label>' +
      '<label style="grid-column:1/-1">Note<input id="inv-nnotes" maxlength="200" placeholder="Facultatif"></label></div>' +
      '<p class="iv-help">La plateforme prépare la liste de <b>tous vos éléments, produits finis, clients, fournisseurs et employés</b> avec les quantités qu’elle connaît. Vous n’avez plus qu’à <b>compter ce qu’il y a réellement dans l’atelier</b> et à saisir les crédits.</p>' +
      '<div class="at-actions"><button class="btn p" type="submit" id="inv-ncreer">Créer l’inventaire</button><button class="btn" type="button" id="inv-ncancel">Annuler</button></div></form>';
    if (!INV.length) h += '<div class="iv-empty">Aucun inventaire pour l’instant.<br>Cliquez sur <b>+ Nouvel inventaire</b> pour faire l’inventaire de départ (ex. Inventaire ' + an + ').</div>';
    else h += '<div class="tw"><table class="iv-tbl"><thead><tr><th>Inventaire</th><th>Date</th><th>Statut</th><th class="n">Valeur nette</th><th class="n iv-opt">Ventes de la période</th><th></th></tr></thead><tbody>' +
      INV.map(x => { const t = totaux(linesOf(x.id)); return '<tr class="row" data-open="' + esc(x.id) + '"><td><b>' + esc(x.nom) + '</b>' + (x.notes ? '<small>' + esc(x.notes) + '</small>' : '') + '</td><td>' + fd(x.date_inventaire) + '</td><td>' + badge(x) + '</td>' +
        '<td class="n"><b>' + money(x.statut === 'cloture' ? x.valeur_nette : t.net) + '</b></td><td class="n iv-opt">' + (x.statut === 'cloture' ? money(x.ventes) : '—') + '</td>' +
        '<td class="n"><button class="btn s" type="button" data-open="' + esc(x.id) + '">Ouvrir</button>' + (x.statut === 'brouillon' ? ' <button class="btn s d" type="button" data-del="' + esc(x.id) + '">Supprimer</button>' : '') + '</td></tr>'; }).join('') + '</tbody></table></div>';
    h += '</div>' + comparaison();
    return h;
  }

  /* ----- Comparaison entre deux inventaires clôturés ----- */
  function comparaison() {
    const clos = INV.filter(i => i.statut === 'cloture').sort((a, b) => a.date_inventaire.localeCompare(b.date_inventaire));
    if (clos.length < 2) return '<div class="card" style="margin-top:12px"><h2 style="margin-top:0">Comparer deux années</h2><div class="iv-empty">Clôturez au moins <b>deux inventaires</b> (par exemple 2026 puis 2027) pour voir si votre valeur nette et votre chiffre d’affaires ont augmenté ou diminué.</div></div>';
    if (!inv(cmp.a) || !inv(cmp.b) || cmp.a === cmp.b) { cmp.a = clos[clos.length - 2].id; cmp.b = clos[clos.length - 1].id; }
    let A = inv(cmp.a), B = inv(cmp.b);
    if (A.date_inventaire > B.date_inventaire) { const t = A; A = B; B = t; cmp.a = A.id; cmp.b = B.id; }
    const ta = totaux(linesOf(A.id)), tb = totaux(linesOf(B.id));
    const diff = r2(tb.net - ta.net), pc = ta.net !== 0 ? diff / Math.abs(ta.net) * 100 : null;
    const dv = r2(B.ventes - A.ventes), pv = A.ventes !== 0 ? dv / Math.abs(A.ventes) * 100 : null;
    const pct = x => x == null ? '' : ' (' + (x > 0 ? '+' : '') + nf(x, 1) + ' %)';
    const fl = x => x > 0 ? '▲' : x < 0 ? '▼' : '=';
    const cl = x => x > 0 ? 'iv-up' : x < 0 ? 'iv-down' : '';
    const opts = sid => clos.map(i => '<option value="' + esc(i.id) + '"' + (i.id === sid ? ' selected' : '') + '>' + esc(i.nom) + ' (' + fd(i.date_inventaire) + ')</option>').join('');
    let h = '<div class="card" style="margin-top:12px"><h2 style="margin-top:0">Comparer deux années</h2>' +
      '<div class="iv-bar"><label>De <select id="iv-ca">' + opts(A.id) + '</select></label><label>à <select id="iv-cb">' + opts(B.id) + '</select></label></div>' +
      '<div class="iv-verdict ' + cl(diff) + '"><b>' + fl(diff) + ' Valeur nette ' + (diff > 0 ? 'en hausse' : diff < 0 ? 'en baisse' : 'stable') + ' : ' + (diff > 0 ? '+' : '') + money(diff) + pct(pc) + '</b><br>' +
      '<span>Chiffre d’affaires : ' + money(B.ventes) + ' contre ' + money(A.ventes) + ' → ' + (dv > 0 ? '+' : '') + money(dv) + pct(pv) + '</span></div>' +
      '<div class="tw"><table class="iv-tbl"><thead><tr><th></th><th class="n">' + esc(A.nom) + '</th><th class="n">' + esc(B.nom) + '</th><th class="n">Écart</th></tr></thead><tbody>';
    const ligneC = (lbl, a, b, fort) => { const d = r2(b - a); return '<tr' + (fort ? ' class="iv-tot"' : '') + '><td>' + lbl + '</td><td class="n">' + money(a) + '</td><td class="n">' + money(b) + '</td><td class="n ' + cl(d) + '">' + (d > 0 ? '+' : '') + money(d) + '</td></tr>'; };
    ORDRE.filter(s => SEC[s].actif).forEach(s => { h += ligneC(SEC[s].l, ta.par[s], tb.par[s]); });
    h += ligneC('Total des actifs', ta.actifs, tb.actifs, true);
    ORDRE.filter(s => !SEC[s].actif).forEach(s => { h += ligneC(SEC[s].l, ta.par[s], tb.par[s]); });
    h += ligneC('Total des passifs', ta.passifs, tb.passifs, true) + ligneC('VALEUR NETTE', ta.net, tb.net, true) +
      ligneC('Ventes de la période', A.ventes, B.ventes) + ligneC('Achats de la période', A.achats, B.achats) + '</tbody></table></div>';
    // détail ligne par ligne
    h += '<h3 style="margin:16px 0 6px">Détail</h3><div class="iv-bar"><label>Section <select id="iv-csec">' + ORDRE.map(s => '<option value="' + s + '"' + (cmp.sec === s ? ' selected' : '') + '>' + SEC[s].l + '</option>').join('') + '</select></label></div>';
    const stock = STOCKS.includes(cmp.sec), m = new Map();
    const cle = l => l.ref_id ? 'r' + l.ref_id : 'n' + norm(l.libelle);
    linesOf(A.id).filter(l => l.section === cmp.sec).forEach(l => m.set(cle(l), { nom: l.libelle, a: l, b: null }));
    linesOf(B.id).filter(l => l.section === cmp.sec).forEach(l => { const x = m.get(cle(l)) || { nom: l.libelle, a: null, b: null }; x.b = l; m.set(cle(l), x); });
    const rows = [...m.values()].filter(x => (x.a && (Number(x.a.montant) || Number(x.a.quantite))) || (x.b && (Number(x.b.montant) || Number(x.b.quantite)))).sort((x, y) => Math.abs((y.b ? y.b.montant : 0) - (y.a ? y.a.montant : 0)) - Math.abs((x.b ? x.b.montant : 0) - (x.a ? x.a.montant : 0)));
    h += rows.length ? '<div class="tw"><table class="iv-tbl"><thead><tr><th>' + SEC[cmp.sec].l + '</th>' + (stock ? '<th class="n iv-opt">Qté ' + esc(A.nom) + '</th><th class="n iv-opt">Qté ' + esc(B.nom) + '</th>' : '') + '<th class="n">' + esc(A.nom) + '</th><th class="n">' + esc(B.nom) + '</th><th class="n">Écart</th></tr></thead><tbody>' +
      rows.map(x => { const a = x.a ? Number(x.a.montant) || 0 : 0, b = x.b ? Number(x.b.montant) || 0 : 0, d = r2(b - a); return '<tr><td><b>' + esc(x.nom) + '</b></td>' +
        (stock ? '<td class="n iv-opt">' + (x.a && x.a.quantite != null ? nf(x.a.quantite, 2) : '—') + '</td><td class="n iv-opt">' + (x.b && x.b.quantite != null ? nf(x.b.quantite, 2) : '—') + '</td>' : '') +
        '<td class="n">' + money(a) + '</td><td class="n">' + money(b) + '</td><td class="n ' + cl(d) + '">' + (d > 0 ? '+' : '') + money(d) + '</td></tr>'; }).join('') + '</tbody></table></div>' : '<div class="iv-empty">Rien à comparer dans cette section.</div>';
    h += '<p class="iv-help">Valeur nette = actifs − passifs. L’écart d’une année à l’autre ne tient pas compte des apports ou retraits d’argent du propriétaire, qui ne sont pas enregistrés dans la plateforme.</p></div>';
    return h;
  }

  /* ----- Éditeur d'un inventaire ----- */
  function editeur(i) {
    const lines = linesOf(i.id), t = totaux(lines), clos = ro(i), nc = nonComptes(lines).length;
    const ca = clos ? { ventes: Number(i.ventes), achats: Number(i.achats) } : caPeriode(i);
    let h = '<div class="at-actions" style="margin:0 0 10px"><button class="btn" type="button" id="inv-back">← Tous les inventaires</button><span style="margin-left:auto" class="iv-save" id="inv-save">' + esc(saveMsg) + '</span></div>';
    h += '<div class="card"><div class="at-actions" style="margin-top:0"><h2 style="margin-right:auto">' + esc(i.nom) + ' ' + badge(i) + '</h2></div>';
    h += '<div class="at-fields iv-head"><label>Nom<input id="inv-hnom" maxlength="80" value="' + esc(i.nom) + '"' + (clos ? ' disabled' : '') + '></label>' +
      '<label>Date de l’inventaire<input id="inv-hdate" type="date" value="' + esc(i.date_inventaire) + '"' + (clos ? ' disabled' : '') + '></label>' +
      '<label>Période couverte<input value="' + (i.debut_periode ? 'du ' + fd(i.debut_periode) + ' (exclu) ' : 'depuis le début ') + 'au ' + fd(i.date_inventaire) + '" disabled></label>' +
      '<label style="grid-column:1/-1">Note<input id="inv-hnotes" maxlength="200" value="' + esc(i.notes || '') + '"' + (clos ? ' disabled' : '') + '></label></div></div>';
    h += '<div class="at-stats iv-sum" id="inv-sum">' + resume(t, ca, clos) + '</div>';
    const cnt = s => lines.filter(l => l.section === s).length;
    const tabs = [['resume', 'Résumé'], ['matiere', 'Éléments' + (nonComptes(lines).filter(l => l.section === 'matiere').length ? ' ⚠' : '')], ['produit_fini', 'Produits finis' + (nonComptes(lines).filter(l => l.section === 'produit_fini').length ? ' ⚠' : '')], ['client', 'Clients'], ['fournisseur', 'Fournisseurs'], ['employe', 'Employés'], ['autre', 'Autres']];
    h += '<div class="at-tabs iv-tabs" id="inv-tabs">' + tabs.map(x => '<button type="button" data-tab="' + x[0] + '" class="' + (onglet === x[0] ? 'on' : '') + '">' + x[1] + '</button>').join('') + '</div>';
    h += '<div class="card" id="inv-pane">' + pane(i, lines) + '</div>';
    return h;
  }

  function resume(t, ca, clos) {
    return '<div class="at-stat"><span>Actifs</span><b>' + money(t.actifs) + '</b><small>ce que vous possédez ou qu’on vous doit</small></div>' +
      '<div class="at-stat"><span>Passifs</span><b>' + money(t.passifs) + '</b><small>ce que vous devez</small></div>' +
      '<div class="at-stat pd-total"><span>Valeur nette</span><b>' + money(t.net) + '</b><small>actifs − passifs</small></div>' +
      '<div class="at-stat"><span>Ventes de la période</span><b>' + money(ca.ventes) + '</b><small>achats : ' + money(ca.achats) + '</small></div>';
  }

  function pane(i, lines) {
    const clos = ro(i), d = clos ? ' disabled' : '';
    if (onglet === 'resume') return paneResume(i, lines);
    if (onglet === 'matiere' || onglet === 'produit_fini') return paneStock(i, lines.filter(l => l.section === onglet), onglet, clos);
    if (onglet === 'client' || onglet === 'fournisseur') return paneContacts(i, lines.filter(l => l.section === onglet), onglet, clos);
    if (onglet === 'employe') return paneEmployes(i, lines, clos);
    return paneAutres(i, lines, clos);
  }

  /* Résultat de l'année : valeur nette de cet inventaire − valeur nette de l'inventaire précédent (clôturé),
     avec le détail de l'activité de la période (chiffre d'affaires, coût des produits vendus, marge, achats, charges). */
  function resultatAnnee(i, lines) {
    const prev = precedent(i.date_inventaire, i.id), t = totaux(lines);
    if (!prev) return '<div class="card iv-res"><h2 style="margin-top:0">Inventaire d’ouverture</h2><p class="iv-help" style="margin:0">C’est le <b>point de départ</b> : valeur nette de départ <b>' + money(t.net) + '</b>. À l’inventaire suivant (dans un an), la plateforme comparera les deux et vous dira si vous avez <b>gagné ou perdu</b>, avec votre chiffre d’affaires de l’année.</p></div>';
    const tp = totaux(linesOf(prev.id)), varia = r2(t.net - tp.net), P = { depuis: prev.date_inventaire, jusqua: i.date_inventaire };
    const ops = window.PartAPI ? PartAPI.ops(P) : [], ventes = r2(ops.filter(o => o.sens === 'vente').reduce((x, o) => x + o.montant, 0)), achats = r2(ops.filter(o => o.sens === 'achat').reduce((x, o) => x + o.montant, 0));
    let cpv = 0, sans = 0;
    if (window.PFAPI) { const pr = new Map(PFAPI.produits().map(p => [String(p.id), p])); PFAPI.mouvements().forEach(m => { const d = String(m.date_mvt || ''); if ((m.type !== 'livraison' && m.type !== 'retour') || d <= P.depuis || d > P.jusqua) return; const p = pr.get(String(m.produit_id)), c = p ? Number(PFAPI.coutProduit(p)) || 0 : 0; if (!c) sans++; cpv += c * -(Number(m.quantite) || 0); }); }
    cpv = r2(cpv);
    const charges = r2(CHG.filter(c => String(c.date_charge) > P.depuis && String(c.date_charge) <= P.jusqua).reduce((x, c) => x + Number(c.montant || 0), 0));
    const gagne = varia >= 0;
    const lig = (a, b, cls) => '<tr><td>' + a + '</td><td class="n' + (cls ? ' ' + cls : '') + '">' + b + '</td></tr>';
    return '<div class="card iv-res"><h2 style="margin-top:0">Résultat de l’année : ' + esc(prev.nom) + ' → ' + esc(i.nom) + '</h2>' +
      '<div class="iv-verdict ' + (gagne ? 'ok' : 'ko') + '">' + (gagne ? '✔ Vous avez GAGNÉ ' : '✘ Vous avez PERDU ') + money(Math.abs(varia)) + '<small>valeur nette : ' + money(tp.net) + ' (' + fd(prev.date_inventaire) + ') → ' + money(t.net) + ' (' + fd(i.date_inventaire) + ')</small></div>' +
      '<div class="tw"><table class="iv-tbl"><tbody>' +
      lig('<b>Chiffre d’affaires de la période</b> (ventes − retours − remises)', '<b>' + money(ventes) + '</b>') +
      lig('Coût des produits vendus (prix d’achat ou de fabrication)' + (sans ? ' <small>⚠ ' + sans + ' vente(s) sans coût</small>' : ''), '− ' + money(cpv)) +
      lig('<b>Marge sur les ventes</b>', '<b>' + money(r2(ventes - cpv)) + '</b>' + (ventes ? ' <small>(' + Math.round((ventes - cpv) / ventes * 100) + ' %)</small>' : ''), ventes - cpv >= 0 ? 'py-av' : 'py-due') +
      lig('Achats de la période (matières, produits)', money(achats)) +
      lig('Charges de la période (paie, loyer, électricité…)', money(charges)) +
      lig('Évolution du stock (éléments + produits finis)', money(r2(t.par.matiere + t.par.produit_fini - tp.par.matiere - tp.par.produit_fini))) +
      lig('Évolution des créances (clients, prêts accordés, avances)', money(r2(t.par.client + t.par.employe_creance + t.par.autre_actif - tp.par.client - tp.par.employe_creance - tp.par.autre_actif))) +
      lig('Évolution des dettes (fournisseurs, ateliers, prêts reçus)', money(r2(t.passifs - tp.passifs))) +
      '<tr class="iv-tot iv-net"><td>RÉSULTAT DE L’ANNÉE (variation de la valeur nette)</td><td class="n">' + (gagne ? '+ ' : '− ') + money(Math.abs(varia)) + '</td></tr></tbody></table></div>' +
      '<p class="iv-help">Le résultat est la différence entre ce que possède l’atelier (stock, créances, trésorerie) moins ce qu’il doit, d’un inventaire à l’autre. Si vous avez retiré de l’argent pour vous-même ou en avez apporté pendant l’année, tenez-en compte.</p></div>';
  }
  function paneResume(i, lines) {
    const t = totaux(lines), clos = ro(i), nc = nonComptes(lines);
    let h = resultatAnnee(i, lines) + '<div class="at-actions" style="margin-top:0"><h2 style="margin:0 auto 0 0">Résumé détaillé</h2>' + (clos ? '' : '<button class="btn s p" type="button" id="inv-sync">↻ Synchroniser avec le Stock actuel</button><button class="btn s" type="button" id="inv-fin">↻ Mettre à jour créances et dettes</button>') + '</div><div class="tw"><table class="iv-tbl"><thead><tr><th>Rubrique</th><th class="n">Lignes</th><th class="n">Montant</th></tr></thead><tbody>';
    h += '<tr class="iv-sec"><td colspan="3">ACTIFS</td></tr>' + ORDRE.filter(s => SEC[s].actif).map(s => '<tr><td>' + SEC[s].l + '</td><td class="n">' + lines.filter(l => l.section === s).length + '</td><td class="n">' + money(t.par[s]) + '</td></tr>').join('') +
      '<tr class="iv-tot"><td colspan="2">Total des actifs</td><td class="n">' + money(t.actifs) + '</td></tr>' +
      '<tr class="iv-sec"><td colspan="3">PASSIFS</td></tr>' + ORDRE.filter(s => !SEC[s].actif).map(s => '<tr><td>' + SEC[s].l + '</td><td class="n">' + lines.filter(l => l.section === s).length + '</td><td class="n">' + money(t.par[s]) + '</td></tr>').join('') +
      '<tr class="iv-tot"><td colspan="2">Total des passifs</td><td class="n">' + money(t.passifs) + '</td></tr>' +
      '<tr class="iv-tot iv-net"><td colspan="2">VALEUR NETTE</td><td class="n">' + money(t.net) + '</td></tr></tbody></table></div>';
    const ecart = lines.filter(l => STOCKS.includes(l.section) && l.quantite != null && l.quantite_theorique != null && r4(l.quantite) !== r4(l.quantite_theorique));
    if (!clos) {
      h += '<div class="iv-check"><b>Avant de clôturer :</b><ul>' +
        '<li class="' + (nc.length ? 'ko' : 'ok') + '">' + (nc.length ? nc.length + ' élément(s) / produit(s) pas encore comptés' : 'Tout le stock est compté') + '</li>' +
        '<li>' + ecart.length + ' écart(s) entre le stock compté et le stock de la plateforme</li></ul></div>';
      const passe = i.date_inventaire < iso(new Date());
      h += '<label class="st-check"><input id="inv-apply" type="checkbox"' + (passe ? '' : ' checked') + '> Ramener le stock de la plateforme aux quantités comptées (corrige les écarts)</label>' +
        (passe ? '<p class="iv-help iv-warn">L’inventaire est daté du passé : si des entrées ou sorties ont eu lieu depuis, laissez cette case décochée.</p>' : '') +
        '<div class="at-actions"><button class="btn p" type="button" id="inv-close">Clôturer l’inventaire</button><button class="btn" type="button" id="inv-fiche">Fiche de comptage (PDF)</button><button class="btn" type="button" id="inv-xls">Exporter Excel</button><button class="btn" type="button" id="inv-pdf">Rapport PDF</button></div>' +
        '<label class="st-check"><input id="inv-fshow" type="checkbox"> Afficher le stock de la plateforme sur la fiche de comptage <small>(décoché = comptage à l’aveugle)</small></label>';
    } else {
      h += '<p class="iv-help">Clôturé le ' + fd(String(i.cloture_le || '').slice(0, 10)) + (i.stock_applique ? ' · le stock a été corrigé d’après les quantités comptées.' : '.') + ' Les chiffres sont figés.</p>' +
        '<div class="at-actions"><button class="btn" type="button" id="inv-xls">Exporter Excel</button><button class="btn" type="button" id="inv-pdf">Rapport PDF</button><button class="btn" type="button" id="inv-reopen">Rouvrir pour corriger</button></div>';
    }
    return h;
  }

  function paneStock(i, lines, sec, clos) {
    const pf = sec === 'produit_fini', d = clos ? ' disabled' : '', nc = lines.filter(l => l.quantite == null).length;
    let h = '<div class="at-actions" style="margin-top:0"><h2 style="margin-right:auto">' + (pf ? 'Produits finis en stock' : 'Éléments de production en stock') + '</h2>' +
      (!clos ? '<button class="btn s p" type="button" data-trouve="' + sec + '">+ ' + (pf ? 'Produit' : 'Élément') + ' trouvé au dépôt</button>' : '') +
      (!clos ? '<button class="btn s p" type="button" id="inv-sync" title="Reprend la quantité et le prix actuels du Stock pour tous les éléments et produits finis">↻ Synchroniser avec le Stock actuel</button>' : '') +
      (!clos && nc ? '<button class="btn s" type="button" id="inv-same">Compter comme le système (' + nc + ' ligne' + (nc > 1 ? 's' : '') + ' vide' + (nc > 1 ? 's' : '') + ')</button>' : '') + '</div>' +
      '<p class="iv-help">' + (pf ? 'Comptez les pièces finies réellement présentes. Valorisation au <b>coût de revient</b> (modifiable).' : 'Comptez ce qui est réellement dans l’atelier. Pour un rouleau : nombre de rouleaux entiers + mètres restants. Valorisation au <b>prix d’achat</b> (modifiable).') + ' Une ligne <b>vide</b> = pas encore comptée ; tapez 0 s’il n’y en a plus.</p>';
    if (!lines.length) return h + '<div class="iv-empty">Aucune ligne.</div>';
    h += '<div class="tw"><table class="iv-tbl iv-in"><thead><tr><th>' + (pf ? 'Produit' : 'Élément') + '</th><th class="n">Selon la plateforme</th><th>Compté</th><th class="n">Écart</th><th>' + (pf ? 'Coût / pièce' : 'Prix') + ' (DA)</th><th class="n">Valeur</th></tr></thead><tbody>';
    let cat = null;
    h += lines.map(l => {
      const sep = !pf && l.detail !== cat ? (cat = l.detail, '<tr class="iv-sec"><td colspan="6">' + esc(l.detail) + '</td></tr>') : '';
      return sep + ligneStock(l, clos);
    }).join('') + '</tbody></table></div>';
    return h;
  }
  function ligneStock(l, clos) {
    const d = clos ? ' disabled' : '', cond = Number(l.cond_qte) > 0 && l.cond_nom, pf = l.section === 'produit_fini';
    const q = l.quantite == null ? null : Number(l.quantite);
    let cnt;
    if (cond) {
      const r = q == null ? '' : Math.floor(r4(q / l.cond_qte)), rest = q == null ? '' : r4(q - r * l.cond_qte);
      cnt = '<span class="iv-pair"><input class="iv-q" data-f="r" type="number" min="0" step="1" inputmode="numeric" value="' + r + '" placeholder="0"' + d + '><i>' + esc(l.cond_nom) + '(s)</i> <input class="iv-q" data-f="m" type="number" min="0" step="any" inputmode="decimal" value="' + rest + '" placeholder="0"' + d + '><i>' + esc(l.unite) + '</i></span>';
    } else cnt = '<span class="iv-pair"><input class="iv-q" data-f="q" type="number" min="0" step="' + (pf ? '1' : 'any') + '" inputmode="decimal" value="' + (q == null ? '' : q) + '" placeholder="à compter"' + d + '><i>' + esc(l.unite) + '</i></span>';
    const prix = cond ? r2(Number(l.prix_unitaire) * Number(l.cond_qte)) : Number(l.prix_unitaire);
    const th = l.quantite_theorique == null ? '—' : (cond ? nf(l.quantite_theorique, 2) + ' ' + esc(l.unite) + '<small>≈ ' + nf(l.quantite_theorique / l.cond_qte, 2) + ' ' + esc(l.cond_nom) + '</small>' : nf(l.quantite_theorique, 2) + ' ' + esc(l.unite));
    return '<tr data-l="' + esc(l.id) + '"><td><b>' + esc(l.libelle) + '</b>' + (pf && Number(l.prix_vente) ? '<small>vente ' + money(l.prix_vente) + '</small>' : '') + '</td><td class="n">' + th + '</td><td>' + cnt + (clos ? '' : ' <button class="iv-eq" type="button" data-same="' + esc(l.id) + '" title="Compter comme le système">=</button>') + '</td>' +
      '<td class="n iv-ecart">' + ecartTxt(l) + '</td>' +
      '<td><input class="iv-p" data-f="' + (cond ? 'pc' : 'pu') + '" type="number" min="0" step="any" inputmode="decimal" value="' + (prix || '') + '" placeholder="0"' + d + '>' + (cond ? '<small>par ' + esc(l.cond_nom) + '</small>' : '') + '</td><td class="n iv-val">' + (l.quantite == null ? '<small>à compter</small>' : money(l.montant)) + '</td></tr>';
  }
  function ecartTxt(l) {
    if (l.quantite == null || l.quantite_theorique == null) return '—';
    const e = r4(Number(l.quantite) - Number(l.quantite_theorique));
    return e === 0 ? '<span class="iv-ok">0</span>' : '<span class="' + (e > 0 ? 'iv-up' : 'iv-down') + '">' + (e > 0 ? '+' : '') + nf(e, 2) + '</span>';
  }

  function paneContacts(i, lines, sec, clos) {
    const cl = sec === 'client', d = clos ? ' disabled' : '';
    const ops = window.PartAPI ? PartAPI.ops(periode(i)).filter(o => o.sens === (cl ? 'vente' : 'achat')) : [];
    const refP = id => r2(ops.filter(o => String(o.id) === String(id)).reduce((s, o) => s + o.montant, 0));
    let h = '<h2 style="margin-top:0">' + (cl ? 'Crédits clients : ce que vos clients vous doivent encore' : 'Crédits fournisseurs : ce que vous devez encore à vos fournisseurs') + '</h2>' +
      '<p class="iv-help">Saisissez, pour chacun, le <b>montant restant à ' + (cl ? 'encaisser' : 'payer') + '</b> à la date de l’inventaire (0 si tout est réglé). Le montant est <b>prérempli avec le solde calculé</b> d’après vos ventes, achats et paiements (Contacts › Paiements et soldes) : vérifiez-le et corrigez si besoin.</p>';
    h += lines.length ? '<div class="tw"><table class="iv-tbl iv-in"><thead><tr><th>' + (cl ? 'Client' : 'Fournisseur') + '</th><th class="n iv-opt">' + (cl ? 'Ventes' : 'Achats') + ' de la période</th><th>Montant restant (DA)</th><th></th></tr></thead><tbody>' +
      lines.map(l => '<tr data-l="' + esc(l.id) + '"><td><b>' + esc(l.libelle) + '</b></td><td class="n iv-opt">' + (l.ref_id ? money(refP(l.ref_id)) : '—') + '</td><td><input class="iv-p" data-f="mt" type="number" min="0" step="any" inputmode="decimal" value="' + (Number(l.montant) || '') + '" placeholder="0"' + d + '></td><td class="n">' + (clos ? '' : '<button class="btn s" type="button" data-rm="' + esc(l.id) + '">Retirer</button>') + '</td></tr>').join('') + '</tbody></table></div>' : '<div class="iv-empty">Aucun ' + (cl ? 'client' : 'fournisseur') + ' dans cette liste.</div>';
    if (!clos) {
      const dej = new Set(lines.map(l => String(l.ref_id)));
      const cs = (typeof D !== 'undefined' ? D : []).filter(c => c.type === (cl ? 'Client' : 'Fournisseur') && !dej.has(String(c.id))).sort((a, b) => PartAPI.label(a).localeCompare(PartAPI.label(b), 'fr'));
      h += '<div class="iv-bar"><label>Ajouter ' + (cl ? 'un client' : 'un fournisseur') + ' <select id="inv-addc" data-sec="' + sec + '"><option value="">— choisir —</option>' + cs.map(c => '<option value="' + esc(c.id) + '">' + esc(PartAPI.label(c)) + '</option>').join('') + '</select></label></div>';
    }
    return h;
  }

  function paneEmployes(i, lines, clos) {
    const d = clos ? ' disabled' : '';
    const refs = []; lines.filter(l => l.section === 'employe_creance' || l.section === 'employe_dette').forEach(l => { const k = String(l.ref_id || norm(l.libelle)); if (!refs.some(r => r.k === k)) refs.push({ k, ref: l.ref_id, nom: l.libelle }); });
    const ac = (typeof ACOMPTES !== 'undefined' ? ACOMPTES : []);
    const acP = id => r2(ac.filter(a => String(a.employe_id) === String(id) && String(a.date_acompte || '') > (i.debut_periode || '') && String(a.date_acompte || '') <= i.date_inventaire).reduce((s, a) => s + (Number(a.montant) || 0), 0));
    let h = '<h2 style="margin-top:0">Crédits avec les employés (hors travail)</h2><p class="iv-help"><b>Il nous doit</b> : avance ou prêt non remboursé. <b>Nous lui devons</b> : salaire, prime ou autre somme impayée. Mettez 0 si rien.</p>';
    h += refs.length ? '<div class="tw"><table class="iv-tbl iv-in"><thead><tr><th>Employé</th><th class="n iv-opt">Acomptes de la période</th><th>Il nous doit (DA)</th><th>Nous lui devons (DA)</th></tr></thead><tbody>' +
      refs.map(r => { const c = lines.find(l => l.section === 'employe_creance' && String(l.ref_id || norm(l.libelle)) === r.k), dt = lines.find(l => l.section === 'employe_dette' && String(l.ref_id || norm(l.libelle)) === r.k);
        const cell = (l, sec) => l ? '<input class="iv-p" data-l="' + esc(l.id) + '" data-f="mt" type="number" min="0" step="any" inputmode="decimal" value="' + (Number(l.montant) || '') + '" placeholder="0"' + d + '>' : (clos ? '—' : '<button class="btn s" type="button" data-addemp="' + esc(r.ref || '') + '" data-sec="' + sec + '" data-nom="' + esc(r.nom) + '">Ajouter</button>');
        return '<tr><td><b>' + esc(r.nom) + '</b></td><td class="n iv-opt">' + (r.ref ? money(acP(r.ref)) : '—') + '</td><td>' + cell(c, 'employe_creance') + '</td><td>' + cell(dt, 'employe_dette') + '</td></tr>'; }).join('') + '</tbody></table></div>' : '<div class="iv-empty">Aucun employé.</div>';
    if (!clos) {
      const dej = new Set(refs.map(r => String(r.ref)));
      const es = (typeof EMPLOYES !== 'undefined' ? EMPLOYES : []).filter(e => !dej.has(String(e.id)));
      if (es.length) h += '<div class="iv-bar"><label>Ajouter un employé <select id="inv-adde"><option value="">— choisir —</option>' + es.map(e => '<option value="' + esc(e.id) + '">' + esc([e.prenom, e.nom].filter(Boolean).join(' ')) + '</option>').join('') + '</select></label></div>';
    }
    return h;
  }

  function paneAutres(i, lines, clos) {
    const d = clos ? ' disabled' : '';
    const bloc = (sec, titre, aide) => { const ls = lines.filter(l => l.section === sec);
      return '<h3 style="margin:14px 0 4px">' + titre + '</h3><p class="iv-help">' + aide + '</p>' + (ls.length ? '<div class="tw"><table class="iv-tbl iv-in"><thead><tr><th>Libellé</th><th>Montant (DA)</th><th>Note</th><th></th></tr></thead><tbody>' +
        ls.map(l => '<tr data-l="' + esc(l.id) + '"><td><input class="iv-t" data-f="lb" maxlength="120" value="' + esc(l.libelle) + '" placeholder="Libellé"' + d + '></td><td><input class="iv-p" data-f="mt" type="number" min="0" step="any" inputmode="decimal" value="' + (Number(l.montant) || '') + '" placeholder="0"' + d + '></td><td><input class="iv-t" data-f="nt" maxlength="200" value="' + esc(l.note || '') + '" placeholder="Facultatif"' + d + '></td><td class="n">' + (clos ? '' : '<button class="btn s" type="button" data-rm="' + esc(l.id) + '">Retirer</button>') + '</td></tr>').join('') + '</tbody></table></div>' : '<div class="iv-empty">Aucune ligne.</div>') +
        (clos ? '' : '<div class="at-actions"><button class="btn s" type="button" data-addo="' + sec + '">+ Ajouter une ligne</button></div>'); };
    return '<h2 style="margin-top:0">Autres créances, trésorerie et dettes</h2>' +
      bloc('autre_actif', 'À recevoir ou disponible', 'Caisse, banque, autres crédits qu’on vous doit, matériel de valeur, dépôts… (en positif).') +
      bloc('autre_passif', 'À payer', 'Crédit bancaire, loyer ou charges impayés, dette de matériel, autres crédits que vous devez.');
  }

  /* ---------- Mises à jour légères (sans perdre le curseur) ---------- */
  function majTotaux() {
    const i = inv(sel); if (!i) return;
    const t = totaux(linesOf(i.id)), ca = ro(i) ? { ventes: Number(i.ventes), achats: Number(i.achats) } : caPeriode(i);
    const e = $('#inv-sum'); if (e) e.innerHTML = resume(t, ca, ro(i));
  }
  function onInput(e) {
    const el = e.target, f = el.dataset.f, tr = el.closest('[data-l]'); if (!f || !tr && !el.dataset.l) return;
    const id = (tr || el).dataset.l, l = ligne(id); if (!l || ro(inv(l.inventaire_id))) return;
    if (f === 'q' || f === 'r' || f === 'm') {
      let q;
      if (f === 'q') q = el.value === '' ? null : num(el.value);
      else { const r = tr.querySelector('[data-f=r]').value, m = tr.querySelector('[data-f=m]').value; q = r === '' && m === '' ? null : r4((num(r) || 0) * Number(l.cond_qte) + (num(m) || 0)); }
      if (q != null && q < 0) q = 0;
      l.quantite = q == null ? null : (l.section === 'produit_fini' ? Math.round(q) : r4(q));
    } else if (f === 'pu' || f === 'pc') {
      const v = Math.max(0, num(el.value) || 0); l.prix_unitaire = f === 'pc' ? v / Number(l.cond_qte) : v;
    } else if (f === 'mt') l.montant = Math.max(0, num(el.value) || 0);
    else if (f === 'lb') l.libelle = el.value;
    else if (f === 'nt') l.note = el.value;
    recalc(l);
    if (STOCKS.includes(l.section) && tr) {
      tr.querySelector('.iv-ecart').innerHTML = ecartTxt(l);
      tr.querySelector('.iv-val').innerHTML = l.quantite == null ? '<small>à compter</small>' : money(l.montant);
    }
    dirty.add(String(id)); schedule(); majTotaux();
  }

  /* ---------- Exports ---------- */
  function exporter() {
    const i = inv(sel); if (!i) return;
    if (typeof XLSX === 'undefined') { say('Export indisponible.'); return; }
    const lines = linesOf(i.id), t = totaux(lines), wb = XLSX.utils.book_new();
    const ca = ro(i) ? { ventes: Number(i.ventes), achats: Number(i.achats) } : caPeriode(i);
    const res = [['Inventaire', i.nom], ['Date', fd(i.date_inventaire)], ['Statut', i.statut === 'cloture' ? 'Clôturé' : 'En cours'], [], ['Rubrique', 'Montant (DA)']]
      .concat(ORDRE.filter(s => SEC[s].actif).map(s => [SEC[s].l, t.par[s]])).concat([['TOTAL ACTIFS', t.actifs]])
      .concat(ORDRE.filter(s => !SEC[s].actif).map(s => [SEC[s].l, t.par[s]])).concat([['TOTAL PASSIFS', t.passifs], ['VALEUR NETTE', t.net], [], ['Ventes de la période', ca.ventes], ['Achats de la période', ca.achats]]);
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(res), 'Résumé');
    const feuille = (sec, nom) => {
      const ls = lines.filter(l => l.section === sec); if (!ls.length) return;
      const rows = STOCKS.includes(sec) ? ls.map(l => ({ Libellé: l.libelle, Catégorie: l.detail, Unité: l.unite, 'Selon la plateforme': l.quantite_theorique, Compté: l.quantite, Écart: l.quantite == null || l.quantite_theorique == null ? '' : r4(l.quantite - l.quantite_theorique), 'Prix unitaire (DA)': r2(l.prix_unitaire), 'Valeur (DA)': l.montant }))
        : ls.map(l => ({ Libellé: l.libelle, 'Montant (DA)': l.montant, Note: l.note || '' }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), nom);
    };
    feuille('matiere', 'Éléments'); feuille('produit_fini', 'Produits finis'); feuille('client', 'Clients'); feuille('fournisseur', 'Fournisseurs');
    feuille('employe_creance', 'Employés (ils nous doivent)'); feuille('employe_dette', 'Employés (nous leur devons)'); feuille('autre_actif', 'Autres à recevoir'); feuille('autre_passif', 'Autres à payer');
    XLSX.writeFile(wb, 'inventaire-' + norm(i.nom).replace(/[^a-z0-9]+/g, '-') + '.xlsx');
  }
  const pdfT = s => String(s ?? '').replace(/œ/g, 'oe').replace(/Œ/g, 'OE').replace(/[  ]/g, ' ');
  function pdf() {
    const i = inv(sel); if (!i) return;
    if (!(window.jspdf && window.jspdf.jsPDF)) { say('Bibliothèque PDF non chargée.'); return; }
    const lines = linesOf(i.id), t = totaux(lines), doc = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4' }), M = 14, W = doc.internal.pageSize.getWidth();
    const ca = ro(i) ? { ventes: Number(i.ventes), achats: Number(i.achats) } : caPeriode(i);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(17); doc.text(pdfT('INVENTAIRE - ' + i.nom), M, 18);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(90); doc.text(pdfT('MARIA BAG - au ' + fd(i.date_inventaire) + ' - ' + (i.statut === 'cloture' ? 'Cloture' : 'En cours (brouillon)')), M, 25);
    doc.setTextColor(0);
    const body = [['ACTIFS', '']].concat(ORDRE.filter(s => SEC[s].actif).map(s => [SEC[s].l, money(t.par[s])])).concat([['Total des actifs', money(t.actifs)], ['PASSIFS', '']])
      .concat(ORDRE.filter(s => !SEC[s].actif).map(s => [SEC[s].l, money(t.par[s])])).concat([['Total des passifs', money(t.passifs)], ['VALEUR NETTE', money(t.net)], ['Ventes de la periode', money(ca.ventes)], ['Achats de la periode', money(ca.achats)]]);
    doc.autoTable({ startY: 32, margin: { left: M, right: M }, head: [[pdfT('Rubrique'), pdfT('Montant')]], body: body.map(r => r.map(pdfT)), theme: 'grid', styles: { fontSize: 10, cellPadding: 2.5, textColor: 0, lineColor: 0, lineWidth: 0.2 }, headStyles: { fillColor: [0, 0, 0] }, columnStyles: { 1: { halign: 'right' } } });
    [['matiere', 'Elements de production'], ['produit_fini', 'Produits finis']].forEach(([sec, titre]) => {
      const ls = lines.filter(l => l.section === sec); if (!ls.length) return;
      doc.addPage(); doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.text(pdfT(titre), M, 16);
      doc.autoTable({ startY: 20, margin: { left: M, right: M }, head: [['Libelle', 'Plateforme', 'Compte', 'Ecart', 'Prix', 'Valeur'].map(pdfT)],
        body: ls.map(l => [l.libelle, l.quantite_theorique == null ? '' : nf(l.quantite_theorique, 2), l.quantite == null ? '' : nf(l.quantite, 2), l.quantite == null || l.quantite_theorique == null ? '' : nf(r4(l.quantite - l.quantite_theorique), 2), nf(l.prix_unitaire, 2), nf(l.montant, 2)].map(pdfT)),
        theme: 'grid', styles: { fontSize: 8.5, cellPadding: 1.8, textColor: 0, lineColor: 120, lineWidth: 0.1 }, headStyles: { fillColor: [0, 0, 0] }, columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' } } });
    });
    const autres = [['client', 'Credits clients'], ['fournisseur', 'Credits fournisseurs'], ['employe_creance', 'Employes : ils nous doivent'], ['employe_dette', 'Employes : nous leur devons'], ['autre_actif', 'Autres a recevoir / disponible'], ['autre_passif', 'Autres a payer']];
    doc.addPage(); let y = 16;
    autres.forEach(([sec, titre]) => {
      const ls = lines.filter(l => l.section === sec && Number(l.montant) > 0); if (!ls.length) return;
      doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.text(pdfT(titre), M, y);
      doc.autoTable({ startY: y + 3, margin: { left: M, right: M }, head: [['Libelle', 'Montant'].map(pdfT)], body: ls.map(l => [l.libelle, money(l.montant)].map(pdfT)), theme: 'grid', styles: { fontSize: 9.5, cellPadding: 2, textColor: 0, lineColor: 120, lineWidth: 0.1 }, headStyles: { fillColor: [0, 0, 0] }, columnStyles: { 1: { halign: 'right' } } });
      y = doc.lastAutoTable.finalY + 9; if (y > 265) { doc.addPage(); y = 16; }
    });
    doc.save('inventaire-' + norm(i.nom).replace(/[^a-z0-9]+/g, '-') + '.pdf');
  }

  /* ---------- Fiche de comptage (PDF à imprimer et remplir à la main dans l'atelier) ---------- */
  function elementsFiche() {
    const i = sel ? inv(sel) : null;
    if (i) return linesOf(i.id).filter(l => STOCKS.includes(l.section)).map(l => ({ sec: l.section, cat: l.section === 'produit_fini' ? 'Produits finis' : l.detail || 'Autres', nom: l.libelle, unite: l.unite, cond_nom: l.cond_nom, cond_qte: Number(l.cond_qte) || 0, theo: l.quantite_theorique }));
    const m = (window.StockAPI ? StockAPI.list() : []).map(a => { const c = StockAPI.aCond(a); return { sec: 'matiere', cat: a.categorie, nom: a.nom, unite: a.unite, cond_nom: c ? a.cond_nom : '', cond_qte: c ? StockAPI.condQte(a) : 0, theo: StockAPI.qty(a.id) }; });
    const p = (window.PFAPI ? PFAPI.produits() : []).map(x => ({ sec: 'produit_fini', cat: 'Produits finis', nom: x.nom, unite: 'pcs', cond_nom: '', cond_qte: 0, theo: PFAPI.qty(x.id) }));
    return m.concat(p);
  }
  function ficheComptage() {
    if (!(window.jspdf && window.jspdf.jsPDF)) { say('Bibliothèque PDF non chargée.'); return; }
    const items = elementsFiche();
    if (!items.length) { say('Aucun élément ni produit à compter. Ajoutez-les d’abord dans le Stock.'); return; }
    const montrer = !!($('#inv-fshow') && $('#inv-fshow').checked), i = sel ? inv(sel) : null;
    const doc = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4' }), M = 12, W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight();
    doc.setFont('helvetica', 'bold'); doc.setFontSize(17); doc.text(pdfT('FICHE DE COMPTAGE - INVENTAIRE'), M, 16);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(90);
    doc.text(pdfT('MARIA BAG' + (i ? ' - ' + i.nom : '') + ' - imprimee le ' + fd(iso(new Date()))), M, 22);
    doc.setTextColor(0); doc.setFontSize(10);
    doc.text(pdfT('Compte par : ......................................'), M, 31); doc.text(pdfT('Date du comptage : ....... / ....... / ...........'), W / 2 + 4, 31);
    doc.setFontSize(9); doc.setTextColor(90);
    doc.text(pdfT('Comptez ce qui est reellement dans l\'atelier. Rouleau de tissu : rouleaux entiers + metres restants. Ecrivez 0 s\'il n\'y en a plus.'), M, 37);
    doc.setTextColor(0);
    let y = 47, n = 0;
    const bloc = (titre, liste, pf) => {
      if (!liste.length) return;
      const cats = [...new Set(liste.map(x => x.cat))];
      const body = [];
      cats.forEach(c => {
        if (!pf) body.push([{ content: pdfT(c.toUpperCase()), colSpan: montrer ? 7 : 6, styles: { fillColor: [235, 230, 230], fontStyle: 'bold', textColor: 40 } }]);
        liste.filter(x => x.cat === c).sort((a, b) => a.nom.localeCompare(b.nom, 'fr')).forEach(x => {
          n++;
          const cond = x.cond_qte > 0 && x.cond_nom;
          const how = pf ? 'pieces' : cond ? x.cond_nom + 's (= ' + nf(x.cond_qte, 2) + ' ' + x.unite + ') + reste en ' + x.unite : x.unite === 'pcs' ? 'pieces' : x.unite;
          const row = pf ? [String(n), x.nom, ''] : [String(n), x.nom, how, cond ? '' : '-', ''];
          if (montrer) row.push(x.theo == null ? '' : nf(x.theo, 2) + ' ' + (x.unite === 'pcs' ? 'pcs' : x.unite));
          row.push('');
          body.push(row.map(c2 => typeof c2 === 'string' ? pdfT(c2) : c2));
        });
      });
      doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.text(pdfT(titre), M, y);
      const head = pf ? ['N°', 'Designation', 'Pieces comptees'] : ['N°', 'Designation', 'Comment compter', 'Rouleaux entiers', 'Metres / pieces']; if (montrer) head.push('Selon la plateforme'); head.push('Remarques');
      doc.autoTable({
        startY: y + 3, margin: { left: M, right: M, bottom: 14 }, head: [head.map(pdfT)], body,
        theme: 'grid', styles: { font: 'helvetica', fontSize: 9, cellPadding: { top: 2.6, bottom: 2.6, left: 2, right: 2 }, textColor: 0, lineColor: 120, lineWidth: 0.15, minCellHeight: 9.5, valign: 'middle' },
        headStyles: { fillColor: [0, 0, 0], textColor: 255, fontSize: 8.5 },
        columnStyles: pf ? { 0: { cellWidth: 9 }, 2: { cellWidth: 34 }, 3: { cellWidth: montrer ? 34 : 'auto' } } : montrer ? { 0: { cellWidth: 9 }, 2: { cellWidth: 38 }, 3: { cellWidth: 22 }, 4: { cellWidth: 26 }, 5: { cellWidth: 24 } } : { 0: { cellWidth: 9 }, 2: { cellWidth: 40 }, 3: { cellWidth: 25 }, 4: { cellWidth: 28 } },
        didParseCell: d => { if (d.section === 'body' && d.cell.raw === '-') { d.cell.text = ['']; d.cell.styles.fillColor = [225, 225, 225]; } }
      });
      y = doc.lastAutoTable.finalY + 10; if (y > H - 40) { doc.addPage(); y = 16; }
    };
    bloc('1. ELEMENTS DE PRODUCTION', items.filter(x => x.sec === 'matiere'), false);
    bloc('2. PRODUITS FINIS', items.filter(x => x.sec === 'produit_fini'), true);
    const pages = doc.internal.getNumberOfPages();
    for (let k = 1; k <= pages; k++) { doc.setPage(k); doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(110); doc.text(pdfT('Fiche de comptage - MARIA BAG - page ' + k + ' / ' + pages), W / 2, H - 7, { align: 'center' }); }
    doc.save('fiche-de-comptage-' + iso(new Date()) + '.pdf');
  }

  /* ---------- Événements ---------- */
  document.addEventListener('click', async e => {
    const root = $('#inv-root'); if (!root || !root.contains(e.target)) return;
    const t = e.target;
    if (t.closest('#inv-new')) { nouveau = true; render(); const n = $('#inv-nnom'); if (n) n.focus(); return; }
    if (t.closest('#inv-ncancel')) { nouveau = false; render(); return; }
    const del = t.closest('[data-del]'); if (del) { await supprimer(del.dataset.del); return; }
    const op = t.closest('[data-open]'); if (op) { sel = op.dataset.open; onglet = 'resume'; saveMsg = ''; render(); window.scrollTo(0, 0); completer(sel); return; }
    if (t.closest('#inv-back')) { sel = null; render(); flush(); return; }
    const tab = t.closest('#inv-tabs [data-tab]'); if (tab) { onglet = tab.dataset.tab; render(); flush(); return; }
    if (t.closest('#inv-close')) { await cloturer(); return; }
    if (t.closest('#inv-reopen')) { await rouvrir(); return; }
    if (t.closest('#inv-xls')) { exporter(); return; }
    if (t.closest('#inv-pdf')) { pdf(); return; }
    if (t.closest('#inv-fiche')) { ficheComptage(); return; }
    const same = t.closest('[data-same]');
    if (same) { const l = ligne(same.dataset.same); if (l && l.quantite_theorique != null) { l.quantite = Math.max(0, l.quantite_theorique); recalc(l); dirty.add(String(l.id)); schedule(); render(); } return; }
    if (t.closest('#inv-fin')) { const b = t.closest('#inv-fin'); b.disabled = true; try { await majFinancier(sel); } finally { b.disabled = false; } return; }
    const tv = t.closest('[data-trouve]'); if (tv) { trouve(tv.dataset.trouve); return; }
    if (t.closest('#inv-sync')) { const b = t.closest('#inv-sync'); b.disabled = true; b.textContent = 'Synchronisation…'; try { await synchroniserStock(); } finally { b.disabled = false; } return; }
    if (t.closest('#inv-same')) {
      const ls = linesOf(sel).filter(l => l.section === onglet && l.quantite == null && l.quantite_theorique != null);
      if (!ls.length || !confirm(ls.length + ' ligne(s) vide(s) seront comptées comme le stock de la plateforme.\nÀ n’utiliser que si vous avez bien vérifié ces lignes dans l’atelier. Continuer ?')) return;
      ls.forEach(l => { l.quantite = Math.max(0, l.quantite_theorique); recalc(l); dirty.add(String(l.id)); }); schedule(); render(); return;
    }
    const rm = t.closest('[data-rm]'); if (rm) { await supprLigne(rm.dataset.rm); render(); return; }
    const ao = t.closest('[data-addo]'); if (ao) { await addLigne({ section: ao.dataset.addo, libelle: '', detail: '' }); render(); const ins = document.querySelectorAll('[data-f=lb]'); if (ins.length) { /* focus la dernière ligne */ } return; }
    const ae = t.closest('[data-addemp]');
    if (ae) { await addLigne({ section: ae.dataset.sec, ref_id: ae.dataset.addemp || null, libelle: ae.dataset.nom, detail: '' }); render(); return; }
  });
  document.addEventListener('submit', e => { if (e.target.id === 'inv-nform') { e.preventDefault(); creer(); } });
  document.addEventListener('input', e => { if ($('#inv-root') && $('#inv-root').contains(e.target)) onInput(e); });
  document.addEventListener('change', async e => {
    const t = e.target, root = $('#inv-root'); if (!root || !root.contains(t)) return;
    if (t.id === 'iv-ca') { cmp.a = t.value; render(); return; }
    if (t.id === 'iv-cb') { cmp.b = t.value; render(); return; }
    if (t.id === 'iv-csec') { cmp.sec = t.value; render(); return; }
    const i = sel ? inv(sel) : null;
    if (i && !ro(i) && (t.id === 'inv-hnom' || t.id === 'inv-hdate' || t.id === 'inv-hnotes')) {
      const patch = {};
      if (t.id === 'inv-hnom') { const v = t.value.trim(); if (!v || INV.some(x => x.id !== i.id && norm(x.nom) === norm(v))) { say(v ? 'Un inventaire porte déjà ce nom.' : 'Le nom est obligatoire.'); t.value = i.nom; return; } patch.nom = v; }
      if (t.id === 'inv-hdate') { if (!t.value) { t.value = i.date_inventaire; return; } const p = precedent(t.value, i.id); const tard = INV.some(x => x.statut === 'cloture' && x.id !== i.id && x.date_inventaire >= t.value);
        if (tard) { say('La date doit être après le dernier inventaire clôturé.'); t.value = i.date_inventaire; return; } patch.date_inventaire = t.value; patch.annee = Number(t.value.slice(0, 4)); patch.debut_periode = p ? p.date_inventaire : null; }
      if (t.id === 'inv-hnotes') patch.notes = t.value.trim();
      const r = await sb.from('inventaires').update(patch).eq('id', i.id);
      if (r.error) { say('Erreur : ' + r.error.message); return; }
      Object.assign(i, patch); saveMsg = 'Enregistré ✓'; render(); return;
    }
    if (t.id === 'inv-addc' && t.value) {
      const c = (typeof D !== 'undefined' ? D : []).find(x => String(x.id) === String(t.value)); if (!c) return;
      await addLigne({ section: t.dataset.sec, ref_id: c.id, libelle: PartAPI.label(c), detail: t.dataset.sec === 'client' ? 'Client' : 'Fournisseur' }); render(); return;
    }
    if (t.id === 'inv-adde' && t.value) {
      const em = (typeof EMPLOYES !== 'undefined' ? EMPLOYES : []).find(x => String(x.id) === String(t.value)); if (!em) return;
      const n = [em.prenom, em.nom].filter(Boolean).join(' ');
      await addLigne({ section: 'employe_creance', ref_id: em.id, libelle: n, detail: em.poste || '' }); await addLigne({ section: 'employe_dette', ref_id: em.id, libelle: n, detail: em.poste || '' }); render();
    }
  });
  window.addEventListener('beforeunload', ev => { if (dirty.size) { flush(); ev.preventDefault(); ev.returnValue = ''; } });

  window.loadInventaire = load;
  document.addEventListener('mariabag:authenticated', () => load(true));
})();
