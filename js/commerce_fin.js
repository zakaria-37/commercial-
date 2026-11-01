/* ============================================================
   COMMERCE — onglets « Versements » et « Crédits »
   - Versements : argent reçu d'un client (encaissement) ou versé à un fournisseur (règlement).
     Table paiements : les soldes des contacts (Contacts › Paiements) se mettent à jour tout seuls.
     Reçu de versement en PDF.
   - Crédits : prêts (سلفة) avec un client, un fournisseur ou toute autre personne de la société
     (associé, famille…) : prêt donné / prêt reçu / remboursements. Table credits_tiers (supabase/credits_tiers.sql).
   Affiché par commerce.js (CommerceFin.html) ; événements gérés ici.
   ============================================================ */
(function () {
  'use strict';
  const $ = s => document.querySelector(s);
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const r2 = n => Math.round((Number(n) || 0) * 100) / 100;
  const num = v => { const x = parseFloat(String(v ?? '').replace(',', '.')); return isFinite(x) ? x : 0; };
  const money = n => (Number(n) || 0).toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + ' DA';
  const iso = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const today = () => iso(new Date());
  const fd = s => s ? String(s).slice(0, 10).split('-').reverse().join('/') : '';
  const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  const say = t => { if (typeof toast === 'function') toast(t); };
  const pdfT = s => String(s ?? '').replace(/œ/g, 'oe').replace(/Œ/g, 'OE').replace(/[\u00a0\u202f]/g, ' ');
  const contacts = () => (typeof D !== 'undefined' && Array.isArray(D)) ? D : [];
  const cById = id => contacts().find(c => String(c.id) === String(id));
  const lbl = c => window.PartAPI ? PartAPI.label(c) : (c.societe || c.nom);
  const pays = () => window.PayAPI ? PayAPI.list() : [];
  const MODES = { especes: 'Espèces', cheque: 'Chèque', virement: 'Virement', autre: 'Autre' };
  const rerender = () => { if (typeof window.cmRender === 'function') window.cmRender(); };

  /* ================= VERSEMENTS ================= */
  let vForm = null, vFiltre = 'tous', vQ = '';
  function soldeDe(sens, contactId, nom) {
    if (!window.PayAPI) return null;
    const l = PayAPI.soldes(sens === 'encaissement' ? 'client' : 'fournisseur');
    const x = contactId ? l.find(s => String(s.id) === String(contactId)) : l.find(s => !s.id && norm(s.nom) === norm(nom));
    return x ? x.solde : 0;
  }
  function paneVersements() {
    const mois = today().slice(0, 7), P = pays().filter(p => p.sens === 'encaissement' || p.sens === 'reglement');
    const enc = P.filter(p => p.sens === 'encaissement' && String(p.date_paiement).startsWith(mois)), reg = P.filter(p => p.sens === 'reglement' && String(p.date_paiement).startsWith(mois));
    const sum = l => l.reduce((s, p) => s + Number(p.montant || 0), 0);
    const dusCl = window.PayAPI ? PayAPI.soldes('client').filter(x => x.solde > 0.004) : [], dusFo = window.PayAPI ? PayAPI.soldes('fournisseur').filter(x => x.solde > 0.004) : [];
    let h = '<div class="ct-kpis"><div class="ct-kpi"><span>Versements reçus ce mois (clients)</span><b class="py-av">' + money(sum(enc)) + '</b><small>' + enc.length + ' versement(s)</small></div>' +
      '<div class="ct-kpi"><span>Versements faits ce mois (fournisseurs)</span><b>' + money(sum(reg)) + '</b><small>' + reg.length + ' versement(s)</small></div>' +
      '<div class="ct-kpi"><span>Reste à encaisser (clients)</span><b class="py-due">' + money(sum(dusCl.map(x => ({ montant: x.solde })))) + '</b><small>' + dusCl.length + ' client(s) · à payer aux fournisseurs : ' + money(sum(dusFo.map(x => ({ montant: x.solde })))) + '</small></div></div>';
    h += '<div class="card"><div class="at-actions" style="margin-top:0"><input id="cf-vq" type="search" placeholder="Rechercher : nom, référence…" value="' + esc(vQ) + '" style="padding:9px;border:1px solid #ccc;border-radius:8px;min-width:200px">' +
      '<select id="cf-vf" style="padding:9px;border:1px solid #ccc;border-radius:8px">' + [['tous', 'Tous'], ['encaissement', 'Reçus des clients'], ['reglement', 'Faits aux fournisseurs']].map(o => '<option value="' + o[0] + '"' + (vFiltre === o[0] ? ' selected' : '') + '>' + o[1] + '</option>').join('') + '</select>' +
      '<span style="margin-left:auto"></span><button class="btn p" type="button" data-cf="v-cli">+ Versement d’un client</button><button class="btn" type="button" data-cf="v-four">+ Versement à un fournisseur</button></div>';
    if (vForm) h += formVersement();
    const liste = P.filter(p => (vFiltre === 'tous' || p.sens === vFiltre) && (!vQ || norm([p.contact_nom, p.reference, p.note].join(' ')).includes(norm(vQ))))
      .sort((a, b) => String(b.date_paiement).localeCompare(String(a.date_paiement)) || String(b.created_at || '').localeCompare(String(a.created_at || '')));
    h += liste.length ? '<div class="tw"><table class="iv-tbl"><thead><tr><th>Date</th><th>Versement</th><th>Client / fournisseur</th><th class="n">Montant</th><th class="iv-opt">Mode</th><th class="iv-opt">Référence</th><th></th></tr></thead><tbody>' +
      liste.slice(0, 300).map(p => { const c = p.contact_id ? cById(p.contact_id) : null, cl = p.sens === 'encaissement';
        return '<tr><td>' + fd(p.date_paiement) + '</td><td><span class="cm-bdg ' + (cl ? 'g' : 'o') + '">' + (cl ? 'Reçu (client)' : 'Fait (fournisseur)') + '</span></td><td><b>' + esc(c ? lbl(c) : p.contact_nom || '—') + '</b>' + (p.note ? '<small>' + esc(p.note) + '</small>' : '') + '</td>' +
          '<td class="n"><b class="' + (cl ? 'py-av' : '') + '">' + money(p.montant) + '</b></td><td class="iv-opt">' + esc(MODES[p.mode] || p.mode || '') + '</td><td class="iv-opt">' + esc(p.reference || '') + '</td>' +
          '<td class="n" style="white-space:nowrap"><button class="btn s" type="button" data-cf="v-pdf" data-id="' + esc(p.id) + '">Reçu PDF</button> <button class="btn s d" type="button" data-cf="v-del" data-id="' + esc(p.id) + '">×</button></td></tr>'; }).join('') + '</tbody></table></div>'
      : '<div class="iv-empty">Aucun versement' + (vQ || vFiltre !== 'tous' ? ' ne correspond' : '') + '.</div>';
    return h + '<p class="iv-help">Chaque versement met à jour le solde du client ou du fournisseur (Contacts › Paiements). Un versement lié à une facture se saisit aussi depuis la facture.</p></div>';
  }
  function formVersement() {
    const f = vForm, cl = f.sens === 'encaissement', type = cl ? 'Client' : 'Fournisseur';
    const cs = contacts().filter(c => c.type === type).sort((a, b) => lbl(a).localeCompare(lbl(b), 'fr'));
    const docs = window.CommerceAPI ? CommerceAPI.docs().filter(d => (cl ? ['facture', 'bon_livraison'] : ['bon_commande', 'bon_reception']).includes(d.type) && d.statut !== 'annulee' && f.contactId && String(d.contact_id) === String(f.contactId)) : [];
    return '<form id="cf-vform" class="at-form" style="display:block"><h3 style="margin-top:0">' + (cl ? 'Versement reçu d’un client' : 'Versement fait à un fournisseur') + '</h3><div class="at-fields">' +
      '<label>' + type + ' *<select id="cf-vc"><option value="">— choisir —</option>' + cs.map(c => '<option value="' + esc(c.id) + '"' + (String(f.contactId) === String(c.id) ? ' selected' : '') + '>' + esc(lbl(c)) + '</option>').join('') + '<option value="__autre"' + (f.contactId === '__autre' ? ' selected' : '') + '>Autre (nom libre)…</option></select></label>' +
      (f.contactId === '__autre' ? '<label>Nom *<input id="cf-vn" maxlength="120" value="' + esc(f.nom || '') + '" placeholder="Ex : Hanout Toufik"></label>' : '') +
      '<label>Montant (DA) *<input id="cf-vm" type="number" min="0" step="any" inputmode="decimal" value="' + esc(f.montant || '') + '"></label>' +
      '<label>Date<input id="cf-vd" type="date" value="' + esc(f.date) + '"></label>' +
      '<label>Mode<select id="cf-vmode">' + Object.keys(MODES).map(k => '<option value="' + k + '"' + (f.mode === k ? ' selected' : '') + '>' + MODES[k] + '</option>').join('') + '</select></label>' +
      '<label>Référence<input id="cf-vr" maxlength="80" value="' + esc(f.ref || '') + '" placeholder="N° de bon, chèque, reçu… (ex : LC 0036)"></label>' +
      (docs.length ? '<label>Lié au document<select id="cf-vdoc"><option value="">— aucun —</option>' + docs.map(d => '<option value="' + esc(d.id) + '"' + (String(f.docId) === String(d.id) ? ' selected' : '') + '>' + esc(d.numero) + ' · ' + fd(d.date_doc) + ' · ' + money(CommerceAPI.totaux(d, CommerceAPI.lignesDe(d.id)).ttc) + '</option>').join('') + '</select></label>' : '') +
      '<label style="grid-column:1/-1">Note<input id="cf-vnote" maxlength="200" value="' + esc(f.note || '') + '" placeholder="Facultatif"></label></div>' +
      '<div id="cf-vhint" class="iv-help"></div>' +
      '<div class="at-actions"><button class="btn p" type="submit">Enregistrer le versement</button><button class="btn" type="button" data-cf="v-no">Annuler</button></div></form>';
  }
  function lireV() {
    if (!vForm || !$('#cf-vm')) return;
    vForm.contactId = $('#cf-vc').value; vForm.nom = $('#cf-vn') ? $('#cf-vn').value : vForm.nom; vForm.montant = $('#cf-vm').value; vForm.date = $('#cf-vd').value;
    vForm.mode = $('#cf-vmode').value; vForm.ref = $('#cf-vr').value; vForm.note = $('#cf-vnote').value; vForm.docId = $('#cf-vdoc') ? $('#cf-vdoc').value : '';
  }
  function hintV() {
    const h = $('#cf-vhint'); if (!h || !vForm) return; lireV();
    const autre = vForm.contactId === '__autre', id = autre ? null : vForm.contactId, nom = autre ? vForm.nom : '';
    if (!id && !nom) { h.textContent = ''; return; }
    const s = soldeDe(vForm.sens, id, nom), m = num(vForm.montant); if (s == null) { h.textContent = ''; return; }
    h.innerHTML = (vForm.sens === 'encaissement' ? 'Ce client vous doit actuellement ' : 'Vous devez actuellement à ce fournisseur ') + '<b>' + money(s) + '</b>' + (m > 0 ? ' → après ce versement : <b>' + money(r2(s - m)) + '</b>' + (s - m < -0.004 ? ' (avance)' : '') : '');
  }
  async function saveV() {
    lireV(); const f = vForm, autre = f.contactId === '__autre', c = autre ? null : cById(f.contactId), m = r2(num(f.montant));
    if (!c && !(autre && String(f.nom || '').trim())) { say('Choisissez le ' + (f.sens === 'encaissement' ? 'client' : 'fournisseur') + '.'); return; }
    if (!(m > 0)) { say('Indiquez un montant supérieur à 0.'); return; }
    const r = await sb.from('paiements').insert([{ date_paiement: f.date || today(), sens: f.sens, contact_id: c ? c.id : null, contact_nom: c ? lbl(c) : String(f.nom).trim(), montant: m, mode: f.mode || 'especes', reference: String(f.ref || '').trim(), note: String(f.note || '').trim(), document_id: f.docId || null }]);
    if (r.error) { say('Erreur : ' + r.error.message); return; }
    vForm = null; if (window.PayAPI) await PayAPI.load(); say('Versement enregistré : ' + money(m)); rerender();
  }
  async function delV(id) {
    const p = pays().find(x => String(x.id) === String(id)); if (!p) return;
    if (!confirm('Supprimer le versement de ' + money(p.montant) + ' (' + (p.contact_nom || '') + ', ' + fd(p.date_paiement) + ') ?\nLe solde du contact sera recalculé.')) return;
    const r = await sb.from('paiements').delete().eq('id', id); if (r.error) { say('Erreur : ' + r.error.message); return; }
    if (window.PayAPI) await PayAPI.load(); say('Versement supprimé.'); rerender();
  }

  /* ================= CRÉDITS ================= */
  const NAT = { pret_donne: ['Prêt donné', 'nous avons prêté', 1], remb_recu: ['Remboursement reçu', 'il nous a remboursé', -1], pret_recu: ['Prêt reçu', 'on nous a prêté', -1], remb_fait: ['Remboursement fait', 'nous avons remboursé', 1] };
  const CATS = ['Client', 'Fournisseur', 'Associé', 'Employé', 'Famille', 'Autre'];
  let CR = [], crErr = '', crLoaded = false, crT = 0, cForm = null, cPers = '';
  async function loadCredits() {
    crT = Date.now();
    const r = await sb.from('credits_tiers').select('*').order('date_op', { ascending: false });
    if (r.error) { crErr = /does not exist|relation|schema cache/i.test(r.error.message) ? 'Table « credits_tiers » introuvable : exécutez supabase/credits_tiers.sql dans SQL Editor, puis rechargez la page.' : r.error.message; CR = []; }
    else { crErr = ''; CR = r.data || []; }
    crLoaded = true; rerender();
  }
  const cle = o => o.contact_id ? 'c:' + o.contact_id : 'n:' + norm(o.personne);
  const nomOp = o => { const c = o.contact_id ? cById(o.contact_id) : null; return c ? lbl(c) : (o.personne || '—'); };
  /* solde > 0 : la personne nous doit ; solde < 0 : nous lui devons */
  function personnes() {
    const g = new Map();
    CR.forEach(o => { const k = cle(o); let x = g.get(k); if (!x) { x = { k, contact_id: o.contact_id, nom: nomOp(o), cat: o.categorie || (o.contact_id && cById(o.contact_id) ? cById(o.contact_id).type : 'Autre'), donne: 0, recu: 0, solde: 0, dernier: '', ech: '' }; g.set(k, x); }
      const m = Number(o.montant) || 0; x.solde += NAT[o.nature][2] * m; if (o.nature === 'pret_donne' || o.nature === 'pret_recu') x.donne += m; else x.recu += m;
      if (String(o.date_op) > x.dernier) x.dernier = String(o.date_op); if (o.echeance && (o.nature === 'pret_donne' || o.nature === 'pret_recu') && (!x.ech || o.echeance > x.ech)) x.ech = o.echeance; });
    return [...g.values()].map(x => Object.assign(x, { solde: r2(x.solde) })).sort((a, b) => Math.abs(b.solde) - Math.abs(a.solde));
  }
  function paneCredits() {
    if (!crLoaded) { loadCredits(); return '<div class="card"><div class="iv-empty">Chargement…</div></div>'; }
    if (!cForm && Date.now() - crT > 30000) setTimeout(loadCredits, 0);      // données d'un autre appareil : relecture discrète
    if (crErr) return '<div class="card"><div class="iv-err">' + esc(crErr) + '</div></div>';
    const L = personnes(), onDoit = L.filter(x => x.solde > 0.004), onLeur = L.filter(x => x.solde < -0.004);
    let h = '<div class="ct-kpis"><div class="ct-kpi"><span>On nous doit (prêts donnés)</span><b class="py-due">' + money(onDoit.reduce((s, x) => s + x.solde, 0)) + '</b><small>' + onDoit.length + ' personne(s)</small></div>' +
      '<div class="ct-kpi"><span>Nous devons (prêts reçus)</span><b>' + money(-onLeur.reduce((s, x) => s + x.solde, 0)) + '</b><small>' + onLeur.length + ' personne(s)</small></div></div>';
    h += '<div class="card"><div class="at-actions" style="margin-top:0"><h2 style="margin:0 auto 0 0">Crédits (سلفة)</h2><button class="btn p" type="button" data-cf="c-new" data-nat="pret_donne">+ Prêt donné</button><button class="btn" type="button" data-cf="c-new" data-nat="pret_recu">+ Prêt reçu</button><button class="btn" type="button" data-cf="c-new" data-nat="remb_recu">+ Remboursement</button></div>';
    if (cForm) h += formCredit();
    h += L.length ? '<div class="tw"><table class="iv-tbl"><thead><tr><th>Personne</th><th class="iv-opt">Catégorie</th><th class="n">Prêté</th><th class="n">Remboursé</th><th class="n">Solde</th><th class="iv-opt">Dernière opération</th><th></th></tr></thead><tbody>' +
      L.map(x => '<tr><td><b>' + esc(x.nom) + '</b>' + (x.ech && Math.abs(x.solde) > 0.004 ? '<small' + (x.ech < today() ? ' style="color:var(--r)"' : '') + '>échéance ' + fd(x.ech) + '</small>' : '') + '</td><td class="iv-opt">' + esc(x.cat) + '</td><td class="n">' + money(x.donne) + '</td><td class="n">' + money(x.recu) + '</td>' +
        '<td class="n"><b class="' + (x.solde > 0.004 ? 'py-due' : '') + '">' + (Math.abs(x.solde) < 0.005 ? 'Soldé' : x.solde > 0 ? 'nous doit ' + money(x.solde) : 'nous lui devons ' + money(-x.solde)) + '</b></td><td class="iv-opt">' + fd(x.dernier) + '</td>' +
        '<td class="n" style="white-space:nowrap">' + (Math.abs(x.solde) > 0.004 ? '<button class="btn s p" type="button" data-cf="c-remb" data-k="' + esc(x.k) + '">Remboursement</button> ' : '') + '<button class="btn s" type="button" data-cf="c-hist" data-k="' + esc(x.k) + '">' + (cPers === x.k ? 'Masquer' : 'Historique') + '</button></td></tr>').join('') + '</tbody></table></div>'
      : '<div class="iv-empty">Aucun crédit enregistré. Cliquez sur « + Prêt donné » (vous prêtez de l’argent) ou « + Prêt reçu » (on vous prête).</div>';
    const ops = CR.filter(o => !cPers || cle(o) === cPers);
    if (ops.length) h += '<h3>' + (cPers ? 'Historique : ' + esc(nomOp(ops[0])) : 'Dernières opérations') + '</h3><div class="tw"><table class="iv-tbl"><thead><tr><th>Date</th><th>Opération</th><th>Personne</th><th class="n">Montant</th><th class="iv-opt">Mode</th><th class="iv-opt">Note</th><th></th></tr></thead><tbody>' +
      ops.slice(0, cPers ? 500 : 40).map(o => '<tr><td>' + fd(o.date_op) + '</td><td><span class="cm-bdg ' + (o.nature.startsWith('pret') ? 'o' : 'g') + '">' + NAT[o.nature][0] + '</span></td><td>' + esc(nomOp(o)) + '</td><td class="n"><b>' + money(o.montant) + '</b></td><td class="iv-opt">' + esc(MODES[o.mode] || '') + '</td><td class="iv-opt">' + esc([o.reference, o.note].filter(Boolean).join(' · ')) + (o.echeance ? ' · échéance ' + fd(o.echeance) : '') + '</td>' +
        '<td class="n"><button class="btn s d" type="button" data-cf="c-del" data-id="' + esc(o.id) + '">×</button></td></tr>').join('') + '</tbody></table></div>';
    return h + '<p class="iv-help">« Prêt donné » : vous prêtez de l’argent (la personne vous doit). « Prêt reçu » : quelqu’un vous prête (vous lui devez). Les crédits des employés retenus sur salaire restent dans Employés › Crédit personnel.</p></div>';
  }
  function formCredit() {
    const f = cForm, cs = contacts().slice().sort((a, b) => lbl(a).localeCompare(lbl(b), 'fr'));
    return '<form id="cf-cform" class="at-form" style="display:block"><h3 style="margin-top:0">' + NAT[f.nature][0] + '</h3><div class="at-fields">' +
      '<label>Opération<select id="cf-cnat">' + Object.keys(NAT).map(k => '<option value="' + k + '"' + (f.nature === k ? ' selected' : '') + '>' + NAT[k][0] + ' (' + NAT[k][1] + ')</option>').join('') + '</select></label>' +
      '<label>Personne *<select id="cf-cc"><option value="">— choisir —</option><option value="__autre"' + (f.contactId === '__autre' ? ' selected' : '') + '>Autre personne (nom libre)…</option>' + cs.map(c => '<option value="' + esc(c.id) + '"' + (String(f.contactId) === String(c.id) ? ' selected' : '') + '>' + esc(lbl(c)) + ' (' + esc(c.type || '') + ')</option>').join('') + '</select></label>' +
      (f.contactId === '__autre' ? '<label>Nom *<input id="cf-cn" maxlength="120" value="' + esc(f.nom || '') + '" placeholder="Ex : Zaki"></label><label>Catégorie<select id="cf-ccat">' + CATS.map(k => '<option' + (f.cat === k ? ' selected' : '') + '>' + k + '</option>').join('') + '</select></label>' : '') +
      '<label>Montant (DA) *<input id="cf-cm" type="number" min="0" step="any" inputmode="decimal" value="' + esc(f.montant || '') + '"></label><label>Date<input id="cf-cd" type="date" value="' + esc(f.date) + '"></label>' +
      '<label>Mode<select id="cf-cmode">' + Object.keys(MODES).map(k => '<option value="' + k + '"' + (f.mode === k ? ' selected' : '') + '>' + MODES[k] + '</option>').join('') + '</select></label>' +
      (f.nature.startsWith('pret') ? '<label>Remboursement prévu le<input id="cf-ce" type="date" value="' + esc(f.ech || '') + '"></label>' : '') +
      '<label>Référence<input id="cf-cr" maxlength="80" value="' + esc(f.ref || '') + '" placeholder="Facultatif"></label><label style="grid-column:1/-1">Note<input id="cf-cnote" maxlength="200" value="' + esc(f.note || '') + '" placeholder="Facultatif : motif…"></label></div>' +
      '<div class="at-actions"><button class="btn p" type="submit">Enregistrer</button><button class="btn" type="button" data-cf="c-no">Annuler</button></div></form>';
  }
  function lireC() {
    if (!cForm || !$('#cf-cm')) return;
    cForm.nature = $('#cf-cnat').value; cForm.contactId = $('#cf-cc').value; cForm.nom = $('#cf-cn') ? $('#cf-cn').value : cForm.nom; cForm.cat = $('#cf-ccat') ? $('#cf-ccat').value : cForm.cat;
    cForm.montant = $('#cf-cm').value; cForm.date = $('#cf-cd').value; cForm.mode = $('#cf-cmode').value; cForm.ech = $('#cf-ce') ? $('#cf-ce').value : ''; cForm.ref = $('#cf-cr').value; cForm.note = $('#cf-cnote').value;
  }
  async function saveC() {
    lireC(); const f = cForm, autre = f.contactId === '__autre', c = autre ? null : cById(f.contactId), m = r2(num(f.montant));
    if (!c && !(autre && String(f.nom || '').trim())) { say('Choisissez la personne.'); return; }
    if (!(m > 0)) { say('Indiquez un montant supérieur à 0.'); return; }
    const r = await sb.from('credits_tiers').insert([{ date_op: f.date || today(), nature: f.nature, contact_id: c ? c.id : null, personne: c ? lbl(c) : String(f.nom).trim(), categorie: c ? (c.type || 'Autre') : (f.cat || 'Autre'),
      montant: m, mode: f.mode || 'especes', echeance: f.nature.startsWith('pret') && f.ech ? f.ech : null, reference: String(f.ref || '').trim(), note: String(f.note || '').trim() }]);
    if (r.error) { say('Erreur : ' + r.error.message); return; }
    cForm = null; say(NAT[f.nature][0] + ' enregistré : ' + money(m)); await loadCredits();
  }
  async function delC(id) {
    const o = CR.find(x => String(x.id) === String(id)); if (!o) return;
    if (!confirm('Supprimer « ' + NAT[o.nature][0] + ' » de ' + money(o.montant) + ' (' + nomOp(o) + ', ' + fd(o.date_op) + ') ?')) return;
    const r = await sb.from('credits_tiers').delete().eq('id', id); if (r.error) { say('Erreur : ' + r.error.message); return; }
    await loadCredits();
  }

  /* ================= Reçu de versement (PDF) ================= */
  async function recuPdf(id) {
    const p = pays().find(x => String(x.id) === String(id)); if (!p) return;
    if (!(window.jspdf && window.jspdf.jsPDF)) { say('Bibliothèque PDF non chargée.'); return; }
    let ENT = {}; try { const q = await sb.from('parametres').select('*').eq('cle', 'entreprise'); if (q.data && q.data[0]) ENT = q.data[0].valeur || {}; } catch (e) {}
    const doc = new window.jspdf.jsPDF({ unit: 'mm', format: 'a5', orientation: 'landscape' }), W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), M = 12;
    const c = p.contact_id ? cById(p.contact_id) : null, cl = p.sens === 'encaissement', nom = c ? lbl(c) : p.contact_nom;
    if (typeof LOGO_PDF !== 'undefined' && LOGO_PDF) doc.addImage(LOGO_PDF, 'PNG', M, 8, 18, 18);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.text(pdfT(ENT.nom || 'MARIA BAG'), M + 22, 15);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(90); doc.text(pdfT([[ENT.adresse, ENT.ville].filter(Boolean).join(', '), ENT.tel && 'Tel : ' + ENT.tel].filter(Boolean).join('  -  ')), M + 22, 20);
    doc.setTextColor(0); doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.text(pdfT(cl ? 'RECU DE VERSEMENT' : 'BON DE VERSEMENT'), W - M, 15, { align: 'right' });
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.text(pdfT('Date : ' + fd(p.date_paiement)), W - M, 21, { align: 'right' }); if (p.reference) doc.text(pdfT('Ref. : ' + p.reference), W - M, 26, { align: 'right' });
    doc.setDrawColor(0); doc.setLineWidth(0.5); doc.line(M, 30, W - M, 30);
    let y = 40; const lig = (a, b, bold) => { doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(90); doc.text(pdfT(a), M, y); doc.setTextColor(0); doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(bold ? 13 : 11); doc.text(pdfT(b), M + 48, y); y += 9; };
    lig(cl ? 'Recu de :' : 'Verse a :', nom || '—', true);
    lig('Montant :', (Number(p.montant) || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2 }).replace(/[\u00a0\u202f]/g, ' ') + ' DA', true);
    const lettres = window.CommerceAPI && CommerceAPI.montantLettres ? CommerceAPI.montantLettres(Number(p.montant) || 0) : '';
    if (lettres) { doc.setFont('helvetica', 'italic'); doc.setFontSize(9.5); doc.text(doc.splitTextToSize(pdfT('Soit : ' + lettres), W - 2 * M - 48), M + 48, y - 3); y += 7; }
    lig('Mode de paiement :', MODES[p.mode] || p.mode || '');
    if (p.note) lig('Motif :', p.note);
    const s = soldeDe(p.sens, p.contact_id, p.contact_nom); if (s != null) lig(cl ? 'Reste du a ce jour :' : 'Reste a payer a ce jour :', money(Math.max(0, s)).replace(/[\u00a0\u202f]/g, ' '));
    const bw = (W - 2 * M - 10) / 2, yy = H - 32; doc.setDrawColor(120); doc.setLineWidth(0.2); doc.rect(M, yy, bw, 22); doc.rect(M + bw + 10, yy, bw, 22);
    doc.setFontSize(8); doc.setTextColor(90); doc.text(pdfT(cl ? 'Signature du client' : 'Signature du fournisseur'), M + 3, yy + 5); doc.text(pdfT('Signature et cachet MARIA BAG'), M + bw + 13, yy + 5);
    doc.save((cl ? 'recu-versement-' : 'bon-versement-') + String(nom || '').replace(/[^A-Za-z0-9]+/g, '-').slice(0, 30) + '-' + p.date_paiement + '.pdf');
  }

  /* ================= JOURNAL DES OPÉRATIONS ET CAISSE =================
     Toutes les opérations d'une journée : versements, bons, factures, crédits, charges, acomptes, paiements des ateliers…
     Caisse : ouverture (fond de caisse) → entrées et sorties EN ESPÈCES → solde attendu → clôture (argent compté) → écart.
     Table caisse (supabase/caisse.sql) : ouverture, clôture, entrées et sorties diverses. */
  let jDate = today(), J = null, jCharge = '', jForm = null;
  const heure = s => { try { return s ? new Date(s).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : ''; } catch (e) { return ''; } };
  const rows = async (t, col, d) => { try { const r = await sb.from(t).select('*').eq(col, d); return r.error ? [] : (r.data || []); } catch (e) { return []; } };
  const empNom = id => { const e = (typeof EMPLOYES !== 'undefined' ? EMPLOYES : []).find(x => String(x.id) === String(id)); return e ? [e.nom, e.prenom].filter(Boolean).join(' ') : 'Employé'; };
  async function loadJour(d) {
    jCharge = d;
    const [pay, cr, ch, ac, pa, hs, ce, ca] = await Promise.all([rows('paiements', 'date_paiement', d), rows('credits_tiers', 'date_op', d), rows('charges', 'date_charge', d), rows('acomptes', 'date_acompte', d),
      rows('paiements_ateliers', 'date_paiement', d), rows('remises_hs', 'date_op', d), rows('credits_employes', 'date_op', d), rows('caisse', 'date_op', d)]);
    let avant = []; try { const r = await sb.from('caisse').select('*').eq('type', 'cloture').lt('date_op', d).order('date_op', { ascending: false }); avant = r.error ? [] : (r.data || []); } catch (e) {}
    const ops = [], esp = m => !m || m === 'especes';
    const op = (o, x) => ops.push(Object.assign({ h: heure(o.created_at), tri: String(o.created_at || ''), caisse: 0 }, x));
    pay.filter(p => p.sens === 'encaissement' || p.sens === 'reglement').forEach(p => { const re = p.sens === 'encaissement', c = p.contact_id ? cById(p.contact_id) : null;
      op(p, { type: re ? 'Versement reçu' : 'Versement fait', detail: (c ? lbl(c) : p.contact_nom || '') + (p.reference ? ' · ' + p.reference : '') + (p.note ? ' · ' + p.note : ''), mode: p.mode, montant: Number(p.montant), caisse: esp(p.mode) ? (re ? 1 : -1) * Number(p.montant) : 0, c: re ? 'g' : 'o' }); });
    cr.forEach(o => { const sg = { pret_donne: -1, remb_recu: 1, pret_recu: 1, remb_fait: -1 }[o.nature];
      op(o, { type: NAT[o.nature][0] + ' (crédit)', detail: nomOp(o) + (o.note ? ' · ' + o.note : ''), mode: o.mode, montant: Number(o.montant), caisse: esp(o.mode) ? sg * Number(o.montant) : 0, c: sg > 0 ? 'g' : 'o' }); });
    ch.forEach(o => { const paie = o.categorie === 'Paie des employés';
      op(o, { type: paie ? 'Paie du jour (coût)' : 'Charge', detail: [o.categorie, o.employe_nom, o.note].filter(Boolean).join(' · '), mode: paie ? '' : 'especes', montant: Number(o.montant), caisse: paie ? 0 : -Number(o.montant), c: 'o' }); });
    ac.forEach(o => op(o, { type: 'Acompte employé', detail: empNom(o.employe_id) + (o.note ? ' · ' + o.note : ''), mode: 'especes', montant: Number(o.montant), caisse: -Number(o.montant), c: 'o' }));
    pa.filter(o => o.type !== 'report').forEach(o => op(o, { type: 'Paiement atelier', detail: (o.atelier_nom || 'Atelier') + (o.reference ? ' · ' + o.reference : ''), mode: o.mode, montant: Number(o.montant), caisse: esp(o.mode) ? -Number(o.montant) : 0, c: 'o' }));
    hs.filter(o => o.type === 'remise').forEach(o => op(o, { type: 'Heures sup remises', detail: empNom(o.employe_id), mode: 'especes', montant: Number(o.montant), caisse: -Number(o.montant), c: 'o' }));
    ce.forEach(o => { const remb = o.type === 'remboursement', esp = remb && !/ch[eè]que|virement/i.test(o.note || '');
      op(o, { type: o.type === 'credit' ? 'Crédit employé' : o.type === 'retenue' ? 'Retenue sur salaire' : remb ? 'Remboursement crédit employé' : 'Crédit employé (départ)', detail: empNom(o.employe_id) + (o.note ? ' · ' + o.note : ''), mode: o.type === 'credit' || esp ? 'especes' : '', montant: Number(o.montant), caisse: o.type === 'credit' ? -Number(o.montant) : esp ? Number(o.montant) : 0, c: remb ? 'g' : 'o' }); });
    ca.filter(o => o.type === 'entree' || o.type === 'sortie').forEach(o => op(o, { type: o.type === 'entree' ? 'Entrée de caisse' : 'Sortie de caisse', detail: o.libelle || '', mode: 'especes', montant: Number(o.montant), caisse: (o.type === 'entree' ? 1 : -1) * Number(o.montant), c: o.type === 'entree' ? 'g' : 'o', caisseId: o.id }));
    if (window.CommerceAPI) CommerceAPI.docs().filter(x => x.date_doc === d && x.statut !== 'annulee' && x.type !== 'devis').forEach(x => {
      const nom = x.contact_id && cById(x.contact_id) ? lbl(cById(x.contact_id)) : x.contact_nom;
      op(x, { type: { facture: 'Facture', bon_livraison: 'Bon de livraison', bon_reception: 'Bon de réception', bon_commande: 'Bon de commande' }[x.type] || x.type, detail: x.numero + ' · ' + (nom || ''), mode: '', montant: CommerceAPI.totaux(x, CommerceAPI.lignesDe(x.id)).ttc, caisse: 0, c: 'x', doc: true });
    });
    ops.sort((a, b) => a.tri.localeCompare(b.tri));
    const ouv = ca.filter(o => o.type === 'ouverture').sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))[0] || null;
    const clo = ca.filter(o => o.type === 'cloture').sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))[0] || null;
    J = { d, ops, ouv, clo, prec: avant[0] || null };
    if (tabActif === 'journal') rerender();
  }
  let tabActif = '';
  function caisseCalc() {
    const ent = J.ops.filter(o => o.caisse > 0).reduce((s, o) => s + o.caisse, 0), sor = -J.ops.filter(o => o.caisse < 0).reduce((s, o) => s + o.caisse, 0);
    const ouv = J.ouv ? Number(J.ouv.montant) : 0;
    return { ouv, ent: r2(ent), sor: r2(sor), att: r2(ouv + ent - sor) };
  }
  function paneJournal() {
    tabActif = 'journal';
    if (!J || J.d !== jDate) { if (jCharge !== jDate) loadJour(jDate); return '<div class="card"><div class="iv-empty">Chargement du journal…</div></div>'; }
    const k = caisseCalc(), aujourdhui = jDate === today();
    const lettreJour = new Date(jDate + 'T00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    let h = '<div class="card"><div class="at-actions" style="margin-top:0;flex-wrap:wrap"><button class="btn" type="button" data-cf="j-prev" title="Jour précédent">◀</button><input id="cf-jd" type="date" value="' + esc(jDate) + '" style="padding:8px;border:1px solid #ccc;border-radius:8px"><button class="btn" type="button" data-cf="j-next" title="Jour suivant">▶</button>' +
      (aujourdhui ? '' : '<button class="btn s" type="button" data-cf="j-auj">Aujourd’hui</button>') + '<b style="margin-left:6px">' + esc(lettreJour.replace(/^./, c => c.toUpperCase())) + '</b><span style="margin-left:auto"></span><button class="btn" type="button" data-cf="j-pdf">Journal PDF</button></div>';
    // --- Caisse
    const etat = J.clo ? '<span class="cm-bdg g">Caisse clôturée à ' + heure(J.clo.created_at) + '</span>' : J.ouv ? '<span class="cm-bdg b">Caisse ouverte depuis ' + heure(J.ouv.created_at) + '</span>' : '<span class="cm-bdg x">Caisse non ouverte</span>';
    h += '<h3 style="margin:14px 0 8px">Caisse de l’atelier (espèces) ' + etat + '</h3><div class="ct-kpis">' +
      '<div class="ct-kpi"><span>Ouverture (fond de caisse)</span><b>' + money(k.ouv) + '</b><small>' + (J.ouv ? 'compté à l’ouverture' : 'non saisie') + '</small></div>' +
      '<div class="ct-kpi"><span>Entrées en espèces</span><b class="py-av">+ ' + money(k.ent) + '</b><small>versements reçus, remboursements…</small></div>' +
      '<div class="ct-kpi"><span>Sorties en espèces</span><b class="py-due">− ' + money(k.sor) + '</b><small>versements faits, charges, acomptes…</small></div>' +
      '<div class="ct-kpi"><span>Solde attendu en caisse</span><b>' + money(k.att) + '</b><small>ouverture + entrées − sorties</small></div></div>';
    if (J.clo) { const e = Number(J.clo.ecart) || 0;
      h += '<div class="pf-note' + (Math.abs(e) > 0.004 ? ' pf-warn' : '') + '" style="font-size:14px">Clôture : argent compté <b>' + money(J.clo.montant) + '</b> · attendu <b>' + money(J.clo.theorique) + '</b> · <b>' + (Math.abs(e) < 0.005 ? '✔ aucun écart' : e > 0 ? 'excédent de ' + money(e) : 'MANQUE ' + money(-e)) + '</b>' +
        (Math.abs((Number(J.clo.theorique) || 0) - k.att) > 0.004 ? ' <small>(des opérations ont changé depuis la clôture : solde attendu actuel ' + money(k.att) + ')</small>' : '') + ' <button class="btn s" type="button" data-cf="j-rouvrir">Rouvrir la caisse</button></div>'; }
    h += '<div class="at-actions">' + (!J.ouv ? '<button class="btn p" type="button" data-cf="j-form" data-t="ouverture">Ouvrir la caisse</button>' : '') +
      (!J.clo ? '<button class="btn" type="button" data-cf="j-form" data-t="entree">+ Entrée de caisse</button><button class="btn" type="button" data-cf="j-form" data-t="sortie">+ Sortie de caisse</button>' : '') +
      (J.ouv && !J.clo ? '<button class="btn p" type="button" data-cf="j-form" data-t="cloture">Clôturer la caisse (fin de journée)</button>' : '') + '</div>';
    if (jForm) h += formCaisse(k);
    // --- Journal
    const docs = J.ops.filter(o => o.doc), argent = J.ops.filter(o => !o.doc);
    const tot = (l, f) => l.filter(f).reduce((s, o) => s + o.montant, 0);
    h += '<h3 style="margin:18px 0 8px">Journal des opérations (' + J.ops.length + ')</h3>';
    h += J.ops.length ? '<div class="tw"><table class="iv-tbl"><thead><tr><th>Heure</th><th>Opération</th><th>Détail</th><th class="iv-opt">Mode</th><th class="n">Montant</th><th class="n">Caisse</th><th></th></tr></thead><tbody>' +
      J.ops.map(o => '<tr><td>' + esc(o.h) + '</td><td><span class="cm-bdg ' + o.c + '">' + esc(o.type) + '</span></td><td>' + esc(o.detail) + '</td><td class="iv-opt">' + esc(MODES[o.mode] || (o.doc ? 'document' : '')) + '</td><td class="n"><b>' + money(o.montant) + '</b></td>' +
        '<td class="n">' + (o.caisse ? '<b class="' + (o.caisse > 0 ? 'py-av' : 'py-due') + '">' + (o.caisse > 0 ? '+ ' : '− ') + money(Math.abs(o.caisse)) + '</b>' : '<small>—</small>') + '</td><td class="n">' + (o.caisseId && !J.clo ? '<button class="btn s d" type="button" data-cf="j-del" data-id="' + esc(o.caisseId) + '">×</button>' : '') + '</td></tr>').join('') + '</tbody></table></div>'
      : '<div class="iv-empty">Aucune opération ce jour-là.</div>';
    h += '<div class="ct-kpis" style="margin-top:12px"><div class="ct-kpi"><span>Livré / facturé ce jour</span><b>' + money(tot(docs, o => o.type === 'Bon de livraison' || o.type === 'Facture')) + '</b><small>bons de livraison et factures</small></div>' +
      '<div class="ct-kpi"><span>Reçu ce jour (achats)</span><b>' + money(tot(docs, o => o.type === 'Bon de réception')) + '</b><small>bons de réception</small></div>' +
      '<div class="ct-kpi"><span>Versements reçus (tous modes)</span><b class="py-av">' + money(tot(argent, o => o.type === 'Versement reçu')) + '</b><small>versements faits : ' + money(tot(argent, o => o.type === 'Versement fait')) + '</small></div></div>';
    return h + '<p class="iv-help">La caisse ne compte que l’argent <b>en espèces</b> (chèques et virements apparaissent dans le journal sans toucher la caisse). Les documents (bons, factures) sont listés pour information : l’argent n’entre en caisse qu’avec le versement ou le paiement « cash ». La paie du jour est un coût, pas une sortie d’argent : seuls les acomptes et les heures sup remises sortent de la caisse.</p></div>';
  }
  function formCaisse(k) {
    const t = jForm.type, prop = t === 'ouverture' ? (J.prec ? Number(J.prec.montant) : '') : '';
    const titre = { ouverture: 'Ouverture de la caisse', cloture: 'Clôture de la caisse', entree: 'Entrée de caisse', sortie: 'Sortie de caisse' }[t];
    return '<form id="cf-jform" class="at-form" style="display:block"><h3 style="margin-top:0">' + titre + '</h3>' +
      (t === 'ouverture' ? '<p class="iv-help">Comptez l’argent présent dans la caisse au début de la journée.' + (J.prec ? ' Dernière clôture (' + fd(J.prec.date_op) + ') : <b>' + money(J.prec.montant) + '</b>.' : '') + '</p>' : '') +
      (t === 'cloture' ? '<p class="iv-help">Comptez l’argent présent dans la caisse en fin de journée. Solde attendu : <b>' + money(k.att) + '</b>.</p>' : '') +
      '<div class="at-fields"><label>' + (t === 'ouverture' || t === 'cloture' ? 'Argent compté en caisse (DA) *' : 'Montant (DA) *') + '<input id="cf-jm" type="number" min="0" step="any" inputmode="decimal" value="' + esc(jForm.montant != null ? jForm.montant : prop) + '"></label>' +
      (t === 'entree' || t === 'sortie' ? '<label style="grid-column:span 2">Motif *<input id="cf-jl" maxlength="160" value="' + esc(jForm.libelle || '') + '" placeholder="' + (t === 'entree' ? 'Ex : apport du gérant, retrait banque…' : 'Ex : achat de fil, transport, dîner…') + '"></label>' : '') + '</div>' +
      (t === 'cloture' ? '<div id="cf-jecart" class="iv-help"></div>' : '') +
      '<div class="at-actions"><button class="btn p" type="submit">Enregistrer</button><button class="btn" type="button" data-cf="j-no">Annuler</button></div></form>';
  }
  function ecartTxt() {
    const e = $('#cf-jecart'); if (!e || !J) return; const k = caisseCalc(), m = $('#cf-jm').value;
    if (m === '') { e.textContent = ''; return; }
    const d = r2(num(m) - k.att); e.innerHTML = Math.abs(d) < 0.005 ? '✔ Aucun écart : la caisse est juste.' : d > 0 ? 'Excédent de <b>' + money(d) + '</b> (plus d’argent que prévu).' : '<b style="color:var(--r)">Manque de ' + money(-d) + '</b> (moins d’argent que prévu).';
  }
  async function saveCaisse() {
    const t = jForm.type, m = r2(num($('#cf-jm').value)), lib = $('#cf-jl') ? $('#cf-jl').value.trim() : '';
    if ($('#cf-jm').value === '' || m < 0) { say('Indiquez le montant.'); return; }
    if ((t === 'entree' || t === 'sortie') && (!(m > 0) || !lib)) { say('Indiquez un montant et un motif.'); return; }
    const k = caisseCalc(), row = { date_op: jDate, type: t, montant: m, libelle: lib || (t === 'ouverture' ? 'Ouverture' : t === 'cloture' ? 'Clôture' : '') };
    if (t === 'cloture') { row.theorique = k.att; row.ecart = r2(m - k.att); }
    const r = await sb.from('caisse').insert([row]); if (r.error) { say('Erreur : ' + (/caisse/.test(r.error.message) ? 'table « caisse » introuvable : exécutez supabase/caisse.sql. ' : '') + r.error.message); return; }
    jForm = null; say({ ouverture: 'Caisse ouverte : ' + money(m), cloture: 'Caisse clôturée' + (Math.abs(row.ecart) > 0.004 ? ' — écart de ' + money(row.ecart) : ' — aucun écart'), entree: 'Entrée de caisse enregistrée', sortie: 'Sortie de caisse enregistrée' }[t]);
    await loadJour(jDate);
  }
  async function journalPdf() {
    if (!J || !(window.jspdf && window.jspdf.jsPDF)) { say('Bibliothèque PDF non chargée.'); return; }
    const doc = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4' }), W = doc.internal.pageSize.getWidth(), M = 12, k = caisseCalc(), P = s => pdfT(String(s).replace(/[  ]/g, ' '));
    if (typeof LOGO_PDF !== 'undefined' && LOGO_PDF) doc.addImage(LOGO_PDF, 'PNG', M, 8, 18, 18);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.text(P('JOURNAL DES OPERATIONS'), W - M, 15, { align: 'right' });
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.text(P('Journee du ' + fd(jDate)), W - M, 21, { align: 'right' });
    doc.setFontSize(9); doc.text(P('Caisse : ouverture ' + money(k.ouv) + '  |  entrees especes ' + money(k.ent) + '  |  sorties especes ' + money(k.sor) + '  |  solde attendu ' + money(k.att)), M, 33);
    if (J.clo) doc.text(P('Cloture : compte ' + money(J.clo.montant) + '  |  ecart ' + (Math.abs(Number(J.clo.ecart)) < 0.005 ? 'aucun' : money(J.clo.ecart))), M, 38);
    doc.autoTable({ startY: 43, margin: { left: M, right: M }, head: [['Heure', 'Operation', 'Detail', 'Mode', 'Montant (DA)', 'Caisse (DA)'].map(P)],
      body: J.ops.map(o => [o.h, o.type, o.detail, MODES[o.mode] || (o.doc ? 'document' : ''), money(o.montant).replace(' DA', ''), o.caisse ? (o.caisse > 0 ? '+' : '-') + money(Math.abs(o.caisse)).replace(' DA', '') : '-'].map(P)),
      theme: 'grid', styles: { fontSize: 8.5, cellPadding: 2 }, headStyles: { fillColor: [0, 0, 0], textColor: 255 }, columnStyles: { 0: { cellWidth: 14 }, 4: { halign: 'right', cellWidth: 26 }, 5: { halign: 'right', cellWidth: 26 } } });
    const y = doc.lastAutoTable.finalY + 14; doc.setDrawColor(120); doc.rect(M, y, 80, 24); doc.rect(W - M - 80, y, 80, 24); doc.setFontSize(8); doc.setTextColor(90);
    doc.text(P('Caissier(e)'), M + 3, y + 5); doc.text(P('Gerant'), W - M - 77, y + 5);
    doc.save('journal-' + jDate + '.pdf');
  }

  /* ================= Événements ================= */
  document.addEventListener('click', async e => {
    const root = $('#cm-root'); if (!root || !root.contains(e.target)) return;
    const b = e.target.closest('[data-cf]'); if (!b) return;
    const a = b.dataset.cf;
    if (a === 'v-cli' || a === 'v-four') { vForm = { sens: a === 'v-cli' ? 'encaissement' : 'reglement', contactId: '', date: today(), mode: 'especes' }; rerender(); const m = $('#cf-vc'); if (m) m.focus(); return; }
    if (a === 'v-no') { vForm = null; rerender(); return; }
    if (a === 'v-del') return delV(b.dataset.id);
    if (a === 'v-pdf') return recuPdf(b.dataset.id);
    if (a === 'c-new') { cForm = { nature: b.dataset.nat, contactId: '', date: today(), mode: 'especes', cat: 'Autre' }; rerender(); return; }
    if (a === 'c-remb') { const x = personnes().find(y => y.k === b.dataset.k); if (!x) return; cForm = { nature: x.solde > 0 ? 'remb_recu' : 'remb_fait', contactId: x.contact_id || '__autre', nom: x.contact_id ? '' : x.nom, cat: x.cat, montant: Math.abs(x.solde), date: today(), mode: 'especes' }; rerender(); return; }
    if (a === 'c-hist') { cPers = cPers === b.dataset.k ? '' : b.dataset.k; rerender(); return; }
    if (a === 'c-no') { cForm = null; rerender(); return; }
    if (a === 'c-del') return delC(b.dataset.id);
    if (a === 'j-prev' || a === 'j-next') { const d = new Date(jDate + 'T00:00'); d.setDate(d.getDate() + (a === 'j-prev' ? -1 : 1)); jDate = iso(d); jForm = null; rerender(); return; }
    if (a === 'j-auj') { jDate = today(); jForm = null; rerender(); return; }
    if (a === 'j-form') { jForm = { type: b.dataset.t }; rerender(); const m = $('#cf-jm'); if (m) { m.focus(); m.select(); } return; }
    if (a === 'j-no') { jForm = null; rerender(); return; }
    if (a === 'j-pdf') return journalPdf();
    if (a === 'j-del') { if (!confirm('Supprimer cette opération de caisse ?')) return; await sb.from('caisse').delete().eq('id', b.dataset.id); await loadJour(jDate); return; }
    if (a === 'j-rouvrir') { if (!confirm('Rouvrir la caisse ? La clôture de ce jour sera supprimée (vous pourrez clôturer à nouveau).')) return; await sb.from('caisse').delete().eq('id', J.clo.id); await loadJour(jDate); return; }
  });
  document.addEventListener('change', e => {
    const id = e.target.id;
    if (id === 'cf-vc') { lireV(); rerender(); hintV(); }
    else if (id === 'cf-vf') { vFiltre = e.target.value; rerender(); }
    else if (id === 'cf-jd' && e.target.value) { jDate = e.target.value; jForm = null; rerender(); }
    else if (id === 'cf-cc' || id === 'cf-cnat') { lireC(); rerender(); }
  });
  document.addEventListener('input', e => {
    if (e.target.id === 'cf-vm' || e.target.id === 'cf-vn') hintV();
    if (e.target.id === 'cf-jm') ecartTxt();
    if (e.target.id === 'cf-vq') { vQ = e.target.value; const pos = e.target.selectionStart; rerender(); const q = $('#cf-vq'); if (q) { q.focus(); q.setSelectionRange(pos, pos); } }
  });
  document.addEventListener('submit', async e => {
    if (e.target.id === 'cf-vform') { e.preventDefault(); await saveV(); }
    else if (e.target.id === 'cf-cform') { e.preventDefault(); await saveC(); }
    else if (e.target.id === 'cf-jform') { e.preventDefault(); await saveCaisse(); }
  });

  window.CommerceFin = {
    html: t => { if (t !== 'journal') tabActif = t; return t === 'versements' ? paneVersements() : t === 'journal' ? paneJournal() : paneCredits(); },
    // une opération enregistrée ailleurs (versement, bon, crédit…) : le journal du jour est relu à la prochaine ouverture
    invalider: () => { J = null; jCharge = ''; },
    apres: () => hintV(),
    rechargerCredits: loadCredits,
    credits: () => CR, personnes
  };
})();
