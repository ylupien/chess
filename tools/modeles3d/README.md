# Modèles 3D détaillés

Fabrication des pièces détaillées des thèmes (aujourd'hui : La Ferme des animaux), plus fines que celles
construites en JavaScript. Une IA produit le modèle, Blender le finit pour le jeu, un script l'embarque.

| Étape | Outil | Matériel |
|---|---|---|
| 1. Image du personnage | `concept.py` (SDXL, local) ou tout autre générateur | GPU |
| 2. Image → modèle 3D texturé | [Rodin / Hyper3D](https://hyper3d.ai) (en ligne) | — |
| 3. Finition : socle, échelle, allègement, textures | `finir_blender.py` | processeur uniquement |
| 4. Embarquement dans le jeu | `vers_js.py` (compression gltfpack) | processeur |

Seuls `js/farm-models.js` (le résultat) et ces scripts sont versionnés. Les zips de Rodin (`hyper3d/`),
les images (`images/`) et les fichiers intermédiaires (`sortie/`) restent hors Git.

## Prérequis

- **Blender 5.x**, en ligne de commande (`blender`). Toujours lancé en mode sans fenêtre (`-b`), il calcule sur
  le processeur.
- **Node.js** (`npx`) : `vers_js.py` télécharge et lance `gltfpack@0.22.0` à la volée.
- **Pour `concept.py` seulement** : l'environnement installé par `./install.sh` (dans `~/.local/opt/hunyuan3d`,
  PyTorch pour CUDA 12.8, nécessaire pour les cartes RTX 50xx). Les poids de SDXL (~7 Go) se téléchargent au
  premier lancement, dans `~/.cache/huggingface`.

## 1. Image du personnage

```bash
~/.local/opt/hunyuan3d/venv/bin/python concept.py poule images/ferme/poule/poule.png --n 6 [--seed 7] [--peu-memoire]
```

- Le script produit `poule-1.png`, `poule-2.png`… dans le dossier donné, avec un style commun : figurine en
  résine peinte, de trois quarts, fond gris uni.
- Les prompts sont dans le dictionnaire `PERSONNAGES` de `concept.py` : personnages de la ferme, `moise-branche`,
  et les six pièces Dragons (`dragon-pion` … `dragon-roi`).
- SDXL ne lit que 77 mots-jetons : au-delà, la fin du prompt (style compris) est ignorée. Garder les prompts courts.
- `--peu-memoire` charge le modèle morceau par morceau (~2 Go de mémoire vidéo, plus lent).
- `attendre_gpu.sh` attend que le GPU soit libre, pour ne pas gêner un autre calcul.

Rangement : `images/<thème>/<personnage>/`, et les planches de comparaison à la racine de chaque thème.

## 2. Modèle 3D avec Rodin

Envoyer l'image choisie à Rodin, télécharger le résultat en GLB, et déposer le zip dans `hyper3d/` à la racine
du projet (par exemple `hyper3d/Poule.zip`). Le fichier utilisé est `base_basic_pbr.glb`, qui porte les textures
de couleur, relief, rugosité et métal.

Points d'attention :

- Rodin perd parfois les éléments fins (la branche de Moïse) : préférer des images où les accessoires sont épais
  et collés au personnage.
- Une silhouette compacte donne une pièce plus grande sur le plateau : le personnage est réduit s'il déborde
  de sa case.

## 3. Finition dans Blender

```bash
unzip -p ../../hyper3d/Poule.zip base_basic_pbr.glb > sortie/poule-rodin-brut.glb
blender -b -P finir_blender.py --python-exit-code 1 -- sortie/poule-rodin-brut.glb sortie/poule-rodin.glb \
  --garder-textures --hauteur 1.72 --rayon 1.2 --centre boite --faces 20000 --tex 1024 --apercu sortie/poule-rodin
```

Le script nettoie le modèle (débris), le met à l'échelle, l'allège, refait ses textures sur le modèle allégé,
ajoute le socle de bois de la ferme et exporte un `.glb` aux textures WebP. Les aperçus `-34`, `-face` et `-dos`
permettent de vérifier le résultat.

| Option | Rôle |
|---|---|
| `--garder-textures` | garde les textures de Rodin (couleur, relief, rugosité, métal, occlusion), recalculées sur le modèle allégé |
| `--hauteur H` | hauteur totale visée, socle compris, en unités pièce (voir le tableau ci-dessous) |
| `--rayon R` | rayon horizontal maximal (1.25 = demi-case) : un personnage trop large est réduit |
| `--centre mediane\|boite` | centrage : `mediane` ignore un accessoire qui dépasse (la canne de Napoléon) ; `boite` pour les animaux allongés |
| `--faces N` | nombre de faces après allègement (60000 pour les pièces maîtresses, 20000 pour les pions) |
| `--tex N` | taille maximale des textures, en pixels (1024) |
| `--socle-image` | coupe le socle modélisé par Rodin (disque, rocher) pour mettre le socle de la ferme |
| `--perchoir L` | oiseau : le surélève de L et construit une branche d'écorce sous ses pattes |
| `--rotation D` | fait pivoter le modèle de D degrés s'il ne regarde pas devant |
| `--apercu préfixe` | rend les trois aperçus |

Réglages utilisés pour la ferme :

| Personnage | Clé | Hauteur | Autres options |
|---|---|---|---|
| Napoléon (roi) | `farm:k` | 3.35 | `--socle-image --rayon 1.24 --faces 60000` |
| Brille-Babil (dame) | `farm:q` | 3.1 | `--socle-image --rayon 1.24 --centre boite --faces 60000` |
| Douce (tour, aile dame) | `farm:r:0` | 2.43 | `--rayon 1.24 --centre boite --faces 60000` |
| Malabar (tour, aile roi) | `farm:r:1` | 2.58 | `--rayon 1.24 --centre boite --faces 60000` |
| Moïse (fou, aile dame) | `farm:b:0` | 2.78 | `--perchoir 0.85 --rayon 1.24 --centre boite --faces 60000` |
| Minimus (fou, aile roi) | `farm:b:1` | 2.53 | `--rayon 1.24 --centre boite --faces 60000` |
| Chien (cavaliers) | `farm:n` | 2.38 | `--rayon 1.24 --centre boite --faces 60000` |
| Poule (pions) | `farm:p` | 1.72 | `--rayon 1.2 --centre boite --faces 20000` |

Toutes ces commandes utilisent aussi `--garder-textures --tex 1024`.

## 4. Embarquement dans le jeu

```bash
python3 tools/modeles3d/vers_js.py js/farm-models.js \
  farm:k=tools/modeles3d/sortie/napoleon-rodin2.glb farm:q=tools/modeles3d/sortie/brille-babil-rodin.glb \
  farm:r:0=tools/modeles3d/sortie/douce-rodin.glb farm:r:1=tools/modeles3d/sortie/malabar-rodin.glb \
  farm:b:0=tools/modeles3d/sortie/moise-rodin.glb farm:b:1=tools/modeles3d/sortie/minimus-rodin.glb \
  farm:n=tools/modeles3d/sortie/chien-rodin.glb farm:p=tools/modeles3d/sortie/poule-rodin.glb
```

- Le fichier est réécrit en entier : lister tous les modèles à chaque fois.
- **Compression** : chaque modèle passe d'abord par gltfpack (meshopt, sommets quantifiés), ce qui divise la
  géométrie par environ 4. `--sans-compression` embarque les `.glb` tels quels.
- **Format** : les `.glb` sont écrits en base64 dans un script, la seule forme qu'un navigateur accepte de lire
  depuis le disque (`file://`). En ligne, le serveur envoie ce script en gzip, ce qui compense l'essentiel du
  surcoût du base64.
- **Clés** : `<thème>:<pièce>`, ou `<thème>:<pièce>:<aile>` (0 = aile dame, 1 = aile roi) pour les tours et les
  fous qui sont deux personnages.

## Format attendu par le jeu

- **Échelle** : la même que les pièces de `js/farm.js`. Le socle va de y = 0 à 0.3, le personnage est posé
  dessus et regarde vers +z. Le jeu réduit ensuite le tout par `PIECE_SCALE`.
- **Matériaux** : `body` est le socle, remplacé par le bois du thème. Les autres (`skin`, `bark`…) sont repris
  tels quels, et assombris pour les Noirs.

## Autres scripts

- `generer.py` et `pipeline.sh` : la première méthode, entièrement locale (Hunyuan3D-2mini pour la forme). Les
  résultats étaient moins bons que Rodin ; les scripts restent disponibles.
- `dos.py` : essai d'image de dos (SDXL), abandonné.

## Licences

Hunyuan3D-2 : Tencent Hunyuan Community License (usage permis au Canada ; exclut l'UE, le Royaume-Uni et la
Corée du Sud). SDXL : CreativeML Open RAIL++-M. Les modèles Rodin suivent les conditions du compte Hyper3D utilisé.
