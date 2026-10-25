// Pendule d'échecs : cadences officielles, incrément Fischer, chute du drapeau.
// Script classique (chargé par index.html avant main.js). main.js l'informe des coups
// (Clock.onMove), des nouvelles parties (Clock.reset) et des fins de partie (Clock.stop).
//
// Règles appliquées :
//   - seule la pendule du camp au trait tourne ; elle démarre après le premier coup des Blancs
//     (comme sur les sites d'échecs en ligne) ;
//   - incrément Fischer : ajouté au joueur après chacun de ses coups ;
//   - temps écoulé : le joueur perd, sauf si l'adversaire ne peut plus mater par aucune suite
//     de coups (roi seul, ou roi et un fou ou un cavalier) : partie nulle (règles FIDE, art. 6.9).
const Clock = (() => {
  // [identifiant, libellé, minutes, incrément en secondes]
  const CONTROLS = [
    ['none', 'Sans pendule', 0, 0],
    ['1+0', 'Bullet · 1 min', 1, 0],
    ['2+1', 'Bullet · 2 min + 1 s', 2, 1],
    ['3+0', 'Blitz · 3 min', 3, 0],
    ['3+2', 'Blitz · 3 min + 2 s', 3, 2],
    ['5+0', 'Blitz · 5 min', 5, 0],
    ['5+3', 'Blitz · 5 min + 3 s', 5, 3],
    ['10+0', 'Rapide · 10 min', 10, 0],
    ['10+5', 'Rapide · 10 min + 5 s', 10, 5],
    ['15+10', 'Rapide · 15 min + 10 s', 15, 10],
    ['30+0', 'Classique · 30 min', 30, 0],
    ['90+30', 'Classique FIDE · 90 min + 30 s', 90, 30],
  ];
  const byId = Object.fromEntries(CONTROLS.map(c => [c[0], { id: c[0], label: c[1], base: c[2] * 60000, inc: c[3] * 1000 }]));

  let control = byId.none;
  try { control = byId[localStorage.getItem('chess3d:clock')] || byId.none; } catch { }

  const remaining = { w: 0, b: 0 };
  let running = null;   // 'w' | 'b' | null : pendule qui tourne
  let started = false;  // au moins un coup joué
  let paused = false;   // pause demandée par l'utilisateur
  let frozen = false;   // pause automatique (mode libre)
  let flagged = null;   // camp dont le drapeau est tombé
  let last = performance.now();
  let onFlag = () => { };
  // Partie en ligne : l'état de la pendule vient du serveur (voir applyRemote) ; localement,
  // on ne fait que l'afficher en continu entre deux mises à jour.
  let remote = false, canChoose = true;

  const els = {
    w: document.getElementById('clock-w'), b: document.getElementById('clock-b'),
    info: document.getElementById('clock-info'), select: document.getElementById('clock-control'),
    pause: document.getElementById('clock-pause'), reset: document.getElementById('clock-reset'),
  };

  function reset() {
    if (remote) return render(); // en ligne, c'est le serveur qui remet la pendule à zéro
    remaining.w = remaining.b = control.base;
    running = null; started = false; paused = false; flagged = null;
    last = performance.now();
    render();
  }

  // Appelée après chaque coup joué (mode partie)
  function onMove(moverWhite) {
    if (remote || control.id === 'none' || flagged) return; // en ligne : décompté par le serveur
    const mover = moverWhite ? 'w' : 'b';
    if (started || moverWhite) remaining[mover] += control.inc; // incrément Fischer
    started = true;
    running = moverWhite ? 'b' : 'w';
    last = performance.now();
    render();
  }

  function stop() {
    running = null;
    if (remote) Online.sendClockStop(); // fin de partie : la pendule du serveur s'arrête aussi
    render();
  }

  // Après une annulation : la pendule repart pour le camp au trait
  function syncTurn(whiteToMove) {
    if (!started || flagged || control.id === 'none') return;
    running = whiteToMove ? 'w' : 'b';
    last = performance.now();
    render();
  }

  function tick() {
    const now = performance.now(), dt = now - last;
    last = now;
    if (!running || paused || frozen || flagged || control.id === 'none') return render();
    remaining[running] = Math.max(0, remaining[running] - dt);
    if (remaining[running] === 0 && !remote) { // en ligne, la chute du drapeau vient du serveur
      flagged = running;
      running = null;
      Sound.play('check');
      onFlag(flagged);
    }
    render();
  }

  function format(ms) {
    const total = Math.max(0, ms);
    const s = Math.floor(total / 1000), m = Math.floor(s / 60), h = Math.floor(m / 60);
    const two = n => String(n).padStart(2, '0');
    if (total < 20000) return `${two(m % 60)}:${two(s % 60)}.${Math.floor(total / 100) % 10}`; // dixièmes sous 20 s
    return h ? `${h}:${two(m % 60)}:${two(s % 60)}` : `${two(m)}:${two(s % 60)}`;
  }

  // Indicateur sur le bouton « Pendule » de la barre de menu : visible même panneau fermé
  const menuBtn = document.querySelector('#menubar [data-panel="clock"]');
  let menuState = '';
  function renderMenu(none) {
    const ticking = !!running && !paused && !frozen && !flagged;
    const low = ticking && remaining[running] < 20000;
    const state = none ? '' : flagged ? 'flag' : low ? 'low' : ticking ? 'run' : 'set';
    if (state === menuState || !menuBtn) return;
    menuState = state;
    menuBtn.dataset.clock = state;
    menuBtn.title = {
      '': 'Afficher / masquer la pendule',
      set: 'Pendule active (arrêtée) · afficher / masquer',
      run: 'Pendule en marche · afficher / masquer',
      low: 'Pendule : moins de 20 secondes ! · afficher / masquer',
      flag: 'Pendule : temps écoulé · afficher / masquer',
    }[state];
  }

  function render() {
    const none = control.id === 'none';
    renderMenu(none);
    for (const side of ['w', 'b']) {
      const el = els[side];
      el.querySelector('.time').textContent = none ? '—:—' : format(remaining[side]);
      el.classList.toggle('active', running === side && !paused && !frozen);
      el.classList.toggle('low', !none && remaining[side] < 20000);
      el.classList.toggle('flag', flagged === side);
    }
    els.pause.disabled = none || !started || !!flagged || remote; // pas de pause en ligne
    els.pause.textContent = paused ? '▶ Reprendre' : '⏸ Pause';
    els.info.textContent = none ? 'Choisissez une cadence pour jouer à la pendule.'
      : flagged ? 'Temps écoulé.'
      : remote && !started ? `Partie en ligne · pendule partagée${control.inc ? ` · +${control.inc / 1000} s par coup` : ''} · démarre après le premier coup des Blancs.`
      : remote ? `Partie en ligne · pendule partagée${control.inc ? ` · +${control.inc / 1000} s par coup` : ''}.`
      : frozen ? 'En pause pendant le placement libre.'
      : !started ? `Démarre après le premier coup des Blancs${control.inc ? ` · +${control.inc / 1000} s par coup` : ''}.`
      : paused ? 'En pause.'
      : control.inc ? `+${control.inc / 1000} s ajoutées après chaque coup.` : 'Sans incrément.';
  }

  // Interface
  for (const c of CONTROLS) {
    const o = document.createElement('option');
    o.value = c[0];
    o.textContent = c[1];
    els.select.appendChild(o);
  }
  els.select.value = control.id;
  els.select.onchange = () => {
    const chosen = byId[els.select.value];
    try { localStorage.setItem('chess3d:clock', chosen.id); } catch { }
    if (remote) { els.select.value = control.id; Online.sendClockControl(chosen); return; } // le serveur répondra
    control = chosen;
    reset();
    onFlag(null); // rafraîchit le statut de la partie
  };
  els.pause.onclick = () => { if (remote) return; paused = !paused; last = performance.now(); render(); };
  els.reset.onclick = () => { if (remote) { if (canChoose) Online.sendClockControl(control); return; } reset(); onFlag(null); };

  // État envoyé par le serveur : cadence, temps restants, pendule qui tourne, drapeau
  function applyRemote(st) {
    control = byId[st.id] || { id: st.id, label: st.id, base: st.base, inc: st.inc };
    els.select.value = control.id;
    remaining.w = st.rem.w; remaining.b = st.rem.b;
    running = st.running; started = st.started; paused = false;
    last = performance.now();
    const newFlag = st.flagged && !flagged;
    flagged = st.flagged;
    if (newFlag) { Sound.play('check'); onFlag(flagged); } else if (!st.flagged) onFlag(null);
    render();
  }
  function setRemote(on, { chooser = true } = {}) {
    remote = on;
    canChoose = !on || chooser;
    els.select.disabled = !canChoose;
    els.select.title = canChoose ? '' : 'La cadence est choisie par le joueur 1';
    els.reset.disabled = !canChoose;
    if (!on) reset();
    render();
  }

  reset();
  setInterval(tick, 100);

  return {
    reset, onMove, stop, syncTurn, applyRemote, setRemote,
    get control() { return { id: control.id, base: control.base, inc: control.inc }; },
    setFrozen(f) { frozen = f; last = performance.now(); render(); },
    set onFlag(fn) { onFlag = fn; },
    get flagged() { return flagged; },
    get label() { return control.label; },
    get remaining() { return { ...remaining }; },
  };
})();
