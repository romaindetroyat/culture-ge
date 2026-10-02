/* Culture Gé — quiz en groupe : un animateur lit les questions à voix haute (ou les fait lire par
 * l'appli), tout le monde peut répondre à chaque question, et l'animateur touche le nom de celui ou
 * celle qui a trouvé en premier. Un seul téléphone ; les joueurs sont inscrits avant de commencer. */

const CLE_GROUPE = 'trivial1000.groupe';
const MAX_JOUEURS_GROUPE = 12;

let groupe = null;
// { joueurs: [{ nom, points, bonnes }], nb (0 : sans limite), cat, niveau, utilisees: [ids],
//   n (numéro de la question), qid, phase: 'question' | 'reponse' | 'fin',
//   gagnant (indice du joueur qui a trouvé, ou null), historique: [{ qid, gagnant, pts }] }

function sauverGroupe() { ecrire(CLE_GROUPE, groupe); }

const pointsQuestion = q => q.d; // 1 point jusqu'à moyenne, 2 en difficile, 3 en expert

function tirerQuestionGroupe() {
  const niveaux = NIVEAUX[groupe.niveau] || NIVEAUX[0];
  // Toutes catégories : on les fait tourner, comme sur une carte.
  const cat = groupe.cat || CATS[(groupe.n - 1) % CATS.length].id;
  const deja = new Set(groupe.utilisees);
  let pool = QUESTIONS.filter(q => q.cat === cat && niveaux.includes(q.niv) && !deja.has(q.id));
  if (!pool.length) pool = QUESTIONS.filter(q => q.cat === cat && niveaux.includes(q.niv));
  if (!pool.length) pool = QUESTIONS.filter(q => q.cat === cat); // niveau absent des données
  const q = pool[Math.floor(Math.random() * pool.length)];
  groupe.utilisees.push(q.id);
  return q.id;
}

function questionSuivanteGroupe() {
  groupe.n++;
  groupe.qid = tirerQuestionGroupe();
  groupe.phase = 'question';
  groupe.gagnant = null;
  sauverGroupe();
  rendreGroupe();
}

/** L'animateur désigne qui a trouvé (indice du joueur), ou personne (null). */
function designerGroupe(indice) {
  const q = QUESTIONS[groupe.qid];
  const pts = indice == null ? 0 : pointsQuestion(q);
  if (indice != null) {
    groupe.joueurs[indice].points += pts;
    groupe.joueurs[indice].bonnes++;
  }
  groupe.historique.push({ qid: groupe.qid, gagnant: indice, pts });
  groupe.gagnant = indice;
  groupe.phase = 'reponse';
  sauverGroupe();
  rendreGroupe();
}

/** Mauvais nom touché : on annule et on redésigne, sans relire la question. */
function corrigerGroupe() {
  const dernier = groupe.historique.pop();
  if (dernier && dernier.gagnant != null) {
    const j = groupe.joueurs[dernier.gagnant];
    j.points -= dernier.pts;
    j.bonnes--;
  }
  groupe.phase = 'question';
  groupe.gagnant = null;
  derniereLecture = `groupe-q-${groupe.n}-${groupe.qid}`;
  sauverGroupe();
  rendreGroupe();
}

function suiteGroupe() {
  if (groupe.nb && groupe.n >= groupe.nb) {
    groupe.phase = 'fin';
    sauverGroupe();
    rendreGroupe();
  } else {
    questionSuivanteGroupe();
  }
}

function demarrerGroupe(reglages, noms) {
  groupe = {
    joueurs: noms.map(nom => ({ nom, points: 0, bonnes: 0 })),
    nb: reglages.nb, cat: reglages.cat, niveau: reglages.niveau,
    utilisees: groupe ? groupe.utilisees : [], // pas de question déjà posée en rejouant
    n: 0, qid: null, phase: 'question', gagnant: null, historique: [],
  };
  derniereLecture = null;
  questionSuivanteGroupe();
}

function nouveauGroupe() {
  taire();
  groupe = null;
  effacer(CLE_GROUPE);
  rendreGroupe();
}

/* ---------------- Affichage ---------------- */

function champJoueurGroupe(nom = '') {
  const ligne = h('div', { class: 'joueur-champ' },
    h('input', { type: 'text', name: 'joueur', value: nom, placeholder: 'Prénom', maxlength: 20, 'aria-label': 'Prénom du joueur' }),
    h('button', {
      type: 'button', class: 'btn-lien', 'aria-label': 'Retirer ce joueur',
      onclick: () => { if ($('#liste-joueurs').children.length > 2) ligne.remove(); },
    }, 'Retirer'),
  );
  return ligne;
}

function afficherConfigGroupe() {
  $('#groupe-config').hidden = false;
  $('#groupe-jeu').hidden = true;
  const noms = lire(CLE_JOUEURS, []);
  const liste = noms.length >= 2 ? noms : ['', ''];
  $('#liste-joueurs').replaceChildren(...liste.map(n => champJoueurGroupe(n)));
}

function scoresGroupe(enEvidence) {
  return h('div', { class: 'scores scores-compacts' }, groupe.joueurs.map((j, i) =>
    h('div', { class: 'score' + (i === enEvidence ? ' actif' : '') },
      h('span', { class: 'points-rond' }, String(j.points)),
      h('div', { class: 'nom' }, j.nom))));
}

function rendreGroupe() {
  if (!groupe) { afficherConfigGroupe(); return; }
  $('#groupe-config').hidden = true;
  const zone = $('#groupe-jeu');
  zone.hidden = false;
  if (groupe.phase === 'fin') { rendreFinGroupe(zone); return; }

  const q = QUESTIONS[groupe.qid];
  const cat = catParId(q.cat);
  const pts = pointsQuestion(q);
  const reponse = groupe.phase === 'reponse';
  const carte = h('article', { class: 'carte' },
    h('div', { class: 'carte-tete' },
      h('span', {}, `QUESTION ${groupe.n}${groupe.nb ? ' / ' + groupe.nb : ''} · ${pts} PT${pts > 1 ? 'S' : ''}`),
      h('span', { class: 'num' }, 'N° ' + numero(q.carte + 1))),
    // Pendant la question, l'animateur peut toucher la question pour voir la réponse (sans la lire).
    ligneQuestion(cat, [q.q, q.r, q.niv], { cliquable: !reponse, ouvert: reponse }));

  let actions;
  if (!reponse) {
    actions = h('div', {},
      boutonLire(`${cat.nom}. ${q.l}`),
      h('h3', {}, 'Qui a trouvé ?'),
      h('div', { class: 'choix-joueurs' }, groupe.joueurs.map((j, i) =>
        h('button', { type: 'button', class: 'btn', onclick: () => designerGroupe(i) }, j.nom))),
      h('div', { class: 'actions' },
        h('button', { type: 'button', class: 'btn btn-clair', onclick: () => designerGroupe(null) }, 'Personne')));
  } else {
    const g = groupe.gagnant == null ? null : groupe.joueurs[groupe.gagnant];
    const fin = groupe.nb && groupe.n >= groupe.nb;
    actions = h('div', {},
      h('p', { class: 'verdict ' + (g ? 'juste' : 'faux') },
        g ? `${g.nom} a trouvé : +${pts} point${pts > 1 ? 's' : ''}` : 'Personne n\'a trouvé.'),
      h('div', { class: 'actions' },
        h('button', { type: 'button', class: 'btn', onclick: suiteGroupe }, fin ? 'Voir le classement' : 'Question suivante')),
      h('button', { type: 'button', class: 'btn-lien', onclick: corrigerGroupe }, 'Corriger : désigner quelqu\'un d\'autre'));
  }

  zone.replaceChildren(
    scoresGroupe(reponse ? groupe.gagnant : null),
    h('div', { class: 'tour' }, carte, actions),
    h('div', { class: 'partie-actions' },
      h('button', {
        type: 'button', class: 'btn-lien',
        onclick: () => { if (confirm('Terminer le quiz et voir le classement ?')) { taire(); groupe.phase = 'fin'; sauverGroupe(); rendreGroupe(); } },
      }, 'Terminer le quiz')));

  if (!reponse) {
    direUneFois(`groupe-q-${groupe.n}-${groupe.qid}`, `${cat.nom}. ${q.l}`);
    prechargerVoix(q.r);
  } else {
    direUneFois(`groupe-r-${groupe.n}-${groupe.qid}`, ['La réponse :', reponseLue(q.r)]);
  }
}

function rendreFinGroupe(zone) {
  const classement = groupe.joueurs.map(j => j).sort((a, b) => b.points - a.points || b.bonnes - a.bonnes);
  const max = classement[0].points;
  const premiers = classement.filter(j => j.points === max);
  const titre = max === 0 ? 'Personne n\'a marqué de point.'
    : premiers.length > 1 ? `Égalité : ${premiers.map(j => j.nom).join(' et ')} !`
      : `Victoire ${deNom(premiers[0].nom)} !`;
  const posees = groupe.historique.length;
  direUneFois(`groupe-fin-${groupe.utilisees.length}`, [{ t: titre, s: null }]);
  // Rang partagé en cas d'égalité de points.
  let rang = 0;
  const lignes = classement.map((j, i) => {
    if (i === 0 || j.points !== classement[i - 1].points) rang = i + 1;
    return h('li', { value: rang }, h('b', {}, j.nom), ` — ${j.points} pt${j.points > 1 ? 's' : ''}`,
      h('span', { class: 'meta' }, ` · ${j.bonnes} bonne${j.bonnes > 1 ? 's' : ''} réponse${j.bonnes > 1 ? 's' : ''}`));
  });
  const reglages = { nb: groupe.nb, cat: groupe.cat, niveau: groupe.niveau };
  zone.replaceChildren(
    h('div', { class: 'hero victoire' },
      h('p', { class: 'trophee', 'aria-hidden': 'true' }, '🏆'),
      h('h2', {}, titre),
      h('p', { class: 'message' }, `${posees} question${posees > 1 ? 's' : ''} posée${posees > 1 ? 's' : ''}.`)),
    h('ol', { class: 'classement' }, lignes),
    h('h3', {}, 'Partager le résultat'),
    panneauPartage({
      titre: 'Quiz Culture Gé',
      texte: `🏆 Quiz Culture Gé : ${titre} ` + classement.map(j => `${j.nom} (${j.points} pts)`).join(', '),
      lien: URL_JEU,
    }),
    h('div', { class: 'actions' },
      h('button', { type: 'button', class: 'btn', onclick: () => demarrerGroupe(reglages, groupe.joueurs.map(j => j.nom)) }, 'Rejouer avec les mêmes joueurs'),
      h('button', { type: 'button', class: 'btn btn-clair', onclick: nouveauGroupe }, 'Nouveau quiz')));
}

/* ---------------- Initialisation ---------------- */

function initGroupe() {
  $('#groupe-cats').append(
    h('label', {}, h('input', { type: 'radio', name: 'cat', value: '', checked: true }), ' Toutes, à tour de rôle'),
    ...CATS.map(c => h('label', {}, h('input', { type: 'radio', name: 'cat', value: c.id }), ' ',
      h('span', { class: 'pastille', style: styleCat(c) }), ' ', c.nom)));
  $('#ajout-joueur').addEventListener('click', () => {
    const liste = $('#liste-joueurs');
    if (liste.children.length >= MAX_JOUEURS_GROUPE) return;
    const champ = champJoueurGroupe('');
    liste.append(champ);
    $('input', champ).focus();
  });
  initReglagesVoix($('#form-groupe'));
  $('#form-groupe').addEventListener('submit', e => {
    e.preventDefault();
    const f = e.target;
    const noms = [...f.querySelectorAll('input[name="joueur"]')].map((i, k) => i.value.trim() || `Joueur ${k + 1}`);
    // Deux joueurs du même nom : on les distingue.
    const vus = {};
    const uniques = noms.map(n => { vus[n] = (vus[n] || 0) + 1; return vus[n] > 1 ? `${n} ${vus[n]}` : n; });
    ecrire(CLE_JOUEURS, uniques);
    groupe = null;
    demarrerGroupe({ nb: Number(f.nb.value), cat: f.cat.value, niveau: Number(f.niveau.value) }, uniques);
  });
  groupe = lire(CLE_GROUPE, null);
  if (groupe && (!Array.isArray(groupe.joueurs) || (groupe.qid != null && !QUESTIONS[groupe.qid]))) groupe = null;
}
