/* ============================================================
   MARIA BAG — STOCK des matières et fournitures
   - Chaque ARTICLE est une variante précise d'une catégorie :
     Tissu principal › Kawi normal / Kawi bébé / Sky…, Doublure, Sangle,
     Curseur, Fermeture, Éponge, Poignée, Boucle, Fil, Étiquette, Emballage…
   - CONDITIONNEMENT : le tissu s'achète au rouleau (1 rouleau Kawi normal
     = 45 m). On saisit le prix du rouleau, l'application calcule le prix du
     mètre (prix du rouleau ÷ 45) et affiche le stock en rouleaux ET en mètres.
   - Le stock = somme des MOUVEMENTS (entrées / sorties / inventaires) :
     historique complet, rien à corriger à la main, pas de conflit hors ligne.
   - Liens automatiques avec les autres sections (voir StockAPI en bas) :
       Production : disponibilité, manque, coût estimé et SORTIE de stock
                    quand on valide le bon de sortie
       Produits   : prix des lignes de coût repris du stock
       Tableau de bord : alertes (rupture / stock bas)
   ============================================================ */

let STOCK_ARTICLES = [], STOCK_MVTS = [];
let STK_QTY = {};                 // id article -> quantité en stock (unité de mesure)
let STK_HAS = {};                 // id article -> a déjà eu des mouvements
let stkErr = '';
let curArticle = null;            // article en cours de modification
let stFiltreCat = '', stAlertes = false, stHist = '';   // filtres d'affichage
let stLoading = null;

const $s = s => document.querySelector(s);
const STK_UNITES = ['m', 'cm', 'pcs', 'paire', 'kg', 'g', 'L', 'bobine', 'rouleau'];
const STK_CATS = [
  { k: 'Tissu principal', unite: 'm',   cond: 'rouleau', noms: ['Kawi normal', 'Kawi bébé', 'Sky'] },
  { k: 'Doublure',        unite: 'm',   cond: 'rouleau', noms: ['Doublure standard'] },
  { k: 'Sangle',          unite: 'm',   cond: 'rouleau', noms: ['Sangle standard'] },
  { k: 'Curseur',         unite: 'pcs', cond: 'sachet',  noms: ['Curseur standard'] },
  { k: 'Fermeture',       unite: 'm',   cond: 'rouleau', noms: ['Fermeture éclair'] },
  { k: 'Éponge',          unite: 'm',   cond: 'rouleau', noms: ['Éponge standard'] },
  { k: 'Poignée',         unite: 'pcs', cond: 'paquet',  noms: ['Poignée standard'] },
  { k: 'Boucle',          unite: 'pcs', cond: 'sachet',  noms: ['Boucle standard'] },
  { k: 'Fil',             unite: 'bobine', cond: '',     noms: ['Fil standard'] },
  { k: 'Étiquette',       unite: 'pcs', cond: 'paquet',  noms: ['Étiquette standard'] },
  { k: 'Emballage',       unite: 'pcs', cond: 'paquet',  noms: ['Emballage standard'] },
  { k: 'Accessoire',      unite: 'pcs', cond: '',        noms: [] },
  { k: 'Autre',           unite: 'pcs', cond: '',        noms: [] }
];
const STK_CAT_CLASS = ['t0', 't1', 't2', 't3', 't4', 't5', 't6', 't7', 't8', 't9', 't10', 't11', 't12'];

/* ---------- Utilitaires ---------- */
function escS(v) {
  return String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function isoS(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function fdS(s) { return s ? s.split('-').reverse().join('/') : ''; }
function numS(n, dec) { return (Number(n) || 0).toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: dec == null ? 2 : dec }); }
function moneyS(n, dec) {
  const d = dec == null ? 2 : dec;
  return (Number(n) || 0).toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d }) + ' DA';
}
function r4(n) { return Math.round((Number(n) || 0) * 10000) / 10000; }
/* Pluriel français : rouleau → rouleaux, carton → cartons (singulier pour 0 et 1,5) */
function plur(nom, n) {
  nom = nom || '';
  if (Math.abs(n) < 2 || /[sxz]$/i.test(nom)) return nom;
  if (/(eau|au|eu)$/i.test(nom)) return nom + 'x';
  if (/al$/i.test(nom)) return nom.slice(0, -2) + 'aux';
  return nom + 's';
}
function toastS(msg) {
  const e = $s('#toastS');
  if (!e) return;
  e.textContent = msg; e.style.display = 'block';
  clearTimeout(toastS.t); toastS.t = setTimeout(() => e.style.display = 'none', 6500);
}
function errMsgS(error) {
  const m = (error && error.message) || String(error);
  if (/schema cache|does not exist|Could not find|column|relation/i.test(m))
    return 'Tables du stock introuvables dans Supabase. Exécutez supabase/stock.sql dans SQL Editor, puis rechargez la page. (' + m + ')';
  if (/row-level security|permission denied|policy/i.test(m))
    return 'Accès refusé par Supabase (RLS). Réexécutez supabase/stock.sql. (' + m + ')';
  if (/duplicate key|unique/i.test(m)) return 'Cet article existe déjà dans cette catégorie. Choisissez un autre nom. (' + m + ')';
  return m;
}
function catIdx(k) { const i = STK_CATS.findIndex(c => c.k === k); return i < 0 ? STK_CATS.length - 1 : i; }
function catDef(k) { return STK_CATS[catIdx(k)]; }

/* ---------- Calculs : conditionnement, prix, stock ---------- */
const condQte = a => Number(a.cond_qte) || 0;
const aCond = a => !!(a.cond_nom && condQte(a) > 0);

/* Prix d'UNE unité de mesure (ex. 1 m) = prix du rouleau ÷ mètres du rouleau */
function unitPrice(a) {
  const p = Number(a.prix_achat) || 0;
  return aCond(a) ? p / condQte(a) : p;
}
/* Prix pour une autre unité (m ↔ cm, kg ↔ g, rouleau…) — null si conversion impossible */
function priceFor(a, unite) {
  if (!a) return null;
  if (!unite || unite === a.unite) return unitPrice(a);
  if (a.cond_nom && unite === a.cond_nom) return aCond(a) ? Number(a.prix_achat) || 0 : null;
  if (a.unite === 'm' && unite === 'cm') return unitPrice(a) / 100;
  if (a.unite === 'cm' && unite === 'm') return unitPrice(a) * 100;
  if (a.unite === 'kg' && unite === 'g') return unitPrice(a) / 1000;
  if (a.unite === 'g' && unite === 'kg') return unitPrice(a) * 1000;
  return null;
}
/* Quantité exprimée dans une unité -> unité de mesure de l'article — null si conversion impossible */
function toBase(a, q, unite) {
  q = Number(q) || 0;
  if (!a) return null;
  if (!unite || unite === a.unite) return q;
  if (a.cond_nom && unite === a.cond_nom) return aCond(a) ? q * condQte(a) : null;
  if (a.unite === 'm' && unite === 'cm') return q / 100;
  if (a.unite === 'cm' && unite === 'm') return q * 100;
  if (a.unite === 'kg' && unite === 'g') return q / 1000;
  if (a.unite === 'g' && unite === 'kg') return q * 1000;
  return null;
}
function qtyOf(id) { return r4(STK_QTY[String(id)] || 0); }
function normNom(s) { return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim(); }
function articleById(id) { return STOCK_ARTICLES.find(a => String(a.id) === String(id)) || null; }
/* Affichage : « 562,5 m » + « 12,5 rouleaux » */
function fmtQty(a, q) {
  const main = numS(q, 2) + ' ' + a.unite;
  const sub = aCond(a) ? numS(q / condQte(a), 2) + ' ' + plur(a.cond_nom, q / condQte(a)) : '';
  return { main, sub };
}
function etat(a) {
  const q = qtyOf(a.id), seuil = Number(a.seuil_alerte) || 0;
  if (q < 0) return { k: 'neg', l: 'Négatif', c: 'r', rank: 0 };
  if (q === 0) return STK_HAS[String(a.id)] || seuil > 0
    ? { k: 'rupture', l: 'Rupture', c: 'r', rank: 1 }
    : { k: 'vide', l: 'Aucun stock', c: 'n', rank: 3 };      // jamais approvisionné : pas d'alerte
  if (seuil > 0 && q <= seuil) return { k: 'bas', l: 'Stock bas', c: 'o', rank: 2 };
  return { k: 'ok', l: 'OK', c: 'g', rank: 3 };
}
const enAlerte = a => etat(a).rank <= 2;
/* À commander : manque pour revenir au seuil, arrondi au conditionnement entier */
function aCommander(a) {
  const seuil = Number(a.seuil_alerte) || 0, q = qtyOf(a.id);
  const manque = Math.max(0, seuil - q);
  if (manque <= 0) return { qty: 0, cout: 0, nb: 0 };
  if (aCond(a)) { const nb = Math.ceil(manque / condQte(a)); return { qty: nb * condQte(a), nb, cout: nb * (Number(a.prix_achat) || 0) }; }
  return { qty: manque, nb: 0, cout: manque * (Number(a.prix_achat) || 0) };
}

/* ---------- Chargement ---------- */
async function loadStock() {
  if (stLoading) return stLoading;
  stLoading = (async () => {
    try {
      const a = await sb.from('stock_articles').select('*').order('categorie', { ascending: true }).order('nom', { ascending: true });
      if (a.error) { STOCK_ARTICLES = []; STOCK_MVTS = []; STK_QTY = {}; stkErr = errMsgS(a.error); renderStock(); notifyStock(); return false; }
      const m = await sb.from('stock_mouvements').select('*').order('date_mvt', { ascending: false }).order('created_at', { ascending: false });
      if (m.error) { STOCK_ARTICLES = a.data || []; STOCK_MVTS = []; STK_QTY = {}; stkErr = errMsgS(m.error); renderStock(); notifyStock(); return false; }
      STOCK_ARTICLES = a.data || [];
      STOCK_MVTS = m.data || [];
      STK_QTY = {}; STK_HAS = {};
      STOCK_MVTS.forEach(x => { STK_QTY[String(x.article_id)] = (STK_QTY[String(x.article_id)] || 0) + Number(x.quantite || 0); STK_HAS[String(x.article_id)] = true; });
      stkErr = '';
      renderStock(); notifyStock();
      return true;
    } finally { stLoading = null; }
  })();
  return stLoading;
}
function notifyStock() { document.dispatchEvent(new Event('mariabag:stock')); }

/* ---------- Affichage ---------- */
function stockFiltre() {
  const q = ($s('#st-q').value || '').toLowerCase().trim();
  return STOCK_ARTICLES.filter(a =>
    (!stFiltreCat || a.categorie === stFiltreCat) && (!stAlertes || enAlerte(a)) &&
    (!q || [a.nom, a.categorie, a.fournisseur, a.couleur, a.note].join(' ').toLowerCase().includes(q)));
}

function renderStock() {
  const has = STOCK_ARTICLES.length > 0;
  $s('#st-main').style.display = has ? '' : 'none';
  $s('#st-empty').style.display = has ? 'none' : '';
  $s('#st-stats').style.display = has ? '' : 'none';
  $s('#st-chips').style.display = has ? '' : 'none';
  if (!has) {
    $s('#st-empty').innerHTML = stkErr
      ? '<p style="color:#b00020">⚠ ' + escS(stkErr) + '</p>'
      : '<h2>Aucun article en stock</h2>' +
        '<p>Créez un article pour chaque variante : <b>Tissu principal › Kawi normal</b> (1 rouleau = 45 m), <b>Kawi bébé</b>, <b>Sky</b>, ' +
        'puis doublure, sangle, curseur, fermeture, éponge, poignée, boucle, fil, étiquette, emballage. ' +
        'Le stock se met ensuite à jour tout seul : entrées (achats) et sorties (bons de sortie de la production).</p>' +
        '<button class="btn p" type="button" onclick="showFormArticle()">+ Créer mon premier article</button> ' +
        '<button class="btn" type="button" onclick="createStarterArticles()">Créer les articles de départ</button>';
    return;
  }
  if (stkErr) toastS(stkErr);
  renderStats(); renderChips(); renderCommander(); renderTable(); renderHist();
  renderSelects();
}

function renderStats() {
  const al = STOCK_ARTICLES.filter(enAlerte), rup = STOCK_ARTICLES.filter(a => etat(a).rank <= 1);
  const val = STOCK_ARTICLES.reduce((s, a) => s + Math.max(0, qtyOf(a.id)) * unitPrice(a), 0);
  $s('#st-stats').innerHTML =
    '<div class="at-stat"><span>Valeur du stock</span><b>' + moneyS(val, 0) + '</b><small style="color:var(--mut)">au prix d’achat</small></div>' +
    '<div class="at-stat"><span>Articles</span><b>' + STOCK_ARTICLES.length + '</b><small style="color:var(--mut)">' + new Set(STOCK_ARTICLES.map(a => a.categorie)).size + ' catégories</small></div>' +
    '<div class="at-stat' + (al.length ? ' st-warn' : '') + '"><span>À surveiller</span><b>' + al.length + '</b><small style="color:var(--mut)">stock bas ou en rupture</small></div>' +
    '<div class="at-stat' + (rup.length ? ' st-warn' : '') + '"><span>En rupture</span><b>' + rup.length + '</b><small style="color:var(--mut)">stock à zéro ou négatif</small></div>';
}

function renderChips() {
  const cnt = {}; STOCK_ARTICLES.forEach(a => { cnt[a.categorie] = (cnt[a.categorie] || 0) + 1; });
  const cats = Object.keys(cnt).sort((a, b) => catIdx(a) - catIdx(b) || a.localeCompare(b));
  const nAl = STOCK_ARTICLES.filter(enAlerte).length;
  $s('#st-chips').innerHTML =
    '<button type="button" class="chip' + (!stFiltreCat && !stAlertes ? ' on' : '') + '" data-sc="">Tous <b>' + STOCK_ARTICLES.length + '</b></button>' +
    cats.map(k => '<button type="button" class="chip' + (stFiltreCat === k ? ' on' : '') + '" data-sc="' + escS(k) + '">' + escS(k) + ' <b>' + cnt[k] + '</b></button>').join('') +
    '<button type="button" class="chip st-alchip' + (stAlertes ? ' on' : '') + '" data-sal="1">⚠ Alertes <b>' + nAl + '</b></button>';
}

function renderCommander() {
  const list = STOCK_ARTICLES.filter(enAlerte).map(a => ({ a, c: aCommander(a), e: etat(a) }))
    .sort((x, y) => x.e.rank - y.e.rank || x.a.nom.localeCompare(y.a.nom));
  const card = $s('#st-cmd-card');
  card.style.display = list.length ? '' : 'none';
  if (!list.length) return;
  const tot = list.reduce((s, x) => s + x.c.cout, 0);
  $s('#st-cmd-body').innerHTML = list.map(x => {
    const q = fmtQty(x.a, qtyOf(x.a.id)), sug = x.c.qty ? fmtQty(x.a, x.c.qty) : null;
    return '<tr><td><b>' + escS(x.a.nom) + '</b><small>' + escS(x.a.categorie) + '</small></td>' +
      '<td>' + q.main + (q.sub ? '<small>' + q.sub + '</small>' : '') + '</td>' +
      '<td><span class="bd ' + x.e.c + '">' + x.e.l + '</span></td>' +
      '<td>' + (sug ? '<b>' + (x.c.nb ? x.c.nb + ' ' + plur(x.a.cond_nom, x.c.nb) : sug.main) + '</b>' + (x.c.nb ? '<small>' + sug.main + '</small>' : '') : '<small>Définissez un seuil d’alerte</small>') + '</td>' +
      '<td>' + (x.c.cout ? moneyS(x.c.cout, 0) : '—') + '</td>' +
      '<td class="emp-act"><button class="btn s p" type="button" onclick="showFormMvt(\'entree\',\'' + escS(x.a.id) + '\')">+ Entrée</button></td></tr>';
  }).join('') + '<tr class="pr-total"><td colspan="4">Budget d’achat estimé</td><td>' + moneyS(tot, 0) + '</td><td></td></tr>';
}

function renderTable() {
  const list = stockFiltre();
  const body = $s('#st-tbody');
  if (!list.length) { body.innerHTML = '<tr><td colspan="6" class="at-empty">Aucun article ne correspond au filtre.</td></tr>'; return; }
  const cats = [...new Set(list.map(a => a.categorie))].sort((a, b) => catIdx(a) - catIdx(b) || a.localeCompare(b));
  body.innerHTML = cats.map(k => {
    const items = list.filter(a => a.categorie === k);
    return '<tr class="st-cat"><td colspan="6"><span class="st-tag ' + STK_CAT_CLASS[catIdx(k)] + '">' + escS(k) + '</span> <small>' + items.length + ' modèle' + (items.length > 1 ? 's' : '') + '</small></td></tr>' +
      items.map(a => {
        const q = qtyOf(a.id), f = fmtQty(a, q), e = etat(a);
        const prix = aCond(a)
          ? '<b>' + moneyS(a.prix_achat) + '</b> / ' + escS(a.cond_nom) + '<small>= ' + moneyS(unitPrice(a)) + ' / ' + escS(a.unite) + '</small>'
          : (a.cond_nom ? '<b>' + moneyS(a.prix_achat) + '</b><small style="color:var(--o)">⚠ indiquez les ' + escS(a.unite) + ' par ' + escS(a.cond_nom) + '</small>' : '<b>' + moneyS(a.prix_achat) + '</b> / ' + escS(a.unite));
        return '<tr><td><b>' + escS(a.nom) + '</b>' + (a.fournisseur || a.couleur ? '<small>' + escS([a.couleur, a.fournisseur].filter(Boolean).join(' · ')) + '</small>' : '') + '</td>' +
          '<td><b>' + f.main + '</b>' + (f.sub ? '<small>' + f.sub + '</small>' : '') + '</td>' +
          '<td>' + prix + '</td>' +
          '<td>' + moneyS(Math.max(0, q) * unitPrice(a), 0) + '</td>' +
          '<td><span class="bd ' + e.c + '">' + e.l + '</span>' + (Number(a.seuil_alerte) ? '<small>seuil ' + numS(a.seuil_alerte, 2) + ' ' + escS(a.unite) + '</small>' : '') + '</td>' +
          '<td class="emp-act"><button class="btn s p" type="button" onclick="showFormMvt(\'entree\',\'' + escS(a.id) + '\')">+ Entrée</button> ' +
          '<button class="btn s" type="button" onclick="showFormMvt(\'sortie\',\'' + escS(a.id) + '\')">Sortie</button> ' +
          '<button class="btn s" type="button" onclick="showFormArticle(\'' + escS(a.id) + '\')">Modifier</button> ' +
          '<button class="btn s" type="button" onclick="voirHist(\'' + escS(a.id) + '\')">Historique</button></td></tr>';
      }).join('');
  }).join('');
}

const MVT_LBL = { entree: ['Entrée', 'g'], sortie: ['Sortie', 'r'], ajustement: ['Inventaire', 'o'] };
function renderHist() {
  const art = stHist ? articleById(stHist) : null;
  $s('#st-hist-title').textContent = art ? 'Historique — ' + art.categorie + ' › ' + art.nom : 'Derniers mouvements';
  $s('#st-hist-all').style.display = art ? '' : 'none';
  const list = STOCK_MVTS.filter(m => !stHist || String(m.article_id) === String(stHist)).slice(0, stHist ? 200 : 40);
  $s('#st-hist-body').innerHTML = list.length ? list.map(m => {
    const a = articleById(m.article_id), t = MVT_LBL[m.type] || [m.type, 'n'];
    const q = Number(m.quantite) || 0, f = a ? fmtQty(a, Math.abs(q)) : { main: numS(Math.abs(q)), sub: '' };
    return '<tr><td>' + fdS(m.date_mvt) + '</td><td><b>' + escS(a ? a.nom : '—') + '</b><small>' + escS(a ? a.categorie : '') + '</small></td>' +
      '<td><span class="bd ' + t[1] + '">' + t[0] + '</span></td>' +
      '<td><b class="' + (q < 0 ? 'st-neg' : 'st-pos') + '">' + (q < 0 ? '−' : '+') + f.main + '</b>' + (f.sub ? '<small>' + f.sub + '</small>' : '') + '</td>' +
      '<td>' + (m.prix_achat != null && Number(m.prix_achat) > 0 ? moneyS(m.prix_achat) : '—') + '</td>' +
      '<td>' + escS([m.reference, m.fournisseur, m.note].filter(Boolean).join(' · ')) + (m.source === 'production' ? '<small>Sortie de production</small>' : '') + '</td>' +
      '<td class="emp-act"><button class="btn s d" type="button" onclick="removeMvt(\'' + escS(m.id) + '\')">Annuler</button></td></tr>';
  }).join('') : '<tr><td colspan="7" class="at-empty">Aucun mouvement.</td></tr>';
}
function voirHist(id) { stHist = id; renderHist(); $s('#st-hist-card').scrollIntoView({ behavior: 'smooth', block: 'start' }); }

/* Listes déroulantes (article, catégories) */
function selectOptions(selId, withEmpty, emptyLabel) {
  const groups = {};
  STOCK_ARTICLES.forEach(a => { (groups[a.categorie] = groups[a.categorie] || []).push(a); });
  const cats = Object.keys(groups).sort((a, b) => catIdx(a) - catIdx(b) || a.localeCompare(b));
  return (withEmpty ? '<option value="">' + escS(emptyLabel || '— Aucun —') + '</option>' : '') +
    cats.map(k => '<optgroup label="' + escS(k) + '">' + groups[k].map(a => '<option value="' + escS(a.id) + '">' + escS(a.nom) + ' — ' + escS(fmtQty(a, qtyOf(a.id)).main) + '</option>').join('') + '</optgroup>').join('');
}
function renderSelects() {
  const m = $s('#st-marticle');
  if (m) { const v = m.value; m.innerHTML = selectOptions('st-marticle', false); if (v && articleById(v)) m.value = v; }
}

/* ---------- Formulaire article ---------- */
function showFormArticle(id) {
  curArticle = id || null;
  const a = id ? articleById(id) : null;
  const first = STK_CATS.find(c => c.k === (stFiltreCat || '')) || STK_CATS[0];
  $s('#st-aform-title').textContent = a ? 'Modifier l’article' : 'Nouvel article';
  $s('#st-acat').value = a ? a.categorie : first.k;
  $s('#st-anom').value = a ? a.nom : '';
  $s('#st-aunite').value = a ? a.unite : first.unite;
  $s('#st-acond').value = a ? (a.cond_nom || '') : first.cond;
  $s('#st-acqte').value = a && condQte(a) ? condQte(a) : '';
  $s('#st-aprix').value = a ? a.prix_achat : '';
  $s('#st-aseuil').value = a && Number(a.seuil_alerte) ? a.seuil_alerte : '';
  if (window.PartAPI) PartAPI.fill('#st-afour', { id: a && a.contact_id, nom: a && a.fournisseur });
  $s('#st-acoul').value = a ? (a.couleur || '') : '';
  $s('#st-anote').value = a ? (a.note || '') : '';
  $s('#st-ainit').value = '';
  $s('#st-ainit-wrap').style.display = a ? 'none' : '';
  $s('#st-adel').style.display = a ? '' : 'none';
  $s('#st-asubmit').textContent = a ? 'Enregistrer les modifications' : 'Créer l’article';
  majNomsListe(); majArticleLabels();
  $s('#st-mform').style.display = 'none';
  $s('#st-aform').style.display = 'block';
  $s('#st-aform').scrollIntoView({ behavior: 'smooth', block: 'start' });
  $s('#st-anom').focus();
}
function cancelFormArticle() { curArticle = null; $s('#st-aform').style.display = 'none'; }

/* Suggestions de noms selon la catégorie + libellés dynamiques (rouleau, m, prix au mètre…) */
function majNomsListe() {
  const c = catDef($s('#st-acat').value);
  $s('#st-noms').innerHTML = c.noms.map(n => '<option value="' + escS(n) + '">').join('');
}
function majArticleLabels() {
  const unite = $s('#st-aunite').value, cond = $s('#st-acond').value.trim();
  const cq = parseFloat($s('#st-acqte').value) || 0, prix = parseFloat($s('#st-aprix').value) || 0;
  $s('#st-acqte-wrap').style.display = cond ? '' : 'none';
  $s('#st-acqte-lbl').textContent = 'Contenu d’un ' + cond + ' (en ' + unite + ') *';
  $s('#st-aprix-lbl').textContent = cond ? 'Prix d’achat d’un ' + cond + ' (DA) *' : 'Prix d’achat d’une unité : ' + unite + ' (DA)';
  $s('#st-aseuil-lbl').textContent = 'Alerte quand le stock est ≤ (en ' + unite + ')';
  $s('#st-ainit-lbl').textContent = 'Stock de départ (en ' + (cond && cq > 0 ? plur(cond, 2) : unite) + ')';
  const h = [];
  if (cond && cq > 0) {
    h.push('1 ' + cond + ' = ' + numS(cq, 2) + ' ' + unite + (prix ? ' → <b>' + moneyS(prix / cq) + ' / ' + escS(unite) + '</b> (prix utilisé dans les coûts de production)' : ''));
  } else if (cond) h.push('⚠ Indiquez le contenu d’un ' + escS(cond) + ' pour calculer le prix par ' + escS(unite) + '.');
  const seuil = parseFloat($s('#st-aseuil').value) || 0;
  if (seuil && cond && cq > 0) h.push('Seuil d’alerte = ' + numS(seuil / cq, 2) + ' ' + plur(cond, seuil / cq));
  $s('#st-ahint').innerHTML = h.join('<br>');
}
function onCatChange() {
  const c = catDef($s('#st-acat').value);
  if (!curArticle) { $s('#st-aunite').value = c.unite; $s('#st-acond').value = c.cond; }
  majNomsListe(); majArticleLabels();
}

async function saveArticle() {
  const categorie = $s('#st-acat').value, nom = $s('#st-anom').value.trim();
  const unite = $s('#st-aunite').value, cond_nom = $s('#st-acond').value.trim();
  const cond_qte = cond_nom ? (parseFloat($s('#st-acqte').value) || 0) : 0;
  const prix = parseFloat($s('#st-aprix').value) || 0, seuil = parseFloat($s('#st-aseuil').value) || 0;
  if (!nom) { toastS('Le nom du modèle est obligatoire (ex : Kawi normal).'); return; }
  if (cond_nom && !(cond_qte > 0)) { toastS('Indiquez le contenu d’un ' + cond_nom + ' (ex : 45 ' + unite + ').'); return; }
  // Article créé depuis Produits : son prix était « par mètre ». Si on lui ajoute un rouleau, le prix saisi
  // peut rester le prix du mètre (converti en prix du rouleau) ou être le prix du rouleau.
  let prixFinal = prix;
  const avant = curArticle ? articleById(curArticle) : null;
  if (avant && !aCond(avant) && cond_nom && cond_qte > 0 && prix > 0 && Math.abs(prix - (Number(avant.prix_achat) || 0)) < 0.005 &&
      confirm('Le prix actuel (' + moneyS(prix) + ') est un prix PAR ' + unite.toUpperCase() + ' (utilisé dans vos coûts de production).\n\n' +
              'OK = garder ce prix par ' + unite + ' → le ' + cond_nom + ' vaudra ' + moneyS(prix * cond_qte) + '\n' +
              'Annuler = ' + moneyS(prix) + ' est le prix d’un ' + cond_nom + ' (' + moneyS(prix / cond_qte) + ' / ' + unite + ')'))
    prixFinal = Math.round(prix * cond_qte * 100) / 100;
  const payload = {
    categorie, nom, unite, cond_nom, cond_qte, prix_achat: prixFinal, seuil_alerte: seuil,
    ...(window.PartAPI ? PartAPI.read('#st-afour') : { fournisseur: '', contact_id: null }), couleur: $s('#st-acoul').value.trim(), note: $s('#st-anote').value.trim()
  };
  const res = curArticle
    ? await sb.from('stock_articles').update(payload).eq('id', curArticle).select()
    : await sb.from('stock_articles').insert([payload]).select();
  if (res.error) { toastS('Erreur : ' + errMsgS(res.error)); return; }
  const wasEdit = !!curArticle;
  // Stock de départ : un premier mouvement « inventaire »
  const init = parseFloat($s('#st-ainit').value) || 0;
  if (!wasEdit && init > 0 && res.data && res.data[0]) {
    const base = cond_nom && cond_qte > 0 ? init * cond_qte : init;
    const m = await sb.from('stock_mouvements').insert([{ article_id: res.data[0].id, date_mvt: isoS(new Date()), type: 'ajustement',
      quantite: r4(base), prix_achat: prix || null, note: 'Stock de départ', source: 'manuel' }]);
    if (m.error) toastS('Article créé, mais stock de départ impossible : ' + errMsgS(m.error));
  }
  toastS(wasEdit ? 'Article modifié.' : 'Article créé' + (init > 0 ? ' avec son stock de départ.' : '.'));
  cancelFormArticle();
  await loadStock();
}

async function removeArticle() {
  const a = curArticle ? articleById(curArticle) : null; if (!a) return;
  const n = STOCK_MVTS.filter(m => String(m.article_id) === String(a.id)).length;
  if (!confirm('Supprimer « ' + a.categorie + ' › ' + a.nom + ' » et ses ' + n + ' mouvement(s) ?\nLes composants et lignes de coût liés seront simplement dissociés.')) return;
  const { error } = await sb.from('stock_articles').delete().eq('id', a.id);
  if (error) { toastS('Erreur : ' + errMsgS(error)); return; }
  cancelFormArticle(); toastS('Article supprimé.');
  await loadStock();
}

/* Articles de départ (à compléter) : Kawi normal = 45 m par rouleau, comme indiqué */
async function createStarterArticles() {
  const rows = [];
  STK_CATS.forEach(c => c.noms.forEach(n => {
    const kawiNormal = c.k === 'Tissu principal' && n === 'Kawi normal';
    rows.push({ categorie: c.k, nom: n, unite: c.unite, cond_nom: c.cond, cond_qte: kawiNormal ? 45 : 0, prix_achat: 0, seuil_alerte: 0,
      note: kawiNormal ? '' : 'À compléter : prix d’achat' + (c.cond ? ' et contenu du ' + c.cond : '') });
  }));
  const r = await sb.from('stock_articles').insert(rows);
  if (r.error) { toastS('Erreur : ' + errMsgS(r.error)); return; }
  toastS(rows.length + ' articles créés : cliquez sur « Modifier » pour saisir les prix d’achat et le contenu des rouleaux.');
  await loadStock();
}

/* ---------- Formulaire mouvement (entrée / sortie / inventaire) ---------- */
let mvtType = 'entree';
function showFormMvt(type, articleId) {
  if (!STOCK_ARTICLES.length) { toastS('Créez d’abord un article.'); return; }
  mvtType = type || 'entree';
  $s('#st-mtype').value = mvtType;
  renderSelects();
  if (articleId) $s('#st-marticle').value = articleId;
  $s('#st-mdate').value = isoS(new Date());
  $s('#st-mqte').value = ''; if (window.PartAPI) PartAPI.fill('#st-mfour', {}); $s('#st-mref').value = ''; $s('#st-mnote').value = '';
  $s('#st-mmaj').checked = true;
  onMvtArticle(true);
  $s('#st-aform').style.display = 'none';
  $s('#st-mform').style.display = 'block';
  $s('#st-mform').scrollIntoView({ behavior: 'smooth', block: 'start' });
  $s('#st-mqte').focus();
}
function cancelFormMvt() { $s('#st-mform').style.display = 'none'; }

function onMvtArticle(reset) {
  const a = articleById($s('#st-marticle').value); if (!a) return;
  const opts = [];
  if (aCond(a)) opts.push(a.cond_nom);
  opts.push(a.unite);
  $s('#st-munite').innerHTML = opts.map(u => '<option>' + escS(u) + '</option>').join('');
  if (reset) {
    $s('#st-mprix').value = Number(a.prix_achat) || '';
    if (window.PartAPI) PartAPI.fill('#st-mfour', mvtType === 'entree' ? { id: a.contact_id, nom: a.fournisseur } : {});
  }
  majMvt();
}
function majMvt() {
  mvtType = $s('#st-mtype').value;
  const a = articleById($s('#st-marticle').value); if (!a) return;
  const entree = mvtType === 'entree';
  $s('#st-mprix-wrap').style.display = entree ? '' : 'none';
  $s('#st-mmaj-wrap').style.display = entree ? '' : 'none';
  $s('#st-mfour-wrap').style.display = entree ? '' : 'none';
  $s('#st-mqte-lbl').textContent = mvtType === 'ajustement' ? 'Quantité réelle comptée *' : 'Quantité *';
  $s('#st-mprix-lbl').textContent = aCond(a) ? 'Prix d’achat d’un ' + a.cond_nom + ' (DA)' : 'Prix d’achat d’une unité : ' + a.unite + ' (DA)';
  $s('#st-msubmit').textContent = entree ? 'Enregistrer l’entrée' : mvtType === 'sortie' ? 'Enregistrer la sortie' : 'Corriger le stock';
  $s('#st-mform-title').textContent = entree ? 'Entrée de stock (achat, réception)' : mvtType === 'sortie' ? 'Sortie de stock (consommation, perte, casse)' : 'Inventaire : corriger le stock';
  const cur = qtyOf(a.id), q = parseFloat($s('#st-mqte').value) || 0, u = $s('#st-munite').value;
  const base = toBase(a, q, u);
  let delta = base == null ? 0 : (mvtType === 'sortie' ? -base : mvtType === 'ajustement' ? base - cur : base);
  const after = r4(cur + delta);
  let h = 'Stock actuel : <b>' + fmtQty(a, cur).main + '</b>' + (fmtQty(a, cur).sub ? ' (' + fmtQty(a, cur).sub + ')' : '');
  if (q > 0 && base != null) {
    h += ' → après : <b class="' + (after < 0 ? 'st-neg' : '') + '">' + fmtQty(a, after).main + '</b>' + (fmtQty(a, after).sub ? ' (' + fmtQty(a, after).sub + ')' : '');
    if (aCond(a) && u === a.cond_nom) h += '<br>' + numS(q, 2) + ' ' + plur(a.cond_nom, q) + ' = ' + numS(base, 2) + ' ' + a.unite;
    if (entree) { const p = parseFloat($s('#st-mprix').value) || 0; if (p > 0) h += '<br>Coût de cet achat : <b>' + moneyS(aCond(a) ? (base / condQte(a)) * p : base * p) + '</b>'; }
  }
  $s('#st-mhint').innerHTML = h;
}

async function saveMvt() {
  const a = articleById($s('#st-marticle').value); if (!a) { toastS('Choisissez un article.'); return; }
  const q = parseFloat($s('#st-mqte').value), u = $s('#st-munite').value;
  if (!(q >= 0) || isNaN(q) || (mvtType !== 'ajustement' && !(q > 0))) { toastS('Indiquez une quantité supérieure à 0.'); return; }
  const base = toBase(a, q, u);
  if (base == null) { toastS('Unité impossible pour cet article.'); return; }
  const cur = qtyOf(a.id);
  let delta = mvtType === 'sortie' ? -base : mvtType === 'ajustement' ? base - cur : base;
  delta = r4(delta);
  if (delta === 0) { toastS('Le stock est déjà égal à cette quantité.'); return; }
  if (mvtType === 'sortie' && cur + delta < 0 &&
      !confirm('Stock insuffisant : il reste ' + fmtQty(a, cur).main + ' et vous sortez ' + fmtQty(a, base).main + '.\nLe stock deviendra négatif. Continuer ?')) return;
  const prix = parseFloat($s('#st-mprix').value) || 0;
  const row = {
    article_id: a.id, date_mvt: $s('#st-mdate').value || isoS(new Date()), type: mvtType, quantite: delta,
    prix_achat: mvtType === 'entree' && prix > 0 ? prix : null,
    ...(mvtType === 'entree' && window.PartAPI ? PartAPI.read('#st-mfour') : { fournisseur: '', contact_id: null }),
    reference: $s('#st-mref').value.trim(), note: $s('#st-mnote').value.trim() || (mvtType === 'ajustement' ? 'Inventaire' : ''), source: 'manuel'
  };
  const r = await sb.from('stock_mouvements').insert([row]);
  if (r.error) { toastS('Erreur : ' + errMsgS(r.error)); return; }
  // le prix d'achat de l'article suit le dernier achat (utilisé par les coûts de production)
  if (mvtType === 'entree' && prix > 0 && $s('#st-mmaj').checked) {
    const upd = { prix_achat: prix };
    const f = window.PartAPI ? PartAPI.read('#st-mfour') : {}; if (f.fournisseur) { upd.fournisseur = f.fournisseur; upd.contact_id = f.contact_id; }
    const ru = await sb.from('stock_articles').update(upd).eq('id', a.id);
    if (ru.error) toastS('Entrée enregistrée, mais prix non mis à jour : ' + errMsgS(ru.error));
  }
  toastS(mvtType === 'entree' ? 'Entrée enregistrée : +' + fmtQty(a, base).main : mvtType === 'sortie' ? 'Sortie enregistrée : −' + fmtQty(a, base).main : 'Stock corrigé : ' + fmtQty(a, r4(cur + delta)).main);
  cancelFormMvt();
  await loadStock();
}

async function removeMvt(id) {
  const m = STOCK_MVTS.find(x => String(x.id) === String(id)); if (!m) return;
  const a = articleById(m.article_id), q = Number(m.quantite) || 0;
  if (!confirm('Annuler ce mouvement (' + (q < 0 ? 'sortie' : 'entrée') + ' de ' + (a ? fmtQty(a, Math.abs(q)).main : numS(Math.abs(q))) + ' le ' + fdS(m.date_mvt) + ') ?\nLe stock sera recalculé.')) return;
  const { error } = await sb.from('stock_mouvements').delete().eq('id', id);
  if (error) { toastS('Erreur : ' + errMsgS(error)); return; }
  toastS('Mouvement annulé : stock recalculé.');
  await loadStock();
}

/* ---------- Export Excel ---------- */
function exportStock() {
  if (typeof XLSX === 'undefined') { toastS('Bibliothèque Excel non chargée.'); return; }
  const stock = STOCK_ARTICLES.map(a => { const q = qtyOf(a.id), e = etat(a); return {
    'Catégorie': a.categorie, 'Modèle': a.nom, 'Stock': q, 'Unité': a.unite,
    ['Stock en ' + 'conditionnement']: aCond(a) ? Math.round(q / condQte(a) * 100) / 100 : '', 'Conditionnement': a.cond_nom || '',
    'Contenu du conditionnement': condQte(a) || '', "Prix d'achat (DA)": Number(a.prix_achat) || 0,
    "Prix par unité de mesure (DA)": Math.round(unitPrice(a) * 100) / 100, 'Valeur (DA)': Math.round(Math.max(0, q) * unitPrice(a) * 100) / 100,
    "Seuil d'alerte": Number(a.seuil_alerte) || 0, 'État': e.l, 'Fournisseur': a.fournisseur || '' }; });
  const mv = STOCK_MVTS.map(m => { const a = articleById(m.article_id); return {
    Date: fdS(m.date_mvt), Catégorie: a ? a.categorie : '', Modèle: a ? a.nom : '', Opération: (MVT_LBL[m.type] || [m.type])[0],
    Quantité: Number(m.quantite) || 0, Unité: a ? a.unite : '', "Prix d'achat (DA)": m.prix_achat != null ? Number(m.prix_achat) : '',
    Référence: m.reference || '', Fournisseur: m.fournisseur || '', Note: m.note || '' }; });
  const ach = STOCK_ARTICLES.filter(enAlerte).map(a => { const c = aCommander(a); return {
    Catégorie: a.categorie, Modèle: a.nom, 'Stock actuel': qtyOf(a.id), Unité: a.unite, 'À commander': c.nb || c.qty,
    'Unité de commande': c.nb ? a.cond_nom : a.unite, 'Budget (DA)': Math.round(c.cout) }; });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(stock), 'Stock');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(ach), 'À commander');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(mv), 'Mouvements');
  XLSX.writeFile(wb, 'MARIA-BAG_stock_' + isoS(new Date()) + '.xlsx');
}

/* ============================================================
   StockAPI — utilisé par Production, Produits et le Tableau de bord
   ============================================================ */
window.StockAPI = {
  load: loadStock,
  list: () => STOCK_ARTICLES,
  byId: articleById,
  qty: qtyOf,
  unitPrice, priceFor, toBase, fmtQty, etat, enAlerte, aCommander, aCond, condQte, plur, catIdx,
  /* Liste déroulante d'articles groupée par catégorie */
  fillSelect(sel, selectedId, emptyLabel) {
    sel.innerHTML = selectOptions(sel.id, true, emptyLabel || '— Aucun (saisie libre) —');
    sel.value = selectedId && articleById(selectedId) ? String(selectedId) : '';
  },
  /* Sortie de stock : items = [{ article_id, qte (unité de mesure) }] */
  async sortie(items, reference, note, source) {
    const rows = items.filter(i => i.qte > 0).map(i => ({
      article_id: i.article_id, date_mvt: isoS(new Date()), type: 'sortie', quantite: -r4(i.qte),
      reference: reference || '', note: note || '', source: source || 'production' }));
    if (!rows.length) return { error: null, n: 0 };
    const r = await sb.from('stock_mouvements').insert(rows);
    if (r.error) return { error: r.error, n: 0 };
    await loadStock();
    return { error: null, n: rows.length };
  },
  /* Recherche par nom (sans accents ni majuscules) : dans la catégorie donnée d'abord, sinon dans toutes */
  norm: normNom,
  find(nom, categorie) {
    const n = normNom(nom); if (!n) return null;
    const all = STOCK_ARTICLES.filter(a => normNom(a.nom) === n);
    return all.find(a => a.categorie === categorie) || (categorie ? null : all[0]) || null;
  },
  /* Crée un ou plusieurs articles (ex. saisis depuis Produits) : ils apparaissent aussitôt partout */
  async create(rows) {
    const list = Array.isArray(rows) ? rows : [rows];
    const r = await sb.from('stock_articles').insert(list).select();
    if (r.error) return { error: r.error, articles: [] };
    await loadStock();
    return { error: null, articles: r.data || [], article: (r.data || [])[0] };
  },
  /* Mouvement direct (écran « Stock simple ») : quantite en UNITÉ DE MESURE, positive = entrée, négative = sortie */
  async mouvement(o) {
    const r = await sb.from('stock_mouvements').insert([{ article_id: o.article_id, date_mvt: o.date || isoS(new Date()), type: o.type || (o.quantite < 0 ? 'sortie' : 'entree'),
      quantite: r4(o.quantite), prix_achat: o.prix_achat > 0 ? o.prix_achat : null, fournisseur: o.fournisseur || '', contact_id: o.contact_id || null, reference: o.reference || '', note: o.note || '', source: o.source || 'manuel' }]);
    if (!r.error) await loadStock();
    return r;
  },
  /* Met à jour le prix d'achat d'un article puis recharge (tous les coûts se recalculent) */
  async setPrix(id, prix) {
    const r = await sb.from('stock_articles').update({ prix_achat: prix }).eq('id', id);
    if (!r.error) await loadStock();
    return r;
  },
  /* Sorties déjà enregistrées avec cette référence (évite de valider deux fois le même bon) */
  mouvements: () => STOCK_MVTS,
  dejaSorti(reference) { return reference ? STOCK_MVTS.filter(m => m.type === 'sortie' && m.reference === reference) : []; }
};

/* ---------- Initialisation et événements ---------- */
$s('#st-acat').innerHTML = STK_CATS.map(c => '<option>' + escS(c.k) + '</option>').join('');
$s('#st-aunite').innerHTML = STK_UNITES.map(u => '<option>' + u + '</option>').join('');
$s('#st-aform').addEventListener('submit', ev => { ev.preventDefault(); saveArticle(); });
$s('#st-mform').addEventListener('submit', ev => { ev.preventDefault(); saveMvt(); });
$s('#st-acat').addEventListener('change', onCatChange);
['#st-aunite', '#st-acond', '#st-acqte', '#st-aprix', '#st-aseuil'].forEach(s => $s(s).addEventListener('input', majArticleLabels));
$s('#st-marticle').addEventListener('change', () => onMvtArticle(true));
$s('#st-mtype').addEventListener('change', () => { majMvt(); });
['#st-mqte', '#st-mprix'].forEach(s => $s(s).addEventListener('input', majMvt));
$s('#st-munite').addEventListener('change', majMvt);
$s('#st-q').addEventListener('input', renderTable);
$s('#st-chips').addEventListener('click', e => {
  const c = e.target.closest('[data-sc]'), al = e.target.closest('[data-sal]');
  if (c) { stFiltreCat = c.dataset.sc; stAlertes = false; }
  else if (al) { stAlertes = !stAlertes; if (stAlertes) stFiltreCat = ''; }
  else return;
  renderChips(); renderTable();
});
$s('#st-hist-all').addEventListener('click', () => { stHist = ''; renderHist(); });
document.querySelector('nav button[data-v="stock"]').addEventListener('click', loadStock);
document.addEventListener('mariabag:authenticated', loadStock);
if (!document.getElementById('app').classList.contains('hide')) loadStock();
