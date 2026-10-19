/* ============================================================
   MARIA BAG — Produits : coût de revient d'UNE pièce avant production
   - Un PRODUIT (ex : Sac à dos) contient des LIGNES DE COÛT pour 1 pièce :
     matière (tissu), doublure, sangle, curseur, emballage, autres outils
     Coût d'une ligne = quantité pour 1 pièce × (1 + chute %) × prix unitaire
   - MAIN D'ŒUVRE d'une pièce =
       (salaires de tous les employés du jour + charges FIXES du jour)
       ÷ nombre de pièces fabriquées le même jour
     Salaires : calculés d'après le pointage (onglet Employés)
     Charges fixes : onglet Charges > « Charges fixes de chaque jour » (dîner, loyer,
     électricité… saisis une seule fois) ; les charges variables n'y entrent pas
   - Coût de revient = matières et fournitures + main d'œuvre
   - Import des composants depuis la fiche matières (onglet Production)
   - Export Excel et fiche PDF (téléchargement / partage)
   ============================================================ */

let PRODUITS = [], LIGNES = [];
let selProduit = null;      // id du produit affiché
let editProduit = false;    // le formulaire produit sert à renommer
let curLigne = null;        // ligne en cours de modification

const $d = s => document.querySelector(s);
const CAT_PAIE_D = 'Paie des employés';
/* Catégories de coût (les mêmes que celles du Stock, + prestations). Les clés existantes
   « Matière » et « Autre outil » sont gardées : les lignes déjà saisies restent valables.
   « Autre outil » reste TOUJOURS en dernier (reçoit les catégories inconnues). u = unité proposée. */
const CATS_D = [
  { k: 'Matière',     lbl: 'Matière (tissu principal)',   u: 'm',      ex: 'Ex : Kawi normal, Kawi bébé, Sky…' },
  { k: 'Doublure',    lbl: 'Doublure',                    u: 'm',      ex: 'Ex : doublure polyester' },
  { k: 'Sangle',      lbl: 'Sangle',                      u: 'm',      ex: 'Ex : sangle 3 cm' },
  { k: 'Curseur',     lbl: 'Curseur',                     u: 'pcs',    ex: 'Ex : curseur n°5' },
  { k: 'Fermeture',   lbl: 'Fermeture éclair',            u: 'm',      ex: 'Ex : fermeture éclair n°5' },
  { k: 'Éponge',      lbl: 'Éponge / mousse / bourre',    u: 'm',      ex: 'Ex : éponge 5 mm, mousse dos' },
  { k: 'Poignée',     lbl: 'Poignée',                     u: 'pcs',    ex: 'Ex : poignée de transport' },
  { k: 'Boucle',      lbl: 'Boucle / attache',            u: 'pcs',    ex: 'Ex : boucle plastique, mousqueton' },
  { k: 'Fil',         lbl: 'Fil',                         u: 'bobine', ex: 'Ex : fil nylon, fil de couture' },
  { k: 'Étiquette',   lbl: 'Étiquette / logo',            u: 'pcs',    ex: 'Ex : étiquette tissée, patch logo' },
  { k: 'Emballage',   lbl: 'Emballage',                   u: 'pcs',    ex: 'Ex : sachet, carton, étiquette prix' },
  { k: 'Broderie',    lbl: 'Broderie / impression',       u: 'pcs',    ex: 'Ex : broderie logo, sérigraphie' },
  { k: 'Transport',   lbl: 'Transport / livraison',       u: 'pcs',    ex: 'Ex : transport des matières, livraison' },
  { k: 'Finition',    lbl: 'Finition extérieure (payée à la pièce)', u: 'pcs', ex: 'Ex : finition, assemblage, repassage (payé par pièce)' },
  { k: 'Autre outil', lbl: 'Autres outils / fournitures', u: 'pcs',    ex: 'Ex : tout ce qui ne rentre pas ailleurs…' }
];
const UNITES_D = ['m', 'cm', 'pcs', 'paire', 'kg', 'g', 'L', 'bobine', 'rouleau'];

/* ---------- Utilitaires ---------- */
function escD(v) {
  return String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function isoD(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function fdD(s) { return s ? s.split('-').reverse().join('/') : ''; }
function r2D(n) { return Math.round((Number(n) || 0) * 100) / 100; }
function numD(n, maxDec) {
  return (Number(n) || 0).toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: maxDec });
}
function moneyD(n) {
  return (Number(n) || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' DA';
}
function toastD(msg) {
  const e = $d('#toastD');
  if (!e) return;
  e.textContent = msg; e.style.display = 'block';
  clearTimeout(toastD.t); toastD.t = setTimeout(() => e.style.display = 'none', 6000);
}
function errMsgD(error) {
  const m = (error && error.message) || String(error);
  if (/schema cache|does not exist|Could not find|column/i.test(m))
    return 'Tables « produits » introuvables dans Supabase. Exécutez supabase/produits.sql dans SQL Editor, puis rechargez la page. (' + m + ')';
  if (/row-level security|permission denied|policy/i.test(m))
    return 'Accès refusé par Supabase (RLS). Réexécutez supabase/produits.sql. (' + m + ')';
  if (/duplicate key|unique/i.test(m))
    return 'Un produit porte déjà ce nom. Choisissez un autre nom. (' + m + ')';
  return m;
}
function catLbl(k) { const c = CATS_D.find(x => x.k === k); return c ? c.lbl : k; }

/* ---------- Calculs ---------- */
function produitCourant() { return PRODUITS.find(p => String(p.id) === String(selProduit)) || null; }
function lignesDe(id) { return LIGNES.filter(l => String(l.produit_id) === String(id)); }

/* Quantité réellement consommée pour 1 pièce (chute incluse) */
function qteReelle(l) { return Number(l.quantite || 0) * (1 + Number(l.perte_pct || 0) / 100); }
/* Coût d'une ligne pour 1 pièce */
/* Prix d'une unité : repris EN DIRECT du stock si la ligne est liée à un article
   (prix du rouleau ÷ mètres du rouleau), sinon le prix saisi à la main */
function articleLigne(l) { return l.article_id && window.StockAPI ? StockAPI.byId(l.article_id) : null; }
function prixLigne(l) {
  const a = articleLigne(l);
  if (a) { const p = StockAPI.priceFor(a, l.unite); if (p != null) return p; }
  return Number(l.prix_unitaire || 0);
}
/* Catégorie du Stock correspondant à une catégorie de coût (Broderie / Transport = prestations, pas de stock) */
const CAT_PRODUIT_VERS_STOCK = { 'Matière': 'Tissu principal', 'Doublure': 'Doublure', 'Sangle': 'Sangle', 'Curseur': 'Curseur', 'Fermeture': 'Fermeture',
  'Éponge': 'Éponge', 'Poignée': 'Poignée', 'Boucle': 'Boucle', 'Fil': 'Fil', 'Étiquette': 'Étiquette', 'Emballage': 'Emballage', 'Autre outil': 'Accessoire' };
let autoLie = false;     // la liaison au stock a été trouvée automatiquement d'après le nom saisi
/* Nom affiché : celui de l'article du Stock (si on le renomme dans le Stock, il change partout) */
function nomLigne(l) { const a = articleLigne(l); return a ? a.nom : l.designation; }
const CAT_STOCK_VERS_PRODUIT = { 'Tissu principal': 'Matière', 'Doublure': 'Doublure', 'Sangle': 'Sangle', 'Curseur': 'Curseur', 'Fermeture': 'Fermeture', 'Éponge': 'Éponge',
  'Poignée': 'Poignée', 'Boucle': 'Boucle', 'Fil': 'Fil', 'Étiquette': 'Étiquette', 'Emballage': 'Emballage', 'Accessoire': 'Autre outil' };
function coutLigne(l) { return qteReelle(l) * prixLigne(l); }
function coutCat(list, k) { return list.filter(l => l.categorie === k).reduce((s, l) => s + coutLigne(l), 0); }
function coutMatieres(list) { return list.reduce((s, l) => s + coutLigne(l), 0); }

/* Main d'œuvre d'une pièce = (salaires du jour + charges fixes du jour) ÷ pièces du jour */
function moValeurs() {
  return {
    date: $d('#pd-mo-date').value,
    sal: Math.max(0, parseFloat($d('#pd-mo-sal').value) || 0),
    ch: Math.max(0, parseFloat($d('#pd-mo-ch').value) || 0),
    pcs: Math.max(0, Math.floor(parseFloat($d('#pd-mo-pcs').value) || 0))
  };
}
function moUnitaire(v) { return v.pcs > 0 ? (v.sal + v.ch) / v.pcs : 0; }
function moDuProduit(p) {
  return moUnitaire({ sal: Number(p.mo_salaires || 0), ch: Number(p.mo_charges || 0), pcs: Number(p.mo_pieces || 0) });
}

/* Récapitulatif complet d'un produit (valeurs enregistrées) */
function recap(p) {
  const list = lignesDe(p.id);
  const cats = CATS_D.map(c => ({ k: c.k, lbl: c.lbl, v: coutCat(list, c.k), n: list.filter(l => l.categorie === c.k).length }));
  const autres = list.filter(l => !CATS_D.some(c => c.k === l.categorie));     // catégories inconnues : comptées dans « Autres »
  if (autres.length) { cats[cats.length - 1].v += autres.reduce((s, l) => s + coutLigne(l), 0); cats[cats.length - 1].n += autres.length; }
  // seules les catégories utilisées apparaissent dans le récapitulatif
  const used = cats.filter(c => c.n > 0);
  const mat = coutMatieres(list), mo = moDuProduit(p);
  return { list, cats: used.length ? used : cats.slice(0, 1), mat, mo, total: mat + mo };
}

/* ---------- Chargement ---------- */
async function loadProduits() {
  try { if (window.StockAPI) await StockAPI.load(); } catch (e) { /* stock non installé : les prix saisis à la main restent valables */ }
  const p = await sb.from('produits').select('*').order('nom', { ascending: true });
  if (p.error) { PRODUITS = []; LIGNES = []; toastD('Erreur : ' + errMsgD(p.error)); renderProduits(errMsgD(p.error)); return; }
  const l = await sb.from('produit_lignes').select('*').order('ordre', { ascending: true }).order('created_at', { ascending: true });
  if (l.error) { PRODUITS = p.data || []; LIGNES = []; toastD('Erreur : ' + errMsgD(l.error)); renderProduits(errMsgD(l.error)); return; }
  PRODUITS = p.data || [];
  LIGNES = l.data || [];
  if (!PRODUITS.some(x => String(x.id) === String(selProduit))) selProduit = PRODUITS.length ? PRODUITS[0].id : null;
  renderProduits();
  if (await produitsDepuisModeles()) return;      // des produits ont été créés : la liste est rechargée
}

/* Tout modèle de la fiche matières (onglet Production) apparaît aussi dans Produits : on crée le produit
   et on y recopie les composants (avec les prix du Stock). Les produits existants ne sont jamais modifiés. */
let pdAuto = false;
const IGN_KEY = 'mariabag_pd_ignores';
function ignores() { try { return JSON.parse(localStorage.getItem(IGN_KEY) || '[]'); } catch (e) { return []; } }
function ignorerModele(p) { try { const l = ignores(); l.push(String(p.modele_id || ''), 'n:' + normD(p.nom)); localStorage.setItem(IGN_KEY, JSON.stringify(l.filter(Boolean))); } catch (e) {} }
const normD = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
async function produitsDepuisModeles() {
  if (pdAuto) return false;
  pdAuto = true;
  try {
    const m = await sb.from('modeles').select('*'); if (m.error || !(m.data || []).length) return false;
    const manquants = [];
    for (const mod of m.data) {
      if (PRODUITS.some(x => String(x.modele_id) === String(mod.id))) continue;
      if (ignores().includes(String(mod.id)) || ignores().includes('n:' + normD(mod.nom))) continue;
      const meme = PRODUITS.find(x => normD(x.nom) === normD(mod.nom));
      if (meme) { if (!meme.modele_id) await sb.from('produits').update({ modele_id: mod.id }).eq('id', meme.id); continue; }
      manquants.push(mod);
    }
    if (!manquants.length) return false;
    let nb = 0;
    for (const mod of manquants) {
      const r = await sb.from('produits').insert([{ nom: mod.nom, description: mod.description || '', modele_id: mod.id }]).select();
      if (r.error || !r.data || !r.data[0]) continue;
      nb++;
      const c = await sb.from('composants').select('*').eq('modele_id', mod.id).order('ordre', { ascending: true });
      const rows = ligneDepuisComposants(r.data[0].id, c.data || [], []);
      if (rows.length) await sb.from('produit_lignes').insert(rows);
    }
    if (nb) { toastD(nb + ' modèle(s) de la fiche matières ajouté(s) aux Produits (composants et prix du Stock repris).'); await loadProduits(); return true; }
    return false;
  } catch (e) { return false; } finally { setTimeout(() => { pdAuto = false; }, 4000); }
}
/* Lignes de coût d'un produit à partir des composants d'une fiche matières (hors ceux déjà présents) */
function ligneDepuisComposants(produitId, comps, existants) {
  let ordre = 0;
  return comps.filter(x => !existants.includes(String(x.nom).trim().toLowerCase())).map(x => {
    if (x.type === 'finition') return { produit_id: produitId, categorie: 'Finition', designation: x.nom, unite: 'pcs', quantite: x.quantite,
      prix_unitaire: Number(x.prix_unitaire) || 0, perte_pct: 0, note: x.note || '', ordre: ++ordre, article_id: null };
    const a = x.article_id && window.StockAPI ? StockAPI.byId(x.article_id) : null;
    const prix = a ? StockAPI.priceFor(a, x.unite) : null;
    return { produit_id: produitId, categorie: a ? (CAT_STOCK_VERS_PRODUIT[a.categorie] || 'Autre outil') : devinerCat(x.nom), designation: x.nom, unite: x.unite || 'pcs',
      quantite: x.quantite, prix_unitaire: prix != null ? Math.round(prix * 10000) / 10000 : 0, perte_pct: x.perte_pct || 0, note: x.note || '', ordre: ++ordre,
      article_id: a && prix != null ? a.id : null };
  });
}

/* ---------- Affichage ---------- */
function renderProduits(errText) {
  const sel = $d('#pd-produit');
  sel.innerHTML = PRODUITS.length
    ? PRODUITS.map(p => '<option value="' + escD(p.id) + '"' + (String(p.id) === String(selProduit) ? ' selected' : '') + '>' + escD(p.nom) + '</option>').join('')
    : '<option value="">— Aucun produit —</option>';

  renderComparatif();
  const p = produitCourant();
  $d('#pd-main').style.display = p ? '' : 'none';
  $d('#pd-empty').style.display = p ? 'none' : '';
  ['#pd-btn-edit', '#pd-btn-dup', '#pd-btn-del'].forEach(i => { $d(i).disabled = !p; });
  if (errText) {
    $d('#pd-empty').innerHTML = '<p style="color:#b00020">⚠ ' + escD(errText) + '</p>';
    return;
  }
  if (!p) {
    $d('#pd-empty').innerHTML = '<h2>Aucun produit pour le moment</h2>' +
      '<p>Un produit est un article de bagagerie (sac à dos, sac à main, trousse…). Vous y indiquez le prix de chaque élément ' +
      'pour <b>une</b> pièce (matière, doublure, sangle, curseur, emballage…) et la main d’œuvre : l’application calcule son ' +
      '<b>coût de revient</b> avant de lancer la production.</p>' +
      '<button class="btn p" type="button" onclick="showFormProduit()">+ Créer mon premier produit</button> ' +
      '<button class="btn" type="button" onclick="createExempleProduit()">Voir un exemple (sac à dos)</button>';
    return;
  }
  $d('#pd-desc').textContent = p.description || '';
  $d('#pd-desc').style.display = p.description ? '' : 'none';
  renderLignes();
  renderMoForm(p);
  renderCout();
}

function renderLignes() {
  const p = produitCourant(), list = lignesDe(p.id);
  $d('#pd-lignes-title').textContent = 'Matières et fournitures d’une pièce — ' + p.nom;
  // lignes groupées par catégorie, dans l'ordre des catégories
  const ordre = k => { const i = CATS_D.findIndex(c => c.k === k); return i < 0 ? 99 : i; };
  const sorted = [...list].sort((a, b) => ordre(a.categorie) - ordre(b.categorie) || (Number(a.ordre) || 0) - (Number(b.ordre) || 0));
  $d('#pd-lignes-body').innerHTML = sorted.length ? sorted.map(l =>
    '<tr><td><span class="pd-cat pd-cat-' + ordre(l.categorie) + '">' + escD(catLbl(l.categorie)) + '</span></td>' +
    '<td><b>' + escD(nomLigne(l)) + '</b>' + (l.note ? '<small class="pd-note">' + escD(l.note) + '</small>' : '') + '</td>' +
    '<td>' + numD(l.quantite, 4) + ' ' + escD(l.unite) + '</td>' +
    '<td>' + numD(prixLigne(l), 2) + ' DA / ' + escD(l.unite) + (articleLigne(l) ? '<small class="pd-note">✔ Synchronisé avec le Stock</small>' : '') + '</td>' +
    '<td>' + (Number(l.perte_pct) ? numD(l.perte_pct, 2) + ' %' : '—') + '</td>' +
    '<td><b>' + moneyD(coutLigne(l)) + '</b></td>' +
    '<td class="emp-act"><button class="btn s" type="button" onclick="showFormLigne(\'' + escD(l.id) + '\')">Modifier</button> ' +
    '<button class="btn s d" type="button" onclick="removeLigne(\'' + escD(l.id) + '\')">Supprimer</button></td></tr>'
  ).join('') +
    '<tr class="pr-total"><td colspan="5">Total matières et fournitures (1 pièce)</td><td>' + moneyD(coutMatieres(list)) + '</td><td></td></tr>'
    : '<tr><td colspan="7" class="at-empty">Aucune ligne. Cliquez sur « + Ajouter une ligne » ou importez la fiche matières d’un modèle.</td></tr>';

  // modèles de la fiche matières (onglet Production) pour l'import
  const mods = (typeof MODELES !== 'undefined' ? MODELES : []);
  $d('#pd-import-modele').innerHTML = mods.length
    ? mods.map(m => '<option value="' + escD(m.id) + '"' + (String(m.id) === String(p.modele_id) ? ' selected' : '') + '>' + escD(m.nom) + '</option>').join('')
    : '<option value="">— Aucun modèle (onglet Production) —</option>';
}

let moAutoKey = '';       // produit + jour + charges fixes déjà calculés automatiquement
function renderMoForm(p) {
  // Calcul AUTOMATIQUE d'après le pointage et les charges fixes du jour de référence :
  // produit pas encore calculé → champs remplis ; déjà enregistré → on signale seulement un écart.
  // Le formulaire n'est réinitialisé que si le produit, le jour ou les charges fixes ont changé :
  // un simple réaffichage ne doit pas effacer la saisie en cours ni l'explication.
  const date = p.mo_date || isoD(new Date());
  const key = p.id + '|' + date + '|' + (window.ChargesAPI ? ChargesAPI.signature() : '');
  if (key === moAutoKey) { renderMoResultat(); return; }
  moAutoKey = key;
  $d('#pd-mo-date').value = date;
  $d('#pd-mo-sal').value = Number(p.mo_salaires) ? p.mo_salaires : '';
  $d('#pd-mo-ch').value = Number(p.mo_charges) ? p.mo_charges : '';
  $d('#pd-mo-pcs').value = Number(p.mo_pieces) ? p.mo_pieces : '';
  $d('#pd-mo-hint').textContent = '';
  renderMoResultat();
  calculerMo(Number(p.mo_pieces) ? 'verif' : 'auto');
}

/* Résultat de la main d'œuvre d'après les champs (avant enregistrement) */
function renderMoResultat() {
  const v = moValeurs(), mo = moUnitaire(v);
  $d('#pd-mo-res').innerHTML = v.pcs > 0
    ? '<div class="pd-formule">(' + moneyD(v.sal) + ' salaires + ' + moneyD(v.ch) + ' charges fixes) ÷ ' + numD(v.pcs, 0) + ' pièces</div>' +
      '<div class="pd-mo-val">Main d’œuvre d’une pièce : <b>' + moneyD(mo) + '</b></div>'
    : '<div class="pd-formule">Main d’œuvre d’une pièce = (salaires de tous les employés du jour + charges fixes du jour) ÷ pièces fabriquées le même jour</div>' +
      '<div class="pd-mo-val" style="color:var(--mut)">Indiquez le nombre de pièces fabriquées ce jour-là.</div>';
  const p = produitCourant();
  const modif = p && (v.date !== (p.mo_date || v.date) || r2D(v.sal) !== r2D(p.mo_salaires) || r2D(v.ch) !== r2D(p.mo_charges) || v.pcs !== Number(p.mo_pieces || 0));
  $d('#pd-mo-save').classList.toggle('p', !!modif);
  $d('#pd-mo-save').textContent = modif ? 'Enregistrer la main d’œuvre *' : 'Enregistrer la main d’œuvre';
}

function renderCout() {
  const p = produitCourant(), r = recap(p);
  $d('#pd-stats').innerHTML =
    '<div class="at-stat"><span>Matières et fournitures</span><b>' + moneyD(r.mat) + '</b><small style="color:var(--mut)">' + r.list.length + ' ligne' + (r.list.length > 1 ? 's' : '') + '</small></div>' +
    '<div class="at-stat"><span>Main d’œuvre</span><b>' + moneyD(r.mo) + '</b><small style="color:var(--mut)">' +
      (Number(p.mo_pieces) ? 'Jour de référence : ' + fdD(p.mo_date) : 'Non renseignée') + '</small></div>' +
    '<div class="at-stat pd-total"><span>Coût de revient d’une pièce</span><b>' + moneyD(r.total) + '</b></div>';

  const pct = v => r.total ? Math.round(v / r.total * 1000) / 10 : 0;
  $d('#pd-cout-body').innerHTML =
    r.cats.map(c => '<tr><td>' + escD(c.lbl) + '</td><td>' + moneyD(c.v) + '</td><td>' + numD(pct(c.v), 1) + ' %</td></tr>').join('') +
    '<tr><td>Main d’œuvre</td><td>' + moneyD(r.mo) + '</td><td>' + numD(pct(r.mo), 1) + ' %</td></tr>' +
    '<tr class="pr-total"><td>Coût de revient d’une pièce</td><td>' + moneyD(r.total) + '</td><td>100 %</td></tr>';

  const N = Math.max(0, Math.floor(Number($d('#pd-qte').value) || 0));
  $d('#pd-qte-res').innerHTML = N
    ? 'Coût total pour <b>' + numD(N, 0) + '</b> pièces : <b>' + moneyD(r.total * N) + '</b> ' +
      '<span style="color:var(--mut)">(matières ' + moneyD(r.mat * N) + ' + main d’œuvre ' + moneyD(r.mo * N) + ')</span>'
    : '';
  if (!Number(p.mo_pieces)) $d('#pd-qte-res').innerHTML += '<div style="color:#b26a00;margin-top:6px">⚠ Main d’œuvre non renseignée : le coût de revient est incomplet.</div>';
}

/* Tableau comparatif de tous les produits */
function renderComparatif() {
  const body = $d('#pd-comp-body');
  body.innerHTML = PRODUITS.length ? PRODUITS.map(p => {
    const r = recap(p);
    return '<tr' + (String(p.id) === String(selProduit) ? ' class="pd-sel"' : '') + '><td><b>' + escD(p.nom) + '</b></td>' +
      '<td>' + moneyD(r.mat) + '</td><td>' + (Number(p.mo_pieces) ? moneyD(r.mo) : '—') + '</td>' +
      '<td><b>' + moneyD(r.total) + '</b></td>' +
      '<td class="emp-act"><button class="btn s" type="button" onclick="choisirProduit(\'' + escD(p.id) + '\')">Voir</button></td></tr>';
  }).join('') : '<tr><td colspan="5" class="at-empty">Aucun produit.</td></tr>';
}

function choisirProduit(id) {
  selProduit = id; cancelFormLigne(); renderProduits();
  $d('#pd-main').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* ---------- Produits ---------- */
function showFormProduit(edit) {
  editProduit = !!edit;
  const p = edit ? produitCourant() : null;
  $d('#pd-pform-title').textContent = p ? 'Modifier le produit' : 'Nouveau produit';
  $d('#pd-pnom').value = p ? p.nom : '';
  $d('#pd-pdesc').value = p ? (p.description || '') : '';
  $d('#pd-pform').style.display = 'block';
  $d('#pd-pform').scrollIntoView({ behavior: 'smooth', block: 'start' });
  $d('#pd-pnom').focus();
}
function cancelFormProduit() { editProduit = false; $d('#pd-pform').style.display = 'none'; }

async function saveProduit() {
  const nom = $d('#pd-pnom').value.trim(), description = $d('#pd-pdesc').value.trim();
  if (!nom) { toastD('Le nom du produit est obligatoire.'); return; }
  const res = editProduit
    ? await sb.from('produits').update({ nom, description }).eq('id', selProduit).select()
    : await sb.from('produits').insert([{ nom, description, mo_date: isoD(new Date()) }]).select();
  if (res.error) { toastD('Erreur : ' + errMsgD(res.error)); return; }
  const wasEdit = editProduit;
  if (!wasEdit && res.data && res.data[0]) selProduit = res.data[0].id;
  toastD(wasEdit ? 'Produit modifié.' : 'Produit créé : ajoutez maintenant le coût de ses éléments.');
  cancelFormProduit();
  await loadProduits();
  if (!wasEdit) showFormLigne();
}

async function duplicateProduit() {
  const p = produitCourant(); if (!p) return;
  const nom = (prompt('Nom du nouveau produit :', p.nom + ' (copie)') || '').trim();
  if (!nom) return;
  const r = await sb.from('produits').insert([{
    nom, description: p.description || '', modele_id: p.modele_id || null,
    mo_date: p.mo_date, mo_salaires: p.mo_salaires, mo_charges: p.mo_charges, mo_pieces: p.mo_pieces
  }]).select();
  if (r.error || !r.data || !r.data[0]) { toastD('Erreur : ' + errMsgD(r.error || { message: 'création impossible' })); return; }
  const rows = lignesDe(p.id).map((l, i) => ({
    produit_id: r.data[0].id, categorie: l.categorie, designation: l.designation, unite: l.unite, quantite: l.quantite,
    prix_unitaire: l.prix_unitaire, perte_pct: l.perte_pct, note: l.note || '', ordre: i + 1, article_id: l.article_id || null
  }));
  if (rows.length) {
    const r2 = await sb.from('produit_lignes').insert(rows);
    if (r2.error) toastD('Produit créé, mais copie des lignes impossible : ' + errMsgD(r2.error));
  }
  selProduit = r.data[0].id;
  toastD('Produit dupliqué.');
  await loadProduits();
}

async function removeProduit() {
  const p = produitCourant(); if (!p) return;
  const n = lignesDe(p.id).length;
  if (!confirm('Supprimer le produit « ' + p.nom + ' » et ses ' + n + ' ligne(s) de coût ?')) return;
  const { error } = await sb.from('produits').delete().eq('id', p.id);
  if (error) { toastD('Erreur : ' + errMsgD(error)); return; }
  ignorerModele(p);                                 // supprimé volontairement : ne pas le recréer depuis la fiche matières
  selProduit = null;
  toastD('Produit supprimé.');
  await loadProduits();
}

/* Exemple : sac à dos (prix à remplacer par vos vrais prix) */
async function createExempleProduit() {
  const r = await sb.from('produits').insert([{
    nom: 'Sac à dos', description: 'Exemple : remplacez les prix par vos vrais prix d’achat.', mo_date: isoD(new Date())
  }]).select();
  if (r.error || !r.data || !r.data[0]) { toastD('Erreur : ' + errMsgD(r.error || { message: 'création impossible' })); return; }
  const id = r.data[0].id;
  const items = [
    ['Matière', 'Kawi bébé', 'm', 0.5, 0], ['Doublure', 'Doublure polyester', 'm', 0.4, 0],
    ['Sangle', 'Sangle', 'pcs', 3, 0], ['Curseur', 'Curseur', 'pcs', 2, 0],
    ['Emballage', 'Sachet + étiquette', 'pcs', 1, 0], ['Autre outil', 'Fil', 'bobine', 0.05, 0]
  ].map((x, i) => ({ produit_id: id, categorie: x[0], designation: x[1], unite: x[2], quantite: x[3], prix_unitaire: x[4], perte_pct: 0, note: '', ordre: i + 1 }));
  const r2 = await sb.from('produit_lignes').insert(items);
  if (r2.error) toastD('Erreur : ' + errMsgD(r2.error));
  selProduit = id;
  await loadProduits();
  toastD('Exemple créé : cliquez sur « Modifier » pour saisir le prix de chaque élément.');
}

/* ---------- Lignes de coût ---------- */
function majExempleCat(changeUnite) {
  const c = CATS_D.find(x => x.k === $d('#pd-lcat').value);
  $d('#pd-ldes').placeholder = c ? c.ex : '';
  // nouvelle ligne saisie à la main : l'unité habituelle de la catégorie est proposée (m, pcs, bobine…)
  if (changeUnite === true && c && !curLigne && !$d('#pd-lart').value) $d('#pd-lunite').value = c.u;
}

function showFormLigne(id) {
  if (!produitCourant()) return;
  curLigne = id || null;
  const l = id ? LIGNES.find(x => String(x.id) === String(id)) : null;
  $d('#pd-lform-title').textContent = l ? 'Modifier la ligne' : 'Nouvelle ligne de coût';
  if (window.StockAPI) StockAPI.fillSelect($d('#pd-lart'), l ? l.article_id : '', '— Aucun (prix saisi à la main) —');
  $d('#pd-lcat').value = l ? (CATS_D.some(c => c.k === l.categorie) ? l.categorie : 'Autre outil') : CATS_D[0].k;
  $d('#pd-ldes').value = l ? l.designation : '';
  $d('#pd-lunite').value = l ? l.unite : CATS_D[0].u;
  $d('#pd-lqte').value = l ? l.quantite : '';
  $d('#pd-lprix').value = l ? (articleLigne(l) ? r2D(prixLigne(l) * 10000) / 10000 : l.prix_unitaire) : '';
  $d('#pd-lperte').value = l ? (Number(l.perte_pct) || '') : '';
  $d('#pd-lnote').value = l ? (l.note || '') : '';
  $d('#pd-lsubmit').textContent = l ? 'Enregistrer les modifications' : 'Ajouter la ligne';
  $d('#pd-lsync').checked = true; autoLie = false;
  majExempleCat();
  majLienStock(false);
  fillNomsStock(); majLienParNom();
  majApercuLigne();
  $d('#pd-lform').style.display = 'block';
  $d('#pd-lform').scrollIntoView({ behavior: 'smooth', block: 'center' });
  $d(l ? '#pd-lprix' : '#pd-ldes').focus();
}
/* Article du stock choisi : catégorie, désignation, unité et PRIX reprennent ceux du stock */
function majLienStock(applique) {
  const a = window.StockAPI ? StockAPI.byId($d('#pd-lart').value) : null;
  const prix = $d('#pd-lprix');
  prix.readOnly = !!a; prix.required = !a;
  prix.style.background = a ? 'var(--nb)' : '';
  if (!a) { if (applique) prix.value = ''; return; }
  if (applique) {
    $d('#pd-lcat').value = CAT_STOCK_VERS_PRODUIT[a.categorie] || 'Autre outil';
    $d('#pd-ldes').value = a.nom; $d('#pd-lunite').value = a.unite; majExempleCat();
  }
  const p = StockAPI.priceFor(a, $d('#pd-lunite').value);
  prix.value = p == null ? '' : Math.round(p * 10000) / 10000;
}
/* Suggestions de noms : les articles du Stock de la catégorie choisie */
function fillNomsStock() {
  const sc = CAT_PRODUIT_VERS_STOCK[$d('#pd-lcat').value];
  const list = window.StockAPI ? StockAPI.list().filter(a => !sc || a.categorie === sc) : [];
  $d('#pd-noms-stock').innerHTML = list.map(a => '<option value="' + escD(a.nom) + '">').join('');
}
/* Le nom saisi existe dans le Stock → lien automatique (prix repris) ; sinon il sera créé dans le Stock */
function majLienParNom() {
  const row = $d('#pd-lstock'), wrap = $d('#pd-lsync-wrap');
  if (!window.StockAPI) { wrap.style.display = 'none'; row.textContent = ''; return; }
  const cat = $d('#pd-lcat').value, sc = CAT_PRODUIT_VERS_STOCK[cat];
  wrap.style.display = sc ? '' : 'none';
  const choisiMain = $d('#pd-lart').value && !autoLie;               // article choisi à la main dans la liste
  if (!sc) { if (autoLie) { $d('#pd-lart').value = ''; autoLie = false; majLienStock(false); } row.textContent = 'Prestation : pas de stock, le prix se saisit ici.'; return; }
  if (choisiMain) { row.textContent = '✔ Lié à l’article du Stock choisi : son prix est repris automatiquement.'; return; }
  const nom = $d('#pd-ldes').value.trim(), sync = $d('#pd-lsync').checked;
  const a = nom && sync ? StockAPI.find(nom, sc) : null;
  if (a) {
    $d('#pd-lart').value = a.id; autoLie = true; majLienStock(false);
    row.innerHTML = '✔ « ' + escD(a.nom) + ' » existe dans le Stock (' + escD(a.categorie) + ') : lié, prix repris du Stock.';
  } else {
    if (autoLie) { $d('#pd-lart').value = ''; autoLie = false; majLienStock(false); }
    row.innerHTML = nom && sync ? '➕ « ' + escD(nom) + ' » n’existe pas encore : il sera <b>ajouté au Stock</b> (' + escD(sc) + ') et visible dans toute la plateforme.' : '';
  }
  majApercuLigne();
}
function cancelFormLigne() { curLigne = null; $d('#pd-lform').style.display = 'none'; }

/* Aperçu du coût de la ligne pendant la saisie */
function majApercuLigne() {
  const l = {
    quantite: parseFloat($d('#pd-lqte').value) || 0, prix_unitaire: parseFloat($d('#pd-lprix').value) || 0,
    perte_pct: parseFloat($d('#pd-lperte').value) || 0
  };
  const u = $d('#pd-lunite').value;
  $d('#pd-lhint').textContent = l.quantite && l.prix_unitaire
    ? 'Coût pour 1 pièce : ' + numD(l.quantite, 4) + ' ' + u + (l.perte_pct ? ' (+ ' + numD(l.perte_pct, 2) + ' % de chute)' : '') +
      ' × ' + numD(l.prix_unitaire, 2) + ' DA = ' + moneyD(coutLigne(l))
    : '';
}

async function saveLigne() {
  const p = produitCourant(); if (!p) return;
  const categorie = $d('#pd-lcat').value;
  const designation = $d('#pd-ldes').value.trim() || catLbl(categorie);
  const unite = $d('#pd-lunite').value;
  const quantite = parseFloat($d('#pd-lqte').value);
  let art = window.StockAPI ? StockAPI.byId($d('#pd-lart').value) : null;
  const sc = CAT_PRODUIT_VERS_STOCK[categorie], sync = !!(window.StockAPI && sc && $d('#pd-lsync').checked && !art);
  if (sync && $d('#pd-ldes').value.trim()) art = StockAPI.find(designation, sc);          // le nom existe déjà dans le Stock
  if (art && StockAPI.priceFor(art, unite) == null) { toastD('Unité « ' + unite + ' » incompatible avec l’article « ' + art.nom + ' » (' + art.unite + ').'); return; }
  const prix = art ? StockAPI.priceFor(art, unite) : parseFloat($d('#pd-lprix').value);
  const perte = parseFloat($d('#pd-lperte').value) || 0;
  const note = $d('#pd-lnote').value.trim();
  if (!(quantite > 0)) { toastD('La quantité pour une pièce doit être supérieure à 0.'); return; }
  if (!(prix >= 0)) { toastD('Indiquez le prix unitaire (0 si inconnu pour le moment).'); return; }
  if (perte < 0 || perte > 100) { toastD('La chute doit être entre 0 et 100 %.'); return; }

  // Nom inconnu du Stock : l'article y est créé (même catégorie, même unité, même prix) et partagé partout
  let cree = false;
  if (!art && sync && $d('#pd-ldes').value.trim()) {
    const cr = await StockAPI.create({ categorie: sc, nom: designation, unite, cond_nom: '', cond_qte: 0, prix_achat: Math.round(prix * 10000) / 10000,
      seuil_alerte: 0, note: 'Créé depuis le produit « ' + p.nom + ' »' });
    if (cr.error) toastD('Ligne enregistrée, mais l’article n’a pas pu être ajouté au Stock : ' + (/does not exist|schema cache|Could not find/i.test(cr.error.message || '') ? 'exécutez supabase/stock.sql' : cr.error.message));
    else { art = cr.article; cree = true; }
  }
  const payload = { categorie, designation: art ? art.nom : designation, unite, quantite, prix_unitaire: Math.round(prix * 10000) / 10000, perte_pct: perte, note, article_id: art ? art.id : null };
  let res;
  if (curLigne) res = await sb.from('produit_lignes').update(payload).eq('id', curLigne).select();
  else {
    const ordre = lignesDe(p.id).reduce((mx, l) => Math.max(mx, Number(l.ordre) || 0), 0) + 1;
    res = await sb.from('produit_lignes').insert([{ ...payload, produit_id: p.id, ordre }]).select();
  }
  if (res.error) { toastD('Erreur : ' + errMsgD(res.error)); return; }

  const wasEdit = !!curLigne;
  toastD((wasEdit ? 'Ligne modifiée.' : 'Ligne ajoutée.') + (cree ? ' « ' + art.nom + ' » a été ajouté au Stock.' : (art ? ' Lié au Stock.' : '')));
  if (wasEdit) cancelFormLigne();
  else {
    ['#pd-ldes', '#pd-lqte', '#pd-lprix', '#pd-lperte', '#pd-lnote'].forEach(s => { $d(s).value = ''; });
    $d('#pd-lart').value = ''; autoLie = false; majLienStock(false);
    $d('#pd-lhint').textContent = '';
    // passe à la catégorie suivante pour enchaîner la saisie
    const i = CATS_D.findIndex(c => c.k === categorie);
    if (i >= 0 && i < CATS_D.length - 1) { $d('#pd-lcat').value = CATS_D[i + 1].k; majExempleCat(true); }
    $d('#pd-ldes').focus();
  }
  await loadProduits();
}

async function removeLigne(id) {
  const l = LIGNES.find(x => String(x.id) === String(id));
  if (!l || !confirm('Supprimer « ' + l.designation + ' » de ce produit ?')) return;
  const { error } = await sb.from('produit_lignes').delete().eq('id', id);
  if (error) { toastD('Erreur : ' + errMsgD(error)); return; }
  if (String(curLigne) === String(id)) cancelFormLigne();
  toastD('Ligne supprimée.');
  await loadProduits();
}

/* Import depuis la fiche matières (onglet Production) : quantités et chutes reprises, prix à compléter */
function devinerCat(nom) {
  const n = String(nom || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  if (/doubl/.test(n)) return 'Doublure';
  if (/sangl|songl/.test(n)) return 'Sangle';
  if (/curs|kiss/.test(n)) return 'Curseur';
  if (/fermeture|zip|eclair/.test(n)) return 'Fermeture';
  if (/eponge|mousse|bourre|molleton/.test(n)) return 'Éponge';
  if (/poign|anse/.test(n)) return 'Poignée';
  if (/boucle|mousqueton|anneau|attache|rivet/.test(n)) return 'Boucle';
  if (/\bfil\b|bobine/.test(n)) return 'Fil';
  if (/etiquet|logo|patch|marque/.test(n)) return 'Étiquette';
  if (/emball|sachet|carton|boite/.test(n)) return 'Emballage';
  if (/finition|assembl|repass|finisseur/.test(n)) return 'Finition';
  if (/broder|impress|serigraph/.test(n)) return 'Broderie';
  if (/transport|livraison/.test(n)) return 'Transport';
  if (/tissu|matiere|kawi|cuir|simili|toile|nylon|sky|oyster|loyster/.test(n)) return 'Matière';
  return 'Autre outil';
}

/* Synchronise TOUTES les lignes déjà saisies (tous les produits) avec le Stock :
   - nom déjà dans le Stock → la ligne s'y lie ; sinon l'article est créé dans le Stock
   - une ligne dont le prix diffère de celui du Stock garde son prix (elle n'est pas liée, pour ne rien changer à vos coûts) */
async function synchroniserProduitsStock() {
  if (!window.StockAPI) { toastD('Module Stock non chargé.'); return; }
  await StockAPI.load();
  // la ligne générique « Autres outils / fournitures » n'est pas une matière : elle reste saisie à la main
  const generique = StockAPI.norm(catLbl('Autre outil'));
  const cand = LIGNES.filter(l => !l.article_id && CAT_PRODUIT_VERS_STOCK[l.categorie] && String(l.designation || '').trim() && StockAPI.norm(l.designation) !== generique);
  if (!cand.length) { toastD('Toutes les lignes sont déjà synchronisées avec le Stock.'); return; }
  const near = (a, b) => Math.abs((Number(a) || 0) - (Number(b) || 0)) < 0.01;
  const groups = {};
  cand.forEach(l => { const sc = CAT_PRODUIT_VERS_STOCK[l.categorie], k = sc + '|' + StockAPI.norm(l.designation); (groups[k] = groups[k] || { sc, lignes: [] }).lignes.push(l); });
  const creer = [], lier = [], gardees = [], prixMaj = [];
  Object.values(groups).forEach(g => {
    const ref = g.lignes[0];
    let a = StockAPI.find(ref.designation, g.sc);
    if (!a) { creer.push({ g, row: { categorie: g.sc, nom: String(ref.designation).trim(), unite: ref.unite, cond_nom: '', cond_qte: 0, prix_achat: Number(ref.prix_unitaire) || 0, seuil_alerte: 0, note: 'Créé depuis Produits' } }); return; }
    g.lignes.forEach(l => {
      const pa = StockAPI.priceFor(a, l.unite);
      if (pa == null) { gardees.push(l.designation + ' (unité ' + l.unite + ' ≠ ' + a.unite + ')'); return; }
      if (pa === 0 && Number(l.prix_unitaire) > 0 && !prixMaj.some(x => x.a.id === a.id)) { prixMaj.push({ a, l }); lier.push({ l, a }); return; }
      if (near(pa, l.prix_unitaire)) lier.push({ l, a }); else gardees.push(l.designation + ' (' + numD(l.prix_unitaire, 2) + ' DA ≠ stock ' + numD(pa, 2) + ' DA)');
    });
  });
  // lignes d'un même nouveau article dont le prix diffère : gardées telles quelles
  const apresCreation = [];
  creer.forEach(c => c.g.lignes.forEach(l => {
    if (near(l.prix_unitaire, c.row.prix_achat) && l.unite === c.row.unite) apresCreation.push({ l, c });
    else gardees.push(l.designation + ' (' + numD(l.prix_unitaire, 2) + ' DA ≠ ' + numD(c.row.prix_achat, 2) + ' DA)');
  }));
  const total = lier.length + apresCreation.length;
  if (!creer.length && !total) { toastD('Rien à synchroniser : les prix des lignes diffèrent de ceux du Stock (elles gardent leur prix).'); return; }
  const msg = 'Synchroniser les produits avec le Stock ?\n\n' +
    (creer.length ? '➕ ' + creer.length + ' article(s) à créer dans le Stock :\n' + creer.map(c => '   • ' + c.row.nom + ' (' + c.row.categorie + ', ' + numD(c.row.prix_achat, 2) + ' DA / ' + c.row.unite + ')').join('\n') + '\n\n' : '') +
    '🔗 ' + total + ' ligne(s) liée(s) au Stock : leur prix suivra celui du Stock.\n' +
    (prixMaj.length ? '💲 Prix d’achat repris pour : ' + prixMaj.map(x => x.a.nom).join(', ') + '\n' : '') +
    (gardees.length ? '\n⚠ ' + gardees.length + ' ligne(s) gardent leur prix saisi (non liées) :\n   • ' + gardees.slice(0, 8).join('\n   • ') + (gardees.length > 8 ? '\n   • …' : '') + '\n' : '') +
    '\nAucun prix ni aucune quantité n’est modifié dans vos produits.';
  if (!confirm(msg)) return;
  let nouveaux = [];
  if (creer.length) {
    const cr = await StockAPI.create(creer.map(c => c.row));
    if (cr.error) { toastD('Erreur : ' + errMsgD(cr.error)); return; }
    nouveaux = cr.articles;
  }
  const liens = lier.map(x => ({ id: x.l.id, article_id: x.a.id, nom: x.a.nom }));
  apresCreation.forEach(x => { const a = nouveaux.find(n => StockAPI.norm(n.nom) === StockAPI.norm(x.c.row.nom) && n.categorie === x.c.row.categorie); if (a) liens.push({ id: x.l.id, article_id: a.id, nom: a.nom }); });
  for (const m of prixMaj) {
    const pu = m.a.cond_qte > 0 && m.a.cond_nom ? Number(m.l.prix_unitaire) * StockAPI.condQte(m.a) : Number(m.l.prix_unitaire);
    await StockAPI.setPrix(m.a.id, Math.round(pu * 100) / 100);
  }
  for (const x of liens) {
    const r = await sb.from('produit_lignes').update({ article_id: x.article_id, designation: x.nom }).eq('id', x.id);
    if (r.error) { toastD('Erreur : ' + errMsgD(r.error)); return; }
  }
  toastD('Synchronisé : ' + creer.length + ' article(s) créé(s) dans le Stock, ' + liens.length + ' ligne(s) liée(s).');
  await loadProduits();
}

/* Range les lignes « Autres outils » dans les bonnes catégories d'après leur désignation
   (ex : « Fermeture éclair » → Fermeture, « Étiquette » → Étiquette) */
async function reclasserLignes() {
  const p = produitCourant(); if (!p) return;
  const aChanger = lignesDe(p.id).filter(l => (l.categorie === 'Autre outil' || !CATS_D.some(c => c.k === l.categorie)) && devinerCat(l.designation) !== 'Autre outil');
  if (!aChanger.length) { toastD('Aucune ligne à ranger : les « Autres outils » ne correspondent à aucune catégorie connue.'); return; }
  if (!confirm('Ranger ' + aChanger.length + ' ligne(s) dans leur catégorie ?\n\n' + aChanger.map(l => '• ' + l.designation + ' → ' + catLbl(devinerCat(l.designation))).join('\n') + '\n\nLes prix et les quantités ne changent pas.')) return;
  for (const l of aChanger) {
    const r = await sb.from('produit_lignes').update({ categorie: devinerCat(l.designation) }).eq('id', l.id);
    if (r.error) { toastD('Erreur : ' + errMsgD(r.error)); return; }
  }
  toastD(aChanger.length + ' ligne(s) rangée(s).');
  await loadProduits();
}

async function importerFiche() {
  const p = produitCourant(); if (!p) return;
  const mid = $d('#pd-import-modele').value;
  if (!mid) { toastD('Créez d’abord un modèle dans l’onglet Production.'); return; }
  const c = await sb.from('composants').select('*').eq('modele_id', mid).order('ordre', { ascending: true });
  if (c.error) { toastD('Erreur : ' + errMsgD(c.error)); return; }
  const comps = c.data || [];
  if (!comps.length) { toastD('Ce modèle n’a aucun composant.'); return; }
  const existants = lignesDe(p.id).map(l => l.designation.trim().toLowerCase());
  const nouveaux = comps.filter(x => !existants.includes(String(x.nom).trim().toLowerCase()));
  if (!nouveaux.length) { toastD('Tous les composants de ce modèle sont déjà dans le produit.'); return; }
  const nbLies = nouveaux.filter(x => x.article_id && window.StockAPI && StockAPI.byId(x.article_id)).length;
  if (!confirm('Importer ' + nouveaux.length + ' composant(s) de la fiche matières ?\n' +
      (nbLies ? nbLies + ' lié(s) au stock : leur prix sera repris automatiquement.\n' : '') +
      (nouveaux.length - nbLies ? (nouveaux.length - nbLies) + ' non lié(s) : il faudra saisir leur prix.' : ''))) return;
  let ordre = lignesDe(p.id).reduce((mx, l) => Math.max(mx, Number(l.ordre) || 0), 0);
  const rows = nouveaux.map(x => {
    // finition extérieure de la fiche matières : ligne « Finition » avec le prix payé par pièce
    if (x.type === 'finition') return { produit_id: p.id, categorie: 'Finition', designation: x.nom, unite: 'pcs', quantite: x.quantite,
      prix_unitaire: Number(x.prix_unitaire) || 0, perte_pct: 0, note: x.note || '', ordre: ++ordre, article_id: null };
    const a = x.article_id && window.StockAPI ? StockAPI.byId(x.article_id) : null;
    const prix = a ? StockAPI.priceFor(a, x.unite) : null;
    return {
      produit_id: p.id, categorie: a ? (CAT_STOCK_VERS_PRODUIT[a.categorie] || 'Autre outil') : devinerCat(x.nom), designation: x.nom, unite: x.unite || 'pcs',
      quantite: x.quantite, prix_unitaire: prix != null ? Math.round(prix * 10000) / 10000 : 0, perte_pct: x.perte_pct || 0, note: x.note || '', ordre: ++ordre,
      article_id: a && prix != null ? a.id : null
    };
  });
  const r = await sb.from('produit_lignes').insert(rows);
  if (r.error) { toastD('Erreur : ' + errMsgD(r.error)); return; }
  await sb.from('produits').update({ modele_id: mid }).eq('id', p.id);
  const sansPrix = rows.filter(r => !r.article_id && r.categorie !== 'Finition').length;
  toastD(rows.length + ' ligne(s) importée(s)' + (sansPrix ? ' : cliquez sur « Modifier » pour saisir le prix des ' + sansPrix + ' non liée(s) au stock.' : ' : prix repris du stock.'));
  await loadProduits();
}

/* ---------- Main d'œuvre : calcul automatique du jour ---------- */
/* Salaires du jour = gain de TOUS les employés pointés ce jour-là (comme l'onglet Employés).
   Charges fixes du jour = charges fixes de l'onglet Charges (dîner, loyer, électricité…) applicables à cette date.
   Les charges VARIABLES saisies ce jour-là n'entrent pas dans la main d'œuvre. */
/* mode : 'bouton' = clic sur « Calculer » (remplit, explique, passe aux pièces)
           'auto'   = remplit les champs sans bouger (changement de jour, produit pas encore calculé)
           'verif'  = ne change rien : signale seulement si les valeurs enregistrées diffèrent du calcul actuel */
async function calculerMo(mode) {
  mode = mode || 'bouton';
  const date = $d('#pd-mo-date').value;
  if (!date) { if (mode === 'bouton') toastD('Choisissez le jour de référence.'); return; }
  const hint = $d('#pd-mo-hint');
  if (mode !== 'verif') hint.textContent = 'Calcul automatique en cours…';

  // 1) Salaires d'après le pointage
  let sal = null, nEmp = 0;
  const pt = await sb.from('pointages').select('*').eq('date_pointage', date);
  if (!pt.error && typeof gainPointage === 'function' && typeof hrs === 'function') {
    let emps = (typeof EMPLOYES !== 'undefined' && EMPLOYES.length) ? EMPLOYES : null;
    if (!emps) { const e = await sb.from('employes').select('*'); emps = e.error ? [] : (e.data || []); }
    let t = 0;
    (pt.data || []).forEach(p => {
      const e = emps.find(x => String(x.id) === String(p.employe_id));
      if (!e || hrs(p) <= 0) return;
      nEmp++; t += gainPointage(p, e);
    });
    if (nEmp) sal = r2D(t);
  }

  // 2) Charges FIXES du jour (réglées une seule fois dans l'onglet Charges)
  const ch = await sb.from('charges').select('*').eq('date_charge', date);
  const fx = window.ChargesAPI ? await ChargesAPI.fixesDuJour(date) : { total: 0, lignes: [], exclues: [], travaille: false, installee: false, nbDefinies: 0 };
  if ($d('#pd-mo-date').value !== date) return;      // la date a changé pendant le calcul
  const charges = ch.error ? [] : (ch.data || []);
  const paieSaisie = r2D(charges.filter(c => c.categorie === CAT_PAIE_D).reduce((s, c) => s + Number(c.montant || 0), 0));
  const variables = r2D(charges.filter(c => c.categorie !== CAT_PAIE_D).reduce((s, c) => s + Number(c.montant || 0), 0));   // information : non comptées
  const totAutres = r2D(fx.total);

  let srcSal;
  if (sal !== null) srcSal = 'salaires calculés d’après le pointage de ' + nEmp + ' employé' + (nEmp > 1 ? 's' : '');
  else if (paieSaisie > 0) { sal = paieSaisie; srcSal = 'salaires repris de la charge « Paie des employés » du jour'; }
  else { sal = 0; srcSal = 'aucun pointage ni paie enregistré ce jour-là : saisissez les salaires à la main'; }

  // Explication des charges fixes : celles qui comptent, et celles qui ne s'appliquent pas (avec la raison)
  const exclues = (fx.exclues || []).map(x => escD(x.f.libelle) + ' (' + escD(x.raison) + ')');
  let detailCh;
  if (fx.erreur) detailCh = 'charges fixes indisponibles (' + escD(fx.erreur) + ')';
  else if (!fx.nbDefinies) detailCh = 'aucune charge fixe définie : saisissez-les une seule fois dans Charges › « Charges fixes de chaque jour »';
  else {
    detailCh = fx.lignes.length ? fx.lignes.map(f => escD(f.libelle) + ' ' + moneyD(f.montant)).join(', ') : 'aucune applicable ce jour-là';
    if (exclues.length) detailCh += ' <span style="color:#b26a00">— non comptées : ' + exclues.join(', ') + (exclues.some(e => /commence le/.test(e)) ? '. Pour qu’elles s’appliquent aussi à ce jour, videz « À partir du » dans Charges › Modifier' : '') + '</span>';
  }

  const texte = fdD(date) + ' : ' + srcSal + ' → <b>' + moneyD(sal) + '</b> ; charges fixes : ' + detailCh + ' → <b>' + moneyD(totAutres) + '</b>' +
    (variables > 0 ? ' <i>(charges variables de ' + moneyD(variables) + ' non comptées)</i>' : '');

  if (mode === 'verif') {
    const cur = moValeurs();
    const diff = Math.abs(cur.sal - sal) > 0.01 || Math.abs(cur.ch - totAutres) > 0.01;
    hint.innerHTML = diff
      ? 'ℹ Calcul automatique actuel — ' + texte + '. <button type="button" class="btn s p" onclick="calculerMo(\'auto\')">Appliquer ces valeurs</button> (ensuite « Enregistrer »)'
      : (exclues.length ? '⚠ ' : '✔ Valeurs à jour : ') + texte;
    return;
  }
  $d('#pd-mo-sal').value = sal || '';
  $d('#pd-mo-ch').value = totAutres || '';
  hint.innerHTML = (mode === 'auto' ? '⚙ Calculé automatiquement — ' : '') + texte + '. Indiquez les pièces fabriquées puis enregistrez.';
  renderMoResultat();
  if (mode === 'bouton') $d('#pd-mo-pcs').focus();
}

async function saveMo() {
  const p = produitCourant(); if (!p) return;
  const v = moValeurs();
  if (!v.date) { toastD('Choisissez le jour de référence.'); return; }
  if (v.pcs < 1) { toastD('Indiquez le nombre de pièces fabriquées ce jour-là.'); return; }
  const { error } = await sb.from('produits').update({ mo_date: v.date, mo_salaires: r2D(v.sal), mo_charges: r2D(v.ch), mo_pieces: v.pcs }).eq('id', p.id);
  if (error) { toastD('Erreur : ' + errMsgD(error)); return; }
  toastD('Main d’œuvre enregistrée : ' + moneyD(moUnitaire(v)) + ' par pièce.');
  await loadProduits();
}

/* ---------- Export Excel ---------- */
function exportProduit() {
  if (typeof XLSX === 'undefined') { toastD('Bibliothèque Excel non chargée.'); return; }
  const p = produitCourant(); if (!p) return;
  const r = recap(p);
  const aoa = [
    ['FICHE DE COÛT DE REVIENT — MARIA BAG'], ['Produit', p.nom], ['Description', p.description || ''], ['Date', fdD(isoD(new Date()))], [],
    ['Catégorie', 'Désignation', 'Unité', 'Qté pour 1 pièce', 'Chute (%)', 'Prix unitaire (DA)', 'Coût pour 1 pièce (DA)']
  ].concat(r.list.map(l => [catLbl(l.categorie), nomLigne(l), l.unite, Number(l.quantite), Number(l.perte_pct) || 0, r2D(prixLigne(l)), r2D(coutLigne(l))]))
    .concat([['Total matières et fournitures', '', '', '', '', '', r2D(r.mat)], [],
      ['MAIN D’ŒUVRE D’UNE PIÈCE'], ['Jour de référence', fdD(p.mo_date)], ['Salaires du jour (DA)', Number(p.mo_salaires || 0)],
      ['Charges fixes du jour (DA)', Number(p.mo_charges || 0)], ['Pièces fabriquées ce jour-là', Number(p.mo_pieces || 0)],
      ['Main d’œuvre par pièce (DA)', r2D(r.mo)], [],
      ['RÉCAPITULATIF', 'Coût pour 1 pièce (DA)']])
    .concat(r.cats.map(c => [c.lbl, r2D(c.v)]))
    .concat([['Main d’œuvre', r2D(r.mo)], ['COÛT DE REVIENT D’UNE PIÈCE', r2D(r.total)]]);
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = [{ wch: 30 }, { wch: 30 }, { wch: 9 }, { wch: 16 }, { wch: 10 }, { wch: 18 }, { wch: 22 }];
  const all = PRODUITS.map(x => { const t = recap(x); return {
    Produit: x.nom, 'Matières et fournitures (DA)': r2D(t.mat), "Main d'œuvre (DA)": r2D(t.mo), 'Coût de revient (DA)': r2D(t.total) }; });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Coût ' + p.nom.slice(0, 25).replace(/[\\\/\?\*\[\]:]/g, ' '));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(all), 'Tous les produits');
  XLSX.writeFile(wb, ('Cout_de_revient_' + p.nom).replace(/[^\w\-]+/g, '_') + '.xlsx');
}

/* ---------- Fiche PDF (téléchargement / partage) ---------- */
/* jsPDF n'a pas le « œ » : remplacé par « oe » avant le nettoyage du texte */
const txtD = v => { const t = String(v ?? '').replace(/œ/g, 'oe').replace(/Œ/g, 'OE'); return typeof pdfTxt === 'function' ? pdfTxt(t) : t; };

function creerPdfProduit(p) {
  if (!(window.jspdf && window.jspdf.jsPDF)) throw new Error('Bibliothèque PDF non chargée : vérifiez la connexion internet puis rechargez la page.');
  const doc = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4' });
  if (typeof doc.autoTable !== 'function') throw new Error('Module de tableaux PDF non chargé : vérifiez la connexion internet puis rechargez la page.');
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), M = 14;
  const r = recap(p), today = isoD(new Date());

  if (typeof LOGO_PDF !== 'undefined' && LOGO_PDF) doc.addImage(LOGO_PDF, 'PNG', M, 9, 22, 22);
  doc.setTextColor(0); doc.setFont('helvetica', 'bold'); doc.setFontSize(17);
  doc.text(txtD('FICHE DE COÛT DE REVIENT'), M + 26, 18);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(90);
  doc.text(txtD('Coût d\'une pièce avant production  |  MARIA BAG'), M + 26, 25);
  doc.setTextColor(0); doc.setFont('helvetica', 'bold'); doc.setFontSize(12);
  doc.text(txtD(fdD(today)), W - M, 17, { align: 'right' });
  doc.setDrawColor(0); doc.setLineWidth(0.8); doc.line(M, 34, W - M, 34);

  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(90); doc.text(txtD('Produit'), M, 43);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(0); doc.text(txtD(p.nom), M, 49);
  if (p.description) { doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(90); doc.text(txtD(p.description), M, 55); }

  doc.autoTable({
    startY: 61, margin: { left: M, right: M, bottom: 18 },
    head: [['Catégorie', 'Désignation', 'Qté / pièce', 'Chute', 'Prix unitaire', 'Coût / pièce'].map(txtD)],
    body: r.list.map(l => [catLbl(l.categorie), nomLigne(l), numD(l.quantite, 4) + ' ' + l.unite,
      Number(l.perte_pct) ? numD(l.perte_pct, 2) + ' %' : '-', numD(prixLigne(l), 2) + ' DA', moneyD(coutLigne(l))].map(txtD)),
    foot: [['', txtD('Total matières et fournitures'), '', '', '', txtD(moneyD(r.mat))]],
    theme: 'grid',
    styles: { font: 'helvetica', fontSize: 9.5, cellPadding: 2.5, textColor: 0, lineColor: 0, lineWidth: 0.2 },
    headStyles: { fillColor: [235, 235, 235], textColor: 0, fontStyle: 'bold' },
    footStyles: { fillColor: [245, 245, 245], textColor: 0, fontStyle: 'bold' },
    columnStyles: { 2: { halign: 'right' }, 3: { halign: 'center' }, 4: { halign: 'right' }, 5: { halign: 'right', fontStyle: 'bold' } }
  });

  let y = doc.lastAutoTable.finalY + 8;
  if (y > H - 95) { doc.addPage(); y = 20; }
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.text(txtD('Main d\'œuvre d\'une pièce'), M, y);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5);
  const moTxt = Number(p.mo_pieces)
    ? '(' + moneyD(p.mo_salaires) + ' salaires + ' + moneyD(p.mo_charges) + ' charges fixes du ' + fdD(p.mo_date) + ') / ' + numD(p.mo_pieces, 0) + ' pièces = ' + moneyD(r.mo)
    : 'Non renseignée';
  doc.text(txtD(moTxt), M, y + 6);

  doc.autoTable({
    startY: y + 11, margin: { left: M, right: M, bottom: 18 },
    head: [['Récapitulatif', 'Coût / pièce', 'Part'].map(txtD)],
    body: r.cats.map(c => [c.lbl, moneyD(c.v), (r.total ? numD(c.v / r.total * 100, 1) : '0') + ' %'].map(txtD))
      .concat([[txtD('Main d\'œuvre'), txtD(moneyD(r.mo)), txtD((r.total ? numD(r.mo / r.total * 100, 1) : '0') + ' %')]]),
    foot: [[txtD('COÛT DE REVIENT D\'UNE PIÈCE'), txtD(moneyD(r.total)), '100 %']],
    theme: 'grid', tableWidth: 120,
    styles: { font: 'helvetica', fontSize: 10, cellPadding: 2.5, textColor: 0, lineColor: 0, lineWidth: 0.2 },
    headStyles: { fillColor: [235, 235, 235], textColor: 0, fontStyle: 'bold' },
    footStyles: { fillColor: [0, 0, 0], textColor: 255, fontStyle: 'bold', fontSize: 11 },
    columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' } }
  });

  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i); doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(120);
    doc.text(txtD('MARIA BAG - Coût de revient ' + p.nom + ' - Page ' + i + '/' + n), W / 2, H - 8, { align: 'center' });
  }
  return { doc, name: ('Cout_de_revient_' + p.nom + '_' + today).replace(/[^\w\-]+/g, '_') + '.pdf' };
}

function telechargerPdfProduit() {
  const p = produitCourant(); if (!p) return;
  try { const r = creerPdfProduit(p); r.doc.save(r.name); toastD('PDF enregistré : ' + r.name); }
  catch (e) { toastD('Erreur PDF : ' + e.message); }
}

async function partagerPdfProduit() {
  const p = produitCourant(); if (!p) return;
  let r;
  try { r = creerPdfProduit(p); } catch (e) { toastD('Erreur PDF : ' + e.message); return; }
  const file = new File([r.doc.output('blob')], r.name, { type: 'application/pdf' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'Coût de revient - ' + p.nom, text: 'Coût de revient d’une pièce : ' + p.nom + ' = ' + moneyD(recap(p).total) });
      return;
    } catch (e) {
      if (e && e.name === 'AbortError') return;
    }
  }
  r.doc.save(r.name);
  toastD('Partage direct indisponible sur cet appareil : le PDF a été téléchargé.');
}

/* ---------- Initialisation et événements ---------- */
$d('#pd-lcat').innerHTML = CATS_D.map(c => '<option value="' + escD(c.k) + '">' + escD(c.lbl) + '</option>').join('');
$d('#pd-lunite').innerHTML = UNITES_D.map(u => '<option>' + u + '</option>').join('');
$d('#pd-qte').value = 1000;

$d('#pd-produit').addEventListener('change', e => { selProduit = e.target.value || null; cancelFormLigne(); renderProduits(); });
$d('#pd-pform').addEventListener('submit', ev => { ev.preventDefault(); saveProduit(); });
$d('#pd-lform').addEventListener('submit', ev => { ev.preventDefault(); saveLigne(); });
$d('#pd-lcat').addEventListener('change', () => { majExempleCat(true); fillNomsStock(); majLienParNom(); });
['#pd-lqte', '#pd-lprix', '#pd-lperte'].forEach(s => $d(s).addEventListener('input', majApercuLigne));
$d('#pd-lunite').addEventListener('change', majApercuLigne);
['#pd-mo-sal', '#pd-mo-ch', '#pd-mo-pcs'].forEach(s => $d(s).addEventListener('input', renderMoResultat));
$d('#pd-mo-date').addEventListener('change', () => { $d('#pd-mo-hint').textContent = ''; renderMoResultat(); calculerMo('auto'); });   // nouveau jour : salaires et charges fixes se recalculent seuls
$d('#pd-qte').addEventListener('input', () => { if (produitCourant()) renderCout(); });
// Recharge à chaque ouverture de l'onglet (les prix des modèles / charges ont pu changer)
document.querySelector('nav button[data-v="produits"]').addEventListener('click', loadProduits);

$d('#pd-lart').addEventListener('change', () => { autoLie = false; majLienStock(true); majLienParNom(); });
$d('#pd-ldes').addEventListener('input', majLienParNom);
$d('#pd-lsync').addEventListener('change', majLienParNom);
$d('#pd-lunite').addEventListener('change', () => { if ($d('#pd-lart').value) majLienStock(false); });
// Le stock a changé (nouveau prix d'achat…) : tous les coûts de revient se recalculent seuls
document.addEventListener('mariabag:stock', () => { if (produitCourant()) renderProduits(); });
document.addEventListener('mariabag:authenticated', loadProduits);
if (!document.getElementById('app').classList.contains('hide')) loadProduits();
