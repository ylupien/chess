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
let busy = false;
let resetting = false;      // remise en place animée des pièces en cours
let resetGen = 0;          // numéro de remise en place (une nouvelle partie interrompt la précédente)
let forcedResult = null;    // fin de partie simulée (panneau Debug) : { winner: 'w'|'b'|null, reason }
let gameStartTime = 0;      // horodatage du premier coup (durée affichée en fin de partie)                      // dialogue de promotion ouvert

let selected = null;
let targets = [];                      // coups légaux de la pièce sélectionnée (mode partie)
let hoverSq = -1;
let classicHeld = false; // bouton « Classique » maintenu
// Adversaire ordinateur : niveau 0 = deux joueurs sur le même écran ; aiSide = camp joué par l'ordinateur
// aiFast : adversaire « éclair », qui joue aussitôt (sinon, il prend le temps d'un humain)
let aiLevel = 0, aiSide = 'b', aiFast = false;
try {
  aiLevel = Math.max(0, Math.min(5, parseInt(localStorage.getItem('chess3d:ai-level'), 10) || 0));
  aiFast = localStorage.getItem('chess3d:ai-fast') === '1';
  aiSide = localStorage.getItem('chess3d:ai-side') === 'w' ? 'w' : 'b';
} catch { }
let aiKey = null; // position pour laquelle l'ordinateur réfléchit (null : il ne réfléchit pas)
const aiActive = () => aiLevel > 0 && mode === 'rules' && !Online.active && !Online.watching;

const whiteToMove = () => turn === 'w';
const position = () => board.map(p => p ? { t: p.type, w: p.white, moved: p.moved } : null);

function setMesh(p) {
  // État des ressorts : inclinaison (tx, tz) et sa vitesse (wx, wz),
  // échelle verticale s et sa vitesse sv, hauteur de soulèvement.
  p.fx ??= { tx: 0, tz: 0, wx: 0, wz: 0, s: 1, sv: 0, lift: 0, prev: null };
  const old = p.mesh;
  p.mesh = buildMesh(p.type, p.white, p.side);
  p.mesh.userData.piece = p;
  if (classicHeld) setClassicView(p.mesh, true);
  if (old) {
    p.mesh.position.copy(old.position);
    piecesGroup.remove(old);
    tweens.delete(old);
  }
  piecesGroup.add(p.mesh);
}

function newGame() {
  resetGen++; resetting = false; // annule une remise en place animée en cours
  Clock.reset();
  piecesGroup.clear();
  tweens.clear();
  pieces = [];
  board.fill(null);
  const BACK = ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'];
  const add = (type, white, sq) => {
    const p = { type, white, sq, side: (sq & 7) >= 4 ? 1 : 0, moved: false, capturedAt: 0, mesh: null };
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

// Cases de départ, dans le même ordre que la création des pièces par newGame()
function startSlots() {
  const BACK = ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'], slots = [];
  for (let f = 0; f < 8; f++) {
    slots.push([BACK[f], true, SQ(f, 0)], ['p', true, SQ(f, 1)], ['p', false, SQ(f, 6)], [BACK[f], false, SQ(f, 7)]);
  }
  return slots;
}

// Nouvelle partie « comme en vrai » : chaque pièce est ramenée à sa case en volant,
// deux à la fois au maximum, les plus éloignées d'abord ; la caméra revient à la vue de départ.
// fromOnline : remise en place décidée par la partie en ligne (les deux joueurs ont accepté)
function resetGame({ fromOnline = false } = {}) {
  if (resetting || busy) return;
  // En ligne : on ne se déconnecte pas, on propose la nouvelle partie au second joueur
  if (Online.active && !fromOnline) { Online.requestNewGame(); return; }
  if (Online.watching && !fromOnline) return; // spectateur : la partie appartient aux joueurs
  if (pieces.length !== 32) { newGame(); return; }
  resetting = true;
  forcedResult = null;
  EndGame.hide();
  Clock.reset();
  clearSelection();
  // Où se trouve physiquement chaque pièce avant la remise en place (-1 = réserve)
  const physSq = new Map(pieces.map(p => [p, p.sq]));
  board.fill(null);
  startSlots().forEach(([type, white, sq], i) => {
    const p = pieces[i];
    if (p.type !== type) { p.type = type; setMesh(p); } // une pièce promue redevient pion
    p.sq = sq; p.moved = false; p.capturedAt = 0;
    board[sq] = p;
  });
  turn = 'w'; epSquare = -1; lastMove = null; history = []; captureCounter = 0;
  moveNumber = 1; log = []; gameStartTime = 0;
  const blackView = Online.active ? !Online.isWhite : aiActive() && aiSide === 'w';
  setView(blackView ? 'black_fly' : 'white_fly'); // chacun revient à son côté

  // Occupation réelle des cases pendant la remise en place : une pièce ne se pose sur sa case
  // que si elle est libre ; sinon, la pièce qui l'occupe doit d'abord partir vers la sienne.
  // Une case se libère dès que sa pièce est soulevée, et elle est réservée dès qu'une pièce
  // part pour s'y poser.
  const occ = new Array(64).fill(null);
  for (const p of pieces) { const s = physSq.get(p); if (s >= 0) occ[s] = p; }
  const pending = new Set(pieces.filter(p => physSq.get(p) !== p.sq || p.mesh.position.distanceTo(homePosition(p)) > 0.01));
  const inFlight = new Set();
  const homeFree = p => occ[p.sq] === null || occ[p.sq] === p;
  const distHome = p => p.mesh.position.distanceTo(homePosition(p));

  const fly = (p, to, done) => {
    const from = p.mesh.position.clone(), dist = from.distanceTo(to);
    const src = physSq.get(p);
    if (src >= 0 && occ[src] === p) occ[src] = null; // soulevée : sa case se libère
    inFlight.add(p);
    varyJelly(p);
    p.landingSounds = ['move'];
    tweens.set(p.mesh, {
      piece: p, from, to: to.clone(), t0: performance.now(),
      dur: 650 + Math.min(900, dist * 110),
      lift: Math.min(1.1, 0.45 + dist * 0.07),
      onDone: () => { inFlight.delete(p); done(); },
    });
  };
  const flyHome = (p, next) => {
    fly(p, homePosition(p), () => { pending.delete(p); next(); }); // libère d'abord sa case de départ…
    occ[p.sq] = p;                                                  // …puis réserve sa case d'arrivée
    physSq.set(p, p.sq);
  };
  // Seul cas particulier : deux pièces sur la case l'une de l'autre (échange circulaire).
  // Une main soulève l'une d'elles et la tient au-dessus de sa case, le temps de poser l'autre.
  const liftInHand = (p, next) => {
    fly(p, p.mesh.position.clone().add(new THREE.Vector3(0, 1.0, 0)), next);
    physSq.set(p, -2); // tenue en l'air : elle n'occupe plus aucune case
  };
  // Une pièce qui occupe la case d'origine d'une pièce en attente doit partir en priorité
  const isBlocking = p => { const s = physSq.get(p); return s >= 0 && [...pending].some(q => q !== p && q.sq === s); };

  // Deux joueurs à deux mains : chaque main ne replace que les pièces de sa couleur, avec ses
  // propres pauses aléatoires. Au plus 2 pièces blanches et 2 pièces noires en vol à la fois,
  // jamais synchronisées. Si une pièce adverse occupe ma case, l'adversaire la déplace en priorité.
  const HANDS = 4, gen = ++resetGen; // gen : interrompue si une nouvelle partie démarre entre-temps
  const finish = () => { resetting = false; refresh(); };
  let idleHands = 0;
  const pause = () => 120 + Math.random() * 650;
  const mine = white => [...pending].filter(p => p.white === white);
  const hand = (white, delay) => setTimeout(() => {
    if (gen !== resetGen) return;
    const own = mine(white);
    if (!own.length) { if (++idleHands === HANDS) finish(); return; }
    const ready = own.filter(p => !inFlight.has(p) && homeFree(p));
    if (ready.length) {
      // d'abord les pièces qui bloquent la case d'une autre, puis les plus éloignées
      ready.sort((a, b) => (isBlocking(b) - isBlocking(a)) || (distHome(b) - distHome(a)));
      return flyHome(ready[0], () => hand(white, pause()));
    }
    if (inFlight.size) return hand(white, 150);       // une case va se libérer : on attend
    const blocker = own.find(p => physSq.get(p) >= 0); // échange circulaire : on soulève une de ses pièces
    if (blocker) return liftInHand(blocker, () => hand(white, pause()));
    hand(white, 150);                                  // l'adversaire doit d'abord libérer la case
  }, delay);

  refresh();
  if (!pending.size) { finish(); return; }
  hand(true, Math.random() * 300);         // main droite des Blancs
  hand(true, 300 + Math.random() * 500);   // main gauche des Blancs
  hand(false, 100 + Math.random() * 400);  // main droite des Noirs
  hand(false, 450 + Math.random() * 550);  // main gauche des Noirs
}

// Fin de partie simulée (panneau Debug)
// En ligne, la simulation passe par le serveur pour s'appliquer aux deux joueurs à la fois.
function simulateEnd(winner, reason, { fromOnline = false } = {}) {
  if (Online.active && !fromOnline) { Online.sendSimulate(winner, reason); return; }
  if (Online.watching && !fromOnline) return;
  if (resetting) return;
  if (mode !== 'rules') setMode('rules');
  forcedResult = { winner, reason };
  Clock.stop();
  Sound.play(winner ? 'mate' : 'draw');
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
  forcedResult = null;
  Clock.syncTurn(turn === 'w');
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

// Spectateur qui arrive en cours de partie : les coups déjà joués sont appliqués d'un coup,
// sans animation ni son (même enchaînement de règles que pendant la partie).
function replayMoves(list) {
  newGame();
  for (const mv of list) {
    const m = legalMovesFrom(position(), mv.from, epSquare).find(x => x.to === mv.to);
    if (!m) break;
    playMove(m, { remote: true, promo: mv.promo || 'q' }); // sans promotion à choisir : immédiat
  }
  tweens.clear();
  for (const p of pieces) p.landingSounds = null;
  layout(false);
  refresh();
}

// Spectateur d'une partie solo : la position reçue est appliquée telle quelle (placement libre
// compris). instant : à l'arrivée, sans animation ; ensuite, les pièces se déplacent normalement.
function applyRemoteState(st, instant = false) {
  if (pieces.length !== 32) newGame();
  if (st.mode !== mode) { mode = st.mode; Clock.setFrozen(mode === 'free'); }
  const before = pieces.map(p => p.sq);
  log = st.log.map(e => ({ ...e }));
  restore({ ...st, logLength: log.length });
  history = []; // pas d'annulation pour le spectateur
  if (instant) { tweens.clear(); layout(false); }
  else pieces.forEach((p, i) => { if (p.sq !== before[i]) p.landingSounds = [p.sq < 0 ? 'remove' : 'move']; });
  refresh();
}

// État de la partie solo, transmis au serveur (visible dans l'administration)
function soloState() {
  return { ...snapshot(), log: log.slice(-50), plies: log.filter(e => e.kind === 'move').length,
    mode, theme: themeStyle(), board: currentBoard };
}

// --- Jouer un coup (mode partie) --------------------------------------
// remote : coup reçu de l'adversaire en ligne (promo : pièce de promotion choisie par lui)
async function playMove(m, { remote = false, promo = null } = {}) {
  const p = board[m.from];
  let promoType = null;
  if (m.promo) {
    promoType = remote && promo ? promo : await askPromotion(p.white);
  }
  if (!remote) Online.sendMove(m.from, m.to, promoType); // transmis à l'adversaire en ligne
  history.push(snapshot());
  if (history.length === 1) gameStartTime = performance.now();
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
  Clock.onMove(p.white);
  if (!canReply) Clock.stop();

  // Sons joués quand la pièce touche le plateau (voir updateTweens)
  p.landingSounds = [m.castle ? 'castle' : victim ? 'capture' : 'move'];
  if (promoType) p.landingSounds.push('promote');
  if (!canReply) p.landingSounds.push(check ? 'mate' : 'draw');
  else if (check) p.landingSounds.push('check');
  clearSelection();
  layout(true);
  refresh();
}

// --- Déplacer librement (mode libre) ----------------------------------
// dest = case vide, ou -1 pour mettre la pièce dans la réserve.
// Si la case d'arrivée est occupée, la pièce qui s'y trouve sort du jeu (vers la réserve).
function freeMove(p, dest) {
  if (dest >= 0 && board[dest] === p) return;
  history.push(snapshot());
  const from = p.sq;
  const victim = dest >= 0 ? board[dest] : null;
  const where = sq => sq >= 0 ? sqName(sq) : 'réserve';
  log.push({ kind: 'note', free: true,
    text: `${pieceGlyph(p)} ${pieceLabel(p)} ${where(from)} → ${where(dest)}` + (victim ? ` × ${pieceLabel(victim)}` : '') });
  if (victim) sendToReserve(victim);
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
  p.landingSounds = [dest < 0 ? 'remove' : victim ? 'capture' : 'move'];
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
    if (dist < 1e-4) { playLandingSounds(p); continue; }
    varyJelly(p);
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
      t.piece.fx.sv -= 1.4 * (t.piece.fx.v?.squash ?? 1); // petit écrasement à l'atterrissage
      playLandingSounds(t.piece);
      t.onDone?.();
    }
  }
}

// Le premier son (impact) tout de suite, les suivants (échec, promotion…) juste après.
function playLandingSounds(p) {
  if (!p.landingSounds) return;
  const [first, ...rest] = p.landingSounds;
  p.landingSounds = null;
  Sound.play(first);
  rest.forEach((s, i) => setTimeout(() => Sound.play(s), 140 + i * 260));
}

// --- Effet « gelée » ---------------------------------------------------
// La pièce penche selon sa vitesse (le haut traîne derrière le mouvement),
// puis un ressort peu amorti la ramène droite en oscillant un peu.
const TILT_K = 170, TILT_C = 8;     // raideur / amortissement de l'inclinaison
const SQUASH_K = 260, SQUASH_C = 11; // raideur / amortissement de l'écrasement
const LEAN = 0.085, MAX_TILT = 0.38;
const HELD_LIFT = 0.42;      // hauteur de la pièce tenue
const SWAY_MIN_TILT = 0.03;  // en dessous (≈ 1,7°), le balancement reste silencieux
const COM_Y = 0.35;      // hauteur approximative du centre de gravité
const clampTilt = a => Math.max(-MAX_TILT, Math.min(MAX_TILT, a));

// Chaque mouvement reçoit une « personnalité » légèrement différente, pour que
// le balancement ne soit jamais tout à fait le même d'une fois à l'autre.
const around = (x, amt) => x * (1 + (Math.random() * 2 - 1) * amt);
function varyJelly(p) {
  p.fx.v = {
    k: around(TILT_K, 0.25),           // raideur : oscillation plus ou moins rapide
    c: around(TILT_C, 0.3),            // amortissement : oscille plus ou moins longtemps
    lean: around(1, 0.3),              // amplitude de l'inclinaison
    twist: (Math.random() * 2 - 1) * 0.35, // déviation de direction (radians, ~±20°)
    squash: around(1, 0.35),           // intensité de l'écrasement / étirement
  };
}
const JELLY_DEFAULT = { k: TILT_K, c: TILT_C, lean: 1, twist: 0, squash: 1 };

const ZERO = new THREE.Vector3(), tmpV = new THREE.Vector3();
let jellyClock = 0; // temps d'animation cumulé (secondes)
function updateJelly(dt) {
  jellyClock += dt;
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
    const J = fx.v || JELLY_DEFAULT;
    const lean = LEAN * J.lean * Math.max(-1, Math.min(1, (COM_Y - fx.pivot.y) / 0.25));
    // Vitesse légèrement tournée (twist) : la pièce ne penche pas toujours pile à l'opposé
    const cs = Math.cos(J.twist), sn = Math.sin(J.twist);
    const ux = vx * cs - vz * sn, uz = vx * sn + vz * cs;
    const gx = clampTilt(-uz * lean), gz = clampTilt(ux * lean);
    fx.wx += (J.k * (gx - fx.tx) - J.c * fx.wx) * dt; fx.tx += fx.wx * dt;
    fx.wz += (J.k * (gz - fx.tz) - J.c * fx.wz) * dt; fx.tz += fx.wz * dt;

    fx.sv += (SQUASH_K * (1 - fx.s) - SQUASH_C * fx.sv) * dt; fx.s += fx.sv * dt;

    // Soulèvement doux : un peu quand sélectionnée, plus quand on la tient
    const liftTarget = held ? HELD_LIFT : selected === p ? 0.14 : 0;
    fx.lift += (liftTarget - fx.lift) * ease;

    // Rotation et écrasement autour du pivot : position = pivot − R·S·pivot
    // Un son à chaque extrémité du balancement (quand l'inclinaison cesse de croître),
    // seulement une fois la pièce posée : silence pendant qu'on la tient ou qu'elle se déplace.
    const tiltMag = Math.hypot(fx.tx, fx.tz);
    if (fx.lastTilt !== undefined) {
      const rising = tiltMag > fx.lastTilt;
      // Délai minimal compté en temps d'animation (et non à l'horloge) entre deux sons
      const resting = !held && fx.lift < 0.05 && !tweens.has(p.mesh);
      if (resting && fx.tiltRising && !rising && fx.lastTilt > SWAY_MIN_TILT && jellyClock - (fx.lastSwaySound ?? -1) > 0.09) {
        Sound.play('sway', Math.min(1, fx.lastTilt / MAX_TILT)); // le bord du socle retape le plateau
        fx.lastSwaySound = jellyClock;
      }
      fx.tiltRising = rising;
    }
    fx.lastTilt = tiltMag;

    w.rotation.set(fx.tx, 0, fx.tz);
    const side = 1 / Math.sqrt(fx.s); // volume conservé
    w.scale.set(side, fx.s, side);
    tmpV.copy(fx.pivot).multiply(w.scale).applyEuler(w.rotation);
    w.position.copy(fx.pivot).sub(tmpV);
    w.position.y += fx.lift;

    // Ne jamais traverser la table : le point le plus bas du bord du socle reste
    // au-dessus du plateau (la pièce bascule alors sur le bord de son socle).
    w.updateMatrix();
    const e = w.matrix.elements; // colonnes : axe x = e[0..2], axe z = e[8..10] (rotation × échelle)
    const lowest = w.position.y - (p.mesh.userData.baseRadius || 0.35) * Math.hypot(e[1], e[9]);
    if (lowest < 0) w.position.y -= lowest;
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
  if (busy || resetting) return false;
  if (Online.watching) return false; // spectateur : on regarde sans toucher
  if (mode === 'free') return true;
  if (Online.active && p.white !== Online.isWhite) return false; // en ligne : uniquement ses pièces
  if (aiActive() && (p.white ? 'w' : 'b') === aiSide) return false; // les pièces de l'ordinateur
  return !gameOver && p.sq >= 0 && p.white === whiteToMove();
}

function select(p) {
  if (selected !== p) { varyJelly(p); p.fx.sv += 1.2 * p.fx.v.squash; Sound.play('pick'); } // léger étirement quand on la prend
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
document.getElementById('btn-view').onclick = () => { if (selected) { PieceViewer.open(selected); Sound.play('open'); } };

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
  if (s < 0 || board[s] === selected) return false;
  freeMove(selected, s); // case occupée : la pièce présente sort du jeu
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
  if (e.target !== renderer.domElement || e.button !== 0 || busy || resetting) return;
  aim(e);
  const hitPiece = pickPiece();
  const pt = floorPoint();
  const floorSq = pt ? squareAt(pt) : -1;

  // 1) Une pièce est déjà sélectionnée : clic sur une case d'arrivée.
  //    On teste la case de la pièce touchée, puis la case au sol sous le curseur
  //    (utile quand une pièce au premier plan masque la case visée).
  if (selected && hitPiece !== selected) {
    // Mode libre : un clic vise une case vide ; cliquer une autre pièce la sélectionne
    // (la prise en mode libre se fait en déposant la pièce par glisser-déposer).
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

// --- Fantôme classique : au survol, la pièce classique en transparence ---------------------
let ghostOn = false;
try { ghostOn = localStorage.getItem('chess3d:ghost') === '1'; } catch { }
const ghost = { piece: null, mesh: null, obj: null }; // mesh : la pièce est reconstruite au changement de thème
function showGhost(p) {
  if (!ghostOn || classicHeld) p = null;
  if (ghost.piece === p && ghost.mesh === p?.mesh) return;
  ghost.obj?.removeFromParent();
  Object.assign(ghost, { piece: p, mesh: p?.mesh, obj: null });
  if (!p) return;
  ghost.obj = buildGhost(p.type, p.white, p.side);
  if (ghost.obj) p.mesh.userData.wobble.add(ghost.obj); // suit la pièce et son effet « gelée »
}
const ghostToggle = document.getElementById('ghost-toggle');
ghostToggle.checked = ghostOn;
ghostToggle.onchange = () => {
  ghostOn = ghostToggle.checked;
  try { localStorage.setItem('chess3d:ghost', ghostOn ? '1' : '0'); } catch { }
  if (!ghostOn) showGhost(null);
};
renderer.domElement.addEventListener('pointerleave', () => showGhost(null));

// --- Bouton « Classique » : tant qu'il est appuyé, toutes les pièces en Classique ------------
const classicBtn = document.getElementById('btn-classic');
function holdClassic(on) {
  if (on === classicHeld) return;
  classicHeld = on;
  classicBtn.classList.toggle('held', on);
  if (on) showGhost(null);
  for (const p of pieces) if (p.mesh) setClassicView(p.mesh, on);
}
// Inutile quand toutes les pièces ont déjà l'allure classique (thèmes Classique, Cristal)
function updateClassicBtn() {
  const useful = [true, false].some(white => [...'prnbqk'].some(t => [0, 1].some(side => !hasClassicLook(t, white, side))));
  if (!useful) holdClassic(false);
  classicBtn.classList.toggle('hidden', !useful);
}
classicBtn.addEventListener('pointerdown', e => {
  if (e.button !== 0) return;
  classicBtn.setPointerCapture(e.pointerId); // relâché hors du bouton : on revient quand même
  holdClassic(true);
});
for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) classicBtn.addEventListener(ev, () => holdClassic(false));
classicBtn.addEventListener('keydown', e => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); holdClassic(true); } });
classicBtn.addEventListener('keyup', e => { if (e.key === ' ' || e.key === 'Enter') holdClassic(false); });
classicBtn.addEventListener('blur', () => holdClassic(false));
addEventListener('blur', () => holdClassic(false));

window.addEventListener('pointermove', e => {
  if (!drag) {
    if (e.target === renderer.domElement && !busy && e.buttons === 0) {
      aim(e);
      const p = pickPiece();
      renderer.domElement.style.cursor = p && canPick(p) ? 'grab' : '';
      showGhost(p);
    } else showGhost(null);
    return;
  }
  showGhost(null);
  if (!drag.active) {
    if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 5) return;
    drag.active = true;
    varyJelly(drag.piece);
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
    : s >= 0; // mode libre : toute case est valide (une pièce présente sortira du jeu)
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
  if (!moved) { layout(true); refreshHighlights(); Sound.play('cancel'); } // retour à la case de départ
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
  let text, alert = false, result = null;
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
      result = check ? { winner: whiteToMove() ? 'b' : 'w', reason: 'mate' } : { winner: null, reason: 'stalemate' };
      text = check
        ? `Échec et mat — les ${whiteToMove() ? 'Noirs' : 'Blancs'} gagnent`
        : 'Pat — partie nulle';
    } else if (check) {
      alert = true;
      text = `${side} en échec !`;
    } else {
      text = `Trait aux ${side}`;
    }
    // Pendule : drapeau tombé → perte au temps, sauf si l'adversaire ne peut plus mater
    if (Clock.flagged && canMove) {
      gameOver = true;
      alert = true;
      const loserWhite = Clock.flagged === 'w';
      result = canStillMate(!loserWhite) ? { winner: loserWhite ? 'b' : 'w', reason: 'time' } : { winner: null, reason: 'time-draw' };
      text = canStillMate(!loserWhite)
        ? `Temps écoulé — les ${loserWhite ? 'Noirs' : 'Blancs'} gagnent`
        : 'Temps écoulé — partie nulle (matériel insuffisant)';
    }
  }
  if (forcedResult && mode === 'rules') { // fin de partie simulée
    gameOver = true;
    alert = true;
    result = forcedResult;
    text = EndGame.describe(result).status;
  }
  if (resetting) text = 'Mise en place des pièces…';
  statusText.textContent = text;
  statusEl.classList.toggle('alert', alert);
  EndGame.update(mode === 'rules' && !resetting ? result : null);

  hintEl.textContent = mode === 'rules'
    ? 'Cliquez ou glissez une pièce : seuls les coups légaux sont acceptés (roque, prise en passant et promotion compris).'
    : 'Glissez n\'importe quelle pièce où vous voulez : déposée sur une autre pièce, celle-ci sort du jeu. Déposez-la hors du plateau pour la retirer, ou reprenez-la depuis la réserve.';

  btnUndo.disabled = history.length === 0 || Online.active || Online.watching; // pas d'annulation en ligne
  btnFree.disabled = Online.active || Online.watching;
  Online.updateBanner();
  Online.soloChanged(); // partie solo : l'administration voit la position
  btnRules.classList.toggle('active', mode === 'rules');
  btnFree.classList.toggle('active', mode === 'free');
  renderLog();
  btnTurn.classList.toggle('hidden', mode !== 'free');
  btnClear.classList.toggle('hidden', mode !== 'free');
  refreshHighlights();
  aiLevelSel.disabled = aiSideSel.disabled = Online.active || Online.watching;
  maybeAIMove();
}

// L'adversaire peut-il encore mater ? Non s'il n'a que son roi, ou roi + un fou ou un cavalier.
function canStillMate(white) {
  const own = pieces.filter(p => p.sq >= 0 && p.white === white && p.type !== 'k');
  if (own.length === 0) return false;
  if (own.length === 1 && (own[0].type === 'b' || own[0].type === 'n')) return false;
  return true;
}
Clock.onFlag = flag => {
  if (flag) log.push({ kind: 'note', text: `Temps écoulé · ${canStillMate(flag !== 'w') ? (flag === 'w' ? '0-1' : '1-0') : '½-½'}` });
  refresh();
};

function setMode(m) {
  if (mode === m) return;
  if ((Online.active || Online.watching) && m === 'free') return; // pas de placement libre en partie en ligne
  mode = m;
  Clock.setFrozen(m === 'free');
  clearSelection();
  refresh();
}

btnRules.onclick = () => setMode('rules');
btnFree.onclick = () => setMode('free');
btnUndo.onclick = () => {
  if (!history.length || busy || Online.watching) return;
  let s = history.pop();
  // Contre l'ordinateur : on annule aussi sa réponse, pour revenir à un coup du joueur
  while (aiActive() && s.turn === aiSide && history.length) s = history.pop();
  restore(s);
  Sound.play('undo');
};

// --- Adversaire ordinateur (js/ai.js) --------------------------------------------------
// Valeur du sélecteur : « 0 » (humain), « 3 » (ordinateur moyen, rythme humain), « 3e » (moyen éclair)
const aiLevelSel = document.getElementById('ai-level'), aiSideSel = document.getElementById('ai-side');
aiLevelSel.add(new Option('Humain (même écran)', '0'));
for (const [label, suffix, name] of [['Ordinateur', '', 'Ordinateur'], ['Ordinateur éclair (joue aussitôt)', 'e', 'Éclair']]) {
  const group = document.createElement('optgroup');
  group.label = label;
  for (const l of AI.LEVELS) group.appendChild(new Option(`${name} ${l.name.toLowerCase()}`, l.id + suffix));
  aiLevelSel.appendChild(group);
}
aiLevelSel.value = aiLevel ? aiLevel + (aiFast ? 'e' : '') : '0';
aiSideSel.value = aiSide === 'w' ? 'b' : 'w'; // le sélecteur indique le camp du joueur
const showAISide = () => document.getElementById('ai-side-row').classList.toggle('hidden', !aiLevel);
showAISide();
aiLevelSel.onchange = () => {
  aiLevel = parseInt(aiLevelSel.value, 10) || 0;
  aiFast = aiLevelSel.value.endsWith('e');
  try { localStorage.setItem('chess3d:ai-level', String(aiLevel)); localStorage.setItem('chess3d:ai-fast', aiFast ? '1' : '0'); } catch { }
  showAISide();
  clearSelection();
  refresh(); // l'ordinateur joue tout de suite si c'est son tour
};
aiSideSel.onchange = () => {
  aiSide = aiSideSel.value === 'w' ? 'b' : 'w';
  try { localStorage.setItem('chess3d:ai-side', aiSide); } catch { }
  setView(aiSide === 'w' ? 'black_fly' : 'white_fly'); // le joueur voit le plateau de son côté
  clearSelection();
  refresh();
};

// Temps qu'un joueur humain prendrait pour ce coup (ms), réflexion du moteur comprise :
// vite pour un coup forcé, une reprise ou un coup d'ouverture, plus longtemps au milieu de partie,
// et parfois une longue hésitation. Les niveaux forts réfléchissent un peu plus.
const rand = (a, b) => a + Math.random() * (b - a);
function humanDelay(res) {
  const pos = position(), white = aiSide === 'w';
  let legal = 0;
  for (let s = 0; s < 64 && legal < 2; s++) if (pos[s] && pos[s].w === white) legal += legalMovesFrom(pos, s, epSquare).length;
  const capture = !!board[res.to], recapture = capture && lastMove && lastMove.to === res.to;
  const plies = log.filter(e => e.kind === 'move').length;
  let d;
  if (legal === 1) d = rand(700, 1300);                 // un seul coup possible
  else if (recapture) d = rand(900, 2200);              // reprise évidente
  else if (plies < 8) d = rand(1000, 2800);             // ouverture : coups connus
  else if (inCheck(pos, white)) d = rand(1500, 4000);   // il faut parer l'échec
  else {
    d = rand(1800, 5200);
    if (Math.random() < 0.15) d += rand(2500, 6000);    // de temps en temps, une longue réflexion
  }
  if (capture && !recapture) d *= 0.85;
  if (Math.abs(res.score) > 90000) d *= 0.6;            // il voit le mat : il joue vite
  d *= [1, 0.7, 0.8, 0.95, 1.1, 1.25][aiLevel];
  // Pendule : jamais plus d'un vingtième du temps qui lui reste
  const c = Clock.control;
  if (c.base) d = Math.min(d, Clock.remaining[aiSide] / 20 + c.inc * 0.5);
  return Math.max(500, d);
}

// L'ordinateur réfléchit dans un worker quand c'est son tour ; son coup est joué comme un coup reçu
// (sans dialogue de promotion). Rythme humain : il attend, « prend » la pièce, puis la joue.
const AI_FAST_DELAY = 350; // éclair : juste le temps de voir le coup précédent
function maybeAIMove() {
  const key = `${resetGen}:${history.length}:${turn}:${aiLevel}:${aiFast}:${aiSide}`;
  if (!aiActive() || gameOver || resetting || turn !== aiSide) {
    if (aiKey) { AI.cancel(); aiKey = null; }
    return;
  }
  if (aiKey !== key) {
    aiKey = key;
    const t0 = performance.now();
    // Positions déjà jouées : l'ordinateur évite de les répéter quand il gagne
    const past = history.map(h => {
      const pos = new Array(64).fill(null);
      h.pieces.forEach((d, i) => { if (d.sq >= 0) pos[d.sq] = { t: d.type, w: pieces[i].white, moved: d.moved }; });
      return { pos, white: h.turn === 'w', ep: h.epSquare };
    });
    const play = res => {
      if (aiKey !== key) return; // la partie a changé entre-temps (annulation, nouvelle partie…)
      aiKey = null;
      if (busy || resetting || !res.move) { refresh(); return; }
      const m = legalMovesFrom(position(), res.from, epSquare).find(x => x.to === res.to);
      if (m) playMove(m, { remote: true, promo: res.promo || 'q' });
      else refresh();
    };
    AI.think({ pos: position(), white: turn === 'w', ep: epSquare, level: aiLevel, past }, res => {
      if (aiKey !== key) return;
      const wait = Math.max(0, (aiFast || !res.move ? AI_FAST_DELAY : humanDelay(res)) - (performance.now() - t0));
      setTimeout(() => {
        if (aiKey !== key) return;
        const p = res.move && board[res.from];
        if (aiFast || !p) { play(res); return; }
        // La main se pose sur la pièce : petit sursaut et bruit de prise, puis le coup
        varyJelly(p);
        p.fx.sv += 1.2 * p.fx.v.squash;
        Sound.play('pick');
        setTimeout(() => play(res), rand(280, 520));
      }, wait);
    });
  }
  statusText.textContent += ' · l\'ordinateur réfléchit…';
}
document.getElementById('btn-reset').onclick = () => resetGame();
document.getElementById('btn-online').onclick = () => Online.startHost(); // les pièces retournent à leur case en volant

// Bouton son (activé / coupé, mémorisé)
const btnSound = document.getElementById('btn-sound');
function refreshSoundButton() {
  btnSound.textContent = Sound.muted ? '🔇 Son' : '🔊 Son';
  btnSound.classList.toggle('active', !Sound.muted);
}
btnSound.onclick = () => { Sound.setMuted(!Sound.muted); refreshSoundButton(); };
refreshSoundButton();

// Musique d'ambiance (lecture aléatoire, démarre au premier clic)
const btnMusic = document.getElementById('btn-music');
const btnNext = document.getElementById('btn-next');
const nowPlaying = document.getElementById('now-playing');
Music.onChange(({ enabled, playing, current }) => {
  btnMusic.classList.toggle('active', enabled);
  btnMusic.textContent = enabled ? '🎵 Musique' : '🔇 Musique';
  btnNext.disabled = !enabled;
  // Activée mais pas encore lancée : le navigateur attend une première action de l'utilisateur
  nowPlaying.textContent = !enabled ? ''
    : playing && current ? `♪ ${current.title} — ${current.author}`
    : '♪ Cliquez n\'importe où pour lancer la musique';
  nowPlaying.title = nowPlaying.textContent;
});
// Activée mais en attente (lecture bloquée par le navigateur) : le bouton la lance au lieu de la couper
btnMusic.onclick = () => { if (Music.enabled && !Music.playing) Music.start(); else Music.setEnabled(!Music.enabled); };
btnNext.onclick = () => Music.next();

// Volume de la musique (0 à 100 %)
const musicVolume = document.getElementById('music-volume');
const musicVolumeValue = document.getElementById('music-volume-value');
musicVolume.value = Math.round(Music.volume * 100);
const showVolume = () => { musicVolumeValue.textContent = `${musicVolume.value} %`; };
showVolume();
musicVolume.oninput = () => { Music.setVolume(musicVolume.value / 100); showVolume(); };
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

// --- Rotation automatique de la caméra --------------------------------------
// Active par défaut. La vitesse monte progressivement jusqu'au maximum choisi,
// ralentit en douceur à l'arrêt, et plus vite quand on attrape une pièce.
const ROTATE_MAX = 1.2;   // vitesse OrbitControls correspondant à 100 %
let autoRotateWanted = true;
let onHome = true; // écran d'accueil affiché : la caméra ne tourne pas
let rotateLevel = 0.06;   // curseur (0 à 1), 6 % par défaut : rotation très lente
let rotateRamp = 0;       // progression de la montée (0 à 1)
let rotateSpeed = 0;      // vitesse réelle appliquée
try {
  const v = parseFloat(localStorage.getItem('chess3d:rotateSpeed'));
  if (!Number.isNaN(v)) rotateLevel = Math.min(1, Math.max(0, v));
} catch { }
// Courbe en S (smoothstep) : départ très doux, accélération au milieu, arrivée en douceur.
function updateAutoRotate(dt) {
  const dragging = drag && drag.active;
  // En pause pendant un vol de caméra et tant que l'encart de fin est affiché (roi vu de face)
  if (autoRotateWanted && !onHome && !dragging && !CameraFly.active && !EndGame.visible) rotateRamp = Math.min(1, rotateRamp + dt / 4.5);   // 4,5 s pour atteindre le maximum
  else rotateRamp = Math.max(0, rotateRamp - dt / (dragging ? 0.35 : 1.2));            // arrêt plus vif
  const eased = rotateRamp * rotateRamp * (3 - 2 * rotateRamp);
  rotateSpeed = rotateLevel * ROTATE_MAX * eased;
  controls.autoRotate = rotateSpeed > 0.002;
  controls.autoRotateSpeed = rotateSpeed;
}
const rotateInput = document.getElementById('rotate-speed');
const rotateValue = document.getElementById('rotate-speed-value');
rotateInput.value = Math.round(rotateLevel * 100);
const showRotate = () => { rotateValue.textContent = `${rotateInput.value} %`; };
showRotate();
rotateInput.oninput = () => {
  rotateLevel = rotateInput.value / 100;
  showRotate();
  try { localStorage.setItem('chess3d:rotateSpeed', String(rotateLevel)); } catch { }
};
const btnRotate = document.getElementById('btn-rotate');
btnRotate.classList.add('active');
btnRotate.onclick = () => {
  autoRotateWanted = !autoRotateWanted;
  btnRotate.classList.toggle('active', autoRotateWanted);
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
makeDraggable(document.getElementById('gfx'), 'gfx');
makeDraggable(document.getElementById('clock'), 'clock');
makeDraggable(document.getElementById('chat'), 'chat');

// --- Démarrage et boucle ----------------------------------------------
// --- Thème des pièces --------------------------------------------------------
// Un sélecteur par camp : les thèmes se mélangent librement
const themeSelects = { w: document.getElementById('theme-select'), b: document.getElementById('theme-select-b') };
function fillThemeSelect() {
  for (const [c, sel] of Object.entries(themeSelects)) {
    sel.innerHTML = '';
    for (const id of THEME_IDS) {
      const o = document.createElement('option');
      o.value = id;
      const n = themeProgress(id);
      o.textContent = n < 6 ? `${themeName(id)} (${n}/6 pièces)` : themeName(id);
      sel.appendChild(o);
    }
    sel.value = pieceThemes[c];
  }
}
// want : { w, b } (un camp absent garde son thème). remote : choix reçu de l'adversaire en ligne
// (appliqué, mais ni mémorisé ni renvoyé). Un thème pas encore chargé est téléchargé d'abord ;
// le dernier choix l'emporte.
let themeRequest = 0;
async function applyThemes(want, { remote = false } = {}) {
  const next = { w: want.w || pieceThemes.w, b: want.b || pieceThemes.b };
  if (next.w === pieceThemes.w && next.b === pieceThemes.b) { fillThemeSelect(); return; }
  const req = ++themeRequest;
  themeSelects.w.value = next.w; themeSelects.b.value = next.b;
  document.body.classList.add('loading-theme');
  const ok = (await Promise.all([loadTheme(next.w), loadTheme(next.b)])).every(Boolean);
  if (req !== themeRequest) return;
  document.body.classList.remove('loading-theme');
  if (!ok) { fillThemeSelect(); return; }
  const changed = { w: next.w !== pieceThemes.w, b: next.b !== pieceThemes.b };
  setPieceTheme(next.w, 'w'); setPieceTheme(next.b, 'b');
  fillThemeSelect(); // nombre de pièces déjà modélisées, connu une fois le thème chargé
  for (const p of pieces) if (changed[p.white ? 'w' : 'b']) setMesh(p);
  updateClassicBtn();
  layout(true); // reprend les déplacements en cours avec les nouveaux modèles
  if (remote) return;
  try { localStorage.setItem('chess3d:theme', pieceThemes.w); localStorage.setItem('chess3d:theme-b', pieceThemes.b); } catch { }
  Online.sendStyle(); // partie en ligne : l'adversaire voit les mêmes pièces
}
// Bouton de liaison : lié, un choix s'applique aux deux camps
const themeLink = document.getElementById('theme-link');
let themesLinked = (() => {
  try { const v = localStorage.getItem('chess3d:theme-link'); if (v !== null) return v === '1'; } catch { }
  return startupThemes.w === startupThemes.b;
})();
function showThemeLink() {
  themeLink.setAttribute('aria-pressed', String(themesLinked));
  themeLink.title = themesLinked ? 'Camps liés : un choix s\'applique aux deux (cliquer pour délier)'
    : 'Camps séparés : chaque camp a son thème (cliquer pour lier)';
}
themeLink.onclick = () => {
  themesLinked = !themesLinked;
  showThemeLink();
  try { localStorage.setItem('chess3d:theme-link', themesLinked ? '1' : '0'); } catch { }
  if (themesLinked) applyThemes({ b: pieceThemes.w }); // on relie : les Noirs prennent le thème des Blancs
};
showThemeLink();
const pickTheme = c => { const id = themeSelects[c].value; applyThemes(themesLinked ? { w: id, b: id } : { [c]: id }); };
themeSelects.w.onchange = () => pickTheme('w');
themeSelects.b.onchange = () => pickTheme('b');
// Thèmes mémorisés (Dragons par défaut), déjà chargés par index.html avant ce script
setPieceTheme(startupThemes.w, 'w');
setPieceTheme(startupThemes.b, 'b');
fillThemeSelect();
updateClassicBtn();

// --- Plateau -------------------------------------------------------------------
const boardSelect = document.getElementById('board-select');
for (const [id, b] of Object.entries(BOARDS)) {
  const o = document.createElement('option');
  o.value = id;
  o.textContent = b.name;
  boardSelect.appendChild(o);
}
function applyBoard(id, { remote = false } = {}) {
  boardSelect.value = setBoardTheme(id);
  if (remote) return;
  try { localStorage.setItem('chess3d:board', currentBoard); } catch { }
  Online.sendStyle(); // partie en ligne : l'adversaire voit le même plateau
}
boardSelect.onchange = () => applyBoard(boardSelect.value);
let savedBoard = null;
try { savedBoard = localStorage.getItem('chess3d:board'); } catch { }
applyBoard(savedBoard || 'glass'); // par défaut : plateau Verre noir

newGame();
Online.ready(); // spectateur : la partie regardée est chargée maintenant

// Écran d'ouverture : le bouton « Jouer » s'active quand la scène est prête (premières
// images rendues). Ce clic est le premier geste de l'utilisateur : il débloque la musique
// et les sons, puis l'image apparaît en fondu depuis le noir.
requestAnimationFrame(() => requestAnimationFrame(() => {
  const fade = document.getElementById('intro-fade');
  const btn = document.getElementById('btn-start');
  if (!fade || !btn) return;
  btn.disabled = false;
  btn.textContent = Online.watchLink ? 'Regarder' : 'Jouer'; // spectateur (lien de l'administration)
  btn.focus();
  let first = true;
  const enter = (after, { quick = false } = {}) => {
    onHome = false; // la rotation reprend, en douceur
    Online.soloChanged(); // partie solo : visible dans l'administration dès maintenant
    Music.start();
    fade.classList.toggle('quick', quick); // fondu court (spectateur)
    fade.classList.add('done');
    after?.();
    first = false;
  };
  // Une fois le fondu terminé, l'écran d'accueil est masqué (il reste disponible : bouton Accueil)
  fade.addEventListener('transitionend', e => { if (e.target === fade && fade.classList.contains('done')) fade.style.display = 'none'; });
  btn.onclick = () => enter(() => { if (first) Online.afterSplash(); }); // invité : saisie de son nom
  // Servi par le serveur Node (et pas d'invitation en cours) : bouton « Jouer à deux en ligne »
  const onlineBtn = document.getElementById('btn-start-online');
  const showOnline = () => onlineBtn.classList.toggle('hidden', !(Online.served && !Online.invited && !Online.active));
  showOnline();
  // Spectateur (lien « Regarder » de l'administration) : pas d'écran d'accueil, la partie
  // apparaît aussitôt. La musique démarrera au premier clic si le navigateur la bloque.
  if (Online.watchLink) enter(() => Online.afterSplash(), { quick: true });
  onlineBtn.onclick = () => enter(() => Online.startHost());

  // Bouton Accueil : confirmation, puis retour à l'écran d'ouverture.
  // « Jouer » y démarre une nouvelle partie (l'échiquier est remis à zéro dès le retour).
  const confirmEl = document.getElementById('confirm-home');
  const goHome = () => {
    confirmEl.classList.add('hidden');
    if (Online.active || Online.watching) Online.leave(); // l'adversaire est prévenu
    onHome = true;
    forcedResult = null;
    EndGame.hide();
    newGame();
    CameraFly.to(START_VIEW.position, START_VIEW.target, 900); // retour à la vue de départ
    showOnline();
    fade.style.display = '';
    fade.classList.add('quick');
    void fade.offsetWidth; // le navigateur applique l'état visible avant le fondu
    fade.classList.remove('done');
    setTimeout(() => btn.focus(), 50);
  };
  document.getElementById('btn-home').onclick = () => {
    document.getElementById('confirm-home-text').textContent = Online.watching
      ? 'Vous cesserez de regarder cette partie et reviendrez à l\'écran d\'accueil.'
      : Online.active
      ? 'Vous quitterez la partie en ligne (votre adversaire en sera informé) et reviendrez à l\'écran d\'accueil.'
      : 'Vous reviendrez à l\'écran d\'accueil. « Jouer » y démarre une nouvelle partie.';
    confirmEl.classList.remove('hidden');
    document.getElementById('confirm-home-no').focus();
  };
  document.getElementById('confirm-home-yes').onclick = goHome;
  document.getElementById('confirm-home-no').onclick = () => confirmEl.classList.add('hidden');
  confirmEl.addEventListener('click', e => { if (e.target === confirmEl) confirmEl.classList.add('hidden'); });
  addEventListener('keydown', e => { if (e.key === 'Escape' && !confirmEl.classList.contains('hidden')) confirmEl.classList.add('hidden'); });
}));

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  AA.resize();
});

// --- Anticrénelage ---------------------------------------------------------------
const aaSelect = document.getElementById('aa-select');
for (const [id, m] of Object.entries(AA.MODES)) {
  const o = document.createElement('option');
  o.value = id;
  o.textContent = m.label;
  aaSelect.appendChild(o);
}
aaSelect.value = AA.mode;
aaSelect.onchange = () => { aaSelect.value = AA.setMode(aaSelect.value); };

let lastTime = performance.now();
renderer.setAnimationLoop(now => {
  const dt = Math.min(1 / 30, Math.max(1 / 240, (now - lastTime) / 1000));
  lastTime = now;
  updateTweens(now);
  if (drag && drag.active && drag.target) {
    drag.piece.mesh.position.lerp(drag.target, 1 - Math.exp(-dt * 16));
  }
  updateJelly(dt);
  CameraFly.update(now);
  Online.frame(dt); // spectateur : vue d'un joueur
  updateAutoRotate(dt);
  renderer.info.reset(); // compteurs d'une image complète (miroir et ombres compris), pour le panneau Debug
  controls.update();
  AA.render(); // rendu direct ou chaîne d'anticrénelage (voir antialias.js)
});
