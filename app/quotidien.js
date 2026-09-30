/* Culture Gé — autour de la carte du jour : classement de tous les joueurs,
 * groupes d'amis (classement de la semaine), rappel quotidien par notification ou agenda.
 *
 * Les scores sont envoyés anonymement (identifiant aléatoire propre au téléphone) à Supabase ;
 * le prénom n'est visible que des membres des groupes que l'on rejoint.
 */
'use strict';

const SUPABASE_URL = 'https://udreqtxyvafojqefmkmt.supabase.co';
const SUPABASE_CLE = 'sb_publishable_9Q895t0J5CA0sN5nQ8pncw_cK4S_mDz'; // clé publique, faite pour le navigateur
const VAPID_PUBLIQUE = 'BC-N4UgLSe_AEuz2_gc5nQefljHkgzkuyz5LAx3-cY8S5qKsD8fqA7lDl2XY6sxTU2V7RhsKOn7xg5Hr-lOZ8Dg';
const CLE_JOUEUR = 'trivial1000.joueur';
const CLE_JOUR_PUBLIE = 'trivial1000.jour.publie';
const CLE_GROUPES = 'trivial1000.groupes';
const CLE_RAPPEL = 'trivial1000.rappel';
const HEURE_RAPPEL_DEFAUT = 8;

/* L'identifiant est aussi gardé dans un cookie : certains systèmes copient les cookies du
 * navigateur vers l'appli installée, qui retrouve alors le profil toute seule. */
const COOKIE_JOUEUR = 'cg_joueur';

function cookieJoueur() {
  const m = document.cookie.match(new RegExp(`(?:^|;\\s*)${COOKIE_JOUEUR}=([0-9a-f-]{36})`));
  return m ? m[1] : null;
}

function ecrireCookieJoueur(id) {
  const chemin = location.pathname.replace(/[^/]*$/, '');
  document.cookie = `${COOKIE_JOUEUR}=${id}; max-age=${400 * 86400}; path=${chemin}; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}`;
}

function idJoueur() {
  let id = lire(CLE_JOUEUR, null);
  if (!id) {
    const cookie = cookieJoueur();
    if (cookie) {
      id = cookie;
      sessionStorage.setItem('trivial1000.profil.cookie', '1'); // à compléter depuis le serveur (voir profil.js)
    } else {
      id = crypto.randomUUID ? crypto.randomUUID()
        : '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, c => (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16));
    }
    ecrire(CLE_JOUEUR, id);
    ecrireCookieJoueur(id);
  }
  return id;
}

async function rpc(fonction, args) {
  const rep = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fonction}`, {
    method: 'POST',
    headers: { apikey: SUPABASE_CLE, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
  if (!rep.ok) throw new Error(`${fonction} : ${rep.status}`);
  const texte = await rep.text();
  return texte ? JSON.parse(texte) : null;
}

/* ---------------- Classement du jour ---------------- */

let statsJourCache = {};

/** Envoie le résultat du jour (une fois) ; renvoie les statistiques de la journée. */
async function publierJour(n) {
  const r = resultatsJour()[n];
  if (!r) return null;
  const stats = await rpc('publier_resultat', {
    p_joueur: idJoueur(), p_jour: n, p_bonnes: r.res.filter(Boolean).length,
    p_points: Math.min(30, r.score), p_res: r.res.map(ok => (ok ? '1' : '0')).join(''),
  });
  ecrire(CLE_JOUR_PUBLIE, [...new Set([...lire(CLE_JOUR_PUBLIE, []), n])].slice(-10));
  statsJourCache[n] = stats;
  sauverProfil();
  return stats;
}

/** Résultats joués hors connexion : on les renvoie dès que possible (le serveur accepte la veille). */
function rattraperPublication() {
  const deja = lire(CLE_JOUR_PUBLIE, []);
  const n = numeroJour();
  [n - 1, n].filter(j => resultatsJour()[j] && !deja.includes(j)).forEach(j => publierJour(j).catch(() => {}));
}

function pourcent(x) { return `${Math.round(x * 100)} %`; }

function blocClassementJour(n) {
  const zone = h('div', { class: 'classement-jour' }, h('p', { class: 'message' }, 'Classement du jour…'));
  const remplir = stats => {
    if (!stats || !stats.moi) { zone.replaceChildren(h('p', { class: 'message' }, 'Classement indisponible pour le moment.')); return; }
    const autres = stats.total - 1;
    const phrase = autres < 1
      ? 'Vous êtes le premier à jouer cette carte aujourd\'hui !'
      : stats.moins_bien === autres ? `Meilleur score parmi les ${stats.total} joueurs du jour ! 🏆`
        : `Vous faites mieux que ${pourcent(stats.moins_bien / autres)} des ${stats.total} joueurs du jour.`;
    const max = Math.max(1, ...stats.repartition);
    zone.replaceChildren(
      h('h3', {}, 'Classement du jour'),
      h('p', { class: 'classement-phrase' }, phrase),
      h('div', { class: 'histogramme', role: 'img', 'aria-label': `Répartition des scores : ${stats.repartition.map((c, i) => `${c} à ${i}/6`).join(', ')}` },
        stats.repartition.map((c, i) => h('div', { class: 'barre' + (i === stats.moi.bonnes ? ' moi' : '') },
          h('span', { class: 'barre-nb' }, String(c)),
          h('span', { class: 'barre-zone' }, h('span', { class: 'barre-remplie', style: `height:${Math.round(c / max * 100)}%` })),
          h('span', { class: 'barre-label' }, `${i}/6`)))),
      h('p', { class: 'aide' }, `Moyenne du jour : ${String(stats.moyenne).replace('.', ',')}/6. Scores anonymes.`));
  };
  if (statsJourCache[n]) remplir(statsJourCache[n]);
  const publie = lire(CLE_JOUR_PUBLIE, []).includes(n);
  (publie ? rpc('stats_jour', { p_jour: n, p_joueur: idJoueur() }) : publierJour(n))
    .then(s => { statsJourCache[n] = s; remplir(s); })
    .catch(() => { if (!statsJourCache[n]) zone.replaceChildren(h('p', { class: 'message' }, 'Classement indisponible hors connexion.')); });
  return zone;
}

/* ---------------- Groupes d'amis ---------------- */

function semaine() {
  const n = numeroJour();
  const jourSemaine = (new Date().getDay() + 6) % 7; // lundi = 0
  return { du: n - jourSemaine, au: n };
}

function mesGroupesLocaux() { return lire(CLE_GROUPES, []); }

function inviterGroupe(g) {
  return panneauPartage({
    titre: `Groupe « ${g.nom} » — Culture Gé`,
    texte: `🎯 Rejoins mon groupe « ${g.nom} » sur Culture Gé : chaque jour la même carte de 6 questions, et le classement de la semaine entre nous !`,
    lien: `${URL_JEU}?groupe=${g.code}`,
  });
}

function tableauGroupe(g, cl) {
  const n = numeroJour();
  const jaiJoue = !!resultatsJour()[n];
  return h('table', { class: 'tableau-groupe' },
    h('thead', {}, h('tr', {}, h('th', {}, '#'), h('th', {}, 'Joueur'), h('th', {}, 'Aujourd\'hui'), h('th', {}, 'Semaine'))),
    h('tbody', {}, cl.membres.map((m, i) => h('tr', { class: m.moi ? 'moi' : null },
      h('td', {}, String(i + 1)),
      h('td', {}, m.nom),
      h('td', { title: m.jour && jaiJoue ? m.jour.res.split('').map((c, k) => `${EMOJI_CAT[CATS[k].id]}${c === '1' ? '✅' : '❌'}`).join(' ') : null },
        m.jour ? `${m.jour.bonnes}/6` : '—'),
      h('td', {}, h('b', {}, `${m.points} pts`), h('span', { class: 'aide' }, ` · ${m.joues} j`))))));
}

function blocGroupe(g, zone) {
  const corps = h('div', { class: 'groupe-corps' }, h('p', { class: 'message' }, 'Chargement…'));
  const { du, au } = semaine();
  rpc('classement_groupe', { p_code: g.code, p_joueur: idJoueur(), p_du: du, p_au: au })
    .then(cl => {
      if (!cl) { // retiré du groupe entre-temps
        ecrire(CLE_GROUPES, mesGroupesLocaux().filter(x => x.code !== g.code));
        corps.replaceChildren(h('p', { class: 'message' }, 'Vous ne faites plus partie de ce groupe.'));
        return;
      }
      corps.replaceChildren(tableauGroupe(g, cl));
    })
    .catch(() => corps.replaceChildren(h('p', { class: 'message' }, 'Classement indisponible hors connexion.')));
  const inviter = h('details', { class: 'groupe-inviter' }, h('summary', {}, `Inviter dans « ${g.nom} » (code ${g.code})`), inviterGroupe(g));
  return h('section', { class: 'groupe', 'data-code': g.code },
    h('div', { class: 'groupe-tete' },
      h('h4', {}, g.nom),
      h('button', {
        type: 'button', class: 'btn-lien',
        onclick: async () => {
          if (!confirm(`Quitter le groupe « ${g.nom} » ?`)) return;
          try { await rpc('quitter_groupe', { p_code: g.code, p_joueur: idJoueur() }); } catch { /* hors connexion : on l'oublie quand même */ }
          ecrire(CLE_GROUPES, mesGroupesLocaux().filter(x => x.code !== g.code));
          remplirGroupes(zone);
        },
      }, 'Quitter')),
    corps, inviter);
}

function demanderPrenom(form) {
  const pseudo = form.pseudo.value.trim();
  if (!pseudo) { form.pseudo.focus(); return null; }
  ecrire(CLE_NOM, pseudo);
  return pseudo;
}

function champPrenom() {
  return h('label', { class: 'champ' }, 'Votre prénom (visible des membres du groupe)',
    h('input', { type: 'text', name: 'pseudo', maxlength: 20, value: nomJoueur(), placeholder: 'Prénom', required: true }));
}

function blocInvitationGroupe(code) {
  const info = h('p', { class: 'message', 'aria-live': 'polite' });
  return h('form', {
    class: 'formulaire invitation-groupe',
    onsubmit: async ev => {
      ev.preventDefault();
      const pseudo = demanderPrenom(ev.target);
      if (!pseudo) return;
      try {
        const g = await rpc('rejoindre_groupe', { p_code: code, p_joueur: idJoueur(), p_pseudo: pseudo });
        if (!g) { info.textContent = 'Ce groupe n\'existe plus.'; return; }
        ecrire(CLE_GROUPES, [...mesGroupesLocaux().filter(x => x.code !== g.code), g]);
        sessionStorage.removeItem('trivial1000.groupe.invite');
        rendreJour();
      } catch { info.textContent = 'Connexion impossible. Réessayez avec internet.'; }
    },
  },
    h('fieldset', {},
      h('legend', {}, 'Invitation à un groupe d\'amis'),
      h('p', {}, `On vous invite à rejoindre le groupe ${code} : chaque jour la même carte, et le classement de la semaine entre vous.`),
      champPrenom(),
      h('div', { class: 'actions' },
        h('button', { type: 'submit', class: 'btn' }, 'Rejoindre le groupe'),
        h('button', { type: 'button', class: 'btn btn-clair', onclick: () => { sessionStorage.removeItem('trivial1000.groupe.invite'); rendreJour(); } }, 'Non merci')),
      info));
}

function formulaireNouveauGroupe(zone) {
  const info = h('p', { class: 'message', 'aria-live': 'polite' });
  return h('details', { class: 'nouveau-groupe' },
    h('summary', {}, mesGroupesLocaux().length ? '+ Créer un autre groupe' : '+ Créer un groupe d\'amis'),
    h('form', {
      class: 'formulaire',
      onsubmit: async ev => {
        ev.preventDefault();
        const f = ev.target;
        const pseudo = demanderPrenom(f);
        const nom = f.nomGroupe.value.trim();
        if (!pseudo || !nom) return;
        try {
          const g = await rpc('creer_groupe', { p_nom: nom, p_joueur: idJoueur(), p_pseudo: pseudo });
          ecrire(CLE_GROUPES, [...mesGroupesLocaux(), g]);
          remplirGroupes(zone, g.code);
        } catch { info.textContent = 'Connexion impossible. Réessayez avec internet.'; }
      },
    },
      h('label', { class: 'champ' }, 'Nom du groupe',
        h('input', { type: 'text', name: 'nomGroupe', maxlength: 40, placeholder: 'La famille, Les collègues…', required: true })),
      champPrenom(),
      h('button', { type: 'submit', class: 'btn' }, 'Créer le groupe'),
      info));
}

function blocGroupes() {
  const zone = h('div', { class: 'groupes' });
  remplirGroupes(zone);
  // Le serveur fait foi : récupère les groupes rejoints depuis un autre écran ou effacés.
  rpc('mes_groupes', { p_joueur: idJoueur() }).then(liste => {
    const avant = JSON.stringify(mesGroupesLocaux().map(g => g.code).sort());
    ecrire(CLE_GROUPES, liste.map(({ code, nom }) => ({ code, nom })));
    if (JSON.stringify(liste.map(g => g.code).sort()) !== avant) remplirGroupes(zone);
  }).catch(() => {});
  return zone;
}

function remplirGroupes(zone, nouveau) {
  const groupes = mesGroupesLocaux();
  zone.replaceChildren(
    h('h3', {}, 'Entre amis'),
    groupes.length ? null : h('p', { class: 'aide' }, 'Créez un groupe, invitez vos amis ou votre famille : chacun joue la carte du jour de son côté, et vous voyez le classement de la semaine.'),
    ...groupes.map(g => blocGroupe(g, zone)),
    formulaireNouveauGroupe(zone));
  if (nouveau) {
    const d = zone.querySelector(`.groupe[data-code="${nouveau}"] .groupe-inviter`);
    if (d) d.open = true;
  }
}

/* ---------------- Rappel quotidien ---------------- */

const pushPossible = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
const surIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const installee = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

function deB64(texte) {
  const b = atob(texte.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((texte.length + 3) % 4));
  return Uint8Array.from(b, c => c.charCodeAt(0));
}

async function abonnementPush() {
  const reg = await navigator.serviceWorker.ready;
  return reg.pushManager.getSubscription();
}

async function activerRappel(heure, { confirmer = true } = {}) {
  if (await Notification.requestPermission() !== 'granted') throw new Error('refus');
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription()
    || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: deB64(VAPID_PUBLIQUE) });
  const cles = sub.toJSON().keys;
  await rpc('s_abonner', { p_endpoint: sub.endpoint, p_p256dh: cles.p256dh, p_auth: cles.auth, p_heure: heure, p_joueur: idJoueur() });
  ecrire(CLE_RAPPEL, { heure, endpoint: sub.endpoint });
  if (!confirmer) return;
  // Notification de confirmation : prouve que tout fonctionne de bout en bout.
  fetch(`${SUPABASE_URL}/functions/v1/rappels`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ essai: sub.endpoint }),
  }).catch(() => {});
}

async function desactiverRappel() {
  const r = lire(CLE_RAPPEL, null);
  const sub = await abonnementPush().catch(() => null);
  const endpoint = (sub && sub.endpoint) || (r && r.endpoint);
  if (endpoint) await rpc('se_desabonner', { p_endpoint: endpoint }).catch(() => {});
  if (sub) await sub.unsubscribe().catch(() => {});
  effacer(CLE_RAPPEL);
}

function choixHeure(valeur) {
  return h('select', { name: 'heure', 'aria-label': 'Heure du rappel' },
    Array.from({ length: 17 }, (_, i) => i + 6).map(hh =>
      h('option', { value: hh, selected: hh === valeur ? true : null }, `${hh} h`)));
}

function lienGoogleAgenda(heure) {
  const d = new Date();
  if (d.getHours() >= heure) d.setDate(d.getDate() + 1);
  const pad = x => String(x).padStart(2, '0');
  const jour = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
  const p = new URLSearchParams({
    action: 'TEMPLATE',
    text: '🎯 Culture Gé : carte du jour',
    details: `Six questions, une par couleur : la même carte pour tout le monde.\n${URL_JEU}?jour`,
    dates: `${jour}T${pad(heure)}0000/${jour}T${pad(heure)}1000`,
    recur: 'RRULE:FREQ=DAILY',
    ctz: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Paris',
  });
  return `https://calendar.google.com/calendar/render?${p}`;
}

function blocRappel() {
  const zone = h('div', { class: 'rappel' });
  remplirRappel(zone);
  return zone;
}

function remplirRappel(zone) {
  const r = lire(CLE_RAPPEL, null);
  const info = h('p', { class: 'message', 'aria-live': 'polite' });
  const heure = r ? r.heure : HEURE_RAPPEL_DEFAUT;
  const select = choixHeure(heure);
  const blocs = [h('h3', {}, '🔔 Rappel quotidien')];

  if (!pushPossible() || (surIOS() && !installee())) {
    blocs.push(h('p', { class: 'aide' }, surIOS()
      ? 'Sur iPhone, les notifications demandent d\'installer l\'appli : bouton Partager ⎋ puis « Sur l\'écran d\'accueil ». Ouvrez ensuite l\'appli installée pour activer le rappel. En attendant, ajoutez un rappel à votre agenda :'
      : 'Ce navigateur ne sait pas recevoir de notifications. Ajoutez plutôt un rappel à votre agenda :'));
    if (surIOS()) blocs.push(blocCodeAvantInstallation());
  } else if (Notification.permission === 'denied') {
    blocs.push(h('p', { class: 'aide' }, 'Les notifications sont bloquées pour ce site. Autorisez-les dans les réglages du navigateur, ou ajoutez un rappel à votre agenda :'));
  } else if (r) {
    select.addEventListener('change', async () => {
      try { await activerRappel(Number(select.value)); remplirRappel(zone); } catch { info.textContent = 'Impossible de changer l\'heure sans connexion.'; }
    });
    blocs.push(
      h('p', {}, '✅ Une notification vous prévient chaque jour à ', select, ' quand la nouvelle carte est prête (sauf si vous l\'avez déjà jouée).'),
      h('button', {
        type: 'button', class: 'btn-lien',
        onclick: async () => { await desactiverRappel(); remplirRappel(zone); },
      }, 'Désactiver les notifications'), info);
  } else {
    blocs.push(
      h('p', {}, 'Recevez une notification chaque jour à ', select, ' pour ne pas casser votre série.'),
      h('button', {
        type: 'button', class: 'btn',
        onclick: async ev => {
          ev.target.disabled = true;
          info.textContent = 'Activation…';
          try {
            await activerRappel(Number(select.value));
            remplirRappel(zone);
          } catch (err) {
            ev.target.disabled = false;
            info.textContent = err.message === 'refus'
              ? 'Notifications refusées. Vous pouvez les autoriser dans les réglages du navigateur.'
              : 'Activation impossible : vérifiez votre connexion et réessayez.';
          }
        },
      }, 'Activer les notifications'), info);
  }

  const heureAgenda = () => Number(select.value) || HEURE_RAPPEL_DEFAUT;
  const google = h('a', { class: 'lien-partage', target: '_blank', rel: 'noopener', href: lienGoogleAgenda(heureAgenda()) }, 'Google Agenda');
  const ics = h('a', { class: 'lien-partage', href: `rappels/${String(heureAgenda()).padStart(2, '0')}h.ics` }, 'iPhone, Outlook… (.ics)');
  select.addEventListener('change', () => {
    google.href = lienGoogleAgenda(heureAgenda());
    ics.href = `rappels/${String(heureAgenda()).padStart(2, '0')}h.ics`;
  });
  blocs.push(h('details', { class: 'rappel-agenda', open: !pushPossible() || (surIOS() && !installee()) ? true : null },
    h('summary', {}, '📅 Ajouter un rappel à mon agenda'),
    h('p', { class: 'aide' }, 'Un rendez-vous quotidien avec le lien de la carte du jour, à l\'heure choisie ci-dessus.'),
    h('div', { class: 'partage-liens' }, google, ics)));
  zone.replaceChildren(...blocs);
}

/* ---------------- Démarrage ---------------- */

function initQuotidien() {
  const params = new URLSearchParams(location.search);
  if (params.has('groupe')) sessionStorage.setItem('trivial1000.groupe.invite', params.get('groupe').toUpperCase().slice(0, 6));
  ecrireCookieJoueur(idJoueur()); // prolonge le cookie
  initProfil();
  rattraperPublication();
  window.addEventListener('online', rattraperPublication);
  reprendreAncienneAdresse().catch(() => {}).then(() => {
    // L'abonnement a pu être retiré par le navigateur : on oublie l'état local.
    if (pushPossible() && lire(CLE_RAPPEL, null)) {
      abonnementPush().then(sub => { if (!sub) effacer(CLE_RAPPEL); }).catch(() => {});
    }
  });
}

/* Le jeu était publié à …/trivialpursuit/ : le navigateur y garde un service worker qui reçoit
 * les rappels. Le stockage est commun (même origine) ; on reprend ici l'abonnement aux rappels
 * et on retire l'ancien service worker. */
async function reprendreAncienneAdresse() {
  if (!('serviceWorker' in navigator) || !navigator.serviceWorker.getRegistrations) return;
  const regs = await navigator.serviceWorker.getRegistrations();
  for (const reg of regs) {
    if (!/\/trivialpursuit\/$/.test(reg.scope)) continue;
    const sub = reg.pushManager ? await reg.pushManager.getSubscription().catch(() => null) : null;
    if (sub) {
      await rpc('se_desabonner', { p_endpoint: sub.endpoint }).catch(() => {});
      await sub.unsubscribe().catch(() => {});
    }
    await reg.unregister().catch(() => {});
    const r = lire(CLE_RAPPEL, null);
    if (sub && r && pushPossible() && Notification.permission === 'granted') {
      await activerRappel(r.heure, { confirmer: false }).catch(() => {});
    }
  }
}

function invitationGroupeEnAttente() {
  const code = sessionStorage.getItem('trivial1000.groupe.invite');
  if (!code) return null;
  if (mesGroupesLocaux().some(g => g.code === code)) { sessionStorage.removeItem('trivial1000.groupe.invite'); return null; }
  return blocInvitationGroupe(code);
}
