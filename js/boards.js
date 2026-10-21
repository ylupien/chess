// Plateaux : apparence des cases, du cadre, des coordonnées et du décor.
// Script classique (chargé par index.html dans l'ordre). Dépend de : THREE, Reflector, scene.js.
const BOARDS = (() => {
  const SIZE = 8 * SQUARE;
  const outer = SIZE + 2 * FRAME_W;

  // --- Bois clair (plateau d'origine) -------------------------------------
  const wood = {
    light: lightSq, dark: darkSq, frame: frameMat,
    label: '#d9c39a', ground: 0x15161a, background: 0x1b1d22,
  };

  // --- Verre noir : cases de verre fumé posées sur un miroir --------------
  // Les cases sont semi-transparentes : on voit à travers le reflet sombre des pièces.
  const glassDark = new THREE.MeshPhysicalMaterial({
    // Rugosité et intensité spéculaire modérées : reflets présents mais sans éblouir
    color: 0x040405, roughness: 0.16, metalness: 0.05, clearcoat: 0.7, clearcoatRoughness: 0.2,
    specularIntensity: 0.35, transparent: true, opacity: 0.74,
  });
  const glassLight = new THREE.MeshPhysicalMaterial({
    // Verre opalin presque blanc (contraste net avec les cases noires)
    color: 0xe4e5ea, roughness: 0.2, metalness: 0, clearcoat: 0.7, clearcoatRoughness: 0.22,
    specularIntensity: 0.35, transparent: true, opacity: 0.93,
  });
  const lacquer = new THREE.MeshPhysicalMaterial({
    color: 0x09090b, roughness: 0.25, metalness: 0.1, clearcoat: 0.7, clearcoatRoughness: 0.18, specularIntensity: 0.5,
  });
  const gilt = new THREE.MeshStandardMaterial({ color: 0xc9a25e, roughness: 0.28, metalness: 1 });

  const glassExtras = new THREE.Group();
  glassExtras.visible = false;
  scene.add(glassExtras);

  // Miroir juste sous la surface des cases
  const mirror = new Reflector(new THREE.PlaneGeometry(SIZE, SIZE), {
    textureWidth: 1024, textureHeight: 1024, color: 0x9a9aa2, clipBias: 0.003,
  });
  mirror.rotation.x = -Math.PI / 2;
  mirror.position.y = -0.003;
  glassExtras.add(mirror);

  // Filets dorés entre les cases
  const line = (w, d, x, z, y = 0.0015) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.003, d), gilt);
    m.position.set(x, y, z);
    glassExtras.add(m);
  };
  for (let i = 1; i < 8; i++) {
    const p = (i - 4) * SQUARE;
    line(0.012, SIZE, p, 0);
    line(SIZE, 0.012, 0, p);
  }
  // Double liseré doré autour du damier et sur le bord extérieur du cadre
  for (const [half, w, y] of [[SIZE / 2 + 0.012, 0.024, 0.0015], [outer / 2 - 0.05, 0.02, 0.0015]]) {
    line(2 * half + w, w, 0, half, y); line(2 * half + w, w, 0, -half, y);
    line(w, 2 * half, half, 0, y); line(w, 2 * half, -half, 0, y);
  }
  const plinth = new THREE.Mesh(new THREE.BoxGeometry(outer + 0.06, 0.03, outer + 0.06), gilt);
  plinth.position.y = -0.125;
  glassExtras.add(plinth);

  const glass = {
    light: glassLight, dark: glassDark, frame: lacquer, extras: glassExtras,
    label: '#c9a25e', ground: 0x09090b, background: 0x0e0e11,
  };

  return {
    wood: { name: 'Bois clair', ...wood },
    glass: { name: 'Verre noir', ...glass },
  };
})();

let currentBoard = 'wood';
function setBoardTheme(id) {
  const b = BOARDS[id];
  if (!b) return currentBoard;
  currentBoard = id;
  for (const sq of boardSquares) sq.material = sq.userData.dark ? b.dark : b.light;
  for (const m of frameMeshes) m.material = b.frame;
  for (const m of labelMeshes) {
    m.material.map.dispose();
    m.material.map = labelTexture(m.userData.text, b.label);
    m.material.needsUpdate = true;
  }
  for (const other of Object.values(BOARDS)) if (other.extras) other.extras.visible = other === b;
  ground.material.color.setHex(b.ground);
  scene.background.setHex(b.background);
  scene.fog.color.setHex(b.background);
  return currentBoard;
}
