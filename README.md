# Échiquier 3D

Un jeu d'échecs en 3D dans le navigateur, construit avec [Three.js](https://threejs.org/).
Les pièces et les plateaux sont entièrement générés par le code : aucune image ni aucun modèle 3D externe.

## Lancer le jeu

Ouvrez simplement `index.html` dans un navigateur récent (Chrome, Edge, Firefox).
Aucun serveur ni installation n'est nécessaire.

Une connexion Internet est requise au premier chargement : Three.js (v0.160.0) est chargé depuis le CDN jsDelivr.

## Fonctionnalités

### Deux modes de jeu

- **Partie** : seuls les coups légaux sont acceptés. Échec, échec et mat, pat, roque, prise en passant et promotion (choix de la pièce) sont gérés.
- **Placement libre** : n'importe quelle pièce peut aller sur n'importe quelle case vide. On peut retirer une pièce en la déposant hors du plateau, la reprendre depuis la réserve, vider le plateau ou changer le trait.

### Interaction

- Cliquez sur une pièce puis sur une case, ou glissez-déposez-la.
- Les coups possibles s'affichent : un point pour une case vide, un anneau pour une prise.
- Les pièces bougent avec un effet « gelée » : elles se soulèvent en douceur, penchent selon leur vitesse puis oscillent avant de revenir droites. Le balancement pivote autour du point où la pièce a été attrapée.
- **↶ Annuler** revient en arrière, coup par coup (dans les deux modes).
- **🔍 Visualiser** (actif quand une pièce est sélectionnée) ouvre une fenêtre pour admirer la pièce sous tous les angles, avec sa règle de déplacement.

### Journal des déplacements

Le panneau de droite liste chaque coup en notation algébrique avec figurines (♘f3, exd5, O-O, e8=♕, +, #).
Sous chaque coup, une ligne indique la pièce jouée et son trajet (« Cavalier g1 → f3 × Pion »). Le bouton **Copier** copie la liste.

### Thèmes

| Sélecteur | Choix |
|---|---|
| **Pièces** | *Classique* (style Staunton en buis et ébène) · *Médiéval* (personnages : fantassin, tour de guet avec arbalétrier, chevalier à cheval, évêque, reine, roi) |
| **Plateau** | *Bois clair* · *Verre noir* (verre fumé noir et opalin, vrais reflets des pièces, filets dorés, cadre laqué) |

Les choix de thème et la position des panneaux sont mémorisés dans le navigateur.

### Caméra et interface

- Glisser dans le vide : tourner · molette : zoomer · clic droit : déplacer.
- Boutons **Vue blancs**, **Vue noirs**, **Dessus** et **Rotation** automatique.
- Les panneaux se déplacent en les tirant par leur barre de titre.

## Structure du projet

```
index.html        page, panneaux, chargement de Three.js et des scripts
css/style.css     mise en forme
js/scene.js       rendu, caméra, lumières, plateau, coordonnées, sol
js/boards.js      thèmes de plateau (Bois clair, Verre noir)
js/pieces.js      pièces classiques, bois généré, système de thèmes de pièces
js/medieval.js    thème Médiéval (les six personnages)
js/rules.js       moteur de règles (indépendant de la 3D)
js/notation.js    notation des coups et noms des pièces
js/panels.js      panneaux déplaçables
js/viewer.js      visualiseur de pièce
js/main.js        état du jeu, animations, interactions, interface, journal
```

### Pourquoi des scripts classiques et non des modules ES ?

Les navigateurs bloquent les modules JavaScript locaux quand la page est ouverte depuis le disque (`file://`).
`index.html` importe donc Three.js comme module, l'expose sur `window`, puis charge les fichiers de `js/` dans l'ordre comme scripts classiques. Ils partagent la même portée globale : deux fichiers ne doivent pas déclarer le même nom au premier niveau.

Pour ajouter un fichier, insérez son nom à la bonne place dans le tableau `FILES` de `index.html`.

## Ajouter un thème de pièces

Dans un nouveau fichier chargé après `pieces.js`, appelez `registerTheme` :

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
