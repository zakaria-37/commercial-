/* ============================================================
   MARIA BAG — Production : fiche matières et bon de sortie
   - Un MODÈLE (ex : Sac à dos) contient des COMPOSANTS avec la quantité
     nécessaire pour UNE pièce (0,5 m de tissu, 3 sangles, 2 curseurs…)
   - On saisit la quantité à fabriquer (ex : 1000) : l'application calcule
     exactement ce qu'il faut sortir du dépôt pour l'atelier
   - Bon de sortie : PDF à télécharger ou à envoyer directement depuis le
     téléphone (WhatsApp, e-mail…), impression papier, export Excel
   - Unités comptées en pièces (pcs, paire, bobine, rouleau) : arrondies
     à l'entier supérieur. Mètres, kg… : arrondis au centième supérieur.
   ============================================================ */

let MODELES = [], COMPOSANTS = [];
let selModele = null;       // id du modèle affiché
let editModele = false;     // le formulaire modèle sert à renommer
let curComposant = null;    // composant en cours de modification
let prAutoNom = '';         // nom rempli automatiquement depuis l'article du stock

const $p = s => document.querySelector(s);
const UNITES = ['m', 'cm', 'pcs', 'paire', 'kg', 'g', 'L', 'bobine', 'rouleau'];
const UNITES_ENTIERES = ['pcs', 'paire', 'bobine', 'rouleau'];   // jamais de fraction : on arrondit au-dessus

/* ---------- Utilitaires ---------- */
function escP(v) {
  return String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function isoP(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function fdP(s) { return s ? s.split('-').reverse().join('/') : ''; }
function fmtN(n, maxDec) {
  return (Number(n) || 0).toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: maxDec });
}
function round6(n) { return Math.round(n * 1e6) / 1e6; }
function toastP(msg) {
  const e = $p('#toastP');
  if (!e) return;
  e.textContent = msg; e.style.display = 'block';
  clearTimeout(toastP.t); toastP.t = setTimeout(() => e.style.display = 'none', 6000);
}
function errMsgP(error) {
  const m = (error && error.message) || String(error);
  if (/schema cache|does not exist|Could not find|column/i.test(m))
    return 'Tables de production introuvables dans Supabase. Exécutez supabase/production.sql dans SQL Editor, puis rechargez la page. (' + m + ')';
  if (/row-level security|permission denied|policy/i.test(m))
    return 'Accès refusé par Supabase (RLS). Réexécutez supabase/production.sql. (' + m + ')';
  if (/duplicate key|unique/i.test(m))
    return 'Un modèle porte déjà ce nom. Choisissez un autre nom. (' + m + ')';
  return m;
}

/* ---------- Calculs ---------- */
function qteFabriquer() { return Math.max(0, Math.floor(Number($p('#pr-qte').value) || 0)); }

/* Quantité à sortir du dépôt pour N pièces (marge de chute incluse) */
function besoin(c, N) {
  const brut = round6(Number(c.quantite || 0) * N * (1 + Number(c.perte_pct || 0) / 100));
  if (UNITES_ENTIERES.includes(c.unite)) return Math.ceil(brut);
  return Math.ceil(round6(brut * 100)) / 100;
}
function fmtBesoin(c, N) { return fmtN(besoin(c, N), UNITES_ENTIERES.includes(c.unite) ? 0 : 2); }
function modeleCourant() { return MODELES.find(m => String(m.id) === String(selModele)) || null; }
function composantsDe(id) { return COMPOSANTS.filter(c => String(c.modele_id) === String(id)); }

/* ---------- Chargement ---------- */
async function loadProduction() {
  try { if (window.StockAPI) await StockAPI.load(); } catch (e) { /* stock non installé : la fiche matières marche sans */ }
  const m = await sb.from('modeles').select('*').order('nom', { ascending: true });
  if (m.error) { MODELES = []; COMPOSANTS = []; toastP('Erreur : ' + errMsgP(m.error)); renderAll(errMsgP(m.error)); return; }
  const c = await sb.from('composants').select('*').order('ordre', { ascending: true }).order('created_at', { ascending: true });
  if (c.error) { MODELES = m.data || []; COMPOSANTS = []; toastP('Erreur : ' + errMsgP(c.error)); renderAll(errMsgP(c.error)); return; }
  MODELES = m.data || [];
  COMPOSANTS = c.data || [];
  if (!MODELES.some(x => String(x.id) === String(selModele))) selModele = MODELES.length ? MODELES[0].id : null;
  renderAll();
}

/* ---------- Affichage ---------- */
function renderAll(errText) {
  const sel = $p('#pr-modele');
  sel.innerHTML = MODELES.length
    ? MODELES.map(m => '<option value="' + escP(m.id) + '"' + (String(m.id) === String(selModele) ? ' selected' : '') + '>' + escP(m.nom) + '</option>').join('')
    : '<option value="">— Aucun modèle —</option>';

  const has = !!modeleCourant();
  $p('#pr-main').style.display = has ? '' : 'none';
  $p('#pr-empty').style.display = has ? 'none' : '';
  ['#pr-btn-edit', '#pr-btn-dup', '#pr-btn-del'].forEach(i => { $p(i).disabled = !has; });
  if (errText) {
    $p('#pr-empty').innerHTML = '<p style="color:#b00020">⚠ ' + escP(errText) + '</p>';
    return;
  }
  if (!has) {
    $p('#pr-empty').innerHTML = '<h2>Aucun modèle pour le moment</h2>' +
      '<p>Un modèle est un produit à fabriquer (ex : sac à dos). Vous y listez tout ce qu’il faut pour <b>une</b> pièce, ' +
      'puis l’application calcule les quantités pour 100, 500 ou 1000 pièces.</p>' +
      '<button class="btn p" type="button" onclick="showFormModele()">+ Créer mon premier modèle</button> ' +
      '<button class="btn" type="button" onclick="createExemple()">Voir un exemple (sac à dos)</button>';
    return;
  }
  renderDatalists();
  renderComposants();
  renderBesoins();
}

function renderDatalists() {
  const at = $p('#pr-ateliers');
  const noms = (typeof ATELIERS !== 'undefined' ? ATELIERS : []).map(a => a.nom);
  at.innerHTML = noms.map(n => '<option value="' + escP(n) + '">').join('');
}

function renderComposants() {
  const m = modeleCourant(), list = composantsDe(m.id);
  $p('#pr-comp-title').textContent = 'Composition d’une pièce — ' + m.nom;
  $p('#pr-comp-desc').textContent = m.description || '';
  $p('#pr-comp-desc').style.display = m.description ? '' : 'none';
  $p('#pr-comp-body').innerHTML = list.length ? list.map(c =>
    '<tr><td><b>' + escP(c.nom) + '</b></td>' +
    '<td><span class="pr-unit-tag">' + escP(c.unite) + '</span></td>' +
    '<td>' + fmtN(c.quantite, 4) + '</td>' +
    '<td>' + (Number(c.perte_pct) ? fmtN(c.perte_pct, 2) + ' %' : '—') + '</td>' +
    '<td>' + stockCell(c) + '</td>' +
    '<td>' + escP(c.note || '') + '</td>' +
    '<td class="emp-act"><button class="btn s" type="button" onclick="showFormComposant(\'' + escP(c.id) + '\')">Modifier</button> ' +
    '<button class="btn s d" type="button" onclick="removeComposant(\'' + escP(c.id) + '\')">Supprimer</button></td></tr>'
  ).join('') : '<tr><td colspan="7" class="at-empty">Aucun composant. Cliquez sur « + Ajouter un composant ».</td></tr>';
}

/* ---------- Liaison avec le STOCK ---------- */
function articleDe(c) { return c.article_id && window.StockAPI ? StockAPI.byId(c.article_id) : null; }
function stockCell(c) {
  const a = articleDe(c);
  if (!a) return c.article_id ? '<small>Article supprimé</small>' : '<small style="color:var(--mut)">Non lié</small>';
  const q = StockAPI.fmtQty(a, StockAPI.qty(a.id)), e = StockAPI.etat(a);
  return '<b>' + escP(a.nom) + '</b><small>' + q.main + (q.sub ? ' · ' + q.sub : '') + '</small><span class="bd ' + e.c + '">' + e.l + '</span>';
}
/* Besoin d'un composant pour N pièces, comparé au stock (unité de mesure de l'article) */
function stockInfo(c, N) {
  const a = articleDe(c); if (!a) return null;
  const need = StockAPI.toBase(a, besoin(c, N), c.unite);
  if (need == null) return { a, bad: true };
  const stock = StockAPI.qty(a.id), reste = stock - need, manque = Math.max(0, -reste);
  let achat = 0, nb = 0;
  if (manque > 0) { if (StockAPI.aCond(a)) { nb = Math.ceil(manque / StockAPI.condQte(a)); achat = nb * (Number(a.prix_achat) || 0); } else achat = manque * (Number(a.prix_achat) || 0); }
  return { a, need, stock, reste, manque, nb, achat, cout: need * StockAPI.unitPrice(a) };
}

function renderBesoins() {
  const m = modeleCourant(), list = composantsDe(m.id), N = qteFabriquer();
  const infos = list.map(c => stockInfo(c, N));
  const lies = infos.filter(i => i && !i.bad), manques = lies.filter(i => i.manque > 0);
  const coutTot = lies.reduce((s, i) => s + i.cout, 0), achatTot = manques.reduce((s, i) => s + i.achat, 0);
  const money = n => (Number(n) || 0).toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + ' DA';
  $p('#pr-stats').innerHTML =
    '<div class="at-stat"><span>Pièces à fabriquer</span><b>' + fmtN(N, 0) + '</b></div>' +
    '<div class="at-stat"><span>Composants à sortir du dépôt</span><b>' + list.length + '</b><small style="color:var(--mut)">' + lies.length + ' lié(s) au stock</small></div>' +
    (lies.length ? '<div class="at-stat"><span>Coût matières estimé</span><b>' + money(coutTot) + '</b><small style="color:var(--mut)">' + money(N ? coutTot / N : 0) + ' par pièce</small></div>' +
      '<div class="at-stat' + (manques.length ? ' st-warn' : '') + '"><span>Stock insuffisant</span><b>' + manques.length + '</b><small style="color:var(--mut)">' + (manques.length ? 'À acheter : ≈ ' + money(achatTot) : 'Tout est disponible') + '</small></div>' : '');
  $p('#pr-need-body').innerHTML = list.length ? list.map((c, i) => {
    const s = infos[i];
    let stockTd = '<td><small style="color:var(--mut)">—</small></td><td><small style="color:var(--mut)">—</small></td><td><small style="color:var(--mut)">—</small></td>';
    let sub = '';
    if (s && s.bad) stockTd = '<td colspan="3"><small style="color:var(--r)">Unité « ' + escP(c.unite) + ' » incompatible avec l’article « ' + escP(s.a.nom) + ' » (' + escP(s.a.unite) + ')</small></td>';
    else if (s) {
      const f = StockAPI.fmtQty(s.a, s.stock), r = StockAPI.fmtQty(s.a, Math.abs(s.reste)), n = StockAPI.fmtQty(s.a, s.need);
      if (n.sub && c.unite === s.a.unite) sub = '<small>= ' + n.sub + '</small>';
      stockTd = '<td><b>' + escP(s.a.nom) + '</b><small>' + f.main + (f.sub ? ' · ' + f.sub : '') + '</small></td>' +
        '<td>' + (s.manque > 0
          ? '<b class="st-neg">Manque ' + r.main + '</b><small>' + (s.nb ? 'à acheter : ' + s.nb + ' ' + StockAPI.plur(s.a.cond_nom, s.nb) : 'à acheter') + ' ≈ ' + money(s.achat) + '</small>'
          : '<b class="st-pos">' + r.main + '</b>' + (r.sub ? '<small>' + r.sub + '</small>' : '')) + '</td>' +
        '<td><b>' + money(s.cout) + '</b><small>' + (s.cout && N ? (s.cout / N).toLocaleString('fr-FR', { maximumFractionDigits: 2 }) + ' DA / pièce' : '') + '</small></td>';
    }
    return '<tr class="pr-need"><td><b>' + escP(c.nom) + '</b>' + (c.note ? '<small>' + escP(c.note) + '</small>' : '') + '</td>' +
      '<td>' + fmtN(c.quantite, 4) + ' ' + escP(c.unite) + '</td>' +
      '<td>' + (Number(c.perte_pct) ? fmtN(c.perte_pct, 2) + ' %' : '—') + '</td>' +
      '<td><b>' + fmtBesoin(c, N) + ' ' + escP(c.unite) + '</b>' + sub + '</td>' + stockTd + '</tr>';
  }).join('') : '<tr><td colspan="7" class="at-empty">Ajoutez d’abord les composants du modèle.</td></tr>';
  $p('#pr-stock-help').innerHTML = !lies.length && list.length
    ? 'Astuce : reliez chaque composant à un article de l’onglet <b>Stock</b> (bouton « Modifier ») pour voir la disponibilité, le coût estimé et sortir le stock automatiquement.'
    : (lies.length ? '« Valider la sortie de stock » retire du stock les ' + lies.length + ' composant(s) liés, sous le n° de bon ci-dessus.' : '');
  $p('#pr-btn-sortie').disabled = !lies.length;
}

/* ---------- Modèles ---------- */
function showFormModele(edit) {
  editModele = !!edit;
  const m = edit ? modeleCourant() : null;
  $p('#pr-mform-title').textContent = m ? 'Modifier le modèle' : 'Nouveau modèle';
  $p('#pr-mnom').value = m ? m.nom : '';
  $p('#pr-mdesc').value = m ? (m.description || '') : '';
  $p('#pr-mform').style.display = 'block';
  $p('#pr-mform').scrollIntoView({ behavior: 'smooth', block: 'start' });
  $p('#pr-mnom').focus();
}
function cancelFormModele() { editModele = false; $p('#pr-mform').style.display = 'none'; }

async function saveModele() {
  const nom = $p('#pr-mnom').value.trim(), description = $p('#pr-mdesc').value.trim();
  if (!nom) { toastP('Le nom du modèle est obligatoire.'); return; }
  const res = editModele
    ? await sb.from('modeles').update({ nom, description }).eq('id', selModele).select()
    : await sb.from('modeles').insert([{ nom, description }]).select();
  if (res.error) { toastP('Erreur : ' + errMsgP(res.error)); return; }
  const wasEdit = editModele;
  if (!wasEdit && res.data && res.data[0]) selModele = res.data[0].id;
  toastP(wasEdit ? 'Modèle modifié.' : 'Modèle créé : ajoutez maintenant ses composants.');
  cancelFormModele();
  await loadProduction();
  if (!wasEdit) showFormComposant();
}

async function duplicateModele() {
  const m = modeleCourant(); if (!m) return;
  const nom = (prompt('Nom du nouveau modèle :', m.nom + ' (copie)') || '').trim();
  if (!nom) return;
  const r = await sb.from('modeles').insert([{ nom, description: m.description || '' }]).select();
  if (r.error || !r.data || !r.data[0]) { toastP('Erreur : ' + errMsgP(r.error || { message: 'création impossible' })); return; }
  const rows = composantsDe(m.id).map((c, i) => ({
    modele_id: r.data[0].id, nom: c.nom, unite: c.unite, quantite: c.quantite, perte_pct: c.perte_pct, note: c.note || '', ordre: i + 1, article_id: c.article_id || null
  }));
  if (rows.length) {
    const r2 = await sb.from('composants').insert(rows);
    if (r2.error) { toastP('Modèle créé, mais copie des composants impossible : ' + errMsgP(r2.error)); }
  }
  selModele = r.data[0].id;
  toastP('Modèle dupliqué.');
  await loadProduction();
}

async function removeModele() {
  const m = modeleCourant(); if (!m) return;
  const n = composantsDe(m.id).length;
  if (!confirm('Supprimer le modèle « ' + m.nom + ' » et ses ' + n + ' composant(s) ?')) return;
  const { error } = await sb.from('modeles').delete().eq('id', m.id);
  if (error) { toastP('Erreur : ' + errMsgP(error)); return; }
  selModele = null;
  toastP('Modèle supprimé.');
  await loadProduction();
}

/* Exemple : sac à dos (à modifier / compléter ensuite) */
async function createExemple() {
  const r = await sb.from('modeles').insert([{ nom: 'Sac à dos', description: 'Exemple : modifiez les quantités et ajoutez les autres éléments.' }]).select();
  if (r.error || !r.data || !r.data[0]) { toastP('Erreur : ' + errMsgP(r.error || { message: 'création impossible' })); return; }
  const id = r.data[0].id;
  const items = [
    ['Kawi bébé (matière première)', 'm', 0.5], ['Doubleur', 'm', 0.4], ['Songle', 'pcs', 3], ['Kisseur', 'pcs', 2], ['Poignée', 'pcs', 1]
  ].map((x, i) => ({ modele_id: id, nom: x[0], unite: x[1], quantite: x[2], perte_pct: 0, note: '', ordre: i + 1 }));
  const r2 = await sb.from('composants').insert(items);
  if (r2.error) toastP('Erreur : ' + errMsgP(r2.error));
  selModele = id;
  await loadProduction();
}

/* ---------- Composants ---------- */
function showFormComposant(id) {
  if (!modeleCourant()) return;
  curComposant = id || null;
  const c = id ? COMPOSANTS.find(x => String(x.id) === String(id)) : null;
  $p('#pr-cform-title').textContent = c ? 'Modifier le composant' : 'Nouveau composant';
  if (window.StockAPI) {
    StockAPI.fillSelect($p('#pr-cart'), c ? c.article_id : '', '— Aucun (saisie libre) —');
    // les noms du Stock sont proposés à la saisie
    $p('#pr-noms').innerHTML = [...new Set(['Tissu principal', 'Doublure', 'Sangle', 'Curseur', 'Fermeture éclair', 'Poignée', 'Boucle', 'Fil', 'Bourre / mousse', 'Étiquette', 'Emballage',
      ...StockAPI.list().map(a => a.nom)])].map(n => '<option value="' + escP(n) + '">').join('');
  }
  prAutoNom = '';
  $p('#pr-cnom').value = c ? c.nom : '';
  $p('#pr-cunite').value = c ? c.unite : 'm';
  $p('#pr-cqte').value = c ? c.quantite : '';
  $p('#pr-cperte').value = c ? (Number(c.perte_pct) || '') : '';
  $p('#pr-cnote').value = c ? (c.note || '') : '';
  $p('#pr-csubmit').textContent = c ? 'Enregistrer les modifications' : 'Ajouter le composant';
  $p('#pr-cform').style.display = 'block';
  $p('#pr-cform').scrollIntoView({ behavior: 'smooth', block: 'center' });
  $p('#pr-cnom').focus();
}
function cancelFormComposant() { curComposant = null; $p('#pr-cform').style.display = 'none'; }

async function saveComposant() {
  const m = modeleCourant(); if (!m) return;
  const nom = $p('#pr-cnom').value.trim();
  const unite = $p('#pr-cunite').value;
  const quantite = parseFloat($p('#pr-cqte').value);
  const perte = parseFloat($p('#pr-cperte').value) || 0;
  const note = $p('#pr-cnote').value.trim();
  if (!nom) { toastP('Le nom du composant est obligatoire.'); return; }
  if (!(quantite > 0)) { toastP('La quantité par pièce doit être supérieure à 0.'); return; }
  if (perte < 0 || perte > 100) { toastP('La marge de chute doit être entre 0 et 100 %.'); return; }

  // Nom déjà présent dans le Stock (ex. « Kawi normal ») : le composant s'y lie tout seul
  let articleId = $p('#pr-cart').value || null;
  if (!articleId && window.StockAPI) {
    const a = StockAPI.find(nom) || StockAPI.find(nom.replace(/^.*[—–-]\s*/, ''));
    if (a && StockAPI.toBase(a, 1, unite) != null) articleId = a.id;
  }
  const payload = { nom, unite, quantite, perte_pct: perte, note, article_id: articleId };
  let res;
  if (curComposant) res = await sb.from('composants').update(payload).eq('id', curComposant).select();
  else {
    const ordre = composantsDe(m.id).reduce((mx, c) => Math.max(mx, Number(c.ordre) || 0), 0) + 1;
    res = await sb.from('composants').insert([{ ...payload, modele_id: m.id, ordre }]).select();
  }
  if (res.error) { toastP('Erreur : ' + errMsgP(res.error)); return; }

  const wasEdit = !!curComposant;
  toastP(wasEdit ? 'Composant modifié.' : 'Composant ajouté.');
  if (wasEdit) cancelFormComposant();
  else { $p('#pr-cnom').value = ''; $p('#pr-cqte').value = ''; $p('#pr-cperte').value = ''; $p('#pr-cnote').value = ''; $p('#pr-cnom').focus(); }
  await loadProduction();
}

async function removeComposant(id) {
  const c = COMPOSANTS.find(x => String(x.id) === String(id));
  if (!c || !confirm('Supprimer « ' + c.nom + ' » de ce modèle ?')) return;
  const { error } = await sb.from('composants').delete().eq('id', id);
  if (error) { toastP('Erreur : ' + errMsgP(error)); return; }
  if (String(curComposant) === String(id)) cancelFormComposant();
  toastP('Composant supprimé.');
  await loadProduction();
}

/* ---------- Sortie de stock automatique (valide le bon de sortie) ---------- */
async function validerSortieStock() {
  const b = verifierBon(); if (!b) return;
  if (!window.StockAPI) { toastP('Module stock non chargé.'); return; }
  try { await StockAPI.load(); } catch (e) {}
  const items = [], manques = [], exclus = [];
  b.list.forEach(c => {
    const s = stockInfo(c, b.N);
    if (!s) { exclus.push(c.nom + ' (non lié)'); return; }
    if (s.bad) { exclus.push(c.nom + ' (unité incompatible)'); return; }
    items.push({ article_id: s.a.id, qte: s.need, nom: s.a.nom, txt: StockAPI.fmtQty(s.a, s.need).main });
    if (s.manque > 0) manques.push(s.a.nom + ' : manque ' + StockAPI.fmtQty(s.a, s.manque).main);
  });
  if (!items.length) { toastP('Aucun composant lié au stock : choisissez un « Article du stock » dans chaque composant.'); return; }
  const ref = b.num || ('BM-' + b.date.replace(/-/g, ''));
  const deja = StockAPI.dejaSorti(ref).filter(m => items.some(i => String(i.article_id) === String(m.article_id)));
  if (deja.length && !confirm('Une sortie de stock existe déjà avec la référence « ' + ref + ' » (' + deja.length + ' ligne(s)).\nValider une deuxième fois retirera encore ces quantités du stock. Continuer ?')) return;
  const msg = 'Sortir du stock pour ' + fmtN(b.N, 0) + ' « ' + b.m.nom + ' » (bon ' + ref + ') :\n\n' + items.map(i => '• ' + i.nom + ' : ' + i.txt).join('\n') +
    (exclus.length ? '\n\nNon sortis : ' + exclus.join(', ') : '') +
    (manques.length ? '\n\n⚠ Stock insuffisant (il deviendra négatif) :\n' + manques.join('\n') : '') + '\n\nConfirmer ?';
  if (!confirm(msg)) return;
  const r = await StockAPI.sortie(items, ref, 'Production ' + b.m.nom + ' × ' + b.N + ' pièces' + (b.atelier ? ' → ' + b.atelier : ''), 'production');
  if (r.error) { toastP('Erreur : ' + (r.error.message || r.error)); return; }
  toastP('Stock mis à jour : ' + r.n + ' article(s) sorti(s) sous le bon ' + ref + '.');
  // numéro de bon suivant, pour ne pas valider deux fois le même
  $p('#pr-bon').value = ref.replace(/(\d+)$/, n => String(parseInt(n, 10) + 1).padStart(n.length, '0'));
}

/* ---------- Bon de sortie : impression ---------- */
function bonInfos() {
  const m = modeleCourant(), N = qteFabriquer();
  return { m, N, list: composantsDe(m.id), atelier: $p('#pr-atelier').value.trim(), chef: $p('#pr-chef').value.trim(),
           date: $p('#pr-date').value || isoP(new Date()), num: $p('#pr-bon').value.trim() };
}
function verifierBon() {
  if (!modeleCourant()) return null;
  const b = bonInfos();
  if (!b.list.length) { toastP('Ajoutez d’abord les composants du modèle.'); return null; }
  if (b.N < 1) { toastP('Indiquez la quantité à fabriquer.'); return null; }
  return b;
}

function imprimerBon() {
  const b = verifierBon(); if (!b) return;
  const rows = b.list.map((c, i) =>
    '<tr><td class="c">' + (i + 1) + '</td><td><b>' + escP(c.nom) + '</b>' + (c.note ? '<small>' + escP(c.note) + '</small>' : '') + '</td>' +
    '<td class="c">' + escP(c.unite) + '</td><td class="c">' + fmtN(c.quantite, 4) + '</td>' +
    '<td class="bon-qte">' + fmtBesoin(c, b.N) + ' ' + escP(c.unite) + '</td><td class="bon-box"></td><td class="bon-box"></td></tr>').join('');
  $p('#bon-print').innerHTML =
    '<div class="bon-head"><img src="icons/icon-192.png" alt=""><div><h1>BON DE SORTIE DE MATIÈRES</h1><p>Dépôt → Atelier · MARIA BAG</p></div>' +
    '<div class="bon-num">N° ' + escP(b.num || '—') + '<br>' + fdP(b.date) + '</div></div>' +
    '<div class="bon-info"><div><span>Produit :</span><b>' + escP(b.m.nom) + '</b></div>' +
    '<div><span>Quantité à fabriquer :</span><b>' + fmtN(b.N, 0) + ' pièces</b></div>' +
    '<div><span>Atelier destinataire :</span><b>' + escP(b.atelier || '………………………') + '</b></div>' +
    '<div><span>Chef d’atelier :</span><b>' + escP(b.chef || '………………………') + '</b></div></div>' +
    '<table><tbody><tr><th class="c">N°</th><th>Désignation</th><th class="c">Unité</th><th class="c">Qté par pièce</th>' +
    '<th>Quantité à sortir</th><th class="c">Sorti du dépôt</th><th class="c">Reçu à l’atelier</th></tr>' + rows + '</tbody></table>' +
    '<p class="bon-note">Quantités calculées pour ' + fmtN(b.N, 0) + ' pièces : remettre exactement ces quantités, ni plus, ni moins.</p>' +
    '<div class="bon-sign"><div>Magasinier (dépôt)</div><div>Chef d’atelier</div><div>Responsable</div></div>';
  const oldTitle = document.title;
  document.title = 'Bon de sortie - ' + b.m.nom + ' - ' + b.N + ' pcs - ' + b.date;
  document.body.classList.add('printing-bon');
  const fin = () => { document.body.classList.remove('printing-bon'); document.title = oldTitle; window.removeEventListener('afterprint', fin); };
  window.addEventListener('afterprint', fin);
  setTimeout(() => window.print(), 60);
}

/* ---------- Bon de sortie : PDF (téléchargement / partage) ---------- */
/* jsPDF n'affiche que les caractères latins : on nettoie le texte (espaces insécables des nombres, apostrophes, flèches…) */
function pdfTxt(v) {
  return String(v ?? '')
    .replace(/[\u202f\u00a0]/g, ' ')
    .replace(/[\u2018\u2019]/g, "'").replace(/[\u201c\u201d]/g, '"')
    .replace(/\u2026/g, '...').replace(/[\u2013\u2014]/g, '-').replace(/\u2192/g, '->')
    .replace(/[^\x09\x0A\x0D\x20-\x7E\u00A0-\u00FF]/g, '?');
}
const pdfNum = (n, dec) => pdfTxt(fmtN(n, dec));

/* Logo chargé à l'avance (le partage doit se faire tout de suite après le clic) */
let LOGO_PDF = null;
(function chargerLogo() {
  const img = new Image();
  img.onload = () => {
    try {
      const c = document.createElement('canvas');
      c.width = img.naturalWidth; c.height = img.naturalHeight;
      c.getContext('2d').drawImage(img, 0, 0);
      LOGO_PDF = c.toDataURL('image/png');
    } catch (e) { LOGO_PDF = null; }
  };
  img.src = 'icons/icon-192.png';
})();

function creerPdf(b) {
  if (!(window.jspdf && window.jspdf.jsPDF)) throw new Error('Bibliothèque PDF non chargée : vérifiez la connexion internet puis rechargez la page.');
  const doc = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4' });
  if (typeof doc.autoTable !== 'function') throw new Error('Module de tableaux PDF non chargé : vérifiez la connexion internet puis rechargez la page.');
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), M = 14;
  const N = b.N;

  /* En-tête */
  if (LOGO_PDF) doc.addImage(LOGO_PDF, 'PNG', M, 9, 22, 22);
  doc.setTextColor(0); doc.setFont('helvetica', 'bold'); doc.setFontSize(17);
  doc.text(pdfTxt('BON DE SORTIE DE MATIÈRES'), M + 26, 18);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(90);
  doc.text(pdfTxt('Dépôt -> Atelier  |  MARIA BAG'), M + 26, 25);
  doc.setTextColor(0); doc.setFont('helvetica', 'bold'); doc.setFontSize(12);
  doc.text(pdfTxt('N° ' + (b.num || '-')), W - M, 17, { align: 'right' });
  doc.text(pdfTxt(fdP(b.date)), W - M, 24, { align: 'right' });
  doc.setDrawColor(0); doc.setLineWidth(0.8); doc.line(M, 34, W - M, 34);

  /* Informations */
  const infos = [
    ['Produit', b.m.nom], ['Quantité à fabriquer', fmtN(N, 0) + ' pièces'],
    ['Atelier destinataire', b.atelier || '....................'], ['Chef d\'atelier', b.chef || '....................']
  ];
  infos.forEach((it, i) => {
    const x = i % 2 === 0 ? M : W / 2 + 4, y = 43 + Math.floor(i / 2) * 12;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(90); doc.text(pdfTxt(it[0]), x, y);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11.5); doc.setTextColor(0); doc.text(pdfTxt(it[1]), x, y + 5.5);
  });

  /* Tableau des quantités */
  doc.autoTable({
    startY: 70, margin: { left: M, right: M, bottom: 18 },
    head: [['N°', 'Désignation', 'Unité', 'Qté par pièce', 'Quantité à sortir', 'Sorti du dépôt', 'Reçu à l\'atelier'].map(pdfTxt)],
    body: b.list.map((c, i) => [i + 1, c.nom + (c.note ? '\n' + c.note : ''), c.unite, pdfNum(c.quantite, 4),
                                pdfTxt(fmtBesoin(c, N)) + ' ' + pdfTxt(c.unite), '', '']).map(r => r.map(pdfTxt)),
    theme: 'grid', rowPageBreak: 'avoid',
    styles: { font: 'helvetica', fontSize: 10, cellPadding: 3, textColor: 0, lineColor: 0, lineWidth: 0.2, valign: 'middle', minCellHeight: 11 },
    headStyles: { fillColor: [235, 235, 235], textColor: 0, fontStyle: 'bold', halign: 'center', fontSize: 8.5 },
    columnStyles: {
      0: { halign: 'center', cellWidth: 10 }, 2: { halign: 'center', cellWidth: 16 }, 3: { halign: 'center', cellWidth: 22 },
      4: { halign: 'right', fontStyle: 'bold', fontSize: 12, cellWidth: 38 }, 5: { cellWidth: 21 }, 6: { cellWidth: 21 }
    }
  });

  /* Mention + signatures (nouvelle page si pas assez de place) */
  let y = doc.lastAutoTable.finalY + 9;
  if (y > H - 62) { doc.addPage(); y = 20; }
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(0);
  doc.text(pdfTxt('Quantités calculées pour ' + fmtN(N, 0) + ' pièces : remettre exactement ces quantités, ni plus, ni moins.'), M, y);
  y += 30;
  const colW = (W - 2 * M - 2 * 10) / 3;
  ['Magasinier (dépôt)', 'Chef d\'atelier', 'Responsable'].forEach((t, i) => {
    const x = M + i * (colW + 10);
    doc.setLineWidth(0.3); doc.line(x, y, x + colW, y);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.text(pdfTxt(t), x + colW / 2, y + 5, { align: 'center' });
  });

  /* Pied de page */
  const n = doc.getNumberOfPages();
  for (let p = 1; p <= n; p++) {
    doc.setPage(p); doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(120);
    doc.text(pdfTxt('MARIA BAG - Bon de sortie ' + (b.num || '') + ' - Page ' + p + '/' + n), W / 2, H - 8, { align: 'center' });
  }
  const name = ('Bon_de_sortie_' + b.m.nom + '_' + N + 'pcs_' + b.date).replace(/[^\w\-]+/g, '_') + '.pdf';
  return { doc, name };
}

function telechargerPdf() {
  const b = verifierBon(); if (!b) return;
  try { const r = creerPdf(b); r.doc.save(r.name); toastP('PDF enregistré : ' + r.name); }
  catch (e) { toastP('Erreur PDF : ' + e.message); }
}

/* Envoi direct (WhatsApp, e-mail, Drive…) via le menu de partage du téléphone */
async function partagerPdf() {
  const b = verifierBon(); if (!b) return;
  let r;
  try { r = creerPdf(b); } catch (e) { toastP('Erreur PDF : ' + e.message); return; }
  const file = new File([r.doc.output('blob')], r.name, { type: 'application/pdf' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'Bon de sortie - ' + b.m.nom,
        text: 'Bon de sortie de matières : ' + b.m.nom + ', ' + fmtN(b.N, 0) + ' pièces (bon ' + (b.num || '') + ')' });
      return;
    } catch (e) {
      if (e && e.name === 'AbortError') return;          // l'utilisateur a fermé le menu de partage
    }
  }
  r.doc.save(r.name);
  toastP('Partage direct indisponible sur cet appareil : le PDF a été téléchargé. Envoyez-le depuis vos fichiers (WhatsApp, e-mail…).');
}

/* ---------- Export Excel ---------- */
function exportBon() {
  if (typeof XLSX === 'undefined') { toastP('Bibliothèque Excel non chargée.'); return; }
  const b = verifierBon(); if (!b) return;
  const aoa = [
    ['BON DE SORTIE DE MATIÈRES — MARIA BAG'],
    ['N° du bon', b.num], ['Date', fdP(b.date)], ['Produit', b.m.nom], ['Quantité à fabriquer', b.N],
    ['Atelier destinataire', b.atelier], ['Chef d’atelier', b.chef], [],
    ['N°', 'Désignation', 'Unité', 'Quantité par pièce', 'Marge de chute (%)', 'Quantité à sortir', 'Sorti du dépôt', 'Reçu à l’atelier']
  ].concat(b.list.map((c, i) => [i + 1, c.nom, c.unite, Number(c.quantite), Number(c.perte_pct) || 0, besoin(c, b.N), '', '']));
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = [{ wch: 6 }, { wch: 34 }, { wch: 9 }, { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 15 }, { wch: 16 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Bon de sortie');
  const nomFichier = ('Bon_matieres_' + b.m.nom + '_' + b.N + 'pcs').replace(/[^\w\-]+/g, '_');
  XLSX.writeFile(wb, nomFichier + '.xlsx');
}

/* ---------- Initialisation et événements ---------- */
$p('#pr-qte').value = 1000;
$p('#pr-date').value = isoP(new Date());
$p('#pr-bon').value = 'BM-' + isoP(new Date()).replace(/-/g, '') + '-01';
$p('#pr-cunite').innerHTML = UNITES.map(u => '<option>' + u + '</option>').join('');

$p('#pr-modele').addEventListener('change', e => { selModele = e.target.value || null; cancelFormComposant(); renderAll(); });
$p('#pr-qte').addEventListener('input', () => { if (modeleCourant()) renderBesoins(); });
$p('#pr-mform').addEventListener('submit', ev => { ev.preventDefault(); saveModele(); });
$p('#pr-cform').addEventListener('submit', ev => { ev.preventDefault(); saveComposant(); });
document.querySelector('nav button[data-v="production"]').addEventListener('click', loadProduction);
// Choix d'un article du stock : le composant reprend son nom et son unité
$p('#pr-cart').addEventListener('change', () => {
  const a = window.StockAPI ? StockAPI.byId($p('#pr-cart').value) : null; if (!a) return;
  if (!$p('#pr-cnom').value.trim() || $p('#pr-cnom').value === prAutoNom) { prAutoNom = a.categorie + ' — ' + a.nom; $p('#pr-cnom').value = prAutoNom; }
  $p('#pr-cunite').value = a.unite;
});
// Le stock a changé (entrée, sortie, prix) : fiche matières et besoins se recalculent seuls
document.addEventListener('mariabag:stock', () => { if (modeleCourant()) { renderComposants(); renderBesoins(); } });

document.addEventListener('mariabag:authenticated', loadProduction);
if (!document.getElementById('app').classList.contains('hide')) loadProduction();