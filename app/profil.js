/* Culture Gé — profil du joueur et transfert entre écrans.
 *
 * Sur iPhone, Safari et l'appli installée sur l'écran d'accueil ont chacun leur stockage. Pour
 * passer de l'un à l'autre (ou changer de téléphone), un code de transfert du type « KX7P-2MQH »
 * redonne l'identifiant du joueur : groupes, historique de la carte du jour (série comprise),
 * prénom et records du mode solo. Les données propres au téléphone (prénom, records) sont
 * sauvegardées sur le serveur à chaque changement.
 */
'use strict';

const CLE_PROFIL_SYNC = 'trivial1000.profil.sync';
const CLE_PROFIL_IGNORE = 'trivial1000.profil.ignore';
let codeProfilCache = null;

/* ---------------- Sauvegarde et restauration ---------------- */

function donneesProfil() {
  return { nom: nomJoueur(), records: lire(CLE_SOLO_RECORDS, {}) };
}

/** Envoie le prénom et les records s'ils ont changé depuis la dernière sauvegarde. */
async function sauverProfil() {
  const donnees = donneesProfil();
  if (!donnees.nom && !Object.keys(donnees.records).length) return; // rien de propre à ce téléphone
  const empreinte = JSON.stringify(donnees);
  if (lire(CLE_PROFIL_SYNC, null) === empreinte) return;
  try {
    await rpc('sauver_profil', { p_joueur: idJoueur(), p_donnees: donnees });
    ecrire(CLE_PROFIL_SYNC, empreinte);
  } catch { /* hors connexion : on réessaiera */ }
}

/** Fusionne un profil venu du serveur avec ce que le téléphone sait déjà. */
async function restaurerProfil(p, { adopter = false } = {}) {
  const ancienId = lire(CLE_JOUEUR, null);
  const groupesLocaux = mesGroupesLocaux();
  if (adopter && p.joueur !== ancienId) {
    ecrire(CLE_JOUEUR, p.joueur);
    ecrireCookieJoueur(p.joueur);
  }
  // Carte du jour : l'historique du serveur complète celui du téléphone (la série repart d'elle-même).
  const tous = resultatsJour();
  for (const r of p.resultats || []) {
    if (!tous[r.jour]) tous[r.jour] = { score: r.points, res: r.res.split('').map(c => c === '1') };
  }
  ecrire(CLE_JOUR, tous);
  // Records du solo : on garde le meilleur de chaque réglage.
  const records = lire(CLE_SOLO_RECORDS, {});
  for (const [cle, r] of Object.entries((p.donnees && p.donnees.records) || {})) {
    if (!records[cle] || r.score > records[cle].score) records[cle] = r;
  }
  ecrire(CLE_SOLO_RECORDS, records);
  if (!nomJoueur() && p.donnees && p.donnees.nom) ecrire(CLE_NOM, p.donnees.nom);
  // Groupes : ceux du profil, plus ceux rejoints sur ce téléphone (rattachés au profil récupéré).
  const groupes = (p.groupes || []).map(({ code, nom }) => ({ code, nom }));
  for (const g of groupesLocaux) {
    if (groupes.some(x => x.code === g.code)) continue;
    try {
      const rejoint = await rpc('rejoindre_groupe', { p_code: g.code, p_joueur: p.joueur, p_pseudo: nomJoueur() || 'Joueur' });
      if (rejoint) groupes.push(rejoint);
    } catch { groupes.push(g); }
  }
  ecrire(CLE_GROUPES, groupes);
  if (adopter && ancienId && ancienId !== p.joueur) {
    // Les cartes jouées ici sous l'ancien identifiant sont republiées sous le profil récupéré.
    effacer(CLE_JOUR_PUBLIE);
    rattraperPublication();
    // Le rappel quotidien suit le profil (pour ne pas prévenir quelqu'un qui a déjà joué).
    const r = lire(CLE_RAPPEL, null);
    if (r && pushPossible()) {
      abonnementPush().then(sub => {
        if (!sub) return;
        const cles = sub.toJSON().keys;
        return rpc('s_abonner', { p_endpoint: sub.endpoint, p_p256dh: cles.p256dh, p_auth: cles.auth, p_heure: r.heure, p_joueur: p.joueur });
      }).catch(() => {});
    }
  }
  codeProfilCache = p.code || null;
  effacer(CLE_PROFIL_SYNC);
  sauverProfil();
  return { cartes: Object.keys(tous).length, groupes: groupes.length };
}

async function recupererParCode(code) {
  const p = await rpc('recuperer_profil', { p_code: code });
  if (!p) return null;
  return restaurerProfil(p, { adopter: true });
}

function telephoneVierge() {
  return !Object.keys(resultatsJour()).length && !mesGroupesLocaux().length && !Object.keys(lire(CLE_SOLO_RECORDS, {})).length;
}

function initProfil() {
  // Identifiant retrouvé dans un cookie : on complète le profil depuis le serveur.
  if (sessionStorage.getItem('trivial1000.profil.cookie')) {
    sessionStorage.removeItem('trivial1000.profil.cookie');
    rpc('profil_joueur', { p_joueur: idJoueur() })
      .then(p => (p ? restaurerProfil(p) : null))
      .then(bilan => { if (bilan && bilan.cartes + bilan.groupes > 0) naviguer(); })
      .catch(() => {});
  }
  sauverProfil();
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') sauverProfil(); });
}

/* ---------------- Affichage ---------------- */

function formatCode(texte) {
  const brut = texte.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
  return brut.length > 4 ? `${brut.slice(0, 4)}-${brut.slice(4)}` : brut;
}

/** Le code de ce profil, avec un bouton pour le copier. */
function blocMonCode() {
  const code = h('b', { class: 'code-profil' }, codeProfilCache || '…');
  const info = h('span', { class: 'aide', 'aria-live': 'polite' });
  const copier = h('button', {
    type: 'button', class: 'btn btn-clair', disabled: !codeProfilCache,
    onclick: () => navigator.clipboard.writeText(code.textContent)
      .then(() => { info.textContent = ' Copié !'; })
      .catch(() => { info.textContent = ' Notez-le.'; }),
  }, 'Copier');
  if (!codeProfilCache) {
    rpc('code_profil', { p_joueur: idJoueur() })
      .then(c => { codeProfilCache = c; code.textContent = c; copier.disabled = false; })
      .catch(() => { code.textContent = 'indisponible hors connexion'; });
  }
  return h('div', { class: 'mon-code' }, code, copier, info);
}

function texteBilan(bilan) {
  return `Profil récupéré : ${bilan.cartes} carte${bilan.cartes > 1 ? 's' : ''} du jour, ${bilan.groupes} groupe${bilan.groupes > 1 ? 's' : ''}.`;
}

/** Formulaire « j'ai déjà un code ». `apres(bilan)` est appelé en cas de succès. */
function formulaireCode(apres) {
  const info = h('p', { class: 'message', 'aria-live': 'polite' });
  const champ = h('input', {
    type: 'text', name: 'code', placeholder: 'XXXX-XXXX', maxlength: 9, autocomplete: 'off', autocapitalize: 'characters',
    class: 'code-salle', 'aria-label': 'Code de transfert',
    oninput: e => { e.target.value = formatCode(e.target.value); },
  });
  const coller = navigator.clipboard && navigator.clipboard.readText ? h('button', {
    type: 'button', class: 'btn btn-clair',
    onclick: async () => {
      try { champ.value = formatCode(await navigator.clipboard.readText()); } catch { champ.focus(); }
    },
  }, 'Coller') : null;
  return h('form', {
    class: 'formulaire-code',
    onsubmit: async ev => {
      ev.preventDefault();
      if (champ.value.replace('-', '').length !== 8) { info.textContent = 'Le code compte 8 caractères, par exemple KX7P-2MQH.'; return; }
      info.textContent = 'Récupération…';
      try {
        const bilan = await recupererParCode(champ.value);
        if (!bilan) { info.textContent = 'Code inconnu. Vérifiez-le dans Réglages → Mon profil, sur l\'autre écran.'; return; }
        info.textContent = texteBilan(bilan);
        if (apres) apres(bilan);
      } catch { info.textContent = 'Connexion impossible. Réessayez avec internet.'; }
    },
  },
    h('div', { class: 'code-ligne' }, champ, coller, h('button', { type: 'submit', class: 'btn' }, 'Récupérer')),
    info);
}

/** Rubrique « Mon profil » des réglages. */
function rendreProfil(message) {
  const zone = $('#profil-reglages');
  if (!zone) return;
  zone.replaceChildren(
    h('legend', {}, 'Mon profil'),
    message ? h('p', { class: 'verdict juste', 'aria-live': 'polite' }, message) : null,
    h('p', { class: 'aide' }, 'Votre code de transfert retrouve vos groupes, votre série de la carte du jour et vos records dans l\'appli installée, dans un autre navigateur ou sur un nouveau téléphone. Gardez-le pour vous : il donne accès à votre profil.'),
    blocMonCode(),
    h('details', { class: 'recuperer-profil' },
      h('summary', {}, 'J\'ai déjà un code (profil créé ailleurs)'),
      formulaireCode(bilan => {
        $('#form-reglages').nom.value = nomJoueur();
        rendreProfil(`✅ ${texteBilan(bilan)}`);
      })));
}

/** Première ouverture de l'appli installée : proposer de récupérer le profil de Safari. */
function banniereProfil() {
  const zone = $('#profil-accueil');
  if (!zone) return;
  const afficher = installee() && telephoneVierge() && !lire(CLE_PROFIL_IGNORE, false);
  if (!afficher) { zone.replaceChildren(); return; }
  zone.replaceChildren(h('div', { class: 'banniere-profil' },
    h('h3', {}, 'Déjà joué dans Safari ou sur un autre téléphone ?'),
    h('p', { class: 'aide' }, 'Collez votre code de transfert (Réglages → Mon profil, sur l\'autre écran) pour retrouver vos groupes, votre série et vos records.'),
    formulaireCode(() => setTimeout(() => { zone.replaceChildren(); majMenuJour(); }, 1800)),
    h('button', { type: 'button', class: 'btn-lien', onclick: () => { ecrire(CLE_PROFIL_IGNORE, true); zone.replaceChildren(); } }, 'Non, je commence ici')));
}

/** Dans Safari sur iPhone, avant d'installer l'appli : copier son code pour tout retrouver ensuite. */
function blocCodeAvantInstallation() {
  if (telephoneVierge()) return null;
  return h('div', { class: 'code-installation' },
    h('p', { class: 'aide' }, 'Avant d\'installer, copiez votre code de transfert : l\'appli vous le demandera pour retrouver vos scores et vos groupes.'),
    blocMonCode());
}
