/* ============================================================
   MARIA BAG — Employés : salaire par POINTAGE (heures par jour)
   - Employé : nom, prénom, poste, taux horaire (DA / heure)
   - Pointage : heures travaillées chaque jour
   - Acomptes : avances versées pendant le mois
   - Fin de mois : salaire = heures × taux horaire
                   reste   = salaire − acomptes
       reste > 0  → à payer        reste = 0 → soldé
       reste < 0  → l'employé a reçu plus que son salaire (avance en trop)
   ============================================================ */

let EMPLOYES = [], ACOMPTES = [], POINTAGES = [];   // ACOMPTES / POINTAGES = mois affiché
let curEmploye = null;   // employé en cours de modification
let selEmploye = null;   // employé dont le détail est ouvert
let curAcompte = null;   // acompte en cours de modification

const $e = s => document.querySelector(s);
const JOURS = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];

/* ---------- Utilitaires ---------- */
function escE(v) {
  return String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function round2(n) { return Math.round((Number(n) || 0) * 100) / 100; }
function money(n) {
  return (Number(n) || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' DA';
}
function fmtH(n) {
  return (Number(n) || 0).toLocaleString('fr-FR', { maximumFractionDigits: 2 }) + ' h';
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
  if (/schema cache|does not exist|Could not find|column/i.test(m))
    return 'Tables ou colonnes introuvables dans Supabase. Exécutez supabase/employes.sql puis supabase/employes_pointage.sql dans SQL Editor, puis rechargez la page. (' + m + ')';
  if (/row-level security|permission denied|policy/i.test(m))
    return 'Accès refusé par Supabase (RLS). Réexécutez supabase/employes_pointage.sql. (' + m + ')';
  return m;
}

/* ---------- Calendrier ---------- */
function joursDansMois(mois) { const [y, m] = mois.split('-').map(Number); return new Date(y, m, 0).getDate(); }
function jourSemaine(dateStr) { const [y, m, d] = dateStr.split('-').map(Number); return new Date(y, m - 1, d).getDay(); }
// S1 = jours 1-7, S2 = 8-14, S3 = 15-21, S4 = 22-28, S5 = 29-fin
function semaineDuMois(dateStr) { return Math.ceil(Number(dateStr.slice(8, 10)) / 7); }
function labelSemaine(n, mois) {
  const fin = joursDansMois(mois);
  return 'Semaine ' + n + ' (' + ((n - 1) * 7 + 1) + '–' + Math.min(n * 7, fin) + ')';
}

/* ---------- Calculs ---------- */
function acomptesDuMois(empId, mois) {
  return ACOMPTES
    .filter(a => String(a.employe_id) === String(empId) && (a.date_acompte || '').startsWith(mois))
    .sort((x, y) => x.date_acompte.localeCompare(y.date_acompte));
}
function pointagesDuMois(empId, mois) {
  return POINTAGES.filter(p => String(p.employe_id) === String(empId) && (p.date_pointage || '').startsWith(mois));
}
function totalAcomptes(empId, mois) { return round2(acomptesDuMois(empId, mois).reduce((s, a) => s + Number(a.montant || 0), 0)); }
function heuresDuMois(empId, mois) { return round2(pointagesDuMois(empId, mois).reduce((s, p) => s + Number(p.heures || 0), 0)); }
function joursTravailles(empId, mois) { return pointagesDuMois(empId, mois).filter(p => Number(p.heures) > 0).length; }
function salaireDuMois(emp, mois) { return round2(heuresDuMois(emp.id, mois) * Number(emp.taux_horaire || 0)); }
function resteSalaire(emp, mois) { return round2(salaireDuMois(emp, mois) - totalAcomptes(emp.id, mois)); }
function statut(reste) {
  if (reste > 0) return { txt: 'À payer', color: 'var(--g)' };
  if (reste === 0) return { txt: 'Soldé', color: '#555' };
  return { txt: 'Avance en trop', color: 'var(--r)' };
}

/* ---------- Supabase : chargement ---------- */
async function loadEmployes() {
  const e = await sb.from('employes').select('*').order('nom', { ascending: true });
  if (e.error) { showLoadError(e.error); return; }
  EMPLOYES = e.data || [];
  await loadMois();
}
async function loadMois() {
  const mois = curMonth();
  const d1 = mois + '-01', d2 = mois + '-' + String(joursDansMois(mois)).padStart(2, '0');
  const [a, p] = await Promise.all([
    sb.from('acomptes').select('*').gte('date_acompte', d1).lte('date_acompte', d2).order('date_acompte', { ascending: true }),
    sb.from('pointages').select('*').gte('date_pointage', d1).lte('date_pointage', d2)
  ]);
  if (a.error || p.error) { showLoadError(a.error || p.error); return; }
  ACOMPTES = a.data || [];
  POINTAGES = p.data || [];
  renderEmployes();
}
function showLoadError(error) {
  const msg = errMsgE(error);
  toastE('Erreur : ' + msg);
  const tb = $e('#emp-tbody');
  if (tb) tb.innerHTML = '<tr><td colspan="9" class="at-empty" style="color:#b00020">⚠ ' + escE(msg) + '</td></tr>';
}

/* ---------- Employés : enregistrer / supprimer ---------- */
async function saveEmploye() {
  const o = {
    nom: $e('#emp-nom').value.trim(),
    prenom: $e('#emp-prenom').value.trim(),
    poste: $e('#emp-poste').value.trim(),
    taux_horaire: Number($e('#emp-taux').value) || 0,
    notes: $e('#emp-notes').value.trim()
  };
  if (!o.nom) { toastE('Le nom est obligatoire.'); return; }
  if (o.taux_horaire < 0) { toastE('Le taux horaire ne peut pas être négatif.'); return; }
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
  if (!emp || !confirm('Supprimer ' + emp.nom + ' ' + (emp.prenom || '') + ', ses pointages et ses acomptes ?')) return;
  const { error } = await sb.from('employes').delete().eq('id', id);
  if (error) { toastE('Erreur : ' + errMsgE(error)); return; }
  EMPLOYES = EMPLOYES.filter(x => String(x.id) !== String(id));
  ACOMPTES = ACOMPTES.filter(a => String(a.employe_id) !== String(id));
  POINTAGES = POINTAGES.filter(p => String(p.employe_id) !== String(id));
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
  $e('#emp-taux').value = curEmploye ? curEmploye.taux_horaire : '';
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

/* ---------- Pointage (heures par jour) ---------- */
function setPointageLocal(row) {
  POINTAGES = POINTAGES.filter(p => !(String(p.employe_id) === String(row.employe_id) && p.date_pointage === row.date_pointage));
  POINTAGES.push(row);
}

async function savePointage(date, val) {
  const emp = EMPLOYES.find(x => String(x.id) === String(selEmploye));
  if (!emp) return;
  const raw = String(val ?? '').trim().replace(',', '.');
  if (raw === '') {                                    // champ vidé → on supprime le pointage
    const { error } = await sb.from('pointages').delete().eq('employe_id', emp.id).eq('date_pointage', date);
    if (error) { toastE('Erreur : ' + errMsgE(error)); return; }
    POINTAGES = POINTAGES.filter(p => !(String(p.employe_id) === String(emp.id) && p.date_pointage === date));
  } else {
    const h = Number(raw);
    if (isNaN(h) || h < 0 || h > 24) { toastE('Heures invalides : entrez un nombre entre 0 et 24.'); renderPanel(); return; }
    const { data, error } = await sb.from('pointages')
      .upsert({ employe_id: emp.id, date_pointage: date, heures: h }, { onConflict: 'employe_id,date_pointage' })
      .select().single();
    if (error) { toastE('Erreur : ' + errMsgE(error)); return; }
    setPointageLocal(data);
  }
  const cell = document.getElementById('gain-' + date);
  if (cell) cell.textContent = money(round2((Number(raw.replace(',', '.')) || 0) * Number(emp.taux_horaire || 0)));
  renderEmployes(true);        // met à jour totaux et résumé sans reconstruire la grille (garde le curseur)
}

function quickPointage(date, present) {
  const input = document.getElementById('pt-' + date);
  const h = present ? (Number($e('#pt-defaut').value) || 0) : '';
  if (input) input.value = h;
  savePointage(date, h);
}

// Remplit tous les jours vides du mois (jusqu'à aujourd'hui), sauf le jour de repos choisi
async function fillMois() {
  const emp = EMPLOYES.find(x => String(x.id) === String(selEmploye));
  if (!emp) return;
  const h = Number($e('#pt-defaut').value) || 0;
  if (h <= 0 || h > 24) { toastE('Indiquez des heures par jour entre 0 et 24.'); return; }
  const repos = Number($e('#pt-repos').value);
  const mois = curMonth(), today = isoE(new Date());
  const deja = new Set(pointagesDuMois(emp.id, mois).map(p => p.date_pointage));
  const rows = [];
  for (let d = 1; d <= joursDansMois(mois); d++) {
    const date = mois + '-' + String(d).padStart(2, '0');
    if (date > today || deja.has(date) || jourSemaine(date) === repos) continue;
    rows.push({ employe_id: emp.id, date_pointage: date, heures: h });
  }
  if (!rows.length) { toastE('Aucun jour vide à remplir.'); return; }
  if (!confirm('Pointer ' + rows.length + ' jour(s) à ' + h + ' h pour ' + emp.nom + ' ' + (emp.prenom || '') + ' ?')) return;
  const { data, error } = await sb.from('pointages').upsert(rows, { onConflict: 'employe_id,date_pointage' }).select();
  if (error) { toastE('Erreur : ' + errMsgE(error)); return; }
  (data || []).forEach(setPointageLocal);
  renderEmployes();
  toastE(rows.length + ' jour(s) pointé(s).');
}

/* ---------- Acomptes ---------- */
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
  renderEmployes(true);
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
  renderEmployes(true);
  toastE('Acompte supprimé.');
}

/* ---------- Affichage : tableau principal ---------- */
function renderEmployes(skipGrid) {
  const mois = curMonth();
  const q = ($e('#emp-q').value || '').toLowerCase();
  const list = EMPLOYES.filter(e => !q || [e.nom, e.prenom, e.poste].join(' ').toLowerCase().includes(q));

  const totSal = round2(EMPLOYES.reduce((s, e) => s + salaireDuMois(e, mois), 0));
  const totAc = round2(EMPLOYES.reduce((s, e) => s + totalAcomptes(e.id, mois), 0));
  $e('#emp-stats').innerHTML =
    '<div class="at-stat"><span>Employés</span><b>' + EMPLOYES.length + '</b></div>' +
    '<div class="at-stat"><span>Total salaires du mois</span><b>' + money(totSal) + '</b></div>' +
    '<div class="at-stat"><span>Acomptes versés</span><b>' + money(totAc) + '</b></div>' +
    '<div class="at-stat"><span>Reste à payer</span><b>' + money(totSal - totAc) + '</b></div>';

  const tb = $e('#emp-tbody');
  if (!list.length) {
    tb.innerHTML = '<tr><td colspan="9" class="at-empty">Aucun employé. Cliquez sur « + Nouvel employé ».</td></tr>';
  } else {
    tb.innerHTML = list.map(e => {
      const h = heuresDuMois(e.id, mois), j = joursTravailles(e.id, mois);
      const sal = salaireDuMois(e, mois), ac = totalAcomptes(e.id, mois), reste = round2(sal - ac), st = statut(reste);
      return '<tr' + (String(e.id) === String(selEmploye) ? ' style="background:var(--nb)"' : '') + '>' +
        '<td><b>' + escE(e.nom) + '</b> ' + escE(e.prenom) + '</td>' +
        '<td>' + escE(e.poste) + '</td>' +
        '<td>' + money(e.taux_horaire) + ' / h</td>' +
        '<td>' + j + '</td>' +
        '<td>' + fmtH(h) + '</td>' +
        '<td>' + money(sal) + '</td>' +
        '<td>' + money(ac) + '</td>' +
        '<td><b style="color:' + st.color + '">' + money(reste) + '</b><br><small style="color:' + st.color + '">' + st.txt + '</small></td>' +
        '<td class="emp-act">' +
          '<button class="btn s p" type="button" onclick="openAcomptes(\'' + e.id + '\')">Pointage</button> ' +
          '<button class="btn s" type="button" onclick="showFormEmploye(\'' + e.id + '\')">Modifier</button> ' +
          '<button class="btn s d" type="button" onclick="removeEmploye(\'' + e.id + '\')">Supprimer</button>' +
        '</td></tr>';
    }).join('') +
    '<tr style="font-weight:700;background:var(--nb)"><td colspan="3">Total</td><td>' +
      list.reduce((s, e) => s + joursTravailles(e.id, mois), 0) + '</td><td>' +
      fmtH(list.reduce((s, e) => s + heuresDuMois(e.id, mois), 0)) + '</td><td>' +
      money(list.reduce((s, e) => s + salaireDuMois(e, mois), 0)) + '</td><td>' +
      money(list.reduce((s, e) => s + totalAcomptes(e.id, mois), 0)) + '</td><td>' +
      money(list.reduce((s, e) => s + resteSalaire(e, mois), 0)) + '</td><td></td></tr>';
  }
  renderPanel(skipGrid);
}

/* ---------- Affichage : panneau pointage + acomptes d'un employé ---------- */
function openAcomptes(id) {
  selEmploye = id; curAcompte = null;
  $e('#ac-montant').value = ''; $e('#ac-note').value = '';
  $e('#ac-submit').textContent = 'Ajouter l’acompte';
  const mois = curMonth(), today = isoE(new Date());
  $e('#ac-date').value = today.startsWith(mois) ? today : mois + '-01';
  renderEmployes();
  $e('#ac-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
}
function closeAcomptes() {
  selEmploye = null; curAcompte = null;
  $e('#ac-panel').style.display = 'none';
  renderEmployes();
}

function renderPanel(skipGrid) {
  const panel = $e('#ac-panel');
  const emp = EMPLOYES.find(x => String(x.id) === String(selEmploye));
  if (!emp) { panel.style.display = 'none'; return; }
  panel.style.display = 'block';
  const mois = curMonth(), taux = Number(emp.taux_horaire || 0);
  const items = acomptesDuMois(emp.id, mois);
  const heures = heuresDuMois(emp.id, mois), jours = joursTravailles(emp.id, mois);
  const sal = salaireDuMois(emp, mois), ac = totalAcomptes(emp.id, mois);
  const reste = round2(sal - ac), st = statut(reste);
  const nbSem = Math.ceil(joursDansMois(mois) / 7);

  $e('#ac-title').textContent = 'Pointage et acomptes — ' + emp.nom + ' ' + (emp.prenom || '') + ' (' + mois.split('-').reverse().join('/') + ')';

  let resume =
    '<div class="at-stat"><span>Taux horaire</span><b>' + money(taux) + '</b></div>' +
    '<div class="at-stat"><span>Heures travaillées (' + jours + ' jour' + (jours > 1 ? 's' : '') + ')</span><b>' + fmtH(heures) + '</b></div>' +
    '<div class="at-stat"><span>Salaire du mois</span><b>' + money(sal) + '</b></div>' +
    '<div class="at-stat"><span>Acomptes déjà versés</span><b>' + money(ac) + '</b></div>' +
    '<div class="at-stat"><span>Reste à payer — ' + st.txt + '</span><b style="color:' + st.color + '">' + money(reste) + '</b></div>';
  if (taux === 0) resume += '<div class="at-stat" style="grid-column:1/-1;color:var(--r)">⚠ Le taux horaire est à 0 DA : cliquez sur « Modifier » pour l’indiquer.</div>';
  if (reste < 0) resume += '<div class="at-stat" style="grid-column:1/-1;color:var(--r)">⚠ L’employé a reçu ' + money(-reste) + ' de plus que son salaire du mois.</div>';
  $e('#ac-resume').innerHTML = resume;

  if (!skipGrid) renderGrid(emp, mois);

  // Récapitulatif par semaine
  let cumul = 0, rows = '', totH = 0, totG = 0, totA = 0;
  for (let s = 1; s <= nbSem; s++) {
    const h = round2(pointagesDuMois(emp.id, mois).filter(p => semaineDuMois(p.date_pointage) === s).reduce((t, p) => t + Number(p.heures || 0), 0));
    const gain = round2(h * taux);
    const a = round2(items.filter(x => semaineDuMois(x.date_acompte) === s).reduce((t, x) => t + Number(x.montant || 0), 0));
    cumul = round2(cumul + gain - a); totH += h; totG += gain; totA += a;
    rows += '<tr><td>' + labelSemaine(s, mois) + '</td><td>' + (h ? fmtH(h) : '—') + '</td><td>' + (gain ? money(gain) : '—') + '</td><td>' + (a ? money(a) : '—') + '</td><td>' + money(cumul) + '</td></tr>';
  }
  rows += '<tr style="font-weight:700;background:var(--nb)"><td>Total du mois</td><td>' + fmtH(totH) + '</td><td>' + money(totG) + '</td><td>' + money(totA) + '</td><td style="color:' + st.color + '">' + money(reste) + '</td></tr>';
  $e('#ac-semaines').innerHTML = rows;

  // Détail des acomptes
  $e('#ac-liste').innerHTML = items.length ? items.map(a =>
    '<tr><td><b>' + escE(emp.nom) + '</b></td><td>' + escE(emp.prenom) + '</td><td>' + fdE(a.date_acompte) + '</td><td>' + labelSemaine(semaineDuMois(a.date_acompte), mois).split(' (')[0] + '</td><td>' + money(a.montant) + '</td><td>' + escE(a.note) + '</td>' +
    '<td><button class="btn s" type="button" onclick="editAcompte(\'' + a.id + '\')">Modifier</button> ' +
    '<button class="btn s d" type="button" onclick="removeAcompte(\'' + a.id + '\')">Supprimer</button></td></tr>'
  ).join('') : '<tr><td colspan="7" class="at-empty">Aucun acompte ce mois-ci.</td></tr>';
}

function renderGrid(emp, mois) {
  const taux = Number(emp.taux_horaire || 0);
  const map = {};
  pointagesDuMois(emp.id, mois).forEach(p => { map[p.date_pointage] = p; });
  let html = '';
  for (let d = 1; d <= joursDansMois(mois); d++) {
    const date = mois + '-' + String(d).padStart(2, '0');
    const p = map[date], h = p ? Number(p.heures) : '';
    html += '<tr><td>' + fdE(date) + '</td><td>' + JOURS[jourSemaine(date)] + '</td><td>S' + semaineDuMois(date) + '</td>' +
      '<td><input id="pt-' + date + '" type="number" min="0" max="24" step="0.25" value="' + h + '" style="width:90px" onchange="savePointage(\'' + date + '\', this.value)"></td>' +
      '<td id="gain-' + date + '">' + money(round2((h || 0) * taux)) + '</td>' +
      '<td><button class="btn s" type="button" onclick="quickPointage(\'' + date + '\', true)">Présent</button> ' +
      '<button class="btn s" type="button" onclick="quickPointage(\'' + date + '\', false)">Effacer</button></td></tr>';
  }
  $e('#pt-grid').innerHTML = html;
}

/* ---------- Export Excel (modifiable) ---------- */
function exportEmployes() {
  if (typeof XLSX === 'undefined') { toastE('Bibliothèque Excel non chargée.'); return; }
  const mois = curMonth(), nj = joursDansMois(mois), nbSem = Math.ceil(nj / 7);
  const rows = EMPLOYES.map(e => {
    const its = acomptesDuMois(e.id, mois);
    const r = { Nom: e.nom, Prénom: e.prenom || '', Poste: e.poste || '', 'Taux horaire': Number(e.taux_horaire || 0),
                'Jours travaillés': joursTravailles(e.id, mois), 'Heures': heuresDuMois(e.id, mois), 'Salaire du mois': salaireDuMois(e, mois) };
    for (let s = 1; s <= nbSem; s++)
      r['Acompte S' + s] = round2(its.filter(a => semaineDuMois(a.date_acompte) === s).reduce((t, a) => t + Number(a.montant || 0), 0));
    r['Total acomptes'] = totalAcomptes(e.id, mois);
    r['Reste à payer'] = resteSalaire(e, mois);
    r['Statut'] = statut(r['Reste à payer']).txt;
    return r;
  });
  const pts = EMPLOYES.map(e => {
    const r = { Nom: e.nom, Prénom: e.prenom || '' };
    const m = {}; pointagesDuMois(e.id, mois).forEach(p => { m[Number(p.date_pointage.slice(8, 10))] = Number(p.heures); });
    for (let d = 1; d <= nj; d++) r[String(d)] = m[d] ?? '';
    r['Total heures'] = heuresDuMois(e.id, mois);
    return r;
  });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Salaires ' + mois);
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(pts), 'Pointage ' + mois);
  XLSX.writeFile(wb, 'MARIA-BAG_salaires_' + mois + '.xlsx');
}

/* ---------- Événements ---------- */
$e('#emp-mois').value = isoE(new Date()).slice(0, 7);
$e('#emp-mois').addEventListener('change', loadMois);
$e('#emp-q').addEventListener('input', () => renderEmployes());
$e('#ac-form').addEventListener('submit', ev => { ev.preventDefault(); saveAcompte(); });

document.addEventListener('mariabag:authenticated', loadEmployes);
if (!document.getElementById('app').classList.contains('hide')) loadEmployes();