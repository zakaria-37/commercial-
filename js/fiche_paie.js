/* ============================================================
   FICHE DE PAIE (PDF) : par employé, sur la période de son choix (pas seulement fin de mois).
   Utilise les calculs de employes.js (heures normales jusqu'à la fin de journée, heures sup à part).
   Net à payer = paie ordinaire de la période − acomptes de la période (heures sup NON incluses).
   ============================================================ */
(function () {
  'use strict';
  const pdfT = s => String(s ?? '').replace(/œ/g, 'oe').replace(/Œ/g, 'OE').replace(/[  ]/g, ' ');
  const fdl = s => s ? s.split('-').reverse().join('/') : '';
  const addDay = s => { const [y, m, d] = s.split('-').map(Number); return isoE(new Date(y, m - 1, d + 1)); };

  function bornes() {
    const mois = curMonth(), fin = mois + '-' + String(joursDansMois(mois)).padStart(2, '0');
    let du = $e('#fp-du') && $e('#fp-du').value, au = $e('#fp-au') && $e('#fp-au').value;
    return { du: du || mois + '-01', au: au || fin };
  }

  /* Valeurs par défaut des dates : mois affiché, jusqu'à aujourd'hui si c'est le mois en cours */
  function initDates() {
    const mois = curMonth(), today = isoE(new Date()), fin = mois + '-' + String(joursDansMois(mois)).padStart(2, '0');
    if ($e('#fp-du')) $e('#fp-du').value = mois + '-01';
    if ($e('#fp-au')) $e('#fp-au').value = today.startsWith(mois) ? today : fin;
  }

  async function donnees(emp, du, au) {
    const pts = POINT_ALL.filter(p => String(p.employe_id) === String(emp.id) && p.date_pointage >= du && p.date_pointage <= au)
      .sort((a, b) => a.date_pointage.localeCompare(b.date_pointage));
    let acs = [];
    const r = await sb.from('acomptes').select('*').eq('employe_id', emp.id).gte('date_acompte', du).lte('date_acompte', au).order('date_acompte', { ascending: true });
    if (r.error) throw new Error(r.error.message);
    acs = r.data || [];
    const repos = $e('#pt-repos') ? Number($e('#pt-repos').value) : 5, today = isoE(new Date());
    const presents = new Set(pts.filter(p => hrs(p) > 0).map(p => p.date_pointage));
    const absences = [];
    for (let d = du; d <= au && d <= today; d = addDay(d)) if (jourSemaine(d) !== repos && !presents.has(d)) absences.push(d);
    let hn = 0, hs = 0, po = 0, ps = 0;
    pts.forEach(p => { const x = detail(p, emp); hn += x.norm; hs += x.sup; po += x.norm * Number(emp.taux_horaire || 0); ps += x.sup * tauxSup(emp); });
    const ac = round2(acs.reduce((s, a) => s + Number(a.montant || 0), 0));
    return { pts, acs, absences, jours: presents.size, hn, hs, po: round2(po), ps: round2(ps), ac, net: round2(po - ac) };
  }

  function page(doc, emp, D, du, au, ENT) {
    const M = 14, W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight();
    const T = (t, x, y, o) => doc.text(pdfT(t), x, y, o);
    doc.setTextColor(0); doc.setFont('helvetica', 'bold'); doc.setFontSize(15); T(ENT.nom || 'MARIA BAG', M, 16);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(90);
    const info = [[ENT.adresse, ENT.ville].filter(Boolean).join(', '), [ENT.tel && 'Tel : ' + ENT.tel, ENT.email].filter(Boolean).join('  -  ')].filter(Boolean);
    info.forEach((l, i) => T(l, M, 21 + i * 4));
    doc.setTextColor(0); doc.setFont('helvetica', 'bold'); doc.setFontSize(17); T('FICHE DE PAIE', W - M, 16, { align: 'right' });
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10); T('Periode : du ' + fdl(du) + ' au ' + fdl(au), W - M, 23, { align: 'right' });
    doc.setFontSize(8); doc.setTextColor(90); T('Edite le ' + fdl(isoE(new Date())), W - M, 28, { align: 'right' });
    doc.setDrawColor(180); doc.line(M, 31, W - M, 31);

    doc.setTextColor(0); doc.setFont('helvetica', 'bold'); doc.setFontSize(12); T((emp.nom || '') + ' ' + (emp.prenom || ''), M, 39);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(70);
    T([emp.poste, 'Taux horaire : ' + money(emp.taux_horaire) + '/h', 'Heure sup : ' + money(tauxSup(emp)) + '/h', 'Journee normale jusqu\'a ' + finNormale(emp)].filter(Boolean).join('   -   '), M, 44);

    // Statistiques
    doc.autoTable({
      startY: 49, margin: { left: M, right: M }, theme: 'grid', styles: { fontSize: 9, cellPadding: 2 },
      headStyles: { fillColor: [74, 44, 42], textColor: 255 },
      head: [['Statistiques de la periode', '']],
      body: [
        ['Jours travailles', String(D.jours)],
        ['Jours d\'absence', D.absences.length ? D.absences.length + '  (' + D.absences.map(a => fdl(a).slice(0, 5)).join(', ') + ')' : '0'],
        ['Total des heures travaillees', fmtH(D.hn + D.hs)],
        ['   dont heures normales (jusqu\'a ' + finNormale(emp) + ')', fmtH(D.hn)],
        ['   dont heures supplementaires (non incluses dans le net)', D.hs > 0 ? fmtH(D.hs) : '-']
      ].map(r => r.map(pdfT)),
      columnStyles: { 0: { cellWidth: 95 } }
    });

    // Détail journalier
    const jours = D.pts.filter(p => hrs(p) > 0).map(p => {
      const x = detail(p, emp), d = p.date_pointage;
      return [fdl(d), JOURS[jourSemaine(d)], p.heure_debut ? String(p.heure_debut).slice(0, 5) : '', p.heure_fin ? String(p.heure_fin).slice(0, 5) : '', fmtH(x.norm), x.sup > 0 ? fmtH(x.sup) : '-', money(round2(x.norm * Number(emp.taux_horaire || 0)))];
    });
    doc.autoTable({
      startY: doc.lastAutoTable.finalY + 6, margin: { left: M, right: M, bottom: 20 }, theme: 'grid', styles: { fontSize: 8.5, cellPadding: 1.6 },
      headStyles: { fillColor: [74, 44, 42], textColor: 255 },
      head: [['Date', 'Jour', 'Debut', 'Fin', 'H. normales', 'H. sup', 'Gain du jour (hors sup)'].map(pdfT)],
      body: (jours.length ? jours : [['Aucun pointage sur cette periode', '', '', '', '', '', '']]).map(r => r.map(pdfT)),
      columnStyles: { 4: { halign: 'right' }, 5: { halign: 'right' }, 6: { halign: 'right' } }
    });

    // Acomptes
    doc.autoTable({
      startY: doc.lastAutoTable.finalY + 6, margin: { left: M, right: M, bottom: 20 }, theme: 'grid', styles: { fontSize: 9, cellPadding: 2 },
      headStyles: { fillColor: [138, 90, 18], textColor: 255 },
      head: [['Acomptes retires (date)', 'Note', 'Montant']],
      body: (D.acs.length ? D.acs.map(a => [fdl(a.date_acompte), a.note || '', money(a.montant)]) : [['Aucun acompte sur cette periode', '', '-']]).map(r => r.map(pdfT)),
      columnStyles: { 2: { halign: 'right' } }
    });

    // Calcul du net
    let y = doc.lastAutoTable.finalY + 8;
    if (y > H - 62) { doc.addPage(); y = 20; }
    const L = (l, v, bold, color) => { doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(bold ? 12 : 10); doc.setTextColor(...(color || [0, 0, 0])); T(l, M, y); T(v, W - M, y, { align: 'right' }); y += bold ? 8 : 6; };
    L('Salaire ordinaire (' + fmtH(D.hn) + ' x ' + money(emp.taux_horaire) + ')', money(D.po));
    L('Acomptes deja retires', '- ' + money(D.ac));
    doc.setDrawColor(120); doc.line(M, y - 3, W - M, y - 3); y += 1;
    L('NET A PAYER (sans heures supplementaires)', money(D.net), true, D.net < 0 ? [180, 30, 30] : [30, 110, 50]);
    if (D.hs > 0) { doc.setFont('helvetica', 'italic'); doc.setFontSize(8.5); doc.setTextColor(120, 80, 10); T('Heures supplementaires de la periode : ' + fmtH(D.hs) + ' = ' + money(D.ps) + ' - gardees a part (non incluses ci-dessus).', M, y); y += 6; }
    if (D.net < 0) { doc.setFont('helvetica', 'italic'); doc.setFontSize(8.5); doc.setTextColor(180, 30, 30); T('Les acomptes depassent la paie ordinaire de la periode.', M, y); y += 6; }

    y = Math.max(y + 8, H - 38); if (y > H - 30) { doc.addPage(); y = H - 38; }
    doc.setDrawColor(150); doc.setTextColor(60); doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
    T('Signature de l\'employeur', M, y); T('Signature de l\'employe (lu et approuve)', W - M - 60, y);
    doc.line(M, y + 16, M + 60, y + 16); doc.line(W - M - 60, y + 16, W - M, y + 16);
  }

  async function entreprise() {
    try { const p = await sb.from('parametres').select('*').eq('cle', 'entreprise'); return (p.data && p.data[0] && p.data[0].valeur) || {}; } catch (e) { return {}; }
  }

  async function generer(ids) {
    if (!(window.jspdf && window.jspdf.jsPDF)) { toastE('Bibliothèque PDF non chargée.'); return; }
    const { du, au } = bornes();
    if (du > au) { toastE('La date de début doit précéder la date de fin.'); return; }
    const liste = EMPLOYES.filter(e => ids.includes(String(e.id)));
    if (!liste.length) { toastE('Aucun employé à imprimer.'); return; }
    try {
      toastE('Préparation des fiches de paie…');
      const ENT = await entreprise(), doc = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4' });
      for (let i = 0; i < liste.length; i++) {
        if (i) doc.addPage();
        page(doc, liste[i], await donnees(liste[i], du, au), du, au, ENT);
      }
      const nom = liste.length === 1 ? (liste[0].nom + '_' + (liste[0].prenom || '')).replace(/[^\w-]+/g, '_') : 'tous_les_employes';
      doc.save('Fiche_de_paie_' + nom + '_' + du + '_' + au + '.pdf');
      toastE('Fiche de paie générée.');
    } catch (e) { toastE('Erreur fiche de paie : ' + (e.message || e)); }
  }

  window.fichePaie = () => selEmploye ? generer([String(selEmploye)]) : toastE('Ouvrez d’abord un employé (bouton « Pointage »).');
  window.fichesPaieTous = () => generer(EMPLOYES.map(e => String(e.id)));
  document.addEventListener('mariabag:authenticated', initDates);
  document.addEventListener('DOMContentLoaded', initDates);
  document.addEventListener('change', e => { if (e.target.id === 'emp-mois') initDates(); });
})();
