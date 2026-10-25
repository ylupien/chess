// Parties en ligne à deux joueurs, via le WebSocket du serveur Node (server/server.js).
// Script classique (chargé par index.html avant main.js). Les fonctions du jeu (playMove,
// resetGame, setView…) ne sont appelées qu'après le chargement complet.
//
// Déroulement :
//   1. le joueur 1 (Blancs) saisit son nom → le serveur crée une salle → URL unique à partager ;
//   2. le joueur 2 (Noirs) ouvre l'URL → connexion établie → il saisit son nom, que le joueur 1
//      voit apparaître à chaque touche ;
//   3. le joueur 2 clique « Jouer » → la partie démarre chez les deux, sans rotation, chacun
//      voyant le plateau de son côté ; les coups sont transmis à l'adversaire.
//
// Mode spectateur (?regarder=<salle>, depuis la page d'administration, session requise) :
// la position est reconstituée, puis chaque coup et la pendule arrivent en direct ; rien n'est envoyé.
const Online = (() => {
  const served = location.protocol === 'http:' || location.protocol === 'https:';
  const el = document.getElementById('online');
  const banner = document.getElementById('online-banner');
  const $ = id => document.getElementById(id);
  const params = new URLSearchParams(location.search);
  const inviteRoom = params.get('partie');
  // Identifiant de la page : une reconnexion n'ouvre pas une nouvelle session (compteur de l'administration)
  const pageId = Math.random().toString(36).slice(2, 12) + Date.now().toString(36);
  const watchRoom = params.get('regarder');

  let ws = null, color = null, active = false, names = { w: '', b: '' }, hostName = '';
  let pendingGuest = false; // invité : la salle est jointe, en attente du nom
  let watching = false, watchStarted = false, watchEnded = ''; // spectateur
  let spectators = 0; // joueur : nombre de spectateurs de la partie
  let watchSolo = false; // spectateur d'une partie solo
  let inRoom = false;    // salle en ligne créée ou rejointe (la partie solo n'est plus suivie)
  let quiet = false;     // connexion ouverte pour la seule présence solo : pas de message d'erreur

  // --- Encart en plusieurs étapes -------------------------------------------------------
  function step(name) {
    el.classList.remove('hidden');
    for (const s of el.querySelectorAll('.ol-step')) s.classList.toggle('hidden', s.dataset.step !== name);
    const input = el.querySelector(`.ol-step[data-step="${name}"] input:not([readonly])`);
    if (input) setTimeout(() => input.focus(), 50);
  }
  const close = () => el.classList.add('hidden');

  function connect(onOpen) {
    if (ws && ws.readyState <= 1) { if (ws.readyState === 1) onOpen(); else ws.addEventListener('open', onOpen, { once: true }); return; }
    ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws?p=${pageId}`);
    ws.addEventListener('open', onOpen, { once: true });
    ws.addEventListener('message', e => { try { onMessage(JSON.parse(e.data)); } catch (err) { console.warn(err); } });
    ws.addEventListener('close', () => {
      if (quiet && !active && !watching) { ws = null; setTimeout(presence, 5000); return; } // présence solo : on réessaie
      if (active) { active = false; Clock.setRemote(false); showBanner(`Connexion perdue avec ${names[color === 'w' ? 'b' : 'w'] || 'l\'adversaire'}.`, true); refresh(); }
      if (watching && !watchEnded) { watchEnded = 'Connexion au serveur perdue.'; updateBanner(); }
    });
    ws.addEventListener('error', () => { if (!active && !quiet) { $('ol-error').textContent = 'Impossible de joindre le serveur de jeu.'; step('error'); } });
  }
  const sendMsg = msg => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg)); };

  // --- Messages du serveur ----------------------------------------------------------------
  function onMessage(msg) {
    switch (msg.type) {
      case 'created': {
        color = 'w';
        inRoom = true;
        const local = `${location.origin}${location.pathname}?partie=${msg.room}`;
        const isLocal = /^(localhost|127\.|\[::1\])/.test(location.hostname);
        // Ouvert en « localhost » : l'adresse du réseau local est plus utile pour un autre appareil
        $('ol-url').value = isLocal && msg.lanUrl ? msg.lanUrl : local;
        $('ol-lan').textContent = isLocal && msg.lanUrl ? `Sur cet ordinateur : ${local}` : '';
        $('ol-guest-name').textContent = 'En attente du second joueur…';
        $('ol-guest-name').classList.add('waiting');
        step('invite');
        break;
      }
      case 'joined':
        color = 'b';
        inRoom = true;
        hostName = msg.hostName;
        pendingGuest = true;
        $('ol-invite-title').textContent = `${hostName} vous invite à jouer`;
        document.querySelector('.splash p').textContent = `${hostName} vous invite à une partie en ligne`;
        break;
      case 'guest-connected':
        $('ol-guest-name').textContent = 'Connexion établie, saisie du nom…';
        break;
      case 'guest-name': {
        const live = $('ol-guest-name');
        live.classList.toggle('waiting', !msg.name);
        live.textContent = msg.name || 'Saisie du nom…';
        break;
      }
      case 'start':
        names = { w: msg.white, b: msg.black };
        startGame();
        if (color === 'w') sendStyle(); // au départ, l'invité adopte les pièces et le plateau de l'hôte
        break;
      case 'style': // l'adversaire a changé de pièces ou de plateau
        { const t = parseThemeStyle(msg.theme); if (t) applyThemes(t, { remote: true }); }
        if (BOARDS[msg.board] && msg.board !== currentBoard) applyBoard(msg.board, { remote: true });
        break;
      case 'move': {
        const m = legalMovesFrom(position(), msg.from, epSquare).find(x => x.to === msg.to);
        if (m) playMove(m, { remote: true, promo: msg.promo });
        break;
      }
      case 'rematch-request': // l'adversaire propose une nouvelle partie
        $('ol-rematch-title').textContent = `${msg.from} propose une nouvelle partie`;
        step('rematch');
        Sound.play('select');
        break;
      case 'rematch-answer':
        if (!msg.accept) { rematchPending = false; showBanner(`${opponentName()} a refusé la nouvelle partie. La partie continue.`); setTimeout(updateBanner, 4000); }
        break;
      case 'rematch-start': // les deux joueurs ont accepté : nouvelle partie, même couleurs
        rematchPending = false;
        close();
        resetGame({ fromOnline: true });
        Sound.play('promote');
        refresh();
        break;
      case 'chat':
        addChat(msg);
        break;
      case 'simulate': // fin de partie simulée depuis le panneau Debug d'un des joueurs
        simulateEnd(msg.winner, msg.reason, { fromOnline: true });
        break;
      case 'clock': // pendule partagée : l'état fait foi pour les deux joueurs
        Clock.applyRemote(msg);
        break;
      case 'watching': // spectateur : position actuelle de la partie
        names = { w: msg.white, b: msg.black || '…' };
        watching = true;
        watchSolo = !!msg.solo;
        watchStarted = msg.started;
        watchEnded = '';
        document.querySelector('.splash p').textContent = watchSolo ? 'Assister à une partie solo' : `Assister à la partie : ${names.w} contre ${names.b}`;
        if (!document.getElementById('btn-start').disabled) document.getElementById('btn-start').textContent = 'Regarder';
        close();
        if (mode !== 'rules') setMode('rules');
        Clock.setRemote(true, { chooser: false });
        if (watchSolo) onMessage({ type: 'solo', state: msg.state, instant: true });
        else replayMoves(msg.moves);
        if (msg.style) onMessage(msg.style);
        autoRotateWanted = false;
        document.getElementById('btn-rotate').classList.remove('active');
        buildCamBar();
        refresh();
        break;
      case 'watch-start': // la partie regardée commence
        names = { w: msg.white, b: msg.black };
        watchStarted = true;
        buildCamBar();
        replayMoves([]);
        Sound.play('promote');
        break;
      case 'cam': // spectateur : caméra d'un joueur
        if (!watching) break;
        cams[msg.color] = { p: msg.p, t: msg.t, f: msg.f };
        updateCamBar();
        updateMarkers();
        break;
      case 'solo': // spectateur : nouvelle position de la partie solo
        if (!watching || !watchSolo || !msg.state) break;
        applyRemoteState(msg.state, !!msg.instant);
        onMessage({ type: 'style', theme: msg.state.theme, board: msg.state.board });
        break;
      case 'player-left':
        if (watching) { watchEnded = `${msg.name} a quitté la partie.`; updateBanner(); Sound.play('draw'); }
        break;
      case 'room-closed':
        if (watching) { watchEnded = watchEnded || (watchSolo ? 'Le joueur a quitté sa partie solo.' : 'La partie est terminée.'); updateBanner(); }
        break;
      case 'spectators': // joueur : quelqu'un regarde la partie
        spectators = msg.count;
        updateBanner();
        break;
      case 'opponent-left': {
        const who = msg.name || opponentName();
        if (active) {                       // pendant la partie
          active = false;
          Clock.setRemote(false);
          setChatAvailable(false);
          showBanner(`${who} a quitté la partie.`, true);
          $('ol-left-title').textContent = `${who} a quitté la partie`;
          $('ol-left-text').textContent = 'La connexion avec votre adversaire est terminée. Vous pouvez continuer la partie seul.';
          step('left');
          Sound.play('draw');
          refresh();
        } else if (color === 'b') {         // invité : le joueur 1 est parti avant le début
          $('ol-left-title').textContent = `${who} a quitté la partie`;
          $('ol-left-text').textContent = 'Le joueur qui vous a invité est parti avant le début de la partie.';
          step('left');
          Sound.play('draw');
        } else if (color === 'w') {         // hôte : l'invité est parti avant le début
          $('ol-guest-name').textContent = 'Le second joueur s\'est déconnecté. En attente…';
          $('ol-guest-name').classList.add('waiting');
        }
        break;
      }
      case 'error':
        $('ol-error').textContent = msg.message;
        step('error');
        break;
    }
  }

  // --- Début de la partie en ligne ---------------------------------------------------------
  function startGame() {
    close();
    if (mode !== 'rules') setMode('rules');
    Clock.setRemote(true, { chooser: color === 'w' });
    resetGame({ fromOnline: true }); // pièces remises en place « à la main »
    active = true;
    setChatAvailable(true);
    autoRotateWanted = false;    // pas de rotation en partie en ligne
    document.getElementById('btn-rotate').classList.remove('active');
    const view = VIEWS[color === 'w' ? 'white' : 'black']();
    CameraFly.to(view.position, view.target); // chacun voit son côté du plateau
    Sound.play('promote');
    refresh();
  }

  // Pièces et plateau partagés : les deux joueurs voient le même jeu
  function sendStyle() { if (active) sendMsg({ type: 'style', theme: themeStyle(), board: currentBoard }); else soloChanged(); }

  // --- Partie solo, visible dans l'administration ---------------------------------------
  // Jeu servi par le serveur : la position est envoyée à chaque changement (au plus 4 fois
  // par seconde, seulement si elle a changé). Sur l'écran d'accueil : aucune partie.
  const soloTracked = () => served && !inviteRoom && !watchRoom && !active && !watching && !inRoom;
  let soloTimer = null, soloSent = '';
  function presence() {
    if (!soloTracked() || (ws && ws.readyState <= 1)) return;
    quiet = true;
    soloSent = '';
    connect(() => soloChanged());
  }
  function soloChanged() {
    if (!soloTracked() || soloTimer) return;
    soloTimer = setTimeout(() => {
      soloTimer = null;
      if (!soloTracked()) return;
      if (!ws || ws.readyState > 1) return presence();
      const data = JSON.stringify({ type: 'solo', state: onHome ? null : soloState() });
      if (data !== soloSent && ws.readyState === 1) { ws.send(data); soloSent = data; }
    }, 250);
  }

  // --- Caméras des joueurs ---------------------------------------------------------------
  // Joueur regardé (partie en ligne ou solo) : sa caméra est transmise aux spectateurs,
  // 8 fois par seconde au plus et seulement si elle a bougé. Personne ne regarde : rien n'est envoyé.
  let camSent = '';
  const r3 = v => Math.round(v * 1000) / 1000;
  setInterval(() => {
    if (!spectators || watching || !ws || ws.readyState !== 1) { camSent = ''; return; }
    const p = camera.position, t = controls.target;
    const data = JSON.stringify({ type: 'cam', p: [r3(p.x), r3(p.y), r3(p.z)], t: [r3(t.x), r3(t.y), r3(t.z)], f: r3(camera.fov) });
    if (data !== camSent) { ws.send(data); camSent = data; }
  }, 125);

  // Spectateur : vue libre, ou exactement la vue d'un joueur (suivie en douceur).
  // « Montrer les caméras » : chaque caméra apparaît dans la scène, avec la direction de son regard.
  const cams = {};      // dernière caméra reçue par joueur ('w', 'b' ou 'solo') : { p, t, f }
  let follow = 'free';  // 'free' | 'w' | 'b' | 'solo'
  const FOV = camera.fov;
  const camBar = $('watch-cam'), camSeg = $('watch-cam-seg'), camShow = $('watch-cam-show');
  const v1 = new THREE.Vector3(), v2 = new THREE.Vector3();

  function buildCamBar() {
    camSeg.innerHTML = '';
    const opts = [['free', 'Vue libre'], ...(watchSolo ? [['solo', 'Joueur']] : [['w', `♔ ${names.w}`], ['b', `♚ ${names.b}`]])];
    for (const [id, label] of opts) {
      const b = document.createElement('button');
      b.dataset.cam = id;
      b.textContent = label;
      b.onclick = () => setFollow(id);
      camSeg.appendChild(b);
    }
    camBar.classList.remove('hidden');
    updateCamBar();
  }
  function updateCamBar() {
    for (const b of camSeg.children) {
      const id = b.dataset.cam;
      b.classList.toggle('active', id === follow);
      b.disabled = id !== 'free' && !cams[id];
      b.title = id === 'free' ? 'Tourner librement autour du plateau'
        : cams[id] ? 'Voir exactement ce que voit ce joueur' : 'En attente de la caméra de ce joueur…';
    }
  }
  function setFollow(id) {
    const was = follow;
    follow = id;
    controls.enabled = id === 'free'; // en suivant un joueur, la souris ne déplace plus la vue
    // Retour à la vue libre depuis la vue d'un joueur : on recule un peu, en douceur, pour ne pas
    // rester à l'intérieur du repère de sa caméra (qui apparaît alors devant nous)
    if (id === 'free' && was !== 'free' && cams[was] && watching) {
      const back = v1.copy(camera.position).sub(controls.target).normalize();
      const to = camera.position.clone().addScaledVector(back, 1.8).add(v2.set(0, 0.5, 0));
      CameraFly.to(to, controls.target.clone(), 700);
    }
    if (id === 'free' && Math.abs(camera.fov - FOV) > 0.01) { camera.fov = FOV; camera.updateProjectionMatrix(); }
    updateCamBar();
    updateMarkers();
  }

  // Repère d'une caméra : boîtier et objectif (ivoire pour les Blancs, noir pour les Noirs),
  // filet doré jusqu'au point regardé
  const markers = {};
  function marker(color) {
    if (markers[color]) return markers[color];
    const gold = new THREE.LineBasicMaterial({ color: 0xc9a25e, transparent: true, opacity: .9 });
    const mat = new THREE.MeshBasicMaterial({ color: color === 'b' ? 0x1b1b20 : 0xf1ebde });
    const g = new THREE.Group();
    const box = new THREE.BoxGeometry(0.34, 0.24, 0.26);
    g.add(new THREE.Mesh(box, mat), new THREE.LineSegments(new THREE.EdgesGeometry(box), gold));
    const lens = new THREE.ConeGeometry(0.17, 0.26, 4, 1, true); // objectif tourné vers +z (lookAt)
    lens.rotateX(-Math.PI / 2); lens.rotateZ(Math.PI / 4); lens.translate(0, 0, 0.26);
    g.add(new THREE.Mesh(lens, new THREE.MeshBasicMaterial({ color: 0xc9a25e, side: THREE.DoubleSide })));
    const sight = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
      new THREE.LineDashedMaterial({ color: 0xc9a25e, dashSize: 0.12, gapSize: 0.08, transparent: true, opacity: .7 }));
    sight.frustumCulled = false;
    scene.add(g, sight);
    return (markers[color] = { g, sight });
  }
  function updateMarkers() {
    for (const [color, c] of Object.entries(cams)) {
      const m = marker(color);
      m.g.position.set(...c.p);
      m.g.lookAt(v1.set(...c.t));
      m.sight.geometry.setFromPoints([m.g.position, v1]);
      m.sight.computeLineDistances();
      m.g.visible = m.sight.visible = camShow.checked && color !== follow; // pas le repère de la vue suivie
    }
    hideNearMarkers();
  }
  // Un repère trop proche de notre caméra (moins d'une case environ) est masqué : il ne remplit
  // jamais l'écran, même en tournant ou en zoomant jusqu'à lui
  const NEAR = 1.1;
  function hideNearMarkers() {
    if (!camShow.checked) return;
    for (const [color, m] of Object.entries(markers)) {
      if (color === follow) continue;
      m.g.visible = m.sight.visible = camera.position.distanceTo(m.g.position) > NEAR;
    }
  }
  camShow.onchange = updateMarkers;
  function clearCams() {
    for (const k of Object.keys(cams)) delete cams[k];
    for (const [k, m] of Object.entries(markers)) { scene.remove(m.g, m.sight); delete markers[k]; }
    camBar.classList.add('hidden');
    setFollow('free');
  }
  // À chaque image (main.js) : la vue rejoint en douceur celle du joueur suivi.
  // Le lissage dépend du temps réellement écoulé : même vitesse quel que soit le nombre d'images/s.
  let lastFrame = 0;
  function frame() {
    const now = performance.now(), dt = Math.min(0.5, (now - (lastFrame || now)) / 1000);
    lastFrame = now;
    if (watching) hideNearMarkers();
    const c = watching && follow !== 'free' && cams[follow];
    if (!c) return;
    const k = 1 - Math.exp(-dt * 12);
    camera.position.lerp(v1.set(...c.p), k);
    controls.target.lerp(v2.set(...c.t), k);
    if (Math.abs(camera.fov - c.f) > 0.01) { camera.fov += (c.f - camera.fov) * k; camera.updateProjectionMatrix(); }
  }

  const opponentName = () => names[color === 'w' ? 'b' : 'w'] || 'L\'adversaire';
  let rematchPending = false;

  // Nouvelle partie demandée par ce joueur : l'adversaire doit confirmer (pas de déconnexion)
  function requestNewGame() {
    if (!active || rematchPending) return;
    rematchPending = true;
    sendMsg({ type: 'rematch-request' });
    showBanner(`Demande de nouvelle partie envoyée à ${opponentName()}…`);
  }

  // --- Messagerie ---------------------------------------------------------------------
  const chatPanel = $('chat'), chatList = $('chat-list'), chatBtn = $('btn-chat'), badge = $('chat-badge');
  let unread = 0;
  function setChatAvailable(on) {
    chatBtn.classList.toggle('hidden', !on);
    if (!on) { if (window.Overlays) Overlays.set('chat', false); else chatPanel.classList.add('hidden'); clearTimeout(reminder); }
  }
  function setUnread(n) {
    unread = n;
    badge.textContent = String(n);
    badge.classList.toggle('hidden', n === 0);
    if (n === 0) clearTimeout(reminder);
  }

  // Nouveau message, panneau fermé : le bouton grossit et rétrécit deux fois.
  // Tant que le message n'est pas lu, la notification revient toutes les 30 secondes.
  const REMIND_MS = 30000;
  let reminder = null;
  function pulse() {
    chatBtn.classList.remove('pulse');
    void chatBtn.offsetWidth; // relance l'animation même si elle vient de se jouer
    chatBtn.classList.add('pulse');
  }
  chatBtn.addEventListener('animationend', () => chatBtn.classList.remove('pulse'));
  function notify() {
    clearTimeout(reminder);
    if (!unread || !chatPanel.classList.contains('hidden') || chatBtn.classList.contains('hidden')) return;
    pulse();
    reminder = setTimeout(() => { if (unread) { Sound.play('select'); notify(); } }, REMIND_MS);
  }
  function addChat({ from, color: c, text, at }) {
    chatList.querySelector('.chat-empty')?.remove();
    const item = document.createElement('div');
    item.className = 'chat-msg' + (c === color ? ' mine' : '');
    const meta = document.createElement('span');
    meta.className = 'meta';
    meta.textContent = `${c === 'w' ? '♔' : '♚'} ${from} · ${new Date(at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;
    item.append(meta, document.createTextNode(text)); // texte brut : aucun HTML interprété
    chatList.appendChild(item);
    while (chatList.children.length > 200) chatList.firstChild.remove();
    chatList.scrollTop = chatList.scrollHeight;
    if (c !== color) {
      if (chatPanel.classList.contains('hidden')) { setUnread(unread + 1); notify(); }
      Sound.play('select');
    }
  }
  $('chat-form').addEventListener('submit', e => {
    e.preventDefault();
    const input = $('chat-input'), text = input.value.trim();
    if (!text || !active) return;
    sendMsg({ type: 'chat', text });
    input.value = '';
  });
  // Dès que la messagerie devient visible, le compteur de messages non lus revient à zéro
  new MutationObserver(() => {
    if (!chatPanel.classList.contains('hidden')) { setUnread(0); $('chat-input').focus(); }
  }).observe(chatPanel, { attributes: true, attributeFilter: ['class'] });

  function showBanner(text, warn = false) {
    banner.textContent = text;
    banner.classList.toggle('warn', warn);
    banner.classList.remove('hidden');
  }
  // Appelée par refresh() : rappelle qui joue contre qui et à qui c'est le tour
  let soloBanner = false; // bandeau « spectateurs » affiché pendant une partie solo
  function updateBanner() {
    if (watching && watchSolo) {
      const state = watchEnded || (mode === 'free' ? 'placement libre' : gameOver ? 'partie terminée'
        : `trait aux ${turn === 'w' ? 'Blancs' : 'Noirs'}`);
      return showBanner(`👁 Spectateur · partie solo · ${state}`, !!watchEnded);
    }
    if (!active && !watching) { // partie solo : quelqu'un la regarde depuis l'administration
      if (spectators) { showBanner(`👁 ${spectators} spectateur${spectators > 1 ? 's regardent' : ' regarde'} votre partie`); soloBanner = true; }
      else if (soloBanner) { banner.classList.add('hidden'); soloBanner = false; }
      return;
    }
    if (watching) {
      const state = watchEnded || (!watchStarted ? 'en attente du début de la partie'
        : gameOver ? 'partie terminée' : `au tour de ${names[turn]}`);
      return showBanner(`👁 Spectateur · ♔ ${names.w} contre ♚ ${names.b} · ${state}`, !!watchEnded);
    }
    if (!active || rematchPending) return;
    const me = color, opp = me === 'w' ? 'b' : 'w';
    const turnText = gameOver ? 'partie terminée' : (turn === me ? 'à vous de jouer' : `au tour de ${names[opp]}`);
    const seen = spectators ? ` · 👁 ${spectators} spectateur${spectators > 1 ? 's' : ''}` : '';
    showBanner(`En ligne · ♔ ${names.w} contre ♚ ${names.b} · ${turnText}${seen}`);
  }

  // --- Interface ---------------------------------------------------------------------------
  function startHost() {
    if (!served) {
      $('ol-error').textContent = 'Les parties en ligne demandent le serveur du jeu : lancez « npm start » puis ouvrez http://localhost:8080.';
      step('error');
      return;
    }
    leave();
    step('host-name');
  }

  $('ol-create').onclick = () => {
    quiet = false;
    const name = $('ol-host-name').value.trim() || 'Joueur 1';
    try { localStorage.setItem('chess3d:name', name); } catch { }
    connect(() => sendMsg({ type: 'create', name, clock: Clock.control })); // cadence choisie par le joueur 1
  };
  $('ol-host-name').addEventListener('keydown', e => { if (e.key === 'Enter') $('ol-create').click(); });
  $('ol-copy').onclick = async () => {
    const btn = $('ol-copy');
    try { await navigator.clipboard.writeText($('ol-url').value); btn.textContent = 'Copié ✓'; }
    catch { $('ol-url').select(); document.execCommand('copy'); btn.textContent = 'Copié ✓'; }
    setTimeout(() => { btn.textContent = 'Copier l\'URL'; }, 1500);
  };
  // Invité : le nom est transmis au joueur 1 à chaque touche
  $('ol-guest-input').addEventListener('input', () => sendMsg({ type: 'typing', name: $('ol-guest-input').value }));
  $('ol-guest-input').addEventListener('keydown', e => { if (e.key === 'Enter') $('ol-play').click(); });
  $('ol-play').onclick = () => {
    const name = $('ol-guest-input').value.trim() || 'Joueur 2';
    try { localStorage.setItem('chess3d:name', name); } catch { }
    sendMsg({ type: 'ready', name });
  };
  // (« window.history » : dans les scripts du jeu, « history » désigne l'historique des coups)
  $('ol-rematch-yes').onclick = () => { sendMsg({ type: 'rematch-answer', accept: true }); close(); };
  $('ol-rematch-no').onclick = () => { sendMsg({ type: 'rematch-answer', accept: false }); close(); };
  $('ol-solo').onclick = () => { leave(); close(); window.history.replaceState(null, '', location.pathname); };
  $('ol-close').onclick = () => { leave(); close(); };
  $('ol-left-solo').onclick = () => { leave(); close(); window.history.replaceState(null, '', location.pathname); };
  // Fermeture de la page : l'adversaire est prévenu tout de suite
  window.addEventListener('pagehide', () => sendMsg({ type: 'leave' }));

  // Nom déjà utilisé précédemment
  try { const n = localStorage.getItem('chess3d:name'); if (n) { $('ol-host-name').value = n; $('ol-guest-input').value = n; } } catch { }

  // Invité : on rejoint la salle dès le chargement (pour afficher qui invite)
  if (inviteRoom && served) connect(() => sendMsg({ type: 'join', room: inviteRoom }));

  function leave() {
    if (ws) { sendMsg({ type: 'leave' }); ws.close(); ws = null; }
    if (watching) clearCams();
    if (active || watching) Clock.setRemote(false);
    if (watching) window.history.replaceState(null, '', location.pathname); // retour au jeu normal
    active = false; color = null; pendingGuest = false; rematchPending = false;
    watching = false; watchStarted = false; watchEnded = ''; spectators = 0;
    watchSolo = false; inRoom = false; quiet = false; soloBanner = false;
    setTimeout(presence, 300); // de retour en solo : la partie est de nouveau suivie
    banner.classList.add('hidden');
    setChatAvailable(false);
  }

  return {
    startHost, leave, updateBanner, requestNewGame,
    // Jeu prêt (appelé par main.js) : un spectateur reçoit alors la partie, derrière l'écran d'accueil
    ready() {
      if (watchRoom && !inviteRoom && served) connect(() => sendMsg({ type: 'watch', room: watchRoom }));
      else presence(); // partie solo
    },
    soloChanged, frame,
    // Après l'écran d'accueil : l'invité saisit son nom
    afterSplash() {
      if ((inviteRoom || watchRoom) && !served) { $('ol-error').textContent = 'Ouvrez ce lien depuis le serveur du jeu (npm start).'; step('error'); }
      else if (inviteRoom) step('guest-name');
    },
    sendMove(from, to, promo) { if (active) sendMsg({ type: 'move', from, to, promo }); },
    sendClockControl(c) { if (active && color === 'w') sendMsg({ type: 'clock-control', id: c.id, base: c.base, inc: c.inc }); },
    sendClockStop() { if (active) sendMsg({ type: 'clock-stop' }); },
    sendStyle,
    sendSimulate(winner, reason) { if (active) sendMsg({ type: 'simulate', winner, reason }); },
    get active() { return active; },
    get watching() { return watching; },
    get isWhite() { return color === 'w'; },
    get served() { return served; },
    get invited() { return !!inviteRoom || !!watchRoom; },
    get watchLink() { return !!watchRoom && !inviteRoom; }, // ouvert depuis l'administration
  };
})();
