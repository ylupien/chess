"""Embarque des modèles .glb dans un script du jeu, en base64, pour rester jouable en file://
(le navigateur refuse de lire un .glb depuis le disque, mais charge un script).

    python3 vers_js.py ../../js/farm-models.js farm:k=sortie/napoleon.glb [farm:q=sortie/brille-babil.glb …]

Clé : <thème>:<pièce>, ou <thème>:<pièce>:<aile> (0 = aile dame, 1 = aile roi) pour les pièces doubles.

Chaque modèle est d'abord compressé par gltfpack (meshopt + sommets quantifiés : géométrie ~4× plus
petite ; textures WebP inchangées). Le jeu le décode avec MeshoptDecoder (js/pieces.js).
Le serveur envoie ensuite le script en gzip, ce qui reprend l'essentiel du surcoût du base64.
Option --sans-compression : embarque les .glb tels quels.
"""
import base64
import os
import subprocess
import sys
import tempfile

GLTFPACK = ["npx", "-y", "gltfpack@0.22.0"]


def compress(path):
    """.glb compressé par gltfpack (noms et matériaux conservés : farm.js s'en sert)."""
    with tempfile.TemporaryDirectory() as d:
        out = os.path.join(d, "m.glb")
        subprocess.run([*GLTFPACK, "-i", path, "-o", out, "-cc", "-kn", "-km"],
                       check=True, stdout=subprocess.DEVNULL)
        return open(out, "rb").read()


def main():
    if len(sys.argv) < 3:
        raise SystemExit(__doc__)
    args = [a for a in sys.argv[1:] if a != "--sans-compression"]
    raw = len(args) < len(sys.argv) - 1
    out, specs = args[0], args[1:]
    lines = [
        "// Modèles détaillés embarqués (.glb en base64), lus par loadModels() de js/pieces.js.",
        "// Généré par tools/modeles3d/vers_js.py : ne pas modifier à la main.",
    ]
    for spec in specs:
        key, path = spec.split("=", 1)
        if open(path, "rb").read(4) != b"glTF":
            raise SystemExit(f"{path} n'est pas un .glb")
        data = open(path, "rb").read() if raw else compress(path)
        lines.append(f"registerModel('{key}', '{base64.b64encode(data).decode()}');")
        print(f"{key} : {os.path.basename(path)}, {os.path.getsize(path) / 1024:.0f} → {len(data) / 1024:.0f} Ko")
    with open(out, "w") as f:
        f.write("\n".join(lines) + "\n")
    print(f"{out} : {os.path.getsize(out) / 1024:.0f} Ko")


if __name__ == "__main__":
    main()
