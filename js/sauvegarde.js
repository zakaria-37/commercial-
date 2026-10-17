/* ============================================================
   MARIA BAG — Sauvegarde sur le disque de l'ordinateur
   - « Sauvegarder maintenant » : un fichier .json (toutes les données) + un classeur Excel
   - Dossier automatique (Chrome / Edge sur PC) : une copie par jour, sans rien faire,
     + le fichier « MariaBag_donnees_actuelles.json » réécrit après chaque changement
   - Les données sont lues dans la base locale du PC (js/local-db.js) :
     la sauvegarde marche aussi sans internet
   - « Restaurer » : recharge un fichier .json (n'efface rien, remet/ajoute les lignes)
   - Rappel si aucune sauvegarde depuis 7 jours
   ============================================================ */
(function () {
  'use strict';

  // Ordre important pour la restauration (les tables « parents » d'abord)
  var TABLES = ['contacts', 'ateliers', 'employes', 'modeles', 'stock_articles', 'composants',
                'productions', 'commandes', 'acomptes', 'pointages', 'charges',
                'produits', 'produit_lignes', 'stock_mouvements', 'charges_fixes'];
  var LAST_KEY = 'mariabag_last_backup';
  var KEEP_FILES = 30;                       // nombre de sauvegardes gardées dans le dossier
  var REMIND_DAYS = 7;
  var canFolder = 'showDirectoryPicker' in window;
  var LIVE_FILE = 'MariaBag_donnees_actuelles.json';   // toujours à jour, réécrit après chaque changement

  /* ---------- petits outils ---------- */
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function stamp(d) { d = d || new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function stampTime() { var d = new Date(); return stamp(d) + '_' + pad(d.getHours()) + 'h' + pad(d.getMinutes()); }
  function say(t) { try { if (typeof toast === 'function') return toast(t); } catch (e) {} alert(t); }
  function lastBackup() { try { return parseInt(localStorage.getItem(LAST_KEY) || '0', 10); } catch (e) { return 0; } }
  function setLast() { try { localStorage.setItem(LAST_KEY, String(Date.now())); } catch (e) {} }
  function fmt(ts) { if (!ts) return 'jamais'; var d = new Date(ts); return stamp(d) + ' à ' + pad(d.getHours()) + ':' + pad(d.getMinutes()); }

  // IndexedDB : mémorise le dossier choisi
  function idb(mode, fn) {
    return new Promise(function (res, rej) {
      var o = indexedDB.open('mariabag_backup', 1);
      o.onupgradeneeded = function () { o.result.createObjectStore('kv'); };
      o.onerror = function () { rej(o.error); };
      o.onsuccess = function () {
        var tx = o.result.transaction('kv', mode), st = tx.objectStore('kv'), r = fn(st);
        tx.oncomplete = function () { res(r && r.result); };
        tx.onerror = function () { rej(tx.error); };
      };
    });
  }
  function getHandle() {
    // délai maximum : si IndexedDB ne répond pas, on continue sans dossier mémorisé
    var t = new Promise(function (res) { setTimeout(function () { res(null); }, 1500); });
    var g = idb('readonly', function (s) { return s.get('dir'); }).catch(function () { return null; });
    return Promise.race([g, t]);
  }
  function setHandle(h) { return idb('readwrite', function (s) { return s.put(h, 'dir'); }); }
  function clearHandle() { return idb('readwrite', function (s) { return s.delete('dir'); }); }

  /* ---------- lecture de toute la base (par pages de 1000) ---------- */
  async function fetchAll(table) {
    var out = [], from = 0, size = 1000;
    for (;;) {
      var r = await sb.from(table).select('*').range(from, from + size - 1);
      if (r.error) {
        // table absente (module non installé) : on l'ignore, on ne bloque pas la sauvegarde
        if (/does not exist|schema cache|relation/i.test(r.error.message || '')) return null;
        throw new Error(table + ' : ' + r.error.message);
      }
      out = out.concat(r.data || []);
      if (!r.data || r.data.length < size) break;
      from += size;
    }
    return out;
  }
  async function snapshot() {
    if (window.LocalDB) {
      var loc = await LocalDB.snapshot();
      return { app: 'mariabag', version: 1, date: new Date().toISOString(), counts: loc.counts, tables: loc.tables };
    }
    var data = {}, counts = {};
    for (var i = 0; i < TABLES.length; i++) {
      var rows = await fetchAll(TABLES[i]);
      if (rows) { data[TABLES[i]] = rows; counts[TABLES[i]] = rows.length; }
    }
    return { app: 'mariabag', version: 1, date: new Date().toISOString(), counts: counts, tables: data };
  }

  /* ---------- téléchargement classique ---------- */
  function download(name, blob) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  }
  function jsonBlob(snap) { return new Blob([JSON.stringify(snap, null, 1)], { type: 'application/json' }); }

  async function backupNow(withExcel) {
    var snap = await snapshot();
    download('MariaBag_sauvegarde_' + stampTime() + '.json', jsonBlob(snap));
    if (withExcel && window.XLSX) {
      var wb = XLSX.utils.book_new();
      Object.keys(snap.tables).forEach(function (t) {
        var rows = snap.tables[t].map(function (r) {
          var o = {}; Object.keys(r).forEach(function (k) { o[k] = (r[k] !== null && typeof r[k] === 'object') ? JSON.stringify(r[k]) : r[k]; });
          return o;
        });
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), t.slice(0, 31));
      });
      XLSX.writeFile(wb, 'MariaBag_donnees_' + stampTime() + '.xlsx');
    }
    setLast();
    var n = Object.keys(snap.counts).reduce(function (s, k) { return s + snap.counts[k]; }, 0);
    return n;
  }

  /* ---------- dossier automatique ---------- */
  async function writeToFolder(dir) {
    var snap = await snapshot();
    var fh = await dir.getFileHandle('MariaBag_sauvegarde_' + stamp() + '.json', { create: true });
    var w = await fh.createWritable(); await w.write(jsonBlob(snap)); await w.close();
    // ne garder que les KEEP_FILES plus récentes
    var names = [];
    for await (var e of dir.values()) { if (e.kind === 'file' && /^MariaBag_sauvegarde_.*\.json$/.test(e.name)) names.push(e.name); }
    names.sort();
    while (names.length > KEEP_FILES) { try { await dir.removeEntry(names.shift()); } catch (x) { break; } }
    setLast();
    return snap;
  }
  async function perm(dir, ask) {
    var o = { mode: 'readwrite' };
    if ((await dir.queryPermission(o)) === 'granted') return true;
    return ask ? (await dir.requestPermission(o)) === 'granted' : false;
  }
  async function autoDaily() {
    if (!canFolder) return;
    var dir = await getHandle(); if (!dir) return;
    if (stamp(new Date(lastBackup())) === stamp() && lastBackup()) return;     // déjà fait aujourd'hui
    if (await perm(dir, false)) { try { await writeToFolder(dir); say('Sauvegarde automatique enregistrée sur le PC'); } catch (e) {} }
  }

  /* ---------- fichier toujours à jour (après chaque changement) ---------- */
  var liveTimer = null, liveBusy = false;
  async function writeLive() {
    if (!canFolder || liveBusy) return;
    var dir = await getHandle(); if (!dir || !(await perm(dir, false))) return;
    liveBusy = true;
    try {
      var snap = await snapshot();
      var fh = await dir.getFileHandle(LIVE_FILE, { create: true });
      var w = await fh.createWritable(); await w.write(jsonBlob(snap)); await w.close();
    } catch (e) { console.warn('Copie sur le disque impossible', e); }
    liveBusy = false;
  }
  if (window.LocalDB) LocalDB.onChange(function () { clearTimeout(liveTimer); liveTimer = setTimeout(writeLive, 8000); });

  /* ---------- restauration ---------- */
  async function restore(file) {
    var snap;
    try { snap = JSON.parse(await file.text()); } catch (e) { throw new Error('Fichier illisible (ce n\'est pas un .json valide)'); }
    if (!snap || snap.app !== 'mariabag' || !snap.tables) throw new Error('Ce fichier n\'est pas une sauvegarde Maria Bag');
    var total = 0;
    for (var i = 0; i < TABLES.length; i++) {
      var rows = snap.tables[TABLES[i]]; if (!rows || !rows.length) continue;
      for (var k = 0; k < rows.length; k += 200) {
        var r = await sb.from(TABLES[i]).upsert(rows.slice(k, k + 200), { onConflict: 'id' });
        if (r.error) throw new Error(TABLES[i] + ' : ' + r.error.message);
      }
      total += rows.length;
    }
    return total;
  }

  /* ---------- fenêtre ---------- */
  var css = '#bkBg{position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:300;display:flex;align-items:center;justify-content:center;padding:14px}' +
    '#bkBox{background:#fff;color:#111;border-radius:14px;max-width:520px;width:100%;max-height:92vh;overflow:auto;padding:20px 22px;font:14px/1.45 system-ui,sans-serif}' +
    '#bkBox h3{margin:0 0 4px;font-size:19px}#bkBox p{margin:6px 0;color:#555}' +
    '#bkBox .bk{display:block;width:100%;margin:10px 0 0;padding:11px;border-radius:10px;border:1px solid #000;background:#000;color:#fff;font-weight:700;font-size:14px;cursor:pointer}' +
    '#bkBox .bk.o{background:#fff;color:#000}#bkBox .bk:disabled{opacity:.5;cursor:wait}' +
    '#bkBox .st{background:#f5f1f2;border-radius:10px;padding:10px 12px;margin:12px 0}#bkMsg{margin-top:12px;font-weight:600}';
  var stEl = document.createElement('style'); stEl.textContent = css; document.head.appendChild(stEl);

  async function openBox() {
    if (document.getElementById('bkBg')) return;
    var dir = canFolder ? await getHandle() : null;
    var bg = document.createElement('div'); bg.id = 'bkBg';
    bg.innerHTML = '<div id="bkBox"><h3>Sauvegarde des données</h3>' +
      '<p>Vos données sont enregistrées <b>sur cet ordinateur</b> (l’application marche sans internet) et envoyées à la base en ligne dès que la connexion est là' +
      (window.LocalDB ? ' — <b>' + (LocalDB.pending() ? LocalDB.pending() + ' changement(s) en attente d’envoi' : 'tout est synchronisé') + '</b>' : '') + '.</p>' +
      '<p>Cette fenêtre en garde aussi une <b>copie en fichier</b> sur le disque, pour ne rien perdre même si le navigateur est réinstallé.</p>' +
      '<div class="st">Dernière sauvegarde : <b>' + fmt(lastBackup()) + '</b><br>' +
      (canFolder ? 'Dossier automatique : <b>' + (dir ? dir.name : 'non choisi') + '</b>' : 'Dossier automatique : indisponible (utilisez Chrome ou Edge sur PC)') + '</div>' +
      '<button class="bk" id="bkNow">Sauvegarder maintenant (JSON + Excel)</button>' +
      (canFolder ? '<button class="bk o" id="bkDir">' + (dir ? 'Changer le dossier automatique' : 'Choisir un dossier automatique (copie à chaque changement + 1 par jour)') + '</button>' : '') +
      '<button class="bk o" id="bkRes">Restaurer depuis un fichier .json</button>' +
      '<input type="file" id="bkFile" accept=".json,application/json" hidden>' +
      '<button class="bk o" id="bkClose">Fermer</button><div id="bkMsg"></div></div>';
    document.body.appendChild(bg);
    var $ = function (s) { return bg.querySelector(s); };
    var msg = function (t, err) { var m = $('#bkMsg'); m.textContent = t; m.style.color = err ? '#b00020' : '#1a7f37'; };
    var busy = function (b) { bg.querySelectorAll('.bk').forEach(function (x) { x.disabled = b; }); };
    var close = function () { bg.remove(); };
    $('#bkClose').onclick = close;
    bg.addEventListener('click', function (e) { if (e.target === bg) close(); });

    $('#bkNow').onclick = async function () {
      busy(true); msg('Sauvegarde en cours…');
      try {
        var n = await backupNow(true);
        var d = canFolder ? await getHandle() : null;
        if (d && await perm(d, true)) { await writeToFolder(d); await writeLive(); }
        msg('✔ ' + n + ' enregistrements sauvegardés. Fichiers dans votre dossier Téléchargements.');
      } catch (e) { msg('Échec : ' + e.message, true); }
      busy(false);
    };
    if (canFolder) $('#bkDir').onclick = async function () {
      try {
        var d = await window.showDirectoryPicker({ mode: 'readwrite', id: 'mariabag' });
        await setHandle(d); busy(true); msg('Première copie en cours…');
        await writeToFolder(d); await writeLive();
        msg('✔ Dossier « ' + d.name + ' » activé : le fichier ' + LIVE_FILE + ' est mis à jour après chaque changement, et une copie datée est faite chaque jour.');
        busy(false);
      } catch (e) { if (e.name !== 'AbortError') msg('Échec : ' + e.message, true); busy(false); }
    };
    $('#bkRes').onclick = function () { $('#bkFile').click(); };
    $('#bkFile').onchange = async function (ev) {
      var f = ev.target.files[0]; if (!f) return;
      if (!confirm('Restaurer « ' + f.name + ' » ?\n\nRien n\'est supprimé : les lignes du fichier sont ajoutées ou remplacent celles qui ont le même identifiant. Elles seront aussi envoyées à la base en ligne.')) return;
      busy(true); msg('Restauration en cours…');
      try {
        var n = await restore(f);
        if (window.LocalDB) LocalDB.sync();          // envoi en ligne en arrière-plan (la file est gardée sur le PC)
        msg('✔ ' + n + ' enregistrements restaurés. Rechargement…'); setTimeout(function () { location.reload(); }, 1500);
      }
      catch (e) { msg('Échec : ' + e.message, true); busy(false); }
    };
  }

  /* ---------- bouton dans l'en-tête ---------- */
  function addButton() {
    var out = document.getElementById('bLogout');
    if (!out || document.getElementById('bSave')) return;
    var b = document.createElement('button');
    b.className = 'btn'; b.id = 'bSave'; b.type = 'button'; b.textContent = 'Sauvegarde';
    b.title = 'Copie de sécurité sur le disque de l\'ordinateur';
    out.parentNode.insertBefore(b, out); b.onclick = openBox;
    var s = document.createElement('style'); s.textContent = '@media(max-width:700px){#bSave{display:none}}'; document.head.appendChild(s);
  }
  addButton();

  /* ---------- sauvegarde auto + rappel ---------- */
  setTimeout(async function () {
    var app = document.getElementById('app');
    if (!app || app.classList.contains('hide')) return;          // pas encore connecté
    try { await autoDaily(); } catch (e) {}
    var l = lastBackup();
    if (!l || Date.now() - l > REMIND_DAYS * 86400000) {
      if (window.innerWidth > 700) say('Pensez à sauvegarder vos données : bouton « Sauvegarde » en haut.');
    }
  }, 6000);
})();
