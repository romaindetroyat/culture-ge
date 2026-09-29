/* Trivial 1000 — soirée entre amis : une partie partagée entre plusieurs téléphones.
 *
 * Le téléphone qui crée la partie (l'hôte) détient l'état du jeu et le diffuse à tous ;
 * les autres téléphones envoient seulement leurs actions (rejoindre, lancer le dé, répondre).
 * Transport : Supabase Realtime (canal « broadcast »), ou un canal local entre onglets
 * du même navigateur pour les essais (?reseau=local).
 */
'use strict';

// SUPABASE_URL et SUPABASE_CLE : voir quotidien.js.
const CLE_ID = 'trivial1000.id';
const CLE_SOIREE_HOTE = 'trivial1000.soiree.hote';
const CLE_SOIREE_NOM_SALLE = 'trivial1000.soiree.salle';
const LETTRES_CODE = 'ABCDEFGHJKMNPQRSTUVWXYZ';
const NOMS_EQUIPES = ['Les Bleus', 'Les Roses', 'Les Jaunes', 'Les Verts'];
const COULEURS_EQUIPES = ['#1f6fd1', '#e0479e', '#f2c200', '#2e9e4f'];
const DUREE_QUESTION = 30; // secondes, mode « tous ensemble »

function monId() {
  // En essai local, chaque onglet est un « téléphone » : identifiant propre à l'onglet.
  if (sessionStorage.getItem('trivial1000.reseau') === 'local') {
    let id = sessionStorage.getItem(CLE_ID);
    if (!id) { id = Math.random().toString(36).slice(2, 10); sessionStorage.setItem(CLE_ID, id); }
    return id;
  }
  let id = lire(CLE_ID, null);
  if (!id) { id = Math.random().toString(36).slice(2, 10); ecrire(CLE_ID, id); }
  return id;
}

/* ---------------- Transport ---------------- */

let bibliothequeSupabase = null;
function chargerSupabase() {
  if (window.supabase) return Promise.resolve(window.supabase);
  if (!bibliothequeSupabase) {
    bibliothequeSupabase = new Promise((ok, ko) => {
      const s = document.createElement('script');
      s.src = 'vendor/supabase.js';
      s.onload = () => ok(window.supabase);
      s.onerror = () => ko(new Error('Bibliothèque réseau introuvable'));
      document.head.append(s);
    });
  }
  return bibliothequeSupabase;
}

/** Ouvre le canal de la salle ; `recevoir(message)` est appelé pour chaque message des autres. */
async function ouvrirCanal(code, recevoir) {
  const local = sessionStorage.getItem('trivial1000.reseau') === 'local';
  if (local || !('WebSocket' in window)) {
    const bc = new BroadcastChannel(`trivial-${code}`);
    bc.onmessage = e => recevoir(e.data);
    return { envoyer: m => bc.postMessage(m), fermer: () => bc.close() };
  }
  const sb = await chargerSupabase();
  const client = sb.createClient(SUPABASE_URL, SUPABASE_CLE, { realtime: { params: { eventsPerSecond: 20 } } });
  const canal = client.channel(`trivial-${code}`, { config: { broadcast: { self: false } } });
  canal.on('broadcast', { event: 'm' }, ({ payload }) => recevoir(payload));
  await new Promise((ok, ko) => {
    const delai = setTimeout(() => ko(new Error('Connexion impossible')), 10000);
    canal.subscribe(statut => {
      if (statut === 'SUBSCRIBED') { clearTimeout(delai); ok(); }
      if (statut === 'CHANNEL_ERROR' || statut === 'TIMED_OUT') { clearTimeout(delai); ko(new Error('Connexion impossible')); }
    });
  });
  return {
    envoyer: m => canal.send({ type: 'broadcast', event: 'm', payload: m }),
    fermer: () => { client.removeChannel(canal); },
  };
}

/* ---------------- État partagé ---------------- */

let soiree = null; // { code, hote: bool, canal, etat, moi }
let minuterieSoiree = null;

function unites(e) {
  // Tour à tour : chaque joueur ou chaque équipe est une « unité » qui a son tour et son score.
  if (e.equipes) {
    return e.nomsEquipes.map((nom, i) => ({ id: 'e' + i, nom, couleur: COULEURS_EQUIPES[i], membres: e.joueurs.filter(j => j.equipe === i).map(j => j.id) }));
  }
  return e.joueurs.map(j => ({ id: j.id, nom: j.nom, membres: [j.id] }));
}

function uniteDe(e, joueurId) {
  return unites(e).find(u => u.membres.includes(joueurId));
}

function scoreDe(e, uniteId) { return e.scores[uniteId] || { points: 0, parts: [] }; }

function diffuser() {
  if (!soiree || !soiree.hote) return;
  soiree.etat.v = (soiree.etat.v || 0) + 1;
  ecrire(CLE_SOIREE_HOTE, soiree.etat);
  soiree.canal.envoyer({ t: 'etat', etat: soiree.etat });
  rendreSoiree();
}

function envoyerAction(action) {
  const a = { ...action, de: soiree.moi };
  if (soiree.hote) traiterAction(a);
  else soiree.canal.envoyer({ t: 'action', action: a });
}

function tirerQuestionSoiree(e, catId) {
  const niveaux = NIVEAUX[e.niveau] || NIVEAUX[0];
  const deja = new Set(e.utilisees);
  let pool = QUESTIONS.filter(q => q.cat === catId && niveaux.includes(q.d) && !deja.has(q.id));
  if (!pool.length) pool = QUESTIONS.filter(q => q.cat === catId && niveaux.includes(q.d));
  const q = pool[Math.floor(Math.random() * pool.length)];
  e.utilisees.push(q.id);
  return q.id;
}

/** Actions reçues par l'hôte (y compris les siennes). */
function traiterAction(a) {
  const e = soiree.etat;
  if (a.type === 'rejoindre') {
    const existant = e.joueurs.find(j => j.id === a.de);
    if (existant) { existant.nom = a.nom; if (a.equipe != null && e.phase === 'salon') existant.equipe = a.equipe; }
    else if (e.phase === 'salon' && !(e.exclus || []).includes(a.de)) e.joueurs.push({ id: a.de, nom: String(a.nom).slice(0, 20), equipe: a.equipe });
    else return;
    diffuser();
    return;
  }
  if (a.type === 'retirer' && e.phase === 'salon' && a.de === e.hote) {
    e.joueurs = e.joueurs.filter(j => j.id !== a.joueur);
    e.exclus = [...(e.exclus || []), a.joueur];
    diffuser();
    return;
  }
  if (a.type === 'lancer' && e.phase === 'de') {
    const u = unites(e)[e.tour];
    if (!u || !(u.membres.includes(a.de) || a.de === e.hote)) return;
    const cat = CATS[Math.floor(Math.random() * CATS.length)];
    e.cat = cat.id;
    e.qid = tirerQuestionSoiree(e, cat.id);
    e.phase = 'question';
    e.verdict = null;
    diffuser();
    return;
  }
  if (a.type === 'reponse' && e.phase === 'question') {
    const q = QUESTIONS[e.qid];
    const ok = Reponse.verifier(a.propositions || [a.texte], q.r, { question: q.q, alias: q.a });
    if (e.mode === 'tour') {
      const u = unites(e)[e.tour];
      if (!u || !u.membres.includes(a.de)) return;
      e.verdict = { ok, texte: a.texte, par: a.de };
      e.phase = 'resultat';
      diffuser();
    } else {
      if (e.reponses[a.de]) return;
      e.reponses[a.de] = { texte: a.texte, ok, t: Date.now() };
      const attendus = e.joueurs.map(j => j.id);
      if (attendus.every(id => e.reponses[id])) cloreQuestionEnsemble();
      else diffuser();
    }
  }
}

/* ---------------- Règles « tour à tour » ---------------- */

function appliquerVerdictTour(ok) {
  const e = soiree.etat;
  const u = unites(e)[e.tour];
  const s = e.scores[u.id] = scoreDe(e, u.id);
  const complet = s.parts.length === CATS.length;
  if (ok) {
    if (complet) { e.phase = 'fin'; e.gagnant = u.id; diffuser(); return; }
    if (!s.parts.includes(e.cat)) s.parts.push(e.cat);
    s.points += QUESTIONS[e.qid].d;
  } else {
    e.tour = (e.tour + 1) % unites(e).length;
  }
  e.phase = 'de';
  e.qid = null;
  e.verdict = null;
  diffuser();
}

/* ---------------- Règles « tous ensemble » ---------------- */

function lancerQuestionEnsemble() {
  const e = soiree.etat;
  e.n = (e.n || 0) + 1;
  const cat = CATS[(e.n - 1) % CATS.length];
  e.cat = cat.id;
  e.qid = tirerQuestionSoiree(e, cat.id);
  e.reponses = {};
  e.phase = 'question';
  e.finQuestion = Date.now() + DUREE_QUESTION * 1000;
  clearTimeout(minuterieSoiree);
  minuterieSoiree = setTimeout(() => { if (soiree && soiree.etat.phase === 'question') cloreQuestionEnsemble(); }, DUREE_QUESTION * 1000 + 300);
  diffuser();
}

function cloreQuestionEnsemble() {
  const e = soiree.etat;
  clearTimeout(minuterieSoiree);
  const q = QUESTIONS[e.qid];
  // Points : difficulté de la question, +1 pour la première bonne réponse.
  const justes = Object.entries(e.reponses).filter(([, r]) => r.ok).sort((a, b) => a[1].t - b[1].t);
  e.gains = {};
  if (e.equipes) {
    // Une équipe marque si au moins un de ses membres a trouvé.
    unites(e).forEach(u => {
      const juste = justes.find(([id]) => u.membres.includes(id));
      if (juste) e.gains[u.id] = q.d + (justes[0] && u.membres.includes(justes[0][0]) ? 1 : 0);
    });
  } else {
    justes.forEach(([id], i) => { e.gains[id] = q.d + (i === 0 ? 1 : 0); });
  }
  Object.entries(e.gains).forEach(([id, pts]) => { const s = e.scores[id] = scoreDe(e, id); s.points += pts; });
  e.phase = 'resultat';
  diffuser();
}

function suiteEnsemble() {
  const e = soiree.etat;
  if (e.n >= e.nbQuestions) { e.phase = 'fin'; diffuser(); } else lancerQuestionEnsemble();
}

/* ---------------- Connexion ---------------- */

function genererCode() {
  return Array.from({ length: 4 }, () => LETTRES_CODE[Math.floor(Math.random() * LETTRES_CODE.length)]).join('');
}

async function connecter(code, hote) {
  const canal = await ouvrirCanal(code, recevoirMessage);
  soiree = { code, hote, canal, etat: soiree && soiree.code === code ? soiree.etat : null, moi: monId() };
  ecrire(CLE_SOIREE_NOM_SALLE, { code, hote });
  if (hote) {
    const e = soiree.etat;
    if (e.mode === 'ensemble' && e.phase === 'question') {
      clearTimeout(minuterieSoiree);
      minuterieSoiree = setTimeout(() => { if (soiree && soiree.etat.phase === 'question') cloreQuestionEnsemble(); }, Math.max(0, e.finQuestion - Date.now()) + 300);
    }
    diffuser();
  } else canal.envoyer({ t: 'bonjour', de: soiree.moi });
  // Rediffusion régulière : rattrape les messages perdus et les téléphones qui se reconnectent.
  clearInterval(soiree.battement);
  soiree.battement = setInterval(() => {
    if (!soiree) return;
    if (soiree.hote) soiree.canal.envoyer({ t: 'etat', etat: soiree.etat });
    else if (!soiree.etat) soiree.canal.envoyer({ t: 'bonjour', de: soiree.moi });
  }, 4000);
}

function recevoirMessage(m) {
  if (!soiree) return;
  if (soiree.hote) {
    if (m.t === 'bonjour') soiree.canal.envoyer({ t: 'etat', etat: soiree.etat });
    if (m.t === 'action') traiterAction(m.action);
  } else if (m.t === 'etat' && (!soiree.etat || m.etat.v > soiree.etat.v)) {
    soiree.etat = m.etat;
    rendreSoiree();
  } else if (m.t === 'ferme') {
    quitterSoiree();
    $('#soiree-contenu').prepend(h('p', { class: 'verdict faux' }, 'L\'hôte a fermé la partie.'));
  }
}

function quitterSoiree() {
  if (soiree) {
    clearInterval(soiree.battement);
    clearTimeout(minuterieSoiree);
    clearInterval(soiree.decompte);
    if (soiree.canal) {
      if (soiree.hote) soiree.canal.envoyer({ t: 'ferme' });
      soiree.canal.fermer();
    }
  }
  soiree = null;
  effacer(CLE_SOIREE_NOM_SALLE);
  taire();
  rendreSoiree();
}

async function creerPartie(form) {
  const nom = form.nom.value.trim() || 'Hôte';
  ecrire(CLE_NOM, nom);
  const equipes = form.equipes.value === 'oui';
  const nbEquipes = Number(form.nbEquipes.value);
  const etat = {
    v: 0, code: genererCode(), mode: form.mode.value, equipes,
    nomsEquipes: equipes ? NOMS_EQUIPES.slice(0, nbEquipes) : [],
    niveau: Number(form.niveau.value), nbQuestions: Number(form.nbQuestions.value),
    joueurs: form.joue.checked ? [{ id: monId(), nom, equipe: equipes ? 0 : null }] : [],
    hote: monId(), phase: 'salon', tour: 0, scores: {}, utilisees: [], reponses: {}, n: 0,
  };
  soiree = { code: etat.code, hote: true, etat };
  afficherAttente('Création de la partie…');
  try { await connecter(etat.code, true); } catch (err) { soiree = null; afficherErreurSoiree(err); }
}

async function rejoindrePartie(code, nom) {
  ecrire(CLE_NOM, nom);
  afficherAttente('Connexion à la partie…');
  try {
    await connecter(code, false);
    soiree.nom = nom;
    rendreSoiree();
  } catch (err) { soiree = null; afficherErreurSoiree(err); }
}

/* ---------------- Affichage ---------------- */

function afficherAttente(texte) {
  $('#soiree-contenu').replaceChildren(h('p', { class: 'message soiree-attente' }, texte));
}

function afficherErreurSoiree(err) {
  $('#soiree-contenu').replaceChildren(
    h('p', { class: 'verdict faux' }, 'Impossible de rejoindre le réseau.'),
    h('p', { class: 'message' }, `${err.message}. Vérifiez votre connexion internet puis réessayez.`),
    h('button', { type: 'button', class: 'btn', onclick: () => rendreSoiree() }, 'Retour'));
}

function tableauScores(e) {
  const liste = unites(e).map(u => ({ u, s: scoreDe(e, u.id) }));
  if (e.mode === 'ensemble' || e.phase === 'fin') liste.sort((a, b) => b.s.points - a.s.points);
  const courant = e.mode === 'tour' ? unites(e)[e.tour] : null;
  return h('div', { class: 'scores' }, liste.map(({ u, s }) =>
    h('div', { class: 'score' + (courant && courant.id === u.id && e.phase !== 'fin' ? ' actif' : ''), style: u.couleur ? `--c:${u.couleur}` : null },
      e.mode === 'tour' ? camembert(CATS.map(c => s.parts.includes(c.id))) : h('span', { class: 'points-rond' }, String(s.points)),
      h('div', {},
        h('div', { class: 'nom' }, u.nom, u.membres.includes(soiree.moi) ? ' (vous)' : ''),
        h('div', { class: 'meta', style: 'font-size:.8rem;color:var(--texte-doux)' },
          e.mode === 'tour' ? `${s.parts.length}/6 · ${s.points} pts` : `${s.points} pts`,
          e.equipes ? ` · ${u.membres.length} joueur${u.membres.length > 1 ? 's' : ''}` : '')))));
}

function carteQuestionSoiree(e, ouvert) {
  const q = QUESTIONS[e.qid];
  const cat = catParId(q.cat);
  return h('article', { class: 'carte' },
    h('div', { class: 'carte-tete' },
      h('span', {}, e.mode === 'ensemble' ? `QUESTION ${e.n} / ${e.nbQuestions}` : 'QUESTION'),
      h('span', { class: 'num' }, 'N° ' + numero(q.carte + 1))),
    ligneQuestion(cat, [q.q, q.r, q.d], { cliquable: false, ouvert }));
}

function formulaireReponse(e, cle) {
  const envoyer = (propositions, texte) => envoyerAction({ type: 'reponse', texte, propositions });
  const info = h('p', { class: 'ecoute', 'aria-live': 'polite' });
  let bouton = null;
  if (Reco) {
    bouton = h('button', {
      type: 'button', class: 'btn btn-micro',
      onclick: () => {
        const reco = new Reco();
        reco.lang = 'fr-FR'; reco.interimResults = true; reco.maxAlternatives = 5;
        let final = null;
        bouton.classList.add('ecoute-active');
        reco.onresult = ev => {
          const res = ev.results[ev.results.length - 1];
          info.textContent = `« ${res[0].transcript} »`;
          if (res.isFinal) final = Array.from(res, alt => alt.transcript);
        };
        reco.onerror = () => { info.textContent = 'Je n\'ai pas compris, réessayez ou tapez la réponse.'; };
        reco.onend = () => { bouton.classList.remove('ecoute-active'); if (final) envoyer(final, final[0]); };
        try { reco.start(); } catch { /* déjà en cours */ }
      },
    }, iconeMicro(), 'Répondre à voix haute');
  }
  return h('div', { class: 'repondre', 'data-cle': cle },
    bouton,
    h('form', {
      class: 'saisie',
      onsubmit: ev => {
        ev.preventDefault();
        const texte = ev.target.reponse.value.trim();
        if (texte) envoyer([texte], texte);
      },
    },
      h('input', { type: 'text', name: 'reponse', placeholder: 'Votre réponse', autocomplete: 'off', 'aria-label': 'Votre réponse' }),
      h('button', { type: 'submit', class: 'btn btn-clair' }, 'OK')),
    info);
}

function rendreAccueilSoiree() {
  const salle = lire(CLE_SOIREE_NOM_SALLE, null);
  const nom = nomJoueur();
  const zone = $('#soiree-contenu');
  const codeLien = new URLSearchParams(location.search).get('salle') || sessionStorage.getItem('trivial1000.salle') || '';
  zone.replaceChildren(
    h('h2', {}, 'Soirée entre amis'),
    h('p', { class: 'aide' }, 'Une partie partagée : chacun joue depuis son téléphone. Il faut une connexion internet.'),
    salle ? h('p', {}, h('button', {
      type: 'button', class: 'btn',
      onclick: () => {
        if (!salle.hote) { rejoindrePartie(salle.code, nom); return; }
        soiree = { code: salle.code, hote: true, etat: lire(CLE_SOIREE_HOTE, null) };
        afficherAttente('Reconnexion…');
        connecter(salle.code, true).catch(err => { soiree = null; afficherErreurSoiree(err); });
      },
    }, `Revenir à la partie ${salle.code}`)) : null,
    h('form', {
      class: 'formulaire', id: 'form-rejoindre',
      onsubmit: ev => {
        ev.preventDefault();
        const f = ev.target;
        const code = f.code.value.trim().toUpperCase();
        if (code.length === 4) rejoindrePartie(code, f.nom.value.trim() || 'Joueur');
      },
    },
      h('fieldset', {},
        h('legend', {}, 'Rejoindre une partie'),
        h('label', { class: 'champ' }, 'Code de la partie',
          h('input', { type: 'text', name: 'code', maxlength: 4, value: codeLien, placeholder: 'ABCD', autocomplete: 'off', class: 'code-salle', required: true })),
        h('label', { class: 'champ' }, 'Votre prénom',
          h('input', { type: 'text', name: 'nom', maxlength: 20, value: nom, placeholder: 'Prénom', required: true })),
        h('button', { type: 'submit', class: 'btn' }, 'Rejoindre'))),
    h('form', {
      class: 'formulaire', id: 'form-creer',
      onsubmit: ev => { ev.preventDefault(); creerPartie(ev.target); },
    },
      h('fieldset', {},
        h('legend', {}, 'Créer une partie'),
        h('label', { class: 'champ' }, 'Votre prénom',
          h('input', { type: 'text', name: 'nom', maxlength: 20, value: nom, placeholder: 'Prénom' })),
        h('div', { class: 'choix' },
          h('label', {}, h('input', { type: 'radio', name: 'mode', value: 'tour', checked: true }), ' Tour à tour (camemberts)'),
          h('label', {}, h('input', { type: 'radio', name: 'mode', value: 'ensemble' }), ' Tous ensemble (quiz rapide)')),
        h('div', { class: 'choix' },
          h('label', {}, h('input', { type: 'radio', name: 'equipes', value: 'non', checked: true }), ' Chacun pour soi'),
          h('label', {}, h('input', { type: 'radio', name: 'equipes', value: 'oui' }), ' En équipes'),
          h('label', {}, 'Nombre d\'équipes ', h('select', { name: 'nbEquipes' }, [2, 3, 4].map(n => h('option', { value: n }, String(n)))))),
        h('div', { class: 'choix' },
          h('label', {}, 'Difficulté ', h('select', { name: 'niveau' },
            ['Toutes', 'Faciles', 'Faciles et moyennes', 'Moyennes et difficiles'].map((t, i) => h('option', { value: i }, t)))),
          h('label', {}, 'Questions (quiz rapide) ', h('select', { name: 'nbQuestions' },
            [10, 15, 20, 30].map(n => h('option', { value: n }, String(n)))))),
        h('label', { class: 'choix' }, h('input', { type: 'checkbox', name: 'joue', checked: true }), ' Je joue aussi depuis ce téléphone'),
        h('button', { type: 'submit', class: 'btn' }, 'Créer la partie'))));
}

function rendreSalon(e) {
  const zone = $('#soiree-contenu');
  const moi = e.joueurs.find(j => j.id === soiree.moi);
  const lien = `${URL_JEU}?salle=${e.code}`;
  const blocs = [
    h('p', { class: 'solo-config-rappel' }, e.mode === 'tour' ? 'Tour à tour · camemberts' : `Tous ensemble · ${e.nbQuestions} questions`),
    h('p', { class: 'code-grand' }, e.code),
    h('p', { class: 'message' }, 'Code à saisir dans « Soirée » sur chaque téléphone, ou lien à partager :'),
    panneauPartage({ titre: 'Partie Trivial 1000', texte: `🎲 Rejoins ma partie de Trivial 1000 ! Code : ${e.code}`, lien }),
  ];
  // Inscription (nom, équipe) pour les invités… et pour l'hôte s'il joue.
  const nom = soiree.nom || nomJoueur() || 'Joueur';
  if ((e.exclus || []).includes(soiree.moi)) {
    blocs.push(h('p', { class: 'verdict faux' }, 'L\'hôte vous a retiré de cette partie.'));
  } else if (!moi && !soiree.hote && !e.equipes) {
    // Invité en chacun pour soi : inscription automatique (répétée tant que l'hôte ne l'a pas reçue).
    envoyerAction({ type: 'rejoindre', nom, equipe: null });
    blocs.push(h('p', { class: 'message' }, 'Inscription en cours…'));
  } else if (!moi && e.equipes) {
    blocs.push(h('h3', {}, soiree.hote ? 'Vous jouez aussi ? Choisissez votre équipe' : 'Choisissez votre équipe'),
      h('div', { class: 'choix-equipe' }, e.nomsEquipes.map((n, i) =>
        h('button', { type: 'button', class: 'btn', style: `--c:${COULEURS_EQUIPES[i]}`, onclick: () => envoyerAction({ type: 'rejoindre', nom, equipe: i }) }, n))));
  } else if (!moi && soiree.hote) {
    blocs.push(h('p', {}, h('button', { type: 'button', class: 'btn-lien', onclick: () => envoyerAction({ type: 'rejoindre', nom, equipe: null }) }, 'Je joue aussi depuis ce téléphone')));
  } else if (moi && e.equipes) {
    blocs.push(h('p', {}, 'Votre équipe : ', h('b', {}, e.nomsEquipes[moi.equipe]), ' · ',
      h('button', { type: 'button', class: 'btn-lien', onclick: () => envoyerAction({ type: 'rejoindre', nom: moi.nom, equipe: (moi.equipe + 1) % e.nomsEquipes.length }) }, 'changer')));
  }
  const ligneJoueur = j => h('li', {}, j.nom, j.id === e.hote ? ' (hôte)' : '', j.id === soiree.moi ? ' (vous)' : '',
    soiree.hote && j.id !== soiree.moi
      ? h('button', { type: 'button', class: 'btn-retirer', 'aria-label': `Retirer ${j.nom}`, onclick: () => envoyerAction({ type: 'retirer', joueur: j.id }) }, '×')
      : null);
  const listes = e.equipes
    ? e.nomsEquipes.map((n, i) => h('div', { class: 'equipe', style: `--c:${COULEURS_EQUIPES[i]}` },
      h('b', {}, n), h('ul', {}, e.joueurs.filter(j => j.equipe === i).map(ligneJoueur))))
    : [h('ul', { class: 'liste-salon' }, e.joueurs.map(ligneJoueur))];
  blocs.push(h('h3', {}, `Joueurs (${e.joueurs.length})`), h('div', { class: 'salon-equipes' }, listes));
  if (soiree.hote) {
    const prets = e.equipes ? unites(e).filter(u => u.membres.length).length >= 2 : e.joueurs.length >= 2;
    blocs.push(h('div', { class: 'actions' }, h('button', {
      type: 'button', class: 'btn', disabled: !prets,
      onclick: () => {
        // Les équipes vides ne jouent pas.
        if (e.equipes) {
          const gardees = e.nomsEquipes.map((n, i) => i).filter(i => e.joueurs.some(j => j.equipe === i));
          e.joueurs.forEach(j => { j.equipe = gardees.indexOf(j.equipe); });
          e.nomsEquipes = gardees.map(i => e.nomsEquipes[i]);
        }
        e.tour = Math.floor(Math.random() * unites(e).length);
        if (e.mode === 'tour') { e.phase = 'de'; diffuser(); } else lancerQuestionEnsemble();
      },
    }, prets ? 'Commencer la partie' : 'En attente d\'au moins 2 joueurs')));
  } else {
    blocs.push(h('p', { class: 'message' }, 'L\'hôte lancera la partie quand tout le monde sera là.'));
  }
  zone.replaceChildren(...blocs);
}

function rendreJeuTour(e) {
  const zone = $('#soiree-contenu');
  const u = unites(e)[e.tour];
  const moiJoue = u && u.membres.includes(soiree.moi);
  const entete = h('p', { class: 'tour-joueur' }, 'À ', h('b', {}, u ? u.nom : '?'), moiJoue ? ' (vous) ' : ' ', 'de jouer');
  const blocs = [tableauScores(e), entete];
  if (e.phase === 'de') {
    const complet = scoreDe(e, u.id).parts.length === 6;
    blocs.push(h('div', { class: 'de' }, '?'),
      complet ? h('p', { class: 'message' }, 'Camembert complet : question finale !') : null,
      moiJoue
        ? h('button', { type: 'button', class: 'btn', onclick: () => envoyerAction({ type: 'lancer' }) }, 'Lancer le dé')
        : h('p', { class: 'message' }, `En attente de ${u.nom}…`),
      !moiJoue && soiree.hote
        ? h('button', { type: 'button', class: 'btn-lien', onclick: () => envoyerAction({ type: 'lancer' }) }, `Lancer le dé pour ${u.nom}`)
        : null);
  } else if (e.phase === 'question') {
    const q = QUESTIONS[e.qid];
    blocs.push(carteQuestionSoiree(e, false), boutonLire(`${catParId(q.cat).nom}. ${q.l}`),
      moiJoue ? formulaireReponse(e, `t${e.utilisees.length}`) : h('p', { class: 'message' }, `${u.nom} réfléchit…`));
    if (soiree.hote && !moiJoue) {
      // Réponse donnée à voix haute autour de la table, ou téléphone du joueur absent : l'hôte tranche.
      blocs.push(h('details', { class: 'arbitrage' },
        h('summary', {}, 'Réponse donnée de vive voix ?'),
        h('p', { class: 'reponse-cachee' }, 'Réponse : ', h('b', {}, q.r)),
        h('div', { class: 'actions' },
          h('button', { type: 'button', class: 'btn btn-ok', onclick: () => appliquerVerdictTour(true) }, 'Bonne réponse'),
          h('button', { type: 'button', class: 'btn btn-ko', onclick: () => appliquerVerdictTour(false) }, 'Mauvaise réponse'))));
    }
    if (soiree.hote) direUneFois(`soiree-q-${e.utilisees.length}`, `${u.nom}, ${catParId(q.cat).nom}. ${q.l}`);
  } else if (e.phase === 'resultat') {
    const q = QUESTIONS[e.qid];
    const v = e.verdict;
    blocs.push(carteQuestionSoiree(e, true),
      h('p', { class: 'verdict ' + (v.ok ? 'juste' : 'faux') }, v.ok ? 'Bonne réponse !' : 'Raté !',
        h('span', { class: 'entendu' }, `Réponse donnée : « ${v.texte} »`)));
    if (soiree.hote) direUneFois(`soiree-v-${e.utilisees.length}`, v.ok ? 'Bonne réponse !' : `Raté. La réponse était : ${q.r}.`);
    if (soiree.hote) {
      blocs.push(h('div', { class: 'actions' },
        h('button', { type: 'button', class: 'btn ' + (v.ok ? 'btn-ok' : 'btn-ko'), onclick: () => appliquerVerdictTour(v.ok) }, 'Continuer')),
      h('button', { type: 'button', class: 'btn-lien', onclick: () => appliquerVerdictTour(!v.ok) }, v.ok ? 'Compter faux' : 'Compter juste'));
    } else {
      blocs.push(h('p', { class: 'message' }, 'L\'hôte valide et passe à la suite.'));
    }
  }
  zone.replaceChildren(...blocs);
}

function rendreJeuEnsemble(e) {
  const zone = $('#soiree-contenu');
  const q = QUESTIONS[e.qid];
  const joue = e.joueurs.some(j => j.id === soiree.moi);
  const blocs = [tableauScores(e)];
  if (e.phase === 'question') {
    const reste = Math.max(0, Math.round((e.finQuestion - Date.now()) / 1000));
    const repondus = Object.keys(e.reponses).length;
    const texteMinuteur = () => `⏱ ${Math.max(0, Math.round((e.finQuestion - Date.now()) / 1000))} s · ${repondus}/${e.joueurs.length} réponse${repondus > 1 ? 's' : ''}`;
    blocs.push(h('p', { class: 'minuteur' + (reste <= 5 ? ' urgent' : ''), id: 'minuteur' }, texteMinuteur()),
      carteQuestionSoiree(e, false), boutonLire(`${catParId(q.cat).nom}. ${q.l}`));
    if (joue && !e.reponses[soiree.moi]) blocs.push(formulaireReponse(e, `e${e.n}`));
    else if (joue) blocs.push(h('p', { class: 'message' }, 'Réponse envoyée ! En attente des autres…'));
    if (soiree.hote) blocs.push(h('button', { type: 'button', class: 'btn-lien', onclick: cloreQuestionEnsemble }, 'Clore la question maintenant'));
    if (soiree.hote) direUneFois(`soiree-e-${e.n}`, `Question ${e.n}. ${catParId(q.cat).nom}. ${q.l}`);
    clearInterval(soiree.decompte);
    soiree.decompte = setInterval(() => {
      const m = $('#minuteur');
      if (!soiree || soiree.etat !== e || !m) { clearInterval(soiree && soiree.decompte); return; }
      m.textContent = texteMinuteur();
      m.classList.toggle('urgent', e.finQuestion - Date.now() <= 5000);
    }, 1000);
  } else if (e.phase === 'resultat') {
    const noms = Object.fromEntries(e.joueurs.map(j => [j.id, j.nom]));
    blocs.push(carteQuestionSoiree(e, true),
      h('ul', { class: 'reponses-soiree' }, e.joueurs.map(j => {
        const r = e.reponses[j.id];
        return h('li', { class: r ? (r.ok ? 'juste' : 'faux') : 'faux' },
          h('b', {}, noms[j.id]), ' : ', r ? `« ${r.texte} »` : 'pas de réponse', r && r.ok ? ' ✅' : ' ❌');
      })));
    if (soiree.hote) direUneFois(`soiree-r-${e.n}`, `La réponse était : ${q.r}.`);
    if (soiree.hote) blocs.push(h('div', { class: 'actions' }, h('button', { type: 'button', class: 'btn', onclick: suiteEnsemble }, e.n >= e.nbQuestions ? 'Voir le classement' : 'Question suivante')));
    else blocs.push(h('p', { class: 'message' }, 'L\'hôte passe à la question suivante.'));
  }
  zone.replaceChildren(...blocs);
}

function rendreFinSoiree(e) {
  const classement = unites(e).map(u => ({ u, s: scoreDe(e, u.id) })).sort((a, b) =>
    (e.mode === 'tour' ? (b.u.id === e.gagnant) - (a.u.id === e.gagnant) || b.s.parts.length - a.s.parts.length : 0) || b.s.points - a.s.points);
  const premier = classement[0];
  if (soiree.hote) direUneFois(`soiree-fin-${e.code}-${e.utilisees.length}`, `Partie terminée. Victoire de ${premier.u.nom} !`);
  $('#soiree-contenu').replaceChildren(
    h('div', { class: 'hero victoire' },
      camembert(CATS.map(() => true), 120),
      h('h2', { style: 'margin-top:14px' }, `Victoire de ${premier.u.nom} !`)),
    h('ol', { class: 'classement' }, classement.map(({ u, s }) =>
      h('li', {}, h('b', {}, u.nom), ` — ${s.points} pts`, e.mode === 'tour' ? ` · ${s.parts.length}/6 camemberts` : ''))),
    h('h3', {}, 'Partager le résultat'),
    panneauPartage({
      titre: 'Soirée Trivial 1000',
      texte: `🎉 Soirée Trivial 1000 : victoire de ${premier.u.nom} ! ` + classement.map(({ u, s }, i) => `${i + 1}. ${u.nom} (${s.points} pts)`).join(', '),
      lien: URL_JEU,
    }),
    h('div', { class: 'actions' },
      soiree.hote ? h('button', {
        type: 'button', class: 'btn',
        onclick: () => {
          Object.assign(e, { phase: 'salon', tour: 0, scores: {}, utilisees: [], reponses: {}, n: 0, gagnant: null, qid: null, verdict: null });
          diffuser();
        },
      }, 'Rejouer avec les mêmes joueurs') : null,
      h('button', { type: 'button', class: 'btn btn-clair', onclick: quitterSoiree }, 'Quitter')));
}

function rendreSoiree() {
  const zone = $('#soiree-contenu');
  if (!zone) return;
  if (!soiree) { rendreAccueilSoiree(); return; }
  const e = soiree.etat;
  if (!e) { afficherAttente(`Connexion à la partie ${soiree.code}… (l'hôte doit avoir l'application ouverte)`); return; }
  // Ne pas effacer une réponse en cours de saisie à chaque rafraîchissement.
  const saisie = zone.querySelector('.saisie input');
  const brouillon = saisie ? saisie.value : '';
  const cle = zone.querySelector('.repondre') ? zone.querySelector('.repondre').dataset.cle : null;
  if (e.phase === 'salon') rendreSalon(e);
  else if (e.phase === 'fin') rendreFinSoiree(e);
  else if (e.mode === 'tour') rendreJeuTour(e);
  else rendreJeuEnsemble(e);
  const nouvelle = zone.querySelector('.saisie input');
  const nouvelleCle = zone.querySelector('.repondre') ? zone.querySelector('.repondre').dataset.cle : null;
  if (nouvelle && brouillon && cle === nouvelleCle) { nouvelle.value = brouillon; nouvelle.focus(); }
  if (e.phase !== 'fin') zone.append(h('div', { class: 'partie-actions' },
    h('span', { class: 'aide' }, `Partie ${soiree.code}${soiree.hote ? ' · vous êtes l\'hôte' : ''} · `),
    h('button', { type: 'button', class: 'btn-lien', onclick: () => { if (confirm('Quitter la partie ?')) quitterSoiree(); } }, 'Quitter')));
}

function initSoiree() {
  const params = new URLSearchParams(location.search);
  if (params.get('reseau') === 'local') sessionStorage.setItem('trivial1000.reseau', 'local');
  if (params.has('salle')) sessionStorage.setItem('trivial1000.salle', params.get('salle').toUpperCase());
}
