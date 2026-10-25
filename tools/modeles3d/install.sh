#!/usr/bin/env bash
# Installe Hunyuan3D-2 (forme seulement) dans un environnement isolé, hors du projet.
# N'utilise pas le GPU : téléchargement et installation uniquement.
#
#   HY3D_HOME : dossier d'installation (défaut ~/.local/opt/hunyuan3d)
set -euo pipefail

HY3D_HOME="${HY3D_HOME:-$HOME/.local/opt/hunyuan3d}"
REPO=https://github.com/Tencent/Hunyuan3D-2.git

command -v uv >/dev/null || { echo "uv introuvable (https://docs.astral.sh/uv/)"; exit 1; }
mkdir -p "$HY3D_HOME"
cd "$HY3D_HOME"

if [ ! -d Hunyuan3D-2 ]; then
  git clone --depth 1 "$REPO" Hunyuan3D-2
fi
git -C Hunyuan3D-2 rev-parse HEAD > commit.txt
echo "Hunyuan3D-2 @ $(cat commit.txt)"

# Python 3.10 : version recommandée par Hunyuan3D-2
[ -d venv ] || uv venv --python 3.10 venv
PY="$HY3D_HOME/venv/bin/python"

# PyTorch compilé pour CUDA 12.8 : nécessaire pour les cartes Blackwell (RTX 50xx)
uv pip install --python "$PY" torch torchvision --index-url https://download.pytorch.org/whl/cu128

# Dépendances de Hunyuan3D-2, sans réinstaller torch. Les modules de texture
# (custom_rasterizer, differentiable_renderer) ne sont pas compilés : on texture dans Blender.
grep -viE '^(torch|torchvision)\b' Hunyuan3D-2/requirements.txt > requirements-sans-torch.txt
# transformers 5 renomme les couches de l'encodeur d'image (DINOv2) : poids de Hunyuan3D illisibles.
# Et diffusers récent exige huggingface-hub 1.x, incompatible avec transformers 4.
uv pip install --python "$PY" -r requirements-sans-torch.txt "transformers<5" "diffusers<0.36"
uv pip install --python "$PY" -e Hunyuan3D-2

# Vérification sans toucher au GPU (pas d'appel CUDA)
"$PY" -c "import torch, hy3dgen; print('torch', torch.__version__, '| cuda', torch.version.cuda)"
echo "Installé dans $HY3D_HOME"
echo "Les poids (~5 Go) se téléchargent au premier lancement de generer.py, dans ~/.cache/huggingface."
