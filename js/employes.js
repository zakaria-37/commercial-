/* ============================================================
   MARIA BAG — Employés : salaire par POINTAGE (heures par jour)
   ============================================================ */

let EMPLOYES = [], ACOMPTES = [], POINTAGES = [], POINT_ALL = [], REMISES = [], CREDITS = [], hsForm = null, hsErr = '', crForm = null, crErr = '';
let curEmploye = null;
let selEmploye = null;
let curAcompte = null;

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
  const t = Math.round((Number(n) || 0) * 60), h = Math.floor(t / 60), m = t % 60;
  return h + ' h' + (m ? ' ' + String(m).padStart(2, '0') + ' min' : '');
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
function semaineDuMois(dateStr) { return Math.ceil(Number(dateStr.slice(8, 10)) / 7); }
function labelSemaine(n, mois) {
  const fin = joursDansMois(mois);
  return 'Semaine ' + n + ' (' + ((n - 1) * 7 + 1) + '\u2013' + Math.min(n * 7, fin) + ')';
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
function minutesEntre(deb, fin) {
  const [h1, m1] = deb.split(':').map(Number), [h2, m2] = fin.split(':').map(Number);
  return (h2 * 60 + m2) - (h1 * 60 + m1);
}
function toMin(t) { const [h, m] = String(t).slice(0, 5).split(':').map(Number); return h * 60 + m; }
/* Pause 12:00-13:00 : NON comptée dans les heures de travail (sauf le jour de repos) */
const PAUSE_DEB = 12 * 60, PAUSE_FIN = 13 * 60;
function pauseMin(deb, fin, dateStr) {
  const repos = $e('#pt-repos') ? Number($e('#pt-repos').value) : 5;
  if (dateStr && jourSemaine(String(dateStr).slice(0, 10)) === repos) return 0;
  return Math.max(0, Math.min(fin, PAUSE_FIN) - Math.max(deb, PAUSE_DEB));
}
function hrs(p) {
  if (p.heure_debut && p.heure_fin) {
    const deb = toMin(p.heure_debut), fin = toMin(p.heure_fin);
    const m = fin - deb - pauseMin(deb, fin, p.date_pointage);
    return m > 0 ? m / 60 : 0;
  }
  return Number(p.heures || 0);
}
function tauxSup(emp) { return Number(emp.taux_heure_sup) > 0 ? Number(emp.taux_heure_sup) : Number(emp.taux_horaire || 0); }
function finNormale(emp) { return String(emp.heure_fin_normale || '19:00').slice(0, 5); }
function detail(p, emp) {
  if (p.heure_debut && p.heure_fin) {
    const deb = toMin(p.heure_debut), fin = toMin(p.heure_fin), lim = toMin(finNormale(emp));
    if (fin <= deb) return { norm: 0, sup: 0 };
    const finN = Math.min(fin, lim);
    const normMin = Math.max(0, finN - deb - pauseMin(deb, finN, p.date_pointage));
    return { norm: normMin / 60, sup: Math.max(0, fin - Math.max(deb, lim)) / 60 };
  }
  return { norm: Number(p.heures || 0), sup: 0 };
}
function gainPointage(p, emp) {
  const d = detail(p, emp);
  return d.norm * Number(emp.taux_horaire || 0) + d.sup * tauxSup(emp);
}
function heuresDuMois(empId, mois) { return pointagesDuMois(empId, mois).reduce((s, p) => s + hrs(p), 0); }
function heuresNormales(emp, mois) { return pointagesDuMois(emp.id, mois).reduce((s, p) => s + detail(p, emp).norm, 0); }
function heuresSup(emp, mois) { return pointagesDuMois(emp.id, mois).reduce((s, p) => s + detail(p, emp).sup, 0); }
function joursTravailles(empId, mois) { return pointagesDuMois(empId, mois).filter(p => hrs(p) > 0).length; }
function salaireDuMois(emp, mois) { return round2(pointagesDuMois(emp.id, mois).reduce((s, p) => s + gainPointage(p, emp), 0)); }
/* Paie ordinaire (heures normales) et paie des heures supplémentaires, séparées :
   les acomptes se déduisent de la paie ordinaire ; les heures sup sont mises de côté et remises plus tard */
function paieOrdinaire(emp, mois) { return round2(pointagesDuMois(emp.id, mois).reduce((s, p) => s + detail(p, emp).norm * Number(emp.taux_horaire || 0), 0)); }
function paieSup(emp, mois) { return round2(pointagesDuMois(emp.id, mois).reduce((s, p) => s + detail(p, emp).sup * tauxSup(emp), 0)); }
/* Crédit personnel : crédits accordés + soldes de départ − retenues sur salaire = reste dû par l'employé */
function opsCr(empId) { return CREDITS.filter(r => String(r.employe_id) === String(empId)).sort((a, b) => String(b.date_op).localeCompare(String(a.date_op))); }
function crSomme(empId, type) { return round2(opsCr(empId).filter(r => r.type === type).reduce((s, r) => s + Number(r.montant || 0), 0)); }
function soldeCredit(empId) { return round2(crSomme(empId, 'credit') + crSomme(empId, 'report') - crSomme(empId, 'retenue')); }
function retenueMois(empId, mois) { return round2(opsCr(empId).filter(r => r.type === 'retenue' && String(r.date_op || '').startsWith(mois)).reduce((s, r) => s + Number(r.montant || 0), 0)); }
function resteSalaire(emp, mois) { return round2(paieOrdinaire(emp, mois) - totalAcomptes(emp.id, mois) - retenueMois(emp.id, mois)); }
/* Heures sup mises de côté, tous mois confondus : gagné + soldes de départ − remises déjà faites */
function supGagnee(emp) { return round2(POINT_ALL.filter(p => String(p.employe_id) === String(emp.id)).reduce((s, p) => s + detail(p, emp).sup * tauxSup(emp), 0)); }
function opsHS(empId) { return REMISES.filter(r => String(r.employe_id) === String(empId)).sort((a, b) => String(b.date_op).localeCompare(String(a.date_op))); }
function supReportee(empId) { return round2(opsHS(empId).filter(r => r.type === 'report').reduce((s, r) => s + Number(r.montant || 0), 0)); }
function supRemise(empId) { return round2(opsHS(empId).filter(r => r.type === 'remise').reduce((s, r) => s + Number(r.montant || 0), 0)); }
function soldeSup(emp) { return round2(supGagnee(emp) + supReportee(emp.id) - supRemise(emp.id)); }
function statut(reste) {
  if (reste > 0) return { txt: '\u00c0 payer', color: 'var(--g)' };
  if (reste === 0) return { txt: 'Sold\u00e9', color: '#555' };
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
  const [a, p, pa, rm, cr] = await Promise.all([
    sb.from('acomptes').select('*').gte('date_acompte', d1).lte('date_acompte', d2).order('date_acompte', { ascending: true }),
    sb.from('pointages').select('*').gte('date_pointage', d1).lte('date_pointage', d2),
    sb.from('pointages').select('*'),
    sb.from('remises_hs').select('*'),
    sb.from('credits_employes').select('*')
  ]);
  if (a.error || p.error) { showLoadError(a.error || p.error); return; }
  ACOMPTES = a.data || [];
  POINTAGES = p.data || [];
  POINT_ALL = pa.error ? POINTAGES : (pa.data || []);
  hsErr = rm.error ? (/does not exist|relation|schema cache/i.test(rm.error.message) ? 'Table « remises_hs » introuvable : exécutez supabase/heures_sup.sql dans SQL Editor, puis rechargez la page.' : rm.error.message) : '';
  REMISES = rm.error ? [] : (rm.data || []);
  crErr = cr.error ? (/does not exist|relation|schema cache/i.test(cr.error.message) ? 'Table « credits_employes » introuvable : exécutez supabase/credits_employes.sql dans SQL Editor, puis rechargez la page.' : cr.error.message) : '';
  CREDITS = cr.error ? [] : (cr.data || []);
  renderEmployes();
}

function showLoadError(error) {
  const msg = errMsgE(error);
  toastE('Erreur : ' + msg);
  renderEmployes();
}

/* ---------- Affichage : liste des employés ---------- */
function renderEmployes() {
  const tb = $e('#emp-tbody');
  const q = ($e('#emp-q').value || '').toLowerCase().trim();
  const mois = curMonth();
  const list = EMPLOYES.filter(e =>
    !q ||
    (e.nom || '').toLowerCase().includes(q) ||
    (e.prenom || '').toLowerCase().includes(q) ||
    (e.poste || '').toLowerCase().includes(q)
  );

  if (!list.length) {
    tb.innerHTML = '<tr><td colspan="10" class="at-empty">Aucun employ\u00e9. Cliquez sur \u00ab\u00a0+ Nouvel employ\u00e9\u00a0\u00bb.</td></tr>';
    renderPanel(false);
    return;
  }

  tb.innerHTML = list.map(e => {
    const hn = heuresNormales(e, mois), hs = heuresSup(e, mois), j = joursTravailles(e.id, mois);
    const po = paieOrdinaire(e, mois), ps = paieSup(e, mois), ac = totalAcomptes(e.id, mois), rt = retenueMois(e.id, mois), reste = round2(po - ac - rt), st = statut(reste), solde = soldeSup(e), cred = soldeCredit(e.id);
    return '<tr' + (String(e.id) === String(selEmploye) ? ' style="background:var(--nb)"' : '') + '>' +
      '<td><b>' + escE(e.nom) + '</b> ' + escE(e.prenom) + (e.poste ? '<small>' + escE(e.poste) + '</small>' : '') + '</td>' +
      '<td>' + money(e.taux_horaire) + ' / h<small>Sup : ' + money(tauxSup(e)) + ' / h</small></td>' +
      '<td><b>' + fmtH(hn) + '</b><small>' + j + ' jour' + (j > 1 ? 's' : '') + ' \u00b7 Sup : ' + (hs > 0 ? fmtH(hs) : '\u2014') + '</small></td>' +
      '<td>' + money(po) + '</td>' +
      '<td>' + (ps > 0 ? '<b style="color:#8a5a12">' + money(ps) + '</b><br><small>mise de côté</small>' : '\u2014') + '</td>' +
      '<td>' + money(ac) + (rt > 0 ? '<small style="color:#b3261e">Retenue cr\u00e9dit : ' + money(rt) + '</small>' : '') + '</td>' +
      '<td><b style="color:' + st.color + '">' + money(reste) + '</b><br><small style="color:' + st.color + '">' + st.txt + '</small></td>' +
      '<td>' + (cred > 0.004 ? '<b style="color:#b3261e">' + money(cred) + '</b><small>\u00e0 rembourser</small>' : (cred < -0.004 ? '<small>trop rembours\u00e9 ' + money(-cred) + '</small>' : '<small>\u2014</small>')) + '</td>' +
      '<td>' + (solde > 0.004 ? '<b style="color:#8a5a12">' + money(solde) + '</b>' : '<small>' + (solde < -0.004 ? 'avance ' + money(-solde) : '\u2014') + '</small>') + '</td>' +
      '<td class="emp-act">' +
        '<button class="btn s p" type="button" onclick="openAcomptes(\'' + e.id + '\')">Pointage</button>' +
        '<button class="btn s" type="button" onclick="showFormEmploye(\'' + e.id + '\')">Modifier</button>' +
        '<button class="btn s d" type="button" onclick="removeEmploye(\'' + e.id + '\')">Supprimer</button>' +
      '</td></tr>';
  }).join('') +
  '<tr style="font-weight:700;background:var(--nb)"><td colspan="2">Total</td><td>' +
    fmtH(list.reduce((s, e) => s + heuresNormales(e, mois), 0)) + '<small>' + (tj => tj + ' jour' + (tj > 1 ? 's' : ''))(list.reduce((s, e) => s + joursTravailles(e.id, mois), 0)) + ' \u00b7 Sup : ' + fmtH(list.reduce((s, e) => s + heuresSup(e, mois), 0)) + '</small></td><td>' +
    money(list.reduce((s, e) => s + paieOrdinaire(e, mois), 0)) + '</td><td>' +
    money(list.reduce((s, e) => s + paieSup(e, mois), 0)) + '</td><td>' +
    money(list.reduce((s, e) => s + totalAcomptes(e.id, mois), 0)) + '</td><td>' +
    money(list.reduce((s, e) => s + resteSalaire(e, mois), 0)) + '</td><td>' +
    money(list.reduce((s, e) => s + Math.max(0, soldeCredit(e.id)), 0)) + '</td><td>' +
    money(list.reduce((s, e) => s + Math.max(0, soldeSup(e)), 0)) + '</td><td></td></tr>';

  renderPanel(false);
}

/* ---------- Formulaire employé : afficher / cacher ---------- */
function showFormEmploye(id) {
  curEmploye = id || null;
  const emp = id ? EMPLOYES.find(x => String(x.id) === String(id)) : null;
  $e('#emp-form-title').textContent = emp ? 'Modifier l\u2019employ\u00e9' : 'Nouvel employ\u00e9';
  $e('#emp-nom').value       = emp ? (emp.nom || '') : '';
  $e('#emp-prenom').value    = emp ? (emp.prenom || '') : '';
  $e('#emp-poste').value     = emp ? (emp.poste || '') : '';
  $e('#emp-taux').value      = emp ? (emp.taux_horaire || '') : '';
  $e('#emp-taux-sup').value  = emp ? (emp.taux_heure_sup || '') : '';
  $e('#emp-fin-normale').value = emp ? (String(emp.heure_fin_normale || '19:00').slice(0, 5)) : '19:00';
  $e('#emp-notes').value     = emp ? (emp.notes || '') : '';
  $e('#emp-form').style.display = 'block';
  $e('#emp-nom').focus();
}

function hideFormEmploye() {
  curEmploye = null;
  $e('#emp-form').style.display = 'none';
}
// Alias utilisé par le bouton Annuler dans le HTML
function cancelFormEmploye() { hideFormEmploye(); }

/* ---------- Sauvegarde employé ---------- */
async function saveEmploye() {
  const nom = $e('#emp-nom').value.trim();
  const prenom = $e('#emp-prenom').value.trim();
  const poste = $e('#emp-poste').value.trim();
  const taux = parseFloat($e('#emp-taux').value) || 0;
  const tauxS = parseFloat($e('#emp-taux-sup').value) || 0;   // 0 = utiliser le taux normal (colonne NOT NULL)
  const finNorm = $e('#emp-fin-normale').value || '19:00';
  const notes = $e('#emp-notes').value.trim();

  if (!nom) { toastE('Le nom est obligatoire.'); return; }
  if (taux <= 0) { toastE('Le taux horaire doit \u00eatre sup\u00e9rieur \u00e0 0.'); return; }

  const payload = { nom, prenom, poste, taux_horaire: taux, taux_heure_sup: tauxS, heure_fin_normale: finNorm, notes };

  let res;
  if (curEmploye) {
    res = await sb.from('employes').update(payload).eq('id', curEmploye).select();
  } else {
    res = await sb.from('employes').insert([payload]).select();
  }

  if (res.error) { toastE('Erreur : ' + errMsgE(res.error)); return; }

  toastE(curEmploye ? 'Employ\u00e9 modifi\u00e9 avec succ\u00e8s.' : 'Employ\u00e9 ajout\u00e9 avec succ\u00e8s.');
  hideFormEmploye();
  await loadEmployes();
}

/* ---------- Suppression employé ---------- */
async function removeEmploye(id) {
  const emp = EMPLOYES.find(x => String(x.id) === String(id));
  if (!emp) return;
  if (!confirm('Supprimer l\u2019employ\u00e9 ' + emp.nom + ' ' + (emp.prenom || '') + ' ?\nTous ses pointages et acomptes seront aussi supprim\u00e9s.')) return;

  // Supprimer pointages et acomptes d'abord
  await sb.from('pointages').delete().eq('employe_id', id);
  await sb.from('acomptes').delete().eq('employe_id', id);
  const res = await sb.from('employes').delete().eq('id', id);
  if (res.error) { toastE('Erreur : ' + errMsgE(res.error)); return; }

  if (String(selEmploye) === String(id)) { selEmploye = null; $e('#ac-panel').style.display = 'none'; }
  toastE('Employ\u00e9 supprim\u00e9.');
  await loadEmployes();
}

/* ---------- Panneau pointage + acomptes ---------- */
function openAcomptes(id) {
  selEmploye = id; curAcompte = null;
  $e('#ac-montant').value = ''; $e('#ac-note').value = '';
  $e('#ac-submit').textContent = 'Ajouter l\u2019acompte';
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
  const jours = joursTravailles(emp.id, mois);
  const po = paieOrdinaire(emp, mois), ps = paieSup(emp, mois), ac = totalAcomptes(emp.id, mois), rt = retenueMois(emp.id, mois);
  const reste = round2(po - ac - rt), st = statut(reste);
  const nbSem = Math.ceil(joursDansMois(mois) / 7);

  $e('#ac-title').textContent = 'Pointage et acomptes \u2014 ' + emp.nom + ' ' + (emp.prenom || '') + ' (' + mois.split('-').reverse().join('/') + ')';

  const hn = heuresNormales(emp, mois), hs = heuresSup(emp, mois);
  let resume =
    '<div class="at-stat"><span>Taux horaire normal</span><b>' + money(taux) + '</b></div>' +
    '<div class="at-stat"><span>Taux heure sup</span><b>' + money(tauxSup(emp)) + '</b></div>' +
    '<div class="at-stat"><span>Heures normales (' + jours + ' jour' + (jours > 1 ? 's' : '') + ', jusqu\u2019\u00e0 ' + finNormale(emp) + ')</span><b>' + fmtH(hn) + '</b></div>' +
    '<div class="at-stat"><span>Heures suppl\u00e9mentaires</span><b>' + (hs > 0 ? fmtH(hs) : '\u2014') + '</b></div>' +
    '<div class="at-stat"><span>Paie ordinaire du mois</span><b>' + money(po) + '</b></div>' +
    '<div class="at-stat"><span>Paie heures sup (mise de c\u00f4t\u00e9)</span><b style="color:#8a5a12">' + money(ps) + '</b></div>' +
    '<div class="at-stat"><span>Acomptes d\u00e9j\u00e0 vers\u00e9s</span><b>' + money(ac) + '</b></div>' +
    (rt > 0 ? '<div class="at-stat"><span>Retenue cr\u00e9dit personnel (ce mois)</span><b style="color:#b3261e">' + money(rt) + '</b></div>' : '') +
    '<div class="at-stat"><span>Reste \u00e0 payer (paie ordinaire) \u2014 ' + st.txt + '</span><b style="color:' + st.color + '">' + money(reste) + '</b></div>';
  if (taux === 0) resume += '<div class="at-stat" style="grid-column:1/-1;color:var(--r)">\u26a0 Le taux horaire est \u00e0 0\u00a0DA : cliquez sur \u00ab\u00a0Modifier\u00a0\u00bb pour l\u2019indiquer.</div>';
  if (hs > 0 && !(Number(emp.taux_heure_sup) > 0)) resume += '<div class="at-stat" style="grid-column:1/-1;color:var(--r)">\u26a0 Le taux des heures suppl\u00e9mentaires n\u2019est pas d\u00e9fini : elles sont pay\u00e9es au taux normal. Cliquez sur \u00ab\u00a0Modifier\u00a0\u00bb pour l\u2019indiquer.</div>';
  if (reste < 0) resume += '<div class="at-stat" style="grid-column:1/-1;color:var(--r)">\u26a0 L\u2019employ\u00e9 a re\u00e7u ' + money(-reste) + ' de plus que sa paie ordinaire du mois.</div>';
  $e('#ac-resume').innerHTML = resume;

  if (!skipGrid) renderGrid(emp, mois);

  // Récapitulatif par semaine
  let cumul = 0, rows = '', totHn = 0, totHs = 0, totG = 0, totS = 0, totA = 0;
  for (let s = 1; s <= nbSem; s++) {
    let hN = 0, hS = 0, gain = 0, gainS = 0;
    pointagesDuMois(emp.id, mois).filter(p => semaineDuMois(p.date_pointage) === s).forEach(p => {
      const d = detail(p, emp); hN += d.norm; hS += d.sup; gain += d.norm * Number(emp.taux_horaire || 0); gainS += d.sup * tauxSup(emp);
    });
    gain = round2(gain); gainS = round2(gainS);
    const a = round2(items.filter(x => semaineDuMois(x.date_acompte) === s).reduce((t, x) => t + Number(x.montant || 0), 0));
    cumul = round2(cumul + gain - a); totHn += hN; totHs += hS; totG += gain; totS += gainS; totA += a;
    rows += '<tr><td>' + labelSemaine(s, mois) + '</td><td>' + (hN ? fmtH(hN) : '\u2014') + '</td><td>' + (hS ? fmtH(hS) : '\u2014') + '</td><td>' + (gain ? money(gain) : '\u2014') + '</td><td>' + (gainS ? money(gainS) : '\u2014') + '</td><td>' + (a ? money(a) : '\u2014') + '</td><td>' + money(cumul) + '</td></tr>';
  }
  if (rt > 0) { cumul = round2(cumul - rt); totA += rt; rows += '<tr><td>Retenue cr\u00e9dit personnel</td><td></td><td></td><td></td><td></td><td>' + money(rt) + '</td><td>' + money(cumul) + '</td></tr>'; }
  rows += '<tr style="font-weight:700;background:var(--nb)"><td>Total du mois</td><td>' + fmtH(totHn) + '</td><td>' + fmtH(totHs) + '</td><td>' + money(totG) + '</td><td>' + money(totS) + '</td><td>' + money(totA) + '</td><td style="color:' + st.color + '">' + money(reste) + '</td></tr>';
  $e('#ac-semaines').innerHTML = rows;

  renderHS(emp, mois, ps);
  renderCredit(emp, mois);

  // Détail des acomptes
  $e('#ac-liste').innerHTML = items.length ? items.map(a =>
    '<tr><td><b>' + escE(emp.nom) + '</b></td><td>' + escE(emp.prenom) + '</td><td>' + fdE(a.date_acompte) + '</td><td>' + labelSemaine(semaineDuMois(a.date_acompte), mois).split(' (')[0] + '</td><td>' + money(a.montant) + '</td><td>' + escE(a.note) + '</td>' +
    '<td><button class="btn s" type="button" onclick="editAcompte(\'' + a.id + '\')">Modifier</button> ' +
    '<button class="btn s d" type="button" onclick="removeAcompte(\'' + a.id + '\')">Supprimer</button></td></tr>'
  ).join('') : '<tr><td colspan="7" class="at-empty">Aucun acompte ce mois-ci.</td></tr>';
}

/* ---------- Heures supplémentaires mises de côté ---------- */
function renderHS(emp, mois, psMois) {
  const box = $e('#hs-box'); if (!box) return;
  if (hsErr) { box.innerHTML = '<div class="at-stat" style="color:var(--r)">' + escE(hsErr) + '</div>'; return; }
  const gag = supGagnee(emp), rep = supReportee(emp.id), rem = supRemise(emp.id), solde = round2(gag + rep - rem), ops = opsHS(emp.id);
  let h = '<h2>Heures suppl\u00e9mentaires mises de c\u00f4t\u00e9</h2>' +
    '<p class="pr-help">La paie des heures sup n\u2019est <b>pas vers\u00e9e avec le salaire</b> : elle est gard\u00e9e pour l\u2019employ\u00e9, puis remise plus tard. Enregistrez ici chaque remise.</p>' +
    '<div class="at-stats">' +
      '<div class="at-stat"><span>Heures sup du mois</span><b style="color:#8a5a12">' + money(psMois) + '</b></div>' +
      '<div class="at-stat"><span>Total gagn\u00e9 (depuis le d\u00e9but)</span><b>' + money(gag) + '</b>' + (rep ? '<small>+ ' + money(rep) + ' mis de c\u00f4t\u00e9 avant la plateforme</small>' : '') + '</div>' +
      '<div class="at-stat"><span>D\u00e9j\u00e0 remis</span><b>' + money(rem) + '</b></div>' +
      '<div class="at-stat"><span>' + (solde < 0 ? 'Avance en trop' : 'Reste \u00e0 remettre') + '</span><b style="color:' + (solde < 0 ? 'var(--r)' : '#8a5a12') + '">' + money(Math.abs(solde)) + '</b></div></div>';
  if (hsForm) {
    h += '<form id="hs-form" class="at-form" style="display:block"><h3 style="margin-top:0">' + (hsForm.report ? 'Solde de d\u00e9part (d\u00e9j\u00e0 mis de c\u00f4t\u00e9 avant la plateforme)' : 'Remettre des heures sup \u00e0 ' + escE(emp.nom)) + '</h3>' +
      '<div class="at-fields"><label>Date<input id="hs-date" type="date" value="' + isoE(new Date()) + '"></label><label>Montant (DA) *<input id="hs-montant" type="number" min="0" step="0.01" inputmode="decimal" value="' + (hsForm.report ? '' : (solde > 0 ? solde : '')) + '" required></label><label>Note<input id="hs-note" maxlength="150" placeholder="Facultatif"></label></div>' +
      '<div class="at-actions"><button class="btn p" type="submit">Enregistrer</button><button class="btn" type="button" onclick="hsFermer()">Annuler</button></div></form>';
  } else {
    h += '<div class="at-actions"><button class="btn p" type="button" onclick="hsOuvrir(false)">Remettre des heures sup</button><button class="btn" type="button" onclick="hsOuvrir(true)">Solde de d\u00e9part</button></div>';
  }
  h += ops.length ? '<div class="at-scroll"><table style="min-width:0"><thead><tr><th>Date</th><th>Type</th><th>Montant</th><th>Note</th><th></th></tr></thead><tbody>' +
    ops.map(r => '<tr><td>' + fdE(r.date_op) + '</td><td>' + (r.type === 'report' ? 'Solde de d\u00e9part' : 'Remise') + '</td><td><b>' + money(r.montant) + '</b></td><td>' + escE(r.note || '') + '</td><td><button class="btn s d" type="button" onclick="hsSupprimer(\'' + r.id + '\')">Supprimer</button></td></tr>').join('') + '</tbody></table></div>' : '';
  box.innerHTML = h;
}
function hsOuvrir(report) { hsForm = { report: !!report }; const emp = EMPLOYES.find(x => String(x.id) === String(selEmploye)); if (emp) renderHS(emp, curMonth(), paieSup(emp, curMonth())); const m = $e('#hs-montant'); if (m) m.focus(); }
function hsFermer() { hsForm = null; renderPanel(true); }
async function hsEnregistrer() {
  const emp = EMPLOYES.find(x => String(x.id) === String(selEmploye)); if (!emp || !hsForm) return;
  const montant = parseFloat($e('#hs-montant').value) || 0, date = $e('#hs-date').value;
  if (montant <= 0) { toastE('Le montant doit \u00eatre sup\u00e9rieur \u00e0 0.'); return; }
  if (!date) { toastE('La date est obligatoire.'); return; }
  if (!hsForm.report && montant > soldeSup(emp) + 0.004 && !confirm('Ce montant (' + money(montant) + ') d\u00e9passe le reste \u00e0 remettre (' + money(Math.max(0, soldeSup(emp))) + ').\nContinuer ?')) return;
  const r = await sb.from('remises_hs').insert([{ employe_id: emp.id, date_op: date, type: hsForm.report ? 'report' : 'remise', montant: round2(montant), note: $e('#hs-note').value.trim() }]).select();
  if (r.error) { toastE('Erreur : ' + errMsgE(r.error)); return; }
  REMISES.push(r.data[0]); hsForm = null;
  toastE(hsForm === null && r.data[0].type === 'report' ? 'Solde de d\u00e9part enregistr\u00e9.' : 'Remise enregistr\u00e9e : ' + money(montant));
  renderPanel(true); renderEmployes();
}
async function hsSupprimer(id) {
  if (!confirm('Supprimer cette op\u00e9ration ? Le reste \u00e0 remettre sera recalcul\u00e9.')) return;
  const r = await sb.from('remises_hs').delete().eq('id', id);
  if (r.error) { toastE('Erreur : ' + errMsgE(r.error)); return; }
  REMISES = REMISES.filter(x => String(x.id) !== String(id)); renderPanel(true); renderEmployes();
}
document.addEventListener('submit', ev => { if (ev.target.id === 'hs-form') { ev.preventDefault(); hsEnregistrer(); } });

/* ---------- Crédit personnel de l'employé (hors travail) ---------- */
function renderCredit(emp, mois) {
  const box = $e('#cr-box'); if (!box) return;
  if (crErr) { box.innerHTML = '<div class="at-stat" style="color:var(--r)">' + escE(crErr) + '</div>'; return; }
  const cr = crSomme(emp.id, 'credit'), rep = crSomme(emp.id, 'report'), ret = crSomme(emp.id, 'retenue'), solde = soldeCredit(emp.id), ops = opsCr(emp.id), rt = retenueMois(emp.id, mois);
  const T = { credit: 'Cr\u00e9dit accord\u00e9', retenue: 'Retenue sur salaire', report: 'Solde de d\u00e9part' };
  let h = '<h2>Cr\u00e9dit personnel</h2><p class="pr-help">Argent que vous avancez \u00e0 l\u2019employ\u00e9 <b>en dehors du travail</b> (mariage, urgence\u2026). Chaque fin de mois, enregistrez la <b>retenue sur salaire</b> : elle est d\u00e9duite du reste \u00e0 payer du mois et le cr\u00e9dit diminue automatiquement.</p>' +
    '<div class="at-stats"><div class="at-stat"><span>Cr\u00e9dits accord\u00e9s' + (rep ? ' (+ ' + money(rep) + ' avant la plateforme)' : '') + '</span><b>' + money(cr + rep) + '</b></div>' +
    '<div class="at-stat"><span>D\u00e9j\u00e0 rembours\u00e9</span><b>' + money(ret) + '</b></div>' +
    '<div class="at-stat"><span>Retenue ce mois-ci</span><b>' + money(rt) + '</b></div>' +
    '<div class="at-stat"><span>' + (solde < 0 ? 'Trop rembours\u00e9' : 'Reste \u00e0 rembourser') + '</span><b style="color:' + (solde > 0.004 ? '#b3261e' : solde < -0.004 ? '#8a5a12' : '#1e6e32') + '">' + money(Math.abs(solde)) + '</b></div></div>';
  if (crForm) {
    const t = crForm.type, aff = escE(emp.nom), reste = round2(paieOrdinaire(emp, mois) - totalAcomptes(emp.id, mois) - rt);
    h += '<form id="cr-form" class="at-form" style="display:block"><h3 style="margin-top:0">' + (t === 'credit' ? 'Nouveau cr\u00e9dit pour ' + aff : t === 'retenue' ? 'Retenue sur le salaire de ' + aff + ' (' + mois.split('-').reverse().join('/') + ')' : 'Solde de d\u00e9part (cr\u00e9dit d\u00fb avant la plateforme)') + '</h3>' +
      '<div class="at-fields"><label>Date<input id="cr-date" type="date" value="' + (t === 'retenue' && !isoE(new Date()).startsWith(mois) ? mois + '-' + String(joursDansMois(mois)).padStart(2, '0') : isoE(new Date())) + '"></label>' +
      '<label>Montant (DA) *<input id="cr-montant" type="number" min="0" step="0.01" inputmode="decimal" required value="' + (t === 'retenue' && solde > 0 ? Math.min(solde, Math.max(0, reste)) : '') + '"></label>' +
      '<label>Note<input id="cr-note" maxlength="150" placeholder="' + (t === 'credit' ? 'Ex : mariage, urgence\u2026' : 'Facultatif') + '"></label></div>' +
      (t === 'retenue' ? '<p class="pr-help" style="margin:4px 0">Reste \u00e0 payer ce mois avant retenue : <b>' + money(reste + 0) + '</b> \u00b7 cr\u00e9dit \u00e0 rembourser : <b>' + money(Math.max(0, solde)) + '</b></p>' : '') +
      '<div class="at-actions"><button class="btn p" type="submit">Enregistrer</button><button class="btn" type="button" onclick="crFermer()">Annuler</button></div></form>';
  } else h += '<div class="at-actions"><button class="btn p" type="button" onclick="crOuvrir(\'credit\')">+ Accorder un cr\u00e9dit</button><button class="btn" type="button" onclick="crOuvrir(\'retenue\')">Retenue sur le salaire du mois</button><button class="btn" type="button" onclick="crOuvrir(\'report\')">Solde de d\u00e9part</button></div>';
  h += ops.length ? '<div class="at-scroll"><table style="min-width:0"><thead><tr><th>Date</th><th>Type</th><th>Montant</th><th>Note</th><th></th></tr></thead><tbody>' +
    ops.map(r => '<tr><td>' + fdE(r.date_op) + '</td><td>' + T[r.type] + '</td><td><b style="color:' + (r.type === 'retenue' ? '#1e6e32' : '#b3261e') + '">' + (r.type === 'retenue' ? '\u2212 ' : '+ ') + money(r.montant) + '</b></td><td>' + escE(r.note || '') + '</td><td><button class="btn s d" type="button" onclick="crSupprimer(\'' + r.id + '\')">Supprimer</button></td></tr>').join('') + '</tbody></table></div>' : '';
  box.innerHTML = h;
}
function crOuvrir(type) { crForm = { type }; const emp = EMPLOYES.find(x => String(x.id) === String(selEmploye)); if (emp) renderCredit(emp, curMonth()); const m = $e('#cr-montant'); if (m) { m.focus(); m.scrollIntoView({ behavior: 'smooth', block: 'center' }); } }
function crFermer() { crForm = null; renderPanel(true); }
async function crEnregistrer() {
  const emp = EMPLOYES.find(x => String(x.id) === String(selEmploye)); if (!emp || !crForm) return;
  const montant = parseFloat($e('#cr-montant').value) || 0, date = $e('#cr-date').value, type = crForm.type;
  if (montant <= 0) { toastE('Le montant doit \u00eatre sup\u00e9rieur \u00e0 0.'); return; }
  if (!date) { toastE('La date est obligatoire.'); return; }
  if (type === 'retenue' && montant > soldeCredit(emp.id) + 0.004 && !confirm('Cette retenue (' + money(montant) + ') d\u00e9passe le cr\u00e9dit \u00e0 rembourser (' + money(Math.max(0, soldeCredit(emp.id))) + ').\nContinuer ?')) return;
  const r = await sb.from('credits_employes').insert([{ employe_id: emp.id, date_op: date, type, montant: round2(montant), note: $e('#cr-note').value.trim() }]).select();
  if (r.error) { toastE('Erreur : ' + errMsgE(r.error)); return; }
  CREDITS.push(r.data[0]); crForm = null;
  toastE(type === 'credit' ? 'Cr\u00e9dit enregistr\u00e9 : ' + money(montant) : type === 'retenue' ? 'Retenue enregistr\u00e9e : ' + money(montant) + ' \u2014 d\u00e9duite du salaire.' : 'Solde de d\u00e9part enregistr\u00e9.');
  renderPanel(true); renderEmployes();
}
async function crSupprimer(id) {
  if (!confirm('Supprimer cette op\u00e9ration ? Le cr\u00e9dit et le reste \u00e0 payer seront recalcul\u00e9s.')) return;
  const r = await sb.from('credits_employes').delete().eq('id', id);
  if (r.error) { toastE('Erreur : ' + errMsgE(r.error)); return; }
  CREDITS = CREDITS.filter(x => String(x.id) !== String(id)); renderPanel(true); renderEmployes();
}
document.addEventListener('submit', ev => { if (ev.target.id === 'cr-form') { ev.preventDefault(); crEnregistrer(); } });

/* ---------- Grille de pointage ---------- */
function renderGrid(emp, mois) {
  const map = {};
  pointagesDuMois(emp.id, mois).forEach(p => { map[p.date_pointage] = p; });
  let html = '';
  for (let d = 1; d <= joursDansMois(mois); d++) {
    const date = mois + '-' + String(d).padStart(2, '0');
    const p = map[date], dt = p ? detail(p, emp) : { norm: 0, sup: 0 };
    const deb = p && p.heure_debut ? String(p.heure_debut).slice(0, 5) : '';
    const fin = p && p.heure_fin ? String(p.heure_fin).slice(0, 5) : '';
    html += '<tr><td>' + fdE(date) + '</td><td>' + JOURS[jourSemaine(date)] + '</td><td>S' + semaineDuMois(date) + '</td>' +
      '<td><input id="pd-' + date + '" type="time" value="' + deb + '" oninput="ptChange(\'' + date + '\')" onchange="ptChange(\'' + date + '\')" onblur="ptFlush(\'' + date + '\')"></td>' +
      '<td><input id="pf-' + date + '" type="time" value="' + fin + '" oninput="ptChange(\'' + date + '\')" onchange="ptChange(\'' + date + '\')" onblur="ptFlush(\'' + date + '\')"></td>' +
      '<td id="norm-' + date + '">' + (dt.norm > 0 ? fmtH(dt.norm) : '\u2014') + '</td>' +
      '<td id="sup-' + date + '">' + (dt.sup > 0 ? fmtH(dt.sup) : '\u2014') + '</td>' +
      '<td id="gain-' + date + '">' + money(p ? round2(gainPointage(p, emp)) : 0) + '</td>' +
      '<td><button class="btn s" type="button" onclick="quickPointage(\'' + date + '\', true)">Pr\u00e9sent</button> ' +
      '<button class="btn s" type="button" onclick="quickPointage(\'' + date + '\', false)">Effacer</button></td></tr>';
  }
  $e('#pt-grid').innerHTML = html;
}

/* Saisie des heures : on n'enregistre pas à chaque chiffre tapé (« 1 » donne 01:00, une heure « reculée » qui faisait bugger),
   mais quand la saisie est terminée (1,5 s sans toucher, ou en quittant la case). */
const PT_TIMERS = {};
function ptChange(date) { clearTimeout(PT_TIMERS[date]); PT_TIMERS[date] = setTimeout(() => savePointage(date), 1500); }
function ptFlush(date) { if (PT_TIMERS[date]) { clearTimeout(PT_TIMERS[date]); delete PT_TIMERS[date]; savePointage(date); } }

/* ---------- Sauvegarde d'un pointage ---------- */
async function savePointage(date) {
  if (!selEmploye) return;
  const deb = $e('#pd-' + date) ? $e('#pd-' + date).value : '';
  const fin = $e('#pf-' + date) ? $e('#pf-' + date).value : '';
  const emp = EMPLOYES.find(x => String(x.id) === String(selEmploye));
  if (!emp) return;
  clearTimeout(PT_TIMERS[date]); delete PT_TIMERS[date];
  // fin avant le début : saisie en cours ou erreur, on n'enregistre pas (la valeur reste dans la case pour être corrigée)
  if (deb && fin && toMin(fin) <= toMin(deb)) { toastE('L\u2019heure de fin (' + fin + ') doit \u00eatre apr\u00e8s l\u2019heure de d\u00e9but (' + deb + ').'); return; }

  if (!deb && !fin) {
    // Supprimer le pointage si les deux champs sont vides
    await sb.from('pointages').delete().eq('employe_id', selEmploye).eq('date_pointage', date);
    const idx = POINTAGES.findIndex(p => String(p.employe_id) === String(selEmploye) && p.date_pointage === date);
    if (idx !== -1) POINTAGES.splice(idx, 1);
  } else {
    const existing = POINTAGES.find(p => String(p.employe_id) === String(selEmploye) && p.date_pointage === date);
    const payload = { employe_id: selEmploye, date_pointage: date, heure_debut: deb || null, heure_fin: fin || null };
    let res;
    if (existing) {
      res = await sb.from('pointages').update(payload).eq('id', existing.id).select();
      if (!res.error && res.data && res.data[0]) {
        const idx = POINTAGES.findIndex(p => String(p.id) === String(existing.id));
        if (idx !== -1) POINTAGES[idx] = res.data[0];
      }
    } else {
      res = await sb.from('pointages').insert([payload]).select();
      if (!res.error && res.data && res.data[0]) POINTAGES.push(res.data[0]);
    }
    if (res.error) { toastE('Erreur pointage : ' + errMsgE(res.error)); return; }
  }

  // Mise à jour en live de la ligne
  const updatedEmp = EMPLOYES.find(x => String(x.id) === String(selEmploye));
  const updatedP = POINTAGES.find(p => String(p.employe_id) === String(selEmploye) && p.date_pointage === date);
  const dt = updatedP ? detail(updatedP, updatedEmp) : { norm: 0, sup: 0 };
  if ($e('#norm-' + date)) $e('#norm-' + date).textContent = dt.norm > 0 ? fmtH(dt.norm) : '\u2014';
  if ($e('#sup-' + date)) $e('#sup-' + date).textContent = dt.sup > 0 ? fmtH(dt.sup) : '\u2014';
  if ($e('#gain-' + date)) $e('#gain-' + date).textContent = money(updatedP ? round2(gainPointage(updatedP, updatedEmp)) : 0);

  renderPanel(true);
  renderEmployes();
}

/* ---------- Pointage rapide ---------- */
async function quickPointage(date, present) {
  if (!selEmploye) return;
  if (!present) {
    // Effacer
    if ($e('#pd-' + date)) $e('#pd-' + date).value = '';
    if ($e('#pf-' + date)) $e('#pf-' + date).value = '';
    await savePointage(date);
    return;
  }
  // Remplir avec les heures habituelles
  const deb = $e('#pt-debut') ? ($e('#pt-debut').value || '08:00') : '08:00';
  const fin = $e('#pt-fin') ? ($e('#pt-fin').value || '19:00') : '19:00';
  if ($e('#pd-' + date)) $e('#pd-' + date).value = deb;
  if ($e('#pf-' + date)) $e('#pf-' + date).value = fin;
  await savePointage(date);
}

/* ---------- Remplir les jours vides jusqu'à aujourd'hui ---------- */
async function fillMois() {
  if (!selEmploye) { toastE('Ouvrez d\u2019abord le pointage d\u2019un employ\u00e9.'); return; }
  const mois = curMonth(), today = isoE(new Date());
  const deb = ($e('#pt-debut') && $e('#pt-debut').value) || '08:00';
  const fin = ($e('#pt-fin') && $e('#pt-fin').value) || '19:00';
  const repos = $e('#pt-repos') ? Number($e('#pt-repos').value) : 5;
  if (minutesEntre(deb, fin) <= 0) { toastE('Heures habituelles invalides.'); return; }

  // dernier jour à remplir : fin du mois si passé, aujourd'hui si mois courant, rien si futur
  const mAuj = today.slice(0, 7);
  const dernier = mois < mAuj ? joursDansMois(mois) : (mois === mAuj ? Number(today.slice(8, 10)) : 0);
  const deja = new Set(pointagesDuMois(selEmploye, mois).map(p => p.date_pointage));

  const rows = [];
  for (let d = 1; d <= dernier; d++) {
    const date = mois + '-' + String(d).padStart(2, '0');
    if (deja.has(date) || jourSemaine(date) === repos) continue;
    const h = hrs({ date_pointage: date, heure_debut: deb, heure_fin: fin });
    rows.push({ employe_id: selEmploye, date_pointage: date, heure_debut: deb, heure_fin: fin, heures: Math.min(24, round2(h)) });
  }
  if (!rows.length) { toastE('Aucun jour vide \u00e0 remplir.'); return; }

  const res = await sb.from('pointages').upsert(rows, { onConflict: 'employe_id,date_pointage' });
  if (res.error) { toastE('Erreur : ' + errMsgE(res.error)); return; }
  toastE(rows.length + ' jour(s) remplis.');
  await loadMois();
}

/* ---------- Acomptes ---------- */
async function saveAcompte() {
  if (!selEmploye) return;
  const date = $e('#ac-date').value;
  const montant = parseFloat($e('#ac-montant').value) || 0;
  const note = $e('#ac-note').value.trim();

  if (!date) { toastE('La date est obligatoire.'); return; }
  if (montant <= 0) { toastE('Le montant doit \u00eatre sup\u00e9rieur \u00e0 0.'); return; }

  const payload = { employe_id: selEmploye, date_acompte: date, montant, note };
  let res;
  if (curAcompte) {
    res = await sb.from('acomptes').update(payload).eq('id', curAcompte).select();
    if (!res.error && res.data && res.data[0]) {
      const idx = ACOMPTES.findIndex(a => String(a.id) === String(curAcompte));
      if (idx !== -1) ACOMPTES[idx] = res.data[0];
    }
  } else {
    res = await sb.from('acomptes').insert([payload]).select();
    if (!res.error && res.data && res.data[0]) ACOMPTES.push(res.data[0]);
  }

  if (res.error) { toastE('Erreur : ' + errMsgE(res.error)); return; }

  toastE(curAcompte ? 'Acompte modifi\u00e9.' : 'Acompte ajout\u00e9.');
  curAcompte = null;
  $e('#ac-montant').value = ''; $e('#ac-note').value = '';
  $e('#ac-submit').textContent = 'Ajouter l\u2019acompte';
  renderPanel(true);
  renderEmployes();
}

function editAcompte(id) {
  const a = ACOMPTES.find(x => String(x.id) === String(id));
  if (!a) return;
  curAcompte = id;
  $e('#ac-date').value = a.date_acompte || '';
  $e('#ac-montant').value = a.montant || '';
  $e('#ac-note').value = a.note || '';
  $e('#ac-submit').textContent = 'Modifier l\u2019acompte';
  $e('#ac-montant').focus();
}

async function removeAcompte(id) {
  if (!confirm('Supprimer cet acompte ?')) return;
  const res = await sb.from('acomptes').delete().eq('id', id);
  if (res.error) { toastE('Erreur : ' + errMsgE(res.error)); return; }
  const idx = ACOMPTES.findIndex(a => String(a.id) === String(id));
  if (idx !== -1) ACOMPTES.splice(idx, 1);
  if (String(curAcompte) === String(id)) {
    curAcompte = null;
    $e('#ac-montant').value = ''; $e('#ac-note').value = '';
    $e('#ac-submit').textContent = 'Ajouter l\u2019acompte';
  }
  toastE('Acompte supprim\u00e9.');
  renderPanel(true);
  renderEmployes();
}

/* ---------- Export Excel ---------- */
function exportEmployes() {
  if (typeof XLSX === 'undefined') { toastE('Biblioth\u00e8que Excel non charg\u00e9e.'); return; }
  const mois = curMonth(), nj = joursDansMois(mois), nbSem = Math.ceil(nj / 7);
  const rows = EMPLOYES.map(e => {
    const its = acomptesDuMois(e.id, mois);
    const r = { Nom: e.nom, 'Pr\u00e9nom': e.prenom || '', Poste: e.poste || '', 'Taux horaire': Number(e.taux_horaire || 0), 'Taux heure sup': tauxSup(e),
                'Jours travaill\u00e9s': joursTravailles(e.id, mois), 'Heures normales': round2(heuresNormales(e, mois)), 'Heures sup': round2(heuresSup(e, mois)), 'Paie ordinaire': paieOrdinaire(e, mois), 'Paie heures sup (mise de c\u00f4t\u00e9)': paieSup(e, mois) };
    for (let s = 1; s <= nbSem; s++)
      r['Acompte S' + s] = round2(its.filter(a => semaineDuMois(a.date_acompte) === s).reduce((t, a) => t + Number(a.montant || 0), 0));
    r['Total acomptes'] = totalAcomptes(e.id, mois);
    r['Retenue cr\u00e9dit perso'] = retenueMois(e.id, mois);
    r['Cr\u00e9dit perso restant d\u00fb'] = soldeCredit(e.id);
    r['Reste \u00e0 payer'] = resteSalaire(e, mois);
    r['Statut'] = statut(r['Reste \u00e0 payer']).txt;
    r['Heures sup \u00e0 remettre (cumul)'] = soldeSup(e);
    return r;
  });
  const pts = EMPLOYES.map(e => {
    const r = { Nom: e.nom, 'Pr\u00e9nom': e.prenom || '' };
    const m = {}; pointagesDuMois(e.id, mois).forEach(p => { m[Number(p.date_pointage.slice(8, 10))] = round2(hrs(p)); });
    for (let d = 1; d <= nj; d++) r[String(d)] = m[d] ?? '';
    r['Total heures'] = round2(heuresDuMois(e.id, mois));
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