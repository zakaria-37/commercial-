/* ============================================================
   MARIA BAG — logiciel de bureau (Windows)
   - L'application est embarquée dans le logiciel : elle s'ouvre et fonctionne SANS Internet.
   - Les données sont enregistrées sur ce PC (dossier du logiciel dans AppData) ;
     quand Internet est disponible, elles se synchronisent avec la base en ligne
     (téléphone, tablette et autres PC voient les mêmes données).
   - MISE À JOUR AUTOMATIQUE : dès qu'Internet est disponible, le logiciel télécharge la dernière
     version de l'application depuis le site en ligne, la garde sur le PC et l'utilise au démarrage
     suivant (ou tout de suite si on accepte de redémarrer). Aucune réinstallation nécessaire.
   ============================================================ */
const { app, BrowserWindow, Menu, protocol, net, shell, dialog } = require('electron');
const path = require('path'), fs = require('fs'), { pathToFileURL } = require('url');

const APP_DIR = path.join(__dirname, 'app');
const SITE = process.env.MARIABAG_SITE || 'https://commercial-tf07.onrender.com';
let win = null, splash = null;

// Un seul MARIA BAG ouvert à la fois : un 2e double-clic ramène la fenêtre existante
if (!app.requestSingleInstanceLock()) { app.quit(); }
app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });

// Origine fixe « app://mariabag » : les données locales (IndexedDB, réglages) restent au même endroit d'une version à l'autre
protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } }]);

const versionDe = dir => { try { return (fs.readFileSync(path.join(dir, 'sw.js'), 'utf8').match(/CACHE_VERSION = '([^']+)'/) || [])[1] || ''; } catch (e) { return ''; } };
const numero = v => Number(String(v).replace(/\D/g, '')) || 0;

/* Version utilisée : celle téléchargée automatiquement si elle est plus récente que celle livrée avec l'installateur */
const MAJ_DIR = () => path.join(app.getPath('userData'), 'mises-a-jour');
let RACINE = APP_DIR;
function choisirRacine() {
  try {
    const dossier = fs.readFileSync(path.join(MAJ_DIR(), 'actuelle.txt'), 'utf8').trim(), d = path.join(MAJ_DIR(), dossier);
    if (dossier && fs.existsSync(path.join(d, 'index.html')) && numero(versionDe(d)) > numero(versionDe(APP_DIR))) RACINE = d;
  } catch (e) { /* aucune mise à jour téléchargée */ }
}
const versionLocale = () => versionDe(RACINE);

/* Taille et position de la fenêtre gardées d'une ouverture à l'autre */
const ETAT = () => path.join(app.getPath('userData'), 'fenetre.json');
function lireEtat() { try { return JSON.parse(fs.readFileSync(ETAT(), 'utf8')); } catch (e) { return { width: 1366, height: 860, max: true }; } }
function garderEtat() { try { if (!win) return; const b = win.getNormalBounds(); fs.writeFileSync(ETAT(), JSON.stringify({ ...b, max: win.isMaximized() })); } catch (e) {} }

/* Animation d'ouverture : logo MARIA BAG en 3D (5 s, un clic pour passer) */
function creerSplash() {
  splash = new BrowserWindow({ width: 800, height: 450, frame: false, resizable: false, movable: false, center: true, skipTaskbar: false, alwaysOnTop: true, show: false,
    backgroundColor: '#ececec', title: 'MARIA BAG', icon: path.join(__dirname, 'build', 'icon.png'), webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true } });
  splash.once('ready-to-show', () => splash.show());
  splash.loadFile(path.join(__dirname, 'splash', 'splash.html'));
}

function creerFenetre() {
  const e = lireEtat();
  win = new BrowserWindow({
    x: e.x, y: e.y, width: e.width || 1366, height: e.height || 860, minWidth: 360, minHeight: 500,
    title: 'MARIA BAG', icon: path.join(__dirname, 'build', 'icon.png'), backgroundColor: '#000000', show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: true }
  });
  // la fenêtre principale se charge derrière l'animation d'ouverture, puis s'affiche à la fin de celle-ci
  let pret = false, animFinie = !splash;
  const montrer = () => { if (!pret || !animFinie || win.isVisible()) return; if (e.max) win.maximize(); win.show(); if (splash && !splash.isDestroyed()) splash.close(); splash = null; };
  win.once('ready-to-show', () => { pret = true; montrer(); });
  if (splash) splash.webContents.on('did-navigate-in-page', (ev, url) => { if (url.endsWith('#fin')) { animFinie = true; montrer(); } });
  if (splash) splash.on('closed', () => { if (!animFinie) { animFinie = true; montrer(); } });
  win.on('close', garderEtat);
  win.webContents.session.setSpellCheckerLanguages(['fr']);
  // Liens externes (WhatsApp, e-mail, téléphone, sites) : ouverts dans le navigateur ou l'application du PC
  win.webContents.setWindowOpenHandler(({ url }) => { if (!url.startsWith('app://')) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (ev, url) => { if (!url.startsWith('app://')) { ev.preventDefault(); shell.openExternal(url); } });
  win.loadURL('app://mariabag/index.html');
}

/* Mise à jour automatique : télécharge tous les fichiers de la nouvelle version, puis l'active.
   Si un seul fichier échoue, rien n'est changé (la version actuelle reste utilisée). */
let majEnCours = false, majPrete = '';
async function texte(url) { const r = await net.fetch(url, { cache: 'no-store' }); if (!r.ok) throw new Error(url + ' : ' + r.status); return r; }
function journal(t) { try { fs.mkdirSync(MAJ_DIR(), { recursive: true }); fs.appendFileSync(path.join(MAJ_DIR(), 'journal.txt'), new Date().toLocaleString('fr-FR') + ' — ' + t + '\n'); } catch (e) {} }
async function verifierMiseAJour(manuel) {
  if (majEnCours) return; majEnCours = true;
  const loc = majPrete || versionLocale();
  try {
    const sw = await (await texte(SITE + '/sw.js?t=' + Date.now())).text();
    const enLigne = (sw.match(/CACHE_VERSION = '([^']+)'/) || [])[1];
    if (!enLigne || numero(enLigne) <= numero(loc)) {
      journal('à jour (' + loc + ', en ligne : ' + enLigne + ')');
      if (manuel) dialog.showMessageBox(win, { type: 'info', title: 'MARIA BAG', message: 'Vous avez la dernière version (' + loc.replace('mariabag-', '') + ').' });
      return;
    }
    // liste des fichiers : ceux du service worker + tous ceux cités par index.html
    const index = await (await texte(SITE + '/index.html?t=' + Date.now())).text();
    if (!/MARIA BAG/i.test(index)) throw new Error('index.html inattendu');
    const fichiers = new Set(['index.html', 'sw.js']);
    (sw.match(/'\.\/[^']+'/g) || []).forEach(x => { const f = x.slice(3, -1); if (f) fichiers.add(f); });
    (index.match(/(?:src|href)="([^"#?:]+)"/g) || []).forEach(x => { const f = x.replace(/^(src|href)="/, '').replace(/"$/, '').replace(/^\.\//, ''); if (f && !f.startsWith('data') && !f.startsWith('//')) fichiers.add(f); });
    // dossier neuf pour chaque téléchargement (pas de renommage : l'antivirus de Windows bloque souvent les fichiers qui viennent d'être écrits)
    const nom = enLigne + '-' + Date.now(), tmp = path.join(MAJ_DIR(), nom);
    for (const f of fichiers) {
      const c = path.normalize(path.join(tmp, f)); if (!c.startsWith(tmp)) continue;
      const buf = f === 'index.html' ? Buffer.from(index) : f === 'sw.js' ? Buffer.from(sw) : Buffer.from(await (await texte(SITE + '/' + f + '?v=' + enLigne)).arrayBuffer());
      fs.mkdirSync(path.dirname(c), { recursive: true }); fs.writeFileSync(c, buf);
    }
    if (versionDe(tmp) !== enLigne) throw new Error('fichiers téléchargés incomplets');
    fs.writeFileSync(path.join(MAJ_DIR(), 'actuelle.txt'), nom);
    journal('mise à jour ' + enLigne + ' téléchargée (' + fichiers.size + ' fichiers)');
    // on garde seulement la version utilisée et la nouvelle
    for (const d of fs.readdirSync(MAJ_DIR())) if (d !== nom && d !== path.basename(RACINE) && !d.endsWith('.txt')) { try { fs.rmSync(path.join(MAJ_DIR(), d), { recursive: true, force: true }); } catch (e) { /* fichier bloqué : supprimé une autre fois */ } }
    majPrete = enLigne;
    const c = await dialog.showMessageBox(win, { type: 'info', title: 'Mise à jour installée', buttons: ['Redémarrer maintenant', 'Au prochain démarrage'], defaultId: 0, cancelId: 1,
      message: 'La nouvelle version de MARIA BAG (' + enLigne.replace('mariabag-', '') + ') est installée.', detail: 'Elle a été téléchargée automatiquement. Vos données sont conservées.' });
    if (c.response === 0) { app.relaunch(); app.exit(0); }
  } catch (e) {
    journal('échec : ' + (e && e.message));
    if (manuel) dialog.showMessageBox(win, { type: 'warning', title: 'MARIA BAG', message: 'La mise à jour n’a pas pu se faire.', detail: 'Raison : ' + (e && e.message) + '\n\nLe logiciel fonctionne normalement et réessaiera tout seul (au démarrage puis toutes les 30 minutes).' });
  } finally { majEnCours = false; }
}

function menu() {
  const tpl = [
    { label: 'Fichier', submenu: [
      { label: 'Actualiser', accelerator: 'F5', click: () => win && win.reload() },
      { label: 'Ouvrir le dossier des données', click: () => shell.openPath(app.getPath('userData')) },
      { type: 'separator' },
      { label: 'Quitter', accelerator: 'Alt+F4', role: 'quit' }
    ] },
    { label: 'Édition', submenu: [
      { label: 'Annuler', role: 'undo' }, { label: 'Rétablir', role: 'redo' }, { type: 'separator' },
      { label: 'Couper', role: 'cut' }, { label: 'Copier', role: 'copy' }, { label: 'Coller', role: 'paste' }, { label: 'Tout sélectionner', role: 'selectAll' }
    ] },
    { label: 'Affichage', submenu: [
      { label: 'Zoom avant', role: 'zoomIn', accelerator: 'CmdOrCtrl+=' }, { label: 'Zoom arrière', role: 'zoomOut' }, { label: 'Taille normale', role: 'resetZoom' },
      { type: 'separator' }, { label: 'Plein écran', role: 'togglefullscreen' }
    ] },
    { label: 'Aide', submenu: [
      { label: 'Rechercher une mise à jour', click: () => verifierMiseAJour(true) },
      { label: 'Journal des mises à jour', click: () => { journal('journal ouvert'); shell.openPath(path.join(MAJ_DIR(), 'journal.txt')); } },
      { label: 'Ouvrir la version en ligne', click: () => shell.openExternal(SITE) },
      { type: 'separator' },
      { label: 'Outils de diagnostic', accelerator: 'Ctrl+Shift+I', click: () => win && win.webContents.toggleDevTools() },
      { label: 'À propos de MARIA BAG', click: () => dialog.showMessageBox(win, { type: 'info', title: 'À propos', icon: path.join(__dirname, 'build', 'icon.png'),
        message: 'MARIA BAG — Logiciel de gestion', detail: 'Version ' + app.getVersion() + ' (application ' + versionLocale() + ')\nDéveloppé par l’ingénieur Benouadah Zakaria.\n\nFonctionne sans Internet ; synchronisation automatique dès que la connexion revient.\nDonnées de ce PC : ' + app.getPath('userData') }) }
    ] }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(tpl));
}

app.whenReady().then(() => {
  choisirRacine();
  protocol.handle('app', req => {
    const u = new URL(req.url);
    const rel = decodeURIComponent(u.pathname) === '/' ? '/index.html' : decodeURIComponent(u.pathname);
    let f = path.normalize(path.join(RACINE, rel));
    if (!f.startsWith(RACINE)) return new Response('Interdit', { status: 403 });
    if (!fs.existsSync(f)) f = path.normalize(path.join(APP_DIR, rel));     // fichier absent de la mise à jour : copie livrée avec le logiciel
    if (!f.startsWith(APP_DIR) && !f.startsWith(RACINE)) return new Response('Interdit', { status: 403 });
    return net.fetch(pathToFileURL(f).toString());
  });
  app.setAppUserModelId('com.mariabag.erp');
  menu(); creerSplash(); creerFenetre();
  setTimeout(() => verifierMiseAJour(false), 8000);
  setInterval(() => verifierMiseAJour(false), 30 * 60 * 1000);     // puis toutes les 30 minutes
});
app.on('window-all-closed', () => app.quit());
