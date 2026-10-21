// Sauvegarde complète des tables Supabase vers un fichier JSON (même format que la sauvegarde manuelle de l'application).
// Variables : SUPABASE_URL, SUPABASE_KEY (clé « service_role » recommandée : elle fonctionne aussi une fois la sécurité activée).
import { writeFileSync, mkdirSync } from 'node:fs';

const TABLES = ['contacts', 'ateliers', 'employes', 'modeles', 'stock_articles', 'composants', 'productions', 'commandes',
  'acomptes', 'pointages', 'charges', 'produits', 'produit_lignes', 'stock_mouvements', 'charges_fixes', 'pf_mouvements',
  'inventaires', 'inventaire_lignes', 'documents', 'document_lignes', 'paiements', 'parametres', 'remises_hs'];
const PAGE = 1000;
const url = (process.env.SUPABASE_URL || '').replace(/\/+$/, ''), key = process.env.SUPABASE_KEY;
if (!url || !key) { console.error('SUPABASE_URL et SUPABASE_KEY sont requis (secrets du dépôt GitHub).'); process.exit(1); }
const H = { apikey: key, Authorization: 'Bearer ' + key };

async function lire(t) {
  const out = [];
  for (let from = 0; ; from += PAGE) {
    const r = await fetch(`${url}/rest/v1/${t}?select=*&order=id.asc`, { headers: { ...H, Range: `${from}-${from + PAGE - 1}` } });
    if (!r.ok) throw new Error(`${t} : HTTP ${r.status} ${await r.text()}`);
    const rows = await r.json(); out.push(...rows);
    if (rows.length < PAGE) return out;
  }
}

const tables = {}, counts = {}, erreurs = [];
for (const t of TABLES) {
  try { tables[t] = await lire(t); counts[t] = tables[t].length; console.log(t.padEnd(20), counts[t]); }
  catch (e) { erreurs.push(e.message); console.error('ERREUR', e.message); }
}
if (erreurs.length) { console.error('Sauvegarde incomplète : ' + erreurs.length + ' table(s) en erreur.'); process.exit(1); }
const total = Object.values(counts).reduce((a, b) => a + b, 0);
if (!total) { console.error('Aucune donnée lue : sauvegarde annulée (clé invalide ou base vide).'); process.exit(1); }

const d = new Date().toISOString().slice(0, 10);
mkdirSync('sauvegarde', { recursive: true });
writeFileSync(`sauvegarde/MariaBag_sauvegarde_${d}.json`, JSON.stringify({ app: 'mariabag', version: 1, date: new Date().toISOString(), counts, tables }));
console.log('OK :', total, 'lignes,', TABLES.length, 'tables');
