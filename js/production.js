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
/* Quantité à sortir exprimée aussi en rouleaux (bobines, paquets…) pour le chef de dépôt : « (0,44 rouleau) » */
function enCond(c, N) {
  const a = articleDe(c); if (!a || !window.StockAPI || !StockAPI.aCond(a)) return '';
  const base = StockAPI.toBase(a, besoin(c, N), c.unite); if (base == null) return '';
  const nb = base / StockAPI.condQte(a), entiers = Math.floor(nb + 1e-9), reste = base - entiers * StockAPI.condQte(a);
  return fmtN(nb, 2) + ' ' + StockAPI.plur(a.cond_nom, nb) + (entiers >= 1 && reste > 1e-6 ? ' = ' + entiers + ' ' + StockAPI.plur(a.cond_nom, entiers) + ' + ' + fmtN(reste, 2) + ' ' + a.unite : '');
}
function fmtBesoin(c, N) { return fmtN(besoin(c, N), UNITES_ENTIERES.includes(c.unite) ? 0 : 2); }
function modeleCourant() { return MODELES.find(m => String(m.id) === String(selModele)) || null; }
function composantsDe(id) { return COMPOSANTS.filter(c => String(c.modele_id) === String(id)); }
/* Finition extérieure : payée à la pièce aux finisseurs (rien à sortir du dépôt) */
const isFin = c => c.type === 'finition';
const composantsMat = id => composantsDe(id).filter(c => !isFin(c));
const composantsFin = id => composantsDe(id).filter(isFin);

/* ---------- Chargement ---------- */
let chargeEnCours = null;
async function loadProduction(sansSync) {
  // un seul chargement à la fois (évite les synchronisations en double, source de composants dupliqués)
  if (chargeEnCours && !sansSync) {        // déjà en cours : on attend la fin puis on recharge une fois (données fraîches)
    if (!chargeEnCours._suite) chargeEnCours._suite = chargeEnCours.catch(() => {}).then(() => loadProduction());
    return chargeEnCours._suite;
  }
  const run = chargerProduction(sansSync);
  if (!sansSync) { chargeEnCours = run; run.finally(() => { if (chargeEnCours === run) chargeEnCours = null; }); }
  return run;
}
async function chargerProduction(sansSync) {
  try { if (window.StockAPI) await StockAPI.load(); } catch (e) { /* stock non installé : la fiche matières marche sans */ }
  const m = await sb.from('modeles').select('*').order('nom', { ascending: true });
  if (m.error) { MODELES = []; COMPOSANTS = []; toastP('Erreur : ' + errMsgP(m.error)); renderAll(errMsgP(m.error)); return; }
  const c = await sb.from('composants').select('*').order('ordre', { ascending: true }).order('created_at', { ascending: true });
  if (c.error) { MODELES = m.data || []; COMPOSANTS = []; toastP('Erreur : ' + errMsgP(c.error)); renderAll(errMsgP(c.error)); return; }
  MODELES = m.data || [];
  COMPOSANTS = c.data || [];
  if (!sansSync && await depuisProduits()) return chargerProduction(true);      // une seule passe de synchronisation, puis affichage
  if (!MODELES.some(x => String(x.id) === String(selModele))) selModele = MODELES.length ? MODELES[0].id : null;
  renderAll();
}

/* ---------- Produits (coût de revient) → modèles de la fiche matières ----------
   Chaque produit qui a des lignes de coût devient un modèle ici (même nom), avec ses composants repris des lignes :
   rien à ressaisir. « ↻ Reprendre du produit » remet le modèle à jour si le produit a changé. */
let PRODS_P = [], LIGNES_P = [];
const normP = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
/* Lignes d'un produit pour 1 pièce, packs dépliés (les produits du pack × leur quantité), regroupées par article / désignation */
function lignesProduitP(produitId, mult, prof, acc) {
  mult = mult == null ? 1 : mult; prof = prof || 0; acc = acc || new Map();
  if (prof > 5) return acc;
  LIGNES_P.filter(l => String(l.produit_id) === String(produitId)).forEach(l => {
    if (l.sous_produit_id) { lignesProduitP(l.sous_produit_id, mult * (Number(l.quantite) || 0), prof + 1, acc); return; }
    const fin = l.categorie === 'Finition', k = (fin ? 'f' : l.article_id ? 'a' + l.article_id : 'd' + String(l.designation).toLowerCase()) + '|' + (l.unite || '') + (fin ? '|' + l.prix_unitaire : '');
    const x = acc.get(k) || Object.assign({}, l, { quantite: 0, perte_pct: 0 });
    x.quantite += (Number(l.quantite) || 0) * (fin ? 1 : 1 + (Number(l.perte_pct) || 0) / 100) * mult; acc.set(k, x);
  });
  return acc;
}
function composantsDepuis(produitId, modeleId) {
  return [...lignesProduitP(produitId).values()].map((l, i) => l.categorie === 'Finition'
    ? { modele_id: modeleId, nom: l.designation || 'Finition', unite: 'pcs', quantite: Number(l.quantite) || 1, perte_pct: 0, note: l.note || '', ordre: i, type: 'finition', prix_unitaire: Number(l.prix_unitaire) || 0, article_id: null }
    : { modele_id: modeleId, nom: l.designation || 'Composant', unite: l.unite || 'pcs', quantite: Math.round((Number(l.quantite) || 0) * 10000) / 10000, perte_pct: 0, note: l.note || '', ordre: i, type: 'matiere', prix_unitaire: 0, article_id: l.article_id || null });
}
async function depuisProduits() {
  const pr = await sb.from('produits').select('*'), li = await sb.from('produit_lignes').select('*');
  if (pr.error || li.error) return false;
  PRODS_P = pr.data || []; LIGNES_P = li.data || [];
  let cree = 0, maj = 0;
  for (const p of PRODS_P) {      // chaque produit fini a son modèle ici (même sans coût de revient encore)
    let m = MODELES.find(x => String(x.id) === String(p.modele_id)) || MODELES.find(x => normP(x.nom) === normP(p.nom));
    if (!m) { const r = await sb.from('modeles').insert([{ nom: p.nom, description: 'Créé depuis Produits (coût de revient)' }]).select(); if (r.error || !r.data) continue; m = r.data[0]; MODELES.push(m); cree++; }
    if (String(p.modele_id) !== String(m.id)) await sb.from('produits').update({ modele_id: m.id }).eq('id', p.id);
    // même nom des deux côtés
    if (String(p.modele_id) === String(m.id) && m.nom !== p.nom && !MODELES.some(x => x !== m && normP(x.nom) === normP(p.nom))) { const r = await sb.from('modeles').update({ nom: p.nom }).eq('id', m.id); if (!r.error) { m.nom = p.nom; maj++; } }
    // SYNCHRONISATION : les composants du modèle suivent toujours les lignes du coût de revient du produit
    const rows = composantsDepuis(p.id, m.id);
    if (rows.length && signatureP(rows) !== signatureP(composantsDe(m.id))) {
      await sb.from('composants').delete().eq('modele_id', m.id);       // tous les composants du modèle (doublons compris)
      const r = await sb.from('composants').insert(rows); if (!r.error) maj++;
    }
  }
  if (cree) toastP('Fiche matières : les produits finis du Stock sont dans la liste des modèles.');
  return cree + maj > 0;
}
/* Empreinte des composants (quantité avec chute incluse) : sert à savoir si le modèle et le produit disent la même chose */
function signatureP(rows) {
  return rows.map(c => [c.type === 'finition' ? 'f' : 'm', c.type === 'finition' ? normP(c.nom) + ':' + (Number(c.prix_unitaire) || 0) : (c.article_id ? 'a' + c.article_id + ':' + normP(c.nom) : 'd' + normP(c.nom)), c.unite || '',
    Math.round((Number(c.quantite) || 0) * (1 + (Number(c.perte_pct) || 0) / 100) * 10000) / 10000].join('|')).sort().join('\n');
}
/* Produit lié au modèle, et report d'une modification faite ici (Production) vers ses lignes de coût (Produits) */
const produitLie = id => PRODS_P.find(p => String(p.modele_id) === String(id)) || null;
const estPackP = p => !!p && LIGNES_P.some(l => String(l.produit_id) === String(p.id) && l.sous_produit_id);
function lignesDuComposant(p, c) {
  const L = LIGNES_P.filter(l => String(l.produit_id) === String(p.id) && !l.sous_produit_id);
  if (c.type === 'finition') return L.filter(l => l.categorie === 'Finition' && normP(l.designation) === normP(c.nom));
  const parArt = c.article_id ? L.filter(l => String(l.article_id) === String(c.article_id)) : [];
  return parArt.length ? parArt : L.filter(l => l.categorie !== 'Finition' && !l.article_id && normP(l.designation) === normP(c.nom));
}
async function versProduit(m, avant, apres) {
  const p = produitLie(m.id); if (!p || estPackP(p)) return;
  try {
    const cibles = avant ? lignesDuComposant(p, avant) : [];
    if (!apres) { for (const l of cibles) await sb.from('produit_lignes').delete().eq('id', l.id); }
    else if (cibles.length) {
      const l = cibles[0], a = apres.article_id && window.StockAPI ? StockAPI.byId(apres.article_id) : null, prix = a ? StockAPI.priceFor(a, apres.unite) : null;
      const patch = { designation: apres.nom, unite: apres.unite, quantite: apres.quantite, perte_pct: apres.perte_pct || 0, note: apres.note || '', article_id: apres.article_id || null };
      if (apres.type === 'finition') patch.prix_unitaire = Number(apres.prix_unitaire) || 0; else if (prix != null) patch.prix_unitaire = Math.round(prix * 10000) / 10000;
      if (l.gabarits && l.gabarits.resultat) { const g = Object.assign({}, l.gabarits); delete g.resultat; patch.gabarits = g; }      // quantité corrigée à la main : plus de recalcul automatique
      await sb.from('produit_lignes').update(patch).eq('id', l.id);
      for (const x of cibles.slice(1)) await sb.from('produit_lignes').delete().eq('id', x.id);       // lignes en double regroupées
    } else {
      const ordre = LIGNES_P.filter(l => String(l.produit_id) === String(p.id)).reduce((mx, l) => Math.max(mx, Number(l.ordre) || 0), 0);
      const rows = typeof ligneDepuisComposants === 'function' ? ligneDepuisComposants(p.id, [apres], []) : [];
      if (rows.length) { rows[0].ordre = ordre + 1; await sb.from('produit_lignes').insert(rows); }
    }
    if (typeof loadProduits === 'function') loadProduits();
  } catch (e) { /* le modèle est enregistré ; le produit sera réaligné à la prochaine ouverture */ }
}
/* PACK : un composant modifié ou retiré dans le pack est reporté dans TOUS les produits qui le composent
   (ex. « 3 pieces 380 » : Pafine blanc → autre matière, une seule fois pour les 3 produits). */
function sousProduitsP(packId, prof, acc) {
  prof = prof || 0; acc = acc || new Map(); if (prof > 5) return acc;
  LIGNES_P.filter(l => String(l.produit_id) === String(packId) && l.sous_produit_id).forEach(l => {
    const sp = PRODS_P.find(p => String(p.id) === String(l.sous_produit_id)); if (!sp) return;
    if (estPackP(sp)) sousProduitsP(sp.id, prof + 1, acc); else acc.set(String(sp.id), sp);
  });
  return [...acc.values()];
}
async function versPack(pack, avant, apres) {
  const cibles = sousProduitsP(pack.id).map(sp => ({ sp, lignes: lignesDuComposant(sp, avant) })).filter(x => x.lignes.length);
  if (!cibles.length) { toastP('Ce composant n’a pas été retrouvé dans les produits du pack : modifiez-le dans la section Produits.'); return false; }
  const noms = cibles.map(x => '• ' + x.sp.nom).join('\n');
  if (!apres) {
    if (!confirm('Retirer « ' + avant.nom + ' » du pack « ' + pack.nom + ' » ?\n\nIl sera retiré de chaque produit du pack :\n' + noms)) return false;
    for (const x of cibles) for (const l of x.lignes) await sb.from('produit_lignes').delete().eq('id', l.id);
    return true;
  }
  const tot = c => (Number(c.quantite) || 0) * (1 + (Number(c.perte_pct) || 0) / 100);
  const ratio = tot(avant) > 0 ? tot(apres) / tot(avant) : 1, change = Math.abs(ratio - 1) > 1e-6;
  const a = apres.article_id && window.StockAPI ? StockAPI.byId(apres.article_id) : null;
  if (!confirm('Modifier « ' + avant.nom + ' »' + (apres.nom !== avant.nom ? ' → « ' + apres.nom + ' »' : '') + ' dans le pack « ' + pack.nom + ' » ?\n\n' +
    'La modification est faite dans chaque produit du pack :\n' + noms + (change ? '\n\nQuantités ajustées de ' + (ratio > 1 ? '+' : '') + fmtN((ratio - 1) * 100, 1) + ' % dans chaque produit.' : ''))) return false;
  for (const x of cibles) for (const l of x.lignes) {
    const unite = a ? apres.unite : (apres.unite || l.unite), prix = a ? StockAPI.priceFor(a, unite) : null;
    const patch = { designation: apres.nom, unite, article_id: apres.article_id || null, note: apres.note || l.note || '' };
    if (avant.type === 'finition') patch.prix_unitaire = Number(apres.prix_unitaire) || 0; else if (prix != null) patch.prix_unitaire = Math.round(prix * 10000) / 10000;
    if (change) {
      patch.quantite = Math.round((Number(l.quantite) || 0) * ratio * 10000) / 10000;
      if (l.gabarits && l.gabarits.resultat) { const g = Object.assign({}, l.gabarits); delete g.resultat; patch.gabarits = g; }
    }
    const r = await sb.from('produit_lignes').update(patch).eq('id', l.id);
    if (r.error) { toastP('Erreur : ' + errMsgP(r.error)); return false; }
  }
  return true;
}
/* Appelé par la section Produits après chaque changement : le modèle suit tout de suite */
let syncT = null;
window.syncProduction = function () {
  clearTimeout(syncT);
  syncT = setTimeout(() => {
    const ouvert = ['#pr-cform', '#pr-mform', '#pr-pkform'].some(q => { const f = $p(q); return f && getComputedStyle(f).display !== 'none'; });
    if (!ouvert) loadProduction();
  }, 500);
};
const produitDuModele = id => PRODS_P.find(p => String(p.modele_id) === String(id) && LIGNES_P.some(l => String(l.produit_id) === String(p.id)));

/* ---------- Composer un pack : plusieurs modèles finis assemblés → une seule fiche matières ---------- */
let packLignes = [];
function ouvrirPack() {
  const m = modeleCourant(), cible = m ? produitLie(m.id) : null;
  const deja = cible ? LIGNES_P.filter(l => String(l.produit_id) === String(cible.id) && l.sous_produit_id) : [];
  packLignes = deja.length ? deja.map(l => ({ id: l.sous_produit_id, q: Number(l.quantite) || 1 })) : [{ id: '', q: 1 }, { id: '', q: 1 }, { id: '', q: 1 }];
  $p('#pr-pkcible').innerHTML = '<option value="__new">— Nouveau pack —</option>' + PRODS_P.slice().sort((a, b) => a.nom.localeCompare(b.nom, 'fr')).map(x => '<option value="' + escP(x.id) + '"' + (cible && String(cible.id) === String(x.id) ? ' selected' : '') + '>' + escP(x.nom) + '</option>').join('');
  $p('#pr-pknom').value = ''; majPackForm();
  $p('#pr-pkform').style.display = 'block'; $p('#pr-pkform').scrollIntoView({ behavior: 'smooth', block: 'start' });
}
function fermerPack() { $p('#pr-pkform').style.display = 'none'; }
function lirePack() { document.querySelectorAll('#pr-pklignes [data-pk]').forEach(r => { const i = Number(r.dataset.pk); packLignes[i] = { id: r.querySelector('select').value, q: parseFloat(r.querySelector('input').value) || 0 }; }); }
function majPackForm() {
  const cible = $p('#pr-pkcible').value;
  $p('#pr-pknom-w').style.display = cible === '__new' ? '' : 'none';
  const opts = PRODS_P.filter(x => String(x.id) !== String(cible)).sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
  $p('#pr-pklignes').innerHTML = packLignes.map((l, i) => '<div class="at-fields" data-pk="' + i + '" style="align-items:end"><label style="grid-column:span 2">Modèle fini ' + (i + 1) + '<select>' +
    '<option value="">— choisir —</option>' + opts.map(x => '<option value="' + escP(x.id) + '"' + (String(l.id) === String(x.id) ? ' selected' : '') + '>' + escP(x.nom) + (LIGNES_P.some(y => String(y.produit_id) === String(x.id)) ? '' : ' (sans matières)') + '</option>').join('') +
    '</select></label><label>Quantité dans le pack<input type="number" min="0" step="1" value="' + (l.q || 1) + '"></label><button class="btn s d" type="button" onclick="lirePack();packLignes.splice(' + i + ',1);majPackForm()">×</button></div>').join('');
}
async function enregistrerPack() {
  lirePack();
  const lignes = packLignes.filter(l => l.id && l.q > 0);
  if (lignes.length < 2) { toastP('Choisissez au moins 2 modèles finis pour le pack.'); return; }
  let cible = $p('#pr-pkcible').value, pack = PRODS_P.find(x => String(x.id) === String(cible));
  if (cible === '__new') {
    const nom = $p('#pr-pknom').value.trim(); if (!nom) { toastP('Donnez un nom au pack (ex : 3 pieces 380).'); return; }
    pack = PRODS_P.find(x => normP(x.nom) === normP(nom));
    if (!pack) { const r = await sb.from('produits').insert([{ nom, description: 'Pack de ' + lignes.length + ' modèles' }]).select(); if (r.error || !r.data) { toastP('Erreur : ' + errMsgP(r.error)); return; } pack = r.data[0]; }
  }
  if (lignes.some(l => String(l.id) === String(pack.id))) { toastP('Le pack ne peut pas se contenir lui-même.'); return; }
  // lignes « produit du pack » remplacées ; les autres lignes du pack (emballage, assemblage…) sont gardées
  for (const l of LIGNES_P.filter(x => String(x.produit_id) === String(pack.id) && x.sous_produit_id)) await sb.from('produit_lignes').delete().eq('id', l.id);
  const rows = lignes.map((l, i) => { const sp = PRODS_P.find(x => String(x.id) === String(l.id)); return { produit_id: pack.id, categorie: 'Pack', designation: sp ? sp.nom : 'Produit', unite: 'pcs', quantite: l.q, prix_unitaire: 0, perte_pct: 0, ordre: i, sous_produit_id: l.id, article_id: null }; });
  const r = await sb.from('produit_lignes').insert(rows); if (r.error) { toastP('Erreur : ' + errMsgP(r.error)); return; }
  // fiche matières du pack recalculée (matières de tous les modèles regroupées)
  const li = await sb.from('produit_lignes').select('*'); LIGNES_P = li.data || LIGNES_P;
  let m = MODELES.find(x => String(x.id) === String(pack.modele_id)) || MODELES.find(x => normP(x.nom) === normP(pack.nom));
  if (!m) { const rm = await sb.from('modeles').insert([{ nom: pack.nom, description: 'Pack' }]).select(); if (rm.error || !rm.data) { toastP('Erreur : ' + errMsgP(rm.error)); return; } m = rm.data[0]; }
  await sb.from('produits').update({ modele_id: m.id }).eq('id', pack.id);
  for (const c of COMPOSANTS.filter(c => String(c.modele_id) === String(m.id))) await sb.from('composants').delete().eq('id', c.id);
  const comp = composantsDepuis(pack.id, m.id); if (comp.length) await sb.from('composants').insert(comp);
  fermerPack(); selModele = m.id;
  const sans = lignes.filter(l => !LIGNES_P.some(y => String(y.produit_id) === String(l.id) && !y.sous_produit_id)).length;
  toastP('Pack « ' + pack.nom + ' » : ' + comp.length + ' matière(s) regroupée(s) dans une seule fiche.' + (sans ? ' ⚠ ' + sans + ' modèle(s) sans matières : remplissez leur coût de revient (Produits), puis « ↻ Reprendre du produit ».' : ''));
  await loadProduction();
}
async function reprendreDuProduit() {
  const m = modeleCourant(), p = m && produitDuModele(m.id); if (!p) { toastP('Ce modèle n’est lié à aucun produit avec coût de revient.'); return; }
  if (!confirm('Remplacer les composants de « ' + m.nom + ' » par les lignes du coût de revient du produit « ' + p.nom + ' » ?')) return;
  for (const c of composantsDe(m.id)) await sb.from('composants').delete().eq('id', c.id);
  const r = await sb.from('composants').insert(composantsDepuis(p.id, m.id));
  if (r.error) { toastP('Erreur : ' + errMsgP(r.error)); return; }
  toastP('Composants repris du produit « ' + p.nom + ' ».'); await loadProduction();
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
  const rp = $p('#pr-btn-reprendre');
  if (rp) {      // la synchronisation est automatique : le bouton devient un simple repère
    rp.style.display = 'none';
    let info = $p('#pr-sync-info');
    if (!info) { info = document.createElement('span'); info.id = 'pr-sync-info'; info.className = 'pr-sync'; rp.parentNode.insertBefore(info, rp); }
    const lie = has ? produitLie(selModele) : null;
    info.style.display = lie ? '' : 'none';
    if (lie) info.innerHTML = '🔗 <span class="ps-l">Synchronisé avec le produit « ' + escP(lie.nom) + ' »' + (estPackP(lie) ? ' (pack)' : '') + '</span><span class="ps-c">Synchronisé avec Produits' + (estPackP(lie) ? ' (pack)' : '') + '</span> <a href="#" onclick="event.preventDefault();window.selProduitDepuis && selProduitDepuis(\'' + escP(lie.id) + '\')"><span class="ps-l">ouvrir le coût de revient →</span><span class="ps-c">ouvrir →</span></a>';
  }
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
    '<tr class="pc-row" data-cid="' + escP(c.id) + '"><td class="pc-n"><b>' + escP(c.nom) + '</b>' + (isFin(c) ? '<small><span class="pr-fin-tag">Finition extérieure</span></small>' : '') + '</td>' +
    '<td class="pc-u"><span class="pr-unit-tag">' + escP(c.unite) + '</span></td>' +
    '<td class="pc-q">' + fmtN(c.quantite, 4) + '</td>' +
    '<td class="pc-p' + (!isFin(c) && Number(c.perte_pct) ? '' : ' pc-nil') + '">' + (!isFin(c) && Number(c.perte_pct) ? fmtN(c.perte_pct, 2) + ' %' : '—') + '</td>' +
    '<td class="pc-s">' + (isFin(c) ? '<b>' + fmtN(Number(c.prix_unitaire) * Number(c.quantite), 2) + ' DA</b><small>payé par pièce</small>' : stockCell(c)) + '</td>' +
    '<td class="pc-o' + (c.note ? '' : ' pc-nil') + '">' + escP(c.note || '') + '</td>' +
    '<td class="emp-act pc-a"><button class="btn s" type="button" onclick="showFormComposant(\'' + escP(c.id) + '\')">Modifier</button> ' +
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
  const m = modeleCourant(), list = composantsMat(m.id), fins = composantsFin(m.id), N = qteFabriquer();
  const infos = list.map(c => stockInfo(c, N));
  const finParPiece = fins.reduce((s, c) => s + Number(c.quantite || 0) * Number(c.prix_unitaire || 0), 0), finTot = finParPiece * N;
  const lies = infos.filter(i => i && !i.bad), manques = lies.filter(i => i.manque > 0);
  const coutTot = lies.reduce((s, i) => s + i.cout, 0), achatTot = manques.reduce((s, i) => s + i.achat, 0);
  const money = n => (Number(n) || 0).toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + ' DA';
  $p('#pr-stats').innerHTML =
    '<div class="at-stat"><span>Pièces à fabriquer</span><b>' + fmtN(N, 0) + '</b></div>' +
    '<div class="at-stat"><span>Composants à sortir du dépôt</span><b>' + list.length + '</b><small style="color:var(--mut)">' + lies.length + ' lié(s) au stock</small></div>' +
    (lies.length ? '<div class="at-stat"><span>Coût matières estimé</span><b>' + money(coutTot) + '</b><small style="color:var(--mut)">' + money(N ? coutTot / N : 0) + ' par pièce</small></div>' +
      '<div class="at-stat' + (manques.length ? ' st-warn' : '') + '"><span>Stock insuffisant</span><b>' + manques.length + '</b><small style="color:var(--mut)">' + (manques.length ? 'À acheter : ≈ ' + money(achatTot) : 'Tout est disponible') + '</small></div>' : '') +
    (fins.length ? '<div class="at-stat"><span>Finition extérieure à payer</span><b>' + money(finTot) + '</b><small style="color:var(--mut)">' + money(finParPiece) + ' par pièce</small></div>' : '') +
    (fins.length && lies.length ? '<div class="at-stat pd-total"><span>Coût estimé (matières + finition)</span><b>' + money(coutTot + finTot) + '</b><small>' + money(N ? (coutTot + finTot) / N : 0) + ' par pièce</small></div>' : '');
  // Finition extérieure : coût à régler aux finisseurs (pas de sortie de dépôt)
  $p('#pr-fin-wrap').style.display = fins.length ? '' : 'none';
  $p('#pr-fin-body').innerHTML = fins.map(c => {
    const par = Number(c.quantite || 0) * Number(c.prix_unitaire || 0);
    return '<tr class="pr-need"><td><b>' + escP(c.nom) + '</b>' + (c.note ? '<small>' + escP(c.note) + '</small>' : '') + '</td>' +
      '<td>' + fmtN(c.quantite, 4) + '</td><td>' + fmtN(c.prix_unitaire, 2) + ' DA</td><td>' + fmtN(par, 2) + ' DA</td>' +
      '<td><b>' + money(par * N) + '</b><small>' + fmtN(N, 0) + ' pièces × ' + fmtN(par, 2) + ' DA</small></td></tr>';
  }).join('') + (fins.length > 1 ? '<tr class="pr-total"><td colspan="3">Total finition extérieure</td><td>' + fmtN(finParPiece, 2) + ' DA</td><td>' + money(finTot) + '</td></tr>' : '');
  $p('#pr-need-body').innerHTML = list.length ? list.map((c, i) => {
    const s = infos[i];
    let stockTd = '<td class="pn-s pc-nil"><small style="color:var(--mut)">—</small></td><td class="pn-r pc-nil"><small style="color:var(--mut)">—</small></td><td class="pn-c pc-nil"><small style="color:var(--mut)">—</small></td>';
    let sub = '';
    if (s && s.bad) stockTd = '<td colspan="3"><small style="color:var(--r)">Unité « ' + escP(c.unite) + ' » incompatible avec l’article « ' + escP(s.a.nom) + ' » (' + escP(s.a.unite) + ')</small></td>';
    else if (s) {
      const f = StockAPI.fmtQty(s.a, s.stock), r = StockAPI.fmtQty(s.a, Math.abs(s.reste)), n = StockAPI.fmtQty(s.a, s.need);
      if (n.sub && c.unite === s.a.unite) sub = '<small>= ' + n.sub + '</small>';
      stockTd = '<td class="pn-s"><b>' + escP(s.a.nom) + '</b><small>' + f.main + (f.sub ? ' · ' + f.sub : '') + '</small></td>' +
        '<td class="pn-r' + (s.manque > 0 ? ' pn-ko' : ' pn-ok') + '">' + (s.manque > 0
          ? '<b class="st-neg">Manque ' + r.main + '</b><small>' + (s.nb ? 'à acheter : ' + s.nb + ' ' + StockAPI.plur(s.a.cond_nom, s.nb) : 'à acheter') + ' ≈ ' + money(s.achat) + '</small>'
          : '<b class="st-pos">' + r.main + '</b>' + (r.sub ? '<small>' + r.sub + '</small>' : '')) + '</td>' +
        '<td class="pn-c"><b>' + money(s.cout) + '</b><small>' + (s.cout && N ? (s.cout / N).toLocaleString('fr-FR', { maximumFractionDigits: 2 }) + ' DA / pièce' : '') + '</small></td>';
    }
    return '<tr class="pr-need pn-row' + (s && !s.bad && s.manque > 0 ? ' pn-manque' : '') + '"><td class="pn-n"><b>' + escP(c.nom) + '</b>' + (c.note ? '<small>' + escP(c.note) + '</small>' : '') + '</td>' +
      '<td class="pn-q">' + fmtN(c.quantite, 4) + ' ' + escP(c.unite) + '</td>' +
      '<td class="pn-p">' + (Number(c.perte_pct) ? fmtN(c.perte_pct, 2) + ' %' : '—') + '</td>' +
      '<td class="pn-b"><b>' + fmtBesoin(c, N) + ' ' + escP(c.unite) + '</b>' + sub + '</td>' + stockTd + '</tr>';
  }).join('') : '<tr><td colspan="7" class="at-empty">' + (fins.length ? 'Aucune matière à sortir du dépôt pour ce modèle.' : 'Ajoutez d’abord les composants du modèle.') + '</td></tr>';
  $p('#pr-stock-help').innerHTML = !lies.length && list.length
    ? 'Astuce : reliez chaque composant à un article de l’onglet <b>Stock</b> (bouton « Modifier ») pour voir la disponibilité, le coût estimé et sortir le stock automatiquement.'
    : (list.length ? '« Envoyer au magasinier » crée le bon de sortie : le magasinier coche chaque élément pris au dépôt puis valide ; le stock des ' + lies.length + ' élément(s) liés est sorti à ce moment-là.' : '');
  $p('#pr-btn-sortie').disabled = !list.length; renderSuiviBons();
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
    modele_id: r.data[0].id, nom: c.nom, unite: c.unite, quantite: c.quantite, perte_pct: c.perte_pct, note: c.note || '', ordre: i + 1, article_id: c.article_id || null, type: c.type || 'matiere', prix_unitaire: c.prix_unitaire || 0
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
  document.querySelector('input[name="pr-ctype"][value="' + (c && isFin(c) ? 'finition' : 'matiere') + '"]').checked = true;
  $p('#pr-cprix').value = c && isFin(c) ? c.prix_unitaire : '';
  $p('#pr-cnom').value = c ? c.nom : '';
  $p('#pr-cunite').value = c ? c.unite : 'm';
  $p('#pr-cqte').value = c ? c.quantite : '';
  $p('#pr-cperte').value = c ? (Number(c.perte_pct) || '') : '';
  $p('#pr-cnote').value = c ? (c.note || '') : '';
  $p('#pr-csubmit').textContent = c ? 'Enregistrer les modifications' : 'Ajouter le composant';
  majTypeComposant();
  $p('#pr-cform').style.display = 'block';
  $p('#pr-cform').scrollIntoView({ behavior: 'smooth', block: 'center' });
  $p('#pr-cnom').focus();
}
/* Matière (sort du dépôt) ou finition extérieure (payée à la pièce) : le formulaire s'adapte */
function typeComposant() { const r = document.querySelector('input[name="pr-ctype"]:checked'); return r ? r.value : 'matiere'; }
function majTypeComposant() {
  const fin = typeComposant() === 'finition';
  document.querySelectorAll('#pr-ctype .pr-typ').forEach(l => l.classList.toggle('on', l.querySelector('input').checked));
  $p('#pr-cart-wrap').style.display = fin ? 'none' : '';
  $p('#pr-cunite-wrap').style.display = fin ? 'none' : '';
  $p('#pr-cperte-wrap').style.display = fin ? 'none' : '';
  $p('#pr-cprix-wrap').style.display = fin ? '' : 'none';
  $p('#pr-cprix').required = fin;
  $p('#pr-cqte-lbl').textContent = fin ? 'Nombre de passages par pièce *' : 'Quantité pour 1 pièce *';
  $p('#pr-cqte').placeholder = fin ? 'Ex : 1' : 'Ex : 0.5';
  $p('#pr-cnom').placeholder = fin ? 'Ex : Finition extérieure, assemblage, repassage…' : 'Ex : Tissu principal';
  if (fin) { $p('#pr-cunite').value = 'pcs'; if (!$p('#pr-cqte').value) $p('#pr-cqte').value = 1; if (!$p('#pr-cnom').value.trim()) $p('#pr-cnom').value = 'Finition extérieure'; }
  else if ($p('#pr-cnom').value === 'Finition extérieure') $p('#pr-cnom').value = '';
  majFinHint();
}
function majFinHint() {
  const fin = typeComposant() === 'finition', n = qteFabriquer();
  const par = (parseFloat($p('#pr-cqte').value) || 0) * (parseFloat($p('#pr-cprix').value) || 0);
  $p('#pr-cfin-hint').textContent = fin
    ? 'Les finisseurs extérieurs sont payés à chaque pièce produite. Rien ne sort du dépôt : ce coût s’ajoute au coût de production' +
      (par ? ' — ' + par.toLocaleString('fr-FR', { maximumFractionDigits: 2 }) + ' DA par pièce, soit ' + (par * n).toLocaleString('fr-FR', { maximumFractionDigits: 0 }) + ' DA pour ' + n.toLocaleString('fr-FR') + ' pièces.' : '.')
    : '';
}
function cancelFormComposant() { curComposant = null; $p('#pr-cform').style.display = 'none'; }

async function saveComposant() {
  const m = modeleCourant(); if (!m) return;
  const nom = $p('#pr-cnom').value.trim();
  const fin = typeComposant() === 'finition';
  const unite = fin ? 'pcs' : $p('#pr-cunite').value;
  const quantite = parseFloat($p('#pr-cqte').value);
  const perte = fin ? 0 : (parseFloat($p('#pr-cperte').value) || 0);
  const prixFin = fin ? parseFloat($p('#pr-cprix').value) : 0;
  if (fin && !(prixFin > 0)) { toastP('Indiquez le prix payé au finisseur par pièce.'); return; }
  const note = $p('#pr-cnote').value.trim();
  if (!nom) { toastP('Le nom du composant est obligatoire.'); return; }
  if (!(quantite > 0)) { toastP('La quantité par pièce doit être supérieure à 0.'); return; }
  if (perte < 0 || perte > 100) { toastP('La marge de chute doit être entre 0 et 100 %.'); return; }

  // Nom déjà présent dans le Stock (ex. « Kawi normal ») : le composant s'y lie tout seul
  let articleId = fin ? null : ($p('#pr-cart').value || null);
  if (!fin && !articleId && window.StockAPI) {
    const a = StockAPI.find(nom) || StockAPI.find(nom.replace(/^.*[—–-]\s*/, ''));
    if (a && StockAPI.toBase(a, 1, unite) != null) articleId = a.id;
  }
  const payload = { nom, unite, quantite, perte_pct: perte, note, article_id: articleId, type: fin ? 'finition' : 'matiere', prix_unitaire: fin ? prixFin : 0 };
  const cle = c => [c.type || 'matiere', c.article_id || String(c.nom || '').trim().toLowerCase(), c.unite, Number(c.prix_unitaire) || 0].join('|');
  if (composantsDe(m.id).some(c => String(c.id) !== String(curComposant || '') && cle(c) === cle(payload))) { toastP('« ' + nom + ' » est déjà dans ce modèle : modifiez la ligne existante.'); return; }
  const lieP = produitLie(m.id);
  if (estPackP(lieP)) {
    if (!curComposant) { toastP('« ' + m.nom + ' » est un pack : ajoutez ce composant dans les produits qui le composent (section Produits).'); return; }
    const av = COMPOSANTS.find(x => String(x.id) === String(curComposant));
    if (!av || !(await versPack(lieP, av, payload))) return;
    toastP('Composant modifié dans tous les produits du pack « ' + m.nom + ' ».');
    cancelFormComposant();
    if (typeof loadProduits === 'function') await loadProduits();
    await loadProduction();
    return;
  }
  const avantC = curComposant ? Object.assign({}, COMPOSANTS.find(x => String(x.id) === String(curComposant)) || {}) : null;
  let res;
  if (curComposant) res = await sb.from('composants').update(payload).eq('id', curComposant).select();
  else {
    const ordre = composantsDe(m.id).reduce((mx, c) => Math.max(mx, Number(c.ordre) || 0), 0) + 1;
    res = await sb.from('composants').insert([{ ...payload, modele_id: m.id, ordre }]).select();
  }
  if (res.error) { toastP('Erreur : ' + errMsgP(res.error)); return; }
  await versProduit(m, avantC && avantC.id ? avantC : null, payload);       // le coût de revient du produit suit

  const wasEdit = !!curComposant;
  toastP(wasEdit ? 'Composant modifié.' : 'Composant ajouté.');
  if (wasEdit) cancelFormComposant();
  else { $p('#pr-cnom').value = ''; $p('#pr-cqte').value = ''; $p('#pr-cperte').value = ''; $p('#pr-cnote').value = ''; $p('#pr-cnom').focus(); }
  await loadProduction();
}

async function removeComposant(id) {
  const c = COMPOSANTS.find(x => String(x.id) === String(id));
  const mC = MODELES.find(x => String(x.id) === String(c && c.modele_id)), lieP = mC && produitLie(mC.id);
  if (c && estPackP(lieP)) {
    if (!(await versPack(lieP, c, null))) return;
    if (String(curComposant) === String(id)) cancelFormComposant();
    toastP('« ' + c.nom + ' » retiré de tous les produits du pack.');
    if (typeof loadProduits === 'function') await loadProduits();
    await loadProduction(); return;
  }
  if (!c || !confirm('Supprimer « ' + c.nom + ' » de ce modèle' + (lieP ? ' et du coût de revient du produit « ' + lieP.nom + ' »' : '') + ' ?')) return;
  const { error } = await sb.from('composants').delete().eq('id', id);
  if (error) { toastP('Erreur : ' + errMsgP(error)); return; }
  if (mC) await versProduit(mC, c, null);
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

/* ---------- Bon de sortie envoyé au MAGASINIER (section « Bons de sortie ») ----------
   Le stock n'est sorti qu'au moment où le magasinier valide le bon (tous les éléments cochés). */
async function envoyerAuMagasinier() {
  const b = verifierBon(); if (!b) return;
  if (!window.BonsSortie) { toastP('Module « Bons de sortie » non chargé.'); return; }
  if (window.StockAPI) { try { await StockAPI.load(); } catch (e) {} }
  const lignes = [], exclus = [];
  b.list.forEach(c => {
    const s = stockInfo(c, b.N);
    if (s && s.bad) { exclus.push(c.nom + ' (unité incompatible)'); return; }
    if (s) {
      const f = StockAPI.fmtQty(s.a, s.need);
      lignes.push({ nom: s.a.nom, article_id: s.a.id, qte: Math.round(s.need * 10000) / 10000, unite: s.a.unite, txt: f.main + (f.sub ? ' (' + f.sub + ')' : ''), note: s.manque > 0 ? '⚠ stock insuffisant : manque ' + StockAPI.fmtQty(s.a, s.manque).main : '', coche: false });
    } else {
      const q = besoin(c, b.N);
      lignes.push({ nom: c.nom, article_id: null, qte: Math.round(q * 10000) / 10000, unite: c.unite, txt: fmtBesoin(c, b.N) + ' ' + c.unite, note: 'non lié au stock', coche: false });
    }
  });
  if (!lignes.length) { toastP('Aucun élément à sortir du dépôt pour ce modèle.'); return; }
  const ref = b.num || ('BM-' + b.date.replace(/-/g, ''));
  const deja = (window.BonsSortie.liste() || []).find(x => x.numero === ref && x.statut !== 'annule');
  if (deja && !confirm('Un bon « ' + ref + ' » existe déjà (' + (deja.statut === 'valide' ? 'validé' : 'à préparer') + '). En créer un autre avec le même numéro ?')) return;
  if (!confirm('Envoyer le bon ' + ref + ' au magasinier ?\n\n' + fmtN(b.N, 0) + ' × ' + b.m.nom + (b.atelier ? ' → ' + b.atelier : '') + '\n' + lignes.map(l => '• ' + l.nom + ' : ' + l.txt).join('\n') +
    (exclus.length ? '\n\nNon inclus : ' + exclus.join(', ') : '') + '\n\nLe stock sera sorti quand le magasinier validera le bon.')) return;
  const r = await BonsSortie.creer({ numero: ref, date_bon: b.date || new Date().toISOString().slice(0, 10), modele_id: b.m.id, modele_nom: b.m.nom, quantite: b.N, atelier: b.atelier || '', chef: b.chef || '', lignes });
  if (r.error) { toastP('Erreur : ' + (r.error.message || r.error)); return; }
  toastP('📦 Bon ' + ref + ' envoyé au magasinier (section « Bons de sortie »).');
  $p('#pr-bon').value = ref.replace(/(\d+)$/, n => String(parseInt(n, 10) + 1).padStart(n.length, '0'));
  if (typeof renderSuiviBons === 'function') renderSuiviBons();
}
/* Suivi des bons envoyés, sous le bouton */
function renderSuiviBons() {
  const box = $p('#pr-bons-suivi'); if (!box || !window.BonsSortie) return;
  const L = BonsSortie.liste().filter(x => x.statut !== 'annule').slice(0, 6);
  box.innerHTML = L.length ? '<h3 style="margin:14px 0 6px;font-size:14px">Derniers bons de sortie</h3>' + L.map(x => '<div class="pr-bs ' + (x.statut === 'valide' ? 'ok' : 'wait') + '"><b>' + escP(x.numero) + '</b> · ' + escP(x.modele_nom) + ' × ' + fmtN(x.quantite, 0) +
    '<span>' + (x.statut === 'valide' ? '✔ validé par ' + escP(x.valide_par || '?') + (x.message ? ' : « ' + escP(x.message) + ' »' : '') : '⏳ en préparation au dépôt (' + (x.lignes || []).filter(l => l.coche).length + ' / ' + (x.lignes || []).length + ')') + '</span></div>').join('') : '';
}
document.addEventListener('mariabag:sorties', renderSuiviBons);

/* ---------- Bon de sortie : impression ---------- */
function bonInfos() {
  const m = modeleCourant(), N = qteFabriquer();
  return { m, N, list: composantsMat(m.id), atelier: $p('#pr-atelier').value.trim(), chef: $p('#pr-chef').value.trim(),
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
    '<td class="bon-qte">' + fmtBesoin(c, b.N) + ' ' + escP(c.unite) + (enCond(c, b.N) ? '<small>(' + escP(enCond(c, b.N)) + ')</small>' : '') + '</td><td class="bon-box"></td><td class="bon-box"></td></tr>').join('');
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
    .replace(/[\u202f\u00a0]/g, ' ').replace(/œ/g, 'oe').replace(/Œ/g, 'OE')
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
                                pdfTxt(fmtBesoin(c, N)) + ' ' + pdfTxt(c.unite) + (enCond(c, N) ? '\n(' + enCond(c, N) + ')' : ''), '', '']).map(r => r.map(pdfTxt)),
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
  ].concat(b.list.map((c, i) => [i + 1, c.nom, c.unite, Number(c.quantite), Number(c.perte_pct) || 0, besoin(c, b.N) + (enCond(c, b.N) ? ' (' + enCond(c, b.N) + ')' : ''), '', '']));
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
document.querySelectorAll('input[name="pr-ctype"]').forEach(r => r.addEventListener('change', majTypeComposant));
['#pr-cqte', '#pr-cprix'].forEach(s => $p(s).addEventListener('input', majFinHint));
$p('#pr-qte').addEventListener('input', majFinHint);
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