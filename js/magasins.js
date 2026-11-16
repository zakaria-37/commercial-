/* ============================================================
   MAGASINS ⇄ DÉPÔT — commandes des magasins au dépôt (version smartphone d'abord)
   Les produits des magasins ne sont PAS les produits de l'atelier : la commande est un
   tableau libre  Modèle | Désignation | Couleurs | Cartons × Pièces par carton.
     • « 1 × 50 »  = 1 carton de 50 pièces ;  pièces par carton inconnues → seulement le nombre de cartons ;
     • couleurs : « 2467, 10 de chaque couleur (noir, beige, marron) ».
   1. Le vendeur (Idris — Boumati, Fatah — Bab El Zouar) remplit le tableau et l'envoie au dépôt.
   2. Le magasinier du dépôt (« Hamza dépôt », pas le Hamza des gabarits) coche chaque ligne préparée (et corrige la quantité envoyée).
   3. Il valide avec un message : le magasin est prévenu, le bon daté (PDF) reste dans l'historique.
   ============================================================ */
(function () {
  'use strict';
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const nf = (n, d) => (Number(n) || 0).toLocaleString('fr-FR', { maximumFractionDigits: d == null ? 0 : d });
  const fd = s => s ? String(s).slice(0, 10).split('-').reverse().join('/') : '';
  const fdt = s => { if (!s) return ''; const d = new Date(s); return d.toLocaleDateString('fr-FR') + ' à ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }); };
  const iso = d => { const x = d || new Date(); return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0'); };
  const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  const pdfT = s => String(s ?? '').replace(/œ/g, 'oe').replace(/Œ/g, 'OE').replace(/[  ]/g, ' ').replace(/×/g, 'x');
  const qui = () => (window.APP_USER && (window.APP_USER.nom || window.APP_USER.email)) || 'Utilisateur';
  const DEPOT_NOM = 'Hamza Dépôt';   // tous les bons de transfert sont au nom du magasinier du dépôt, quel que soit le compte qui valide
  const say = t => { if (typeof toast === 'function') toast(t); };
  const perm = v => typeof window.sectionPermise === 'function' ? window.sectionPermise(v) : true;
  const vibre = () => { if (navigator.vibrate) try { navigator.vibrate(12); } catch (x) {} };
  const int = v => { const n = Math.round(Number(String(v ?? '').replace(',', '.'))); return n > 0 ? n : 0; };
  const KEY_MAG = 'mariabag_magasin_choisi', KEY_PAN = 'mariabag_panier_magasin2';

  let MAGS = [], CMDS = [], charge = false, erreur = '', connus = null;
  let magId = '', ongletM = 'nouvelle', ongletD = 'a_preparer', filtreD = '', noteCmd = '';
  const ligneVide = () => ({ ref: '', designation: '', couleurs: '', cartons: '', pcs: '', par_couleur: '' });
  let panier = [];
  try { panier = JSON.parse(localStorage.getItem(KEY_PAN) || '[]') || []; } catch (e) { panier = []; }
  if (!panier.length) panier = [ligneVide()];
  const garderPanier = () => { try { localStorage.setItem(KEY_PAN, JSON.stringify(panier)); } catch (e) {} };

  /* ---------- Quantités d'une ligne ---------- */
  const listeCouleurs = l => String(l.couleurs || '').split(/[,;/+]|\s-\s|\bet\b/i).map(s => s.trim()).filter(Boolean);
  function totalPieces(l) {
    const nc = listeCouleurs(l).length, pc = int(l.par_couleur), c = int(l.cartons), p = int(l.pcs);
    if (pc && nc) return pc * nc;
    if (c && p) return c * p;
    if (p && !c) return p;                                 // pas de cartons : ce sont des pièces
    if (pc && !nc && !c) return pc;
    return null;                                           // inconnu (ex. seulement des cartons)
  }
  function qteTxt(l) {
    const c = int(l.cartons), p = int(l.pcs), pc = int(l.par_couleur), nc = listeCouleurs(l).length, t = [];
    if (c) t.push(p ? c + ' × ' + p + ' = ' + nf(c * p) + ' pcs' : c + ' carton' + (c > 1 ? 's' : ''));
    else if (p && !pc) t.push(nf(p) + ' pièce' + (p > 1 ? 's' : ''));
    if (pc) t.push(pc + ' de chaque couleur' + (nc ? ' (' + nc + ' couleur' + (nc > 1 ? 's' : '') + ' = ' + nf(pc * nc) + ' pcs)' : ''));
    return t.join(' · ') || '—';
  }
  const titre = l => [l.ref, l.designation].filter(Boolean).join(' — ') || 'Article';
  // quantité envoyée : en cartons si la ligne est en cartons, sinon en pièces
  const uniteEnv = (l, n) => int(l.cartons) ? (n === 1 ? 'carton' : 'cartons') : 'pcs';
  const envDefaut = l => int(l.cartons) || totalPieces(l) || 0;
  const envoye = l => l.envoye != null && l.envoye !== '' ? int(l.envoye) : envDefaut(l);
  const ligneOk = l => (String(l.ref || '').trim() || String(l.designation || '').trim()) && (int(l.cartons) || int(l.par_couleur) || int(l.pcs));

  /* ---------- Chargement ---------- */
  async function load() {
    const [m, c] = await Promise.all([
      sb.from('magasins').select('*').order('nom', { ascending: true }),
      sb.from('commandes_magasin').select('*').order('created_at', { ascending: false })]);
    erreur = m.error || c.error ? 'Les tables « magasins » ne sont pas encore installées dans Supabase (supabase/magasins.sql).' : '';
    MAGS = m.error ? [] : (m.data || []);
    const avant = connus; CMDS = c.error ? [] : (c.data || []); charge = true;
    const etat = new Map(CMDS.map(x => [x.id, x.statut]));
    if (avant) CMDS.forEach(x => {
      const a = avant.get(x.id);
      if (!a && x.statut === 'envoyee' && perm('depot')) say('🛒 Nouvelle commande ' + x.numero + ' — ' + x.magasin_nom);
      const imp = magasinImpose();
      if (a === 'envoyee' && x.statut === 'livree' && perm('magasins') && (!imp || imp === x.magasin_id)) say('🚚 Commande ' + x.numero + ' envoyée par le dépôt' + (x.message ? ' : « ' + x.message + ' »' : ''));
    });
    connus = etat;
    const imp = magasinImpose();
    if (imp) magId = imp; else if (!magId || !MAGS.some(x => x.id === magId)) magId = choisirMagasinParDefaut();
    badge();
    const a = document.activeElement;
    if (!(a && a.closest && a.closest('#mg-root .mg-tab-cmd'))) renderMagasin();   // on ne casse pas une saisie en cours
    renderDepot();
    document.dispatchEvent(new Event('mariabag:magasins'));
  }
  function choisirMagasinParDefaut() {
    let s = ''; try { s = localStorage.getItem(KEY_MAG) || ''; } catch (e) {}
    if (s && MAGS.some(m => m.id === s)) return s;
    const moi = norm(qui());
    const m = MAGS.find(x => x.responsable && moi && moi.includes(norm(x.responsable)));
    return m ? m.id : (MAGS[0] ? MAGS[0].id : '');
  }
  const magasin = () => MAGS.find(m => m.id === magId) || null;
  /* Compte vendeur relié à SON magasin (Équipe › Magasin) : il ne voit que ce magasin et ses commandes.
     '' = libre (administrateur, dépôt) · id = magasin imposé · null = vendeur pas encore relié */
  function magasinImpose() {
    const u = window.APP_USER; if (!u || u.role === 'admin') return '';
    if (u.magasin_id) return u.magasin_id;
    return window.ACCES_LIMITE && typeof window.sectionPermise === 'function' && window.sectionPermise('magasins') && !window.sectionPermise('depot') ? null : '';
  }
  function badge() {
    const n = CMDS.filter(c => c.statut === 'envoyee').length;
    const b = document.querySelector('nav button[data-v="depot"]');
    if (b) { b.dataset.badge = n || ''; b.classList.toggle('bs-has', n > 0); }
  }
  // modèles déjà commandés : proposés pendant la saisie (et désignation remplie toute seule)
  function connusRefs() {
    const map = new Map();
    CMDS.forEach(c => (c.lignes || []).forEach(l => { const r = String(l.ref || '').trim(); if (r && !map.has(norm(r))) map.set(norm(r), { ref: r, designation: l.designation || '', pcs: l.pcs || '' }); }));
    return map;
  }

  /* =================== MAGASIN (vendeur) =================== */
  function renderMagasin() {
    const el = document.getElementById('mg-root'); if (!el) return;
    if (!charge) { el.innerHTML = '<div class="card">Chargement…</div>'; return; }
    if (erreur) { el.innerHTML = '<div class="card">' + esc(erreur) + '</div>'; return; }
    const imp = magasinImpose();
    if (imp === null) { el.innerHTML = '<div class="card bs-vide">🏬 Votre compte n’est relié à aucun magasin.<br>Demandez à l’administrateur de choisir votre magasin dans <b>Équipe › Magasin</b>.</div>'; return; }
    const m = magasin(), mes = CMDS.filter(c => c.magasin_id === magId);
    const enCours = mes.filter(c => c.statut === 'envoyee'), hist = mes.filter(c => c.statut !== 'envoyee');
    const nbL = panier.filter(ligneOk).length;
    el.innerHTML =
      '<div class="hello mg-hello"><span class="fl"></span><div><h2>🏬 ' + esc(m ? 'Magasin ' + m.nom : 'Magasin') + '</h2><p>' + esc(m && m.responsable ? m.responsable + ' · ' : '') + 'Commandez au dépôt : le magasinier prépare la commande et vous l’envoie avec un bon daté.</p></div></div>' +
      (window.PushMB ? PushMB.zone('magasins') : '') +
      (MAGS.length > 1 && !imp ? '<div class="mg-chips">' + MAGS.map(x => '<button type="button" data-mag="' + esc(x.id) + '" class="' + (x.id === magId ? 'on' : '') + '">' + esc(x.nom) + (x.responsable ? '<small>' + esc(x.responsable) + '</small>' : '') + '</button>').join('') + '</div>' : '') +
      '<div class="at-tabs mg-tabs"><button type="button" data-om="nouvelle" class="' + (ongletM === 'nouvelle' ? 'on' : '') + '">🛒 Commander' + (nbL ? ' (' + nbL + ')' : '') + '</button>' +
        '<button type="button" data-om="encours" class="' + (ongletM === 'encours' ? 'on' : '') + '">En cours (' + enCours.length + ')</button>' +
        '<button type="button" data-om="hist" class="' + (ongletM === 'hist' ? 'on' : '') + '">Historique</button></div>' +
      (ongletM === 'nouvelle' ? vueCommander() : ongletM === 'encours'
        ? (enCours.length ? enCours.map(c => carteCmd(c, false)).join('') : '<div class="card bs-vide">Aucune commande en attente au dépôt.</div>')
        : (hist.length ? groupeParDate(hist.slice(0, 80), c => carteCmd(c, false)) : '<div class="card bs-vide">Aucune commande reçue pour le moment.</div>'));
  }
  function vueCommander() {
    const refs = [...connusRefs().values()];
    return '<div class="card mg-tab-cmd"><h3>Nouvelle commande</h3>' +
      '<p class="mg-aide">Une ligne par modèle. <b>Cartons × pièces</b> : ex. 1 × 50. Pièces par carton inconnues ? Remplissez seulement les cartons. <b>Sans carton</b> : laissez Cartons vide et mettez le nombre de pièces (ex. 10). Par couleur : ex. 2467, couleurs « noir, beige, marron », 10 de chaque.</p>' +
      '<datalist id="mg-refs">' + refs.map(r => '<option value="' + esc(r.ref) + '">' + esc(r.designation) + '</option>').join('') + '</datalist>' +
      '<div class="mg-tbl"><div class="mg-th"><span>Modèle</span><span>Désignation</span><span>Couleurs</span><span>Cartons</span><span>Pièces <small>(÷ carton)</small></span><span>De chaque couleur</span><span>Total</span><span></span></div>' +
      panier.map((l, i) => ligneSaisie(l, i)).join('') + '</div>' +
      '<button type="button" class="btn mg-add" data-addl="1">＋ Ajouter une ligne</button>' +
      '<textarea id="mg-note" rows="2" maxlength="300" placeholder="Note pour le dépôt (facultatif)">' + esc(noteCmd) + '</textarea>' +
      '<button type="button" class="btn p mg-envoyer" data-envoyer="1">📤 Envoyer la commande au dépôt</button></div>';
  }
  function ligneSaisie(l, i) {
    const t = totalPieces(l);
    return '<div class="mg-tr" data-i="' + i + '">' +
      '<label class="c-ref"><span>Modèle</span><input data-f="ref" list="mg-refs" autocomplete="off" placeholder="ex : 2467" value="' + esc(l.ref) + '"></label>' +
      '<label class="c-des"><span>Désignation</span><input data-f="designation" autocomplete="off" placeholder="ex : sac à main femme" value="' + esc(l.designation) + '"></label>' +
      '<label class="c-coul"><span>Couleurs</span><input data-f="couleurs" autocomplete="off" placeholder="noir, beige… (facultatif)" value="' + esc(l.couleurs) + '"></label>' +
      '<label class="c-ct"><span>Cartons</span><input data-f="cartons" type="number" inputmode="numeric" min="0" step="1" placeholder="0" value="' + esc(l.cartons) + '"></label>' +
      '<label class="c-pcs"><span>' + pcsLabel(l) + '</span><input data-f="pcs" type="number" inputmode="numeric" min="0" step="1" placeholder="' + (int(l.cartons) ? '?' : '0') + '" value="' + esc(l.pcs) + '"></label>' +
      '<label class="c-pc"><span>De chaque couleur</span><input data-f="par_couleur" type="number" inputmode="numeric" min="0" step="1" placeholder="—" value="' + esc(l.par_couleur) + '"></label>' +
      '<div class="c-tot" data-tot="' + i + '">' + totCell(l, t) + '</div>' +
      '<button type="button" class="mg-x" data-retirer="' + i + '" aria-label="Retirer la ligne">✕</button></div>';
  }
  const pcsLabel = l => int(l.cartons) ? '× Pièces / carton' : 'Pièces';
  const totCell = (l, t) => t != null ? '<b>' + nf(t) + '</b> pcs' : int(l.cartons) ? '<b>' + int(l.cartons) + '</b> ctn' : '<i>—</i>';

  async function envoyerCommande() {
    const m = magasin(); if (!m) { say('Choisissez le magasin.'); return; }
    const L = panier.filter(ligneOk);
    const incompletes = panier.filter(l => !ligneOk(l) && (l.ref || l.designation || l.cartons || l.par_couleur));
    if (incompletes.length) { say('Complétez chaque ligne : modèle (ou désignation) et une quantité.'); return; }
    if (!L.length) { say('Ajoutez au moins une ligne (modèle + quantité).'); return; }
    const btn = document.querySelector('[data-envoyer]'); if (btn) { btn.disabled = true; btn.textContent = 'Envoi…'; }
    const d = iso(), base = 'CM-' + d.slice(2).replace(/-/g, '');
    const n = CMDS.filter(c => String(c.numero || '').startsWith(base)).length + 1;
    const lignes = L.map(l => ({ ref: String(l.ref || '').trim(), designation: String(l.designation || '').trim(), couleurs: String(l.couleurs || '').trim(),
      cartons: int(l.cartons), pcs: int(l.pcs), par_couleur: int(l.par_couleur), total: totalPieces(l), envoye: null, coche: false }));
    const r = await sb.from('commandes_magasin').insert([{ numero: base + '-' + String(n).padStart(2, '0'), magasin_id: m.id, magasin_nom: m.nom, date_cmd: d, lignes, statut: 'envoyee', cree_par: qui(), note: noteCmd.trim() }]).select();
    if (r.error) { if (btn) { btn.disabled = false; btn.textContent = '📤 Envoyer la commande au dépôt'; } say('Erreur : ' + r.error.message); return; }
    panier = [ligneVide()]; noteCmd = ''; garderPanier(); ongletM = 'encours'; vibre();
    say('✔ Commande ' + (r.data && r.data[0] ? r.data[0].numero : '') + ' envoyée au dépôt.');
    if (document.activeElement) document.activeElement.blur();
    await load(); renderMagasin();
  }

  /* =================== DÉPÔT (magasinier : Hamza) =================== */
  const coches = c => (c.lignes || []).filter(l => l.coche).length;
  function renderDepot() {
    const el = document.getElementById('dp-root'); if (!el) return;
    if (!charge) { el.innerHTML = '<div class="card">Chargement…</div>'; return; }
    if (erreur) { el.innerHTML = '<div class="card">' + esc(erreur) + '</div>'; return; }
    const filt = c => !filtreD || c.magasin_id === filtreD;
    const af = CMDS.filter(c => c.statut === 'envoyee' && filt(c)).sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
    const hi = CMDS.filter(c => c.statut !== 'envoyee' && filt(c));
    el.innerHTML = '<div class="hello mg-hello"><span class="fl"></span><div><h2>🏭 Dépôt — commandes des magasins</h2><p>Préparez chaque ligne, cochez-la, puis validez : le magasin est prévenu et le bon daté reste dans l’historique.</p></div></div>' +
      (window.PushMB ? PushMB.zone('depot') : '') +
      '<div class="mg-chips"><button type="button" data-fd="" class="' + (!filtreD ? 'on' : '') + '">Tous</button>' + MAGS.map(x => {
        const n = CMDS.filter(c => c.statut === 'envoyee' && c.magasin_id === x.id).length;
        return '<button type="button" data-fd="' + esc(x.id) + '" class="' + (filtreD === x.id ? 'on' : '') + '">' + esc(x.nom) + (n ? ' <i>' + n + '</i>' : '') + '</button>'; }).join('') + '</div>' +
      '<div class="at-tabs bs-tabs"><button type="button" data-od="a_preparer" class="' + (ongletD === 'a_preparer' ? 'on' : '') + '">À préparer (' + af.length + ')</button><button type="button" data-od="hist" class="' + (ongletD === 'hist' ? 'on' : '') + '">Envoyées (' + hi.filter(c => c.statut === 'livree').length + ')</button></div>' +
      (ongletD === 'a_preparer'
        ? (af.length ? af.map(c => carteCmd(c, true)).join('') : '<div class="card bs-vide">✔ Aucune commande à préparer.</div>')
        : (hi.length ? groupeParDate(hi.slice(0, 120), c => carteCmd(c, true)) : '<div class="card bs-vide">Aucune commande envoyée.</div>'));
  }
  function groupeParDate(list, f) {
    const g = new Map(); list.forEach(c => { const k = String(c.valide_le || c.date_cmd || c.created_at || '').slice(0, 10); if (!g.has(k)) g.set(k, []); g.get(k).push(c); });
    return [...g.entries()].map(([k, v]) => '<div class="mg-jour">' + (k ? fd(k) : '—') + '</div>' + v.map(f).join('')).join('');
  }
  function resume(L) {
    const ct = L.reduce((s, l) => s + int(l.cartons), 0), pc = L.reduce((s, l) => s + (totalPieces(l) || 0), 0);
    return [L.length + ' ligne' + (L.length > 1 ? 's' : ''), ct ? ct + ' carton' + (ct > 1 ? 's' : '') : '', pc ? nf(pc) + ' pcs' : ''].filter(Boolean).join(' · ');
  }
  function carteCmd(c, depot) {
    const L = c.lignes || [], n = coches(c), enCours = c.statut === 'envoyee', tout = L.length && n === L.length;
    const etiquette = enCours ? (depot ? '<em class="bs-prog">' + n + ' / ' + L.length + '</em>' : '<em class="bs-prog">⏳ Au dépôt</em>')
      : c.statut === 'livree' ? '<em class="bs-ok">🚚 Envoyée</em>' : '<em class="bs-ok mg-ann">Annulée</em>';
    const diff = l => !enCours && envoye(l) !== envDefaut(l);
    return '<div class="bs-card mg-card' + (enCours ? '' : ' bs-done') + '" data-cmd="' + esc(c.id) + '">' +
      '<div class="bs-head"><div><b>' + esc(c.numero || 'Commande') + '</b><span>🏬 ' + esc(c.magasin_nom) + '</span></div>' + etiquette + '</div>' +
      '<div class="bs-meta">' + ['📅 ' + fd(c.date_cmd), c.cree_par && 'par ' + esc(c.cree_par), resume(L)].filter(Boolean).join(' · ') + '</div>' +
      (c.note ? '<div class="mg-note">📝 ' + esc(c.note) + '</div>' : '') +
      (depot && enCours ? '<div class="bs-bar"><i style="width:' + (L.length ? Math.round(n / L.length * 100) : 0) + '%"></i></div>' : '') +
      '<div class="bs-lignes">' + L.map((l, i) => {
        const det = '<small class="mg-q">' + esc(qteTxt(l)) + '</small>' + (l.couleurs ? '<small class="mg-c">🎨 ' + esc(l.couleurs) + '</small>' : '');
        if (depot && enCours) {
          return '<div class="mg-dl' + (l.coche ? ' on' : '') + '"><button type="button" class="bs-l' + (l.coche ? ' on' : '') + '" data-l="' + i + '"><i class="bs-cb">' + (l.coche ? '✓' : '') + '</i>' +
            '<span class="bs-n mg-nm"><b class="mg-t">' + esc(titre(l)) + '</b>' + det + '</span></button>' +
            '<label class="mg-env">Envoyé<input type="number" inputmode="numeric" min="0" step="1" data-env="' + i + '" value="' + envoye(l) + '"><em>' + uniteEnv(l) + '</em></label></div>';
        }
        return '<div class="bs-l mg-ro' + (enCours ? '' : ' on') + '"><i class="bs-cb">' + (enCours ? '' : '✓') + '</i><span class="bs-n mg-nm"><b class="mg-t">' + esc(titre(l)) + '</b>' + det + '</span>' +
          (enCours ? '' : '<b class="bs-q' + (diff(l) ? ' mg-diff' : '') + '">' + nf(envoye(l)) + ' ' + uniteEnv(l, envoye(l)) + '</b>') + '</div>';
      }).join('') + '</div>' +
      (enCours
        ? '<div class="bs-act">' + (depot ? (tout ? '<button type="button" class="btn p bs-valider" data-valcmd="' + esc(c.id) + '">✔ Valider et envoyer au magasin</button>'
            : '<button type="button" class="btn bs-valider" disabled>Cochez chaque ligne préparée (' + n + ' / ' + L.length + ')</button>') : '') +
          '<button type="button" class="btn s d" data-anncmd="' + esc(c.id) + '" data-depot="' + (depot ? 1 : '') + '">' + (depot ? 'Refuser la commande' : 'Annuler cette commande') + '</button></div>'
        : c.statut === 'livree' ? '<div class="bs-valide">Envoyée par <b>' + esc(DEPOT_NOM) + '</b> le ' + fdt(c.valide_le) + (c.message ? '<p>« ' + esc(c.message) + ' »</p>' : '') +
          '<button type="button" class="btn s mg-pdf" data-pdf="' + esc(c.id) + '">📄 Bon de transfert (PDF)</button></div>' : '<div class="bs-valide mg-ann">' + esc(c.message || 'Annulée') + '</div>') +
      '</div>';
  }
  async function majLignes(c) {
    const r = await sb.from('commandes_magasin').update({ lignes: c.lignes }).eq('id', c.id);
    if (r.error) say('Erreur : ' + r.error.message);
  }
  function validerCmd(id) {
    const c = CMDS.find(x => x.id === id); if (!c || c.statut !== 'envoyee') return;
    if (coches(c) !== (c.lignes || []).length) { say('Cochez d’abord toutes les lignes.'); return; }
    const bg = document.createElement('div'); bg.className = 'cm-nv-bg';
    bg.innerHTML = '<form class="cm-nv"><h3 style="margin:0 0 6px">Envoyer ' + esc(c.numero) + ' au magasin ' + esc(c.magasin_nom) + '</h3>' +
      '<p class="cm-nv-p">' + (c.lignes || []).map(l => '• ' + esc(titre(l)) + ' : <b>' + nf(envoye(l)) + ' ' + uniteEnv(l, envoye(l)) + '</b>' + (envoye(l) !== envDefaut(l) ? ' <span class="mg-diff">(demandé ' + envDefaut(l) + ')</span>' : '')).join('<br>') + '</p>' +
      '<label style="display:block;font-size:13px;color:var(--mut)">Message pour le magasin<textarea id="mg-msg" rows="3" maxlength="300" style="width:100%;margin-top:4px;font:inherit;font-size:16px;padding:10px;border:1px solid var(--line,#ddd);border-radius:10px;box-sizing:border-box" placeholder="Ex : envoyé avec le chauffeur, 1 carton manquant…"></textarea></label>' +
      '<div class="at-actions"><button class="btn p" type="submit">Valider et envoyer</button><button class="btn" type="button" id="mg-x">Retour</button></div></form>';
    document.body.appendChild(bg);
    bg.querySelector('#mg-x').onclick = () => bg.remove();
    bg.onclick = e => { if (e.target === bg) bg.remove(); };
    bg.querySelector('form').onsubmit = async e => {
      e.preventDefault();
      const btn = bg.querySelector('button[type=submit]'); btn.disabled = true; btn.textContent = 'Envoi…';
      const message = bg.querySelector('#mg-msg').value.trim();
      const lignes = (c.lignes || []).map(l => Object.assign({}, l, { envoye: envoye(l) }));
      const u = await sb.from('commandes_magasin').update({ statut: 'livree', prepare_par: DEPOT_NOM, valide_le: new Date().toISOString(), message, lignes }).eq('id', c.id);
      if (u.error) { btn.disabled = false; btn.textContent = 'Valider et envoyer'; say('Erreur : ' + u.error.message); return; }
      bg.remove(); vibre(); say('🚚 Commande ' + c.numero + ' envoyée au magasin ' + c.magasin_nom + '.');
      await load();
    };
  }

  /* ---------- Bon de transfert (PDF daté, gardé dans l'historique) ---------- */
  async function bonPdf(id) {
    const c = CMDS.find(x => x.id === id); if (!c) return;
    if (!(window.jspdf && window.jspdf.jsPDF)) { say('Bibliothèque PDF non chargée.'); return; }
    let ENT = {}; try { const p = await sb.from('parametres').select('*').eq('cle', 'entreprise'); ENT = (p.data && p.data[0] && p.data[0].valeur) || {}; } catch (e) {}
    const m = MAGS.find(x => x.id === c.magasin_id) || { nom: c.magasin_nom };
    const doc = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4' }), M = 14, W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight();
    const T = (t, x, y, o) => doc.text(pdfT(t), x, y, o);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(15); T(ENT.nom || 'MARIA BAG', M, 16);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(90);
    [[ENT.adresse, ENT.ville].filter(Boolean).join(', '), [ENT.tel && 'Tel : ' + ENT.tel, ENT.email].filter(Boolean).join('  -  ')].filter(Boolean).forEach((l, i) => T(l, M, 21 + i * 4));
    doc.setTextColor(0); doc.setFont('helvetica', 'bold'); doc.setFontSize(16); T('BON DE TRANSFERT', W - M, 16, { align: 'right' });
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10); T('N° ' + c.numero, W - M, 23, { align: 'right' });
    T('Commande du ' + fd(c.date_cmd) + '  -  Envoi le ' + fdt(c.valide_le), W - M, 29, { align: 'right' });
    doc.setDrawColor(180); doc.line(M, 33, W - M, 33);
    doc.setFontSize(8.5); doc.setTextColor(90); T('DE', M, 40); T('VERS', W / 2, 40);
    doc.setTextColor(0); doc.setFont('helvetica', 'bold'); doc.setFontSize(12); T('Depot', M, 46); T('Magasin ' + m.nom, W / 2, 46);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); T('Prepare par : ' + DEPOT_NOM, M, 51); T([m.responsable && 'Responsable : ' + m.responsable, 'Commande par : ' + (c.cree_par || '')].filter(Boolean).join('  -  '), W / 2, 51);
    const L = c.lignes || [];
    const cartons = l => int(l.cartons) ? (int(l.pcs) ? int(l.cartons) + ' x ' + int(l.pcs) : String(int(l.cartons))) : '';
    doc.autoTable({ startY: 57, margin: { left: M, right: M, bottom: 20 }, theme: 'grid', styles: { fontSize: 8.5, cellPadding: 1.8 }, headStyles: { fillColor: [74, 44, 42], textColor: 255 },
      head: [['#', 'Modele', 'Designation', 'Couleurs', 'Cartons x pcs', 'De chaque couleur', 'Total pcs', 'Envoye']],
      body: L.map((l, i) => [String(i + 1), l.ref || '', l.designation || '', l.couleurs || '', cartons(l), int(l.par_couleur) ? String(int(l.par_couleur)) : '',
        totalPieces(l) != null ? nf(totalPieces(l)) : '', nf(envoye(l)) + ' ' + uniteEnv(l, envoye(l))].map(pdfT)),
      columnStyles: { 0: { cellWidth: 8 }, 4: { halign: 'center' }, 5: { halign: 'center' }, 6: { halign: 'right' }, 7: { halign: 'right' } } });
    let y = doc.lastAutoTable.finalY + 6;
    doc.setFontSize(10); doc.setFont('helvetica', 'bold'); T('Total : ' + resume(L), M, y); y += 7; doc.setFont('helvetica', 'normal');
    if (c.note) { doc.setTextColor(90); doc.splitTextToSize(pdfT('Note du magasin : ' + c.note), W - 2 * M).forEach(l => { doc.text(l, M, y); y += 5; }); }
    if (c.message) { doc.setTextColor(0); doc.splitTextToSize(pdfT('Message du depot : ' + c.message), W - 2 * M).forEach(l => { doc.text(l, M, y); y += 5; }); }
    y = Math.max(y + 10, H - 40); if (y > H - 30) { doc.addPage(); y = 30; }
    doc.setTextColor(60); doc.setFontSize(9); doc.setDrawColor(150);
    T('Magasinier (depot)', M, y); T('Recu par le magasin', W - M - 62, y); doc.line(M, y + 16, M + 60, y + 16); doc.line(W - M - 62, y + 16, W - M, y + 16);
    doc.save(('Bon_transfert_' + c.numero + '_' + m.nom).replace(/[^\w-]+/g, '_') + '.pdf'); say('PDF généré.');
  }

  /* ---------- Événements ---------- */
  const dansRoot = t => { const a = document.getElementById('mg-root'), b = document.getElementById('dp-root'); return (a && a.contains(t)) || (b && b.contains(t)); };
  document.addEventListener('click', async e => {
    if (!dansRoot(e.target)) return;
    const t = e.target; let b;
    if ((b = t.closest('[data-mag]'))) { if (magasinImpose()) return; magId = b.dataset.mag; try { localStorage.setItem(KEY_MAG, magId); } catch (x) {} renderMagasin(); return; }
    if ((b = t.closest('[data-om]'))) { ongletM = b.dataset.om; renderMagasin(); return; }
    if ((b = t.closest('[data-od]'))) { ongletD = b.dataset.od; renderDepot(); return; }
    if ((b = t.closest('[data-fd]'))) { filtreD = b.dataset.fd; renderDepot(); return; }
    if (t.closest('[data-addl]')) {
      panier.push(ligneVide()); garderPanier(); renderMagasin();
      const rows = document.querySelectorAll('#mg-root .mg-tr'), last = rows[rows.length - 1];
      if (last) { last.scrollIntoView({ block: 'center', behavior: 'smooth' }); setTimeout(() => last.querySelector('input').focus(), 250); }
      return;
    }
    if ((b = t.closest('[data-retirer]'))) { panier.splice(+b.dataset.retirer, 1); if (!panier.length) panier.push(ligneVide()); garderPanier(); renderMagasin(); return; }
    if (t.closest('[data-envoyer]')) { envoyerCommande(); return; }
    if ((b = t.closest('[data-pdf]'))) { bonPdf(b.dataset.pdf); return; }
    if ((b = t.closest('[data-valcmd]'))) { validerCmd(b.dataset.valcmd); return; }
    if ((b = t.closest('[data-anncmd]'))) {
      const c = CMDS.find(x => x.id === b.dataset.anncmd);
      if (!c) return;
      if (b.dataset.depot) {
        const raison = prompt('Refuser la commande ' + c.numero + ' (' + c.magasin_nom + ').\nRaison (envoyée au magasin) :', ''); if (raison === null) return;
        await sb.from('commandes_magasin').update({ statut: 'annulee', message: 'Refusée par le dépôt (' + qui() + ')' + (raison.trim() ? ' : ' + raison.trim() : '') }).eq('id', c.id); await load();
      } else if (confirm('Annuler la commande ' + c.numero + ' (' + c.magasin_nom + ') ?')) { await sb.from('commandes_magasin').update({ statut: 'annulee', message: 'Annulée par ' + qui() }).eq('id', c.id); await load(); }
      return;
    }
    const li = t.closest('#dp-root button.bs-l[data-l]');
    if (li) {
      const c = CMDS.find(x => x.id === li.closest('[data-cmd]').dataset.cmd); if (!c || c.statut !== 'envoyee') return;
      const l = c.lignes[+li.dataset.l]; l.coche = !l.coche; l.par = l.coche ? qui() : ''; l.le = l.coche ? new Date().toISOString() : null;
      li.closest('.mg-card').outerHTML = carteCmd(c, true); vibre();
      await majLignes(c);
    }
  });
  document.addEventListener('input', e => {
    const t = e.target; if (!dansRoot(t)) return;
    if (t.id === 'mg-note') { noteCmd = t.value; return; }
    const tr = t.closest('.mg-tr'); if (tr && t.dataset.f) {
      const i = +tr.dataset.i, l = panier[i]; if (!l) return;
      l[t.dataset.f] = t.value;
      if (t.dataset.f === 'ref') {                       // modèle déjà commandé : désignation (et pièces/carton) reprises
        const k = connusRefs().get(norm(t.value));
        if (k) { if (!l.designation) { l.designation = k.designation; const d = tr.querySelector('[data-f="designation"]'); if (d) d.value = k.designation; }
                 if (!l.pcs && k.pcs) { l.pcs = k.pcs; const p = tr.querySelector('[data-f="pcs"]'); if (p) p.value = k.pcs; } }
      }
      const tot = tr.querySelector('[data-tot]'); if (tot) tot.innerHTML = totCell(l, totalPieces(l));
      const lb = tr.querySelector('.c-pcs span'); if (lb) lb.textContent = pcsLabel(l);
      garderPanier();
    }
  });
  document.addEventListener('change', async e => {
    const t = e.target;
    if (t.dataset && t.dataset.env != null && dansRoot(t)) {
      const c = CMDS.find(x => x.id === t.closest('[data-cmd]').dataset.cmd); if (!c) return;
      const l = c.lignes[+t.dataset.env]; l.envoye = t.value === '' ? null : int(t.value);
      if (l.envoye === envDefaut(l)) l.envoye = null;
      t.closest('.mg-card').outerHTML = carteCmd(c, true);
      await majLignes(c);
    }
  });
  // touche Entrée dans la dernière case : nouvelle ligne
  document.addEventListener('keydown', e => {
    if (e.key !== 'Enter' || !e.target.closest || !e.target.closest('#mg-root .mg-tr')) return;
    e.preventDefault();
    const tr = e.target.closest('.mg-tr'), ins = [...tr.querySelectorAll('input')], k = ins.indexOf(e.target);
    if (k < ins.length - 1) ins[k + 1].focus(); else document.querySelector('#mg-root [data-addl]').click();
  });

  let tm = null;
  if (window.LocalDB && LocalDB.onChange) LocalDB.onChange(() => { clearTimeout(tm); tm = setTimeout(() => { const a = document.activeElement; if (a && dansRoot(a) && /INPUT|TEXTAREA/.test(a.tagName)) return; load(); }, 500); });
  document.addEventListener('mariabag:authenticated', load);
  document.addEventListener('mariabag:profil', () => { if (charge) { const imp = magasinImpose(); if (imp) magId = imp; renderMagasin(); } });
  window.MagasinsAPI = { load, commandes: () => CMDS, magasins: () => MAGS, aPreparer: () => CMDS.filter(c => c.statut === 'envoyee').length };
  window.loadMagasins = load;
})();
