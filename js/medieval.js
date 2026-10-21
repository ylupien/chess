// Thème « Médiéval » : chaque pièce est un personnage sur un socle.
// Script classique (chargé par index.html dans l'ordre). Dépend de : THREE, pieces.js.
//
// Conventions de modélisation (mêmes unités que les pièces classiques) :
//   - socle de y = 0 à 0.3, personnage posé dessus (FIG_Y) ;
//   - le personnage regarde vers +z (sa droite est en -x) ;
//   - chaque maillage porte un « rôle » qui choisit son matériau selon le camp.
(() => {
  const TAU = Math.PI * 2;
  const UP = new THREE.Vector3(0, 1, 0);
  const FIG_Y = 0.3;

  // ===========================================================================
  // Matériaux
  // ===========================================================================
  // Cotte de mailles : petit motif d'anneaux utilisé comme relief.
  function mailTexture() {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    g.fillStyle = '#404040'; g.fillRect(0, 0, 64, 64);
    g.strokeStyle = '#d0d0d0'; g.lineWidth = 3;
    for (let row = 0; row < 5; row++) {
      for (let col = 0; col < 5; col++) {
        const x = col * 16 + (row % 2) * 8, y = row * 16;
        g.beginPath(); g.ellipse(x, y, 7, 6, 0, 0, TAU); g.stroke();
      }
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(10, 6);
    return t;
  }
  const mailBump = mailTexture();

  // Appareil de pierre : blocs décalés d'une rangée à l'autre, joints en creux.
  function stoneTextures() {
    const W = 256, H = 256, rows = 8, cols = 4;
    const mk = () => { const c = document.createElement('canvas'); c.width = W; c.height = H; return c.getContext('2d'); };
    const col = mk(), bump = mk();
    let seed = 4242;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    col.fillStyle = '#8c8a86'; col.fillRect(0, 0, W, H);
    bump.fillStyle = '#000'; bump.fillRect(0, 0, W, H);
    const bh = H / rows, bw = W / cols;
    for (let r = 0; r < rows; r++) {
      for (let c = -1; c < cols; c++) {
        const x = c * bw + (r % 2) * bw / 2, y = r * bh;
        const v = 175 + rnd() * 60 | 0;
        col.fillStyle = `rgb(${v},${v - 4},${v - 10})`;
        col.fillRect(x + 2, y + 2, bw - 4, bh - 4);
        bump.fillStyle = '#d8d8d8';
        bump.fillRect(x + 3, y + 3, bw - 6, bh - 6);
        for (let i = 0; i < 40; i++) { // grain de la pierre
          const g = v - 25 + rnd() * 50 | 0;
          col.fillStyle = `rgba(${g},${g},${g},0.35)`;
          col.fillRect(x + 3 + rnd() * (bw - 8), y + 3 + rnd() * (bh - 8), 2, 2);
        }
      }
    }
    const tex = (ctx, srgb) => {
      const t = new THREE.CanvasTexture(ctx.canvas);
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(7, 4);
      if (srgb) t.colorSpace = THREE.SRGBColorSpace;
      return t;
    };
    return { map: tex(col, true), bump: tex(bump, false) };
  }
  const stone = stoneTextures();

  // Hermine : fourrure blanche semée de mouchetures noires.
  function ermineTexture() {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    g.fillStyle = '#f4f1ea'; g.fillRect(0, 0, 128, 128);
    g.fillStyle = '#16120f';
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 4; col++) {
        const x = col * 32 + (row % 2) * 16 + 8, y = row * 32 + 10;
        g.beginPath(); g.moveTo(x, y); g.lineTo(x - 3, y + 9); g.lineTo(x + 3, y + 9); g.fill();
        for (const dx of [-4, 0, 4]) { g.beginPath(); g.arc(x + dx, y - 2, 1.6, 0, TAU); g.fill(); }
      }
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(6, 2);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }
  const ermine = ermineTexture();

  const std = (color, roughness, metalness = 0, extra = {}) =>
    new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra });

  // Palette par camp : blancs = lin, bleu roi et acier poli ;
  // noirs = cuir brun, pourpre et acier bruni.
  const PALETTE = {
    white: {
      cloth: 0xd9c9a3, cloth2: 0x3c4252, accent: 0x2b4f94, accent2: 0xe8e1cf,
      metal: 0xd4d8de, mail: 0xb9bec6, gold: 0xe8bd5a, leather: 0x7a4e2d,
      wood: 0x8a5a33, hair: 0x7a5232, skin: 0xe8bf9c, lip: 0xb0705e,
      stone: 0xf0e8d8, horse: 0xdcd6cc, mane: 0xa79e90, alb: 0xf1ece1, beard: 0xd8d3ca,
    },
    black: {
      cloth: 0x5a4334, cloth2: 0x221d1e, accent: 0x8c1d24, accent2: 0x2b2326,
      metal: 0x5d6068, mail: 0x4b4e55, gold: 0xd0a040, leather: 0x3d2718,
      wood: 0x5c3b22, hair: 0x2a1d15, skin: 0xd2a07c, lip: 0x9a5a4a,
      stone: 0x77706c, horse: 0x3b2a1f, mane: 0x15100c, alb: 0x6e6763, beard: 0x8f8880,
    },
  };

  const matCache = {};
  function materials(white) {
    const key = white ? 'white' : 'black';
    if (matCache[key]) return matCache[key];
    const c = PALETTE[key];
    return (matCache[key] = {
      body: white ? whiteMat : blackMat, // le socle reprend le bois du thème classique
      cloth: std(c.cloth, 0.85),
      cloth2: std(c.cloth2, 0.8),
      accent: std(c.accent, 0.6),
      accent2: std(c.accent2, 0.6),
      metal: std(c.metal, 0.28, 0.9),
      mail: std(c.mail, 0.55, 0.85, { bumpMap: mailBump, bumpScale: 2, side: THREE.DoubleSide }),
      gold: std(c.gold, 0.35, 0.7),
      leather: std(c.leather, 0.7),
      wood: std(c.wood, 0.75),
      hair: std(c.hair, 0.9),
      skin: std(c.skin, 0.65),
      lip: std(c.lip, 0.6),
      stone: std(c.stone, 0.92, 0, { map: stone.map, bumpMap: stone.bump, bumpScale: 2.5 }),
      dark: std(0x0d0b0a, 0.9),
      horse: std(c.horse, 0.55),
      alb: std(c.alb, 0.85),
      ermine: std(0xffffff, 0.95, 0, { map: ermine }),
      jewel: std(white ? 0x2f6fe0 : 0xd0203c, 0.12, 0.2, { emissive: white ? 0x0a1a40 : 0x400810 }),
      rose: std(0xc0182c, 0.6),
      beard: std(c.beard, 0.95),
      mane: std(c.mane, 0.9),
      hoof: std(0x2b2420, 0.6),
      drape: std(c.accent, 0.7, 0, { side: THREE.DoubleSide }),
      leaf: std(white ? 0x4f7a32 : 0x2f4a22, 0.8),
      eye: std(0x15100c, 0.3),
      eyeWhite: std(0xf3efe6, 0.4),
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

  // Segment arrondi (bras, jambe…) entre deux points.
  function limb(a, b, r, role, r2) {
    const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
    const dir = B.clone().sub(A);
    const len = dir.length();
    const geo = r2 === undefined
      ? new THREE.CapsuleGeometry(r, len, 6, 16)
      : new THREE.CylinderGeometry(r2, r, len, 16); // tronc de cône (r en a, r2 en b)
    const m = mesh(geo, role);
    m.position.copy(A).add(B).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(UP, dir.normalize());
    return m;
  }

  // Surface de révolution lissée ; phi = 0 correspond à l'avant (+z).
  function revolve(points, { segments = 40, phiStart = 0, phiLength = TAU, smooth = true } = {}) {
    let pts = points.map(([r, y]) => new THREE.Vector2(r, y));
    if (smooth === 'even') {
      // Contour anguleux, re-découpé à pas constant pour que la texture ne s'étire pas
      const out = [];
      for (let i = 0; i < pts.length - 1; i++) {
        const n = Math.max(1, Math.round(pts[i].distanceTo(pts[i + 1]) / 0.02));
        for (let k = 0; k < n; k++) out.push(pts[i].clone().lerp(pts[i + 1], k / n));
      }
      out.push(pts[pts.length - 1]);
      pts = out;
    } else if (smooth) pts = new THREE.SplineCurve(pts).getPoints(points.length * 6).map(p => new THREE.Vector2(Math.max(0, p.x), p.y));
    const g = new THREE.LatheGeometry(pts, segments, phiStart, phiLength);
    g.computeVertexNormals();
    return g;
  }

  function pedestal() {
    return mesh(revolve([
      [0, 0], [0.86, 0], [0.86, 0.1], [0.81, 0.16], [0.83, 0.22], [0.76, 0.28], [0.64, 0.3], [0, 0.3],
    ], { segments: 56 }), 'body');
  }

  // Tête avec visage : yeux (blanc + pupille), sourcils, nez, oreilles, bouche, menton.
  // browTilt > 0 : sourcils froncés (air décidé) ; < 0 : air doux.
  function head(r, { brows = 'hair', browTilt = 0.14 } = {}) {
    const g = new THREE.Group();
    const skull = mesh(new THREE.SphereGeometry(r, 36, 28), 'skin');
    skull.scale.set(0.92, 1.05, 0.98);
    g.add(skull);
    const jaw = mesh(new THREE.SphereGeometry(r * 0.72, 28, 20), 'skin', 0, -r * 0.42, r * 0.17);
    jaw.scale.set(1, 0.82, 0.92);
    g.add(jaw);
    for (const s of [-1, 1]) {
      const white = mesh(new THREE.SphereGeometry(r * 0.2, 16, 12), 'eyeWhite', s * r * 0.36, r * 0.1, r * 0.83);
      white.scale.set(1, 0.78, 0.6);
      g.add(white);
      g.add(mesh(new THREE.SphereGeometry(r * 0.11, 12, 10), 'eye', s * r * 0.36, r * 0.09, r * 0.92));
      const brow = mesh(new THREE.BoxGeometry(r * 0.4, r * 0.075, r * 0.12), brows, s * r * 0.35, r * 0.3, r * 0.84);
      brow.rotation.z = s * browTilt;
      g.add(brow);
      const ear = mesh(new THREE.SphereGeometry(r * 0.22, 14, 10), 'skin', s * r * 0.88, 0, -r * 0.02);
      ear.scale.set(0.42, 1, 0.7);
      g.add(ear);
    }
    const nose = mesh(new THREE.SphereGeometry(r * 0.13, 14, 10), 'skin', 0, -r * 0.08, r * 0.96);
    nose.scale.set(0.8, 1.3, 1);
    g.add(nose);
    const mouth = mesh(new THREE.BoxGeometry(r * 0.36, r * 0.06, r * 0.06), 'lip', 0, -r * 0.45, r * 0.84);
    g.add(mouth);
    return g;
  }

  // Main fermée autour d'une hampe verticale.
  function fist(x, y, z, role = 'leather') {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    const palm = mesh(new THREE.SphereGeometry(0.058, 16, 12), role);
    palm.scale.set(1, 1.15, 1);
    g.add(palm);
    const thumb = mesh(new THREE.CapsuleGeometry(0.018, 0.04, 4, 8), role, 0, 0.045, 0.03);
    thumb.rotation.x = 0.6;
    g.add(thumb);
    return g;
  }

  // ===========================================================================
  // Pion : fantassin (gambison, tabard, chapel de fer, lance et rondache)
  // ===========================================================================
  function makeFootSoldier() {
    const piece = new THREE.Group();
    piece.add(pedestal());
    const f = new THREE.Group();
    f.position.y = FIG_Y;
    f.scale.setScalar(1.18);
    piece.add(f);
    const ZS = 0.78; // aplatissement avant/arrière du torse

    // Jambes (chausses) et bottes
    for (const s of [-1, 1]) {
      f.add(limb([s * 0.1, 0.62, 0], [s * 0.11, 0.16, 0.01], 0.072, 'cloth2'));
      f.add(limb([s * 0.11, 0.02, 0], [s * 0.11, 0.24, 0], 0.088, 'leather', 0.082));
      const toe = mesh(new THREE.SphereGeometry(0.088, 18, 12), 'leather', s * 0.11, 0.045, 0.07);
      toe.scale.set(0.95, 0.55, 1.55);
      f.add(toe);
      const cuff = mesh(new THREE.TorusGeometry(0.086, 0.016, 8, 24), 'leather', s * 0.11, 0.24, 0);
      cuff.rotation.x = Math.PI / 2;
      f.add(cuff);
    }

    // Gambison matelassé (torse + jupe)
    const coat = mesh(revolve([
      [0.275, 0.4], [0.262, 0.5], [0.238, 0.64], [0.218, 0.78], [0.232, 0.92],
      [0.262, 1.04], [0.252, 1.13], [0.2, 1.2], [0.1, 1.24], [0, 1.25],
    ]), 'cloth');
    coat.scale.z = ZS;
    f.add(coat);
    // Coutures du matelassage
    for (const [y, r] of [[0.48, 0.266], [0.58, 0.247], [0.98, 0.25], [1.06, 0.262]]) {
      const seam = mesh(new THREE.TorusGeometry(r, 0.009, 6, 48), 'cloth', 0, y, 0);
      seam.rotation.x = Math.PI / 2;
      seam.scale.y = ZS;
      f.add(seam);
    }

    // Tabard aux couleurs du camp, devant et derrière
    const tabardProfile = [[0.282, 0.42], [0.252, 0.6], [0.228, 0.76], [0.243, 0.92], [0.272, 1.05], [0.262, 1.14]];
    for (const phi of [0, Math.PI]) {
      const panel = mesh(revolve(tabardProfile, { phiStart: phi - 0.62, phiLength: 1.24, segments: 16 }), 'accent');
      panel.scale.z = ZS;
      f.add(panel);
    }
    // Croix brodée sur la poitrine
    const crossV = mesh(new THREE.BoxGeometry(0.05, 0.22, 0.02), 'gold', 0, 0.95, 0.205);
    const crossH = mesh(new THREE.BoxGeometry(0.16, 0.05, 0.02), 'gold', 0, 0.98, 0.205);
    f.add(crossV, crossH);

    // Ceinture, boucle et bourse
    const belt = mesh(new THREE.TorusGeometry(0.237, 0.022, 8, 48), 'leather', 0, 0.78, 0);
    belt.rotation.x = Math.PI / 2;
    belt.scale.y = ZS;
    f.add(belt);
    f.add(mesh(new THREE.BoxGeometry(0.06, 0.05, 0.02), 'gold', 0, 0.78, 0.19));
    const pouch = mesh(new THREE.BoxGeometry(0.08, 0.09, 0.05), 'leather', -0.17, 0.71, 0.12);
    pouch.rotation.y = -0.6;
    f.add(pouch);
    // Dague au côté
    const dagger = new THREE.Group();
    dagger.position.set(0.21, 0.72, 0.06);
    dagger.rotation.z = 0.25;
    dagger.add(mesh(new THREE.BoxGeometry(0.035, 0.2, 0.02), 'leather', 0, -0.06, 0));
    dagger.add(mesh(new THREE.BoxGeometry(0.09, 0.018, 0.02), 'metal', 0, 0.05, 0));
    dagger.add(mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.06, 8), 'wood', 0, 0.09, 0));
    f.add(dagger);

    // Épaulières
    for (const s of [-1, 1]) {
      const pad = mesh(new THREE.SphereGeometry(0.105, 20, 14, 0, TAU, 0, Math.PI * 0.55), 'metal', s * 0.235, 1.1, 0);
      pad.rotation.z = -s * 0.5;
      pad.scale.set(1, 0.85, 0.9);
      f.add(pad);
    }

    // Bras droit (-x) : tient la lance
    f.add(limb([-0.25, 1.1, 0], [-0.31, 0.9, 0.05], 0.058, 'cloth'));
    f.add(limb([-0.31, 0.9, 0.05], [-0.31, 0.86, 0.2], 0.05, 'cloth'));
    f.add(limb([-0.31, 0.875, 0.13], [-0.31, 0.86, 0.19], 0.056, 'leather', 0.05)); // gantelet
    f.add(fist(-0.31, 0.86, 0.24));

    // Lance : hampe, douille, fer en feuille et fanion
    const SPEAR_X = -0.31, SPEAR_Z = 0.24;
    f.add(mesh(new THREE.CylinderGeometry(0.017, 0.02, 2.0, 12), 'wood', SPEAR_X, 1.0, SPEAR_Z));
    f.add(mesh(new THREE.CylinderGeometry(0.024, 0.021, 0.08, 12), 'metal', SPEAR_X, 2.02, SPEAR_Z));
    const blade = mesh(revolve([[0, 0], [0.03, 0.05], [0.046, 0.13], [0.03, 0.24], [0, 0.34]], { segments: 4, smooth: true }), 'metal', SPEAR_X, 2.05, SPEAR_Z);
    blade.scale.z = 0.35; // fer plat
    f.add(blade);
    const flagShape = new THREE.Shape();
    flagShape.moveTo(0, 0); flagShape.lineTo(-0.3, -0.06); flagShape.lineTo(0, -0.17); flagShape.lineTo(0, 0);
    const flag = mesh(new THREE.ExtrudeGeometry(flagShape, { depth: 0.008, bevelEnabled: false }), 'accent', SPEAR_X, 1.98, SPEAR_Z - 0.004);
    flag.rotation.y = -0.3;
    f.add(flag);

    // Bras gauche (+x) : tient la rondache
    f.add(limb([0.25, 1.1, 0], [0.31, 0.9, 0.04], 0.058, 'cloth'));
    f.add(limb([0.31, 0.9, 0.04], [0.28, 0.85, 0.17], 0.05, 'cloth'));
    f.add(fist(0.28, 0.85, 0.19));
    const shield = new THREE.Group();
    shield.position.set(0.31, 0.84, 0.25);
    shield.rotation.y = 0.32;
    const disc = mesh(new THREE.CylinderGeometry(0.27, 0.27, 0.035, 40), 'accent');
    disc.rotation.x = Math.PI / 2;
    shield.add(disc);
    const rim = mesh(new THREE.TorusGeometry(0.27, 0.02, 8, 48), 'metal');
    shield.add(rim);
    const boss = mesh(new THREE.SphereGeometry(0.075, 20, 12, 0, TAU, 0, Math.PI / 2), 'metal', 0, 0, 0.017);
    boss.rotation.x = Math.PI / 2;
    shield.add(boss);
    for (const a of [0, Math.PI / 2]) { // bandes peintes en croix
      const band = mesh(new THREE.BoxGeometry(0.5, 0.06, 0.01), 'accent2', 0, 0, 0.02);
      band.rotation.z = a;
      shield.add(band);
    }
    for (let i = 0; i < 8; i++) { // rivets
      const a = (i / 8) * TAU + Math.PI / 8;
      shield.add(mesh(new THREE.SphereGeometry(0.014, 8, 6), 'metal', Math.cos(a) * 0.22, Math.sin(a) * 0.22, 0.02));
    }
    f.add(shield);

    // Cou, camail (mailles) et tête
    f.add(mesh(new THREE.CylinderGeometry(0.062, 0.07, 0.12, 16), 'skin', 0, 1.27, 0));
    const coif = mesh(revolve([[0.2, 1.2], [0.19, 1.28], [0.17, 1.38], [0.165, 1.47]], {
      phiStart: 0.95, phiLength: TAU - 1.9, segments: 32,
    }), 'mail');
    f.add(coif);
    const h = head(0.168);
    h.position.set(0, 1.43, 0.01);
    f.add(h);
    // Mèches de cheveux sous le casque
    for (const s of [-1, 1]) {
      const lock = mesh(new THREE.SphereGeometry(0.05, 12, 8), 'hair', s * 0.12, 1.5, 0.07);
      lock.scale.set(0.8, 0.6, 0.6);
      f.add(lock);
    }

    // Chapel de fer : calotte, bande de renfort, large bord
    const dome = mesh(new THREE.SphereGeometry(0.172, 32, 16, 0, TAU, 0, Math.PI / 2), 'metal', 0, 1.5, 0);
    dome.scale.y = 0.95;
    f.add(dome);
    const band = mesh(new THREE.TorusGeometry(0.172, 0.014, 8, 40), 'metal', 0, 1.51, 0);
    band.rotation.x = Math.PI / 2;
    f.add(band);
    const crest = mesh(new THREE.TorusGeometry(0.165, 0.012, 6, 32, Math.PI), 'metal', 0, 1.5, 0);
    crest.rotation.y = Math.PI / 2;
    f.add(crest);
    f.add(mesh(revolve([[0.165, 0.02], [0.28, -0.045], [0.29, -0.065], [0.27, -0.06], [0.16, -0.005], [0.165, 0.02]], {
      smooth: false, segments: 48,
    }), 'metal', 0, 1.5, 0));

    return piece;
  }


  // ===========================================================================
  // Tour : tour de garde en pierre avec un arbalétrier posté sur le chemin de ronde
  // ===========================================================================
  function makeWatchTower() {
    const piece = new THREE.Group();
    piece.add(pedestal());
    const T = new THREE.Group();
    T.position.y = FIG_Y;
    piece.add(T);

    // Fût de la tour (léger fruit : plus large en bas), soubassement et cordon
    T.add(mesh(revolve([[0.6, 0], [0.62, 0.05], [0.58, 0.12], [0.55, 0.2], [0.52, 1.2], [0, 1.2]], { smooth: 'even', segments: 56 }), 'stone'));
    const cord = mesh(new THREE.TorusGeometry(0.535, 0.022, 8, 56), 'stone', 0, 0.62, 0);
    cord.rotation.x = Math.PI / 2;
    T.add(cord);

    // Mâchicoulis : consoles sous le parapet
    const N_CORBEL = 16;
    for (let i = 0; i < N_CORBEL; i++) {
      const a = (i / N_CORBEL) * TAU;
      const c = mesh(new THREE.BoxGeometry(0.07, 0.1, 0.12), 'stone', Math.sin(a) * 0.55, 1.16, Math.cos(a) * 0.55);
      c.rotation.y = a;
      T.add(c);
    }
    // Parapet en encorbellement + sol du chemin de ronde
    T.add(mesh(revolve([[0.5, 1.12], [0.63, 1.2], [0.63, 1.38], [0.52, 1.38], [0.52, 1.3], [0, 1.3]], { smooth: 'even', segments: 56 }), 'stone'));
    // Merlons : créneau ouvert face à l'avant (+z) pour l'arbalétrier
    const N_MERLON = 8, step = TAU / N_MERLON;
    for (let k = 0; k < N_MERLON; k++) {
      const mid = -Math.PI / 2 + (k + 0.5) * step, half = step * 0.29;
      const sh = new THREE.Shape();
      sh.absarc(0, 0, 0.63, mid - half, mid + half, false);
      sh.absarc(0, 0, 0.52, mid + half, mid - half, true);
      const geo = new THREE.ExtrudeGeometry(sh, { depth: 0.2, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.008, bevelSegments: 1, curveSegments: 8 });
      geo.rotateX(-Math.PI / 2);
      T.add(mesh(geo, 'stone', 0, 1.38, 0));
    }

    // Porte en arc : planches, pentures, clous et encadrement
    const door = new THREE.Group();
    door.position.set(0, 0.06, 0.535);
    const arch = new THREE.Shape();
    arch.moveTo(-0.13, 0); arch.lineTo(0.13, 0); arch.lineTo(0.13, 0.24);
    arch.absarc(0, 0.24, 0.13, 0, Math.PI, false); arch.lineTo(-0.13, 0);
    door.add(mesh(new THREE.ExtrudeGeometry(arch, { depth: 0.04, bevelEnabled: false, curveSegments: 20 }), 'wood', 0, 0, -0.02));
    for (const x of [-0.065, 0, 0.065]) door.add(mesh(new THREE.BoxGeometry(0.006, 0.33, 0.006), 'dark', x, 0.18, 0.022));
    for (const y of [0.07, 0.24]) door.add(mesh(new THREE.BoxGeometry(0.24, 0.022, 0.01), 'metal', 0, y, 0.024));
    for (const [x, y] of [[-0.09, 0.07], [0.09, 0.07], [-0.09, 0.24], [0.09, 0.24], [0, 0.07], [0, 0.24]]) {
      door.add(mesh(new THREE.SphereGeometry(0.011, 8, 6), 'metal', x, y, 0.03));
    }
    door.add(mesh(new THREE.TorusGeometry(0.02, 0.005, 6, 16), 'metal', 0.07, 0.16, 0.032)); // heurtoir
    const frame = mesh(new THREE.TorusGeometry(0.145, 0.025, 8, 24, Math.PI), 'stone', 0, 0.24, 0.01);
    door.add(frame);
    for (const s of [-1, 1]) door.add(mesh(new THREE.BoxGeometry(0.05, 0.24, 0.05), 'stone', s * 0.145, 0.12, 0.01));
    T.add(door);

    // Meurtrières
    for (const [a, y] of [[0.75, 0.82], [-0.75, 0.82], [0, 0.88], [Math.PI * 0.7, 0.55], [-Math.PI * 0.7, 0.55], [Math.PI, 0.95]]) {
      const slit = new THREE.Group();
      slit.rotation.y = a;
      slit.add(mesh(new THREE.BoxGeometry(0.03, 0.17, 0.04), 'dark', 0, y, 0.525));
      slit.add(mesh(new THREE.BoxGeometry(0.08, 0.025, 0.05), 'stone', 0, y + 0.1, 0.525));
      slit.add(mesh(new THREE.BoxGeometry(0.08, 0.025, 0.05), 'stone', 0, y - 0.1, 0.525));
      T.add(slit);
    }

    // Lierre grimpant sur un flanc
    const leafGeo = new THREE.SphereGeometry(0.035, 8, 6);
    let seed = 7;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 26; i++) {
      const a = -1.25 + rnd() * 0.5 + i * 0.012, y = 0.08 + i * 0.03 + rnd() * 0.05;
      const r = 0.6 - y * 0.06;
      const leaf = mesh(leafGeo, 'leaf', Math.sin(a) * r, y, Math.cos(a) * r);
      leaf.scale.set(1, 0.7, 0.4);
      leaf.rotation.set(rnd(), a, rnd());
      T.add(leaf);
    }

    // --- Arbalétrier (visible au-dessus du parapet) ---
    const A = new THREE.Group();
    A.position.set(0, 1.3, 0.08);
    T.add(A);
    const chest = mesh(revolve([[0.2, 0], [0.205, 0.2], [0.215, 0.36], [0.2, 0.46], [0.13, 0.52], [0, 0.53]]), 'cloth');
    chest.scale.z = 0.8;
    A.add(chest);
    const tabard = mesh(revolve([[0.212, 0.05], [0.218, 0.22], [0.226, 0.37]], { phiStart: -0.55, phiLength: 1.1, segments: 12 }), 'accent');
    tabard.scale.z = 0.8;
    A.add(tabard);
    for (const s of [-1, 1]) {
      const pad = mesh(new THREE.SphereGeometry(0.09, 16, 12, 0, TAU, 0, Math.PI * 0.55), 'metal', s * 0.2, 0.42, 0);
      pad.rotation.z = -s * 0.5;
      A.add(pad);
      // Bras tendus vers l'arbalète posée dans le créneau
      A.add(limb([s * 0.21, 0.42, 0], [s * 0.2, 0.28, 0.16], 0.052, 'cloth'));
      A.add(limb([s * 0.2, 0.28, 0.16], [s * 0.08, 0.3, 0.3], 0.045, 'leather'));
      A.add(fist(s * 0.07, 0.3, 0.32));
    }
    // Arbalète : fût, arc d'acier, corde, carreau
    const xbow = new THREE.Group();
    xbow.position.set(0, 0.31, 0.38);
    xbow.rotation.x = -0.08;
    xbow.add(mesh(new THREE.BoxGeometry(0.05, 0.045, 0.42), 'wood'));
    const prod = mesh(new THREE.TorusGeometry(0.2, 0.012, 6, 24, Math.PI * 0.7), 'metal', 0, 0, 0.1);
    prod.rotation.set(Math.PI / 2, 0, Math.PI * 0.15);
    xbow.add(prod);
    const string = mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.36, 4), 'cloth2', 0, 0.01, 0.02);
    string.rotation.z = Math.PI / 2;
    const bolt = mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.26, 6), 'wood', 0, 0.03, 0.1);
    bolt.rotation.x = Math.PI / 2;
    const tip = mesh(new THREE.ConeGeometry(0.012, 0.04, 6), 'metal', 0, 0.03, 0.245);
    tip.rotation.x = Math.PI / 2;
    xbow.add(string, bolt, tip);
    A.add(xbow);
    // Tête, camail et bassinet à pointe
    A.add(mesh(new THREE.CylinderGeometry(0.06, 0.065, 0.1, 14), 'skin', 0, 0.55, 0));
    A.add(mesh(revolve([[0.2, 0.47], [0.18, 0.55], [0.16, 0.63], [0.15, 0.7]], { phiStart: 0.95, phiLength: TAU - 1.9, segments: 32 }), 'mail'));
    const h = head(0.15);
    h.position.set(0, 0.67, 0.01);
    A.add(h);
    // Moustache
    for (const s of [-1, 1]) {
      const m = mesh(new THREE.CapsuleGeometry(0.012, 0.05, 4, 8), 'hair', s * 0.032, 0.605, 0.14);
      m.rotation.z = s * 1.2;
      A.add(m);
    }
    A.add(mesh(revolve([[0.158, 0], [0.16, 0.06], [0.14, 0.13], [0.08, 0.2], [0.02, 0.26], [0, 0.27]]), 'metal', 0, 0.7, -0.005));
    const rim = mesh(new THREE.TorusGeometry(0.157, 0.012, 6, 32), 'metal', 0, 0.705, -0.005);
    rim.rotation.x = Math.PI / 2;
    A.add(rim);

    // Bannière à l'arrière du chemin de ronde
    const POLE = [-0.3, 1.3, -0.3];
    T.add(mesh(new THREE.CylinderGeometry(0.016, 0.018, 1.15, 10), 'wood', POLE[0], POLE[1] + 0.575, POLE[2]));
    T.add(mesh(new THREE.SphereGeometry(0.032, 12, 8), 'gold', POLE[0], POLE[1] + 1.17, POLE[2]));
    const banner = new THREE.Shape();
    banner.moveTo(0, 0);
    for (let i = 0; i <= 10; i++) banner.lineTo(i * 0.04, Math.sin(i * 0.7) * 0.015);
    banner.lineTo(0.4, -0.2); banner.lineTo(0.33, -0.26); banner.lineTo(0.4, -0.32);
    for (let i = 10; i >= 0; i--) banner.lineTo(i * 0.04, -0.32 + Math.sin(i * 0.7 + 1) * 0.015);
    banner.lineTo(0, 0);
    const flag = mesh(new THREE.ExtrudeGeometry(banner, { depth: 0.01, bevelEnabled: false }), 'accent', POLE[0] + 0.015, POLE[1] + 1.1, POLE[2]);
    flag.rotation.y = 0.6;
    T.add(flag);
    const emblem = mesh(new THREE.CircleGeometry(0.06, 20), 'gold', 0.17, -0.16, 0.012);
    flag.add(emblem);

    return piece;
  }


  // ===========================================================================
  // Cavalier : chevalier en armure sur un destrier caparaçonné
  // ===========================================================================
  function makeMountedKnight() {
    const piece = new THREE.Group();
    piece.add(pedestal());
    const K = new THREE.Group();
    K.position.y = FIG_Y;
    K.scale.setScalar(1.05);
    piece.add(K);

    // --- Cheval ---
    const barrel = mesh(new THREE.CapsuleGeometry(0.23, 0.55, 8, 24), 'horse', 0, 0.8, -0.01);
    barrel.rotation.x = Math.PI / 2;
    barrel.scale.set(1, 1, 1.08);
    K.add(barrel);
    K.add(mesh(new THREE.SphereGeometry(0.25, 24, 18), 'horse', 0, 0.84, 0.32)); // poitrail
    const rump = mesh(new THREE.SphereGeometry(0.26, 24, 18), 'horse', 0, 0.84, -0.32);
    rump.scale.set(1.02, 1, 1.05);
    K.add(rump);

    // Jambes : antérieur gauche levé (cabré), les trois autres au sol
    const leg = (pts, radii) => {
      for (let i = 0; i < pts.length - 1; i++) K.add(limb(pts[i], pts[i + 1], radii[i], 'horse', radii[i + 1]));
      const last = pts[pts.length - 1];
      K.add(mesh(new THREE.SphereGeometry(radii[radii.length - 1] * 1.15, 12, 10), 'horse', ...last)); // boulet
      const hoof = mesh(new THREE.CylinderGeometry(0.055, 0.068, 0.08, 14), 'hoof', last[0], last[1] - 0.055, last[2] + 0.01);
      K.add(hoof);
      return hoof;
    };
    for (const s of [-1, 1]) {
      leg([[s * 0.12, 0.8, -0.34], [s * 0.13, 0.46, -0.45], [s * 0.12, 0.1, -0.38]], [0.11, 0.06, 0.05]); // postérieurs
    }
    leg([[-0.12, 0.75, 0.32], [-0.12, 0.42, 0.35], [-0.12, 0.1, 0.36]], [0.09, 0.058, 0.05]); // antérieur droit
    const lifted = leg([[0.12, 0.75, 0.32], [0.12, 0.55, 0.52], [0.12, 0.4, 0.42]], [0.09, 0.058, 0.05]); // antérieur gauche levé
    lifted.rotation.x = -1.1;

    // Encolure, crinière, tête
    K.add(limb([0, 0.9, 0.36], [0, 1.38, 0.62], 0.18, 'horse', 0.115));
    for (let i = 0; i < 10; i++) {
      const t = i / 9;
      const tuft = mesh(new THREE.SphereGeometry(0.06, 10, 8), 'mane', 0, 1.08 + t * 0.38, 0.27 + t * 0.29);
      tuft.scale.set(0.7, 1.4, 0.8);
      tuft.rotation.x = -0.9;
      K.add(tuft);
    }
    const HEAD = new THREE.Group();
    HEAD.position.set(0, 1.42, 0.66);
    HEAD.rotation.x = 0.75; // tête inclinée vers le bas, chanfrein vers l'avant
    HEAD.scale.setScalar(1.4);
    K.add(HEAD);
    const skull = mesh(new THREE.CapsuleGeometry(0.085, 0.24, 8, 16), 'horse', 0, 0, 0.12);
    skull.rotation.x = Math.PI / 2;
    skull.scale.set(1, 1.15, 1);
    HEAD.add(skull);
    HEAD.add(mesh(new THREE.SphereGeometry(0.09, 16, 12), 'horse', 0, -0.02, 0.27)); // museau
    for (const s of [-1, 1]) {
      const ear = mesh(new THREE.ConeGeometry(0.03, 0.09, 10), 'horse', s * 0.05, 0.1, -0.01);
      ear.rotation.set(-0.3, 0, -s * 0.25);
      HEAD.add(ear);
      HEAD.add(mesh(new THREE.SphereGeometry(0.02, 10, 8), 'eye', s * 0.085, 0.03, 0.06));
      HEAD.add(mesh(new THREE.SphereGeometry(0.016, 8, 6), 'dark', s * 0.04, -0.03, 0.35)); // naseaux
    }
    // Bride (cuir) et chanfrein (acier)
    const nose = mesh(new THREE.TorusGeometry(0.095, 0.012, 6, 24), 'leather', 0, -0.01, 0.24);
    HEAD.add(nose);
    for (const s of [-1, 1]) {
      const cheek = mesh(new THREE.BoxGeometry(0.012, 0.025, 0.2), 'leather', s * 0.092, 0.0, 0.13);
      HEAD.add(cheek);
      const bit = mesh(new THREE.TorusGeometry(0.022, 0.007, 6, 12), 'metal', s * 0.095, -0.02, 0.25);
      bit.rotation.y = Math.PI / 2;
      HEAD.add(bit);
    }
    const chanfron = mesh(new THREE.BoxGeometry(0.11, 0.03, 0.26), 'metal', 0, 0.085, 0.13);
    chanfron.rotation.x = 0.08;
    HEAD.add(chanfron);
    const spike = mesh(new THREE.ConeGeometry(0.018, 0.08, 8), 'gold', 0, 0.13, 0.08);
    spike.rotation.x = -0.4;
    HEAD.add(spike);
    // Rênes jusqu'au pommeau de la selle
    for (const s of [-1, 1]) {
      const rein = new THREE.CatmullRomCurve3([
        new THREE.Vector3(s * 0.13, 1.2, 0.97), new THREE.Vector3(s * 0.16, 1.1, 0.62), new THREE.Vector3(s * 0.1, 1.12, 0.22),
      ]);
      K.add(mesh(new THREE.TubeGeometry(rein, 16, 0.008, 5), 'leather'));
    }

    // Queue
    const tail = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0.95, -0.55), new THREE.Vector3(0, 0.9, -0.68), new THREE.Vector3(0, 0.68, -0.74), new THREE.Vector3(0.03, 0.45, -0.7),
    ]);
    K.add(mesh(new THREE.TubeGeometry(tail, 24, 0.045, 10), 'mane'));
    K.add(mesh(new THREE.SphereGeometry(0.055, 10, 8), 'mane', 0.03, 0.44, -0.7));

    // Caparaçon : housse aux couleurs du camp, bordure dorée et écussons
    const CZ = 2.15; // étirement le long du cheval
    const drape = mesh(revolve([[0.29, 1.02], [0.31, 0.92], [0.325, 0.72], [0.335, 0.5]], { segments: 64 }), 'drape');
    drape.scale.z = CZ;
    K.add(drape);
    const hem = mesh(new THREE.TorusGeometry(0.336, 0.014, 6, 80), 'gold', 0, 0.5, 0);
    hem.rotation.x = Math.PI / 2;
    hem.scale.y = CZ;
    K.add(hem);
    for (const s of [-1, 1]) {
      const badge = mesh(new THREE.CircleGeometry(0.09, 24), 'gold', s * 0.333, 0.72, -0.1);
      badge.rotation.y = s * Math.PI / 2;
      K.add(badge);
      const inner = mesh(new THREE.CircleGeometry(0.06, 24), 'accent2', s * 0.336, 0.72, -0.1);
      inner.rotation.y = s * Math.PI / 2;
      K.add(inner);
    }

    // Selle : siège, pommeau, troussequin, étriers
    const seat = mesh(new THREE.BoxGeometry(0.3, 0.05, 0.36), 'leather', 0, 1.04, -0.02);
    K.add(seat);
    K.add(mesh(new THREE.BoxGeometry(0.2, 0.1, 0.05), 'leather', 0, 1.1, 0.17));
    K.add(mesh(new THREE.BoxGeometry(0.28, 0.14, 0.05), 'leather', 0, 1.12, -0.2));

    // --- Chevalier ---
    const R = new THREE.Group();
    R.position.set(0, 1.06, -0.02);
    K.add(R);
    for (const s of [-1, 1]) {
      R.add(limb([s * 0.13, 0.06, 0], [s * 0.27, -0.06, 0.17], 0.068, 'metal'));   // cuissot
      R.add(mesh(new THREE.SphereGeometry(0.06, 12, 10), 'metal', s * 0.27, -0.06, 0.17)); // genouillère
      R.add(limb([s * 0.27, -0.06, 0.17], [s * 0.29, -0.32, 0.1], 0.052, 'metal')); // grève
      const foot = mesh(new THREE.SphereGeometry(0.055, 12, 10), 'metal', s * 0.29, -0.36, 0.15);
      foot.scale.set(0.8, 0.6, 1.5);
      R.add(foot);
      const stirrup = mesh(new THREE.TorusGeometry(0.05, 0.009, 6, 16), 'metal', s * 0.29, -0.38, 0.12);
      R.add(stirrup);
      R.add(limb([s * 0.29, -0.33, 0.12], [s * 0.2, -0.02, 0.0], 0.008, 'leather'));     // étrivière
    }
    // Torse : cotte de mailles et cotte d'armes
    const mailBody = mesh(revolve([[0.19, 0.0], [0.2, 0.18], [0.225, 0.34], [0.2, 0.44], [0.12, 0.5], [0, 0.51]]), 'mail');
    mailBody.scale.z = 0.82;
    R.add(mailBody);
    const surcoat = mesh(revolve([[0.25, -0.08], [0.215, 0.05], [0.205, 0.18], [0.232, 0.34], [0.21, 0.42]], { phiStart: -1.1, phiLength: 2.2 }), 'drape');
    surcoat.scale.z = 0.82;
    R.add(surcoat);
    const back = mesh(revolve([[0.25, -0.08], [0.215, 0.05], [0.205, 0.18], [0.232, 0.34], [0.21, 0.42]], { phiStart: Math.PI - 1.1, phiLength: 2.2 }), 'drape');
    back.scale.z = 0.82;
    R.add(back);
    const sbelt = mesh(new THREE.TorusGeometry(0.212, 0.018, 6, 40), 'gold', 0, 0.14, 0);
    sbelt.rotation.x = Math.PI / 2;
    sbelt.scale.y = 0.82;
    R.add(sbelt);
    // Lion stylisé (chevron) sur la poitrine
    for (const s of [-1, 1]) {
      const c = mesh(new THREE.BoxGeometry(0.15, 0.035, 0.015), 'gold', s * 0.05, 0.3, 0.19);
      c.rotation.z = s * 0.6;
      R.add(c);
    }
    for (const s of [-1, 1]) {
      const pauldron = mesh(new THREE.SphereGeometry(0.1, 18, 12, 0, TAU, 0, Math.PI * 0.6), 'metal', s * 0.21, 0.43, 0);
      pauldron.rotation.z = -s * 0.55;
      R.add(pauldron);
    }
    // Bras droit (-x) : épée levée
    R.add(limb([-0.21, 0.42, 0], [-0.34, 0.5, 0.06], 0.055, 'mail'));
    R.add(limb([-0.34, 0.5, 0.06], [-0.3, 0.72, 0.12], 0.048, 'metal'));
    R.add(fist(-0.3, 0.75, 0.12, 'metal'));
    const sword = new THREE.Group();
    sword.position.set(-0.3, 0.75, 0.12);
    sword.rotation.set(-0.25, 0, 0.15);
    sword.add(mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.12, 8), 'leather', 0, 0.02, 0));
    sword.add(mesh(new THREE.SphereGeometry(0.028, 10, 8), 'gold', 0, -0.05, 0));
    sword.add(mesh(new THREE.BoxGeometry(0.17, 0.025, 0.03), 'gold', 0, 0.09, 0));
    const bladeShape = new THREE.Shape();
    bladeShape.moveTo(-0.022, 0); bladeShape.lineTo(0.022, 0); bladeShape.lineTo(0.016, 0.52); bladeShape.lineTo(0, 0.58); bladeShape.lineTo(-0.016, 0.52); bladeShape.lineTo(-0.022, 0);
    const blade = mesh(new THREE.ExtrudeGeometry(bladeShape, { depth: 0.006, bevelEnabled: true, bevelThickness: 0.003, bevelSize: 0.004, bevelSegments: 1 }), 'metal', 0, 0.1, -0.003);
    sword.add(blade);
    R.add(sword);
    // Bras gauche (+x) : écu
    R.add(limb([0.21, 0.42, 0], [0.31, 0.27, 0.05], 0.055, 'mail'));
    R.add(limb([0.31, 0.27, 0.05], [0.29, 0.22, 0.17], 0.048, 'metal'));
    R.add(fist(0.29, 0.22, 0.19, 'metal'));
    const shield = new THREE.Group();
    shield.position.set(0.35, 0.27, 0.08);
    shield.rotation.y = Math.PI / 2 - 0.35;
    const heater = new THREE.Shape();
    heater.moveTo(-0.15, 0.17); heater.lineTo(0.15, 0.17);
    heater.quadraticCurveTo(0.15, -0.12, 0, -0.27);
    heater.quadraticCurveTo(-0.15, -0.12, -0.15, 0.17);
    shield.add(mesh(new THREE.ExtrudeGeometry(heater, { depth: 0.025, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.012, bevelSegments: 2, curveSegments: 16 }), 'accent'));
    for (const s of [-1, 1]) {
      const chev = mesh(new THREE.BoxGeometry(0.2, 0.04, 0.012), 'gold', s * 0.065, -0.02, 0.04);
      chev.rotation.z = s * 0.65;
      shield.add(chev);
    }
    R.add(shield);
    // Grand heaume : cylindre à sommet plat, fente de vision, trous d'aération, plumet
    R.add(mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.08, 14), 'mail', 0, 0.53, 0));
    const helm = new THREE.Group();
    helm.position.set(0, 0.66, 0.005);
    R.add(helm);
    helm.add(mesh(revolve([[0.155, -0.12], [0.16, 0.0], [0.155, 0.1], [0.13, 0.15], [0, 0.16]], { segments: 40 }), 'metal'));
    helm.add(mesh(new THREE.BoxGeometry(0.22, 0.018, 0.04), 'dark', 0, 0.03, 0.142));
    helm.add(mesh(new THREE.BoxGeometry(0.018, 0.2, 0.03), 'gold', 0, -0.02, 0.152)); // renfort en croix
    helm.add(mesh(new THREE.BoxGeometry(0.2, 0.02, 0.03), 'gold', 0, -0.005, 0.15));
    for (let i = 0; i < 6; i++) {
      helm.add(mesh(new THREE.SphereGeometry(0.008, 6, 4), 'dark', 0.035 + (i % 3) * 0.022, -0.06 - Math.floor(i / 3) * 0.022, 0.145));
    }
    for (let i = 0; i < 5; i++) {
      const plume = mesh(new THREE.SphereGeometry(0.05, 12, 8), 'accent2', 0, 0.2 + i * 0.015, -0.03 - i * 0.05);
      plume.scale.set(0.5, 0.9, 1.6);
      plume.rotation.x = 0.4 + i * 0.2;
      helm.add(plume);
    }
    return piece;
  }


  // ===========================================================================
  // Fou : évêque en chasuble, mitre et crosse, bénissant
  // ===========================================================================
  function makeBishopFigure() {
    const piece = new THREE.Group();
    piece.add(pedestal());
    const f = new THREE.Group();
    f.position.y = FIG_Y;
    f.scale.setScalar(1.3);
    piece.add(f);
    const ZS = 0.8;
    const flat = m => { m.scale.z = ZS; return m; };

    // Souliers qui dépassent de l'aube
    for (const s of [-1, 1]) {
      const shoe = mesh(new THREE.SphereGeometry(0.06, 14, 10), 'accent', s * 0.09, 0.03, 0.2);
      shoe.scale.set(0.9, 0.6, 1.5);
      f.add(shoe);
    }
    // Aube (longue robe blanche) avec plis
    f.add(flat(mesh(revolve([[0.31, 0], [0.3, 0.05], [0.27, 0.3], [0.23, 0.6], [0.21, 0.8], [0.22, 0.98], [0.24, 1.1], [0.2, 1.18], [0.1, 1.22], [0, 1.23]], { segments: 56 }), 'alb')));
    for (let i = 0; i < 10; i++) { // plis verticaux
      const a = (i / 10) * TAU + 0.3;
      const fold = mesh(new THREE.CylinderGeometry(0.012, 0.022, 0.5, 6), 'alb', Math.sin(a) * 0.285, 0.25, Math.cos(a) * 0.285 * ZS);
      fold.rotation.set(Math.cos(a) * 0.12, 0, -Math.sin(a) * 0.12);
      f.add(fold);
    }
    // Pans de l'étole sous la chasuble
    for (const s of [-1, 1]) {
      const stole = mesh(new THREE.BoxGeometry(0.07, 0.3, 0.015), 'accent', s * 0.07, 0.36, 0.245);
      stole.rotation.x = -0.12;
      f.add(stole);
      f.add(mesh(new THREE.BoxGeometry(0.075, 0.025, 0.02), 'gold', s * 0.07, 0.22, 0.263));
    }
    // Chasuble (vêtement de dessus) et orfrois dorés en croix
    const chasProfile = [[0.36, 0.48], [0.34, 0.6], [0.3, 0.8], [0.28, 0.98], [0.27, 1.1], [0.22, 1.19], [0.12, 1.235], [0, 1.24]];
    f.add(flat(mesh(revolve(chasProfile, { segments: 56 }), 'accent')));
    const hem = mesh(new THREE.TorusGeometry(0.36, 0.013, 6, 64), 'gold', 0, 0.48, 0);
    hem.rotation.x = Math.PI / 2;
    hem.scale.y = ZS;
    f.add(hem);
    const band = chasProfile.slice(0, 6).map(([r, y]) => [r + 0.004, y]);
    for (const phi of [0, Math.PI]) {
      f.add(flat(mesh(revolve(band, { phiStart: phi - 0.13, phiLength: 0.26, segments: 6 }), 'gold')));
    }
    f.add(flat(mesh(revolve([[0.284, 0.95], [0.283, 0.99], [0.282, 1.03]], { phiStart: -0.95, phiLength: 1.9, segments: 16, smooth: false }), 'gold')));
    // Croix pectorale et sa chaîne
    f.add(mesh(new THREE.BoxGeometry(0.035, 0.11, 0.02), 'gold', 0, 1.05, 0.238));
    f.add(mesh(new THREE.BoxGeometry(0.08, 0.03, 0.02), 'gold', 0, 1.075, 0.238));
    f.add(mesh(new THREE.SphereGeometry(0.012, 8, 6), 'accent2', 0, 1.075, 0.25));
    const chain = mesh(new THREE.TorusGeometry(0.13, 0.006, 4, 32, Math.PI), 'gold', 0, 1.2, 0.07);
    chain.rotation.set(Math.PI / 2 + 0.5, 0, Math.PI);
    f.add(chain);

    // Bras droit (-x) : main levée qui bénit (deux doigts tendus)
    f.add(limb([-0.2, 1.12, 0], [-0.31, 0.95, 0.1], 0.06, 'alb'));
    f.add(limb([-0.31, 0.95, 0.1], [-0.23, 1.1, 0.24], 0.055, 'alb', 0.095)); // manche évasée
    const hand = new THREE.Group();
    hand.position.set(-0.22, 1.16, 0.25);
    hand.add(mesh(new THREE.SphereGeometry(0.05, 14, 10), 'skin'));
    for (const dx of [-0.017, 0.017]) hand.add(limb([dx, 0.03, 0.005], [dx, 0.1, 0.0], 0.014, 'skin'));
    hand.add(limb([0.03, 0.0, 0.02], [0.04, 0.04, 0.045], 0.013, 'skin')); // pouce
    f.add(hand);

    // Bras gauche (+x) : tient la crosse
    f.add(limb([0.2, 1.12, 0], [0.31, 0.93, 0.07], 0.06, 'alb'));
    f.add(limb([0.31, 0.93, 0.07], [0.3, 0.88, 0.17], 0.055, 'alb', 0.09));
    f.add(fist(0.3, 0.88, 0.21, 'skin'));
    const CX = 0.3, CZ = 0.21;
    f.add(mesh(new THREE.CylinderGeometry(0.018, 0.02, 1.78, 12), 'wood', CX, 0.89, CZ));
    f.add(mesh(new THREE.SphereGeometry(0.04, 14, 10), 'gold', CX, 1.78, CZ)); // nœud
    f.add(mesh(new THREE.CylinderGeometry(0.022, 0.03, 0.14, 12), 'gold', CX, 1.86, CZ));
    const crook = mesh(new THREE.TorusGeometry(0.085, 0.018, 10, 32, Math.PI * 1.45), 'gold', CX, 2.0, CZ);
    crook.rotation.set(0, Math.PI / 2, Math.PI * 0.22);
    f.add(crook);
    const curl = mesh(new THREE.SphereGeometry(0.03, 10, 8), 'gold', CX, 1.95, CZ + 0.07);
    f.add(curl);

    // Cou, amict, tête, barbe et cheveux gris
    f.add(mesh(new THREE.CylinderGeometry(0.06, 0.068, 0.1, 14), 'skin', 0, 1.26, 0));
    const amice = mesh(new THREE.TorusGeometry(0.11, 0.03, 8, 24), 'alb', 0, 1.235, 0);
    amice.rotation.x = Math.PI / 2;
    f.add(amice);
    const h = head(0.165, { brows: 'beard', browTilt: 0.02 });
    h.position.set(0, 1.41, 0.01);
    f.add(h);
    const beard = mesh(new THREE.SphereGeometry(0.11, 18, 14), 'beard', 0, 1.3, 0.085);
    beard.scale.set(1.05, 1.35, 0.75);
    f.add(beard);
    for (const s of [-1, 1]) {
      const mo = mesh(new THREE.CapsuleGeometry(0.018, 0.06, 4, 8), 'beard', s * 0.04, 1.355, 0.15);
      mo.rotation.z = s * 1.25;
      f.add(mo);
      const side = mesh(new THREE.SphereGeometry(0.07, 12, 10), 'beard', s * 0.13, 1.42, -0.03);
      side.scale.set(0.6, 1, 1);
      f.add(side);
    }

    // Mitre : deux pans pointus, galons (titulus et circulus), fanons à l'arrière
    const M = new THREE.Group();
    M.position.set(0, 1.5, 0);
    f.add(M);
    const mitreShape = new THREE.Shape();
    mitreShape.moveTo(-0.165, 0); mitreShape.lineTo(0.165, 0);
    mitreShape.quadraticCurveTo(0.18, 0.27, 0, 0.47);
    mitreShape.quadraticCurveTo(-0.18, 0.27, -0.165, 0);
    for (const side of [1, -1]) {
      const panel = mesh(new THREE.ExtrudeGeometry(mitreShape, { depth: 0.02, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.008, bevelSegments: 2, curveSegments: 20 }), 'alb', 0, 0, side * 0.055 - 0.01);
      panel.rotation.x = -side * 0.12;
      M.add(panel);
      const title = mesh(new THREE.BoxGeometry(0.045, 0.4, 0.008), 'gold', 0, 0.2, side * 0.055 + (side > 0 ? 0.022 : -0.03));
      title.rotation.x = -side * 0.12;
      M.add(title);
    }
    M.add(mesh(new THREE.CylinderGeometry(0.17, 0.168, 0.075, 40), 'gold', 0, 0.035, 0)); // circulus
    M.add(mesh(new THREE.SphereGeometry(0.02, 10, 8), 'accent2', 0, 0.035, 0.172));
    M.add(mesh(new THREE.SphereGeometry(0.018, 8, 6), 'gold', 0, 0.45, 0.04));
    for (const s of [-1, 1]) {
      const lappet = mesh(new THREE.BoxGeometry(0.06, 0.3, 0.012), 'alb', s * 0.07, -0.12, -0.17);
      lappet.rotation.x = 0.15;
      M.add(lappet);
      M.add(mesh(new THREE.BoxGeometry(0.065, 0.03, 0.016), 'gold', s * 0.07, -0.26, -0.15));
    }
    return piece;
  }


  // ===========================================================================
  // Dame : reine en robe longue, manteau d'hermine, couronne et sceptre
  // ===========================================================================
  function makeQueenFigure() {
    const piece = new THREE.Group();
    piece.add(pedestal());
    const f = new THREE.Group();
    f.position.y = FIG_Y;
    f.scale.setScalar(1.4);
    piece.add(f);
    const ZS = 0.82;
    const flat = m => { m.scale.z = ZS; return m; };

    // Robe : jupe évasée, corsage ajusté
    const skirt = [[0.38, 0], [0.375, 0.04], [0.34, 0.22], [0.28, 0.48], [0.215, 0.74], [0.18, 0.86]];
    f.add(flat(mesh(revolve([...skirt, [0.17, 0.95], [0.2, 1.1], [0.215, 1.17], [0.18, 1.24], [0.1, 1.27], [0, 1.28]], { segments: 64 }), 'accent')));
    const hem = mesh(new THREE.TorusGeometry(0.378, 0.016, 6, 72), 'gold', 0, 0.025, 0);
    hem.rotation.x = Math.PI / 2;
    hem.scale.y = ZS;
    f.add(hem);
    // Bande brodée sur le devant de la jupe, avec motifs
    f.add(flat(mesh(revolve(skirt.map(([r, y]) => [r + 0.004, y]), { phiStart: -0.16, phiLength: 0.32, segments: 6 }), 'gold')));
    for (let i = 0; i < 5; i++) {
      const y = 0.12 + i * 0.15, r = 0.37 - i * 0.04;
      f.add(mesh(new THREE.SphereGeometry(0.016, 8, 6), 'jewel', 0, y, r * ZS + 0.012));
    }
    // Ceinture d'orfèvrerie et sa chaîne pendante
    const girdle = mesh(new THREE.TorusGeometry(0.182, 0.014, 6, 40), 'gold', 0, 0.86, 0);
    girdle.rotation.x = Math.PI / 2;
    girdle.scale.y = ZS;
    f.add(girdle);
    f.add(mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.3, 6), 'gold', 0, 0.71, 0.18));
    f.add(mesh(new THREE.SphereGeometry(0.022, 10, 8), 'jewel', 0, 0.56, 0.2));

    // Décolleté et collier
    f.add(flat(mesh(revolve([[0.212, 1.15], [0.205, 1.2], [0.17, 1.25]], { phiStart: -0.75, phiLength: 1.5, segments: 16 }), 'skin')));
    const necklace = mesh(new THREE.TorusGeometry(0.1, 0.009, 6, 32), 'gold', 0, 1.25, 0.05);
    necklace.rotation.x = Math.PI / 2 - 0.5;
    f.add(necklace);
    f.add(mesh(new THREE.SphereGeometry(0.02, 10, 8), 'jewel', 0, 1.19, 0.17));

    // Manteau doublé d'hermine (dans le dos), col d'hermine
    const cape = mesh(revolve([[0.25, 1.22], [0.29, 1.0], [0.34, 0.6], [0.41, 0.2], [0.43, 0.0]], { phiStart: Math.PI - 1.35, phiLength: 2.7 }), 'drape');
    cape.scale.z = 0.9;
    f.add(cape);
    for (const a of [Math.PI - 1.35, Math.PI + 1.35]) { // bordures d'hermine
      const pts = [[0.25, 1.22], [0.29, 1.0], [0.34, 0.6], [0.41, 0.2], [0.43, 0.02]].map(([r, y]) => new THREE.Vector3(Math.sin(a) * r, y, Math.cos(a) * r * 0.9));
      f.add(mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.035, 10), 'ermine'));
    }
    const collar = mesh(new THREE.TorusGeometry(0.19, 0.06, 12, 40), 'ermine', 0, 1.24, -0.02);
    collar.rotation.x = Math.PI / 2;
    collar.scale.set(1, 0.85, 1);
    f.add(collar);

    // Bras droit (-x) : sceptre fleurdelisé
    f.add(limb([-0.2, 1.17, 0], [-0.29, 0.97, 0.06], 0.052, 'accent'));
    f.add(limb([-0.29, 0.97, 0.06], [-0.25, 0.97, 0.19], 0.045, 'accent', 0.08)); // manche évasée
    const cuffR = mesh(new THREE.TorusGeometry(0.075, 0.012, 6, 20), 'ermine', -0.25, 0.97, 0.19);
    cuffR.rotation.y = -0.3;
    f.add(cuffR);
    f.add(fist(-0.25, 0.97, 0.23, 'skin'));
    const SX = -0.25, SZ = 0.23;
    f.add(mesh(new THREE.CylinderGeometry(0.013, 0.016, 0.85, 10), 'gold', SX, 1.13, SZ));
    f.add(mesh(new THREE.SphereGeometry(0.03, 12, 10), 'gold', SX, 1.56, SZ));
    f.add(mesh(new THREE.SphereGeometry(0.028, 12, 10), 'jewel', SX, 1.6, SZ));
    const lis = new THREE.Group();
    lis.position.set(SX, 1.63, SZ);
    const petal = mesh(new THREE.SphereGeometry(0.03, 10, 8), 'gold', 0, 0.06, 0);
    petal.scale.set(0.7, 1.9, 0.7);
    lis.add(petal);
    for (const s of [-1, 1]) {
      const side = mesh(new THREE.TorusGeometry(0.035, 0.012, 6, 12, Math.PI), 'gold', s * 0.035, 0.03, 0);
      side.rotation.z = s > 0 ? 0 : Math.PI;
      side.rotation.y = 0;
      lis.add(side);
    }
    lis.add(mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.015, 12), 'gold', 0, 0.0, 0));
    f.add(lis);

    // Bras gauche (+x) : une rose tenue devant la taille
    f.add(limb([0.2, 1.17, 0], [0.27, 0.95, 0.06], 0.052, 'accent'));
    f.add(limb([0.27, 0.95, 0.06], [0.12, 0.92, 0.2], 0.045, 'accent', 0.075));
    const cuff = mesh(new THREE.TorusGeometry(0.07, 0.012, 6, 20), 'ermine', 0.12, 0.92, 0.2);
    cuff.rotation.y = 1.2;
    f.add(cuff);
    f.add(fist(0.1, 0.92, 0.23, 'skin'));
    f.add(limb([0.1, 0.9, 0.25], [0.04, 1.06, 0.27], 0.006, 'leaf'));
    for (let i = 0; i < 6; i++) { // pétales en spirale
      const a = i * 2.4, r = 0.012 + i * 0.004;
      const p = mesh(new THREE.SphereGeometry(0.022, 10, 8), 'rose', 0.04 + Math.cos(a) * r, 1.07 + i * 0.002, 0.27 + Math.sin(a) * r);
      p.scale.set(1, 0.8, 1);
      f.add(p);
    }
    const leaf = mesh(new THREE.SphereGeometry(0.02, 8, 6), 'leaf', 0.075, 0.98, 0.26);
    leaf.scale.set(1.6, 0.5, 0.8);
    f.add(leaf);

    // Cou, tête, chevelure et longue tresse
    f.add(mesh(new THREE.CylinderGeometry(0.052, 0.06, 0.12, 14), 'skin', 0, 1.3, 0));
    const h = head(0.155, { browTilt: -0.04 });
    h.position.set(0, 1.45, 0.01);
    f.add(h);
    const hair = mesh(new THREE.SphereGeometry(0.17, 24, 18, 0, TAU, 0, Math.PI * 0.62), 'hair', 0, 1.46, -0.025);
    hair.rotation.x = -0.35;
    f.add(hair);
    for (const s of [-1, 1]) {
      const side = mesh(new THREE.SphereGeometry(0.075, 12, 10), 'hair', s * 0.13, 1.4, -0.02);
      side.scale.set(0.55, 1.3, 0.9);
      f.add(side);
    }
    for (let i = 0; i < 7; i++) { // tresse dans le dos
      const t = i / 6;
      f.add(mesh(new THREE.SphereGeometry(0.048 - t * 0.012, 10, 8), 'hair', 0, 1.38 - t * 0.5, -0.17 - Math.sin(t * 2) * 0.05));
    }
    // Couronne : bandeau, fleurons, pierres, coiffe de velours
    const C = new THREE.Group();
    C.position.set(0, 1.565, -0.01);
    C.rotation.x = -0.12;
    f.add(C);
    C.add(mesh(revolve([[0.148, 0], [0.152, 0.065], [0.14, 0.065], [0.136, 0], [0.148, 0]], { smooth: false, segments: 48 }), 'gold'));
    C.add(mesh(new THREE.SphereGeometry(0.13, 20, 12, 0, TAU, 0, Math.PI / 2), 'accent', 0, 0.02, 0));
    const N = 8;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * TAU;
      const x = Math.sin(a) * 0.15, z = Math.cos(a) * 0.15;
      const big = i % 2 === 0;
      const fl = mesh(new THREE.ConeGeometry(big ? 0.028 : 0.018, big ? 0.09 : 0.05, 8), 'gold', x, 0.065 + (big ? 0.045 : 0.025), z);
      C.add(fl);
      if (big) C.add(mesh(new THREE.SphereGeometry(0.018, 8, 6), 'gold', x, 0.165, z));
      C.add(mesh(new THREE.SphereGeometry(0.014, 8, 6), 'jewel', Math.sin(a + 0.4) * 0.153, 0.033, Math.cos(a + 0.4) * 0.153));
    }
    return piece;
  }


  // ===========================================================================
  // Roi : souverain en manteau d'hermine, couronne fermée, mains sur l'épée
  // ===========================================================================
  function makeKingFigure() {
    const piece = new THREE.Group();
    piece.add(pedestal());
    const f = new THREE.Group();
    f.position.y = FIG_Y;
    f.scale.setScalar(1.5);
    piece.add(f);
    const ZS = 0.82;
    const flat = m => { m.scale.z = ZS; return m; };

    // Poulaines (chaussures pointues)
    for (const s of [-1, 1]) {
      const shoe = mesh(new THREE.SphereGeometry(0.06, 14, 10), 'leather', s * 0.09, 0.03, 0.22);
      shoe.scale.set(0.8, 0.55, 1.9);
      f.add(shoe);
    }
    // Robe longue et broderies
    const robe = [[0.33, 0], [0.32, 0.05], [0.29, 0.3], [0.25, 0.6], [0.235, 0.8], [0.25, 0.98], [0.27, 1.12], [0.24, 1.2], [0.13, 1.27], [0, 1.28]];
    f.add(flat(mesh(revolve(robe, { segments: 64 }), 'accent')));
    const hem = mesh(new THREE.TorusGeometry(0.328, 0.016, 6, 72), 'gold', 0, 0.025, 0);
    hem.rotation.x = Math.PI / 2;
    hem.scale.y = ZS;
    f.add(hem);
    f.add(flat(mesh(revolve(robe.slice(0, 5).map(([r, y]) => [r + 0.004, y]), { phiStart: -0.22, phiLength: 0.44, segments: 8 }), 'gold')));
    for (let i = 0; i < 4; i++) { // fleurons brodés sur le panneau doré
      const y = 0.14 + i * 0.17, r = 0.322 - i * 0.025;
      f.add(mesh(new THREE.SphereGeometry(0.02, 10, 8), 'jewel', 0, y, r * ZS + 0.01));
      for (const s of [-1, 1]) f.add(mesh(new THREE.SphereGeometry(0.011, 8, 6), 'accent2', s * 0.03, y + 0.02, r * ZS + 0.008));
    }
    // Ceinture
    const belt = mesh(new THREE.TorusGeometry(0.238, 0.02, 8, 48), 'gold', 0, 0.8, 0);
    belt.rotation.x = Math.PI / 2;
    belt.scale.y = ZS;
    f.add(belt);
    f.add(mesh(new THREE.BoxGeometry(0.07, 0.06, 0.02), 'gold', 0, 0.8, 0.198));
    f.add(mesh(new THREE.SphereGeometry(0.017, 8, 6), 'jewel', 0, 0.8, 0.21));

    // Manteau royal avec traîne, bordé d'hermine
    const mantle = [[0.27, 1.22], [0.32, 1.0], [0.38, 0.6], [0.46, 0.2], [0.52, 0.0]];
    const cape = mesh(revolve(mantle, { phiStart: Math.PI - 1.45, phiLength: 2.9 }), 'drape');
    cape.scale.z = 1.15;
    f.add(cape);
    for (const a of [Math.PI - 1.45, Math.PI + 1.45]) {
      const pts = mantle.map(([r, y]) => new THREE.Vector3(Math.sin(a) * r, Math.max(0.02, y), Math.cos(a) * r * 1.15));
      f.add(mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.04, 10), 'ermine'));
    }
    const train = mesh(new THREE.TorusGeometry(0.52, 0.035, 8, 48, 2.9), 'ermine', 0, 0.025, 0);
    train.rotation.set(Math.PI / 2, 0, Math.PI / 2 - 1.45 + Math.PI);
    train.scale.y = 1.15;
    f.add(train);
    // Pèlerine d'hermine sur les épaules
    f.add(flat(mesh(revolve([[0.32, 1.05], [0.31, 1.12], [0.27, 1.2], [0.17, 1.27], [0.1, 1.29]], { segments: 56 }), 'ermine')));

    // Bras : les deux mains reposent sur le pommeau de l'épée
    for (const s of [-1, 1]) {
      f.add(limb([s * 0.23, 1.15, 0], [s * 0.28, 0.95, 0.12], 0.058, 'accent'));
      f.add(limb([s * 0.28, 0.95, 0.12], [s * 0.08, 0.93, 0.29], 0.05, 'accent'));
      const cuff = mesh(new THREE.TorusGeometry(0.056, 0.02, 8, 20), 'ermine', s * 0.1, 0.932, 0.275);
      cuff.rotation.y = s * 0.85;
      f.add(cuff);
      const hand = mesh(new THREE.SphereGeometry(0.052, 14, 10), 'skin', s * 0.045, 0.935, 0.31);
      hand.scale.set(1.1, 0.9, 1);
      f.add(hand);
      f.add(mesh(new THREE.SphereGeometry(0.018, 8, 6), 'gold', s * 0.055, 0.96, 0.345)); // bague
    }
    // Épée plantée pointe en bas
    const SZ = 0.31;
    f.add(mesh(new THREE.SphereGeometry(0.035, 14, 10), 'gold', 0, 1.0, SZ));
    f.add(mesh(new THREE.SphereGeometry(0.018, 8, 6), 'jewel', 0, 1.0, SZ + 0.03));
    f.add(mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.08, 10), 'leather', 0, 0.9, SZ));
    f.add(mesh(new THREE.BoxGeometry(0.26, 0.03, 0.035), 'gold', 0, 0.85, SZ));
    for (const s of [-1, 1]) f.add(mesh(new THREE.SphereGeometry(0.02, 8, 6), 'gold', s * 0.135, 0.85, SZ));
    const bladeShape = new THREE.Shape();
    bladeShape.moveTo(-0.028, 0); bladeShape.lineTo(0.028, 0); bladeShape.lineTo(0.02, -0.72); bladeShape.lineTo(0, -0.8); bladeShape.lineTo(-0.02, -0.72); bladeShape.lineTo(-0.028, 0);
    f.add(mesh(new THREE.ExtrudeGeometry(bladeShape, { depth: 0.008, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.004, bevelSegments: 1 }), 'metal', 0, 0.835, SZ - 0.004));
    f.add(mesh(new THREE.BoxGeometry(0.008, 0.55, 0.012), 'dark', 0, 0.52, SZ + 0.006)); // gorge de la lame

    // Cou, tête, chevelure et grande barbe
    f.add(mesh(new THREE.CylinderGeometry(0.06, 0.068, 0.1, 14), 'skin', 0, 1.3, 0));
    const h = head(0.165, { browTilt: 0.1 });
    h.position.set(0, 1.45, 0.01);
    f.add(h);
    const beard = mesh(new THREE.SphereGeometry(0.12, 20, 14), 'hair', 0, 1.31, 0.075);
    beard.scale.set(1.1, 1.5, 0.75);
    f.add(beard);
    const beardTip = mesh(new THREE.ConeGeometry(0.07, 0.14, 14), 'hair', 0, 1.17, 0.1);
    beardTip.rotation.x = Math.PI;
    f.add(beardTip);
    for (const s of [-1, 1]) {
      const mo = mesh(new THREE.CapsuleGeometry(0.02, 0.08, 4, 8), 'hair', s * 0.05, 1.39, 0.15);
      mo.rotation.z = s * 1.1;
      f.add(mo);
      const lock = mesh(new THREE.SphereGeometry(0.08, 12, 10), 'hair', s * 0.14, 1.38, -0.04);
      lock.scale.set(0.6, 1.5, 1);
      f.add(lock);
    }
    const hair = mesh(new THREE.SphereGeometry(0.175, 24, 18, 0, TAU, 0, Math.PI * 0.6), 'hair', 0, 1.46, -0.03);
    hair.rotation.x = -0.4;
    f.add(hair);

    // Couronne fermée : bandeau, fleurons, deux arceaux, globe et croix
    const C = new THREE.Group();
    C.position.set(0, 1.575, -0.01);
    f.add(C);
    C.add(mesh(revolve([[0.158, 0], [0.163, 0.08], [0.15, 0.08], [0.146, 0], [0.158, 0]], { smooth: false, segments: 48 }), 'gold'));
    C.add(mesh(new THREE.SphereGeometry(0.145, 20, 12, 0, TAU, 0, Math.PI / 2), 'accent', 0, 0.04, 0));
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU;
      C.add(mesh(new THREE.SphereGeometry(0.016, 8, 6), i % 2 ? 'jewel' : 'accent2', Math.sin(a) * 0.164, 0.04, Math.cos(a) * 0.164));
      if (i % 2 === 0) {
        const fl = mesh(new THREE.ConeGeometry(0.03, 0.08, 8), 'gold', Math.sin(a) * 0.155, 0.12, Math.cos(a) * 0.155);
        C.add(fl);
        C.add(mesh(new THREE.SphereGeometry(0.016, 8, 6), 'gold', Math.sin(a) * 0.155, 0.17, Math.cos(a) * 0.155));
      }
    }
    for (const rot of [0, Math.PI / 2]) {
      const arch = mesh(new THREE.TorusGeometry(0.152, 0.014, 8, 32, Math.PI), 'gold', 0, 0.075, 0);
      arch.rotation.y = rot;
      arch.scale.y = 1.25;
      C.add(arch);
    }
    C.add(mesh(new THREE.SphereGeometry(0.04, 16, 12), 'gold', 0, 0.28, 0));
    C.add(mesh(new THREE.BoxGeometry(0.022, 0.12, 0.022), 'gold', 0, 0.36, 0));
    C.add(mesh(new THREE.BoxGeometry(0.075, 0.022, 0.022), 'gold', 0, 0.375, 0));
    C.add(mesh(new THREE.SphereGeometry(0.012, 8, 6), 'jewel', 0, 0.375, 0.014));
    return piece;
  }

  registerTheme('medieval', {
    name: 'Médiéval',
    materials,
    titles: {
      p: 'Fantassin à la lance', r: 'Tour de guet et son arbalétrier', n: 'Chevalier sur son destrier',
      b: 'Évêque', q: 'Reine', k: 'Roi',
    },
    builders: {
      p: makeFootSoldier,
      r: makeWatchTower,
      n: makeMountedKnight,
      b: makeBishopFigure,
      q: makeQueenFigure,
      k: makeKingFigure,
    },
  });
})();
