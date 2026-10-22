/* ============================================================
   PAIEMENTS DES ATELIERS (façon) + bon de paiement / relevé PDF
   Dû à l'atelier = Σ (prix de façon × quantité lancée) des productions non annulées + solde de départ.
   Reste à payer = dû − paiements. Table : paiements_ateliers (supabase/ateliers_paiements.sql).
   ============================================================ */
(function () {
  'use strict';
  const $ = s => document.querySelector(s);
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const r2 = n => Math.round((Number(n) || 0) * 100) / 100;
  const money = n => (Number(n) || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' DA';
  const iso = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const fd = s => s ? String(s).slice(0, 10).split('-').reverse().join('/') : '';
  const say = t => { if (typeof toastA === 'function') toastA(t); };
  const MODES = { especes: 'Espèces', cheque: 'Chèque', virement: 'Virement', autre: 'Autre' };
  const pdfT = s => String(s ?? '').replace(/œ/g, 'oe').replace(/Œ/g, 'OE').replace(/[  ]/g, ' ');

  let PAY = [], err = '', form = null, filtre = '';

  const ateliers = () => (typeof ATELIERS !== 'undefined' ? ATELIERS : []);
  const prods = () => (typeof PRODUCTIONS !== 'undefined' ? PRODUCTIONS : []);
  const nomAtelier = id => { const a = ateliers().find(x => String(x.id) === String(id)); return a ? a.nom : ''; };
  const facon = p => r2((Number(p.prix_facon) || 0) * (Number(p.quantite_lancee) || 0));
  const prodsDe = id => prods().filter(p => String(p.atelier_id) === String(id) && p.statut !== 'Annulée');

  function etat(id) {
    const ps = prodsDe(id), mine = PAY.filter(x => String(x.atelier_id) === String(id));
    const du = r2(ps.reduce((s, p) => s + facon(p), 0)), report = r2(mine.filter(x => x.type === 'report').reduce((s, x) => s + Number(x.montant || 0), 0));
    const paye = r2(mine.filter(x => x.type !== 'report').reduce((s, x) => s + Number(x.montant || 0), 0));
    return { ps, du, report, paye, reste: r2(du + report - paye), sansPrix: ps.filter(p => !(Number(p.prix_facon) > 0)).length };
  }

  async function load() {
    const r = await sb.from('paiements_ateliers').select('*').order('date_paiement', { ascending: false }).order('created_at', { ascending: false });
    if (r.error) { err = /does not exist|relation|schema cache/i.test(r.error.message) ? 'Table « paiements_ateliers » introuvable : exécutez supabase/ateliers_paiements.sql dans SQL Editor, puis rechargez la page.' : r.error.message; PAY = []; }
    else { err = ''; PAY = r.data || []; }
    render();
  }

  function refDefaut() {
    const t = iso(new Date()).replace(/-/g, '');
    const n = PAY.filter(x => (x.reference || '').startsWith('BP-' + t)).length + 1;
    return 'BP-' + t + '-' + String(n).padStart(2, '0');
  }

  function render() {
    const root = $('#ap-root'); if (!root) return;
    if (err) { root.innerHTML = '<div class="card"><div class="ap-err">' + esc(err) + '</div></div>'; return; }
    const L = ateliers().map(a => Object.assign({ a }, etat(a.id)));
    const tot = L.reduce((t, x) => ({ du: t.du + x.du + x.report, paye: t.paye + x.paye, reste: t.reste + x.reste }), { du: 0, paye: 0, reste: 0 });
    const sans = L.reduce((n, x) => n + x.sansPrix, 0);
    let h = '<div class="card"><div class="at-actions" style="margin-top:0"><h2 style="margin-right:auto">Paiements des ateliers</h2>' +
      '<button class="btn p" type="button" data-ap="payer">+ Payer un atelier</button><button class="btn" type="button" data-ap="report">+ Solde de départ</button></div>' +
      '<div class="at-stats"><div class="at-stat"><span>Total dû aux ateliers</span><b>' + money(tot.du) + '</b></div><div class="at-stat"><span>Déjà payé</span><b>' + money(tot.paye) + '</b></div>' +
      '<div class="at-stat"><span>Reste à payer</span><b style="color:' + (tot.reste > 0.004 ? '#b3261e' : '#1e6e32') + '">' + money(tot.reste) + '</b></div></div>' +
      (sans ? '<p class="ap-help" style="color:#8a5a12">⚠ ' + sans + ' production(s) sans prix de façon : indiquez-le dans Productions (« Prix de façon d’une pièce ») pour calculer ce qui est dû.</p>' : '');
    if (form) h += formHtml();
    h += '<div class="at-scroll"><table class="ap-tbl"><thead><tr><th>Atelier</th><th class="ap-n">Productions</th><th class="ap-n">Dû (façon)</th><th class="ap-n">Payé</th><th class="ap-n">Reste à payer</th><th>Actions</th></tr></thead><tbody>' +
      (L.length ? L.map(x => '<tr><td><b>' + esc(x.a.nom) + '</b>' + (x.a.responsable ? '<small>' + esc(x.a.responsable) + '</small>' : '') + '</td><td class="ap-n">' + x.ps.length + '</td>' +
        '<td class="ap-n">' + money(x.du + x.report) + (x.report ? '<small>dont départ : ' + money(x.report) + '</small>' : '') + '</td><td class="ap-n">' + money(x.paye) + '</td>' +
        '<td class="ap-n"><b style="color:' + (x.reste > 0.004 ? '#b3261e' : x.reste < -0.004 ? '#8a5a12' : '#1e6e32') + '">' + money(x.reste) + '</b>' + (x.reste < -0.004 ? '<small>avance</small>' : '') + '</td>' +
        '<td class="ap-act"><button class="btn xs p" type="button" data-ap="payer" data-id="' + esc(x.a.id) + '">Payer</button> <button class="btn xs" type="button" data-ap="releve" data-id="' + esc(x.a.id) + '">Relevé PDF</button></td></tr>').join('')
        : '<tr><td colspan="6" class="at-empty">Aucun atelier. Créez d’abord un atelier.</td></tr>') + '</tbody></table></div></div>';
    const list = PAY.filter(x => !filtre || String(x.atelier_id) === filtre);
    h += '<div class="card" style="margin-top:12px"><div class="at-actions" style="margin-top:0"><h2 style="margin-right:auto">Historique des paiements</h2><select id="ap-filtre"><option value="">Tous les ateliers</option>' +
      ateliers().map(a => '<option value="' + esc(a.id) + '"' + (filtre === String(a.id) ? ' selected' : '') + '>' + esc(a.nom) + '</option>').join('') + '</select></div>' +
      '<div class="at-scroll"><table class="ap-tbl"><thead><tr><th>Date</th><th>Atelier</th><th>Production</th><th>Mode</th><th>Référence</th><th class="ap-n">Montant</th><th>Actions</th></tr></thead><tbody>' +
      (list.length ? list.map(x => { const p = prods().find(q => String(q.id) === String(x.production_id)); const rep = x.type === 'report';
        return '<tr><td>' + fd(x.date_paiement) + '</td><td>' + esc(nomAtelier(x.atelier_id) || x.atelier_nom || '—') + '</td><td>' + (rep ? '<i>Solde de départ</i>' : esc(p ? p.modele_nom : '—')) + '</td><td>' + (rep ? '—' : esc(MODES[x.mode] || x.mode || '')) + '</td><td>' + esc(x.reference || '') + (x.note ? '<small>' + esc(x.note) + '</small>' : '') + '</td>' +
          '<td class="ap-n"><b>' + money(x.montant) + '</b></td><td class="ap-act">' + (rep ? '' : '<button class="btn xs" type="button" data-ap="bon" data-id="' + esc(x.id) + '">Bon PDF</button> ') + '<button class="btn xs r" type="button" data-ap="suppr" data-id="' + esc(x.id) + '">Supprimer</button></td></tr>'; }).join('')
        : '<tr><td colspan="7" class="at-empty">Aucun paiement enregistré.</td></tr>') + '</tbody></table></div></div>';
    root.innerHTML = h; majHint();
  }

  function formHtml() {
    const f = form, ps = f.atelierId ? prodsDe(f.atelierId) : [];
    return '<form id="ap-form" class="at-form" style="display:block"><h3 style="margin-top:0">' + (f.report ? 'Solde de départ (dû avant l’utilisation de la plateforme)' : 'Paiement à un atelier') + '</h3><div class="at-fields">' +
      '<label>Atelier *<select id="ap-atelier" required><option value="">— Choisir —</option>' + ateliers().map(a => '<option value="' + esc(a.id) + '"' + (String(f.atelierId) === String(a.id) ? ' selected' : '') + '>' + esc(a.nom) + '</option>').join('') + '</select></label>' +
      (f.report ? '' : '<label>Production concernée<select id="ap-prod"><option value="">— Toutes / général —</option>' + ps.map(p => '<option value="' + esc(p.id) + '"' + (String(f.prodId) === String(p.id) ? ' selected' : '') + '>' + esc(p.modele_nom) + ' (' + (Number(p.quantite_lancee) || 0) + ' pcs)</option>').join('') + '</select></label>') +
      '<label>Date *<input id="ap-date" type="date" required value="' + esc(f.date) + '"></label><label>Montant (DA) *<input id="ap-montant" type="number" min="0.01" step="0.01" inputmode="decimal" required value="' + esc(f.montant) + '"></label>' +
      (f.report ? '' : '<label>Mode de paiement<select id="ap-mode">' + Object.keys(MODES).map(k => '<option value="' + k + '"' + (f.mode === k ? ' selected' : '') + '>' + MODES[k] + '</option>').join('') + '</select></label><label>Référence du bon<input id="ap-ref" maxlength="40" value="' + esc(f.ref) + '"></label>') +
      '<label style="grid-column:1/-1">Note<input id="ap-note" maxlength="200" value="' + esc(f.note) + '"></label></div><div id="ap-hint" class="ap-help"></div>' +
      '<div class="at-actions"><button class="btn p" type="submit">Enregistrer</button><button class="btn" type="button" data-ap="annuler">Annuler</button></div></form>';
  }
  function lire() {
    if (!form || !$('#ap-montant')) return;
    form.atelierId = $('#ap-atelier').value; form.date = $('#ap-date').value; form.montant = $('#ap-montant').value; form.note = $('#ap-note').value;
    if ($('#ap-prod')) form.prodId = $('#ap-prod').value; if ($('#ap-mode')) form.mode = $('#ap-mode').value; if ($('#ap-ref')) form.ref = $('#ap-ref').value;
  }
  function majHint() {
    const h = $('#ap-hint'); if (!h || !form) return;
    if (!form.atelierId) { h.textContent = 'Choisissez l’atelier.'; return; }
    const e = etat(form.atelierId), m = parseFloat($('#ap-montant').value) || 0, apres = form.report ? e.reste + m : e.reste - m;
    h.innerHTML = 'Reste à payer actuel : <b>' + money(e.reste) + '</b>' + (m > 0 ? ' → après : <b style="color:' + (apres < -0.004 ? '#8a5a12' : '#1e6e32') + '">' + money(apres) + '</b>' + (apres < -0.004 ? ' (avance)' : '') : '');
  }
  function ouvrir(o) { form = Object.assign({ report: false, atelierId: '', prodId: '', date: iso(new Date()), montant: '', mode: 'especes', ref: refDefaut(), note: '' }, o || {}); render(); const m = $('#ap-montant'); if (m) { m.scrollIntoView({ behavior: 'smooth', block: 'center' }); m.focus(); } }

  async function enregistrer() {
    lire();
    const m = parseFloat(String(form.montant).replace(',', '.'));
    if (!form.atelierId) { say('Choisissez un atelier.'); return; }
    if (!(m > 0)) { say('Indiquez un montant supérieur à 0.'); return; }
    const row = { atelier_id: form.atelierId, atelier_nom: nomAtelier(form.atelierId), production_id: form.report ? null : (form.prodId || null), type: form.report ? 'report' : 'paiement', date_paiement: form.date || iso(new Date()),
      montant: r2(m), mode: form.report ? '' : (form.mode || 'especes'), reference: form.report ? '' : (form.ref || '').trim() || refDefaut(), note: (form.note || '').trim() };
    const r = await sb.from('paiements_ateliers').insert([row]).select();
    if (r.error) { say('Erreur : ' + r.error.message); return; }
    const saved = r.data && r.data[0], report = form.report;
    form = null; await load(); say(report ? 'Solde de départ enregistré.' : 'Paiement enregistré.');
    if (!report && saved && confirm('Paiement enregistré (' + saved.reference + ').\nTélécharger le bon de paiement PDF ?')) bonPdf(saved.atelier_id, saved.id);
  }
  async function supprimer(id) {
    const x = PAY.find(p => String(p.id) === String(id)); if (!x || !confirm('Supprimer ce ' + (x.type === 'report' ? 'solde de départ' : 'paiement') + ' de ' + money(x.montant) + ' ?')) return;
    const r = await sb.from('paiements_ateliers').delete().eq('id', id);
    if (r.error) { say('Erreur : ' + r.error.message); return; }
    await load(); say('Supprimé.');
  }

  /* ---------- PDF : bon de paiement (payId) ou relevé de l'atelier ---------- */
  async function entreprise() { try { const p = await sb.from('parametres').select('*').eq('cle', 'entreprise'); return (p.data && p.data[0] && p.data[0].valeur) || {}; } catch (e) { return {}; } }
  async function bonPdf(atelierId, payId) {
    if (!(window.jspdf && window.jspdf.jsPDF)) { say('Bibliothèque PDF non chargée.'); return; }
    const a = ateliers().find(x => String(x.id) === String(atelierId)); if (!a) { say('Atelier introuvable.'); return; }
    const pay = payId ? PAY.find(x => String(x.id) === String(payId)) : null, e = etat(atelierId), ENT = await entreprise();
    const doc = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4' }), M = 14, W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight();
    const T = (t, x, y, o) => doc.text(pdfT(t), x, y, o);
    doc.setTextColor(0); doc.setFont('helvetica', 'bold'); doc.setFontSize(15); T(ENT.nom || 'MARIA BAG', M, 16);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(90);
    [[ENT.adresse, ENT.ville].filter(Boolean).join(', '), [ENT.tel && 'Tel : ' + ENT.tel, ENT.email].filter(Boolean).join('  -  ')].filter(Boolean).forEach((l, i) => T(l, M, 21 + i * 4));
    doc.setTextColor(0); doc.setFont('helvetica', 'bold'); doc.setFontSize(16); T(pay ? 'BON DE PAIEMENT ATELIER' : 'RELEVE DE COMPTE ATELIER', W - M, 16, { align: 'right' });
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10); T(pay ? 'N° ' + (pay.reference || '') : 'Arrete au ' + fd(iso(new Date())), W - M, 23, { align: 'right' });
    if (pay) T('Date : ' + fd(pay.date_paiement), W - M, 29, { align: 'right' });
    doc.setDrawColor(180); doc.line(M, 33, W - M, 33);
    doc.setFontSize(8.5); doc.setTextColor(90); T('ATELIER', M, 40);
    doc.setTextColor(0); doc.setFont('helvetica', 'bold'); doc.setFontSize(12); T(a.nom, M, 46);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); T([a.responsable && 'Responsable : ' + a.responsable, a.tel && 'Tel : ' + a.tel, a.adresse].filter(Boolean).join('   -   '), M, 51);

    doc.autoTable({ startY: 57, margin: { left: M, right: M, bottom: 20 }, theme: 'grid', styles: { fontSize: 8.5, cellPadding: 1.8 }, headStyles: { fillColor: [74, 44, 42], textColor: 255 },
      head: [['Production (modele)', 'Lancement', 'Quantite', 'Prix de facon', 'Montant']],
      body: (e.ps.length ? e.ps.map(p => [p.modele_nom, fd(p.date_lancement), String(Number(p.quantite_lancee) || 0), Number(p.prix_facon) > 0 ? money(p.prix_facon) : '-', Number(p.prix_facon) > 0 ? money(facon(p)) : '-']) : [['Aucune production', '', '', '', '']]).map(r => r.map(pdfT)),
      columnStyles: { 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' } } });
    const mine = PAY.filter(x => String(x.atelier_id) === String(atelierId) && x.type !== 'report').sort((x, y) => String(x.date_paiement).localeCompare(String(y.date_paiement)));
    doc.autoTable({ startY: doc.lastAutoTable.finalY + 6, margin: { left: M, right: M, bottom: 20 }, theme: 'grid', styles: { fontSize: 8.5, cellPadding: 1.8 }, headStyles: { fillColor: [138, 90, 18], textColor: 255 },
      head: [['Paiements', 'Mode', 'Reference', 'Montant']],
      body: (mine.length ? mine.map(x => [fd(x.date_paiement) + (pay && x.id === pay.id ? '  (ce bon)' : ''), MODES[x.mode] || x.mode || '', x.reference || '', money(x.montant)]) : [['Aucun paiement', '', '', '-']]).map(r => r.map(pdfT)),
      didParseCell: d => { if (pay && d.section === 'body' && mine[d.row.index] && mine[d.row.index].id === pay.id) { d.cell.styles.fontStyle = 'bold'; d.cell.styles.fillColor = [255, 243, 214]; } },
      columnStyles: { 3: { halign: 'right' } } });
    let y = doc.lastAutoTable.finalY + 8; if (y > H - 75) { doc.addPage(); y = 20; }
    const L = (l, v, bold, col) => { doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(bold ? 12 : 10); doc.setTextColor(...(col || [0, 0, 0])); T(l, M, y); T(v, W - M, y, { align: 'right' }); y += bold ? 8 : 6; };
    L('Total facon des productions', money(e.du)); if (e.report) L('Solde de depart (avant la plateforme)', money(e.report));
    L('Total deja paye', '- ' + money(e.paye)); doc.setDrawColor(120); doc.line(M, y - 3, W - M, y - 3); y += 1;
    L('RESTE A PAYER A L\'ATELIER', money(e.reste), true, e.reste > 0.004 ? [180, 30, 30] : [30, 110, 50]);
    if (pay) { y += 2; doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(0);
      const lettres = window.CommerceAPI && CommerceAPI.montantLettres ? CommerceAPI.montantLettres(pay.montant) : ''; const phrase = 'L\'atelier ' + a.nom + ' reconnait avoir recu de ' + (ENT.nom || 'MARIA BAG') + ' la somme de ' + money(pay.montant) + (lettres ? ' (' + lettres + ')' : '') + ', en ' + (MODES[pay.mode] || pay.mode || 'especes').toLowerCase() + ', pour la facon des productions confiees a l\'atelier.';
      doc.splitTextToSize(pdfT(phrase), W - 2 * M).forEach(l => { doc.text(l, M, y); y += 5; }); if (pay.note) { doc.setTextColor(90); T('Note : ' + pay.note, M, y); y += 5; } }
    y = Math.max(y + 8, H - 38); if (y > H - 30) { doc.addPage(); y = H - 38; }
    doc.setTextColor(60); doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setDrawColor(150);
    T('Signature de l\'employeur', M, y); T('Signature de l\'atelier (lu et approuve)', W - M - 62, y); doc.line(M, y + 16, M + 60, y + 16); doc.line(W - M - 62, y + 16, W - M, y + 16);
    doc.save(('Atelier_' + (pay ? 'bon_' + (pay.reference || '') : 'releve') + '_' + a.nom).replace(/[^\w-]+/g, '_') + '.pdf'); say('PDF généré.');
  }

  document.addEventListener('click', e => {
    const b = e.target.closest('[data-ap]'); const root = $('#ap-root'); if (!b || !root || !root.contains(b)) return;
    const k = b.dataset.ap, id = b.dataset.id;
    if (k === 'payer') ouvrir({ atelierId: id || '' }); else if (k === 'report') ouvrir({ report: true, atelierId: id || '' });
    else if (k === 'annuler') { form = null; render(); } else if (k === 'bon') { const x = PAY.find(p => String(p.id) === String(id)); if (x) bonPdf(x.atelier_id, x.id); }
    else if (k === 'releve') bonPdf(id, null); else if (k === 'suppr') supprimer(id);
  });
  document.addEventListener('change', e => {
    if (e.target.id === 'ap-filtre') { filtre = e.target.value; render(); return; }
    if (e.target.id === 'ap-atelier') { lire(); form.prodId = ''; render(); }
  });
  document.addEventListener('input', e => { if (e.target.id === 'ap-montant') majHint(); });
  document.addEventListener('submit', e => { if (e.target.id === 'ap-form') { e.preventDefault(); enregistrer(); } });
  window.loadAteliersPaie = load;
  document.addEventListener('mariabag:authenticated', () => { load(); });
})();
