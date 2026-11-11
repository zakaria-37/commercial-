/* ============================================================
   MAGASINS ⇄ DÉPÔT — commandes des magasins au dépôt (version smartphone d'abord)
   1. Le vendeur d'un magasin (Idris — Boumati, Fatah — Bab El Zouar) ouvre « Magasin »,
      cherche les produits, choisit cartons ou pièces, puis envoie la commande au dépôt.
   2. La commande apparaît tout de suite chez le magasinier du dépôt (Hamza, section « Dépôt ») :
      il prépare chaque produit, coche sa case (et corrige la quantité envoyée si besoin).
   3. Quand tout est coché, il valide avec un message : le stock des produits finis du dépôt
      diminue (mouvement « Transfert magasin ») et un bon daté (PDF) est gardé dans l'historique.
   ============================================================ */
(function () {
  'use strict';
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const nf = (n, d) => (Number(n) || 0).toLocaleString('fr-FR', { maximumFractionDigits: d == null ? 0 : d });
  const fd = s => s ? String(s).slice(0, 10).split('-').reverse().join('/') : '';
  const fdt = s => { if (!s) return ''; const d = new Date(s); return d.toLocaleDateString('fr-FR') + ' à ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }); };
  const iso = d => { const x = d || new Date(); return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0'); };
  const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  const pdfT = s => String(s ?? '').replace(/œ/g, 'oe').replace(/Œ/g, 'OE').replace(/[  ]/g, ' ');
  const qui = () => (window.APP_USER && (window.APP_USER.nom || window.APP_USER.email)) || 'Utilisateur';
  const say = t => { if (typeof toast === 'function') toast(t); };
  const perm = v => typeof window.sectionPermise === 'function' ? window.sectionPermise(v) : true;
  const vibre = () => { if (navigator.vibrate) try { navigator.vibrate(12); } catch (x) {} };
  const KEY_MAG = 'mariabag_magasin_choisi';

  let MAGS = [], CMDS = [], PRODS = [], charge = false, erreur = '', connus = null;
  let magId = '', ongletM = 'nouvelle', ongletD = 'a_preparer', filtreD = '', q = '', panier = [], noteCmd = '';
  try { panier = JSON.parse(localStorage.getItem('mariabag_panier_magasin') || '[]') || []; } catch (e) { panier = []; }
  const garderPanier = () => { try { localStorage.setItem('mariabag_panier_magasin', JSON.stringify(panier)); } catch (e) {} };

  /* ---------- Chargement ---------- */
  async function load() {
    const [m, c, p] = await Promise.all([
      sb.from('magasins').select('*').order('nom', { ascending: true }),
      sb.from('commandes_magasin').select('*').order('created_at', { ascending: false }),
      sb.from('produits').select('*').order('nom', { ascending: true })]);
    erreur = m.error || c.error ? 'Les tables « magasins » ne sont pas encore installées dans Supabase (supabase/magasins.sql).' : '';
    MAGS = m.error ? [] : (m.data || []); PRODS = p.error ? [] : (p.data || []);
    const avant = connus; CMDS = c.error ? [] : (c.data || []); charge = true;
    if (window.PFAPI && !PFAPI.list().length) { try { await PFAPI.load(); } catch (e) {} }
    // notifications : nouvelle commande (dépôt) / commande envoyée (magasin)
    const etat = new Map(CMDS.map(x => [x.id, x.statut]));
    if (avant) CMDS.forEach(x => {
      const a = avant.get(x.id);
      if (!a && x.statut === 'envoyee' && perm('depot')) say('🛒 Nouvelle commande ' + x.numero + ' — ' + x.magasin_nom);
      if (a === 'envoyee' && x.statut === 'livree' && perm('magasins')) say('🚚 Commande ' + x.numero + ' envoyée par le dépôt' + (x.message ? ' : « ' + x.message + ' »' : ''));
    });
    connus = etat;
    if (!magId) magId = choisirMagasinParDefaut();
    badge(); renderMagasin(); renderDepot();
    document.dispatchEvent(new Event('mariabag:magasins'));
  }
  function choisirMagasinParDefaut() {
    let s = ''; try { s = localStorage.getItem(KEY_MAG) || ''; } catch (e) {}
    if (s && MAGS.some(m => m.id === s)) return s;
    const moi = norm(qui());
    const m = MAGS.find(x => x.responsable && moi && (moi.includes(norm(x.responsable)) || norm(x.responsable).includes(moi.split(' ')[0])));
    return m ? m.id : (MAGS[0] ? MAGS[0].id : '');
  }
  const magasin = () => MAGS.find(m => m.id === magId) || null;
  const produit = id => PRODS.find(p => String(p.id) === String(id)) || null;
  const stockDepot = id => window.PFAPI && PFAPI.qty ? Number(PFAPI.qty(id)) || 0 : null;
  const parCarton = p => Math.max(0, Math.round(Number(p && p.par_carton) || 0));
  const fmtQ = l => l.mode === 'carton' ? nf(l.qte) + ' carton' + (l.qte > 1 ? 's' : '') + (l.par_carton ? ' (' + nf(l.qte * l.par_carton) + ' pcs)' : '') : nf(l.qte) + ' pièce' + (l.qte > 1 ? 's' : '');
  const piecesDe = l => l.mode === 'carton' ? (l.par_carton ? l.qte * l.par_carton : 0) : l.qte;

  function badge() {
    const n = CMDS.filter(c => c.statut === 'envoyee').length;
    const b = document.querySelector('nav button[data-v="depot"]');
    if (b) { b.dataset.badge = n || ''; b.classList.toggle('bs-has', n > 0); }
  }

  /* =================== MAGASIN (vendeur) =================== */
  function renderMagasin() {
    const el = document.getElementById('mg-root'); if (!el) return;
    if (!charge) { el.innerHTML = '<div class="card">Chargement…</div>'; return; }
    if (erreur) { el.innerHTML = '<div class="card">' + esc(erreur) + '</div>'; return; }
    const m = magasin(), mes = CMDS.filter(c => c.magasin_id === magId);
    const enCours = mes.filter(c => c.statut === 'envoyee'), hist = mes.filter(c => c.statut !== 'envoyee');
    el.innerHTML =
      '<div class="hello mg-hello"><span class="fl"></span><div><h2>🏬 ' + esc(m ? 'Magasin ' + m.nom : 'Magasin') + '</h2><p>' + esc(m && m.responsable ? m.responsable + ' · ' : '') + 'Commandez au dépôt : le magasinier prépare la commande et vous l’envoie avec un bon daté.</p></div></div>' +
      (MAGS.length > 1 ? '<div class="mg-chips">' + MAGS.map(x => '<button type="button" data-mag="' + esc(x.id) + '" class="' + (x.id === magId ? 'on' : '') + '">' + esc(x.nom) + (x.responsable ? '<small>' + esc(x.responsable) + '</small>' : '') + '</button>').join('') + '</div>' : '') +
      '<div class="at-tabs mg-tabs"><button type="button" data-om="nouvelle" class="' + (ongletM === 'nouvelle' ? 'on' : '') + '">🛒 Commander' + (panier.length ? ' (' + panier.length + ')' : '') + '</button>' +
        '<button type="button" data-om="encours" class="' + (ongletM === 'encours' ? 'on' : '') + '">En cours (' + enCours.length + ')</button>' +
        '<button type="button" data-om="hist" class="' + (ongletM === 'hist' ? 'on' : '') + '">Historique</button></div>' +
      (ongletM === 'nouvelle' ? vueCommander() : ongletM === 'encours'
        ? (enCours.length ? enCours.map(c => carteCmd(c, false)).join('') : '<div class="card bs-vide">Aucune commande en attente au dépôt.</div>')
        : (hist.length ? groupeParDate(hist.slice(0, 80), c => carteCmd(c, false)) : '<div class="card bs-vide">Aucune commande reçue pour le moment.</div>'));
    const s = el.querySelector('#mg-q'); if (s && document.activeElement !== s && s.dataset.focus) s.focus();
  }
  function resultats() {
    const t = norm(q); if (!t) return [];
    return PRODS.filter(p => norm(p.nom + ' ' + (p.description || '')).includes(t)).slice(0, 30);
  }
  function vueCommander() {
    const R = resultats();
    return '<div class="card mg-cmd">' +
      '<label class="mg-search"><span>🔍</span><input id="mg-q" type="search" autocomplete="off" enterkeyhint="search" placeholder="Chercher un produit (ex : nike 2467, 380…)" value="' + esc(q) + '"></label>' +
      '<div id="mg-res">' + listeResultats(R) + '</div></div>' +
      '<div class="card mg-panier"><h3>Ma commande' + (panier.length ? ' · ' + panier.length + ' produit' + (panier.length > 1 ? 's' : '') : '') + '</h3>' +
      (panier.length ? panier.map((l, i) => {
        const p = produit(l.produit_id), pc = parCarton(p) || l.par_carton || 0;
        return '<div class="mg-li"><div class="mg-li-n"><b>' + esc(l.nom) + '</b><small>' + (l.mode === 'carton' ? (pc ? pc + ' pièces par carton' : 'pièces par carton à confirmer par le dépôt') : 'à la pièce') + '</small></div>' +
          '<div class="mg-mode"><button type="button" data-mode="carton" data-i="' + i + '" class="' + (l.mode === 'carton' ? 'on' : '') + '">Cartons</button><button type="button" data-mode="piece" data-i="' + i + '" class="' + (l.mode === 'piece' ? 'on' : '') + '">Pièces</button></div>' +
          '<div class="mg-step"><button type="button" data-moins="' + i + '" aria-label="Moins">−</button><input type="number" inputmode="numeric" min="1" step="1" data-qte="' + i + '" value="' + l.qte + '"><button type="button" data-plus="' + i + '" aria-label="Plus">+</button></div>' +
          '<button type="button" class="mg-x" data-retirer="' + i + '" aria-label="Retirer">✕</button></div>';
      }).join('') +
      '<textarea id="mg-note" rows="2" maxlength="300" placeholder="Note pour le dépôt (facultatif)">' + esc(noteCmd) + '</textarea>' +
      '<button type="button" class="btn p mg-envoyer" data-envoyer="1">📤 Envoyer la commande au dépôt</button>'
      : '<p class="mg-vide">Cherchez un produit puis touchez « + Ajouter ».</p>') + '</div>';
  }
  function listeResultats(R) {
    if (!q) return '';
    if (!R.length) return '<p class="mg-vide">Aucun produit trouvé.</p>';
    return R.map(p => {
      const st = stockDepot(p.id), dans = panier.some(l => String(l.produit_id) === String(p.id)), pc = parCarton(p);
      return '<button type="button" class="mg-r' + (dans ? ' on' : '') + '" data-ajout="' + esc(p.id) + '"><span><b>' + esc(p.nom) + '</b><small>' +
        [st != null ? 'Dépôt : ' + nf(st) + ' pcs' : '', pc ? pc + ' pcs / carton' : ''].filter(Boolean).join(' · ') + '</small></span><em>' + (dans ? '✓ Ajouté' : '+ Ajouter') + '</em></button>';
    }).join('');
  }
  function majPanierVue() { renderMagasin(); }

  async function envoyerCommande() {
    const m = magasin(); if (!m) { say('Choisissez le magasin.'); return; }
    const L = panier.filter(l => Number(l.qte) > 0); if (!L.length) { say('Ajoutez au moins un produit.'); return; }
    const btn = document.querySelector('[data-envoyer]'); if (btn) { btn.disabled = true; btn.textContent = 'Envoi…'; }
    const d = iso(), base = 'CM-' + d.slice(2).replace(/-/g, '');
    const n = CMDS.filter(c => String(c.numero || '').startsWith(base)).length + 1;
    const lignes = L.map(l => { const p = produit(l.produit_id), pc = parCarton(p) || l.par_carton || 0;
      return { produit_id: l.produit_id, nom: l.nom, mode: l.mode, qte: Number(l.qte), par_carton: pc, pieces: l.mode === 'carton' ? (pc ? l.qte * pc : 0) : Number(l.qte), envoye: null, coche: false }; });
    const r = await sb.from('commandes_magasin').insert([{ numero: base + '-' + String(n).padStart(2, '0'), magasin_id: m.id, magasin_nom: m.nom, date_cmd: d, lignes, statut: 'envoyee', cree_par: qui(), note: noteCmd.trim() }]).select();
    if (r.error) { if (btn) { btn.disabled = false; btn.textContent = '📤 Envoyer la commande au dépôt'; } say('Erreur : ' + r.error.message); return; }
    panier = []; noteCmd = ''; q = ''; garderPanier(); ongletM = 'encours'; vibre();
    say('✔ Commande ' + (r.data && r.data[0] ? r.data[0].numero : '') + ' envoyée au dépôt.');
    await load();
  }

  /* =================== DÉPÔT (magasinier : Hamza) =================== */
  const coches = c => (c.lignes || []).filter(l => l.coche).length;
  const envoye = l => l.envoye != null && l.envoye !== '' ? Number(l.envoye) || 0 : (Number(l.pieces) || 0);
  function renderDepot() {
    const el = document.getElementById('dp-root'); if (!el) return;
    if (!charge) { el.innerHTML = '<div class="card">Chargement…</div>'; return; }
    if (erreur) { el.innerHTML = '<div class="card">' + esc(erreur) + '</div>'; return; }
    const filt = c => !filtreD || c.magasin_id === filtreD;
    const af = CMDS.filter(c => c.statut === 'envoyee' && filt(c)).sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
    const hi = CMDS.filter(c => c.statut !== 'envoyee' && filt(c));
    el.innerHTML = '<div class="hello mg-hello"><span class="fl"></span><div><h2>🏭 Dépôt — commandes des magasins</h2><p>Préparez chaque produit, cochez sa case, puis validez : le stock du dépôt est mis à jour et le bon daté est envoyé au magasin.</p></div></div>' +
      '<div class="mg-chips"><button type="button" data-fd="" class="' + (!filtreD ? 'on' : '') + '">Tous</button>' + MAGS.map(x => {
        const n = CMDS.filter(c => c.statut === 'envoyee' && c.magasin_id === x.id).length;
        return '<button type="button" data-fd="' + esc(x.id) + '" class="' + (filtreD === x.id ? 'on' : '') + '">' + esc(x.nom) + (n ? ' <i>' + n + '</i>' : '') + '</button>'; }).join('') + '</div>' +
      '<div class="at-tabs bs-tabs"><button type="button" data-od="a_preparer" class="' + (ongletD === 'a_preparer' ? 'on' : '') + '">À préparer (' + af.length + ')</button><button type="button" data-od="hist" class="' + (ongletD === 'hist' ? 'on' : '') + '">Envoyées (' + hi.filter(c => c.statut === 'livree').length + ')</button></div>' +
      (ongletD === 'a_preparer'
        ? (af.length ? af.map(c => carteCmd(c, true)).join('') : '<div class="card bs-vide">✔ Aucune commande à préparer.</div>')
        : (hi.length ? groupeParDate(hi.slice(0, 120), c => carteCmd(c, true)) : '<div class="card bs-vide">Aucune commande envoyée.</div>'));
  }
  function groupeParDate(list, f) {
    const g = new Map(); list.forEach(c => { const k = String(c.valide_le || c.date_cmd || c.created_at || '').slice(0, 10); if (!g.has(k)) g.set(k, []); g.get(k).push(c); });
    return [...g.entries()].map(([k, v]) => '<div class="mg-jour">' + (k ? fd(k) : '—') + '</div>' + v.map(f).join('')).join('');
  }
  function carteCmd(c, depot) {
    const L = c.lignes || [], n = coches(c), enCours = c.statut === 'envoyee', tout = L.length && n === L.length;
    const totalCmd = L.reduce((s, l) => s + (Number(l.pieces) || 0), 0), totalEnv = L.reduce((s, l) => s + envoye(l), 0);
    const etiquette = enCours ? (depot ? '<em class="bs-prog">' + n + ' / ' + L.length + '</em>' : '<em class="bs-prog">⏳ Au dépôt</em>')
      : c.statut === 'livree' ? '<em class="bs-ok">🚚 Envoyée</em>' : '<em class="bs-ok mg-ann">Annulée</em>';
    return '<div class="bs-card mg-card' + (enCours ? '' : ' bs-done') + '" data-cmd="' + esc(c.id) + '">' +
      '<div class="bs-head"><div><b>' + esc(c.numero || 'Commande') + '</b><span>🏬 ' + esc(c.magasin_nom) + '</span></div>' + etiquette + '</div>' +
      '<div class="bs-meta">' + ['📅 ' + fd(c.date_cmd), c.cree_par && 'par ' + esc(c.cree_par), L.length + ' produit' + (L.length > 1 ? 's' : ''), totalCmd ? nf(totalCmd) + ' pcs' : ''].filter(Boolean).join(' · ') + '</div>' +
      (c.note ? '<div class="mg-note">📝 ' + esc(c.note) + '</div>' : '') +
      (depot && enCours ? '<div class="bs-bar"><i style="width:' + (L.length ? Math.round(n / L.length * 100) : 0) + '%"></i></div>' : '') +
      '<div class="bs-lignes">' + L.map((l, i) => {
        if (depot && enCours) {
          return '<div class="mg-dl' + (l.coche ? ' on' : '') + '"><button type="button" class="bs-l' + (l.coche ? ' on' : '') + '" data-l="' + i + '"><i class="bs-cb">' + (l.coche ? '✓' : '') + '</i><span class="bs-n">' + esc(l.nom) + '<small>Demandé : ' + esc(fmtQ(l)) + (l.mode === 'carton' && !l.par_carton ? ' — indiquez les pièces envoyées' : '') + '</small></span><b class="bs-q">' + nf(envoye(l)) + ' pcs</b></button>' +
            '<label class="mg-env">Pièces envoyées<input type="number" inputmode="numeric" min="0" step="1" data-env="' + i + '" value="' + (l.envoye != null && l.envoye !== '' ? esc(l.envoye) : (l.pieces || '')) + '" placeholder="0"></label></div>';
        }
        return '<div class="bs-l mg-ro' + (enCours ? '' : ' on') + '"><i class="bs-cb">' + (enCours ? '' : '✓') + '</i><span class="bs-n">' + esc(l.nom) + '<small>Demandé : ' + esc(fmtQ(l)) + '</small></span><b class="bs-q">' + (enCours ? '' : nf(envoye(l)) + ' pcs') + '</b></div>';
      }).join('') + '</div>' +
      (enCours
        ? '<div class="bs-act">' + (depot ? (tout ? '<button type="button" class="btn p bs-valider" data-valcmd="' + esc(c.id) + '">✔ Valider et envoyer au magasin</button>'
            : '<button type="button" class="btn bs-valider" disabled>Cochez chaque produit préparé (' + n + ' / ' + L.length + ')</button>') : '') +
          '<button type="button" class="btn s d" data-anncmd="' + esc(c.id) + '">Annuler cette commande</button></div>'
        : c.statut === 'livree' ? '<div class="bs-valide">Envoyée par <b>' + esc(c.prepare_par || '?') + '</b> le ' + fdt(c.valide_le) + ' · ' + nf(totalEnv) + ' pièces' + (c.message ? '<p>« ' + esc(c.message) + ' »</p>' : '') +
          '<button type="button" class="btn s mg-pdf" data-pdf="' + esc(c.id) + '">📄 Bon de transfert (PDF)</button></div>' : '') +
      '</div>';
  }
  async function majLignes(c) {
    const r = await sb.from('commandes_magasin').update({ lignes: c.lignes }).eq('id', c.id);
    if (r.error) say('Erreur : ' + r.error.message);
  }
  function validerCmd(id) {
    const c = CMDS.find(x => x.id === id); if (!c || c.statut !== 'envoyee') return;
    if (coches(c) !== (c.lignes || []).length) { say('Cochez d’abord tous les produits.'); return; }
    const total = (c.lignes || []).reduce((s, l) => s + envoye(l), 0);
    const manque = (c.lignes || []).filter(l => { const st = stockDepot(l.produit_id); return st != null && envoye(l) > st; });
    const bg = document.createElement('div'); bg.className = 'cm-nv-bg';
    bg.innerHTML = '<form class="cm-nv"><h3 style="margin:0 0 6px">Envoyer ' + esc(c.numero) + ' au magasin ' + esc(c.magasin_nom) + '</h3>' +
      '<p class="cm-nv-p">' + (c.lignes || []).map(l => '• ' + esc(l.nom) + ' : <b>' + nf(envoye(l)) + ' pcs</b>').join('<br>') + '<br>Total : <b>' + nf(total) + ' pièces</b> sortent du stock du dépôt.</p>' +
      (manque.length ? '<p class="mg-warn">⚠ Stock du dépôt insuffisant pour : ' + manque.map(l => esc(l.nom) + ' (' + nf(stockDepot(l.produit_id)) + ' pcs)').join(', ') + '.</p>' : '') +
      '<label style="display:block;font-size:13px;color:var(--mut)">Message pour le magasin<textarea id="mg-msg" rows="3" maxlength="300" style="width:100%;margin-top:4px;font:inherit;font-size:16px;padding:10px;border:1px solid var(--line,#ddd);border-radius:10px;box-sizing:border-box" placeholder="Ex : envoyé avec le chauffeur, 1 carton manquant…"></textarea></label>' +
      '<div class="at-actions"><button class="btn p" type="submit">Valider et envoyer</button><button class="btn" type="button" id="mg-x">Retour</button></div></form>';
    document.body.appendChild(bg);
    bg.querySelector('#mg-x').onclick = () => bg.remove();
    bg.onclick = e => { if (e.target === bg) bg.remove(); };
    bg.querySelector('form').onsubmit = async e => {
      e.preventDefault();
      const btn = bg.querySelector('button[type=submit]'); btn.disabled = true; btn.textContent = 'Envoi…';
      const message = bg.querySelector('#mg-msg').value.trim(), d = iso();
      let sorti = !!c.stock_sorti;
      if (!sorti) {
        const rows = (c.lignes || []).filter(l => l.produit_id && envoye(l) > 0).map(l => ({ produit_id: l.produit_id, type: 'transfert', quantite: -envoye(l), date_mvt: d,
          client_nom: 'Magasin ' + c.magasin_nom, reference: c.numero, note: 'Commande magasin ' + c.numero + ' (envoyée par ' + qui() + ')' }));
        if (rows.length) {
          const r = await sb.from('pf_mouvements').insert(rows);
          if (r.error) { btn.disabled = false; btn.textContent = 'Valider et envoyer'; say('Erreur de stock : ' + r.error.message); return; }
          sorti = true;
        }
      }
      const lignes = (c.lignes || []).map(l => Object.assign({}, l, { envoye: envoye(l) }));
      const u = await sb.from('commandes_magasin').update({ statut: 'livree', prepare_par: qui(), valide_le: new Date().toISOString(), message, stock_sorti: sorti, lignes }).eq('id', c.id);
      if (u.error) { btn.disabled = false; btn.textContent = 'Valider et envoyer'; say('Erreur : ' + u.error.message); return; }
      bg.remove(); vibre(); say('🚚 Commande ' + c.numero + ' envoyée au magasin ' + c.magasin_nom + '.');
      if (window.PFAPI) { try { await PFAPI.load(); } catch (x) {} }
      document.dispatchEvent(new Event('mariabag:stock'));
      await load();
    };
  }

  /* ---------- Bon de transfert (PDF daté, gardé dans l'historique) ---------- */
  async function bonPdf(id) {
    const c = CMDS.find(x => x.id === id); if (!c) return;
    if (!(window.jspdf && window.jspdf.jsPDF)) { say('Bibliothèque PDF non chargée.'); return; }
    let ENT = {}; try { const p = await sb.from('parametres').select('*').eq('cle', 'entreprise'); ENT = (p.data && p.data[0] && p.data[0].valeur) || {}; } catch (e) {}
    const m = MAGS.find(x => x.id === c.magasin_id) || { nom: c.magasin_nom };
    const doc = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4' }), M = 14, W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight();
    const T = (t, x, y, o) => doc.text(pdfT(t), x, y, o);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(15); T(ENT.nom || 'MARIA BAG', M, 16);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(90);
    [[ENT.adresse, ENT.ville].filter(Boolean).join(', '), [ENT.tel && 'Tel : ' + ENT.tel, ENT.email].filter(Boolean).join('  -  ')].filter(Boolean).forEach((l, i) => T(l, M, 21 + i * 4));
    doc.setTextColor(0); doc.setFont('helvetica', 'bold'); doc.setFontSize(16); T('BON DE TRANSFERT', W - M, 16, { align: 'right' });
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10); T('N° ' + c.numero, W - M, 23, { align: 'right' });
    T('Commande du ' + fd(c.date_cmd) + '  -  Envoi le ' + fdt(c.valide_le), W - M, 29, { align: 'right' });
    doc.setDrawColor(180); doc.line(M, 33, W - M, 33);
    doc.setFontSize(8.5); doc.setTextColor(90); T('DE', M, 40); T('VERS', W / 2, 40);
    doc.setTextColor(0); doc.setFont('helvetica', 'bold'); doc.setFontSize(12); T('Depot', M, 46); T('Magasin ' + m.nom, W / 2, 46);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); T('Prepare par : ' + (c.prepare_par || ''), M, 51); T([m.responsable && 'Responsable : ' + m.responsable, 'Commande par : ' + (c.cree_par || '')].filter(Boolean).join('  -  '), W / 2, 51);
    const L = c.lignes || [];
    doc.autoTable({ startY: 57, margin: { left: M, right: M, bottom: 20 }, theme: 'grid', styles: { fontSize: 9, cellPadding: 2 }, headStyles: { fillColor: [74, 44, 42], textColor: 255 },
      head: [['#', 'Produit', 'Demande', 'Pieces envoyees']],
      body: L.map((l, i) => [String(i + 1), l.nom, fmtQ(l), nf(envoye(l))].map(pdfT)),
      foot: [['', 'TOTAL', '', nf(L.reduce((s, l) => s + envoye(l), 0))].map(pdfT)], footStyles: { fillColor: [240, 235, 236], textColor: 0, fontStyle: 'bold' },
      columnStyles: { 0: { cellWidth: 10 }, 3: { halign: 'right' } } });
    let y = doc.lastAutoTable.finalY + 8;
    doc.setFontSize(10);
    if (c.note) { doc.setTextColor(90); doc.splitTextToSize(pdfT('Note du magasin : ' + c.note), W - 2 * M).forEach(l => { doc.text(l, M, y); y += 5; }); }
    if (c.message) { doc.setTextColor(0); doc.splitTextToSize(pdfT('Message du depot : ' + c.message), W - 2 * M).forEach(l => { doc.text(l, M, y); y += 5; }); }
    y = Math.max(y + 10, H - 40);
    doc.setTextColor(60); doc.setFontSize(9); doc.setDrawColor(150);
    T('Magasinier (depot)', M, y); T('Recu par le magasin', W - M - 62, y); doc.line(M, y + 16, M + 60, y + 16); doc.line(W - M - 62, y + 16, W - M, y + 16);
    doc.save(('Bon_transfert_' + c.numero + '_' + m.nom).replace(/[^\w-]+/g, '_') + '.pdf'); say('PDF généré.');
  }

  /* ---------- Événements ---------- */
  const dansRoot = t => { const a = document.getElementById('mg-root'), b = document.getElementById('dp-root'); return (a && a.contains(t)) || (b && b.contains(t)); };
  document.addEventListener('click', async e => {
    if (!dansRoot(e.target)) return;
    const t = e.target;
    let b;
    if ((b = t.closest('[data-mag]'))) { magId = b.dataset.mag; try { localStorage.setItem(KEY_MAG, magId); } catch (x) {} renderMagasin(); return; }
    if ((b = t.closest('[data-om]'))) { ongletM = b.dataset.om; renderMagasin(); return; }
    if ((b = t.closest('[data-od]'))) { ongletD = b.dataset.od; renderDepot(); return; }
    if ((b = t.closest('[data-fd]'))) { filtreD = b.dataset.fd; renderDepot(); return; }
    if ((b = t.closest('[data-ajout]'))) {
      const p = produit(b.dataset.ajout); if (!p) return;
      const i = panier.findIndex(l => String(l.produit_id) === String(p.id));
      if (i >= 0) panier[i].qte += 1; else panier.push({ produit_id: p.id, nom: p.nom, mode: 'carton', qte: 1, par_carton: parCarton(p) });
      garderPanier(); vibre(); q = ''; majPanierVue(); return;
    }
    if ((b = t.closest('[data-mode]'))) { const l = panier[+b.dataset.i]; if (l) { l.mode = b.dataset.mode; garderPanier(); majPanierVue(); } return; }
    if ((b = t.closest('[data-plus]'))) { const l = panier[+b.dataset.plus]; if (l) { l.qte = (Number(l.qte) || 0) + 1; garderPanier(); majPanierVue(); } return; }
    if ((b = t.closest('[data-moins]'))) { const l = panier[+b.dataset.moins]; if (l) { l.qte = Math.max(1, (Number(l.qte) || 1) - 1); garderPanier(); majPanierVue(); } return; }
    if ((b = t.closest('[data-retirer]'))) { panier.splice(+b.dataset.retirer, 1); garderPanier(); majPanierVue(); return; }
    if (t.closest('[data-envoyer]')) { envoyerCommande(); return; }
    if ((b = t.closest('[data-pdf]'))) { bonPdf(b.dataset.pdf); return; }
    if ((b = t.closest('[data-valcmd]'))) { validerCmd(b.dataset.valcmd); return; }
    if ((b = t.closest('[data-anncmd]'))) {
      const c = CMDS.find(x => x.id === b.dataset.anncmd);
      if (c && confirm('Annuler la commande ' + c.numero + ' (' + c.magasin_nom + ') ? Rien ne sortira du stock.')) { await sb.from('commandes_magasin').update({ statut: 'annulee', message: 'Annulée par ' + qui() }).eq('id', c.id); await load(); }
      return;
    }
    const li = t.closest('#dp-root button.bs-l[data-l]');
    if (li) {
      const c = CMDS.find(x => x.id === li.closest('[data-cmd]').dataset.cmd); if (!c || c.statut !== 'envoyee') return;
      const l = c.lignes[+li.dataset.l]; l.coche = !l.coche; l.par = l.coche ? qui() : ''; l.le = l.coche ? new Date().toISOString() : null;
      li.closest('.mg-card').outerHTML = carteCmd(c, true); vibre();
      await majLignes(c);
    }
  });
  document.addEventListener('input', e => {
    const t = e.target;
    if (t.id === 'mg-q') { q = t.value; const r = document.getElementById('mg-res'); if (r) r.innerHTML = listeResultats(resultats()); return; }
    if (t.id === 'mg-note') { noteCmd = t.value; return; }
    if (t.dataset && t.dataset.qte != null && dansRoot(t)) { const l = panier[+t.dataset.qte]; if (l) { l.qte = Math.max(0, Math.round(Number(t.value) || 0)); garderPanier(); } }
  });
  document.addEventListener('change', async e => {
    const t = e.target;
    if (t.dataset && t.dataset.qte != null && dansRoot(t)) { const l = panier[+t.dataset.qte]; if (l && !l.qte) l.qte = 1; garderPanier(); renderMagasin(); return; }
    if (t.dataset && t.dataset.env != null && dansRoot(t)) {
      const c = CMDS.find(x => x.id === t.closest('[data-cmd]').dataset.cmd); if (!c) return;
      const l = c.lignes[+t.dataset.env]; l.envoye = t.value === '' ? null : Math.max(0, Math.round(Number(t.value) || 0));
      // pièces par carton apprises pour la prochaine fois
      if (l.mode === 'carton' && l.qte > 0 && l.envoye && !l.par_carton) {
        const pc = Math.round(l.envoye / l.qte), p = produit(l.produit_id);
        if (p && pc > 0 && !parCarton(p) && confirm('Enregistrer ' + pc + ' pièces par carton pour « ' + p.nom + ' » ?')) {
          l.par_carton = pc; p.par_carton = pc; await sb.from('produits').update({ par_carton: pc }).eq('id', p.id);
        }
      }
      const card = t.closest('.mg-card'); card.outerHTML = carteCmd(c, true);
      await majLignes(c);
    }
  });

  let tm = null;
  if (window.LocalDB && LocalDB.onChange) LocalDB.onChange(() => { clearTimeout(tm); tm = setTimeout(() => { const a = document.activeElement; if (a && dansRoot(a) && /INPUT|TEXTAREA/.test(a.tagName)) return; load(); }, 500); });
  document.addEventListener('mariabag:authenticated', load);
  window.MagasinsAPI = { load, commandes: () => CMDS, magasins: () => MAGS, aPreparer: () => CMDS.filter(c => c.statut === 'envoyee').length };
  window.loadMagasins = load;
})();
