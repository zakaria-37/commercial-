/* ============================================================
   PDF SUR SMARTPHONE : envoyer le VRAI fichier PDF
   Sur iPhone / Android, doc.save() ouvre le PDF comme une page web : en le partageant,
   on envoyait un lien, pas un fichier. Ici, chaque PDF de la plateforme (bons, factures,
   relevés, fiches…) propose « Envoyer le PDF » : le fichier .pdf part directement
   dans WhatsApp, e-mail, Fichiers… (partage natif du téléphone).
   ============================================================ */
(function () {
  'use strict';
  const J = window.jspdf && window.jspdf.jsPDF; if (!J || !J.API) return;
  const telephone = () => /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent));
  const origSave = J.API.save;
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function feuille(doc, nom, file) {
    const old = document.getElementById('pdfShare'); if (old) old.remove();
    const bg = document.createElement('div'); bg.id = 'pdfShare'; bg.className = 'pdfs-bg';
    bg.innerHTML = '<div class="pdfs" role="dialog" aria-label="PDF prêt"><div class="pdfs-ic">📄</div><b class="pdfs-n">' + esc(nom) + '</b><p>Le PDF est prêt.</p>' +
      '<button type="button" class="btn p pdfs-go" data-pdfs="share">📤 Envoyer le PDF<small>WhatsApp, e-mail, Fichiers…</small></button>' +
      '<button type="button" class="btn pdfs-b" data-pdfs="open">Ouvrir / enregistrer</button>' +
      '<button type="button" class="btn pdfs-b pdfs-x" data-pdfs="x">Fermer</button></div>';
    document.body.appendChild(bg);
    bg.addEventListener('click', async e => {
      const b = e.target.closest('[data-pdfs]');
      if (!b) { if (e.target === bg) bg.remove(); return; }
      const k = b.dataset.pdfs;
      if (k === 'x') { bg.remove(); return; }
      if (k === 'open') { bg.remove(); origSave.call(doc, nom); return; }
      try { await navigator.share({ files: [file], title: nom.replace(/\.pdf$/i, '') }); bg.remove(); }
      catch (err) { if (err && err.name === 'AbortError') return; bg.remove(); origSave.call(doc, nom); }   // partage indisponible : on ouvre le PDF
    });
  }

  J.API.save = function (nom, opts) {
    nom = String(nom || 'document.pdf'); if (!/\.pdf$/i.test(nom)) nom += '.pdf';
    if (!telephone() || !navigator.share || !navigator.canShare) return origSave.call(this, nom, opts);
    let file;
    try { file = new File([this.output('blob')], nom, { type: 'application/pdf' }); } catch (e) { return origSave.call(this, nom, opts); }
    if (!navigator.canShare({ files: [file] })) return origSave.call(this, nom, opts);
    feuille(this, nom, file);
    return this;
  };
})();
