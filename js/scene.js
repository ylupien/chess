// Scène 3D : rendu, caméra, lumières, plateau et sol.
// Script classique (chargé par index.html dans l'ordre). Dépend de : THREE, OrbitControls, RoomEnvironment.

// --- Scène, caméra, rendu ---------------------------------------------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1b1d22);
scene.fog = new THREE.Fog(0x1b1d22, 22, 45);

const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

const camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.1, 100);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.minDistance = 3;
controls.maxDistance = 25;
controls.maxPolarAngle = Math.PI / 2 - 0.05; // ne pas passer sous le sol
controls.autoRotateSpeed = 1.0;

const VIEWS = {
  white: [0, 9, 10.5],
  black: [0, 9, -10.5],
  top:   [0, 15, 0.01],
};
function setView(name) {
  camera.position.set(...VIEWS[name]);
  controls.target.set(0, 0.4, 0);
  controls.update();
}
setView('white');

// --- Lumières ---------------------------------------------------------
scene.add(new THREE.HemisphereLight(0xfff4e0, 0x202020, 0.5));

const sun = new THREE.DirectionalLight(0xffffff, 1.9);
sun.position.set(4, 9, 3);
sun.castShadow = true;
sun.shadow.mapSize.set(4096, 4096);
sun.shadow.camera.left = -8; sun.shadow.camera.right = 8;
sun.shadow.camera.top = 8;   sun.shadow.camera.bottom = -8;
sun.shadow.bias = -0.0005;
sun.shadow.radius = 4;
scene.add(sun);

const rim = new THREE.DirectionalLight(0xc9d8ff, 0.8);
rim.position.set(-5, 4, -4);
scene.add(rim);

// --- Échiquier (sol en damier) ----------------------------------------
// Colonnes a→h selon x, rangées 1→8 de z = +3.5 (côté blanc) à z = -3.5.
const SQUARE = 1;
const fileX = f => (f - 3.5) * SQUARE;   // f = 0 (a) … 7 (h)
const rankZ = r => (3.5 - r) * SQUARE;   // r = 0 (1) … 7 (8)

const board3d = new THREE.Group();
const lightSq = new THREE.MeshStandardMaterial({ color: 0xead9b8, roughness: 0.45 });
const darkSq  = new THREE.MeshStandardMaterial({ color: 0x6b4428, roughness: 0.45 });
const squareGeo = new THREE.BoxGeometry(SQUARE, 0.1, SQUARE);
const boardSquares = [];  // cases (userData.dark) — leur matériau dépend du plateau choisi
const frameMeshes = [];   // côtés du cadre
const labelMeshes = [];   // coordonnées a–h / 1–8

for (let f = 0; f < 8; f++) {
  for (let r = 0; r < 8; r++) {
    // a1 est une case foncée
    const sq = new THREE.Mesh(squareGeo, (f + r) % 2 === 0 ? darkSq : lightSq);
    sq.position.set(fileX(f), -0.05, rankZ(r));
    sq.receiveShadow = true;
    sq.userData.dark = (f + r) % 2 === 0;
    boardSquares.push(sq);
    board3d.add(sq);
  }
}

// Cadre en bois
const frameMat = new THREE.MeshStandardMaterial({ color: 0x3a2416, roughness: 0.55 });
const FRAME_W = 0.5;
const SIZE = 8 * SQUARE;
const frameLong = new THREE.BoxGeometry(SIZE + 2 * FRAME_W, 0.14, FRAME_W);
const frameShort = new THREE.BoxGeometry(FRAME_W, 0.14, SIZE);
const off = SIZE / 2 + FRAME_W / 2;
for (const [x, z, g] of [[0, off, frameLong], [0, -off, frameLong], [off, 0, frameShort], [-off, 0, frameShort]]) {
  const m = new THREE.Mesh(g, frameMat);
  m.position.set(x, -0.07, z);
  m.castShadow = m.receiveShadow = true;
  frameMeshes.push(m);
  board3d.add(m);
}
scene.add(board3d);

// Coordonnées a–h / 1–8 sur le cadre
function labelTexture(text, color = '#d9c39a') {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  ctx.fillStyle = color;
  ctx.font = '600 40px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 32, 34);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
const labelGeo = new THREE.PlaneGeometry(0.32, 0.32);
function addLabel(text, x, z, rotZ) {
  const m = new THREE.Mesh(labelGeo, new THREE.MeshBasicMaterial({ map: labelTexture(text), transparent: true }));
  m.rotation.set(-Math.PI / 2, 0, rotZ);
  m.position.set(x, 0.002, z);
  m.userData.text = text;
  labelMeshes.push(m);
  scene.add(m);
}
for (let i = 0; i < 8; i++) {
  addLabel('abcdefgh'[i], fileX(i),  off, 0);
  addLabel('abcdefgh'[i], fileX(i), -off, Math.PI);
  addLabel(String(i + 1), -off, rankZ(i), 0);
  addLabel(String(i + 1),  off, rankZ(i), Math.PI);
}

// Sol sombre sous le plateau
const GROUND_Y = -0.14;
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(120, 120),
  new THREE.MeshStandardMaterial({ color: 0x15161a, roughness: 1 })
);
ground.rotation.x = -Math.PI / 2;
ground.position.y = GROUND_Y;
ground.receiveShadow = true;
scene.add(ground);
