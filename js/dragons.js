// Thème « Dragons » : chaque pièce est une sculpture draconique sur un socle de roche volcanique.
// Script classique (chargé par index.html dans l'ordre). Dépend de : THREE, pieces.js.
//
// Conventions (comme le thème Médiéval) :
//   - socle de y = 0 à 0.3, sujet posé dessus ; la pièce regarde vers +z ;
//   - chaque maillage porte un « rôle » qui choisit son matériau selon le camp ;
//   - les parties d'un même rôle sont fusionnées automatiquement (mergeByRole).
(() => {
  const TAU = Math.PI * 2;
  const UP = new THREE.Vector3(0, 1, 0);
  const BASE_Y = 0.3;

  // ===========================================================================
  // Textures générées
  // ===========================================================================
  // Écailles imbriquées : rangées de demi-cercles décalés, avec relief.
  function scaleTextures() {
    const S = 256, rows = 8, cols = 8;
    const mk = () => { const c = document.createElement('canvas'); c.width = c.height = S; return c.getContext('2d'); };
    const col = mk(), bump = mk();
    col.fillStyle = '#9a9a9a'; col.fillRect(0, 0, S, S);
    bump.fillStyle = '#000'; bump.fillRect(0, 0, S, S);
    const w = S / cols, h = S / rows;
    let seed = 99;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let r = rows; r >= -1; r--) {           // de bas en haut : chaque rangée recouvre la précédente
      for (let c = -1; c <= cols; c++) {
        const x = c * w + (r % 2) * w / 2, y = r * h;
        const g = col.createRadialGradient(x, y - h * 0.2, 1, x, y, w * 0.6);
        const v = 205 + rnd() * 40 | 0;
        g.addColorStop(0, `rgb(${v},${v},${v})`); g.addColorStop(1, `rgb(${v - 70},${v - 70},${v - 70})`);
        col.fillStyle = g;
        col.beginPath(); col.arc(x, y, w * 0.56, 0, Math.PI); col.closePath(); col.fill();
        const gb = bump.createRadialGradient(x, y, 1, x, y, w * 0.56);
        gb.addColorStop(0, '#fff'); gb.addColorStop(0.85, '#999'); gb.addColorStop(1, '#000');
        bump.fillStyle = gb;
        bump.beginPath(); bump.arc(x, y, w * 0.56, 0, Math.PI); bump.closePath(); bump.fill();
      }
    }
    const tex = (ctx, srgb) => {
      const t = new THREE.CanvasTexture(ctx.canvas);
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(14, 9); // écailles fines : sinon on voit des rayures
      if (srgb) t.colorSpace = THREE.SRGBColorSpace;
      return t;
    };
    return { map: tex(col, true), bump: tex(bump, false) };
  }
  const scales = scaleTextures();

  // Coquille d'œuf mouchetée
  function speckleTexture() {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    g.fillStyle = '#e6e6e6'; g.fillRect(0, 0, 128, 128);
    let seed = 5;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 220; i++) {
      const v = 120 + rnd() * 80 | 0;
      g.fillStyle = `rgba(${v},${v - 10},${v - 20},${0.35 + rnd() * 0.4})`;
      g.beginPath(); g.ellipse(rnd() * 128, rnd() * 128, 1 + rnd() * 3, 1 + rnd() * 2, rnd() * 3, 0, TAU); g.fill();
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(3, 2);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }
  const speckle = speckleTexture();

  // Pierre de taille ancienne : blocs irréguliers, joints creusés, quelques fissures.
  function stoneTextures() {
    const S = 256, rows = 8, cols = 4;
    const mk = () => { const c = document.createElement('canvas'); c.width = c.height = S; return c.getContext('2d'); };
    const col = mk(), bump = mk();
    let seed = 777;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    col.fillStyle = '#7c7a76'; col.fillRect(0, 0, S, S);
    bump.fillStyle = '#000'; bump.fillRect(0, 0, S, S);
    const bh = S / rows, bw = S / cols;
    for (let r = 0; r < rows; r++) {
      for (let c = -1; c < cols; c++) {
        const x = c * bw + (r % 2) * bw / 2 + (rnd() - 0.5) * 6, y = r * bh;
        const v = 165 + rnd() * 70 | 0;
        col.fillStyle = `rgb(${v},${v - 3},${v - 8})`;
        col.fillRect(x + 3, y + 3, bw - 6, bh - 6);
        bump.fillStyle = `rgb(${190 + rnd() * 60 | 0},${190},${190})`;
        bump.fillRect(x + 4, y + 4, bw - 8, bh - 8);
        for (let i = 0; i < 30; i++) {
          const g = v - 30 + rnd() * 50 | 0;
          col.fillStyle = `rgba(${g},${g},${g},0.4)`;
          col.fillRect(x + 4 + rnd() * (bw - 10), y + 4 + rnd() * (bh - 10), 2, 2);
        }
      }
    }
    col.strokeStyle = 'rgba(40,38,36,0.7)'; bump.strokeStyle = '#000'; // fissures
    for (let i = 0; i < 6; i++) {
      let x = rnd() * S, y = rnd() * S;
      col.lineWidth = bump.lineWidth = 1.5;
      col.beginPath(); bump.beginPath(); col.moveTo(x, y); bump.moveTo(x, y);
      for (let k = 0; k < 6; k++) { x += (rnd() - 0.5) * 22; y += rnd() * 14; col.lineTo(x, y); bump.lineTo(x, y); }
      col.stroke(); bump.stroke();
    }
    const tex = (ctx, srgb) => {
      const t = new THREE.CanvasTexture(ctx.canvas);
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(5, 3);
      if (srgb) t.colorSpace = THREE.SRGBColorSpace;
      return t;
    };
    return { map: tex(col, true), bump: tex(bump, false) };
  }
  const stone = stoneTextures();

  // Marbre poli : fond uni et veines douces (dessinées en couleur, le matériau reste blanc).
  function marbleTexture(base, vein) {
    const S = 512, c = document.createElement('canvas');
    c.width = c.height = S;
    const g = c.getContext('2d');
    g.fillStyle = base; g.fillRect(0, 0, S, S);
    let seed = base.length * 7 + 3;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 26; i++) {
      g.strokeStyle = vein; g.globalAlpha = 0.08 + rnd() * 0.25; g.lineWidth = 0.6 + rnd() * 2.4;
      let x = rnd() * S, y = rnd() * S;
      g.beginPath(); g.moveTo(x, y);
      for (let k = 0; k < 8; k++) { const nx = x + (rnd() - 0.3) * 120, ny = y + (rnd() - 0.5) * 90; g.quadraticCurveTo((x + nx) / 2 + (rnd() - 0.5) * 40, (y + ny) / 2, nx, ny); x = nx; y = ny; }
      g.stroke();
    }
    g.globalAlpha = 1;
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  // ===========================================================================
  // Matériaux par camp, dans l'esprit d'un jeu d'échecs classique :
  //   blancs = ivoire poli, rehauts d'or, yeux d'ambre, socle de marbre blanc ;
  //   noirs  = ébène poli, rehauts d'or, yeux de braise, socle de marbre noir.
  // ===========================================================================
  const PALETTE = {
    white: {
      scale: 0xf2e7cc, belly: 0xe3cfa3, horn: 0xfbf5e6, membrane: 0xe9dbb8, claw: 0xb08d4a,
      glow: 0xffc24a, marble: ['#efe9de', '#9c9489'], shell: 0xf3ecdc, gold: 0xe2b65a, wood: 0x6e4a2c,
      robe: 0xf1e8d4, robe2: 0xd8c497, teeth: 0xfffaf0, tongue: 0xb04a5a, stone: 0xe2dccf,
    },
    black: {
      scale: 0x1a1412, belly: 0x33261f, horn: 0x3e332c, membrane: 0x2c201d, claw: 0xb08d4a,
      glow: 0xff3b1a, marble: ['#1d191a', '#6b6466'], shell: 0x2c2523, gold: 0xd2a24a, wood: 0x3a2618,
      robe: 0x1a1515, robe2: 0x5a1218, teeth: 0xefe6d2, tongue: 0x7a2030, stone: 0x3e393b,
    },
  };
  const cache = {};
  function materials(white) {
    const key = white ? 'white' : 'black';
    if (cache[key]) return cache[key];
    const c = PALETTE[key];
    const std = (color, roughness, metalness = 0, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra });
    // Vernis brillant : couche transparente très lisse au-dessus de la matière
    const glossy = (color, roughness, extra = {}) => new THREE.MeshPhysicalMaterial({
      color, roughness, metalness: 0.05, clearcoat: 1, clearcoatRoughness: 0.06, envMapIntensity: 1.3, ...extra,
    });
    const marble = glossy(0xffffff, 0.18, { map: marbleTexture(...c.marble), clearcoatRoughness: 0.04 });
    return (cache[key] = {
      body: marble,
      rock: marble,
      scale: glossy(c.scale, 0.2, { map: scales.map, bumpMap: scales.bump, bumpScale: 0.8 }),
      belly: glossy(c.belly, 0.25),
      horn: glossy(c.horn, 0.22),
      claw: std(c.claw, 0.25, 0.85),                  // griffes dorées
      teeth: glossy(c.teeth, 0.2),
      tongue: glossy(c.tongue, 0.35),
      membrane: glossy(c.membrane, 0.35, { side: THREE.DoubleSide, clearcoat: 0.6 }),
      glow: std(c.glow, 0.25, 0, { emissive: c.glow, emissiveIntensity: 1.5 }),
      eyeWhite: glossy(0x120e0c, 0.1),
      pupil: std(0x050404, 0.4),
      shell: glossy(c.shell, 0.3, { map: speckle, side: THREE.DoubleSide }),
      gold: std(c.gold, 0.25, 0.9),
      steel: std(0xd8dde3, 0.18, 1),
      stone: std(c.stone, 0.85, 0, { map: stone.map, bumpMap: stone.bump, bumpScale: 2.2 }),
      dark: std(0x0b0909, 0.9),
      wood: std(c.wood, 0.8),
      robe: glossy(c.robe, 0.6, { side: THREE.DoubleSide, clearcoat: 0.2 }),
      robe2: glossy(c.robe2, 0.5, { side: THREE.DoubleSide, clearcoat: 0.3 }),
    });
  }

  // ===========================================================================
  // Outils de modélisation
  // ===========================================================================
  function mesh(geo, role, x = 0, y = 0, z = 0) {
    const m = new THREE.Mesh(geo);
    m.position.set(x, y, z);
    m.userData.role = role;
    return m;
  }
  const V3 = p => new THREE.Vector3(...p);

  // Segment arrondi entre deux points (capsule) ou tronc de cône (r en a, r2 en b).
  function limb(a, b, r, role, r2) {
    const A = V3(a), B = V3(b), dir = B.clone().sub(A), len = dir.length();
    const m = mesh(r2 === undefined ? new THREE.CapsuleGeometry(r, len, 6, 14) : new THREE.CylinderGeometry(r2, r, len, 14), role);
    m.position.copy(A).add(B).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(UP, dir.normalize());
    return m;
  }

  // Tube qui s'affine le long d'une courbe : cornes, queues, cous, griffes…
  function taper(points, r0, r1, role, { radial = 12, tubular = 28, cap = true } = {}) {
    const curve = new THREE.CatmullRomCurve3(points.map(V3));
    const g = new THREE.TubeGeometry(curve, tubular, 1, radial, false);
    const pos = g.attributes.position, c = new THREE.Vector3(), v = new THREE.Vector3();
    for (let i = 0; i <= tubular; i++) {
      const t = i / tubular;
      curve.getPointAt(t, c);
      const r = r0 + (r1 - r0) * t;
      for (let j = 0; j <= radial; j++) {
        const k = i * (radial + 1) + j;
        v.fromBufferAttribute(pos, k).sub(c).multiplyScalar(r).add(c);
        pos.setXYZ(k, v.x, v.y, v.z);
      }
    }
    g.computeVertexNormals();
    const group = new THREE.Group();
    group.add(mesh(g, role));
    if (cap) { // bouts arrondis
      group.add(mesh(new THREE.SphereGeometry(r0, radial, 8), role, ...points[0]));
      if (r1 > 0.004) group.add(mesh(new THREE.SphereGeometry(r1, radial, 8), role, ...points[points.length - 1]));
    }
    return group;
  }

  // Surface de révolution lissée ; phi = 0 correspond à l'avant (+z).
  function revolve(points, { segments = 40, phiStart = 0, phiLength = TAU, smooth = true } = {}) {
    let pts = points.map(([r, y]) => new THREE.Vector2(r, y));
    if (smooth) pts = new THREE.SplineCurve(pts).getPoints(points.length * 6).map(p => new THREE.Vector2(Math.max(0, p.x), p.y));
    const g = new THREE.LatheGeometry(pts, segments, phiStart, phiLength);
    g.computeVertexNormals();
    return g;
  }

  // Bruit doux et déterministe pour les surfaces rocheuses
  const noise3 = (x, y, z) =>
    Math.sin(x * 5.1 + y * 1.7) * 0.5 + Math.sin(y * 7.3 + z * 3.1) * 0.3 + Math.sin(z * 9.7 + x * 4.3) * 0.2;

  // Socle de roche volcanique, irrégulier, avec des cristaux lumineux
  function rockBase(seed = 0) {
    const g = revolve([[0, 0], [0.84, 0], [0.87, 0.07], [0.83, 0.17], [0.76, 0.26], [0.6, 0.3], [0, 0.3]], { segments: 56 });
    const pos = g.attributes.position, v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      const r = Math.hypot(v.x, v.z);
      if (r < 0.05 || v.y < 0.005) continue;   // dessous plat
      const k = 1 + 0.02 * noise3(v.x * 3 + seed, v.y * 4, v.z * 3 - seed); // marbre taillé : légère ondulation
      v.x *= k; v.z *= k; v.y += 0.006 * noise3(v.z * 6, seed, v.x * 6) * (v.y / 0.3);
      pos.setXYZ(i, v.x, v.y, v.z);
    }
    g.computeVertexNormals();
    const group = new THREE.Group();
    group.add(mesh(g, 'rock'));
    // Filets d'or en haut et en bas du socle
    for (const [y, r, t] of [[0.022, 0.855, 0.012], [0.272, 0.735, 0.01]]) {
      const ring = mesh(new THREE.TorusGeometry(r, t, 8, 72), 'gold', 0, y, 0);
      ring.rotation.x = Math.PI / 2;
      group.add(ring);
    }
    // Amas de cristaux lumineux qui affleurent sur le bord de la roche
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU + 0.6 + seed, r = 0.7;
      for (let k = 0; k < 3; k++) {
        const size = [0.07, 0.05, 0.04][k], da = (k - 1) * 0.12;
        const cr = mesh(new THREE.OctahedronGeometry(size, 0), 'glow', Math.sin(a + da) * (r + k * 0.03), 0.22 + k * 0.01, Math.cos(a + da) * (r + k * 0.03));
        cr.scale.set(0.55, 2.2, 0.55);
        cr.rotation.set(Math.cos(a) * (0.5 + k * 0.25), a, -Math.sin(a) * (0.5 + k * 0.25) + (k - 1) * 0.4);
        group.add(cr);
      }
    }
    return group;
  }

  // Œil de dragon : globe sombre, iris lumineux, pupille fendue, paupière écailleuse
  function dragonEye(r) {
    const g = new THREE.Group();
    const ball = mesh(new THREE.SphereGeometry(r, 16, 12), 'eyeWhite');
    ball.scale.set(1, 0.8, 0.7);
    g.add(ball);
    const iris = mesh(new THREE.SphereGeometry(r * 0.8, 16, 12), 'glow', 0, 0, r * 0.34);
    iris.scale.set(1, 0.9, 0.5);
    g.add(iris);
    g.add(mesh(new THREE.BoxGeometry(r * 0.18, r * 1.2, r * 0.2), 'pupil', 0, 0, r * 0.62));
    const lid = mesh(new THREE.SphereGeometry(r * 1.12, 16, 10, 0, TAU, 0, Math.PI * 0.42), 'scale', 0, r * 0.08, 0);
    lid.rotation.x = 0.5;
    g.add(lid);
    return g;
  }

  // Griffe recourbée
  function claw(at, dir, len, role = 'claw') {
    const [x, y, z] = at, [dx, dy, dz] = dir;
    return taper([[x, y, z], [x + dx * len * 0.55, y + dy * len * 0.55, z + dz * len * 0.55], [x + dx * len, y + dy * len - len * 0.25, z + dz * len]],
      len * 0.22, 0.002, role, { radial: 8, tubular: 8 });
  }

  // Aile membraneuse : os (bras + doigts) et membrane festonnée entre eux.
  // Construite dans le plan XY (envergure vers +x), puis orientée par l'appelant.
  function wing(span, height, { fingers = 3 } = {}) {
    const g = new THREE.Group();
    const tip = [span, height, 0];
    const elbow = [span * 0.38, height * 0.72, 0];
    g.add(taper([[0, 0, 0], elbow, tip], 0.035 * span, 0.006 * span, 'scale', { radial: 8, tubular: 16 }));
    // Doigts qui partent du poignet vers le bord de fuite
    const ends = [];
    for (let i = 0; i < fingers; i++) {
      const t = (i + 1) / (fingers + 1);
      const end = [span * (0.95 - t * 0.6), -height * (0.15 + t * 0.55), 0];
      ends.push(end);
      g.add(taper([elbow, [(elbow[0] + end[0]) / 2, (elbow[1] + end[1]) / 2 + 0.02, 0], end], 0.018 * span, 0.004 * span, 'scale', { radial: 6, tubular: 10 }));
    }
    // Membrane : contour du bout de l'aile au corps, en festons entre les doigts
    const s = new THREE.Shape();
    s.moveTo(0, 0);
    s.lineTo(elbow[0], elbow[1]);
    s.lineTo(tip[0], tip[1]);
    let prev = tip;
    for (const e of [...ends, [0, -height * 0.55, 0]]) {
      const mx = (prev[0] + e[0]) / 2, my = (prev[1] + e[1]) / 2;
      s.quadraticCurveTo(mx + 0.02 * span, my + height * 0.12, e[0], e[1]); // feston creusé vers l'intérieur
      prev = e;
    }
    s.lineTo(0, 0);
    g.add(mesh(new THREE.ShapeGeometry(s, 16), 'membrane'));
    // Articulations (épaule, poignet), nervures de la membrane, griffes
    g.add(mesh(new THREE.SphereGeometry(0.045 * span, 12, 10), 'scale', 0, 0, 0));
    g.add(mesh(new THREE.SphereGeometry(0.04 * span, 12, 10), 'scale', ...elbow));
    let prevEnd = tip;
    for (const e of ends) {
      const mid = [(prevEnd[0] + e[0]) / 2 * 0.8 + elbow[0] * 0.2, (prevEnd[1] + e[1]) / 2 * 0.8 + elbow[1] * 0.2, 0.002];
      g.add(taper([elbow, mid], 0.006 * span, 0.002 * span, 'scale', { radial: 5, tubular: 6, cap: false }));
      const fingerClaw = mesh(new THREE.ConeGeometry(0.012 * span, 0.04 * span, 6), 'claw', e[0], e[1] - 0.015 * span, 0);
      fingerClaw.rotation.z = Math.PI;
      g.add(fingerClaw);
      prevEnd = e;
    }
    g.add(claw(elbow, [0, 1, 0], 0.07 * span, 'claw'));
    const tipClaw = mesh(new THREE.ConeGeometry(0.014 * span, 0.06 * span, 6), 'claw', tip[0] + 0.02 * span, tip[1] + 0.02 * span, 0);
    tipClaw.rotation.z = -Math.PI / 3;
    g.add(tipClaw);
    return g;
  }

  // Plaques ventrales séparées le long d'une courbe (côté +z), comme de vraies écailles
  function bellyPlates(points, n, w0, w1, offset = 0.06) {
    const curve = new THREE.CatmullRomCurve3(points.map(V3));
    const g = new THREE.Group();
    const geo = new THREE.CapsuleGeometry(0.022, 1, 4, 10);
    geo.rotateZ(Math.PI / 2);
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n, p = curve.getPointAt(t), tan = curve.getTangentAt(t);
      const w = w0 + (w1 - w0) * t;
      const plate = mesh(geo, 'belly', p.x, p.y, p.z + offset * (1 - t * 0.35));
      plate.scale.set(w, 1, 0.55);
      plate.rotation.x = Math.atan2(tan.z, tan.y);
      g.add(plate);
    }
    return g;
  }

  // Place une paire d'ailes parfaitement symétriques. pos et rot décrivent l'aile droite
  // (côté +x) ; l'aile gauche en est le reflet exact : rotation (rx, -ry, -rz) et
  // demi-tour de l'aile sur elle-même (l'aile est plane, ce demi-tour équivaut au miroir).
  function wingPair(span, height, fingers, pos, rot) {
    const g = new THREE.Group();
    for (const s of [1, -1]) {
      const outer = new THREE.Group();
      outer.position.set(s * pos[0], pos[1], pos[2]);
      outer.rotation.set(rot[0], s * rot[1], s * rot[2]);
      const w = wing(span, height, { fingers });
      if (s < 0) w.rotation.y = Math.PI;
      outer.add(w);
      g.add(outer);
    }
    return g;
  }

  // Rangée de piquants le long d'une courbe (crête dorsale)
  function spikes(points, h0, h1, n, role = 'horn', lean = -0.5) {
    const curve = new THREE.CatmullRomCurve3(points.map(V3));
    const g = new THREE.Group();
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n, p = curve.getPointAt(t);
      const h = h0 + (h1 - h0) * t;
      const sp = mesh(new THREE.ConeGeometry(h * 0.35, h, 6), role, p.x, p.y + h * 0.4, p.z);
      sp.rotation.x = lean;
      g.add(sp);
    }
    return g;
  }

  // ===========================================================================
  // Pion : dragonnet qui éclot de son œuf, dans un nid de brindilles
  // ===========================================================================
  function makeHatchling() {
    const piece = new THREE.Group();
    piece.add(rockBase(0.3));
    const f = new THREE.Group();
    f.position.y = BASE_Y;
    f.scale.setScalar(1.15);
    piece.add(f);

    // Nid de brindilles
    const nest = mesh(new THREE.TorusGeometry(0.38, 0.07, 10, 40), 'wood', 0, 0.06, 0);
    nest.rotation.x = Math.PI / 2;
    nest.scale.set(1, 1, 0.7);
    f.add(nest);
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * TAU, r = 0.38 + (i % 3) * 0.03;
      const twig = mesh(new THREE.CylinderGeometry(0.012, 0.016, 0.34, 6), 'wood', Math.sin(a) * r, 0.08, Math.cos(a) * r);
      twig.rotation.set(Math.PI / 2 + 0.3 * Math.sin(i * 2.1), a + 1.2, 0.25 * Math.cos(i * 1.7));
      f.add(twig);
    }

    // Œuf : coquille ouverte au bord dentelé
    const eggGeo = revolve([[0.0, 0.0], [0.2, 0.02], [0.33, 0.1], [0.4, 0.24], [0.42, 0.4], [0.4, 0.55], [0.36, 0.66], [0.32, 0.72]], { segments: 40 });
    const ep = eggGeo.attributes.position;
    for (let i = 0; i < ep.count; i++) { // bord brisé : dents irrégulières
      const y = ep.getY(i);
      if (y > 0.6) {
        const a = Math.atan2(ep.getX(i), ep.getZ(i));
        const k = (y - 0.6) / 0.12;
        const tooth = Math.abs(((a * 9 / Math.PI) % 2 + 2) % 2 - 1) * 2 - 1; // dents en zigzag
        ep.setY(i, y + k * (0.07 * tooth + 0.03 * Math.sin(a * 5)));
      }
    }
    eggGeo.computeVertexNormals();
    f.add(mesh(eggGeo, 'shell'));
    // Fissures qui descendent du bord brisé
    const eggProfile = [[0.0, 0.0], [0.2, 0.02], [0.33, 0.1], [0.4, 0.24], [0.42, 0.4], [0.4, 0.55], [0.36, 0.66], [0.32, 0.72]];
    const eggR = y => { for (let i = 0; i < eggProfile.length - 1; i++) { const [r0, y0] = eggProfile[i], [r1, y1] = eggProfile[i + 1]; if (y >= y0 && y <= y1) return r0 + (r1 - r0) * (y - y0) / (y1 - y0); } return 0.32; };
    for (const a0 of [0.35, 1.9, 3.3, 4.6]) {
      const pts = [];
      for (let k = 0; k <= 5; k++) {
        const y = 0.66 - k * 0.07, a = a0 + Math.sin(k * 2.3 + a0) * 0.12, r = eggR(y) + 0.004;
        pts.push([Math.sin(a) * r, y, Math.cos(a) * r]);
      }
      f.add(taper(pts, 0.006, 0.002, 'pupil', { radial: 4, tubular: 14, cap: false }));
    }
    // Fragments de coquille tombés dans le nid
    for (const [x, z, ry] of [[0.42, 0.28, 0.4], [-0.38, 0.34, 2.1], [0.22, -0.46, 4.0]]) {
      const frag = mesh(new THREE.SphereGeometry(0.14, 12, 8, 0, 1.3, 0.3, 0.9), 'shell', x, 0.1, z);
      frag.rotation.set(1.2, ry, 0.3);
      f.add(frag);
    }

    // --- Dragonnet ---
    const D = new THREE.Group();
    D.position.set(0, 0.55, 0.02);
    f.add(D);
    // Corps (en partie dans l'œuf) et ventre clair
    const body = mesh(new THREE.SphereGeometry(0.27, 24, 18), 'scale', 0, 0.05, -0.02);
    body.scale.set(1, 1.1, 0.95);
    D.add(body);
    const belly = mesh(new THREE.SphereGeometry(0.2, 20, 14), 'belly', 0, 0.06, 0.1);
    belly.scale.set(0.85, 1.05, 0.7);
    D.add(belly);
    // Cou
    D.add(taper([[0, 0.2, 0.0], [0, 0.34, 0.06], [0, 0.44, 0.13]], 0.13, 0.095, 'scale', { cap: false }));
    D.add(spikes([[0, 0.28, -0.12], [0, 0.42, -0.03], [0, 0.55, 0.02]], 0.07, 0.04, 4, 'horn', -0.7));

    // Tête
    const H = new THREE.Group();
    H.position.set(0, 0.56, 0.17);
    H.rotation.x = 0.12;
    H.scale.setScalar(1.18);
    D.add(H);
    const skull = mesh(new THREE.SphereGeometry(0.15, 24, 18), 'scale');
    skull.scale.set(1, 0.88, 1.1);
    H.add(skull);
    const snout = mesh(new THREE.CapsuleGeometry(0.08, 0.13, 8, 16), 'scale', 0, -0.035, 0.15);
    snout.rotation.x = Math.PI / 2;
    snout.scale.set(1, 1, 0.78);
    H.add(snout);
    H.add(mesh(new THREE.SphereGeometry(0.062, 14, 10), 'scale', 0, -0.02, 0.245)); // bout du museau
    for (const s of [-1, 1]) {
      H.add(mesh(new THREE.SphereGeometry(0.014, 8, 6), 'pupil', s * 0.03, 0.0, 0.3));   // narines
      const e = dragonEye(0.058);
      e.position.set(s * 0.085, 0.035, 0.085);
      e.rotation.y = s * 0.45;
      H.add(e);
      H.add(limb([s * 0.04, 0.085, 0.13], [s * 0.12, 0.08, 0.05], 0.022, 'scale')); // arcade sourcilière
      H.add(taper([[s * 0.07, 0.08, -0.03], [s * 0.1, 0.15, -0.1], [s * 0.11, 0.19, -0.21]], 0.03, 0.004, 'horn')); // cornes
      H.add(taper([[s * 0.11, 0.0, -0.04], [s * 0.17, 0.02, -0.1]], 0.02, 0.003, 'horn')); // pointes des joues
      for (let i = 0; i < 4; i++) { // petites dents
        const t = mesh(new THREE.ConeGeometry(0.009, 0.03, 6), 'teeth', s * (0.055 - i * 0.004), -0.085, 0.13 + i * 0.035);
        t.rotation.x = Math.PI;
        H.add(t);
      }
    }
    // Mâchoire inférieure entrouverte et langue
    const jaw = mesh(new THREE.CapsuleGeometry(0.058, 0.12, 8, 14), 'belly', 0, -0.1, 0.13);
    jaw.rotation.x = Math.PI / 2 + 0.25;
    jaw.scale.set(1, 1, 0.6);
    H.add(jaw);
    const tongue = mesh(new THREE.CapsuleGeometry(0.02, 0.06, 4, 8), 'tongue', 0, -0.08, 0.2);
    tongue.rotation.x = Math.PI / 2 + 0.15;
    tongue.scale.set(1.4, 1, 0.5);
    H.add(tongue);
    // Petite crête sur le crâne
    H.add(spikes([[0, 0.12, 0.05], [0, 0.13, -0.05], [0, 0.08, -0.15]], 0.05, 0.035, 3, 'horn', -0.9));

    // Pattes avant agrippées au bord de la coquille, griffes par-dessus
    for (const s of [-1, 1]) {
      D.add(limb([s * 0.17, 0.12, 0.1], [s * 0.24, 0.12, 0.27], 0.045, 'scale'));
      D.add(limb([s * 0.24, 0.12, 0.27], [s * 0.2, 0.16, 0.36], 0.038, 'scale'));
      D.add(mesh(new THREE.SphereGeometry(0.045, 12, 10), 'scale', s * 0.2, 0.16, 0.37));
      for (let k = -1; k <= 1; k++) D.add(claw([s * 0.2 + k * 0.025, 0.15, 0.4], [0, -0.3, 1], 0.06));
    }

    // Petites ailes qui se déplient
    D.add(wingPair(0.52, 0.32, 3, [0.14, 0.2, -0.14], [0.25, -0.7, 0.55]));

    // Queue qui déborde de l'œuf et s'enroule dans le nid, terminée par une pointe en fer de lance
    f.add(taper([[0.12, 0.66, -0.3], [0.26, 0.62, -0.44], [0.42, 0.42, -0.42], [0.47, 0.2, -0.22], [0.42, 0.1, 0.02]], 0.06, 0.016, 'scale', { tubular: 36 }));
    const spade = mesh(new THREE.ConeGeometry(0.05, 0.12, 4), 'horn', 0.41, 0.1, 0.09);
    spade.rotation.set(Math.PI / 2, 0, 0);
    spade.scale.set(1.2, 1, 0.35);
    f.add(spade);
    f.add(spikes([[0.15, 0.68, -0.33], [0.32, 0.6, -0.46], [0.45, 0.38, -0.4]], 0.05, 0.03, 4, 'horn', -0.3));

    return piece;
  }


  // ===========================================================================
  // Tête de dragon adulte (réutilisée par plusieurs pièces), regardant vers +z
  //   open : ouverture de la gueule (0 à 1) ; fire : lueur de feu dans la gueule
  // ===========================================================================
  function dragonHead({ open = 0.5, fire = true, horns = 'long' } = {}) {
    const H = new THREE.Group();
    // Crâne et museau (aplati)
    const skull = mesh(new THREE.SphereGeometry(0.13, 24, 18), 'scale');
    skull.scale.set(1, 0.86, 1.25);
    H.add(skull);
    const snout = taper([[0, -0.015, 0.06], [0, -0.025, 0.22], [0, -0.035, 0.35]], 0.088, 0.052, 'scale', { tubular: 16 });
    snout.scale.y = 0.75;
    H.add(snout);
    const tip = mesh(new THREE.SphereGeometry(0.055, 16, 12), 'scale', 0, -0.03, 0.36);
    tip.scale.set(1.15, 0.8, 1);
    H.add(tip);
    const noseHorn = mesh(new THREE.ConeGeometry(0.02, 0.07, 8), 'horn', 0, 0.025, 0.33);
    noseHorn.rotation.x = -0.5;
    H.add(noseHorn);
    for (const s of [-1, 1]) {
      H.add(mesh(new THREE.SphereGeometry(0.012, 8, 6), 'pupil', s * 0.028, -0.01, 0.4)); // narines
      const e = dragonEye(0.044);
      e.position.set(s * 0.085, 0.035, 0.1);
      e.rotation.y = s * 0.5;
      H.add(e);
      H.add(taper([[s * 0.035, 0.07, 0.19], [s * 0.09, 0.085, 0.1], [s * 0.12, 0.07, 0.0]], 0.022, 0.012, 'scale', { tubular: 10 })); // arcade
      // Cornes principales, longues et recourbées vers l'arrière
      if (horns === 'long') {
        H.add(taper([[s * 0.07, 0.07, -0.05], [s * 0.11, 0.15, -0.18], [s * 0.13, 0.2, -0.33], [s * 0.12, 0.29, -0.44]], 0.04, 0.003, 'horn', { tubular: 24 }));
      } else {
        H.add(taper([[s * 0.07, 0.07, -0.05], [s * 0.13, 0.17, -0.12], [s * 0.15, 0.3, -0.12]], 0.036, 0.003, 'horn', { tubular: 18 }));
      }
      H.add(taper([[s * 0.1, 0.0, -0.06], [s * 0.15, -0.02, -0.16], [s * 0.18, -0.05, -0.26]], 0.024, 0.003, 'horn', { tubular: 12 })); // cornes secondaires
      for (let i = 0; i < 3; i++) { // piquants des joues
        const sp = mesh(new THREE.ConeGeometry(0.014, 0.07 - i * 0.012, 6), 'horn', s * (0.1 + i * 0.01), -0.06 - i * 0.012, 0.02 - i * 0.05);
        sp.rotation.set(-1.6, 0, -s * 0.9);
        H.add(sp);
      }
      for (let i = 0; i < 6; i++) { // dents du haut
        const t = mesh(new THREE.ConeGeometry(0.008 + (i === 1 ? 0.004 : 0), 0.035 + (i === 1 ? 0.02 : 0), 6), 'teeth', s * (0.052 - i * 0.003), -0.07, 0.12 + i * 0.042);
        t.rotation.x = Math.PI;
        H.add(t);
      }
    }
    // Mâchoire inférieure (ouverture réglable), dents du bas, langue fourchue
    const J = new THREE.Group();
    J.position.set(0, -0.06, 0.02);
    J.rotation.x = 0.12 + open * 0.42;
    H.add(J);
    const jaw = taper([[0, -0.02, 0.0], [0, -0.035, 0.18], [0, -0.035, 0.31]], 0.065, 0.035, 'belly', { tubular: 14 });
    jaw.scale.set(1, 0.6, 1);
    J.add(jaw);
    for (const s of [-1, 1]) {
      for (let i = 0; i < 5; i++) {
        J.add(mesh(new THREE.ConeGeometry(0.007, 0.03, 6), 'teeth', s * (0.04 - i * 0.003), -0.005, 0.08 + i * 0.045));
      }
      J.add(taper([[0, -0.025, 0.16], [s * 0.012, -0.02, 0.27], [s * 0.03, -0.015, 0.33]], 0.012, 0.003, 'tongue', { radial: 6, tubular: 8 }));
    }
    if (fire) H.add(mesh(new THREE.SphereGeometry(0.035, 12, 10), 'glow', 0, -0.07, 0.16)); // braise au fond de la gueule
    for (const s of [-1, 1]) {
      // Collerette membraneuse derrière la mâchoire, tendue par des rayons de corne
      const fan = new THREE.Shape();
      fan.moveTo(0, 0);
      fan.lineTo(-0.05, 0.11); fan.quadraticCurveTo(-0.1, 0.09, -0.13, 0.07);
      fan.lineTo(-0.15, 0.02); fan.quadraticCurveTo(-0.15, -0.02, -0.14, -0.05);
      fan.lineTo(-0.1, -0.09); fan.lineTo(0, 0);
      const frill = new THREE.Group();
      frill.position.set(s * 0.115, -0.02, -0.05);
      frill.rotation.y = s * Math.PI / 2;
      frill.add(mesh(new THREE.ShapeGeometry(fan, 8), 'membrane'));
      for (const [x, y] of [[-0.05, 0.11], [-0.13, 0.07], [-0.15, 0.02], [-0.14, -0.05], [-0.1, -0.09]]) {
        frill.add(taper([[0, 0, 0.002], [x * 1.08, y * 1.08, 0.002]], 0.008, 0.002, 'horn', { radial: 5, tubular: 4 }));
      }
      H.add(frill);
      // Écailles perlées sur l'arcade sourcilière
      for (let i = 0; i < 4; i++) {
        H.add(mesh(new THREE.SphereGeometry(0.011 - i * 0.0015, 8, 6), 'horn', s * (0.05 + i * 0.022), 0.09 - i * 0.004, 0.17 - i * 0.05));
      }
      // Rebord des narines
      const rim = mesh(new THREE.TorusGeometry(0.014, 0.005, 6, 12), 'scale', s * 0.028, -0.005, 0.395);
      rim.rotation.x = -0.6;
      H.add(rim);
    }
    // Barbe de piquants sous le menton
    for (let i = 0; i < 5; i++) {
      const x = (i - 2) * 0.025;
      const sp = mesh(new THREE.ConeGeometry(0.01, 0.06 - Math.abs(i - 2) * 0.012, 6), 'horn', x, -0.13, -0.03 - Math.abs(i - 2) * 0.01);
      sp.rotation.set(Math.PI - 0.5, 0, x * 3);
      H.add(sp);
    }
    // Crête dorsale sur le crâne
    H.add(spikes([[0, 0.11, 0.08], [0, 0.12, -0.05], [0, 0.07, -0.18]], 0.06, 0.04, 3, 'horn', -0.9));
    return H;
  }

  // Colonne de révolution re-découpée régulièrement (la texture de pierre ne s'étire pas)
  function column(profile, step = 0.04) {
    const pts = [];
    for (let i = 0; i < profile.length - 1; i++) {
      const [r0, y0] = profile[i], [r1, y1] = profile[i + 1];
      const n = Math.max(1, Math.round(Math.hypot(r1 - r0, y1 - y0) / step));
      for (let k = 0; k < n; k++) pts.push([r0 + (r1 - r0) * k / n, y0 + (y1 - y0) * k / n]);
    }
    pts.push(profile[profile.length - 1]);
    return revolve(pts, { smooth: false, segments: 48 });
  }

  // ===========================================================================
  // Tour : vieille tour de pierre, un dragon enroulé autour qui en gravit les murs
  // ===========================================================================
  function makeDragonTower() {
    const piece = new THREE.Group();
    piece.add(rockBase(1.1));
    const T = new THREE.Group();
    T.position.y = BASE_Y;
    piece.add(T);

    // Fût légèrement évasé, cordon de pierre, parapet
    T.add(mesh(column([[0.5, 0], [0.47, 0.08], [0.44, 0.2], [0.41, 1.12], [0, 1.12]]), 'stone'));
    const cord = mesh(new THREE.TorusGeometry(0.43, 0.02, 8, 48), 'stone', 0, 0.55, 0);
    cord.rotation.x = Math.PI / 2;
    T.add(cord);
    T.add(mesh(column([[0.4, 1.05], [0.5, 1.12], [0.5, 1.3], [0.4, 1.3], [0.4, 1.22], [0, 1.22]], 0.03), 'stone'));
    // Merlons, dont deux brisés
    const N = 8, step = TAU / N;
    for (let k = 0; k < N; k++) {
      const mid = -Math.PI / 2 + (k + 0.5) * step, half = step * 0.28;
      const broken = k === 2 || k === 5;
      const sh = new THREE.Shape();
      sh.absarc(0, 0, 0.5, mid - half, mid + half, false);
      sh.absarc(0, 0, 0.4, mid + half, mid - half, true);
      const geo = new THREE.ExtrudeGeometry(sh, { depth: broken ? 0.08 : 0.17, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.008, bevelSegments: 1, curveSegments: 6 });
      geo.rotateX(-Math.PI / 2);
      const m = mesh(geo, 'stone', 0, 1.3, 0);
      if (broken) m.rotation.set(0.08, 0, 0.06);
      T.add(m);
    }
    // Mâchicoulis : consoles sous le parapet
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * TAU;
      const c = mesh(new THREE.BoxGeometry(0.05, 0.08, 0.09), 'stone', Math.sin(a) * 0.43, 1.06, Math.cos(a) * 0.43);
      c.rotation.y = a;
      T.add(c);
    }
    // Bannière à l'arrière du chemin de ronde
    T.add(mesh(new THREE.CylinderGeometry(0.012, 0.014, 0.62, 8), 'wood', -0.24, 1.53, -0.24));
    T.add(mesh(new THREE.SphereGeometry(0.025, 10, 8), 'gold', -0.24, 1.85, -0.24));
    const flagShape = new THREE.Shape();
    flagShape.moveTo(0, 0);
    for (let i = 0; i <= 8; i++) flagShape.lineTo(i * 0.035, Math.sin(i * 0.8) * 0.012);
    flagShape.lineTo(0.28, -0.13); flagShape.lineTo(0.22, -0.17); flagShape.lineTo(0.28, -0.22);
    for (let i = 8; i >= 0; i--) flagShape.lineTo(i * 0.035, -0.22 + Math.sin(i * 0.8 + 1) * 0.012);
    const flag = mesh(new THREE.ShapeGeometry(flagShape, 6), 'robe2', -0.23, 1.8, -0.24);
    flag.rotation.y = 0.8;
    T.add(flag);
    const flagEmblem = mesh(new THREE.CircleGeometry(0.035, 16), 'gold', 0.11, -0.11, 0.003);
    flag.add(flagEmblem);
    // Fenêtres éclairées de l'intérieur
    for (const [a, y] of [[0.9, 0.35], [-2.0, 0.7], [2.6, 0.95], [-0.6, 1.0]]) {
      const w = new THREE.Group();
      w.rotation.y = a;
      w.add(mesh(new THREE.BoxGeometry(0.06, 0.12, 0.04), 'glow', 0, y, 0.42));
      const top = mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.04, 12, 1, false, -Math.PI / 2, Math.PI), 'glow', 0, y + 0.06, 0.42);
      top.rotation.x = Math.PI / 2;
      w.add(top);
      const arch = mesh(new THREE.TorusGeometry(0.045, 0.012, 6, 12, Math.PI), 'stone', 0, y + 0.06, 0.43);
      w.add(arch);
      T.add(w);
    }
    // Porte et gravats au pied
    const door = new THREE.Group();
    door.position.set(0, 0, 0.47);
    door.rotation.y = 0;
    door.add(mesh(new THREE.BoxGeometry(0.16, 0.2, 0.03), 'dark', 0, 0.1, 0));
    const doorTop = mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.03, 16, 1, false, -Math.PI / 2, Math.PI), 'dark', 0, 0.2, 0);
    doorTop.rotation.x = Math.PI / 2;
    door.add(doorTop);
    door.add(mesh(new THREE.TorusGeometry(0.095, 0.02, 6, 16, Math.PI), 'stone', 0, 0.2, 0.01));
    T.add(door);
    let seed = 3;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 9; i++) {
      const a = rnd() * TAU, r = 0.52 + rnd() * 0.15;
      const rock = mesh(new THREE.DodecahedronGeometry(0.035 + rnd() * 0.035, 0), 'stone', Math.sin(a) * r, 0.02, Math.cos(a) * r);
      rock.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3);
      T.add(rock);
    }

    // --- Dragon enroulé en spirale autour de la tour ---
    const TURNS = 1.3, R = 0.5;
    const helix = [];
    for (let i = 0; i <= 26; i++) {
      const t = i / 26, a = -TURNS * TAU * (1 - t); // finit face à l'avant (a = 0)
      helix.push([Math.sin(a) * R, 0.1 + t * 1.12, Math.cos(a) * R]);
    }
    T.add(taper(helix, 0.035, 0.12, 'scale', { tubular: 120, radial: 16 }));
    // Plaques du ventre, collées contre la pierre
    const bellyPts = helix.map(([x, y, z]) => [x * 0.88, y - 0.02, z * 0.88]);
    T.add(taper(bellyPts.slice(4), 0.04, 0.075, 'belly', { tubular: 90, radial: 8 }));
    // Piquants dorsaux tournés vers l'extérieur
    const hc = new THREE.CatmullRomCurve3(helix.map(V3));
    for (let i = 2; i < 30; i++) {
      const t = i / 31, p = hc.getPointAt(t), out = new THREE.Vector3(p.x, 0, p.z).normalize();
      const h = 0.04 + t * 0.07;
      const sp = mesh(new THREE.ConeGeometry(h * 0.35, h, 6), 'horn', p.x + out.x * (0.05 + t * 0.08), p.y + 0.03, p.z + out.z * (0.05 + t * 0.08));
      sp.quaternion.setFromUnitVectors(UP, out.clone().add(new THREE.Vector3(0, 0.6, 0)).normalize());
      T.add(sp);
    }
    // Pointe de queue en fer de lance, au pied de la tour
    const spade = mesh(new THREE.ConeGeometry(0.045, 0.11, 4), 'horn', ...helix[0]);
    spade.position.y -= 0.02;
    spade.rotation.set(Math.PI / 2, 0, 0.8);
    spade.scale.set(1.2, 1, 0.35);
    T.add(spade);

    // Cou qui se dresse au-dessus du parapet, tête penchée vers l'avant
    const top = helix[helix.length - 1];
    T.add(taper([top, [0, 1.38, 0.54], [0, 1.52, 0.48], [0, 1.6, 0.45]], 0.12, 0.08, 'scale', { tubular: 24 }));
    T.add(spikes([[0, 1.36, 0.43], [0, 1.52, 0.38], [0, 1.64, 0.36]], 0.07, 0.05, 3, 'horn', -0.6));
    const head = dragonHead({ open: 0.6 });
    head.position.set(0, 1.64, 0.5);
    head.rotation.x = 0.45;
    head.scale.setScalar(0.95);
    T.add(head);
    // Pattes avant agrippées au parapet, griffes par-dessus le bord
    for (const s of [-1, 1]) {
      T.add(limb([s * 0.08, 1.25, 0.52], [s * 0.2, 1.3, 0.5], 0.04, 'scale'));
      T.add(limb([s * 0.2, 1.3, 0.5], [s * 0.22, 1.36, 0.43], 0.035, 'scale'));
      for (let k = -1; k <= 1; k++) T.add(claw([s * 0.22 + k * 0.025, 1.36, 0.45], [0, -0.2, 1], 0.06));
    }
    // Ailes à demi déployées au-dessus de la tour
    T.add(wingPair(0.6, 0.42, 3, [0.12, 1.42, 0.34], [0.5, -0.9, 0.35]));
    return piece;
  }


  // ===========================================================================
  // Cavalier : wyverne dressée sur un rocher, ailes déployées, rugissant
  // ===========================================================================
  function makeWyvern() {
    const piece = new THREE.Group();
    piece.add(rockBase(2.2));
    const K = new THREE.Group();
    K.position.y = BASE_Y;
    K.scale.setScalar(1.2);
    piece.add(K);

    // Rocher sur lequel elle est perchée
    let seed = 11;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (const [x, y, z, r] of [[0, 0.12, -0.05, 0.26], [0.18, 0.08, 0.15, 0.16], [-0.2, 0.07, 0.12, 0.14], [0.05, 0.06, 0.3, 0.12], [-0.08, 0.2, -0.2, 0.17]]) {
      const rock = mesh(new THREE.DodecahedronGeometry(r, 1), 'rock', x, y, z);
      rock.scale.set(1.1, 0.75, 1);
      rock.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3);
      K.add(rock);
    }

    // Corps dressé : poitrail, ventre en plaques, hanches
    const chest = mesh(new THREE.SphereGeometry(0.26, 24, 18), 'scale', 0, 0.62, 0.0);
    chest.scale.set(0.95, 1.25, 0.9);
    chest.rotation.x = -0.25;
    K.add(chest);
    const hips = mesh(new THREE.SphereGeometry(0.24, 22, 16), 'scale', 0, 0.38, -0.12);
    hips.scale.set(1.05, 0.85, 1);
    K.add(hips);
    for (let i = 0; i < 6; i++) { // plaques ventrales
      const y = 0.42 + i * 0.075, z = 0.17 + Math.sin(i * 0.5) * 0.04;
      const plate = mesh(new THREE.CapsuleGeometry(0.028, 0.16 - Math.abs(i - 2.5) * 0.02, 4, 10), 'belly', 0, y, z);
      plate.rotation.set(-0.3, 0, Math.PI / 2);
      plate.scale.set(1, 1, 0.5);
      K.add(plate);
    }

    // Pattes arrière accroupies, agrippées au rocher
    for (const s of [-1, 1]) {
      const thigh = mesh(new THREE.SphereGeometry(0.13, 18, 14), 'scale', s * 0.2, 0.36, -0.08);
      thigh.scale.set(0.8, 1, 1.25);
      K.add(thigh);
      K.add(limb([s * 0.24, 0.3, 0.02], [s * 0.27, 0.16, -0.12], 0.05, 'scale'));
      K.add(limb([s * 0.27, 0.16, -0.12], [s * 0.26, 0.2, 0.06], 0.04, 'scale'));
      for (let k = -1; k <= 1; k++) K.add(claw([s * 0.26 + k * 0.03, 0.2, 0.08], [k * 0.3, -0.5, 1], 0.08));
      K.add(claw([s * 0.27, 0.17, -0.15], [0, -0.6, -1], 0.06)); // ergot
    }
    // Patte avant droite posée sur le rocher, gauche levée, griffes en avant
    K.add(limb([-0.17, 0.66, 0.1], [-0.22, 0.46, 0.22], 0.045, 'scale'));
    K.add(limb([-0.22, 0.46, 0.22], [-0.18, 0.3, 0.34], 0.038, 'scale'));
    for (let k = -1; k <= 1; k++) K.add(claw([-0.18 + k * 0.025, 0.29, 0.37], [k * 0.3, -0.6, 1], 0.07));
    K.add(limb([0.17, 0.7, 0.1], [0.27, 0.66, 0.3], 0.045, 'scale'));
    K.add(limb([0.27, 0.66, 0.3], [0.24, 0.8, 0.42], 0.038, 'scale'));
    for (let k = -1; k <= 1; k++) K.add(claw([0.24 + k * 0.025, 0.82, 0.45], [k * 0.3, 0.4, 1], 0.08));

    // Long cou en S et crête
    const neck = [[0, 0.82, 0.04], [0, 1.02, 0.02], [0, 1.22, 0.08], [0, 1.36, 0.2], [0, 1.44, 0.32]];
    K.add(taper(neck, 0.15, 0.085, 'scale', { tubular: 40, radial: 16 }));
    K.add(bellyPlates(neck, 9, 0.19, 0.11, 0.1));
    K.add(spikes(neck.map(([x, y, z]) => [x, y + 0.03, z - 0.1]), 0.09, 0.05, 6, 'horn', -0.8));

    // Tête qui rugit
    const head = dragonHead({ open: 0.95 });
    head.position.set(0, 1.5, 0.38);
    head.rotation.x = 0.15;
    head.scale.setScalar(1.1);
    K.add(head);

    // Grandes ailes déployées vers l'arrière
    K.add(wingPair(0.85, 0.6, 4, [0.15, 0.82, -0.12], [0.15, -0.35, 0.6]));
    // Crête dorsale
    K.add(spikes([[0, 0.86, -0.18], [0, 0.6, -0.27], [0, 0.4, -0.33]], 0.08, 0.06, 4, 'horn', -1.3));

    // Queue qui s'enroule autour du rocher, terminée en fer de lance
    const tail = [[0, 0.32, -0.3], [0.15, 0.2, -0.48], [0.4, 0.1, -0.35], [0.5, 0.06, -0.05], [0.42, 0.05, 0.22], [0.25, 0.05, 0.4]];
    K.add(taper(tail, 0.09, 0.02, 'scale', { tubular: 48 }));
    K.add(spikes(tail.map(([x, y, z]) => [x, y + 0.05, z]).slice(0, 5), 0.06, 0.03, 6, 'horn', 0));
    const spade = mesh(new THREE.ConeGeometry(0.055, 0.13, 4), 'horn', 0.2, 0.05, 0.47);
    spade.rotation.set(Math.PI / 2, 0, 0.6);
    spade.scale.set(1.2, 1, 0.35);
    spade.rotation.y = -0.6;
    K.add(spade);
    return piece;
  }


  // ===========================================================================
  // Fou : mage draconique en robe, capuchon pointu, bâton à orbe, flamme dans la main
  // ===========================================================================
  function makeDragonMage() {
    const piece = new THREE.Group();
    piece.add(rockBase(3.3));
    const f = new THREE.Group();
    f.position.y = BASE_Y;
    f.scale.setScalar(1.3);
    piece.add(f);
    const ZS = 0.85;
    const flat = m => { m.scale.z = ZS; return m; };

    // Queue écailleuse qui dépasse de la robe, derrière
    f.add(taper([[0, 0.12, -0.2], [0.12, 0.05, -0.38], [0.32, 0.03, -0.42], [0.45, 0.03, -0.28]], 0.06, 0.015, 'scale', { tubular: 30 }));
    const spade = mesh(new THREE.ConeGeometry(0.04, 0.1, 4), 'horn', 0.48, 0.03, -0.2);
    spade.rotation.set(Math.PI / 2, 0, 0);
    spade.scale.set(1.2, 1, 0.35);
    f.add(spade);

    // Robe longue et ourlet gravé de runes lumineuses
    const robe = [[0.35, 0], [0.34, 0.06], [0.29, 0.35], [0.24, 0.65], [0.22, 0.88], [0.24, 1.04], [0.26, 1.14], [0.2, 1.21], [0.1, 1.25], [0, 1.26]];
    f.add(flat(mesh(revolve(robe, { segments: 48 }), 'robe')));
    const hem = mesh(new THREE.TorusGeometry(0.345, 0.014, 6, 64), 'gold', 0, 0.03, 0);
    hem.rotation.x = Math.PI / 2;
    hem.scale.y = ZS;
    f.add(hem);
    for (let i = 0; i < 14; i++) { // runes
      const a = (i / 14) * TAU;
      const g = new THREE.Group();
      g.position.set(Math.sin(a) * 0.335, 0.1, Math.cos(a) * 0.335 * ZS);
      g.rotation.y = a;
      g.add(mesh(new THREE.BoxGeometry(0.012, 0.06, 0.01), 'glow', 0, 0, 0));
      const bar = mesh(new THREE.BoxGeometry(0.035, 0.01, 0.01), 'glow', 0.005, i % 2 ? 0.015 : -0.012, 0);
      bar.rotation.z = (i % 3 - 1) * 0.6;
      g.add(bar);
      f.add(g);
    }
    // Cape ouverte sur le devant, bordée d'or
    const cloak = [[0.3, 0.02], [0.32, 0.3], [0.28, 0.7], [0.27, 1.0], [0.27, 1.13], [0.22, 1.21]];
    f.add(flat(mesh(revolve(cloak, { phiStart: 0.55, phiLength: TAU - 1.1, segments: 48 }), 'robe2')));
    for (const a of [0.55, TAU - 0.55]) {
      const pts = cloak.map(([r, y]) => [Math.sin(a) * (r + 0.004), y, Math.cos(a) * (r + 0.004) * ZS]);
      f.add(taper(pts, 0.014, 0.014, 'gold', { tubular: 20, radial: 6 }));
    }
    // Ceinture, boucle et amulette
    const belt = mesh(new THREE.TorusGeometry(0.225, 0.018, 6, 40), 'gold', 0, 0.86, 0);
    belt.rotation.x = Math.PI / 2;
    belt.scale.y = ZS;
    f.add(belt);
    f.add(mesh(new THREE.OctahedronGeometry(0.03, 0), 'glow', 0, 0.86, 0.2));
    const chain = mesh(new THREE.TorusGeometry(0.11, 0.006, 4, 24, Math.PI), 'gold', 0, 1.18, 0.08);
    chain.rotation.set(Math.PI / 2 + 0.6, 0, Math.PI);
    f.add(chain);
    const amulet = mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.012, 20), 'gold', 0, 1.08, 0.215);
    amulet.rotation.x = Math.PI / 2;
    f.add(amulet);
    f.add(mesh(new THREE.SphereGeometry(0.022, 12, 8), 'glow', 0, 1.08, 0.225));

    // Bras droit (-x) : tient le bâton
    f.add(limb([-0.2, 1.12, 0], [-0.3, 0.92, 0.08], 0.055, 'robe2'));
    f.add(limb([-0.3, 0.92, 0.08], [-0.28, 0.9, 0.2], 0.05, 'robe2', 0.09)); // manche évasée
    f.add(mesh(new THREE.SphereGeometry(0.05, 12, 10), 'scale', -0.28, 0.9, 0.24));
    for (let k = -1; k <= 1; k++) f.add(claw([-0.25, 0.92 + k * 0.025, 0.27], [1, -0.2, 0], 0.045));
    const SX = -0.28, SZ = 0.25;
    f.add(taper([[SX, 0.02, SZ], [SX - 0.01, 0.7, SZ + 0.01], [SX + 0.01, 1.3, SZ - 0.01], [SX, 1.82, SZ]], 0.02, 0.016, 'wood', { tubular: 30, radial: 8 }));
    for (let i = 0; i < 3; i++) { // anneaux d'or sur le bâton
      const ring = mesh(new THREE.TorusGeometry(0.022, 0.006, 6, 14), 'gold', SX, 1.25 + i * 0.2, SZ);
      ring.rotation.x = Math.PI / 2;
      f.add(ring);
    }
    // Serre qui enserre l'orbe au sommet
    f.add(mesh(new THREE.SphereGeometry(0.075, 20, 14), 'glow', SX, 1.95, SZ));
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * TAU + 0.4;
      const dx = Math.sin(a), dz = Math.cos(a);
      f.add(taper([[SX + dx * 0.025, 1.84, SZ + dz * 0.025], [SX + dx * 0.09, 1.92, SZ + dz * 0.09], [SX + dx * 0.06, 2.02, SZ + dz * 0.06], [SX + dx * 0.02, 2.05, SZ + dz * 0.02]],
        0.018, 0.003, 'claw', { tubular: 12, radial: 6 }));
    }

    // Bras gauche (+x) : main levée, une flamme flotte au-dessus de la paume
    f.add(limb([0.2, 1.12, 0], [0.32, 1.0, 0.1], 0.055, 'robe2'));
    f.add(limb([0.32, 1.0, 0.1], [0.28, 1.12, 0.24], 0.05, 'robe2', 0.09));
    const palm = mesh(new THREE.SphereGeometry(0.05, 12, 10), 'scale', 0.27, 1.15, 0.27);
    palm.scale.set(1.1, 0.6, 1.1);
    f.add(palm);
    for (let k = 0; k < 4; k++) {
      const a = -0.6 + k * 0.45;
      f.add(claw([0.27 + Math.sin(a) * 0.045, 1.16, 0.27 + Math.cos(a) * 0.045], [Math.sin(a), 0.8, Math.cos(a)], 0.05));
    }
    f.add(mesh(new THREE.SphereGeometry(0.04, 14, 10), 'glow', 0.27, 1.26, 0.27));
    const flame = mesh(new THREE.ConeGeometry(0.035, 0.12, 12), 'glow', 0.27, 1.33, 0.27);
    flame.rotation.z = 0.15;
    f.add(flame);
    // Cercle de runes qui flotte autour de la flamme
    const circle = mesh(new THREE.TorusGeometry(0.085, 0.004, 6, 40), 'glow', 0.27, 1.27, 0.27);
    circle.rotation.x = Math.PI / 2;
    f.add(circle);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU;
      const rune = mesh(new THREE.BoxGeometry(0.012, 0.004, 0.022), 'glow', 0.27 + Math.sin(a) * 0.085, 1.27, 0.27 + Math.cos(a) * 0.085);
      rune.rotation.y = a;
      f.add(rune);
    }
    // Grimoire suspendu à la ceinture, côté gauche
    const book = new THREE.Group();
    book.position.set(0.2, 0.7, 0.12);
    book.rotation.set(0.1, 0.9, 0.15);
    book.add(mesh(new THREE.BoxGeometry(0.11, 0.14, 0.04), 'robe2'));
    book.add(mesh(new THREE.BoxGeometry(0.1, 0.13, 0.032), 'robe', 0.006, 0, 0)); // pages
    for (const [x, y] of [[-0.05, 0.065], [0.05, 0.065], [-0.05, -0.065], [0.05, -0.065]]) book.add(mesh(new THREE.BoxGeometry(0.018, 0.018, 0.044), 'gold', x, y, 0));
    book.add(mesh(new THREE.OctahedronGeometry(0.016, 0), 'glow', 0, 0, 0.024));
    f.add(book);
    f.add(limb([0.17, 0.86, 0.15], [0.2, 0.77, 0.13], 0.005, 'gold')); // chaînette

    // Tête de dragon, gueule fermée, cornes courtes qui percent le capuchon
    const head = dragonHead({ open: 0.08, fire: false, horns: 'short' });
    head.position.set(0, 1.4, 0.05);
    head.rotation.x = 0.1;
    head.scale.setScalar(0.72);
    f.add(head);
    f.add(mesh(new THREE.CylinderGeometry(0.075, 0.09, 0.14, 14), 'scale', 0, 1.27, 0)); // cou
    // Capuchon pointu ouvert sur le devant, bordé d'or
    const hood = [[0.22, 1.18], [0.24, 1.32], [0.22, 1.48], [0.16, 1.62], [0.07, 1.74], [0.0, 1.8]];
    f.add(mesh(revolve(hood, { phiStart: 0.95, phiLength: TAU - 1.9, segments: 40 }), 'robe2'));
    for (const a of [0.95, TAU - 0.95]) {
      f.add(taper(hood.slice(0, 5).map(([r, y]) => [Math.sin(a) * (r + 0.004), y, Math.cos(a) * (r + 0.004)]), 0.012, 0.01, 'gold', { tubular: 16, radial: 6 }));
    }
    const tipGem = mesh(new THREE.OctahedronGeometry(0.03, 0), 'glow', 0, 1.82, -0.01);
    tipGem.scale.set(0.8, 1.4, 0.8);
    f.add(tipGem);
    return piece;
  }


  // ===========================================================================
  // Dame : dragonne royale assise, diadème de cornes, collier d'or, ailes relevées
  // ===========================================================================
  function makeDragonQueen() {
    const piece = new THREE.Group();
    piece.add(rockBase(4.4));
    const Q = new THREE.Group();
    Q.position.y = BASE_Y;
    Q.scale.setScalar(1.3);
    piece.add(Q);

    // Estrade rocheuse
    const dais = mesh(new THREE.CylinderGeometry(0.36, 0.42, 0.1, 14), 'rock', 0, 0.05, -0.02);
    Q.add(dais);

    // Arrière-train assis, pattes arrière repliées
    const hips = mesh(new THREE.SphereGeometry(0.25, 24, 18), 'scale', 0, 0.32, -0.1);
    hips.scale.set(1.1, 0.9, 1);
    Q.add(hips);
    for (const s of [-1, 1]) {
      const thigh = mesh(new THREE.SphereGeometry(0.14, 18, 14), 'scale', s * 0.2, 0.26, -0.04);
      thigh.scale.set(0.75, 0.9, 1.3);
      Q.add(thigh);
      Q.add(limb([s * 0.22, 0.17, 0.06], [s * 0.2, 0.12, 0.2], 0.042, 'scale'));
      for (let k = -1; k <= 1; k++) Q.add(claw([s * 0.2 + k * 0.025, 0.11, 0.23], [k * 0.25, -0.3, 1], 0.055));
    }
    // Poitrail dressé et plaques ventrales
    const chest = mesh(new THREE.SphereGeometry(0.21, 24, 18), 'scale', 0, 0.62, 0.02);
    chest.scale.set(0.92, 1.35, 0.85);
    Q.add(chest);
    for (let i = 0; i < 7; i++) {
      const plate = mesh(new THREE.CapsuleGeometry(0.024, 0.13 - Math.abs(i - 3) * 0.015, 4, 10), 'belly', 0, 0.42 + i * 0.065, 0.16 + Math.sin(i / 6 * Math.PI) * 0.03);
      plate.rotation.set(-0.2, 0, Math.PI / 2);
      plate.scale.set(1, 1, 0.5);
      Q.add(plate);
    }
    // Pattes avant droites et jointes, griffes sur la pierre
    for (const s of [-1, 1]) {
      Q.add(limb([s * 0.12, 0.7, 0.1], [s * 0.11, 0.38, 0.2], 0.042, 'scale'));
      Q.add(limb([s * 0.11, 0.38, 0.2], [s * 0.09, 0.13, 0.26], 0.036, 'scale'));
      const bracelet = mesh(new THREE.TorusGeometry(0.042, 0.009, 6, 16), 'gold', s * 0.1, 0.3, 0.225);
      bracelet.rotation.x = Math.PI / 2 - 0.25;
      Q.add(bracelet);
      for (let k = -1; k <= 1; k++) Q.add(claw([s * 0.09 + k * 0.022, 0.12, 0.29], [k * 0.2, -0.3, 1], 0.05));
    }
    // Long cou gracieux, ventre clair, petite crête
    const neck = [[0, 0.82, 0.02], [0, 1.06, -0.05], [0, 1.3, -0.01], [0, 1.48, 0.08]];
    Q.add(taper(neck, 0.12, 0.072, 'scale', { tubular: 36, radial: 16 }));
    Q.add(bellyPlates(neck, 9, 0.15, 0.09, 0.09));
    Q.add(spikes(neck.map(([x, y, z]) => [x, y + 0.02, z - 0.09]), 0.05, 0.03, 6, 'horn', -0.6));
    // Collier d'or et pendentifs lumineux
    const collar = mesh(new THREE.TorusGeometry(0.125, 0.018, 8, 32), 'gold', 0, 0.9, 0.0);
    collar.rotation.x = Math.PI / 2 + 0.3;
    Q.add(collar);
    for (let i = -2; i <= 2; i++) {
      const a = i * 0.45;
      const gem = mesh(new THREE.OctahedronGeometry(i === 0 ? 0.035 : 0.022, 0), 'glow', Math.sin(a) * 0.12, 0.84 - (2 - Math.abs(i)) * 0.012, Math.cos(a) * 0.13);
      gem.scale.y = 1.5;
      Q.add(gem);
    }

    // Tête haute, gueule close
    const head = dragonHead({ open: 0.04, fire: false });
    head.position.set(0, 1.54, 0.14);
    head.rotation.x = -0.12;
    head.scale.setScalar(0.85);
    Q.add(head);
    // Diadème : fines cornes en éventail cerclées d'or, gemme centrale
    const T = new THREE.Group();
    T.position.set(0, 1.62, 0.12);
    Q.add(T);
    for (let i = -3; i <= 3; i++) {
      const a = i * 0.32, h = 0.2 - Math.abs(i) * 0.035;
      const x = Math.sin(a) * 0.1, z = -Math.cos(a) * 0.02 - Math.abs(i) * 0.015;
      T.add(taper([[x, 0, z], [x * 1.3, h * 0.6, z - 0.02], [x * 1.5, h, z - 0.05]], 0.016, 0.002, 'horn', { tubular: 10, radial: 6 }));
      const band = mesh(new THREE.TorusGeometry(0.018, 0.005, 6, 12), 'gold', x * 1.15, h * 0.3, z - 0.01);
      band.rotation.x = Math.PI / 2;
      T.add(band);
    }
    const diadem = mesh(new THREE.TorusGeometry(0.105, 0.012, 6, 32, Math.PI * 0.95), 'gold', 0, 0.0, 0.0);
    diadem.rotation.set(Math.PI / 2, 0, Math.PI * 0.025);
    T.add(diadem);
    const crownGem = mesh(new THREE.OctahedronGeometry(0.03, 0), 'glow', 0, 0.03, 0.1);
    crownGem.scale.y = 1.4;
    T.add(crownGem);
    // Chaînette d'or tendue entre les cornes, avec des gouttes de joyaux
    for (const s of [-1, 1]) {
      const chain = [[0, 0.1, 0.06], [s * 0.07, 0.085, 0.03], [s * 0.14, 0.1, -0.02]];
      T.add(taper(chain, 0.004, 0.004, 'gold', { radial: 4, tubular: 10, cap: false }));
      const drop = mesh(new THREE.OctahedronGeometry(0.012, 0), 'glow', s * 0.07, 0.07, 0.03);
      drop.scale.y = 1.6;
      T.add(drop);
    }

    // Ailes relevées derrière elle
    Q.add(wingPair(0.78, 0.55, 4, [0.12, 0.86, -0.12], [-0.2, -0.95, 1.05]));
    Q.add(spikes([[0, 0.82, -0.17], [0, 0.55, -0.27], [0, 0.35, -0.33]], 0.07, 0.05, 4, 'horn', -1.3));
    // Queue enroulée autour de l'estrade, jusqu'à l'avant
    const tail = [[0, 0.22, -0.34], [0.22, 0.1, -0.42], [0.42, 0.06, -0.2], [0.44, 0.05, 0.08], [0.32, 0.05, 0.3], [0.12, 0.05, 0.38]];
    Q.add(taper(tail, 0.08, 0.018, 'scale', { tubular: 48 }));
    Q.add(spikes(tail.map(([x, y, z]) => [x, y + 0.05, z]).slice(0, 5), 0.05, 0.025, 6, 'horn', 0));
    const spade = mesh(new THREE.ConeGeometry(0.045, 0.11, 4), 'horn', 0.06, 0.05, 0.4);
    spade.rotation.set(Math.PI / 2, 0, 0);
    spade.rotation.y = -1.4;
    spade.scale.set(1.2, 1, 0.35);
    Q.add(spade);
    return piece;
  }


  // ===========================================================================
  // Roi : grand dragon couronné trônant sur son trésor, ailes dressées
  // ===========================================================================
  function makeDragonKing() {
    const piece = new THREE.Group();
    piece.add(rockBase(5.5));
    const K = new THREE.Group();
    K.position.y = BASE_Y;
    K.scale.setScalar(1.38);
    piece.add(K);
    let seed = 21;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

    // --- Trésor : tas de pièces d'or, gemmes, calice, coffre ---
    const mound = [[0.5, 0], [0.47, 0.05], [0.38, 0.12], [0.22, 0.18], [0, 0.2]];
    K.add(mesh(revolve(mound, { segments: 40 }), 'gold'));
    const moundY = r => { // hauteur du tas à la distance r du centre
      for (let i = 0; i < mound.length - 1; i++) {
        const [r0, y0] = mound[i], [r1, y1] = mound[i + 1];
        if (r <= r0 && r >= r1) return y0 + (y1 - y0) * (r0 - r) / (r0 - r1);
      }
      return 0.2;
    };
    const coinGeo = new THREE.CylinderGeometry(0.035, 0.035, 0.008, 16);
    for (let i = 0; i < 70; i++) {
      const a = rnd() * TAU, r = 0.12 + rnd() * 0.4;
      const coin = mesh(coinGeo, 'gold', Math.sin(a) * r, moundY(Math.min(r, 0.5)) + 0.004, Math.cos(a) * r);
      coin.rotation.set((rnd() - 0.5) * 1.2, rnd() * 3, (rnd() - 0.5) * 1.2);
      K.add(coin);
    }
    for (let i = 0; i < 9; i++) {
      const a = rnd() * TAU, r = 0.18 + rnd() * 0.3;
      const gem = mesh(new THREE.OctahedronGeometry(0.025 + rnd() * 0.015, 0), 'glow', Math.sin(a) * r, moundY(r) + 0.015, Math.cos(a) * r);
      gem.rotation.set(rnd(), rnd(), rnd());
      K.add(gem);
    }
    const goblet = mesh(revolve([[0, 0], [0.04, 0], [0.015, 0.02], [0.012, 0.07], [0.045, 0.1], [0.05, 0.15], [0.04, 0.15], [0, 0.11]], { segments: 20 }), 'gold', 0.36, 0.05, 0.22);
    goblet.rotation.z = -0.25;
    K.add(goblet);
    const chest = new THREE.Group();
    chest.position.set(-0.34, 0.08, -0.22);
    chest.rotation.y = 0.7;
    chest.add(mesh(new THREE.BoxGeometry(0.2, 0.11, 0.13), 'wood', 0, 0.055, 0));
    const lid = mesh(new THREE.CylinderGeometry(0.065, 0.065, 0.2, 16, 1, false, 0, Math.PI), 'wood', 0, 0.11, 0);
    lid.rotation.z = Math.PI / 2;
    chest.add(lid);
    for (const x of [-0.07, 0.07]) {
      chest.add(mesh(new THREE.BoxGeometry(0.02, 0.115, 0.135), 'gold', x, 0.055, 0));
      const band = mesh(new THREE.TorusGeometry(0.066, 0.008, 6, 16, Math.PI), 'gold', x, 0.11, 0);
      band.rotation.y = Math.PI / 2;
      chest.add(band);
    }
    chest.add(mesh(new THREE.BoxGeometry(0.03, 0.035, 0.01), 'gold', 0, 0.09, 0.07));
    K.add(chest);

    // --- Grand dragon assis sur le trésor ---
    const hips = mesh(new THREE.SphereGeometry(0.28, 24, 18), 'scale', 0, 0.42, -0.1);
    hips.scale.set(1.1, 0.9, 1.05);
    K.add(hips);
    for (const s of [-1, 1]) {
      const thigh = mesh(new THREE.SphereGeometry(0.16, 18, 14), 'scale', s * 0.22, 0.36, -0.02);
      thigh.scale.set(0.75, 0.95, 1.3);
      K.add(thigh);
      K.add(limb([s * 0.25, 0.26, 0.1], [s * 0.24, 0.22, 0.26], 0.05, 'scale'));
      for (let k = -1; k <= 1; k++) K.add(claw([s * 0.24 + k * 0.03, 0.21, 0.29], [k * 0.25, -0.4, 1], 0.07));
    }
    const chestM = mesh(new THREE.SphereGeometry(0.25, 24, 18), 'scale', 0, 0.76, 0.04);
    chestM.scale.set(0.95, 1.3, 0.88);
    K.add(chestM);
    for (let i = 0; i < 7; i++) {
      const plate = mesh(new THREE.CapsuleGeometry(0.03, 0.16 - Math.abs(i - 3) * 0.018, 4, 10), 'belly', 0, 0.52 + i * 0.075, 0.2 + Math.sin(i / 6 * Math.PI) * 0.035);
      plate.rotation.set(-0.2, 0, Math.PI / 2);
      plate.scale.set(1, 1, 0.5);
      K.add(plate);
    }
    // Patte droite posée sur un grand orbe, patte gauche sur les pièces
    const ORB = [-0.2, 0.33, 0.33];
    K.add(mesh(new THREE.SphereGeometry(0.1, 24, 18), 'glow', ...ORB));
    const orbRing = mesh(new THREE.TorusGeometry(0.105, 0.012, 8, 32), 'gold', ...ORB);
    orbRing.rotation.x = Math.PI / 2;
    K.add(orbRing);
    // Plastron d'or ciselé sur le poitrail, gemme centrale
    const plastron = mesh(new THREE.SphereGeometry(0.262, 28, 18, Math.PI / 2 - 0.9, 1.8, 0.75, 1.0), 'gold', 0, 0.76, 0.04); // centré sur l'avant (+z)
    plastron.scale.set(0.97, 1.32, 0.9);
    K.add(plastron);
    K.add(mesh(new THREE.OctahedronGeometry(0.035, 0), 'glow', 0, 0.83, 0.275));
    for (const s of [-1, 1]) {
      const rivet = mesh(new THREE.SphereGeometry(0.012, 8, 6), 'gold', s * 0.12, 0.72, 0.23);
      K.add(rivet);
    }
    // Épée plantée dans le tas d'or
    const sword = new THREE.Group();
    sword.position.set(0.3, 0.12, 0.3);
    sword.rotation.set(-0.25, 0.4, -0.3);
    const blade = new THREE.Shape();
    blade.moveTo(-0.02, 0); blade.lineTo(0.02, 0); blade.lineTo(0.015, 0.36); blade.lineTo(-0.015, 0.36); blade.lineTo(-0.02, 0);
    sword.add(mesh(new THREE.ExtrudeGeometry(blade, { depth: 0.006, bevelEnabled: true, bevelThickness: 0.003, bevelSize: 0.003, bevelSegments: 1 }), 'steel', 0, -0.05, -0.003));
    sword.add(mesh(new THREE.BoxGeometry(0.13, 0.018, 0.022), 'gold', 0, 0.31, 0));
    sword.add(mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.08, 8), 'wood', 0, 0.36, 0));
    sword.add(mesh(new THREE.SphereGeometry(0.02, 10, 8), 'glow', 0, 0.41, 0));
    K.add(sword);
    K.add(limb([-0.15, 0.84, 0.12], [-0.22, 0.6, 0.26], 0.055, 'scale'));
    K.add(limb([-0.22, 0.6, 0.26], [-0.2, 0.45, 0.33], 0.045, 'scale'));
    for (let k = -1; k <= 1; k++) K.add(claw([-0.2 + k * 0.035, 0.44, 0.36], [k * 0.4, -0.9, 0.5], 0.08));
    K.add(limb([0.15, 0.84, 0.12], [0.17, 0.5, 0.24], 0.055, 'scale'));
    K.add(limb([0.17, 0.5, 0.24], [0.16, 0.24, 0.32], 0.045, 'scale'));
    for (let k = -1; k <= 1; k++) K.add(claw([0.16 + k * 0.03, 0.23, 0.35], [k * 0.25, -0.4, 1], 0.07));

    // Cou puissant, crête, tête couronnée
    const neck = [[0, 0.98, 0.04], [0, 1.2, -0.02], [0, 1.4, 0.04], [0, 1.54, 0.16]];
    K.add(taper(neck, 0.15, 0.095, 'scale', { tubular: 36, radial: 16 }));
    K.add(bellyPlates(neck, 9, 0.2, 0.12, 0.11));
    K.add(spikes(neck.map(([x, y, z]) => [x, y + 0.03, z - 0.11]), 0.08, 0.05, 6, 'horn', -0.6));
    const head = dragonHead({ open: 0.35, fire: true });
    head.position.set(0, 1.6, 0.2);
    head.rotation.x = 0.05;
    head.scale.setScalar(1.05);
    K.add(head);
    // Couronne d'or à pointes, sertie de pierres
    const C = new THREE.Group();
    C.position.set(0, 1.715, 0.16);
    C.rotation.x = -0.15;
    K.add(C);
    C.add(mesh(revolve([[0.12, 0], [0.125, 0.055], [0.112, 0.055], [0.108, 0], [0.12, 0]], { smooth: false, segments: 32 }), 'gold'));
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * TAU;
      const x = Math.sin(a) * 0.118, z = Math.cos(a) * 0.118;
      C.add(mesh(new THREE.ConeGeometry(0.022, 0.1, 8), 'gold', x, 0.1, z));
      C.add(mesh(new THREE.SphereGeometry(0.012, 8, 6), 'gold', x, 0.155, z));
      C.add(mesh(new THREE.OctahedronGeometry(0.014, 0), 'glow', Math.sin(a + 0.45) * 0.124, 0.028, Math.cos(a + 0.45) * 0.124));
    }

    // Ailes immenses, dressées très haut
    K.add(wingPair(1.0, 0.72, 4, [0.16, 1.0, -0.14], [-0.1, -0.5, 0.95]));
    K.add(spikes([[0, 0.98, -0.2], [0, 0.66, -0.31], [0, 0.42, -0.38]], 0.09, 0.06, 4, 'horn', -1.3));
    // Queue qui fait le tour du trésor
    const tail = [[0, 0.3, -0.38], [0.25, 0.22, -0.48], [0.48, 0.15, -0.25], [0.52, 0.1, 0.06], [0.42, 0.08, 0.32], [0.2, 0.06, 0.48]];
    K.add(taper(tail, 0.095, 0.02, 'scale', { tubular: 48 }));
    K.add(spikes(tail.map(([x, y, z]) => [x, y + 0.06, z]).slice(0, 5), 0.06, 0.03, 7, 'horn', 0));
    const spade = mesh(new THREE.ConeGeometry(0.05, 0.13, 4), 'horn', 0.13, 0.06, 0.52);
    spade.rotation.set(Math.PI / 2, 0, 0);
    spade.rotation.y = -1.2;
    spade.scale.set(1.2, 1, 0.35);
    K.add(spade);
    return piece;
  }

  registerTheme('dragons', {
    name: 'Dragons',
    materials,
    titles: { p: 'Dragonnet sortant de son œuf', r: 'Dragon enroulé autour de sa tour', n: 'Wyverne dressée sur son rocher', b: 'Mage draconique', q: 'Dragonne royale', k: 'Roi dragon sur son trésor' },
    builders: {
      p: makeHatchling,
      r: makeDragonTower,
      n: makeWyvern,
      b: makeDragonMage,
      q: makeDragonQueen,
      k: makeDragonKing,
    },
  });
})();
