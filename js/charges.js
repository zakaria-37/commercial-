/* ============================================================
   MARIA BAG — Charges de l'atelier (dépenses de chaque jour)
   - Catégories : paie des employés (total de la journée, calculé
     automatiquement d'après le pointage), électricité, loyer,
     dîner des employés, autre charge
   - Une ligne = une dépense (date, catégorie, montant, note)
   - Récapitulatif par jour + total par catégorie + export Excel
   ============================================================ */

let CHARGES = [];          // charges du mois affiché
let curCharge = null;      // charge en cours de modification
let lastAutoC = null;      // dernier montant rempli automatiquement (paie du jour)

const $c = s => document.querySelector(s);
const CAT_PAIE = 'Paie des employés';
const CATS = [
  { k: CAT_PAIE,             cls: 'g' },
  { k: 'Électricité',        cls: 'o' },
  { k: 'Loyer',              cls: 'r' },
  { k: 'Dîner des employés', cls: 'n' },
  { k: 'Autre charge',       cls: 'n' }
];
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
  if (/schema cache|does not exist|Could not find|column/i.test(m))
    return 'Table « charges » introuvable dans Supabase. Exécutez supabase/charges.sql dans SQL Editor, puis rechargez la page. (' + m + ')';
  if (/row-level security|permission denied|policy/i.test(m))
    return 'Accès refusé par Supabase (RLS). Réexécutez supabase/charges.sql. (' + m + ')';
  return m;
}

/* ---------- Chargement ---------- */
async function loadCharges() {
  const mois = moisC();
  const d1 = mois + '-01', d2 = mois + '-' + String(joursDansMoisC(mois)).padStart(2, '0');
  const { data, error } = await sb.from('charges').select('*')
    .gte('date_charge', d1).lte('date_charge', d2)
    .order('date_charge', { ascending: false });
  if (error) {
    CHARGES = [];
    toastC('Erreur : ' + errMsgC(error));
    renderCharges(errMsgC(error));
    return;
  }
  CHARGES = data || [];
  renderCharges();
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

function renderStats() {
  const mois = moisC(), today = isoC(new Date()), mAuj = today.slice(0, 7);
  const nj = mois < mAuj ? joursDansMoisC(mois) : (mois === mAuj ? Number(today.slice(8, 10)) : 1);
  const total = sumC(CHARGES);
  let html = '<div class="at-stat"><span>Total des charges du mois</span><b>' + moneyC(total) + '</b>' +
    '<small style="color:var(--mut)">Moyenne : ' + moneyC(total / nj) + ' / jour</small></div>';
  CATS.forEach(c => {
    const t = sumC(CHARGES.filter(x => x.categorie === c.k));
    html += '<div class="at-stat"><span>' + escC(c.k) + '</span><b>' + moneyC(t) + '</b>' +
      '<small style="color:var(--mut)">' + (total ? Math.round(t / total * 100) : 0) + ' % du total</small></div>';
  });
  $c('#ch-stats').innerHTML = html;
}

function renderCharges(errText) {
  renderStats();
  const list = filteredCharges();
  const body = $c('#ch-tbody'), recap = $c('#ch-jours');

  if (errText) {
    body.innerHTML = '<tr><td colspan="5" class="at-empty" style="color:#b00020">⚠ ' + escC(errText) + '</td></tr>';
    recap.innerHTML = '<tr><td colspan="7" class="at-empty">—</td></tr>';
    return;
  }

  // Récapitulatif par jour
  const byDay = {};
  list.forEach(c => { (byDay[c.date_charge] = byDay[c.date_charge] || []).push(c); });
  const days = Object.keys(byDay).sort();
  recap.innerHTML = days.length ? days.map(d => {
    const its = byDay[d];
    return '<tr><td><b>' + fdC(d) + '</b></td><td>' + jourC(d) + '</td>' +
      CATS.map(c => { const t = sumC(its.filter(x => x.categorie === c.k)); return '<td>' + (t ? moneyC(t) : '—') + '</td>'; }).join('') +
      '<td><b>' + moneyC(sumC(its)) + '</b></td></tr>';
  }).join('') +
    '<tr style="font-weight:700;background:var(--nb)"><td colspan="2">Total</td>' +
    CATS.map(c => '<td>' + moneyC(sumC(list.filter(x => x.categorie === c.k))) + '</td>').join('') +
    '<td>' + moneyC(sumC(list)) + '</td></tr>'
    : '<tr><td colspan="' + (3 + CATS.length) + '" class="at-empty">Aucune charge pour ce mois.</td></tr>';

  // Détail
  body.innerHTML = list.length ? list.map(c =>
    '<tr><td>' + fdC(c.date_charge) + '<br><small>' + jourC(c.date_charge) + '</small></td>' +
    '<td><span class="bd ' + catClass(c.categorie) + '">' + escC(c.categorie) + '</span></td>' +
    '<td>' + escC(noteC(c)) + '</td>' +
    '<td><b>' + moneyC(c.montant) + '</b></td>' +
    '<td class="emp-act"><button class="btn s" type="button" onclick="showFormCharge(\'' + escC(c.id) + '\')">Modifier</button> ' +
    '<button class="btn s d" type="button" onclick="removeCharge(\'' + escC(c.id) + '\')">Supprimer</button></td></tr>'
  ).join('') : '<tr><td colspan="5" class="at-empty">Aucune charge' + (CHARGES.length ? ' ne correspond au filtre' : ' ce mois-ci. Cliquez sur « + Nouvelle charge »') + '.</td></tr>';
}

/* ---------- Formulaire ---------- */
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
  if ($c('#ch-cat').value !== CAT_PAIE) { hint.textContent = ''; return; }
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
  $c('#ch-form-title').textContent = c ? 'Modifier la charge' : 'Nouvelle charge';
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

/* ---------- Enregistrement / suppression ---------- */
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
  else { $c('#ch-montant').value = ''; $c('#ch-note').value = ''; $c('#ch-hint').textContent = ''; $c('#ch-montant').focus(); }
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

/* ---------- Export Excel ---------- */
function exportCharges() {
  if (typeof XLSX === 'undefined') { toastC('Bibliothèque Excel non chargée.'); return; }
  const mois = moisC();
  const list = [...CHARGES].sort((a, b) => a.date_charge.localeCompare(b.date_charge));
  const detail = list.map(c => ({
    Date: fdC(c.date_charge), Jour: jourC(c.date_charge), 'Catégorie': c.categorie,
    Note: noteC(c), 'Montant (DA)': Number(c.montant || 0)
  }));
  const days = [...new Set(list.map(c => c.date_charge))];
  const parJour = days.map(d => {
    const its = list.filter(c => c.date_charge === d);
    const r = { Date: fdC(d), Jour: jourC(d) };
    CATS.forEach(c => { r[c.k] = sumC(its.filter(x => x.categorie === c.k)); });
    r['Total du jour'] = sumC(its);
    return r;
  });
  const tot = { Date: 'TOTAL', Jour: '' };
  CATS.forEach(c => { tot[c.k] = sumC(list.filter(x => x.categorie === c.k)); });
  tot['Total du jour'] = sumC(list);
  parJour.push(tot);

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(parJour), 'Par jour ' + mois);
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(detail), 'Détail ' + mois);
  XLSX.writeFile(wb, 'MARIA-BAG_charges_' + mois + '.xlsx');
}

/* ---------- Initialisation et événements ---------- */
$c('#ch-mois').value = isoC(new Date()).slice(0, 7);
$c('#ch-cat').innerHTML = CATS.map(c => '<option>' + escC(c.k) + '</option>').join('');
$c('#ch-fcat').innerHTML = '<option value="">Toutes les catégories</option>' + CATS.map(c => '<option>' + escC(c.k) + '</option>').join('');

$c('#ch-mois').addEventListener('change', loadCharges);
$c('#ch-fcat').addEventListener('change', () => renderCharges());
$c('#ch-q').addEventListener('input', () => renderCharges());
// Efface l'ancien montant automatique (jamais un montant saisi à la main)
function clearAutoMontant() { if (!curCharge && lastAutoC !== null && String($c('#ch-montant').value) === lastAutoC) { $c('#ch-montant').value = ''; lastAutoC = null; } }
$c('#ch-cat').addEventListener('change', () => { $c('#ch-hint').textContent = ''; clearAutoMontant(); updateHint(!curCharge); });
$c('#ch-date').addEventListener('change', () => { clearAutoMontant(); updateHint(!curCharge); });
$c('#ch-form').addEventListener('submit', ev => { ev.preventDefault(); saveCharge(); });
// Recharge les charges à chaque ouverture de l'onglet
document.querySelector('nav button[data-v="charges"]').addEventListener('click', loadCharges);

document.addEventListener('mariabag:authenticated', loadCharges);
if (!document.getElementById('app').classList.contains('hide')) loadCharges();