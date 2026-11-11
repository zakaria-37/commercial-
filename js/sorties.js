/* ============================================================
   BONS DE SORTIE — du dépôt vers l'atelier (magasinier)
   1. Production crée le bon (« Envoyer au magasinier ») : modèle, quantité, atelier et
      la liste des éléments à sortir du dépôt (quantités calculées par la fiche matières).
   2. Le magasinier (ex. Azedine) ouvre « Bons de sortie », prend chaque élément au dépôt
      et coche sa case. Les cases cochées sont enregistrées (on peut s'arrêter et reprendre).
   3. Quand TOUT est coché, il valide le bon avec un message : le stock est sorti à ce moment-là,
      et la validation (qui, quand, message) apparaît dans la plateforme pour tout le monde.
   ============================================================ */
(function () {
  'use strict';
  const root = () => document.getElementById('bs-root');
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const nf = (n, d) => (Number(n) || 0).toLocaleString('fr-FR', { maximumFractionDigits: d == null ? 2 : d });
  const fd = s => s ? String(s).slice(0, 10).split('-').reverse().join('/') : '';
  const fdt = s => { if (!s) return ''; const d = new Date(s); return d.toLocaleDateString('fr-FR') + ' à ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }); };
  const qui = () => (window.APP_USER && (window.APP_USER.nom || window.APP_USER.email)) || 'Utilisateur';
  const say = t => { if (typeof toast === 'function') toast(t); };
  let BONS = [], onglet = 'a_preparer', charge = false, connus = null;

  async function load() {
    const r = await sb.from('bons_sortie').select('*').order('created_at', { ascending: false });
    const avant = connus; BONS = r.error ? [] : (r.data || []); charge = true;
    // notifications : nouveau bon (magasinier) / bon validé (production, administrateur)
    const etat = new Map(BONS.map(b => [b.id, b.statut]));
    if (avant) {
      const perm = v => typeof window.sectionPermise === 'function' ? window.sectionPermise(v) : true;
      BONS.forEach(b => {
        const a = avant.get(b.id);
        if (!a && b.statut === 'a_preparer' && perm('sorties')) say('📦 Nouveau bon de sortie : ' + b.numero + ' — ' + b.modele_nom);
        if (a === 'a_preparer' && b.statut === 'valide' && (perm('production') || perm('dash'))) say('✔ Bon ' + b.numero + ' validé par ' + (b.valide_par || '?') + (b.message ? ' : « ' + b.message + ' »' : ''));
      });
    }
    connus = etat;
    badge(); render();
    document.dispatchEvent(new Event('mariabag:sorties'));
  }
  function badge() {
    const n = BONS.filter(b => b.statut === 'a_preparer').length, btn = document.querySelector('nav button[data-v="sorties"]');
    if (btn) { btn.dataset.badge = n || ''; btn.classList.toggle('bs-has', n > 0); }
  }
  const coches = b => (b.lignes || []).filter(l => l.coche).length;

  function carte(b) {
    const L = b.lignes || [], n = coches(b), tout = L.length && n === L.length, enCours = b.statut === 'a_preparer';
    const peutAnnuler = enCours && (typeof window.sectionPermise !== 'function' || window.sectionPermise('production'));
    return '<div class="bs-card' + (enCours ? '' : ' bs-done') + '" data-bon="' + esc(b.id) + '">' +
      '<div class="bs-head"><div><b>' + esc(b.numero || 'Bon') + '</b><span>' + esc(b.modele_nom) + ' × ' + nf(b.quantite, 0) + ' pièces</span></div>' +
        (enCours ? '<em class="bs-prog">' + n + ' / ' + L.length + '</em>' : '<em class="bs-ok">✔ Validé</em>') + '</div>' +
      '<div class="bs-meta">' + [b.atelier && '🏭 ' + esc(b.atelier), b.chef && '👤 ' + esc(b.chef), b.date_bon && '📅 ' + fd(b.date_bon), b.cree_par && 'créé par ' + esc(b.cree_par)].filter(Boolean).join(' · ') + '</div>' +
      (enCours ? '<div class="bs-bar"><i style="width:' + (L.length ? Math.round(n / L.length * 100) : 0) + '%"></i></div>' : '') +
      '<div class="bs-lignes">' + L.map((l, i) => '<button type="button" class="bs-l' + (l.coche ? ' on' : '') + '" data-l="' + i + '"' + (enCours ? '' : ' disabled') + '>' +
        '<i class="bs-cb">' + (l.coche ? '✓' : '') + '</i><span class="bs-n">' + esc(l.nom) + (l.note ? '<small>' + esc(l.note) + '</small>' : '') + '</span><b class="bs-q">' + esc(l.txt || nf(l.qte, 2) + ' ' + (l.unite || '')) + '</b></button>').join('') + '</div>' +
      (enCours
        ? '<div class="bs-act">' + (tout ? '<button type="button" class="btn p bs-valider" data-val="' + esc(b.id) + '">✔ Valider le bon de sortie</button>'
            : '<button type="button" class="btn bs-valider" disabled>Cochez chaque élément pris au dépôt (' + n + ' / ' + L.length + ')</button>') +
          (peutAnnuler ? '<button type="button" class="btn s d" data-ann="' + esc(b.id) + '">Annuler ce bon</button>' : '') + '</div>'
        : '<div class="bs-valide">Validé par <b>' + esc(b.valide_par || '?') + '</b> le ' + fdt(b.valide_le) + (b.message ? '<p>« ' + esc(b.message) + ' »</p>' : '') + (b.stock_sorti ? '<small>Stock sorti automatiquement à la validation.</small>' : '') + '</div>') +
      '</div>';
  }
  function render() {
    const el = root(); if (!el) return;
    if (!charge) { el.innerHTML = '<div class="card">Chargement…</div>'; return; }
    const af = BONS.filter(b => b.statut === 'a_preparer'), va = BONS.filter(b => b.statut === 'valide');
    const list = onglet === 'a_preparer' ? af : va.slice(0, 40);
    el.innerHTML = '<div class="hello bs-hello"><span class="fl"></span><div><h2>Bons de sortie</h2><p>Prenez chaque élément au dépôt, cochez sa case, puis validez le bon : le stock est mis à jour et l’équipe est prévenue.</p></div></div>' +
      '<div class="at-tabs bs-tabs"><button type="button" data-o="a_preparer" class="' + (onglet === 'a_preparer' ? 'on' : '') + '">À préparer (' + af.length + ')</button><button type="button" data-o="valide" class="' + (onglet === 'valide' ? 'on' : '') + '">Validés (' + va.length + ')</button></div>' +
      (list.length ? list.map(carte).join('') : '<div class="card bs-vide">' + (onglet === 'a_preparer' ? '✔ Aucun bon à préparer pour le moment.' : 'Aucun bon validé.') + '</div>');
  }

  async function majLignes(b) {
    const r = await sb.from('bons_sortie').update({ lignes: b.lignes }).eq('id', b.id);
    if (r.error) say('Erreur : ' + r.error.message);
  }
  async function valider(id) {
    const b = BONS.find(x => x.id === id); if (!b || b.statut !== 'a_preparer') return;
    if (coches(b) !== (b.lignes || []).length) { say('Cochez d’abord tous les éléments.'); return; }
    const bg = document.createElement('div'); bg.className = 'cm-nv-bg';
    bg.innerHTML = '<form class="cm-nv"><h3 style="margin:0 0 6px">Valider ' + esc(b.numero) + '</h3><p class="cm-nv-p">' + esc(b.modele_nom) + ' × ' + nf(b.quantite, 0) + ' pièces' + (b.atelier ? ' → ' + esc(b.atelier) : '') + '. Tous les éléments sont pris au dépôt.</p>' +
      '<label style="display:block;font-size:13px;color:var(--mut)">Message de validation<textarea id="bs-msg" rows="3" maxlength="300" style="width:100%;margin-top:4px;font:inherit;font-size:16px;padding:10px;border:1px solid var(--line,#ddd);border-radius:10px;box-sizing:border-box" placeholder="Ex : tout est remis à l’atelier, 2 rouleaux entamés…"></textarea></label>' +
      '<div class="at-actions"><button class="btn p" type="submit">Valider et envoyer</button><button class="btn" type="button" id="bs-x">Retour</button></div></form>';
    document.body.appendChild(bg);
    bg.querySelector('#bs-x').onclick = () => bg.remove();
    setTimeout(() => bg.querySelector('#bs-msg').focus(), 50);
    bg.querySelector('form').onsubmit = async e => {
      e.preventDefault();
      const btn = bg.querySelector('button[type=submit]'); btn.disabled = true; btn.textContent = 'Validation…';
      const message = bg.querySelector('#bs-msg').value.trim();
      let sorti = !!b.stock_sorti;
      if (!sorti && window.StockAPI) {
        try { await StockAPI.load(); } catch (x) {}
        const items = (b.lignes || []).filter(l => l.article_id && Number(l.qte) > 0).map(l => ({ article_id: l.article_id, qte: Number(l.qte) }));
        if (items.length) {
          const r = await StockAPI.sortie(items, b.numero, 'Bon de sortie ' + b.numero + ' — ' + b.modele_nom + ' × ' + b.quantite + (b.atelier ? ' → ' + b.atelier : '') + ' (validé par ' + qui() + ')', 'production');
          if (r.error) { btn.disabled = false; btn.textContent = 'Valider et envoyer'; say('Erreur de stock : ' + (r.error.message || r.error)); return; }
          sorti = true;
          document.dispatchEvent(new Event('mariabag:stock'));
        }
      }
      const u = await sb.from('bons_sortie').update({ statut: 'valide', valide_par: qui(), valide_le: new Date().toISOString(), message, stock_sorti: sorti }).eq('id', b.id);
      if (u.error) { btn.disabled = false; btn.textContent = 'Valider et envoyer'; say('Erreur : ' + u.error.message); return; }
      bg.remove(); say('✔ Bon ' + b.numero + ' validé. Le stock est mis à jour et l’équipe est prévenue.');
      await load();
    };
  }

  document.addEventListener('click', async e => {
    const el = root(); if (!el || !el.contains(e.target)) return;
    const o = e.target.closest('[data-o]'); if (o) { onglet = o.dataset.o; render(); return; }
    const li = e.target.closest('.bs-l'); if (li && !li.disabled) {
      const b = BONS.find(x => x.id === li.closest('[data-bon]').dataset.bon); if (!b) return;
      const l = b.lignes[+li.dataset.l]; l.coche = !l.coche; l.par = l.coche ? qui() : ''; l.le = l.coche ? new Date().toISOString() : null;
      const card = li.closest('.bs-card'); card.outerHTML = carte(b);       // mise à jour instantanée de la carte
      if (navigator.vibrate) try { navigator.vibrate(12); } catch (x) {}
      await majLignes(b); return;
    }
    const v = e.target.closest('[data-val]'); if (v) { valider(v.dataset.val); return; }
    const a = e.target.closest('[data-ann]');
    if (a) { const b = BONS.find(x => x.id === a.dataset.ann); if (b && confirm('Annuler le bon ' + b.numero + ' ? Rien ne sera sorti du stock.')) { await sb.from('bons_sortie').update({ statut: 'annule' }).eq('id', b.id); await load(); } }
  });

  /* Création depuis la Production */
  async function creer(b) {
    const r = await sb.from('bons_sortie').insert([Object.assign({ statut: 'a_preparer', cree_par: qui(), date_bon: new Date().toISOString().slice(0, 10) }, b)]).select();
    if (r.error) return { error: r.error };
    await load(); return { bon: r.data && r.data[0] };
  }

  let t = null;
  if (window.LocalDB && LocalDB.onChange) LocalDB.onChange(() => { clearTimeout(t); t = setTimeout(load, 400); });
  document.addEventListener('mariabag:authenticated', load);
  const nb = document.querySelector('nav button[data-v="sorties"]'); if (nb) nb.addEventListener('click', load);
  window.BonsSortie = { creer, load, liste: () => BONS };
  window.loadSorties = load;
})();
