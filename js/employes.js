/* ============================================================
   MARIA BAG — Employés : salaire par POINTAGE (heures par jour)
   - Employé : nom, prénom, poste, taux horaire (DA / heure)
   - Pointage : heure de début et heure de fin chaque jour (durée calculée)
   - Acomptes : avances versées pendant le mois
   - Heures normales : jusqu'à l'heure de fin de journée normale (19:00 par défaut) → taux horaire
   - Heures supplémentaires : après cette heure (jusqu'à 23:00 ...) → taux heure sup
   - Fin de mois : salaire = heures normales × taux + heures sup × taux sup
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
function fmtH(n) {                       // 10.883 -> « 10 h 53 min »
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
function minutesEntre(deb, fin) {
  const [h1, m1] = deb.split(':').map(Number), [h2, m2] = fin.split(':').map(Number);
  return (h2 * 60 + m2) - (h1 * 60 + m1);
}
function toMin(t) { const [h, m] = String(t).slice(0, 5).split(':').map(Number); return h * 60 + m; }
// Durée totale (en heures, non arrondie) d'un pointage : fin − début, sinon ancien champ « heures »
function hrs(p) {
  if (p.heure_debut && p.heure_fin) {
    const m = minutesEntre(String(p.heure_debut).slice(0, 5), String(p.heure_fin).slice(0, 5));
    return m > 0 ? m / 60 : 0;
  }
  return Number(p.heures || 0);
}
// Taux heure sup de l'employé (s'il n'est pas défini → taux normal)
function tauxSup(emp) { return Number(emp.taux_heure_sup) > 0 ? Number(emp.taux_heure_sup) : Number(emp.taux_horaire || 0); }
function finNormale(emp) { return String(emp.heure_fin_normale || '19:00').slice(0, 5); }
// Sépare un pointage en heures normales (avant la fin de journée normale) et heures supplémentaires (après)
function detail(p, emp) {
  if (p.heure_debut && p.heure_fin) {
    const deb = toMin(p.heure_debut), fin = toMin(p.heure_fin), lim = toMin(finNormale(emp));
    if (fin <= deb) return { norm: 0, sup: 0 };
    return { norm: Math.max(0, Math.min(fin, lim) - deb) / 60, sup: Math.max(0, fin - Math.max(deb, lim)) / 60 };
  }
  return { norm: Number(p.heures || 0), sup: 0 };      // ancien pointage en nombre d'heures
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
  if (!list.length) {
    tb.innerHTML = '<tr><td colspan="10" class="at-empty">Aucun employé. Cliquez sur « + Nouvel employé ».</td></tr>';
  } else {
    tb.innerHTML = list.map(e => {
      const hn = heuresNormales(e, mois), hs = heuresSup(e, mois), j = joursTravailles(e.id, mois);
      const sal = salaireDuMois(e, mois), ac = totalAcomptes(e.id, mois), reste = round2(sal - ac), st = statut(reste);
      return '<tr' + (String(e.id) === String(selEmploye) ? ' style="background:var(--nb)"' : '') + '>' +
        '<td><b>' + escE(e.nom) + '</b> ' + escE(e.prenom) + '</td>' +
        '<td>' + escE(e.poste) + '</td>' +
        '<td>' + money(e.taux_horaire) + ' / h<br><small>Sup : ' + money(tauxSup(e)) + ' / h</small></td>' +
        '<td>' + j + '</td>' +
        '<td>' + fmtH(hn) + '</td>' +
        '<td>' + (hs > 0 ? fmtH(hs) : '—') + '</td>' +
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
      fmtH(list.reduce((s, e) => s + heuresNormales(e, mois), 0)) + '</td><td>' +
      fmtH(list.reduce((s, e) => s + heuresSup(e, mois), 0)) + '</td><td>' +
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

  const hn = heuresNormales(emp, mois), hs = heuresSup(emp, mois);
  let resume =
    '<div class="at-stat"><span>Taux horaire normal</span><b>' + money(taux) + '</b></div>' +
    '<div class="at-stat"><span>Taux heure sup</span><b>' + money(tauxSup(emp)) + '</b></div>' +
    '<div class="at-stat"><span>Heures normales (' + jours + ' jour' + (jours > 1 ? 's' : '') + ', jusqu’à ' + finNormale(emp) + ')</span><b>' + fmtH(hn) + '</b></div>' +
    '<div class="at-stat"><span>Heures supplémentaires</span><b>' + (hs > 0 ? fmtH(hs) : '—') + '</b></div>' +
    '<div class="at-stat"><span>Salaire du mois</span><b>' + money(sal) + '</b></div>' +
    '<div class="at-stat"><span>Acomptes déjà versés</span><b>' + money(ac) + '</b></div>' +
    '<div class="at-stat"><span>Reste à payer — ' + st.txt + '</span><b style="color:' + st.color + '">' + money(reste) + '</b></div>';
  if (taux === 0) resume += '<div class="at-stat" style="grid-column:1/-1;color:var(--r)">⚠ Le taux horaire est à 0 DA : cliquez sur « Modifier » pour l’indiquer.</div>';
  if (hs > 0 && !(Number(emp.taux_heure_sup) > 0)) resume += '<div class="at-stat" style="grid-column:1/-1;color:var(--r)">⚠ Le taux des heures supplémentaires n’est pas défini : elles sont payées au taux normal. Cliquez sur « Modifier » pour l’indiquer.</div>';
  if (reste < 0) resume += '<div class="at-stat" style="grid-column:1/-1;color:var(--r)">⚠ L’employé a reçu ' + money(-reste) + ' de plus que son salaire du mois.</div>';
  $e('#ac-resume').innerHTML = resume;

  if (!skipGrid) renderGrid(emp, mois);

  // Récapitulatif par semaine
  let cumul = 0, rows = '', totHn = 0, totHs = 0, totG = 0, totA = 0;
  for (let s = 1; s <= nbSem; s++) {
    let hN = 0, hS = 0, gain = 0;
    pointagesDuMois(emp.id, mois).filter(p => semaineDuMois(p.date_pointage) === s).forEach(p => {
      const d = detail(p, emp); hN += d.norm; hS += d.sup; gain += gainPointage(p, emp);
    });
    gain = round2(gain);
    const a = round2(items.filter(x => semaineDuMois(x.date_acompte) === s).reduce((t, x) => t + Number(x.montant || 0), 0));
    cumul = round2(cumul + gain - a); totHn += hN; totHs += hS; totG += gain; totA += a;
    rows += '<tr><td>' + labelSemaine(s, mois) + '</td><td>' + (hN ? fmtH(hN) : '—') + '</td><td>' + (hS ? fmtH(hS) : '—') + '</td><td>' + (gain ? money(gain) : '—') + '</td><td>' + (a ? money(a) : '—') + '</td><td>' + money(cumul) + '</td></tr>';
  }
  rows += '<tr style="font-weight:700;background:var(--nb)"><td>Total du mois</td><td>' + fmtH(totHn) + '</td><td>' + fmtH(totHs) + '</td><td>' + money(totG) + '</td><td>' + money(totA) + '</td><td style="color:' + st.color + '">' + money(reste) + '</td></tr>';
  $e('#ac-semaines').innerHTML = rows;

  // Détail des acomptes
  $e('#ac-liste').innerHTML = items.length ? items.map(a =>
    '<tr><td><b>' + escE(emp.nom) + '</b></td><td>' + escE(emp.prenom) + '</td><td>' + fdE(a.date_acompte) + '</td><td>' + labelSemaine(semaineDuMois(a.date_acompte), mois).split(' (')[0] + '</td><td>' + money(a.montant) + '</td><td>' + escE(a.note) + '</td>' +
    '<td><button class="btn s" type="button" onclick="editAcompte(\'' + a.id + '\')">Modifier</button> ' +
    '<button class="btn s d" type="button" onclick="removeAcompte(\'' + a.id + '\')">Supprimer</button></td></tr>'
  ).join('') : '<tr><td colspan="7" class="at-empty">Aucun acompte ce mois-ci.</td></tr>';
}

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
      '<td><input id="pd-' + date + '" type="time" value="' + deb + '" onchange="savePointage(\'' + date + '\')"></td>' +
      '<td><input id="pf-' + date + '" type="time" value="' + fin + '" onchange="savePointage(\'' + date + '\')"></td>' +
      '<td id="norm-' + date + '">' + (dt.norm > 0 ? fmtH(dt.norm) : '—') + '</td>' +
      '<td id="sup-' + date + '">' + (dt.sup > 0 ? fmtH(dt.sup) : '—') + '</td>' +
      '<td id="gain-' + date + '">' + money(p ? round2(gainPointage(p, emp)) : 0) + '</td>' +
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
    const r = { Nom: e.nom, Prénom: e.prenom || '', Poste: e.poste || '', 'Taux horaire': Number(e.taux_horaire || 0), 'Taux heure sup': tauxSup(e),
                'Jours travaillés': joursTravailles(e.id, mois), 'Heures normales': round2(heuresNormales(e, mois)), 'Heures sup': round2(heuresSup(e, mois)), 'Salaire du mois': salaireDuMois(e, mois) };
    for (let s = 1; s <= nbSem; s++)
      r['Acompte S' + s] = round2(its.filter(a => semaineDuMois(a.date_acompte) === s).reduce((t, a) => t + Number(a.montant || 0), 0));
    r['Total acomptes'] = totalAcomptes(e.id, mois);
    r['Reste à payer'] = resteSalaire(e, mois);
    r['Statut'] = statut(r['Reste à payer']).txt;
    return r;
  });
  const pts = EMPLOYES.map(e => {
    const r = { Nom: e.nom, Prénom: e.prenom || '' };
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