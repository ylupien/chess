"""Finition d'une forme brute dans Blender, sans fenêtre et sur le processeur uniquement.

    blender -b -P finir_blender.py --python-exit-code 1 -- brut.glb piece.glb \
        [--hauteur 3.35] [--faces 12000] [--tex 1024] [--rotation 0] [--apercu apercu.png]

Étapes :
  1. nettoyage : sommets doublés, petits morceaux détachés ;
  2. mise à l'échelle du jeu, en unités « pièce » (réduites ensuite par PIECE_SCALE = 0.4 dans le jeu) :
     personnage posé sur le socle (y = 0.3), hauteur totale --hauteur, de face vers le joueur ;
  3. version légère (--faces triangles) dépliée en UV ;
  4. le détail de la version lourde est transféré en textures : relief (normal map) et
     ombrage des creux (occlusion) ;
  5. socle de bois identique à celui de js/farm.js ;
  6. export .glb : matériaux nommés « skin » (personnage) et « body » (socle), recolorés par le jeu ;
  7. aperçus rendus avec Cycles sur le processeur.

--rotation tourne le personnage autour de l'axe vertical (degrés) s'il ne regarde pas devant.
"""
import math
import os
import sys
import time

import bmesh
import bpy
from mathutils import Vector

TOP = 0.3  # dessus du socle
PEDESTAL = [(0, 0), (0.86, 0), (0.86, 0.1), (0.81, 0.16), (0.83, 0.22), (0.76, 0.28), (0.64, 0.3), (0, 0.3)]
R_MAX = 1.1  # rayon horizontal maximum du personnage (socle 0.86, case 1.25 : une cape peut déborder)
HIGH_MAX = 300_000  # la version lourde est d'abord ramenée à ce nombre de faces pour le transfert


def args():
    import argparse
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    ap = argparse.ArgumentParser(prog="finir_blender.py")
    ap.add_argument("entree")
    ap.add_argument("sortie")
    ap.add_argument("--hauteur", type=float, default=3.0, help="hauteur totale, socle compris (unités pièce)")
    ap.add_argument("--faces", type=int, default=12000)
    ap.add_argument("--tex", type=int, default=1024)
    ap.add_argument("--rotation", type=float, default=0.0)
    ap.add_argument("--centre", choices=("mediane", "boite"), default="mediane",
                    help="centrage sur le socle : médiane des sommets (un objet tenu ne décentre pas "
                         "le personnage) ou milieu de la silhouette (animal long)")
    ap.add_argument("--rayon", type=float, default=R_MAX,
                    help=f"rayon horizontal maximum (défaut {R_MAX} ; une case fait 1.25 de demi-largeur)")
    ap.add_argument("--apercu", default=None)
    ap.add_argument("--garder-textures", action="store_true",
                    help="modèle déjà texturé (Rodin, Tripo…) : garde son maillage et ses textures ; "
                         "seulement socle d'origine coupé, mise à l'échelle, socle du jeu, textures réduites à --tex")
    ap.add_argument("--image", default=None,
                    help="image détourée de generer.py : ses couleurs sont projetées de face sur la pièce")
    ap.add_argument("--zones", default=None, metavar="ROLE=RRGGBB,…",
                    help="avec --image : découpe la pièce en zones de couleur unie (rôles de matériau du "
                         "thème), reconnues à l'avant d'après l'image puis prolongées vers l'arrière ; "
                         "ex. pig=e0a090,coat=80838a,hat=26262a,accent=b8323a,gold=c9a35a")
    ap.add_argument("--socle-image", action="store_true",
                    help="coupe le socle modélisé d'après l'image (dalle large sous les pieds)")
    ap.add_argument("--retirer", action="append", default=[], metavar="CONDITIONS",
                    help="retire une zone, en coordonnées de la forme brute (glTF : y vertical, "
                         "z vers l'avant, de -1 à 1), ex. \"x>0.38 z>0.37 y>0.04\" ; répétable")
    ap.add_argument("--perchoir", type=float, default=0, metavar="LEVEE",
                    help="oiseau : le surélève de LEVEE et le pose sur une branche sortie du socle")
    return ap.parse_args(argv)


def log(msg, t0=[time.time()]):
    print(f"[{time.time() - t0[0]:6.1f} s] {msg}", flush=True)


def cpu_only(scene):
    # Aucun périphérique GPU pour Cycles : rendu et transfert sur le processeur
    prefs = bpy.context.preferences.addons["cycles"].preferences
    prefs.compute_device_type = "NONE"
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    threads = int(os.environ.get("BLENDER_THREADS", max(1, (os.cpu_count() or 2) // 2)))
    scene.render.threads_mode = "FIXED"
    scene.render.threads = threads


def select_only(obj):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def decimate(obj, faces):
    n = len(obj.data.polygons)
    if n <= faces:
        return
    m = obj.modifiers.new("allege", "DECIMATE")
    m.ratio = faces / n
    m.use_collapse_triangulate = True
    select_only(obj)
    bpy.ops.object.modifier_apply(modifier=m.name)


def import_mesh(path, keep_materials=False):
    bpy.ops.import_scene.gltf(filepath=path)
    meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
    if not meshes:
        raise SystemExit(f"Aucun maillage dans {path}")
    bpy.ops.object.select_all(action="DESELECT")
    for o in meshes:
        o.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    if len(meshes) > 1:
        bpy.ops.object.join()
    obj = bpy.context.view_layer.objects.active
    for o in list(bpy.context.scene.objects):  # vides et caméras éventuels
        if o is not obj:
            bpy.data.objects.remove(o, do_unlink=True)
    obj.parent = None
    select_only(obj)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    obj.name = "haut"
    if not keep_materials:
        obj.data.materials.clear()
    return obj


def raw(co):
    # Repère de la forme brute (glTF, y vertical, z vers l'avant) depuis celui de Blender (z vertical)
    return co.x, co.z, -co.y


def project_colors(obj, path):
    """Coordonnées de texture « proj » : projection de face de l'image sur la forme.
    La boîte du personnage dans l'image (pixels opaques) est alignée sur celle de la forme.
    L'image ne montre que l'avant : pour les faces tournées vers l'arrière, on prend plutôt la couleur
    du bord de la silhouette à la même hauteur (« proj_dos », côté de la tête, cape), avec un
    fondu selon l'orientation (attribut « dos »)."""
    import numpy as np
    img = bpy.data.images.load(os.path.abspath(path))
    w, h = img.size
    a = np.array(img.pixels[:], dtype=np.float32).reshape(h, w, 4)[:, :, 3]  # lignes de bas en haut
    ys, xs = np.nonzero(a > 0.5)
    u0, u1, v0, v1 = xs.min() / w, (xs.max() + 1) / w, ys.min() / h, (ys.max() + 1) / h
    me = obj.data
    nv, nl = len(me.vertices), len(me.loops)
    co = np.empty(nv * 3, dtype=np.float32)
    me.vertices.foreach_get("co", co)
    nrm = np.empty(nv * 3, dtype=np.float32)
    me.vertices.foreach_get("normal", nrm)  # lues une seule fois, avant toute écriture
    co, nrm = co.reshape(-1, 3), nrm.reshape(-1, 3)
    x, y = co[:, 0], co[:, 2]  # repère brut : x et y (vertical)
    x0, x1, y0, y1 = x.min(), x.max(), y.min(), y.max()
    u = u0 + (x - x0) / (x1 - x0) * (u1 - u0)
    v = v0 + (y - y0) / (y1 - y0) * (v1 - v0)

    # Dos : l'image ne le montre pas. On prend une bande de couleur par hauteur : moyenne des deux
    # bords de la silhouette (un peu à l'intérieur, hors du halo du détourage), adoucie verticalement.
    px = np.array(img.pixels[:], dtype=np.float32).reshape(h, w, 4)
    opaque = a > 0.5
    filled = opaque.any(axis=1)
    first = opaque.argmax(axis=1)
    last = w - 1 - opaque[:, ::-1].argmax(axis=1)
    band = np.zeros((h, 3), dtype=np.float32)
    for row in np.nonzero(filled)[0]:
        width = last[row] - first[row] + 1
        i0, i1 = int(width * 0.03), max(int(width * 0.12), int(width * 0.03) + 1)
        cols = np.r_[first[row] + i0:first[row] + i1, last[row] - i1 + 1:last[row] - i0 + 1]
        cols = cols[(cols >= 0) & (cols < w)]
        sel = px[row, cols]
        sel = sel[sel[:, 3] > 0.5]
        if len(sel):
            band[row] = sel[:, :3].mean(axis=0)
    rows = np.nonzero(band.any(axis=1))[0]
    for c in range(3):  # lignes vides : interpolation, puis flou vertical
        band[:, c] = np.interp(np.arange(h), rows, band[rows, c])
    k = max(3, int(h * 0.03)) | 1
    g = np.exp(-0.5 * (np.linspace(-2, 2, k)) ** 2)
    g /= g.sum()
    for c in range(3):
        band[:, c] = np.convolve(np.pad(band[:, c], k // 2, mode="edge"), g, mode="valid")
    strip = bpy.data.images.new("dos", 4, h, alpha=False, float_buffer=True)
    strip.colorspace_settings.name = img.colorspace_settings.name
    strip.pixels.foreach_set(np.concatenate([np.repeat(band[:, None, :], 4, axis=1),
                                             np.ones((h, 4, 1), np.float32)], axis=2).ravel())
    ub = np.full(nv, 0.5, dtype=np.float32)

    # 0 de face, 1 de dos (avant du repère brut = -y de Blender)
    t = np.clip((0.15 + nrm[:, 1]) / 0.5, 0, 1)
    back = me.attributes.new("dos", "FLOAT", "POINT")
    back.data.foreach_set("value", (t * t * (3 - 2 * t)).astype(np.float32))

    vi = np.empty(nl, dtype=np.int32)
    me.loops.foreach_get("vertex_index", vi)
    for name, uu in (("proj", u), ("proj_dos", ub)):
        layer = me.uv_layers.new(name=name)
        layer.data.foreach_set("uv", np.stack([uu[vi], v[vi]], axis=1).astype(np.float32).ravel())
    mat = bpy.data.materials.new("projection")
    if hasattr(mat, "use_nodes") and not mat.use_nodes:
        mat.use_nodes = True
    nt = mat.node_tree
    for n in list(nt.nodes):
        if n.type != "OUTPUT_MATERIAL":
            nt.nodes.remove(n)
    out = next(n for n in nt.nodes if n.type == "OUTPUT_MATERIAL")
    texs = []
    for name in ("proj", "proj_dos"):
        tc = nt.nodes.new("ShaderNodeUVMap")
        tc.uv_map = name
        tex = nt.nodes.new("ShaderNodeTexImage")
        tex.image = img if name == "proj" else strip
        tex.extension = "EXTEND"
        nt.links.new(tc.outputs["UV"], tex.inputs["Vector"])
        texs.append(tex)
    attr = nt.nodes.new("ShaderNodeAttribute")
    attr.attribute_name = "dos"
    mix = nt.nodes.new("ShaderNodeMix")
    mix.data_type = "RGBA"
    nt.links.new(attr.outputs["Fac"], mix.inputs["Factor"])
    nt.links.new(texs[0].outputs["Color"], mix.inputs["A"])
    nt.links.new(texs[1].outputs["Color"], mix.inputs["B"])
    emit = nt.nodes.new("ShaderNodeEmission")
    nt.links.new(mix.outputs["Result"], emit.inputs["Color"])
    nt.links.new(emit.outputs["Emission"], out.inputs["Surface"])
    me.materials.append(mat)
    log(f"couleurs projetées depuis {os.path.basename(path)}")


def remove_zones(obj, zones):
    import operator
    ops = {">": operator.gt, "<": operator.lt}
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    all_conds = []
    for zone in zones:
        conds = []
        for c in zone.split():
            axis, op, val = c[0], c[1], float(c[2:])
            conds.append(("xyz".index(axis), ops[op], val))
        drop = [v for v in bm.verts if all(f(raw(v.co)[i], val) for i, f, val in conds)]
        all_conds.append(conds)
        bmesh.ops.delete(bm, geom=drop, context="VERTS")
        log(f"zone « {zone} » : {len(drop)} sommets retirés")
    # Trous au bord des zones retirées seulement (marge de 0.02 dans le repère brut)
    def near(v):
        p = raw(v.co)
        return any(all(p[i] > val - 0.02 if f is ops[">"] else p[i] < val + 0.02 for i, f, val in c)
                   for c in all_conds)
    _close_holes(bm, near=near)
    bm.to_mesh(obj.data)
    bm.free()


def _close_holes(bm, max_sides=400, near=None):
    # near(v) : ne referme que les trous créés par la coupe (un modèle peut avoir d'autres ouvertures)
    edges = [e for e in bm.edges if e.is_boundary and (near is None or all(near(v) for v in e.verts))]
    if edges:
        bmesh.ops.holes_fill(bm, edges=edges, sides=max_sides)


def cut_image_base(obj):
    """Coupe la dalle que le modèle a reproduite sous les pieds : en remontant depuis le bas,
    la première tranche nettement plus étroite que la dalle marque le début des pieds."""
    pts = [raw(v.co) for v in obj.data.vertices]
    ys = [p[1] for p in pts]
    lo, hi = min(ys), max(ys)
    step = (hi - lo) * 0.006
    bins = {}
    for x, y, z in pts:
        if y < lo + (hi - lo) * 0.2:
            bins.setdefault(int((y - lo) / step), []).append(math.hypot(x, z))
    def r90(b):
        r = sorted(bins.get(b, [0]))
        return r[int(len(r) * 0.9)]
    # Largeur de la dalle : médiane des premières tranches (le fond et le bord peuvent tromper).
    # Puis la première tranche nettement plus étroite, et qui le reste : le début des pieds.
    slab = sorted(r90(b) for b in range(8))[4]
    narrow = lambda b: r90(b) < slab * 0.8
    cut = None
    for b in range(2, max(bins) - 2):
        if narrow(b) and narrow(b + 1) and narrow(b + 2):
            cut = lo + b * step
            break
    if cut is None or cut > lo + (hi - lo) * 0.15:
        log("pas de socle d'image détecté")
        return
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    geom = bm.verts[:] + bm.edges[:] + bm.faces[:]
    # plan horizontal en z Blender (= y brut)
    bmesh.ops.bisect_plane(bm, geom=geom, plane_co=(0, 0, cut), plane_no=(0, 0, 1), clear_inner=True)
    eps = (hi - lo) * 1e-4
    _close_holes(bm, near=lambda v: abs(v.co.z - cut) < eps)
    bm.to_mesh(obj.data)
    bm.free()
    log(f"socle de l'image coupé à {(cut - lo) / (hi - lo) * 100:.0f} % de la hauteur")


def clean(obj, min_frac=0.03):
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    # Morceaux détachés : on garde ceux qui comptent au moins min_frac des faces du plus grand
    seen, islands = set(), []
    bm.faces.ensure_lookup_table()
    for f in bm.faces:
        if f.index in seen:
            continue
        stack, island = [f], []
        seen.add(f.index)
        while stack:
            cur = stack.pop()
            island.append(cur)
            for e in cur.edges:
                for nf in e.link_faces:
                    if nf.index not in seen:
                        seen.add(nf.index)
                        stack.append(nf)
        islands.append(island)
    if len(islands) > 1:
        biggest = max(len(i) for i in islands)
        zs = [v.co.z for v in bm.verts]
        z0, H = min(zs), max(zs) - min(zs)

        def flat_bottom(island):
            # Plaque plate posée tout en bas : reste du socle d'origine après la coupe
            iz = [v.co.z for f in island for v in f.verts]
            return max(iz) - min(iz) < H * 0.012 and min(iz) < z0 + H * 0.02 and len(island) < biggest * 0.2

        drop = [f for i in islands if len(i) < biggest * min_frac or flat_bottom(i) for f in i]
        bmesh.ops.delete(bm, geom=drop, context="FACES")
        log(f"{len(islands)} morceaux, {len(drop)} faces de débris retirées")
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(obj.data)
    bm.free()


def normalize(obj, height, r_max=R_MAX, centre="mediane"):
    vs = [v.co for v in obj.data.vertices]
    lo = Vector((min(v.x for v in vs), min(v.y for v in vs), min(v.z for v in vs)))
    hi = Vector((max(v.x for v in vs), max(v.y for v in vs), max(v.z for v in vs)))
    # Centre : médiane des sommets, pour qu'un objet tenu (canne) ne décentre pas le personnage
    if centre == "boite":
        cx, cy = (lo.x + hi.x) / 2, (lo.y + hi.y) / 2
    else:
        xs, ys = sorted(v.x for v in vs), sorted(v.y for v in vs)
        cx, cy = xs[len(xs) // 2], ys[len(ys) // 2]
    r = max(math.hypot(v.x - cx, v.y - cy) for v in vs)
    h = hi.z - lo.z
    s = min((height - TOP) / h, r_max / r)
    if s < (height - TOP) / h:
        log(f"trop large : hauteur réduite à {TOP + h * s:.2f} pour tenir sur le socle")
    sink = 0.01  # légèrement enfoncé dans le socle, pour ne pas flotter
    for v in obj.data.vertices:
        v.co = Vector(((v.co.x - cx) * s, (v.co.y - cy) * s, (v.co.z - lo.z) * s + TOP - sink))
    obj.data.update()


def image(name, size, color):
    img = bpy.data.images.new(name, size, size, alpha=False, float_buffer=False)
    img.generated_color = color
    return img


def label_zones(obj, path, zones):
    """Une zone (index de matériau) par face. À l'avant : couleur de l'image la plus proche.
    Ailleurs (dos, côtés, creux) : zone de la face reconnue la plus proche sur la surface.
    Puis lissage par vote des voisines, pour des limites nettes."""
    import numpy as np
    # Un rôle peut avoir plusieurs couleurs de référence (ombre, lumière) : coat=646362,coat=9f9082
    names = list(dict.fromkeys(z.split("=")[0] for z in zones))
    owner = np.array([names.index(z.split("=")[0]) for z in zones])
    refs = np.array([[int(z.split("=")[1][i:i + 2], 16) / 255 for i in (0, 2, 4)] for z in zones], np.float32)
    ref = np.array([refs[owner == k][0] for k in range(len(names))])
    img = bpy.data.images.load(os.path.abspath(path))
    w, h = img.size
    px = np.array(img.pixels[:], dtype=np.float32).reshape(h, w, 4)
    me = obj.data
    nf, nl = len(me.polygons), len(me.loops)
    uv = np.empty(nl * 2, np.float32)
    me.uv_layers["proj"].data.foreach_get("uv", uv)
    uv = uv.reshape(-1, 2)
    start = np.empty(nf, np.int32)
    me.polygons.foreach_get("loop_start", start)
    total = np.empty(nf, np.int32)
    me.polygons.foreach_get("loop_total", total)
    fuv = np.add.reduceat(uv, start) / total[:, None]
    nrm = np.empty(nf * 3, np.float32)
    me.polygons.foreach_get("normal", nrm)
    front = -nrm.reshape(-1, 3)[:, 1]  # vers l'avant du repère brut
    # Zones d'abord dans l'image (2D, plus fiable) : couleur de référence la plus proche, en donnant
    # moins de poids à la luminosité qu'à la teinte (les ombres ne changent pas de zone), puis
    # filtre de mode (vote des pixels voisins) pour effacer les petites taches.
    def blur(x, r):  # trois flous en boîte successifs ≈ flou gaussien, sur les deux axes
        r = max(1, int(r))
        for axis in (0, 1):
            for _ in range(3):
                c = np.cumsum(np.pad(x, [(r + 1, r) if i == axis else (0, 0) for i in range(x.ndim)],
                                     mode="edge"), axis=axis)
                x = (np.take(c, range(2 * r + 1, c.shape[axis]), axis=axis)
                     - np.take(c, range(0, c.shape[axis] - 2 * r - 1), axis=axis)) / (2 * r + 1)
        return x

    def opp(c):
        r, g, b = c[..., 0], c[..., 1], c[..., 2]
        return np.stack([(r + g + b) / 3 * 0.45, r - g, (r + g) / 2 - b], -1)

    rgb = blur(px[:, :, :3], 2 * w / 1024)
    dist = ((opp(rgb)[:, :, None] - opp(refs)[None, None]) ** 2).sum(-1)
    lab2d = owner[dist.argmin(-1)]
    k = len(names)
    votes = np.stack([blur((lab2d == i).astype(np.float32), 7 * w / 1024) for i in range(k)], -1)
    lab2d = votes.argmax(-1)

    xi = np.clip((fuv[:, 0] * w).astype(int), 0, w - 1)
    yi = np.clip((fuv[:, 1] * h).astype(int), 0, h - 1)
    seen = (front > 0.35) & (px[yi, xi, 3] > 0.5)
    lab = np.full(nf, -1, np.int32)
    lab[seen] = lab2d[yi[seen], xi[seen]]

    # Faces voisines (partageant une arête)
    edge = np.empty(nl, np.int32)
    me.loops.foreach_get("edge_index", edge)
    face = np.repeat(np.arange(nf, dtype=np.int32), total)
    order = np.argsort(edge, kind="stable")
    e, f = edge[order], face[order]
    same = e[1:] == e[:-1]
    a, b = f[:-1][same], f[1:][same]
    A, B = np.r_[a, b], np.r_[b, a]

    for _ in range(4000):  # propagation de proche en proche
        todo = (lab[A] < 0) & (lab[B] >= 0)
        if not todo.any():
            break
        lab[A[todo]] = lab[B[todo]]
    lab[lab < 0] = 0
    for _ in range(3):  # vote des voisines (la face elle-même compte double)
        votes = np.zeros((nf, k), np.int32)
        np.add.at(votes, (A, lab[B]), 1)
        votes[np.arange(nf), lab] += 2
        lab = votes.argmax(1).astype(np.int32)

    me.materials.clear()
    for name in names:
        me.materials.append(bpy.data.materials.new("haut_" + name))
    me.polygons.foreach_set("material_index", lab)
    counts = np.bincount(lab, minlength=k) / nf * 100
    log("zones : " + ", ".join(f"{n} {c:.0f} %" for n, c in zip(names, counts)))
    return names, ref


def zone_material(mat, rgb, nrm, ao):
    """Matériau d'une zone : couleur unie (remplacée par celle du thème dans le jeu), relief, occlusion."""
    if hasattr(mat, "use_nodes") and not mat.use_nodes:
        mat.use_nodes = True
    nt = mat.node_tree
    bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    bsdf.inputs["Base Color"].default_value = (*[c ** 2.2 for c in rgb], 1)
    bsdf.inputs["Roughness"].default_value = 0.7
    t_nrm = nt.nodes.new("ShaderNodeTexImage")
    t_nrm.image = nrm
    nmap = nt.nodes.new("ShaderNodeNormalMap")
    nt.links.new(t_nrm.outputs["Color"], nmap.inputs["Color"])
    nt.links.new(nmap.outputs["Normal"], bsdf.inputs["Normal"])
    t_ao = nt.nodes.new("ShaderNodeTexImage")
    t_ao.image = ao
    grp = bpy.data.node_groups.get("glTF Material Output")
    if grp is None:
        grp = bpy.data.node_groups.new("glTF Material Output", "ShaderNodeTree")
        grp.interface.new_socket("Occlusion", in_out="INPUT", socket_type="NodeSocketFloat")
    g = nt.nodes.new("ShaderNodeGroup")
    g.node_tree = grp
    sep = nt.nodes.new("ShaderNodeSeparateColor")
    nt.links.new(t_ao.outputs["Color"], sep.inputs["Color"])
    nt.links.new(sep.outputs[0], g.inputs["Occlusion"])
    return t_nrm, t_ao


def skin_material(nrm, ao, col=None):
    mat = bpy.data.materials.new("skin")
    if hasattr(mat, "use_nodes") and not mat.use_nodes:
        mat.use_nodes = True
    nt = mat.node_tree
    bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    bsdf.inputs["Base Color"].default_value = (0.75, 0.62, 0.55, 1)
    bsdf.inputs["Roughness"].default_value = 0.7
    t_col = None
    if col is not None:
        t_col = nt.nodes.new("ShaderNodeTexImage")
        t_col.image = col
        nt.links.new(t_col.outputs["Color"], bsdf.inputs["Base Color"])

    t_nrm = nt.nodes.new("ShaderNodeTexImage")
    t_nrm.image = nrm
    nrm.colorspace_settings.name = "Non-Color"
    nmap = nt.nodes.new("ShaderNodeNormalMap")
    nt.links.new(t_nrm.outputs["Color"], nmap.inputs["Color"])
    nt.links.new(nmap.outputs["Normal"], bsdf.inputs["Normal"])

    # Occlusion : exportée en glTF par le groupe « glTF Material Output »
    t_ao = nt.nodes.new("ShaderNodeTexImage")
    t_ao.image = ao
    ao.colorspace_settings.name = "Non-Color"
    grp = bpy.data.node_groups.get("glTF Material Output")
    if grp is None:
        grp = bpy.data.node_groups.new("glTF Material Output", "ShaderNodeTree")
        grp.interface.new_socket("Occlusion", in_out="INPUT", socket_type="NodeSocketFloat")
    g = nt.nodes.new("ShaderNodeGroup")
    g.node_tree = grp
    sep = nt.nodes.new("ShaderNodeSeparateColor")
    nt.links.new(t_ao.outputs["Color"], sep.inputs["Color"])
    nt.links.new(sep.outputs[0], g.inputs["Occlusion"])
    return mat, t_nrm, t_ao, t_col


def bake(scene, high, low, node, kind, nt):
    pairs = node if isinstance(node, list) else [(node, nt)]
    for node, nt in pairs:
        for n in nt.nodes:
            n.select = False
        node.select = True
        nt.nodes.active = node
    bpy.ops.object.select_all(action="DESELECT")
    high.select_set(True)
    low.select_set(True)
    bpy.context.view_layer.objects.active = low
    b = scene.render.bake
    b.use_selected_to_active = True
    b.cage_extrusion = 0.02
    b.max_ray_distance = 0.06
    b.margin = 8
    if kind == "NORMAL":
        b.normal_space = "TANGENT"
        bpy.ops.object.bake(type="NORMAL")
    elif kind == "EMIT":
        scene.cycles.samples = 4
        bpy.ops.object.bake(type="EMIT")
    elif kind == "COLOR":
        scene.cycles.samples = 4
        bpy.ops.object.bake(type="DIFFUSE", pass_filter={"COLOR"})
    elif kind == "ROUGHNESS":
        scene.cycles.samples = 4
        bpy.ops.object.bake(type="ROUGHNESS")
    else:
        scene.cycles.samples = 64
        bpy.ops.object.bake(type="AO")


def _bark_tube(name, pts, radii, mat):
    """Tube d'écorce le long de points (x, y, z), rayon variable, relief bruité."""
    cu = bpy.data.curves.new(name, "CURVE")
    cu.dimensions = "3D"
    cu.bevel_depth = 1.0
    cu.bevel_resolution = 5
    cu.resolution_u = 10
    cu.use_fill_caps = True
    sp = cu.splines.new("BEZIER")
    sp.bezier_points.add(len(pts) - 1)
    for bp, p, r in zip(sp.bezier_points, pts, radii):
        bp.co = p
        bp.handle_left_type = bp.handle_right_type = "AUTO"
        bp.radius = r
    obj = bpy.data.objects.new(name, cu)
    bpy.context.scene.collection.objects.link(obj)
    select_only(obj)
    bpy.ops.object.convert(target="MESH")
    obj = bpy.context.active_object
    tex = bpy.data.textures.new(name + "_bruit", "CLOUDS")
    tex.noise_scale = 0.06
    sub = obj.modifiers.new("lisse", "SUBSURF")
    sub.levels = 1
    disp = obj.modifiers.new("ecorce", "DISPLACE")
    disp.texture = tex
    disp.strength = 0.025
    disp.mid_level = 0.5
    bpy.ops.object.modifier_apply(modifier="lisse")
    bpy.ops.object.modifier_apply(modifier="ecorce")
    bpy.ops.object.shade_smooth()
    obj.data.materials.append(mat)
    return obj


def perch(obj, lift):
    """Moïse : Rodin a perdu sa branche. On surélève l'oiseau et on la reconstruit sous ses pattes :
    un tronc sorti du socle, une branche horizontale où s'agrippent les griffes, un rameau."""
    import numpy as np
    me = obj.data
    co = np.empty(len(me.vertices) * 3)
    me.vertices.foreach_get("co", co)
    co = co.reshape(-1, 3) @ np.array(obj.matrix_world.to_3x3()).T + np.array(obj.matrix_world.translation)
    zmin, zmax = co[:, 2].min(), co[:, 2].max()
    # Pattes : les points les plus bas, mais au centre (le bout de la queue descend aussi bas)
    mid = (co[:, :2].min(0) + co[:, :2].max(0)) / 2
    half = (co[:, :2].max(0) - co[:, :2].min(0)) / 2
    core = co[(np.abs(co[:, :2] - mid) < half * 0.45).all(1)]
    zmin = core[:, 2].min()
    feet = core[core[:, 2] < zmin + 0.06 * (zmax - zmin)]
    fx, fy = feet[:, 0].mean(), feet[:, 1].mean()
    x0, x1 = feet[:, 0].min(), feet[:, 0].max()
    obj.location.z += lift
    select_only(obj)
    bpy.ops.object.transform_apply(location=True, rotation=False, scale=False)

    mat = bpy.data.materials.new("bark")  # rôle de matériau lu par le jeu (teinté pour les Noirs)
    if hasattr(mat, "use_nodes") and not mat.use_nodes:
        mat.use_nodes = True
    bsdf = next(n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    bsdf.inputs["Base Color"].default_value = (0.22, 0.13, 0.07, 1)
    bsdf.inputs["Roughness"].default_value = 0.9

    r = 0.085                      # rayon de la branche sous les griffes
    bz = zmin + lift + r * 0.35    # centre au-dessus du bout des griffes : elles s'enfoncent dans l'écorce
    span = max(x1 - x0, 0.35)
    left, right = x0 - span * 0.9, x1 + span * 0.7
    _bark_tube("branche", [(left, fy + 0.04, bz - 0.06), (fx, fy, bz), (right, fy - 0.03, bz + 0.05)],
               [r * 0.55, r, r * 0.6], mat)
    tx = left + (fx - left) * 0.35  # le tronc rejoint la branche côté gauche, sous la queue
    _bark_tube("tronc", [(tx + 0.12, fy + 0.06, TOP - 0.02), (tx + 0.02, fy + 0.02, (TOP + bz) / 2),
                         (tx, fy + 0.03, bz - 0.04)], [r * 1.7, r * 1.25, r * 0.95], mat)
    _bark_tube("rameau", [(right - 0.05, fy - 0.03, bz + 0.04), (right + 0.08, fy - 0.08, bz + 0.2),
                          (right + 0.06, fy - 0.1, bz + 0.33)], [r * 0.45, r * 0.3, r * 0.12], mat)
    log(f"perchoir : oiseau surélevé de {lift}, pattes en ({fx:.2f}, {fy:.2f}), branche à z = {bz:.2f}")


def pedestal():
    bm = bmesh.new()
    verts = [bm.verts.new((r, 0, z)) for r, z in PEDESTAL]
    edges = [bm.edges.new((a, b)) for a, b in zip(verts, verts[1:])]
    bmesh.ops.spin(bm, geom=verts + edges, cent=(0, 0, 0), axis=(0, 0, 1),
                   steps=56, angle=2 * math.pi, use_duplicate=False)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new("socle")
    bm.to_mesh(me)
    bm.free()
    obj = bpy.data.objects.new("socle", me)
    bpy.context.scene.collection.objects.link(obj)
    mat = bpy.data.materials.new("body")
    if hasattr(mat, "use_nodes") and not mat.use_nodes:
        mat.use_nodes = True
    bsdf = next(n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    bsdf.inputs["Base Color"].default_value = (0.45, 0.28, 0.15, 1)
    me.materials.append(mat)
    return obj


def preview(scene, path):
    # Cadrage sur la hauteur réelle (le personnage a pu être réduit pour tenir sur le socle)
    height = max((o.matrix_world @ Vector(c)).z for o in scene.objects if o.type == "MESH" for c in o.bound_box)
    world = bpy.data.worlds.new("fond")
    scene.world = world
    if hasattr(world, "use_nodes") and not world.use_nodes:
        world.use_nodes = True
    bg = next(n for n in world.node_tree.nodes if n.type == "BACKGROUND")
    bg.inputs["Color"].default_value = (0.32, 0.33, 0.36, 1)
    bg.inputs["Strength"].default_value = 0.6

    sun = bpy.data.objects.new("soleil", bpy.data.lights.new("soleil", "SUN"))
    sun.data.energy = 3.5
    sun.rotation_euler = (math.radians(50), 0, math.radians(-35))
    scene.collection.objects.link(sun)

    target = bpy.data.objects.new("cible", None)
    target.location = (0, 0, height * 0.48)
    scene.collection.objects.link(target)
    cam = bpy.data.objects.new("camera", bpy.data.cameras.new("camera"))
    cam.data.lens = 70
    scene.collection.objects.link(cam)
    track = cam.constraints.new("TRACK_TO")
    track.target = target
    track.track_axis = "TRACK_NEGATIVE_Z"
    track.up_axis = "UP_Y"
    scene.camera = cam

    scene.cycles.samples = 48
    scene.cycles.use_denoising = True
    scene.render.resolution_x = scene.render.resolution_y = 448
    d = height * 2.7
    base, ext = os.path.splitext(path)
    for name, ang in (("34", -35), ("face", 0), ("dos", 180)):
        a = math.radians(ang)
        cam.location = (d * math.sin(a), -d * math.cos(a), height * 0.75)
        scene.render.filepath = f"{base}-{name}{ext or '.png'}"
        bpy.ops.render.render(write_still=True)
        log(f"aperçu {scene.render.filepath}")


def as_emission(mat, socket):
    """Fait passer une entrée du matériau (couleur, métal) par l'émission, le temps du transfert.
    (Le transfert « couleur » de Blender met à zéro les surfaces métalliques : dorures noires.)"""
    nt = mat.node_tree
    bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    out = next(n for n in nt.nodes if n.type == "OUTPUT_MATERIAL")
    emit = nt.nodes.new("ShaderNodeEmission")
    links = bsdf.inputs[socket].links
    if links:
        nt.links.new(links[0].from_socket, emit.inputs["Color"])
    else:
        v = bsdf.inputs[socket].default_value
        emit.inputs["Color"].default_value = tuple(v) if hasattr(v, "__len__") else (v, v, v, 1)
    nt.links.new(emit.outputs["Emission"], out.inputs["Surface"])


def rebake_textured(a, scene, high):
    """Version légère (a.faces) dépliée à neuf, textures transférées depuis le modèle complet :
    couleur, relief (avec la carte de relief d'origine), rugosité, métal, occlusion."""
    low = high.copy()
    low.data = high.data.copy()
    scene.collection.objects.link(low)
    decimate(low, a.faces)
    select_only(low)
    bpy.ops.object.shade_smooth()
    low.data.materials.clear()
    for layer in list(low.data.uv_layers):
        low.data.uv_layers.remove(layer)
    low.data.uv_layers.new(name="UVMap")
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.003)
    bpy.ops.object.mode_set(mode="OBJECT")
    log(f"version légère : {len(low.data.polygons)} faces, UV dépliées")

    T = a.tex
    imgs = {k: image(k, T, c) for k, c in (("couleur", (0.5, 0.5, 0.5, 1)), ("relief", (0.5, 0.5, 1, 1)),
                                         ("rugosite", (0.6, 0.6, 0.6, 1)), ("metal", (0, 0, 0, 1)),
                                         ("occlusion", (1, 1, 1, 1)))}
    for k in ("relief", "rugosite", "metal", "occlusion"):
        imgs[k].colorspace_settings.name = "Non-Color"
    mat = bpy.data.materials.new("skin")
    if hasattr(mat, "use_nodes") and not mat.use_nodes:
        mat.use_nodes = True
    nt = mat.node_tree
    bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    nodes = {}
    for k, img in imgs.items():
        n = nt.nodes.new("ShaderNodeTexImage")
        n.image = img
        nodes[k] = n
    nt.links.new(nodes["couleur"].outputs["Color"], bsdf.inputs["Base Color"])
    nt.links.new(nodes["rugosite"].outputs["Color"], bsdf.inputs["Roughness"])
    nt.links.new(nodes["metal"].outputs["Color"], bsdf.inputs["Metallic"])
    nmap = nt.nodes.new("ShaderNodeNormalMap")
    nt.links.new(nodes["relief"].outputs["Color"], nmap.inputs["Color"])
    nt.links.new(nmap.outputs["Normal"], bsdf.inputs["Normal"])
    grp = bpy.data.node_groups.get("glTF Material Output")
    if grp is None:
        grp = bpy.data.node_groups.new("glTF Material Output", "ShaderNodeTree")
        grp.interface.new_socket("Occlusion", in_out="INPUT", socket_type="NodeSocketFloat")
    g = nt.nodes.new("ShaderNodeGroup")
    g.node_tree = grp
    sep = nt.nodes.new("ShaderNodeSeparateColor")
    nt.links.new(nodes["occlusion"].outputs["Color"], sep.inputs["Color"])
    nt.links.new(sep.outputs[0], g.inputs["Occlusion"])
    low.data.materials.append(mat)

    for kind, k in (("NORMAL", "relief"), ("ROUGHNESS", "rugosite"), ("AO", "occlusion")):
        bake(scene, high, low, nodes[k], kind, nt)
        log(f"{k} transféré(e)")
    for socket, k in (("Base Color", "couleur"), ("Metallic", "metal")):
        for m in high.data.materials:
            as_emission(m, socket)
        bake(scene, high, low, nodes[k], "EMIT", nt)
        log(f"{k} transféré(e)")
    bpy.data.objects.remove(high, do_unlink=True)
    return low


def finish_textured(a, scene):
    """Modèle déjà texturé : on garde maillage, UV et textures."""
    obj = import_mesh(os.path.abspath(a.entree), keep_materials=True)
    log(f"importé : {len(obj.data.polygons)} faces, matériaux {[m.name for m in obj.data.materials]}")
    if a.socle_image:
        cut_image_base(obj)
    if a.retirer:
        remove_zones(obj, a.retirer)
    clean(obj, min_frac=0.002)  # seulement les miettes : la canne peut être un morceau à part
    if a.rotation:
        obj.rotation_euler.z = math.radians(a.rotation)
        select_only(obj)
        bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)
    normalize(obj, a.hauteur, a.rayon, a.centre)
    if len(obj.data.polygons) > a.faces * 1.2:
        obj = rebake_textured(a, scene, obj)
    select_only(obj)
    bpy.ops.object.shade_smooth()
    obj.name = "personnage"
    for i, m in enumerate(obj.data.materials):
        m.name = "skin" if i == 0 else f"skin{i}"  # « body » est réservé au socle
    for img in bpy.data.images:
        if img.size[0] > a.tex:
            img.scale(a.tex, a.tex * img.size[1] // img.size[0])
    log(f"{len(obj.data.polygons)} faces, textures ramenées à {a.tex} px")
    if a.perchoir:
        perch(obj, a.perchoir)
    pedestal()
    bpy.ops.export_scene.gltf(filepath=os.path.abspath(a.sortie), export_format="GLB",
                              export_apply=True, export_yup=True,
                              export_image_format="WEBP", export_image_quality=88)
    log(f"{a.sortie} : {os.path.getsize(a.sortie) / 1024:.0f} Ko")
    if a.apercu:
        preview(scene, os.path.abspath(a.apercu))


def main():
    a = args()
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    cpu_only(scene)

    if a.garder_textures:
        return finish_textured(a, scene)
    high = import_mesh(os.path.abspath(a.entree))
    log(f"importé : {len(high.data.polygons)} faces")
    if a.image:
        project_colors(high, a.image)  # avant toute coupe : la boîte doit correspondre à l'image
    if a.socle_image:
        cut_image_base(high)
    if a.retirer:
        remove_zones(high, a.retirer)
    clean(high)
    if a.rotation:
        high.rotation_euler.z = math.radians(a.rotation)
        select_only(high)
        bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)
    normalize(high, a.hauteur, a.rayon, a.centre)
    decimate(high, HIGH_MAX)
    zones = None
    if a.zones and a.image:
        zones = label_zones(high, a.image, a.zones.split(","))
    select_only(high)
    bpy.ops.object.shade_smooth()

    low = high.copy()
    low.data = high.data.copy()
    low.name = "personnage"
    scene.collection.objects.link(low)
    decimate(low, a.faces)
    select_only(low)
    bpy.ops.object.shade_smooth()
    if not zones:
        low.data.materials.clear()
    for layer in list(low.data.uv_layers):  # la projection reste sur la version lourde
        low.data.uv_layers.remove(layer)
    low.data.uv_layers.new(name="UVMap")
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.004)
    bpy.ops.object.mode_set(mode="OBJECT")
    log(f"version légère : {len(low.data.polygons)} faces, UV dépliées")

    nrm = image("relief", a.tex, (0.5, 0.5, 1, 1))
    ao = image("occlusion", a.tex, (1, 1, 1, 1))
    col = None
    if zones:
        # Matériaux des zones : propres à la version légère (la lourde garde les siens pour le transfert)
        names, ref = zones
        import numpy as np
        idx = np.empty(len(low.data.polygons), np.int32)
        low.data.polygons.foreach_get("material_index", idx)  # remis à zéro par clear()
        low.data.materials.clear()
        nodes = []
        for name, rgb in zip(names, ref):
            m = bpy.data.materials.new(name)
            m.name = name  # nom exact : c'est le rôle de matériau lu par le jeu
            low.data.materials.append(m)
            nodes.append((m, *zone_material(m, rgb, nrm, ao)))
        low.data.polygons.foreach_set("material_index", idx)
        low.data.update()
        log("zones de la version légère : " + ", ".join(
            f"{n} {c}" for n, c in zip(names, np.bincount(idx, minlength=len(names)))))
        n_nrm = [(t, m.node_tree) for m, t, _ in nodes]
        n_ao = [(t, m.node_tree) for m, _, t in nodes]
        bake(scene, high, low, n_nrm, "NORMAL", None)
        log("relief transféré")
        bake(scene, high, low, n_ao, "AO", None)
        log("occlusion transférée")
    else:
        col = image("couleur", a.tex, (0.75, 0.62, 0.55, 1)) if a.image else None
        mat, t_nrm, t_ao, t_col = skin_material(nrm, ao, col)
        low.data.materials.append(mat)
        if col is not None:
            bake(scene, high, low, t_col, "EMIT", mat.node_tree)
            log("couleurs transférées")
        bake(scene, high, low, t_nrm, "NORMAL", mat.node_tree)
        log("relief transféré")
        bake(scene, high, low, t_ao, "AO", mat.node_tree)
        log("occlusion transférée")

    out_dir = os.path.dirname(os.path.abspath(a.sortie))
    os.makedirs(out_dir, exist_ok=True)
    stem = os.path.splitext(os.path.basename(a.sortie))[0]
    for img in (nrm, ao, col):
        if img is None:
            continue
        img.filepath_raw = os.path.join(out_dir, f"{stem}-{img.name}.png")
        img.file_format = "PNG"
        img.save()

    bpy.data.objects.remove(high, do_unlink=True)
    pedestal()

    bpy.ops.export_scene.gltf(filepath=os.path.abspath(a.sortie), export_format="GLB",
                              export_apply=True, export_yup=True,
                              # WebP : textures 3 à 5 fois plus légères que PNG (EXT_texture_webp, lu par Three.js)
                              export_image_format="WEBP", export_image_quality=88)
    log(f"{a.sortie} : {os.path.getsize(a.sortie) / 1024:.0f} Ko")

    if a.apercu:
        preview(scene, os.path.abspath(a.apercu))


main()
