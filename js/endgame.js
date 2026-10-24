// Fin de partie : encart de résultat et caméra qui vient cadrer le roi vainqueur.
// Script classique (chargé par index.html avant main.js). Les fonctions sont appelées par
// main.js une fois tout chargé : elles lisent alors l'état du jeu (pièces, coups, pendule).

// --- Vol de caméra : déplacement lent et fluide vers une position et un point visé ----------
const CameraFly = (() => {
  let anim = null;
  // Courbe sinusoïdale : départ et arrivée très progressifs, sans à-coup
  const ease = k => 0.5 - 0.5 * Math.cos(Math.PI * k);
  // duration : durée fixe (ms) ; sinon, durée selon la distance à parcourir (5 à 8 s)
  function to(position, target, duration) {
    const toPos = new THREE.Vector3(...position);
    const dist = camera.position.distanceTo(toPos);
    anim = {
      fromPos: camera.position.clone(), fromTarget: controls.target.clone(),
      toPos, toTarget: new THREE.Vector3(...target),
      t0: performance.now(),
      duration: duration ?? Math.min(8000, 5000 + dist * 300),
      arc: Math.min(1.6, dist * 0.12), // léger arc au-dessus du plateau
    };
    controls.enabled = false; // l'utilisateur reprend la main à l'arrivée
  }
  function update(now) {
    if (!anim) return;
    const k = Math.min(1, (now - anim.t0) / anim.duration), e = ease(k);
    camera.position.lerpVectors(anim.fromPos, anim.toPos, e);
    camera.position.y += Math.sin(Math.PI * e) * anim.arc;
    controls.target.lerpVectors(anim.fromTarget, anim.toTarget, e);
    if (k >= 1) { anim = null; controls.enabled = true; }
  }
  return { to, update, get active() { return !!anim; } };
})();

// --- Encart de fin de partie -------------------------------------------------------------
const EndGame = (() => {
  const el = document.getElementById('endgame');
  const $ = id => document.getElementById(id);
  let shownKey = null, closedKey = null;

  // Texte affiché pour chaque résultat
  function describe({ winner, reason }) {
    const side = winner === 'w' ? 'Blancs' : 'Noirs';
    const loser = winner === 'w' ? 'Noirs' : 'Blancs';
    const R = {
      mate:       { reason: 'par échec et mat' },
      time:       { reason: `au temps · la pendule des ${loser} est tombée` },
      resign:     { reason: `par abandon des ${loser}` },
      stalemate:  { reason: 'par pat · le joueur au trait n\'a aucun coup légal' },
      'time-draw': { reason: 'temps écoulé, mais l\'adversaire ne peut plus mater' },
      material:   { reason: 'par matériel insuffisant pour mater' },
    }[reason] || { reason: '' };
    const title = winner ? `Victoire des ${side}` : 'Partie nulle';
    const score = winner === 'w' ? '1 – 0' : winner === 'b' ? '0 – 1' : '½ – ½';
    return { title, reason: R.reason, score, status: `${title} — ${R.reason}` };
  }

  // Le roi vainqueur est cadré de face (côté plateau), la caméra un peu au-dessus de lui.
  function flyToWinner(winner) {
    if (!winner) { // nulle : on recule pour montrer tout le plateau
      const az = controls.getAzimuthalAngle();
      const v = new THREE.Vector3().setFromSpherical(new THREE.Spherical(12, THREE.MathUtils.degToRad(42), az));
      CameraFly.to([v.x, v.y, v.z], [0, 0, 0]);
      return;
    }
    const king = pieces.find(p => p.type === 'k' && p.white === (winner === 'w') && p.sq >= 0);
    if (!king) return;
    const kp = homePosition(king);
    // Direction dans laquelle regarde réellement le roi (l'avant du modèle, +z local),
    // quelle que soit sa case : la caméra se place devant lui pour le voir de face.
    const model = king.mesh.userData.wobble.children[0];
    model.updateWorldMatrix(true, false);
    const front = model.getWorldDirection(new THREE.Vector3());
    front.y = 0;
    if (front.lengthSq() < 1e-4) front.set(0, 0, winner === 'w' ? -1 : 1);
    front.normalize();
    // Caméra surélevée (elle plonge par-dessus les pièces devant lui) et visée un peu au-dessus
    // du roi : il apparaît dans la moitié basse de l'écran, sous l'encart de résultat.
    CameraFly.to([kp.x + front.x * 3.4, 2.55, kp.z + front.z * 3.4], [kp.x, 1.3, kp.z]);
  }

  function formatDuration(ms) {
    const s = Math.round(ms / 1000), m = Math.floor(s / 60);
    return m >= 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}` : `${m}:${String(s % 60).padStart(2, '0')}`;
  }

  function show(result) {
    const d = describe(result);
    $('eg-crest').textContent = result.winner === 'w' ? '♔' : result.winner === 'b' ? '♚' : '½';
    $('eg-title').textContent = d.title;
    $('eg-reason').textContent = d.reason;
    $('eg-score').textContent = d.score;
    // Aux échecs, un « coup » compte le coup blanc et la réponse noire
    const plies = log.filter(e => e.kind === 'move').length, moves = Math.ceil(plies / 2);
    const meta = moves ? [`${moves} coup${moves > 1 ? 's' : ''}`] : [];
    if (gameStartTime) meta.push(`durée ${formatDuration(performance.now() - gameStartTime)}`);
    if (Clock.label !== 'Sans pendule') meta.push(Clock.label);
    $('eg-meta').textContent = meta.join(' · ');
    el.classList.remove('hidden');
    el.classList.toggle('draw', !result.winner);
    flyToWinner(result.winner);
  }

  function hide() { el.classList.add('hidden'); }

  // Appelée à chaque rafraîchissement du jeu : affiche l'encart une seule fois par fin de partie
  function update(result) {
    if (!result) { shownKey = closedKey = null; hide(); return; }
    const key = `${result.winner}-${result.reason}-${history.length}`;
    if (key === shownKey || key === closedKey) return;
    shownKey = key;
    show(result);
  }

  $('eg-new').onclick = () => resetGame();
  $('eg-close').onclick = () => { closedKey = shownKey; hide(); };

  return { update, hide, describe, get visible() { return !el.classList.contains('hidden'); } };
})();
