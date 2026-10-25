/* ============================================================
   CUMUL DES HEURES SUP (mises de côté) : mois par mois, par employé, avec le total à remettre.
   Total gagné = Σ heures sup × taux sup ; reste à remettre = gagné + soldes de départ − remises (même calcul que employes.js).
   ============================================================ */
(function () {
  'use strict';
  const MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  const lblMois = m => MOIS[Number(m.slice(5, 7)) - 1] + ' ' + m.slice(0, 4);
  const pdfT = s => String(s ?? '').replace(/œ/g, 'oe').replace(/Œ/g, 'OE').replace(/[  ]/g, ' ');
  const MAIS = { 'févr.': 'fevr.', 'août': 'aout', 'déc.': 'dec.' };

  function calcul() {
    const mois = new Set(), parEmp = {};
    EMPLOYES.forEach(e => { parEmp[e.id] = {}; });
    POINT_ALL.forEach(p => {
      const e = EMPLOYES.find(x => String(x.id) === String(p.employe_id)); if (!e) return;
      const s = detail(p, e).sup; if (s <= 0) return;
      const m = String(p.date_pointage).slice(0, 7); mois.add(m);
      const c = parEmp[e.id][m] || (parEmp[e.id][m] = { h: 0, mt: 0 });
      c.h += s; c.mt += s * tauxSup(e);
    });
    const ms = [...mois].sort();
    const lignes = EMPLOYES.map(e => {
      const gagne = round2(ms.reduce((t, m) => t + ((parEmp[e.id][m] || {}).mt || 0), 0));
      const rep = supReportee(e.id), rem = supRemise(e.id), heures = ms.reduce((t, m) => t + ((parEmp[e.id][m] || {}).h || 0), 0);
      return { e, cells: ms.map(m => parEmp[e.id][m] || { h: 0, mt: 0 }), gagne, rep, rem, heures, reste: round2(gagne + rep - rem) };
    }).filter(l => l.gagne > 0 || l.rep > 0 || l.rem > 0);
    const tot = { cells: ms.map((m, i) => ({ h: lignes.reduce((t, l) => t + l.cells[i].h, 0), mt: lignes.reduce((t, l) => t + l.cells[i].mt, 0) })),
      gagne: round2(lignes.reduce((t, l) => t + l.gagne, 0)), rep: round2(lignes.reduce((t, l) => t + l.rep, 0)), rem: round2(lignes.reduce((t, l) => t + l.rem, 0)),
      heures: lignes.reduce((t, l) => t + l.heures, 0), reste: round2(lignes.reduce((t, l) => t + l.reste, 0)) };
    return { ms, lignes, tot };
  }

  function render() {
    const box = document.getElementById('hs-cumul'); if (!box) return;
    const { ms, lignes, tot } = calcul();
    if (!lignes.length) { box.innerHTML = '<div class="at-empty">Aucune heure supplémentaire enregistrée pour le moment.</div>'; return; }
    const cell = c => c.mt > 0.004 ? '<b>' + money(c.mt) + '</b><small>' + fmtH(c.h) + '</small>' : '<small>—</small>';
    box.innerHTML = '<div class="at-stats"><div class="at-stat"><span>Total des heures sup gagnées</span><b style="color:#8a5a12">' + money(tot.gagne + tot.rep) + '</b></div>' +
      '<div class="at-stat"><span>Déjà remis</span><b>' + money(tot.rem) + '</b></div>' +
      '<div class="at-stat"><span>TOTAL À REMETTRE aux employés</span><b style="color:#8a5a12">' + money(tot.reste) + '</b></div></div>' +
      '<div class="at-scroll"><table id="hs-cumul-tbl" style="min-width:0"><thead><tr><th>Employé</th>' + ms.map(m => '<th>' + lblMois(m) + '</th>').join('') +
      '<th>Total gagné</th><th>Départ</th><th>Déjà remis</th><th>Reste à remettre</th></tr></thead><tbody>' +
      lignes.map(l => '<tr><td><b>' + escE(l.e.nom) + '</b> ' + escE(l.e.prenom || '') + '</td>' + l.cells.map(c => '<td>' + cell(c) + '</td>').join('') +
        '<td><b>' + money(l.gagne) + '</b><small>' + fmtH(l.heures) + '</small></td><td>' + (l.rep ? money(l.rep) : '—') + '</td><td>' + (l.rem ? money(l.rem) : '—') + '</td>' +
        '<td><b style="color:' + (l.reste > 0.004 ? '#8a5a12' : l.reste < -0.004 ? '#b3261e' : '#1e6e32') + '">' + money(l.reste) + '</b>' + (l.reste < -0.004 ? '<small>avance</small>' : '') + '</td></tr>').join('') +
      '<tr style="font-weight:700;background:var(--nb)"><td>Total</td>' + tot.cells.map(c => '<td>' + (c.mt > 0.004 ? money(c.mt) : '—') + '</td>').join('') +
      '<td>' + money(tot.gagne) + '<small>' + fmtH(tot.heures) + '</small></td><td>' + money(tot.rep) + '</td><td>' + money(tot.rem) + '</td><td>' + money(tot.reste) + '</td></tr></tbody></table></div>';
  }

  function exporter() {
    if (typeof XLSX === 'undefined') { toastE('Bibliothèque Excel non chargée.'); return; }
    const { ms, lignes, tot } = calcul();
    const row = (nom, cells, g, rep, rem, reste, h) => { const r = { Employé: nom }; ms.forEach((m, i) => { r[lblMois(m)] = round2(cells[i].mt); r['Heures ' + lblMois(m)] = round2(cells[i].h); }); r['Total heures sup'] = round2(h); r['Total gagné (DA)'] = g; r['Solde de départ'] = rep; r['Déjà remis'] = rem; r['Reste à remettre'] = reste; return r; };
    const data = lignes.map(l => row((l.e.nom + ' ' + (l.e.prenom || '')).trim(), l.cells, l.gagne, l.rep, l.rem, l.reste, l.heures));
    data.push(row('TOTAL', tot.cells, tot.gagne, tot.rep, tot.rem, tot.reste, tot.heures));
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data), 'Heures sup'); XLSX.writeFile(wb, 'MARIA-BAG_heures_sup_cumul_' + isoE(new Date()) + '.xlsx');
  }

  async function pdf() {
    if (!(window.jspdf && window.jspdf.jsPDF)) { toastE('Bibliothèque PDF non chargée.'); return; }
    const { ms, lignes, tot } = calcul(); if (!lignes.length) { toastE('Aucune heure supplémentaire à imprimer.'); return; }
    let ENT = {}; try { const p = await sb.from('parametres').select('*').eq('cle', 'entreprise'); ENT = (p.data && p.data[0] && p.data[0].valeur) || {}; } catch (e) { /* sans nom */ }
    const doc = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape' }), M = 12, W = doc.internal.pageSize.getWidth();
    doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.text(pdfT(ENT.nom || 'MARIA BAG'), M, 15);
    doc.setFontSize(14); doc.text('ETAT DES HEURES SUPPLEMENTAIRES A REMETTRE', W - M, 15, { align: 'right' });
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(90); doc.text(pdfT('Cumul mois par mois - arrete au ' + fdE(isoE(new Date()))), W - M, 21, { align: 'right' }); doc.setTextColor(0);
    const m = n => pdfT(money(n));
    const head = [['Employe', ...ms.map(x => pdfT(lblMois(x))), 'Total gagne', 'Depart', 'Deja remis', 'RESTE A REMETTRE', 'Signature']];
    const body = lignes.map(l => [pdfT((l.e.nom + ' ' + (l.e.prenom || '')).trim()), ...l.cells.map(c => c.mt > 0.004 ? m(c.mt) + '\n' + pdfT(fmtH(c.h)) : '-'), m(l.gagne), l.rep ? m(l.rep) : '-', l.rem ? m(l.rem) : '-', m(l.reste), '']);
    body.push(['TOTAL', ...tot.cells.map(c => c.mt > 0.004 ? m(c.mt) : '-'), m(tot.gagne), m(tot.rep), m(tot.rem), m(tot.reste), '']);
    const last = head[0].length - 1;
    doc.autoTable({ startY: 27, margin: { left: M, right: M, bottom: 15 }, theme: 'grid', head, body, styles: { fontSize: 7.5, cellPadding: 1.6, valign: 'middle' }, headStyles: { fillColor: [74, 44, 42], textColor: 255 },
      columnStyles: { [last]: { cellWidth: 30 }, [last - 1]: { fontStyle: 'bold', halign: 'right' } },
      didParseCell: d => { if (d.section === 'body' && d.row.index === body.length - 1) { d.cell.styles.fontStyle = 'bold'; d.cell.styles.fillColor = [244, 236, 232]; } } });
    doc.setFontSize(8); doc.setTextColor(90); doc.text(pdfT('Les heures supplementaires sont gardees a part du salaire ordinaire et remises aux employes a la date convenue.'), M, doc.lastAutoTable.finalY + 6);
    doc.save('Heures_sup_cumul_' + isoE(new Date()) + '.pdf'); toastE('PDF généré.');
  }

  window.renderHSCumul = render; window.hsCumulPdf = pdf; window.hsCumulExcel = exporter;
})();
