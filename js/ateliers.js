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
  if (e) { e.textContent = msg; e.style.display = 'block'; clearTimeout(toastA.t); toastA.t = setTimeout(() => e.style.display = 'none', 3000); }
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
  if (error) { toastA('Erreur : ' + error.message); return; }
  ATELIERS = data || [];
  refreshAtelier();
}

async function createAtelier(o) {
  const { data, error } = await sb.from('ateliers').insert(o).select().single();
  if (error) { toastA('Erreur : ' + error.message); return null; }
  return data;
}

async function updateAtelier(id, o) {
  const { data, error } = await sb.from('ateliers').update(o).eq('id', id).select().single();
  if (error) { toastA('Erreur : ' + error.message); return null; }
  return data;
}

async function deleteAtelier(id) {
  const { error } = await sb.from('ateliers').delete().eq('id', id);
  if (error) { toastA('Erreur : ' + error.message); return false; }
  return true;
}

// ============================================================
// OPÉRATIONS CRUD PRODUCTIONS
// ============================================================

async function loadProductions() {
  const { data, error } = await sb.from('productions').select('*, ateliers(nom)').order('date_lancement', { ascending: false });
  if (error) { toastA('Erreur : ' + error.message); return; }
  PRODUCTIONS = (data || []).map(p => ({
    ...p,
    atelier_nom: p.ateliers?.nom || 'N/A'
  }));
  refreshProduction();
}

async function createProduction(o) {
  const { data, error } = await sb.from('productions').insert(o).select().single();
  if (error) { toastA('Erreur : ' + error.message); return null; }
  const prod = await sb.from('productions').select('*, ateliers(nom)').eq('id', data.id).single();
  return prod.data ? { ...prod.data, atelier_nom: prod.data.ateliers?.nom || 'N/A' } : null;
}

async function updateProduction(id, o) {
  const { data, error } = await sb.from('productions').update(o).eq('id', id).select().single();
  if (error) { toastA('Erreur : ' + error.message); return null; }
  const prod = await sb.from('productions').select('*, ateliers(nom)').eq('id', data.id).single();
  return prod.data ? { ...prod.data, atelier_nom: prod.data.ateliers?.nom || 'N/A' } : null;
}

async function deleteProduction(id) {
  const { error } = await sb.from('productions').delete().eq('id', id);
  if (error) { toastA('Erreur : ' + error.message); return false; }
  return true;
}

// ============================================================
// OPÉRATIONS CRUD COMMANDES
// ============================================================

async function loadCommandes() {
  const { data, error } = await sb.from('commandes').select('*, productions(modele_nom), contacts(nom, prenom)').order('date_commande', { ascending: false });
  if (error) { toastA('Erreur : ' + error.message); return; }
  COMMANDES = (data || []).map(c => ({
    ...c,
    modele_nom: c.productions?.modele_nom || 'N/A',
    contact_nom: c.contacts ? (c.contacts.prenom + ' ' + c.contacts.nom).trim() : 'N/A'
  }));
}

async function createCommande(o) {
  const { data, error } = await sb.from('commandes').insert(o).select().single();
  if (error) { toastA('Erreur : ' + error.message); return null; }
  const cmd = await sb.from('commandes').select('*, productions(modele_nom), contacts(nom, prenom)').eq('id', data.id).single();
  return cmd.data ? { ...cmd.data, modele_nom: cmd.data.productions?.modele_nom || 'N/A', contact_nom: cmd.data.contacts ? (cmd.data.contacts.prenom + ' ' + cmd.data.contacts.nom).trim() : 'N/A' } : null;
}

async function updateCommande(id, o) {
  const { data, error } = await sb.from('commandes').update(o).eq('id', id).select().single();
  if (error) { toastA('Erreur : ' + error.message); return null; }
  const cmd = await sb.from('commandes').select('*, productions(modele_nom), contacts(nom, prenom)').eq('id', data.id).single();
  return cmd.data ? { ...cmd.data, modele_nom: cmd.data.productions?.modele_nom || 'N/A', contact_nom: cmd.data.contacts ? (cmd.data.contacts.prenom + ' ' + cmd.data.contacts.nom).trim() : 'N/A' } : null;
}

async function deleteCommande(id) {
  const { error } = await sb.from('commandes').delete().eq('id', id);
  if (error) { toastA('Erreur : ' + error.message); return false; }
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
    const couleur = p.statut === 'Terminée' ? 'g' : p.statut === 'Retardée' ? 'r' : 'o';
    return `<tr class="production-row" data-id="${p.id}">
      <td><b>${p.modele_nom}</b></td>
      <td>${p.atelier_nom}</td>
      <td>${p.quantite_lancee}</td>
      <td>${fdA(p.date_lancement)}</td>
      <td>${fdA(p.date_reception_prevue)}</td>
      <td>${jours ? jours + ' j' : '-'}</td>
      <td>${p.date_reception_reelle ? fdA(p.date_reception_reelle) : '-'}</td>
      <td><span class="bd ${couleur}">${p.statut}</span></td>
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
  const date_reception_reelle = $a('#prod-date-reelle').value || null;
  const statut = $a('#prod-statut').value;
  const notes = $a('#prod-notes').value.trim();
  
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
  const active = PRODUCTIONS.filter(p => !['Terminée','Annulée'].includes(p.statut)).length;
  const done = PRODUCTIONS.filter(p => p.statut === 'Terminée' && (p.date_reception_reelle || p.updated_at || p.date_lancement || '').slice(0,7) === today.slice(0,7)).length;
  const late = PRODUCTIONS.filter(p => p.statut !== 'Terminée' && p.statut !== 'Annulée' && p.date_reception_prevue && p.date_reception_prevue < today).length;
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
function refreshAtelierViews() {
  updateAtelierSelects();
  renderAtelierStats();
  renderCommandes();
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
  if (error) { toastA('Erreur commandes : ' + error.message); return; }
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
  if (error) { toastA('Erreur : ' + error.message); return null; }
  const { data: row, error: readError } = await sb.from('commandes')
    .select('*, productions(modele_nom), contacts(nom, prenom)').eq('id', data.id).single();
  if (readError) { toastA('Commande créée, mais actualisation impossible.'); return data; }
  return {...row, modele_nom: row.productions?.modele_nom || 'N/A',
    contact_nom: row.contacts ? [row.contacts.prenom,row.contacts.nom].filter(Boolean).join(' ') : 'N/A'};
}
async function updateCommande(id, o) {
  const { data, error } = await sb.from('commandes').update(o).eq('id',id).select().single();
  if (error) { toastA('Erreur : ' + error.message); return null; }
  const { data: row, error: readError } = await sb.from('commandes')
    .select('*, productions(modele_nom), contacts(nom, prenom)').eq('id', data.id).single();
  if (readError) return data;
  return {...row, modele_nom: row.productions?.modele_nom || 'N/A',
    contact_nom: row.contacts ? [row.contacts.prenom,row.contacts.nom].filter(Boolean).join(' ') : 'N/A'};
}
async function deleteCommande(id) {
  const { error } = await sb.from('commandes').delete().eq('id',id);
  if (error) { toastA('Erreur : ' + error.message); return false; }
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