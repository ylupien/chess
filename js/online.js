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
const Online = (() => {
  const served = location.protocol === 'http:' || location.protocol === 'https:';
  const el = document.getElementById('online');
  const banner = document.getElementById('online-banner');
  const $ = id => document.getElementById(id);
  const params = new URLSearchParams(location.search);
  const inviteRoom = params.get('partie');

  let ws = null, color = null, active = false, names = { w: '', b: '' }, hostName = '';
  let pendingGuest = false; // invité : la salle est jointe, en attente du nom

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
    ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
    ws.addEventListener('open', onOpen, { once: true });
    ws.addEventListener('message', e => { try { onMessage(JSON.parse(e.data)); } catch (err) { console.warn(err); } });
    ws.addEventListener('close', () => {
      if (active) { active = false; Clock.setRemote(false); showBanner(`Connexion perdue avec ${names[color === 'w' ? 'b' : 'w'] || 'l\'adversaire'}.`, true); refresh(); }
    });
    ws.addEventListener('error', () => { if (!active) { $('ol-error').textContent = 'Impossible de joindre le serveur de jeu.'; step('error'); } });
  }
  const sendMsg = msg => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg)); };

  // --- Messages du serveur ----------------------------------------------------------------
  function onMessage(msg) {
    switch (msg.type) {
      case 'created': {
        color = 'w';
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
        if (isTheme(msg.theme) && msg.theme !== currentTheme) applyTheme(msg.theme, { remote: true });
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
  function sendStyle() { if (active) sendMsg({ type: 'style', theme: currentTheme, board: currentBoard }); }

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
  function updateBanner() {
    if (!active || rematchPending) return;
    const me = color, opp = me === 'w' ? 'b' : 'w';
    const turnText = gameOver ? 'partie terminée' : (turn === me ? 'à vous de jouer' : `au tour de ${names[opp]}`);
    showBanner(`En ligne · ♔ ${names.w} contre ♚ ${names.b} · ${turnText}`);
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
    if (active) Clock.setRemote(false);
    active = false; color = null; pendingGuest = false; rematchPending = false;
    banner.classList.add('hidden');
    setChatAvailable(false);
  }

  return {
    startHost, leave, updateBanner, requestNewGame,
    // Après l'écran d'accueil : l'invité saisit son nom
    afterSplash() {
      if (inviteRoom && !served) { $('ol-error').textContent = 'Ouvrez ce lien depuis le serveur du jeu (npm start).'; step('error'); }
      else if (inviteRoom) step('guest-name');
    },
    sendMove(from, to, promo) { if (active) sendMsg({ type: 'move', from, to, promo }); },
    sendClockControl(c) { if (active && color === 'w') sendMsg({ type: 'clock-control', id: c.id, base: c.base, inc: c.inc }); },
    sendClockStop() { if (active) sendMsg({ type: 'clock-stop' }); },
    sendStyle,
    sendSimulate(winner, reason) { if (active) sendMsg({ type: 'simulate', winner, reason }); },
    get active() { return active; },
    get isWhite() { return color === 'w'; },
    get served() { return served; },
    get invited() { return !!inviteRoom; },
  };
})();
