/* ============================================================
   NOTES & RENDEZ-VOUS : rendez-vous fixes avec des clients, prospects et grandes surfaces
   pour proposer les services de l'atelier. Table : rendez_vous (supabase/rendez_vous.sql).
   ============================================================ */
(function () {
  'use strict';
  const $ = s => document.querySelector(s);
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const iso = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const fd = s => s ? String(s).slice(0, 10).split('-').reverse().join('/') : '';
  const say = t => { if (typeof toast === 'function') toast(t); };
  const TYPES = ['Grande surface', 'Client', 'Prospect', 'Fournisseur', 'Autre'];
  const STAT = ['Prévu', 'Fait', 'Reporté', 'Annulé'];
  const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
  const contacts = () => (typeof D !== 'undefined' && Array.isArray(D)) ? D : [];
  const lbl = c => [c.prenom, c.nom].filter(Boolean).join(' ') + (c.societe ? ' — ' + c.societe : '');
  const jourTxt = s => { const [y, m, d] = s.split('-').map(Number); return JOURS[new Date(y, m - 1, d).getDay()] + ' ' + fd(s); };

  let RDV = [], err = '', form = null, fQ = '', fS = '', fT = '';
  const ouvert = r => r.statut === 'Prévu' || r.statut === 'Reporté';

  async function load() {
    const r = await sb.from('rendez_vous').select('*').order('date_rdv', { ascending: true }).order('heure', { ascending: true });
    if (r.error) { err = /does not exist|relation|schema cache/i.test(r.error.message) ? 'Table « rendez_vous » introuvable : exécutez supabase/rendez_vous.sql dans SQL Editor, puis rechargez la page.' : r.error.message; RDV = []; }
    else { err = ''; RDV = r.data || []; }
    render();
  }

  function ligne(r, today) {
    const retard = ouvert(r) && r.date_rdv < today, h = r.heure ? String(r.heure).slice(0, 5) : '';
    const col = r.statut === 'Fait' ? '#1e6e32' : r.statut === 'Annulé' ? '#7a6a64' : retard ? '#b3261e' : r.statut === 'Reporté' ? '#8a5a12' : '#2a5db0';
    return '<div class="nt-rdv' + (r.statut === 'Annulé' ? ' nt-off' : '') + '" style="border-left-color:' + col + '">' +
      '<div class="nt-when"><b>' + (h || '—') + '</b><span>' + esc(jourTxt(r.date_rdv)) + '</span></div>' +
      '<div class="nt-body"><div class="nt-top"><b>' + esc(r.titre) + '</b> <span class="nt-bdg" style="background:' + col + '1a;color:' + col + '">' + (retard ? 'En retard' : esc(r.statut)) + '</span> <span class="nt-bdg nt-type">' + esc(r.type || '') + '</span></div>' +
      '<div class="nt-meta">' + [r.contact_nom && '👤 ' + esc(r.contact_nom), r.tel && '📞 ' + esc(r.tel), r.lieu && '📍 ' + esc(r.lieu)].filter(Boolean).join(' · ') + '</div>' +
      (r.objet ? '<div class="nt-txt"><i>À proposer :</i> ' + esc(r.objet) + '</div>' : '') +
      (r.resultat ? '<div class="nt-txt nt-res"><i>Résultat :</i> ' + esc(r.resultat) + '</div>' : '') +
      (r.relance ? '<div class="nt-txt"><i>À relancer le :</i> ' + fd(r.relance) + '</div>' : '') + '</div>' +
      '<div class="nt-act">' + (ouvert(r) ? '<button class="btn xs p" type="button" data-nt="fait" data-id="' + esc(r.id) + '">Fait</button>' : '') +
      '<button class="btn xs" type="button" data-nt="edit" data-id="' + esc(r.id) + '">Modifier</button>' +
      (ouvert(r) ? '<button class="btn xs" type="button" data-nt="annul" data-id="' + esc(r.id) + '">Annuler</button>' : '') +
      '<button class="btn xs r" type="button" data-nt="suppr" data-id="' + esc(r.id) + '">Supprimer</button></div></div>';
  }

  function render() {
    const root = $('#nt-root'); if (!root) return;
    if (err) { root.innerHTML = '<div class="card"><div class="nt-err">' + esc(err) + '</div></div>'; return; }
    const today = iso(new Date()), d7 = new Date(); d7.setDate(d7.getDate() + 7); const sem = iso(d7), mois = today.slice(0, 7);
    const q = fQ.trim().toLowerCase();
    const L = RDV.filter(r => (!fT || r.type === fT) && (!q || [r.titre, r.contact_nom, r.lieu, r.objet, r.resultat].join(' ').toLowerCase().includes(q)) &&
      (!fS || (fS === 'avenir' ? ouvert(r) : r.statut === fS)));
    const groupes = [['En retard', r => ouvert(r) && r.date_rdv < today, 'nt-late'], ['Aujourd’hui', r => ouvert(r) && r.date_rdv === today, 'nt-today'], ['À venir', r => ouvert(r) && r.date_rdv > today, ''], ['Passés et clôturés', r => !ouvert(r), 'nt-past']];
    let h = '<div class="hello"><span class="fl">&#10047;</span><div><h2>Notes &amp; rendez-vous</h2><p>Vos rendez-vous fixes avec des clients, prospects et grandes surfaces pour proposer les services de l’atelier.</p></div></div>' +
      '<div class="at-stats"><div class="at-stat"><span>Aujourd’hui</span><b>' + RDV.filter(r => ouvert(r) && r.date_rdv === today).length + '</b></div>' +
      '<div class="at-stat"><span>Dans les 7 jours</span><b>' + RDV.filter(r => ouvert(r) && r.date_rdv >= today && r.date_rdv <= sem).length + '</b></div>' +
      '<div class="at-stat"><span>En retard (à clôturer)</span><b style="color:' + (RDV.some(r => ouvert(r) && r.date_rdv < today) ? '#b3261e' : 'inherit') + '">' + RDV.filter(r => ouvert(r) && r.date_rdv < today).length + '</b></div>' +
      '<div class="at-stat"><span>Faits ce mois-ci</span><b>' + RDV.filter(r => r.statut === 'Fait' && String(r.date_rdv).startsWith(mois)).length + '</b></div></div>' +
      '<div class="tools"><input id="nt-q" type="search" placeholder="Rechercher : titre, société, lieu…" value="' + esc(fQ) + '"><select id="nt-fs"><option value="">Tous les statuts</option><option value="avenir"' + (fS === 'avenir' ? ' selected' : '') + '>À venir / à faire</option>' + STAT.map(s => '<option' + (fS === s ? ' selected' : '') + '>' + s + '</option>').join('') + '</select>' +
      '<select id="nt-ft"><option value="">Tous les types</option>' + TYPES.map(s => '<option' + (fT === s ? ' selected' : '') + '>' + s + '</option>').join('') + '</select><button class="btn p" type="button" data-nt="new">+ Nouveau rendez-vous</button></div>';
    if (form) h += formHtml();
    let n = 0;
    groupes.forEach(([t, f, cl]) => { const l = L.filter(f); if (!l.length) return; n += l.length;
      if (t === 'Passés et clôturés') l.sort((a, b) => String(b.date_rdv).localeCompare(String(a.date_rdv)));
      h += '<div class="card nt-grp ' + cl + '"><h2>' + t + ' <small>(' + l.length + ')</small></h2>' + l.map(r => ligne(r, today)).join('') + '</div>'; });
    if (!n) h += '<div class="card"><div class="nt-empty">' + (RDV.length ? 'Aucun rendez-vous ne correspond à la recherche.' : 'Aucun rendez-vous pour le moment. Cliquez sur « + Nouveau rendez-vous » pour noter votre premier rendez-vous (grande surface, client, prospect…).') + '</div></div>';
    const a = document.activeElement, keep = a && root.contains(a) && a.id === 'nt-q', pos = keep ? a.selectionStart : 0;
    root.innerHTML = h;
    if (keep) { const i = $('#nt-q'); if (i) { i.focus(); i.setSelectionRange(pos, pos); } }
  }

  function formHtml() {
    const f = form;
    return '<form id="nt-form" class="at-form" style="display:block"><h3 style="margin-top:0">' + (f.id ? 'Modifier le rendez-vous' : 'Nouveau rendez-vous') + '</h3><div class="at-fields">' +
      '<label style="grid-column:1/-1">Objet du rendez-vous *<input id="nt-titre" required maxlength="150" placeholder="Ex : Présenter nos sacs à Ardis, Carrefour…" value="' + esc(f.titre) + '"></label>' +
      '<label>Date *<input id="nt-date" type="date" required value="' + esc(f.date_rdv) + '"></label><label>Heure<input id="nt-heure" type="time" value="' + esc(f.heure) + '"></label>' +
      '<label>Type<select id="nt-type">' + TYPES.map(t => '<option' + (f.type === t ? ' selected' : '') + '>' + t + '</option>').join('') + '</select></label>' +
      '<label>Contact enregistré<select id="nt-contact"><option value="">— Aucun —</option>' + contacts().map(c => '<option value="' + esc(c.id) + '"' + (String(f.contact_id) === String(c.id) ? ' selected' : '') + '>' + esc(lbl(c)) + '</option>').join('') + '</select></label>' +
      '<label>Société / personne rencontrée<input id="nt-cnom" maxlength="120" placeholder="Ex : Ardis, M. Karim…" value="' + esc(f.contact_nom) + '"></label><label>Téléphone<input id="nt-tel" type="tel" maxlength="40" value="' + esc(f.tel) + '"></label>' +
      '<label>Lieu<input id="nt-lieu" maxlength="150" placeholder="Adresse, magasin, visio…" value="' + esc(f.lieu) + '"></label>' +
      '<label>Statut<select id="nt-statut">' + STAT.map(t => '<option' + (f.statut === t ? ' selected' : '') + '>' + t + '</option>').join('') + '</select></label>' +
      '<label>À relancer le<input id="nt-relance" type="date" value="' + esc(f.relance) + '"></label>' +
      '<label style="grid-column:1/-1">Ce que je veux proposer<textarea id="nt-objet" placeholder="Services, produits, prix, échantillons à apporter…">' + esc(f.objet) + '</textarea></label>' +
      '<label style="grid-column:1/-1">Résultat / notes après le rendez-vous<textarea id="nt-resultat" placeholder="Décision, remarques, prochaine étape…">' + esc(f.resultat) + '</textarea></label></div>' +
      '<div class="at-actions"><button class="btn p" type="submit">Enregistrer</button><button class="btn" type="button" data-nt="cancel">Annuler</button></div></form>';
  }
  function lire() {
    if (!form || !$('#nt-titre')) return;
    Object.assign(form, { titre: $('#nt-titre').value, date_rdv: $('#nt-date').value, heure: $('#nt-heure').value, type: $('#nt-type').value, contact_id: $('#nt-contact').value, contact_nom: $('#nt-cnom').value,
      tel: $('#nt-tel').value, lieu: $('#nt-lieu').value, statut: $('#nt-statut').value, relance: $('#nt-relance').value, objet: $('#nt-objet').value, resultat: $('#nt-resultat').value });
  }
  function ouvrir(r) {
    form = Object.assign({ id: null, titre: '', date_rdv: iso(new Date()), heure: '', type: 'Grande surface', contact_id: '', contact_nom: '', tel: '', lieu: '', statut: 'Prévu', relance: '', objet: '', resultat: '' },
      r ? { id: r.id, titre: r.titre, date_rdv: r.date_rdv, heure: r.heure ? String(r.heure).slice(0, 5) : '', type: r.type || 'Autre', contact_id: r.contact_id || '', contact_nom: r.contact_nom || '', tel: r.tel || '', lieu: r.lieu || '', statut: r.statut, relance: r.relance || '', objet: r.objet || '', resultat: r.resultat || '' } : {});
    render(); const t = $('#nt-titre'); if (t) { t.scrollIntoView({ behavior: 'smooth', block: 'center' }); t.focus(); }
  }
  async function enregistrer() {
    lire();
    if (!form.titre.trim()) { say('Indiquez l’objet du rendez-vous.'); return; }
    if (!form.date_rdv) { say('Indiquez la date.'); return; }
    const row = { titre: form.titre.trim(), date_rdv: form.date_rdv, heure: form.heure || null, type: form.type, contact_id: form.contact_id || null, contact_nom: form.contact_nom.trim(), tel: form.tel.trim(), lieu: form.lieu.trim(),
      objet: form.objet.trim(), resultat: form.resultat.trim(), statut: form.statut, relance: form.relance || null };
    const r = form.id ? await sb.from('rendez_vous').update(row).eq('id', form.id) : await sb.from('rendez_vous').insert([row]);
    if (r.error) { say('Erreur : ' + r.error.message); return; }
    const neuf = !form.id; form = null; await load(); say(neuf ? 'Rendez-vous enregistré.' : 'Rendez-vous modifié.');
  }
  async function maj(id, o, msg) { const r = await sb.from('rendez_vous').update(o).eq('id', id); if (r.error) { say('Erreur : ' + r.error.message); return; } await load(); say(msg); }

  document.addEventListener('click', async e => {
    const root = $('#nt-root'); const b = e.target.closest('[data-nt]'); if (!b || !root || !root.contains(b)) return;
    const k = b.dataset.nt, id = b.dataset.id, r = RDV.find(x => String(x.id) === String(id));
    if (k === 'new') ouvrir(); else if (k === 'cancel') { form = null; render(); }
    else if (k === 'edit' && r) ouvrir(r);
    else if (k === 'fait' && r) { const t = prompt('Résultat du rendez-vous « ' + r.titre + ' » (facultatif) :', r.resultat || ''); if (t === null) return; await maj(id, { statut: 'Fait', resultat: t.trim() }, 'Rendez-vous marqué comme fait.'); }
    else if (k === 'annul' && r && confirm('Annuler le rendez-vous « ' + r.titre + ' » ?')) await maj(id, { statut: 'Annulé' }, 'Rendez-vous annulé.');
    else if (k === 'suppr' && r && confirm('Supprimer définitivement le rendez-vous « ' + r.titre + ' » ?')) { const x = await sb.from('rendez_vous').delete().eq('id', id); if (x.error) say('Erreur : ' + x.error.message); else { await load(); say('Supprimé.'); } }
  });
  document.addEventListener('change', e => {
    if (e.target.id === 'nt-fs') { fS = e.target.value; render(); } else if (e.target.id === 'nt-ft') { fT = e.target.value; render(); }
    else if (e.target.id === 'nt-contact' && form) { lire(); const c = contacts().find(x => String(x.id) === String(form.contact_id)); if (c) { if (!form.contact_nom) form.contact_nom = c.societe || lbl(c); if (!form.tel) form.tel = c.tel || ''; } render(); }
  });
  document.addEventListener('input', e => { if (e.target.id === 'nt-q') { fQ = e.target.value; render(); } });
  document.addEventListener('submit', e => { if (e.target.id === 'nt-form') { e.preventDefault(); enregistrer(); } });
  window.loadNotes = load;
  document.addEventListener('mariabag:authenticated', load);
})();
