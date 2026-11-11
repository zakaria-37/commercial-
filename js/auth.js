/* ---------- Connexion : comptes utilisateurs (Supabase Auth) + accès provisoire par mot de passe ----------
   - Comptes : e-mail + mot de passe, rôles (admin / équipe), approbation par l'administrateur.
   - Hors ligne : la session reste enregistrée sur le PC ; on peut continuer à travailler sans internet.
   - AUTH_REQUIRED (config.js) : true = le mot de passe provisoire est désactivé. */
(function(){
  const SESSION_KEY = 'mariabag_session_ok', PROFIL_KEY = 'mariabag_profil', PROFIL_TTL = 30 * 86400000;
  const REQUIRED = typeof AUTH_REQUIRED !== 'undefined' && AUTH_REQUIRED;
  const remote = () => (window.LocalDB && LocalDB.remote) ? LocalDB.remote() : null;
  const $l = id => document.getElementById(id);
  let mode = 'login', profil = null, quitter = false;   // quitter = déconnexion demandée par l'utilisateur

  /* Barrière de synchronisation : rien n'est envoyé ni téléchargé sans compte connecté (si obligatoire) */
  if (window.LocalDB && LocalDB.setGate) LocalDB.setGate(async () => {
    if (!REQUIRED) return true;
    const r = remote(); if (!r) return false;
    const { data } = await r.auth.getSession();
    return !!(data && data.session);
  });

  function showApp(p){
    profil = p || null;
    window.APP_USER = profil;
    document.body.dataset.role = profil ? profil.role : 'provisoire';
    const w = document.querySelector('.who b'); if (w && profil && profil.nom) w.textContent = profil.nom;
    document.getElementById('login').classList.add('hide');
    document.getElementById('app').classList.remove('hide');
    document.dispatchEvent(new Event('mariabag:authenticated'));
    document.dispatchEvent(new CustomEvent('mariabag:profil', { detail: profil }));
  }
  function showLogin(msg){
    profil = null; window.APP_USER = null; document.body.dataset.role = '';
    document.dispatchEvent(new CustomEvent('mariabag:profil', { detail: null }));
    document.getElementById('app').classList.add('hide');
    document.getElementById('login').classList.remove('hide');
    const p = $l('lp'); if (p) { p.value = ''; p.type = 'password'; }
    setMode(mode === 'reset' ? 'login' : mode);
    if (msg) $l('lerr').textContent = msg;
  }
  const cache = p => { try { localStorage.setItem(PROFIL_KEY, JSON.stringify(Object.assign({}, p, { t: Date.now() }))); } catch (e) {} };
  const cached = id => { try { const p = JSON.parse(localStorage.getItem(PROFIL_KEY) || 'null'); return p && p.id === id && Date.now() - p.t < PROFIL_TTL ? p : null; } catch (e) { return null; } };
  const uncache = () => { try { localStorage.removeItem(PROFIL_KEY); } catch (e) {} };

  /* ----- Connexion SANS Internet -----
     Après une connexion réussie en ligne, une empreinte du mot de passe (SHA-256 salée, jamais le mot de passe)
     est gardée sur cet appareil : la même adresse e-mail et le même mot de passe ouvrent ensuite l'application hors ligne.
     Première fois sur un appareil sans Internet : le mot de passe d'accès de secours (APP_PASSWORD) est accepté. */
  const HL_KEY = 'mariabag_hors_ligne';
  async function empreinte(sel, em, mdp){
    const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(sel + ':' + em.toLowerCase() + ':' + mdp));
    return Array.from(new Uint8Array(b)).map(x => x.toString(16).padStart(2, '0')).join('');
  }
  async function memoriser(em, mdp, p){
    try { const t = JSON.parse(localStorage.getItem(HL_KEY) || '{}'), sel = Array.from(crypto.getRandomValues(new Uint8Array(16))).map(x => x.toString(16).padStart(2, '0')).join('');
      t[em.toLowerCase()] = { sel, h: await empreinte(sel, em, mdp), profil: p }; localStorage.setItem(HL_KEY, JSON.stringify(t)); } catch (e) {}
  }
  async function horsLigne(em, mdp){
    try { const x = JSON.parse(localStorage.getItem(HL_KEY) || '{}')[em.toLowerCase()];
      if (x) return (await empreinte(x.sel, em, mdp)) === x.h ? { ok: true, profil: x.profil } : { ok: false };
    } catch (e) {}
    if (!REQUIRED && mdp === APP_PASSWORD) return { ok: true, profil: null, secours: true };
    return { ok: false, inconnu: true };
  }

  /* « oussama » → compte créé par l'administrateur (oussama@mariabag.app) ; une adresse e-mail reste telle quelle */
  function identifiant(v) {
    v = String(v || '').trim().toLowerCase();
    if (!v || v.includes('@')) return v;
    return v.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9._-]/g, '') + '@mariabag.app';
  }
  const versProfil = p => ({ id: p.id, email: p.email, nom: p.nom || '', role: p.role, sections: Array.isArray(p.sections) && p.sections.length ? p.sections : null, theme: p.theme || '' });
  /* Lit le profil (rôle) du compte connecté ; null si introuvable */
  async function lireProfil(user){
    const r = remote(); if (!r) return null;
    const q = await r.from('profils').select('*').eq('id', user.id).maybeSingle();
    if (q.error) return 'reseau';                       // toute erreur (réseau, jeton expiré, serveur lent) : on ne déconnecte pas, on garde le profil connu
    if (!q.data) return null;                           // requête réussie mais aucune ligne : compte vraiment non enregistré
    return q.data;
  }
  async function entrer(user, silencieux){
    let p = await lireProfil(user);
    if (p === 'reseau') { p = cached(user.id); if (!p) { showLogin('Connexion impossible : vérifiez internet pour la première ouverture.'); return false; } }
    if (!p) { await remote().auth.signOut(); showLogin('Ce compte n’est pas enregistré. Contactez l’administrateur.'); return false; }
    if (p.role === 'en_attente') { await remote().auth.signOut(); uncache(); showLogin('Votre compte est créé. Il doit être approuvé par l’administrateur avant l’accès.'); return false; }
    if (p.role === 'desactive') { await remote().auth.signOut(); uncache(); showLogin('Ce compte est désactivé.'); return false; }
    const pr = versProfil(p); cache(pr);
    try { remote().rpc('touch_login'); } catch (e) {}
    showApp(pr); return true;
  }

  /* ----- Démarrage : session de compte existante, ou ancien accès provisoire ----- */
  async function init(){
    const r = remote();
    if (r) {
      r.auth.onAuthStateChange((ev) => {
        if (ev === 'SIGNED_OUT') {
          if (quitter) { uncache(); if (!$l('app').classList.contains('hide')) showLogin(); return; }
          // déconnexion qui ne vient pas de vous (jeton non renouvelé, onglet voisin…) : on revérifie avant de vous renvoyer à l'écran de connexion
          setTimeout(async () => { try { const s = await r.auth.getSession(); if (s && s.data && s.data.session) return;
            if (!navigator.onLine) return;                                  // hors ligne : on reste dans l'application
            if (!$l('app').classList.contains('hide')) { uncache(); showLogin('Votre session a expiré : reconnectez-vous.'); } } catch (e) { /* on reste connecté */ } }, 1500);
        }
        if (ev === 'PASSWORD_RECOVERY') { setMode('reset'); document.getElementById('login').classList.remove('hide'); }
      });
      try {
        const { data } = await r.auth.getSession();
        if (data && data.session) {
          const c = cached(data.session.user.id);
          if (c) { showApp(c); entrer(data.session.user, true); return; }      // ouverture immédiate, rôle revérifié en arrière-plan
          if (await entrer(data.session.user)) return;
          return;
        }
      } catch (e) { /* hors ligne sans session : écran de connexion */ }
    }
    if (!REQUIRED && sessionStorage.getItem(SESSION_KEY) === '1') showApp(null);
  }
  // le client Supabase est créé par app.js (chargé après ce fichier) : on démarre une fois tout le code chargé
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();

  /* Ouverture : salutation selon l'heure, horloge vivante, œil, alerte majuscules, essais limités */
  function salut() {
    const h = new Date().getHours();
    $l('lhello').textContent = h < 12 ? 'Bonjour' : h < 18 ? 'Bon après-midi' : 'Bonsoir';
  }
  function horloge() {
    const d = new Date();
    $l('lclock').textContent = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    $l('ldate').textContent = d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    salut();
  }
  horloge(); setInterval(() => { if (!$l('login').classList.contains('hide')) horloge(); }, 15000);
  /* Message de motivation pour Khalida : un par jour, puis il change toutes les 9 secondes */
  const MOTS = [
    'Chaque pièce bien comptée, chaque client bien suivi fait grandir Maria Bag. Belle journée, Khalida !',
    'Votre rigueur fait la différence : un stock juste, c’est un atelier serein. Merci pour votre travail.',
    'Un grand projet se construit jour après jour, ligne après ligne. Vous êtes en train de le faire.',
    'Les chiffres d’aujourd’hui préparent la réussite de demain. Continuez avec confiance.',
    'Prendre soin des clients et des fournisseurs, c’est prendre soin de Maria Bag. Bravo pour votre énergie.',
    'Chaque petite victoire compte : une relance faite, une commande livrée, un inventaire juste.',
    'La constance bat le talent quand le talent n’est pas constant. Et vous avez les deux, Khalida.',
    'Aujourd’hui encore, soyez fière de ce que vous bâtissez. Votre travail se voit et il compte.',
    'Un sourire, un suivi soigné, un chiffre exact : voilà comment on transforme un atelier en marque.',
    'Courage pour cette journée : tout ce qui est bien organisé devient plus facile.',
    'Vous avancez chaque jour, même quand ça paraît lent. Maria Bag grandit grâce à vous.',
    'Que cette journée vous apporte de belles commandes et de belles nouvelles. Bonne chance !'
  ];
  let im = (Math.floor(Date.now() / 86400000) + 3) % MOTS.length;
  const affMot = () => { const p = $l('lmsg'); p.textContent = MOTS[im]; };
  affMot();
  setInterval(() => {
    if ($l('login').classList.contains('hide')) return;
    const p = $l('lmsg'); p.classList.add('out');
    setTimeout(() => { im = (im + 1) % MOTS.length; affMot(); p.classList.remove('out'); }, 500);
  }, 9000);
  const eye = $l('lpeye');
  const bascule = () => { const p = $l('lp'); const voir = p.type === 'password'; p.type = voir ? 'text' : 'password'; eye.style.opacity = voir ? '1' : ''; p.focus(); };
  eye.addEventListener('click', bascule);
  eye.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); bascule(); } });
  const caps = e => { try { $l('lcaps').hidden = !e.getModifierState('CapsLock'); } catch (x) {} };
  $l('lp').addEventListener('keydown', caps); $l('lp').addEventListener('keyup', caps);
  if (document.getElementById('app').classList.contains('hide')) setTimeout(() => $l('lp').focus(), 600);

  let essais = 0, bloque = 0;
  const MSG = [
    [/invalid login/i, 'E-mail ou mot de passe incorrect.'], [/not confirmed/i, 'Confirmez d’abord votre e-mail (lien reçu par message).'],
    [/already registered|already been registered/i, 'Un compte existe déjà avec cet e-mail : connectez-vous.'], [/at least|weak|short/i, 'Mot de passe trop court (8 caractères minimum).'],
    [/rate limit|too many/i, 'Trop de tentatives. Patientez quelques minutes.'], [/fetch|network|failed/i, 'Connexion impossible : vérifiez internet.']
  ];
  const traduire = m => { for (const [re, t] of MSG) if (re.test(m || '')) return t; return m || 'Erreur.'; };

  function setMode(m){
    mode = m;
    const legacy = m === 'legacy', signup = m === 'signup', reset = m === 'reset';
    $l('lem-w').hidden = legacy || reset; $l('lnom-w').hidden = !signup;
    $l('lem').required = !(legacy || reset); $l('lnom').required = false;
    $l('lp').placeholder = reset ? 'Nouveau mot de passe (8 caractères min.)' : 'Mot de passe';
    $l('lp').autocomplete = signup || reset ? 'new-password' : 'current-password';
    $l('lbtxt').textContent = signup ? 'Créer mon compte' : reset ? 'Enregistrer le mot de passe' : 'Se connecter';
    $l('lforgot').hidden = !(m === 'login'); $l('llegacy').hidden = REQUIRED || !(m === 'login');
    $l('lback').hidden = !(legacy);
    document.querySelectorAll('.ltabs button').forEach(b => b.classList.toggle('on', b.dataset.lm === m));
    document.querySelector('.ltabs').hidden = legacy || reset;
    $l('lerr').textContent = '';
    $l('lsub').textContent = signup ? 'Créez votre compte : l’administrateur devra l’approuver.' : reset ? 'Choisissez un nouveau mot de passe.' : legacy ? 'Accès provisoire par mot de passe.' : 'Connectez-vous avec votre compte pour accéder à votre espace de travail.';
  }
  document.querySelectorAll('.ltabs button').forEach(b => b.addEventListener('click', () => setMode(b.dataset.lm)));
  $l('llegacy').addEventListener('click', () => setMode('legacy'));
  $l('lback').addEventListener('click', () => setMode('login'));
  $l('lforgot').addEventListener('click', async () => {
    const em = $l('lem').value.trim(), err = $l('lerr');
    if (!em) { err.textContent = 'Saisissez d’abord votre adresse e-mail.'; $l('lem').focus(); return; }
    const r = remote(); if (!r) return;
    const x = await r.auth.resetPasswordForEmail(em, { redirectTo: location.origin + location.pathname });
    err.style.color = x.error ? '' : '#17632a'; err.textContent = x.error ? traduire(x.error.message) : 'Un lien de réinitialisation vous a été envoyé par e-mail.';
  });
  setMode('login');

  document.getElementById('lf').addEventListener('submit', async function(e){
    e.preventDefault();
    const val = $l('lp').value, err = $l('lerr'), carte = document.querySelector('#login .lcard'), btn = $l('lbtn');
    err.style.color = '';
    const echec = (t) => {
      essais++; err.textContent = essais >= 5 ? 'Trop d’essais. Patientez 15 secondes.' : t;
      if (essais >= 5) { bloque = Date.now() + 15000; essais = 0; }
      carte.classList.remove('shake'); void carte.offsetWidth; carte.classList.add('shake'); $l('lp').select();
    };
    if (Date.now() < bloque) { err.textContent = 'Trop d’essais. Patientez ' + Math.ceil((bloque - Date.now()) / 1000) + ' s.'; return; }
    const reussi = (p) => {
      essais = 0; err.textContent = '';
      carte.classList.add('ok'); $l('lbtxt').textContent = 'Bienvenue' + (p && p.nom ? ' ' + p.nom.split(' ')[0] : ' Khalida') + ', belle journée ✓'; btn.disabled = true;
      setTimeout(() => {
        document.getElementById('login').classList.add('leaving');
        showApp(p);
        setTimeout(() => { document.getElementById('login').classList.remove('leaving'); carte.classList.remove('ok'); btn.disabled = false; setMode('login'); }, 700);
      }, 650);
    };
    if (mode === 'legacy') {
      if (REQUIRED) return;
      if (val === APP_PASSWORD) { sessionStorage.setItem(SESSION_KEY, '1'); reussi(null); } else echec('Mot de passe incorrect.');
      return;
    }
    const r = remote(); if (!r) { err.textContent = 'Connexion indisponible.'; return; }
    btn.disabled = true;
    try {
      if (mode === 'reset') {
        if (val.length < 8) { err.textContent = 'Mot de passe trop court (8 caractères minimum).'; return; }
        const u = await r.auth.updateUser({ password: val });
        if (u.error) { err.textContent = traduire(u.error.message); return; }
        err.style.color = '#17632a'; err.textContent = 'Mot de passe modifié.';
        const { data } = await r.auth.getSession(); if (data.session) await entrer(data.session.user); else setMode('login');
        return;
      }
      const em = identifiant($l('lem').value);
      if (mode === 'signup') {
        if (val.length < 8) { err.textContent = 'Mot de passe trop court (8 caractères minimum).'; return; }
        const s = await r.auth.signUp({ email: em, password: val, options: { data: { nom: $l('lnom').value.trim() } } });
        if (s.error) { echec(traduire(s.error.message)); return; }
        if (s.data && s.data.session) { const ok = await entrer(s.data.user); if (ok) return; }
        else { setMode('login'); err.style.color = '#17632a'; err.textContent = 'Compte créé. Confirmez votre e-mail (lien reçu), puis connectez-vous. L’administrateur doit ensuite approuver votre accès.'; }
        return;
      }
      const connexionLocale = async () => {
        const h = await horsLigne(em, val);
        if (!h.ok) { echec(h.inconnu ? 'Pas de connexion Internet : la première connexion de ce compte sur cet appareil doit se faire en ligne.' : 'E-mail ou mot de passe incorrect.'); return; }
        if (h.secours) sessionStorage.setItem(SESSION_KEY, '1');
        reussi(h.profil); setTimeout(() => { if (typeof toast === 'function') toast('Connecté hors ligne : vos données se synchroniseront dès le retour d’Internet.'); }, 1500);
      };
      if (!navigator.onLine) { await connexionLocale(); return; }
      let x;
      try { x = await r.auth.signInWithPassword({ email: em, password: val }); } catch (e3) { x = { error: e3 }; }
      // Supabase injoignable, lent ou en panne (erreur serveur) : connexion avec l'empreinte gardée sur cet appareil
      if (x.error && (/fetch|network|failed|load|timeout|abort|50\d|unavailable|gateway|database error|unexpected/i.test(String(x.error.message || x.error)) || Number(x.error.status) >= 500 || Number(x.error.status) === 0)) { await connexionLocale(); return; }
      if (x.error) { echec(traduire(x.error.message)); return; }
      memoriser(em, val, null);
      const p = await lireProfil(x.data.user);
      if (p === 'reseau') { await entrer(x.data.user); return; }
      if (!p || p.role === 'en_attente' || p.role === 'desactive') { await entrer(x.data.user); return; }
      reussi(versProfil(p)); cache(versProfil(p));
      memoriser(em, val, versProfil(p));
      try { r.rpc('touch_login'); } catch (e2) {}
    } finally { btn.disabled = false; }
  });

  document.getElementById('bLogout')?.addEventListener('click', async function(){
    quitter = true; sessionStorage.removeItem(SESSION_KEY); uncache();
    const r = remote(); try { if (r) await r.auth.signOut(); } catch (e) {}
    showLogin(); setTimeout(() => { quitter = false; }, 3000);
  });
})();
