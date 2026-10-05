/* Culture Gé — profil du joueur, synchronisé entre tous ses appareils.
 *
 * Chaque appareil a un identifiant de joueur. Le code de transfert (« KX7P-2MQH ») le donne à un
 * autre appareil (iPhone, Mac, Safari et appli installée, nouveau téléphone) : tous jouent alors
 * sous le même profil. Ce profil est synchronisé à l'ouverture, au retour dans l'appli et en fin
 * de partie :
 * - carte du jour (et donc la série) : résultats publiés sur le serveur, qui font foi ;
 * - groupes : liste tenue par le serveur ;
 * - records du solo (on garde le meilleur), questions déjà vues (réunies), prénom (le dernier
 *   changé) : dans les « données » du profil, fusionnées par chaque appareil puis renvoyées.
 */
'use strict';

const CLE_PROFIL_SYNC = 'trivial1000.profil.sync'; // données envoyées lors de la dernière synchronisation
const CLE_PROFIL_IGNORE = 'trivial1000.profil.ignore';
const CLE_PROFIL_DATE = 'trivial1000.profil.date'; // heure de la dernière synchronisation réussie
const CLE_NOM_DATE = 'trivial1000.nom.date'; // [prénom, date de son dernier changement]
let codeProfilCache = null;
let jourJoueAilleurs = false; // carte du jour commencée ici, terminée sur un autre appareil

/* ---------------- Questions déjà vues : ensemble d'identifiants ↔ texte compact ---------------- */

function vuesEnTexte(ids) {
  const max = Math.max(-1, ...ids);
  const octets = new Uint8Array(Math.floor(max / 8) + 1);
  for (const id of ids) octets[id >> 3] |= 1 << (id & 7);
  let bin = '';
  octets.forEach(o => { bin += String.fromCharCode(o); });
  return btoa(bin);
}

function vuesDepuisTexte(texte) {
  const ids = [];
  try {
    const bin = atob(texte || '');
    for (let i = 0; i < bin.length; i++) {
      const o = bin.charCodeAt(i);
      for (let b = 0; b < 8; b++) if (o & (1 << b)) ids.push(i * 8 + b);
    }
  } catch { /* texte illisible : rien */ }
  return ids;
}

/* ---------------- Sauvegarde et synchronisation ---------------- */

/** Date du dernier changement de prénom sur cet appareil (repéré en comparant au prénom connu). */
function dateNom() {
  const [nom, date] = lire(CLE_NOM_DATE, ['', 0]);
  if (nom === nomJoueur()) return date;
  const maintenant = nomJoueur() ? Date.now() : 0;
  ecrire(CLE_NOM_DATE, [nomJoueur(), maintenant]);
  return maintenant;
}

function donneesProfil() {
  const d = { nom: nomJoueur(), nomDate: dateNom(), records: lire(CLE_SOLO_RECORDS, {}) };
  const vues = lire(CLE_SOLO_VUES, []);
  if (vues.length) d.vues = vuesEnTexte(vues);
  return d;
}

function profilVide(d) {
  return !d.nom && !Object.keys(d.records).length && !d.vues;
}

/** Envoie le prénom, les records et les questions vues s'ils ont changé depuis le dernier envoi
 * (sans relire le serveur : voir sauverProfil). */
async function envoyerProfil() {
  const donnees = donneesProfil();
  if (profilVide(donnees)) return; // rien de propre à cet appareil
  const empreinte = JSON.stringify(donnees);
  if (lire(CLE_PROFIL_SYNC, null) === empreinte) return;
  try {
    await rpc('sauver_profil', { p_joueur: idJoueur(), p_donnees: donnees });
    ecrire(CLE_PROFIL_SYNC, empreinte);
  } catch { /* hors connexion : on réessaiera */ }
}

/** Fusionne le profil du serveur avec cet appareil. Renvoie vrai si quelque chose a changé ici. */
function fusionnerProfil(p) {
  let change = false;
  // Carte du jour : le résultat publié fait foi (celui de l'appareil qui l'a jouée en premier).
  const tous = resultatsJour();
  const publies = new Set(lire(CLE_JOUR_PUBLIE, []));
  for (const r of p.resultats || []) {
    const res = r.res.split('').map(c => c === '1');
    const ici = tous[r.jour];
    if (!ici || ici.score !== r.points || ici.res.join() !== res.join()) {
      tous[r.jour] = { score: r.points, res };
      change = true;
    }
    publies.add(r.jour);
  }
  if (change) {
    ecrire(CLE_JOUR, tous);
    ecrire(CLE_JOUR_PUBLIE, [...publies].sort((a, b) => a - b).slice(-10));
  }
  // Carte du jour commencée ici mais déjà jouée ailleurs : abandonnée.
  if (solo && solo.mode === 'jour' && solo.phase !== 'fin' && tous[solo.jour]) {
    solo = null;
    effacer(CLE_SOLO);
    jourJoueAilleurs = true;
    change = true;
  }
  const d = p.donnees || {};
  // Records du solo : le meilleur de chaque réglage.
  const records = lire(CLE_SOLO_RECORDS, {});
  for (const [cle, r] of Object.entries(d.records || {})) {
    if (!records[cle] || r.score > records[cle].score) { records[cle] = r; change = true; }
  }
  ecrire(CLE_SOLO_RECORDS, records);
  // Questions déjà vues : réunies.
  const vues = new Set(lire(CLE_SOLO_VUES, []));
  const avant = vues.size;
  vuesDepuisTexte(d.vues).forEach(id => vues.add(id));
  if (vues.size !== avant) ecrire(CLE_SOLO_VUES, [...vues]);
  // Prénom : le plus récemment changé, sur cet appareil ou un autre.
  if (d.nom && d.nom !== nomJoueur() && (d.nomDate || 0) > dateNom()) {
    ecrire(CLE_NOM, d.nom);
    ecrire(CLE_NOM_DATE, [d.nom, d.nomDate]);
    change = true;
  }
  return change;
}

let synchroEnCours = null;
let synchroARefaire = false;
let derniereSynchro = 0;

/** Après un changement ici : relire le serveur, fusionner, puis envoyer (sans écraser ce qu'un autre
 * appareil vient d'envoyer). */
function sauverProfil() {
  return synchroniserProfil({ force: true });
}

/** Récupère le profil sur le serveur, le fusionne, renvoie le résultat et rafraîchit l'écran. */
function synchroniserProfil({ force = false } = {}) {
  if (synchroEnCours) {
    if (force) synchroARefaire = true; // changement pendant la synchronisation : on recommencera
    return synchroEnCours;
  }
  if (!force && Date.now() - derniereSynchro < 15000) return Promise.resolve(false);
  derniereSynchro = Date.now();
  synchroEnCours = (async () => {
    try {
      const p = await rpc('profil_joueur', { p_joueur: idJoueur() });
      if (!p) return false;
      if (p.code) codeProfilCache = p.code;
      const change = fusionnerProfil(p);
      ecrire(CLE_GROUPES, (p.groupes || []).map(({ code, nom }) => ({ code, nom })));
      // Données du serveur différentes du résultat de la fusion : on renvoie la version fusionnée.
      if (JSON.stringify(donneesProfil()) !== JSON.stringify(p.donnees || {})) effacer(CLE_PROFIL_SYNC);
      await envoyerProfil();
      ecrire(CLE_PROFIL_DATE, Date.now());
      if (change) rafraichirApresSynchro();
      return change;
    } catch {
      return false; // hors connexion
    } finally {
      synchroEnCours = null;
      if (synchroARefaire) { synchroARefaire = false; setTimeout(() => synchroniserProfil({ force: true }), 0); }
    }
  })();
  return synchroEnCours;
}

/** Réaffiche l'écran courant avec les données synchronisées (jamais en pleine partie). */
function rafraichirApresSynchro() {
  const vue = location.hash.slice(1) || 'accueil';
  if (vue === 'accueil') { majMenuJour(); banniereProfil(); }
  if (vue === 'jour') rendreJour();
  if (vue === 'reglages') { const f = $('#form-reglages'); if (f && document.activeElement !== f.nom) f.nom.value = nomJoueur(); rendreProfil(); }
  // Carte du jour en cours ici, mais terminée sur un autre appareil : on montre son résultat.
  if (vue === 'solo' && jourJoueAilleurs) location.hash = '#jour';
  jourJoueAilleurs = false;
}

/** Profil retrouvé par son code (ou par cookie) : cet appareil adopte l'identifiant et fusionne. */
async function restaurerProfil(p, { adopter = false } = {}) {
  const ancienId = lire(CLE_JOUEUR, null);
  const groupesLocaux = mesGroupesLocaux();
  if (adopter && p.joueur !== ancienId) {
    ecrire(CLE_JOUEUR, p.joueur);
    ecrireCookieJoueur(p.joueur);
  }
  effacer(CLE_PROFIL_SYNC);
  fusionnerProfil(p);
  // Groupes : ceux du profil, plus ceux rejoints sur cet appareil (rattachés au profil récupéré).
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
    const publies = new Set((p.resultats || []).map(r => r.jour));
    ecrire(CLE_JOUR_PUBLIE, [...publies].slice(-10));
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
  await envoyerProfil();
  ecrire(CLE_PROFIL_DATE, Date.now());
  return { cartes: Object.keys(resultatsJour()).length, groupes: groupes.length };
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
  // Identifiant retrouvé dans un cookie : le profil est complété depuis le serveur (comme partout).
  sessionStorage.removeItem('trivial1000.profil.cookie');
  synchroniserProfil({ force: true });
  document.addEventListener('visibilitychange', () => {
    // En quittant l'appli : envoi direct (une seule requête, qui a le temps de partir).
    if (document.visibilityState === 'hidden') envoyerProfil();
    else synchroniserProfil();
  });
  window.addEventListener('online', () => synchroniserProfil({ force: true }));
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

/** « Synchronisé il y a 2 min », avec un bouton pour synchroniser tout de suite. */
function etatSynchro() {
  const date = lire(CLE_PROFIL_DATE, 0);
  const texte = () => {
    const d = lire(CLE_PROFIL_DATE, 0);
    if (!d) return 'Pas encore synchronisé.';
    const min = Math.round((Date.now() - d) / 60000);
    return `Synchronisé ${min < 1 ? 'à l\'instant' : min < 60 ? `il y a ${min} min` : `le ${new Date(d).toLocaleString('fr-FR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}`}.`;
  };
  const info = h('span', { class: 'aide', 'aria-live': 'polite' }, texte());
  return h('p', { class: 'etat-synchro' }, info, ' ', h('button', {
    type: 'button', class: 'btn-lien',
    onclick: async () => {
      info.textContent = 'Synchronisation…';
      await synchroniserProfil({ force: true });
      info.textContent = lire(CLE_PROFIL_DATE, 0) > date ? texte() : 'Synchronisation impossible hors connexion.';
    },
  }, 'Synchroniser'));
}

/** Rubrique « Mon profil » des réglages. */
function rendreProfil(message) {
  const zone = $('#profil-reglages');
  if (!zone) return;
  zone.replaceChildren(
    h('legend', {}, 'Mon profil'),
    message ? h('p', { class: 'verdict juste', 'aria-live': 'polite' }, message) : null,
    h('p', { class: 'aide' }, 'Jouez sur plusieurs appareils (iPhone, ordinateur, appli installée et navigateur…) : saisissez ce code sur chacun, une fois. Ils partagent alors le même profil, synchronisé automatiquement : carte du jour et série, records, questions déjà vues, groupes et prénom. Gardez-le pour vous : il donne accès à votre profil.'),
    blocMonCode(),
    etatSynchro(),
    h('details', { class: 'recuperer-profil' },
      h('summary', {}, 'J\'ai déjà un code (profil créé sur un autre appareil)'),
      formulaireCode(bilan => {
        $('#form-reglages').nom.value = nomJoueur();
        rendreProfil(`✅ ${texteBilan(bilan)}`);
      })));
}

/** Première ouverture de l'appli installée : proposer de récupérer le profil de Safari. */
function banniereProfil() {
  const zone = $('#profil-accueil');
  if (!zone) return;
  const afficher = telephoneVierge() && !lire(CLE_PROFIL_IGNORE, false);
  if (!afficher) { zone.replaceChildren(); return; }
  zone.replaceChildren(h('div', { class: 'banniere-profil' },
    h('h3', {}, 'Vous jouez déjà sur un autre appareil ?'),
    h('p', { class: 'aide' }, 'Collez votre code de transfert (Réglages → Mon profil, sur l\'autre appareil) : vos parties, votre série, vos records et vos groupes seront partagés entre les deux.'),
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
