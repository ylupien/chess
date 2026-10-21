// Point d'entrée : état du jeu, animations, interactions et interface.
// Script classique (chargé par index.html dans l'ordre). Dépend de : tous les fichiers précédents.

// =====================================================================
// État du jeu
// =====================================================================
const piecesGroup = new THREE.Group();
scene.add(piecesGroup);

let pieces = [];                       // { type, white, sq (-1 = réserve), moved, capturedAt, mesh }
const board = new Array(64).fill(null);
let turn = 'w';
let epSquare = -1;
let lastMove = null;                   // { from, to }
let mode = 'rules';                    // 'rules' | 'free'
let history = [];
let captureCounter = 0;
let moveNumber = 1;                    // numéro du coup complet (avance après les Noirs)
let log = [];                          // { kind: 'move', white, san, num } | { kind: 'note', text, free }
let gameOver = false;
let busy = false;                      // dialogue de promotion ouvert

let selected = null;
let targets = [];                      // coups légaux de la pièce sélectionnée (mode partie)
let hoverSq = -1;

const whiteToMove = () => turn === 'w';
const position = () => board.map(p => p ? { t: p.type, w: p.white, moved: p.moved } : null);

function setMesh(p) {
  // État des ressorts : inclinaison (tx, tz) et sa vitesse (wx, wz),
  // échelle verticale s et sa vitesse sv, hauteur de soulèvement.
  p.fx ??= { tx: 0, tz: 0, wx: 0, wz: 0, s: 1, sv: 0, lift: 0, prev: null };
  const old = p.mesh;
  p.mesh = buildMesh(p.type, p.white);
  p.mesh.userData.piece = p;
  if (old) {
    p.mesh.position.copy(old.position);
    piecesGroup.remove(old);
    tweens.delete(old);
  }
  piecesGroup.add(p.mesh);
}

function newGame() {
  piecesGroup.clear();
  tweens.clear();
  pieces = [];
  board.fill(null);
  const BACK = ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'];
  const add = (type, white, sq) => {
    const p = { type, white, sq, moved: false, capturedAt: 0, mesh: null };
    setMesh(p);
    pieces.push(p);
    board[sq] = p;
  };
  for (let f = 0; f < 8; f++) {
    add(BACK[f], true, SQ(f, 0));
    add('p', true, SQ(f, 1));
    add('p', false, SQ(f, 6));
    add(BACK[f], false, SQ(f, 7));
  }
  turn = 'w'; epSquare = -1; lastMove = null; history = []; captureCounter = 0;
  moveNumber = 1; log = [];
  clearSelection();
  layout(false);
  refresh();
}

// --- Historique (annuler) --------------------------------------------
function snapshot() {
  return {
    pieces: pieces.map(p => ({ type: p.type, sq: p.sq, moved: p.moved, capturedAt: p.capturedAt })),
    turn, epSquare, lastMove, moveNumber, logLength: log.length,
  };
}
function restore(s) {
  board.fill(null);
  s.pieces.forEach((d, i) => {
    const p = pieces[i];
    if (p.type !== d.type) { p.type = d.type; setMesh(p); }
    p.sq = d.sq; p.moved = d.moved; p.capturedAt = d.capturedAt;
    if (p.sq >= 0) board[p.sq] = p;
  });
  ({ turn, epSquare, lastMove, moveNumber } = s);
  log.length = s.logLength;
  clearSelection();
  layout(true);
  refresh();
}

function sendToReserve(p) {
  if (p.sq >= 0 && board[p.sq] === p) board[p.sq] = null;
  p.sq = -1;
  p.capturedAt = ++captureCounter;
}

// --- Jouer un coup (mode partie) --------------------------------------
async function playMove(m) {
  const p = board[m.from];
  let promoType = null;
  if (m.promo) {
    promoType = await askPromotion(p.white);
  }
  history.push(snapshot());
  const san = sanFor(position(), m, epSquare, promoType); // calculée avant de modifier la position

  const victim = m.ep ? board[SQ(fileOf(m.to), rankOf(m.from))] : board[m.to];
  const name = moveName(p, m, victim, promoType);
  if (victim) sendToReserve(victim);

  board[m.from] = null;
  board[m.to] = p;
  p.sq = m.to;
  p.moved = true;

  if (m.castle) {
    const home = rankOf(m.from);
    const [rf, rt] = m.castle === 'k' ? [7, 5] : [0, 3];
    const rook = board[SQ(rf, home)];
    board[SQ(rf, home)] = null;
    board[SQ(rt, home)] = rook;
    rook.sq = SQ(rt, home);
    rook.moved = true;
  }
  if (promoType) { p.type = promoType; setMesh(p); }

  epSquare = m.double ? (m.from + m.to) / 2 : -1;
  turn = whiteToMove() ? 'b' : 'w';
  lastMove = { from: m.from, to: m.to };

  // Journal : échec (+), mat (#), fin de partie
  const after = position(), opp = !p.white;
  const check = inCheck(after, opp), canReply = hasAnyLegalMove(after, opp, epSquare);
  log.push({ kind: 'move', white: p.white, num: moveNumber, name, san: san + (check ? (canReply ? '+' : '#') : '') });
  if (!p.white) moveNumber++;
  if (!canReply) log.push({ kind: 'note', text: check ? `Échec et mat · ${p.white ? '1-0' : '0-1'}` : 'Pat · ½-½' });
  clearSelection();
  layout(true);
  refresh();
}

// --- Déplacer librement (mode libre) ----------------------------------
// dest = case vide, ou -1 pour mettre la pièce dans la réserve.
function freeMove(p, dest) {
  if (dest >= 0 && board[dest]) return;
  history.push(snapshot());
  const from = p.sq;
  const where = sq => sq >= 0 ? sqName(sq) : 'réserve';
  log.push({ kind: 'note', free: true, text: `${pieceGlyph(p)} ${pieceLabel(p)} ${where(from)} → ${where(dest)}` });
  if (dest < 0) {
    sendToReserve(p);
    lastMove = null;
  } else {
    if (from >= 0) board[from] = null;
    board[dest] = p;
    p.sq = dest;
    lastMove = from >= 0 ? { from, to: dest } : { from: dest, to: dest };
  }
  p.moved = true;
  epSquare = -1;
  clearSelection();
  layout(true);
  refresh();
}

// =====================================================================
// Placement des pièces 3D + animations
// =====================================================================
// Réserve : pièces blanches retirées à droite, noires à gauche (2 colonnes de 8).
function reservePosition(p) {
  const same = pieces.filter(q => q.sq < 0 && q.white === p.white).sort((a, b) => a.capturedAt - b.capturedAt);
  const i = same.indexOf(p);
  const side = p.white ? 1 : -1;
  const col = Math.floor(i / 8), row = i % 8;
  return new THREE.Vector3(side * (5.3 + col * 0.8), GROUND_Y, side * (3.5 - row));
}
function homePosition(p) {
  if (p.sq < 0) return reservePosition(p);
  return new THREE.Vector3(fileX(fileOf(p.sq)), 0, rankZ(rankOf(p.sq)));
}

const tweens = new Map(); // mesh → { from, to, t0, dur, lift }
function layout(animate) {
  for (const p of pieces) {
    if (drag && drag.active && drag.piece === p) continue;
    const to = homePosition(p);
    if (!animate) { p.mesh.position.copy(to); continue; }
    const from = p.mesh.position.clone();
    const dist = from.distanceTo(to);
    if (dist < 1e-4) continue;
    tweens.set(p.mesh, {
      piece: p, from, to, t0: performance.now(),
      dur: 260 + Math.min(380, dist * 70),
      lift: Math.min(0.6, dist * 0.15),
    });
  }
}
function updateTweens(now) {
  for (const [mesh, t] of tweens) {
    const k = Math.min(1, (now - t.t0) / t.dur);
    const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
    mesh.position.lerpVectors(t.from, t.to, e);
    mesh.position.y += Math.sin(k * Math.PI) * t.lift;
    if (k >= 1) {
      tweens.delete(mesh);
      t.piece.fx.sv -= 1.4; // petit écrasement à l'atterrissage
    }
  }
}

// --- Effet « gelée » ---------------------------------------------------
// La pièce penche selon sa vitesse (le haut traîne derrière le mouvement),
// puis un ressort peu amorti la ramène droite en oscillant un peu.
const TILT_K = 170, TILT_C = 8;     // raideur / amortissement de l'inclinaison
const SQUASH_K = 260, SQUASH_C = 11; // raideur / amortissement de l'écrasement
const LEAN = 0.085, MAX_TILT = 0.38;
const HELD_LIFT = 0.42;  // hauteur de la pièce tenue
const COM_Y = 0.35;      // hauteur approximative du centre de gravité
const clampTilt = a => Math.max(-MAX_TILT, Math.min(MAX_TILT, a));

const ZERO = new THREE.Vector3(), tmpV = new THREE.Vector3();
function updateJelly(dt) {
  const ease = 1 - Math.exp(-dt * 9);
  for (const p of pieces) {
    const fx = p.fx, pos = p.mesh.position, w = p.mesh.userData.wobble;
    if (!fx.prev) fx.prev = pos.clone();
    const vx = (pos.x - fx.prev.x) / dt, vz = (pos.z - fx.prev.z) / dt;
    fx.prev.copy(pos);

    // Pivot : le point de prise quand on tient la pièce, sinon sa base.
    // Il glisse en douceur de l'un à l'autre pour éviter tout saut.
    const held = drag && drag.active && drag.piece === p;
    fx.pivot ??= new THREE.Vector3();
    fx.pivot.lerp(held ? drag.grab : ZERO, ease);

    // Inclinaison cible : ce qui est sous le pivot traîne derrière le mouvement.
    // Posée (pivot à la base), le haut penche vers l'arrière ;
    // tenue par le haut, elle se balance comme un pendule.
    const lean = LEAN * Math.max(-1, Math.min(1, (COM_Y - fx.pivot.y) / 0.25));
    const gx = clampTilt(-vz * lean), gz = clampTilt(vx * lean);
    fx.wx += (TILT_K * (gx - fx.tx) - TILT_C * fx.wx) * dt; fx.tx += fx.wx * dt;
    fx.wz += (TILT_K * (gz - fx.tz) - TILT_C * fx.wz) * dt; fx.tz += fx.wz * dt;

    fx.sv += (SQUASH_K * (1 - fx.s) - SQUASH_C * fx.sv) * dt; fx.s += fx.sv * dt;

    // Soulèvement doux : un peu quand sélectionnée, plus quand on la tient
    const liftTarget = held ? HELD_LIFT : selected === p ? 0.14 : 0;
    fx.lift += (liftTarget - fx.lift) * ease;

    // Rotation et écrasement autour du pivot : position = pivot − R·S·pivot
    w.rotation.set(fx.tx, 0, fx.tz);
    const side = 1 / Math.sqrt(fx.s); // volume conservé
    w.scale.set(side, fx.s, side);
    tmpV.copy(fx.pivot).multiply(w.scale).applyEuler(w.rotation);
    w.position.copy(fx.pivot).sub(tmpV);
    w.position.y += fx.lift;
  }
}

// =====================================================================
// Surbrillances des cases
// =====================================================================
const overlayMat = (color, opacity) =>
  new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false });
const MAT = {
  last:   overlayMat(0xf2d06b, 0.38),
  select: overlayMat(0x7fd18b, 0.55),
  check:  overlayMat(0xe5484d, 0.7),
  hover:  overlayMat(0xffffff, 0.3),
  dot:    overlayMat(0x1e5a3c, 0.6),
};
const hlGeo   = new THREE.PlaneGeometry(SQUARE, SQUARE).rotateX(-Math.PI / 2);
const dotGeo  = new THREE.CircleGeometry(0.15, 32).rotateX(-Math.PI / 2);
const ringGeo = new THREE.RingGeometry(0.38, 0.47, 48).rotateX(-Math.PI / 2);
const overlays = [];
for (let s = 0; s < 64; s++) {
  const x = fileX(fileOf(s)), z = rankZ(rankOf(s));
  const hl = new THREE.Mesh(hlGeo, MAT.last);
  const dot = new THREE.Mesh(dotGeo, MAT.dot);
  const ring = new THREE.Mesh(ringGeo, MAT.dot);
  hl.position.set(x, 0.003, z);
  dot.position.set(x, 0.005, z);
  ring.position.set(x, 0.005, z);
  for (const m of [hl, dot, ring]) { m.visible = false; m.renderOrder = 1; scene.add(m); }
  overlays.push({ hl, dot, ring });
}

function refreshHighlights() {
  const marks = new Array(64).fill(null);
  if (lastMove) { marks[lastMove.from] = 'last'; marks[lastMove.to] = 'last'; }
  if (hoverSq >= 0) marks[hoverSq] = 'hover';
  if (selected && selected.sq >= 0) marks[selected.sq] = 'select';
  if (mode === 'rules') {
    for (const white of [true, false]) {
      if (inCheck(position(), white)) {
        const k = board.findIndex(p => p && p.type === 'k' && p.white === white);
        marks[k] = 'check';
      }
    }
  }
  const targetSet = new Set(targets.map(m => m.to));
  for (let s = 0; s < 64; s++) {
    const o = overlays[s];
    o.hl.visible = !!marks[s];
    if (marks[s]) o.hl.material = MAT[marks[s]];
    const isTarget = targetSet.has(s);
    const occupied = !!board[s] || targets.some(m => m.to === s && m.ep);
    o.dot.visible = isTarget && !occupied;
    o.ring.visible = isTarget && occupied;
  }
}

// =====================================================================
// Sélection et interaction souris / tactile
// =====================================================================
function canPick(p) {
  if (busy) return false;
  if (mode === 'free') return true;
  return !gameOver && p.sq >= 0 && p.white === whiteToMove();
}

function select(p) {
  if (selected !== p) p.fx.sv += 1.2; // léger étirement quand on la prend
  selected = p;
  targets = mode === 'rules' ? legalMovesFrom(position(), p.sq, epSquare) : [];
  refreshHighlights();
  updateViewButton();
}
function clearSelection() {
  selected = null;
  targets = [];
  hoverSq = -1;
  refreshHighlights();
  updateViewButton();
}

// Le bouton « Visualiser » n'est actif que lorsqu'une pièce est sélectionnée.
function updateViewButton() {
  const b = document.getElementById('btn-view');
  b.disabled = !selected;
  b.title = selected ? `Visualiser : ${pieceLabel(selected)}` : 'Sélectionnez une pièce pour la visualiser';
}
document.getElementById('btn-view').onclick = () => { if (selected) PieceViewer.open(selected); };

// Tente de jouer la pièce sélectionnée vers la case s. Renvoie true si un coup est joué.
function tryMoveTo(s, offBoard = false) {
  if (!selected) return false;
  if (mode === 'rules') {
    const m = targets.find(t => t.to === s);
    if (!m) return false;
    playMove(m);
    return true;
  }
  if (offBoard) {
    if (selected.sq < 0) return false;
    freeMove(selected, -1);
    return true;
  }
  if (s < 0 || board[s]) return false;
  freeMove(selected, s);
  return true;
}

const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

function aim(e) {
  const rect = renderer.domElement.getBoundingClientRect();
  ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
}
const lastHitPoint = new THREE.Vector3(); // point exact touché sur la pièce
function pickPiece(exclude) {
  for (const hit of raycaster.intersectObjects(piecesGroup.children, true)) {
    let o = hit.object;
    while (o && !o.userData.piece) o = o.parent;
    if (o && o.userData.piece !== exclude) { lastHitPoint.copy(hit.point); return o.userData.piece; }
  }
  return null;
}
function floorPoint() {
  const v = new THREE.Vector3();
  return raycaster.ray.intersectPlane(floorPlane, v) ? v : null;
}
function squareAt(v) {
  const f = Math.floor(v.x / SQUARE + 4), r = Math.floor(4 - v.z / SQUARE);
  return onBoard(f, r) ? SQ(f, r) : -1;
}
const isOffBoard = v => Math.abs(v.x) > 4 + FRAME_W || Math.abs(v.z) > 4 + FRAME_W;

let drag = null; // { piece, x, y, active }

// Écoute en phase de capture pour passer avant OrbitControls.
window.addEventListener('pointerdown', e => {
  if (e.target !== renderer.domElement || e.button !== 0 || busy) return;
  aim(e);
  const hitPiece = pickPiece();
  const pt = floorPoint();
  const floorSq = pt ? squareAt(pt) : -1;

  // 1) Une pièce est déjà sélectionnée : clic sur une case d'arrivée.
  //    On teste la case de la pièce touchée, puis la case au sol sous le curseur
  //    (utile quand une pièce au premier plan masque la case visée).
  if (selected && hitPiece !== selected) {
    const isTarget = s => s >= 0 && (mode === 'rules' ? targets.some(t => t.to === s) : !board[s]);
    const dest = [hitPiece ? hitPiece.sq : -1, floorSq].find(isTarget);
    if (dest !== undefined) {
      controls.enabled = false;
      tryMoveTo(dest);
      return;
    }
  }
  // 2) Prendre une pièce
  if (hitPiece && canPick(hitPiece)) {
    controls.enabled = false;
    select(hitPiece);
    // Point de prise, relatif à la base de la pièce : il sert de pivot au balancement.
    const root = hitPiece.mesh.position;
    const grab = lastHitPoint.clone().sub(root);
    grab.y -= hitPiece.fx.lift;
    // On déplace la pièce dans un plan horizontal à la hauteur du point de prise
    // (une fois soulevée), pour que ce point reste sous le curseur.
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -(root.y + grab.y + HELD_LIFT));
    drag = { piece: hitPiece, x: e.clientX, y: e.clientY, active: false, grab, plane, target: null };
    return;
  }
  // 3) Clic ailleurs : désélection, la caméra peut tourner
  clearSelection();
}, true);

window.addEventListener('pointermove', e => {
  if (!drag) {
    if (e.target === renderer.domElement && !busy && e.buttons === 0) {
      aim(e);
      const p = pickPiece();
      renderer.domElement.style.cursor = p && canPick(p) ? 'grab' : '';
    }
    return;
  }
  if (!drag.active) {
    if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 5) return;
    drag.active = true;
    tweens.delete(drag.piece.mesh);
    renderer.domElement.style.cursor = 'grabbing';
  }
  aim(e);
  const hit = new THREE.Vector3();
  if (!raycaster.ray.intersectPlane(drag.plane, hit)) return;
  // La pièce suit le curseur en douceur (voir la boucle d'animation) ;
  // la case visée est celle sous la base de la pièce.
  drag.target = new THREE.Vector3(hit.x - drag.grab.x, 0, hit.z - drag.grab.z);
  const s = squareAt(drag.target);
  const valid = mode === 'rules'
    ? targets.some(t => t.to === s)
    : s >= 0 && (!board[s] || board[s] === drag.piece);
  const newHover = valid ? s : -1;
  if (newHover !== hoverSq) { hoverSq = newHover; refreshHighlights(); }
});

function endPointer(e, cancelled) {
  controls.enabled = true;
  if (!drag) return;
  const d = drag;
  drag = null;
  hoverSq = -1;
  renderer.domElement.style.cursor = '';
  if (!d.active) { refreshHighlights(); return; } // simple clic : la pièce reste sélectionnée

  let moved = false;
  if (!cancelled && d.target) {
    moved = tryMoveTo(squareAt(d.target), isOffBoard(d.target));
  }
  if (!moved) { layout(true); refreshHighlights(); } // retour à la case de départ
}
window.addEventListener('pointerup', e => endPointer(e, false));
window.addEventListener('pointercancel', e => endPointer(e, true));
window.addEventListener('keydown', e => { if (e.key === 'Escape' && !PieceViewer.isOpen()) clearSelection(); });

// =====================================================================
// Promotion
// =====================================================================
const promoEl = document.getElementById('promo');
const promoChoices = document.getElementById('promo-choices');
function askPromotion(white) {
  busy = true;
  const glyphs = white ? { q: '♕', r: '♖', b: '♗', n: '♘' } : { q: '♛', r: '♜', b: '♝', n: '♞' };
  promoChoices.innerHTML = '';
  promoEl.classList.remove('hidden');
  return new Promise(resolve => {
    for (const [type, glyph] of Object.entries(glyphs)) {
      const b = document.createElement('button');
      b.textContent = glyph;
      b.onclick = () => { promoEl.classList.add('hidden'); busy = false; resolve(type); };
      promoChoices.appendChild(b);
    }
  });
}

// =====================================================================
// Interface
// =====================================================================
const statusEl = document.getElementById('status');
const statusText = document.getElementById('status-text');
const statusDot = statusEl.querySelector('.dot');
const hintEl = document.getElementById('hint');
const btnUndo = document.getElementById('btn-undo');
const btnTurn = document.getElementById('btn-turn');
const btnClear = document.getElementById('btn-clear');
const btnRules = document.getElementById('mode-rules');
const btnFree = document.getElementById('mode-free');

function refresh() {
  const side = whiteToMove() ? 'Blancs' : 'Noirs';
  statusDot.style.background = whiteToMove() ? '#f3ecdf' : '#1d1a18';
  let text, alert = false;
  gameOver = false;

  if (mode === 'free') {
    text = `Placement libre — trait aux ${side}`;
  } else {
    const pos = position();
    const check = inCheck(pos, whiteToMove());
    const canMove = hasAnyLegalMove(pos, whiteToMove(), epSquare);
    if (!canMove) {
      gameOver = true;
      alert = check;
      text = check
        ? `Échec et mat — les ${whiteToMove() ? 'Noirs' : 'Blancs'} gagnent`
        : 'Pat — partie nulle';
    } else if (check) {
      alert = true;
      text = `${side} en échec !`;
    } else {
      text = `Trait aux ${side}`;
    }
  }
  statusText.textContent = text;
  statusEl.classList.toggle('alert', alert);

  hintEl.textContent = mode === 'rules'
    ? 'Cliquez ou glissez une pièce : seuls les coups légaux sont acceptés (roque, prise en passant et promotion compris).'
    : 'Glissez n\'importe quelle pièce sur une case vide. Déposez-la hors du plateau pour la retirer, ou reprenez-la depuis la réserve.';

  btnUndo.disabled = history.length === 0;
  btnRules.classList.toggle('active', mode === 'rules');
  btnFree.classList.toggle('active', mode === 'free');
  renderLog();
  btnTurn.classList.toggle('hidden', mode !== 'free');
  btnClear.classList.toggle('hidden', mode !== 'free');
  refreshHighlights();
}

function setMode(m) {
  if (mode === m) return;
  mode = m;
  clearSelection();
  refresh();
}

btnRules.onclick = () => setMode('rules');
btnFree.onclick = () => setMode('free');
btnUndo.onclick = () => { if (history.length && !busy) restore(history.pop()); };
document.getElementById('btn-reset').onclick = () => { if (!busy) newGame(); };
btnTurn.onclick = () => {
  history.push(snapshot());
  turn = whiteToMove() ? 'b' : 'w';
  epSquare = -1;
  log.push({ kind: 'note', free: true, text: `Trait donné aux ${whiteToMove() ? 'Blancs' : 'Noirs'}` });
  refresh();
};
btnClear.onclick = () => {
  history.push(snapshot());
  log.push({ kind: 'note', free: true, text: 'Plateau vidé' });
  for (const p of pieces) if (p.sq >= 0) sendToReserve(p);
  lastMove = null; epSquare = -1;
  clearSelection(); layout(true); refresh();
};

const btnRotate = document.getElementById('btn-rotate');
btnRotate.onclick = () => {
  controls.autoRotate = !controls.autoRotate;
  btnRotate.classList.toggle('active', controls.autoRotate);
};
document.getElementById('btn-white').onclick = () => setView('white');
document.getElementById('btn-black').onclick = () => setView('black');
document.getElementById('btn-top').onclick = () => setView('top');

// =====================================================================
// Journal des déplacements
// =====================================================================
const logRows = document.getElementById('log-rows');
const logBody = document.getElementById('log-body');
const logEmpty = document.getElementById('log-empty');
const td = (text, cls) => { const c = document.createElement('td'); c.textContent = textGlyphs(text); if (cls) c.className = cls; return c; };

function renderLog() {
  logRows.innerHTML = '';
  log.forEach((en, i) => {
    const tr = document.createElement('tr');
    const last = i === log.length - 1;
    if (en.kind === 'note') {
      tr.className = 'note' + (en.free ? ' free' : '');
      const c = td(en.text, last ? 'last' : '');
      c.colSpan = 2;
      tr.appendChild(c);
    } else {
      // Numéro : « 3. » pour les Blancs ; « 3… » pour les Noirs sauf s'ils suivent directement le coup blanc
      const prev = log[i - 1];
      const follows = !en.white && prev && prev.kind === 'move' && prev.white && prev.num === en.num;
      tr.appendChild(td(en.white ? en.num + '.' : follows ? '' : en.num + '…', 'num'));
      const c = document.createElement('td');
      if (last) c.className = 'last';
      const head = document.createElement('div');
      head.className = 'san';
      const dot = document.createElement('span');
      dot.className = 'side ' + (en.white ? 'w' : 'b');
      head.append(dot, textGlyphs(en.san));
      const nm = document.createElement('div');
      nm.className = 'name';
      nm.textContent = en.name;
      c.append(head, nm);
      tr.appendChild(c);
    }
    logRows.appendChild(tr);
  });
  logEmpty.classList.toggle('hidden', log.length > 0);
  logBody.scrollTop = logBody.scrollHeight;
}

// Copie : « 1. e4  (Pion e2 → e4) », une ligne par coup
document.getElementById('btn-copy').onclick = async e => {
  const btn = e.currentTarget;
  const lines = log.map(en => en.kind === 'note' ? `[${en.text}]`
    : `${en.num}${en.white ? '.' : '…'} ${en.san}  (${en.name})`);
  try {
    await navigator.clipboard.writeText(lines.join('\n'));
    btn.textContent = 'Copié ✓';
  } catch { btn.textContent = 'Échec'; }
  setTimeout(() => { btn.textContent = 'Copier'; }, 1200);
};

// --- Panneaux déplaçables ----------------------------------------------
makeDraggable(document.getElementById('ui'), 'controls');
makeDraggable(document.getElementById('log'), 'log');

// --- Démarrage et boucle ----------------------------------------------
// --- Thème des pièces --------------------------------------------------------
const themeSelect = document.getElementById('theme-select');
function fillThemeSelect() {
  themeSelect.innerHTML = '';
  for (const [id, t] of Object.entries(THEMES)) {
    const o = document.createElement('option');
    o.value = id;
    const n = themeProgress(id);
    o.textContent = n < 6 ? `${t.name} (${n}/6 pièces)` : t.name;
    themeSelect.appendChild(o);
  }
  themeSelect.value = currentTheme;
}
function applyTheme(id) {
  setPieceTheme(id);
  themeSelect.value = currentTheme;
  for (const p of pieces) setMesh(p);
  layout(true); // reprend les déplacements en cours avec les nouveaux modèles
  try { localStorage.setItem('chess3d:theme', currentTheme); } catch { }
}
themeSelect.onchange = () => applyTheme(themeSelect.value);
try { setPieceTheme(localStorage.getItem('chess3d:theme')); } catch { }
fillThemeSelect();

// --- Plateau -------------------------------------------------------------------
const boardSelect = document.getElementById('board-select');
for (const [id, b] of Object.entries(BOARDS)) {
  const o = document.createElement('option');
  o.value = id;
  o.textContent = b.name;
  boardSelect.appendChild(o);
}
function applyBoard(id) {
  boardSelect.value = setBoardTheme(id);
  try { localStorage.setItem('chess3d:board', currentBoard); } catch { }
}
boardSelect.onchange = () => applyBoard(boardSelect.value);
let savedBoard = null;
try { savedBoard = localStorage.getItem('chess3d:board'); } catch { }
applyBoard(savedBoard || 'wood');

newGame();

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

let lastTime = performance.now();
renderer.setAnimationLoop(now => {
  const dt = Math.min(1 / 30, Math.max(1 / 240, (now - lastTime) / 1000));
  lastTime = now;
  updateTweens(now);
  if (drag && drag.active && drag.target) {
    drag.piece.mesh.position.lerp(drag.target, 1 - Math.exp(-dt * 16));
  }
  updateJelly(dt);
  controls.update();
  renderer.render(scene, camera);
});
