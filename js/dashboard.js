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
    { id: 'ventes',   t: 'Ventes et encaissements', wide: true },
    { id: 'notif',    t: 'À faire aujourd’hui' },
    { id: 'agenda',   t: 'Prochains rendez-vous' },
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
    'Essentiel':  { show: ['apercu', 'ventes', 'notif', 'agenda', 'relances', 'prod', 'cmd', 'stock', 'pf', 'finance'] },
    'Commercial': { show: ['apercu', 'ventes', 'agenda', 'notif', 'relances', 'contacts', 'statuts'] },
    'Production': { show: ['apercu', 'notif', 'ateliers', 'prod', 'charge', 'cmd', 'stock', 'pf', 'produits'] },
    'Tout afficher': { show: WIDGETS.map(w => w.id) }
  };

  /* ---------- Préférences ---------- */
  function defaults() {
    const hidden = {}; DEFAULT_HIDDEN.forEach(i => { hidden[i] = 1; });
    return { order: WIDGETS.map(w => w.id), hidden, collapsed: {}, wide: {}, size: {} };
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
  // Taille d'un bloc : s = petit (1/3), m = moyen (1/2), l = large (toute la ligne)
  const SIZES = { s: 'Petit', m: 'Moyen', l: 'Large' }, NEXT = { s: 'm', m: 'l', l: 's' };
  const sizeOf = w => P.size && P.size[w.id] ? P.size[w.id] : (P.wide[w.id] !== undefined ? (P.wide[w.id] ? 'l' : 'm') : (w.wide ? 'l' : 'm'));

  /* ---------- Application de l'affichage ---------- */
  function applyLayout() {
    const grid = $q('#d-grid'); if (!grid) return;
    P.order.forEach(id => {
      const el = grid.querySelector('[data-w="' + id + '"]'); if (!el) return;
      const w = WIDGETS.find(x => x.id === id);
      grid.appendChild(el);                                   // réordonne dans le DOM
      el.hidden = !!P.hidden[id];
      const sz = sizeOf(w);
      el.classList.toggle('w2', sz === 'l'); el.classList.toggle('w1', sz === 's');
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
    const now = new Date(), h = now.getHours();
    const salut = h < 5 ? 'Bonsoir' : h < 18 ? 'Bonjour' : 'Bonsoir';
    const t = $q('#d-hello'); if (t) t.textContent = salut + ' Khalida';
    const d = $q('#d-date');
    if (d) d.textContent = now.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).replace(/^./, c => c.toUpperCase());
    clock();
  }
  function clock() {
    const c = $q('#d-clock'); if (c) c.textContent = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  }
  // Résumé de la journée en pastilles cliquables (rouge = urgent, vert = tout va bien)
  function renderPulse() {
    const box = $q('#d-pulse'), sub = $q('#d-sub'); if (!box) return;
    const today = iso(new Date()), D_ = typeof D !== 'undefined' ? D : [];
    const late = D_.filter(c => rel(c).k === 'late').length;
    const prodLate = typeof PRODUCTIONS !== 'undefined' ? PRODUCTIONS.filter(prodActive).filter(p => p.date_reception_prevue && p.date_reception_prevue < today).length : 0;
    const cmdLate = typeof COMMANDES !== 'undefined' ? COMMANDES.filter(cmdOuverte).filter(c => c.date_reception_prevue && c.date_reception_prevue < today).length : 0;
    const rup = stockOk() ? StockAPI.list().filter(a => StockAPI.enAlerte(a) && StockAPI.etat(a).rank <= 1).length : 0;
    const rdvAuj = RDV.filter(r => r.date_rdv === today).length;
    const imp = ventes ? ventes.impayeN : 0;
    const items = [
      [late, late + ' relance' + (late > 1 ? 's' : '') + ' en retard', 'rel'],
      [rdvAuj, rdvAuj + ' rendez-vous aujourd’hui', 'notes', 'i'],
      [prodLate, prodLate + ' production' + (prodLate > 1 ? 's' : '') + ' en retard', 'prod'],
      [cmdLate, cmdLate + ' commande' + (cmdLate > 1 ? 's' : '') + ' en retard', 'cmd'],
      [rup, rup + ' article' + (rup > 1 ? 's' : '') + ' en rupture', 'stock'],
      [imp, imp + ' facture' + (imp > 1 ? 's' : '') + ' impayée' + (imp > 1 ? 's' : ''), 'factures']
    ].filter(x => x[0] > 0);
    const urg = items.filter(x => x[3] !== 'i').length;
    if (sub) sub.textContent = urg ? urg + ' point' + (urg > 1 ? 's' : '') + ' demande' + (urg > 1 ? 'nt' : '') + ' votre attention aujourd’hui.' : 'Tout est sous contrôle. Belle journée et bonnes ventes !';
    box.innerHTML = items.length ? items.map(x => '<button type="button" class="dpl' + (x[3] === 'i' ? ' i' : '') + '" data-dgo="' + x[2] + '">' + esc(x[1]) + '</button>').join('')
      : '<span class="dpl ok">✔ Aucune urgence</span>';
  }

  /* ---------- Raccourcis ---------- */
  function go(view) { const b = $q('nav button[data-v="' + view + '"]'); if (b) b.click(); }
  function goAtelier(tab) { go('ateliers'); const t = $q('[data-at-tab="' + tab + '"]'); if (t) t.click(); }
  const QUICK = {
    contact: () => { go('list'); if (typeof edit === 'function') edit(); },
    charge: () => { go('charges'); if (typeof showFormCharge === 'function') showFormCharge(); },
    production: () => { goAtelier('productions-pane'); if (typeof showFormProduction === 'function') showFormProduction(); },
    commande: () => { goAtelier('suivi-pane'); if (typeof showFormCommande === 'function') showFormCommande(); },
    stock: () => go('stock'),
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
  let chargesMois = null, pointesAuj = null, dataErr = false;
  let dernierStock = 0, forcer = true;
  /* Blocs « stables » : le contenu n'est remplacé que s'il a vraiment changé (plus de clignotement ni d'animations rejouées
     à chaque actualisation) ; un bloc qui change s'illumine brièvement. */
  const descHtml = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML');
  function stabiliser(el, flash) {
    if (!el || el._stab || !descHtml) return; el._stab = true; let dernier = null;
    Object.defineProperty(el, 'innerHTML', { configurable: true, get() { return descHtml.get.call(el); },
      set(h) { h = String(h); if (h === dernier) return; const premier = dernier === null; dernier = h; descHtml.set.call(el, h);
        if (!premier && flash) { const c = el.closest('.dw') || el; c.classList.remove('d-maj'); void c.offsetWidth; c.classList.add('d-maj'); } } });
  }
  async function loadExtras() {
    try {
      const today = iso(new Date()), mois = today.slice(0, 7);
      const last = String(new Date(+mois.slice(0, 4), +mois.slice(5, 7), 0).getDate()).padStart(2, '0');
      const c = await sb.from('charges').select('*').gte('date_charge', mois + '-01').lte('date_charge', mois + '-' + last);
      chargesMois = c.error ? null : (c.data || []);
      // acomptes donnés aux employés : comptés comme charges du jour (comme dans l'onglet Charges)
      if (chargesMois) { const ac = await sb.from('acomptes').select('*').gte('date_acompte', mois + '-01').lte('date_acompte', mois + '-' + last);
        if (!ac.error) chargesMois = chargesMois.concat((ac.data || []).map(x => ({ date_charge: x.date_acompte, categorie: 'Paie des employés', montant: x.montant }))); }
      const p = await sb.from('pointages').select('*').eq('date_pointage', today);
      // stock et produits finis : rechargés au plus toutes les 20 s (ou à la demande) pour un tableau de bord fluide
      if (forcer || Date.now() - dernierStock > 20000) {
        dernierStock = Date.now(); forcer = false;
        try { if (window.StockAPI) await StockAPI.load(); } catch (e) { /* stock non installé */ }
        try { if (window.PFAPI) await PFAPI.load(); } catch (e) { /* stock produits finis non installé */ }
      }
      pointesAuj = p.error ? null : (p.data || []).filter(x => Number(x.heures) > 0 || (x.heure_debut && x.heure_fin)).length;
      const r = await sb.from('rendez_vous').select('*').gte('date_rdv', today).order('date_rdv', { ascending: true });
      RDV = r.error ? [] : (r.data || []).filter(x => x.statut === 'Prévu' || x.statut === 'Reporté');
      await loadVentes();
      dataErr = false;
    } catch (e) { dataErr = true; }
  }

  const ICONS = { rel: '☎', prod: '✂', cmd: '📦', charges: '💸', stock: '🧵', pf: '👜', pointage: '⏱', factures: '🧾' };
  function kpi(cls, label, big, sub, go) {
    return '<button type="button" class="card kpi dk ' + cls + '" data-dgo="' + go + '"><span><em class="dki">' + (ICONS[go] || '•') + '</em>' + label + '</span><b>' + big + '</b><i>' + sub + '</i></button>';
  }
  // Animation des chiffres : seulement quand la valeur change (pas à chaque actualisation)
  const LAST = {};
  function countUp(root) {
    if (!root || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    root.querySelectorAll('.kpi.dk b, .fbig b').forEach((b, i) => {
      const txt = b.textContent, m = txt.match(/^([\d\s\u202f\u00a0]+)(.*)$/); if (!m) return;
      const to = Number(m[1].replace(/\D/g, '')), key = root.id + i, from = LAST[key] === undefined ? 0 : LAST[key];
      LAST[key] = to; if (from === to || !isFinite(to)) return;
      const t0 = performance.now(), dur = 700, suf = (/[\s\u202f\u00a0]$/.test(m[1]) ? '\u00a0' : '') + m[2];
      const step = t => { const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3);
        b.textContent = Math.round(from + (to - from) * e).toLocaleString('fr-FR') + suf; if (k < 1) requestAnimationFrame(step); };
      requestAnimationFrame(step);
    });
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
    const totCh = chargesMois ? chargesMois.reduce((s, c) => s + Number(c.montant || 0), 0) : null;       // charges saisies (les charges fixes ne servent qu'à la main d'œuvre)
    const chAuj = chargesMois ? chargesMois.filter(c => c.date_charge === today).reduce((s, c) => s + Number(c.montant || 0), 0) : 0;
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
    const cats = { 'Paie des employés': 0, 'Charges variables': 0 };
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

  /* ---------- Ventes : 6 derniers mois (factures) + encaissements ---------- */
  let RDV = [], ventes = null, comT = 0;
  const MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  async function loadVentes() {
    if (!window.CommerceAPI || !CommerceAPI.docs) { ventes = null; return; }
    try { if (!CommerceAPI.docs().length && Date.now() - comT > 60000) { comT = Date.now(); await CommerceAPI.load(); } } catch (e) { /* commerce non installé */ }
    const now = new Date(), mois = [];
    for (let i = 5; i >= 0; i--) { const d = new Date(now.getFullYear(), now.getMonth() - i, 1); mois.push({ k: iso(d).slice(0, 7), l: MOIS[d.getMonth()], v: 0, n: 0 }); }
    const fac = CommerceAPI.docs().filter(d => d.type === 'facture' && d.statut !== 'annulee');
    let impaye = 0, impayeN = 0, encMois = 0;
    const cur = mois[5].k;
    fac.forEach(d => {
      const ttc = CommerceAPI.totaux(d, CommerceAPI.lignesDe(d.id)).ttc, m = mois.find(x => x.k === String(d.date_doc || '').slice(0, 7));
      if (m) { m.v += ttc; m.n++; }
      const e = CommerceAPI.etatFacture(d);
      if ((e.reste || 0) > 0.004) { impaye += e.reste; impayeN++; }
    });
    try {
      const pr = await sb.from('paiements').select('montant,sens,date_paiement').gte('date_paiement', cur + '-01');
      if (!pr.error) encMois = (pr.data || []).filter(x => x.sens === 'encaissement').reduce((s, x) => s + Number(x.montant || 0), 0);
    } catch (e) {}
    ventes = { mois, impaye, impayeN, encMois, nbFac: fac.length };
  }
  function renderVentes() {
    const box = $q('#d-ventes'); if (!box) return;
    if (!ventes) { box.innerHTML = '<div class="empty" style="padding:22px">Module Commerce non chargé.</div>'; return; }
    const m = ventes.mois, cur = m[5], prev = m[4], max = Math.max(1, ...m.map(x => x.v));
    const evo = prev.v ? Math.round((cur.v - prev.v) / prev.v * 100) : null;
    const tot6 = m.reduce((s, x) => s + x.v, 0);
    let h = '<div class="vk">' +
      '<div class="vki"><span>Facturé ce mois</span><b>' + money(cur.v) + '</b><i class="' + (evo === null ? '' : evo >= 0 ? 'up' : 'down') + '">' + (evo === null ? cur.n + ' facture(s)' : (evo >= 0 ? '▲ +' : '▼ ') + evo + ' % vs ' + prev.l) + '</i></div>' +
      '<div class="vki"><span>Encaissé ce mois</span><b>' + money(ventes.encMois) + '</b><i>paiements reçus</i></div>' +
      '<div class="vki' + (ventes.impayeN ? ' warn' : '') + '" data-dgo="factures"><span>Reste à encaisser</span><b>' + money(ventes.impaye) + '</b><i>' + ventes.impayeN + ' facture(s) non soldée(s)</i></div>' +
      '</div>';
    if (!tot6) h += '<div class="empty" style="padding:18px">Aucune facture sur les 6 derniers mois. <button type="button" class="more" data-dgo="factures">Créer une facture →</button></div>';
    else {
      // histogramme : une barre par mois, le mois en cours mis en avant ; survol = détail
      h += '<div class="vchart" role="img" aria-label="Chiffre d’affaires facturé des 6 derniers mois">' + m.map((x, i) =>
        '<div class="vcol' + (i === 5 ? ' cur' : '') + '" data-tip="' + esc(x.l + ' : ' + money(x.v) + ' · ' + x.n + ' facture(s)') + '">' +
        '<em>' + (x.v ? (x.v >= 1e6 ? (x.v / 1e6).toLocaleString('fr-FR', { maximumFractionDigits: 1 }) + ' M' : Math.round(x.v / 1000).toLocaleString('fr-FR') + ' k') : '') + '</em>' +
        '<i style="height:' + Math.max(x.v ? 4 : 0, x.v / max * 100) + '%"></i><span>' + esc(x.l) + '</span></div>').join('') + '<div class="vtip" hidden></div></div>' +
        '<p class="dhint">Total sur 6 mois : <b>' + money(tot6) + '</b> · moyenne ' + money(tot6 / 6) + ' / mois</p>';
    }
    box.innerHTML = h + '<button type="button" class="more" data-dgo="factures">Ouvrir les factures →</button>';
  }

  /* ---------- Prochains rendez-vous (section Notes) ---------- */
  function renderAgenda() {
    const box = $q('#d-agenda'); if (!box) return;
    if (!RDV.length) { box.innerHTML = '<div class="empty" style="padding:22px">Aucun rendez-vous prévu. <button type="button" class="more" data-dgo="notes">Planifier un rendez-vous →</button></div>'; return; }
    const today = iso(new Date()), dem = new Date(); dem.setDate(dem.getDate() + 1);
    const quand = d => d === today ? 'Aujourd’hui' : d === iso(dem) ? 'Demain' : new Date(d + 'T00:00').toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
    box.innerHTML = '<div class="ag">' + RDV.slice(0, 5).map(r => {
      const d = new Date(r.date_rdv + 'T00:00');
      return '<div class="agr" data-dgo="notes"><div class="agd' + (r.date_rdv === today ? ' auj' : '') + '"><b>' + d.getDate() + '</b><span>' + MOIS[d.getMonth()] + '</span></div>' +
        '<div class="agt"><b>' + esc(r.titre) + '</b><small>' + esc(quand(r.date_rdv)) + (r.heure ? ' · ' + esc(String(r.heure).slice(0, 5)) : '') + (r.contact_nom ? ' · ' + esc(r.contact_nom) : '') + (r.lieu ? ' · ' + esc(r.lieu) : '') + '</small></div>' +
        '<span class="bd ' + (r.statut === 'Reporté' ? 'o' : 'g') + '">' + esc(r.type || r.statut) + '</span></div>';
    }).join('') + '</div>' + (RDV.length > 5 ? '<button type="button" class="more" data-dgo="notes">Voir les ' + RDV.length + ' rendez-vous →</button>' : '<button type="button" class="more" data-dgo="notes">Ouvrir les notes →</button>');
  }

  /* ---------- Rendu global ---------- */
  let timer = null;
  let enCours = false, encore = false;
  function render(force) {
    if (force === true) forcer = true;
    clearTimeout(timer);
    timer = setTimeout(async () => {
      const dash = $q('#v-dash'); if (!dash) return;
      hello();
      if (dash.classList.contains('on')) {
        if (enCours) { encore = true; return; }       // une actualisation à la fois ; la suivante part juste après
        enCours = true;
        ['#d-ventes', '#d-agenda', '#urg', '#d-finance', '#d-produits', '#d-stock', '#d-pf'].forEach(q => stabiliser($q(q), true));
        ['#kpis-all', '#d-pulse'].forEach(q => stabiliser($q(q), false));
        const barre = setTimeout(() => dash.classList.add('d-load'), 350);
        try { await loadExtras(); } finally { clearTimeout(barre); dash.classList.remove('d-load'); enCours = false; }
        if (encore) { encore = false; render(); }
        renderApercu(); renderVentes(); renderAgenda(); renderPulse(); renderRelances(); renderFinance(); renderProduits(); renderStock(); renderPF();
        countUp($q('#kpis-all')); countUp($q('#d-ventes'));
        const u = $q('#d-upd'); if (u) u.innerHTML = '<i class="d-live" title="Le tableau de bord se met à jour tout seul"></i>En direct · mis à jour à ' + new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
        $q('#d-refresh') && $q('#d-refresh').classList.remove('spin');
      }
    }, 120);
  }

  /* ---------- Personnalisation ---------- */
  function custHtml() {
    const rows = P.order.map((id, i) => {
      const w = WIDGETS.find(x => x.id === id);
      return '<div class="cr" data-id="' + id + '"><label class="cv"><input type="checkbox" data-c="vis"' + (P.hidden[id] ? '' : ' checked') + '> ' + esc(w.t) + '</label>' +
        '<span class="cb"><button type="button" class="ib" data-c="wide" title="Changer la taille : petit, moyen, large">Taille : ' + SIZES[sizeOf(w)] + '</button>' +
        '<button type="button" class="ib" data-c="up"' + (i === 0 ? ' disabled' : '') + ' title="Monter">▲</button>' +
        '<button type="button" class="ib" data-c="down"' + (i === P.order.length - 1 ? ' disabled' : '') + ' title="Descendre">▼</button></span></div>';
    }).join('');
    return '<div class="ch"><h2>Personnaliser le tableau de bord</h2><button type="button" class="btn s" data-c="close">Fermer</button></div>' +
      '<p class="dhint" style="margin-top:0">Cochez les blocs à afficher, changez leur ordre avec ▲▼ ou en les glissant, puis choisissez leur taille (petit = 1/3, moyen = 1/2, large = toute la ligne). Vos choix sont gardés sur cet ordinateur.</p>' +
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
    $q('#d-refresh').addEventListener('click', e => { e.currentTarget.classList.add('spin'); render(true); });
    setInterval(clock, 15000);
    // infobulle de l'histogramme des ventes
    const vb = $q('#d-ventes');
    vb.addEventListener('mouseover', e => { const c = e.target.closest('.vcol'), tip = vb.querySelector('.vtip'); if (!c || !tip) return;
      tip.textContent = c.dataset.tip; tip.hidden = false; tip.style.left = (c.offsetLeft + c.offsetWidth / 2) + 'px'; });
    vb.addEventListener('mouseout', e => { const tip = vb.querySelector('.vtip'); if (tip && !e.relatedTarget?.closest?.('.vcol')) tip.hidden = true; });
    vb.addEventListener('click', e => { const c = e.target.closest('.vcol'), tip = vb.querySelector('.vtip'); if (!c || !tip) return;
      tip.textContent = c.dataset.tip; tip.hidden = false; tip.style.left = (c.offsetLeft + c.offsetWidth / 2) + 'px'; });

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
      if (b.dataset.c === 'wide') { const w = WIDGETS.find(x => x.id === id); P.size = P.size || {}; P.size[id] = NEXT[sizeOf(w)]; return changed(); }
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
        if (k === 'notes') return go('notes');
        if (k === 'factures') { go('commerce'); const t = $q('#cm-tabs [data-t="facture"]'); if (t) t.click(); return; }
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
    document.querySelector('nav button[data-v="dash"]').addEventListener('click', () => render(true));
    render();
  }

  init();
})();
