/* ============================================================
   MARIA BAG — « Tout le stock » : l'écran simple
   Pensé pour la commerciale : peu de boutons, pas de vocabulaire technique.
     1) On ajoute les NOMS, un par un :
          • modèle fini (ce qu'on vend : sac à dos, cabas…)
          • élément de production (tissu Kawi, doublure, sangle, curseur…)
     2) On entre les QUANTITÉS : elles vont directement dans le bon stock
          (stock des modèles finis ou stock des éléments).
   Tout est relié aux autres sections sans qu'on ait à y aller :
     • Composition d'un modèle (éléments × quantité par pièce) = fiche matières
       (Production) + coût de revient (Produits), mis à jour ensemble.
     • Entrer des pièces fabriquées retire automatiquement les éléments utilisés.
     • Sortir des pièces = livraison à un client (commande mise à jour) ou perte.
   « Mode simple » masque les onglets Production et Produits (toujours
   accessibles depuis le Stock) ; « Mode complet » les réaffiche.
   Module isolé (IIFE) : aucun nom global, sauf les fonctions spXxx des boutons.
   ============================================================ */
(function () {
  'use strict';

  const $ = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const iso = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const num = (n, dec) => (Number(n) || 0).toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: dec == null ? 2 : dec });
  const money = n => (Number(n) || 0).toLocaleString('fr-FR', { maximumFractionDigits: 2 }) + ' DA';
  const norm = s => (window.StockAPI ? StockAPI.norm(s) : String(s || '').toLowerCase().trim());
  const say = m => { if (typeof toastS === 'function') toastS(m); else alert(m); };

  let filtre = 'all', cur = null, comp = null;
  const UNITES = ['m', 'cm', 'pcs', 'paire', 'kg', 'g', 'L', 'bobine'];

  /* ---------- Données (les deux stocks) ---------- */
  async function chargerTout() {
    try { await Promise.all([window.PFAPI ? PFAPI.load() : 0, window.StockAPI ? StockAPI.load() : 0]); } catch (e) { /* un des deux stocks absent */ }
    render();
  }
  function items() {
    const out = [];
    if (window.PFAPI) PFAPI.list().forEach(p => {
      const q = PFAPI.qty(p.id);
      out.push({ kind: 'pf', id: p.id, nom: p.nom, sub: 'Modèle fini' + (Number(p.prix_vente) > 0 ? ' · vente ' + money(p.prix_vente) : ''), q, etat: PFAPI.etat(p), main: num(q, 0) + ' pcs', sec: '', val: Math.max(0, q) * (Number(PFAPI.coutProduit(p)) || 0) });
    });
    if (window.StockAPI) StockAPI.list().forEach(a => {
      const q = StockAPI.qty(a.id), f = StockAPI.fmtQty(a, q);
      out.push({ kind: 'mat', id: a.id, nom: a.nom, sub: a.categorie, q, etat: StockAPI.etat(a), main: f.main, sec: f.sub, val: Math.max(0, q) * (Number(StockAPI.unitPrice(a)) || 0) });
    });
    return out.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'pf' ? -1 : 1) || (a.kind === 'mat' ? a.sub.localeCompare(b.sub, 'fr') : 0) || a.nom.localeCompare(b.nom, 'fr'));
  }

  /* ---------- Liste : une seule case (en-tête, chiffres clés, recherche, tableau) ---------- */
  const alerte = i => i.etat && (i.etat.c === 'r' || i.etat.c === 'o');
  function render() {
    ajusterBientot();
    const all = items(), q = norm($('#sp-q').value || '');
    const pf = all.filter(i => i.kind === 'pf'), mat = all.filter(i => i.kind === 'mat');
    const nAl = all.filter(alerte).length, nRup = all.filter(i => i.etat && i.etat.c === 'r').length;
    const vPf = pf.reduce((s, i) => s + i.val, 0), vMat = mat.reduce((s, i) => s + i.val, 0);
    const k = $('#sk-kpis');
    if (k) k.innerHTML =
      '<button type="button" class="sk-k" data-f="pf"><span>Modèles finis</span><b>' + num(pf.reduce((s, i) => s + Math.max(0, i.q), 0), 0) + ' pcs</b><small>' + pf.length + ' modèle(s) · ' + money(Math.round(vPf)) + '</small></button>' +
      '<button type="button" class="sk-k" data-f="mat"><span>Éléments de production</span><b>' + money(Math.round(vMat)) + '</b><small>' + mat.length + ' élément(s)</small></button>' +
      '<button type="button" class="sk-k sk-kr" data-f="alerte"><span>À surveiller</span><b>' + nAl + '</b><small>' + nRup + ' en rupture · ' + (nAl - nRup) + ' stock bas</small></button>' +
      '<div class="sk-k sk-kt"><span>Valeur totale du stock</span><b>' + money(Math.round(vPf + vMat)) + '</b><small>au coût de revient / prix d’achat</small></div>';
    $('#sp-chips').innerHTML =
      '<button type="button" class="chip' + (filtre === 'all' ? ' on' : '') + '" data-f="all">Tout <b>' + all.length + '</b></button>' +
      '<button type="button" class="chip' + (filtre === 'pf' ? ' on' : '') + '" data-f="pf">Modèles finis <b>' + pf.length + '</b></button>' +
      '<button type="button" class="chip' + (filtre === 'mat' ? ' on' : '') + '" data-f="mat">Éléments <b>' + mat.length + '</b></button>' +
      '<button type="button" class="chip sk-cal' + (filtre === 'alerte' ? ' on' : '') + '" data-f="alerte">⚠ À surveiller <b>' + nAl + '</b></button>';
    $$('#sk-kpis [data-f]').forEach(b => b.classList.toggle('on', b.dataset.f === filtre));
    $('#sp-empty').style.display = all.length ? 'none' : '';
    $('#sp-card').style.display = all.length ? '' : 'none';
    if (!all.length) {
      $('#sp-empty').innerHTML = '<div class="sk-vide"><h2>Commençons</h2><p>Ajoutez un premier <b>modèle fini</b> (ce que vous vendez) ou un premier <b>élément de production</b> (tissu, doublure, sangle…). Ensuite, entrez les quantités.</p>' +
        '<button class="btn p" type="button" onclick="spNouveau(\'pf\')">+ Nouveau modèle fini</button> <button class="btn p" type="button" onclick="spNouveau(\'mat\')">+ Nouvel élément</button></div>';
      return;
    }
    const list = all.filter(i => (filtre === 'all' || (filtre === 'alerte' ? alerte(i) : i.kind === filtre)) && (!q || norm(i.nom + ' ' + i.sub).includes(q)));
    let prevCat = null;
    $('#sp-tbody').innerHTML = list.length ? list.map((i, n) => {
      const cat = i.kind === 'pf' ? 'Modèles finis' : (i.sub || 'Autres');
      const sep = cat !== prevCat ? '<tr class="sk-sep"><td colspan="6">' + esc(cat) + '</td></tr>' : ''; prevCat = cat;
      return sep + '<tr class="sk-row' + (alerte(i) ? ' sk-al' : '') + '"><td class="sk-n">' + (n + 1) + '</td>' +
        '<td class="sk-nom"><i class="sk-ic">' + (i.kind === 'pf' ? '👜' : '🧵') + '</i><div><b>' + esc(i.nom) + '</b><small>' + esc(i.sub) + '</small></div></td>' +
        '<td class="sk-r sk-q' + (i.q < 0 ? ' sk-neg' : '') + '"><b>' + esc(i.main) + '</b>' + (i.sec ? '<small>' + esc(i.sec) + '</small>' : '') + '</td>' +
        '<td><span class="bd ' + i.etat.c + '">' + esc(i.etat.l) + '</span></td>' +
        '<td class="sk-r sk-v">' + (i.val > 0 ? money(Math.round(i.val)) : '<small>—</small>') + '</td>' +
        '<td class="sk-r sk-act"><button class="sk-a sk-in" type="button" title="Entrer en stock" onclick="spQ(\'' + i.kind + '\',\'' + esc(i.id) + '\',\'entree\')">＋ Entrer</button>' +
        '<button class="sk-a sk-out" type="button" title="Sortir du stock" onclick="spQ(\'' + i.kind + '\',\'' + esc(i.id) + '\',\'sortie\')">− Sortir</button>' +
        (i.kind === 'pf' ? '<button class="sk-a" type="button" title="Composition (éléments pour 1 pièce)" onclick="spCompo(\'' + esc(i.id) + '\')">🧩</button>' : '') +
        '<button class="sk-a" type="button" title="Détails et historique" onclick="spDetail(\'' + i.kind + '\',\'' + esc(i.id) + '\')">📋</button>' +
        '<button class="sk-a sk-del" type="button" title="Supprimer" onclick="spSuppr(\'' + i.kind + '\',\'' + esc(i.id) + '\')">🗑</button></td></tr>';
    }).join('') : '<tr><td colspan="6" class="at-empty">Aucun résultat' + (q ? ' pour « ' + esc($('#sp-q').value) + ' »' : '') + '.</td></tr>';
    const c = $('#sk-cnt'); if (c) c.textContent = list.length + ' ligne(s) affichée(s) sur ' + all.length;
  }
  /* Une seule barre de défilement (celle de la page) : la liste n'a plus la sienne,
     et les titres des colonnes restent collés sous le menu et les onglets pendant qu'on descend */
  function ajuster() {
    const sk = document.querySelector('.sk'), v = $('#v-stock');
    const actif = !!(sk && v && v.classList.contains('on'));
    document.body.classList.toggle('sk-plein', actif);
    if (!actif) return;
    const h = document.querySelector('header'), t = document.getElementById('tabbar');
    let top = 0;
    [h, t].forEach(e => { if (e && getComputedStyle(e).position === 'sticky' && e.offsetParent !== null) top = Math.max(top, e.getBoundingClientRect().bottom); });
    sk.style.setProperty('--sk-top', Math.max(0, Math.round(top)) + 'px');
  }
  let ajT = null; const ajusterBientot = () => { clearTimeout(ajT); ajT = setTimeout(ajuster, 60); };
  /* Supprimer un modèle fini ou un élément du stock (avec son historique de mouvements) */
  async function supprimer(kind, id) {
    const pf = kind === 'pf';
    const it = pf ? PFAPI.produits().find(x => String(x.id) === String(id)) : StockAPI.byId(id);
    if (!it) return;
    const qte = pf ? PFAPI.qty(it.id) : StockAPI.qty(it.id);
    const enStock = pf ? qte + ' pièce(s)' : (f => f.main + (f.sub ? ' (' + f.sub + ')' : ''))(StockAPI.fmtQty(it, qte));
    const packs = pf && typeof LIGNES !== 'undefined' && typeof PRODUITS !== 'undefined' ? [...new Set(LIGNES.filter(l => String(l.sous_produit_id) === String(it.id)).map(l => (PRODUITS.find(x => String(x.id) === String(l.produit_id)) || {}).nom).filter(Boolean))] : [];
    let msg = 'Supprimer définitivement ' + (pf ? 'le modèle fini' : 'l’élément') + ' « ' + it.nom + ' » ?\n\n' +
      '• En stock actuellement : ' + enStock + '\n' +
      '• Tout son historique d’entrées / sorties sera supprimé' + (pf ? ', ainsi que sa fiche de coût de revient (composition).' : '.') + '\n' +
      '• Les bons de livraison / réception déjà faits gardent la ligne (texte), sans lien vers le stock.';
    if (packs.length) msg += '\n\n⚠ Il fait partie du/des pack(s) : ' + packs.join(', ') + ' — il sera retiré de leur composition.';
    if (Number(qte) > 0) msg += '\n\n⚠ Il reste du stock : sa valeur disparaîtra du stock et de l’inventaire.';
    if (!confirm(msg)) return;
    const r = await sb.from(pf ? 'produits' : 'stock_articles').delete().eq('id', it.id);
    if (r.error) { say('Erreur : ' + (r.error.message || r.error)); return; }
    if (pf) { await PFAPI.load(); document.dispatchEvent(new Event('mariabag:produits')); } else await StockAPI.load();
    document.dispatchEvent(new Event(pf ? 'mariabag:pf' : 'mariabag:stock'));
    render();
    say((pf ? 'Modèle fini' : 'Élément') + ' « ' + it.nom + ' » supprimé.');
  }
  function detail(kind, id) {
    if (kind === 'pf') { PFAPI.openPane('pf'); if (typeof pfShowProduit === 'function') pfShowProduit(id); }
    else { PFAPI.openPane('mat'); if (typeof showFormArticle === 'function') showFormArticle(id); }
  }

  /* ---------- Un seul formulaire ouvert à la fois ---------- */
  function ouvrir(sel) {
    ['#sp-nform', '#sp-qform', '#sp-cform'].forEach(s => { $(s).style.display = s === sel ? 'block' : 'none'; });
    document.body.classList.toggle('sk-modal', !!sel);
  }
  function fermer() { cur = null; comp = null; ['#sp-nform', '#sp-qform', '#sp-cform'].forEach(s => { $(s).style.display = 'none'; }); document.body.classList.remove('sk-modal'); }

  /* ============================================================
     1) AJOUTER UN NOM
     ============================================================ */
  const kindN = () => { const r = document.querySelector('input[name="sp-ntype"]:checked'); return r ? r.value : 'pf'; };
  function nouveau(kind) {
    document.querySelector('input[name="sp-ntype"][value="' + (kind || 'pf') + '"]').checked = true;
    $('#sp-nnom').value = ''; $('#sp-nprix').value = ''; $('#sp-ninit').value = ''; $('#sp-ncqte').value = '';
    majNouveau(true);
    ouvrir('#sp-nform');
    $('#sp-nnom').focus();
  }
  function majNouveau(resetCat) {
    const k = kindN(), mat = k === 'mat';
    $$('#sp-ntype .pr-typ').forEach(l => l.classList.toggle('on', l.querySelector('input').checked));
    ['#sp-ncat-wrap', '#sp-nunite-wrap', '#sp-ncond-wrap'].forEach(s => { $(s).style.display = mat ? '' : 'none'; });
    if (mat && resetCat) { const c = catDefaut(); $('#sp-nunite').value = c.unite; $('#sp-ncond').value = c.cond || ''; }
    const cond = mat ? $('#sp-ncond').value : '', unite = $('#sp-nunite').value;
    $('#sp-ncqte-wrap').style.display = mat && cond ? '' : 'none';
    $('#sp-ntitle').textContent = mat ? 'Nouvel élément de production' : 'Nouveau modèle fini';
    $('#sp-nnom').placeholder = mat ? 'Ex : Kawi bébé, Sangle 3 cm, Curseur n°5…' : 'Ex : Sac à dos Nike, Cabas 3 pièces…';
    $('#sp-ncqte-lbl').textContent = 'Contenu d’un ' + cond + ' (en ' + unite + ') *';
    $('#sp-nprix-lbl').textContent = mat ? (cond ? 'Prix d’achat d’un ' + cond + ' (DA)' : 'Prix d’achat d’une unité : ' + unite + ' (DA)') : 'Prix de vente d’une pièce (DA)';
    $('#sp-ninit-lbl').textContent = mat ? 'Quantité en stock (en ' + (cond ? StockAPI.plur(cond, 2) : unite) + ')' : 'Pièces en stock';
    const noms = mat ? (catDefaut().noms || []) : [];
    $('#sp-nnoms').innerHTML = noms.map(n => '<option value="' + esc(n) + '">').join('');
    const cq = parseFloat($('#sp-ncqte').value) || 0, pr = parseFloat($('#sp-nprix').value) || 0;
    const qi = parseFloat($('#sp-ninit').value) || 0, u = mat ? (cond || unite) : 'pièce';
    // prix total : quantité × prix d'une unité (bobine, rouleau, pièce…)
    const tot = qi > 0 && pr > 0 ? '<div class="sp-tot">' + (mat ? 'Prix total du stock' : 'Valeur de vente du stock') + ' : ' + num(qi) + ' ' + esc(StockAPI.plur ? StockAPI.plur(u, qi) : u) + ' × ' + money(pr) + ' = <b>' + money(qi * pr) + '</b></div>' : '';
    $('#sp-nhint').innerHTML = (mat && cond && cq > 0 && pr > 0 ? '1 ' + esc(cond) + ' = ' + num(cq) + ' ' + esc(unite) + ' → <b>' + money(pr / cq) + ' / ' + esc(unite) + '</b> (prix utilisé dans les coûts)' : '') + tot;
  }
  const catDefaut = () => (typeof STK_CATS !== 'undefined' ? (STK_CATS.find(c => c.k === $('#sp-ncat').value) || STK_CATS[0]) : { unite: 'pcs', cond: '', noms: [] });

  async function creerNom(ev) {
    ev.preventDefault();
    const k = kindN(), nom = $('#sp-nnom').value.trim(), prix = parseFloat($('#sp-nprix').value) || 0, init = parseFloat($('#sp-ninit').value) || 0;
    if (!nom) { say('Écrivez le nom.'); return; }
    if (k === 'pf') {
      if (PFAPI.list().some(p => norm(p.nom) === norm(nom))) { say('Le modèle « ' + nom + ' » existe déjà.'); return; }
      const r = await sb.from('produits').insert([{ nom, description: '', mo_date: iso(new Date()), prix_vente: prix }]).select();
      if (r.error || !r.data || !r.data[0]) { say('Erreur : ' + ((r.error && r.error.message) || 'création impossible')); return; }
      await PFAPI.load();
      if (init > 0) await PFAPI.saisir({ type: 'ajustement', produitId: r.data[0].id, quantite: init, note: 'Stock de départ' });
      if (typeof loadProduits === 'function') loadProduits();
      say('Modèle « ' + nom + ' » ajouté' + (init > 0 ? ' avec ' + num(init, 0) + ' pièces en stock' : '') + '. Ajoutez le suivant, ou fermez.');
    } else {
      const cond = $('#sp-ncond').value, cq = parseFloat($('#sp-ncqte').value) || 0, unite = $('#sp-nunite').value;
      if (cond && !(cq > 0)) { say('Indiquez le contenu d’un ' + cond + ' (ex : 45 ' + unite + ').'); return; }
      const cr = await StockAPI.create({ categorie: $('#sp-ncat').value, nom, unite, cond_nom: cond, cond_qte: cond ? cq : 0, prix_achat: prix, seuil_alerte: 0, note: '' });
      if (cr.error) { say('Erreur : ' + (/duplicate|unique/i.test(cr.error.message || '') ? 'cet élément existe déjà dans cette catégorie.' : cr.error.message)); return; }
      if (init > 0) await StockAPI.mouvement({ article_id: cr.article.id, type: 'ajustement', quantite: cond ? init * cq : init, note: 'Stock de départ' });
      say('Élément « ' + nom + ' » ajouté' + (init > 0 ? ' avec son stock' : '') + '. Ajoutez le suivant, ou fermez.');
    }
    $('#sp-nnom').value = ''; $('#sp-ninit').value = ''; $('#sp-nprix').value = ''; $('#sp-nnom').focus();
    render();
  }

  /* ============================================================
     2) ENTRER / SORTIR UNE QUANTITÉ
     ============================================================ */
  const pOf = id => PFAPI.list().find(p => String(p.id) === String(id));
  function clientOptions() {
    return '<option value="">— Perte / casse (pas de client) —</option>' + PFAPI.clients().map(c => '<option value="' + esc(c.id) + '">' + esc(c.nom) + '</option>').join('') + '<option value="__new__">＋ Nouveau client…</option>';
  }
  function ouvrirQ(kind, id, op) {
    cur = { kind, id, op };
    const entree = op === 'entree';
    $('#sp-qqte').value = ''; $('#sp-qnote').value = '';
    ['#sp-qunite-wrap', '#sp-qclient-wrap', '#sp-qcmd-wrap', '#sp-qprix-wrap', '#sp-qded-wrap', '#sp-qfour-wrap'].forEach(s => { $(s).style.display = 'none'; });
    $('#sp-qded-info').textContent = '';
    if (kind === 'mat') {
      const a = StockAPI.byId(id); if (!a) return;
      $('#sp-qtitle').textContent = (entree ? 'Entrer en stock' : 'Sortir du stock') + ' — ' + a.nom;
      const opts = (StockAPI.aCond(a) ? [a.cond_nom] : []).concat([a.unite]);
      $('#sp-qunite').innerHTML = opts.map(u => '<option>' + esc(u) + '</option>').join('');
      $('#sp-qunite-wrap').style.display = opts.length > 1 ? '' : 'none';
      $('#sp-qqte-lbl').textContent = 'Quantité *';
      if (entree) {
        $('#sp-qprix-wrap').style.display = ''; $('#sp-qprix-lbl').textContent = StockAPI.aCond(a) ? 'Prix d’achat d’un ' + a.cond_nom + ' (DA)' : 'Prix d’achat d’une unité (DA)';
        $('#sp-qprix').value = Number(a.prix_achat) > 0 ? a.prix_achat : '';
        $('#sp-qfour-wrap').style.display = ''; if (window.PartAPI) PartAPI.fill('#sp-qfour', { id: a.contact_id, nom: a.fournisseur });
      }
    } else {
      const p = pOf(id); if (!p) return;
      $('#sp-qqte-lbl').textContent = 'Nombre de pièces *';
      if (entree) {
        $('#sp-qtitle').textContent = 'Entrer en stock — ' + p.nom + ' (pièces fabriquées)';
        $('#sp-qded-wrap').style.display = '';
      } else {
        $('#sp-qtitle').textContent = 'Sortir du stock — ' + p.nom;
        $('#sp-qclient-wrap').style.display = ''; $('#sp-qclient').innerHTML = clientOptions();
        $('#sp-qprix-wrap').style.display = ''; $('#sp-qprix-lbl').textContent = 'Prix de vente d’une pièce (DA)'; $('#sp-qprix').value = Number(p.prix_vente) > 0 ? p.prix_vente : '';
        majCmd();
      }
    }
    $('#sp-qsubmit').textContent = entree ? 'Entrer en stock' : 'Sortir du stock';
    majQ();
    ouvrir('#sp-qform');
    $('#sp-qqte').focus();
  }
  function majCmd() {
    if (!cur || cur.kind !== 'pf' || cur.op !== 'sortie') return;
    const client = $('#sp-qclient').value, cmds = client && client !== '__new__' ? PFAPI.commandesOuvertes(cur.id, client) : [];
    $('#sp-qcmd-wrap').style.display = cmds.length ? '' : 'none';
    $('#sp-qcmd').innerHTML = '<option value="">— Sans commande —</option>' + cmds.map(c => '<option value="' + esc(c.id) + '">' + esc(c.numero + ' · reste ' + c.reste) + '</option>').join('');
    if (cmds.length === 1) $('#sp-qcmd').value = cmds[0].id;
  }
  function qteSaisie() {
    const q = parseFloat($('#sp-qqte').value) || 0;
    if (!cur) return { q, base: 0 };
    if (cur.kind === 'mat') { const a = StockAPI.byId(cur.id); return { q, base: a ? StockAPI.toBase(a, q, $('#sp-qunite').value) : null, a }; }
    return { q: Math.round(q), base: Math.round(q) };
  }
  async function majQ() {
    if (!cur) return;
    const { q, base, a } = qteSaisie(), entree = cur.op === 'entree';
    let h = '';
    if (cur.kind === 'mat' && a) {
      const st = StockAPI.qty(a.id), f = StockAPI.fmtQty(a, st);
      h = 'En stock : <b>' + esc(f.main) + '</b>' + (f.sub ? ' (' + esc(f.sub) + ')' : '');
      if (q > 0 && base != null) { const apres = st + (entree ? base : -base), fa = StockAPI.fmtQty(a, apres); h += ' → après : <b class="' + (apres < 0 ? 'st-neg' : '') + '">' + esc(fa.main) + '</b>'; }
    } else if (cur.kind === 'pf') {
      const st = PFAPI.qty(cur.id);
      h = 'En stock : <b>' + num(st, 0) + '</b> pièces';
      if (q > 0) { const apres = st + (entree ? q : -q); h += ' → après : <b class="' + (apres < 0 ? 'st-neg' : '') + '">' + num(apres, 0) + '</b>'; }
      if (!entree) {
        const cl = $('#sp-qclient').value; h += '<br>' + (cl && cl !== '__new__' ? '→ <b>Livraison au client</b>' + ($('#sp-qcmd').value ? ' (la commande sera mise à jour)' : '') : '→ <b>Perte / casse</b> (aucun client choisi)');
        const pv = parseFloat($('#sp-qprix').value) || 0; if (q > 0 && pv > 0 && cl) h += ' · montant ' + money(q * pv);
      }
    }
    $('#sp-qhint').innerHTML = h;
    if (cur.kind === 'pf' && entree) majDed();
  }

  /* Éléments à retirer du stock quand on entre N pièces d'un modèle (d'après sa composition) */
  async function compoItems(produit, n) {
    const res = { hasFiche: false, items: [], nonLies: [], manques: [] };
    const mods = await sb.from('modeles').select('*');
    const mid = produit.modele_id || ((mods.data || []).find(m => norm(m.nom) === norm(produit.nom)) || {}).id;
    if (!mid) return res;
    const cs = await sb.from('composants').select('*').eq('modele_id', mid);
    const rows = (cs.data || []).filter(c => c.type !== 'finition');
    res.hasFiche = rows.length > 0;
    rows.forEach(c => {
      const a = c.article_id ? StockAPI.byId(c.article_id) : null;
      if (!a) { res.nonLies.push(c.nom); return; }
      const need = StockAPI.toBase(a, Number(c.quantite) * n * (1 + Number(c.perte_pct || 0) / 100), c.unite);
      if (!(need > 0)) { res.nonLies.push(c.nom); return; }
      const f = StockAPI.fmtQty(a, need);
      res.items.push({ article_id: a.id, qte: need, nom: a.nom, txt: f.main + (f.sub ? ' (' + f.sub + ')' : '') });
      if (StockAPI.qty(a.id) < need) res.manques.push(a.nom);
    });
    return res;
  }
  let dedSeq = 0;
  async function majDed() {
    const seq = ++dedSeq, p = pOf(cur.id), n = Math.round(parseFloat($('#sp-qqte').value) || 0), box = $('#sp-qded-info');
    const wrap = $('#sp-qded-wrap');
    if (!p) return;
    const r = await compoItems(p, n || 1);
    if (seq !== dedSeq || !cur) return;
    if (!r.hasFiche) { wrap.style.display = 'none'; box.innerHTML = 'ℹ Pas de composition pour ce modèle : aucun élément ne sera retiré. Cliquez sur <b>Composition</b> pour la définir (une fois pour toutes).'; return; }
    wrap.style.display = r.items.length ? '' : 'none';
    box.innerHTML = r.items.length
      ? (n ? 'Seront retirés : <b>' + esc(r.items.map(i => i.nom + ' ' + i.txt).join(' · ')) + '</b>' : 'Saisissez le nombre de pièces pour voir les éléments retirés.') +
        (r.manques.length ? '<br><span class="st-neg">⚠ Stock insuffisant pour : ' + esc(r.manques.join(', ')) + '</span>' : '') + (r.nonLies.length ? '<br>Non liés au stock (ignorés) : ' + esc(r.nonLies.join(', ')) : '')
      : 'Aucun élément de la composition n’est lié au stock : rien ne sera retiré.';
  }

  async function enregistrerQ(ev) {
    ev.preventDefault();
    if (!cur) return;
    const { q, base, a } = qteSaisie(), entree = cur.op === 'entree', note = $('#sp-qnote').value.trim();
    if (!(q > 0) || base == null || !(base > 0)) { say('Indiquez une quantité supérieure à 0.'); return; }
    if (cur.kind === 'mat') {
      const st = StockAPI.qty(a.id);
      if (!entree && st - base < 0 && !confirm('Stock insuffisant : il reste ' + StockAPI.fmtQty(a, st).main + '.\nLe stock deviendra négatif. Continuer ?')) return;
      const prix = parseFloat($('#sp-qprix').value) || 0;
      const r = await StockAPI.mouvement({ article_id: a.id, type: entree ? 'entree' : 'sortie', quantite: entree ? base : -base, prix_achat: entree ? prix : 0, note, ...(entree && window.PartAPI ? PartAPI.read('#sp-qfour') : {}) });
      if (r.error) { say('Erreur : ' + r.error.message); return; }
      if (entree && prix > 0 && prix !== Number(a.prix_achat)) await StockAPI.setPrix(a.id, prix);
      say((entree ? 'Entré : +' : 'Sorti : −') + StockAPI.fmtQty(a, base).main + ' « ' + a.nom + ' ».');
    } else {
      const p = pOf(cur.id), n = Math.round(q);
      if (entree) {
        const ded = $('#sp-qded-wrap').style.display !== 'none' && $('#sp-qded').checked ? await compoItems(p, n) : null;
        if (ded && ded.manques.length && !confirm('Stock d’éléments insuffisant pour : ' + ded.manques.join(', ') + '.\nLe stock de ces éléments deviendra négatif. Continuer ?')) return;
        const r = await PFAPI.saisir({ type: 'entree', produitId: p.id, quantite: n, note: note || 'Pièces fabriquées' });
        if (r.error) { say('Erreur : ' + r.error.message); return; }
        let extra = '';
        if (ded && ded.items.length) {
          const d = await StockAPI.sortie(ded.items, 'FAB-' + iso(new Date()).replace(/-/g, '') + '-' + p.nom.slice(0, 4).toUpperCase(), 'Fabrication de ' + n + ' × ' + p.nom, 'production');
          extra = d.error ? ' (éléments non retirés : ' + d.error.message + ')' : ' · ' + ded.items.length + ' élément(s) retiré(s) du stock';
        }
        say('+' + num(n, 0) + ' « ' + p.nom + ' » entrées en stock' + extra + '.');
      } else {
        let client = $('#sp-qclient').value;
        if (client === '__new__') client = '';
        const type = client ? 'livraison' : 'perte', st = PFAPI.qty(p.id);
        if (st - n < 0 && !confirm('Stock insuffisant : il reste ' + num(st, 0) + ' pièces.\nLe stock deviendra négatif. Continuer ?')) return;
        const r = await PFAPI.saisir({ type, produitId: p.id, quantite: n, clientId: client || null, commandeId: client ? ($('#sp-qcmd').value || null) : null, prix: parseFloat($('#sp-qprix').value) || 0, note });
        if (r.error) { say('Erreur : ' + r.error.message); return; }
        say(type === 'livraison' ? 'Livraison enregistrée : −' + num(n, 0) + ' « ' + p.nom + ' »' + ($('#sp-qcmd').value ? ' (commande mise à jour).' : '.') : 'Perte enregistrée : −' + num(n, 0) + ' « ' + p.nom + ' ».');
        fermer(); render();
        if (type === 'livraison' && r.reference && confirm('Télécharger le bon de livraison PDF ?')) PFAPI.bonLivraison(r.reference);
        return;
      }
    }
    fermer(); render();
  }

  /* ============================================================
     3) COMPOSITION D'UN MODÈLE (éléments × quantité par pièce)
     ============================================================ */
  function optionsElements(sel) {
    const groups = {};
    StockAPI.list().forEach(a => { (groups[a.categorie] = groups[a.categorie] || []).push(a); });
    return '<option value="">— Choisir l’élément —</option>' + Object.keys(groups).sort((x, y) => StockAPI.catIdx(x) - StockAPI.catIdx(y)).map(k =>
      '<optgroup label="' + esc(k) + '">' + groups[k].map(a => '<option value="' + esc(a.id) + '"' + (String(a.id) === String(sel) ? ' selected' : '') + '>' + esc(a.nom) + '</option>').join('') + '</optgroup>').join('');
  }
  function ligneHtml(r, i) {
    const a = r.articleId ? StockAPI.byId(r.articleId) : null;
    return '<div class="sp-cl" data-i="' + i + '"><select class="sp-cl-art">' + optionsElements(r.articleId) + '</select>' +
      '<input class="sp-cl-qte" type="number" min="0" step="0.0001" inputmode="decimal" placeholder="Qté par pièce" value="' + (r.qte || '') + '">' +
      '<span class="sp-cl-u">' + esc(a ? (r.unite || a.unite) : (r.unite || '')) + '</span>' +
      '<button type="button" class="ib sp-cl-del" title="Retirer cet élément">✕</button>' +
      (!a && r.nom ? '<small class="sp-cl-old">Ancien élément « ' + esc(r.nom) + ' » : choisissez l’élément du stock correspondant</small>' : '') + '</div>';
  }
  function lireLignes() {
    return $$('#sp-clignes .sp-cl').map(el => ({ i: +el.dataset.i, articleId: el.querySelector('.sp-cl-art').value, qte: parseFloat(el.querySelector('.sp-cl-qte').value) || 0 }));
  }
  function dessinerLignes() {
    $('#sp-clignes').innerHTML = comp.rows.length ? comp.rows.map(ligneHtml).join('') : '<p class="pr-help">Aucun élément pour le moment : cliquez sur « + Ajouter un élément ».</p>';
  }
  async function ouvrirCompo(produitId) {
    const p = pOf(produitId); if (!p) return;
    if (!StockAPI.list().length) { say('Ajoutez d’abord des éléments de production (tissu, doublure…) : « + Nouvel élément ».'); return; }
    const mods = await sb.from('modeles').select('*');
    const mod = (mods.data || []).find(m => String(m.id) === String(p.modele_id)) || (mods.data || []).find(m => norm(m.nom) === norm(p.nom)) || null;
    const cs = mod ? await sb.from('composants').select('*').eq('modele_id', mod.id).order('ordre', { ascending: true }) : { data: [] };
    const all = cs.data || [];
    comp = { produit: p, modele: mod, rows: all.filter(c => c.type !== 'finition').map(c => ({ cid: c.id, articleId: c.article_id || '', nom: c.nom, qte: Number(c.quantite) || 0, unite: c.unite, perte: Number(c.perte_pct) || 0 })), fin: all.find(c => c.type === 'finition') || null };
    if (!comp.rows.length) comp.rows.push({ cid: null, articleId: '', nom: '', qte: 0, unite: '', perte: 0 });
    $('#sp-ctitle').textContent = 'Composition — ' + p.nom;
    $('#sp-cfin').value = comp.fin ? Number(comp.fin.prix_unitaire) || '' : '';
    $('#sp-csync').checked = true; $('#sp-chint').textContent = '';
    dessinerLignes();
    ouvrir('#sp-cform');
  }
  async function enregistrerCompo(ev) {
    ev.preventDefault();
    if (!comp) return;
    const p = comp.produit, lignes = lireLignes();
    // une ligne = élément choisi + quantité ; les anciennes lignes sans élément choisi restent telles quelles
    const rows = lignes.map(l => ({ ...comp.rows[l.i], articleId: l.articleId, qte: l.qte }));
    const valides = rows.filter(r => r.articleId && r.qte > 0);
    if (rows.some(r => r.articleId && !(r.qte > 0))) { say('Indiquez la quantité par pièce de chaque élément choisi.'); return; }
    const finPrix = parseFloat($('#sp-cfin').value) || 0;
    // 1) le modèle (fiche matières)
    let mod = comp.modele;
    if (!mod) {
      const r = await sb.from('modeles').insert([{ nom: p.nom, description: '' }]).select();
      if (r.error || !r.data || !r.data[0]) { say('Erreur : ' + ((r.error && r.error.message) || 'création de la fiche impossible')); return; }
      mod = r.data[0];
    }
    if (String(p.modele_id) !== String(mod.id)) await sb.from('produits').update({ modele_id: mod.id }).eq('id', p.id);
    // 2) composants : retirés, modifiés, ajoutés
    const garder = new Set(rows.filter(r => r.cid).map(r => String(r.cid)));
    for (const old of comp.rows.filter(r => r.cid && !garder.has(String(r.cid)))) await sb.from('composants').delete().eq('id', old.cid);
    let ordre = comp.rows.length + 1;
    for (const r of rows) {
      const a = r.articleId ? StockAPI.byId(r.articleId) : null;
      if (!a && !r.cid) continue;
      if (!a) continue;                                           // ancien élément non relié : inchangé
      const unite = r.articleId && r.unite && StockAPI.toBase(a, 1, r.unite) != null ? r.unite : a.unite;
      const payload = { nom: a.categorie + ' — ' + a.nom, unite, quantite: r.qte, article_id: a.id, type: 'matiere', prix_unitaire: 0 };
      const w = r.cid ? await sb.from('composants').update(payload).eq('id', r.cid) : await sb.from('composants').insert([{ ...payload, modele_id: mod.id, perte_pct: 0, note: '', ordre: ordre++ }]);
      if (w.error) { say('Erreur : ' + w.error.message); return; }
    }
    // finition extérieure payée à la pièce
    if (finPrix > 0) {
      const fp = { nom: 'Finition extérieure', unite: 'pcs', quantite: 1, perte_pct: 0, type: 'finition', prix_unitaire: finPrix, article_id: null };
      if (comp.fin) await sb.from('composants').update(fp).eq('id', comp.fin.id); else await sb.from('composants').insert([{ ...fp, modele_id: mod.id, note: '', ordre: ordre++ }]);
    } else if (comp.fin) await sb.from('composants').delete().eq('id', comp.fin.id);
    // 3) coût de revient (Produits) : une ligne par élément, prix repris du stock ; l'existant n'est jamais supprimé
    if ($('#sp-csync').checked) {
      const ls = await sb.from('produit_lignes').select('*').eq('produit_id', p.id);
      const lignesP = ls.data || [];
      let ord = lignesP.reduce((m, l) => Math.max(m, Number(l.ordre) || 0), 0);
      const catMap = typeof CAT_STOCK_VERS_PRODUIT !== 'undefined' ? CAT_STOCK_VERS_PRODUIT : {};
      for (const r of valides) {
        const a = StockAPI.byId(r.articleId); if (!a) continue;
        const unite = r.unite && StockAPI.toBase(a, 1, r.unite) != null ? r.unite : a.unite, prix = StockAPI.priceFor(a, unite) || 0;
        const ex = lignesP.find(l => String(l.article_id) === String(a.id));
        if (ex) await sb.from('produit_lignes').update({ quantite: r.qte, unite, article_id: a.id, prix_unitaire: prix }).eq('id', ex.id);
        else await sb.from('produit_lignes').insert([{ produit_id: p.id, categorie: catMap[a.categorie] || 'Autre outil', designation: a.nom, unite, quantite: r.qte, prix_unitaire: prix, perte_pct: 0, note: '', ordre: ++ord, article_id: a.id }]);
      }
      if (finPrix > 0) {
        const exf = lignesP.find(l => l.categorie === 'Finition');
        if (exf) await sb.from('produit_lignes').update({ prix_unitaire: finPrix, quantite: 1 }).eq('id', exf.id);
        else await sb.from('produit_lignes').insert([{ produit_id: p.id, categorie: 'Finition', designation: 'Finition extérieure', unite: 'pcs', quantite: 1, prix_unitaire: finPrix, perte_pct: 0, note: '', ordre: ++ord, article_id: null }]);
      }
    }
    if (typeof loadProduits === 'function') loadProduits();
    if (typeof loadProduction === 'function') loadProduction();
    await PFAPI.load();
    say('Composition de « ' + p.nom + ' » enregistrée' + ($('#sp-csync').checked ? ' et coût de revient mis à jour' : '') + '.');
    fermer(); render();
  }

  /* ============================================================
     MODE SIMPLE / COMPLET : onglets Production et Produits
     ============================================================ */
  let mode = 'simple';
  try { mode = localStorage.getItem('mariabag_mode') || 'simple'; } catch (e) {}
  function appliquerMode() {
    if (window.ACCES_LIMITE) return;          // compte limité à certaines sections : géré par acces.js
    const simple = mode === 'simple';
    document.body.classList.toggle('mode-simple', simple);
    // sur smartphone, Production et Produits sont toujours deux sections séparées dans le menu du bas
    const tel = window.matchMedia('(max-width:700px)').matches;
    ['production', 'produits', 'gabarits'].forEach(v => { const b = document.querySelector('nav button[data-v="' + v + '"]'); if (b) b.hidden = simple && !tel; });
    document.body.classList.toggle('mode-tel', tel);
    const mb = $('#bMode'); if (mb) { mb.textContent = simple ? 'Mode complet' : 'Mode simple'; mb.title = simple ? 'Afficher aussi les onglets Production et Produits' : 'Masquer les onglets Production et Produits'; }
    const lk = $('#sp-modelink'); if (lk) lk.textContent = simple ? 'afficher tous les onglets (mode complet)' : 'revenir au mode simple';
  }
  try { window.matchMedia('(max-width:700px)').addEventListener('change', () => appliquerMode()); } catch (e) {}
  window.appliquerModeSimple = () => appliquerMode();
  function basculerMode() { mode = mode === 'simple' ? 'complet' : 'simple'; try { localStorage.setItem('mariabag_mode', mode); } catch (e) {} appliquerMode(); }

  /* ---------- Listes de départ ---------- */
  if (typeof STK_CATS !== 'undefined') $('#sp-ncat').innerHTML = STK_CATS.map(c => '<option>' + esc(c.k) + '</option>').join('');
  $('#sp-nunite').innerHTML = UNITES.map(u => '<option>' + u + '</option>').join('');

  /* ---------- Événements ---------- */
  Object.assign(window, { spNouveau: nouveau, spFermer: fermer, spQ: ouvrirQ, spCompo: ouvrirCompo, spDetail: detail, spSuppr: supprimer });
  $('#sp-nform').addEventListener('submit', creerNom);
  $('#sp-qform').addEventListener('submit', enregistrerQ);
  $('#sp-cform').addEventListener('submit', enregistrerCompo);
  document.querySelectorAll('input[name="sp-ntype"]').forEach(r => r.addEventListener('change', () => majNouveau(true)));
  $('#sp-ncat').addEventListener('change', () => majNouveau(true));
  ['#sp-nunite', '#sp-ncond'].forEach(s => $(s).addEventListener('change', () => majNouveau(false)));
  ['#sp-ncqte', '#sp-nprix', '#sp-ninit'].forEach(s => $(s).addEventListener('input', () => majNouveau(false)));
  ['#sp-qqte', '#sp-qprix'].forEach(s => $(s).addEventListener('input', majQ));
  $('#sp-qunite').addEventListener('change', majQ);
  $('#sp-qcmd').addEventListener('change', majQ);
  $('#sp-qded').addEventListener('change', majDed);
  $('#sp-qclient').addEventListener('change', async () => {
    if ($('#sp-qclient').value === '__new__') {
      const nom = prompt('Nom du nouveau client :');
      const id = nom ? await PFAPI.creerClient(nom) : null;
      $('#sp-qclient').innerHTML = clientOptions(); $('#sp-qclient').value = id || '';
      if (id) say('Client « ' + nom + ' » ajouté aux Contacts.');
    }
    majCmd(); majQ();
  });
  $('#sp-cadd').addEventListener('click', () => { if (!comp) return; const cur = lireLignes(); comp.rows = comp.rows.map((r, i) => ({ ...r, articleId: cur[i] ? cur[i].articleId : r.articleId, qte: cur[i] ? cur[i].qte : r.qte })); comp.rows.push({ cid: null, articleId: '', nom: '', qte: 0, unite: '', perte: 0 }); dessinerLignes(); });
  $('#sp-clignes').addEventListener('click', ev => {
    const del = ev.target.closest('.sp-cl-del'); if (!del || !comp) return;
    const cur = lireLignes(); comp.rows = comp.rows.map((r, i) => ({ ...r, articleId: cur[i] ? cur[i].articleId : r.articleId, qte: cur[i] ? cur[i].qte : r.qte }));
    comp.rows.splice(+del.closest('.sp-cl').dataset.i, 1); dessinerLignes();
  });
  $('#sp-clignes').addEventListener('change', ev => {
    const sel = ev.target.closest('.sp-cl-art'); if (!sel || !comp) return;
    const row = sel.closest('.sp-cl'), a = StockAPI.byId(sel.value), i = +row.dataset.i;
    comp.rows[i].articleId = sel.value; comp.rows[i].unite = a ? a.unite : '';
    row.querySelector('.sp-cl-u').textContent = a ? a.unite : '';
  });
  $('#sp-q').addEventListener('input', render);
  $('#sp-chips').addEventListener('click', ev => { const b = ev.target.closest('[data-f]'); if (b) { filtre = b.dataset.f; render(); } });
  { const k = $('#sk-kpis'); if (k) k.addEventListener('click', ev => { const b = ev.target.closest('[data-f]'); if (b) { filtre = filtre === b.dataset.f ? 'all' : b.dataset.f; render(); } }); }
  // fenêtres (ajouter un nom, entrer / sortir, composition) : Échap ou clic à côté pour fermer
  document.addEventListener('keydown', ev => { if (ev.key === 'Escape' && document.body.classList.contains('sk-modal') && !document.querySelector('.ch-list:not([hidden])')) fermer(); });
  { const bg = document.createElement('div'); bg.id = 'sk-bg'; document.body.appendChild(bg); bg.addEventListener('mousedown', fermer); }
  $('#st-pane-simple').addEventListener('click', ev => {
    const g = ev.target.closest('[data-go-v]');
    if (g) { ev.preventDefault(); const b = document.querySelector('nav button[data-v="' + g.dataset.goV + '"]'); if (b) b.click(); return; }
    if (ev.target.closest('#sp-modelink')) { ev.preventDefault(); basculerMode(); }
  });
  // lien « mode » ajouté sous la page
  const links = document.querySelector('.sp-links'); if (links) links.insertAdjacentHTML('beforeend', ' · <a href="#" id="sp-modelink"></a>');
  // bouton dans l'en-tête (ordinateur)
  const out = document.getElementById('bLogout');
  if (out && !$('#bMode')) { const b = document.createElement('button'); b.id = 'bMode'; b.type = 'button'; b.className = 'btn'; b.addEventListener('click', basculerMode); out.parentNode.insertBefore(b, out); }
  appliquerMode();

  window.addEventListener('resize', ajusterBientot);
  document.addEventListener('click', ev => { if (ev.target.closest('nav button, #st-tabs button, .tabbar, [data-go-v]')) ajusterBientot(); });
  document.addEventListener('mariabag:stock', render);
  document.addEventListener('mariabag:pf', render);
  document.addEventListener('mariabag:stockpane', ev => { if (ev.detail === 'simple') chargerTout(); ajusterBientot(); });
  document.addEventListener('mariabag:authenticated', chargerTout);
  document.querySelector('nav button[data-v="stock"]').addEventListener('click', chargerTout);
  if (!document.getElementById('app').classList.contains('hide')) chargerTout();
})();
