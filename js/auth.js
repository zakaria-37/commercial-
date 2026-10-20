/* ---------- Écran de connexion (mot de passe simple, côté client) ---------- */
(function(){
  const SESSION_KEY = 'mariabag_session_ok';

  function showApp(){
    document.getElementById('login').classList.add('hide');
    document.getElementById('app').classList.remove('hide');
    document.dispatchEvent(new Event('mariabag:authenticated'));
  }

  function showLogin(){
    document.getElementById('app').classList.add('hide');
    document.getElementById('login').classList.remove('hide');
    const p = document.getElementById('lp');
    if (p) { p.value = ''; p.type = 'password'; p.focus(); }
  }

  // Session déjà validée dans cet onglet (évite de retaper le mot de passe
  // à chaque rechargement de page, tant que l'onglet reste ouvert).
  if (sessionStorage.getItem(SESSION_KEY) === '1') {
    showApp();
  }

  /* Ouverture : salutation selon l'heure, horloge vivante, œil, alerte majuscules, essais limités */
  const $l = id => document.getElementById(id);
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
  document.getElementById('lf').addEventListener('submit', function(e){
    e.preventDefault();
    const val = $l('lp').value, err = $l('lerr'), carte = document.querySelector('#login .lcard'), btn = $l('lbtn');
    if (Date.now() < bloque) { err.textContent = 'Trop d’essais. Patientez ' + Math.ceil((bloque - Date.now()) / 1000) + ' s.'; return; }
    if (val === APP_PASSWORD) {
      sessionStorage.setItem(SESSION_KEY, '1');
      err.textContent = ''; essais = 0;
      carte.classList.add('ok'); $l('lbtxt').textContent = 'Bienvenue Khalida, belle journée ✓'; btn.disabled = true;
      setTimeout(() => {
        document.getElementById('login').classList.add('leaving');
        showApp();
        setTimeout(() => { const lg = document.getElementById('login'); lg.classList.remove('leaving'); carte.classList.remove('ok'); btn.disabled = false; $l('lbtxt').textContent = 'Se connecter'; }, 700);
      }, 650);
    } else {
      essais++;
      err.textContent = essais >= 5 ? 'Trop d’essais. Patientez 15 secondes.' : 'Mot de passe incorrect.';
      if (essais >= 5) { bloque = Date.now() + 15000; essais = 0; }
      carte.classList.remove('shake'); void carte.offsetWidth; carte.classList.add('shake');
      $l('lp').select();
    }
  });

  document.getElementById('bLogout')?.addEventListener('click', function(){
    sessionStorage.removeItem(SESSION_KEY);
    showLogin();
  });
})();
