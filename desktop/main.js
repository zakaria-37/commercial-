/* ============================================================
   MARIA BAG — logiciel de bureau (Windows)
   - L'application est embarquée dans le logiciel : elle s'ouvre et fonctionne SANS Internet.
   - Les données sont enregistrées sur ce PC (dossier du logiciel dans AppData) ;
     quand Internet est disponible, elles se synchronisent avec la base en ligne
     (téléphone, tablette et autres PC voient les mêmes données).
   - Vérifie s'il existe une nouvelle version et propose de la télécharger.
   ============================================================ */
const { app, BrowserWindow, Menu, protocol, net, shell, dialog } = require('electron');
const path = require('path'), fs = require('fs'), { pathToFileURL } = require('url');

const APP_DIR = path.join(__dirname, 'app');
const SITE = 'https://commercial-tf07.onrender.com';
const TELECHARGEMENT = 'https://github.com/zakaria-37/commercial-/releases';
let win = null, splash = null;

// Un seul MARIA BAG ouvert à la fois : un 2e double-clic ramène la fenêtre existante
if (!app.requestSingleInstanceLock()) { app.quit(); }
app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });

// Origine fixe « app://mariabag » : les données locales (IndexedDB, réglages) restent au même endroit d'une version à l'autre
protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } }]);

const versionLocale = () => { try { return (fs.readFileSync(path.join(APP_DIR, 'sw.js'), 'utf8').match(/CACHE_VERSION = '([^']+)'/) || [])[1] || ''; } catch (e) { return ''; } };
const numero = v => Number(String(v).replace(/\D/g, '')) || 0;

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

/* Nouvelle version publiée en ligne ? (silencieux sans Internet) */
async function verifierMiseAJour(manuel) {
  const loc = versionLocale();
  try {
    const r = await net.fetch(SITE + '/sw.js?t=' + Date.now(), { cache: 'no-store' });
    const enLigne = ((await r.text()).match(/CACHE_VERSION = '([^']+)'/) || [])[1];
    const IGN = path.join(app.getPath('userData'), 'version-ignoree.txt');
    let ignoree = ''; try { ignoree = fs.readFileSync(IGN, 'utf8').trim(); } catch (e) {}
    if (enLigne && numero(enLigne) > numero(loc) && (manuel || enLigne !== ignoree)) {
      const c = await dialog.showMessageBox(win, { type: 'info', title: 'Mise à jour disponible', buttons: ['Télécharger', 'Plus tard', 'Ignorer cette version'], defaultId: 0, cancelId: 1,
        message: 'Une nouvelle version de MARIA BAG est disponible.', detail: 'Version installée : ' + loc + '\nNouvelle version : ' + enLigne + '\n\nInstallez le nouvel installateur par-dessus l’ancien : vos données sont conservées.' });
      if (c.response === 0) shell.openExternal(TELECHARGEMENT);
      if (c.response === 2) try { fs.writeFileSync(IGN, enLigne); } catch (e) {}
    } else if (manuel) dialog.showMessageBox(win, { type: 'info', title: 'MARIA BAG', message: 'Vous avez la dernière version (' + loc + ').' });
  } catch (e) {
    if (manuel) dialog.showMessageBox(win, { type: 'warning', title: 'MARIA BAG', message: 'Pas de connexion Internet : impossible de vérifier les mises à jour.', detail: 'Le logiciel fonctionne normalement hors ligne.' });
  }
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
  protocol.handle('app', req => {
    const u = new URL(req.url);
    let f = path.normalize(path.join(APP_DIR, decodeURIComponent(u.pathname)));
    if (!f.startsWith(APP_DIR)) return new Response('Interdit', { status: 403 });
    if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
    return net.fetch(pathToFileURL(f).toString());
  });
  app.setAppUserModelId('com.mariabag.erp');
  menu(); creerSplash(); creerFenetre();
  setTimeout(() => verifierMiseAJour(false), 8000);
});
app.on('window-all-closed', () => app.quit());
