"""Optionnel : crée l'image de départ d'un personnage avec SDXL, sur le GPU.

    python concept.py napoleon images/ferme/napoleon/napoleon.png [--seed 7] [--n 4]

Produit plusieurs propositions (napoleon-1.png, napoleon-2.png, …) : garder la meilleure
et la copier en images/ferme/napoleon/napoleon.png. Les poids SDXL (~7 Go) se téléchargent au premier lancement.
On peut aussi fournir ses propres images : un personnage entier, fond uni, de face ou trois quarts.
"""
import argparse
import os

import torch
from diffusers import StableDiffusionXLPipeline

STYLE = ("single full-body collectible figurine, painted resin miniature, "
         "front three-quarter view, centered, whole figure visible, plain light grey background, "
         "soft studio lighting, highly detailed sculpt")
NEGATIVE = ("cropped, cut off, multiple figures, text, watermark, busy background, blurry, "
            "flat illustration, base cut off")

PERSONNAGES = {
    "napoleon": "a large fierce Berkshire boar pig as a dictator general, small tusks, "
                "long military greatcoat with epaulettes and medals, stern look, hooves behind back",
    # Brille-Babil (Squealer) : petit cochon gras, joues rondes, yeux pétillants, le propagandiste
    "brille-babil": "a small plump pink pig orator standing upright on two legs, very round cheeks, "
                    "twinkling clever eyes, sly smile, wearing a tidy waistcoat and a bow tie, holding up a sheet "
                    "of paper with statistics in one trotter, the other trotter raised while giving a speech",
    # Malabar (Boxer) : cheval de trait énorme, liste blanche sur le chanfrein, fanons aux sabots
    "malabar": "an enormous powerful brown draught horse, a Shire cart-horse, long white stripe down his nose, "
               "heavy feathered white hooves, leather horse collar harness, calm and loyal, standing on four legs",
    # Douce (Clover) : jument maternelle et trapue
    "douce": "a stout motherly bay mare, a gentle draught horse with kind eyes, soft mane, "
             "standing on four legs, calm and protective",
    # Moïse (Moses) : corbeau apprivoisé qui parle de la montagne de Sucrecandi
    "moise": "a tame black raven perched on a wooden fence post, glossy feathers, beak open as if talking, "
             "one wing slightly raised, clever expression",
    # Moïse sur sa branche, d'un seul bloc (Rodin perd la branche si elle est trop fine)
    "moise-branche": "a black raven firmly gripping with its claws a thick gnarled branch rising from a "
                     "tree stump, glossy feathers, beak open as if talking",
    # Minimus : le cochon poète qui chante les louanges de Napoléon
    "minimus": "a pig poet standing upright on two legs, wearing a laurel wreath on his head and a long poet's coat, "
               "holding a quill pen in one trotter and an unrolled scroll of poetry in the other, inspired dreamy look",
    # Les chiens de Napoléon : molosses féroces, colliers cloutés de laiton
    "chien": "a huge fierce mastiff guard dog, wolf-like, wearing a brass-studded leather collar, "
             "snarling with bared teeth, muscular, standing on four legs ready to attack",
    # Les poules : elles se révoltent quand Napoléon leur prend leurs œufs, et sont sacrifiées
    "poule": "a plump farm hen, a brown and russet chicken with a red comb and wattles, fluffy detailed "
             "feathers, standing on two yellow legs, head held high, proud and alert expression",
    # Les moutons : « Quatre pattes, oui ! Deux pattes, non ! »
    "mouton": "a woolly white sheep with thick curly fleece, black face and legs, head raised bleating "
              "with mouth open, standing on four legs",

    # --- Thème Dragons : même famille de dragons nacrés aux accents dorés (le camp noir est teinté)
    # Pion : dragonnet qui sort de son œuf
    "dragon-pion": "a cute baby dragon hatchling breaking out of a large cracked egg, pearl-white scales with "
                   "gold accents, small wings unfolding, curious big eyes, head and front claws out of the shell",
    # Tour : dragon enroulé autour d'une tour de pierre
    "dragon-tour": "a serpentine dragon coiled tightly around a round stone castle tower with battlements, "
                   "pearl-white scales with gold accents, head resting on top of the tower, compact vertical shape",
    # Cavalier : wyverne dressée sur son rocher
    "dragon-cavalier": "a wyvern rearing up on a jagged rock, two legs and large bat-like wings half open, "
                       "long neck arched like a chess knight, pearl-white scales with gold accents, roaring",
    # Fou : mage draconique
    "dragon-fou": "a dragon sorcerer standing upright on two legs, wearing a long hooded robe with gold trim, "
                  "holding a tall staff topped with a glowing crystal, pearl-white scales with gold accents, wise",
    # Dame : dragonne royale
    "dragon-dame": "an elegant queen dragon sitting upright, slender graceful neck, wings folded like a cape, "
                   "wearing a delicate gold crown, pearl-white scales with gold accents, regal and proud",
    # Roi : roi dragon sur son trésor
    "dragon-roi": "a massive king dragon sitting upright on a pile of gold coins and treasure, wings folded, "
                  "wearing a heavy gold crown, horns, pearl-white scales with gold accents, majestic and powerful",
}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("perso", choices=sorted(PERSONNAGES))
    ap.add_argument("sortie")
    ap.add_argument("--seed", type=int, default=7)
    ap.add_argument("--n", type=int, default=4)
    ap.add_argument("--peu-memoire", action="store_true",
                    help="charge le modèle morceau par morceau : ~2 Go de mémoire vidéo, plus lent")
    a = ap.parse_args()

    pipe = StableDiffusionXLPipeline.from_pretrained(
        "stabilityai/stable-diffusion-xl-base-1.0", torch_dtype=torch.float16,
        variant="fp16", use_safetensors=True)
    if a.peu_memoire:
        pipe.enable_sequential_cpu_offload()
    else:
        pipe.enable_model_cpu_offload()  # tient dans 8 Go de mémoire vidéo
    pipe.vae.enable_slicing()

    base, ext = os.path.splitext(a.sortie)
    os.makedirs(os.path.dirname(os.path.abspath(a.sortie)), exist_ok=True)
    for i in range(a.n):
        img = pipe(prompt=f"{PERSONNAGES[a.perso]}, {STYLE}", negative_prompt=NEGATIVE,
                   num_inference_steps=30, guidance_scale=6.5, width=1024, height=1024,
                   generator=torch.manual_seed(a.seed + i)).images[0]
        img.save(f"{base}-{i + 1}{ext}")
        print(f"{base}-{i + 1}{ext}")


if __name__ == "__main__":
    main()
