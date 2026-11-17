/* ============================================================
   THÈMES PAR UTILISATEUR
   - L'administrateur choisit le thème de chaque compte (Équipe) ; chacun peut le changer
     pour lui-même avec le bouton 🎨 (choix gardé sur son appareil).
   - Thèmes : Classique MARIA BAG, Mouloudia, Sombre, Homme, Femme, Nature, Islamique.
   - Thème Islamique : un hadith authentique (رواه البخاري / مسلم / الترمذي) à chaque ouverture.
   ============================================================ */
(function () {
  'use strict';
  const THEMES = [
    ['', 'Classique MARIA BAG', '#000', '#d9a8b2'],
    ['mca', 'Mouloudia', '#00853f', '#d21034'],
    ['usma', 'USMA (rouge et noir)', '#0e0e10', '#d7263d'],
    ['sombre', 'Sombre', '#14161b', '#3b82f6'],
    ['homme', 'Homme', '#1e2a3a', '#c8a15a'],
    ['femme', 'Femme', '#b4547a', '#f3c4d6'],
    ['nature', 'Nature', '#2f6b3a', '#a3c585'],
    ['islamique', 'Islamique', '#0d5c4a', '#c9a227']
  ];
  window.THEMES_APP = THEMES;
  const nomTheme = k => (THEMES.find(t => t[0] === k) || THEMES[0])[1];

  /* Hadiths authentiques (texte arabe, source, sens en français) */
  const HADITHS = [
    ['إِنَّمَا الأَعْمَالُ بِالنِّيَّاتِ، وَإِنَّمَا لِكُلِّ امْرِئٍ مَا نَوَى', 'رواه البخاري ومسلم', 'Les actes ne valent que par les intentions, et chacun n’aura que ce qu’il a eu l’intention de faire.'],
    ['مَنْ كَانَ يُؤْمِنُ بِاللَّهِ وَالْيَوْمِ الآخِرِ فَلْيَقُلْ خَيْرًا أَوْ لِيَصْمُتْ', 'رواه البخاري ومسلم', 'Que celui qui croit en Allah et au Jour dernier dise du bien ou se taise.'],
    ['لَا يُؤْمِنُ أَحَدُكُمْ حَتَّى يُحِبَّ لِأَخِيهِ مَا يُحِبُّ لِنَفْسِهِ', 'رواه البخاري ومسلم', 'Aucun de vous n’est vraiment croyant tant qu’il n’aime pas pour son frère ce qu’il aime pour lui-même.'],
    ['الْكَلِمَةُ الطَّيِّبَةُ صَدَقَةٌ', 'رواه البخاري ومسلم', 'La bonne parole est une aumône.'],
    ['الْمُسْلِمُ مَنْ سَلِمَ الْمُسْلِمُونَ مِنْ لِسَانِهِ وَيَدِهِ', 'رواه البخاري ومسلم', 'Le musulman est celui dont les musulmans sont à l’abri de la langue et de la main.'],
    ['مَا أَكَلَ أَحَدٌ طَعَامًا قَطُّ خَيْرًا مِنْ أَنْ يَأْكُلَ مِنْ عَمَلِ يَدِهِ', 'رواه البخاري', 'Personne n’a jamais mangé de meilleure nourriture que celle qu’il a gagnée du travail de ses mains.'],
    ['إِنَّ اللَّهَ رَفِيقٌ يُحِبُّ الرِّفْقَ فِي الأَمْرِ كُلِّهِ', 'رواه البخاري ومسلم', 'Allah est doux et Il aime la douceur en toute chose.'],
    ['لَيْسَ الشَّدِيدُ بِالصُّرَعَةِ، إِنَّمَا الشَّدِيدُ الَّذِي يَمْلِكُ نَفْسَهُ عِنْدَ الْغَضَبِ', 'رواه البخاري ومسلم', 'Le fort n’est pas celui qui terrasse les autres, le fort est celui qui se maîtrise lors de la colère.'],
    ['يَسِّرُوا وَلَا تُعَسِّرُوا، وَبَشِّرُوا وَلَا تُنَفِّرُوا', 'رواه البخاري ومسلم', 'Facilitez et ne compliquez pas ; annoncez la bonne nouvelle et ne faites pas fuir.'],
    ['أَحَبُّ الأَعْمَالِ إِلَى اللَّهِ أَدْوَمُهَا وَإِنْ قَلَّ', 'رواه البخاري ومسلم', 'Les œuvres les plus aimées d’Allah sont les plus régulières, même si elles sont peu nombreuses.'],
    ['مَنْ لَا يَرْحَمُ لَا يُرْحَمُ', 'رواه البخاري ومسلم', 'Celui qui ne fait pas miséricorde ne recevra pas de miséricorde.'],
    ['الدِّينُ النَّصِيحَةُ', 'رواه مسلم', 'La religion, c’est le bon conseil (la sincérité).'],
    ['الْبَيِّعَانِ بِالْخِيَارِ مَا لَمْ يَتَفَرَّقَا، فَإِنْ صَدَقَا وَبَيَّنَا بُورِكَ لَهُمَا فِي بَيْعِهِمَا', 'رواه البخاري ومسلم', 'Le vendeur et l’acheteur ont le choix tant qu’ils ne se sont pas séparés ; s’ils sont sincères et clairs, leur vente sera bénie.'],
    ['رَحِمَ اللَّهُ رَجُلًا سَمْحًا إِذَا بَاعَ، وَإِذَا اشْتَرَى، وَإِذَا اقْتَضَى', 'رواه البخاري', 'Qu’Allah fasse miséricorde à l’homme facile quand il vend, quand il achète et quand il réclame son dû.'],
    ['الْيَدُ الْعُلْيَا خَيْرٌ مِنَ الْيَدِ السُّفْلَى', 'رواه البخاري ومسلم', 'La main qui donne est meilleure que la main qui reçoit.'],
    ['الْمُؤْمِنُ الْقَوِيُّ خَيْرٌ وَأَحَبُّ إِلَى اللَّهِ مِنَ الْمُؤْمِنِ الضَّعِيفِ، وَفِي كُلٍّ خَيْرٌ', 'رواه مسلم', 'Le croyant fort est meilleur et plus aimé d’Allah que le croyant faible, et en chacun il y a du bien.'],
    ['مَنْ سَلَكَ طَرِيقًا يَلْتَمِسُ فِيهِ عِلْمًا سَهَّلَ اللَّهُ لَهُ بِهِ طَرِيقًا إِلَى الْجَنَّةِ', 'رواه مسلم', 'Celui qui emprunte un chemin à la recherche du savoir, Allah lui facilite un chemin vers le Paradis.'],
    ['الطُّهُورُ شَطْرُ الإِيمَانِ', 'رواه مسلم', 'La purification est la moitié de la foi.'],
    ['تَبَسُّمُكَ فِي وَجْهِ أَخِيكَ لَكَ صَدَقَةٌ', 'رواه الترمذي', 'Ton sourire à ton frère est pour toi une aumône.'],
    ['اتَّقِ اللَّهَ حَيْثُمَا كُنْتَ، وَأَتْبِعِ السَّيِّئَةَ الْحَسَنَةَ تَمْحُهَا، وَخَالِقِ النَّاسَ بِخُلُقٍ حَسَنٍ', 'رواه الترمذي', 'Crains Allah où que tu sois, fais suivre la mauvaise action d’une bonne qui l’effacera, et comporte-toi bien avec les gens.'],
    ['مَنْ لَا يَشْكُرُ النَّاسَ لَا يَشْكُرُ اللَّهَ', 'رواه أبو داود والترمذي', 'Celui qui ne remercie pas les gens ne remercie pas Allah.'],
    ['خَيْرُكُمْ مَنْ تَعَلَّمَ الْقُرْآنَ وَعَلَّمَهُ', 'رواه البخاري', 'Le meilleur d’entre vous est celui qui apprend le Coran et l’enseigne.']
  ];
  window.HADITHS_APP = HADITHS;
  // un hadith différent à chaque ouverture (sans répéter le précédent)
  function hadithDuJour(suivant) {
    let i = 0; try { i = Number(sessionStorage.getItem('mariabag_hadith')); } catch (e) {}
    if (!isFinite(i) || i < 0 || i >= HADITHS.length || suivant || !sessionStorage.getItem('mariabag_hadith')) {
      let last = -1; try { last = Number(localStorage.getItem('mariabag_hadith_last')); } catch (e) {}
      do { i = Math.floor(Math.random() * HADITHS.length); } while (HADITHS.length > 1 && i === last);
      try { sessionStorage.setItem('mariabag_hadith', String(i)); localStorage.setItem('mariabag_hadith_last', String(i)); } catch (e) {}
    }
    return HADITHS[i];
  }

  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let profilCourant = null;
  const cle = () => 'mariabag_theme_' + (profilCourant && profilCourant.id || 'local');
  function choisi() {
    const base = profilCourant && THEMES.some(t => t[0] === profilCourant.theme) ? profilCourant.theme : '';
    try { const x = localStorage.getItem(cle()); if (x !== null && THEMES.some(t => t[0] === x)) return x; } catch (e) {}
    return base;
  }
  function appliquer() {
    const t = choisi();
    THEMES.forEach(x => { if (x[0]) document.body.classList.toggle('theme-' + x[0], x[0] === t); });
    document.body.dataset.theme = t || 'classique';
    const mc = document.querySelector('meta[name="theme-color"]'); if (mc) mc.setAttribute('content', (THEMES.find(x => x[0] === t) || THEMES[0])[2]);
    bouton(); banniere(t);
  }

  /* bouton 🎨 + menu de choix (pour tous les comptes) */
  function bouton() {
    let bt = document.getElementById('bTheme');
    if (!bt) {
      bt = document.createElement('button'); bt.id = 'bTheme'; bt.type = 'button'; bt.className = 'btn'; bt.title = 'Choisir mon thème';
      const lo = document.getElementById('bLogout'); if (lo) lo.before(bt); else return;
      bt.addEventListener('click', e => { e.stopPropagation(); menu(); });
    }
    bt.textContent = '🎨 Thème';
  }
  function menu() {
    let m = document.getElementById('themeMenu');
    if (m) { m.remove(); return; }
    const t = choisi();
    m = document.createElement('div'); m.id = 'themeMenu'; m.setAttribute('role', 'menu');
    m.innerHTML = '<b>Mon thème</b>' + THEMES.map(x => '<button type="button" role="menuitemradio" aria-checked="' + (x[0] === t) + '" data-th="' + x[0] + '" class="' + (x[0] === t ? 'on' : '') + '"><i style="background:linear-gradient(135deg,' + x[2] + ' 50%,' + x[3] + ' 50%)"></i>' + esc(x[1]) + (x[0] === t ? ' ✓' : '') + '</button>').join('') +
      '<small>Gardé sur cet appareil.</small>';
    document.body.appendChild(m);
    const bt = document.getElementById('bTheme'), r = bt.getBoundingClientRect();
    m.style.top = Math.min(window.innerHeight - m.offsetHeight - 8, r.bottom + 6) + 'px';
    m.style.left = Math.max(8, Math.min(window.innerWidth - m.offsetWidth - 8, r.right - m.offsetWidth)) + 'px';
    m.addEventListener('click', e => { const b = e.target.closest('[data-th]'); if (!b) return; try { localStorage.setItem(cle(), b.dataset.th); } catch (x) {} m.remove(); appliquer(); });
    setTimeout(() => document.addEventListener('click', function fermer(e) { if (!m.contains(e.target)) { m.remove(); document.removeEventListener('click', fermer); } }), 0);
  }

  /* bandeau d'accueil du thème (salut, ou hadith pour le thème islamique) */
  function banniere(t) {
    let sal = document.getElementById('themeSalut'); const vieux = document.getElementById('mcaSalut'); if (vieux) vieux.remove();
    if (!t || t === 'sombre') { if (sal) sal.remove(); return; }
    if (!sal) { sal = document.createElement('div'); sal.id = 'themeSalut'; const m = document.querySelector('main'); if (m) m.prepend(sal); else return; }
    sal.className = 'th-salut th-' + t;
    const h = new Date().getHours(), nom = (((profilCourant && profilCourant.nom) || '').split(' ')[0] || '').toLowerCase().replace(/^\S/, c => c.toUpperCase());
    if (t === 'islamique') {
      const x = hadithDuJour(false);
      sal.innerHTML = '<div class="th-isl-top"><b>السَّلَامُ عَلَيْكُمْ' + (nom ? ' ' + esc(nom) : '') + '</b><button type="button" id="thHadith" title="Un autre hadith">حديث آخر ↻</button></div>' +
        '<p class="th-hadith" dir="rtl" lang="ar">قَالَ رَسُولُ اللَّهِ ﷺ : « ' + esc(x[0]) + ' »<small>' + esc(x[1]) + '</small></p><p class="th-sens">' + esc(x[2]) + '</p>';
      sal.querySelector('#thHadith').onclick = () => { hadithDuJour(true); banniere('islamique'); };
      return;
    }
    const salut = h < 12 ? 'Bonjour' : h < 18 ? 'Bon après-midi' : 'Bonsoir';
    const txt = {
      mca: ['<img src="icons/theme/mca.svg?v=151" alt="">', (h < 12 ? 'Sbah el khir' : h < 18 ? 'Salam' : 'Masa el khir') + (nom ? ' ' + esc(nom) : '') + ' 💚❤️', 'DIMA MOULOUDIA · ★ Le Doyen'],
      usma: ['<img src="icons/theme/usma.svg?v=184" alt="">', (h < 12 ? 'Sbah el khir' : h < 18 ? 'Salam' : 'Masa el khir') + (nom ? ' ' + esc(nom.toUpperCase()) : '') + ' 🔴⚫', 'USMA · Rouge et Noir · Bon travail !'],
      homme: ['<span class="th-ico">⌚</span>', salut + (nom ? ' ' + esc(nom) : ''), 'Concentration, précision, efficacité.'],
      femme: ['<span class="th-ico">🌸</span>', salut + (nom ? ' ' + esc(nom) : '') + ' ✨', 'Belle journée, et bon travail !'],
      nature: ['<span class="th-ico">🌿</span>', salut + (nom ? ' ' + esc(nom) : ''), 'Respirez : chaque pièce bien faite compte.']
    }[t];
    if (!txt) { sal.remove(); return; }
    sal.innerHTML = txt[0] + '<div><b>' + txt[1] + '</b><small>' + txt[2] + '</small></div>';
  }

  document.addEventListener('mariabag:profil', ev => { profilCourant = ev.detail || null; appliquer(); });
  profilCourant = window.APP_USER || null; appliquer();
  window.Themes = { liste: THEMES, appliquer, nom: nomTheme };
})();
