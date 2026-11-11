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
    charges_fixes: 'Charges fixes', pf_mouvements: 'Produits finis : mouvements', inventaires: 'Inventaires', inventaire_lignes: 'Inventaire : lignes', paiements: 'Paiements', paiements_ateliers: 'Paiements des ateliers', credits_employes: 'Crédits des employés', rendez_vous: 'Notes et rendez-vous', notes_perso: 'Notes personnelles', documents: 'Commerce : documents', document_lignes: 'Commerce : lignes' };
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
    // ---- Créer un compte (identifiant + mot de passe) avec ses sections ----
    const SEC = window.SECTIONS_APP || [];
    const PRESETS = [['Production + Produits', ['production', 'produits', 'gabarits']], ['Magasinier (bons de sortie)', ['sorties']], ['Vendeur magasin', ['magasins']], ['Dépôt (commandes magasins)', ['depot', 'gabarits']], ['Commerce + Stock', ['commerce', 'stock', 'list']], ['Tout', SEC.map(x => x[0])]];
    h += '<div class="card"' + (att.length ? ' style="margin-top:12px"' : '') + '><h2 style="margin-top:0">Créer un compte</h2>' +
      '<form id="eq-new" class="eq-new"><div class="at-fields"><label>Nom affiché *<input id="eq-nnom" required maxlength="60" placeholder="Ex : Oussama"></label>' +
      '<label>Identifiant de connexion *<input id="eq-nid" required maxlength="40" autocapitalize="none" spellcheck="false" placeholder="Ex : oussama"></label>' +
      '<label>Mot de passe * (6 caractères min.)<input id="eq-nmdp" required minlength="6" maxlength="60" autocomplete="new-password" placeholder="Ex : Mb-oussama-26"></label>' +
      '<label>Rôle<select id="eq-nrole"><option value="equipe">Équipe (sections choisies)</option><option value="admin">Administrateur (tout)</option></select></label>' +
      '<label>Thème<select id="eq-ntheme">' + (window.THEMES_APP || [['', 'Classique']]).map(t => '<option value="' + t[0] + '">' + t[1] + '</option>').join('') + '</select></label></div>' +
      '<div class="eq-sec"><span>Sections accessibles :</span>' + PRESETS.map((x, i) => '<button type="button" class="btn s" data-preset="' + i + '">' + x[0] + '</button>').join('') + '</div>' +
      '<div class="eq-chk" id="eq-nsec">' + SEC.map(x => '<label><input type="checkbox" value="' + x[0] + '"> ' + x[1] + '</label>').join('') + '</div>' +
      '<div class="at-actions"><button class="btn p" type="submit">Créer le compte</button><span id="eq-nmsg" class="eq-msg"></span></div></form>' +
      '<p class="iv-help">La personne se connecte avec son <b>identifiant</b> (ex. <b>oussama</b>) et ce mot de passe, sans adresse e-mail. Elle ne voit que les sections cochées ; toutes les données restent synchronisées avec le reste de la plateforme.</p></div>';
    h += '<div class="card" style="margin-top:12px"><h2 style="margin-top:0">Utilisateurs</h2><div class="tw"><table class="iv-tbl"><thead><tr><th>Utilisateur</th><th>Rôle</th><th class="iv-opt">Dernière connexion</th></tr></thead><tbody>' +
      PROF.filter(p => p.role !== 'en_attente').map(p => '<tr><td><b>' + esc(p.nom || p.email) + '</b>' + (p.id === me ? ' <span class="iv-bdg ok">vous</span>' : '') + '<small>' + esc(p.email) + '</small></td><td><select data-eqsel="' + esc(p.id) + '"' + (p.id === me ? ' disabled title="Vous ne pouvez pas modifier votre propre rôle"' : '') + '>' +
        ['admin', 'equipe', 'desactive'].map(r => '<option value="' + r + '"' + (p.role === r ? ' selected' : '') + '>' + ROLES[r] + '</option>').join('') + '</select>' +
        (p.role === 'equipe' ? '<div class="eq-chk eq-chk-s" data-eqsec="' + esc(p.id) + '">' + SEC.map(x => '<label><input type="checkbox" value="' + x[0] + '"' + (!p.sections || !p.sections.length || p.sections.includes(x[0]) ? ' checked' : '') + '> ' + x[1] + '</label>').join('') + '</div>' : '') +
        '<label class="eq-th">Thème <select data-eqtheme="' + esc(p.id) + '">' + (window.THEMES_APP || [['', 'Classique']]).map(t => '<option value="' + t[0] + '"' + ((p.theme || '') === t[0] ? ' selected' : '') + '>' + t[1] + '</option>').join('') + '</select></label> ' +
        (p.id !== me ? '<button type="button" class="btn s" data-eqmdp="' + esc(p.id) + '">Changer le mot de passe</button>' : '') + '</td><td class="iv-opt">' + dt(p.derniere_connexion) + '</td></tr>').join('') + '</tbody></table></div>' +
      '<p class="iv-help"><b>Administrateur</b> : tout, plus la gestion de l’équipe et le journal. <b>Équipe</b> : seulement les sections cochées (modifiable à tout moment, effet à la prochaine ouverture de la plateforme). <b>Désactivé</b> : plus aucun accès.</p></div>';
    h += '<div class="card" style="margin-top:12px"><h2 style="margin-top:0">Inviter une personne</h2><form id="eq-inv" class="iv-bar"><label>Adresse e-mail<input id="eq-iem" type="email" required placeholder="prenom@exemple.com"></label><label>Rôle<select id="eq-irole"><option value="equipe">Équipe</option><option value="admin">Administrateur</option></select></label><button class="btn p" type="submit">Inviter</button></form>' +
      '<p class="iv-help">La personne crée son compte sur l’écran de connexion (« Créer un compte ») avec <b>cette adresse e-mail</b> : son accès est alors accordé directement. Sans invitation, un nouveau compte reste « en attente » jusqu’à votre approbation.</p>' +
      (INVS.length ? '<div class="tw"><table class="iv-tbl"><tbody>' + INVS.map(i => '<tr><td>' + esc(i.email) + '<small>invitation en attente</small></td><td>' + ROLES[i.role] + '</td><td class="n"><button class="btn s d" type="button" data-eqdel="' + esc(i.email) + '">Retirer</button></td></tr>').join('') + '</tbody></table></div>' : '') + '</div>';
    h += '<div class="card" style="margin-top:12px"><h2 style="margin-top:0">Synchronisation des appareils</h2>' +
      '<p class="iv-help">Tous les comptes travaillent sur <b>la même base</b>. Si un appareil (Oussama, Hamza, Azedine…) affiche des données différentes des vôtres, demandez une <b>resynchronisation complète</b> : chaque appareil reprend exactement les données de la base à sa prochaine ouverture (ses changements pas encore envoyés sont gardés).</p>' +
      '<div class="at-actions"><button type="button" class="btn p" id="eq-resync">🔄 Resynchroniser tous les appareils</button><button type="button" class="btn" id="eq-verif">Comparer cet appareil avec la base</button></div><div id="eq-verif-res"></div></div>';
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
    if (e.target.id === 'eq-resync') {
      if (!confirm('Demander à tous les appareils de reprendre exactement les données de la base ?')) return;
      const le = new Date().toISOString();
      const x = await sb.from('parametres').upsert([{ cle: 'resync', valeur: { le, par: (window.APP_USER && window.APP_USER.nom) || 'Administrateur' } }], { onConflict: 'cle' });
      if (x.error) { say('Erreur : ' + x.error.message); return; }
      await LocalDB.resync(); try { localStorage.setItem('mariabag_resync_fait', le); } catch (z) {}
      say('Demande envoyée : chaque appareil se resynchronise à sa prochaine ouverture (ou dans la minute s’il est ouvert).'); return;
    }
    if (e.target.id === 'eq-verif') {
      const box = root.querySelector('#eq-verif-res'); box.innerHTML = '<p class="iv-help">Comparaison…</p>';
      const loc = await LocalDB.compter(), lignes = [];
      for (const t of LocalDB.tables) { const q = await r.from(t).select('id', { count: 'exact', head: true }); if (q.error) continue; if ((q.count || 0) !== loc[t]) lignes.push([t, loc[t], q.count || 0]); }
      box.innerHTML = lignes.length ? '<div class="tw"><table class="iv-tbl"><thead><tr><th>Données</th><th>Cet appareil</th><th>Base</th></tr></thead><tbody>' + lignes.map(l => '<tr><td>' + esc(TABLES[l[0]] || l[0]) + '</td><td>' + l[1] + '</td><td>' + l[2] + '</td></tr>').join('') + '</tbody></table></div><p class="iv-help">Différences trouvées : cliquez sur « Resynchroniser tous les appareils ».</p>'
        : '<p class="iv-help" style="color:#17632a">✔ Cet appareil est identique à la base (' + LocalDB.tables.length + ' tables).</p>';
      return;
    }
    const pr = e.target.closest('[data-preset]');
    if (pr) { const PRE = [['production', 'produits', 'gabarits'], ['sorties'], ['magasins'], ['depot', 'gabarits'], ['commerce', 'stock', 'list'], (window.SECTIONS_APP || []).map(x => x[0])][+pr.dataset.preset] || [];
      root.querySelectorAll('#eq-nsec input').forEach(i => { i.checked = PRE.includes(i.value); }); return; }
    const md = e.target.closest('[data-eqmdp]');
    if (md) {
      const p = PROF.find(x => x.id === md.dataset.eqmdp), mdp = prompt('Nouveau mot de passe pour ' + (p ? p.nom || p.email : 'ce compte') + ' (6 caractères minimum) :');
      if (!mdp) return; if (mdp.length < 6) { say('Mot de passe trop court.'); return; }
      const x = await fonctionComptes({ action: 'mot_de_passe', id: md.dataset.eqmdp, mot_de_passe: mdp });
      say(x.error ? 'Erreur : ' + x.error : 'Mot de passe changé.'); return;
    }
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
  /* appel de la fonction serveur « comptes » (création de compte, mot de passe) avec la session de l'administrateur */
  async function fonctionComptes(corps) {
    const r = remote(); if (!r) return { error: 'Hors ligne.' };
    const { data } = await r.auth.getSession(); const jwt = data && data.session && data.session.access_token;
    if (!jwt) return { error: 'Connectez-vous avec votre compte administrateur (pas le mot de passe provisoire).' };
    try {
      const res = await fetch(SUPABASE_URL + '/functions/v1/comptes', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + jwt, apikey: SUPABASE_ANON_KEY }, body: JSON.stringify(corps) });
      const j = await res.json().catch(() => ({})); return res.ok ? j : { error: j.error || ('Erreur ' + res.status) };
    } catch (x) { return { error: 'Connexion impossible : ' + (x.message || x) }; }
  }
  document.addEventListener('submit', async e => {
    if (e.target.id !== 'eq-new') return; e.preventDefault();
    const $f = q => e.target.querySelector(q), msg = $f('#eq-nmsg'), btn = $f('button[type=submit]');
    const role = $f('#eq-nrole').value, sections = [...e.target.querySelectorAll('#eq-nsec input:checked')].map(i => i.value);
    if (role !== 'admin' && !sections.length) { msg.textContent = 'Cochez au moins une section.'; return; }
    btn.disabled = true; msg.textContent = 'Création…';
    const x = await fonctionComptes({ action: 'creer', nom: $f('#eq-nnom').value.trim(), identifiant: $f('#eq-nid').value.trim(), mot_de_passe: $f('#eq-nmdp').value, role, sections, theme: $f('#eq-ntheme').value });
    btn.disabled = false;
    if (x.error) { msg.textContent = '⚠ ' + x.error; return; }
    say('Compte créé : identifiant « ' + $f('#eq-nid').value.trim() + ' ».'); await load();
  });
  document.addEventListener('change', async e => {
    const th = e.target.closest && e.target.closest('[data-eqtheme]');
    if (th) { const r = remote(); if (!r) return; const x = await r.from('profils').update({ theme: th.value }).eq('id', th.dataset.eqtheme);
      say(x.error ? 'Erreur : ' + x.error.message : 'Thème enregistré (visible à la prochaine ouverture de la plateforme par cette personne).'); const p = PROF.find(y => y.id === th.dataset.eqtheme); if (p) p.theme = th.value;
      if (window.APP_USER && window.APP_USER.id === th.dataset.eqtheme) { window.APP_USER.theme = th.value; document.dispatchEvent(new CustomEvent('mariabag:profil', { detail: window.APP_USER })); } return; }
    const box = e.target.closest && e.target.closest('[data-eqsec]'); if (!box) return;
    const r = remote(); if (!r) return;
    const sections = [...box.querySelectorAll('input:checked')].map(i => i.value);
    if (!sections.length) { say('Gardez au moins une section.'); e.target.checked = true; return; }
    const x = await r.from('profils').update({ sections }).eq('id', box.dataset.eqsec);
    say(x.error ? 'Erreur : ' + x.error.message : 'Sections mises à jour (effet à la prochaine ouverture de la plateforme par cette personne).');
    const p = PROF.find(y => y.id === box.dataset.eqsec); if (p) p.sections = sections;
  });
  document.addEventListener('mariabag:profil', ev => { const b = $('#navEquipe'); if (b) b.hidden = !(ev.detail && ev.detail.role === 'admin'); });
  window.loadEquipe = load;
})();
