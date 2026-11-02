/* ============================================================
   MARIA BAG — Suivi des contacts (version en ligne, Supabase)
   Même design, mêmes fonctionnalités que la version locale,
   mais les contacts sont stockés dans une base Supabase partagée
   au lieu du localStorage du navigateur.
   ============================================================ */

// Base locale sur l'ordinateur (js/local-db.js), synchronisée avec Supabase quand internet est disponible
const sb = LocalDB.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* Logiciel PC (Windows) : après une boîte « OK / Annuler » (confirm, alert, prompt), on redemande le clavier au logiciel,
   sinon on ne peut plus écrire dans les cases jusqu'à l'actualisation de la page. */
(function () {
  if (!window.mariabagPC || !window.mariabagPC.rendreClavier) return;
  ['confirm', 'alert', 'prompt'].forEach(f => {
    const orig = window[f].bind(window);
    window[f] = function () { const a = document.activeElement; try { return orig.apply(null, arguments); } finally { window.mariabagPC.rendreClavier(); setTimeout(() => { try { if (a && a.focus && document.contains(a)) a.focus({ preventScroll: true }); } catch (e) {} }, 60); } };
  });
})();

/* Ouverture d'un formulaire : il défile juste sous l'en-tête fixe (sans être caché dessous),
   et le curseur placé dans la première case n'interrompt plus le défilement (sinon la page « glisse »). */
(function () {
  const hdr = () => { const h = document.querySelector('header'); document.documentElement.style.setProperty('--hdr-h', (h ? h.getBoundingClientRect().height : 0) + 'px'); };
  window.addEventListener('resize', hdr); document.addEventListener('DOMContentLoaded', hdr); setTimeout(hdr, 500);
  try { const h = document.querySelector('header'); if (h && window.ResizeObserver) new ResizeObserver(hdr).observe(h); } catch (e) {}
  let dernier = 0;
  const siv = Element.prototype.scrollIntoView;
  Element.prototype.scrollIntoView = function (o) { dernier = Date.now(); hdr(); return siv.call(this, o); };
  const foc = HTMLElement.prototype.focus;
  HTMLElement.prototype.focus = function (o) { return foc.call(this, Date.now() - dernier < 900 ? Object.assign({}, o || {}, { preventScroll: true }) : o); };
})();
const TABLE = 'contacts';

const $ = s => document.querySelector(s);
const ST = {'Confirmé':'g','En attente':'o','Pas intéressé':'r'};
let D = [], cur = null, sk = 'nom', sd = 1, loaded = false;

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const iso = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const today = () => iso(new Date());
const fd = s => s ? s.split('-').reverse().join('/') : '';
const full = c => [c.prenom, c.nom].filter(Boolean).join(' ');

function toast(t) {
  const e = $('#toast');
  e.textContent = t;
  e.style.display = 'block';
  clearTimeout(toast.t);
  toast.t = setTimeout(() => e.style.display = 'none', 3500);
}

function setSync(state, text) {
  const dot = $('#syncDot'), txt = $('#syncTxt');
  if (!dot) return;
  dot.className = 'xd' + (state === 'ok' ? '' : state === 'warn' ? ' w' : ' e');
  txt.textContent = text;
}

/* ---------- Conversion objet contact <-> ligne Supabase ---------- */
const FIELDS = ['nom','prenom','poste','societe','type','statut','tel','email','ville','source','produits','notes'];
function toDb(o) {
  const row = {};
  for (const k of FIELDS) row[k] = (o[k] ?? '').toString().trim();
  row.derniere = o.derniere ? o.derniere : null;
  row.relance = o.relance ? o.relance : null;
  if (o.hist) row.hist = o.hist;
  return row;
}
function fromDb(r) {
  return {
    id: r.id,
    nom: r.nom || '', prenom: r.prenom || '', poste: r.poste || '', societe: r.societe || '',
    type: r.type || 'Client', statut: r.statut || 'En attente', tel: r.tel || '', email: r.email || '',
    ville: r.ville || '', source: r.source || '', produits: r.produits || '', notes: r.notes || '',
    derniere: r.derniere || '', relance: r.relance || '', hist: r.hist || []
  };
}

function rel(c) {
  if (c.statut === 'Pas intéressé') return {k:'none', l:'Sans objet', c:'n', d:null};
  if (!c.relance) return {k:'none', l:'Non planifiée', c:'n', d:null};
  const d = Math.round((new Date(c.relance + 'T00:00') - new Date(today() + 'T00:00')) / 864e5);
  if (d < 0) return {k:'late', l:'En retard (' + (-d) + ' j)', c:'r', d};
  if (d <= 7) return {k:'soon', l:'À relancer bientôt' + (d === 0 ? ' (auj.)' : ' (' + d + ' j)'), c:'o', d};
  return {k:'ok', l:'OK', c:'g', d};
}

/* ---------- Chargement (base locale, synchronisée avec Supabase) ---------- */
async function loadContacts() {
  const { data, error } = await sb.from(TABLE).select('*').order('nom', { ascending: true });
  if (error) {
    toast('Erreur de lecture des contacts : ' + error.message);
    return;
  }
  D = (data || []).map(fromDb);
  loaded = true;
  LocalDB.status();
  refresh();
}

async function createContact(o) {
  const { data, error } = await sb.from(TABLE).insert(toDb(o)).select().single();
  if (error) { toast('Erreur : ' + error.message); return null; }
  return fromDb(data);
}
async function updateContact(id, o) {
  const { data, error } = await sb.from(TABLE).update(toDb(o)).eq('id', id).select().single();
  if (error) { toast('Erreur : ' + error.message); return null; }
  return fromDb(data);
}
async function deleteContact(id) {
  const { error } = await sb.from(TABLE).delete().eq('id', id);
  if (error) { toast('Erreur : ' + error.message); return false; }
  return true;
}
async function updateHist(id, hist) {
  const { data, error } = await sb.from(TABLE).update({ hist }).eq('id', id).select().single();
  if (error) { toast('Erreur : ' + error.message); return null; }
  return fromDb(data);
}

/* ---------- Navigation ---------- */
document.getElementById('bNew').style.display = 'none';
document.querySelectorAll('nav button').forEach(b => b.onclick = () => show(b.dataset.v));
function show(v) {
  // Le bouton « + Nouveau contact » n'apparaît que dans l'onglet Contacts
  document.getElementById('bNew').style.display = (v === 'list') ? '' : 'none';
  document.querySelectorAll('nav button').forEach(b => b.classList.toggle('on', b.dataset.v === v));
  document.querySelectorAll('section').forEach(s => s.classList.toggle('on', s.id === 'v-' + v));
  if (v === 'dash') dash();
  else if (v === 'ateliers') { if (typeof refreshAtelierViews === 'function') refreshAtelierViews(); }
  else if (v === 'employes') { if (typeof renderEmployes === 'function') renderEmployes(); }
  else if (v === 'inventaire') { if (typeof loadInventaire === 'function') loadInventaire(true); }
  else if (v === 'commerce') { if (typeof loadCommerce === 'function') loadCommerce(true); }
  else if (v === 'equipe') { if (typeof loadEquipe === 'function') loadEquipe(); }
  else if (v === 'notes') { if (typeof loadNotes === 'function') loadNotes(); }
  else list();
}

/* ---------- Tableau de bord ---------- */
function dash() {
  const n = D.length, cl = D.filter(c => c.type === 'Client').length, fo = n - cl, cf = D.filter(c => c.statut === 'Confirmé').length;
  const late = D.filter(c => rel(c).k === 'late'), soon = D.filter(c => rel(c).k === 'soon');
  $('#kpis').innerHTML = `
   <div class="card kpi"><span>Contacts au total</span><b>${n}</b></div>
   <div class="card kpi"><span>Clients / Fournisseurs</span><b>${cl} / ${fo}</b></div>
   <div class="card kpi"><span>Taux de confirmation</span><b>${n ? Math.round(cf / n * 100) : 0} %</b><i>${cf} confirmé(s) sur ${n}</i></div>
   <div class="card kpi u"><span>Relances urgentes</span><b>${late.length + soon.length}</b><i>${late.length} en retard · ${soon.length} cette semaine</i></div>`;
  const col = {'Confirmé':'var(--g)','En attente':'var(--o)','Pas intéressé':'var(--r)'};
  $('#bars').innerHTML = Object.keys(ST).map(s => { const k = D.filter(c => c.statut === s).length; return `<div class="bar"><div class="t"><span>${s}</span><b>${k}</b></div><div class="tr"><i style="width:${n ? k / n * 100 : 0}%;background:${col[s]}"></i></div></div>` }).join('');
  if (typeof renderNotifications === 'function') renderNotifications();
  const u = [...late, ...soon].sort((a, b) => a.relance.localeCompare(b.relance)).slice(0, 10);
  $('#urg').innerHTML = u.length ? `<table style="min-width:0"><tbody>${u.map(c => { const r = rel(c); return `<tr class="row" data-id="${c.id}"><td><b>${esc(full(c))}</b><small>${esc(c.societe)}</small></td><td>${esc(c.type)}</td><td>${fd(c.relance)}</td><td><span class="bd ${r.c}">${r.l}</span></td></tr>` }).join('')}</tbody></table>` : '<div class="empty">Aucune relance urgente. ' + (n ? 'Tout est à jour.' : 'Ajoutez ou importez vos premiers contacts.') + '</div>';
}
$('#urg').onclick = e => { const r = e.target.closest('tr[data-id]'); if (r) edit(r.dataset.id) };

/* ---------- Liste ---------- */
const COLS = [['nom','Contact'],['societe','Société'],['type','Type'],['statut','Statut'],['ville','Ville / Pays'],['','Coordonnées'],['relance','Prochaine relance'],['','']];
function list() {
  $('#thead').innerHTML = '<tr>' + COLS.map(([k, l]) => `<th data-k="${k}" class="${k === sk ? 'sorted' : ''}">${l}${k === sk ? (sd > 0 ? ' ▲' : ' ▼') : ''}</th>`).join('') + '</tr>';
  const q = norm($('#q').value), t = $('#ft').value, s = $('#fs').value, r = $('#fr').value;
  const val = c => sk === 'relance' ? (c.relance || '9999') : norm(c[sk]);
  const a = D.filter(c => (!t || c.type === t) && (!s || c.statut === s) && (!r || rel(c).k === r) && (!q || norm([c.nom, c.prenom, c.societe, c.ville, c.email, c.produits].join(' ')).includes(q)))
    .sort((x, y) => val(x) < val(y) ? -sd : val(x) > val(y) ? sd : 0);
  $('#cnt').textContent = a.length + ' contact(s) sur ' + D.length;
  $('#tbody').innerHTML = a.length ? a.map(c => { const r = rel(c); return `<tr class="row" data-id="${c.id}">
   <td><b>${esc(full(c))}</b><small>${esc(c.poste)}</small></td><td>${esc(c.societe)}</td>
   <td><span class="bd ty ${c.type === 'Client' ? 'c' : 'f'}">${esc(c.type)}</span></td>
   <td><span class="bd ${ST[c.statut] || 'n'}">${esc(c.statut)}</span></td><td>${esc(c.ville)}</td>
   <td>${c.tel ? `<a href="tel:${esc(c.tel)}">${esc(c.tel)}</a>` : ''}${c.email ? `<small><a href="mailto:${esc(c.email)}">${esc(c.email)}</a></small>` : ''}</td>
   <td><span class="bd ${r.c}">${r.l}</span>${c.relance ? `<small>${fd(c.relance)}</small>` : ''}</td>
   <td style="white-space:nowrap"><button class="btn s p" type="button" data-p="${c.id}">Profil</button> <button class="btn s" data-e="${c.id}">Ouvrir</button></td></tr>` }).join('') : `<tr><td colspan="8" class="empty">${D.length ? 'Aucun contact ne correspond à votre recherche.' : 'Aucun contact. Cliquez sur « Nouveau contact » ou importez un fichier CSV.'}</td></tr>`;
}
$('#thead').onclick = e => { const k = e.target.closest('th')?.dataset.k; if (!k) return; sd = sk === k ? -sd : 1; sk = k; list() };
['q', 'ft', 'fs', 'fr'].forEach(i => $('#' + i).oninput = list);
$('#tbody').onclick = e => { if (e.target.closest('a')) return; const pf = e.target.closest('[data-p]'); if (pf && typeof ouvrirProfil === 'function') { ouvrirProfil(pf.dataset.p); return; } const ed = e.target.closest('[data-e]'); if (ed) { edit(ed.dataset.e); return; } const r = e.target.closest('tr[data-id]'); if (r) { if (typeof ouvrirProfil === 'function') ouvrirProfil(r.dataset.id); else edit(r.dataset.id); } };

/* ---------- Fiche contact ---------- */
const F = () => $('#cf').elements;
function srcs() { $('#srcs').innerHTML = [...new Set(D.map(c => c.source).filter(Boolean))].map(s => `<option value="${esc(s)}">`).join('') }
function edit(id) {
  cur = id ? D.find(c => c.id === id) : null;
  srcs();
  $('#cf').reset();
  const c = cur || {type:'Client', statut:'En attente', derniere: today()};
  ['nom','prenom','poste','societe','type','statut','tel','email','ville','source','produits','derniere','relance','notes'].forEach(k => F()[k].value = c[k] || '');
  $('#mt').textContent = cur ? full(cur) + (cur.societe ? ' – ' + cur.societe : '') : 'Nouveau contact';
  $('#bDel').style.display = cur ? '' : 'none';
  $('#hist').style.display = cur ? '' : 'none';
  $('#hnew').style.display = cur ? 'none' : '';
  $('#hd').value = today();
  $('#hn').value = $('#hs').value = '';
  if (cur) hl();
  $('#m').classList.add('on');
  F().nom.focus();
}
const close = () => $('#m').classList.remove('on');
$('#bCancel').onclick = close;
$('#m').onmousedown = e => { if (e.target.id === 'm') close() };
document.addEventListener('keydown', e => { if (e.key === 'Escape') close() });
$('#bNew').onclick = () => edit();
$('#cf').onsubmit = async e => {
  e.preventDefault();
  const o = {}; for (const el of $('#cf').elements) if (el.name) o[el.name] = el.value.trim();
  if (cur) {
    const updated = await updateContact(cur.id, { ...cur, ...o });
    if (!updated) return;
    Object.assign(cur, updated);
  } else {
    const created = await createContact({ hist: [], ...o });
    if (!created) return;
    D.push(created);
  }
  close(); refresh(); toast('Contact enregistré');
};
$('#bDel').onclick = async () => {
  if (cur && confirm('Supprimer définitivement ' + full(cur) + ' ?')) {
    const ok = await deleteContact(cur.id);
    if (!ok) return;
    D = D.filter(c => c.id !== cur.id);
    close(); refresh(); toast('Contact supprimé');
  }
};
document.querySelectorAll('[data-add]').forEach(b => b.onclick = () => { const d = new Date(); d.setDate(d.getDate() + +b.dataset.add); F().relance.value = iso(d) });

function hl() {
  const h = (cur.hist || []).slice().sort((a, b) => b.d.localeCompare(a.d));
  $('#hl').innerHTML = h.length ? h.map(x => `<div class="hi"><button class="x" title="Supprimer" data-x="${x.id}">×</button><b>${esc(x.t)}</b> <small>${fd(x.d)}</small><div>${esc(x.n)}</div>${x.s ? `<small>Étape suivante : ${esc(x.s)}</small>` : ''}</div>`).join('') : '<p style="color:var(--mut)">Aucun échange enregistré.</p>';
}
$('#hb').onclick = async () => {
  const n = $('#hn').value.trim(), s = $('#hs').value.trim();
  if (!n && !s) { toast('Saisissez un résumé ou une étape suivante'); return }
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const hist = [...(cur.hist || []), { id: uid(), t: $('#ht').value, d: $('#hd').value || today(), n, s }];
  let newDerniere = cur.derniere;
  if (!cur.derniere || $('#hd').value > cur.derniere) { newDerniere = $('#hd').value || today(); F().derniere.value = newDerniere; }
  const updated = await updateHist(cur.id, hist);
  if (!updated) return;
  if (newDerniere !== cur.derniere) await updateContact(cur.id, { ...cur, derniere: newDerniere });
  Object.assign(cur, updated, { derniere: newDerniere });
  hl(); $('#hn').value = $('#hs').value = ''; refresh(); toast('Échange ajouté');
};
$('#hl').onclick = async e => {
  const x = e.target.dataset.x;
  if (x && confirm('Supprimer cet échange ?')) {
    const hist = cur.hist.filter(h => h.id !== x);
    const updated = await updateHist(cur.id, hist);
    if (!updated) return;
    Object.assign(cur, updated);
    hl();
  }
};
function refresh() { $('#v-dash').classList.contains('on') ? dash() : list() }

/* ---------- Excel (.xlsx) + CSV ---------- */
const HEAD = ['Nom','Prénom','Poste','Société','Type','Statut','Téléphone','Email','Ville/Pays','Source',"Produits d'intérêt",'Dernière action','Prochaine relance','Notes','Historique'];
const KEYS = ['nom','prenom','poste','societe','type','statut','tel','email','ville','source','produits','derniere','relance','notes'];
const q2 = v => '"' + String(v ?? '').replace(/"/g, '""') + '"';
const clean = s => String(s || '').replace(/[|¶\r\n]+/g, ' ');
const histStr = c => (c.hist || []).map(h => [h.d, h.t, clean(h.n), clean(h.s)].join('|')).join('¶');
function download(blob, name) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove() }

function buildWB() {
  const aoa = [HEAD, ...D.map(c => [...KEYS.map(k => (k === 'derniere' || k === 'relance') ? fd(c[k]) : String(c[k] ?? '')), histStr(c)])];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = [16, 14, 16, 24, 12, 14, 16, 26, 18, 18, 26, 15, 16, 36, 20].map(w => ({ wch: w }));
  ws['!autofilter'] = { ref: 'A1:O' + Math.max(aoa.length, 2) };
  const j = [['Contact', 'Société', 'Date', 'Type', 'Résumé', 'Étape suivante']];
  D.forEach(c => (c.hist || []).forEach(h => j.push([(c.prenom + ' ' + c.nom).trim(), c.societe || '', fd(h.d), h.t, h.n || '', h.s || ''])));
  const wj = XLSX.utils.aoa_to_sheet(j); wj['!cols'] = [22, 24, 12, 12, 50, 34].map(w => ({ wch: w }));
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Contacts'); XLSX.utils.book_append_sheet(wb, wj, 'Journal');
  return wb;
}
const wbBlob = () => new Blob([XLSX.write(buildWB(), { bookType: 'xlsx', type: 'array' })], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
function parseCSV(t) {
  const first = t.split('\n')[0], del = [';', ',', '\t'].map(d => [d, first.split(d).length]).sort((a, b) => b[1] - a[1])[0][0];
  const rows = []; let r = [], f = '', inq = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (inq) { if (c === '"') { if (t[i + 1] === '"') { f += '"'; i++ } else inq = false } else f += c }
    else if (c === '"') inq = true; else if (c === del) { r.push(f); f = '' }
    else if (c === '\n') { r.push(f); rows.push(r); r = []; f = '' } else if (c !== '\r') f += c
  }
  if (f !== '' || r.length) { r.push(f); rows.push(r) }
  return rows.filter(r => r.some(x => String(x).trim()));
}
const ALIAS = { nom: ['nom', 'name', 'last name', 'lastname'], prenom: ['prenom', 'first name', 'firstname'], poste: ['poste', 'fonction', 'title'], societe: ['societe', 'entreprise', 'company', 'raison sociale'], type: ['type'], statut: ['statut', 'status'], tel: ['telephone', 'tel', 'phone', 'mobile'], email: ['email', 'e mail', 'mail', 'courriel'], ville: ['ville pays', 'ville', 'pays', 'city', 'country'], source: ['source', 'origine'], produits: ['produits d interet', 'produits', 'interet'], derniere: ['derniere action'], relance: ['prochaine relance', 'relance'], notes: ['notes', 'note', 'commentaires'], hist: ['historique'] };
const hn = s => norm(s).replace(/[^a-z0-9]+/g, ' ').trim();
const dt = s => { s = (s || '').trim(); let m; if (m = s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/)) return m[3] + '-' + m[2].padStart(2, '0') + '-' + m[1].padStart(2, '0'); return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : '' };
const isDup = (c, L) => L.some(o => (c.email && norm(o.email) === norm(c.email)) || (!c.email && norm(o.nom + o.prenom + o.societe) === norm(c.nom + c.prenom + c.societe)));
const uid2 = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
function rowsToContacts(rows) {
  if (rows.length < 1) return [];
  const hd = rows[0].map(hn), idx = {};
  for (const k in ALIAS) { const i = hd.findIndex(h => ALIAS[k].includes(h)); if (i >= 0) idx[k] = i }
  if (idx.nom === undefined && idx.societe === undefined) return null;
  const out = [];
  for (const r of rows.slice(1)) {
    const g = k => {
      if (idx[k] === undefined) return '';
      let v = r[idx[k]];
      if (typeof v === 'number' && (k === 'derniere' || k === 'relance')) { const p = XLSX.SSF.parse_date_code(v); return p ? p.y + '-' + String(p.m).padStart(2, '0') + '-' + String(p.d).padStart(2, '0') : '' }
      return String(v ?? '').trim()
    };
    const c = { nom: g('nom'), prenom: g('prenom'), poste: g('poste'), societe: g('societe'), tel: g('tel'), email: g('email'), ville: g('ville'), source: g('source'), produits: g('produits'), notes: g('notes'), derniere: dt(g('derniere')), relance: dt(g('relance')), hist: [] };
    const ty = norm(g('type')), sta = norm(g('statut'));
    c.type = /four|suppl|vend/.test(ty) ? 'Fournisseur' : 'Client';
    c.statut = /confirm/.test(sta) ? 'Confirmé' : /pas|non|refus/.test(sta) ? 'Pas intéressé' : 'En attente';
    c.hist = g('hist').split('¶').filter(Boolean).map(x => { const p = x.split('|'); return { id: uid2(), d: dt(p[0]) || today(), t: p[1] || 'Autre', n: p[2] || '', s: p[3] || '' } });
    if (!c.nom && !c.societe) continue;
    out.push(c);
  }
  return out;
}
function wbToContacts(buf) {
  const wb = XLSX.read(buf, { type: 'array' });
  const name = wb.SheetNames.find(n => hn(n) === 'contacts') || wb.SheetNames[0];
  return rowsToContacts(XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true, defval: '' }).filter(r => r.some(x => String(x).trim())));
}
async function mergeIn(list) {
  let add = 0, skip = 0;
  for (const c of list) {
    if (isDup(c, D)) { skip++; continue }
    const created = await createContact(c);
    if (created) { D.push(created); add++ } else skip++;
  }
  return { add, skip };
}
const BADCOLS = "Colonnes non reconnues. La première ligne doit contenir des en-têtes comme : Nom, Prénom, Société, Type, Statut, Téléphone, Email…";
/* ---------- Démarrage ---------- */
document.addEventListener('mariabag:authenticated', () => { if (!loaded) loadContacts() }, { once: false });
// Si la session est déjà ouverte au rechargement de la page, l'évènement a pu partir avant ce script
if (!$('#app').classList.contains('hide') && !loaded) loadContacts();