/* ============================================================
   MARIA BAG — Gestion des ateliers et productions
   Module séparé pour la gestion des ateliers, productions et commandes
   ============================================================ */

// Variables globales pour les ateliers
let ATELIERS = [], PRODUCTIONS = [], COMMANDES = [];
let curAtelier = null, curProduction = null;

// ============================================================
// FONCTIONS UTILITAIRES
// ============================================================

const $a = s => document.querySelector(s);
const $aa = s => document.querySelectorAll(s);

function toastA(msg) {
  const e = $a('#toastA');
  if (e) { e.textContent = msg; e.style.display = 'block'; clearTimeout(toastA.t); toastA.t = setTimeout(() => e.style.display = 'none', 8000); }
}

// Message d'erreur lisible (tables absentes, droits, etc.)
function errMsgA(error) {
  const m = (error && error.message) || String(error);
  if (/schema cache|does not exist|relation .* not exist|Could not find the table/i.test(m))
    return 'Tables ateliers introuvables dans Supabase. Exécutez supabase/schema.sql dans SQL Editor, puis relancez la page. (' + m + ')';
  if (/row-level security|permission denied|policy/i.test(m))
    return 'Accès refusé par Supabase (RLS). Réexécutez supabase/schema.sql pour recréer les règles d\'accès. (' + m + ')';
  if (/duplicate key|unique/i.test(m))
    return 'Ce nom existe déjà. Choisissez un nom différent. (' + m + ')';
  return m;
}

function isoA(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function todayA() { return isoA(new Date()); }

function fdA(s) { return s ? s.split('-').reverse().join('/') : ''; }

function calcDelai(dateLancement, dateReception) {
  if (!dateLancement || !dateReception) return null;
  const d1 = new Date(dateLancement + 'T00:00');
  const d2 = new Date(dateReception + 'T00:00');
  return Math.floor((d2 - d1) / 864e5);
}

// ============================================================
// OPÉRATIONS CRUD ATELIERS
// ============================================================

async function loadAteliers() {
  const { data, error } = await sb.from('ateliers').select('*').order('nom', { ascending: true });
  if (error) {
    toastA('Erreur : ' + errMsgA(error));
    const tb = $a('#atelier-tbody');
    if (tb) tb.innerHTML = '<tr><td colspan="7" class="at-empty" style="color:#b00020">⚠ ' + errMsgA(error).replace(/</g, '&lt;') + '</td></tr>';
    return;
  }
  ATELIERS = data || [];
  refreshAtelier();
}

async function createAtelier(o) {
  const { data, error } = await sb.from('ateliers').insert(o).select().single();
  if (error) { toastA('Erreur : ' + errMsgA(error)); return null; }
  return data;
}

async function updateAtelier(id, o) {
  const { data, error } = await sb.from('ateliers').update(o).eq('id', id).select().single();
  if (error) { toastA('Erreur : ' + errMsgA(error)); return null; }
  return data;
}

async function deleteAtelier(id) {
  const { error } = await sb.from('ateliers').delete().eq('id', id);
  if (error) { toastA('Erreur : ' + errMsgA(error)); return false; }
  return true;
}

// ============================================================
// OPÉRATIONS CRUD PRODUCTIONS
// ============================================================

async function loadProductions() {
  const { data, error } = await sb.from('productions').select('*, ateliers(nom)').order('date_lancement', { ascending: false });
  if (error) {
    toastA('Erreur : ' + errMsgA(error));
    const tb = $a('#production-tbody');
    if (tb) tb.innerHTML = '<tr><td colspan="10" class="at-empty" style="color:#b00020">⚠ ' + errMsgA(error).replace(/</g, '&lt;') + '</td></tr>';
    return;
  }
  PRODUCTIONS = (data || []).map(p => ({
    ...p,
    atelier_nom: p.ateliers?.nom || 'N/A'
  }));
  refreshProduction();
}

async function createProduction(o) {
  const { data, error } = await sb.from('productions').insert(o).select().single();
  if (error) { toastA('Erreur : ' + errMsgA(error)); return null; }
  const prod = await sb.from('productions').select('*, ateliers(nom)').eq('id', data.id).single();
  return prod.data ? { ...prod.data, atelier_nom: prod.data.ateliers?.nom || 'N/A' } : null;
}

async function updateProduction(id, o) {
  const { data, error } = await sb.from('productions').update(o).eq('id', id).select().single();
  if (error) { toastA('Erreur : ' + errMsgA(error)); return null; }
  const prod = await sb.from('productions').select('*, ateliers(nom)').eq('id', data.id).single();
  return prod.data ? { ...prod.data, atelier_nom: prod.data.ateliers?.nom || 'N/A' } : null;
}

async function deleteProduction(id) {
  const { error } = await sb.from('productions').delete().eq('id', id);
  if (error) { toastA('Erreur : ' + errMsgA(error)); return false; }
  return true;
}

// ============================================================
// OPÉRATIONS CRUD COMMANDES
// ============================================================

async function loadCommandes() {
  const { data, error } = await sb.from('commandes').select('*, productions(modele_nom), contacts(nom, prenom)').order('date_commande', { ascending: false });
  if (error) { toastA('Erreur : ' + errMsgA(error)); return; }
  COMMANDES = (data || []).map(c => ({
    ...c,
    modele_nom: c.productions?.modele_nom || 'N/A',
    contact_nom: c.contacts ? (c.contacts.prenom + ' ' + c.contacts.nom).trim() : 'N/A'
  }));
}

async function createCommande(o) {
  const { data, error } = await sb.from('commandes').insert(o).select().single();
  if (error) { toastA('Erreur : ' + errMsgA(error)); return null; }
  const cmd = await sb.from('commandes').select('*, productions(modele_nom), contacts(nom, prenom)').eq('id', data.id).single();
  return cmd.data ? { ...cmd.data, modele_nom: cmd.data.productions?.modele_nom || 'N/A', contact_nom: cmd.data.contacts ? (cmd.data.contacts.prenom + ' ' + cmd.data.contacts.nom).trim() : 'N/A' } : null;
}

async function updateCommande(id, o) {
  const { data, error } = await sb.from('commandes').update(o).eq('id', id).select().single();
  if (error) { toastA('Erreur : ' + errMsgA(error)); return null; }
  const cmd = await sb.from('commandes').select('*, productions(modele_nom), contacts(nom, prenom)').eq('id', data.id).single();
  return cmd.data ? { ...cmd.data, modele_nom: cmd.data.productions?.modele_nom || 'N/A', contact_nom: cmd.data.contacts ? (cmd.data.contacts.prenom + ' ' + cmd.data.contacts.nom).trim() : 'N/A' } : null;
}

async function deleteCommande(id) {
  const { error } = await sb.from('commandes').delete().eq('id', id);
  if (error) { toastA('Erreur : ' + errMsgA(error)); return false; }
  return true;
}

// ============================================================
// INTERFACE ATELIERS
// ============================================================

function refreshAtelier() {
  const tbody = $a('#atelier-tbody');
  if (!tbody) return;
  
  tbody.innerHTML = ATELIERS.map(a => {
    const prodCount = PRODUCTIONS.filter(p => p.atelier_id === a.id).length;
    return `<tr class="atelier-row" data-id="${a.id}">
      <td><b>${a.nom}</b><small>${a.responsable}</small></td>
      <td>${a.adresse || ''}</td>
      <td>${a.tel || ''}</td>
      <td>${a.email || ''}</td>
      <td><span class="bd ${a.statut === 'Actif' ? 'g' : 'o'}">${a.statut}</span></td>
      <td>${prodCount} prod.</td>
      <td>
        <button class="btn xs" onclick="editAtelier('${a.id}')">Modifier</button>
        <button class="btn xs r" onclick="removeAtelier('${a.id}')">Supprimer</button>
      </td>
    </tr>`;
  }).join('');
}

function refreshProduction() {
  const tbody = $a('#production-tbody');
  if (!tbody) return;
  
  tbody.innerHTML = PRODUCTIONS.map(p => {
    const cmdCount = COMMANDES.filter(c => c.production_id === p.id).length;
    const jours = p.delai_jours || (p.date_reception_prevue && p.date_lancement ? calcDelai(p.date_lancement, p.date_reception_prevue) : null);
    const couleur = (p.statut === 'Terminée' || p.date_reception_reelle) ? 'g' : p.statut === 'Retardée' ? 'r' : 'o';
    return `<tr class="production-row" data-id="${p.id}">
      <td><b>${p.modele_nom}</b></td>
      <td>${p.atelier_nom}</td>
      <td>${p.quantite_lancee}</td>
      <td>${fdA(p.date_lancement)}</td>
      <td>${fdA(p.date_reception_prevue)}</td>
      <td>${jours ? jours + ' j' : '-'}</td>
      <td>${p.date_reception_reelle ? fdA(p.date_reception_reelle) : '-'}</td>
      <td><span class="bd ${couleur}">${p.date_reception_reelle ? 'Terminée' : p.statut}</span></td>
      <td>${cmdCount} cmd.</td>
      <td>
        <button class="btn xs" onclick="editProduction('${p.id}')">Modifier</button>
        <button class="btn xs r" onclick="removeProduction('${p.id}')">Supprimer</button>
      </td>
    </tr>`;
  }).join('');
}

async function editAtelier(id) {
  curAtelier = ATELIERS.find(a => a.id === id);
  if (!curAtelier) return;
  
  $a('#atelier-form').style.display = 'block';
  $a('#atelier-nom').value = curAtelier.nom;
  $a('#atelier-adresse').value = curAtelier.adresse || '';
  $a('#atelier-tel').value = curAtelier.tel || '';
  $a('#atelier-email').value = curAtelier.email || '';
  $a('#atelier-responsable').value = curAtelier.responsable || '';
  $a('#atelier-statut').value = curAtelier.statut;
  $a('#atelier-notes').value = curAtelier.notes || '';
}

async function removeAtelier(id) {
  if (!confirm('Confirmer la suppression ?')) return;
  if (await deleteAtelier(id)) {
    ATELIERS = ATELIERS.filter(a => a.id !== id);
    refreshAtelier();
    toastA('Atelier supprimé');
  }
}

async function editProduction(id) {
  curProduction = PRODUCTIONS.find(p => p.id === id);
  if (!curProduction) return;
  
  $a('#prod-form').style.display = 'block';
  $a('#prod-atelier').value = curProduction.atelier_id;
  $a('#prod-modele').value = curProduction.modele_nom;
  $a('#prod-quantite').value = curProduction.quantite_lancee;
  $a('#prod-date-lancement').value = curProduction.date_lancement;
  $a('#prod-date-reception').value = curProduction.date_reception_prevue;
  $a('#prod-date-reelle').value = curProduction.date_reception_reelle || '';
  $a('#prod-statut').value = curProduction.statut;
  $a('#prod-notes').value = curProduction.notes || '';
}

async function removeProduction(id) {
  if (!confirm('Confirmer la suppression ?')) return;
  if (await deleteProduction(id)) {
    PRODUCTIONS = PRODUCTIONS.filter(p => p.id !== id);
    refreshProduction();
    toastA('Production supprimée');
  }
}

// ============================================================
// HANDLERS FORMULAIRES
// ============================================================

async function saveAtelier() {
  const nom = $a('#atelier-nom').value.trim();
  const adresse = $a('#atelier-adresse').value.trim();
  const tel = $a('#atelier-tel').value.trim();
  const email = $a('#atelier-email').value.trim();
  const responsable = $a('#atelier-responsable').value.trim();
  const statut = $a('#atelier-statut').value;
  const notes = $a('#atelier-notes').value.trim();
  
  if (!nom) { toastA('Le nom est requis'); return; }
  
  const obj = { nom, adresse, tel, email, responsable, statut, notes };
  let result;
  
  if (curAtelier) {
    result = await updateAtelier(curAtelier.id, obj);
    if (result) {
      Object.assign(curAtelier, result);
      const idx = ATELIERS.findIndex(a => a.id === curAtelier.id);
      if (idx >= 0) ATELIERS[idx] = curAtelier;
    }
  } else {
    result = await createAtelier(obj);
    if (result) ATELIERS.push(result);
  }
  
  if (result) {
    const wasEditing = !!curAtelier;
    curAtelier = null;
    $a('#atelier-form').style.display = 'none';
    refreshAtelier();
    toastA(wasEditing ? 'Atelier mis à jour' : 'Atelier créé');
  }
}

async function saveProduction() {
  const atelier_id = $a('#prod-atelier').value;
  const modele_nom = $a('#prod-modele').value.trim();
  const quantite_lancee = parseInt($a('#prod-quantite').value) || 0;
  const date_lancement = $a('#prod-date-lancement').value;
  const date_reception_prevue = $a('#prod-date-reception').value;
  let date_reception_reelle = $a('#prod-date-reelle').value || null;
  let statut = $a('#prod-statut').value;
  const notes = $a('#prod-notes').value.trim();
  // Une date de réception réelle = production terminée ; statut « Terminée » sans date = date du jour
  if (date_reception_reelle && statut !== 'Terminée') statut = 'Terminée';
  if (statut === 'Terminée' && !date_reception_reelle) date_reception_reelle = todayA();
  
  if (!atelier_id || !modele_nom || !date_lancement || !date_reception_prevue) {
    toastA('Remplissez tous les champs obligatoires');
    return;
  }
  
  const delai_jours = calcDelai(date_lancement, date_reception_prevue);
  const obj = { atelier_id, modele_nom, quantite_lancee, date_lancement, date_reception_prevue, date_reception_reelle, statut, delai_jours, notes };
  let result;
  
  if (curProduction) {
    result = await updateProduction(curProduction.id, obj);
    if (result) {
      Object.assign(curProduction, result);
      const idx = PRODUCTIONS.findIndex(p => p.id === curProduction.id);
      if (idx >= 0) PRODUCTIONS[idx] = curProduction;
    }
  } else {
    result = await createProduction(obj);
    if (result) PRODUCTIONS.push(result);
  }
  
  if (result) {
    curProduction = null;
    $a('#prod-form').style.display = 'none';
    refreshProduction();
    toastA('Production enregistrée');
  }
}

function cancelFormAtelier() {
  curAtelier = null;
  $a('#atelier-form').style.display = 'none';
}

function cancelFormProduction() {
  curProduction = null;
  $a('#prod-form').style.display = 'none';
}

function showFormAtelier() {
  curAtelier = null;
  $a('#atelier-form').style.display = 'block';
  $a('#atelier-nom').value = '';
  $a('#atelier-adresse').value = '';
  $a('#atelier-tel').value = '';
  $a('#atelier-email').value = '';
  $a('#atelier-responsable').value = '';
  $a('#atelier-statut').value = 'Actif';
  $a('#atelier-notes').value = '';
}

function showFormProduction() {
  curProduction = null;
  $a('#prod-form').style.display = 'block';
  $a('#prod-atelier').value = '';
  $a('#prod-modele').value = '';
  $a('#prod-quantite').value = '';
  $a('#prod-date-lancement').value = todayA();
  $a('#prod-date-reception').value = '';
  $a('#prod-date-reelle').value = '';
  $a('#prod-statut').value = 'En cours';
  $a('#prod-notes').value = '';
}



/* ============================================================
   INTÉGRATION INTERFACE — filtres, statistiques et commandes
   ============================================================ */
const escA = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let curCommande = null;

function updateAtelierSelects() {
  const a = $a('#prod-atelier');
  if (a) {
    const old = a.value;
    a.innerHTML = '<option value="">Choisir un atelier</option>' + ATELIERS.map(x => `<option value="${escA(x.id)}">${escA(x.nom)}</option>`).join('');
    if (old) a.value = old;
  }
  const p = $a('#cmd-production');
  if (p) {
    const old = p.value;
    p.innerHTML = '<option value="">Choisir une production</option>' + PRODUCTIONS.map(x => `<option value="${escA(x.id)}">${escA(x.modele_nom)} — ${escA(x.atelier_nom || '')}</option>`).join('');
    if (old) p.value = old;
  }
  const c = $a('#cmd-contact');
  if (c && typeof D !== 'undefined') {
    const old = c.value;
    c.innerHTML = '<option value="">Aucun contact</option>' + D.map(x => `<option value="${escA(x.id)}">${escA([x.prenom,x.nom].filter(Boolean).join(' '))}${x.societe ? ' — '+escA(x.societe) : ''}</option>`).join('');
    if (old) c.value = old;
  }
}
function renderAtelierStats() {
  const el = $a('#at-stats');
  if (!el) return;
  const today = todayA();
  const fini = p => p.statut === 'Terminée' || !!p.date_reception_reelle;
  const actif = p => !fini(p) && p.statut !== 'Annulée';
  const active = PRODUCTIONS.filter(actif).length;
  const done = PRODUCTIONS.filter(p => fini(p) && (p.date_reception_reelle || p.updated_at || p.date_lancement || '').slice(0,7) === today.slice(0,7)).length;
  const late = PRODUCTIONS.filter(p => actif(p) && p.date_reception_prevue && p.date_reception_prevue < today).length;
  const total = PRODUCTIONS.reduce((n,p) => n + (Number(p.quantite_lancee)||0),0);
  el.innerHTML = [
    ['Productions en cours',active],['Terminées ce mois',done],['Productions en retard',late],['Quantité totale lancée',total]
  ].map(([label,value]) => `<div class="at-stat"><span>${label}</span><b>${value}</b></div>`).join('');
}
function renderCommandes() {
  const tbody = $a('#commande-tbody');
  if (!tbody) return;
  const q = ($a('#cmd-q')?.value || '').trim().toLocaleLowerCase();
  const statut = $a('#cmd-statut')?.value || '';
  const rows = COMMANDES.filter(c => (!statut || c.statut === statut) &&
    (!q || [c.commande_numero,c.modele_nom,c.contact_nom].join(' ').toLocaleLowerCase().includes(q)));
  tbody.innerHTML = rows.length ? rows.map(c => `<tr>
    <td><b>${escA(c.commande_numero || '—')}</b></td><td>${escA(c.modele_nom || 'N/A')}</td>
    <td>${escA(c.contact_nom || 'N/A')}</td><td>${Number(c.quantite_commandee)||0}</td><td>${Number(c.quantite_recue)||0}</td>
    <td>${fdA(c.date_commande)}</td><td>${fdA(c.date_reception_prevue)}</td><td>${escA(c.statut || 'En attente')}</td>
    <td><button class="btn xs" type="button" onclick="editCommande('${escA(c.id)}')">Modifier</button>
    <button class="btn xs r" type="button" onclick="removeCommande('${escA(c.id)}')">Supprimer</button></td></tr>`).join('') :
    '<tr><td colspan="9" class="at-empty">Aucune commande correspondante.</td></tr>';
}
/* ---------- Tableau de bord : ateliers, productions, commandes ---------- */
const prodFini = p => p.statut === 'Terminée' || !!p.date_reception_reelle;
const prodActive = p => !prodFini(p) && p.statut !== 'Annulée';
const cmdOuverte = c => c.statut !== 'Reçue' && c.statut !== 'Annulée';
const CMD_CLASS = {'Reçue':'g','Partiellement reçue':'o','En production':'o','En attente':'n','Annulée':'r'};
function joursAvant(d) { return Math.round((new Date(d + 'T00:00') - new Date(todayA() + 'T00:00')) / 864e5); }
function echeanceBadge(d) {
  if (!d) return {l:'Non planifiée', c:'n'};
  const j = joursAvant(d);
  if (j < 0) return {l:'En retard (' + (-j) + ' j)', c:'r'};
  if (j === 0) return {l:"Aujourd'hui", c:'o'};
  return {l:'Dans ' + j + ' j', c: j <= 7 ? 'o' : 'g'};
}
function renderDashAteliers() {
  const kp = $a('#kpis-at');
  if (!kp) return;
  const today = todayA();
  const nb = v => Number(v) || 0;
  const actives = PRODUCTIONS.filter(prodActive);
  const late = actives.filter(p => p.date_reception_prevue && p.date_reception_prevue < today).length;
  const piecesEnCours = actives.reduce((n, p) => n + nb(p.quantite_lancee), 0);
  const doneM = PRODUCTIONS.filter(p => prodFini(p) && (p.date_reception_reelle || p.updated_at || p.date_lancement || '').slice(0, 7) === today.slice(0, 7));
  const piecesM = doneM.reduce((n, p) => n + nb(p.quantite_lancee), 0);
  const atActifs = ATELIERS.filter(a => a.statut === 'Actif').length;
  const ouvertes = COMMANDES.filter(cmdOuverte);
  const cmdLate = ouvertes.filter(c => c.date_reception_prevue && c.date_reception_prevue < today).length;
  const reste = ouvertes.reduce((n, c) => n + Math.max(0, nb(c.quantite_commandee) - nb(c.quantite_recue)), 0);

  kp.innerHTML = `
   <div class="card kpi"><span>Ateliers actifs</span><b>${atActifs} / ${ATELIERS.length}</b><i>${ATELIERS.length - atActifs} inactif(s) ou en maintenance</i></div>
   <div class="card kpi"><span>Productions en cours</span><b>${actives.length}</b><i>${late} en retard · ${piecesEnCours} pièces en production</i></div>
   <div class="card kpi"><span>Terminées ce mois</span><b>${doneM.length}</b><i>${piecesM} pièces produites</i></div>
   <div class="card kpi ${cmdLate ? 'u' : ''}"><span>Commandes à livrer</span><b>${ouvertes.length}</b><i>${cmdLate} en retard · ${reste} pièces restantes</i></div>`;

  // Productions en cours (les plus proches de la réception d'abord)
  const pr = [...actives].sort((a, b) => (a.date_reception_prevue || '9999').localeCompare(b.date_reception_prevue || '9999')).slice(0, 8);
  $a('#dash-prod').innerHTML = pr.length ? `<table style="min-width:0"><tbody>${pr.map(p => { const b = echeanceBadge(p.date_reception_prevue);
    return `<tr class="row" data-go="productions-pane"><td><b>${escA(p.modele_nom)}</b><small>${escA(p.atelier_nom)}</small></td><td>${nb(p.quantite_lancee)} pcs</td>
    <td><span class="bd ${b.c}">${b.l}</span>${p.date_reception_prevue ? `<small>${fdA(p.date_reception_prevue)}</small>` : ''}</td></tr>`; }).join('')}</tbody></table>`
    : '<div class="empty">Aucune production en cours.</div>';

  // Charge par atelier
  const charge = ATELIERS.map(a => { const ps = actives.filter(p => p.atelier_id === a.id); return {a, n: ps.length, q: ps.reduce((t, p) => t + nb(p.quantite_lancee), 0)}; })
    .sort((x, y) => y.q - x.q || x.a.nom.localeCompare(y.a.nom));
  const maxQ = Math.max(1, ...charge.map(c => c.q));
  $a('#dash-charge').innerHTML = charge.length ? charge.map(c => `<div class="bar"><div class="t"><span>${escA(c.a.nom)}${c.a.statut !== 'Actif' ? ' <small>(' + escA(c.a.statut) + ')</small>' : ''}</span><b>${c.n ? c.n + ' prod. · ' + c.q + ' pcs' : (c.a.statut === 'Actif' ? 'Libre' : '—')}</b></div><div class="tr"><i style="width:${c.q / maxQ * 100}%;background:var(--brass)"></i></div></div>`).join('')
    : '<div class="empty">Aucun atelier enregistré.</div>';

  // Commandes à suivre
  const cm = [...ouvertes].sort((a, b) => (a.date_reception_prevue || '9999').localeCompare(b.date_reception_prevue || '9999')).slice(0, 8);
  $a('#dash-cmd').innerHTML = cm.length ? `<table style="min-width:0"><tbody>${cm.map(c => { const late = c.date_reception_prevue && c.date_reception_prevue < today;
    return `<tr class="row" data-go="suivi-pane"><td><b>${escA(c.commande_numero || '—')}</b><small>${escA(c.modele_nom)}</small></td>
    <td>${escA(c.contact_nom && c.contact_nom !== 'N/A' ? c.contact_nom : '—')}</td><td>${nb(c.quantite_recue)} / ${nb(c.quantite_commandee)} pcs</td>
    <td><span class="bd ${late ? 'r' : (CMD_CLASS[c.statut] || 'n')}">${late ? 'En retard' : escA(c.statut || 'En attente')}</span>${c.date_reception_prevue ? `<small>Prévue le ${fdA(c.date_reception_prevue)}</small>` : ''}</td></tr>`; }).join('')}</tbody></table>`
    : '<div class="empty">Aucune commande en attente de livraison.</div>';
}
// Un clic sur une ligne ouvre l'onglet correspondant de la page Ateliers
$a('#v-dash').addEventListener('click', e => {
  const r = e.target.closest('[data-go]');
  if (!r) return;
  $a('nav button[data-v="ateliers"]').click();
  const t = $a(`[data-at-tab="${r.dataset.go}"]`);
  if (t) t.click();
});

/* ---------- Tableau de bord : notifications du jour ---------- */
function renderNotifications() {
  const box = $a('#notif');
  if (!box) return;
  const nb = v => Number(v) || 0;
  const pl = (n, s, p) => n + ' ' + (n > 1 ? (p || s + 's') : s);
  const items = [];   // p = priorité (1 = le plus urgent), c = couleur r/o/g

  // Productions
  PRODUCTIONS.filter(prodActive).forEach(p => {
    const j = p.date_reception_prevue ? joursAvant(p.date_reception_prevue) : null;
    const d = escA(p.modele_nom) + ' · ' + escA(p.atelier_nom) + ' · ' + nb(p.quantite_lancee) + ' pcs';
    if (p.statut === 'Retardée' || (j !== null && j < 0)) {
      items.push({p: 1, c: 'r', ic: '⚠', t: 'Production en retard', d, w: j !== null && j < 0 ? (-j) + ' j de retard' : 'Retardée', go: 'productions-pane'});
    } else if (j !== null && j <= 3) {
      items.push({p: 4, c: 'o', ic: '⏳', t: j === 0 ? "Production à réceptionner aujourd'hui" : 'Production à réceptionner dans ' + j + ' j', d, w: fdA(p.date_reception_prevue), go: 'productions-pane'});
    }
  });
  PRODUCTIONS.filter(prodFini).forEach(p => {
    if (!p.date_reception_reelle) return;
    const j = joursAvant(p.date_reception_reelle);
    if (j === 0 || j === -1) items.push({p: 5, c: 'g', ic: '✔', t: 'Production terminée', d: escA(p.modele_nom) + ' · ' + escA(p.atelier_nom) + ' · ' + nb(p.quantite_lancee) + ' pcs', w: j === 0 ? "Aujourd'hui" : 'Hier', go: 'productions-pane'});
  });

  // Commandes à livrer
  COMMANDES.filter(cmdOuverte).forEach(c => {
    if (!c.date_reception_prevue) return;
    const j = joursAvant(c.date_reception_prevue);
    const reste = Math.max(0, nb(c.quantite_commandee) - nb(c.quantite_recue));
    const who = c.contact_nom && c.contact_nom !== 'N/A' ? ' · ' + escA(c.contact_nom) : '';
    const d = escA(c.commande_numero || '—') + ' · ' + escA(c.modele_nom) + who + ' · reste ' + reste + ' pcs';
    if (j < 0) items.push({p: 2, c: 'r', ic: '⚠', t: 'Commande en retard', d, w: (-j) + ' j de retard', go: 'suivi-pane'});
    else if (j <= 3) items.push({p: 4, c: 'o', ic: '📦', t: j === 0 ? "Commande à livrer aujourd'hui" : 'Commande à livrer dans ' + j + ' j', d, w: fdA(c.date_reception_prevue), go: 'suivi-pane'});
  });

  // Relances clients / fournisseurs
  if (typeof D !== 'undefined' && typeof rel === 'function') {
    const noms = l => l.slice(0, 3).map(c => escA(full(c))).join(', ') + (l.length > 3 ? '…' : '');
    const late = D.filter(c => rel(c).k === 'late');
    const auj = D.filter(c => rel(c).k === 'soon' && rel(c).d === 0);
    if (late.length) items.push({p: 2, c: 'r', ic: '☎', t: pl(late.length, 'relance') + ' en retard', d: noms(late), w: '', nav: 'list'});
    if (auj.length) items.push({p: 3, c: 'o', ic: '☎', t: pl(auj.length, 'relance') + " à faire aujourd'hui", d: noms(auj), w: '', nav: 'list'});
  }

  items.sort((x, y) => x.p - y.p);
  const cnt = $a('#notif-count');
  if (cnt) { cnt.textContent = items.length; cnt.style.display = items.length ? '' : 'none'; }
  const dateTxt = new Date().toLocaleDateString('fr-FR', {weekday: 'long', day: 'numeric', month: 'long'});
  box.innerHTML = '<div class="nday">' + escA(dateTxt) + '</div>' + (items.length
    ? items.map(i => `<div class="nf nf-${i.c}" ${i.go ? `data-go="${i.go}"` : `data-nav="${i.nav}"`}><span class="nic">${i.ic}</span><div class="ntx"><b>${i.t}</b><small>${i.d}</small></div>${i.w ? `<span class="bd ${i.c}">${i.w}</span>` : ''}</div>`).join('')
    : '<div class="empty" style="padding:24px">Aucune notification aujourd\'hui. Tout est à jour.</div>');
}
// Clic sur une relance : ouvre l'onglet Contacts
$a('#v-dash').addEventListener('click', e => {
  const r = e.target.closest('[data-nav]');
  if (!r) return;
  const b = $a(`nav button[data-v="${r.dataset.nav}"]`);
  if (b) b.click();
});

function refreshAtelierViews() {
  updateAtelierSelects();
  renderAtelierStats();
  renderCommandes();
  renderDashAteliers();
  renderNotifications();
}
const _refreshAtelierOriginal = refreshAtelier;
refreshAtelier = function() {
  const tbody = $a('#atelier-tbody');
  if (tbody && !ATELIERS.length) tbody.innerHTML = '<tr><td colspan="7" class="at-empty">Aucun atelier. Cliquez sur « Nouvel atelier » pour commencer.</td></tr>';
  else _refreshAtelierOriginal();
  refreshAtelierViews();
};
const _refreshProductionOriginal = refreshProduction;
refreshProduction = function() {
  const tbody = $a('#production-tbody');
  if (tbody && !PRODUCTIONS.length) tbody.innerHTML = '<tr><td colspan="10" class="at-empty">Aucune production enregistrée.</td></tr>';
  else _refreshProductionOriginal();
  refreshAtelierViews();
};

async function loadCommandes() {
  const { data, error } = await sb.from('commandes')
    .select('*, productions(modele_nom), contacts(nom, prenom)')
    .order('date_commande', { ascending: false });
  if (error) { toastA('Erreur commandes : ' + errMsgA(error)); return; }
  COMMANDES = (data || []).map(c => ({
    ...c,
    modele_nom: c.productions?.modele_nom || 'N/A',
    contact_nom: c.contacts ? [c.contacts.prenom,c.contacts.nom].filter(Boolean).join(' ') : 'N/A'
  }));
  renderCommandes();
  refreshAtelierViews();
}
async function createCommande(o) {
  const { data, error } = await sb.from('commandes').insert(o).select().single();
  if (error) { toastA('Erreur : ' + errMsgA(error)); return null; }
  const { data: row, error: readError } = await sb.from('commandes')
    .select('*, productions(modele_nom), contacts(nom, prenom)').eq('id', data.id).single();
  if (readError) { toastA('Commande créée, mais actualisation impossible.'); return data; }
  return {...row, modele_nom: row.productions?.modele_nom || 'N/A',
    contact_nom: row.contacts ? [row.contacts.prenom,row.contacts.nom].filter(Boolean).join(' ') : 'N/A'};
}
async function updateCommande(id, o) {
  const { data, error } = await sb.from('commandes').update(o).eq('id',id).select().single();
  if (error) { toastA('Erreur : ' + errMsgA(error)); return null; }
  const { data: row, error: readError } = await sb.from('commandes')
    .select('*, productions(modele_nom), contacts(nom, prenom)').eq('id', data.id).single();
  if (readError) return data;
  return {...row, modele_nom: row.productions?.modele_nom || 'N/A',
    contact_nom: row.contacts ? [row.contacts.prenom,row.contacts.nom].filter(Boolean).join(' ') : 'N/A'};
}
async function deleteCommande(id) {
  const { error } = await sb.from('commandes').delete().eq('id',id);
  if (error) { toastA('Erreur : ' + errMsgA(error)); return false; }
  return true;
}
function showFormCommande() {
  curCommande = null;
  updateAtelierSelects();
  const f = $a('#cmd-form'); if (!f) return;
  f.reset(); $a('#cmd-date').value = todayA(); $a('#cmd-qte').value = 1;
  $a('#cmd-recue').value = 0; $a('#cmd-status').value = 'En attente';
  f.style.display = 'block';
}
function editCommande(id) {
  curCommande = COMMANDES.find(c => String(c.id) === String(id));
  if (!curCommande) return;
  updateAtelierSelects();
  const c = curCommande;
  $a('#cmd-form').style.display = 'block';
  $a('#cmd-production').value = c.production_id || '';
  $a('#cmd-contact').value = c.contact_id || '';
  $a('#cmd-numero').value = c.commande_numero || '';
  $a('#cmd-qte').value = c.quantite_commandee || 1;
  $a('#cmd-recue').value = c.quantite_recue || 0;
  $a('#cmd-date').value = c.date_commande || todayA();
  $a('#cmd-reception').value = c.date_reception_prevue || '';
  $a('#cmd-status').value = c.statut || 'En attente';
  $a('#cmd-notes').value = c.notes || '';
}
async function saveCommande() {
  const production_id = $a('#cmd-production').value;
  const contact_id = $a('#cmd-contact').value || null;
  const commande_numero = $a('#cmd-numero').value.trim();
  const quantite_commandee = Number($a('#cmd-qte').value) || 0;
  const quantite_recue = Number($a('#cmd-recue').value) || 0;
  const date_commande = $a('#cmd-date').value;
  const date_reception_prevue = $a('#cmd-reception').value || null;
  const statut = $a('#cmd-status').value;
  const notes = $a('#cmd-notes').value.trim();
  if (!production_id || !commande_numero || !date_commande || quantite_commandee < 1) {
    toastA('Remplissez les champs obligatoires.'); return;
  }
  if (quantite_recue > quantite_commandee) { toastA('La quantité reçue ne peut pas dépasser la quantité commandée.'); return; }
  const obj = {production_id,contact_id,commande_numero,quantite_commandee,quantite_recue,date_commande,date_reception_prevue,statut,notes};
  const result = curCommande ? await updateCommande(curCommande.id,obj) : await createCommande(obj);
  if (!result) return;
  if (curCommande) COMMANDES = COMMANDES.map(c => c.id === result.id ? result : c);
  else COMMANDES.unshift(result);
  curCommande = null; $a('#cmd-form').style.display = 'none';
  renderCommandes(); refreshProduction(); toastA('Commande enregistrée.');
}
async function removeCommande(id) {
  const c = COMMANDES.find(x => String(x.id) === String(id));
  if (!c || !confirm('Supprimer la commande ' + (c.commande_numero || '') + ' ?')) return;
  if (!(await deleteCommande(id))) return;
  COMMANDES = COMMANDES.filter(x => String(x.id) !== String(id));
  renderCommandes(); refreshProduction(); toastA('Commande supprimée.');
}
function cancelFormCommande() { curCommande = null; $a('#cmd-form').style.display = 'none'; }

document.querySelectorAll('[data-at-tab]').forEach(btn => btn.addEventListener('click', () => {
  document.querySelectorAll('[data-at-tab]').forEach(b => b.classList.toggle('on', b === btn));
  document.querySelectorAll('.at-pane').forEach(p => p.classList.toggle('on', p.id === btn.dataset.atTab));
  if (btn.dataset.atTab === 'productions-pane') { renderAtelierStats(); updateAtelierSelects(); }
  if (btn.dataset.atTab === 'suivi-pane') { updateAtelierSelects(); renderCommandes(); }
}));
$a('#cmd-q')?.addEventListener('input', renderCommandes);
$a('#cmd-statut')?.addEventListener('change', renderCommandes);

document.addEventListener('mariabag:authenticated', () => {
  loadAteliers();
  loadProductions();
  loadCommandes();
}, { once: false });
// Session déjà ouverte au rechargement : charger quand même les données
if (!document.getElementById('app').classList.contains('hide')) {
  loadAteliers();
  loadProductions();
  loadCommandes();
}