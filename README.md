# Échiquier 3D

Un jeu d'échecs en 3D dans le navigateur, construit avec [Three.js](https://threejs.org/).
Les pièces et les plateaux sont entièrement générés par le code : aucune image ni aucun modèle 3D externe.

> **Exemple d'instance en ligne : https://echecs.news-analytics.info**
> Ouvrez l'adresse, cliquez **🌐 Jouer à deux en ligne**, puis envoyez l'URL d'invitation à votre adversaire.
> ⚠️ Ce serveur tourne sur un ordinateur personnel, à la maison : il peut être hors ligne à tout moment. Pour jouer sans dépendre de lui, ouvrez simplement `index.html` (jeu solo) ou lancez votre propre serveur (voir plus bas).

## Lancer le jeu

Ouvrez simplement `index.html` dans un navigateur récent (Chrome, Edge, Firefox).
Aucun serveur ni installation n'est nécessaire.

Une connexion Internet est requise au premier chargement : Three.js (v0.160.0) est chargé depuis le CDN jsDelivr.

## Serveur et parties en ligne

Pour jouer à deux sur deux appareils, lancez le serveur Node.js (Node 22.9 ou plus) :

```
npm install            # une seule fois
npm run build:admin    # compile la page d'administration (Svelte), si vous l'utilisez
npm start              # http://localhost:8080   (autre port : PORT=3000 npm start ; lit .env)
```

### Développement (recompilation automatique)

```
npm run dev
```

- **Jeu** : http://localhost:8090. Le serveur redémarre seul quand un fichier de `server/` change.
- **Administration** : http://localhost:5173/admin/, servie par Vite. Chaque modification de `admin/src` s'affiche aussitôt, sans recharger la page.
- Vite transmet l'API, le WebSocket et le jeu au serveur de jeu, et les variables de `.env` sont chargées.
- Le port 8090 évite le conflit avec le conteneur Docker, qui occupe le 8080. Pour un autre port : `DEV_PORT=…`.

Le serveur (`server/server.js`) sert les fichiers du jeu et un WebSocket (`/ws`) pour les parties en ligne.
Seuls `index.html`, `js/`, `css/`, `sounds/` et `README.md` sont publiés.

### Avec Docker (recommandé pour exposer le site)

```
docker compose up -d --build   # http://localhost:8080
docker compose logs -f         # journaux
docker compose down            # arrêt
```

Le conteneur est verrouillé pour qu'une faille éventuelle du serveur n'atteigne pas le système hôte :

- **Image distroless** : Node seul, sans shell ni gestionnaire de paquets ni outils système.
- **Utilisateur sans privilège** (uid 65532), aucune capacité Linux (`cap_drop: ALL`), `no-new-privileges`.
- **Système de fichiers en lecture seule** ; seul un `/tmp` de 8 Mo, non exécutable, est inscriptible.
- **Ressources bornées** : 256 Mo de mémoire, 1 processeur, 64 processus.
- **Port publié sur `127.0.0.1` seulement** : le jeu n'est joignable de l'extérieur que par le tunnel Cloudflare (voir plus bas).

Le serveur applique aussi des limites anti-abus :

- 500 salles ouvertes au maximum ;
- 10 connexions par adresse ;
- 20 messages par seconde par connexion ;
- une seule partie par connexion ;
- fermeture des connexions mortes ;
- en-têtes de sécurité HTTP.

Variables d'environnement :

| Variable | Rôle |
|---|---|
| `PORT` | Port d'écoute. |
| `HOST` | Adresse d'écoute. |
| `SHOW_LAN=0` | N'annonce pas l'adresse du réseau local. |
| `TRUST_PROXY=cloudflare` | Lit l'adresse réelle du visiteur dans `CF-Connecting-IP`. Réglage par défaut du compose. |
| `TRUST_PROXY=1` | Lit l'adresse du visiteur dans `X-Forwarded-For`, pour un autre proxy (Caddy, nginx…). |
| `MAX_ROOMS` | Nombre maximal de salles ouvertes. |
| `MAX_CONN_PER_IP` | Nombre maximal de connexions par adresse. |
| `ADMIN_PASSWORD` | Mot de passe de la page d'administration (12 caractères au moins). Vide : administration désactivée. Lu dans `.env`. |

### Publier sur le web (Cloudflare Tunnel)

Le site est publié sur l'adresse de votre choix (un sous-domaine d'un domaine géré par votre compte Cloudflare) par un second conteneur, `tunnel` (image officielle `cloudflare/cloudflared`).

- Il ouvre une connexion **sortante** vers Cloudflare et transmet les visites au jeu par le réseau Docker interne.
- Aucun port n'est ouvert sur la machine ni sur le routeur. HTTPS et WebSocket (`wss://`) sont gérés par Cloudflare.
- Il est verrouillé comme le jeu : lecture seule, aucune capacité, `no-new-privileges`, mémoire limitée.
- Il n'accède qu'à ses identifiants, en lecture seule.

```
cp .env.example .env     # une seule fois : indiquez votre adresse (PUBLIC_HOSTNAME)
scripts/web.sh publish   # une seule fois : crée le tunnel et le DNS, puis démarre le projet
docker compose up -d     # ensuite : chaque démarrage du projet publie le site
docker compose down      # arrêt : le site public est retiré
scripts/web.sh status    # état des conteneurs, du tunnel et du site
scripts/web.sh stop      # retire le site public, le jeu local continue
scripts/web.sh logs      # journaux du tunnel
```

- **Prérequis** : `cloudflared` installé et connecté au compte (`cloudflared tunnel login`, qui crée `~/.cloudflared/cert.pem`). Le script ignore `~/.cloudflared/config.yml`.
- **Identifiants** : la configuration et les identifiants du tunnel sont écrits dans `deploy/cloudflared/` (mode 600, hors Git).
- **Configuration** : `.env` (hors Git, modèle `.env.example`) contient `PUBLIC_HOSTNAME` (adresse publique) et `TUNNEL_NAME` (nom du tunnel, `echecs` par défaut). Une variable passée sur la ligne de commande l'emporte : `PUBLIC_HOSTNAME=autre.domaine.com scripts/web.sh publish`.
- **Disponibilité** : le site n'est en ligne que lorsque WSL et Docker tournent.
- **Suppression définitive** : supprimez l'enregistrement DNS dans le tableau de bord Cloudflare, puis le tunnel (`cloudflared tunnel delete <TUNNEL_NAME>`).

### Jouer en ligne

1. Le joueur 1 clique **🌐 Jouer à deux en ligne** (écran d'accueil) ou **🌐 Nouvelle partie multijoueur** (panneau Contrôles), puis entre son nom : il joue les Blancs.
2. Une URL unique s'affiche, avec **Copier l'URL**. Ouvert en `localhost`, le jeu propose l'adresse du réseau local, utilisable depuis un autre appareil.
3. Le joueur 2 ouvre l'URL : la connexion s'établit et il entre son nom. Le joueur 1 voit ce nom apparaître à chaque touche.
4. Le joueur 2 clique **Jouer** : la partie démarre chez les deux, sans rotation, chacun voyant le plateau de son côté.

Pendant une partie en ligne, chacun ne joue que ses pièces, à son tour. Le placement libre et l'annulation sont désactivés, et un bandeau indique qui joue et à qui c'est le tour. Si un joueur quitte (page fermée, connexion perdue), l'autre en est informé immédiatement par un encart, avant ou pendant la partie, et peut continuer en solo.

- **Nouvelle partie** en ligne ne déconnecte personne : le second joueur reçoit une demande à **Accepter** ou **Refuser**. Acceptée, les pièces se remettent en place chez les deux (mêmes couleurs) ; refusée, la partie continue.
- **Pièces et plateau partagés** : au départ, l'invité adopte les choix de l'hôte ; ensuite, un changement de pièces ou de plateau par l'un s'applique chez l'autre. Les préférences mémorisées de chacun ne sont pas écrasées.
- **Pendule partagée** : le serveur fait foi (temps écoulé, incrément, chute du drapeau au même instant pour les deux). La cadence est choisie par le joueur 1 ; pas de pause en ligne.
- **💬 Messagerie** (barre de menu, visible quand les deux joueurs sont connectés) : discussion entre les joueurs, avec un compteur de messages non lus. Un message reçu panneau fermé fait pulser le bouton (deux fois), et la notification revient toutes les 30 secondes tant qu'il n'est pas lu.

### Administration

La page **`/admin/`** (par exemple http://localhost:8080/admin/) est protégée par le mot de passe `ADMIN_PASSWORD` de `.env`. Elle montre en temps réel :

- **Statistiques** : connexions (et pic), parties en ligne, parties solo, salles en attente, spectateurs, durée de fonctionnement et mémoire du serveur.
- **Parties** :
  - état (en attente, invité connecté, en cours, abandonnée) et joueurs, avec leur connexion ;
  - pendules qui tournent en direct, nombre de coups et dernier coup, durée, pièces et plateau ;
  - un **mini-échiquier** de la position actuelle ;
  - les **parties solo** aussi : un joueur seul sur le jeu servi par le serveur envoie sa position à chaque changement (placement libre et annulations compris). Les parties ouvertes depuis le disque (`file://`) restent invisibles.
- **Connexions** : rôle, nom, partie, adresse, navigateur, durée et nombre de messages.

**Cliquer sur une partie** (ou sur une connexion liée à une partie) ouvre le jeu en **mode spectateur** dans un nouvel onglet :

- la position actuelle est reconstituée, puis chaque coup, la pendule et les changements de pièces arrivent en direct ;
- le spectateur ne peut rien jouer ;
- **caméra** : la barre « Caméra » propose *Vue libre* ou la vue exacte de chaque joueur (♔ Blancs, ♚ Noirs, ou *Joueur* en solo), suivie en douceur. *Montrer les caméras* affiche dans la scène l'emplacement de chaque caméra (ivoire, noire) et la direction de son regard. Les joueurs n'envoient leur caméra que lorsque quelqu'un regarde ;
- les joueurs voient « 👁 1 spectateur » dans leur bandeau (en solo : « 1 spectateur regarde votre partie ») ;
- la messagerie reste privée entre les joueurs.

Sécurité :

- Comparaison du mot de passe en temps constant. Après 5 échecs, l'adresse est bloquée 15 minutes.
- Session aléatoire dans un cookie `HttpOnly`, `SameSite=Strict`, `Secure` en HTTPS, valable 12 heures.
- Requêtes et WebSocket acceptés seulement depuis la page elle-même (même origine).
- La page n'autorise aucun script externe (`Content-Security-Policy`).
- Le mode spectateur exige une session d'administration ouverte.
- Sans `ADMIN_PASSWORD`, toutes les adresses `/admin` répondent 404.

La page est écrite en **Svelte 5** (`admin/src`) et compilée par **Vite** dans `admin/dist`, hors Git. L'image Docker la compile elle-même, et l'image finale ne contient ni Svelte ni Vite.

## Fonctionnalités

### Deux modes de jeu

- **Partie** : seuls les coups légaux sont acceptés. Échec, échec et mat, pat, roque, prise en passant et promotion (choix de la pièce) sont gérés.
- **Placement libre** : n'importe quelle pièce peut aller sur n'importe quelle case ; déposée sur une autre pièce, celle-ci sort du jeu. On peut retirer une pièce en la déposant hors du plateau, la reprendre depuis la réserve, vider le plateau ou changer le trait.

### Interaction

- Cliquez sur une pièce puis sur une case, ou glissez-déposez-la.
- Les coups possibles s'affichent : un point pour une case vide, un anneau pour une prise.
- Les pièces bougent avec un effet « gelée » : elles se soulèvent en douceur, penchent selon leur vitesse puis oscillent avant de revenir droites. Le balancement pivote autour du point où la pièce a été attrapée.
- **↶ Annuler** revient en arrière, coup par coup (dans les deux modes).
- **🔍 Visualiser** (actif quand une pièce est sélectionnée) ouvre une fenêtre pour admirer la pièce sous tous les angles, avec sa règle de déplacement.

### Son

- **Pièces** : vrais enregistrements de pièces d'échecs posées sur un échiquier (JJTaynos, Freesound, CC0), dans `sounds/pieces/`. Un coup est tiré au hasard à chaque pose, avec une légère variation de hauteur. La capture, le roque et la nouvelle partie combinent plusieurs coups.
- **Autres sons** (synthétisés en direct, Web Audio) : prise en main, échec, promotion, mat, pat, coup refusé, annulation, boutons et listes déroulantes.

Le bouton **🔊 Son** coupe ou rétablit le son (choix mémorisé).

### Musique d'ambiance

20 morceaux libres de droits (CC0) dans `sounds/musique/` : fantasy médiéval, médiéval de taverne et ambiances calmes.
La musique est activée par défaut : elle démarre dès l'ouverture si le navigateur l'autorise, sinon au premier clic, toujours par « Calm Piano » (cynicmusic), puis choisit les morceaux au hasard (jamais deux fois de suite le même), monte en douceur jusqu'au volume choisi en 10 secondes puis enchaîne sur un autre morceau.
**🎵 Musique** l'active ou la coupe, **⏭** passe au morceau suivant et le curseur règle le volume (0 à 100 %, 6 % par défaut). Ces choix sont mémorisés.
Les sources et auteurs sont listés dans `sounds/ecouter.html`, qui permet aussi d'écouter chaque morceau.

### Pendule

Le panneau **⏱ Pendule** propose les cadences officielles (bullet, blitz, rapide, classique FIDE 90 min + 30 s), avec ou sans incrément Fischer. Seule la pendule du camp au trait tourne ; elle démarre après le premier coup des Blancs. Au temps écoulé, le joueur perd, sauf si l'adversaire n'a plus de quoi mater (roi seul, ou roi et un fou ou un cavalier) : partie nulle. Pause et réinitialisation disponibles ; la pendule s'arrête en placement libre. Par défaut : *Sans pendule*.

### Journal des déplacements

Le panneau de droite liste chaque coup en notation algébrique avec figurines (♘f3, exd5, O-O, e8=♕, +, #).
Sous chaque coup, une ligne indique la pièce jouée et son trajet (« Cavalier g1 → f3 × Pion »). Le bouton **Copier** copie la liste.

### Thèmes

| Sélecteur | Choix |
|---|---|
| **Pièces** | *Médiéval* (personnages : fantassin, tour de guet avec arbalétrier, chevalier à cheval, évêque, reine, roi) · *Dragons* (par défaut ; dragonnet sortant de l'œuf, dragon enroulé autour d'une tour, wyverne, mage draconique, dragonne royale, roi dragon sur son trésor ; ivoire et or contre obsidienne et braise) · *Classique* (style Staunton en buis et ébène) · *Cristal* (les pièces classiques en verre, avec réfraction réelle du plateau : verre dépoli blanc laiteux contre verre fumé noir et brillant, pour bien distinguer les camps) |
| **Plateau** | *Verre noir* (par défaut ; verre fumé noir et opalin, vrais reflets des pièces, filets dorés, cadre laqué) · *Bois clair* |

Les choix de thème et la position des panneaux sont mémorisés dans le navigateur. En partie en ligne, pièces et plateau sont partagés (voir plus haut).

### Barre de menu et panneau Debug

La barre en haut de l'écran affiche ou masque les cinq panneaux : **🎛 Contrôles** (sections Partie, Caméra, Audio), **🎨 Graphismes** (thème des pièces, plateau, anticrénelage), **📜 Déplacements**, **⏱ Pendule** et **🐞 Debug** (tous fermés par défaut, choix mémorisé).
Le panneau Debug (masqué par défaut) montre en direct la caméra (position, cible, distance, azimut, inclinaison, champ de vision, rotation), le rendu (images/s, appels de dessin, triangles, mémoire), l'écran et l'état du jeu (thèmes, mode, sélection, case sous la souris, musique). **Copier la caméra** copie sa position et sa cible en JSON.

### Anticrénelage

Le sélecteur **Anticrénelage** (panneau Graphismes) propose : *Natif* (lissage du navigateur, par défaut), *Désactivé*, *FXAA*, *SMAA*, *MSAA ×4*, *MSAA ×8* et *Suréchantillonnage ×2*, du moins coûteux au plus net. Le choix est mémorisé.

### Caméra et interface

- Glisser dans le vide : tourner · molette : zoomer · clic droit : déplacer.
- À l'ouverture, l'écran d'accueil affiche le logo (roi Staunton doré en image vectorielle et titre « Échiquier » en lettres classiques) et propose **Jouer** : ce clic lance la musique, puis l'image apparaît en fondu depuis le noir (5 s). La rotation automatique reste arrêtée tant qu'on est sur l'accueil.
- **Accueil** (premier bouton de la barre de menu, avec le petit logo) : une confirmation « Quitter la partie ? » évite de perdre la partie par erreur (**Continuer la partie** ou **Quitter la partie** ; Échap ou un clic à côté annule). En quittant, le plateau est remis au départ, la caméra revient à la vue initiale et l'accueil réapparaît : **Jouer** y démarre une nouvelle partie. En ligne, quitter met fin à la partie et l'adversaire en est informé.
- Boutons **Vue blancs**, **Vue noirs**, **Dessus** (vue de départ : distance 9, inclinaison 69°, caméra à 2,83 de hauteur ; réglable via `START_VIEW` dans `js/scene.js`) et **⟳ Rotation** automatique : active par défaut, elle démarre en douceur, se met en pause pendant qu'on fait glisser une pièce, et sa vitesse se règle avec un curseur (6 % par défaut, mémorisé).
- Les panneaux se déplacent en les tirant par leur barre de titre.

## Structure du projet

```
index.html        page, panneaux, chargement de Three.js et des scripts
css/style.css     mise en forme
js/scene.js       rendu, caméra, lumières, plateau, coordonnées, sol
js/antialias.js   modes d'anticrénelage (post-traitement)
js/boards.js      thèmes de plateau (Bois clair, Verre noir)
js/pieces.js      pièces classiques, bois généré, système de thèmes de pièces
js/medieval.js    thème Médiéval (les six personnages)
js/dragons.js     thème Dragons (les six sculptures draconiques)
js/crystal.js     thème Cristal (pièces classiques en verre transparent)
js/rules.js       moteur de règles (indépendant de la 3D)
js/notation.js    notation des coups et noms des pièces
js/panels.js      panneaux déplaçables
js/sound.js       sons du jeu (coups enregistrés + sons synthétisés)
js/music.js       musique d'ambiance aléatoire avec montée du volume
sounds/           coups de pièces et musiques (CC0), page d'écoute ecouter.html
js/viewer.js      visualiseur de pièce
js/debug.js       panneau Debug et barre de menu des panneaux
js/online.js      parties en ligne (WebSocket)
js/endgame.js     fin de partie (encart, caméra vers le roi gagnant)
server/server.js  serveur Node : fichiers statiques et WebSocket
server/admin.js   administration : mot de passe, sessions, flux en temps réel
admin/            page d'administration (Svelte 5 + Vite) ; compilée dans admin/dist
scripts/dev.mjs   mode développement (serveur relancé à chaque modification + Vite en direct)
Dockerfile        image du serveur (distroless, utilisateur sans privilège)
docker-compose.yml conteneurs du jeu et du tunnel Cloudflare (verrouillés)
scripts/web.sh    publication sur le web par Cloudflare Tunnel
.env.example      modèle de configuration (adresse publique) ; copie locale .env hors Git
js/clock.js       pendule d'échecs (cadences, incrément, temps écoulé)
js/main.js        état du jeu, animations, interactions, interface, journal
```

### Pourquoi des scripts classiques et non des modules ES ?

Les navigateurs bloquent les modules JavaScript locaux quand la page est ouverte depuis le disque (`file://`).
`index.html` importe donc Three.js comme module, l'expose sur `window`, puis charge les fichiers de `js/` dans l'ordre comme scripts classiques. Ils partagent la même portée globale : deux fichiers ne doivent pas déclarer le même nom au premier niveau.

Pour ajouter un fichier, insérez son nom à la bonne place dans le tableau `FILES` de `index.html`.

### Chargement à la demande

Seul le nécessaire est téléchargé à l'ouverture :

- **Thèmes de pièces** : seul le thème mémorisé (Dragons par défaut) est chargé ; les autres fichiers (`medieval.js`, `crystal.js`…) le sont au premier choix dans le sélecteur.
- **Anticrénelage** : les modules de post-traitement de Three.js (FXAA, SMAA…) ne sont chargés que si l'on choisit un de ces modes.
- **Musique** : un seul morceau est téléchargé à la fois, celui qui joue ; passer au suivant interrompt le téléchargement du précédent.
- **Cache** : le serveur inscrit dans `index.html` une empreinte du code (`js/`, `css/`), ajoutée en `?v=…` à l'adresse de chaque fichier. Les fichiers restent en cache un an (navigateur et Cloudflare), et une mise à jour change leur adresse : jamais d'ancienne version. La page elle-même est revérifiée à chaque visite, le texte est compressé en gzip et les sons sont gardés une semaine. Ouvert depuis le disque, la dernière version est toujours relue.

## Ajouter un thème de pièces

Créez `js/mon-theme.js` et déclarez-le dans `THEME_FILES` (`js/pieces.js`) : `'mon-theme': 'Mon thème'`. Il sera chargé à la demande. Dans ce fichier, appelez `registerTheme` :

```js
registerTheme('mon-theme', {
  name: 'Mon thème',
  materials: white => ({ body: white ? whiteMat : blackMat, metal: /* … */ }),
  builders: { p: makeMonPion /* , r, n, b, q, k */ },
  titles: { p: 'Mon pion' },  // facultatif, affiché dans le visualiseur
});
```

- Chaque constructeur renvoie un `THREE.Group`. Le personnage regarde vers `+z`, et ses unités sont celles des pièces classiques (réduites ensuite par `PIECE_SCALE`).
- Chaque maillage peut porter un rôle de matériau (`mesh.userData.role = 'metal'`). Sans rôle, il prend le matériau `body`.
- Un type absent du thème, ou dont la construction échoue, utilise automatiquement le modèle classique.

## Moteur de règles

`js/rules.js` ne dépend pas de Three.js.
Il a été validé par des tests *perft* (comptage exhaustif des coups possibles) sur quatre positions de référence, dont « Kiwipete », qui couvre le roque, la prise en passant et la promotion.

## Crédits

- **Yanik Lupien** — conception et direction artistique
- **Claude (Anthropic)** — programmation et modélisation 3D
- Musiques (CC0, OpenGameArt) : cynicmusic, Umplix, RandomMind, Yoiyami, Écrivain, Tarush Singhal, bobjt, Stereoscopic
- Sons de pièces (CC0, Freesound) : JJTaynos
- Moteur 3D : [Three.js](https://threejs.org/)
