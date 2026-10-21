// Sons du jeu : coups de pièces enregistrés (sounds/pieces) et sons d'interface synthétisés (Web Audio).
// Script classique (chargé par index.html dans l'ordre). Aucune dépendance.
//
// Utilisation : Sound.play('move'), Sound.play('click')…  Sound.setMuted(true) coupe le son.
const Sound = (() => {
  let ctx = null, master = null, noiseBuf = null;
  let muted = false;
  try { muted = localStorage.getItem('chess3d:muted') === '1'; } catch { }

  // Le navigateur n'autorise l'audio qu'après une action de l'utilisateur :
  // le contexte est créé (ou réveillé) au premier clic ou à la première touche.
  function ensure() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      const comp = ctx.createDynamicsCompressor(); // évite la saturation quand les sons se superposent
      master = ctx.createGain();
      master.gain.value = 0.6;
      master.connect(comp);
      comp.connect(ctx.destination);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }
  for (const ev of ['pointerdown', 'keydown']) window.addEventListener(ev, ensure, { capture: true, passive: true });

  // --- Briques de base ------------------------------------------------------
  // Note pure avec enveloppe (attaque rapide, extinction exponentielle).
  function tone(freq, { t = 0, dur = 0.2, type = 'sine', gain = 0.3, attack = 0.004, freqEnd } = {}) {
    const now = ctx.currentTime + t;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, now);
    if (freqEnd) o.frequency.exponentialRampToValueAtTime(freqEnd, now + dur);
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(gain, now + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    o.connect(g); g.connect(master);
    o.start(now); o.stop(now + dur + 0.05);
  }
  // Bruit filtré : le « toc » d'un impact, un frottement, un souffle.
  function noise({ t = 0, dur = 0.06, gain = 0.4, freq = 2000, q = 1.5, type = 'bandpass' } = {}) {
    const now = ctx.currentTime + t;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    src.connect(f); f.connect(g); g.connect(master);
    src.start(now, Math.random() * 0.3); src.stop(now + dur + 0.02);
  }
  // Petite variation aléatoire : deux coups ne sonnent jamais exactement pareil.
  const vary = (x, amt = 0.06) => x * (1 + (Math.random() * 2 - 1) * amt);
  // --- Coups de pièces enregistrés ------------------------------------------
  // Vrais enregistrements de pièces d'échecs (JJTaynos, Freesound, CC0), lus avec <audio>
  // pour fonctionner aussi en ouvrant la page depuis le disque (file://).
  const HIT_FILES = [
    '733927-2', '733927-3', '733927-4', '733927-5', '733927-6',
    '733932-1', '733932-2', '733932-3', '733932-4', '733932-5', '733932-6',
  ].map(n => `sounds/pieces/jjtaynos-${n}.mp3`);
  const hitPool = HIT_FILES.map(src => { const a = new Audio(src); a.preload = 'auto'; return a; });
  let lastHit = -1;

  // Joue un coup au hasard (jamais le même deux fois de suite), avec une légère
  // variation de hauteur et de volume pour que la répétition ne s'entende pas.
  function hit(t = 0, { gain = 1, rate } = {}) {
    let i;
    do { i = Math.floor(Math.random() * hitPool.length); } while (hitPool.length > 1 && i === lastHit);
    lastHit = i;
    const a = hitPool[i].cloneNode();
    a.volume = Math.min(1, gain * vary(0.85, 0.1));
    a.preservesPitch = false;
    a.playbackRate = rate ?? vary(1, 0.05);
    const go = () => a.play().catch(() => { });
    t > 0 ? setTimeout(go, t * 1000) : go();
  }

  // --- Catalogue des sons ---------------------------------------------------
  const SOUNDS = {
    // Prise en main d'une pièce : léger frottement qui monte
    pick: () => {
      noise({ dur: 0.035, gain: 0.1, freq: vary(3200), q: 2 });
      tone(vary(520), { dur: 0.07, gain: 0.04, freqEnd: 720 });
    },
    // Pièce posée : une pièce en bois qui cogne le plateau.
    move: (t = 0) => hit(t),
    // Prise : impact plus lourd, avec un coup sourd
    capture: () => {
      hit(0, { gain: 1.15 });
      hit(0.07, { gain: 0.7, rate: vary(0.88, 0.04) }); // la pièce prise heurtée à son tour, un peu plus grave
    },
    // Roque : roi puis tour
    castle: () => { hit(0); hit(0.18, { gain: 0.9 }); }, // roi puis tour
    // Échec : deux notes d'alerte
    check: () => {
      tone(880, { dur: 0.18, gain: 0.11, type: 'triangle' });
      tone(1175, { t: 0.12, dur: 0.32, gain: 0.11, type: 'triangle' });
    },
    // Promotion : arpège montant
    promote: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, { t: i * 0.07, dur: 0.35, gain: 0.09, type: 'triangle' })),
    // Échec et mat : petite fanfare avec une basse
    mate: () => {
      [392, 494, 587, 784].forEach((f, i) => tone(f, { t: i * 0.12, dur: 0.9 - i * 0.1, gain: 0.11, type: 'triangle' }));
      tone(98, { t: 0.36, dur: 1.2, gain: 0.2 });
    },
    // Pat : trois notes descendantes
    draw: () => [440, 415, 392].forEach((f, i) => tone(f, { t: i * 0.14, dur: 0.5, gain: 0.09 })),
    // Coup refusé, la pièce revient à sa case
    cancel: () => tone(300, { dur: 0.12, gain: 0.07, freqEnd: 200, type: 'triangle' }),
    // Pièce retirée vers la réserve : glissement
    remove: () => {
      noise({ dur: 0.18, gain: 0.12, freq: 900, q: 0.7, type: 'lowpass' });
      tone(330, { dur: 0.15, gain: 0.05, freqEnd: 180 });
    },
    // Annuler : note qui redescend
    undo: () => {
      tone(660, { dur: 0.13, gain: 0.07, freqEnd: 440 });
      noise({ dur: 0.08, gain: 0.05, freq: 1500, q: 1 });
    },
    // Nouvelle partie : les pièces se remettent en place
    reset: () => { for (let i = 0; i < 7; i++) hit(i * 0.07 + Math.random() * 0.03, { gain: 0.75 }); },
    // Interface
    click: () => {
      noise({ dur: 0.015, gain: 0.07, freq: 3500, q: 3 });
      tone(vary(1400, 0.03), { dur: 0.04, gain: 0.045 });
    },
    select: () => {
      tone(900, { dur: 0.05, gain: 0.045 });
      tone(1350, { t: 0.05, dur: 0.07, gain: 0.045 });
    },
    open: () => {
      noise({ dur: 0.25, gain: 0.07, freq: 600, q: 0.6 });
      tone(440, { dur: 0.25, gain: 0.045, freqEnd: 880 });
    },
  };

  function play(name, ...args) {
    if (muted || !SOUNDS[name] || !ensure()) return;
    try { SOUNDS[name](...args); } catch (err) { console.warn('Son', name, err); }
  }

  function setMuted(m) {
    muted = m;
    try { localStorage.setItem('chess3d:muted', m ? '1' : '0'); } catch { }
  }

  // Sons de l'interface : tous les boutons et toutes les listes déroulantes.
  document.addEventListener('click', e => { if (e.target.closest('button:not(:disabled)')) play('click'); });
  document.addEventListener('change', e => { if (e.target.matches('select')) play('select'); });

  return { play, setMuted, get muted() { return muted; } };
})();
