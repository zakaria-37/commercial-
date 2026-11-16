/* ============================================================
   BÉNÉFICES — onglet Commerce › Bénéfices (+ case « autres clients » des Meilleurs clients)
   Bénéfice d'une vente = (prix de vente − coût de revient) × pièces livrées − retours − remises des bons/factures
   (même calcul que « Bénéfice avec ce client » de la fiche). La paie des employés est déjà dans la main d'œuvre.
   • Bénéfice du magasin MARIA BAG : clients marqués « magasin » (ex. HANOUT BOUMATI CLIENT)
   • Bénéfice des autres clients
   • − charges variables de la période  =  BÉNÉFICE NET (aujourd'hui, ce mois, cette année, ou dates choisies)
   ============================================================ */
(function () {
  'use strict';
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = n => (Number(n) || 0).toLocaleString('fr-FR', { maximumFractionDigits: 0 }) + ' DA';
  const r2 = n => Math.round((Number(n) || 0) * 100) / 100;
  const iso = d => { const x = d || new Date(); return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0'); };
  const fd = s => s ? String(s).slice(0, 10).split('-').reverse().join('/') : '';
  const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  const say = t => { if (typeof toast === 'function') toast(t); };
  const contacts = () => (typeof D !== 'undefined' && Array.isArray(D)) ? D : [];
  const lbl = c => c ? ([c.prenom, c.nom].filter(Boolean).join(' ') || c.societe || '') : '';
  const PAIE = 'Paie des employés', CLE = 'clients_magasin';
  const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

  let per = 'mois', du = '', au = '', regler = false, IDS = null;

  /* ---------- Clients « magasin MARIA BAG » (réglage partagé : parametres.clients_magasin) ---------- */
  async function lireInternes() {
    try { const r = await sb.from('parametres').select('*').eq('cle', CLE); const v = r.data && r.data[0] && r.data[0].valeur; if (v && Array.isArray(v.ids)) { IDS = v.ids.map(String); return IDS; } } catch (e) {}
    IDS = null; return null;
  }
  function internes() {
    if (IDS) return new Set(IDS);
    return new Set(contacts().filter(c => /hanout/i.test(lbl(c) + ' ' + (c.societe || ''))).map(c => String(c.id)));   // par défaut : HANOUT BOUMATI CLIENT
  }
  async function enregistrerInternes(ids) {
    const r = await sb.from('parametres').upsert([{ cle: CLE, valeur: { ids } }], { onConflict: 'cle' });
    if (r.error) { say('Erreur : ' + r.error.message); return false; }
    IDS = ids.map(String); return true;
  }

  /* ---------- Calcul ---------- */
  function periode() {
    const t = iso(), y = t.slice(0, 4);
    if (per === 'jour') return [t, t, 'Aujourd’hui (' + fd(t) + ')'];
    if (per === 'tout') return ['0000-01-01', '9999-12-31', 'depuis le début'];
    if (per === 'annee') return [y + '-01-01', y + '-12-31', 'Année ' + y];
    if (per === 'perso') return [du || t.slice(0, 8) + '01', au || t, 'Du ' + fd(du || t.slice(0, 8) + '01') + ' au ' + fd(au || t)];
    return [t.slice(0, 8) + '01', t.slice(0, 8) + '31', MOIS[+t.slice(5, 7) - 1] + ' ' + y];
  }
  // bénéfice par client entre deux dates (incluses)
  function parClient(d1, d2) {
    if (!window.PFAPI) return [];
    const dans = s => { s = String(s || '').slice(0, 10); return s >= d1 && s <= d2; };
    const prods = new Map(PFAPI.produits().map(p => [String(p.id), p])), byNom = new Map(contacts().map(c => [norm(lbl(c)), c])), G = new Map();
    PFAPI.mouvements().forEach(m => {
      if ((m.type !== 'livraison' && m.type !== 'retour') || !dans(m.date_mvt)) return;
      const c = m.contact_id ? contacts().find(x => String(x.id) === String(m.contact_id)) : byNom.get(norm(m.client_nom));
      const key = c ? 'c:' + c.id : 'n:' + norm(m.client_nom || 'Client non indiqué');
      const g = G.get(key) || { id: c ? String(c.id) : null, nom: c ? lbl(c) : (m.client_nom || 'Client non indiqué'), pieces: 0, ca: 0, ben: 0, remises: 0, sansCout: 0, mois: {} };
      const p = prods.get(String(m.produit_id)), n = -(Number(m.quantite) || 0), pv = m.prix_vente != null ? Number(m.prix_vente) : (p ? Number(p.prix_vente) || 0 : 0), cu = p ? Number(PFAPI.coutProduit(p)) || 0 : 0;
      g.pieces += n; g.ca += pv * n;
      const b = cu > 0 ? (pv - cu) * n : 0; if (!(cu > 0) && n > 0) g.sansCout++;
      g.ben += b; const mo = String(m.date_mvt).slice(0, 7); g.mois[mo] = (g.mois[mo] || 0) + b;
      G.set(key, g);
    });
    // remises des bons de livraison / factures qui ont sorti des pièces du stock
    const mv = PFAPI.mouvements(), docs = window.CommerceAPI ? CommerceAPI.docs() : [];
    docs.forEach(d => {
      if (d.statut === 'annulee' || !['bon_livraison', 'facture'].includes(d.type) || !dans(d.date_doc) || !d.contact_id) return;
      const g = G.get('c:' + d.contact_id); if (!g) return;
      const mk = d.type === 'facture' ? 'Facture ' + d.numero : 'Bon de livraison ' + d.numero;
      if (!mv.some(m => String(m.note || '') === mk || String(m.note || '').startsWith(mk + ' '))) return;
      const rem = CommerceAPI.totaux(d, CommerceAPI.lignesDe(d.id)).remise || 0; if (!rem) return;
      g.remises += rem; g.ca -= rem; g.ben -= rem; const mo = String(d.date_doc).slice(0, 7); g.mois[mo] = (g.mois[mo] || 0) - rem;
    });
    const I = internes();
    return [...G.values()].map(g => Object.assign(g, { ca: r2(g.ca), ben: r2(g.ben), remises: r2(g.remises), interne: !!(g.id && I.has(g.id)) })).sort((a, b) => b.ben - a.ben);
  }
  async function chargesEntre(d1, d2) {
    const r = await sb.from('charges').select('*').gte('date_charge', d1).lte('date_charge', d2);
    if (r.error) return null;
    const L = (r.data || []).filter(c => c.categorie !== PAIE), mois = {};
    L.forEach(c => { const m = String(c.date_charge).slice(0, 7); mois[m] = (mois[m] || 0) + Number(c.montant || 0); });
    return { total: r2(L.reduce((s, c) => s + Number(c.montant || 0), 0)), nb: L.length, mois };
  }

  /* ---------- Onglet Commerce › Bénéfices ---------- */
  function html() { return '<div id="bn-root"><div class="card">Calcul des bénéfices…</div></div>'; }
  async function apres() {
    const el = document.getElementById('bn-root'); if (!el) return;
    // chargement une seule fois (sinon : rechargement de Commerce → nouvel affichage → rechargement… en boucle)
    if (!apres.charge) { apres.charge = true;
      try { if (window.PFAPI && !PFAPI.mouvements().length) await PFAPI.load(); } catch (e) {}
      try { if (window.CommerceAPI && !CommerceAPI.docs().length) { await CommerceAPI.load(true); return; } } catch (e) {} }   // load() réaffiche l'onglet, qui rappelle apres()
    if (IDS === null) await lireInternes();
    const [d1, d2, titre] = periode(), L = parClient(d1, d2), ch = await chargesEntre(d1, d2);
    if (!document.getElementById('bn-root')) return;
    const mag = L.filter(g => g.interne), aut = L.filter(g => !g.interne), s = (l, k) => r2(l.reduce((x, g) => x + g[k], 0));
    const bMag = s(mag, 'ben'), bAut = s(aut, 'ben'), bTot = r2(bMag + bAut), chg = ch ? ch.total : 0, net = r2(bTot - chg), sansCout = L.reduce((x, g) => x + g.sansCout, 0);
    const I = internes(), nomsMag = contacts().filter(c => I.has(String(c.id))).map(lbl);
    let h = '<div class="bn-bar">' + [['jour', 'Aujourd’hui'], ['mois', 'Ce mois'], ['annee', 'Cette année'], ['tout', 'Depuis le début'], ['perso', 'Choisir les dates']].map(x => '<button type="button" data-bnp="' + x[0] + '" class="' + (per === x[0] ? 'on' : '') + '">' + x[1] + '</button>').join('') + '</div>' +
      (per === 'perso' ? '<div class="bn-dates"><label>Du <input type="date" id="bn-du" value="' + esc(d1) + '"></label><label>Au <input type="date" id="bn-au" value="' + esc(d2) + '"></label></div>' : '') +
      '<h3 class="bn-titre">Bénéfice — ' + esc(titre) + '</h3>' +
      '<div class="ct-kpis bn-kpis">' +
        '<div class="ct-kpi"><span>🏬 Magasin MARIA BAG</span><b class="' + (bMag < 0 ? 'py-due' : 'py-av') + '">' + money(bMag) + '</b><small>' + (nomsMag.length ? esc(nomsMag.join(', ')) : 'aucun client magasin choisi') + ' · ventes ' + money(s(mag, 'ca')) + '</small></div>' +
        '<div class="ct-kpi"><span>👥 Autres clients</span><b class="' + (bAut < 0 ? 'py-due' : 'py-av') + '">' + money(bAut) + '</b><small>' + aut.length + ' client(s) · ventes ' + money(s(aut, 'ca')) + '</small></div>' +
        '<div class="ct-kpi"><span>Bénéfice des ventes</span><b>' + money(bTot) + '</b><small>magasin + autres clients' + (s(L, 'remises') ? ' · remises déduites ' + money(s(L, 'remises')) : '') + '</small></div>' +
        '<div class="ct-kpi"><span>− Charges</span><b class="py-due">' + (ch ? money(chg) : '—') + '</b><small>' + (ch ? ch.nb + ' charge(s) variable(s)' : 'charges indisponibles') + ' · paie déjà dans la main d’œuvre</small></div>' +
        '<div class="ct-kpi bn-net' + (net < 0 ? ' neg' : '') + '"><span>= BÉNÉFICE NET</span><b>' + money(net) + '</b><small>' + esc(titre) + '</small></div></div>' +
      (sansCout ? '<p class="mg-warn">⚠ ' + sansCout + ' vente(s) d’un produit sans coût de revient (section Produits) : leur bénéfice n’est pas compté.</p>' : '');
    // par mois (année ou période longue)
    const moisL = [...new Set(L.flatMap(g => Object.keys(g.mois)).concat(ch ? Object.keys(ch.mois) : []))].sort();
    if (moisL.length > 1) {
      h += '<div class="card"><h3 style="margin-top:0">Par mois</h3><div class="tw"><table class="ct-tbl"><thead><tr><th>Mois</th><th class="n">Magasin</th><th class="n">Autres clients</th><th class="n">− Charges</th><th class="n">Bénéfice net</th></tr></thead><tbody>' +
        moisL.map(m => { const a = r2(mag.reduce((x, g) => x + (g.mois[m] || 0), 0)), b = r2(aut.reduce((x, g) => x + (g.mois[m] || 0), 0)), c = r2(ch ? ch.mois[m] || 0 : 0), n = r2(a + b - c);
          return '<tr><td>' + MOIS[+m.slice(5, 7) - 1] + ' ' + m.slice(0, 4) + '</td><td class="n">' + money(a) + '</td><td class="n">' + money(b) + '</td><td class="n">' + money(c) + '</td><td class="n"><b class="' + (n < 0 ? 'py-due' : 'py-av') + '">' + money(n) + '</b></td></tr>'; }).join('') + '</tbody></table></div></div>';
    }
    // par client
    h += '<div class="card"><h3 style="margin-top:0">Par client — ' + esc(titre) + '</h3><p class="iv-help" style="margin-top:-6px">La fiche d’un client montre son bénéfice <b>depuis le début</b> : choisissez « Depuis le début » pour comparer.</p>' + (L.length ? '<div class="tw"><table class="ct-tbl"><thead><tr><th>Client</th><th class="n">Pièces</th><th class="n">Ventes</th><th class="n">Bénéfice (' + esc(titre) + ')</th></tr></thead><tbody>' +
      L.map(g => '<tr><td><b>' + esc(g.nom) + '</b>' + (g.interne ? ' <span class="ct-bdg b">🏬 magasin</span>' : '') + (g.remises ? '<small>remises ' + money(g.remises) + '</small>' : '') + '</td><td class="n">' + g.pieces.toLocaleString('fr-FR') + '</td><td class="n">' + money(g.ca) + '</td><td class="n"><b class="' + (g.ben < 0 ? 'py-due' : 'py-av') + '">' + money(g.ben) + '</b></td></tr>').join('') + '</tbody></table></div>' : '<p class="bs-vide">Aucune livraison sur cette période.</p>') + '</div>';
    // réglage : clients « magasin MARIA BAG »
    const cl = contacts().filter(c => /client/i.test(c.type || '') || I.has(String(c.id))).sort((a, b) => lbl(a).localeCompare(lbl(b), 'fr'));
    h += '<div class="card"><div class="at-actions" style="margin-top:0"><h3 style="margin:0;margin-right:auto">🏬 Clients du magasin MARIA BAG</h3><button type="button" class="btn s" data-bnreg="1">' + (regler ? 'Fermer' : 'Modifier') + '</button></div>' +
      (regler ? '<p class="iv-help">Cochez les clients qui sont vos propres magasins : leur bénéfice est compté à part.</p><div class="eq-chk">' + cl.map(c => '<label><input type="checkbox" data-bnc="' + esc(c.id) + '"' + (I.has(String(c.id)) ? ' checked' : '') + '> ' + esc(lbl(c)) + '</label>').join('') + '</div>'
        : '<p class="iv-help">' + (nomsMag.length ? esc(nomsMag.join(', ')) : 'Aucun') + '</p>') + '</div>';
    el.innerHTML = h;
  }

  document.addEventListener('click', async e => {
    const el = document.getElementById('bn-root'); if (!el || !el.contains(e.target)) return;
    const p = e.target.closest('[data-bnp]'); if (p) { per = p.dataset.bnp; apres(); return; }
    if (e.target.closest('[data-bnreg]')) { regler = !regler; apres(); return; }
  });
  document.addEventListener('change', async e => {
    const el = document.getElementById('bn-root'); if (!el || !el.contains(e.target)) return;
    if (e.target.id === 'bn-du') { du = e.target.value; apres(); return; }
    if (e.target.id === 'bn-au') { au = e.target.value; apres(); return; }
    if (e.target.dataset.bnc != null) {
      const ids = [...el.querySelectorAll('[data-bnc]:checked')].map(i => i.dataset.bnc);
      if (await enregistrerInternes(ids)) { say('Clients du magasin enregistrés.'); apres(); document.dispatchEvent(new Event('mariabag:benefices')); }
    }
  });
  document.addEventListener('mariabag:authenticated', () => { lireInternes(); });
  window.Benefices = { html, apres, parClient, internes, lireInternes };
})();
