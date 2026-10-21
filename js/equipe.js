/* ============================================================
   ÉQUIPE (administrateur) : comptes, rôles, invitations et journal des modifications
   Tables : profils, invitations, journal (supabase/comptes.sql) — accessibles seulement à l'administrateur.
   ============================================================ */
(function () {
  'use strict';
  const $ = s => document.querySelector(s);
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const say = t => { if (typeof toast === 'function') toast(t); };
  const remote = () => (window.LocalDB && LocalDB.remote) ? LocalDB.remote() : null;
  const dt = s => { if (!s) return '—'; const d = new Date(s); return isNaN(d) ? '—' : d.toLocaleDateString('fr-FR') + ' ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }); };
  const ROLES = { admin: 'Administrateur', equipe: 'Équipe', en_attente: 'En attente d’approbation', desactive: 'Désactivé' };
  const TABLES = { contacts: 'Contacts', ateliers: 'Ateliers', employes: 'Employés', modeles: 'Modèles (Production)', stock_articles: 'Stock : éléments', composants: 'Fiche matières', productions: 'Productions',
    commandes: 'Commandes', acomptes: 'Acomptes', pointages: 'Pointages', charges: 'Charges', produits: 'Produits', produit_lignes: 'Coûts de produit', stock_mouvements: 'Stock : mouvements',
    charges_fixes: 'Charges fixes', pf_mouvements: 'Produits finis : mouvements', inventaires: 'Inventaires', inventaire_lignes: 'Inventaire : lignes', paiements: 'Paiements', documents: 'Commerce : documents', document_lignes: 'Commerce : lignes' };
  const ACT = { INSERT: 'Ajout', UPDATE: 'Modification', DELETE: 'Suppression' };

  let PROF = [], INVS = [], JOUR = [], err = '', filtreT = '', filtreU = '';

  const admin = () => window.APP_USER && window.APP_USER.role === 'admin';

  async function load() {
    const root = $('#eq-root'); if (!root) return;
    if (!admin()) { root.innerHTML = '<div class="card"><div class="iv-empty">Cette page est réservée à l’administrateur.</div></div>'; return; }
    const r = remote(); if (!r || !navigator.onLine) { root.innerHTML = '<div class="card"><div class="iv-empty">Connexion à internet nécessaire pour gérer l’équipe.</div></div>'; return; }
    const [p, i, j] = await Promise.all([
      r.from('profils').select('*').order('created_at', { ascending: true }),
      r.from('invitations').select('*').order('created_at', { ascending: true }),
      r.from('journal').select('*').order('at', { ascending: false }).limit(300)
    ]);
    const e = p.error || i.error || j.error;
    err = e ? (/does not exist|relation|schema cache/i.test(e.message) ? 'Tables des comptes introuvables : exécutez supabase/comptes.sql dans SQL Editor.' : e.message) : '';
    PROF = p.data || []; INVS = i.data || []; JOUR = j.data || [];
    render();
  }

  function resume(row) {
    const d = row.details || {};
    if (row.action === 'UPDATE') {
      const ks = Object.keys(d).slice(0, 3);
      return ks.map(k => k + ' : ' + short(d[k].avant) + ' → ' + short(d[k].apres)).join(' · ') + (Object.keys(d).length > 3 ? ' …' : '');
    }
    const nom = d.nom || d.libelle || d.designation || d.commande_numero || d.modele_nom || d.contact_nom || d.client_nom || '';
    const q = d.quantite != null ? ' · qté ' + d.quantite : '', m = d.montant != null ? ' · ' + d.montant + ' DA' : '';
    return String(nom || row.enregistrement_id || '') + q + m;
  }
  const short = v => { const s = v == null ? '∅' : typeof v === 'object' ? JSON.stringify(v) : String(v); return s.length > 28 ? s.slice(0, 27) + '…' : s; };

  function render() {
    const root = $('#eq-root'); if (!root) return;
    if (err) { root.innerHTML = '<div class="card"><div class="iv-err">' + esc(err) + '</div></div>'; return; }
    const me = window.APP_USER && window.APP_USER.id;
    const att = PROF.filter(p => p.role === 'en_attente');
    let h = '<div class="hello"><span class="fl">&#10047;</span><div><h2>Équipe et sécurité</h2><p>Qui peut entrer dans la plateforme, avec quel rôle, et l’historique de toutes les modifications.</p></div></div>';
    if (att.length) h += '<div class="card" style="border-color:#d9892b"><h2 style="margin-top:0">Comptes à approuver (' + att.length + ')</h2><div class="tw"><table class="iv-tbl"><tbody>' +
      att.map(p => '<tr><td><b>' + esc(p.nom || p.email) + '</b><small>' + esc(p.email) + ' · créé le ' + dt(p.created_at) + '</small></td><td class="n"><button class="btn s p" type="button" data-eqrole="equipe" data-id="' + esc(p.id) + '">Approuver (équipe)</button> <button class="btn s d" type="button" data-eqrole="desactive" data-id="' + esc(p.id) + '">Refuser</button></td></tr>').join('') + '</tbody></table></div></div>';
    h += '<div class="card"' + (att.length ? ' style="margin-top:12px"' : '') + '><h2 style="margin-top:0">Utilisateurs</h2><div class="tw"><table class="iv-tbl"><thead><tr><th>Utilisateur</th><th>Rôle</th><th class="iv-opt">Dernière connexion</th></tr></thead><tbody>' +
      PROF.filter(p => p.role !== 'en_attente').map(p => '<tr><td><b>' + esc(p.nom || p.email) + '</b>' + (p.id === me ? ' <span class="iv-bdg ok">vous</span>' : '') + '<small>' + esc(p.email) + '</small></td><td><select data-eqsel="' + esc(p.id) + '"' + (p.id === me ? ' disabled title="Vous ne pouvez pas modifier votre propre rôle"' : '') + '>' +
        ['admin', 'equipe', 'desactive'].map(r => '<option value="' + r + '"' + (p.role === r ? ' selected' : '') + '>' + ROLES[r] + '</option>').join('') + '</select></td><td class="iv-opt">' + dt(p.derniere_connexion) + '</td></tr>').join('') + '</tbody></table></div>' +
      '<p class="iv-help"><b>Administrateur</b> : tout, plus la gestion de l’équipe et le journal. <b>Équipe</b> : travail quotidien (contacts, stock, production, paiements, inventaire…). <b>Désactivé</b> : plus aucun accès.</p></div>';
    h += '<div class="card" style="margin-top:12px"><h2 style="margin-top:0">Inviter une personne</h2><form id="eq-inv" class="iv-bar"><label>Adresse e-mail<input id="eq-iem" type="email" required placeholder="prenom@exemple.com"></label><label>Rôle<select id="eq-irole"><option value="equipe">Équipe</option><option value="admin">Administrateur</option></select></label><button class="btn p" type="submit">Inviter</button></form>' +
      '<p class="iv-help">La personne crée son compte sur l’écran de connexion (« Créer un compte ») avec <b>cette adresse e-mail</b> : son accès est alors accordé directement. Sans invitation, un nouveau compte reste « en attente » jusqu’à votre approbation.</p>' +
      (INVS.length ? '<div class="tw"><table class="iv-tbl"><tbody>' + INVS.map(i => '<tr><td>' + esc(i.email) + '<small>invitation en attente</small></td><td>' + ROLES[i.role] + '</td><td class="n"><button class="btn s d" type="button" data-eqdel="' + esc(i.email) + '">Retirer</button></td></tr>').join('') + '</tbody></table></div>' : '') + '</div>';
    const users = [...new Set(JOUR.map(j => j.email).filter(Boolean))];
    const lst = JOUR.filter(j => (!filtreT || j.table_name === filtreT) && (!filtreU || j.email === filtreU));
    h += '<div class="card" style="margin-top:12px"><h2 style="margin-top:0">Journal des modifications</h2><div class="iv-bar"><label>Section <select id="eq-ft"><option value="">Toutes</option>' + Object.keys(TABLES).map(t => '<option value="' + t + '"' + (filtreT === t ? ' selected' : '') + '>' + TABLES[t] + '</option>').join('') + '</select></label>' +
      '<label>Utilisateur <select id="eq-fu"><option value="">Tous</option>' + users.map(u => '<option' + (filtreU === u ? ' selected' : '') + '>' + esc(u) + '</option>').join('') + '</select></label><span class="cnt">' + lst.length + ' ligne(s) · 300 dernières</span></div>' +
      (lst.length ? '<div class="tw"><table class="iv-tbl"><thead><tr><th>Date</th><th>Utilisateur</th><th>Action</th><th>Section</th><th class="iv-opt">Détail</th></tr></thead><tbody>' +
        lst.map(j => '<tr><td>' + dt(j.at) + '</td><td>' + esc(j.email || '') + '</td><td>' + (ACT[j.action] || j.action) + '</td><td>' + esc(TABLES[j.table_name] || j.table_name) + '</td><td class="iv-opt"><small>' + esc(resume(j)) + '</small></td></tr>').join('') + '</tbody></table></div>' : '<div class="iv-empty">Aucune modification enregistrée.</div>') + '</div>';
    root.innerHTML = h;
  }

  document.addEventListener('click', async e => {
    const root = $('#eq-root'); if (!root || !root.contains(e.target)) return;
    const r = remote(); if (!r) return;
    const b = e.target.closest('[data-eqrole]');
    if (b) { const x = await r.from('profils').update({ role: b.dataset.eqrole }).eq('id', b.dataset.id); if (x.error) say('Erreur : ' + x.error.message); else say(b.dataset.eqrole === 'equipe' ? 'Compte approuvé.' : 'Compte refusé.'); await load(); return; }
    const d = e.target.closest('[data-eqdel]');
    if (d && confirm('Retirer l’invitation de ' + d.dataset.eqdel + ' ?')) { const x = await r.from('invitations').delete().eq('email', d.dataset.eqdel); if (x.error) say('Erreur : ' + x.error.message); await load(); }
  });
  document.addEventListener('change', async e => {
    const root = $('#eq-root'); if (!root || !root.contains(e.target)) return;
    const r = remote(); if (!r) return;
    if (e.target.dataset.eqsel) {
      const id = e.target.dataset.eqsel, role = e.target.value, p = PROF.find(x => x.id === id);
      if (!confirm('Passer ' + (p ? p.email : 'ce compte') + ' en « ' + ROLES[role] + ' » ?')) { e.target.value = p ? p.role : 'equipe'; return; }
      const x = await r.from('profils').update({ role }).eq('id', id);
      if (x.error) say('Erreur : ' + x.error.message); else say('Rôle modifié.');
      await load(); return;
    }
    if (e.target.id === 'eq-ft') { filtreT = e.target.value; render(); }
    if (e.target.id === 'eq-fu') { filtreU = e.target.value; render(); }
  });
  document.addEventListener('submit', async e => {
    if (e.target.id !== 'eq-inv') return;
    e.preventDefault();
    const r = remote(); if (!r) return;
    const email = $('#eq-iem').value.trim().toLowerCase(), role = $('#eq-irole').value;
    if (PROF.some(p => p.email.toLowerCase() === email)) { say('Cette personne a déjà un compte : changez son rôle dans la liste.'); return; }
    const x = await r.from('invitations').upsert({ email, role });
    if (x.error) { say('Erreur : ' + x.error.message); return; }
    say('Invitation enregistrée pour ' + email + '.'); await load();
  });

  /* Le bouton « Équipe » du menu n'apparaît que pour l'administrateur */
  document.addEventListener('mariabag:profil', ev => { const b = $('#navEquipe'); if (b) b.hidden = !(ev.detail && ev.detail.role === 'admin'); });
  window.loadEquipe = load;
})();
