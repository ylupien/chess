// Panneau de débogage (caméra, rendu, état du jeu) et barre de menu des panneaux.
// Script classique (chargé par index.html après main.js). Dépend de : scene.js, pieces.js,
// boards.js, main.js (état du jeu), music.js, notation.js, panels.js.
(() => {
  // ===========================================================================
  // Barre de menu : affiche ou masque les panneaux (état mémorisé)
  // ===========================================================================
  const PANELS = { ui: false, gfx: false, log: false, clock: false, chat: false, debug: false }; // visibilité par défaut : tout est fermé
  const STORE = 'chess3d:overlays';
  let shown = { ...PANELS };
  try { Object.assign(shown, JSON.parse(localStorage.getItem(STORE)) || {}); } catch { }
  shown.chat = false; // la messagerie n'a de sens qu'avec un adversaire connecté : jamais rouverte au chargement

  const menuButtons = document.querySelectorAll('#menubar button[data-panel]');
  function applyOverlays() {
    for (const b of menuButtons) {
      const id = b.dataset.panel;
      document.getElementById(id).classList.toggle('hidden', !shown[id]);
      b.classList.toggle('active', shown[id]);
      b.setAttribute('aria-pressed', String(shown[id]));
    }
  }
  const save = () => { try { localStorage.setItem(STORE, JSON.stringify(shown)); } catch { } };
  // Seule source de vérité pour l'affichage des panneaux : le reste du jeu passe par
  // Overlays.set(), et le bouton de la barre de menu reste toujours accordé au panneau.
  window.Overlays = {
    set(id, on) { if (shown[id] === on) return; shown[id] = on; save(); applyOverlays(); },
    isOpen: id => !!shown[id],
  };
  for (const b of menuButtons) {
    b.onclick = () => {
      shown[b.dataset.panel] = !shown[b.dataset.panel];
      save();
      applyOverlays();
    };
  }
  applyOverlays();

  // ===========================================================================
  // Panneau Debug
  // ===========================================================================
  const panel = document.getElementById('debug');
  const out = document.getElementById('debug-body');
  makeDraggable(panel, 'debug');

  // Compteur d'images par seconde (indépendant de la boucle de rendu)
  let frames = 0, fps = 0, lastFps = performance.now();
  (function count(now) {
    frames++;
    if (now - lastFps >= 500) { fps = frames * 1000 / (now - lastFps); frames = 0; lastFps = now; }
    requestAnimationFrame(count);
  })(performance.now());

  // Case sous la souris
  let mouseSq = -1;
  window.addEventListener('pointermove', e => {
    if (panel.classList.contains('hidden') || e.target !== renderer.domElement) return;
    aim(e);
    const pt = floorPoint();
    mouseSq = pt ? squareAt(pt) : -1;
  });

  let music = null;
  Music.onChange(state => { music = state; });

  const f2 = n => n.toFixed(2);
  const deg = r => `${(r * 180 / Math.PI).toFixed(1)}°`;
  const vec = v => `${f2(v.x)}, ${f2(v.y)}, ${f2(v.z)}`;
  const num = n => n.toLocaleString('fr-FR');
  const sq = s => (s >= 0 ? sqName(s) : '—');

  function rows() {
    const dist = camera.position.distanceTo(controls.target);
    const r = renderer.info.render, m = renderer.info.memory;
    const size = renderer.getSize(new THREE.Vector2());
    return [
      ['Caméra', null],
      ['Position', vec(camera.position)],
      ['Cible', vec(controls.target)],
      ['Distance (zoom)', `${f2(dist)}  (${controls.minDistance}–${controls.maxDistance})`],
      ['Azimut', deg(controls.getAzimuthalAngle())],
      ['Inclinaison', `${deg(controls.getPolarAngle())}  (max ${deg(controls.maxPolarAngle)})`],
      ['Champ de vision', `${camera.fov.toFixed(0)}°`],
      ['Rotation auto', autoRotateWanted ? `oui · ${f2(rotateSpeed)} (curseur ${Math.round(rotateLevel * 100)} %)` : 'non'],
      ['Rendu', null],
      ['Images / s', fps.toFixed(0)],
      ['Appels de dessin', num(r.calls)],
      ['Triangles', num(r.triangles)],
      ['Géométries / textures', `${num(m.geometries)} / ${num(m.textures)}`],
      ['Écran', `${size.x}×${size.y} · ratio ${renderer.getPixelRatio()}`],
      ['Anticrénelage', AA.label],
      ['Jeu', null],
      ['Pièces / plateau', `${themeName(pieceThemes.w)} – ${themeName(pieceThemes.b)} / ${BOARDS[currentBoard].name}`],
      ['Mode · trait', `${mode === 'rules' ? 'Partie' : 'Libre'} · ${whiteToMove() ? 'Blancs' : 'Noirs'}`],
      ['Sélection', selected ? `${pieceLabel(selected)} (${sq(selected.sq)})` : '—'],
      ['Case sous la souris', sq(mouseSq)],
      ['Glisser', drag && drag.active ? `oui → ${drag.target ? sq(squareAt(drag.target)) : '—'}` : 'non'],
      ['Coups joués', String(history.length)],
      ['Musique', music && music.enabled && music.playing && music.current ? `${music.current.title} · ${Math.round(Music.volume * 100)} %` : 'arrêtée'],
    ];
  }

  function render() {
    if (panel.classList.contains('hidden')) return;
    out.innerHTML = '';
    for (const [label, value] of rows()) {
      const tr = document.createElement('tr');
      if (value === null) {
        tr.className = 'section';
        const th = document.createElement('th');
        th.colSpan = 2;
        th.textContent = label;
        tr.appendChild(th);
      } else {
        const a = document.createElement('td'), b = document.createElement('td');
        a.textContent = label; b.textContent = value;
        tr.append(a, b);
      }
      out.appendChild(tr);
    }
  }
  setInterval(render, 200);
  render();

  // Boutons « Simuler une fin de partie »
  for (const b of panel.querySelectorAll('[data-sim]')) {
    b.onclick = () => { const [w, reason] = b.dataset.sim.split(','); simulateEnd(w || null, reason); };
  }

  // Copie de l'état de la caméra (pratique pour définir une nouvelle vue)
  document.getElementById('debug-copy').onclick = async e => {
    const btn = e.currentTarget;
    const r3 = v => [+v.x.toFixed(3), +v.y.toFixed(3), +v.z.toFixed(3)];
    const text = JSON.stringify({ position: r3(camera.position), target: r3(controls.target), fov: camera.fov });
    try { await navigator.clipboard.writeText(text); btn.textContent = 'Copié ✓'; }
    catch { btn.textContent = 'Échec'; }
    setTimeout(() => { btn.textContent = 'Copier la caméra'; }, 1200);
  };
})();
