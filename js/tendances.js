/* ============================================================
   TENDANCES : veille sur les modèles et les produits « winner » de la maroquinerie (monde et marché local).
   Fiches modifiables, statut de suivi (à étudier → en test → lancé) et analyse par ZACKsmart.
   Table : tendances (supabase/tendances.sql).
   ============================================================ */
(function () {
  'use strict';
  const $ = s => document.querySelector(s);
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const say = t => { if (typeof toast === 'function') toast(t); };
  const TYPES = ['Modèle', 'Produit winner', 'Matière / couleur'], STAT = ['À étudier', 'En test', 'Lancé', 'Rejeté'];
  const ICON = { 'Modèle': '👜', 'Produit winner': '🏆', 'Matière / couleur': '🎨' };
  const COL = { 'À étudier': '#2a5db0', 'En test': '#8a5a12', 'Lancé': '#1e6e32', 'Rejeté': '#7a6a64' };
  let T = [], err = '', form = null, fQ = '', fT = '', fS = '';

  async function load() {
    const r = await sb.from('tendances').select('*').order('potentiel', { ascending: false }).order('created_at', { ascending: false });
    if (r.error) { err = /does not exist|relation|schema cache/i.test(r.error.message) ? 'Table « tendances » introuvable : exécutez supabase/tendances.sql dans SQL Editor, puis rechargez la page.' : r.error.message; T = []; }
    else { err = ''; T = r.data || []; }
    render();
  }
  const etoiles = n => '<span class="td-st" title="Potentiel ' + n + '/5">' + '★'.repeat(n) + '<i>' + '★'.repeat(5 - n) + '</i></span>';
  const lien = u => { u = String(u || '').trim(); return /^https?:\/\//i.test(u) ? u : ''; };

  function carte(t) {
    const img = lien(t.image_url), src = lien(t.source_url);
    return '<div class="td-card' + (t.statut === 'Rejeté' ? ' td-off' : '') + '">' +
      '<div class="td-img"' + (img ? ' style="background-image:url(\'' + esc(img) + '\')"' : '') + '>' + (img ? '' : '<span>' + (ICON[t.type] || '👜') + '</span>') + '</div>' +
      '<div class="td-body"><div class="td-top"><b>' + esc(t.titre) + '</b>' + etoiles(Number(t.potentiel) || 3) + '</div>' +
      '<div class="td-tags"><span class="td-bdg">' + esc(t.type) + '</span>' + (t.categorie ? '<span class="td-bdg alt">' + esc(t.categorie) + '</span>' : '') + (t.region ? '<span class="td-bdg alt">🌍 ' + esc(t.region) + '</span>' : '') + (t.periode ? '<span class="td-bdg alt">' + esc(t.periode) + '</span>' : '') + '</div>' +
      (t.resume ? '<p class="td-p">' + esc(t.resume) + '</p>' : '') +
      (t.pourquoi ? '<p class="td-p"><b>Pourquoi ça marche :</b> ' + esc(t.pourquoi) + '</p>' : '') +
      (t.idee_maria ? '<p class="td-p td-idee"><b>Idée pour Maria Bag :</b> ' + esc(t.idee_maria) + '</p>' : '') +
      (t.prix_indicatif ? '<p class="td-p"><b>Prix observé :</b> ' + esc(t.prix_indicatif) + '</p>' : '') +
      '<div class="td-src">' + (t.source_nom ? 'Source : ' + (src ? '<a href="' + esc(src) + '" target="_blank" rel="noopener">' + esc(t.source_nom) + '</a>' : esc(t.source_nom)) : (src ? '<a href="' + esc(src) + '" target="_blank" rel="noopener">Voir la source</a>' : '')) + '</div>' +
      '<div class="td-act"><select data-td="statut" data-id="' + esc(t.id) + '" style="color:' + COL[t.statut] + '">' + STAT.map(s => '<option' + (t.statut === s ? ' selected' : '') + '>' + s + '</option>').join('') + '</select>' +
      '<button class="btn xs p" type="button" data-td="ia" data-id="' + esc(t.id) + '">💡 ZACKsmart</button><button class="btn xs" type="button" data-td="edit" data-id="' + esc(t.id) + '">Modifier</button><button class="btn xs r" type="button" data-td="suppr" data-id="' + esc(t.id) + '">Supprimer</button></div></div></div>';
  }

  function render() {
    const root = $('#td-root'); if (!root) return;
    if (err) { root.innerHTML = '<div class="card"><div class="td-err">' + esc(err) + '</div></div>'; return; }
    const q = fQ.trim().toLowerCase();
    const L = T.filter(t => (!fT || t.type === fT) && (!fS || t.statut === fS) && (!q || [t.titre, t.categorie, t.resume, t.pourquoi, t.idee_maria, t.region].join(' ').toLowerCase().includes(q)));
    let h = '<div class="hello"><span class="fl">&#10047;</span><div><h2>Tendances et produits winner</h2><p>Les modèles qui marchent dans le monde et dans la maroquinerie en général, et ce que vous pouvez en faire à l’atelier.</p></div></div>' +
      '<div class="td-note">ℹ️ Les fiches de départ sont une <b>veille générale</b> (connaissances jusqu’à mi-2026) : <b>vérifiez-les</b> sur Pinterest Trends, Google Trends, TikTok Creative Center, Instagram ou les meilleures ventes des sites marchands avant de lancer une série. Ajoutez vos propres trouvailles avec le lien de la source.</div>' +
      '<div class="at-stats"><div class="at-stat"><span>Fiches de veille</span><b>' + T.length + '</b></div><div class="at-stat"><span>À étudier</span><b>' + T.filter(t => t.statut === 'À étudier').length + '</b></div><div class="at-stat"><span>En test</span><b>' + T.filter(t => t.statut === 'En test').length + '</b></div><div class="at-stat"><span>Lancées</span><b>' + T.filter(t => t.statut === 'Lancé').length + '</b></div></div>' +
      '<div class="tools"><input id="td-q" type="search" placeholder="Rechercher : cabas, mini sac, cadeau…" value="' + esc(fQ) + '"><select id="td-ft"><option value="">Tous les types</option>' + TYPES.map(s => '<option' + (fT === s ? ' selected' : '') + '>' + s + '</option>').join('') + '</select>' +
      '<select id="td-fs"><option value="">Tous les statuts</option>' + STAT.map(s => '<option' + (fS === s ? ' selected' : '') + '>' + s + '</option>').join('') + '</select><button class="btn" type="button" data-td="veille">🔎 Veille avec ZACKsmart</button><button class="btn p" type="button" data-td="new">+ Nouvelle fiche</button></div>';
    if (form) h += formHtml();
    h += L.length ? '<div class="td-grid">' + L.map(carte).join('') + '</div>' : '<div class="card"><div class="td-empty">' + (T.length ? 'Aucune fiche ne correspond.' : 'Aucune fiche pour le moment : cliquez sur « + Nouvelle fiche ».') + '</div></div>';
    const a = document.activeElement, keep = a && root.contains(a) && a.id === 'td-q', pos = keep ? a.selectionStart : 0;
    root.innerHTML = h;
    if (keep) { const i = $('#td-q'); if (i) { i.focus(); i.setSelectionRange(pos, pos); } }
  }

  function formHtml() {
    const f = form, opt = (arr, v) => arr.map(x => '<option' + (v === x ? ' selected' : '') + '>' + x + '</option>').join('');
    return '<form id="td-form" class="at-form" style="display:block"><h3 style="margin-top:0">' + (f.id ? 'Modifier la fiche' : 'Nouvelle fiche de tendance') + '</h3><div class="at-fields">' +
      '<label style="grid-column:1/-1">Modèle ou produit *<input id="tf-titre" required maxlength="150" placeholder="Ex : Mini sac à chaînette" value="' + esc(f.titre) + '"></label>' +
      '<label>Type<select id="tf-type">' + opt(TYPES, f.type) + '</select></label><label>Catégorie<input id="tf-cat" maxlength="60" placeholder="Cabas, pochette, sac à dos…" value="' + esc(f.categorie) + '"></label>' +
      '<label>Pays / région<input id="tf-reg" maxlength="60" placeholder="Monde, Europe, Algérie…" value="' + esc(f.region) + '"></label><label>Période<input id="tf-per" maxlength="40" placeholder="2026, été, Ramadan…" value="' + esc(f.periode) + '"></label>' +
      '<label>Potentiel pour l’atelier (1 à 5)<select id="tf-pot">' + [1, 2, 3, 4, 5].map(n => '<option value="' + n + '"' + (Number(f.potentiel) === n ? ' selected' : '') + '>' + '★'.repeat(n) + ' (' + n + ')</option>').join('') + '</select></label><label>Statut<select id="tf-statut">' + opt(STAT, f.statut) + '</select></label>' +
      '<label style="grid-column:1/-1">Description<textarea id="tf-resume" placeholder="À quoi ressemble ce modèle ?">' + esc(f.resume) + '</textarea></label>' +
      '<label style="grid-column:1/-1">Pourquoi ça marche<textarea id="tf-pourquoi" placeholder="Cible, usage, saison, prix…">' + esc(f.pourquoi) + '</textarea></label>' +
      '<label style="grid-column:1/-1">Idée pour Maria Bag<textarea id="tf-idee" placeholder="Comment le fabriquer chez nous (matières, finitions, prix)">' + esc(f.idee_maria) + '</textarea></label>' +
      '<label>Prix observé<input id="tf-prix" maxlength="80" placeholder="Ex : 4 500 à 7 000 DA en boutique" value="' + esc(f.prix_indicatif) + '"></label><label>Nom de la source<input id="tf-sn" maxlength="80" placeholder="Pinterest, Instagram, Amazon…" value="' + esc(f.source_nom) + '"></label>' +
      '<label>Lien de la source<input id="tf-su" type="url" maxlength="400" placeholder="https://…" value="' + esc(f.source_url) + '"></label><label>Lien d’une photo (facultatif)<input id="tf-img" type="url" maxlength="400" placeholder="https://… .jpg" value="' + esc(f.image_url) + '"></label></div>' +
      '<div class="at-actions"><button class="btn p" type="submit">Enregistrer</button><button class="btn" type="button" data-td="cancel">Annuler</button></div></form>';
  }
  function lire() {
    if (!form || !$('#tf-titre')) return;
    Object.assign(form, { titre: $('#tf-titre').value, type: $('#tf-type').value, categorie: $('#tf-cat').value, region: $('#tf-reg').value, periode: $('#tf-per').value, potentiel: $('#tf-pot').value, statut: $('#tf-statut').value, resume: $('#tf-resume').value, pourquoi: $('#tf-pourquoi').value, idee_maria: $('#tf-idee').value, prix_indicatif: $('#tf-prix').value, source_nom: $('#tf-sn').value, source_url: $('#tf-su').value, image_url: $('#tf-img').value });
  }
  const vide = { id: null, titre: '', type: 'Modèle', categorie: '', region: 'Monde', periode: String(new Date().getFullYear()), resume: '', pourquoi: '', idee_maria: '', prix_indicatif: '', potentiel: 3, statut: 'À étudier', source_nom: '', source_url: '', image_url: '' };
  function ouvrir(t) { form = Object.assign({}, vide, t ? { id: t.id, titre: t.titre, type: t.type, categorie: t.categorie || '', region: t.region || '', periode: t.periode || '', resume: t.resume || '', pourquoi: t.pourquoi || '', idee_maria: t.idee_maria || '', prix_indicatif: t.prix_indicatif || '', potentiel: t.potentiel, statut: t.statut, source_nom: t.source_nom || '', source_url: t.source_url || '', image_url: t.image_url || '' } : {}); render(); const e = $('#tf-titre'); if (e) { e.scrollIntoView({ behavior: 'smooth', block: 'center' }); e.focus(); } }
  async function enregistrer() {
    lire(); if (!form.titre.trim()) { say('Indiquez le modèle ou le produit.'); return; }
    const row = { titre: form.titre.trim(), type: form.type, categorie: form.categorie.trim(), region: form.region.trim(), periode: form.periode.trim(), resume: form.resume.trim(), pourquoi: form.pourquoi.trim(), idee_maria: form.idee_maria.trim(), prix_indicatif: form.prix_indicatif.trim(), potentiel: Number(form.potentiel) || 3, statut: form.statut, source_nom: form.source_nom.trim(), source_url: form.source_url.trim(), image_url: form.image_url.trim() };
    const r = form.id ? await sb.from('tendances').update(row).eq('id', form.id) : await sb.from('tendances').insert([row]);
    if (r.error) { say('Erreur : ' + r.error.message); return; }
    const neuf = !form.id; form = null; await load(); say(neuf ? 'Fiche ajoutée.' : 'Fiche modifiée.');
  }
  const PRE = ' Précise que tu n\'as pas accès aux données en temps réel (tes connaissances s\'arrêtent à mi-2026), donne ton avis honnête et indique comment vérifier la tendance (Pinterest Trends, Google Trends, TikTok Creative Center, meilleures ventes des sites marchands).';
  function demander(txt) { if (window.zsAsk) window.zsAsk(txt); else say('ZACKsmart n’est pas disponible.'); }

  document.addEventListener('click', async e => {
    const root = $('#td-root'); const b = e.target.closest('[data-td]'); if (!b || !root || !root.contains(b) || b.tagName === 'SELECT') return;
    const k = b.dataset.td, id = b.dataset.id, t = T.find(x => String(x.id) === String(id));
    if (k === 'new') ouvrir(); else if (k === 'cancel') { form = null; render(); }
    else if (k === 'edit' && t) ouvrir(t);
    else if (k === 'suppr' && t && confirm('Supprimer la fiche « ' + t.titre + ' » ?')) { const x = await sb.from('tendances').delete().eq('id', id); if (x.error) say('Erreur : ' + x.error.message); else { await load(); say('Fiche supprimée.'); } }
    else if (k === 'ia' && t) demander('Analyse cette tendance pour l\'atelier MARIA BAG : « ' + t.titre + ' » (' + t.type + (t.categorie ? ', ' + t.categorie : '') + '). ' + (t.resume ? 'Description : ' + t.resume + ' ' : '') + 'Dis-moi : 1) pour qui et à quelle saison cela se vend, 2) les matières et le coût de revient approximatif en fabriquant chez nous, 3) un prix de vente conseillé (gros, détail, grande surface) et la marge, 4) les risques, 5) si je dois tester une petite série et laquelle (quantité).' + PRE);
    else if (k === 'veille') demander('Fais-moi une veille des tendances sac et maroquinerie pour le marché algérien et le monde : les 8 modèles et produits « winner » du moment, classés par potentiel pour MARIA BAG (atelier de sacs, pochettes, cabas, sacs à dos), avec pour chacun : pourquoi il marche, matières, prix de vente conseillé et une idée de série test. Termine par 3 actions à lancer cette semaine.' + PRE);
  });
  document.addEventListener('change', async e => {
    const root = $('#td-root'); if (!root || !root.contains(e.target)) return;
    if (e.target.dataset && e.target.dataset.td === 'statut') { const r = await sb.from('tendances').update({ statut: e.target.value }).eq('id', e.target.dataset.id); if (r.error) say('Erreur : ' + r.error.message); await load(); }
    else if (e.target.id === 'td-ft') { fT = e.target.value; render(); } else if (e.target.id === 'td-fs') { fS = e.target.value; render(); }
  });
  document.addEventListener('input', e => { if (e.target.id === 'td-q') { fQ = e.target.value; render(); } });
  document.addEventListener('submit', e => { if (e.target.id === 'td-form') { e.preventDefault(); enregistrer(); } });
  window.loadTendances = load;
  document.addEventListener('mariabag:authenticated', load);
})();
