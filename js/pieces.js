// Modèles 3D des pièces et matériaux en bois généré.
// Script classique (chargé par index.html dans l'ordre). Dépend de : THREE, scene.js.

// --- Modélisation des pièces -----------------------------------------
// Les profils sont en unités « pièce », puis tout est réduit par PIECE_SCALE.
const PIECE_SCALE = 0.4;
const V = (x, y) => new THREE.Vector2(x, y);

// Pied commun à toutes les pièces (rayon R)
const foot = R => [
  [0, 0], [R, 0], [R, 0.12], [R * 0.94, 0.18], [R * 0.98, 0.26],
  [R * 0.9, 0.33], [R * 0.76, 0.38], [R * 0.7, 0.46],
];

function lathe(points) {
  const curve = new THREE.SplineCurve(points.map(([x, y]) => V(x, y)));
  const pts = curve.getPoints(240).map(p => V(Math.max(0, p.x), p.y));
  const g = new THREE.LatheGeometry(pts, 96);
  g.computeVertexNormals();
  return g;
}

function part(geo, y = 0, x = 0, z = 0, role) {
  const m = new THREE.Mesh(geo);
  m.position.set(x, y, z);
  if (role) m.userData.role = role; // rôle de matériau (voir les thèmes)
  m.castShadow = m.receiveShadow = true;
  return m;
}

function makePawn() {
  const g = new THREE.Group();
  g.add(part(lathe([
    ...foot(0.82),
    [0.5, 0.56], [0.42, 0.72], [0.36, 0.96], [0.31, 1.2],
    [0.5, 1.27], [0.53, 1.33], [0.38, 1.4], [0.24, 1.48], [0, 1.52],
  ])));
  g.add(part(new THREE.SphereGeometry(0.37, 48, 32), 1.76));
  return g;
}

function makeRook() {
  const g = new THREE.Group();
  g.add(part(lathe([
    ...foot(0.95),
    [0.62, 0.53], [0.56, 0.72], [0.52, 1.0], [0.5, 1.4], [0.52, 1.66],
    [0.68, 1.76], [0.7, 1.84], [0.64, 1.9], [0.66, 2.1], [0.66, 2.12],
    [0.45, 2.12], [0.42, 2.0], [0.2, 1.99], [0, 1.99],
  ])));
  // Créneaux : 6 secteurs d'anneau extrudés
  const n = 6, step = (Math.PI * 2) / n;
  for (let k = 0; k < n; k++) {
    const a0 = k * step, a1 = a0 + step * 0.62;
    const s = new THREE.Shape();
    s.absarc(0, 0, 0.66, a0, a1, false);
    s.absarc(0, 0, 0.45, a1, a0, true);
    const geo = new THREE.ExtrudeGeometry(s, { depth: 0.26, bevelEnabled: false, curveSegments: 16 });
    geo.rotateX(-Math.PI / 2);
    g.add(part(geo, 2.1));
  }
  return g;
}

function makeKnight() {
  const g = new THREE.Group();
  g.add(part(lathe([
    ...foot(0.95),
    [0.62, 0.53], [0.58, 0.62], [0.66, 0.7], [0.66, 0.8], [0.3, 0.82], [0, 0.82],
  ])));
  const HEAD_Y = 0.78; // la tête repose sur le collet
  const head = new THREE.Group();
  head.position.y = HEAD_Y;
  g.add(head);

  // Tête et encolure : silhouette de profil (regarde vers +x)
  const outline = [
    [-0.55, 0.0], [0.5, 0.0], [0.52, 0.18], [0.44, 0.42], [0.36, 0.62],
    [0.34, 0.8], [0.46, 0.92], [0.7, 0.98], [0.88, 1.02], [0.98, 1.1],
    [1.0, 1.22], [0.96, 1.34], [0.8, 1.46], [0.58, 1.62], [0.42, 1.76],
    [0.3, 1.9], [0.14, 1.97], [-0.06, 1.92], [-0.26, 1.76], [-0.44, 1.5],
    [-0.56, 1.2], [-0.64, 0.86], [-0.66, 0.5], [-0.62, 0.2],
  ];
  const s = new THREE.Shape();
  s.moveTo(...outline[0]);
  s.splineThru(outline.slice(1).map(([x, y]) => V(x, y)));
  s.closePath();

  const depth = 0.5;
  const geo = new THREE.ExtrudeGeometry(s, {
    depth, curveSegments: 64, steps: 1, bevelEnabled: true,
    bevelThickness: 0.14, bevelSize: 0.1, bevelSegments: 10,
  });
  geo.translate(0, 0, -depth / 2);

  // Sculpte le volume : museau et sommet du crâne plus fins, encolure plus large
  const ss = (a, b, t) => { const k = Math.min(1, Math.max(0, (t - a) / (b - a))); return k * k * (3 - 2 * k); };
  const width = (x, y) =>
    1 - 0.42 * ss(0.3, 1.0, x) * ss(0.85, 1.15, y)   // museau
      - 0.22 * ss(1.6, 2.0, y)                       // sommet de la tête
      + 0.12 * (1 - ss(0.0, 0.7, y));                // poitrail
  const posAttr = geo.attributes.position;
  for (let i = 0; i < posAttr.count; i++) {
    const x = posAttr.getX(i), y = posAttr.getY(i);
    posAttr.setZ(i, posAttr.getZ(i) * width(x, y));
  }
  geo.computeVertexNormals();
  head.add(part(geo));

  const halfW = (x, y) => (depth / 2 + 0.14) * width(x, y);

  // Oreilles
  const earGeo = new THREE.ConeGeometry(0.12, 0.44, 24);
  earGeo.scale(1, 1, 0.55);
  for (const side of [-1, 1]) {
    const ear = part(earGeo, 2.12, 0.14, side * 0.14);
    ear.rotation.set(side * 0.22, 0, -0.3);
    head.add(ear);
  }

  // Yeux et naseaux
  const eyeGeo = new THREE.SphereGeometry(0.08, 20, 14);
  const nostrilGeo = new THREE.SphereGeometry(0.05, 16, 12);
  for (const side of [-1, 1]) {
    head.add(part(eyeGeo, 1.6, 0.5, side * (halfW(0.5, 1.6) - 0.02)));
    head.add(part(nostrilGeo, 1.26, 0.93, side * (halfW(0.93, 1.26) - 0.03)));
  }

  // Crinière : mèches le long de la nuque
  const maneCurve = new THREE.CatmullRomCurve3([
    [0.12, 2.08], [-0.14, 1.98], [-0.42, 1.74], [-0.6, 1.4], [-0.7, 1.04], [-0.74, 0.7],
  ].map(([x, y]) => new THREE.Vector3(x, y, 0)));
  const tuftGeo = new THREE.SphereGeometry(0.11, 16, 12);
  const N = 11;
  for (let i = 0; i < N; i++) {
    const t = i / (N - 1);
    const p = maneCurve.getPointAt(t);
    const tan = maneCurve.getTangentAt(t);
    const tuft = part(tuftGeo, p.y, p.x, 0);
    tuft.scale.set(1.4, 0.7, 1.2);
    tuft.rotation.z = Math.atan2(tan.y, tan.x) + 0.5; // mèches inclinées vers l'arrière
    head.add(tuft);
  }
  return g;
}

function makeBishop() {
  const g = new THREE.Group();
  g.add(part(lathe([
    ...foot(0.92),
    [0.6, 0.53], [0.52, 0.66], [0.45, 0.9], [0.38, 1.3], [0.34, 1.72],
    [0.38, 1.86], [0.56, 1.93], [0.58, 2.0], [0.5, 2.06], [0.34, 2.12],
    [0.4, 2.26], [0.47, 2.46], [0.45, 2.66], [0.37, 2.84], [0.22, 2.97],
    [0.08, 3.03], [0, 3.04],
  ])));
  g.add(part(new THREE.SphereGeometry(0.11, 24, 16), 3.12));
  return g;
}

function makeQueen() {
  const g = new THREE.Group();
  g.add(part(lathe([
    ...foot(1.0),
    [0.62, 0.52], [0.54, 0.64], [0.47, 0.86], [0.41, 1.16], [0.36, 1.56],
    [0.34, 1.92], [0.39, 2.06], [0.58, 2.14], [0.62, 2.22], [0.56, 2.29],
    [0.42, 2.33], [0.45, 2.45], [0.56, 2.78], [0.67, 3.08], [0.62, 3.13],
    [0.46, 3.15], [0.3, 3.22], [0, 3.25],
  ])));
  // Couronne : perles autour du bord + perle sommitale
  const pearl = new THREE.SphereGeometry(0.09, 20, 14);
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * Math.PI * 2;
    g.add(part(pearl, 3.17, Math.cos(a) * 0.63, Math.sin(a) * 0.63));
  }
  g.add(part(new THREE.SphereGeometry(0.16, 28, 20), 3.38));
  return g;
}

function makeKing() {
  const g = new THREE.Group();
  g.add(part(lathe([
    ...foot(1.0),
    [0.6, 0.52], [0.52, 0.64], [0.46, 0.85], [0.41, 1.15], [0.37, 1.55],
    [0.35, 1.92], [0.4, 2.08], [0.58, 2.16], [0.62, 2.24], [0.56, 2.31],
    [0.42, 2.35], [0.44, 2.45], [0.53, 2.72], [0.62, 2.98], [0.63, 3.06],
    [0.52, 3.13], [0.32, 3.2], [0.16, 3.24], [0, 3.25],
  ])));
  g.add(part(new THREE.CylinderGeometry(0.1, 0.13, 0.14, 32), 3.3));
  g.add(part(new THREE.BoxGeometry(0.17, 0.62, 0.17), 3.66));
  g.add(part(new THREE.BoxGeometry(0.5, 0.16, 0.17), 3.74));
  return g;
}

// --- Matériaux : bois verni généré procéduralement ---------------------
// Renvoie une texture couleur (veinage) et une carte de relief assortie.
function woodTextures({ base, light, dark, seed }) {
  const W = 512, H = 1024;
  const mk = () => { const c = document.createElement('canvas'); c.width = W; c.height = H; return c.getContext('2d'); };
  const c = mk(), b = mk();
  let s = seed;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const rgba = (rgb, a) => `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${a})`;

  c.fillStyle = rgba(base, 1); c.fillRect(0, 0, W, H);
  b.fillStyle = '#808080'; b.fillRect(0, 0, W, H);

  // Larges bandes de teinte (copiées en x ± W pour un raccord sans couture)
  for (let i = 0; i < 16; i++) {
    const x = rnd() * W, w = 20 + rnd() * 80, tone = rnd() < 0.5 ? light : dark, a = 0.15 + rnd() * 0.3;
    for (const o of [-W, 0, W]) {
      const g = c.createLinearGradient(x + o - w, 0, x + o + w, 0);
      g.addColorStop(0, rgba(tone, 0)); g.addColorStop(0.5, rgba(tone, a)); g.addColorStop(1, rgba(tone, 0));
      c.fillStyle = g; c.fillRect(x + o - w, 0, 2 * w, H);
    }
  }
  // Fibres ondulées
  for (let i = 0; i < 180; i++) {
    const x0 = rnd() * W, amp = 2 + rnd() * 12, fr = 0.002 + rnd() * 0.008, ph = rnd() * 6.28;
    const lw = 0.6 + rnd() * 2, a = 0.08 + rnd() * 0.3;
    c.strokeStyle = rgba(dark, a); c.lineWidth = lw;
    b.strokeStyle = `rgba(0,0,0,${Math.min(1, a * 1.6)})`; b.lineWidth = lw;
    for (const o of [-W, 0, W]) {
      c.beginPath(); b.beginPath();
      for (let y = 0; y <= H; y += 8) {
        const x = x0 + o + amp * Math.sin(y * fr + ph) + amp * 0.35 * Math.sin(y * fr * 3.3 + ph * 2);
        if (y === 0) { c.moveTo(x, y); b.moveTo(x, y); } else { c.lineTo(x, y); b.lineTo(x, y); }
      }
      c.stroke(); b.stroke();
    }
  }
  // Pores
  for (let i = 0; i < 4000; i++) {
    const x = rnd() * W, y = rnd() * H, l = 2 + rnd() * 6;
    c.fillStyle = rgba(dark, 0.18); c.fillRect(x, y, 1, l);
    b.fillStyle = 'rgba(0,0,0,0.25)'; b.fillRect(x, y, 1, l);
  }

  const tex = (ctx, srgb) => {
    const t = new THREE.CanvasTexture(ctx.canvas);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = renderer.capabilities.getMaxAnisotropy();
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  return { map: tex(c, true), bump: tex(b, false) };
}

const boxwood = woodTextures({ base: [236, 214, 170], light: [246, 230, 196], dark: [176, 132, 82], seed: 1234 });
const ebony   = woodTextures({ base: [42, 29, 22],    light: [72, 50, 36],    dark: [14, 9, 7],     seed: 98765 });

const whiteMat = new THREE.MeshPhysicalMaterial({
  map: boxwood.map, bumpMap: boxwood.bump, bumpScale: 0.6,
  roughness: 0.45, clearcoat: 0.35, clearcoatRoughness: 0.3,
});
const blackMat = new THREE.MeshPhysicalMaterial({
  map: ebony.map, bumpMap: ebony.bump, bumpScale: 0.6,
  roughness: 0.42, clearcoat: 0.5, clearcoatRoughness: 0.25,
});

// --- Thèmes ---------------------------------------------------------------
// Un thème fournit un constructeur par type de pièce et des matériaux par
// « rôle » (body, cloth, metal, skin…). Les maillages sans rôle prennent « body ».
// Si un type manque dans un thème (ou si sa construction échoue),
// c'est le modèle classique qui est utilisé.
const THEMES = {
  classic: {
    name: 'Classique',
    builders: { p: makePawn, r: makeRook, n: makeKnight, b: makeBishop, q: makeQueen, k: makeKing },
    materials: white => ({ body: white ? whiteMat : blackMat }),
  },
};
let currentTheme = 'classic';
const templateCache = {}; // « thème:type » → modèle (les pièces en sont des clones)

function registerTheme(id, theme) { THEMES[id] = theme; }
function setPieceTheme(id) { if (THEMES[id]) currentTheme = id; return currentTheme; }

function getTemplate(type) {
  for (const id of [currentTheme, 'classic']) {
    const theme = THEMES[id];
    if (!theme.builders[type]) continue;
    const key = id + ':' + type;
    if (!(key in templateCache)) {
      try { templateCache[key] = theme.builders[type](); }
      catch (err) { console.error(`Thème ${id}, pièce ${type} :`, err); templateCache[key] = null; }
    }
    if (templateCache[key]) return { id, theme, tpl: templateCache[key] };
  }
}

// Structure d'une pièce :
//   root   → position sur le plateau (placement, animations, glisser)
//   wobble → effet « gelée » : inclinaison, écrasement, soulèvement
//   model  → le modèle 3D lui-même
function buildMesh(type, white) {
  const wobble = new THREE.Group();
  wobble.add(buildModel(type, white));
  const root = new THREE.Group();
  root.add(wobble);
  root.userData.wobble = wobble;
  return root;
}

function buildModel(type, white) {
  const { id, theme, tpl } = getTemplate(type);
  const m = tpl.clone();
  const mats = theme.materials(white);
  m.traverse(o => { if (o.isMesh) o.material = mats[o.userData.role] || mats.body; });
  m.scale.setScalar(PIECE_SCALE);
  if (id === 'classic') {
    // Cavaliers tournés vers l'adversaire ; les autres pièces pivotées au hasard
    // pour que le veinage du bois varie d'une pièce à l'autre.
    if (type === 'n') m.rotation.y = white ? Math.PI / 2 : -Math.PI / 2;
    else if (type === 'k') m.rotation.y = Math.random() < 0.5 ? 0 : Math.PI; // croix face au joueur
    else m.rotation.y = Math.random() * Math.PI * 2;
  } else {
    // Personnages modélisés face à +z : chacun regarde le camp adverse,
    // avec une petite variation pour un rendu moins rigide.
    m.rotation.y = (white ? Math.PI : 0) + (Math.random() - 0.5) * 0.25;
  }
  return m;
}

// Nombre de pièces réellement modélisées par un thème (pour le sélecteur)
const themeProgress = id => Object.keys(THEMES[id].builders).length;
