// Thème « La Ferme des animaux » (George Orwell) : chaque pièce est un personnage du roman.
//   Roi : Napoléon · Dame : Brille-Babil · Tours : Douce (aile dame) et Malabar (aile roi)
//   Fous : Moïse (aile dame) et Minimus (aile roi) · Cavaliers : les chiens de Napoléon
//   Pions : les poules (modèle détaillé ; à défaut, les moutons construits ici)
// Script classique (chargé à la demande par pieces.js). Dépend de : THREE, pieces.js.
//
// Conventions (comme les thèmes Médiéval et Dragons) :
//   - socle de bois de y = 0 à 0.3, personnage posé dessus (TOP) ;
//   - le personnage regarde vers +z (sa droite est en -x) ;
//   - chaque maillage porte un « rôle » qui choisit son matériau selon le camp ;
//   - une pièce pas encore modélisée prend le modèle classique (voir pieces.js).
// Les camps se distinguent par le bois du socle et par la robe des animaux :
// Blancs = mouton blanc, cochon rose, chevaux clairs ; Noirs = mouton noir, Berkshire noir, chevaux bais.
(() => {
  const TAU = Math.PI * 2;
  const UP = new THREE.Vector3(0, 1, 0);
  const TOP = 0.3;

  // Petit générateur pseudo-aléatoire reproductible : chaque modèle est identique d'une partie à l'autre
  const rng = seed => () => (seed = (seed * 16807) % 2147483647) / 2147483647;

  // ===========================================================================
  // Textures générées
  // ===========================================================================
  // Bouclettes de laine : relief fin posé sur la toison (déjà bosselée par sa géométrie)
  function curlTexture() {
    const S = 256, c = document.createElement('canvas');
    c.width = c.height = S;
    const g = c.getContext('2d');
    g.fillStyle = '#808080'; g.fillRect(0, 0, S, S);
    const rnd = rng(31);
    for (let i = 0; i < 900; i++) {
      const x = rnd() * S, y = rnd() * S, r = 3 + rnd() * 5;
      for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) {
        const gr = g.createRadialGradient(x + ox - r * 0.3, y + oy - r * 0.3, 0.5, x + ox, y + oy, r);
        gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(0.7, 'rgba(150,150,150,0.5)'); gr.addColorStop(1, 'rgba(0,0,0,0.6)');
        g.fillStyle = gr;
        g.beginPath(); g.arc(x + ox, y + oy, r, 0, TAU); g.fill();
      }
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(9, 6);
    return t;
  }
  const curls = curlTexture();

  // Poil court : fines stries pour les cochons, les chevaux et les chiens
  function hairTexture() {
    const S = 256, c = document.createElement('canvas');
    c.width = c.height = S;
    const g = c.getContext('2d');
    g.fillStyle = '#808080'; g.fillRect(0, 0, S, S);
    const rnd = rng(77);
    for (let i = 0; i < 2600; i++) {
      const x = rnd() * S, y = rnd() * S, l = 4 + rnd() * 8, v = rnd() < 0.5 ? 40 : 210;
      g.strokeStyle = `rgba(${v},${v},${v},0.35)`; g.lineWidth = 1;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + (rnd() - 0.5) * 2, y + l); g.stroke();
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(4, 4);
    return t;
  }
  const hairBump = hairTexture();

  // Feuillet de Brille-Babil : colonnes de chiffres qui « prouvent » que tout va mieux
  function paperTexture() {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 512;
    const g = c.getContext('2d');
    g.fillStyle = '#f1e9d6'; g.fillRect(0, 0, 256, 512);
    g.fillStyle = '#2a2420';
    g.font = 'bold 30px serif'; g.textAlign = 'center';
    g.fillText('PRODUCTION', 128, 46);
    g.font = '22px serif'; g.textAlign = 'left';
    const rows = ['Blé', 'Orge', 'Avoine', 'Foin', 'Navets', 'Œufs', 'Lait', 'Pierre', 'Charbon', 'Sucre'];
    rows.forEach((r, i) => {
      const y = 92 + i * 40;
      g.fillText(r, 18, y);
      g.textAlign = 'right'; g.fillText(`+${[200, 300, 250, 180, 400, 500, 220, 350, 280, 600][i]} %`, 238, y); g.textAlign = 'left';
      g.fillRect(18, y + 8, 220, 1);
    });
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  }
  const paperMap = paperTexture();

  // Panneau de Minimus : le poème peint en blanc sur le mur de la grange, sous le portrait
  // de Napoléon de profil (vers traduits librement de l'original d'Orwell)
  function poemTexture() {
    const c = document.createElement('canvas');
    c.width = 320; c.height = 448;
    const g = c.getContext('2d');
    g.fillStyle = '#2b2722'; g.fillRect(0, 0, 320, 448);
    g.strokeStyle = '#efe8d8'; g.fillStyle = '#efe8d8'; g.lineWidth = 5;
    // Portrait de profil : tête de verrat, groin vers la droite, oreille dressée
    // crâne rond, long groin terminé par un disque plat, oreille dressée, bajoue
    g.beginPath(); g.arc(150, 108, 46, 0, TAU); g.fill();
    g.beginPath(); g.moveTo(170, 82); g.quadraticCurveTo(215, 88, 236, 98); g.lineTo(236, 132);
    g.quadraticCurveTo(205, 140, 172, 140); g.closePath(); g.fill();
    g.beginPath(); g.ellipse(238, 115, 8, 19, 0, 0, TAU); g.fill();
    g.beginPath(); g.moveTo(122, 76); g.lineTo(128, 26); g.lineTo(162, 66); g.closePath(); g.fill();
    g.beginPath(); g.arc(150, 146, 30, 0, Math.PI); g.fill();
    g.fillStyle = '#2b2722';
    g.beginPath(); g.arc(178, 96, 6, 0, TAU); g.fill();                       // œil
    g.beginPath(); g.ellipse(239, 110, 2.5, 5, 0, 0, TAU); g.fill();          // narine
    g.fillRect(186, 132, 40, 3);                                              // bouche
    g.beginPath(); g.moveTo(166, 88); g.lineTo(190, 84); g.lineTo(190, 89); g.closePath(); g.fill(); // sourcil froncé
    g.fillStyle = '#efe8d8';
    g.strokeRect(84, 24, 186, 150);
    g.textAlign = 'center';
    g.font = 'bold 28px serif'; g.fillText('CAMARADE', 160, 214); g.fillText('NAPOLÉON', 160, 246);
    g.font = 'italic 21px serif';
    ['Ami de l’orphelin !', 'Source de bonheur !', 'Maître de l’auge !', 'Mon âme brûle', 'quand je vois', 'ton œil calme…'].forEach((l, i) => g.fillText(l, 160, 286 + i * 27));
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  }
  const poemMap = poemTexture();

  // ===========================================================================
  // Matériaux
  // ===========================================================================
  const std = (color, roughness, metalness = 0, extra = {}) =>
    new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra });
  // Laine et fourrure : reflet velouté (sheen) propre aux matières fibreuses
  const fiber = (color, sheen, extra = {}) => new THREE.MeshPhysicalMaterial({
    color, roughness: 0.95, sheen: 1, sheenRoughness: 0.55, sheenColor: sheen, ...extra,
  });

  const PALETTE = {
    white: {
      wool: 0xf1ebdc, woolSheen: 0xffffff, face: 0xeadccb, faceDark: 0x7d665c, earIn: 0xe7b3a6,
      pig: 0xf2c6b4, pigDark: 0xd99c8a, snout: 0xe9a593, pigPoint: 0xf7dccf,
      accent: 0x2f6b3a, accent2: 0xe9e1c8, brass: 0xd8b45c,
      coat: 0x1f3a27, coatTrim: 0xe6dcc0, breeches: 0xcdb48c, leather: 0x6b4528,
      dog: 0xc9a473, dogMark: 0x3a2c22, // fauve de molosse, masque noir
      boxer: 0x6e4026, boxerMane: 0x1c1410, clover: 0xa8693a, cloverMane: 0xe2c896,
    },
    black: {
      wool: 0x2b2624, woolSheen: 0x6e6460, face: 0x1d1a19, faceDark: 0x0f0d0c, earIn: 0x4a3330,
      pig: 0x2a2423, pigDark: 0x171312, snout: 0xd9b4a8, pigPoint: 0xe8e0d4,
      accent: 0x8c1d24, accent2: 0x2a2224, brass: 0xa88536,
      coat: 0x18171b, coatTrim: 0x8c1d24, breeches: 0x8f7a58, leather: 0x3d2616,
      dog: 0x1f1c1b, dogMark: 0x7a5232,
      boxer: 0x241a15, boxerMane: 0x0e0b09, clover: 0x4a3324, cloverMane: 0x1e1712,
    },
  };

  const matCache = {};
  function materials(white) {
    const key = white ? 'white' : 'black';
    if (matCache[key]) return matCache[key];
    const c = PALETTE[key];
    return (matCache[key] = {
      body: white ? whiteMat : blackMat, // socle : le bois du thème classique
      wool: fiber(c.wool, c.woolSheen, { bumpMap: curls, bumpScale: 1.2 }),
      face: std(c.face, 0.7, 0, { bumpMap: hairBump, bumpScale: 0.3 }),
      faceDark: std(c.faceDark, 0.75),
      earIn: std(c.earIn, 0.6),
      pig: std(c.pig, 0.62, 0, { bumpMap: hairBump, bumpScale: 0.25 }),
      pigDark: std(c.pigDark, 0.7),
      snout: std(c.snout, 0.5),
      hoof: std(0x2f2925, 0.45),
      eye: std(0x0b0908, 0.15),
      eyeWhite: std(0xf2ede4, 0.35),
      iris: std(white ? 0xb98a3a : 0xa8782c, 0.25),
      mouth: std(0x3a1614, 0.6),
      accent: std(c.accent, 0.65),
      accent2: std(c.accent2, 0.7),
      brass: std(c.brass, 0.32, 0.8),
      pigPoint: std(c.pigPoint, 0.6, 0, { bumpMap: hairBump, bumpScale: 0.25 }),
      tusk: std(0xeee3c8, 0.35),
      coat: std(c.coat, 0.78, 0, { bumpMap: hairBump, bumpScale: 0.15 }),
      coatTrim: std(c.coatTrim, 0.7),
      breeches: std(c.breeches, 0.88),
      leather: std(c.leather, 0.5),
      hat: std(0x121114, 0.7),
      gold: std(0xd9b45a, 0.3, 0.85),
      silver: std(0xcfd2d8, 0.25, 0.9),
      ribbon: std(0x2f7a3e, 0.6), // l'ordre de la Bannière verte, que Napoléon s'est décerné
      paper: std(0xffffff, 0.85, 0, { map: paperMap, side: THREE.DoubleSide }),
      plank: std(white ? 0xa47a4c : 0x6e4c2e, 0.85, 0, { bumpMap: hairBump, bumpScale: 0.6 }),
      paint: std(0xf6f3ea, 0.15),
      tin: std(0x8d9096, 0.4, 0.7),
      bristle: std(0x2a2018, 0.9),
      dog: std(c.dog, 0.8, 0, { bumpMap: hairBump, bumpScale: 0.5 }),
      dogMark: std(c.dogMark, 0.8, 0, { bumpMap: hairBump, bumpScale: 0.5 }),
      ruff: fiber(c.dog, white ? 0x8a6c48 : 0x4a4440, { bumpMap: hairBump, bumpScale: 1 }),
      nose: std(0x141110, 0.3),
      gum: std(0x7a2a2c, 0.45),
      tooth: std(0xf1ead8, 0.3),
      tongue: std(0xb8565a, 0.45),
      boxer: std(c.boxer, 0.55, 0, { bumpMap: hairBump, bumpScale: 0.35 }),
      boxerMane: fiber(c.boxerMane, 0x6a5a50, { bumpMap: hairBump, bumpScale: 1.2 }),
      clover: std(c.clover, 0.55, 0, { bumpMap: hairBump, bumpScale: 0.35 }),
      cloverMane: fiber(c.cloverMane, white ? 0xfff0d0 : 0x5a4a40, { bumpMap: hairBump, bumpScale: 1.2 }),
      blaze: std(0xf3eee4, 0.6, 0, { bumpMap: hairBump, bumpScale: 0.3 }),
      feather: fiber(0xefe9dc, 0xffffff, { bumpMap: hairBump, bumpScale: 1.4 }),
      horseHoof: std(0x3a332c, 0.5),
      muzzle: std(0x3a2e2a, 0.6),
      duck: fiber(0xf2d24a, 0xfff2a0),
      raven: new THREE.MeshPhysicalMaterial({ color: 0x15161b, roughness: 0.35, metalness: 0.1, iridescence: 0.6,
        iridescenceIOR: 1.6, iridescenceThicknessRange: [250, 450], bumpMap: hairBump, bumpScale: 0.4 }),
      ravenBeak: std(0x1b1b1f, 0.3, 0.1),
      ravenLeg: std(0x2a2a2e, 0.55),
      sugar: std(0xfbf8f2, 0.55, 0, { bumpMap: curls, bumpScale: 0.25 }),
      cloud: fiber(0xf4f6fa, 0xffffff),
      linseed: std(0x8a6236, 0.8, 0, { bumpMap: hairBump, bumpScale: 0.8 }),
      clover: std(0x4f8a3a, 0.7),
      cloverFlower: std(0xe0a0c0, 0.7),
      poem: std(0xffffff, 0.85, 0, { map: poemMap }),
      laurel: std(0x5d7a32, 0.6),
      scarf: std(white ? 0xa8322c : 0x2f6b3a, 0.8, 0, { side: THREE.DoubleSide }),
      quill: std(0xf4efe4, 0.7, 0, { side: THREE.DoubleSide }),
      velvet: fiber(white ? 0x2c3a6e : 0x4a2a5a, white ? 0x8090d0 : 0xa080b0),
      ink: std(0x0d0d14, 0.15),
      beak: std(0xe08a2a, 0.45),
    });
  }

  // ===========================================================================
  // Outils de modélisation
  // ===========================================================================
  function mesh(geo, role, x = 0, y = 0, z = 0) {
    const m = new THREE.Mesh(geo);
    m.position.set(x, y, z);
    m.userData.role = role;
    m.castShadow = m.receiveShadow = true;
    return m;
  }
  // Ellipsoïde (sphère aplatie) de demi-axes rx, ry, rz
  function ellipsoid(rx, ry, rz, role, x = 0, y = 0, z = 0, seg = 24) {
    const m = mesh(new THREE.SphereGeometry(1, seg, Math.max(8, seg * 0.7 | 0)), role, x, y, z);
    m.scale.set(rx, ry, rz);
    return m;
  }

  // Segment arrondi (patte, bras…) entre deux points ; r2 : rayon différent au bout (tronc de cône)
  function limb(a, b, r, role, r2) {
    const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
    const dir = B.clone().sub(A);
    const len = dir.length();
    const geo = r2 === undefined
      ? new THREE.CapsuleGeometry(r, len, 6, 14)
      : new THREE.CylinderGeometry(r2, r, len, 16);
    const m = mesh(geo, role);
    m.position.copy(A).add(B).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(UP, dir.normalize());
    return m;
  }

  // Surface de révolution lissée (profil [rayon, y]) ; phi = 0 correspond à l'avant (+z)
  function revolve(points, { segments = 40, smooth = true } = {}) {
    let pts = points.map(([r, y]) => new THREE.Vector2(r, y));
    if (smooth) pts = new THREE.SplineCurve(pts).getPoints(points.length * 6).map(p => new THREE.Vector2(Math.max(0, p.x), p.y));
    const g = new THREE.LatheGeometry(pts, segments);
    g.computeVertexNormals();
    return g;
  }

  // Volume « loft » le long d'une colonne vertébrale : outil principal pour les corps,
  // les cous, les têtes et les museaux. Chaque section : { p: [x, y, z], w, h, hb?, e? }
  //   w = demi-largeur (axe x), h = demi-hauteur au-dessus de l'axe, hb = en dessous (ventre),
  //   e = exposant de superellipse (2 = ovale, plus grand = plus carré).
  // Les sections sont interpolées en douceur ; les deux bouts sont fermés.
  function loft(sections, { rings = 48, sides = 28 } = {}) {
    const n = sections.length;
    const P = new THREE.CatmullRomCurve3(sections.map(s => new THREE.Vector3(...s.p)), false, 'centripetal');
    const num = k => new THREE.CatmullRomCurve3(sections.map((s, i) => new THREE.Vector3(i, s[k] ?? (k === 'hb' ? s.h : k === 'e' ? 2 : 0), 0)));
    const W = num('w'), H = num('h'), HB = num('hb'), E = num('e');
    const L = new THREE.Vector3(1, 0, 0), T = new THREE.Vector3(), U = new THREE.Vector3(), C = new THREE.Vector3();
    const pos = [], uv = [], idx = [];
    const se = (c, e) => Math.sign(c) * Math.pow(Math.abs(c), 2 / e);
    for (let i = 0; i <= rings; i++) {
      const t = i / rings;
      P.getPoint(t, C);
      P.getTangent(t, T);
      U.crossVectors(T, L).normalize();
      // Paramètres lus à la même abscisse que la courbe (indices des sections)
      const at = curve => curve.getPoint(t).y;
      const w = Math.max(0, at(W)), h = Math.max(0, at(H)), hb = Math.max(0, at(HB)), e = Math.max(1, at(E));
      for (let j = 0; j < sides; j++) {
        const a = (j / sides) * TAU;
        const cx = se(Math.cos(a), e), cy = se(Math.sin(a), e);
        const hh = cy >= 0 ? h : hb;
        pos.push(C.x + L.x * w * cx + U.x * hh * cy, C.y + L.y * w * cx + U.y * hh * cy, C.z + L.z * w * cx + U.z * hh * cy);
        uv.push(j / sides, t);
      }
    }
    for (let i = 0; i < rings; i++) {
      for (let j = 0; j < sides; j++) {
        const a = i * sides + j, b = i * sides + (j + 1) % sides, c = a + sides, d = b + sides;
        idx.push(a, b, c, b, d, c); // faces tournées vers l'extérieur
      }
    }
    // Bouchons : un sommet au centre de chaque extrémité
    for (const [ring, t, flip] of [[0, 0, true], [rings, 1, false]]) {
      const ci = pos.length / 3;
      const p = P.getPoint(t);
      pos.push(p.x, p.y, p.z); uv.push(0.5, t);
      for (let j = 0; j < sides; j++) {
        const a = ring * sides + j, b = ring * sides + (j + 1) % sides;
        if (flip) idx.push(ci, b, a); else idx.push(ci, a, b);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }

  // Toison : ellipsoïde couvert de grosses mèches arrondies (bosses réparties au hasard)
  function fleece(rx, ry, rz, { seed = 1, count = 90, amp = 0.16, size = 0.32, seg = 56 } = {}) {
    const g = new THREE.SphereGeometry(1, seg, seg * 0.75 | 0);
    const rnd = rng(seed);
    const bumps = [];
    for (let i = 0; i < count; i++) {
      const u = rnd() * 2 - 1, a = rnd() * TAU, s = Math.sqrt(1 - u * u);
      bumps.push([s * Math.cos(a), u, s * Math.sin(a), size * (0.6 + rnd() * 0.7), 0.6 + rnd() * 0.5]);
    }
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      let b = 0;
      for (const [bx, by, bz, r, k] of bumps) {
        const d = Math.acos(Math.min(1, x * bx + y * by + z * bz)) / r;
        if (d < 1) b = Math.max(b, k * Math.sqrt(1 - d * d)); // mèche en dôme : creux net entre deux mèches
      }
      const f = 1 + amp * (b - 0.5);
      p.setXYZ(i, x * rx * f, y * ry * f, z * rz * f);
    }
    g.computeVertexNormals();
    return g;
  }

  // Tube effilé le long d'une courbe (queue, fouet, mèche) : rayon r0 au début, r1 au bout
  function taper(points, r0, r1, role, { seg = 40, sides = 10 } = {}) {
    const curve = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p)));
    const g = new THREE.TubeGeometry(curve, seg, 1, sides, false);
    const p = g.attributes.position, C = new THREE.Vector3(), Q = new THREE.Vector3();
    for (let i = 0; i <= seg; i++) {
      curve.getPointAt(i / seg, C);
      const r = r0 + (r1 - r0) * (i / seg);
      for (let j = 0; j <= sides; j++) {
        const k = i * (sides + 1) + j;
        Q.fromBufferAttribute(p, k).sub(C).multiplyScalar(r).add(C);
        p.setXYZ(k, Q.x, Q.y, Q.z);
      }
    }
    g.computeVertexNormals();
    return mesh(g, role);
  }

  // Socle de bois (le même rayon que les autres thèmes à personnages)
  function pedestal() {
    return mesh(revolve([
      [0, 0], [0.86, 0], [0.86, 0.1], [0.81, 0.16], [0.83, 0.22], [0.76, 0.28], [0.64, 0.3], [0, 0.3],
    ], { segments: 56 }), 'body');
  }

  // Sabot fendu (moutons, cochons) : deux onglons côte à côte
  function clovenHoof(r, role = 'hoof') {
    const g = new THREE.Group();
    for (const s of [-1, 1]) {
      const toe = mesh(new THREE.SphereGeometry(r, 14, 10, 0, TAU, 0, Math.PI / 2), role, s * r * 0.52, 0, r * 0.15);
      toe.scale.set(0.55, 1.3, 1.05);
      g.add(toe);
    }
    return g;
  }

  // ===========================================================================
  // Pion : le mouton qui bêle « Quatre pattes, oui ! Deux pattes, non ! »
  // Toison bouclée, tête levée et bouche entrouverte, yeux aux pupilles horizontales.
  // ===========================================================================
  function makeSheep() {
    const piece = new THREE.Group();
    piece.add(pedestal());
    const f = new THREE.Group();
    f.position.y = TOP;
    f.scale.setScalar(1.38);
    piece.add(f);

    // Pattes fines, genoux marqués, sabots fendus
    for (const [x, z, back] of [[-0.15, 0.23, 0], [0.15, 0.23, 0], [-0.15, -0.26, 1], [0.15, -0.26, 1]]) {
      const knee = back ? [x, 0.19, z - 0.03] : [x, 0.19, z + 0.01];
      f.add(limb([x, 0.4, z], knee, 0.044, 'face', 0.037));
      f.add(ellipsoid(0.04, 0.035, 0.04, 'face', ...knee));
      f.add(limb(knee, [x, 0.05, z], 0.034, 'face', 0.03));
      const hoof = clovenHoof(0.045);
      hoof.position.set(x, 0, z + 0.01);
      f.add(hoof);
    }

    // Toison : le corps, la croupe et le haut des pattes, bouclés
    f.add(mesh(fleece(0.32, 0.27, 0.45, { seed: 11, count: 260, size: 0.2, amp: 0.11, seg: 72 }), 'wool', 0, 0.58, -0.03));
    // Queue courte et laineuse
    f.add(mesh(fleece(0.07, 0.1, 0.07, { seed: 5, count: 14, size: 0.8, seg: 18 }), 'wool', 0, 0.58, -0.49));
    // Encolure laineuse vers la tête
    f.add(mesh(fleece(0.19, 0.18, 0.15, { seed: 3, count: 70, size: 0.3, amp: 0.12, seg: 36 }), 'wool', 0, 0.74, 0.3));

    // Tête levée (le mouton bêle) : crâne et chanfrein en un seul volume, museau arrondi
    const h = new THREE.Group();
    h.position.set(0, 0.83, 0.45);
    h.rotation.x = -0.22; // museau relevé
    f.add(h);
    h.add(mesh(loft([
      { p: [0, 0.03, -0.1], w: 0.085, h: 0.08 },
      { p: [0, 0.05, 0.0], w: 0.11, h: 0.1, hb: 0.09 },
      { p: [0, 0.03, 0.12], w: 0.095, h: 0.08, hb: 0.085 },
      { p: [0, -0.01, 0.2], w: 0.075, h: 0.062, hb: 0.068 },
      { p: [0, -0.035, 0.255], w: 0.064, h: 0.048, hb: 0.052 },
      { p: [0, -0.045, 0.28], w: 0.034, h: 0.022, hb: 0.026 },
    ]), 'face'));
    // Mèche de laine sur le front
    h.add(mesh(fleece(0.11, 0.07, 0.1, { seed: 8, count: 20, size: 0.65, amp: 0.25, seg: 24 }), 'wool', 0, 0.13, -0.01));
    // Oreilles tombantes, à l'horizontale, intérieur rosé
    for (const s of [-1, 1]) {
      const ear = new THREE.Group();
      ear.position.set(s * 0.1, 0.07, -0.02);
      ear.rotation.set(0.15, s * 0.35, s * -0.35);
      ear.add(ellipsoid(0.1, 0.022, 0.042, 'face', s * 0.085, 0, 0, 16));
      ear.add(ellipsoid(0.08, 0.012, 0.03, 'earIn', s * 0.09, 0.012, 0.004, 14));
      h.add(ear);
      // Œil sur le côté : iris doré, pupille horizontale, paupière lourde (air docile)
      const eye = new THREE.Group();
      eye.position.set(s * 0.088, 0.06, 0.07);
      eye.rotation.y = s * 0.9;
      eye.add(ellipsoid(0.03, 0.026, 0.02, 'iris', 0, 0, 0, 16));
      eye.add(mesh(new THREE.BoxGeometry(0.03, 0.008, 0.01), 'eye', 0, 0, 0.017));
      const lid = mesh(new THREE.SphereGeometry(0.033, 16, 10, 0, TAU, 0, Math.PI * 0.42), 'face', 0, 0, 0);
      lid.rotation.x = 0.4;
      lid.scale.set(1, 0.85, 0.72);
      eye.add(lid);
      h.add(eye);
      // Narine en virgule
      const nostril = mesh(new THREE.CapsuleGeometry(0.008, 0.022, 3, 6), 'faceDark', s * 0.028, -0.015, 0.272);
      nostril.rotation.z = s * 0.6;
      h.add(nostril);
    }
    // Bouche entrouverte : lèvre fendue au milieu et ouverture sombre
    h.add(mesh(new THREE.BoxGeometry(0.006, 0.03, 0.01), 'faceDark', 0, -0.05, 0.279));
    const mouth = ellipsoid(0.026, 0.011, 0.022, 'mouth', 0, -0.078, 0.245, 14);
    mouth.rotation.x = 0.3;
    h.add(mouth);
    return piece;
  }

  // ===========================================================================
  // Cochons : tête commune (Napoléon, Brille-Babil, Minimus)
  // ===========================================================================
  // Origine : centre du crâne ; le groin pointe vers +z.
  //   fierce : sourcils froncés et défenses (le verrat) · cheeks : bajoues rondes (Brille-Babil)
  //   mouth : 'frown' (moue sévère), 'smile' (sourire en coin), 'open' (bouche ouverte, il parle)
  function pigHead({ fierce = false, cheeks = 1, mouth = 'frown', ears = 'erect', points = 'snout', eyes = 1 } = {}) {
    const h = new THREE.Group();
    // Crâne, bajoues et museau d'un seul tenant
    const skull = h.add(mesh(loft([
      { p: [0, 0.035, -0.235], w: 0.09, h: 0.085, hb: 0.075 },
      { p: [0, 0.035, -0.19], w: 0.17, h: 0.165, hb: 0.15 },
      { p: [0, 0.03, -0.1], w: 0.23, h: 0.21, hb: 0.22 },
      { p: [0, 0.02, 0.04], w: 0.25 * cheeks, h: 0.21, hb: 0.25 * cheeks },
      { p: [0, 0.0, 0.18], w: 0.2 * cheeks, h: 0.16, hb: 0.19 * cheeks },
      { p: [0, -0.03, 0.3], w: 0.135, h: 0.11, hb: 0.12 },
      { p: [0, -0.04, 0.4], w: 0.11, h: 0.095, hb: 0.1 },
      { p: [0, -0.04, 0.445], w: 0.1, h: 0.09, hb: 0.092 },
    ], { rings: 56, sides: 32 }), 'pig')).children.at(-1);
    // Groin : disque plat, deux narines ovales
    const disc = mesh(new THREE.CylinderGeometry(0.098, 0.104, 0.05, 32), points === 'snout' ? 'snout' : 'pig', 0, -0.04, 0.455);
    disc.rotation.x = Math.PI / 2;
    disc.scale.set(1, 1, 0.88);
    h.add(disc);
    for (const s of [-1, 1]) {
      const n = ellipsoid(0.022, 0.032, 0.02, 'mouth', s * 0.038, -0.04, 0.48, 12);
      n.rotation.z = s * 0.25;
      h.add(n);
    }
    // Petits yeux posés sur la surface du crâne ; sourcils (bourrelets) froncés ou arqués
    for (const s of [-1, 1]) {
      const eye = onSurface(skull, [s * 0.25, 0.085, 0.6], [-s * 0.32, 0, -1], 0.012 * eyes);
      eye.scale.setScalar(eyes);
      eye.add(ellipsoid(0.03, 0.025, 0.02, 'eyeWhite', 0, 0, 0, 14));
      eye.add(ellipsoid(0.019, 0.021, 0.012, 'eye', 0, 0, 0.012, 12));
      eye.add(ellipsoid(0.006, 0.006, 0.004, 'eyeWhite', 0.006, 0.007, 0.023, 6)); // reflet
      h.add(eye);
      const brow = onSurface(skull, [s * 0.23, fierce ? 0.15 : 0.175, 0.6], [-s * 0.32, -0.04, -1], 0.004);
      brow.rotateZ(fierce ? s * 0.5 : -s * 0.32);
      brow.add(ellipsoid(fierce ? 0.075 : 0.06, fierce ? 0.026 : 0.018, 0.028, 'pig', 0, 0, 0, 16));
      h.add(brow);
      if (fierce) { // défenses du verrat, recourbées vers le haut
        const tusk = taper([[s * 0.088, -0.11, 0.33], [s * 0.1, -0.08, 0.37], [s * 0.112, -0.03, 0.375]], 0.016, 0.004, 'tusk', { seg: 12, sides: 8 });
        h.add(tusk);
      }
    }
    // Bouche : fente le long de la mâchoire, coins tombants (moue) ou relevés (sourire)
    const cy = mouth === 'smile' ? 0.025 : mouth === 'frown' ? -0.025 : 0;
    h.add(taper([[-0.13, -0.1 + cy, 0.23], [-0.07, -0.125, 0.33], [0, -0.13, 0.36], [0.07, -0.125, 0.33], [0.13, -0.1 + cy, 0.23]], 0.009, 0.009, 'mouth', { seg: 24, sides: 6 }));
    if (mouth === 'open') {
      const m = ellipsoid(0.05, 0.03, 0.04, 'mouth', 0, -0.14, 0.33, 14);
      h.add(m);
      h.add(ellipsoid(0.035, 0.012, 0.03, 'earIn', 0, -0.155, 0.325, 12)); // langue
    }
    // Double menton
    h.add(ellipsoid(0.17 * cheeks, 0.09, 0.14, 'pig', 0, -0.18, 0.06, 20));
    // Oreilles : dressées et pointues (Berkshire) ou tombantes
    for (const s of [-1, 1]) {
      const ear = new THREE.Group();
      // Base posée sur le haut du crâne (lancer de rayon vertical), légèrement enfoncée
      const floppy = ears !== 'erect';
      ear.position.copy(onSurface(skull, [s * (floppy ? 0.17 : 0.14), 0.8, -0.05], [0, -1, 0], 0.03).position);
      if (floppy) {
        // Repère explicite : pointe vers l'avant et l'extérieur, face intérieure tournée vers le bas
        const Y = new THREE.Vector3(s * 0.55, 0.2, 0.8).normalize();
        const X = new THREE.Vector3().crossVectors(Y, new THREE.Vector3(0, -1, 0)).normalize();
        const Z = new THREE.Vector3().crossVectors(X, Y);
        ear.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(X, Y, Z));
        ear.scale.setScalar(1.4);
      } else ear.rotation.set(0.35, 0, -s * 0.38);
      const shape = new THREE.Shape();
      shape.moveTo(-0.075, 0); shape.quadraticCurveTo(-0.07, 0.14, 0, 0.24); shape.quadraticCurveTo(0.07, 0.14, 0.075, 0);
      shape.quadraticCurveTo(0, -0.025, -0.075, 0);
      const outer = new THREE.ExtrudeGeometry(shape, { depth: 0.016, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.008, bevelSegments: 2, curveSegments: 10 });
      outer.translate(0, 0, -0.012);
      const inner = new THREE.ShapeGeometry(shape, 10);
      inner.scale(0.72, 0.78, 1);
      inner.translate(0, 0.02, 0.014);
      // Oreille tombante : la pointe se recourbe vers l'avant, sur l'œil
      for (const geo of [outer, inner]) bend(geo, 0.04, floppy ? 1.1 : -0.25, 0.2);
      ear.add(mesh(outer, 'pig'));
      ear.add(mesh(inner, 'earIn'));
      h.add(ear);
    }
    return h;
  }

  // Repère posé sur la surface d'un maillage : lancer de rayon depuis « from » dans la direction
  // « dir » ; le repère est orienté selon la normale (+z vers l'extérieur) et enfoncé de « sink ».
  function onSurface(target, from, dir, sink = 0) {
    target.updateMatrixWorld(true);
    const rc = new THREE.Raycaster(new THREE.Vector3(...from), new THREE.Vector3(...dir).normalize());
    const hit = rc.intersectObject(target, false)[0];
    const g = new THREE.Group();
    if (!hit) { g.position.set(...from); return g; }
    const n = hit.face.normal.clone().transformDirection(target.matrixWorld);
    g.position.copy(hit.point).addScaledVector(n, -sink);
    g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
    return g;
  }

  // Courbe une géométrie autour de l'axe x : au-delà de y0, la pointe tourne jusqu'à « angle »
  // (sur une longueur « len »), vers +z. Pour les oreilles tombantes, les ailes, les mèches.
  function bend(geo, y0, angle, len) {
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i), z = p.getZ(i);
      if (y <= y0) continue;
      const d = y - y0, t = Math.min(1, d / len), a = angle * t * t; // de plus en plus courbé vers la pointe
      p.setY(i, y0 + (d * Math.cos(a)) - z * Math.sin(a));
      p.setZ(i, d * Math.sin(a) + z * Math.cos(a));
    }
    geo.computeVertexNormals();
    return geo;
  }

  // Patte de cochon terminée par un onglon (sabot fendu), d'un point à un autre
  function trotter(at, dir, r, role = 'hoof') {
    const g = clovenHoof(r, role);
    g.position.set(...at);
    g.quaternion.setFromUnitVectors(UP, new THREE.Vector3(...dir).normalize());
    return g;
  }

  // Valeur interpolée linéairement dans une table [[y, v], …] (pour placer des détails sur un volume)
  const lerpTable = (tbl, y) => {
    for (let i = 0; i < tbl.length - 1; i++) {
      const [y0, v0] = tbl[i], [y1, v1] = tbl[i + 1];
      if (y >= y0 && y <= y1) return v0 + (v1 - v0) * (y - y0) / (y1 - y0);
    }
    return y < tbl[0][0] ? tbl[0][1] : tbl[tbl.length - 1][1];
  };

  // ===========================================================================
  // Roi : Napoléon, le grand verrat Berkshire, debout sur ses pattes arrière.
  // « Napoléon apparut en manteau noir, culotte de cheval et jambières de cuir » (chap. X),
  // un fouet au poing. Bicorne « en bataille » et main glissée dans le manteau, comme Bonaparte ;
  // sur la poitrine : Héros animal 1re et 2e classe et l'ordre de la Bannière verte.
  // ===========================================================================
  function makeNapoleon() {
    const piece = new THREE.Group();
    piece.add(pedestal());
    const f = new THREE.Group();
    f.position.y = TOP;
    f.scale.setScalar(1.3);
    piece.add(f);

    // Jambes : onglons blancs (Berkshire), jambières de cuir, culotte de cheval bouffante
    for (const s of [-1, 1]) {
      const x = s * 0.17;
      f.add(trotter([x, 0, 0.05], [0, 1, 0], 0.075, 'hoof'));
      f.add(limb([x, 0.03, 0.03], [x, 0.11, 0.02], 0.07, 'pigPoint', 0.068));
      // Jambière boutonnée sur le côté
      f.add(mesh(revolve([[0.072, 0], [0.08, 0.05], [0.083, 0.17], [0.09, 0.27], [0.094, 0.3], [0, 0.3]], { segments: 24 }), 'leather', x, 0.09, 0.02));
      for (let i = 0; i < 4; i++) f.add(ellipsoid(0.011, 0.011, 0.008, 'brass', x + s * 0.083, 0.13 + i * 0.055, 0.035, 8));
      // Culotte : étroite au genou, évasée à la cuisse (forme « rat-catcher »)
      f.add(mesh(loft([
        { p: [x, 0.37, 0.02], w: 0.088, h: 0.09 },
        { p: [x * 1.06, 0.45, 0.01], w: 0.115, h: 0.12 },
        { p: [x * 1.12, 0.56, 0.0], w: 0.15, h: 0.15 },
        { p: [x * 1.04, 0.66, -0.01], w: 0.15, h: 0.15 },
        { p: [x * 0.8, 0.74, -0.01], w: 0.13, h: 0.14 },
      ], { rings: 24, sides: 20 }), 'breeches'));
    }

    // Manteau : épouse le gros ventre, longues basques derrière
    const COAT = [ // y, demi-largeur, dos, ventre
      [0.6, 0.31, 0.25, 0.25], [0.74, 0.35, 0.27, 0.33], [0.92, 0.37, 0.28, 0.38], [1.1, 0.35, 0.27, 0.34],
      [1.3, 0.32, 0.24, 0.26], [1.46, 0.27, 0.2, 0.2], [1.56, 0.19, 0.15, 0.15],
    ];
    f.add(mesh(loft(COAT.map(([y, w, b, v]) => ({ p: [0, y, 0], w, h: b, hb: v })), { rings: 48, sides: 36 }), 'coat'));
    // Surface avant du manteau à la hauteur y, décalée de x sur le côté (section ovale)
    const front = (y, x = 0) => {
      const w = lerpTable(COAT.map(r => [r[0], r[1]]), y), v = lerpTable(COAT.map(r => [r[0], r[3]]), y);
      return v * Math.sqrt(Math.max(0, 1 - (x / w) ** 2));
    };
    // Basques : deux pans qui tombent derrière jusqu'aux genoux
    for (const s of [-1, 1]) {
      const tail = mesh(loft([
        { p: [s * 0.13, 0.78, -0.22], w: 0.16, h: 0.05 },
        { p: [s * 0.15, 0.56, -0.25], w: 0.14, h: 0.035 },
        { p: [s * 0.16, 0.36, -0.24], w: 0.11, h: 0.025 },
        { p: [s * 0.16, 0.3, -0.235], w: 0.07, h: 0.02 },
      ], { rings: 20, sides: 16 }), 'coat');
      f.add(tail);
    }
    // Revers et col montant de couleur
    for (const s of [-1, 1]) {
      const lapel = mesh(loft([
        { p: [s * 0.07, 1.52, front(1.52, 0.07)], w: 0.018, h: 0.01 },
        { p: [s * 0.13, 1.42, front(1.42, 0.13)], w: 0.035, h: 0.01 },
        { p: [s * 0.14, 1.3, front(1.3, 0.14)], w: 0.03, h: 0.01 },
        { p: [s * 0.12, 1.2, front(1.2, 0.12)], w: 0.012, h: 0.008 },
      ], { rings: 20, sides: 12 }), 'coatTrim');
      f.add(lapel);
    }
    const collar = mesh(revolve([[0.17, 0], [0.18, 0.06], [0.17, 0.1], [0.15, 0.1], [0.155, 0]], { segments: 36, smooth: false }), 'coatTrim', 0, 1.53, 0.0);
    collar.scale.z = 0.95;
    f.add(collar);
    // Double rangée de boutons dorés, tendus par le ventre
    for (let i = 0; i < 5; i++) {
      const y = 0.7 + i * 0.12;
      for (const s of [-1, 1]) {
        const x = s * (0.085 - i * 0.004);
        f.add(ellipsoid(0.02, 0.02, 0.012, 'gold', x, y, front(y, x), 10));
      }
    }
    // Ceinture de cuir et boucle sous le ventre
    const belt = mesh(new THREE.TorusGeometry(1, 0.022, 8, 48), 'leather', 0, 0.66, 0.035);
    belt.rotation.x = Math.PI / 2;
    belt.scale.set(0.335, 0.3, 1);
    f.add(belt);
    f.add(mesh(new THREE.BoxGeometry(0.07, 0.055, 0.02), 'gold', 0, 0.66, front(0.66) + 0.035));
    // Épaulettes à franges dorées
    for (const s of [-1, 1]) {
      const ep = new THREE.Group();
      ep.position.set(s * 0.25, 1.47, 0);
      ep.rotation.z = -s * 0.42;
      ep.add(ellipsoid(0.1, 0.022, 0.085, 'gold', 0, 0, 0, 18));
      for (let i = 0; i < 9; i++) {
        const a = -Math.PI * 0.5 + (i / 8) * Math.PI;
        ep.add(limb([s * 0.085 * Math.cos(a) * 1.1, -0.005, 0.075 * Math.sin(a)], [s * 0.1 * Math.cos(a) * 1.1, -0.07, 0.085 * Math.sin(a)], 0.009, 'gold'));
      }
      f.add(ep);
    }
    // Décorations sur le cœur (à gauche du personnage, +x) : rubans et médailles
    const medal = (x, y, role, ribbon) => {
      const z = front(y, x) - 0.004;
      f.add(mesh(new THREE.BoxGeometry(0.05, 0.06, 0.012), ribbon, x, y + 0.04, z + 0.002));
      const d = mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.012, 20), role, x, y - 0.012, z + 0.008);
      d.rotation.x = Math.PI / 2;
      f.add(d);
      f.add(ellipsoid(0.012, 0.012, 0.006, ribbon === 'ribbon' ? 'gold' : 'accent', x, y - 0.012, z + 0.016, 8));
    };
    medal(0.19, 1.39, 'gold', 'accent');   // Héros animal, 1re classe
    medal(0.25, 1.36, 'silver', 'accent'); // Héros animal, 2e classe
    medal(0.22, 1.27, 'gold', 'ribbon');   // ordre de la Bannière verte

    // Bras gauche (+x) : la patte glissée dans le manteau, à la Bonaparte
    f.add(limb([0.3, 1.42, 0], [0.37, 1.18, 0.07], 0.09, 'coat'));
    f.add(limb([0.37, 1.18, 0.07], [0.16, 1.16, front(1.16) - 0.04], 0.08, 'coat'));
    const cuffL = mesh(new THREE.TorusGeometry(0.075, 0.022, 8, 20), 'coatTrim', 0.2, 1.164, front(1.16) - 0.06);
    cuffL.rotation.y = 1.15;
    f.add(cuffL);
    // Bras droit (-x) : descend le long du corps, le fouet au poing
    f.add(limb([-0.3, 1.42, 0], [-0.4, 1.15, 0.02], 0.09, 'coat'));
    f.add(limb([-0.4, 1.15, 0.02], [-0.42, 0.95, 0.12], 0.08, 'coat'));
    const cuffR = mesh(new THREE.TorusGeometry(0.075, 0.022, 8, 20), 'coatTrim', -0.415, 0.985, 0.1);
    cuffR.rotation.x = 1.0;
    f.add(cuffR);
    f.add(limb([-0.418, 0.97, 0.11], [-0.425, 0.9, 0.15], 0.065, 'pigPoint', 0.06));
    f.add(trotter([-0.425, 0.88, 0.16], [0, -0.6, 0.8], 0.06));
    // Fouet : manche gainé de cuir, pommeau, longue lanière qui retombe et s'enroule sur le socle
    const WX = -0.43, WZ = 0.2;
    f.add(limb([WX, 1.02, WZ - 0.03], [WX, 0.76, WZ + 0.02], 0.022, 'leather', 0.017));
    f.add(ellipsoid(0.03, 0.03, 0.03, 'gold', WX, 1.03, WZ - 0.032, 10));
    for (let i = 0; i < 5; i++) {
      const t = i / 4, y = 0.98 - t * 0.2;
      const ring = mesh(new THREE.TorusGeometry(0.022 - t * 0.004, 0.004, 6, 14), 'gold', WX, y, WZ - 0.025 + t * 0.04);
      ring.rotation.x = Math.PI / 2 - 0.2;
      f.add(ring);
    }
    f.add(taper([
      [WX, 0.76, WZ + 0.02], [WX - 0.03, 0.55, WZ + 0.1], [WX + 0.02, 0.3, WZ + 0.17], [WX + 0.1, 0.1, WZ + 0.22],
      [WX + 0.22, 0.015, WZ + 0.26], [WX + 0.38, 0.015, WZ + 0.2], [WX + 0.42, 0.015, WZ + 0.06],
      [WX + 0.32, 0.015, WZ - 0.02], [WX + 0.2, 0.015, WZ + 0.06],
    ], 0.014, 0.004, 'leather', { seg: 80, sides: 8 }));

    // Queue en tire-bouchon, sous les basques ; bout blanc (Berkshire)
    const curl = [];
    for (let i = 0; i <= 24; i++) {
      const t = i / 24, a = t * TAU * 1.6;
      curl.push([Math.sin(a) * 0.045, 0.62 + Math.cos(a) * 0.045 + t * 0.02, -0.3 - t * 0.12]);
    }
    f.add(taper(curl, 0.024, 0.012, 'pig', { seg: 48, sides: 8 }));

    // Cou et tête : le verrat, l'air dur, groin blanc
    f.add(limb([0, 1.5, 0.0], [0, 1.68, 0.04], 0.16, 'pig'));
    const h = pigHead({ fierce: true, mouth: 'frown', ears: 'erect', points: 'snout' });
    h.position.set(0, 1.84, 0.06);
    h.rotation.x = 0.08; // regard porté droit devant, un peu de haut
    f.add(h);

    // Bicorne « en bataille » : cornes vers les côtés, galon doré et cocarde
    const hat = new THREE.Group();
    hat.position.set(0, 2.0, -0.02);
    hat.rotation.z = 0.05;
    hat.scale.setScalar(1.25);
    f.add(hat);
    const crescent = new THREE.Shape();
    crescent.moveTo(-0.36, 0.0);
    crescent.quadraticCurveTo(-0.2, 0.06, 0, 0.27);
    crescent.quadraticCurveTo(0.2, 0.06, 0.36, 0.0);
    crescent.quadraticCurveTo(0, 0.07, -0.36, 0.0);
    for (const z of [-0.055, 0.055]) {
      const flap = new THREE.ExtrudeGeometry(crescent, { depth: 0.022, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.008, bevelSegments: 2, curveSegments: 20 });
      flap.translate(0, 0, -0.011);
      const m = mesh(flap, 'hat', 0, 0, z);
      m.rotation.x = z > 0 ? -0.12 : 0.12; // les deux pans s'écartent vers le bas
      hat.add(m);
      // Galon doré sur le bord supérieur
      const edge = [];
      for (let i = 0; i <= 30; i++) {
        const t = i / 30, x = -0.36 + t * 0.72;
        const top = x < 0 ? new THREE.QuadraticBezierCurve(V(-0.36, 0), V(-0.2, 0.06), V(0, 0.27)).getPoint(t * 2)
          : new THREE.QuadraticBezierCurve(V(0, 0.27), V(0.2, 0.06), V(0.36, 0)).getPoint(t * 2 - 1);
        edge.push([top.x, top.y + 0.004, 0]);
      }
      const braid = taper(edge, 0.011, 0.011, 'gold', { seg: 60, sides: 6 });
      braid.position.z = z + (z > 0 ? 0.012 : -0.012);
      braid.rotation.x = m.rotation.x;
      hat.add(braid);
    }
    hat.add(ellipsoid(0.17, 0.11, 0.07, 'hat', 0, 0.06, 0, 24)); // calotte entre les deux pans
    // Cocarde : disques emboîtés aux couleurs du camp, ganse dorée
    for (const [r, role, dz] of [[0.06, 'accent', 0.0], [0.042, 'coatTrim', 0.006], [0.024, 'accent', 0.012]]) {
      const d = mesh(new THREE.CylinderGeometry(r, r, 0.012, 24), role, 0.13, 0.11, 0.075 + dz);
      d.rotation.x = Math.PI / 2 - 0.12;
      hat.add(d);
    }
    hat.add(limb([0.13, 0.17, 0.076], [0.13, 0.05, 0.085], 0.008, 'gold'));
    return piece;
  }

  // ===========================================================================
  // Dame : Brille-Babil, le petit cochon gras aux joues rondes et aux yeux pétillants.
  // Debout sur une caisse, il harangue la ferme : il sautille d'un côté à l'autre en fouettant
  // de la queue, la patte levée, son feuillet de chiffres à la main. Au pied de la caisse,
  // le pot de peinture blanche renversé et le pinceau : c'est lui qui réécrit les commandements.
  // ===========================================================================
  function makeSquealer() {
    const piece = new THREE.Group();
    piece.add(pedestal());
    const f = new THREE.Group();
    f.position.y = TOP;
    f.scale.setScalar(1.66);
    piece.add(f);

    // Caisse en planches (tribune improvisée)
    const CY = 0.4, CW = 0.3, CD = 0.24, CZ = -0.03;
    const crate = new THREE.Group();
    crate.position.set(0, 0, CZ);
    f.add(crate);
    crate.add(mesh(new THREE.BoxGeometry(CW * 2 - 0.02, CY - 0.02, CD * 2 - 0.02), 'plank', 0, CY / 2, 0));
    for (let i = 0; i < 3; i++) { // planches du dessus et des côtés, légèrement en relief
      const z = -CD + CD * (i * 2 + 1) / 3;
      crate.add(mesh(new THREE.BoxGeometry(CW * 2, 0.03, CD * 2 / 3 - 0.014), 'plank', 0, CY - 0.012, z));
      const y = CY * (i * 2 + 1) / 6;
      for (const sz of [-1, 1]) crate.add(mesh(new THREE.BoxGeometry(CW * 2, CY / 3 - 0.014, 0.025), 'plank', 0, y, sz * CD));
      for (const sx of [-1, 1]) crate.add(mesh(new THREE.BoxGeometry(0.025, CY / 3 - 0.014, CD * 2), 'plank', sx * CW, y, 0));
    }
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) { // montants d'angle et clous
      crate.add(mesh(new THREE.BoxGeometry(0.05, CY, 0.05), 'plank', sx * (CW - 0.01), CY / 2, sz * (CD - 0.01)));
      for (const y of [0.06, CY - 0.06]) crate.add(ellipsoid(0.008, 0.008, 0.006, 'tin', sx * (CW - 0.01), y, sz * (CD + 0.016), 6));
    }

    // Pot de peinture renversé, flaque blanche et pinceau
    const pot = new THREE.Group();
    pot.position.set(0.3, 0.075, 0.27);
    pot.rotation.set(0, -0.7, Math.PI / 2);
    pot.add(mesh(revolve([[0, 0], [0.07, 0], [0.072, 0.15], [0.066, 0.15], [0.064, 0.008], [0, 0.008]], { smooth: false, segments: 28 }), 'tin'));
    pot.add(mesh(new THREE.TorusGeometry(0.069, 0.006, 6, 24), 'tin', 0, 0.15, 0)).children.at(-1).rotation.x = Math.PI / 2;
    pot.add(mesh(new THREE.TorusGeometry(0.07, 0.004, 4, 24, Math.PI), 'tin', 0, 0.14, 0)); // anse
    f.add(pot);
    const puddle = ellipsoid(0.13, 0.012, 0.1, 'paint', 0.24, 0.004, 0.37, 24);
    puddle.rotation.y = 0.5;
    f.add(puddle);
    f.add(ellipsoid(0.06, 0.01, 0.045, 'paint', 0.12, 0.004, 0.4, 16));
    const brush = new THREE.Group();
    brush.position.set(-0.02, 0.02, 0.33);
    brush.rotation.set(0, 0.5, Math.PI / 2 - 0.05);
    brush.add(mesh(new THREE.CylinderGeometry(0.014, 0.012, 0.2, 10), 'plank', 0, 0.12, 0));
    brush.add(mesh(new THREE.BoxGeometry(0.05, 0.035, 0.02), 'tin', 0, 0.005, 0));
    brush.add(mesh(new THREE.BoxGeometry(0.046, 0.06, 0.016), 'bristle', 0, -0.04, 0));
    brush.add(mesh(new THREE.BoxGeometry(0.047, 0.025, 0.017), 'paint', 0, -0.06, 0));
    f.add(brush);

    // Le cochon, posé sur la caisse
    const g = new THREE.Group();
    g.position.y = CY;
    f.add(g);
    // Patte d'appui (droite, -x) et patte gauche levée en sautillant
    g.add(limb([-0.12, 0.28, 0], [-0.11, 0.08, 0.02], 0.075, 'pig', 0.06));
    g.add(trotter([-0.11, 0, 0.04], [0, 1, 0], 0.062));
    g.add(limb([-0.11, 0.02, 0.03], [-0.11, 0.09, 0.025], 0.058, 'pig'));
    g.add(limb([0.12, 0.28, 0], [0.17, 0.2, 0.1], 0.075, 'pig', 0.064));
    g.add(limb([0.17, 0.2, 0.1], [0.18, 0.13, -0.04], 0.06, 'pig', 0.055));
    g.add(trotter([0.18, 0.12, -0.07], [0.05, 0.6, 0.8], 0.058));
    // Corps rond et ventru
    const BODY = [ // y, demi-largeur, dos, ventre
      [0.2, 0.17, 0.15, 0.15], [0.32, 0.27, 0.23, 0.28], [0.48, 0.31, 0.25, 0.33], [0.66, 0.28, 0.22, 0.27],
      [0.8, 0.22, 0.17, 0.19], [0.9, 0.15, 0.13, 0.13],
    ];
    g.add(mesh(loft(BODY.map(([y, w, b, v]) => ({ p: [0, y, 0], w, h: b, hb: v })), { rings: 40, sides: 32 }), 'pig'));
    const front = (y, x = 0) => {
      const w = lerpTable(BODY.map(r => [r[0], r[1]]), y), v = lerpTable(BODY.map(r => [r[0], r[3]]), y);
      return v * Math.sqrt(Math.max(0, 1 - (x / w) ** 2));
    };
    // Gilet boutonné, tendu sur le ventre ; chaîne de montre
    g.add(mesh(loft([
      [0.36, 0.285, 0.245, 0.3], [0.48, 0.322, 0.262, 0.342], [0.66, 0.292, 0.232, 0.282], [0.8, 0.232, 0.18, 0.2], [0.86, 0.19, 0.15, 0.16],
    ].map(([y, w, b, v]) => ({ p: [0, y, 0], w, h: b, hb: v })), { rings: 30, sides: 32 }), 'accent'));
    for (let i = 0; i < 4; i++) {
      const y = 0.42 + i * 0.1;
      g.add(ellipsoid(0.016, 0.016, 0.01, 'brass', 0, y, front(y) + 0.012, 8));
    }
    g.add(taper([[0.02, 0.5, front(0.5) + 0.014], [0.1, 0.46, front(0.46, 0.1) + 0.012], [0.19, 0.5, front(0.5, 0.19) + 0.008]], 0.005, 0.005, 'brass', { seg: 16, sides: 5 }));
    // Queue en tire-bouchon, fouettée sur le côté
    const curl = [];
    for (let i = 0; i <= 22; i++) {
      const t = i / 22, a = t * TAU * 1.5;
      curl.push([0.05 + t * 0.12, 0.3 + Math.cos(a) * 0.04 + t * 0.05, -0.24 - Math.sin(a) * 0.04 - t * 0.04]);
    }
    g.add(taper(curl, 0.022, 0.01, 'pig', { seg: 44, sides: 8 }));

    // Bras droit (-x) levé, l'onglon pointé vers le ciel : « Camarades ! »
    g.add(limb([-0.22, 0.72, 0.02], [-0.38, 0.84, 0.08], 0.068, 'pig', 0.062));
    g.add(limb([-0.38, 0.84, 0.08], [-0.42, 1.06, 0.12], 0.058, 'pig', 0.052));
    g.add(trotter([-0.425, 1.09, 0.125], [-0.1, 1, 0.08], 0.05));
    // Bras gauche (+x) tendu en avant, tenant le feuillet de chiffres
    g.add(limb([0.22, 0.72, 0.02], [0.3, 0.58, 0.16], 0.068, 'pig', 0.062));
    g.add(limb([0.3, 0.58, 0.16], [0.2, 0.6, 0.33], 0.058, 'pig', 0.052));
    g.add(trotter([0.19, 0.6, 0.36], [-0.3, 0.1, 1], 0.05));
    // Feuillet : une longue page qui se déroule vers le bas, roulée à son extrémité
    const PW = 0.2, PH = 0.42;
    const sheet = new THREE.PlaneGeometry(PW, PH, 1, 24);
    const sp = sheet.attributes.position;
    for (let i = 0; i < sp.count; i++) {
      const y = sp.getY(i), t = (PH / 2 - y) / PH; // 0 en haut, 1 en bas
      sp.setZ(i, 0.06 * Math.sin(t * Math.PI * 0.9) + 0.02 * t);
    }
    sheet.computeVertexNormals();
    const page = mesh(sheet, 'paper', 0.17, 0.6 - PH / 2 + 0.02, 0.4);
    page.rotation.set(-0.12, -0.35, 0.05);
    g.add(page);
    const roll = mesh(new THREE.CylinderGeometry(0.02, 0.02, PW + 0.01, 14), 'paper', 0, -PH / 2, 0.022);
    roll.rotation.z = Math.PI / 2;
    page.add(roll);

    // Tête : joues très rondes, bouche ouverte (il parle), regard pétillant, tête penchée
    g.add(limb([0, 0.82, 0.0], [0, 0.95, 0.03], 0.13, 'pig'));
    const h = pigHead({ cheeks: 1.22, mouth: 'open', ears: 'floppy', eyes: 1.25 });
    h.position.set(0, 1.06, 0.05);
    h.scale.setScalar(0.88);
    h.rotation.set(-0.12, 0.1, 0.14);
    g.add(h);
    return piece;
  }

  // ===========================================================================
  // Cavalier : un des chiens de Napoléon, « aussi féroces que des loups », au collier clouté
  // de laiton. Il surgit pour attaquer : appuyé sur ses pattes arrière, lancé vers l'avant,
  // gueule ouverte, crocs à nu, babines retroussées, oreilles plaquées, collerette hérissée.
  // ===========================================================================
  function makeDog() {
    const piece = new THREE.Group();
    piece.add(pedestal());
    const f = new THREE.Group();
    f.position.y = TOP;
    f.scale.setScalar(1.55);
    piece.add(f);

    // Corps : repère B centré sur la hanche, colonne vers +z, incliné vers le haut (le bond)
    const B = new THREE.Group();
    B.position.set(0, 0.4, -0.26);
    B.rotation.x = -0.68;
    B.updateMatrix();
    f.add(B);
    const trunk = mesh(loft([
      { p: [0, 0.02, -0.14], w: 0.1, h: 0.08 },
      { p: [0, 0.03, -0.07], w: 0.18, h: 0.15, hb: 0.14 },
      { p: [0, 0.04, 0.1], w: 0.175, h: 0.14, hb: 0.12 },  // rein
      { p: [0, 0.03, 0.3], w: 0.2, h: 0.16, hb: 0.19 },
      { p: [0, 0.02, 0.5], w: 0.235, h: 0.18, hb: 0.26 },  // poitrail large et profond
      { p: [0, 0.04, 0.64], w: 0.22, h: 0.18, hb: 0.22 },
      { p: [0, 0.07, 0.73], w: 0.13, h: 0.11, hb: 0.11 },
    ], { rings: 48, sides: 30 }), 'dog');
    B.add(trunk);
    // Cuisses musclées (arrière) et épaules
    for (const s of [-1, 1]) {
      B.add(ellipsoid(0.11, 0.16, 0.14, 'dog', s * 0.12, -0.02, 0.0, 20));
      B.add(ellipsoid(0.095, 0.14, 0.11, 'dog', s * 0.15, -0.03, 0.6, 18));
    }
    // Encolure puissante et collerette de poils hérissés
    B.add(mesh(loft([
      { p: [0, 0.04, 0.6], w: 0.16, h: 0.16, hb: 0.17 },
      { p: [0, 0.13, 0.78], w: 0.135, h: 0.13, hb: 0.13 },
      { p: [0, 0.2, 0.9], w: 0.115, h: 0.11, hb: 0.11 },
    ], { rings: 20, sides: 24 }), 'dog'));
    // Collerette : poils hérissés au bas du cou et sur le poitrail
    const ruff = mesh(fleece(0.2, 0.2, 0.15, { seed: 41, count: 70, size: 0.32, amp: 0.32, seg: 36 }), 'ruff', 0, 0.02, 0.66);
    ruff.rotation.x = 0.5;
    B.add(ruff);
    // Collier : sangle de cuir plate, cloutée de laiton, autour du haut du cou
    const collar = new THREE.Group();
    collar.position.set(0, 0.165, 0.84);
    collar.quaternion.setFromUnitVectors(UP, new THREE.Vector3(0, 0.16, 0.3).normalize()); // axe du cou
    B.add(collar);
    const band = mesh(revolve([[0.12, -0.03], [0.138, -0.03], [0.141, 0], [0.138, 0.03], [0.12, 0.03]], { smooth: false, segments: 40 }), 'leather');
    collar.add(band);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU;
      const stud = mesh(new THREE.ConeGeometry(0.014, 0.032, 10), 'brass', Math.sin(a) * 0.146, 0, Math.cos(a) * 0.146);
      stud.quaternion.setFromUnitVectors(UP, new THREE.Vector3(Math.sin(a), 0, Math.cos(a)));
      collar.add(stud);
    }
    const ring = mesh(new THREE.TorusGeometry(0.028, 0.008, 6, 14), 'brass', 0, -0.03, -0.15); // anneau sous la gorge
    collar.add(ring);

    // Tête, plus horizontale que le corps : il fixe sa proie
    const H = new THREE.Group();
    H.position.set(0, 0.22, 0.95);
    H.rotation.x = 0.78; // tête baissée, à l'horizontale : il fond sur sa proie
    H.scale.setScalar(1.3);
    B.add(H);
    const skull = mesh(loft([
      { p: [0, 0.0, -0.11], w: 0.07, h: 0.07 },
      { p: [0, 0.01, -0.04], w: 0.125, h: 0.115, hb: 0.1 },
      { p: [0, 0.01, 0.05], w: 0.14, h: 0.11, hb: 0.105 },  // joues larges
      { p: [0, 0.0, 0.13], w: 0.1, h: 0.082, hb: 0.065 },   // stop
      { p: [0, -0.01, 0.21], w: 0.086, h: 0.07, hb: 0.03 }, // museau large de molosse
      { p: [0, -0.015, 0.29], w: 0.074, h: 0.058, hb: 0.024 },
      { p: [0, -0.02, 0.33], w: 0.05, h: 0.038, hb: 0.016 },
    ], { rings: 44, sides: 28 }), 'dog');
    H.add(skull);
    // Masque plus sombre sur le museau, truffe
    H.add(ellipsoid(0.07, 0.05, 0.085, 'dogMark', 0, -0.018, 0.27, 18));
    H.add(ellipsoid(0.042, 0.03, 0.03, 'nose', 0, 0.014, 0.335, 14));
    for (const s of [-1, 1]) H.add(ellipsoid(0.009, 0.007, 0.006, 'mouth', s * 0.016, 0.008, 0.362, 6));
    // Babines retroussées : plis sur le chanfrein
    for (let i = 0; i < 3; i++) {
      const w = mesh(new THREE.TorusGeometry(0.06 - i * 0.004, 0.007, 6, 16, Math.PI), 'dog', 0, 0.045 - i * 0.004, 0.17 + i * 0.03);
      w.rotation.set(-0.2, 0, 0);
      H.add(w);
    }
    // Gencive et crocs de la mâchoire supérieure
    H.add(ellipsoid(0.07, 0.02, 0.11, 'gum', 0, -0.03, 0.22, 16));
    for (const s of [-1, 1]) {
      const fang = mesh(new THREE.ConeGeometry(0.013, 0.065, 10), 'tooth', s * 0.05, -0.06, 0.28);
      fang.rotation.x = Math.PI + 0.15;
      H.add(fang);
      for (let i = 0; i < 3; i++) {
        const t = mesh(new THREE.ConeGeometry(0.007, 0.025, 6), 'tooth', s * (0.056 - i * 0.002), -0.042, 0.24 - i * 0.035);
        t.rotation.x = Math.PI;
        H.add(t);
      }
    }
    for (let i = -2; i <= 2; i++) {
      const t = mesh(new THREE.ConeGeometry(0.006, 0.02, 6), 'tooth', i * 0.013, -0.042, 0.31 - Math.abs(i) * 0.005);
      t.rotation.x = Math.PI;
      H.add(t);
    }
    // Mâchoire inférieure, grande ouverte
    const jaw = new THREE.Group();
    jaw.position.set(0, -0.05, 0.08);
    jaw.rotation.x = 0.55;
    H.add(jaw);
    jaw.add(mesh(loft([
      { p: [0, 0, -0.02], w: 0.09, h: 0.03, hb: 0.045 },
      { p: [0, 0, 0.1], w: 0.068, h: 0.02, hb: 0.034 },
      { p: [0, 0.0, 0.2], w: 0.055, h: 0.016, hb: 0.026 },
      { p: [0, 0.002, 0.235], w: 0.036, h: 0.01, hb: 0.016 },
    ], { rings: 24, sides: 20 }), 'dog'));
    jaw.add(ellipsoid(0.052, 0.012, 0.1, 'gum', 0, 0.018, 0.12, 14));
    jaw.add(ellipsoid(0.04, 0.01, 0.09, 'tongue', 0, 0.026, 0.11, 14));
    for (const s of [-1, 1]) {
      const fang = mesh(new THREE.ConeGeometry(0.012, 0.05, 10), 'tooth', s * 0.04, 0.04, 0.2);
      fang.rotation.x = -0.1;
      jaw.add(fang);
    }
    // Yeux ambrés, sourcils froncés
    for (const s of [-1, 1]) {
      const eye = onSurface(skull, [s * 0.2, 0.05, 0.4], [-s * 0.42, 0, -1], 0.008);
      eye.add(ellipsoid(0.022, 0.018, 0.014, 'iris', 0, 0, 0, 12));
      eye.add(ellipsoid(0.01, 0.01, 0.008, 'eye', 0, 0, 0.01, 8));
      eye.add(ellipsoid(0.004, 0.004, 0.003, 'eyeWhite', 0.005, 0.005, 0.015, 6));
      H.add(eye);
      const brow = onSurface(skull, [s * 0.2, 0.085, 0.4], [-s * 0.42, -0.05, -1], 0.006);
      brow.rotateZ(s * 0.5);
      brow.add(ellipsoid(0.035, 0.012, 0.016, 'dog', 0, 0, 0, 12));
      H.add(brow);
      // Oreilles pointues, plaquées en arrière
      const ear = new THREE.Group();
      ear.position.copy(onSurface(skull, [s * 0.075, 0.5, -0.01], [0, -1, 0], 0.015).position);
      ear.rotation.set(-1.55, s * 0.15, -s * 0.5); // couchée vers l'arrière, contre le crâne
      ear.scale.setScalar(0.85);
      const shape = new THREE.Shape();
      shape.moveTo(-0.05, 0); shape.quadraticCurveTo(-0.04, 0.08, 0, 0.15); shape.quadraticCurveTo(0.04, 0.08, 0.05, 0);
      shape.quadraticCurveTo(0, -0.015, -0.05, 0);
      const eg = new THREE.ExtrudeGeometry(shape, { depth: 0.012, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.006, bevelSegments: 2, curveSegments: 8 });
      eg.translate(0, 0, -0.006);
      ear.add(mesh(eg, 'dog'));
      const ei = new THREE.ShapeGeometry(shape, 8);
      ei.scale(0.65, 0.75, 1); ei.translate(0, 0.012, 0.01);
      ear.add(mesh(ei, 'earIn'));
      H.add(ear);
    }

    // Patte avec doigts et griffes (posée sur « at », orientée selon « dir »)
    const paw = (at, dir, r, parent) => {
      const g = new THREE.Group();
      g.position.set(...at);
      g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(...dir).normalize());
      g.add(ellipsoid(r, r * 0.6, r * 1.1, 'dog', 0, 0, 0, 14));
      for (let i = 0; i < 4; i++) {
        const x = (i - 1.5) * r * 0.55;
        g.add(ellipsoid(r * 0.32, r * 0.32, r * 0.4, 'dog', x, -r * 0.1, r * (0.95 - Math.abs(i - 1.5) * 0.15), 8));
        const claw = mesh(new THREE.ConeGeometry(r * 0.1, r * 0.35, 6), 'hoof', x, -r * 0.2, r * (1.3 - Math.abs(i - 1.5) * 0.15));
        claw.rotation.x = Math.PI / 2 + 0.4;
        g.add(claw);
      }
      parent.add(g);
    };
    // Pattes avant tendues vers la proie (dans le repère du corps)
    for (const s of [-1, 1]) {
      const x = s * 0.12;
      // Lancées vers l'avant, un peu écartées, griffes en avant
      B.add(limb([x * 1.2, -0.06, 0.62], [x * 1.35, -0.22, 0.74], 0.07, 'dog', 0.056));
      B.add(limb([x * 1.35, -0.22, 0.74], [x * 1.4, -0.2, 0.98], 0.052, 'dog', 0.044));
      paw([x * 1.4, -0.2, 1.03], [0, -0.35, 1], 0.056, B);
    }
    // Pattes arrière : poussent sur le socle (hanche → grasset → jarret → pied)
    const hip = new THREE.Vector3();
    for (const s of [-1, 1]) {
      const x = s * 0.12;
      hip.set(x, -0.03, 0.0).applyMatrix4(B.matrix); // hanche, dans le repère f
      const H0 = [x * 1.1, hip.y, hip.z], K = [x * 1.25, 0.24, -0.1], J = [x * 1.15, 0.14, -0.36], P0 = [x * 1.15, 0.04, -0.28];
      f.add(limb(H0, K, 0.085, 'dog', 0.06));
      f.add(limb(K, J, 0.055, 'dog', 0.042));
      f.add(limb(J, P0, 0.042, 'dog', 0.04));
      paw([x * 1.15, 0.035, -0.22], [0, 0, 1], 0.055, f);
    }
    // Queue tendue à l'arrière, touffue
    B.add(taper([[0, 0.05, -0.12], [0, 0.04, -0.3], [0, 0.0, -0.46], [0, -0.06, -0.58]], 0.04, 0.018, 'dog', { seg: 24, sides: 10 }));
    B.add(mesh(fleece(0.035, 0.035, 0.08, { seed: 9, count: 16, size: 0.7, amp: 0.25, seg: 16 }), 'ruff', 0, -0.05, -0.56));
    return piece;
  }

  // ===========================================================================
  // Tours : les deux chevaux de trait, Douce (aile dame) et Malabar (aile roi)
  // ===========================================================================
  // Malabar : « une bête énorme, près de dix-huit mains », fort comme deux chevaux ; une liste
  // blanche sur le chanfrein lui donne l'air un peu bête. Collier de trait (il charrie les
  // pierres du moulin), fanons blancs. Douce : jument maternelle, plus ronde (« elle n'avait
  // jamais retrouvé sa ligne après son quatrième poulain ») ; sa jambe avant repliée abrite
  // deux canetons, comme le soir où elle les protégea.
  function makeHorse(boxer) {
    const coat = boxer ? 'boxer' : 'clover', mane = boxer ? 'boxerMane' : 'cloverMane';
    const piece = new THREE.Group();
    piece.add(pedestal());
    const f = new THREE.Group();
    f.position.y = TOP;
    f.scale.setScalar(boxer ? 1.24 : 1.17);
    piece.add(f);
    const belly = boxer ? 0 : 0.04; // Douce : ventre plus rond

    // Corps : croupe large, ventre en tonneau, poitrail puissant
    const body = mesh(loft([
      { p: [0, 0.92, -0.62], w: 0.1, h: 0.08 },
      { p: [0, 0.95, -0.55], w: 0.24, h: 0.18, hb: 0.2 },
      { p: [0, 0.97, -0.4], w: 0.29, h: 0.2, hb: 0.26 },
      { p: [0, 0.96, -0.18], w: 0.3 + belly, h: 0.19, hb: 0.33 + belly * 1.5 },
      { p: [0, 0.98, 0.08], w: 0.31 + belly, h: 0.2, hb: 0.34 + belly },
      { p: [0, 1.0, 0.32], w: 0.27, h: 0.22, hb: 0.28 },
      { p: [0, 1.02, 0.46], w: 0.2, h: 0.2, hb: 0.24 },
      { p: [0, 1.04, 0.53], w: 0.1, h: 0.12, hb: 0.14 },
    ], { rings: 56, sides: 36 }), coat);
    f.add(body);
    // Sillon de la croupe (double croupe du cheval de trait)
    for (const s of [-1, 1]) f.add(ellipsoid(0.15, 0.1, 0.18, coat, s * 0.11, 1.03, -0.44, 20));

    // Encolure épaisse, crête arquée
    f.add(mesh(loft([
      { p: [0, 1.02, 0.32], w: 0.2, h: 0.22, hb: 0.26 },
      { p: [0, 1.25, 0.5], w: 0.16, h: 0.19, hb: 0.18 },
      { p: [0, 1.48, 0.6], w: 0.12, h: 0.14, hb: 0.12 },
      { p: [0, 1.6, 0.63], w: 0.09, h: 0.1, hb: 0.1 },
    ], { rings: 30, sides: 28 }), coat));

    // Tête longue, chanfrein droit, museau sombre et doux
    const H = new THREE.Group();
    H.position.set(0, 1.62, 0.64);
    H.rotation.x = 1.05; // tête inclinée vers le bas, comme un cheval au repos
    f.add(H);
    const HEAD = [
      { p: [0, 0, -0.05], w: 0.08, h: 0.08 },
      { p: [0, 0, 0.04], w: 0.11, h: 0.1, hb: 0.12 },
      { p: [0, 0.0, 0.14], w: 0.105, h: 0.095, hb: 0.13 }, // ganaches
      { p: [0, 0.0, 0.28], w: 0.085, h: 0.085, hb: 0.08 },
      { p: [0, 0.0, 0.42], w: 0.08, h: 0.08, hb: 0.075 },
      { p: [0, -0.005, 0.5], w: 0.082, h: 0.075, hb: 0.08 },  // bout du nez
      { p: [0, -0.01, 0.54], w: 0.06, h: 0.05, hb: 0.06 },
    ];
    const skull = mesh(loft(HEAD, { rings: 44, sides: 28 }), coat);
    H.add(skull);
    H.add(ellipsoid(0.083, 0.08, 0.07, 'muzzle', 0, -0.01, 0.49, 18));
    // Liste blanche de Malabar, du front au bout du nez (Douce : simple étoile au front)
    if (boxer) {
      H.add(mesh(loft(HEAD.slice(1, 6).map(sc => ({ p: sc.p, w: 0.032, h: sc.h + 0.004, hb: 0.01, e: 5 })), { rings: 30, sides: 20 }), 'blaze'));
    } else {
      const star = onSurface(skull, [0, 0.4, 0.1], [0, -1, 0], 0.012);
      star.add(ellipsoid(0.035, 0.045, 0.015, 'blaze', 0, 0, 0, 12));
      H.add(star);
    }
    for (const s of [-1, 1]) {
      // Naseaux, en virgule
      const n = onSurface(skull, [s * 0.15, 0.02, 0.6], [-s * 0.6, 0, -1], 0.006);
      n.add(ellipsoid(0.016, 0.026, 0.01, 'mouth', 0, 0, 0, 10));
      H.add(n);
      // Grands yeux sombres sur les côtés, paupière et cils (longs pour Douce)
      const eye = onSurface(skull, [s * 0.3, 0.045, 0.1], [-s, 0, 0.05], 0.01);
      eye.add(ellipsoid(0.03, 0.026, 0.02, 'eye', 0, 0, 0, 14));
      eye.add(ellipsoid(0.007, 0.007, 0.004, 'eyeWhite', 0.008, 0.009, 0.018, 6));
      const lid = mesh(new THREE.SphereGeometry(0.034, 14, 8, 0, TAU, 0, Math.PI * 0.4), coat, 0, 0, 0);
      lid.rotation.x = 0.6;
      eye.add(lid);
      for (let i = 0; i < (boxer ? 0 : 5); i++) {
        const lash = mesh(new THREE.ConeGeometry(0.003, 0.022, 4), 'eye', (i - 2) * 0.012, 0.024, 0.018);
        lash.rotation.x = 0.9;
        eye.add(lash);
      }
      H.add(eye);
      // Oreilles dressées, mobiles
      const ear = new THREE.Group();
      ear.position.copy(onSurface(skull, [s * 0.06, 0.5, -0.02], [0, -1, 0], 0.02).position);
      ear.rotation.set(-0.9, s * 0.2, -s * 0.25);
      ear.add(mesh(revolve([[0.0, 0], [0.035, 0.02], [0.04, 0.07], [0.025, 0.13], [0, 0.17]], { segments: 14 }), coat));
      ear.children[0].scale.z = 0.55;
      H.add(ear);
    }
    // Bouche et menton
    H.add(taper([[-0.06, -0.06, 0.45], [0, -0.07, 0.52], [0.06, -0.06, 0.45]], 0.006, 0.006, 'mouth', { seg: 12, sides: 5 }));

    // Crinière : mèches le long de l'encolure, toupet sur le front
    for (let i = 0; i < 11; i++) {
      const t = i / 10;
      const y = 1.12 + t * 0.5, z = 0.34 + t * 0.3 - t * t * 0.05;
      // Mèche couchée sur le côté droit de l'encolure (+x), comme une crinière qui retombe
      const lock = mesh(fleece(0.045, 0.1, 0.05, { seed: 70 + i, count: 10, size: 0.8, amp: 0.3, seg: 14 }), mane, 0.09, y + 0.06, z - 0.1);
      lock.rotation.set(0.5, 0, -0.75);
      f.add(lock);
    }
    const forelock = mesh(fleece(0.05, 0.08, 0.04, { seed: 90, count: 10, size: 0.8, amp: 0.3, seg: 14 }), mane, 0, 0.06, 0.04);
    forelock.rotation.x = 0.4;
    H.add(forelock);
    // Queue longue et fournie
    f.add(taper([[0, 1.0, -0.6], [0, 0.92, -0.7], [0, 0.65, -0.74], [0.02, 0.38, -0.7]], 0.05, 0.025, mane, { seg: 24, sides: 10 }));
    f.add(mesh(fleece(0.06, 0.2, 0.05, { seed: 95, count: 22, size: 0.6, amp: 0.3, seg: 20 }), mane, 0.015, 0.5, -0.72));

    // Jambes : avant droites, arrière avec jarret ; fanons blancs sur les sabots
    const leg = (x, z, back, lift) => {
      const top = [x, 0.92, z];
      const knee = back ? [x, 0.55, z - 0.1] : lift ? [x, 0.62, z + 0.18] : [x, 0.5, z + 0.01];
      const fet = back ? [x, 0.16, z - 0.06] : lift ? [x, 0.42, z + 0.07] : [x, 0.16, z + 0.02];
      f.add(limb(top, knee, back ? 0.15 : 0.13, coat, back ? 0.09 : 0.095));
      f.add(ellipsoid(0.085, 0.08, 0.085, coat, ...knee, 14)); // genou / jarret
      f.add(limb(knee, fet, 0.072, coat, 0.066));
      f.add(ellipsoid(0.08, 0.075, 0.08, coat, ...fet, 14)); // boulet
      const hoofAt = lift ? [x, 0.36, z + 0.03] : [x, 0, z + 0.03];
      const h = mesh(new THREE.CylinderGeometry(0.08, 0.098, 0.1, 20), 'horseHoof', hoofAt[0], hoofAt[1] + 0.05, hoofAt[2]);
      if (lift) h.rotation.x = -1.1;
      f.add(h);
      // Fanons : longs poils blancs qui couvrent le sabot (surtout Malabar)
      const fz = mesh(fleece(0.1, boxer ? 0.11 : 0.075, 0.1, { seed: 100 + (x * 50 | 0) + (z * 30 | 0), count: 24, size: 0.6, amp: 0.3, seg: 18 }), boxer ? 'feather' : coat,
        hoofAt[0], hoofAt[1] + (lift ? 0.05 : 0.11), hoofAt[2] - (lift ? 0.0 : 0.01));
      f.add(fz);
    };
    for (const s of [-1, 1]) {
      leg(s * 0.15, 0.36, false, !boxer && s > 0); // Douce lève la jambe avant gauche
      leg(s * 0.16, -0.44, true, false);
    }
    // Douce : deux canetons blottis contre sa jambe repliée
    if (!boxer) {
      for (const [x, z, a] of [[0.12, 0.5, 0.3], [0.24, 0.42, -0.5]]) {
        const d = new THREE.Group();
        d.position.set(x, 0, z);
        d.rotation.y = a;
        d.add(ellipsoid(0.05, 0.042, 0.065, 'duck', 0, 0.045, 0, 14));
        d.add(ellipsoid(0.034, 0.034, 0.034, 'duck', 0, 0.1, 0.04, 12));
        d.add(ellipsoid(0.016, 0.008, 0.02, 'beak', 0, 0.095, 0.075, 8));
        for (const s of [-1, 1]) d.add(ellipsoid(0.006, 0.006, 0.004, 'eye', s * 0.022, 0.108, 0.06, 6));
        f.add(d);
      }
    }
    // Malabar : collier de trait rembourré, attelles cuivrées, traits de cuir le long des flancs
    if (boxer) {
      const C = new THREE.Group();
      C.position.set(0, 1.16, 0.44);
      C.rotation.x = -0.5;
      f.add(C);
      const pad = mesh(new THREE.TorusGeometry(0.21, 0.065, 14, 40), 'leather');
      pad.scale.set(0.95, 1.25, 1);
      C.add(pad);
      for (const s of [-1, 1]) {
        // Attelle : barre courbe le long du collier, terminée par une boule de laiton
        const hame = mesh(new THREE.TorusGeometry(0.235, 0.012, 8, 20, Math.PI * 0.7), 'brass', 0, 0, 0.03);
        hame.rotation.z = s > 0 ? -Math.PI * 0.35 : Math.PI * 0.65;
        hame.scale.set(0.95, 1.25, 1);
        C.add(hame);
        C.add(ellipsoid(0.03, 0.03, 0.03, 'brass', s * 0.07, 0.3, 0.03, 12));
        // Trait : courroie qui part du collier vers l'arrière, le long du flanc
        f.add(taper([[s * 0.26, 1.0, 0.36], [s * 0.325, 0.92, 0.0], [s * 0.325, 0.88, -0.35], [s * 0.3, 0.86, -0.55]], 0.018, 0.018, 'leather', { seg: 20, sides: 6 }));
      }
      // Sous-ventrière
      const girth = mesh(new THREE.TorusGeometry(1, 0.08, 8, 48), 'leather', 0, 0.93, 0.2);
      girth.scale.set(0.325, 0.29, 0.3); // anneau dans le plan de la section du ventre
      f.add(girth);
    }
    return piece;
  }
  const makeBoxer = () => makeHorse(true);
  const makeClover = () => makeHorse(false);

  // ===========================================================================
  // Fou (aile dame) : Moïse, le corbeau apprivoisé, conteur de la Montagne de Sucrecandi —
  // « là-haut, un peu au-delà des nuages », où le trèfle pousse en toute saison et où le sucre
  // en morceaux et les tourteaux de lin poussent sur les haies. Il prêche du haut de sa montagne.
  // ===========================================================================
  function makeMoses() {
    const piece = new THREE.Group();
    piece.add(pedestal());
    const f = new THREE.Group();
    f.position.y = TOP;
    f.scale.setScalar(1.12);
    piece.add(f);
    const rnd = rng(2024);

    // Nuages à la base de la montagne
    for (const [x, z, r] of [[-0.42, 0.18, 0.15], [-0.28, 0.4, 0.13], [0.36, 0.3, 0.16], [0.44, -0.12, 0.13], [0.0, -0.46, 0.14], [-0.4, -0.28, 0.13], [0.15, 0.48, 0.11]]) {
      f.add(mesh(fleece(r * 1.3, r * 0.7, r, { seed: (x * 100 + z * 10) | 0, count: 14, size: 0.7, amp: 0.4, seg: 18 }), 'cloud', x, r * 0.55, z));
    }
    // Montagne de morceaux de sucre : anneaux de cubes, de plus en plus étroits vers le sommet
    const PEAK = 1.3, LEVELS = 11, CUBE = 0.1;
    for (let k = 0; k < LEVELS; k++) {
      const y = k * (PEAK / LEVELS) + CUBE / 2;
      const r = 0.46 * Math.pow(1 - k / LEVELS, 1.15) + 0.03;
      const n = Math.max(1, Math.round(TAU * r / (CUBE * 1.05)));
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU + k * 0.37 + rnd() * 0.1;
        const c = mesh(new THREE.BoxGeometry(CUBE, CUBE * 0.9, CUBE * 1.1), 'sugar', Math.sin(a) * r, y + rnd() * 0.02, Math.cos(a) * r);
        c.rotation.set((rnd() - 0.5) * 0.4, a + (rnd() - 0.5) * 0.5, (rnd() - 0.5) * 0.4);
        f.add(c);
      }
      // Cœur plein, pour qu'on ne voie pas à travers
      if (r > 0.08) f.add(mesh(new THREE.CylinderGeometry(r - 0.02, r + 0.02, PEAK / LEVELS + 0.01, 16), 'sugar', 0, y, 0));
    }
    // Tourteaux de lin et trèfle en fleur accrochés aux pentes
    for (const [a, k] of [[0.5, 2], [2.4, 4], [4.3, 3], [1.4, 7], [3.6, 8], [5.4, 6]]) {
      const y = k * (PEAK / LEVELS) + CUBE * 0.7, r = 0.46 * Math.pow(1 - k / LEVELS, 1.15) + 0.09;
      const cake = mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.025, 14), 'linseed', Math.sin(a) * r, y, Math.cos(a) * r);
      cake.rotation.set(0.6, a, 0.3);
      f.add(cake);
      const b = a + 0.5;
      const clov = new THREE.Group();
      clov.position.set(Math.sin(b) * r, y + 0.03, Math.cos(b) * r);
      for (let i = 0; i < 3; i++) {
        const la = (i / 3) * TAU;
        const leaf = ellipsoid(0.025, 0.006, 0.02, 'clover', Math.cos(la) * 0.022, 0, Math.sin(la) * 0.022, 8);
        leaf.rotation.y = -la;
        clov.add(leaf);
      }
      clov.add(mesh(fleece(0.018, 0.022, 0.018, { seed: k, count: 8, size: 0.8, amp: 0.5, seg: 10 }), 'cloverFlower', 0, 0.035, 0));
      f.add(clov);
    }
    // Morceau du sommet, où Moïse est perché
    const top = mesh(new THREE.BoxGeometry(0.14, 0.1, 0.16), 'sugar', 0, PEAK + 0.06, 0);
    top.rotation.y = 0.2;
    f.add(top);

    // Le corbeau : repère R posé sur le sommet, regard vers +z
    const R = new THREE.Group();
    R.position.set(0, PEAK + 0.11, -0.02);
    R.scale.setScalar(1.55);
    f.add(R);
    // Pattes écailleuses et doigts qui agrippent le sucre
    for (const s of [-1, 1]) {
      R.add(limb([s * 0.045, 0.15, -0.01], [s * 0.05, 0.03, 0.01], 0.014, 'ravenLeg'));
      for (const a of [-0.5, 0, 0.5, Math.PI]) {
        const toe = taper([[s * 0.05, 0.02, 0.01], [s * 0.05 + Math.sin(a) * 0.04, 0.008, 0.01 + Math.cos(a) * 0.05], [s * 0.05 + Math.sin(a) * 0.055, -0.01, 0.01 + Math.cos(a) * 0.065]], 0.007, 0.003, 'ravenLeg', { seg: 8, sides: 5 });
        R.add(toe);
      }
    }
    // Corps et poitrine, un peu dressé (il harangue)
    const body = mesh(loft([
      { p: [0, 0.14, -0.2], w: 0.05, h: 0.04 },
      { p: [0, 0.17, -0.12], w: 0.1, h: 0.09, hb: 0.08 },
      { p: [0, 0.22, 0.0], w: 0.12, h: 0.11, hb: 0.12 },
      { p: [0, 0.3, 0.08], w: 0.105, h: 0.1, hb: 0.11 },
      { p: [0, 0.38, 0.11], w: 0.075, h: 0.075, hb: 0.08 },
    ], { rings: 30, sides: 24 }), 'raven');
    R.add(body);
    // Plumes de gorge hérissées (le « jabot » du grand corbeau)
    for (let i = 0; i < 7; i++) {
      const a = (i / 6 - 0.5) * 1.6;
      const fe = ellipsoid(0.02, 0.05, 0.012, 'raven', Math.sin(a) * 0.05, 0.36, 0.17 + Math.cos(a) * 0.01, 8);
      fe.rotation.set(0.5, a * 0.6, 0);
      R.add(fe);
    }
    // Queue en coin
    const tail = new THREE.Shape();
    tail.moveTo(-0.04, 0); tail.lineTo(-0.07, -0.2); tail.lineTo(0, -0.25); tail.lineTo(0.07, -0.2); tail.lineTo(0.04, 0); tail.lineTo(-0.04, 0);
    const tg = new THREE.ExtrudeGeometry(tail, { depth: 0.012, bevelEnabled: true, bevelThickness: 0.005, bevelSize: 0.005, bevelSegments: 1 });
    tg.rotateX(Math.PI / 2 + 0.55);
    R.add(mesh(tg, 'raven', 0, 0.15, -0.16));
    // Ailes entrouvertes, comme un prêcheur qui ouvre les bras : bord d'attaque arrondi,
    // rémiges festonnées au bout. Dessinée pour l'aile gauche (+x), en miroir pour la droite.
    const wingShape = new THREE.Shape();
    wingShape.moveTo(0, 0);
    wingShape.quadraticCurveTo(0.1, 0.035, 0.19, -0.03);   // bord d'attaque jusqu'au poignet
    wingShape.quadraticCurveTo(0.26, -0.1, 0.3, -0.24);    // rémiges primaires
    for (let i = 0; i < 6; i++) {                          // festons du bord de fuite
      const x0 = 0.3 - i * 0.05, x1 = x0 - 0.05;
      const y0 = -0.24 + i * 0.012, y1 = y0 + 0.012;
      wingShape.quadraticCurveTo((x0 + x1) / 2, y0 - 0.035, x1, y1);
    }
    wingShape.quadraticCurveTo(-0.01, -0.12, 0, 0);
    const wingGeo = new THREE.ExtrudeGeometry(wingShape, { depth: 0.012, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.006, bevelSegments: 2, curveSegments: 10 });
    wingGeo.translate(0, 0, -0.006);
    for (const s of [-1, 1]) {
      const wing = mesh(wingGeo, 'raven', s * 0.07, 0.33, 0.04);
      wing.scale.x = s;
      wing.rotation.set(0.1, s * -0.55, s * -0.35); // écartée vers l'avant et le côté, pointe vers le bas
      R.add(wing);
      // Couvertures : l'épaule de l'aile, sur le corps
      R.add(ellipsoid(0.045, 0.07, 0.04, 'raven', s * 0.085, 0.3, 0.04, 12));
    }
    // Cou épais qui relie la tête au corps
    R.add(ellipsoid(0.06, 0.075, 0.06, 'raven', 0, 0.41, 0.125, 16));
    // Tête : front plat, gros bec puissant entrouvert (il parle), plumes du nez sur le bec
    const H = new THREE.Group();
    H.position.set(0, 0.45, 0.14);
    H.rotation.x = -0.15;
    R.add(H);
    const skull = mesh(loft([
      { p: [0, 0, -0.06], w: 0.04, h: 0.04 },
      { p: [0, 0.005, -0.02], w: 0.065, h: 0.065, hb: 0.06 },
      { p: [0, 0.005, 0.03], w: 0.062, h: 0.058, hb: 0.055 },
      { p: [0, 0.0, 0.07], w: 0.04, h: 0.04, hb: 0.04 },
    ], { rings: 20, sides: 20 }), 'raven');
    H.add(skull);
    const beak = (lower) => {
      const g = loft([
        { p: [0, 0, 0.06], w: 0.032, h: lower ? 0.008 : 0.028, hb: lower ? 0.02 : 0.006, e: 2.4 },
        { p: [0, lower ? -0.004 : 0.004, 0.12], w: 0.022, h: lower ? 0.006 : 0.022, hb: lower ? 0.014 : 0.005, e: 2.4 },
        { p: [0, lower ? -0.004 : -0.002, 0.17], w: 0.012, h: lower ? 0.004 : 0.012, hb: lower ? 0.008 : 0.004 },
        { p: [0, lower ? 0.0 : -0.016, 0.2], w: 0.003, h: 0.003, hb: 0.003 },
      ], { rings: 20, sides: 16 });
      return mesh(g, 'ravenBeak');
    };
    const upper = beak(false);
    upper.position.y = 0.004;
    H.add(upper);
    const lower = beak(true);
    lower.position.set(0, -0.01, 0.0);
    lower.rotation.x = 0.28; // bec ouvert
    H.add(lower);
    H.add(ellipsoid(0.03, 0.016, 0.04, 'raven', 0, 0.022, 0.085, 10)); // plumes nasales
    for (const s of [-1, 1]) {
      const eye = onSurface(skull, [s * 0.15, 0.012, 0.02], [-s, 0, 0], 0.004);
      eye.add(ellipsoid(0.013, 0.013, 0.008, 'eye', 0, 0, 0, 10));
      eye.add(ellipsoid(0.004, 0.004, 0.003, 'eyeWhite', 0.004, 0.004, 0.007, 6));
      H.add(eye);
    }
    return piece;
  }

  // ===========================================================================
  // Fou (aile roi) : Minimus, le cochon poète, auteur de « Camarade Napoléon ».
  // Couronné de laurier, écharpe au vent, il déclame la plume levée, l'autre patte sur le cœur.
  // À côté, le panneau du poème peint sous le portrait de Napoléon, comme sur le mur de la grange.
  // ===========================================================================
  function makeMinimus() {
    const piece = new THREE.Group();
    piece.add(pedestal());
    const f = new THREE.Group();
    f.position.y = TOP;
    f.scale.setScalar(1.55);
    piece.add(f);

    // Panneau sur deux montants, derrière à gauche du poète (+x)
    const P = new THREE.Group();
    P.position.set(0.24, 0, -0.2);
    P.rotation.y = -0.35;
    f.add(P);
    const PW = 0.38, PH = 0.53, PY = 1.0;
    for (const s of [-1, 1]) P.add(mesh(new THREE.BoxGeometry(0.04, PY + PH / 2 + 0.06, 0.04), 'plank', s * (PW / 2 - 0.02), (PY + PH / 2 + 0.06) / 2, -0.03));
    P.add(mesh(new THREE.BoxGeometry(PW + 0.04, PH + 0.04, 0.03), 'plank', 0, PY, -0.005));
    const board = mesh(new THREE.PlaneGeometry(PW - 0.02, PH - 0.02), 'poem', 0, PY, 0.012);
    P.add(board);
    P.add(mesh(new THREE.BoxGeometry(PW + 0.1, 0.035, 0.07), 'plank', 0, PY + PH / 2 + 0.035, 0)); // petit toit

    // Encrier et feuillets à ses pieds
    f.add(mesh(revolve([[0, 0], [0.045, 0], [0.05, 0.05], [0.025, 0.07], [0.02, 0.09], [0, 0.09]], { segments: 18 }), 'ink', -0.26, 0, 0.24));
    const sheet = mesh(new THREE.BoxGeometry(0.12, 0.004, 0.16), 'paper', -0.08, 0.004, 0.3);
    sheet.rotation.y = 0.4;
    f.add(sheet);

    // Le cochon, debout, un peu cambré (le souffle de l'inspiration)
    for (const s of [-1, 1]) {
      f.add(limb([s * 0.12, 0.34, 0], [s * 0.12, 0.08, 0.03], 0.075, 'pig', 0.06));
      f.add(trotter([s * 0.12, 0, 0.05], [0, 1, 0], 0.062));
      f.add(limb([s * 0.12, 0.02, 0.04], [s * 0.12, 0.09, 0.035], 0.058, 'pig'));
    }
    const BODY = [
      [0.26, 0.16, 0.14, 0.14], [0.36, 0.24, 0.2, 0.24], [0.52, 0.27, 0.22, 0.27], [0.7, 0.25, 0.2, 0.24],
      [0.86, 0.2, 0.16, 0.18], [0.96, 0.14, 0.12, 0.12],
    ];
    f.add(mesh(loft(BODY.map(([y, w, b, v]) => ({ p: [0, y, 0], w, h: b, hb: v })), { rings: 40, sides: 32 }), 'pig'));
    // Redingote de velours, longue derrière (basques), ouverte devant sur le ventre
    const coat = [[0.3, 0.27], [0.52, 0.305], [0.7, 0.285], [0.86, 0.235], [0.94, 0.185]]; // y, rayon (un peu au-dessus de la peau)
    for (const s of [-1, 1]) { // deux pans : du dos jusqu'au bord du devant, ventre visible au milieu
      const half = new THREE.LatheGeometry(new THREE.SplineCurve(coat.map(([y, w]) => new THREE.Vector2(w, y))).getPoints(30), 24, s > 0 ? 0.35 : Math.PI, Math.PI - 0.35);
      half.computeVertexNormals();
      const m = mesh(half, 'velvet');
      m.scale.z = 0.95;
      f.add(m);
      f.add(ellipsoid(0.014, 0.014, 0.008, 'gold', s * 0.1, 0.62, 0.24, 8));
      f.add(ellipsoid(0.014, 0.014, 0.008, 'gold', s * 0.12, 0.5, 0.25, 8));
    }
    // Queue en tire-bouchon
    const curl = [];
    for (let i = 0; i <= 20; i++) { const t = i / 20, a = t * TAU * 1.4; curl.push([Math.sin(a) * 0.035, 0.36 + Math.cos(a) * 0.035, -0.24 - t * 0.08]); }
    f.add(taper(curl, 0.02, 0.01, 'pig', { seg: 40, sides: 8 }));
    // Écharpe nouée au cou, un pan flotte au vent derrière lui
    const knot = mesh(new THREE.TorusGeometry(0.14, 0.04, 10, 32), 'scarf', 0, 0.9, 0.0);
    knot.rotation.x = Math.PI / 2;
    knot.scale.set(1, 0.85, 1);
    f.add(knot);
    f.add(ellipsoid(0.045, 0.04, 0.035, 'scarf', 0.04, 0.88, 0.13, 12));
    const tail = new THREE.PlaneGeometry(0.08, 0.36, 1, 16);
    const tp = tail.attributes.position;
    for (let i = 0; i < tp.count; i++) {
      const y = tp.getY(i), t = (0.18 - y) / 0.36;
      tp.setZ(i, Math.sin(t * Math.PI * 1.5) * 0.04);
    }
    tail.computeVertexNormals();
    const flap = mesh(tail, 'scarf', 0.12, 0.8, -0.14);
    flap.rotation.set(-1.0, 0.6, -0.3); // soulevé par le vent, vers l'arrière
    f.add(flap);

    // Bras droit (-x) levé, la plume d'oie à la main
    f.add(limb([-0.2, 0.78, 0.02], [-0.33, 0.9, 0.12], 0.064, 'pig', 0.058));
    f.add(limb([-0.33, 0.9, 0.12], [-0.33, 1.1, 0.2], 0.055, 'pig', 0.05));
    f.add(trotter([-0.33, 1.13, 0.21], [0, 1, 0.3], 0.048));
    const quill = new THREE.Group();
    quill.position.set(-0.33, 1.14, 0.24);
    quill.rotation.set(-0.35, 0, 0.35);
    f.add(quill);
    quill.add(limb([0, -0.06, 0], [0, 0.26, 0], 0.006, 'quill'));
    const vane = new THREE.Shape();
    vane.moveTo(0, 0); vane.quadraticCurveTo(0.05, 0.08, 0.012, 0.3); vane.quadraticCurveTo(-0.03, 0.12, 0, 0);
    const vg = new THREE.ShapeGeometry(vane, 10);
    vg.translate(0, -0.02, 0);
    bend(vg, 0.05, 0.4, 0.25);
    quill.add(mesh(vg, 'quill'));
    quill.add(mesh(new THREE.ConeGeometry(0.008, 0.04, 6), 'ink', 0, -0.08, 0)).children.at(-1).rotation.x = Math.PI;
    // Bras gauche (+x) : la patte posée sur le cœur
    f.add(limb([0.2, 0.78, 0.02], [0.27, 0.62, 0.14], 0.064, 'pig', 0.058));
    f.add(limb([0.27, 0.62, 0.14], [0.1, 0.74, 0.24], 0.055, 'pig', 0.05));
    f.add(trotter([0.08, 0.75, 0.255], [-0.6, 0.1, 0.8], 0.048));

    // Tête levée vers le ciel, bouche ouverte : il déclame ; couronne de laurier
    const h = pigHead({ cheeks: 1.05, mouth: 'open', ears: 'erect', eyes: 1.1 });
    h.position.set(0, 1.1, 0.05);
    h.scale.setScalar(0.86);
    h.rotation.set(-0.35, -0.12, -0.06);
    f.add(h);
    const wreath = new THREE.Group();
    wreath.position.set(0, 0.215, -0.0);
    wreath.rotation.x = 0.18;
    wreath.scale.setScalar(1.08);
    h.add(wreath);
    const N = 22;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * TAU;
      if (Math.abs(Math.sin(a / 2)) < 0.12) continue; // ouverte sur le front
      for (const tilt of [-0.6, 0.6]) {
        const leaf = ellipsoid(0.05, 0.014, 0.02, 'laurel', Math.sin(a) * 0.2, tilt * 0.035, Math.cos(a) * 0.2, 8);
        leaf.rotation.set(0, a + Math.PI / 2, tilt);
        wreath.add(leaf);
      }
    }
    for (let i = 0; i < 6; i++) { // baies dorées
      const a = Math.PI * 0.35 + (i / 5) * Math.PI * 1.3;
      wreath.add(ellipsoid(0.012, 0.012, 0.012, 'gold', Math.sin(a) * 0.205, 0.02, Math.cos(a) * 0.205, 6));
    }
    return piece;
  }

  // ===========================================================================
  // Modèles détaillés (js/farm-models.js, préparés par tools/modeles3d) : chacun remplace le
  // personnage fait en code. Fichier absent ou modèle illisible : le personnage fait en code reste.
  // Le personnage garde ses textures, assombries pour les Noirs ; le socle prend le bois du thème.
  // ===========================================================================
  const DARK_TINT = 0x8a847f;
  const detailMats = {}; // rôle → matériau du .glb
  function themeMaterials(white) {
    const mats = materials(white);
    for (const role in detailMats) {
      if (mats[role]) continue;
      const m = detailMats[role].clone();
      if (!white) m.color.multiply(new THREE.Color(DARK_TINT));
      m.side = THREE.FrontSide;
      mats[role] = m;
    }
    return mats;
  }
  function detailed(scene, prefix) {
    scene.updateMatrixWorld(true);
    return () => {
      const g = new THREE.Group();
      scene.traverse(o => {
        if (!o.isMesh) return;
        const m = new THREE.Mesh(o.geometry);
        m.applyMatrix4(o.matrixWorld);
        const role = o.material.name === 'body' ? 'body' : `${prefix}_${o.material.name}`;
        if (role !== 'body') detailMats[role] ??= o.material;
        m.userData.role = role;
        g.add(m);
      });
      return g;
    };
  }

  const theme = {
    name: 'La Ferme des animaux',
    materials: themeMaterials,
    titles: {
      p: 'Poule', r: ['Douce, la jument', 'Malabar, le cheval de trait'], n: 'Chien de Napoléon',
      b: ['Moïse, le corbeau apprivoisé', 'Minimus, le poète'], q: 'Brille-Babil', k: 'Napoléon',
    },
    // Chaque personnage s'ajoute ici dès qu'il est prêt ; les autres pièces restent classiques
    builders: {
      p: makeSheep,
      k: makeNapoleon,
      q: makeSquealer,
      n: makeDog,
      r: [makeClover, makeBoxer],
      b: [makeMoses, makeMinimus],
    },
  };
  // Clés « farm:<pièce> » ou « farm:<pièce>:<aile> » (pièces doubles : 0 aile dame, 1 aile roi)
  theme.ready = loadModels('farm').then(models => {
    for (const [key, scene] of Object.entries(models)) {
      const [, type, side] = key.split(':');
      const build = detailed(scene, `detail_${type}${side ?? ''}`);
      if (side === undefined) theme.builders[type] = build;
      else (theme.builders[type] = [...theme.builders[type]])[+side] = build;
    }
  });
  registerTheme('farm', theme);
})();
