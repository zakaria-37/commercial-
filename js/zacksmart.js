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
  const SUGG = ['Aide-moi à organiser ma semaine commerciale', 'Plan pour prospecter les grandes surfaces', 'Comment négocier le prix avec une grande surface ?', 'Comment fixer mon prix de vente et ma marge ?', 'Comment diriger et suivre le travail de l’équipe ?', 'Rédiger un message pro (WhatsApp ou e-mail)', 'Comment faire une facture ?'];
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
    [['message', 'whatsapp', 'email', 'e-mail', 'mail', 'sms', 'relance', 'ecrire'], 'Pour écrire un message professionnel : touchez **✉ Rédiger un message** (en bas de la conversation), choisissez WhatsApp ou e-mail, le destinataire et l’objectif. Le message est prêt à copier-coller avec le bouton **Copier**.'],
    [['contact', 'client', 'fournisseur'], 'Contacts : menu **Contacts** → liste des clients et fournisseurs, avec les onglets Clients/Fournisseurs (classement), Chiffre d’affaires et Paiements (soldes).'],
  ];
  let msgs = [], busy = false, deep = true, big = false;
  try { deep = localStorage.getItem('zacksmart_deep') !== '0'; big = localStorage.getItem('zacksmart_big') === '1'; } catch (e) { /* valeurs par défaut */ }
  try { msgs = JSON.parse(localStorage.getItem(KEY) || '[]').slice(-30); } catch (e) { msgs = []; }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(msgs.slice(-30))); } catch (e) { /* stockage indisponible */ } };   // copie locale : affichage immédiat
  /* Conversation synchronisée : un message = une ligne de la table zacksmart_messages (même profil = même conversation sur PC, téléphone, tablette).
     Lecture et écriture DIRECTES sur le serveur (pas de file d'attente cachée) ; hors ligne, les messages attendent puis partent au retour de la connexion. */
  const TBL = 'zacksmart_messages', MAX = 200;
  // tant que la sécurité par compte n'est pas activée, tous les appareils partagent la même conversation ; ensuite : une conversation par compte
  const owner = () => (typeof AUTH_REQUIRED !== 'undefined' && AUTH_REQUIRED && window.APP_USER && window.APP_USER.id) ? String(window.APP_USER.id) : 'partage';
  const rem = () => (window.LocalDB && LocalDB.remote) ? LocalDB.remote() : null;
  let etat = { ok: null, msg: '' };
  const majEtat = (ok, msg) => { etat = { ok, msg: msg || '' }; const e = $('#zs-st'); if (!e) return;
    e.className = ok === true ? 'ok' : ok === false ? 'ko' : ''; e.textContent = ok === true ? '☁ Synchronisé sur vos appareils' : ok === false ? '⚠ Non synchronisé : ' + msg : ''; };
  const en = x => x && x.message ? x.message : String(x || 'erreur');
  async function lire() {
    const r = rem();
    if (!r) { majEtat(false, 'connexion au serveur non prête'); return null; }
    if (!navigator.onLine) { majEtat(false, 'hors ligne'); return null; }
    try {
      const q = await r.from(TBL).select('*').eq('proprietaire', owner()).order('created_at', { ascending: true }).limit(MAX);
      if (q.error) { majEtat(false, /does not exist|relation|schema cache/i.test(en(q.error)) ? 'table absente sur le serveur' : en(q.error)); return null; }
      majEtat(true); return (q.data || []).map(x => ({ id: x.id, role: x.role, content: x.content, t: x.created_at }));
    } catch (e) { majEtat(false, en(e)); return null; }
  }
  async function ecrire(role, content) {
    const r = rem(); if (!r || !navigator.onLine) { majEtat(false, !navigator.onLine ? 'hors ligne (le message partira au retour de la connexion)' : 'connexion au serveur non prête'); return null; }
    try {
      const q = await r.from(TBL).insert([{ proprietaire: owner(), role, content }]).select();
      if (q.error || !q.data || !q.data[0]) { majEtat(false, en(q.error || 'écriture refusée')); return null; }
      majEtat(true); return q.data[0].id;
    } catch (e) { majEtat(false, en(e)); return null; }
  }
  async function pousser() {            // messages écrits hors ligne ou en échec : renvoyés dans l'ordre
    for (const m of msgs) { if (m.id || m.envoi) continue; m.envoi = true; const id = await ecrire(m.role, m.content); m.envoi = false; if (id) m.id = id; else break; }
  }
  async function elaguer() {
    const r = rem(); if (!r) return;
    try { const q = await r.from(TBL).select('id').eq('proprietaire', owner()).order('created_at', { ascending: true }); const l = (q.data || []);
      if (l.length > MAX) await r.from(TBL).delete().in('id', l.slice(0, l.length - MAX).map(x => x.id)); } catch (e) { /* sans importance */ }
  }
  async function rafraichir(force) {
    if (busy && !force) return;
    await pousser();
    const l = await lire(); if (!l) return;
    const attente = msgs.filter(m => !m.id);                      // messages locaux pas encore partis : gardés à la fin
    const sig = a => a.length + ':' + (a.length ? a[a.length - 1].id : '');
    if (sig(l) !== sig(msgs.filter(m => m.id)) || attente.length) { msgs = l.concat(attente); save(); paint(); }
  }
  /* Mise en forme des réponses : tableaux, titres, listes, gras/italique, code, sauts de ligne (<br> écrits par l'IA compris) */
  const inline = x => esc(x).replace(/\u0001/g, '<br>').replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/(^|[\s(])\*([^*\s][^*]*?)\*(?=[\s).,;:!?]|$)/g, '$1<i>$2</i>');
  const cells = l => l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim());
  const isSep = l => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(l) && l.includes('-');
  const md = t => {
    // <br> écrit par l'IA : dans une ligne de tableau il reste un saut de ligne DANS la cellule, ailleurs c'est une vraie nouvelle ligne
    const lines = []; String(t).split('\n').forEach(l => { if (/^\s*\|/.test(l)) lines.push(l.replace(/<br\s*\/?>/gi, '\u0001')); else l.split(/<br\s*\/?>/i).forEach(x => lines.push(x)); });
    const out = [];
    let ul = false, ol = false;
    const close = () => { if (ul) { out.push('</ul>'); ul = false; } if (ol) { out.push('</ol>'); ol = false; } };
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      if (/^\s*```/.test(l)) {                                                   // message prêt à copier-coller
        close(); const buf = []; i++;
        while (i < lines.length && !/^\s*```/.test(lines[i])) { buf.push(lines[i]); i++; }
        const txt = buf.join('\n').replace(/^\n+|\n+$/g, '');
        out.push('<div class="zs-copy"><div class="zs-ch"><span>📋 Message prêt à copier</span><button type="button" data-copy="1" data-t="' + esc(txt) + '">Copier</button></div><pre>' + esc(txt) + '</pre></div>');
        continue;
      }
      if (/^\s*\|.*\|?\s*$/.test(l) && l.split('|').length > 2) {            // tableau
        close(); const rows = [];
        while (i < lines.length && /^\s*\|/.test(lines[i])) { rows.push(lines[i]); i++; } i--;
        const hasHead = rows.length > 1 && isSep(rows[1]), head = hasHead ? cells(rows[0]) : null, body = rows.filter((r, k) => !(hasHead && k < 2) && !isSep(r)).map(cells);
        out.push('<div class="zs-tw"><table>' + (head ? '<thead><tr>' + head.map(c => '<th>' + inline(c) + '</th>').join('') + '</tr></thead>' : '') + '<tbody>' + body.map(r => '<tr>' + r.map(c => '<td>' + inline(c) + '</td>').join('') + '</tr>').join('') + '</tbody></table></div>');
        continue;
      }
      let m;
      if ((m = /^\s*#{1,4}\s+(.*)$/.exec(l))) { close(); out.push('<div class="zs-h">' + inline(m[1]) + '</div>'); }
      else if (/^\s*(-{3,}|\*{3,})\s*$/.test(l)) { close(); out.push('<hr>'); }
      else if ((m = /^\s*[-•*]\s+(.*)$/.exec(l))) { if (ol) { out.push('</ol>'); ol = false; } if (!ul) { out.push('<ul>'); ul = true; } out.push('<li>' + inline(m[1]) + '</li>'); }
      else if ((m = /^\s*\d+[.)]\s+(.*)$/.exec(l))) { if (ul) { out.push('</ul>'); ul = false; } if (!ol) { out.push('<ol>'); ol = true; } out.push('<li>' + inline(m[1]) + '</li>'); }
      else { close(); out.push(l.trim() ? '<p>' + inline(l) + '</p>' : ''); }
    }
    close(); return out.join('');
  };
  /* ---------- Copier-coller ---------- */
  async function copier(txt, btn) {
    let ok = false;
    try { if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(txt); ok = true; } } catch (e) { ok = false; }
    if (!ok) {   // secours (iPhone / anciens navigateurs)
      const ta = document.createElement('textarea'); ta.value = txt; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;font-size:16px';
      document.body.appendChild(ta); ta.focus(); ta.select(); ta.setSelectionRange(0, txt.length);
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; } ta.remove();
    }
    const old = btn.textContent; btn.textContent = ok ? '✓ Copié' : 'Sélectionnez et copiez'; btn.classList.toggle('ok', ok);
    setTimeout(() => { btn.textContent = old; btn.classList.remove('ok'); }, 2200);
  }

  /* ---------- Rédiger un message professionnel (WhatsApp / e-mail / SMS) ---------- */
  const CANAUX = ['WhatsApp', 'E-mail', 'SMS'];
  const DEST = ['Grande surface', 'Boutique / magasin', 'Client existant', 'Fournisseur', 'Atelier partenaire', 'Autre société'];
  const OBJ = ['Présenter Maria Bag et proposer un rendez-vous', 'Confirmer un rendez-vous', 'Remercier après un rendez-vous', 'Envoyer ou relancer un devis', 'Relancer une facture impayée', 'Annoncer une nouveauté ou une offre', 'Répondre à une demande de prix', 'Autre (préciser dans les détails)'];
  const TON = ['Cordial et professionnel', 'Très formel'];
  let gen = null;
  const SIG = '[Votre prénom et nom]\nCommerciale — MARIA BAG (Maria Atelier)\nChâteau Rouge – Les Eucalyptus, Alger\nTél : 0549 69 16 54';
  const MOD = {
    0: (c, n) => c === 'E-mail' ? 'Objet : Présentation de MARIA BAG — maroquinerie fabriquée en Algérie\n\nBonjour ' + n + ',\n\nJe me permets de vous contacter de la part de MARIA BAG, atelier de maroquinerie à Alger (sacs, pochettes, cabas).\n\nNous aimerions vous présenter notre gamme, ses finitions et nos conditions pour les professionnels. Seriez-vous disponible pour un rendez-vous de 20 minutes le [jour] à [heure] ?\n\nJe peux vous apporter des échantillons et notre catalogue.\n\nDans l\'attente de votre retour,\nCordialement,\n' + SIG : 'Bonjour ' + n + ', je suis [Votre prénom] de MARIA BAG, atelier de maroquinerie à Alger (sacs, pochettes, cabas). J\'aimerais vous présenter notre gamme et nos conditions professionnelles. Seriez-vous disponible pour un court rendez-vous le [jour] à [heure] ? Je viens avec des échantillons. Merci et bonne journée.',
    1: (c, n) => c === 'E-mail' ? 'Objet : Confirmation de notre rendez-vous du [date]\n\nBonjour ' + n + ',\n\nJe vous confirme notre rendez-vous le [jour] à [heure] à [lieu].\nJe vous présenterai notre gamme avec des échantillons.\n\nN\'hésitez pas à me prévenir en cas d\'empêchement.\n\nCordialement,\n' + SIG : 'Bonjour ' + n + ', je vous confirme notre rendez-vous le [jour] à [heure] à [lieu]. Je viendrai avec nos échantillons. Prévenez-moi en cas d\'empêchement. À bientôt !',
    2: (c, n) => c === 'E-mail' ? 'Objet : Merci pour notre rendez-vous\n\nBonjour ' + n + ',\n\nMerci pour le temps que vous m\'avez accordé le [date]. Comme convenu, je vous envoie [devis / catalogue / tarifs].\n\nJe reste à votre disposition pour toute question et je vous recontacte le [date] pour connaître votre avis.\n\nCordialement,\n' + SIG : 'Bonjour ' + n + ', merci pour notre rendez-vous. Comme convenu, je vous envoie [devis / catalogue]. Je reste disponible pour toute question et je vous recontacte le [date]. Bonne journée.',
    3: (c, n) => c === 'E-mail' ? 'Objet : Notre devis n° [numéro] — MARIA BAG\n\nBonjour ' + n + ',\n\nVeuillez trouver ci-joint notre devis n° [numéro] pour [produits et quantités], d\'un montant de [montant] DA, valable jusqu\'au [date].\n\nSi vous souhaitez le valider ou l\'ajuster, je suis à votre disposition. Pouvons-nous en parler cette semaine ?\n\nCordialement,\n' + SIG : 'Bonjour ' + n + ', je reviens vers vous au sujet de notre devis n° [numéro] ([montant] DA, valable jusqu\'au [date]). Avez-vous pu le consulter ? Je peux l\'ajuster si besoin. Merci !',
    4: (c, n) => c === 'E-mail' ? 'Objet : Rappel — facture n° [numéro] en attente de règlement\n\nBonjour ' + n + ',\n\nSauf erreur de notre part, la facture n° [numéro] du [date], d\'un montant de [montant] DA, reste à régler (échéance : [date]).\n\nPourriez-vous nous indiquer la date de paiement prévue ? Si le règlement a déjà été effectué, merci de ne pas tenir compte de ce message.\n\nCordialement,\n' + SIG : 'Bonjour ' + n + ', un petit rappel : la facture n° [numéro] de [montant] DA (échéance [date]) n\'apparaît pas encore comme réglée. Pouvez-vous me confirmer la date de paiement ? Si c\'est déjà fait, merci d\'ignorer ce message.',
    5: (c, n) => c === 'E-mail' ? 'Objet : Nouveauté MARIA BAG — [nom du produit / offre]\n\nBonjour ' + n + ',\n\nNous avons le plaisir de vous présenter [nouveauté / offre] : [2 lignes de description et avantages].\n[Conditions : prix, quantité minimale, validité].\n\nJe peux vous envoyer des photos ou passer vous montrer les échantillons. Quel jour vous conviendrait ?\n\nCordialement,\n' + SIG : 'Bonjour ' + n + ', nouveauté chez MARIA BAG : [produit / offre] — [avantage principal]. Conditions : [prix / quantité / validité]. Je vous envoie les photos ou je passe avec des échantillons ?',
    6: (c, n) => c === 'E-mail' ? 'Objet : Votre demande de prix — MARIA BAG\n\nBonjour ' + n + ',\n\nMerci pour votre demande. Voici nos prix pour [produit] : [prix unitaire] DA à partir de [quantité] pièces, délai de livraison [délai], paiement [conditions].\n\nJe reste à votre disposition pour adapter l\'offre à vos besoins.\n\nCordialement,\n' + SIG : 'Bonjour ' + n + ', merci pour votre demande. Pour [produit] : [prix] DA/pièce à partir de [quantité] pièces, livraison sous [délai], paiement [conditions]. Je peux adapter l\'offre si besoin.',
    7: (c, n) => c === 'E-mail' ? 'Objet : [objet]\n\nBonjour ' + n + ',\n\n[Votre message]\n\nCordialement,\n' + SIG : 'Bonjour ' + n + ', [votre message]. Merci et bonne journée.'
  };
  function genHtml() {
    const g = gen, sel = (id, arr, v) => '<select id="' + id + '">' + arr.map((x, i) => '<option value="' + i + '"' + (String(v) === String(i) ? ' selected' : '') + '>' + esc(x) + '</option>').join('') + '</select>';
    return '<div class="zs-m bot zs-gen"><b>✉ Rédiger un message professionnel</b>' +
      '<label>Canal ' + sel('zg-c', CANAUX, g.c) + '</label><label>Destinataire ' + sel('zg-d', DEST, g.d) + '</label><label>Objectif ' + sel('zg-o', OBJ, g.o) + '</label>' +
      '<label>Nom de la personne ou de la société <input id="zg-n" maxlength="80" placeholder="Ex : Mme Karima, Ardis Hydra" value="' + esc(g.n) + '"></label>' +
      '<label>Détails à préciser (facultatif) <textarea id="zg-x" rows="2" maxlength="500" placeholder="Date, produits, montants, contexte…">' + esc(g.x) + '</textarea></label>' +
      '<label>Ton ' + sel('zg-t', TON, g.t) + '</label>' +
      '<div class="zg-b"><button type="button" id="zg-go">Rédiger</button><button type="button" id="zg-cancel" class="alt">Annuler</button></div></div>';
  }
  const genLire = () => { if (!gen || !$('#zg-c')) return; gen.c = $('#zg-c').value; gen.d = $('#zg-d').value; gen.o = $('#zg-o').value; gen.n = $('#zg-n').value; gen.x = $('#zg-x').value; gen.t = $('#zg-t').value; };
  function genEnvoyer() {
    genLire(); const g = gen, canal = CANAUX[g.c], dest = DEST[g.d], obj = OBJ[g.o], nom = g.n.trim();
    const prompt = 'Rédige un message ' + canal + ' professionnel, prêt à copier-coller, destiné à : ' + dest + (nom ? ' (' + nom + ')' : '') + '. Objectif : ' + obj + '. Ton : ' + TON[g.t].toLowerCase() + '.' + (g.x.trim() ? ' Détails : ' + g.x.trim() : '') + ' Utilise des [crochets] pour les informations manquantes.';
    const tpl = () => '```\n' + MOD[g.o](canal, nom || '[Nom]') + '\n```';
    gen = null; send(prompt, tpl);
  }

  /* ---------- Données réelles de la plateforme transmises à ZACKsmart (stock) ---------- */
  const STOP = new Set(['combien', 'jai', 'est', 'les', 'des', 'une', 'que', 'quel', 'quelle', 'quels', 'quelles', 'pour', 'dans', 'avec', 'mon', 'mes', 'ton', 'stock', 'reste', 'encore', 'matiere', 'matieres', 'article', 'quantite', 'produit', 'produits', 'finis', 'fini', 'tout', 'tous', 'liste', 'donne', 'moi', 'dis', 'sur', 'ceci', 'cela', 'quoi', 'faut', 'dois', 'peux', 'faire', 'avoir', 'suis', 'sont', 'plus', 'moins', 'quand', 'the', 'etat']);
  const WORDS = /(stock|matiere|tissu|rouleau|metre|yard|fermeture|curseur|doublure|article|quantite|combien|reste|rupture|alerte|commander|acheter|disponible|inventaire|produit fini|produits finis|modele fini|manque)/;
  const nz = s => norm(s).replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  const f2 = n => (Math.round((Number(n) || 0) * 100) / 100).toLocaleString('fr-FR').replace(/[\u202f\u00a0]/g, ' ');
  function contexteStock(question) {
    try {
      if (!window.StockAPI || !StockAPI.list) return '';
      const q = nz(question), toks = q.split(' ').filter(w => w.length >= 3 && !STOP.has(w));
      const art = StockAPI.list(), pf = (window.PFAPI && PFAPI.list) ? PFAPI.list() : [];
      const hay = x => nz([x.nom, x.categorie, x.couleur, x.marque, x.note].join(' '));
      const hit = (arr) => arr.filter(x => { const h = hay(x); return toks.some(t => h.includes(t) || (t.length > 4 && h.includes(t.slice(0, -1)))); });
      const mA = hit(art), mP = hit(pf.map(p => ({ nom: p.nom, _p: p }))).map(x => x._p);
      if (!WORDS.test(q) && !mA.length && !mP.length) return '';
      const cl = id => { const c = (typeof D !== 'undefined' && Array.isArray(D)) ? D.find(x => String(x.id) === String(id)) : null; return c ? (c.societe || [c.prenom, c.nom].filter(Boolean).join(' ')) : ''; };
      const ligne = a => { const qte = StockAPI.qty(a.id), f = StockAPI.fmtQty(a, qte), e = StockAPI.etat(a), cmd = StockAPI.aCommander(a), seuil = Number(a.seuil_alerte) || 0;
        return '- ' + a.nom + ' [' + (a.categorie || '') + (a.couleur ? ', ' + a.couleur : '') + '] : ' + f.main + (f.sub ? ' (' + f.sub + ')' : '') + ' — état : ' + e.l + (seuil ? ' (seuil d\'alerte ' + f2(seuil) + ' ' + a.unite + ')' : '') +
          ' — prix : ' + f2(StockAPI.unitPrice(a)) + ' DA/' + a.unite + (StockAPI.aCond(a) ? ' (' + f2(a.prix_achat) + ' DA le ' + a.cond_nom + ' de ' + f2(StockAPI.condQte(a)) + ' ' + a.unite + ')' : '') +
          (cmd.qty > 0 ? ' — à commander : ' + f2(cmd.qty) + ' ' + a.unite : '') + (cl(a.contact_id) ? ' — fournisseur : ' + cl(a.contact_id) : '') + (a.marque ? ' — marque : ' + a.marque : ''); };
      const alertes = art.filter(a => StockAPI.enAlerte(a)).sort((a, b) => StockAPI.etat(a).rank - StockAPI.etat(b).rank);
      const jour = new Date().toLocaleDateString('fr-FR');
      let t = 'DONNÉES RÉELLES DU STOCK, lues dans la plateforme (au ' + jour + ') — seule source valable pour les quantités et prix :\n' +
        'MATIÈRES : ' + art.length + ' articles en tout, dont ' + alertes.length + ' en alerte (rupture, négatif ou stock bas).\n';
      const choisis = mA.length ? mA.slice(0, 40) : art.slice().sort((a, b) => StockAPI.etat(a).rank - StockAPI.etat(b).rank || String(a.nom).localeCompare(String(b.nom))).slice(0, 60);
      t += (mA.length ? 'Articles correspondant à la question :\n' : 'Articles (triés : alertes d\'abord) :\n') + (choisis.length ? choisis.map(ligne).join('\n') : '(aucun article)') + '\n';
      if (mA.length && alertes.length) t += 'Autres articles en alerte :\n' + alertes.filter(a => !mA.includes(a)).slice(0, 12).map(ligne).join('\n') + '\n';
      if (!mA.length && art.length > choisis.length) t += '(… ' + (art.length - choisis.length) + ' autres articles non listés : si l\'utilisateur en cherche un précis, demande-lui son nom exact.)\n';
      if (pf.length) {
        const lp = p => { const c = window.PFAPI.coutProduit ? PFAPI.coutProduit(p) : null; return '- ' + p.nom + ' : ' + f2(PFAPI.qty(p.id)) + ' pièces en stock' + (c ? ' — coût de revient ' + f2(c) + ' DA' : '') + (Number(p.prix_vente) > 0 ? ' — prix de vente ' + f2(p.prix_vente) + ' DA' : ''); };
        const sel = mP.length ? mP.slice(0, 30) : pf.slice(0, 40);
        t += 'PRODUITS FINIS : ' + pf.length + ' produits.\n' + sel.map(lp).join('\n') + '\n';
      }
      return t.slice(0, 9000);
    } catch (e) { return ''; }
  }

  const faq = q => { const n = norm(q); let best = null, sc = 0; FAQ.forEach(([ks, a]) => { const s = ks.filter(k => n.includes(norm(k))).length; if (s > sc) { sc = s; best = a; } }); return best; };
  const page = () => { const b = document.querySelector('nav button.on'); return b ? b.textContent.trim() : ''; };

  function build() {
    if ($('#zs-btn')) return;
    const b = document.createElement('button'); b.id = 'zs-btn'; b.type = 'button'; b.innerHTML = '<span class="zs-av">Z</span>ZACKsmart'; b.title = 'Assistant ZACKsmart';
    const p = document.createElement('div'); p.id = 'zs-panel';
    p.innerHTML = '<header><span class="zs-av">Z</span><div><b>ZACKsmart</b><small>Conseiller commercial et guide de la plateforme</small></div><button type="button" id="zs-deep" title="Mode discussion approfondie (réponses détaillées)">🧠</button><button type="button" id="zs-big" title="Agrandir / réduire">⤢</button><button type="button" id="zs-clear" title="Effacer la conversation">🗑</button><button type="button" id="zs-close" title="Fermer">✕</button></header>' +
      '<div id="zs-msgs"></div><div id="zs-st"></div><div id="zs-tools"><button type="button" id="zs-msgbtn">✉ Rédiger un message</button></div><form id="zs-form"><textarea id="zs-input" rows="1" maxlength="1000" placeholder="Posez votre question…"></textarea><button id="zs-send" type="submit">Envoyer</button></form>';
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
    const ouvrir = () => { p.classList.add('on'); lock(true); fit(); paint(); if (!mobile()) $('#zs-input').focus(); rafraichir(true); };
    const fermer = () => { p.classList.remove('on'); lock(false); };
    if (vv) { vv.addEventListener('resize', fit); vv.addEventListener('scroll', fit); }
    window.addEventListener('orientationchange', () => setTimeout(fit, 250)); window.addEventListener('resize', fit);
    $('#zs-input').addEventListener('focus', () => setTimeout(fit, 300));
    b.onclick = () => { if (p.classList.contains('on')) fermer(); else ouvrir(); };
    $('#zs-close').onclick = fermer;
    $('#zs-clear').onclick = async () => { if (!msgs.length) return; if (!confirm('Effacer la conversation sur tous vos appareils ?')) return;
      const r = rem(); if (r && navigator.onLine) { try { const q = await r.from(TBL).delete().eq('proprietaire', owner()); if (q.error) { majEtat(false, en(q.error)); return; } } catch (e) { majEtat(false, en(e)); return; } }
      else if (r) { alert('Connexion nécessaire pour effacer la conversation sur tous les appareils.'); return; }
      msgs = []; save(); paint(); };
    window.ouvrirGen = () => { if (!gen) gen = { c: 0, d: 0, o: 0, n: '', x: '', t: 0 }; paint(); const b = $('#zs-msgs'); if (b) b.scrollTop = b.scrollHeight; };
    $('#zs-msgbtn').onclick = () => { if (gen) { gen = null; paint(); } else window.ouvrirGen(); };
    $('#zs-msgs').addEventListener('click', e => {
      const c = e.target.closest('[data-copy]'); if (c) { copier(c.dataset.t, c); return; }
      if (e.target.id === 'zg-go') genEnvoyer(); else if (e.target.id === 'zg-cancel') { gen = null; paint(); } });
    $('#zs-msgs').addEventListener('input', () => genLire());
    $('#zs-form').onsubmit = e => { e.preventDefault(); send($('#zs-input').value); };
    $('#zs-input').addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send($('#zs-input').value); } });
    paint();
  }
  function paint() {
    const box = $('#zs-msgs'); if (!box) return;
    let h = '<div class="zs-m bot">Bonjour 👋 Je suis <b>ZACKsmart</b>, développé par l’ingénieur <b>Benouadah Zakaria</b>. Je suis votre agent intelligent pour la société <b>Maria Bag</b> : je vous explique la plateforme et je vous conseille dans votre travail commercial (rendez-vous, prix, relances, organisation du travail…).</div>';
    if (!msgs.length) h += '<div class="zs-chips">' + SUGG.map(s => '<button type="button" data-q="' + esc(s) + '">' + esc(s) + '</button>').join('') + '</div>';
    msgs.forEach(m => { h += '<div class="zs-m ' + (m.role === 'user' ? 'me' : m.note ? 'note' : 'bot') + '">' + (m.role === 'user' ? esc(m.content).replace(/\n/g, '<br>') : md(m.content)) + '</div>'; });
    if (gen) h += genHtml();
    if (busy) h += '<div class="zs-m bot zs-dots"><span></span><span></span><span></span></div>';
    box.innerHTML = h; box.scrollTop = box.scrollHeight;
    box.querySelectorAll('[data-q]').forEach(x => x.onclick = () => { if (x.dataset.q.startsWith('Rédiger un message pro')) window.ouvrirGen(); else send(x.dataset.q); });
  }
  async function send(text, tpl) {
    text = String(text || '').trim(); if (!text || busy) return;
    $('#zs-input').value = ''; const mu = { role: 'user', content: text }; msgs.push(mu); busy = true; $('#zs-send').disabled = true; paint(); save();
    mu.envoi = true; ecrire('user', text).then(id => { mu.envoi = false; if (id) mu.id = id; });
    let rep = null, note = false;
    try {
      if (!navigator.onLine) throw new Error('offline');
      const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 60000);
      const r = await fetch(SUPABASE_URL + '/functions/v1/zacksmart', { method: 'POST', signal: ctl.signal, headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + SUPABASE_ANON_KEY },
        body: JSON.stringify({ messages: msgs.filter(m => !m.note).slice(-16).map(m => ({ role: m.role, content: m.content })), page: page(), deep, contexte: contexteStock(text) }) });
      clearTimeout(t);
      const d = await r.json().catch(() => ({}));
      if (r.ok && d.reply) rep = d.reply;
      else if (d.error === 'rate') { rep = 'Vous écrivez très vite 🙂 Patientez quelques secondes puis réessayez.'; note = true; }
      else throw new Error(d.error || 'http ' + r.status);
    } catch (e) {
      const f = tpl ? tpl() : faq(text), off = !navigator.onLine || e.message === 'offline', cfg = e.message === 'not_configured', salut = /^\s*(salut|bonjour|bonsoir|salam|slm|hello|coucou|hi)\b/i.test(text);
      rep = (off ? 'Vous êtes hors ligne : réponse de secours.' : cfg ? 'ZACKsmart n’est pas encore activé en mode intelligent : la clé de l’IA n’a pas encore été ajoutée côté serveur (Supabase → Edge Functions → Secrets → AI_API_KEY). En attendant, voici une aide de base.' : 'L’assistant intelligent ne répond pas pour le moment (' + esc(e.message) + ') : réponse de secours.') + '\n' +
        (salut ? 'Bonjour ! Je suis ZACKsmart 😊 Une fois activé, nous pourrons discuter en profondeur de votre travail commercial et de l’organisation du travail.' : f ? f : 'Je n’ai pas de réponse prête pour cette question. Reformulez avec des mots comme « facture », « rendez-vous », « fiche de paie », « stock »…');
      note = false;
    }
    const ma = { role: 'assistant', content: rep, note }; msgs.push(ma); busy = false; $('#zs-send').disabled = false; paint(); save();
    ma.envoi = true; ecrire('assistant', rep).then(id => { ma.envoi = false; if (id) ma.id = id; elaguer(); });
  }

  document.addEventListener('mariabag:authenticated', () => { build(); $('#zs-btn').classList.add('on'); setTimeout(() => rafraichir(true), 1500); });
  // autres appareils : on relit la conversation régulièrement quand la fenêtre est ouverte, et au retour sur l'application
  setInterval(() => { const p = $('#zs-panel'); if (p && p.classList.contains('on') && document.visibilityState === 'visible') rafraichir(); }, 6000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && $('#zs-btn')) rafraichir(); });
  window.addEventListener('online', () => { if ($('#zs-btn')) rafraichir(true); });
  // déconnexion : on masque l'assistant quand l'écran de connexion est affiché (la connexion par ancien mot de passe n'a pas de profil)
  document.addEventListener('mariabag:profil', () => setTimeout(() => { const l = $('#login'), b = $('#zs-btn'), p = $('#zs-panel');
    if (l && b && getComputedStyle(l).display !== 'none') { b.classList.remove('on'); if (p) p.classList.remove('on'); document.documentElement.classList.remove('zs-lock'); } }, 60));
})();
