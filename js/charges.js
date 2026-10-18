/* ============================================================
   MARIA BAG — Charges de l'atelier
   - Charges FIXES (dîner, loyer, électricité, autre charge fixe…) :
     saisies UNE SEULE FOIS (montant par jour) ; l'application les applique
     automatiquement à chaque jour (jours travaillés d'après le pointage,
     ou tous les jours), sans rien ressaisir.
   - Charges VARIABLES et paie : saisies au jour le jour (date, montant, note).
     La paie du jour se calcule automatiquement d'après le pointage.
   - MAIN D'ŒUVRE d'une pièce (onglet Produits) =
       (salaires du jour + charges FIXES du jour) ÷ pièces fabriquées le jour.
     Les charges variables n'y entrent PAS.
   - ChargesAPI (en bas) : utilisé par Produits et le Tableau de bord.
   ============================================================ */

let CHARGES = [];          // charges saisies du mois affiché (paie + variables)
let CHARGES_FIXES = [];    // charges fixes (toutes)
let POINTAGES_C = [];      // pointages du mois affiché (pour savoir quels jours sont travaillés)
let fixesErr = '';
let curCharge = null;      // charge en cours de modification
let curFixe = null;        // charge fixe en cours de modification
let lastAutoC = null;      // dernier montant rempli automatiquement (paie du jour)

const $c = s => document.querySelector(s);
const CAT_PAIE = 'Paie des employés';
const CAT_VARIABLE = 'Autre charge';
// Catégories proposées à la saisie : la paie et les charges variables (les charges fixes se règlent plus haut)
const CATS = [
  { k: CAT_PAIE,     cls: 'g' },
  { k: CAT_VARIABLE, cls: 'n' }
];
const CATS_FIXES = ['Électricité', 'Loyer', 'Dîner des employés', 'Autre charge fixe'];
// Une charge fixe s'applique « depuis toujours » sauf si on indique une date de début
const DEBUT_TOUJOURS = '2000-01-01';
const depuisToujours = d => !d || d <= '2001-01-01';
const JOURS_C = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];

/* ---------- Utilitaires ---------- */
function escC(v) {
  return String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function round2C(n) { return Math.round((Number(n) || 0) * 100) / 100; }
function moneyC(n) {
  return (Number(n) || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' DA';
}
function isoC(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function fdC(s) { return s ? s.split('-').reverse().join('/') : ''; }
function joursDansMoisC(mois) { const [y, m] = mois.split('-').map(Number); return new Date(y, m, 0).getDate(); }
function jourC(dateStr) { const [y, m, d] = dateStr.split('-').map(Number); return JOURS_C[new Date(y, m - 1, d).getDay()]; }
function moisC() { return $c('#ch-mois').value || isoC(new Date()).slice(0, 7); }
function sumC(list) { return round2C(list.reduce((s, c) => s + Number(c.montant || 0), 0)); }
function noteC(c) { return [c.note, c.employe_nom ? '(' + c.employe_nom + ')' : ''].filter(Boolean).join(' '); }
function catClass(k) { const c = CATS.find(x => x.k === k); return c ? c.cls : 'n'; }
function toastC(msg) {
  const e = $c('#toastC');
  if (!e) return;
  e.textContent = msg; e.style.display = 'block';
  clearTimeout(toastC.t); toastC.t = setTimeout(() => e.style.display = 'none', 6000);
}
function errMsgC(error) {
  const m = (error && error.message) || String(error);
  if (/charges_fixes/i.test(m) && /schema cache|does not exist|Could not find|relation/i.test(m))
    return 'Table « charges_fixes » introuvable dans Supabase. Exécutez supabase/charges_fixes.sql dans SQL Editor, puis rechargez la page. (' + m + ')';
  if (/schema cache|does not exist|Could not find|column/i.test(m))
    return 'Table « charges » introuvable dans Supabase. Exécutez supabase/charges.sql dans SQL Editor, puis rechargez la page. (' + m + ')';
  if (/row-level security|permission denied|policy/i.test(m))
    return 'Accès refusé par Supabase (RLS). Réexécutez le fichier supabase/*.sql de la section. (' + m + ')';
  return m;
}

/* ---------- Charges fixes : quels jours s'appliquent-elles ? ---------- */
const pointeC = p => (typeof hrs === 'function' ? hrs(p) > 0 : Number(p.heures || 0) > 0);
const jourTravailleC = (date, pts) => pts.some(p => p.date_pointage === date && pointeC(p));
function fixeActifLe(f, date) {
  return f.actif !== false && (!f.date_debut || date >= f.date_debut) && (!f.date_fin || date <= f.date_fin);
}
/* Charges fixes applicables un jour donné (pts = pointages de ce jour ou du mois) */
function fixesPour(date, pts) {
  const t = jourTravailleC(date, pts);
  const lignes = CHARGES_FIXES.filter(f => fixeActifLe(f, date) && (f.jours === 'tous' || t));
  // charges définies mais non applicables ce jour-là, avec la raison (pour l'expliquer à l'écran)
  const exclues = CHARGES_FIXES.filter(f => !lignes.includes(f)).map(f => ({
    f, raison: f.actif === false ? 'arrêtée' : (f.date_debut && date < f.date_debut) ? 'commence le ' + fdC(f.date_debut)
      : (f.date_fin && date > f.date_fin) ? 'terminée le ' + fdC(f.date_fin) : 'jour non travaillé (aucun pointage)'
  }));
  return { total: round2C(lignes.reduce((s, f) => s + Number(f.montant || 0), 0)), lignes, exclues, travaille: t };
}
const fixesParJourC = f => round2C(CHARGES_FIXES.filter(x => x.actif !== false).reduce((s, x) => s + Number(x.montant || 0), 0));

/* ---------- Chargement ---------- */
async function loadFixes() {
  const r = await sb.from('charges_fixes').select('*').order('categorie', { ascending: true }).order('libelle', { ascending: true });
  if (r.error) { CHARGES_FIXES = []; fixesErr = errMsgC(r.error); return false; }
  CHARGES_FIXES = r.data || []; fixesErr = ''; return true;
}
async function loadCharges() {
  const mois = moisC();
  const d1 = mois + '-01', d2 = mois + '-' + String(joursDansMoisC(mois)).padStart(2, '0');
  await loadFixes();
  const [c, p] = await Promise.all([
    sb.from('charges').select('*').gte('date_charge', d1).lte('date_charge', d2).order('date_charge', { ascending: false }),
    sb.from('pointages').select('*').gte('date_pointage', d1).lte('date_pointage', d2)
  ]);
  POINTAGES_C = p.error ? [] : (p.data || []);
  if (c.error) {
    CHARGES = [];
    toastC('Erreur : ' + errMsgC(c.error));
    renderCharges(errMsgC(c.error));
    return;
  }
  CHARGES = c.data || [];
  renderCharges();
}

/* ---------- Calculs du mois ---------- */
/* Une ligne par jour : paie, charges fixes (calculées), charges variables (saisies) */
function joursDuMois() {
  const mois = moisC(), today = isoC(new Date()), n = joursDansMoisC(mois);
  const out = [];
  for (let i = 1; i <= n; i++) {
    const d = mois + '-' + String(i).padStart(2, '0');
    if (d > today) break;
    const saisies = CHARGES.filter(c => c.date_charge === d);
    const paie = sumC(saisies.filter(c => c.categorie === CAT_PAIE));
    const variables = sumC(saisies.filter(c => c.categorie !== CAT_PAIE));
    const fx = fixesPour(d, POINTAGES_C);
    if (paie || variables || fx.total) out.push({ d, paie, variables, fixes: fx.total, lignes: fx.lignes, total: round2C(paie + variables + fx.total) });
  }
  return out;
}

/* ---------- Affichage ---------- */
function filteredCharges() {
  const cat = $c('#ch-fcat').value;
  const q = ($c('#ch-q').value || '').toLowerCase().trim();
  return CHARGES
    .filter(c => (!cat || c.categorie === cat) &&
      (!q || [c.note, c.employe_nom, c.categorie].join(' ').toLowerCase().includes(q)))
    .sort((a, b) => b.date_charge.localeCompare(a.date_charge) || String(b.created_at).localeCompare(String(a.created_at)));
}

function renderStatsCharges() {
  const jours = joursDuMois();
  const paie = round2C(jours.reduce((s, j) => s + j.paie, 0)), fixes = round2C(jours.reduce((s, j) => s + j.fixes, 0));
  const vars = round2C(jours.reduce((s, j) => s + j.variables, 0)), total = round2C(paie + fixes + vars);
  const nj = jours.length || 1;
  const pc = v => (total ? Math.round(v / total * 100) : 0) + ' % du total';
  $c('#ch-stats').innerHTML =
    '<div class="at-stat"><span>Total des charges du mois</span><b>' + moneyC(total) + '</b><small style="color:var(--mut)">Moyenne : ' + moneyC(total / nj) + ' / jour travaillé</small></div>' +
    '<div class="at-stat"><span>Paie des employés</span><b>' + moneyC(paie) + '</b><small style="color:var(--mut)">' + pc(paie) + '</small></div>' +
    '<div class="at-stat"><span>Charges fixes</span><b>' + moneyC(fixes) + '</b><small style="color:var(--mut)">' + moneyC(fixesParJourC()) + ' / jour · ' + pc(fixes) + '</small></div>' +
    '<div class="at-stat"><span>Charges variables</span><b>' + moneyC(vars) + '</b><small style="color:var(--mut)">hors main d’œuvre · ' + pc(vars) + '</small></div>';
}

function renderFixes() {
  const body = $c('#cf-tbody'), quick = $c('#cf-quick');
  quick.style.display = (!CHARGES_FIXES.length && !fixesErr && $c('#cf-form').style.display !== 'block') ? 'block' : 'none';
  if (fixesErr) { body.innerHTML = '<tr><td colspan="6" class="at-empty" style="color:#b00020">⚠ ' + escC(fixesErr) + '</td></tr>'; return; }
  const ordre = f => (f.actif !== false ? 0 : 1);
  const rows = [...CHARGES_FIXES].sort((a, b) => ordre(a) - ordre(b) || a.categorie.localeCompare(b.categorie) || a.libelle.localeCompare(b.libelle));
  body.innerHTML = rows.length ? rows.map(f =>
    '<tr' + (f.actif === false ? ' style="opacity:.55"' : '') + '><td><b>' + escC(f.libelle) + '</b>' + (f.note ? '<small>' + escC(f.note) + '</small>' : '') + '</td>' +
    '<td><span class="bd n">' + escC(f.categorie) + '</span></td>' +
    '<td><b>' + moneyC(f.montant) + '</b> / jour</td>' +
    '<td>' + (f.jours === 'tous' ? 'Tous les jours' : 'Jours travaillés') + (f.actif === false ? '<small>Arrêtée</small>' : '') + '</td>' +
    '<td>' + (depuisToujours(f.date_debut) ? 'depuis toujours' : 'depuis le ' + fdC(f.date_debut)) + (f.date_fin ? '<small>jusqu’au ' + fdC(f.date_fin) + '</small>' : '') + '</td>' +
    '<td class="emp-act"><button class="btn s" type="button" onclick="showFormFixe(\'' + escC(f.id) + '\')">Modifier</button> ' +
    '<button class="btn s d" type="button" onclick="removeFixe(\'' + escC(f.id) + '\')">Supprimer</button></td></tr>'
  ).join('') + '<tr class="pr-total"><td colspan="2">Total des charges fixes par jour (actives)</td><td colspan="4">' + moneyC(fixesParJourC()) + '</td></tr>'
    : '<tr><td colspan="6" class="at-empty">Aucune charge fixe. Saisissez-les ci-dessus, une seule fois.</td></tr>';
}

function renderCharges(errText) {
  renderStatsCharges(); renderFixes();
  const list = filteredCharges();
  const body = $c('#ch-tbody'), recap = $c('#ch-jours');

  if (errText) {
    body.innerHTML = '<tr><td colspan="5" class="at-empty" style="color:#b00020">⚠ ' + escC(errText) + '</td></tr>';
    recap.innerHTML = '<tr><td colspan="6" class="at-empty">—</td></tr>';
    return;
  }

  // Récapitulatif par jour (les charges fixes sont calculées, pas saisies)
  const jours = joursDuMois();
  recap.innerHTML = jours.length ? jours.map(j =>
    '<tr><td><b>' + fdC(j.d) + '</b></td><td>' + jourC(j.d) + '</td>' +
    '<td>' + (j.paie ? moneyC(j.paie) : '—') + '</td>' +
    '<td' + (j.lignes.length ? ' title="' + escC(j.lignes.map(f => f.libelle + ' ' + moneyC(f.montant)).join(' · ')) + '"' : '') + '>' + (j.fixes ? moneyC(j.fixes) : '—') +
      (j.lignes.length ? '<small>' + escC(j.lignes.map(f => f.libelle).join(', ')) + '</small>' : '') + '</td>' +
    '<td>' + (j.variables ? moneyC(j.variables) : '—') + '</td>' +
    '<td><b>' + moneyC(j.total) + '</b></td></tr>'
  ).join('') +
    '<tr style="font-weight:700;background:var(--nb)"><td colspan="2">Total du mois</td>' +
    '<td>' + moneyC(jours.reduce((s, j) => s + j.paie, 0)) + '</td><td>' + moneyC(jours.reduce((s, j) => s + j.fixes, 0)) + '</td>' +
    '<td>' + moneyC(jours.reduce((s, j) => s + j.variables, 0)) + '</td><td>' + moneyC(jours.reduce((s, j) => s + j.total, 0)) + '</td></tr>'
    : '<tr><td colspan="6" class="at-empty">Aucune charge pour ce mois.</td></tr>';

  // Détail des charges saisies
  body.innerHTML = list.length ? list.map(c =>
    '<tr><td>' + fdC(c.date_charge) + '<br><small>' + jourC(c.date_charge) + '</small></td>' +
    '<td><span class="bd ' + catClass(c.categorie) + '">' + escC(c.categorie) + '</span></td>' +
    '<td>' + escC(noteC(c)) + '</td>' +
    '<td><b>' + moneyC(c.montant) + '</b></td>' +
    '<td class="emp-act"><button class="btn s" type="button" onclick="showFormCharge(\'' + escC(c.id) + '\')">Modifier</button> ' +
    '<button class="btn s d" type="button" onclick="removeCharge(\'' + escC(c.id) + '\')">Supprimer</button></td></tr>'
  ).join('') : '<tr><td colspan="5" class="at-empty">Aucune charge' + (CHARGES.length ? ' ne correspond au filtre' : ' saisie ce mois-ci. Cliquez sur « + Charge variable / paie »') + '.</td></tr>';
}

/* ---------- Formulaire : paie et charges variables ---------- */
/* Paie du jour = somme du gain de TOUS les employés pointés ce jour-là
   (heures normales × taux + heures sup × taux sup, comme dans l'onglet Employés). */
async function paieDuJour(date) {
  if (typeof EMPLOYES === 'undefined' || !EMPLOYES.length || typeof gainPointage !== 'function') return null;
  const { data, error } = await sb.from('pointages').select('*').eq('date_pointage', date);
  if (error) return null;
  let total = 0, n = 0;
  (data || []).forEach(p => {
    const e = EMPLOYES.find(x => String(x.id) === String(p.employe_id));
    if (!e || hrs(p) <= 0) return;
    n++; total += gainPointage(p, e);
  });
  return { total: round2C(total), n };
}

/* Calcule la paie du jour pour la date choisie ; prefill = remplir le montant */
async function updateHint(prefill) {
  const hint = $c('#ch-hint');
  if ($c('#ch-cat').value !== CAT_PAIE) {
    hint.textContent = 'Charge variable : elle n’entre pas dans la main d’œuvre. Les charges fixes (dîner, loyer, électricité…) se règlent une seule fois dans « Charges fixes de chaque jour ».';
    return;
  }
  const date = $c('#ch-date').value, cat = $c('#ch-cat').value;
  if (!date) { hint.textContent = ''; return; }
  hint.textContent = 'Calcul de la paie du jour…';
  const r = await paieDuJour(date);
  // la saisie a changé pendant le calcul : on abandonne
  if ($c('#ch-date').value !== date || $c('#ch-cat').value !== cat) return;
  if (!r) { hint.textContent = 'Paie automatique indisponible (employés non chargés) : saisissez le montant à la main.'; return; }
  const deja = CHARGES.filter(c => c.categorie === CAT_PAIE && c.date_charge === date && String(c.id) !== String(curCharge));
  let txt = r.n
    ? 'Paie du jour calculée automatiquement : ' + r.n + ' employé' + (r.n > 1 ? 's' : '') + ' pointé' + (r.n > 1 ? 's' : '') + ' → ' + moneyC(r.total) + '. Vous pouvez modifier le montant.'
    : 'Aucun pointage enregistré ce jour-là : saisissez le montant à la main.';
  if (deja.length) txt += ' ⚠ Une paie de ' + moneyC(sumC(deja)) + ' est déjà enregistrée à cette date.';
  hint.textContent = txt;
  if (prefill && r.total > 0) { $c('#ch-montant').value = r.total; lastAutoC = String(r.total); }
}

function showFormCharge(id) {
  curCharge = id || null;
  const c = id ? CHARGES.find(x => String(x.id) === String(id)) : null;
  const mois = moisC(), today = isoC(new Date());
  // une ancienne charge (Électricité, Loyer, Dîner…) saisie jour par jour reste modifiable
  const cats = CATS.map(x => x.k);
  if (c && !cats.includes(c.categorie)) cats.push(c.categorie);
  $c('#ch-cat').innerHTML = cats.map(k => '<option value="' + escC(k) + '">' + escC(k === CAT_VARIABLE ? 'Charge variable' : k) + '</option>').join('');
  $c('#ch-form-title').textContent = c ? 'Modifier la charge' : 'Nouvelle charge (paie ou charge variable)';
  $c('#ch-date').value = c ? c.date_charge : (today.startsWith(mois) ? today : mois + '-01');
  $c('#ch-cat').value = c ? c.categorie : CATS[0].k;
  $c('#ch-montant').value = c ? c.montant : '';
  $c('#ch-note').value = c ? (c.note || '') : '';
  $c('#ch-submit').textContent = c ? 'Enregistrer les modifications' : 'Ajouter la charge';
  $c('#ch-form').style.display = 'block';
  $c('#ch-form').scrollIntoView({ behavior: 'smooth', block: 'start' });
  $c('#ch-montant').focus();
  updateHint(!c);   // nouvelle charge « Paie » : montant pré-rempli avec la paie du jour
}

function cancelFormCharge() {
  curCharge = null;
  $c('#ch-form').style.display = 'none';
}

/* ---------- Enregistrement / suppression (paie et variables) ---------- */
async function saveCharge() {
  const date = $c('#ch-date').value;
  const categorie = $c('#ch-cat').value;
  const montant = parseFloat($c('#ch-montant').value) || 0;
  const note = $c('#ch-note').value.trim();

  if (!date) { toastC('La date est obligatoire.'); return; }
  if (!categorie) { toastC('Choisissez une catégorie.'); return; }
  if (montant <= 0) { toastC('Le montant doit être supérieur à 0.'); return; }

  const payload = { date_charge: date, categorie, montant, note };

  const res = curCharge
    ? await sb.from('charges').update(payload).eq('id', curCharge).select()
    : await sb.from('charges').insert([payload]).select();
  if (res.error) { toastC('Erreur : ' + errMsgC(res.error)); return; }

  const wasEdit = !!curCharge;
  toastC(wasEdit ? 'Charge modifiée.' : 'Charge ajoutée.');
  // Afficher le mois de la charge enregistrée
  if (date.slice(0, 7) !== moisC()) $c('#ch-mois').value = date.slice(0, 7);
  if (wasEdit) cancelFormCharge();
  else { $c('#ch-montant').value = ''; $c('#ch-note').value = ''; $c('#ch-montant').focus(); updateHint(false); }
  await loadCharges();
}

async function removeCharge(id) {
  const c = CHARGES.find(x => String(x.id) === String(id));
  if (!c || !confirm('Supprimer cette charge (' + c.categorie + ' — ' + moneyC(c.montant) + ' le ' + fdC(c.date_charge) + ') ?')) return;
  const { error } = await sb.from('charges').delete().eq('id', id);
  if (error) { toastC('Erreur : ' + errMsgC(error)); return; }
  if (String(curCharge) === String(id)) cancelFormCharge();
  toastC('Charge supprimée.');
  await loadCharges();
}

/* ---------- Charges fixes : saisie unique ---------- */
function showFormFixe(id) {
  curFixe = id || null;
  const f = id ? CHARGES_FIXES.find(x => String(x.id) === String(id)) : null;
  $c('#cf-form-title').textContent = f ? 'Modifier la charge fixe' : 'Nouvelle charge fixe';
  $c('#cf-libelle').value = f ? f.libelle : '';
  $c('#cf-cat').value = f ? f.categorie : CATS_FIXES[3];
  $c('#cf-montant').value = f ? f.montant : '';
  $c('#cf-jours').value = f ? f.jours : 'travailles';
  $c('#cf-debut').value = f && !depuisToujours(f.date_debut) ? f.date_debut : '';     // vide = depuis toujours
  $c('#cf-fin').value = f ? (f.date_fin || '') : '';
  $c('#cf-note').value = f ? (f.note || '') : '';
  $c('#cf-actif').checked = f ? f.actif !== false : true;
  $c('#cf-submit').textContent = f ? 'Enregistrer les modifications' : 'Ajouter la charge fixe';
  $c('#cf-quick').style.display = 'none';
  $c('#cf-form').style.display = 'block';
  majHintFixe();
  $c('#cf-form').scrollIntoView({ behavior: 'smooth', block: 'center' });
  $c('#cf-libelle').focus();
}
function cancelFormFixe() { curFixe = null; $c('#cf-form').style.display = 'none'; renderFixes(); }
function majHintFixe() {
  const m = parseFloat($c('#cf-montant').value) || 0;
  $c('#cf-hint').textContent = m ? moneyC(m) + ' par jour ≈ ' + moneyC(m * 26) + ' par mois (26 jours travaillés). Elle s’applique automatiquement chaque jour, sans ressaisie.' : '';
}
// Le nom saisi propose la bonne catégorie
function devinerCatFixe(nom) {
  const n = String(nom || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  if (/loyer/.test(n)) return 'Loyer';
  if (/elec|steg|sonelgaz|courant/.test(n)) return 'Électricité';
  if (/diner|dejeuner|repas|cantine/.test(n)) return 'Dîner des employés';
  return null;
}

async function saveFixe() {
  const libelle = $c('#cf-libelle').value.trim(), montant = parseFloat($c('#cf-montant').value);
  if (!libelle) { toastC('Le nom de la charge fixe est obligatoire.'); return; }
  if (!(montant >= 0)) { toastC('Indiquez le montant par jour.'); return; }
  const payload = {
    libelle, categorie: $c('#cf-cat').value, montant, jours: $c('#cf-jours').value, date_debut: $c('#cf-debut').value || DEBUT_TOUJOURS,
    date_fin: $c('#cf-fin').value || null, actif: $c('#cf-actif').checked, note: $c('#cf-note').value.trim()
  };
  if (payload.date_fin && payload.date_fin < payload.date_debut) { toastC('La date de fin doit être après la date de début.'); return; }
  const res = curFixe
    ? await sb.from('charges_fixes').update(payload).eq('id', curFixe).select()
    : await sb.from('charges_fixes').insert([payload]).select();
  if (res.error) { toastC('Erreur : ' + errMsgC(res.error)); return; }
  toastC(curFixe ? 'Charge fixe modifiée.' : 'Charge fixe ajoutée : elle s’applique à chaque jour.');
  curFixe = null; $c('#cf-form').style.display = 'none';
  await loadCharges();
  document.dispatchEvent(new Event('mariabag:charges'));
}
async function saveFixesRapides() {
  const lignes = [
    ['Dîner des employés', 'Dîner des employés', parseFloat($c('#cq-diner').value) || 0],
    ['Loyer', 'Loyer', parseFloat($c('#cq-loyer').value) || 0],
    ['Électricité', 'Électricité', parseFloat($c('#cq-elec').value) || 0],
    ['Autre charge fixe', 'Autre charge fixe', parseFloat($c('#cq-autre').value) || 0]
  ].filter(l => l[2] > 0);
  if (!lignes.length) { toastC('Indiquez au moins un montant par jour.'); return; }
  const debut = DEBUT_TOUJOURS;       // les charges fixes habituelles s'appliquent aussi aux jours passés
  const res = await sb.from('charges_fixes').insert(lignes.map(l => ({ libelle: l[0], categorie: l[1], montant: l[2], jours: 'travailles', date_debut: debut, actif: true, note: '' }))).select();
  if (res.error) { toastC('Erreur : ' + errMsgC(res.error)); return; }
  toastC(lignes.length + ' charge(s) fixe(s) enregistrée(s) : elles s’appliquent automatiquement à chaque jour travaillé.');
  await loadCharges();
  document.dispatchEvent(new Event('mariabag:charges'));
}
async function removeFixe(id) {
  const f = CHARGES_FIXES.find(x => String(x.id) === String(id));
  if (!f || !confirm('Supprimer la charge fixe « ' + f.libelle + ' » (' + moneyC(f.montant) + ' / jour) ?\nElle disparaîtra aussi des jours passés. Pour l’arrêter à partir d’une date, utilisez plutôt « Modifier » > « Jusqu’au ».')) return;
  const { error } = await sb.from('charges_fixes').delete().eq('id', id);
  if (error) { toastC('Erreur : ' + errMsgC(error)); return; }
  toastC('Charge fixe supprimée.');
  await loadCharges();
  document.dispatchEvent(new Event('mariabag:charges'));
}

/* ---------- Export Excel ---------- */
function exportCharges() {
  if (typeof XLSX === 'undefined') { toastC('Bibliothèque Excel non chargée.'); return; }
  const mois = moisC();
  const jours = joursDuMois();
  const parJour = jours.map(j => ({
    Date: fdC(j.d), Jour: jourC(j.d), 'Paie des employés': j.paie, 'Charges fixes': j.fixes,
    'Détail charges fixes': j.lignes.map(f => f.libelle + ' ' + f.montant).join(' + '), 'Charges variables': j.variables, 'Total du jour': j.total
  }));
  parJour.push({ Date: 'TOTAL', Jour: '', 'Paie des employés': round2C(jours.reduce((s, j) => s + j.paie, 0)), 'Charges fixes': round2C(jours.reduce((s, j) => s + j.fixes, 0)),
    'Détail charges fixes': '', 'Charges variables': round2C(jours.reduce((s, j) => s + j.variables, 0)), 'Total du jour': round2C(jours.reduce((s, j) => s + j.total, 0)) });
  const detail = [...CHARGES].sort((a, b) => a.date_charge.localeCompare(b.date_charge)).map(c => ({
    Date: fdC(c.date_charge), Jour: jourC(c.date_charge), 'Catégorie': c.categorie, Note: noteC(c), 'Montant (DA)': Number(c.montant || 0)
  }));
  const fixes = CHARGES_FIXES.map(f => ({
    Charge: f.libelle, 'Catégorie': f.categorie, 'Montant par jour (DA)': Number(f.montant || 0), "S'applique": f.jours === 'tous' ? 'Tous les jours' : 'Jours travaillés',
    'Depuis le': depuisToujours(f.date_debut) ? 'depuis toujours' : fdC(f.date_debut), "Jusqu'au": fdC(f.date_fin), Active: f.actif === false ? 'Non' : 'Oui'
  }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(parJour), 'Par jour ' + mois);
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(detail), 'Saisies ' + mois);
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(fixes), 'Charges fixes');
  XLSX.writeFile(wb, 'MARIA-BAG_charges_' + mois + '.xlsx');
}

/* ============================================================
   ChargesAPI — utilisé par Produits (main d'œuvre) et le Tableau de bord
   ============================================================ */
window.ChargesAPI = {
  loadFixes,
  list: () => CHARGES_FIXES,
  /* Charges FIXES d'un jour (jours travaillés : d'après le pointage de ce jour) */
  async fixesDuJour(date) {
    await loadFixes();
    const r = await sb.from('pointages').select('*').eq('date_pointage', date);
    const f = fixesPour(date, r.error ? [] : (r.data || []));
    return { total: f.total, lignes: f.lignes, exclues: f.exclues, travaille: f.travaille, installee: !fixesErr, nbDefinies: CHARGES_FIXES.length, erreur: fixesErr };
  },
  /* Empreinte des charges fixes : change dès qu'on en modifie une (pour recalculer la main d'œuvre) */
  signature: () => CHARGES_FIXES.map(f => [f.id, f.montant, f.jours, f.date_debut, f.date_fin, f.actif].join(':')).join('|'),
  /* Total des charges fixes d'un mois (jusqu'à aujourd'hui) */
  async moisFixes(mois) {
    await loadFixes();
    const d1 = mois + '-01', d2 = mois + '-' + String(joursDansMoisC(mois)).padStart(2, '0'), today = isoC(new Date());
    const r = await sb.from('pointages').select('*').gte('date_pointage', d1).lte('date_pointage', d2);
    const pts = r.error ? [] : (r.data || []);
    let total = 0, jours = 0;
    for (let i = 1; i <= joursDansMoisC(mois); i++) {
      const d = mois + '-' + String(i).padStart(2, '0'); if (d > today) break;
      const f = fixesPour(d, pts); if (f.total) { total += f.total; jours++; }
    }
    return { total: round2C(total), jours, parJour: fixesParJourC() };
  }
};

/* ---------- Initialisation et événements ---------- */
$c('#ch-mois').value = isoC(new Date()).slice(0, 7);
$c('#ch-cat').innerHTML = CATS.map(c => '<option>' + escC(c.k) + '</option>').join('');
$c('#cf-cat').innerHTML = CATS_FIXES.map(k => '<option>' + escC(k) + '</option>').join('');
$c('#ch-fcat').innerHTML = '<option value="">Toutes les catégories</option><option>' + CAT_PAIE + '</option><option>' + CAT_VARIABLE + '</option>';

$c('#ch-mois').addEventListener('change', loadCharges);
$c('#ch-fcat').addEventListener('change', () => renderCharges());
$c('#ch-q').addEventListener('input', () => renderCharges());
// Efface l'ancien montant automatique (jamais un montant saisi à la main)
function clearAutoMontant() { if (!curCharge && lastAutoC !== null && String($c('#ch-montant').value) === lastAutoC) { $c('#ch-montant').value = ''; lastAutoC = null; } }
$c('#ch-cat').addEventListener('change', () => { $c('#ch-hint').textContent = ''; clearAutoMontant(); updateHint(!curCharge); });
$c('#ch-date').addEventListener('change', () => { clearAutoMontant(); updateHint(!curCharge); });
$c('#ch-form').addEventListener('submit', ev => { ev.preventDefault(); saveCharge(); });
$c('#cf-form').addEventListener('submit', ev => { ev.preventDefault(); saveFixe(); });
$c('#cf-quick').addEventListener('submit', ev => { ev.preventDefault(); saveFixesRapides(); });
$c('#cf-montant').addEventListener('input', majHintFixe);
$c('#cf-libelle').addEventListener('change', () => { const k = devinerCatFixe($c('#cf-libelle').value); if (k && !curFixe) $c('#cf-cat').value = k; });
// Recharge les charges à chaque ouverture de l'onglet
document.querySelector('nav button[data-v="charges"]').addEventListener('click', loadCharges);

document.addEventListener('mariabag:authenticated', loadCharges);
if (!document.getElementById('app').classList.contains('hide')) loadCharges();
