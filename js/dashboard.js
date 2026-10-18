/* ============================================================
   MARIA BAG — Tableau de bord pratique et flexible
   - Raccourcis : ajouter un contact, une charge, une production… en un clic
   - « Vue d'ensemble » : les chiffres clés de TOUS les modules, cliquables
     (un clic ouvre la bonne page, déjà filtrée)
   - Relances : filtres (en retard / cette semaine), appel, WhatsApp, « Fait », +7 j
   - Charges du mois et coût de revient des produits sur la page d'accueil
   - Personnalisation : afficher / masquer, réordonner (glisser-déposer ou ▲▼),
     pleine largeur / demi-largeur, replier un bloc, modèles prêts à l'emploi.
     Les choix sont gardés sur cet ordinateur (localStorage).
   Les blocs existants (notifications, ateliers, commandes…) gardent leurs
   identifiants : les autres fichiers JS n'ont pas à changer.
   ============================================================ */
(function () {
  'use strict';

  const KEY = 'mariabag_dash_v1';
  const $q = s => document.querySelector(s);
  const $qa = s => Array.from(document.querySelectorAll(s));
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = n => (Number(n) || 0).toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + ' DA';
  const iso = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const fdate = s => s ? s.split('-').reverse().join('/') : '';

  /* ---------- Blocs disponibles ---------- */
  // wide : pleine largeur par défaut
  const WIDGETS = [
    { id: 'apercu',   t: 'Vue d’ensemble (chiffres clés)', wide: true },
    { id: 'notif',    t: 'À faire aujourd’hui' },
    { id: 'relances', t: 'Relances à effectuer' },
    { id: 'contacts', t: 'Chiffres contacts', wide: true },
    { id: 'statuts',  t: 'Statut des contacts' },
    { id: 'ateliers', t: 'Chiffres ateliers', wide: true },
    { id: 'prod',     t: 'Productions en cours' },
    { id: 'charge',   t: 'Charge des ateliers' },
    { id: 'cmd',      t: 'Commandes à suivre', wide: true },
    { id: 'stock',    t: 'Alertes de stock' },
    { id: 'pf',       t: 'Produits finis' },
    { id: 'finance',  t: 'Charges du mois' },
    { id: 'produits', t: 'Coût de revient des produits' }
  ];
  // Par défaut : l'essentiel en haut ; les chiffres détaillés sont masqués (réactivables)
  const DEFAULT_HIDDEN = ['contacts', 'ateliers'];
  const PRESETS = {
    'Essentiel':  { show: ['apercu', 'notif', 'relances', 'prod', 'cmd', 'stock', 'pf', 'finance'] },
    'Commercial': { show: ['apercu', 'notif', 'relances', 'contacts', 'statuts'] },
    'Production': { show: ['apercu', 'notif', 'ateliers', 'prod', 'charge', 'cmd', 'stock', 'pf', 'produits'] },
    'Tout afficher': { show: WIDGETS.map(w => w.id) }
  };

  /* ---------- Préférences ---------- */
  function defaults() {
    const hidden = {}; DEFAULT_HIDDEN.forEach(i => { hidden[i] = 1; });
    return { order: WIDGETS.map(w => w.id), hidden, collapsed: {}, wide: {} };
  }
  let P = defaults();
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (saved && Array.isArray(saved.order)) P = Object.assign(defaults(), saved);
  } catch (e) {}
  // blocs ajoutés dans une version plus récente : on les place à la fin
  WIDGETS.forEach(w => { if (!P.order.includes(w.id)) P.order.push(w.id); });
  P.order = P.order.filter(id => WIDGETS.some(w => w.id === id));
  function save() { try { localStorage.setItem(KEY, JSON.stringify(P)); } catch (e) {} }
  const isWide = w => (P.wide[w.id] !== undefined ? !!P.wide[w.id] : !!w.wide);

  /* ---------- Application de l'affichage ---------- */
  function applyLayout() {
    const grid = $q('#d-grid'); if (!grid) return;
    P.order.forEach(id => {
      const el = grid.querySelector('[data-w="' + id + '"]'); if (!el) return;
      const w = WIDGETS.find(x => x.id === id);
      grid.appendChild(el);                                   // réordonne dans le DOM
      el.hidden = !!P.hidden[id];
      el.classList.toggle('w2', isWide(w));
      el.classList.toggle('collapsed', !!P.collapsed[id]);
    });
    // bouton de repli sur chaque bloc « carte »
    grid.querySelectorAll('.dw.card .dh').forEach(h => {
      if (h.querySelector('.dc')) return;
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'dc'; b.title = 'Replier / déplier'; b.textContent = '▾';
      h.appendChild(b);
    });
    // mode « un seul bloc visible » vide ?
    const vides = P.order.every(id => P.hidden[id]);
    let msg = $q('#d-none');
    if (vides && !msg) {
      msg = document.createElement('div'); msg.id = 'd-none'; msg.className = 'card empty';
      msg.innerHTML = 'Tous les blocs sont masqués. Cliquez sur <b>⚙ Personnaliser</b> pour en afficher.';
      grid.parentNode.insertBefore(msg, grid.nextSibling);
    } else if (!vides && msg) msg.remove();
  }

  /* ---------- Bandeau d'accueil ---------- */
  function hello() {
    const h = new Date().getHours();
    const salut = h < 5 ? 'Bonsoir' : h < 18 ? 'Bonjour' : 'Bonsoir';
    const t = $q('#d-hello'); if (t) t.textContent = salut + ' Khalida';
    const sub = $q('#d-sub');
    if (sub) sub.textContent = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
      .replace(/^./, c => c.toUpperCase()) + ' — voici l’essentiel de votre journée.';
  }

  /* ---------- Raccourcis ---------- */
  function go(view) { const b = $q('nav button[data-v="' + view + '"]'); if (b) b.click(); }
  function goAtelier(tab) { go('ateliers'); const t = $q('[data-at-tab="' + tab + '"]'); if (t) t.click(); }
  const QUICK = {
    contact: () => { go('list'); if (typeof edit === 'function') edit(); },
    charge: () => { go('charges'); if (typeof showFormCharge === 'function') showFormCharge(); },
    production: () => { goAtelier('productions-pane'); if (typeof showFormProduction === 'function') showFormProduction(); },
    commande: () => { goAtelier('suivi-pane'); if (typeof showFormCommande === 'function') showFormCommande(); },
    pointage: () => go('employes'),
    produits: () => go('produits')
  };
  // Ouvre la liste des contacts avec un filtre de relance
  function contactsFiltre(k) {
    go('list');
    const f = $q('#fr'); if (f) { f.value = k || ''; f.dispatchEvent(new Event('input')); }
    ['ft', 'fs', 'q'].forEach(i => { const e = $q('#' + i); if (e && k) { e.value = ''; e.dispatchEvent(new Event('input')); } });
  }

  /* ---------- Vue d'ensemble (chiffres clés cliquables) ---------- */
  let chargesMois = null, pointesAuj = null, dataErr = false, fixesMois = { total: 0, jours: 0, parJour: 0 };
  async function loadExtras() {
    try {
      const today = iso(new Date()), mois = today.slice(0, 7);
      const last = String(new Date(+mois.slice(0, 4), +mois.slice(5, 7), 0).getDate()).padStart(2, '0');
      const c = await sb.from('charges').select('*').gte('date_charge', mois + '-01').lte('date_charge', mois + '-' + last);
      chargesMois = c.error ? null : (c.data || []);
      try { if (window.ChargesAPI) fixesMois = await ChargesAPI.moisFixes(mois); } catch (e) { fixesMois = { total: 0, jours: 0, parJour: 0 }; }
      const p = await sb.from('pointages').select('*').eq('date_pointage', today);
      try { if (window.StockAPI) await StockAPI.load(); } catch (e) { /* stock non installé */ }
      try { if (window.PFAPI) await PFAPI.load(); } catch (e) { /* stock produits finis non installé */ }
      pointesAuj = p.error ? null : (p.data || []).filter(x => Number(x.heures) > 0 || (x.heure_debut && x.heure_fin)).length;
      dataErr = false;
    } catch (e) { dataErr = true; }
  }

  function kpi(cls, label, big, sub, go) {
    return '<button type="button" class="card kpi dk ' + cls + '" data-dgo="' + go + '"><span>' + label + '</span><b>' + big + '</b><i>' + sub + '</i></button>';
  }
  function renderApercu() {
    const el = $q('#kpis-all'); if (!el) return;
    const today = iso(new Date());
    const D_ = typeof D !== 'undefined' ? D : [];
    const late = D_.filter(c => rel(c).k === 'late').length, soon = D_.filter(c => rel(c).k === 'soon').length;
    const prods = typeof PRODUCTIONS !== 'undefined' ? PRODUCTIONS.filter(prodActive) : [];
    const prodLate = prods.filter(p => p.date_reception_prevue && p.date_reception_prevue < today).length;
    const cmds = typeof COMMANDES !== 'undefined' ? COMMANDES.filter(cmdOuverte) : [];
    const cmdLate = cmds.filter(c => c.date_reception_prevue && c.date_reception_prevue < today).length;
    const reste = cmds.reduce((n, c) => n + Math.max(0, (Number(c.quantite_commandee) || 0) - (Number(c.quantite_recue) || 0)), 0);
    const totCh = chargesMois ? chargesMois.reduce((s, c) => s + Number(c.montant || 0), 0) + fixesMois.total : null;       // saisies + charges fixes calculées
    const chAuj = chargesMois ? chargesMois.filter(c => c.date_charge === today).reduce((s, c) => s + Number(c.montant || 0), 0) + (fixesMois.parJour && pointesAuj ? fixesMois.parJour : 0) : 0;
    const nbEmp = typeof EMPLOYES !== 'undefined' ? EMPLOYES.length : 0;
    el.innerHTML =
      kpi(late ? 'u' : '', 'Relances à faire', late + soon, late + ' en retard · ' + soon + ' cette semaine', 'rel') +
      kpi(prodLate ? 'u' : '', 'Productions en cours', prods.length, prodLate + ' en retard · ' + prods.reduce((n, p) => n + (Number(p.quantite_lancee) || 0), 0) + ' pièces', 'prod') +
      kpi(cmdLate ? 'u' : '', 'Commandes à livrer', cmds.length, cmdLate + ' en retard · ' + reste + ' pièces restantes', 'cmd') +
      kpi('', 'Charges du mois', totCh === null ? '—' : money(totCh), totCh === null ? 'Indisponible' : 'Aujourd’hui : ' + money(chAuj), 'charges') +
      kpiStock() + kpiPF() +
      kpi('', 'Employés pointés aujourd’hui', pointesAuj === null ? '—' : pointesAuj + (nbEmp ? ' / ' + nbEmp : ''), 'Ouvrir le pointage', 'pointage');
  }

  /* ---------- Stock : alertes ---------- */
  const stockOk = () => window.StockAPI && StockAPI.list().length > 0;
  function kpiStock() {
    if (!stockOk()) return kpi('', 'Stock', '—', 'Ouvrir le stock', 'stock');
    const al = StockAPI.list().filter(StockAPI.enAlerte), rup = al.filter(a => StockAPI.etat(a).rank <= 1).length;
    return kpi(rup ? 'u' : '', 'Stock à surveiller', al.length, rup + ' en rupture · ' + (al.length - rup) + ' stock bas', 'stock');
  }
  /* ---------- Produits finis ---------- */
  function kpiPF() {
    if (!window.PFAPI || !PFAPI.list().length) return kpi('', 'Produits finis', '—', 'Ouvrir le stock', 'pf');
    const s = PFAPI.summary();
    return kpi(s.manques || s.alertes.length ? 'u' : '', 'Produits finis en stock', num(s.pieces), s.aLivrer + ' pièces à livrer · ' + (s.manques ? s.manques + ' commande(s) sans stock' : 'stock suffisant'), 'pf');
  }
  const num = n => (Number(n) || 0).toLocaleString('fr-FR', { maximumFractionDigits: 0 });
  function renderPF() {
    const box = $q('#d-pf'); if (!box) return;
    if (!window.PFAPI || !PFAPI.list().length) { box.innerHTML = '<div class="empty" style="padding:22px">Aucun produit fini. <button type="button" class="more" data-dgo="pf">Ouvrir le stock →</button></div>'; return; }
    const s = PFAPI.summary();
    let h = '<div class="fbig"><b>' + num(s.pieces) + ' pièces</b><span>en stock · valeur ' + money(s.valeurCout) + ' au coût de revient</span></div>';
    if (s.aEntrer.length) h += '<div class="pf-note">📥 ' + s.aEntrer.length + ' production(s) terminée(s) à entrer en stock : ' + esc(s.aEntrer.slice(0, 3).map(x => x.nom + ' (' + num(x.pieces) + ')').join(', ')) + '</div>';
    if (s.manques) h += '<div class="pf-note pf-warn">⚠ ' + s.manques + ' commande(s) client dépassent le stock disponible</div>';
    h += s.alertes.length ? '<table style="min-width:0"><tbody>' + s.alertes.slice(0, 4).map(a =>
      '<tr class="row" data-dgo="pf"><td><b>' + esc(a.nom) + '</b></td><td>' + num(a.stock) + ' pcs</td><td><span class="bd ' + a.etat.c + '">' + a.etat.l + '</span></td></tr>').join('') + '</tbody></table>' : '';
    if (s.derniers.length) h += '<p class="dhint" style="margin-top:8px">Dernières livraisons : ' + esc(s.derniers.slice(0, 3).map(d => (d.client || 'client') + ' ' + num(d.pieces) + ' ' + d.produit).join(' · ')) + '</p>';
    box.innerHTML = h + '<button type="button" class="more" data-dgo="pf">Ouvrir les produits finis →</button>';
  }

  function renderStock() {
    const box = $q('#d-stock'); if (!box) return;
    if (!window.StockAPI || !StockAPI.list().length) {
      box.innerHTML = '<div class="empty" style="padding:22px">Aucun article en stock. <button type="button" class="more" data-dgo="stock">Ouvrir le stock →</button></div>'; return;
    }
    const all = StockAPI.list(), al = all.filter(StockAPI.enAlerte).sort((a, b) => StockAPI.etat(a).rank - StockAPI.etat(b).rank || a.nom.localeCompare(b.nom));
    const val = all.reduce((s, a) => s + Math.max(0, StockAPI.qty(a.id)) * StockAPI.unitPrice(a), 0);
    let h = '<div class="fbig"><b>' + money(val) + '</b><span>valeur du stock · ' + all.length + ' articles</span></div>';
    h += al.length ? '<table style="min-width:0"><tbody>' + al.slice(0, 6).map(a => {
      const f = StockAPI.fmtQty(a, StockAPI.qty(a.id)), e = StockAPI.etat(a), c = StockAPI.aCommander(a);
      return '<tr class="row" data-dgo="stock"><td><b>' + esc(a.nom) + '</b><small>' + esc(a.categorie) + '</small></td>' +
        '<td>' + esc(f.main) + (f.sub ? '<small>' + esc(f.sub) + '</small>' : '') + '</td>' +
        '<td><span class="bd ' + e.c + '">' + e.l + '</span>' + (c.nb ? '<small>à commander : ' + c.nb + ' ' + esc(StockAPI.plur(a.cond_nom, c.nb)) + '</small>' : '') + '</td></tr>';
    }).join('') + '</tbody></table>' + (al.length > 6 ? '<button type="button" class="more" data-dgo="stock">Voir les ' + al.length + ' alertes →</button>' : '')
      : '<div class="empty" style="padding:18px">✔ Aucun article sous son seuil d’alerte.</div>';
    box.innerHTML = h + '<button type="button" class="more" data-dgo="stock">Ouvrir le stock →</button>';
  }

  /* ---------- Relances : filtres + actions rapides ---------- */
  let relFiltre = 'all';
  function renderRelances() {
    const box = $q('#urg'); if (!box || typeof D === 'undefined') return;
    const late = D.filter(c => rel(c).k === 'late'), soon = D.filter(c => rel(c).k === 'soon');
    const base = relFiltre === 'late' ? late : relFiltre === 'soon' ? soon : [...late, ...soon];
    const list = base.sort((a, b) => a.relance.localeCompare(b.relance));
    const chip = (k, l, n) => '<button type="button" class="chip' + (relFiltre === k ? ' on' : '') + '" data-rf="' + k + '">' + l + ' <b>' + n + '</b></button>';
    let h = '<div class="chips">' + chip('all', 'Toutes', late.length + soon.length) + chip('late', 'En retard', late.length) + chip('soon', 'Cette semaine', soon.length) + '</div>';
    if (!list.length) {
      h += '<div class="empty" style="padding:22px">Aucune relance ' + (relFiltre === 'late' ? 'en retard' : relFiltre === 'soon' ? 'cette semaine' : 'urgente') + '. ' +
        (D.length ? 'Tout est à jour.' : 'Ajoutez ou importez vos premiers contacts.') + '</div>';
    } else {
      h += '<div class="rl">' + list.slice(0, 8).map(c => {
        const r = rel(c), tel = String(c.tel || '').replace(/[^\d+]/g, '');
        const wa = tel.replace(/^\+/, '').replace(/^00/, '').replace(/^0/, '213');
        return '<div class="rr" data-id="' + esc(c.id) + '"><div class="rn"><b>' + esc(full(c)) + '</b><small>' + esc(c.societe || c.type) + '</small></div>' +
          '<span class="bd ' + r.c + '">' + esc(r.l) + '</span>' +
          '<div class="ra">' + (tel ? '<a class="ib" href="tel:' + esc(tel) + '" title="Appeler">☎</a><a class="ib" target="_blank" rel="noopener" href="https://wa.me/' + esc(wa) + '" title="WhatsApp">✉</a>' : '') +
          '<button type="button" class="ib" data-act="done" title="Relance faite (retire la date)">✔</button>' +
          '<button type="button" class="ib" data-act="p7" title="Reporter de 7 jours">+7j</button></div></div>';
      }).join('') + '</div>';
      if (list.length > 8) h += '<button type="button" class="more" data-more="' + (relFiltre === 'all' ? '' : relFiltre) + '">Voir les ' + list.length + ' relances →</button>';
    }
    box.innerHTML = h;
  }
  async function relanceAct(id, act) {
    const c = D.find(x => String(x.id) === String(id)); if (!c) return;
    const o = { ...c };
    if (act === 'done') { o.derniere = iso(new Date()); o.relance = ''; }
    else { const d = new Date(); d.setDate(d.getDate() + 7); o.relance = iso(d); }
    const updated = await updateContact(c.id, o);
    if (!updated) return;
    Object.assign(c, updated);
    if (typeof toast === 'function') toast(act === 'done' ? 'Relance marquée comme faite' : 'Relance reportée au ' + fdate(updated.relance));
    render();
  }

  /* ---------- Charges du mois ---------- */
  const CAT_COL = { 'Paie des employés': 'var(--g)', 'Charges fixes': 'var(--o)', 'Charges variables': 'var(--mut)' };
  function renderFinance() {
    const box = $q('#d-finance'); if (!box) return;
    if (chargesMois === null) { box.innerHTML = '<div class="empty" style="padding:22px">Charges indisponibles pour le moment.</div>'; return; }
    // paie + charges fixes (calculées chaque jour) + charges variables (saisies, hors main d'œuvre)
    const cats = { 'Paie des employés': 0, 'Charges fixes': fixesMois.total, 'Charges variables': 0 };
    chargesMois.forEach(c => { cats[c.categorie === 'Paie des employés' ? 'Paie des employés' : 'Charges variables'] += Number(c.montant || 0); });
    Object.keys(cats).forEach(k => { if (!cats[k]) delete cats[k]; });
    const tot = Object.values(cats).reduce((s, v) => s + v, 0);
    const rows = Object.keys(cats).sort((a, b) => cats[b] - cats[a]);
    const jours = Math.max(1, new Date().getDate());
    box.innerHTML = '<div class="fbig"><b>' + money(tot) + '</b><span>ce mois · moyenne ' + money(tot / jours) + ' / jour</span></div>' +
      (rows.length ? rows.map(k => '<div class="bar"><div class="t"><span>' + esc(k) + '</span><b>' + money(cats[k]) + '</b></div><div class="tr"><i style="width:' + (tot ? cats[k] / tot * 100 : 0) + '%;background:' + (CAT_COL[k] || 'var(--mut)') + '"></i></div></div>').join('')
        : '<div class="empty" style="padding:18px">Aucune charge enregistrée ce mois-ci.</div>') +
      '<button type="button" class="more" data-dgo="charges">Ouvrir les charges →</button>';
  }

  /* ---------- Coût de revient des produits ---------- */
  function renderProduits() {
    const box = $q('#d-produits'); if (!box) return;
    if (typeof PRODUITS === 'undefined' || typeof recap !== 'function') { box.innerHTML = '<div class="empty" style="padding:22px">Section Produits non chargée.</div>'; return; }
    if (!PRODUITS.length) { box.innerHTML = '<div class="empty" style="padding:22px">Aucun produit. <button type="button" class="more" data-dgo="produits">Créer un produit →</button></div>'; return; }
    const rows = PRODUITS.map(p => ({ p, r: recap(p) })).sort((a, b) => b.r.total - a.r.total);
    box.innerHTML = '<table style="min-width:0"><tbody>' + rows.slice(0, 6).map(x =>
      '<tr class="row" data-dgo="produits"><td><b>' + esc(x.p.nom) + '</b><small>Matières ' + money(x.r.mat) + ' · M.O. ' + (Number(x.p.mo_pieces) ? money(x.r.mo) : '—') + '</small></td><td style="text-align:right"><b>' + money(x.r.total) + '</b><small>par pièce</small></td></tr>').join('') +
      '</tbody></table>' + (Number(rows.some(x => !Number(x.p.mo_pieces))) ? '<p class="dhint">⚠ Main d’œuvre non renseignée sur certains produits : coût incomplet.</p>' : '');
  }

  /* ---------- Rendu global ---------- */
  let timer = null;
  function render() {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      const dash = $q('#v-dash'); if (!dash) return;
      hello();
      if (dash.classList.contains('on')) {
        await loadExtras();
        renderApercu(); renderRelances(); renderFinance(); renderProduits(); renderStock(); renderPF();
      }
    }, 120);
  }

  /* ---------- Personnalisation ---------- */
  function custHtml() {
    const rows = P.order.map((id, i) => {
      const w = WIDGETS.find(x => x.id === id);
      return '<div class="cr" data-id="' + id + '"><label class="cv"><input type="checkbox" data-c="vis"' + (P.hidden[id] ? '' : ' checked') + '> ' + esc(w.t) + '</label>' +
        '<span class="cb"><button type="button" class="ib" data-c="wide" title="Pleine largeur / demi-largeur">' + (isWide(w) ? '◧ Demi' : '▭ Large') + '</button>' +
        '<button type="button" class="ib" data-c="up"' + (i === 0 ? ' disabled' : '') + ' title="Monter">▲</button>' +
        '<button type="button" class="ib" data-c="down"' + (i === P.order.length - 1 ? ' disabled' : '') + ' title="Descendre">▼</button></span></div>';
    }).join('');
    return '<div class="ch"><h2>Personnaliser le tableau de bord</h2><button type="button" class="btn s" data-c="close">Fermer</button></div>' +
      '<p class="dhint" style="margin-top:0">Cochez les blocs à afficher, changez leur ordre avec ▲▼ ou en les glissant, puis choisissez leur largeur. Vos choix sont gardés sur cet ordinateur.</p>' +
      '<div class="presets">' + Object.keys(PRESETS).map(k => '<button type="button" class="chip" data-p="' + esc(k) + '">' + esc(k) + '</button>').join('') +
      '<button type="button" class="chip" data-c="reset">Réinitialiser</button></div><div class="cl">' + rows + '</div>';
  }
  function openCust(open) {
    const box = $q('#d-cust'), btn = $q('#d-edit'); if (!box) return;
    box.hidden = !open; $q('#d-grid').classList.toggle('editing', open);
    btn.setAttribute('aria-expanded', open ? 'true' : 'false'); btn.classList.toggle('on', open);
    $qa('#d-grid .dw').forEach(el => { el.draggable = !!open; });
    if (open) { box.innerHTML = custHtml(); box.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
  }
  function move(id, dir) {
    const i = P.order.indexOf(id), j = i + dir;
    if (i < 0 || j < 0 || j >= P.order.length) return;
    P.order.splice(i, 1); P.order.splice(j, 0, id);
  }
  function changed() { save(); applyLayout(); if (!$q('#d-cust').hidden) $q('#d-cust').innerHTML = custHtml(); render(); }

  /* ---------- Événements ---------- */
  function init() {
    const dash = $q('#v-dash'); if (!dash) return;
    applyLayout(); hello();

    // raccourcis
    $q('#d-quick').addEventListener('click', e => {
      const b = e.target.closest('[data-q]'); if (b && QUICK[b.dataset.q]) QUICK[b.dataset.q]();
    });
    $q('#d-edit').addEventListener('click', () => openCust($q('#d-cust').hidden));

    // panneau de personnalisation
    $q('#d-cust').addEventListener('click', e => {
      const preset = e.target.closest('[data-p]');
      if (preset) { const show = PRESETS[preset.dataset.p].show; P.hidden = {}; WIDGETS.forEach(w => { if (!show.includes(w.id)) P.hidden[w.id] = 1; });
        P.order = [...show.filter(i => WIDGETS.some(w => w.id === i)), ...P.order.filter(i => !show.includes(i))]; return changed(); }
      const b = e.target.closest('[data-c]'); if (!b) return;
      const id = (b.closest('.cr') || {}).dataset && b.closest('.cr').dataset.id;
      if (b.dataset.c === 'close') return openCust(false);
      if (b.dataset.c === 'reset') { P = defaults(); return changed(); }
      if (b.dataset.c === 'up') { move(id, -1); return changed(); }
      if (b.dataset.c === 'down') { move(id, 1); return changed(); }
      if (b.dataset.c === 'wide') { const w = WIDGETS.find(x => x.id === id); P.wide[id] = !isWide(w); return changed(); }
    });
    $q('#d-cust').addEventListener('change', e => {
      const c = e.target.closest('[data-c="vis"]'); if (!c) return;
      const id = c.closest('.cr').dataset.id; if (c.checked) delete P.hidden[id]; else P.hidden[id] = 1; changed();
    });

    // glisser-déposer des blocs (mode personnalisation)
    let drag = null;
    const grid = $q('#d-grid');
    grid.addEventListener('dragstart', e => { const w = e.target.closest('.dw'); if (!w || !grid.classList.contains('editing')) return; drag = w.dataset.w; w.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', drag); } catch (x) {} });
    grid.addEventListener('dragend', () => { drag = null; $qa('.dw').forEach(w => w.classList.remove('dragging', 'over')); });
    grid.addEventListener('dragover', e => { if (!drag) return; e.preventDefault(); const w = e.target.closest('.dw'); $qa('.dw.over').forEach(x => x.classList.remove('over')); if (w && w.dataset.w !== drag) w.classList.add('over'); });
    grid.addEventListener('drop', e => {
      if (!drag) return; e.preventDefault();
      const w = e.target.closest('.dw'); if (!w || w.dataset.w === drag) return;
      P.order.splice(P.order.indexOf(drag), 1); P.order.splice(P.order.indexOf(w.dataset.w), 0, drag); changed();
    });

    // clics dans le tableau de bord
    dash.addEventListener('click', e => {
      if (grid.classList.contains('editing') && e.target.closest('.dw') && !e.target.closest('.dc')) { e.stopPropagation(); return; }
      const dc = e.target.closest('.dc');
      if (dc) { const w = dc.closest('.dw'); P.collapsed[w.dataset.w] = !P.collapsed[w.dataset.w]; w.classList.toggle('collapsed', !!P.collapsed[w.dataset.w]); save(); return; }
      const chip = e.target.closest('[data-rf]'); if (chip) { relFiltre = chip.dataset.rf; return renderRelances(); }
      const act = e.target.closest('[data-act]'); if (act) { e.stopPropagation(); return relanceAct(act.closest('.rr').dataset.id, act.dataset.act); }
      if (e.target.closest('a')) return;
      const more = e.target.closest('[data-more]'); if (more) return contactsFiltre(more.dataset.more);
      const rr = e.target.closest('.rr'); if (rr && typeof edit === 'function') { go('list'); return edit(rr.dataset.id); }
      const g = e.target.closest('[data-dgo]');
      if (g) {
        const k = g.dataset.dgo;
        if (k === 'rel') return contactsFiltre(D.some(c => rel(c).k === 'late') ? 'late' : 'soon');
        if (k === 'prod') return goAtelier('productions-pane');
        if (k === 'cmd') return goAtelier('suivi-pane');
        if (k === 'charges') return go('charges');
        if (k === 'pointage') return go('employes');
        if (k === 'produits') return go('produits');
        if (k === 'stock') return go('stock');
        if (k === 'pf') { go('stock'); if (window.PFAPI) PFAPI.open(); return; }
      }
    }, true);   // phase de capture ; nos blocs utilisent data-dgo (les lignes ateliers gardent data-go, géré par ateliers.js)

    // rafraîchissement automatique
    ['dash', 'refreshAtelierViews', 'renderNotifications'].forEach(fn => {
      const orig = window[fn]; if (typeof orig !== 'function') return;
      window[fn] = function () { const r = orig.apply(this, arguments); render(); return r; };
    });
    if (window.LocalDB) LocalDB.onChange(render);
    document.addEventListener('mariabag:authenticated', render);
    document.addEventListener('mariabag:charges', render);
    document.addEventListener('mariabag:pf', () => { if ($q('#v-dash').classList.contains('on')) { renderApercu(); renderPF(); } });
    // Le stock a changé : rendu léger (sans recharger le stock, pour ne pas boucler)
    document.addEventListener('mariabag:stock', () => { if ($q('#v-dash').classList.contains('on')) { renderApercu(); renderProduits(); renderStock(); } });
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') render(); });
    setInterval(() => { if (document.visibilityState === 'visible') render(); }, 60000);
    document.querySelector('nav button[data-v="dash"]').addEventListener('click', render);
    render();
  }

  init();
})();
