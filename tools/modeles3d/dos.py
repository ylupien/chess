"""Image de dos d'un personnage, déduite de son image de face (SDXL img2img, sur le GPU).

    python dos.py napoleon [--force 0.62] [--n 4] [--seed 11]

Entrée : sortie/<perso>-brut-detoure.png (produit par generer.py). L'image de face est retournée
(la silhouette vue de dos est le miroir de celle de face), puis redessinée « vue de dos ». On garde
la silhouette de face en masque : l'image reste ainsi alignée sur la forme 3D.
Sorties : sortie/<perso>-dos-1.png … ; garder la meilleure sous sortie/<perso>-dos.png.
"""
import argparse

import numpy as np
import torch
from diffusers import StableDiffusionXLImg2ImgPipeline
from PIL import Image, ImageFilter, ImageOps

PROMPTS = {
    "napoleon": "rear view, figurine seen from directly behind, we see his back, a pig general, back of a pink pig head with two big pink pig ears and "
                "black military cap, back of a long grey military greatcoat, black cape hanging from the "
                "shoulders, gold epaulettes, black boots, no face visible",
}
STYLE = "painted resin miniature, plain grey background, soft studio lighting, highly detailed"
NEGATIVE = ("face, eyes, snout, nose, front view, looking at viewer, three-quarter view, sash, medals, "
            "buttons, belt buckle, text, watermark, blurry")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("perso")
    ap.add_argument("--force", type=float, default=0.8, help="0 = image de face inchangée, 1 = libre")
    ap.add_argument("--flou", type=float, default=14, help="flou de l'image de départ (efface le visage)")
    ap.add_argument("--n", type=int, default=4)
    ap.add_argument("--seed", type=int, default=11)
    a = ap.parse_args()

    front = Image.open(f"sortie/{a.perso}-brut-detoure.png").convert("RGBA")
    mirror = ImageOps.mirror(front)
    alpha = mirror.getchannel("A")
    bg = Image.new("RGBA", mirror.size, (128, 128, 132, 255))
    bg.alpha_composite(mirror)
    # Flou fort : on ne garde que la silhouette et les grandes masses de couleur, sinon le modèle
    # reproduit le visage et la vue de face
    init = bg.convert("RGB").resize((1024, 1024), Image.LANCZOS).filter(ImageFilter.GaussianBlur(a.flou))

    pipe = StableDiffusionXLImg2ImgPipeline.from_pretrained(
        "stabilityai/stable-diffusion-xl-base-1.0", torch_dtype=torch.float16,
        variant="fp16", use_safetensors=True)
    pipe.enable_model_cpu_offload()
    pipe.vae.enable_slicing()

    prompt = f"{PROMPTS.get(a.perso, 'back view of the same figurine, seen from behind')}, {STYLE}"
    for i in range(a.n):
        img = pipe(prompt=prompt, negative_prompt=NEGATIVE, image=init, strength=a.force,
                   num_inference_steps=40, guidance_scale=7,
                   generator=torch.manual_seed(a.seed + i)).images[0]
        img = img.resize(mirror.size, Image.LANCZOS).convert("RGBA")
        img.putalpha(alpha)  # silhouette de face, en miroir : alignement garanti avec la forme
        out = f"sortie/{a.perso}-dos-{i + 1}.png"
        img.save(out)
        print(out)


if __name__ == "__main__":
    main()
