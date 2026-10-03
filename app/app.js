/* Culture Gé — application sans dépendance. */
'use strict';

const CLE_JOUEURS = 'trivial1000.joueurs'; // derniers noms inscrits (quiz en groupe)
const CLE_SOLO = 'trivial1000.solo';
const CLE_SOLO_VUES = 'trivial1000.solo.vues';
const CLE_SOLO_RECORDS = 'trivial1000.solo.records';
const CLE_VOIX = 'trivial1000.voix';
const CLE_VOIX_CHOIX = 'trivial1000.voix.choix';
const CLE_NOM = 'trivial1000.nom';
const CLE_JOUR = 'trivial1000.jour';

// Texte lisible sur fond clair pour les couleurs trop pâles (jaune).
const COULEUR_TEXTE = { his: '#9a7a00' };

let DATA = null;          // { categories, cartes }
let CATS = [];            // catégories dans l'ordre des cartes
let QUESTIONS = [];       // liste à plat : { id, carte, cat, q, r, d, t }

/* ---------------- Utilitaires ---------------- */

const $ = (sel, racine = document) => racine.querySelector(sel);

// Comme h(), replaceChildren, append et prepend ignorent les enfants null ou false
// (sinon le navigateur affiche « null »).
for (const m of ['replaceChildren', 'append', 'prepend']) {
  const natif = Element.prototype[m];
  Element.prototype[m] = function (...enfants) { return natif.apply(this, enfants.filter(e => e != null && e !== false)); };
}

function h(balise, attrs = {}, ...enfants) {
  const el = document.createElement(balise);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style') el.style.cssText = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const e of enfants.flat()) {
    if (e == null || e === false) continue;
    el.append(e instanceof Node ? e : document.createTextNode(typo(e)));
  }
  return el;
}

function lire(cle, defaut) {
  try {
    const v = localStorage.getItem(cle);
    return v ? JSON.parse(v) : defaut;
  } catch { return defaut; }
}
let minuterieProfil = null;
function ecrire(cle, valeur) {
  try { localStorage.setItem(cle, JSON.stringify(valeur)); } catch { /* stockage indisponible */ }
  // Prénom et records font partie du profil sauvegardé (voir profil.js).
  if (cle === CLE_NOM || cle === CLE_SOLO_RECORDS) {
    clearTimeout(minuterieProfil);
    minuterieProfil = setTimeout(() => sauverProfil(), 800);
  }
}
function effacer(cle) {
  try { localStorage.removeItem(cle); } catch { /* ignore */ }
}

function melanger(tab) {
  const a = tab.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const numero = n => String(n).padStart(4, '0');
// Typographie française : espace insécable avant ? ! : ; » et après «, pour éviter
// qu'un signe se retrouve seul en début de ligne.
function typo(t) { return String(t).replace(/\s+([?!:;»])/g, '\u00a0$1').replace(/«\s+/g, '«\u00a0'); }
const styleCat = c => `--c:${c.couleur};--c-texte:${COULEUR_TEXTE[c.id] || c.couleur}`;
const catParId = id => CATS.find(c => c.id === id);

function niveau(niv) {
  const nom = NOMS_NIVEAUX[niv] || '';
  return h('span', { class: `niv niv-${niv}`, title: `Niveau ${nom.toLowerCase()}` }, nom);
}

/* ---------------- Rendu d'une carte ---------------- */

function ligneQuestion(cat, [q, r, niv], { ouvert = false, cliquable = true } = {}) {
  const el = h(cliquable ? 'button' : 'div', {
    class: 'ligne-q' + (ouvert ? ' ouvert' : ''),
    style: styleCat(cat),
    type: cliquable ? 'button' : null,
    'aria-expanded': cliquable ? String(ouvert) : null,
  },
    h('span', { class: 'cat' }, cat.nom, niveau(niv)),
    h('span', { class: 'q' }, q),
    h('span', { class: 'r' }, r),
  );
  if (cliquable) {
    el.append(h('span', { class: 'indice' }, 'Voir la réponse'));
    el.addEventListener('click', () => {
      const o = el.classList.toggle('ouvert');
      el.setAttribute('aria-expanded', String(o));
    });
  }
  return el;
}

/* ---------------- Difficulté ---------------- */

// Cinq niveaux de questions (champ niv) : 1 enfant (6 à 10 ans), 2 facile, 3 moyenne,
// 4 difficile, 5 expert. Une bonne réponse rapporte 1 point jusqu'à moyenne, 2 en difficile, 3 en expert.
const NOMS_NIVEAUX = ['', 'Enfant', 'Facile', 'Moyenne', 'Difficile', 'Expert'];
const pointsNiveau = niv => (niv <= 3 ? 1 : niv - 2);

// Réglages proposés (solo, quiz en groupe, soirée) → niveaux de questions retenus.
const NIVEAUX = {
  0: [2, 3, 4, 5], // toutes (sauf enfants)
  1: [2],
  2: [2, 3],
  3: [3, 4],
  4: [4, 5],
  5: [5],
  6: [1], // enfants
};
const NIVEAU_DEFAUT = 2;

/* ---------------- Lecture à voix haute ---------------- */

// Deux moteurs : la voix « Siwis » de Culture Gé (fichiers audio préparés par scripts/voix.py pour
// chaque question et chaque réponse) et, en secours ou au choix, la voix du téléphone.
const Synthese = 'speechSynthesis' in window ? window.speechSynthesis : null;
const LECTURE_POSSIBLE = !!Synthese || typeof Audio === 'function';
const URL_VOIX = 'https://romaindetroyat.github.io/culture-ge-voix/';
let voixFr = null;
let voixDispo = [];
let derniereLecture = null; // évite de relire la même question à chaque rafraîchissement
let jetonLecture = 0; // change à chaque nouvelle lecture ou à chaque arrêt : les suites en attente s'annulent
let lecteur = null;
let siwisEnPauseJusqua = 0; // réseau trop lent : voix du téléphone pendant une minute

// Les voix « naturelles », « améliorées » ou « premium » passent en tête.
function scoreVoix(v) {
  let s = 0;
  if (/natural|neural|premium|enhanced|am[ée]lior|siri|online|wavenet|studio/i.test(v.name)) s += 10;
  if (/google/i.test(v.name)) s += 5;
  if (/fr[-_]FR/i.test(v.lang)) s += 2;
  if (/compact|eloquence|espeak|robot/i.test(v.name)) s -= 5;
  return s;
}

function choisirVoix() {
  voixDispo = Synthese.getVoices().filter(v => /^fr([-_]|$)/i.test(v.lang)).sort((a, b) => scoreVoix(b) - scoreVoix(a));
  const pref = lire(CLE_VOIX_CHOIX, {});
  voixFr = voixDispo.find(v => v.voiceURI === pref.uri) || voixDispo[0] || null;
  if (typeof remplirChoixVoix === 'function') remplirChoixVoix();
}
if (Synthese) {
  choisirVoix();
  if (Synthese.addEventListener) Synthese.addEventListener('voiceschanged', choisirVoix);
}

const prefsVoix = () => lire(CLE_VOIX, { lecture: false, mainsLibres: false });
function voixSiwis() { return typeof Audio === 'function' && lire(CLE_VOIX_CHOIX, {}).siwis !== false; }
function vitesseVoix() { return lire(CLE_VOIX_CHOIX, {}).vitesse || 1; }

function texteParle(t) {
  return String(t).replace(/\s*\(([^)]*)\)/g, ', $1').replace(/\s*[«»]\s*/g, ' ').replace(/\bN°\s*/g, 'numéro ');
}

/** Clé du fichier audio d'un texte : cyrb53 du texte lu, en base 36 (même calcul dans scripts/voix.py). */
function cleVoix(texte) {
  const s = texteParle(texte).replace(/\s+/g, ' ').trim();
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) {
    const ch = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}
const urlVoix = texte => { const c = cleVoix(texte); return `${URL_VOIX}${c.slice(0, 2)}/${c}.mp3`; };

/** Met un fichier en cache HTTP pour qu'il parte sans attente (réponse d'une question affichée…). */
const dejaPrecharges = new Set();
function prechargerVoix(texte) {
  if (!voixSiwis() || !prefsVoix().lecture || navigator.onLine === false) return;
  const url = urlVoix(texte);
  if (dejaPrecharges.has(url)) return;
  dejaPrecharges.add(url);
  fetch(url).catch(() => dejaPrecharges.delete(url));
}

// Un seul élément audio, « débloqué » au premier toucher : iOS refuse ensuite de lire un son
// déclenché sans geste (lecture automatique, mode mains libres) sur un élément jamais joué.
function lecteurAudio() {
  if (!lecteur && typeof Audio === 'function') { lecteur = new Audio(); lecteur.preload = 'auto'; }
  return lecteur;
}
const SILENCE = 'data:audio/mpeg;base64,/+MYxAAAAANIAAAAAExBTUUzLjEwMFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV/+MYxDsAAANIAAAAAFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV';
function debloquerAudio() {
  document.removeEventListener('pointerdown', debloquerAudio, true);
  const a = lecteurAudio();
  if (!a || a.src) return;
  a.src = SILENCE;
  const p = a.play();
  if (p && p.catch) p.catch(() => {});
}
document.addEventListener('pointerdown', debloquerAudio, true);

/** Joue le fichier Siwis d'un texte ; résout à false s'il manque (404, hors ligne, lecture refusée). */
function jouerClip(texte, jeton) {
  return new Promise(resolve => {
    const a = lecteurAudio();
    let minuteur = null;
    const terminer = ok => {
      if (a.onended !== fin) return;
      a.onended = a.onerror = a.onplaying = null;
      clearTimeout(minuteur);
      if (!ok) a.pause(); // un fichier arrivé trop tard ne doit pas se lancer par-dessus la voix du téléphone
      resolve(ok && jeton === jetonLecture);
    };
    const fin = () => terminer(true);
    a.onended = fin;
    a.onerror = () => terminer(false);
    a.onplaying = () => clearTimeout(minuteur);
    minuteur = setTimeout(() => { siwisEnPauseJusqua = Date.now() + 60000; terminer(false); }, 6000);
    a.src = urlVoix(texte);
    a.defaultPlaybackRate = a.playbackRate = vitesseVoix();
    const p = a.play();
    if (p && p.catch) p.catch(() => terminer(false));
  });
}

function direTelephone(texte, apres) {
  if (!Synthese) { if (apres) apres(); return; }
  const phrases = texteParle(texte).split(/(?<=[.!?])\s+(?=\S)/).filter(Boolean);
  if (!phrases.length) { if (apres) apres(); return; }
  phrases.forEach((phrase, i) => {
    const u = new SpeechSynthesisUtterance(phrase);
    u.lang = voixFr ? voixFr.lang : 'fr-FR';
    u.rate = vitesseVoix();
    try { if (voixFr) u.voice = voixFr; } catch { /* voix indisponible : voix par défaut */ }
    if (apres && i === phrases.length - 1) u.onend = apres;
    Synthese.speak(u);
  });
}

/**
 * Lit un texte, ou une suite de morceaux lus l'un après l'autre ; `apres` est appelé à la fin.
 * Un morceau est un texte, ou { t, s } : t pour la voix du téléphone, s pour Siwis (null : sauté,
 * par exemple un prénom, qui n'a pas de fichier audio).
 */
function dire(morceaux, apres) {
  taire();
  const jeton = jetonLecture;
  const liste = [].concat(morceaux).map(m => typeof m === 'string' ? { t: m, s: m } : m).filter(m => m.t || m.s);
  const fin = () => { if (jeton === jetonLecture && apres) apres(); };
  const siwis = voixSiwis() && navigator.onLine !== false && Date.now() >= siwisEnPauseJusqua;
  if (!siwis) { direTelephone(liste.map(m => m.t).filter(Boolean).join(' '), fin); return; }
  liste.slice(1).forEach(m => { if (m.s) prechargerVoix(m.s); });
  const suivant = i => {
    if (jeton !== jetonLecture) return;
    if (i >= liste.length) { fin(); return; }
    const m = liste[i];
    if (!m.s) { suivant(i + 1); return; }
    jouerClip(m.s, jeton).then(ok => {
      if (jeton !== jetonLecture) return;
      if (ok) suivant(i + 1);
      // Réseau trop lent : le téléphone lit tout le reste d'un coup.
      else if (Date.now() < siwisEnPauseJusqua) direTelephone(liste.slice(i).map(x => x.t).filter(Boolean).join(' '), fin);
      else direTelephone(m.t || m.s, () => { if (jeton === jetonLecture) suivant(i + 1); }); // fichier absent
    });
  };
  suivant(0);
}

function taire() {
  jetonLecture++;
  if (Synthese) Synthese.cancel();
  if (lecteur && lecteur.src && lecteur.src !== SILENCE) {
    lecteur.onended = lecteur.onerror = lecteur.onplaying = null;
    lecteur.pause();
  }
}

/** Lit une seule fois par clé (question, verdict…) si la lecture automatique est activée. */
function direUneFois(cle, morceaux, apres) {
  if (!prefsVoix().lecture || derniereLecture === cle) return;
  derniereLecture = cle;
  dire(morceaux, apres);
}

function boutonLire(texte) {
  if (!LECTURE_POSSIBLE) return null;
  return h('button', { type: 'button', class: 'btn-lien btn-lire', onclick: () => dire(texte) }, '🔊 Relire la question');
}

/** « 3 points », « 1 point », « 0 point ». */
const points = n => `${n} point${n > 1 ? 's' : ''}`;
const reponseLue = r => ({ t: `${r}.`, s: r });
const bonnesSur = (n, total) => `${n} bonne${n > 1 ? 's' : ''} réponse${n > 1 ? 's' : ''} sur ${total}`;

function initReglagesVoix(form) {
  if (!LECTURE_POSSIBLE) return;
  const bloc = $('.reglage-voix', form);
  bloc.hidden = false;
  const prefs = prefsVoix();
  form.lecture.checked = prefs.lecture;
  const mains = form.mainsLibres;
  if (mains) {
    if (!Reco) $('.si-micro', form).hidden = true;
    mains.checked = prefs.mainsLibres && !!Reco;
    mains.disabled = !prefs.lecture;
  }
  bloc.addEventListener('change', () => {
    const p = { ...prefsVoix(), lecture: form.lecture.checked };
    if (mains) { mains.disabled = !p.lecture; p.mainsLibres = mains.checked && p.lecture; }
    ecrire(CLE_VOIX, p);
    // Garde les deux formulaires (solo, quiz en groupe) synchronisés.
    document.querySelectorAll('input[name="lecture"]').forEach(i => { i.checked = p.lecture; });
  });
}

/* ---------------- Solo ---------------- */

let solo = null;
const VIES = 3;
const LIBELLE_NIVEAU = ['tous niveaux', 'faciles', 'faciles et moyennes', 'moyennes et difficiles', 'difficiles et expert', 'expert', 'enfants'];

function sauverSolo() { ecrire(CLE_SOLO, solo); }

function cleRecord(s) { return `${s.format}|${s.cat || 'toutes'}|${s.niveau}`; }

function libelleConfig(s) {
  if (s.mode === 'jour') return `Carte du jour n°${s.jour}`;
  const format = s.format === 'survie' ? 'Survie' : `${s.format} questions`;
  const cat = s.cat ? catParId(s.cat).nom : 'toutes catégories';
  return `${format} · ${cat} · ${LIBELLE_NIVEAU[s.niveau]}`;
}

function tirerQuestionSolo() {
  // Défi ou carte du jour : liste de questions imposée.
  if (solo.liste) return solo.liste[solo.historique.length];
  const niveaux = NIVEAUX[solo.niveau] || NIVEAUX[0];
  const dansPartie = new Set(solo.historique.map(e => e.id));
  const convient = q => (!solo.cat || q.cat === solo.cat) && niveaux.includes(q.niv) && !dansPartie.has(q.id);
  let vues = new Set(lire(CLE_SOLO_VUES, []));
  let pool = QUESTIONS.filter(q => convient(q) && !vues.has(q.id));
  if (!pool.length) {
    // Toutes les questions de ces réglages ont déjà été vues : on les remet en jeu.
    const aRetirer = new Set(QUESTIONS.filter(convient).map(q => q.id));
    vues = new Set([...vues].filter(id => !aRetirer.has(id)));
    pool = QUESTIONS.filter(convient);
  }
  // Niveau absent des données (ancienne version en cache) : n'importe quel niveau.
  if (!pool.length) pool = QUESTIONS.filter(q => (!solo.cat || q.cat === solo.cat) && !dansPartie.has(q.id));
  const q = pool[Math.floor(Math.random() * pool.length)];
  vues.add(q.id);
  ecrire(CLE_SOLO_VUES, [...vues]);
  return q.id;
}

function soloTermine() {
  if (solo.liste && solo.historique.length >= solo.liste.length) return true;
  if (solo.format === 'survie') return solo.erreurs >= VIES;
  return solo.historique.length >= Number(solo.format);
}

function nouveauSolo(reglages) {
  solo = { ...reglages, historique: [], question: null, phase: 'question', score: 0, serie: 0, meilleureSerie: 0 };
  solo.question = tirerQuestionSolo();
  sauverSolo();
  rendreSolo();
}

function repondreSolo(bon) {
  const q = QUESTIONS[solo.question];
  let pts = 0;
  if (bon) {
    solo.serie++;
    solo.meilleureSerie = Math.max(solo.meilleureSerie, solo.serie);
    pts = q.d + (solo.serie >= 3 ? 1 : 0);
    solo.score += pts;
  } else {
    solo.serie = 0;
    solo.erreurs = (solo.erreurs || 0) + 1;
  }
  solo.historique.push({ id: q.id, ok: bon, pts });
  if (soloTermine()) {
    solo.phase = 'fin';
    if (solo.mode === 'jour') enregistrerJour(solo);
    if (!solo.mode) {
      // Les records ne concernent que les séries libres (pas les défis ni la carte du jour).
      const records = lire(CLE_SOLO_RECORDS, {});
      const cle = cleRecord(solo);
      solo.ancienRecord = records[cle] ? records[cle].score : null;
      if (solo.ancienRecord == null || solo.score > solo.ancienRecord) {
        records[cle] = { score: solo.score, date: new Date().toISOString().slice(0, 10) };
        ecrire(CLE_SOLO_RECORDS, records);
      }
    }
  } else {
    solo.question = tirerQuestionSolo();
    solo.phase = 'question';
  }
  solo.verdict = null;
  sauverSolo();
  rendreSolo();
}

function afficherConfigSolo() {
  $('#solo-config').hidden = false;
  $('#solo-jeu').hidden = true;
  const records = Object.entries(lire(CLE_SOLO_RECORDS, {}))
    .sort((a, b) => b[1].score - a[1].score).slice(0, 8);
  $('#solo-records').replaceChildren(...(records.length ? [
    h('h3', {}, 'Vos records'),
    h('ul', { class: 'records' }, records.map(([cle, r]) => {
      const [format, cat, niveau] = cle.split('|');
      return h('li', {},
        h('span', {}, libelleConfig({ format, cat: cat === 'toutes' ? '' : cat, niveau: Number(niveau) })),
        h('b', {}, `${r.score} pts`));
    })),
  ] : []));
}

const Reco = window.SpeechRecognition || window.webkitSpeechRecognition;

function iconeMicro() {
  const span = h('span', { class: 'micro', 'aria-hidden': 'true' });
  span.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="2" width="6" height="12" rx="3" fill="currentColor"/><path d="M5 11a7 7 0 0 0 14 0M12 18v4M8 22h8"/></svg>';
  return span;
}
let ecouteEnCours = null;

/* Micro : toute écoute passe par nouvelleEcoute(), pour pouvoir tout couper d'un coup dès qu'on
 * quitte le jeu (fin de partie, autre écran, appli en arrière-plan). */
const ecoutesActives = new Set();

// Safari (et tous les navigateurs d'iPhone) : quand une écoute se termine d'elle-même après une
// phrase comprise, WebKit la marque finie sans libérer le micro, et ignore ensuite stop() et
// abort(). Le micro n'est rendu qu'au démarrage d'une autre écoute : on en lance donc une,
// qu'on arrête dès son démarrage (voir SpeechRecognitionServer::handleRequest dans WebKit).
const WEBKIT = /AppleWebKit/.test(navigator.userAgent) && !/Chrome\/|Chromium\/|Edg\//.test(navigator.userAgent);
let purgeEnCours = false;
let microAPurger = false; // une écoute a servi depuis la dernière purge : le micro est peut-être encore pris

/** Mains libres en pleine série : la prochaine écoute reprend le micro (et rend l'ancien) ; une purge
 * entre deux questions ferait seulement clignoter le micro. */
function ecouteAttendue() {
  return !!Reco && enJeu('solo') && !!solo && solo.phase !== 'fin' && prefsVoix().mainsLibres;
}

function libererMicro(essais = 0) {
  if (!WEBKIT || !microAPurger || purgeEnCours || ecoutesActives.size || ecouteAttendue()) return;
  // Pas pendant la lecture : sur iPhone, ouvrir le micro fait passer le son en mode enregistrement.
  const parle = (lecteur && lecteur.src !== SILENCE && !lecteur.paused && !lecteur.ended) || (Synthese && Synthese.speaking);
  if (parle) {
    if (essais < 120) setTimeout(() => libererMicro(essais + 1), 500);
    return;
  }
  let purge;
  try { purge = new Reco(); } catch { return; }
  purgeEnCours = true;
  purge.lang = 'fr-FR';
  const arreter = () => { try { purge.abort(); } catch { /* déjà arrêtée */ } };
  purge.onstart = () => { microAPurger = false; arreter(); };
  purge.onresult = arreter;
  purge.onend = purge.onerror = () => { purgeEnCours = false; };
  setTimeout(() => { purgeEnCours = false; }, 5000);
  try { purge.start(); } catch { purgeEnCours = false; }
}

function nouvelleEcoute() {
  const reco = new Reco();
  microAPurger = true;
  reco.lang = 'fr-FR';
  reco.interimResults = true;
  reco.maxAlternatives = 5;
  ecoutesActives.add(reco);
  if (reco.addEventListener) {
    reco.addEventListener('end', () => {
      ecoutesActives.delete(reco);
      // Laisse à une écoute suivante (mains libres) le temps de démarrer : elle libère aussi le micro.
      setTimeout(libererMicro, 400);
    });
    // Safari ignore une coupure demandée avant que l'écoute ait vraiment démarré : on la renouvelle.
    reco.addEventListener('start', () => { if (reco.coupee) try { reco.abort(); } catch { /* déjà arrêtée */ } });
    // Réponse comprise : on ferme le micro tout de suite (Safari peut sinon continuer d'écouter).
    reco.addEventListener('result', e => {
      const res = e.results && e.results[e.results.length - 1];
      if (res && res.isFinal) try { reco.stop(); } catch { /* déjà arrêtée */ }
    });
  }
  return reco;
}

function couperMicro() {
  for (const reco of ecoutesActives) {
    reco.coupee = true; // son résultat éventuel est ignoré
    try { reco.abort(); } catch { /* déjà arrêtée */ }
  }
  ecoutesActives.clear();
  ecouteEnCours = null;
  setTimeout(libererMicro, 400); // écoute finie d'elle-même plus tôt : micro peut-être encore pris (Safari)
  const bouton = $('#btn-micro');
  if (bouton) {
    bouton.classList.remove('ecoute-active');
    bouton.lastChild.textContent = 'Répondre à voix haute';
  }
}

/** Le jeu est à l'écran et au premier plan : seule situation où le micro peut s'ouvrir tout seul. */
function enJeu(vue) {
  return document.visibilityState === 'visible' && location.hash === '#' + vue;
}

// Téléphone verrouillé, autre appli, onglet caché ou page quittée : micro et voix coupés.
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') { couperMicro(); taire(); } });
window.addEventListener('pagehide', () => { couperMicro(); taire(); });

function juger(propositions, entendu) {
  const q = QUESTIONS[solo.question];
  solo.verdict = { ok: Reponse.verifier(propositions, q.r, { question: q.q, alias: q.a }), entendu };
  solo.phase = 'reponse';
  sauverSolo();
  rendreSolo();
}

function ecouter() {
  const bouton = $('#btn-micro');
  const info = $('#ecoute');
  if (ecouteEnCours) { ecouteEnCours.stop(); return; }
  const reco = nouvelleEcoute();
  let final = null;
  ecouteEnCours = reco;
  bouton.classList.add('ecoute-active');
  bouton.lastChild.textContent = 'J\'écoute…';
  info.textContent = '';
  reco.onresult = e => {
    const res = e.results[e.results.length - 1];
    info.textContent = `« ${res[0].transcript} »`;
    if (res.isFinal) final = Array.from(res, alt => alt.transcript);
  };
  reco.onerror = e => {
    const messages = {
      'not-allowed': 'Micro refusé : autorisez-le dans les réglages du navigateur.',
      'service-not-allowed': 'La reconnaissance vocale n\'est pas disponible ici.',
      'no-speech': 'Je n\'ai rien entendu. Réessayez.',
      'audio-capture': 'Aucun micro détecté.',
      network: 'La reconnaissance vocale a besoin d\'une connexion internet.',
    };
    info.textContent = messages[e.error] || 'La reconnaissance vocale a échoué. Réessayez.';
  };
  reco.onend = () => {
    if (ecouteEnCours === reco) ecouteEnCours = null;
    if (reco.coupee) return;
    if (final && final.length) { juger(final, final[0]); return; }
    if (bouton.isConnected) {
      bouton.classList.remove('ecoute-active');
      bouton.lastChild.textContent = 'Répondre à voix haute';
    }
  };
  try { reco.start(); } catch { ecouteEnCours = null; }
}

function rendreSolo() {
  // Le micro ne sert que pendant une question : réponse tapée, réponse affichée, abandon ou fin → coupé.
  if (!solo || solo.phase !== 'question') couperMicro();
  if (defiRecu) { afficherDefiRecu(); return; }
  if (!solo) { afficherConfigSolo(); return; }
  $('#solo-config').hidden = true;
  const zone = $('#solo-jeu');
  zone.hidden = false;

  if (solo.phase === 'fin') { rendreFinSolo(zone); return; }

  const n = solo.historique.length + 1;
  const progression = solo.format === 'survie'
    ? h('span', { class: 'vies', 'aria-label': `${VIES - (solo.erreurs || 0)} vies restantes` },
      Array.from({ length: VIES }, (_, i) => h('i', { class: i < VIES - (solo.erreurs || 0) ? 'on' : null })))
    : h('span', {}, `${solo.mode === 'jour' ? 'Carte du jour · ' : solo.mode === 'defi' ? 'Défi · ' : ''}Question ${n} / ${solo.liste ? solo.liste.length : solo.format}`);
  const derniere = solo.historique[solo.historique.length - 1];

  const q = QUESTIONS[solo.question];
  const cat = catParId(q.cat);
  const carte = h('article', { class: 'carte' },
    h('div', { class: 'carte-tete' },
      h('span', {}, `${q.d} PT${q.d > 1 ? 'S' : ''}${solo.serie >= 2 ? ' + 1 BONUS' : ''}`),
      h('span', { class: 'num' }, 'N° ' + numero(q.carte + 1))),
    ligneQuestion(cat, [q.q, q.r, q.niv], { cliquable: false, ouvert: solo.phase === 'reponse' }));

  let actions;
  if (solo.phase === 'question') {
    actions = h('div', { class: 'repondre' },
      boutonLire(`${cat.nom}. ${q.l}`),
      Reco ? h('button', { type: 'button', class: 'btn btn-micro', id: 'btn-micro', onclick: ecouter },
        iconeMicro(), 'Répondre à voix haute') : null,
      h('form', {
        class: 'saisie',
        onsubmit: e => {
          e.preventDefault();
          const texte = e.target.reponse.value.trim();
          if (texte) juger([texte], texte);
        },
      },
        h('input', { type: 'text', name: 'reponse', placeholder: 'Ou tapez votre réponse', autocomplete: 'off', 'aria-label': 'Votre réponse' }),
        h('button', { type: 'submit', class: 'btn btn-clair' }, 'OK')),
      h('p', { class: 'ecoute', id: 'ecoute', 'aria-live': 'polite' }),
      h('button', {
        type: 'button', class: 'btn-lien',
        onclick: () => { solo.phase = 'reponse'; solo.verdict = null; sauverSolo(); rendreSolo(); },
      }, 'Voir la réponse sans répondre'));
  } else if (solo.verdict) {
    const v = solo.verdict;
    actions = h('div', {},
      h('p', { class: 'verdict ' + (v.ok ? 'juste' : 'faux') },
        v.ok ? 'Bonne réponse !' : 'Ce n\'est pas la réponse attendue.',
        h('span', { class: 'entendu' }, `Votre réponse : « ${v.entendu} »`)),
      h('div', { class: 'actions' },
        h('button', { type: 'button', class: 'btn ' + (v.ok ? 'btn-ok' : 'btn-ko'), onclick: () => repondreSolo(v.ok) }, 'Continuer')),
      h('button', {
        type: 'button', class: 'btn-lien', onclick: () => repondreSolo(!v.ok),
      }, v.ok ? 'Me compter faux' : 'En fait, c\'était juste'));
  } else {
    actions = h('div', { class: 'actions' },
      h('button', { type: 'button', class: 'btn btn-ko', onclick: () => repondreSolo(false) }, 'Raté'),
      h('button', { type: 'button', class: 'btn btn-ok', onclick: () => repondreSolo(true) }, 'Je l\'avais'));
  }

  zone.replaceChildren(
    h('div', { class: 'solo-tete' },
      progression,
      h('span', { class: 'solo-score' }, h('b', {}, String(solo.score)), ' pts')),
    h('p', { class: 'solo-info' },
      derniere ? (derniere.ok ? `Bonne réponse : +${derniere.pts}` : 'Raté') : (Reco ? 'Répondez au micro ou au clavier.' : 'Tapez votre réponse, ou affichez-la.'),
      solo.serie >= 2 ? ` · série de ${solo.serie}` : ''),
    carte,
    h('div', { class: 'tour' }, actions),
    h('div', { class: 'partie-actions' },
      solo.mode === 'jour'
        // La carte du jour ne se rejoue pas : on peut seulement la reprendre plus tard.
        ? h('a', { class: 'btn-lien', href: '#accueil', onclick: taire }, 'Reprendre plus tard')
        : h('button', {
          type: 'button', class: 'btn-lien',
          onclick: () => { if (confirm('Abandonner cette série ? Le score ne sera pas enregistré.')) { taire(); solo = null; effacer(CLE_SOLO); rendreSolo(); } },
        }, 'Abandonner')),
  );
  lireSolo(q, cat);
}

function lireSolo(q, cat) {
  const prefs = prefsVoix();
  const id = solo.question;
  if (solo.phase === 'question') {
    const ecouteAuto = prefs.mainsLibres && Reco
      ? () => { if (enJeu('solo') && solo && solo.question === id && solo.phase === 'question' && !ecouteEnCours && $('#btn-micro')) ecouter(); }
      : null;
    direUneFois(`solo-q-${id}`, `${cat.nom}. ${q.l}`, ecouteAuto);
    prechargerVoix(q.r);
  } else if (solo.verdict) {
    const v = solo.verdict;
    // Mains libres : après le verdict, on passe seul à la question suivante (sauf correction entre-temps).
    const suite = prefs.mainsLibres
      ? () => setTimeout(() => { if (enJeu('solo') && solo && solo.question === id && solo.verdict === v) repondreSolo(v.ok); }, 1500)
      : null;
    direUneFois(`solo-v-${id}`, v.ok ? 'Bonne réponse !' : ['Non. La réponse était :', reponseLue(q.r)], suite);
  } else {
    direUneFois(`solo-r-${id}`, ['La réponse :', reponseLue(q.r)]);
  }
}

function rendreFinSolo(zone) {
  couperMicro(); // partie terminée : le micro ne se rouvrira qu'à la prochaine question
  if (solo.mode === 'jour') { rendreFinJour(zone, solo.jour); return; }
  const total = solo.historique.length;
  const bonnes = solo.historique.filter(e => e.ok).length;
  const record = solo.ancienRecord == null || solo.score > solo.ancienRecord;
  const parCat = CATS.map(c => {
    const e = solo.historique.filter(x => QUESTIONS[x.id].cat === c.id);
    return { c, total: e.length, ok: e.filter(x => x.ok).length };
  }).filter(x => x.total);
  const ratees = solo.historique.filter(e => !e.ok).map(e => QUESTIONS[e.id]);
  const reglages = { format: solo.format, cat: solo.cat, niveau: solo.niveau };
  const defi = solo.mode === 'defi' ? solo.defi : null;
  const issue = defi ? (solo.score > defi.score ? 'gagne' : solo.score < defi.score ? 'perdu' : 'egalite') : null;
  const TEXTES_ISSUE = { gagne: 'Défi remporté ! 🏆', perdu: 'Défi perdu…', egalite: 'Égalité !' };
  direUneFois(`solo-fin-${solo.historique.length}-${solo.score}`, [
    'Série terminée :', `${points(solo.score)},`, `${bonnesSur(bonnes, total)}.`,
    ...(defi
      ? [{ t: `${defi.nom} avait ${points(defi.score)}.`, s: `Score adverse : ${points(defi.score)}.` }, TEXTES_ISSUE[issue].replace(' 🏆', '')]
      : record ? ['Nouveau record !'] : []),
  ]);

  zone.replaceChildren(
    h('div', { class: 'solo-fin' },
      h('p', { class: 'solo-config-rappel' }, libelleConfig(solo)),
      h('div', { class: 'solo-total' }, h('b', {}, String(solo.score)), ' points'),
      defi
        ? h('p', { class: 'solo-record defi-' + issue },
          `${TEXTES_ISSUE[issue]} ${defi.nom} : ${defi.score} pts (${defi.bonnes}/${defi.total}) · vous : ${solo.score} pts`)
        : h('p', { class: 'solo-record' + (record ? ' nouveau' : '') },
          record
            ? (solo.ancienRecord == null ? 'Premier record établi !' : `Nouveau record ! (ancien : ${solo.ancienRecord})`)
            : `Record à battre : ${solo.ancienRecord}`),
      h('p', { class: 'message' }, `${bonnes} bonne${bonnes > 1 ? 's' : ''} réponse${bonnes > 1 ? 's' : ''} sur ${total} · meilleure série : ${solo.meilleureSerie}`),
      h('ul', { class: 'barres' }, parCat.map(({ c, total: t, ok }) =>
        h('li', { style: styleCat(c) },
          h('span', { class: 'barre-nom' }, c.nom),
          h('span', { class: 'barre-fond' }, h('span', { class: 'barre-val', style: `width:${Math.round(100 * ok / t)}%` })),
          h('span', { class: 'barre-chiffre' }, `${ok}/${t}`)))),
      panneauDefi(defi, issue, bonnes, total),
      h('div', { class: 'actions' },
        h('button', { type: 'button', class: 'btn btn-clair', onclick: () => { solo = null; effacer(CLE_SOLO); rendreSolo(); } }, defi ? 'Nouvelle série' : 'Changer les réglages'),
        defi ? null : h('button', { type: 'button', class: 'btn', onclick: () => { derniereLecture = null; nouveauSolo(reglages); } }, 'Rejouer')),
    ),
    ratees.length ? h('div', { class: 'ratees' },
      h('h3', {}, 'Les réponses que vous avez manquées'),
      h('ol', { class: 'resultats' }, ratees.map(q =>
        h('li', { style: styleCat(catParId(q.cat)) },
          h('div', {}, q.q),
          h('div', { class: 'r' }, q.r))))) : null,
  );
}

function initSolo() {
  $('#solo-cats').append(
    h('label', {}, h('input', { type: 'radio', name: 'cat', value: '', checked: true }), ' Toutes'),
    ...CATS.map(c => h('label', {}, h('input', { type: 'radio', name: 'cat', value: c.id }), ' ',
      h('span', { class: 'pastille', style: styleCat(c) }), ' ', c.nom)));
  initReglagesVoix($('#form-solo'));
  $('#form-solo').addEventListener('submit', e => {
    e.preventDefault();
    const f = e.target;
    nouveauSolo({ format: f.format.value, cat: f.cat.value, niveau: Number(f.niveau.value) });
  });
  solo = lire(CLE_SOLO, null);
  if (solo && (!Array.isArray(solo.historique) || (solo.question != null && !QUESTIONS[solo.question])
    || solo.historique.some(e => !QUESTIONS[e.id]))) solo = null;
}

/* ---------------- Partage ---------------- */

const URL_JEU = location.origin + location.pathname;
const EMOJI_CAT = { geo: '🔵', div: '🩷', his: '🟡', art: '🟤', sci: '🟢', spo: '🟠' };

function encoderDefi(obj) {
  const octets = new TextEncoder().encode(JSON.stringify(obj));
  let bin = '';
  octets.forEach(o => { bin += String.fromCharCode(o); });
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function decoderDefi(texte) {
  try {
    const bin = atob(texte.replace(/-/g, '+').replace(/_/g, '/'));
    const obj = JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0))));
    if (!Array.isArray(obj.q) || !obj.q.length || obj.q.some(id => !QUESTIONS[id])) return null;
    return obj;
  } catch { return null; }
}

/** Image carrée du résultat, pour les réseaux sociaux (Promise<Blob>). */
async function imagePartage({ haut, grand, bas, pastilles }) {
  const T = 1080;
  const c = document.createElement('canvas');
  c.width = T; c.height = T;
  const g = c.getContext('2d');
  const fond = g.createLinearGradient(0, 0, 0, T);
  fond.addColorStop(0, '#2a3d6e'); fond.addColorStop(1, '#16213e');
  g.fillStyle = fond; g.fillRect(0, 0, T, T);
  const cx = T / 2;
  try {
    const logo = new Image();
    logo.src = 'icons/logo.webp';
    await logo.decode();
    const hLogo = 430, wLogo = hLogo * logo.naturalWidth / logo.naturalHeight;
    g.drawImage(logo, cx - wLogo / 2, 60, wLogo, hLogo);
  } catch {
    // Logo indisponible : le nom en toutes lettres.
    g.textAlign = 'center';
    g.font = 'bold 96px system-ui, sans-serif';
    g.fillStyle = '#f4f1ea'; g.fillText('Culture Gé', cx, 320);
  }
  g.textAlign = 'center';
  g.fillStyle = '#b9c1d6'; g.font = '40px system-ui, sans-serif';
  g.fillText(haut, cx, 570);
  g.fillStyle = '#f2c200'; g.font = 'bold 150px system-ui, sans-serif';
  g.fillText(grand, cx, 730);
  if (pastilles) {
    const taille = 90, ecart = 22, x0 = cx - (6 * taille + 5 * ecart) / 2;
    pastilles.forEach((p, i) => {
      const x = x0 + i * (taille + ecart), y = 790;
      g.fillStyle = p.couleur; g.beginPath(); g.roundRect(x, y, taille, taille, 18); g.fill();
      g.fillStyle = '#fff'; g.font = 'bold 60px system-ui, sans-serif';
      g.fillText(p.ok ? '✓' : '✗', x + taille / 2, y + 68);
    });
  }
  g.fillStyle = '#f4f1ea'; g.font = 'bold 44px system-ui, sans-serif';
  g.fillText(bas, cx, pastilles ? 960 : 860);
  g.fillStyle = '#b9c1d6'; g.font = '30px system-ui, sans-serif';
  g.fillText(URL_JEU.replace(/^https?:\/\//, '').replace(/\/$/, ''), cx, 1035);
  return new Promise(res => c.toBlob(res, 'image/png'));
}

/** Panneau de partage : menu natif du téléphone, puis liens directs vers les applications. */
function panneauPartage({ titre, texte, lien, image }) {
  const complet = `${texte}\n${lien}`;
  const e = encodeURIComponent;
  const info = h('p', { class: 'partage-info', 'aria-live': 'polite' });
  const liens = [
    ['WhatsApp', `https://wa.me/?text=${e(complet)}`],
    ['Messenger', `fb-messenger://share/?link=${e(lien)}`],
    ['SMS', `sms:?&body=${e(complet)}`],
    ['Facebook', `https://www.facebook.com/sharer/sharer.php?u=${e(lien)}`],
    ['X', `https://x.com/intent/post?text=${e(texte)}&url=${e(lien)}`],
    ['E-mail', `mailto:?subject=${e(titre)}&body=${e(complet)}`],
  ];
  return h('div', { class: 'partage' },
    navigator.share ? h('button', {
      type: 'button', class: 'btn btn-partage',
      onclick: () => navigator.share({ title: titre, text: texte, url: lien }).catch(() => {}),
    }, '📤 Partager') : null,
    h('div', { class: 'partage-liens' },
      liens.map(([nom, url]) => h('a', { class: 'lien-partage', href: url, target: '_blank', rel: 'noopener' }, nom)),
      h('button', {
        type: 'button', class: 'lien-partage',
        onclick: () => navigator.clipboard.writeText(complet)
          .then(() => { info.textContent = 'Copié ! Collez-le où vous voulez.'; })
          .catch(() => { info.textContent = complet; }),
      }, 'Copier'),
      image ? h('button', {
        type: 'button', class: 'lien-partage',
        onclick: async () => {
          const blob = await imagePartage(image);
          const fichier = new File([blob], 'culture-ge.png', { type: 'image/png' });
          if (navigator.canShare && navigator.canShare({ files: [fichier] })) {
            navigator.share({ files: [fichier], text: complet }).catch(() => {});
          } else {
            const a = h('a', { href: URL.createObjectURL(blob), download: 'culture-ge.png' });
            document.body.append(a); a.click(); a.remove();
            info.textContent = 'Image enregistrée : ajoutez-la à votre publication.';
          }
        },
      }, 'Image') : null),
    info);
}

function nomJoueur() { return lire(CLE_NOM, ''); }
/** « de Bruno », « d'Alice » (h non élidé : on ne sait pas s'il est aspiré). */
const deNom = nom => (/^[aeiouyàâäéèêëîïôöùûüœæ]/i.test(nom) ? 'd\'' : 'de ') + nom;

/* ---------------- Défi ---------------- */

let defiRecu = null; // défi ouvert depuis un lien, en attente d'être joué

function panneauDefi(defi, issue, bonnes, total) {
  const nom = nomJoueur();
  const champ = h('input', {
    type: 'text', maxlength: 20, value: nom, placeholder: 'Votre prénom', 'aria-label': 'Votre prénom',
    onchange: e => { ecrire(CLE_NOM, e.target.value.trim()); maj(); },
  });
  const zone = h('div');
  function maj() {
    const qui = nomJoueur() || 'Un ami';
    const lien = `${URL_JEU}?defi=${encoderDefi({
      v: 1, n: qui, s: solo.score, b: bonnes, t: total, f: solo.format, c: solo.cat, l: solo.niveau,
      q: solo.historique.map(x => x.id),
    })}`;
    const texte = defi
      ? `🎯 J'ai relevé le défi de ${defi.nom} à Culture Gé : ${solo.score} points contre ${defi.score}${issue === 'gagne' ? ' 🏆' : ''} ! À toi de jouer sur les mêmes questions :`
      : `🎯 ${qui} te défie à Culture Gé : ${solo.score} points (${bonnes}/${total}) sur ${libelleConfig(solo).toLowerCase()}. Feras-tu mieux sur les mêmes questions ?`;
    zone.replaceChildren(panneauPartage({
      titre: 'Défi Culture Gé', texte, lien,
      image: { haut: defi ? `Défi de ${defi.nom}` : `${qui} vous défie`, grand: `${solo.score} pts`, bas: `${bonnes}/${total} · Relevez le défi !` },
    }));
  }
  maj();
  return h('div', { class: 'bloc-defi' },
    h('h3', {}, defi ? 'Renvoyer le défi' : 'Défier un ami sur ces questions'),
    h('label', { class: 'champ-nom' }, 'Signé : ', champ),
    zone);
}

function afficherDefiRecu() {
  const d = defiRecu;
  $('#solo-config').hidden = true;
  const zone = $('#solo-jeu');
  zone.hidden = false;
  const format = d.f === 'survie' ? 'mode survie' : `${d.q.length} questions`;
  zone.replaceChildren(h('div', { class: 'defi-intro' },
    h('p', { class: 'defi-cible' }, '🎯'),
    h('h2', {}, `${d.n} vous lance un défi !`),
    h('p', {}, `${d.n} a marqué `, h('b', {}, `${d.s} points`), ` (${d.b} bonnes réponses sur ${d.t}) en ${format}.`),
    h('p', { class: 'message' }, 'Vous jouez exactement les mêmes questions. Ferez-vous mieux ?'),
    h('div', { class: 'actions' },
      h('button', {
        type: 'button', class: 'btn btn-clair',
        onclick: () => { defiRecu = null; rendreSolo(); },
      }, 'Plus tard'),
      h('button', {
        type: 'button', class: 'btn',
        onclick: () => {
          if (solo && solo.phase !== 'fin' && !confirm('Une série est en cours : elle sera abandonnée. Continuer ?')) return;
          derniereLecture = null;
          const defi = { nom: d.n, score: d.s, bonnes: d.b, total: d.t };
          defiRecu = null;
          nouveauSolo({ mode: 'defi', format: d.f === 'survie' ? 'survie' : String(d.q.length), cat: d.c || '', niveau: d.l || 0, liste: d.q, defi });
        },
      }, 'Relever le défi'))));
}

/* ---------------- Carte du jour ---------------- */

const JOUR_DEBUT = Date.UTC(2026, 8, 28); // carte du jour n°1 : 28 septembre 2026
const JOUR_CARTES = 1833;

function numeroJour(date = new Date()) {
  return Math.floor((Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) - JOUR_DEBUT) / 864e5) + 1;
}

function carteDuJour(n) {
  // Parcourt toutes les cartes dans un ordre fixe mais mélangé (787 est premier avec 1833).
  const total = Math.min(JOUR_CARTES, DATA.cartes.length);
  return (((n - 1) * 787 + 101) % total + total) % total;
}

// À partir de la carte du jour n°7 (4 octobre 2026) : six questions de tous les niveaux, dans un
// ordre aléatoire (les cinq niveaux, plus un tiré au sort), au lieu d'une carte du paquet.
const JOUR_MELANGE = 7;

function aleaJour(graine) { // mulberry32 : même suite pour tout le monde un jour donné
  let a = graine >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let questionsParNiveau = null; // [catégorie][niveau - 1] → identifiants

/** Les six questions (une par couleur, dans l'ordre des catégories) de la carte du jour n. */
function questionsDuJour(n) {
  if (n < JOUR_MELANGE) { const c = carteDuJour(n); return CATS.map((_, i) => c * 6 + i); }
  if (!questionsParNiveau) {
    questionsParNiveau = CATS.map(c => [1, 2, 3, 4, 5].map(niv => QUESTIONS.filter(q => q.cat === c.id && q.niv === niv).map(q => q.id)));
  }
  const alea = aleaJour(Math.imul(n, 2654435761));
  const niveaux = [1, 2, 3, 4, 5, 1 + Math.floor(alea() * 5)];
  for (let i = niveaux.length - 1; i > 0; i--) {
    const j = Math.floor(alea() * (i + 1));
    [niveaux[i], niveaux[j]] = [niveaux[j], niveaux[i]];
  }
  return CATS.map((c, i) => {
    const niv = niveaux[i];
    const pool = questionsParNiveau[i][niv - 1].length ? questionsParNiveau[i][niv - 1] : questionsParNiveau[i].find(p => p.length);
    // Pas de 7919 premier avec la taille du lot : pas de répétition avant d'en avoir fait le tour.
    return pool[((n * 7919 + (i + 1) * 104729 + niv * 15485863) % pool.length + pool.length) % pool.length];
  });
}

function resultatsJour() { return lire(CLE_JOUR, {}); }

function enregistrerJour(s) {
  const tous = resultatsJour();
  tous[s.jour] = { score: s.score, res: s.historique.map(x => x.ok) };
  ecrire(CLE_JOUR, tous);
}

function serieJours() {
  const tous = resultatsJour();
  let n = numeroJour();
  if (!tous[n]) n--; // aujourd'hui pas encore joué : la série court jusqu'à hier
  let serie = 0;
  while (tous[n]) { serie++; n--; }
  return serie;
}

function statsJour() {
  const tous = Object.entries(resultatsJour()).map(([n, r]) => ({ n: Number(n), ...r })).sort((a, b) => a.n - b.n);
  let meilleure = 0, courante = 0, prec = null;
  for (const r of tous) {
    courante = prec !== null && r.n === prec + 1 ? courante + 1 : 1;
    meilleure = Math.max(meilleure, courante);
    prec = r.n;
  }
  const bonnes = tous.reduce((t, r) => t + r.res.filter(Boolean).length, 0);
  return { joues: tous.length, meilleure, moyenne: tous.length ? bonnes / tous.length : 0 };
}

function avantDemain() {
  const maintenant = new Date();
  const demain = new Date(maintenant.getFullYear(), maintenant.getMonth(), maintenant.getDate() + 1);
  const min = Math.round((demain - maintenant) / 60000);
  return min >= 60 ? `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')}` : `${min} min`;
}

function jouerJour() {
  const n = numeroJour();
  if (resultatsJour()[n]) { location.hash = '#jour'; return; }
  if (solo && solo.mode === 'jour' && solo.jour === n && solo.phase !== 'fin') { location.hash = '#solo'; return; }
  if (solo && solo.phase !== 'fin' && solo.mode !== 'jour'
    && !confirm('Une série est en cours : elle sera abandonnée. Continuer ?')) return;
  derniereLecture = null;
  nouveauSolo({ mode: 'jour', jour: n, format: '6', cat: '', niveau: 0, liste: questionsDuJour(n) });
  location.hash = '#solo';
}

function partageJour(n, r) {
  const bonnes = r.res.filter(Boolean).length;
  const cases = CATS.map((c, i) => `${EMOJI_CAT[c.id]}${r.res[i] ? '✅' : '❌'}`);
  const serie = serieJours();
  const texte = `Culture Gé du jour n°${n} 🎯 ${bonnes}/6 · ${r.score} pts\n${cases.slice(0, 3).join(' ')}\n${cases.slice(3).join(' ')}`
    + (serie > 1 ? `\n🔥 ${serie} jours d'affilée` : '');
  return panneauPartage({
    titre: `Culture Gé du jour n°${n}`, texte, lien: `${URL_JEU}?jour`,
    image: {
      haut: `Carte du jour n°${n}`, grand: `${bonnes}/6`, bas: `${r.score} points${serie > 1 ? ` · 🔥 ${serie} jours` : ''}`,
      pastilles: CATS.map((c, i) => ({ couleur: c.couleur, ok: r.res[i] })),
    },
  });
}

function blocResultatJour(n, r, avecDetail) {
  const bonnes = r.res.filter(Boolean).length;
  const ids = questionsDuJour(n);
  const serie = serieJours();
  const stats = statsJour();
  return h('div', { class: 'jour-resultat' },
    h('p', { class: 'solo-config-rappel' }, n < JOUR_MELANGE ? `Carte du jour n°${n} · carte N° ${numero(carteDuJour(n) + 1)}` : `Carte du jour n°${n}`),
    h('div', { class: 'jour-cases' }, CATS.map((cat, i) =>
      h('span', { class: 'jour-case ' + (r.res[i] ? 'ok' : 'ko'), style: styleCat(cat), title: cat.nom }, r.res[i] ? '✓' : '✗'))),
    h('div', { class: 'solo-total' }, h('b', {}, `${bonnes}/6`), `${r.score} points`),
    h('ul', { class: 'jour-stats' },
      h('li', {}, h('b', {}, String(serie)), 'série en cours'),
      h('li', {}, h('b', {}, String(stats.meilleure)), 'meilleure série'),
      h('li', {}, h('b', {}, String(stats.joues)), 'cartes jouées'),
      h('li', {}, h('b', {}, stats.moyenne.toFixed(1).replace('.', ',')), 'moyenne /6')),
    blocClassementJour(n),
    h('p', { class: 'message' }, `Prochaine carte dans ${avantDemain()}.`),
    h('h3', {}, 'Partager votre résultat'),
    partageJour(n, r),
    blocGroupes(),
    avecDetail ? h('div', { class: 'ratees' },
      h('h3', {}, 'Les réponses'),
      h('ol', { class: 'resultats' }, CATS.map((cat, i) => {
        const q = QUESTIONS[ids[i]];
        return h('li', { style: styleCat(cat) },
          h('div', { class: 'meta' }, `${cat.nom} ${r.res[i] ? '✅' : '❌'}`, niveau(q.niv)),
          h('div', {}, q.q), h('div', { class: 'r' }, q.r));
      }))) : null);
}

function rendreFinJour(zone, n) {
  const r = resultatsJour()[n];
  const bonnes = r.res.filter(Boolean).length;
  direUneFois(`jour-fin-${n}`, ['Carte du jour terminée :', `${bonnesSur(bonnes, 6)},`, `${points(r.score)}.`]);
  zone.replaceChildren(h('div', { class: 'solo-fin' }, blocResultatJour(n, r, true),
    blocRappel(),
    h('div', { class: 'actions' },
      h('a', { class: 'btn btn-clair', href: '#accueil', onclick: () => { solo = null; effacer(CLE_SOLO); } }, 'Accueil'),
      h('button', { type: 'button', class: 'btn', onclick: () => { solo = null; effacer(CLE_SOLO); location.hash = '#solo'; rendreSolo(); } }, 'Une série en solo'))));
}

function rendreJour() {
  const n = numeroJour();
  const r = resultatsJour()[n];
  const zone = $('#jour-contenu');
  if (r) {
    zone.replaceChildren(invitationGroupeEnAttente(), h('h2', {}, 'Carte du jour'), blocResultatJour(n, r, true), blocRappel());
    return;
  }
  const enCours = solo && solo.mode === 'jour' && solo.jour === n && solo.phase !== 'fin';
  const serie = serieJours();
  zone.replaceChildren(
    invitationGroupeEnAttente(),
    h('h2', {}, `Carte du jour n°${n}`),
    h('p', {}, 'Six questions, une par couleur et de tous les niveaux, de « enfant » à « expert » : la même carte pour tout le monde aujourd\'hui. Une seule tentative !'),
    h('div', { class: 'jour-cases' }, CATS.map(cat => h('span', { class: 'jour-case', style: styleCat(cat), title: cat.nom }))),
    serie ? h('p', { class: 'message' }, `🔥 Série en cours : ${serie} jour${serie > 1 ? 's' : ''}. Ne la cassez pas !`) : null,
    h('div', { class: 'actions' },
      h('button', { type: 'button', class: 'btn', onclick: jouerJour }, enCours ? 'Reprendre la carte du jour' : 'Jouer la carte du jour')),
    blocGroupes(), blocRappel());
}

function majMenuJour() {
  const etat = $('#menu-jour-etat');
  if (!etat) return;
  const n = numeroJour();
  const r = resultatsJour()[n];
  const serie = serieJours();
  etat.textContent = r
    ? `Faite : ${r.res.filter(Boolean).length}/6 · ${r.score} pts${serie > 1 ? ` · 🔥 ${serie} jours` : ''} · prochaine dans ${avantDemain()}`
    : `N°${n} à jouer · 6 questions, la même carte pour tout le monde${serie ? ` · 🔥 ${serie}` : ''}`;
  $('#menu-jour').classList.toggle('fait', !!r);
}

/* ---------------- Réglages ---------------- */

function remplirChoixVoix() {
  const choix = $('#choix-voix');
  if (!choix) return;
  const qualite = v => scoreVoix(v) >= 10 ? ' ★' : '';
  const siwis = voixSiwis();
  choix.replaceChildren(
    typeof Audio === 'function' ? h('option', { value: 'siwis', selected: siwis ? true : null }, 'Siwis · voix de Culture Gé (recommandée)') : null,
    voixDispo.length ? h('optgroup', { label: 'Voix du téléphone' }, voixDispo.map(v =>
      h('option', { value: v.voiceURI, selected: !siwis && voixFr && v.voiceURI === voixFr.voiceURI ? true : null },
        `${v.name.replace(/^Microsoft |^Google /, '')} (${v.lang})${qualite(v)}`))) : null);
}

function initReglages() {
  const f = $('#form-reglages');
  f.nom.value = nomJoueur();
  f.nom.addEventListener('change', () => ecrire(CLE_NOM, f.nom.value.trim()));
  if (!LECTURE_POSSIBLE) { $('#reglages-voix').hidden = true; $('#sans-voix').hidden = false; return; }
  remplirChoixVoix();
  const pref = lire(CLE_VOIX_CHOIX, {});
  f.vitesse.value = pref.vitesse || 1;
  const afficherVitesse = () => { $('#vitesse-valeur').textContent = Number(f.vitesse.value).toFixed(2).replace('.', ','); };
  afficherVitesse();
  // Siwis choisie : on garde la voix du téléphone précédente (lecture en secours).
  const sauver = () => {
    const siwis = f.voix.value === 'siwis';
    ecrire(CLE_VOIX_CHOIX, {
      uri: siwis ? (voixFr ? voixFr.voiceURI : lire(CLE_VOIX_CHOIX, {}).uri) : f.voix.value,
      siwis, vitesse: Number(f.vitesse.value),
    });
  };
  f.voix.addEventListener('change', () => { sauver(); if (Synthese) choisirVoix(); else remplirChoixVoix(); });
  f.vitesse.addEventListener('input', () => { afficherVitesse(); sauver(); });
  $('#tester-voix').addEventListener('click', () =>
    dire('Histoire. Quelle reine exerce la régence pendant l\'enfance de Louis quatorze ? La réponse : Anne d\'Autriche.'));
}

/* ---------------- Parcourir ---------------- */

let resultats = [];
let affiches = 0;
const PAR_PAGE = 50;

const normaliser = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
let INDEX_RECHERCHE = null;

function filtrer() {
  if (!INDEX_RECHERCHE) INDEX_RECHERCHE = QUESTIONS.map(q => normaliser(`${q.q} ${q.r} ${q.t}`));
  const texte = $('#recherche').value.trim();
  const cat = $('#filtre-cat').value;
  const niv = Number($('#filtre-niv').value) || 0;
  const num = /^\d{1,4}$/.test(texte) ? Number(texte) : null;
  const mots = num ? [] : normaliser(texte).split(/\s+/).filter(Boolean);
  resultats = QUESTIONS.filter(q =>
    (!cat || q.cat === cat) &&
    (!niv || q.niv === niv) &&
    (num == null || q.carte + 1 === num) &&
    mots.every(m => INDEX_RECHERCHE[q.id].includes(m)));
  affiches = 0;
  $('#resultats').replaceChildren();
  afficherPlus();
}

function afficherPlus() {
  const lot = resultats.slice(affiches, affiches + PAR_PAGE);
  affiches += lot.length;
  $('#resultats').append(...lot.map(q => {
    const c = catParId(q.cat);
    return h('li', { style: styleCat(c) },
      h('div', { class: 'meta' }, `${c.nom} · carte ${numero(q.carte + 1)} · ${q.t}`, niveau(q.niv)),
      h('div', {}, q.q),
      h('div', { class: 'r' }, q.r));
  }));
  $('#resultats-info').textContent = `${resultats.length} question${resultats.length > 1 ? 's' : ''}`;
  $('#plus-resultats').hidden = affiches >= resultats.length;
}

function initParcourir() {
  $('#filtre-cat').append(...CATS.map(c => h('option', { value: c.id }, c.nom)));
  let minuterie;
  $('#recherche').addEventListener('input', () => { clearTimeout(minuterie); minuterie = setTimeout(filtrer, 150); });
  $('#filtre-cat').addEventListener('change', filtrer);
  $('#filtre-niv').addEventListener('change', filtrer);
  $('#plus-resultats').addEventListener('click', afficherPlus);
}

/* ---------------- Navigation ---------------- */

const VUES = ['accueil', 'jour', 'solo', 'groupe', 'soiree', 'parcourir', 'reglages'];

function naviguer() {
  couperMicro();
  taire();
  const vue = VUES.includes(location.hash.slice(1)) ? location.hash.slice(1) : 'accueil';
  document.querySelectorAll('.vue').forEach(v => { v.hidden = v.dataset.vue !== vue; });
  document.querySelectorAll('.topnav a').forEach(a => a.classList.toggle('actif', a.getAttribute('href') === '#' + vue));
  // Carte du jour terminée : son écran de fin ne sert plus une fois qu'on l'a quitté.
  if (vue !== 'solo' && solo && solo.mode === 'jour' && solo.phase === 'fin') { solo = null; effacer(CLE_SOLO); }
  if (vue === 'accueil') { majMenuJour(); banniereProfil(); }
  if (vue === 'reglages') rendreProfil();
  if (vue === 'jour') rendreJour();
  if (vue === 'solo') rendreSolo();
  if (vue === 'groupe') rendreGroupe();
  if (vue === 'soiree') rendreSoiree();
  if (vue === 'parcourir' && !$('#resultats').children.length) filtrer();
  window.scrollTo(0, 0);
}

/* ---------------- Installation PWA ---------------- */

let invite = null;
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  invite = e;
  $('#installer').hidden = false;
});
window.addEventListener('appinstalled', () => { $('#installer').hidden = true; });

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}

/* ---------------- Démarrage ---------------- */

async function demarrer() {
  try {
    const rep = await fetch('cartes.json');
    if (!rep.ok) throw new Error(rep.status);
    DATA = await rep.json();
  } catch (err) {
    $('#chargement').textContent = 'Impossible de charger les cartes. Vérifiez votre connexion puis rechargez la page.';
    return;
  }
  CATS = DATA.categories;
  DATA.cartes.forEach(carte => carte.forEach(q => { q[0] = typo(q[0]); q[1] = typo(q[1]); }));
  QUESTIONS = [];
  // Données d'avant les cinq niveaux (version 1) : difficulté 1 à 3 = moyenne à expert.
  const decalage = (DATA.version || 1) >= 2 ? 0 : 2;
  DATA.cartes.forEach((carte, n) => carte.forEach(([q, r, niv, t, a, l], i) => {
    // niv : niveau 1 à 5 ; d : points ; a : autres réponses acceptées ; l : texte à lire (si différent).
    niv += decalage;
    QUESTIONS.push({ id: QUESTIONS.length, carte: n, cat: CATS[i].id, q, r, niv, d: pointsNiveau(niv), t, a: a || [], l: l || q });
  }));

  document.querySelectorAll('[data-stat="cartes"]').forEach(e => { e.textContent = DATA.cartes.length; });
  document.querySelectorAll('[data-stat="questions"]').forEach(e => { e.textContent = QUESTIONS.length; });
  $('#legende').replaceChildren(...CATS.map(c =>
    h('li', {}, h('span', { class: 'pastille', style: styleCat(c) }), c.nom)));

  $('#btn-installer').addEventListener('click', async () => {
    if (!invite) return;
    invite.prompt();
    await invite.userChoice;
    invite = null;
    $('#installer').hidden = true;
  });

  // Modes retirés (pioche, partie sans plateau) : leurs sauvegardes ne servent plus.
  ['trivial1000.pioche', 'trivial1000.partie'].forEach(effacer);
  initSolo();
  initGroupe();
  initParcourir();
  initReglages();
  initSoiree();
  initQuotidien();

  // Liens partagés : ?defi=… (défi sur une série), ?jour (carte du jour), ?salle=… (soirée),
  // ?groupe=… (invitation à un groupe d'amis de la carte du jour).
  const params = new URLSearchParams(location.search);
  if (['defi', 'jour', 'salle', 'groupe'].some(p => params.has(p))) {
    if (params.has('groupe')) {
      location.hash = '#jour';
    } else if (params.has('salle')) {
      location.hash = '#soiree';
    } else if (params.has('defi')) {
      defiRecu = decoderDefi(params.get('defi'));
      location.hash = defiRecu ? '#solo' : '#accueil';
    } else {
      location.hash = '#jour';
    }
    history.replaceState(null, '', location.pathname + location.hash);
  }

  $('#chargement').remove();
  window.addEventListener('hashchange', naviguer);
  naviguer();
}

demarrer();
