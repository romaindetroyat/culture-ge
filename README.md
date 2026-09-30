# Culture Gé

Jeu de culture générale : **1833 cartes de 6 questions** (base de 1000 cartes + extension de 833), soit près de 11 000 questions en français,
dans une application web progressive (PWA) installable sur téléphone et utilisable hors ligne.

| Couleur | Catégorie |
|---|---|
| 🔵 Bleu | Géographie |
| 🩷 Rose | Divertissement |
| 🟡 Jaune | Histoire |
| 🟤 Marron | Arts & Littérature |
| 🟢 Vert | Sciences & Nature |
| 🟠 Orange | Sports & Loisirs |

## Ce que fait l'application

- **Carte du jour** : chaque jour, la même carte de 6 questions pour tout le monde, jouable une seule
  fois. Série de jours consécutifs, statistiques, et partage du résultat façon Wordle (lien `?jour`).
  - **Classement du jour** : « vous faites mieux que 72 % des joueurs du jour » et répartition des
    scores (scores anonymes, envoyés une fois la carte jouée, ou dès le retour de la connexion).
  - **Entre amis** : un groupe (code de 6 lettres, lien `?groupe=…` à partager) affiche le score du
    jour de chacun et le classement de la semaine (lundi à dimanche). Le prénom n'est visible que des
    membres du groupe.
  - **Rappel quotidien** : notification chaque jour à l'heure choisie (sauf si la carte est déjà
    jouée), avec la série en cours. Sur iPhone, il faut avoir installé l'appli sur l'écran d'accueil.
    Autre possibilité : un rendez-vous quotidien dans Google Agenda ou tout agenda (fichiers
    `rappels/HHh.ics`, générés par `scripts/rappels_ics.py`).
- **Piocher une carte** : pour jouer avec un vrai plateau. Le paquet est mélangé et aucune carte
  ne ressort avant d'avoir vu toutes les autres. On peut piocher dans tout le paquet, ou seulement
  dans la base ou l'extension. Touchez une question pour voir sa réponse.
- **Solo** : séries de 10, 20 ou 30 questions, ou mode survie (fin à la 3e erreur), sur toutes les
  catégories ou une seule. Une bonne réponse rapporte 1, 2 ou 3 points selon la difficulté, plus 1 point
  de bonus à partir de 3 bonnes réponses d'affilée. Le record de chaque réglage est conservé, et l'écran
  de fin détaille le score par catégorie et rappelle les réponses manquées. Les questions déjà vues en
  solo ne reviennent qu'une fois toutes les autres épuisées.
  On répond **à voix haute** (reconnaissance vocale du navigateur) ou au clavier ; la réponse est
  comparée à celle attendue avec tolérance (articles, accents, fautes légères, nom de famille seul,
  nombres en lettres ou en chiffres romains, variantes entre parenthèses, mots déjà présents dans la
  question) et aux **autres formulations acceptées** préparées par IA pour chaque question
  (synonymes, graphies, sigles, noms courants). On peut toujours corriger le verdict.
  L'application peut **lire les questions à voix haute** (aussi en partie à plusieurs), et un mode
  **mains libres** enchaîne lecture de la question, écoute de la réponse, verdict et question suivante.
  En fin de série, **Défier un ami** partage un lien (`?defi=…`) qui contient la série exacte : l'ami
  joue les mêmes questions et voit qui l'emporte. Partage par le menu natif du téléphone, WhatsApp,
  Messenger, SMS, Facebook, X, e-mail, copie du lien, ou une image du score.
- **Mon profil** (Réglages) : un code de transfert (`KX7P-2MQH`) retrouve groupes, historique de la
  carte du jour (donc la série), prénom et records dans l'appli installée, un autre navigateur ou un
  nouveau téléphone. Sur iPhone, Safari et l'appli installée ont chacun leur stockage : l'appli
  installée propose de coller ce code à sa première ouverture (et le retrouve seule quand le système
  a copié le cookie du navigateur).
- **Réglages** : prénom affiché dans les défis, choix de la voix de lecture, vitesse. Par défaut,
  la voix **Siwis** lit des fichiers audio préparés pour chaque question et chaque réponse (voir
  *Voix de lecture*) ; les voix du téléphone restent au choix, et servent de secours hors ligne.
- **Partie sans plateau** : 2 à 6 joueurs. Le dé tire une couleur, une bonne réponse rapporte le
  camembert de la couleur et permet de rejouer. Avec les 6 camemberts, les autres joueurs choisissent
  la catégorie de la question finale. Réglages : difficulté des questions, nombre de bonnes
  réponses nécessaires par camembert. La partie est sauvegardée si l'application est fermée.
- **Soirée entre amis** : une partie partagée, chacun sur son téléphone. L'hôte crée la partie et
  obtient un code de 4 lettres (et un lien à envoyer par WhatsApp, SMS…) ; les autres le saisissent
  ou ouvrent le lien, donnent leur prénom et choisissent leur équipe. Deux formules :
  **tour à tour** (le joueur ou l'équipe dont c'est le tour lance le dé et répond, camemberts
  comme au vrai jeu ; l'hôte peut aussi lancer et valider une réponse donnée de vive voix) ou
  **tous ensemble** (même question pour tous, 30 secondes, points selon la difficulté et +1 pour
  la première bonne réponse ; une équipe marque si l'un de ses membres a trouvé). Seul le
  téléphone de l'hôte lit les questions à voix haute. Classement final partageable.
  Il faut une connexion internet : les téléphones communiquent par Supabase Realtime
  (canal éphémère, rien n'est enregistré sur le serveur ; c'est le téléphone de l'hôte qui garde
  la partie et peut la reprendre s'il se recharge). Pour essayer dans un seul navigateur, ouvrez
  plusieurs onglets avec `?reseau=local`.
- **Parcourir** : recherche plein texte (sans accents), filtre par catégorie et difficulté, ou
  saisie d'un numéro de carte.
- **Imprimer** : planches A4 de 6 cartes (95 × 92 mm), recto questions / verso réponses en miroir
  pour une impression recto verso bord long. La taille du texte s'ajuste à chaque carte.

## Organisation

```
app/                 la PWA (fichiers statiques, sans étape de construction)
  index.html, styles.css, app.js
  reponse.js         comparaison tolérante des réponses données en solo
  quotidien.js       classement du jour, groupes d'amis, rappel quotidien
  profil.js          code de transfert et sauvegarde du profil
  soiree.js          soirée entre amis sur plusieurs téléphones
  rappels/*.ics      rendez-vous quotidiens à ajouter à un agenda (un fichier par heure)
  vendor/supabase.js bibliothèque supabase-js (licence MIT, voir supabase-LICENSE)
  cartes.json        toutes les cartes et leurs éditions (généré)
  manifest.webmanifest, sw.js, icons/
data/
  raw/*.json         questions sources par catégorie et sous-thème
  paquet.json        composition figée de chaque carte (identifiants des 6 questions) et éditions
  cartes.csv         toutes les cartes, lisible dans un tableur (généré)
  reserve.json       questions valides non utilisées, pour remplacer une question (généré)
  alias/*.json       par question : autres réponses acceptées ("a") et texte à lire à voix haute ("l")
scripts/build.py     assemble data/raw en cartes équilibrées
scripts/voix.py      produit les fichiers audio de la voix Siwis (dépôt culture-ge-voix)
supabase/            serveur de la carte du jour : tables et fonctions SQL, envoi des rappels (voir son README)
```

Chaque question source a la forme :

```json
{"id": "geo_a_2-017", "q": "Quel fleuve traverse Lyon avant de rejoindre le Rhône ?", "r": "La Saône", "d": 1, "t": "Fleuves"}
```

`d` est la difficulté (1 facile, 2 moyenne, 3 difficile), `t` le sous-thème et `id` un identifiant
stable, ajouté automatiquement par le script s'il manque.

Le paquet est découpé en **éditions** : la base (cartes 1 à 1000) et l'extension (cartes 1001 et
suivantes). Une carte déjà composée ne change jamais de numéro ni de questions : des cartes imprimées
restent valables après une mise à jour.

## Modifier les questions

1. Corrigez, ajoutez ou supprimez des questions dans `data/raw/<catégorie>_*.json`
   (`geo`, `div`, `his`, `art`, `sci`, `spo`).
2. Régénérez les cartes :

   ```sh
   python3 scripts/build.py                                   # garde le paquet tel quel
   python3 scripts/build.py --cartes 2000 --edition "Extension 2"   # ajoute des cartes
   ```

   Le script valide les questions et écarte les doublons, y compris avec les questions déjà
   placées sur une carte. Une question corrigée garde sa place ; une question supprimée est
   remplacée par une question de la réserve de même catégorie. Les nouvelles cartes reprennent
   la répartition de difficulté et sont équilibrées entre elles.
3. Incrémentez `VERSION` dans `app/sw.js` pour que les téléphones récupèrent la mise à jour.
4. Produisez les fichiers audio des textes nouveaux ou modifiés (voir *Voix de lecture*) ; en
   attendant, l'application lit ces textes avec la voix du téléphone.

## Voix de lecture

La voix Siwis (`fr_FR-siwis-medium`, modèle [Piper](https://github.com/rhasspy/piper), licence
CC BY 4.0) est trop lourde pour tourner dans le navigateur : chaque texte lu (question avec sa
catégorie, réponse, phrases de verdict et de fin de série) est synthétisé à l'avance en MP3, et
publié dans le dépôt [culture-ge-voix](https://github.com/romaindetroyat/culture-ge-voix)
(GitHub Pages, publication depuis la branche `main`), à l'adresse
`https://romaindetroyat.github.io/culture-ge-voix/<xx>/<clé>.mp3`. La clé est un hachage du texte,
calculé de la même façon par `scripts/voix.py` et `app/app.js` : un texte modifié change de fichier,
et l'application se rabat sur la voix du téléphone tant que le nouveau fichier n'est pas publié.

Avant la synthèse, le script réécrit ce qu'une voix lit mal : numéros de rois (Louis XIV → Louis
quatorze), siècles et ordinaux (XVIIIe, 38e, 1re), milliers (1 500), unités (km/h, °C, m²),
« av. J.-C. », « M. », « Mme ».

```sh
pip install piper-tts lameenc
python3 scripts/voix.py essai "Le XVIIIe siècle"          # texte réellement prononcé
python3 scripts/voix.py produire ../culture-ge-voix chemin/fr_FR-siwis-medium.onnx
```

`produire` ne génère que les fichiers absents (compter environ 0,2 s par texte).

## Lancer en local

```sh
cd app && python3 -m http.server 8080
```

puis ouvrez <http://localhost:8080>. Un serveur est nécessaire : la page ne fonctionne pas
ouverte directement depuis le disque (`file://`).

## Publier et installer

Le workflow `.github/workflows/pages.yml` publie le dossier `app/` sur GitHub Pages à chaque push
sur `main`, à l'adresse <https://romaindetroyat.github.io/culture-ge/>. Il faut l'activer une fois : **Settings → Pages → Source : GitHub Actions**.

Sur téléphone, ouvrez l'adresse du site puis :
- Android / Chrome : menu ⋮ → **Installer l'application** (ou le bouton sur l'accueil) ;
- iPhone / Safari : bouton Partager → **Sur l'écran d'accueil**.

Après la première ouverture, le jeu fonctionne sans connexion.

---

Projet personnel indépendant, sans lien avec un éditeur de jeux de société.

Le dossier `redirection/` contient le mini-site publié à l'ancienne adresse
(`…/trivialpursuit/`, dépôt `trivialpursuit`) : il renvoie vers la nouvelle en gardant la fin des liens.
