/* ============================================================
   MARIA BAG — Gestion des employés, salaires et acomptes
   - Employé : nom, prénom, poste, salaire par mois
   - Acomptes : avances versées chaque semaine
   - Reste du salaire du mois = salaire mensuel − total des acomptes du mois
   ============================================================ */

let EMPLOYES = [], ACOMPTES = [];
let curEmploye = null;      // employé en cours de modification
let selEmploye = null;      // id de l'employé dont on gère les acomptes
let curAcompte = null;      // acompte en cours de modification

const $e = s => document.querySelector(s);

/* ---------- Utilitaires ---------- */
function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function money(n) {
  return (Number(n) || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' DA';
}
function isoE(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function fdE(s) { return s ? s.split('-').reverse().join('/') : ''; }
function curMonth() { return $e('#emp-mois').value || isoE(new Date()).slice(0, 7); }
function toastE(msg) {
  const e = $e('#toastE');
  if (!e) return;
  e.textContent = msg; e.style.display = 'block';
  clearTimeout(toastE.t); toastE.t = setTimeout(() => e.style.display = 'none', 6000);
}
function errMsgE(error) {
  const m = (error && error.message) || String(error);
  if (/schema cache|does not exist|Could not find the table/i.test(m))
    return 'Tables employés introuvables dans Supabase. Exécutez supabase/employes.sql dans SQL Editor, puis rechargez la page. (' + m + ')';
  if (/row-level security|permission denied|policy/i.test(m))
    return 'Accès refusé par Supabase (RLS). Réexécutez supabase/employes.sql. (' + m + ')';
  return m;
}

/* ---------- Calculs ---------- */
// Acomptes d'un employé pour un mois donné (format YYYY-MM)
function acomptesDuMois(empId, mois) {
  return ACOMPTES
    .filter(a => String(a.employe_id) === String(empId) && (a.date_acompte || '').startsWith(mois))
    .sort((x, y) => x.date_acompte.localeCompare(y.date_acompte));
}
function totalAcomptes(empId, mois) {
  return acomptesDuMois(empId, mois).reduce((s, a) => s + Number(a.montant || 0), 0);
}
function resteSalaire(emp, mois) {
  return Number(emp.salaire_mensuel || 0) - totalAcomptes(emp.id, mois);
}
// Semaine du mois : S1 = jours 1-7, S2 = 8-14, S3 = 15-21, S4 = 22-28, S5 = 29-fin
function semaineDuMois(dateStr) {
  const jour = Number(dateStr.slice(8, 10));
  return Math.ceil(jour / 7);
}
function joursDansMois(mois) {
  const [y, m] = mois.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}
function labelSemaine(n, mois) {
  const fin = joursDansMois(mois);
  const d1 = (n - 1) * 7 + 1, d2 = Math.min(n * 7, fin);
  return 'Semaine ' + n + ' (' + d1 + '–' + d2 + ')';
}

/* ---------- Supabase : employés ---------- */
async function loadEmployes() {
  const [e, a] = await Promise.all([
    sb.from('employes').select('*').order('nom', { ascending: true }),
    sb.from('acomptes').select('*').order('date_acompte', { ascending: true })
  ]);
  if (e.error || a.error) {
    const msg = errMsgE(e.error || a.error);
    toastE('Erreur : ' + msg);
    const tb = $e('#emp-tbody');
    if (tb) tb.innerHTML = '<tr><td colspan="7" class="at-empty" style="color:#b00020">⚠ ' + esc(msg) + '</td></tr>';
    return;
  }
  EMPLOYES = e.data || [];
  ACOMPTES = a.data || [];
  renderEmployes();
}

async function saveEmploye() {
  const o = {
    nom: $e('#emp-nom').value.trim(),
    prenom: $e('#emp-prenom').value.trim(),
    poste: $e('#emp-poste').value.trim(),
    salaire_mensuel: Number($e('#emp-salaire').value) || 0,
    notes: $e('#emp-notes').value.trim()
  };
  if (!o.nom) { toastE('Le nom est obligatoire.'); return; }
  if (o.salaire_mensuel < 0) { toastE('Le salaire ne peut pas être négatif.'); return; }
  const q = curEmploye ? sb.from('employes').update(o).eq('id', curEmploye.id) : sb.from('employes').insert(o);
  const { data, error } = await q.select().single();
  if (error) { toastE('Erreur : ' + errMsgE(error)); return; }
  if (curEmploye) EMPLOYES = EMPLOYES.map(x => x.id === data.id ? data : x);
  else EMPLOYES.push(data);
  EMPLOYES.sort((a, b) => (a.nom || '').localeCompare(b.nom || ''));
  cancelFormEmploye();
  renderEmployes();
  toastE('Employé enregistré.');
}

async function removeEmploye(id) {
  const emp = EMPLOYES.find(x => String(x.id) === String(id));
  if (!emp || !confirm('Supprimer ' + emp.nom + ' ' + (emp.prenom || '') + ' et tous ses acomptes ?')) return;
  const { error } = await sb.from('employes').delete().eq('id', id);
  if (error) { toastE('Erreur : ' + errMsgE(error)); return; }
  EMPLOYES = EMPLOYES.filter(x => String(x.id) !== String(id));
  ACOMPTES = ACOMPTES.filter(a => String(a.employe_id) !== String(id));
  if (String(selEmploye) === String(id)) closeAcomptes();
  renderEmployes();
  toastE('Employé supprimé.');
}

function showFormEmploye(id) {
  curEmploye = id ? EMPLOYES.find(x => String(x.id) === String(id)) : null;
  const f = $e('#emp-form');
  f.style.display = 'block';
  $e('#emp-nom').value = curEmploye?.nom || '';
  $e('#emp-prenom').value = curEmploye?.prenom || '';
  $e('#emp-poste').value = curEmploye?.poste || '';
  $e('#emp-salaire').value = curEmploye ? curEmploye.salaire_mensuel : '';
  $e('#emp-notes').value = curEmploye?.notes || '';
  $e('#emp-form-title').textContent = curEmploye ? 'Modifier l’employé' : 'Nouvel employé';
  f.scrollIntoView({ behavior: 'smooth', block: 'center' });
  $e('#emp-nom').focus();
}
function cancelFormEmploye() {
  curEmploye = null;
  $e('#emp-form').style.display = 'none';
  $e('#emp-form').reset();
}

/* ---------- Supabase : acomptes ---------- */
async function saveAcompte() {
  const o = {
    employe_id: selEmploye,
    date_acompte: $e('#ac-date').value,
    montant: Number($e('#ac-montant').value) || 0,
    note: $e('#ac-note').value.trim()
  };
  if (!o.employe_id || !o.date_acompte || o.montant <= 0) { toastE('Indiquez une date et un montant supérieur à 0.'); return; }
  const q = curAcompte ? sb.from('acomptes').update(o).eq('id', curAcompte.id) : sb.from('acomptes').insert(o);
  const { data, error } = await q.select().single();
  if (error) { toastE('Erreur : ' + errMsgE(error)); return; }
  if (curAcompte) ACOMPTES = ACOMPTES.map(x => x.id === data.id ? data : x);
  else ACOMPTES.push(data);
  curAcompte = null;
  $e('#ac-montant').value = ''; $e('#ac-note').value = '';
  $e('#ac-submit').textContent = 'Ajouter l’acompte';
  renderEmployes();
  toastE('Acompte enregistré.');
}

function editAcompte(id) {
  const a = ACOMPTES.find(x => String(x.id) === String(id));
  if (!a) return;
  curAcompte = a;
  $e('#ac-date').value = a.date_acompte;
  $e('#ac-montant').value = a.montant;
  $e('#ac-note').value = a.note || '';
  $e('#ac-submit').textContent = 'Enregistrer la modification';
  $e('#ac-montant').focus();
}

async function removeAcompte(id) {
  if (!confirm('Supprimer cet acompte ?')) return;
  const { error } = await sb.from('acomptes').delete().eq('id', id);
  if (error) { toastE('Erreur : ' + errMsgE(error)); return; }
  ACOMPTES = ACOMPTES.filter(x => String(x.id) !== String(id));
  if (curAcompte && String(curAcompte.id) === String(id)) curAcompte = null;
  renderEmployes();
  toastE('Acompte supprimé.');
}

/* ---------- Affichage ---------- */
function renderEmployes() {
  const mois = curMonth();
  const q = ($e('#emp-q').value || '').toLowerCase();
  const list = EMPLOYES.filter(e => !q || [e.nom, e.prenom, e.poste].join(' ').toLowerCase().includes(q));

  // Indicateurs du mois
  const totSal = EMPLOYES.reduce((s, e) => s + Number(e.salaire_mensuel || 0), 0);
  const totAc = EMPLOYES.reduce((s, e) => s + totalAcomptes(e.id, mois), 0);
  $e('#emp-stats').innerHTML =
    '<div class="at-stat"><span>Employés</span><b>' + EMPLOYES.length + '</b></div>' +
    '<div class="at-stat"><span>Total salaires du mois</span><b>' + money(totSal) + '</b></div>' +
    '<div class="at-stat"><span>Acomptes versés</span><b>' + money(totAc) + '</b></div>' +
    '<div class="at-stat"><span>Reste à payer</span><b>' + money(totSal - totAc) + '</b></div>';

  // Tableau
  const tb = $e('#emp-tbody');
  if (!list.length) {
    tb.innerHTML = '<tr><td colspan="7" class="at-empty">Aucun employé. Cliquez sur « + Nouvel employé ».</td></tr>';
  } else {
    tb.innerHTML = list.map(e => {
      const ac = totalAcomptes(e.id, mois), reste = Number(e.salaire_mensuel || 0) - ac;
      return '<tr' + (String(e.id) === String(selEmploye) ? ' style="background:var(--nb)"' : '') + '>' +
        '<td><b>' + esc(e.nom) + '</b> ' + esc(e.prenom) + '</td>' +
        '<td>' + esc(e.poste) + '</td>' +
        '<td>' + money(e.salaire_mensuel) + '</td>' +
        '<td>' + money(ac) + '</td>' +
        '<td><b style="color:' + (reste < 0 ? 'var(--r)' : 'var(--g)') + '">' + money(reste) + '</b></td>' +
        '<td class="emp-act">' +
          '<button class="btn s p" type="button" onclick="openAcomptes(\'' + e.id + '\')">Acomptes</button> ' +
          '<button class="btn s" type="button" onclick="showFormEmploye(\'' + e.id + '\')">Modifier</button> ' +
          '<button class="btn s d" type="button" onclick="removeEmploye(\'' + e.id + '\')">Supprimer</button>' +
        '</td></tr>';
    }).join('') +
    '<tr style="font-weight:700;background:var(--nb)"><td colspan="2">Total</td><td>' +
      money(list.reduce((s, e) => s + Number(e.salaire_mensuel || 0), 0)) + '</td><td>' +
      money(list.reduce((s, e) => s + totalAcomptes(e.id, mois), 0)) + '</td><td>' +
      money(list.reduce((s, e) => s + resteSalaire(e, mois), 0)) + '</td><td></td></tr>';
  }
  renderAcomptes();
}

function openAcomptes(id) {
  selEmploye = id; curAcompte = null;
  $e('#ac-montant').value = ''; $e('#ac-note').value = '';
  $e('#ac-submit').textContent = 'Ajouter l’acompte';
  const mois = curMonth();
  const today = isoE(new Date());
  $e('#ac-date').value = today.startsWith(mois) ? today : mois + '-01';
  renderEmployes();
  $e('#ac-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
}
function closeAcomptes() {
  selEmploye = null; curAcompte = null;
  $e('#ac-panel').style.display = 'none';
  renderEmployes();
}

function renderAcomptes() {
  const panel = $e('#ac-panel');
  const emp = EMPLOYES.find(x => String(x.id) === String(selEmploye));
  if (!emp) { panel.style.display = 'none'; return; }
  panel.style.display = 'block';
  const mois = curMonth();
  const items = acomptesDuMois(emp.id, mois);
  const total = items.reduce((s, a) => s + Number(a.montant || 0), 0);
  const reste = Number(emp.salaire_mensuel || 0) - total;
  const nbSem = Math.ceil(joursDansMois(mois) / 7);

  $e('#ac-title').textContent = 'Acomptes — ' + emp.nom + ' ' + (emp.prenom || '') + ' (' + mois.split('-').reverse().join('/') + ')';
  $e('#ac-resume').innerHTML =
    '<div class="at-stat"><span>Salaire mensuel</span><b>' + money(emp.salaire_mensuel) + '</b></div>' +
    '<div class="at-stat"><span>Acomptes du mois</span><b>' + money(total) + '</b></div>' +
    '<div class="at-stat"><span>Reste du salaire</span><b style="color:' + (reste < 0 ? 'var(--r)' : 'var(--g)') + '">' + money(reste) + '</b></div>';
  if (reste < 0) $e('#ac-resume').innerHTML += '<div class="at-stat" style="grid-column:1/-1;color:var(--r)">⚠ Les acomptes dépassent le salaire de ' + money(-reste) + '.</div>';

  // Récapitulatif par semaine
  let cumul = 0, rows = '';
  for (let s = 1; s <= nbSem; s++) {
    const m = items.filter(a => semaineDuMois(a.date_acompte) === s).reduce((t, a) => t + Number(a.montant || 0), 0);
    cumul += m;
    rows += '<tr><td>' + labelSemaine(s, mois) + '</td><td>' + (m ? money(m) : '—') + '</td><td>' + money(Number(emp.salaire_mensuel || 0) - cumul) + '</td></tr>';
  }
  $e('#ac-semaines').innerHTML = rows;

  // Liste détaillée
  $e('#ac-liste').innerHTML = items.length ? items.map(a =>
    '<tr><td>' + fdE(a.date_acompte) + '</td><td>' + labelSemaine(semaineDuMois(a.date_acompte), mois).split(' (')[0] + '</td><td>' + money(a.montant) + '</td><td>' + esc(a.note) + '</td>' +
    '<td><button class="btn s" type="button" onclick="editAcompte(\'' + a.id + '\')">Modifier</button> ' +
    '<button class="btn s d" type="button" onclick="removeAcompte(\'' + a.id + '\')">Supprimer</button></td></tr>'
  ).join('') : '<tr><td colspan="5" class="at-empty">Aucun acompte ce mois-ci.</td></tr>';
}

/* ---------- Export Excel (modifiable) ---------- */
function exportEmployes() {
  if (typeof XLSX === 'undefined') { toastE('Bibliothèque Excel non chargée.'); return; }
  const mois = curMonth();
  const nbSem = Math.ceil(joursDansMois(mois) / 7);
  const rows = EMPLOYES.map(e => {
    const r = { Nom: e.nom, Prénom: e.prenom || '', Poste: e.poste || '', 'Salaire mensuel': Number(e.salaire_mensuel || 0) };
    const its = acomptesDuMois(e.id, mois);
    for (let s = 1; s <= nbSem; s++)
      r['Acompte S' + s] = its.filter(a => semaineDuMois(a.date_acompte) === s).reduce((t, a) => t + Number(a.montant || 0), 0);
    r['Total acomptes'] = its.reduce((t, a) => t + Number(a.montant || 0), 0);
    r['Reste du salaire'] = r['Salaire mensuel'] - r['Total acomptes'];
    return r;
  });
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Salaires ' + mois);
  XLSX.writeFile(wb, 'MARIA-BAG_salaires_' + mois + '.xlsx');
}

/* ---------- Événements ---------- */
$e('#emp-mois').value = isoE(new Date()).slice(0, 7);
$e('#emp-mois').addEventListener('change', renderEmployes);
$e('#emp-q').addEventListener('input', renderEmployes);
$e('#ac-form').addEventListener('submit', ev => { ev.preventDefault(); saveAcompte(); });

document.addEventListener('mariabag:authenticated', loadEmployes, { once: false });
// Session déjà ouverte au rechargement
if (!document.getElementById('app').classList.contains('hide')) loadEmployes();
