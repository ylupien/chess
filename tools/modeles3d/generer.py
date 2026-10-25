"""Image → forme 3D brute (.glb) avec Hunyuan3D-2mini, sur le GPU.

    python generer.py images/ferme/napoleon/napoleon.png sortie/napoleon-brut.glb [--turbo] [--seed 1234]

L'image doit montrer un seul personnage en entier, de face ou de trois quarts,
sur un fond uni : le fond est retiré automatiquement (rembg, sur le processeur).
Pas de texture ici : la finition (allègement, relief, socle, matériaux) se fait dans Blender.
"""
import argparse
import os
import time

os.environ.setdefault("PYTORCH_CUDA_ALLOC_CONF", "expandable_segments:True")

import torch
from PIL import Image
from hy3dgen.rembg import BackgroundRemover
from hy3dgen.shapegen import (DegenerateFaceRemover, FloaterRemover,
                              Hunyuan3DDiTFlowMatchingPipeline)

MODEL = "tencent/Hunyuan3D-2mini"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("image")
    ap.add_argument("sortie")
    ap.add_argument("--turbo", action="store_true", help="version rapide (5 étapes), un peu moins fine")
    ap.add_argument("--steps", type=int, default=None, help="étapes de diffusion (défaut 50, turbo 5)")
    ap.add_argument("--octree", type=int, default=380, help="résolution de la surface (256 à 512)")
    ap.add_argument("--seed", type=int, default=1234)
    a = ap.parse_args()

    if not torch.cuda.is_available():
        raise SystemExit("CUDA indisponible : vérifier le pilote NVIDIA dans WSL.")

    img = Image.open(a.image).convert("RGBA")
    if img.getextrema()[3][0] == 255:  # pas de transparence : on retire le fond
        img = BackgroundRemover()(img.convert("RGB"))
    img.save(os.path.splitext(a.sortie)[0] + "-detoure.png")

    sub = "hunyuan3d-dit-v2-mini-turbo" if a.turbo else "hunyuan3d-dit-v2-mini"
    pipe = Hunyuan3DDiTFlowMatchingPipeline.from_pretrained(
        MODEL, subfolder=sub, use_safetensors=True, device="cuda")
    if a.turbo and hasattr(pipe, "enable_flashvdm"):
        pipe.enable_flashvdm()

    t = time.time()
    mesh = pipe(
        image=img,
        num_inference_steps=a.steps or (5 if a.turbo else 50),
        octree_resolution=a.octree,
        num_chunks=20000,  # morceaux plus petits : moins de mémoire vidéo d'un coup
        generator=torch.manual_seed(a.seed),
        output_type="trimesh",
    )[0]
    mesh = FloaterRemover()(mesh)
    mesh = DegenerateFaceRemover()(mesh)

    os.makedirs(os.path.dirname(os.path.abspath(a.sortie)), exist_ok=True)
    mesh.export(a.sortie)
    print(f"{a.sortie} : {len(mesh.faces)} faces en {time.time() - t:.0f} s, "
          f"pic mémoire vidéo {torch.cuda.max_memory_allocated() / 2**30:.1f} Go")


if __name__ == "__main__":
    main()
