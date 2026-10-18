/* ============================================================
   MARIA BAG — Base de données LOCALE (hors ligne) + synchronisation
   - Toutes les données sont enregistrées d'abord SUR L'ORDINATEUR
     (base IndexedDB du navigateur / de l'application installée).
   - L'application fonctionne sans internet : ajout, modification,
     suppression, calculs, PDF, Excel…
   - Dès que la connexion revient, les changements sont envoyés à
     Supabase, puis les données des autres appareils sont récupérées.
   - Les autres fichiers JS n'ont pas changé : ils utilisent toujours
     sb.from('table').select()/insert()/update()/delete()/upsert(),
     mais « sb » lit et écrit maintenant dans la base locale.
   - Si SUPABASE_URL est vide dans config.js : mode 100 % local.
   ============================================================ */
(function () {
  'use strict';

  var DB_NAME = 'mariabag_local';
  var DB_VERSION = 1;
  var SYNC_EVERY_MS = 60 * 1000;          // synchronisation automatique toutes les minutes
  var PAGE = 1000;

  // Ordre = parents d'abord (important pour envoyer les nouvelles lignes à Supabase)
  var TABLES = ['contacts', 'ateliers', 'employes', 'modeles', 'stock_articles', 'composants', 'productions', 'commandes',
                'acomptes', 'pointages', 'charges', 'produits', 'produit_lignes', 'stock_mouvements', 'charges_fixes', 'pf_mouvements'];

  // Valeurs par défaut (les mêmes que dans les fichiers supabase/*.sql)
  var DEFAULTS = {
    contacts: { nom: '', prenom: '', poste: '', societe: '', type: 'Client', statut: 'En attente', tel: '', email: '', ville: '',
                source: '', produits: '', notes: '', hist: [], derniere: null, relance: null },
    ateliers: { adresse: '', tel: '', email: '', responsable: '', capacite_journaliere: 0, statut: 'Actif', notes: '' },
    productions: { quantite_lancee: 0, statut: 'En cours', notes: '', date_reception_reelle: null, delai_jours: null, produit_id: null },
    commandes: { contact_id: null, commande_numero: null, quantite_commandee: 0, quantite_recue: 0, date_reception_prevue: null,
                 statut: 'En attente', notes: '' },
    employes: { prenom: '', poste: '', salaire_mensuel: 0, taux_horaire: 0, taux_heure_sup: 0, heure_fin_normale: '19:00', notes: '' },
    acomptes: { montant: 0, note: '' },
    pointages: { heures: 0, heure_debut: null, heure_fin: null },
    charges: { montant: 0, employe_id: null, employe_nom: '', note: '' },
    modeles: { description: '' },
    composants: { unite: 'pcs', quantite: 0, perte_pct: 0, note: '', ordre: 0, article_id: null, type: 'matiere', prix_unitaire: 0 },
    charges_fixes: { categorie: 'Autre charge fixe', montant: 0, jours: 'travailles', date_debut: null, date_fin: null, actif: true, note: '' },
    stock_articles: { unite: 'm', cond_nom: '', cond_qte: 0, prix_achat: 0, seuil_alerte: 0, fournisseur: '', contact_id: null, couleur: '', note: '' },
    stock_mouvements: { date_mvt: null, type: 'entree', prix_achat: null, fournisseur: '', contact_id: null, reference: '', note: '', source: 'manuel' },
    produits: { description: '', modele_id: null, mo_date: null, mo_salaires: 0, mo_charges: 0, mo_pieces: 0, prix_vente: 0, seuil_pf: 0 },
    pf_mouvements: { date_mvt: null, type: 'entree', contact_id: null, client_nom: '', commande_id: null, production_id: null, prix_vente: null, reference: '', note: '' },
    produit_lignes: { categorie: 'Autre outil', designation: '', unite: 'pcs', quantite: 0, prix_unitaire: 0, perte_pct: 0, note: '', ordre: 0, article_id: null }
  };

  // Contraintes « unique » (pour afficher la même erreur que Supabase)
  var UNIQUE = {
    ateliers: [['nom']], modeles: [['nom']], produits: [['nom']], stock_articles: [['categorie', 'nom']],
    pointages: [['employe_id', 'date_pointage']], commandes: [['commande_numero']]
  };
  // Clé utilisée pour envoyer une ligne à Supabase
  var CONFLICT = { pointages: 'employe_id,date_pointage' };

  // Suppressions en cascade (comme « on delete cascade / set null » dans Supabase)
  var CASCADE = [
    ['modeles', 'composants', 'modele_id', 'cascade'], ['modeles', 'produits', 'modele_id', 'null'],
    ['produits', 'produit_lignes', 'produit_id', 'cascade'],
    ['stock_articles', 'stock_mouvements', 'article_id', 'cascade'], ['stock_articles', 'composants', 'article_id', 'null'],
    ['stock_articles', 'produit_lignes', 'article_id', 'null'],
    ['produits', 'pf_mouvements', 'produit_id', 'cascade'], ['produits', 'productions', 'produit_id', 'null'],
    ['contacts', 'pf_mouvements', 'contact_id', 'null'], ['commandes', 'pf_mouvements', 'commande_id', 'null'], ['productions', 'pf_mouvements', 'production_id', 'null'],
    ['ateliers', 'productions', 'atelier_id', 'cascade'], ['productions', 'commandes', 'production_id', 'cascade'],
    ['contacts', 'commandes', 'contact_id', 'null'],
    ['contacts', 'stock_articles', 'contact_id', 'null'], ['contacts', 'stock_mouvements', 'contact_id', 'null'],
    ['employes', 'pointages', 'employe_id', 'cascade'], ['employes', 'acomptes', 'employe_id', 'cascade'],
    ['employes', 'charges', 'employe_id', 'null']
  ];

  /* ---------- État ---------- */
  var MEM = {};                 // { table: Map(id -> ligne) }
  var OUTBOX = [];              // changements à envoyer : { op: 'upsert'|'delete', t, id }
  var REJECTED = [];            // changements refusés par Supabase (affichés dans l'indicateur)
  var META = { lastPull: 0, lastPush: 0 };
  var idb = null, remote = null, flushing = false, pulling = false, lastError = '';
  TABLES.forEach(function (t) { MEM[t] = new Map(); });
  function mem(t) { return MEM[t] || (MEM[t] = new Map()); }

  /* ---------- Outils ---------- */
  function clone(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }
  function now() { return new Date().toISOString(); }
  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    var b = new Uint8Array(16); crypto.getRandomValues(b);
    b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128;
    var h = Array.from(b, function (x) { return (x + 256).toString(16).slice(1); }).join('');
    return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20);
  }
  function isNetworkError(e) {
    var m = (e && (e.message || e.details)) || String(e || '');
    return !navigator.onLine || /fetch|network|load failed|timeout|ECONN|abort/i.test(m);
  }
  function isMissingTable(e) {
    var m = (e && e.message) || '';
    return /schema cache|does not exist|Could not find|relation/i.test(m);
  }
  // Compare deux lignes sur le fond (pas le format) : 19:00 = 19:00:00, 5 = "5.00", dates de mise à jour ignorées
  function norm(v) {
    if (v == null || v === '') return null;
    if (typeof v === 'string') {
      if (/^\d\d:\d\d(:\d\d(\.\d+)?)?$/.test(v)) return v.slice(0, 5);
      if (/^\d{4}-\d\d-\d\dT/.test(v)) { var d = Date.parse(v); return isNaN(d) ? v : Math.floor(d / 1000); }
      if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v);
      return v;
    }
    if (typeof v === 'object') return JSON.stringify(v);
    return v;
  }
  function sameRow(a, b) {
    var keys = {};
    Object.keys(a || {}).concat(Object.keys(b || {})).forEach(function (k) { keys[k] = 1; });
    return Object.keys(keys).every(function (k) {
      return k === 'updated_at' || k === 'created_at' || norm(a[k]) === norm(b[k]);
    });
  }
  function err(message, code) { return { message: message, code: code || 'LOCAL' }; }

  /* ---------- IndexedDB (stockage sur le disque de l'ordinateur) ---------- */
  function openIdb() {
    return new Promise(function (res, rej) {
      var o = indexedDB.open(DB_NAME, DB_VERSION);
      o.onupgradeneeded = function () {
        var db = o.result;
        if (!db.objectStoreNames.contains('rows')) db.createObjectStore('rows');
        if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta');
      };
      o.onsuccess = function () { res(o.result); };
      o.onerror = function () { rej(o.error); };
    });
  }
  function key(t, id) { return t + '|' + id; }
  function idbAll() {
    return new Promise(function (res, rej) {
      var tx = idb.transaction(['rows', 'meta'], 'readonly'), rows = [], meta = {};
      var st = tx.objectStore('rows');
      st.openCursor().onsuccess = function (ev) {
        var c = ev.target.result; if (!c) return;
        var k = String(c.key), i = k.indexOf('|');
        rows.push([k.slice(0, i), c.value]); c.continue();
      };
      tx.objectStore('meta').openCursor().onsuccess = function (ev) {
        var c = ev.target.result; if (!c) return; meta[c.key] = c.value; c.continue();
      };
      tx.oncomplete = function () { res({ rows: rows, meta: meta }); };
      tx.onerror = function () { rej(tx.error); };
    });
  }
  // Écrit des lignes (puts) / en efface (dels) + la file d'attente, en une seule transaction
  var writeChain = Promise.resolve();
  function persist(puts, dels) {
    if (!idb) return Promise.resolve();
    var p = writeChain.then(function () {
      return new Promise(function (res) {
        var tx = idb.transaction(['rows', 'meta'], 'readwrite'), st = tx.objectStore('rows');
        (puts || []).forEach(function (x) { st.put(x[1], key(x[0], x[1].id)); });
        (dels || []).forEach(function (x) { st.delete(key(x[0], x[1])); });
        var m = tx.objectStore('meta');
        m.put(OUTBOX, 'outbox'); m.put(REJECTED.slice(-50), 'rejected'); m.put(META, 'info');
        tx.oncomplete = function () { res(); };
        tx.onerror = tx.onabort = function () { console.error('Enregistrement local impossible', tx.error); res(); };
      });
    });
    writeChain = p;
    return p;
  }

  /* ---------- Démarrage ---------- */
  var ready = (async function () {
    try {
      idb = await openIdb();
      var all = await idbAll();
      all.rows.forEach(function (r) { mem(r[0]).set(String(r[1].id), r[1]); });
      OUTBOX = all.meta.outbox || [];
      REJECTED = all.meta.rejected || [];
      META = Object.assign(META, all.meta.info || {});
      if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(function () {});
    } catch (e) {
      idb = null;
      console.error('Base locale indisponible', e);
      setTimeout(function () { say('⚠ Base locale indisponible sur ce navigateur (navigation privée ?) : les données ne seront pas gardées sur le PC.'); }, 1500);
    }
    // attendre que tous les scripts soient chargés (app.js crée la connexion Supabase)
    if (document.readyState === 'loading') await new Promise(function (r) { document.addEventListener('DOMContentLoaded', r); });
    // Premier lancement sur ce PC : on récupère tout depuis Supabase avant d'afficher
    var vide = TABLES.every(function (t) { return mem(t).size === 0; });
    if (vide && remote && navigator.onLine) {
      try { await withTimeout(pull(true), 20000); } catch (e) {}
    }
  })();
  function withTimeout(p, ms) { return Promise.race([p, new Promise(function (r) { setTimeout(r, ms); })]); }

  /* ---------- Moteur de requêtes (même syntaxe que supabase-js) ---------- */
  function cmp(a, b) {
    if (a == null && b == null) return 0;
    if (a == null) return 1;                 // valeurs vides à la fin (comme PostgreSQL en ordre croissant)
    if (b == null) return -1;
    if (typeof a === 'number' && typeof b === 'number') return a - b;
    return String(a).localeCompare(String(b), 'fr', { numeric: true, sensitivity: 'base' });
  }
  function parseJoins(sel) {
    var out = [], re = /(\w+)\s*\(([^)]*)\)/g, m;
    while ((m = re.exec(sel || ''))) out.push({ name: m[1], cols: m[2].split(',').map(function (s) { return s.trim(); }).filter(Boolean) });
    return out;
  }
  function withJoins(t, row, joins) {
    if (!joins.length) return row;
    joins.forEach(function (j) {
      var fk = j.name.replace(/s$/, '') + '_id';          // ateliers(nom) -> atelier_id
      var p = row[fk] != null ? mem(j.name).get(String(row[fk])) : null;
      if (!p) { row[j.name] = null; return; }
      if (!j.cols.length || j.cols.indexOf('*') >= 0) row[j.name] = clone(p);
      else { var o = {}; j.cols.forEach(function (c) { o[c] = p[c] === undefined ? null : p[c]; }); row[j.name] = o; }
    });
    return row;
  }
  function uniqueError(t, row, selfId, batch) {
    var rules = UNIQUE[t]; if (!rules) return null;
    for (var i = 0; i < rules.length; i++) {
      var cols = rules[i];
      if (cols.some(function (c) { return row[c] == null || row[c] === ''; })) continue;
      var same = function (o) { return String(o.id) !== String(selfId) && cols.every(function (c) { return String(o[c]) === String(row[c]); }); };
      var hit = false;
      mem(t).forEach(function (o) { if (!hit && same(o)) hit = true; });
      if (!hit && batch) hit = batch.some(same);
      if (hit) return err('duplicate key value violates unique constraint "' + t + '_' + cols.join('_') + '_key"', '23505');
    }
    return null;
  }

  function Query(t) {
    this.t = t; this.op = 'select'; this.sel = '*'; this.f = []; this.ord = []; this.rng = null;
    this.one = false; this.maybe = false; this.ret = false; this.vals = null; this.opts = {};
  }
  Query.prototype = {
    select: function (cols) { if (this.op === 'select') this.sel = cols || '*'; else this.ret = true; return this; },
    insert: function (v) { this.op = 'insert'; this.vals = v; return this; },
    update: function (v) { this.op = 'update'; this.vals = v; return this; },
    upsert: function (v, o) { this.op = 'upsert'; this.vals = v; this.opts = o || {}; return this; },
    delete: function () { this.op = 'delete'; return this; },
    eq: function (k, v) { this.f.push(function (r) { return r[k] != null && String(r[k]) === String(v); }); return this; },
    neq: function (k, v) { this.f.push(function (r) { return String(r[k]) !== String(v); }); return this; },
    gt: function (k, v) { this.f.push(function (r) { return r[k] != null && cmp(r[k], v) > 0; }); return this; },
    gte: function (k, v) { this.f.push(function (r) { return r[k] != null && cmp(r[k], v) >= 0; }); return this; },
    lt: function (k, v) { this.f.push(function (r) { return r[k] != null && cmp(r[k], v) < 0; }); return this; },
    lte: function (k, v) { this.f.push(function (r) { return r[k] != null && cmp(r[k], v) <= 0; }); return this; },
    in: function (k, arr) { var s = (arr || []).map(String); this.f.push(function (r) { return s.indexOf(String(r[k])) >= 0; }); return this; },
    is: function (k, v) { this.f.push(function (r) { return v === null ? r[k] == null : r[k] === v; }); return this; },
    ilike: function (k, p) {
      var re = new RegExp('^' + String(p).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*').replace(/_/g, '.') + '$', 'i');
      this.f.push(function (r) { return re.test(String(r[k] == null ? '' : r[k])); }); return this;
    },
    order: function (k, o) { this.ord.push({ k: k, asc: !(o && o.ascending === false) }); return this; },
    range: function (a, b) { this.rng = [a, b]; return this; },
    limit: function (n) { this.rng = [0, n - 1]; return this; },
    single: function () { this.one = true; return this; },
    maybeSingle: function () { this.one = true; this.maybe = true; return this; },
    then: function (res, rej) { var self = this; return ready.then(function () { return run(self); }).then(res, rej); },
    catch: function (rej) { return this.then(null, rej); }
  };

  function matches(q) { var out = []; mem(q.t).forEach(function (r) { if (q.f.every(function (f) { return f(r); })) out.push(r); }); return out; }

  function finish(q, rows) {
    var joins = parseJoins(q.sel);
    var data = rows.map(function (r) { return withJoins(q.t, clone(r), joins); });
    if (q.one) {
      if (data.length === 1) return { data: data[0], error: null };
      if (!data.length && q.maybe) return { data: null, error: null };
      return { data: null, error: err('JSON object requested, multiple (or no) rows returned', 'PGRST116') };
    }
    return { data: data, error: null };
  }

  async function run(q) {
    var t = q.t, M = mem(t);
    if (q.op === 'select') {
      var rows = matches(q);
      if (q.ord.length) rows.sort(function (a, b) {
        for (var i = 0; i < q.ord.length; i++) { var o = q.ord[i], c = cmp(a[o.k], b[o.k]); if (c) return o.asc ? c : -c; }
        return 0;
      });
      if (q.rng) rows = rows.slice(q.rng[0], q.rng[1] + 1);
      return finish(q, rows);
    }

    var puts = [], dels = [], out = [];
    if (q.op === 'insert' || q.op === 'upsert') {
      var list = Array.isArray(q.vals) ? q.vals : [q.vals];
      var conflict = (q.op === 'upsert' ? (q.opts.onConflict || 'id') : 'id').split(',').map(function (s) { return s.trim(); });
      var batch = [];
      for (var i = 0; i < list.length; i++) {
        var v = clone(list[i]) || {}, existing = null;
        if (q.op === 'upsert' && conflict.every(function (c) { return v[c] != null; })) {
          M.forEach(function (o) { if (!existing && conflict.every(function (c) { return String(o[c]) === String(v[c]); })) existing = o; });
        }
        var row;
        if (existing) row = Object.assign({}, existing, v, { id: existing.id, updated_at: now() });
        else {
          if (q.op === 'insert' && v.id != null && M.has(String(v.id))) return { data: null, error: err('duplicate key value violates unique constraint "' + t + '_pkey"', '23505') };
          row = Object.assign({}, DEFAULTS[t] || {}, { created_at: now(), updated_at: now() }, v);
          if (row.id == null) row.id = uuid();
        }
        var ue = uniqueError(t, row, row.id, batch);
        if (ue) return { data: null, error: ue };
        batch.push(row);
      }
      batch.forEach(function (row) { M.set(String(row.id), row); puts.push([t, row]); queue('upsert', t, row.id); out.push(row); });
    } else if (q.op === 'update') {
      var targets = matches(q);
      for (var j = 0; j < targets.length; j++) {
        var nr = Object.assign({}, targets[j], clone(q.vals), { id: targets[j].id, updated_at: now() });
        var ue2 = uniqueError(t, nr, nr.id);
        if (ue2) return { data: null, error: ue2 };
        out.push(nr);
      }
      out.forEach(function (row) { M.set(String(row.id), row); puts.push([t, row]); queue('upsert', t, row.id); });
    } else if (q.op === 'delete') {
      matches(q).forEach(function (row) { removeRow(t, row.id, puts, dels, true); out.push(row); });
    }
    await persist(puts, dels);
    changed();
    status();
    scheduleFlush();
    return (q.ret || q.op === 'delete') ? finish(q, out) : { data: null, error: null };
  }

  // Supprime une ligne + cascade locale (Supabase fait lui-même sa cascade)
  function removeRow(t, id, puts, dels, enqueue) {
    var M = mem(t); id = String(id);
    if (!M.has(id)) return;
    M.delete(id); dels.push([t, id]);
    if (enqueue) queue('delete', t, id);
    CASCADE.forEach(function (c) {
      if (c[0] !== t) return;
      mem(c[1]).forEach(function (child) {
        if (String(child[c[2]]) !== id) return;
        if (c[3] === 'cascade') removeRow(c[1], child.id, puts, dels, false);
        else { child[c[2]] = null; puts.push([c[1], child]); }
      });
    });
  }

  /* ---------- File d'attente des changements ---------- */
  function queue(op, t, id) {
    id = String(id);
    if (op === 'upsert') {
      if (OUTBOX.some(function (o) { return o.op === 'upsert' && o.t === t && o.id === id; })) return;   // déjà en attente : la version la plus récente partira
    } else {
      // la ligne est supprimée : inutile d'envoyer ses anciennes modifications
      OUTBOX = OUTBOX.filter(function (o) { return !(o.t === t && o.id === id); });
    }
    OUTBOX.push({ op: op, t: t, id: id });
  }
  var flushTimer = null;
  function scheduleFlush() { clearTimeout(flushTimer); flushTimer = setTimeout(function () { sync(false); }, 1500); }

  // Envoie les changements locaux à Supabase
  async function flush() {
    if (!remote || flushing || !OUTBOX.length) return;
    if (!navigator.onLine) { lastError = ''; return; }
    flushing = true; status();
    var blocked = {}, stop = false;
    try {
      var i = 0;
      while (i < OUTBOX.length && !stop) {
        var op = OUTBOX[i];
        if (blocked[op.t]) { i++; continue; }
        // regroupe les envois consécutifs du même type sur la même table (jusqu'à 200)
        var group = [op], k = i + 1;
        if (!op.solo) while (k < OUTBOX.length && group.length < 200 && OUTBOX[k].t === op.t && OUTBOX[k].op === op.op) group.push(OUTBOX[k++]);
        var r;
        try {
          if (op.op === 'upsert') {
            var rows = group.map(function (g) { return mem(g.t).get(g.id); }).filter(Boolean);
            r = rows.length ? await remote.from(op.t).upsert(rows, { onConflict: CONFLICT[op.t] || 'id' }) : { error: null };
          } else {
            r = await remote.from(op.t).delete().in('id', group.map(function (g) { return g.id; }));
          }
        } catch (e) { r = { error: { message: String(e && e.message || e) } }; }

        if (r.error) {
          if (isNetworkError(r.error)) { lastError = 'Connexion impossible'; stop = true; break; }
          if (isMissingTable(r.error)) {
            blocked[op.t] = true;
            lastError = 'Table « ' + op.t + ' » absente de Supabase : exécutez le fichier supabase/*.sql correspondant.';
            i++; continue;
          }
          if (group.length > 1) {
            // un élément du groupe pose problème : on réessaie un par un
            var single = group.map(function (g) { return { op: g.op, t: g.t, id: g.id, solo: true }; });
            OUTBOX.splice.apply(OUTBOX, [i, group.length].concat(single));
            continue;
          }
          // la ligne refusée est gardée ici (avec son contenu) pour ne rien perdre
          REJECTED.push({ op: op.op, t: op.t, id: op.id, row: clone(mem(op.t).get(op.id)) || null, error: r.error.message, date: now() });
          console.warn('Maria Bag — changement refusé par Supabase', REJECTED[REJECTED.length - 1]);
          lastError = 'Refusé par Supabase (' + op.t + ') : ' + r.error.message;
          OUTBOX.splice(i, 1);
        } else {
          OUTBOX.splice(i, group.length);
          META.lastPush = Date.now();
        }
        await persist([], []);
      }
      if (!stop && !Object.keys(blocked).length) lastError = '';
    } finally { flushing = false; status(); }
  }

  // Récupère toutes les données de Supabase (les autres appareils)
  async function pull(first) {
    if (!remote || pulling || !navigator.onLine) return false;
    pulling = true; status();
    var changedAny = false;
    try {
      for (var ti = 0; ti < TABLES.length; ti++) {
        var t = TABLES[ti], all = [], from = 0, failed = false;
        for (;;) {
          var r;
          try { r = await remote.from(t).select('*').range(from, from + PAGE - 1); }
          catch (e) { r = { error: { message: String(e && e.message || e) } }; }
          if (r.error) {
            if (isNetworkError(r.error)) { lastError = 'Connexion impossible'; return changedAny; }
            failed = true; break;                     // table absente : on garde les données locales
          }
          all = all.concat(r.data || []);
          if (!r.data || r.data.length < PAGE) break;
          from += PAGE;
        }
        if (failed) continue;
        // lignes modifiées sur ce PC pendant le téléchargement : la version locale est gardée
        var pending = {};
        OUTBOX.forEach(function (o) { if (o.t === t) pending[o.id] = o.op; });
        var M = mem(t), seen = {}, puts = [], dels = [];
        all.forEach(function (row) {
          var id = String(row.id); seen[id] = 1;
          if (pending[id]) return;
          var old = M.get(id);
          if (old && JSON.stringify(old) === JSON.stringify(row)) return;
          if (!old || !sameRow(old, row)) changedAny = true;      // vrai changement (autre appareil) : écrans à rafraîchir
          M.set(id, row); puts.push([t, row]);                     // sinon : simple mise au format de Supabase
        });
        M.forEach(function (row, id) { if (!seen[id] && !pending[id]) { M.delete(id); dels.push([t, id]); changedAny = true; } });
        if (puts.length || dels.length) await persist(puts, dels);
      }
      META.lastPull = Date.now();
      await persist([], []);
      if (!first && changedAny) refreshScreens();
      return changedAny;
    } finally { pulling = false; status(); }
  }

  var syncing = null;
  function sync(withPull) {
    if (!remote) { status(); return Promise.resolve(); }
    if (syncing) return syncing;
    syncing = (async function () {
      try {
        await ready;
        await flush();
        if (withPull && !OUTBOX.length) await pull(false);
      } catch (e) { console.error(e); }
      finally { syncing = null; status(); }
    })();
    return syncing;
  }

  /* ---------- Réaffichage après réception de nouvelles données ---------- */
  var refreshTimer = null;
  function refreshScreens() {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(function () {
      var app = document.getElementById('app');
      if (!app || app.classList.contains('hide')) return;
      if (document.querySelector('#m.on, #m.show, #bkBg')) return;     // fenêtre ouverte : pas de rechargement sous les doigts
      ['loadContacts', 'loadAteliers', 'loadProductions', 'loadCommandes', 'loadEmployes', 'loadCharges', 'loadProduction', 'loadProduits', 'loadStock', 'loadPF']
        .forEach(function (f) { try { if (typeof window[f] === 'function') window[f](); } catch (e) {} });
    }, 300);
  }
  var listeners = [];
  function changed() { listeners.forEach(function (f) { try { f(); } catch (e) {} }); }

  /* ---------- Indicateur dans l'en-tête ---------- */
  function say(t) { try { if (typeof toast === 'function') return toast(t); } catch (e) {} }
  function status() {
    if (typeof setSync !== 'function') return;
    var n = OUTBOX.length, txt = document.getElementById('sync');
    var title = 'Données enregistrées sur cet ordinateur.';
    if (!remote) { setSync('ok', 'Enregistré sur ce PC'); }
    else if (!navigator.onLine) { setSync('warn', 'Hors ligne' + (n ? ' · ' + n + ' en attente' : '')); title += ' Pas d’internet : les changements seront envoyés à la base en ligne au retour de la connexion.'; }
    else if (flushing || pulling) { setSync('warn', 'Synchronisation…'); }
    else if (lastError) { setSync('err', n ? n + ' non envoyé' + (n > 1 ? 's' : '') : 'À vérifier'); title += ' ' + lastError; }
    else if (n) { setSync('warn', n + ' en attente'); }
    else { setSync('ok', 'Synchronisé'); title += ' Copie en ligne à jour' + (META.lastPull ? ' (' + new Date(META.lastPull).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) + ')' : '') + '.'; }
    if (REJECTED.length) title += ' ' + REJECTED.length + ' changement(s) refusé(s) par Supabase — voir la console.';
    if (txt) txt.title = title + ' Cliquez pour synchroniser maintenant.';
  }

  /* ---------- Client exposé à l'application ---------- */
  function createClient(url, key) {
    try {
      if (url && key && window.supabase && window.supabase.createClient) remote = window.supabase.createClient(url, key);
    } catch (e) { remote = null; }
    return { from: function (t) { return new Query(t); } };
  }

  window.LocalDB = {
    createClient: createClient,
    ready: ready,
    tables: TABLES,
    sync: function () { return sync(true); },
    status: status,
    pending: function () { return OUTBOX.length; },
    rejected: function () { return REJECTED.slice(); },
    onChange: function (f) { listeners.push(f); },
    // Toutes les données locales (pour la sauvegarde sur disque)
    snapshot: function () {
      return ready.then(function () {
        var tables = {}, counts = {};
        TABLES.forEach(function (t) { tables[t] = Array.from(mem(t).values()).map(clone); counts[t] = tables[t].length; });
        return { tables: tables, counts: counts };
      });
    }
  };

  /* ---------- Synchronisation automatique ---------- */
  window.addEventListener('online', function () { status(); sync(true); });
  window.addEventListener('offline', status);
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') sync(true); });
  setInterval(function () { if (document.visibilityState === 'visible') sync(true); }, SYNC_EVERY_MS);
  document.addEventListener('DOMContentLoaded', function () {
    var s = document.getElementById('sync');
    if (s) { s.style.cursor = 'pointer'; s.addEventListener('click', function () { sync(true).then(function () { say(OUTBOX.length ? 'Synchronisation incomplète : ' + (lastError || 'réessai automatique') : 'Données synchronisées.'); }); }); }
  });
  ready.then(function () { status(); setTimeout(function () { sync(true); }, 2500); });
})();
