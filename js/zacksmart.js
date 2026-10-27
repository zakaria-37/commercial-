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
  const SUGG = ['Comment faire une facture ?', 'Comment noter un rendez-vous avec une grande surface ?', 'Comment préparer un rendez-vous avec un client ?', 'Comment fixer mon prix de vente ?', 'Comment relancer un client qui ne paie pas ?'];
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
  let msgs = [], busy = false;
  try { msgs = JSON.parse(localStorage.getItem(KEY) || '[]').slice(-30); } catch (e) { msgs = []; }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(msgs.slice(-30))); } catch (e) { /* stockage indisponible */ } };

  const md = t => { let h = esc(t).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>'); const lines = h.split('\n'), out = []; let ul = false;
    lines.forEach(l => { const m = /^\s*(?:[-•*]|\d+[.)])\s+(.*)$/.exec(l); if (m) { if (!ul) { out.push('<ul>'); ul = true; } out.push('<li>' + m[1] + '</li>'); } else { if (ul) { out.push('</ul>'); ul = false; } out.push(l ? l + '<br>' : '<br>'); } });
    if (ul) out.push('</ul>'); return out.join('').replace(/(<br>)+$/, ''); };
  const faq = q => { const n = norm(q); let best = null, sc = 0; FAQ.forEach(([ks, a]) => { const s = ks.filter(k => n.includes(norm(k))).length; if (s > sc) { sc = s; best = a; } }); return best; };
  const page = () => { const b = document.querySelector('nav button.on'); return b ? b.textContent.trim() : ''; };

  function build() {
    if ($('#zs-btn')) return;
    const b = document.createElement('button'); b.id = 'zs-btn'; b.type = 'button'; b.innerHTML = '<span class="zs-av">Z</span>ZACKsmart'; b.title = 'Assistant ZACKsmart';
    const p = document.createElement('div'); p.id = 'zs-panel';
    p.innerHTML = '<header><span class="zs-av">Z</span><div><b>ZACKsmart</b><small>Assistant MARIA BAG · aide et conseils</small></div><button type="button" id="zs-clear" title="Effacer la conversation">🗑</button><button type="button" id="zs-close" title="Fermer">✕</button></header>' +
      '<div id="zs-msgs"></div><form id="zs-form"><textarea id="zs-input" rows="1" maxlength="1000" placeholder="Posez votre question…"></textarea><button id="zs-send" type="submit">Envoyer</button></form>';
    document.body.appendChild(b); document.body.appendChild(p);
    b.onclick = () => { p.classList.toggle('on'); if (p.classList.contains('on')) { paint(); $('#zs-input').focus(); } };
    $('#zs-close').onclick = () => p.classList.remove('on');
    $('#zs-clear').onclick = () => { if (!msgs.length || confirm('Effacer la conversation ?')) { msgs = []; save(); paint(); } };
    $('#zs-form').onsubmit = e => { e.preventDefault(); send($('#zs-input').value); };
    $('#zs-input').addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send($('#zs-input').value); } });
    paint();
  }
  function paint() {
    const box = $('#zs-msgs'); if (!box) return;
    let h = '<div class="zs-m bot">Bonjour 👋 Je suis <b>ZACKsmart</b>. Je peux vous expliquer comment utiliser la plateforme et vous conseiller dans votre travail commercial (rendez-vous, prix, relances…).</div>';
    if (!msgs.length) h += '<div class="zs-chips">' + SUGG.map(s => '<button type="button" data-q="' + esc(s) + '">' + esc(s) + '</button>').join('') + '</div>';
    msgs.forEach(m => { h += '<div class="zs-m ' + (m.role === 'user' ? 'me' : m.note ? 'note' : 'bot') + '">' + (m.role === 'user' ? esc(m.content).replace(/\n/g, '<br>') : md(m.content)) + '</div>'; });
    if (busy) h += '<div class="zs-m bot zs-dots"><span></span><span></span><span></span></div>';
    box.innerHTML = h; box.scrollTop = box.scrollHeight;
    box.querySelectorAll('[data-q]').forEach(x => x.onclick = () => send(x.dataset.q));
  }
  async function send(text) {
    text = String(text || '').trim(); if (!text || busy) return;
    $('#zs-input').value = ''; msgs.push({ role: 'user', content: text }); busy = true; $('#zs-send').disabled = true; paint(); save();
    let rep = null, note = false;
    try {
      if (!navigator.onLine) throw new Error('offline');
      const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 30000);
      const r = await fetch(SUPABASE_URL + '/functions/v1/zacksmart', { method: 'POST', signal: ctl.signal, headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + SUPABASE_ANON_KEY },
        body: JSON.stringify({ messages: msgs.filter(m => !m.note).slice(-10).map(m => ({ role: m.role, content: m.content })), page: page() }) });
      clearTimeout(t);
      const d = await r.json().catch(() => ({}));
      if (r.ok && d.reply) rep = d.reply;
      else if (d.error === 'rate') { rep = 'Vous écrivez très vite 🙂 Patientez quelques secondes puis réessayez.'; note = true; }
      else throw new Error(d.error || 'http ' + r.status);
    } catch (e) {
      const f = faq(text), off = !navigator.onLine || e.message === 'offline';
      rep = (off ? 'Vous êtes hors ligne : réponse de secours. ' : 'L’assistant intelligent n’est pas disponible pour le moment : réponse de secours. ') + (f ? '\n' + f : 'Je n’ai pas de réponse prête pour cette question. Reformulez avec des mots comme « facture », « rendez-vous », « fiche de paie », « stock »…');
      note = false;
    }
    msgs.push({ role: 'assistant', content: rep, note }); busy = false; $('#zs-send').disabled = false; paint(); save();
  }

  document.addEventListener('mariabag:authenticated', () => { build(); $('#zs-btn').classList.add('on'); });
  // déconnexion : on masque l'assistant quand l'écran de connexion est affiché (la connexion par ancien mot de passe n'a pas de profil)
  document.addEventListener('mariabag:profil', () => setTimeout(() => { const l = $('#login'), b = $('#zs-btn'), p = $('#zs-panel');
    if (l && b && getComputedStyle(l).display !== 'none') { b.classList.remove('on'); if (p) p.classList.remove('on'); } }, 60));
})();
