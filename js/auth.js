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
    if (p) { p.value = ''; p.focus(); }
  }

  // Session déjà validée dans cet onglet (évite de retaper le mot de passe
  // à chaque rechargement de page, tant que l'onglet reste ouvert).
  if (sessionStorage.getItem(SESSION_KEY) === '1') {
    showApp();
  }

  document.getElementById('lf').addEventListener('submit', function(e){
    e.preventDefault();
    const val = document.getElementById('lp').value;
    const err = document.getElementById('lerr');
    if (val === APP_PASSWORD) {
      sessionStorage.setItem(SESSION_KEY, '1');
      err.textContent = '';
      showApp();
    } else {
      err.textContent = 'Mot de passe incorrect.';
    }
  });

  document.getElementById('bLogout')?.addEventListener('click', function(){
    sessionStorage.removeItem(SESSION_KEY);
    showLogin();
  });
})();
