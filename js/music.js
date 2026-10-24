// Musique d'ambiance : lecture aléatoire de la banque sounds/musique, avec montée du volume.
// Script classique (chargé par index.html dans l'ordre). Aucune dépendance.
//
// Les morceaux sont joués avec <audio> (et non Web Audio) : c'est ce qui permet de lire
// des fichiers locaux quand la page est ouverte directement depuis le disque (file://).
const Music = (() => {
  // Tous les morceaux sont sous licence CC0 (voir sounds/ecouter.html pour les sources).
  const TRACKS = [
    ['fantasy-randommind-lament-for-a-warriors-soul', "Lament for a Warrior's Soul", 'RandomMind'],
    ['fantasy-ecrivain-meadow-thoughts', 'Meadow Thoughts', 'Écrivain'],
    ['fantasy-tarush-singhal-lush-mossy-grotto', 'Lush Mossy Grotto', 'Tarush Singhal'],
    ['fantasy-yoiyami-sunset-plains', 'Sunset Plains', 'Yoiyami'],
    ['fantasy-cynicmusic-a-new-town-harp', 'A New Town', 'cynicmusic'],
    ['fantasy-bobjt-memories-of-am-town', 'Memories of Am Town', 'bobjt'],
    ['fantasy-bobjt-to-the-wind', 'To the Wind', 'bobjt'],
    ['fantasy-stereoscopic-celtic-loop', 'Celtic Loop', 'Stereoscopic'],
    ['medieval-randommind-the-bards-tale', "The Bard's Tale", 'RandomMind'],
    ['medieval-randommind-minstrel-dance', 'Minstrel Dance', 'RandomMind'],
    ['medieval-randommind-kings-feast', "King's Feast", 'RandomMind'],
    ['medieval-randommind-the-old-tower-inn', 'The Old Tower Inn', 'RandomMind'],
    ['calme-cynicmusic-another-august', 'Another August', 'cynicmusic'],
    ['calme-umplix-infinite-world', 'Infinite World', 'Umplix'],
    ['calme-umplix-into-the-caves', 'Into the Caves', 'Umplix'],
    ['calme-cynicmusic-november-snow', 'November Snow', 'cynicmusic'],
    ['calme-cynicmusic-calm-piano-vaporware', 'Calm Piano', 'cynicmusic'],
    ['calme-cynicmusic-lifewave', 'Lifewave', 'cynicmusic'],
    ['calme-cynicmusic-calm-relax-synthwave', 'Calm Relax', 'cynicmusic'],
    ['calme-cynicmusic-happy-lullaby', 'Happy Lullaby', 'cynicmusic'],
  ].map(([file, title, author]) => ({ src: `sounds/musique/${file}.mp3`, title, author }));

  const FIRST_TRACK = 'calme-cynicmusic-calm-piano-vaporware'; // toujours joué en premier
  const FADE_MS = 10000; // montée de 0 au volume choisi en 10 secondes

  let audio = null, current = null, lastIndex = -1, fadeTimer = null;
  let firstPlayed = false; // « Calm Piano » tant qu'aucun morceau n'a réellement démarré
  let enabled = true, playing = false;
  let level = 0.06; // volume choisi par l'utilisateur (0 à 1), 6 % par défaut
  let fade = 0;    // progression de la montée (0 à 1) ; volume réel = fade × level
  const listeners = new Set();
  try { enabled = localStorage.getItem('chess3d:music') !== '0'; } catch { }
  try {
    const v = parseFloat(localStorage.getItem('chess3d:musicVolume'));
    if (!Number.isNaN(v)) level = Math.min(1, Math.max(0, v));
  } catch { }

  const notify = () => listeners.forEach(fn => fn({ enabled, playing, current }));

  // Le premier morceau est toujours « Calm Piano » ; ensuite tirage au sort,
  // jamais deux fois de suite le même morceau.
  function pick() {
    // Si le navigateur a refusé une première tentative de lecture, on retente « Calm Piano ».
    let i = firstPlayed ? -1 : TRACKS.findIndex(t => t.src.includes(FIRST_TRACK));
    if (i === -1) {
      do { i = Math.floor(Math.random() * TRACKS.length); } while (TRACKS.length > 1 && i === lastIndex);
    }
    lastIndex = i;
    return TRACKS[i];
  }

  function fadeIn(a) {
    clearInterval(fadeTimer);
    const t0 = performance.now();
    fade = 0;
    a.volume = 0;
    fadeTimer = setInterval(() => {
      const k = Math.min(1, (performance.now() - t0) / FADE_MS);
      // Courbe quadratique : l'oreille perçoit le volume de façon logarithmique,
      // la montée paraît ainsi régulière du début à la fin.
      fade = k * k;
      a.volume = fade * level;
      if (k >= 1) clearInterval(fadeTimer);
    }, 50);
  }

  function playNext() {
    if (audio) { audio.onended = audio.onerror = null; audio.pause(); }
    current = pick();
    const a = audio = new Audio(current.src);
    a.volume = 0;
    a.onended = () => { if (playing && audio === a) playNext(); };
    a.onerror = () => { if (playing && audio === a) setTimeout(playNext, 1000); }; // fichier illisible : on passe au suivant
    a.play()
      .then(() => { firstPlayed = true; fadeIn(a); })
      .catch(() => { if (audio === a) { playing = false; notify(); } }); // lecture refusée (pas encore d'action de l'utilisateur)
    playing = true;
    notify();
  }

  function start() {
    if (!enabled || playing) return;
    playNext();
  }

  function stop() {
    clearInterval(fadeTimer);
    if (audio) audio.pause();
    playing = false;
    notify();
  }

  // Volume de la musique (0 à 1), appliqué tout de suite, même pendant la montée.
  function setVolume(v) {
    level = Math.min(1, Math.max(0, v));
    try { localStorage.setItem('chess3d:musicVolume', String(level)); } catch { }
    if (audio) audio.volume = fade * level;
  }

  function setEnabled(on) {
    enabled = on;
    try { localStorage.setItem('chess3d:music', on ? '1' : '0'); } catch { }
    on ? start() : stop();
  }

  // Les navigateurs n'autorisent la lecture qu'après une action de l'utilisateur :
  // la musique démarre au premier clic ou à la première touche.
  // (sauf sur le bouton Musique lui-même, qui gère son propre clic : sinon ce premier clic
  //  lancerait la musique puis la couperait aussitôt)
  const onGesture = e => { if (!e.target.closest?.('#btn-music')) start(); };
  for (const ev of ['pointerdown', 'pointerup', 'click', 'keydown', 'touchend']) window.addEventListener(ev, onGesture, { capture: true, passive: true });

  // Activée par défaut : on tente de démarrer tout de suite. Si le navigateur bloque la
  // lecture automatique, elle démarrera au premier clic (toujours par « Calm Piano »).
  start();

  return {
    start, stop, setEnabled, setVolume,
    get volume() { return level; },
    get playing() { return playing; },
    next: () => { if (enabled) playNext(); },
    onChange: fn => { listeners.add(fn); fn({ enabled, playing, current }); },
    get enabled() { return enabled; },
  };
})();
