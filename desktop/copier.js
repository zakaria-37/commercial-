/* Copie l'application web (index.html, css, js, lib, icônes) dans desktop/app : le logiciel l'embarque et fonctionne sans Internet. */
const fs = require('fs'), path = require('path');
const src = path.join(__dirname, '..'), dst = path.join(__dirname, 'app');
const ELEMENTS = ['index.html', 'manifest.webmanifest', 'sw.js', 'equipe.png', 'css', 'js', 'lib', 'icons'];
fs.rmSync(dst, { recursive: true, force: true });
fs.mkdirSync(dst, { recursive: true });
for (const e of ELEMENTS) {
  const s = path.join(src, e);
  if (fs.existsSync(s)) fs.cpSync(s, path.join(dst, e), { recursive: true });
}
fs.mkdirSync(path.join(__dirname, 'build'), { recursive: true });
fs.copyFileSync(path.join(src, 'icons', 'icon-512.png'), path.join(__dirname, 'build', 'icon.png'));
const v = (fs.readFileSync(path.join(src, 'sw.js'), 'utf8').match(/CACHE_VERSION = '([^']+)'/) || [])[1];
console.log('Application copiée (' + (v || 'version ?') + ')');
