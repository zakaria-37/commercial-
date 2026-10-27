/* ============================================================
   ZACKsmart : assistant de la plateforme (aide à l'utilisation + conseils commerciaux).
   Appelle la fonction Supabase « zacksmart » (la clé de l'IA reste côté serveur).
   Sans connexion ou sans clé IA : réponses locales de secours (FAQ de la plateforme).
   ============================================================ */
(function () {
  'use strict';
  const $ = s => document.querySelector(s);
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const KEY = 'zacksmart_hist';
  const SUGG = ['Aide-moi à organiser ma semaine commerciale', 'Plan pour prospecter les grandes surfaces', 'Comment négocier le prix avec une grande surface ?', 'Comment fixer mon prix de vente et ma marge ?', 'Comment diriger et suivre le travail de l’équipe ?', 'Comment faire une facture ?'];
  const FAQ = [
    [['facture', 'devis', 'bon de commande'], 'Pour faire une facture : menu **Commerce** → onglet Factures → « + Nouvelle facture ». Choisissez le client, ajoutez les lignes (produit, quantité, prix), le mode de paiement (cash, à terme ou versement) puis enregistrez. Le PDF se télécharge depuis la liste. Le stock des produits finis diminue automatiquement.'],
    [['rendez-vous', 'rdv', 'grande surface', 'prospect'], 'Pour noter un rendez-vous : menu **Notes** → onglet Rendez-vous → « + Nouveau rendez-vous ». Indiquez l’objet, la date, l’heure, le lieu, le type (grande surface, client, prospect) et ce que vous voulez proposer. Après le rendez-vous, cliquez sur **Fait** et écrivez le résultat.'],
    [['note', 'pense', 'rappel', 'oublier'], 'Pour un pense-bête : menu **Notes** → onglet Notes personnelles → « + Nouvelle note ». Choisissez une couleur, une catégorie et une date de rappel. Cochez la case quand c’est fait ; l’épingle 📌 garde la note en haut.'],
    [['fiche de paie', 'paie', 'salaire'], 'Fiche de paie : menu **Employés** → bouton « Pointage » de l’employé → bloc « Fiche de paie » : choisissez les dates Du/Au puis « Imprimer la fiche de paie (PDF) ». Elle montre les heures, les absences, les acomptes et le net sans heures sup.'],
    [['pointage', 'absent', 'absence', 'heure'], 'Pointage : menu **Employés** → « Pointage » de l’employé. Saisissez le début et la fin de chaque jour, ou utilisez les boutons Présent / Absent / Effacer. Les heures après 19h sont comptées en heures sup, à part.'],
    [['heure sup', 'heures sup', 'supplementaire'], 'Les heures sup sont mises de côté : voir « Cumul des heures sup » sous le tableau des salaires (Employés). Quand vous les remettez à l’employé, enregistrez « Remettre des heures sup » dans son Pointage.'],
    [['credit', 'avance', 'retenue'], 'Crédit personnel : dans le Pointage d’un employé, section « Crédit personnel » → « + Accorder un crédit ». En fin de mois, « Retenue sur le salaire du mois » déduit le remboursement et le crédit diminue.'],
    [['commande', 'livrer', 'livraison', 'bon de livraison'], 'Commandes : menu **Ateliers** → Suivi & commandes. Une nouvelle production crée sa commande automatiquement. Quand elle est terminée, cliquez sur « Livrer au client » : le bon de livraison est créé et le stock diminue.'],
    [['stock', 'yard', 'rouleau', 'tissu', 'article'], 'Stock : menu **Stock** → « Éléments » pour les matières. Pour un rouleau en yards, tapez la valeur dans la case « en yards » : elle est convertie en mètres (1 yard = 0,9144 m).'],
    [['atelier', 'facon', 'paiement atelier'], 'Paiement des ateliers : menu **Ateliers** → onglet Paiements ateliers. Indiquez le prix de façon dans la production, puis « Payer » pour enregistrer un paiement et imprimer le bon PDF.'],
    [['inventaire', 'comptage'], 'Inventaire : menu **Inventaire** → créez un inventaire (ex. 2026), saisissez les quantités ; le bouton « Fiche de comptage » génère un PDF à remplir dans l’atelier.'],
    [['sauvegarde', 'copie', 'export'], 'Sauvegarde : bouton **Sauvegarde** en haut de l’écran pour télécharger une copie complète de vos données. Faites-le régulièrement.'],
    [['contact', 'client', 'fournisseur'], 'Contacts : menu **Contacts** → liste des clients et fournisseurs, avec les onglets Clients/Fournisseurs (classement), Chiffre d’affaires et Paiements (soldes).'],
  ];
  let msgs = [], busy = false, deep = true, big = false;
  try { deep = localStorage.getItem('zacksmart_deep') !== '0'; big = localStorage.getItem('zacksmart_big') === '1'; } catch (e) { /* valeurs par défaut */ }
  try { msgs = JSON.parse(localStorage.getItem(KEY) || '[]').slice(-30); } catch (e) { msgs = []; }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(msgs.slice(-30))); } catch (e) { /* stockage indisponible */ } };   // copie locale : affichage immédiat
  /* Conversation synchronisée : un message = une ligne de la table zacksmart_messages (même profil = même conversation sur PC, téléphone, tablette) */
  const TBL = 'zacksmart_messages', MAX = 200;
  const owner = () => (window.APP_USER && window.APP_USER.id) ? String(window.APP_USER.id) : 'partage';
  let sync = true;   // false si la table n'existe pas encore : on reste en mode local
  async function lire() {
    if (!sync) return null;
    const r = await sb.from(TBL).select('*');
    if (r.error) { sync = false; return null; }
    const me = owner();
    return (r.data || []).filter(x => x.proprietaire === me).sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)) || String(a.id).localeCompare(String(b.id))).map(x => ({ id: x.id, role: x.role, content: x.content }));
  }
  async function ecrire(role, content) {
    const row = { proprietaire: owner(), role, content, created_at: new Date().toISOString() };
    if (!sync) return { role, content };
    const r = await sb.from(TBL).insert([row]).select();
    if (r.error || !r.data || !r.data[0]) { sync = false; return { role, content }; }
    return { id: r.data[0].id, role, content };
  }
  async function elaguer() {
    const l = await lire(); if (!l || l.length <= MAX) return;
    for (const m of l.slice(0, l.length - MAX)) await sb.from(TBL).delete().eq('id', m.id);
  }
  async function rafraichir(force) {
    if (busy && !force) return;
    if (sync && msgs.some(m => !m.id)) return;   // un message vient d'être envoyé : on attend qu'il soit enregistré
    const l = await lire(); if (!l) return;
    const sig = a => a.length + ':' + (a.length ? a[a.length - 1].id : '');
    if (sig(l) !== sig(msgs.filter(m => m.id))) { msgs = l; save(); paint(); }
  }

  const md = t => { let h = esc(t).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>'); const lines = h.split('\n'), out = []; let ul = false;
    lines.forEach(l => { const m = /^\s*(?:[-•*]|\d+[.)])\s+(.*)$/.exec(l); if (m) { if (!ul) { out.push('<ul>'); ul = true; } out.push('<li>' + m[1] + '</li>'); } else { if (ul) { out.push('</ul>'); ul = false; } out.push(l ? l + '<br>' : '<br>'); } });
    if (ul) out.push('</ul>'); return out.join('').replace(/(<br>)+$/, ''); };
  const faq = q => { const n = norm(q); let best = null, sc = 0; FAQ.forEach(([ks, a]) => { const s = ks.filter(k => n.includes(norm(k))).length; if (s > sc) { sc = s; best = a; } }); return best; };
  const page = () => { const b = document.querySelector('nav button.on'); return b ? b.textContent.trim() : ''; };

  function build() {
    if ($('#zs-btn')) return;
    const b = document.createElement('button'); b.id = 'zs-btn'; b.type = 'button'; b.innerHTML = '<span class="zs-av">Z</span>ZACKsmart'; b.title = 'Assistant ZACKsmart';
    const p = document.createElement('div'); p.id = 'zs-panel';
    p.innerHTML = '<header><span class="zs-av">Z</span><div><b>ZACKsmart</b><small>Conseiller commercial et guide de la plateforme</small></div><button type="button" id="zs-deep" title="Mode discussion approfondie (réponses détaillées)">🧠</button><button type="button" id="zs-big" title="Agrandir / réduire">⤢</button><button type="button" id="zs-clear" title="Effacer la conversation">🗑</button><button type="button" id="zs-close" title="Fermer">✕</button></header>' +
      '<div id="zs-msgs"></div><form id="zs-form"><textarea id="zs-input" rows="1" maxlength="1000" placeholder="Posez votre question…"></textarea><button id="zs-send" type="submit">Envoyer</button></form>';
    document.body.appendChild(b); document.body.appendChild(p);
    const vue = () => { p.classList.toggle('big', big); $('#zs-deep').classList.toggle('act', deep); $('#zs-deep').title = deep ? 'Discussion approfondie : ACTIVÉE (cliquer pour réponses courtes)' : 'Réponses courtes (cliquer pour activer la discussion approfondie)'; $('#zs-input').placeholder = deep ? 'Décrivez votre situation ou posez votre question…' : 'Posez votre question…'; };
    $('#zs-deep').onclick = () => { deep = !deep; try { localStorage.setItem('zacksmart_deep', deep ? '1' : '0'); } catch (e) { /* ok */ } vue(); };
    $('#zs-big').onclick = () => { big = !big; try { localStorage.setItem('zacksmart_big', big ? '1' : '0'); } catch (e) { /* ok */ } vue(); };
    vue();
    // iPhone : le panneau suit la zone réellement visible (le clavier ne cache plus le champ) et la page derrière ne défile pas
    const mobile = () => window.matchMedia('(max-width:700px)').matches, vv = window.visualViewport;
    const fit = () => { if (!mobile()) { p.style.removeProperty('--zs-h'); p.style.removeProperty('--zs-top'); return; }
      p.style.setProperty('--zs-h', (vv ? vv.height : window.innerHeight) + 'px'); p.style.setProperty('--zs-top', (vv ? vv.offsetTop : 0) + 'px');
      const m = $('#zs-msgs'); if (m) m.scrollTop = m.scrollHeight; };
    // sur téléphone la barre de navigation est en bas : le bouton se place juste au-dessus
    const placeBtn = () => { const n = document.querySelector('nav'); if (!n || !mobile()) { document.documentElement.style.removeProperty('--zs-nav'); return; }
      const r = n.getBoundingClientRect(), pos = getComputedStyle(n).position; if ((pos === 'fixed' || pos === 'sticky') && r.top > window.innerHeight / 2) document.documentElement.style.setProperty('--zs-nav', Math.max(0, Math.round(window.innerHeight - r.top - parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--sab') || 0))) + 'px'); };
    placeBtn(); window.addEventListener('resize', placeBtn); window.addEventListener('orientationchange', () => setTimeout(placeBtn, 300)); setTimeout(placeBtn, 800);
    const lock = on => document.documentElement.classList.toggle('zs-lock', !!on && mobile());
    const ouvrir = () => { p.classList.add('on'); lock(true); fit(); paint(); if (!mobile()) $('#zs-input').focus(); if (window.LocalDB && LocalDB.sync) LocalDB.sync().catch(() => {}); rafraichir(); };
    const fermer = () => { p.classList.remove('on'); lock(false); };
    if (vv) { vv.addEventListener('resize', fit); vv.addEventListener('scroll', fit); }
    window.addEventListener('orientationchange', () => setTimeout(fit, 250)); window.addEventListener('resize', fit);
    $('#zs-input').addEventListener('focus', () => setTimeout(fit, 300));
    b.onclick = () => { if (p.classList.contains('on')) fermer(); else ouvrir(); };
    $('#zs-close').onclick = fermer;
    $('#zs-clear').onclick = async () => { if (!msgs.length || confirm('Effacer la conversation sur tous vos appareils ?')) { msgs = []; save(); paint(); if (sync) await sb.from(TBL).delete().eq('proprietaire', owner()); } };
    $('#zs-form').onsubmit = e => { e.preventDefault(); send($('#zs-input').value); };
    $('#zs-input').addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send($('#zs-input').value); } });
    paint();
  }
  function paint() {
    const box = $('#zs-msgs'); if (!box) return;
    let h = '<div class="zs-m bot">Bonjour 👋 Je suis <b>ZACKsmart</b>, développé par l’ingénieur <b>Benouadah Zakaria</b>. Je suis votre agent intelligent pour la société <b>Maria Bag</b> : je vous explique la plateforme et je vous conseille dans votre travail commercial (rendez-vous, prix, relances, organisation du travail…).</div>';
    if (!msgs.length) h += '<div class="zs-chips">' + SUGG.map(s => '<button type="button" data-q="' + esc(s) + '">' + esc(s) + '</button>').join('') + '</div>';
    msgs.forEach(m => { h += '<div class="zs-m ' + (m.role === 'user' ? 'me' : m.note ? 'note' : 'bot') + '">' + (m.role === 'user' ? esc(m.content).replace(/\n/g, '<br>') : md(m.content)) + '</div>'; });
    if (busy) h += '<div class="zs-m bot zs-dots"><span></span><span></span><span></span></div>';
    box.innerHTML = h; box.scrollTop = box.scrollHeight;
    box.querySelectorAll('[data-q]').forEach(x => x.onclick = () => send(x.dataset.q));
  }
  async function send(text) {
    text = String(text || '').trim(); if (!text || busy) return;
    $('#zs-input').value = ''; const mu = { role: 'user', content: text }; msgs.push(mu); busy = true; $('#zs-send').disabled = true; paint(); save();
    ecrire('user', text).then(x => { if (x.id) mu.id = x.id; });
    let rep = null, note = false;
    try {
      if (!navigator.onLine) throw new Error('offline');
      const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 60000);
      const r = await fetch(SUPABASE_URL + '/functions/v1/zacksmart', { method: 'POST', signal: ctl.signal, headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + SUPABASE_ANON_KEY },
        body: JSON.stringify({ messages: msgs.filter(m => !m.note).slice(-16).map(m => ({ role: m.role, content: m.content })), page: page(), deep }) });
      clearTimeout(t);
      const d = await r.json().catch(() => ({}));
      if (r.ok && d.reply) rep = d.reply;
      else if (d.error === 'rate') { rep = 'Vous écrivez très vite 🙂 Patientez quelques secondes puis réessayez.'; note = true; }
      else throw new Error(d.error || 'http ' + r.status);
    } catch (e) {
      const f = faq(text), off = !navigator.onLine || e.message === 'offline', cfg = e.message === 'not_configured', salut = /^\s*(salut|bonjour|bonsoir|salam|slm|hello|coucou|hi)\b/i.test(text);
      rep = (off ? 'Vous êtes hors ligne : réponse de secours.' : cfg ? 'ZACKsmart n’est pas encore activé en mode intelligent : la clé de l’IA n’a pas encore été ajoutée côté serveur (Supabase → Edge Functions → Secrets → AI_API_KEY). En attendant, voici une aide de base.' : 'L’assistant intelligent ne répond pas pour le moment (' + esc(e.message) + ') : réponse de secours.') + '\n' +
        (salut ? 'Bonjour ! Je suis ZACKsmart 😊 Une fois activé, nous pourrons discuter en profondeur de votre travail commercial et de l’organisation du travail.' : f ? f : 'Je n’ai pas de réponse prête pour cette question. Reformulez avec des mots comme « facture », « rendez-vous », « fiche de paie », « stock »…');
      note = false;
    }
    const ma = { role: 'assistant', content: rep, note }; msgs.push(ma); busy = false; $('#zs-send').disabled = false; paint(); save();
    ecrire('assistant', rep).then(x => { if (x.id) ma.id = x.id; elaguer(); });
  }

  document.addEventListener('mariabag:authenticated', () => { build(); $('#zs-btn').classList.add('on'); setTimeout(() => rafraichir(true), 1500); });
  // autres appareils : on relit la conversation régulièrement quand la fenêtre est ouverte, et au retour sur l'application
  setInterval(() => { const p = $('#zs-panel'); if (p && p.classList.contains('on') && document.visibilityState === 'visible') rafraichir(); }, 6000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && $('#zs-btn')) rafraichir(); });
  // déconnexion : on masque l'assistant quand l'écran de connexion est affiché (la connexion par ancien mot de passe n'a pas de profil)
  document.addEventListener('mariabag:profil', () => setTimeout(() => { const l = $('#login'), b = $('#zs-btn'), p = $('#zs-panel');
    if (l && b && getComputedStyle(l).display !== 'none') { b.classList.remove('on'); if (p) p.classList.remove('on'); document.documentElement.classList.remove('zs-lock'); } }, 60));
})();
