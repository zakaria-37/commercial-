/* ============================================================
   PAIEMENTS ET SOLDES (onglet Contacts > « Paiements et soldes »)
   Solde client      = solde de départ + ventes (livraisons − retours) − encaissements
   Solde fournisseur = solde de départ + achats (entrées de stock avec prix) − règlements
   Table : paiements (supabase/paiements.sql)
   ============================================================ */
(function () {
  'use strict';
  const $ = s => document.querySelector(s);
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  const r2 = x => Math.round((Number(x) + Number.EPSILON) * 100) / 100;
  const money = n => (Number(n) || 0).toLocaleString('fr-FR', { maximumFractionDigits: 2 }) + ' DA';
  const fd = s => s ? String(s).slice(0, 10).split('-').reverse().join('/') : '—';
  const iso = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const say = t => { if (typeof toast === 'function') toast(t); };
  const MODES = { especes: 'Espèces', cheque: 'Chèque', virement: 'Virement', autre: 'Autre' };
  const SENS = { encaissement: 'Encaissement', reglement: 'Règlement', report_client: 'Solde de départ', report_fournisseur: 'Solde de départ' };

  let PAY = [], err = '', vue = 'client', form = null, ouvert = '';

  async function load() {
    const r = await sb.from('paiements').select('*').order('date_paiement', { ascending: false }).order('created_at', { ascending: false });
    if (r.error) { err = /does not exist|relation|schema cache/i.test(r.error.message) ? 'Table « paiements » introuvable dans Supabase. Exécutez supabase/paiements.sql dans SQL Editor, puis rechargez la page.' : r.error.message; PAY = []; }
    else { err = ''; PAY = r.data || []; }
    const box = $('#ct-rank');
    if (box && !box.hidden && $('#ct-tabs [data-ctp=pay]') && $('#ct-tabs [data-ctp=pay]').classList.contains('on') && !(document.activeElement && box.contains(document.activeElement) && /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName))) render(box);
    document.dispatchEvent(new Event('mariabag:paiements'));
  }

  const contacts = () => (typeof D !== 'undefined' && Array.isArray(D)) ? D : [];
  const cById = id => contacts().find(c => String(c.id) === String(id));
  const lbl = c => window.PartAPI ? PartAPI.label(c) : (c.societe || c.nom);

  /* ---------- Calcul des soldes ---------- */
  function soldes(v) {
    const cl = v === 'client', sensOp = cl ? 'vente' : 'achat', payS = cl ? 'encaissement' : 'reglement', repS = cl ? 'report_client' : 'report_fournisseur';
    const g = new Map();
    const get = (key, id, nom) => { let x = g.get(key); if (!x) { x = { key, id: id || null, nom: nom || '', facture: 0, report: 0, paye: 0, dernier: '', sansPrix: 0, ops: [], pays: [] }; g.set(key, x); } if (!x.nom && nom) x.nom = nom; return x; };
    (window.PartAPI ? PartAPI.ops({}) : []).filter(o => o.sens === sensOp && o.key !== 'none').forEach(o => {
      const x = get(o.key, o.id, o.nom); x.facture += o.montant; if (o.sansPrix) x.sansPrix++; x.ops.push(o);
    });
    PAY.filter(p => p.sens === payS || p.sens === repS).forEach(p => {
      const c = p.contact_id ? cById(p.contact_id) : null;
      const key = p.contact_id ? 'c:' + p.contact_id : 't:' + norm(p.contact_nom);
      const x = get(key, p.contact_id, c ? lbl(c) : p.contact_nom);
      if (p.sens === repS) x.report += Number(p.montant); else { x.paye += Number(p.montant); if (String(p.date_paiement) > x.dernier) x.dernier = String(p.date_paiement); }
      x.pays.push(p);
    });
    const liste = [...g.values()].map(x => Object.assign(x, { facture: r2(x.facture), report: r2(x.report), paye: r2(x.paye), solde: r2(x.report + x.facture - x.paye) }));
    return liste.sort((a, b) => b.solde - a.solde);
  }

  /* ---------- Formulaire ---------- */
  function lireForm() {
    if (!form || !$('#pay-montant')) return;
    form.contactId = $('#pay-contact').value; form.date = $('#pay-date').value; form.montant = $('#pay-montant').value;
    form.mode = $('#pay-mode').value; form.ref = $('#pay-ref').value; form.note = $('#pay-note').value;
  }
  function ouvrirForm(o) {
    form = Object.assign({ report: false, contactId: '', date: iso(new Date()), montant: '', mode: 'especes', ref: '', note: '' }, o || {});
    const box = $('#ct-rank'); if (box) { render(box); const m = $('#pay-montant'); if (m) { m.scrollIntoView({ behavior: 'smooth', block: 'center' }); m.focus(); } }
  }
  function majHint() {
    const h = $('#pay-hint'); if (!h || !form) return;
    const id = $('#pay-contact').value, m = parseFloat($('#pay-montant').value) || 0;
    const s = soldes(vue).find(x => String(x.id) === String(id));
    const cur = s ? s.solde : 0, apres = form.report ? cur + m : cur - m;
    h.innerHTML = id ? 'Solde actuel : <b>' + money(cur) + '</b>' + (m > 0 ? ' → après : <b class="' + (apres < 0 ? 'py-av' : '') + '">' + money(apres) + '</b>' + (apres < 0 ? ' (avance / trop-perçu)' : '') : '') : 'Choisissez le ' + (vue === 'client' ? 'client' : 'fournisseur') + '.';
  }
  async function enregistrer() {
    lireForm();
    const c = cById(form.contactId), m = parseFloat(String(form.montant).replace(',', '.'));
    if (!c) { say('Choisissez un contact.'); return; }
    if (!(m > 0)) { say('Indiquez un montant supérieur à 0.'); return; }
    if (!form.date) { say('Indiquez la date.'); return; }
    const cl = vue === 'client';
    const row = { date_paiement: form.date, sens: form.report ? (cl ? 'report_client' : 'report_fournisseur') : (cl ? 'encaissement' : 'reglement'), contact_id: c.id, contact_nom: lbl(c), montant: r2(m), mode: form.mode, reference: form.ref.trim(), note: form.note.trim() };
    const s = soldes(vue).find(x => String(x.id) === String(c.id));
    if (!form.report && s && r2(m) > s.solde + 0.004 && !confirm('Ce montant (' + money(m) + ') dépasse le solde actuel (' + money(s.solde) + ').\nLa différence sera une avance. Continuer ?')) return;
    const r = await sb.from('paiements').insert([row]);
    if (r.error) { say('Erreur : ' + r.error.message); return; }
    const lib = row.sens.startsWith('report') ? 'Solde de départ' : cl ? 'Encaissement' : 'Règlement';
    form = null; await load(); say(lib + ' enregistré : ' + money(m));
  }
  async function supprimer(id) {
    const p = PAY.find(x => String(x.id) === String(id)); if (!p) return;
    if (!confirm('Supprimer ce paiement de ' + money(p.montant) + ' (' + fd(p.date_paiement) + ' · ' + (p.contact_nom || '') + ') ?\nLe solde sera recalculé.')) return;
    const r = await sb.from('paiements').delete().eq('id', id);
    if (r.error) { say('Erreur : ' + r.error.message); return; }
    await load();
  }

  /* ---------- Affichage ---------- */
  function soldeTxt(x, cl) {
    if (Math.abs(x.solde) < 0.005) return '<span class="py-bdg ok">Soldé</span>';
    if (x.solde < 0) return '<b class="py-av">' + money(-x.solde) + '</b><small>avance (trop-perçu)</small>';
    return '<b class="' + (cl ? 'py-due' : 'py-pay') + '">' + money(x.solde) + '</b>';
  }
  function render(box) {
    lireForm();
    if (err) { box.innerHTML = '<div class="card"><div class="ct-empty" style="color:#b3261e">' + esc(err) + '</div></div>'; return; }
    const cl = vue === 'client', liste = soldes(vue);
    const sc = soldes('client'), sf = soldes('fournisseur');
    const somme = l => r2(l.filter(x => x.solde > 0).reduce((t, x) => t + x.solde, 0));
    const d30 = new Date(); d30.setDate(d30.getDate() - 30); const lim = iso(d30);
    const m30 = s => r2(PAY.filter(p => p.sens === s && String(p.date_paiement) >= lim).reduce((t, p) => t + Number(p.montant), 0));
    let h = '<div class="ct-bar"><div class="at-tabs py-sub" style="margin:0"><button type="button" data-pv="client" class="' + (cl ? 'on' : '') + '">Clients</button><button type="button" data-pv="fournisseur" class="' + (!cl ? 'on' : '') + '">Fournisseurs</button></div>' +
      '<button class="btn p" type="button" id="pay-new">+ ' + (cl ? 'Encaissement' : 'Règlement') + '</button><button class="btn" type="button" id="pay-rep">Solde de départ</button></div>';
    h += '<div class="ct-kpis">' +
      '<div class="ct-kpi"><span>Les clients vous doivent</span><b class="py-due">' + money(somme(sc)) + '</b><small>' + sc.filter(x => x.solde > 0.004).length + ' client(s) en crédit</small></div>' +
      '<div class="ct-kpi"><span>Vous devez aux fournisseurs</span><b class="py-pay">' + money(somme(sf)) + '</b><small>' + sf.filter(x => x.solde > 0.004).length + ' fournisseur(s) à payer</small></div>' +
      '<div class="ct-kpi"><span>Position nette</span><b>' + money(somme(sc) - somme(sf)) + '</b><small>créances − dettes</small></div>' +
      '<div class="ct-kpi"><span>' + (cl ? 'Encaissé' : 'Réglé') + ' (30 derniers jours)</span><b>' + money(m30(cl ? 'encaissement' : 'reglement')) + '</b><small>' + (cl ? 'encaissements' : 'règlements') + '</small></div></div>';
    if (form) {
      const cs = contacts().filter(c => c.type === (cl ? 'Client' : 'Fournisseur')).sort((a, b) => lbl(a).localeCompare(lbl(b), 'fr'));
      h += '<form class="card py-form" id="pay-form"><h2 style="margin-top:0">' + (form.report ? 'Solde de départ ' + (cl ? 'client' : 'fournisseur') : (cl ? 'Nouvel encaissement' : 'Nouveau règlement')) + '</h2>' +
        (form.report ? '<p class="iv-help">Montant <b>déjà ' + (cl ? 'dû par le client' : 'dû au fournisseur') + ' avant d’utiliser la plateforme</b>. Il s’ajoute au solde.</p>' : '') +
        '<div class="at-fields"><label>' + (cl ? 'Client' : 'Fournisseur') + ' *<select id="pay-contact"><option value="">— choisir —</option>' + cs.map(c => '<option value="' + esc(c.id) + '"' + (String(c.id) === String(form.contactId) ? ' selected' : '') + '>' + esc(lbl(c)) + '</option>').join('') + '</select></label>' +
        '<label>Date<input id="pay-date" type="date" value="' + esc(form.date) + '"></label>' +
        '<label>Montant (DA) *<input id="pay-montant" type="number" min="0" step="any" inputmode="decimal" value="' + esc(form.montant) + '" placeholder="Ex : 50000"></label>' +
        (form.report ? '<input id="pay-mode" type="hidden" value="autre">' : '<label>Mode<select id="pay-mode">' + Object.keys(MODES).map(k => '<option value="' + k + '"' + (form.mode === k ? ' selected' : '') + '>' + MODES[k] + '</option>').join('') + '</select></label>') +
        '<label>Référence<input id="pay-ref" maxlength="80" value="' + esc(form.ref) + '" placeholder="N° de chèque, reçu…"></label>' +
        '<label>Note<input id="pay-note" maxlength="200" value="' + esc(form.note) + '" placeholder="Facultatif"></label></div>' +
        '<div id="pay-hint" class="st-hint"></div><div class="at-actions"><button class="btn p" type="submit">Enregistrer</button><button class="btn" type="button" id="pay-cancel">Annuler</button></div></form>';
    }
    h += '<div class="card"><h2 style="margin-top:0">Soldes ' + (cl ? 'des clients' : 'des fournisseurs') + '</h2>';
    h += liste.length ? '<div class="tw"><table class="ct-tbl"><thead><tr><th>' + (cl ? 'Client' : 'Fournisseur') + '</th><th class="n ct-col-opt">' + (cl ? 'Ventes' : 'Achats') + '</th><th class="n ct-col-opt">Solde de départ</th><th class="n">' + (cl ? 'Encaissé' : 'Réglé') + '</th><th class="n">Solde</th><th class="ct-col-opt">Dernier paiement</th><th></th></tr></thead><tbody>' +
      liste.map(x => { const op = ouvert === x.key + vue;
        let r = '<tr class="row" data-pk="' + esc(x.key) + '"><td><b>' + esc(x.nom || 'Sans nom') + '</b>' + (x.sansPrix ? '<small>' + x.sansPrix + (cl ? ' livraison(s)' : ' achat(s)') + ' sans prix : non comptée(s)</small>' : '') + (!x.id ? '<small>Pas dans les Contacts</small>' : '') + '</td>' +
          '<td class="n ct-col-opt">' + money(x.facture) + '</td><td class="n ct-col-opt">' + (x.report ? money(x.report) : '—') + '</td><td class="n">' + (x.paye ? money(x.paye) : '—') + '</td><td class="n">' + soldeTxt(x, cl) + '</td><td class="ct-col-opt">' + fd(x.dernier) + '</td>' +
          '<td class="n">' + (x.id ? '<button class="btn s" type="button" data-payfor="' + esc(x.id) + '">' + (cl ? 'Encaisser' : 'Régler') + '</button>' : '') + '</td></tr>';
        if (op) r += '<tr class="ct-det"><td colspan="7">' + (x.pays.length ? '<table class="ct-tbl"><thead><tr><th>Date</th><th>Type</th><th>Mode</th><th class="n">Montant</th><th>Réf.</th><th></th></tr></thead><tbody>' + x.pays.slice().sort((a, b) => String(b.date_paiement).localeCompare(String(a.date_paiement))).map(p => '<tr><td>' + fd(p.date_paiement) + '</td><td>' + SENS[p.sens] + '</td><td>' + (MODES[p.mode] || '') + '</td><td class="n">' + money(p.montant) + '</td><td>' + esc(p.reference || '') + (p.note ? '<small>' + esc(p.note) + '</small>' : '') + '</td><td class="n"><button class="btn s d" type="button" data-paydel="' + esc(p.id) + '">Supprimer</button></td></tr>').join('') + '</tbody></table>' : '<div class="ct-empty">Aucun paiement enregistré.</div>') + '</td></tr>';
        return r; }).join('') + '</tbody></table></div>' +
      '<p class="ct-note">Solde = solde de départ + ' + (cl ? 'ventes (livraisons moins retours)' : 'achats avec prix') + ' − ' + (cl ? 'encaissements' : 'règlements') + '. Cliquez sur une ligne pour voir et corriger les paiements. ' + (cl ? 'Les livraisons sans prix ne sont pas comptées : saisissez le prix de vente.' : 'Les achats sans prix ne sont pas comptés.') + '</p>' : '<div class="ct-empty">Aucun solde pour le moment.<br>Utilisez « Solde de départ » pour reprendre ce qui est déjà dû, puis « ' + (cl ? 'Encaissement' : 'Règlement') + ' » à chaque paiement.</div>';
    h += '</div>';
    const hist = PAY.filter(p => cl ? (p.sens === 'encaissement' || p.sens === 'report_client') : (p.sens === 'reglement' || p.sens === 'report_fournisseur')).slice(0, 30);
    if (hist.length) h += '<div class="card" style="margin-top:12px"><h2 style="margin-top:0">Derniers paiements</h2><div class="tw"><table class="ct-tbl"><thead><tr><th>Date</th><th>' + (cl ? 'Client' : 'Fournisseur') + '</th><th>Type</th><th class="ct-col-opt">Mode</th><th class="n">Montant</th></tr></thead><tbody>' +
      hist.map(p => '<tr><td>' + fd(p.date_paiement) + '</td><td><b>' + esc(p.contact_nom || '') + '</b></td><td>' + SENS[p.sens] + '</td><td class="ct-col-opt">' + (MODES[p.mode] || '') + '</td><td class="n"><b>' + money(p.montant) + '</b></td></tr>').join('') + '</tbody></table></div></div>';
    box.innerHTML = h;
    if (form) majHint();
  }

  document.addEventListener('click', async e => {
    const root = $('#ct-rank'); if (!root || !root.contains(e.target) || !$('#ct-tabs [data-ctp=pay]').classList.contains('on')) return;
    const t = e.target;
    const pv = t.closest('[data-pv]'); if (pv) { vue = pv.dataset.pv; form = null; ouvert = ''; render(root); return; }
    if (t.closest('#pay-new')) { ouvrirForm({}); return; }
    if (t.closest('#pay-rep')) { ouvrirForm({ report: true }); return; }
    if (t.closest('#pay-cancel')) { form = null; render(root); return; }
    const pf = t.closest('[data-payfor]'); if (pf) { ouvrirForm({ contactId: pf.dataset.payfor }); return; }
    const pd = t.closest('[data-paydel]'); if (pd) { await supprimer(pd.dataset.paydel); return; }
    const row = t.closest('tr[data-pk]'); if (row && !t.closest('button')) { const k = row.dataset.pk + vue; ouvert = ouvert === k ? '' : k; render(root); }
  });
  document.addEventListener('submit', e => { if (e.target.id === 'pay-form') { e.preventDefault(); enregistrer(); } });
  document.addEventListener('input', e => { if (e.target.closest && e.target.closest('#pay-form')) { lireForm(); majHint(); } });
  document.addEventListener('change', e => { if (e.target.closest && e.target.closest('#pay-form')) { lireForm(); majHint(); } });
  ['mariabag:authenticated'].forEach(ev => document.addEventListener(ev, load));

  window.loadPaiements = load;
  window.PayAPI = { load, render, soldes, list: () => PAY };
})();
