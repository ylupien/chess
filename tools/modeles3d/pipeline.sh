#!/usr/bin/env bash
# Chaîne complète pour un personnage : image → forme (GPU) → finition Blender (processeur).
#
#   ./pipeline.sh napoleon            # utilise images/<thème>/napoleon/napoleon.png
#   ./pipeline.sh napoleon --turbo    # options passées à generer.py
#
# Attend d'abord que le GPU soit libre (attendre_gpu.sh). Résultats dans sortie/ :
#   <perso>-brut.glb, <perso>.glb, <perso>-relief.png, <perso>-occlusion.png, aperçus.
set -euo pipefail
cd "$(dirname "$0")"

PERSO="${1:?usage : $0 <personnage> [options generer.py]}"
shift
HY3D_HOME="${HY3D_HOME:-$HOME/.local/opt/hunyuan3d}"
PY="$HY3D_HOME/venv/bin/python"
[ -x "$PY" ] || { echo "Lancer d'abord ./install.sh"; exit 1; }
IMG=$(ls images/*/"$PERSO"/"$PERSO".png 2>/dev/null | head -1)
IMG="${IMG:-images/ferme/$PERSO/$PERSO.png}"
[ -f "$IMG" ] || { echo "Image manquante : $IMG"; exit 1; }

# Hauteur totale (socle compris) en unités pièce, alignée sur les pièces de js/farm.js
case "$PERSO" in
  napoleon) H=3.35 ;; brille-babil) H=3.1 ;; malabar) H=2.58 ;; douce) H=2.43 ;;
  moise) H=2.78 ;; minimus) H=2.53 ;; chien) H=2.38 ;; mouton) H=1.72 ;; *) H=3.0 ;;
esac

mkdir -p sortie
./attendre_gpu.sh
"$PY" generer.py "$IMG" "sortie/$PERSO-brut.glb" "$@"

# Finition sur le processeur, en priorité basse
nice -n 10 blender -b -P finir_blender.py --python-exit-code 1 -- \
  "sortie/$PERSO-brut.glb" "sortie/$PERSO.glb" --hauteur "$H" --apercu "sortie/$PERSO-apercu.png"
echo "Terminé : sortie/$PERSO.glb"
