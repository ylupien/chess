// Visualiseur de pièce : fenêtre avec sa propre scène 3D pour admirer une pièce sous tous les angles.
// Script classique (chargé par index.html dans l'ordre). Dépend de : THREE, OrbitControls,
// RoomEnvironment, pieces.js (buildModel, THEMES, themeOf), notation.js (pieceLabel, sqName).
const PieceViewer = (() => {
  const MOVES = {
    p: "Avance d'une case (deux depuis sa case de départ) et prend en diagonale. Arrivé au bout du plateau, il est promu.",
    n: 'Se déplace en « L » : deux cases dans une direction puis une sur le côté. Seule pièce qui saute par-dessus les autres.',
    b: "Se déplace en diagonale, d'autant de cases que voulu, sans sauter de pièce. Il reste toujours sur la même couleur.",
    r: "Se déplace en ligne droite, à l'horizontale ou à la verticale, d'autant de cases que voulu. Participe au roque.",
    q: 'La pièce la plus puissante : combine la tour et le fou, dans toutes les directions et sur toute distance.',
    k: "Se déplace d'une case dans toutes les directions. S'il est en échec sans pouvoir s'en sortir, la partie est perdue.",
  };

  const el = document.getElementById('viewer');
  const holder = document.getElementById('viewer-canvas');
  const titleEl = document.getElementById('viewer-title');
  const subEl = document.getElementById('viewer-sub');
  const infoEl = document.getElementById('viewer-info');
  const btnRotate = document.getElementById('viewer-rotate');
  const btnColor = document.getElementById('viewer-color');

  let vr = null, vscene, vcam, vcontrols, current = null, model = null, shownWhite = true;

  // La scène est créée à la première ouverture seulement.
  function init() {
    vr = new THREE.WebGLRenderer({ antialias: true });
    vr.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    vr.shadowMap.enabled = true;
    vr.shadowMap.type = THREE.PCFSoftShadowMap;
    vr.toneMapping = THREE.ACESFilmicToneMapping;
    vr.outputColorSpace = THREE.SRGBColorSpace;
    holder.appendChild(vr.domElement);

    vscene = new THREE.Scene();
    vscene.background = new THREE.Color(0x202228);
    const pm = new THREE.PMREMGenerator(vr);
    vscene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;

    vcam = new THREE.PerspectiveCamera(35, 1, 0.05, 50);
    vcontrols = new OrbitControls(vcam, vr.domElement);
    vcontrols.enableDamping = true;
    vcontrols.autoRotate = true;
    vcontrols.autoRotateSpeed = 2;
    vcontrols.maxPolarAngle = Math.PI / 2 - 0.02;

    vscene.add(new THREE.HemisphereLight(0xfff4e0, 0x202020, 0.6));
    const key = new THREE.DirectionalLight(0xffffff, 2.4);
    key.position.set(2, 4, 3);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    Object.assign(key.shadow.camera, { left: -1.5, right: 1.5, top: 1.5, bottom: -1.5 });
    key.shadow.bias = -0.0005;
    vscene.add(key);
    const rim = new THREE.DirectionalLight(0xc9d8ff, 1.0);
    rim.position.set(-3, 2, -3);
    vscene.add(rim);

    // Plateau tournant
    const stand = new THREE.Mesh(
      new THREE.CylinderGeometry(0.75, 0.8, 0.06, 64),
      new THREE.MeshStandardMaterial({ color: 0x2c2e35, roughness: 0.6, metalness: 0.2 }),
    );
    stand.position.y = -0.03;
    stand.receiveShadow = true;
    vscene.add(stand);

    window.addEventListener('resize', () => { if (isOpen()) resize(); });
  }

  function resize() {
    const w = holder.clientWidth, h = holder.clientHeight;
    vr.setSize(w, h);
    vcam.aspect = w / h;
    vcam.updateProjectionMatrix();
  }

  function showModel() {
    if (model) vscene.remove(model);
    model = buildModel(current.type, shownWhite, current.side);
    model.rotation.y = 0; // de face
    vscene.add(model);
    // Cadrage automatique sur la pièce
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const dist = Math.max(size.y, size.x * 1.2) / (2 * Math.tan((vcam.fov * Math.PI) / 360)) * 1.35;
    vcontrols.target.copy(center);
    vcam.position.set(center.x + dist * 0.35, center.y + dist * 0.2, center.z + dist * 0.92);
    vcontrols.minDistance = dist * 0.35;
    vcontrols.maxDistance = dist * 2.5;
    vcontrols.update();

    const piece = { type: current.type, white: shownWhite };
    titleEl.textContent = pieceLabel(piece);
    // Titre du personnage, seulement si le thème a déjà ce modèle (sinon : pièce classique)
    const th = THEMES[themeOf(shownWhite)];
    let themeTitle = th.builders[current.type] && th.titles?.[current.type];
    if (Array.isArray(themeTitle)) themeTitle = themeTitle[current.side || 0];
    const where = current.white === shownWhite
      ? (current.sq >= 0 ? `Case ${sqName(current.sq)}` : 'En réserve')
      : 'Aperçu dans l\'autre couleur';
    subEl.textContent = [themeTitle, where].filter(Boolean).join(' · ');
    infoEl.textContent = MOVES[current.type];
    btnColor.textContent = shownWhite ? 'Voir en noir' : 'Voir en blanc';
  }

  function open(piece) {
    if (!vr) init();
    current = piece;
    shownWhite = piece.white;
    el.classList.remove('hidden');
    resize();
    showModel();
    vr.setAnimationLoop(() => { vcontrols.update(); vr.render(vscene, vcam); });
  }

  function close() {
    el.classList.add('hidden');
    if (vr) vr.setAnimationLoop(null);
  }

  const isOpen = () => !el.classList.contains('hidden');

  document.getElementById('viewer-close').onclick = close;
  el.addEventListener('pointerdown', e => { if (e.target === el) close(); }); // clic hors de la fenêtre
  window.addEventListener('keydown', e => {
    if (e.key === 'Escape' && isOpen()) { close(); e.stopImmediatePropagation(); } // la sélection reste active
  });
  btnRotate.onclick = () => {
    vcontrols.autoRotate = !vcontrols.autoRotate;
    btnRotate.classList.toggle('active', vcontrols.autoRotate);
  };
  btnColor.onclick = () => { shownWhite = !shownWhite; showModel(); };

  return { open, close, isOpen };
})();
