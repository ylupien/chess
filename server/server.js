// Serveur du jeu : fichiers statiques + WebSocket pour les parties à deux joueurs.
//
//   npm install      (une seule fois)
//   npm start        → http://localhost:8080   (port modifiable : PORT=3000 npm start)
//
// Protocole WebSocket (messages JSON) :
//   client → serveur : create {name} · join {room} · typing {name} · ready {name} · move {from,to,promo}
//                      rematch-request · rematch-answer {accept} · chat {text} · leave
//                      clock-control {id, base, inc} · clock-stop · simulate {winner, reason}
//   serveur → client : created {room, color, lanUrl} · joined {color, hostName} · guest-connected
//                      guest-name {name} · start {white, black} · move {...} · opponent-left {name, started} · error {message}
//                      rematch-request {from} · rematch-answer {accept} · rematch-start · chat {from, color, text, at}
//                      clock {id, base, inc, rem {w, b}, running, started, flagged}
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const zlib = require('zlib');
const { WebSocketServer } = require('ws');

const PORT = Number(process.env.PORT) || 8080;
const HOST = process.env.HOST || '0.0.0.0';
const ROOT = path.resolve(__dirname, '..');
// SHOW_LAN=0 : n'annonce pas l'adresse du réseau local (inutile dans Docker ou sur le web)
const SHOW_LAN = process.env.SHOW_LAN !== '0';
// Adresse réelle du visiteur derrière un proxy, pour les limites par adresse :
//   TRUST_PROXY=cloudflare → en-tête CF-Connecting-IP (Cloudflare Tunnel)
//   TRUST_PROXY=1          → première adresse de X-Forwarded-For (Caddy, nginx…)
const TRUST_PROXY = process.env.TRUST_PROXY || '';

// Limites anti-abus, pour une exposition publique
const MAX_ROOMS = Number(process.env.MAX_ROOMS) || 500;      // salles ouvertes en même temps
const MAX_CONN_PER_IP = Number(process.env.MAX_CONN_PER_IP) || 10; // connexions WebSocket par adresse
const MSG_PER_SEC = 20;  // messages par seconde et par connexion (rafales permises jusqu'à 40)
const HEARTBEAT_MS = 30000; // les connexions mortes sont fermées

// --- Fichiers statiques -------------------------------------------------------------------
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.md': 'text/markdown; charset=utf-8',
};
// Seuls ces dossiers et fichiers du projet sont publiés (pas server/, node_modules/, .git/…)
const PUBLIC = ['index.html', 'js/', 'css/', 'sounds/', 'README.md'];

// Fichiers texte compressés une fois, gardés en mémoire tant qu'ils ne changent pas
const COMPRESSIBLE = /^(text\/|application\/(javascript|json))/;
const gzipCache = new Map(); // fichier → { key, buf }
function gzipped(file, st, cb) {
  const key = `${st.size}-${st.mtimeMs}`;
  const hit = gzipCache.get(file);
  if (hit && hit.key === key) return cb(null, hit.buf);
  fs.readFile(file, (err, data) => {
    if (err) return cb(err);
    zlib.gzip(data, { level: 9 }, (err, buf) => {
      if (err) return cb(err);
      gzipCache.set(file, { key, buf });
      cb(null, buf);
    });
  });
}

// Version du code du jeu : empreinte des tailles et dates des fichiers de js/ et css/.
// Inscrite dans index.html, elle est ajoutée (?v=…) à l'adresse de chaque script et feuille de style.
function assetVersion() {
  const h = crypto.createHash('sha1');
  for (const dir of ['js', 'css']) {
    for (const name of fs.readdirSync(path.join(ROOT, dir)).sort()) {
      const st = fs.statSync(path.join(ROOT, dir, name));
      h.update(`${dir}/${name}:${st.size}:${st.mtimeMs};`);
    }
  }
  return h.digest('hex').slice(0, 12);
}

// index.html avec la version du code inscrite ; jamais mis en cache sans vérification
function serveIndex(req, res) {
  fs.readFile(path.join(ROOT, 'index.html'), 'utf8', (err, html) => {
    if (err) return send(res, 500, 'Erreur');
    const body = Buffer.from(html.replace("'__ASSET_VERSION__'", `'${assetVersion()}'`));
    const etag = `"${crypto.createHash('sha1').update(body).digest('hex').slice(0, 16)}"`;
    const headers = { ...SECURITY_HEADERS, 'Content-Type': TYPES['.html'], 'Cache-Control': 'no-cache', 'ETag': etag, 'Vary': 'Accept-Encoding' };
    if ((req.headers['if-none-match'] || '').split(',').some(t => t.trim().replace(/^W\//, '') === etag)) {
      res.writeHead(304, headers);
      return res.end();
    }
    const gz = /\bgzip\b/.test(req.headers['accept-encoding'] || '');
    const out = gz ? zlib.gzipSync(body) : body;
    res.writeHead(200, { ...headers, ...(gz && { 'Content-Encoding': 'gzip' }), 'Content-Length': out.length });
    res.end(req.method === 'HEAD' ? undefined : out);
  });
}

function serveStatic(req, res) {
  let urlPath;
  try { urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { return send(res, 400, 'Requête invalide'); }
  if (urlPath === '/' || urlPath === '/index.html') return serveIndex(req, res);
  const rel = urlPath.replace(/^\/+/, '');
  const file = path.resolve(ROOT, rel);
  // Protection : le fichier doit rester dans le projet et dans un emplacement public
  if (!file.startsWith(ROOT + path.sep) || !PUBLIC.some(p => rel === p || (p.endsWith('/') && rel.startsWith(p)))) {
    return send(res, 404, 'Introuvable');
  }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) return send(res, 404, 'Introuvable');
    const type = TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream';
    const etag = `"${st.size.toString(36)}-${Math.floor(st.mtimeMs).toString(36)}"`;
    // Cache : un script ou une feuille de style demandé avec sa version (?v=…) ne change jamais
    // à cette adresse, il est gardé un an ; les sons, une semaine ; le reste est revérifié.
    const versioned = /^(js|css)\//.test(rel) && /[?&]v=/.test(req.url);
    const cache = versioned ? 'public, max-age=31536000, immutable'
      : rel.startsWith('sounds/') && !rel.endsWith('.html') ? 'public, max-age=604800' : 'no-cache';
    const headers = { ...SECURITY_HEADERS, 'Content-Type': type, 'Cache-Control': cache, 'ETag': etag, 'Last-Modified': st.mtime.toUTCString(), 'Accept-Ranges': 'bytes' };
    const inm = req.headers['if-none-match'];
    if (inm ? inm.split(',').some(t => t.trim().replace(/^W\//, '') === etag)
            : req.headers['if-modified-since'] && Math.floor(st.mtimeMs / 1000) <= Date.parse(req.headers['if-modified-since']) / 1000) {
      res.writeHead(304, headers);
      return res.end();
    }
    // Texte (HTML, JS, CSS…) compressé : moins de données à envoyer depuis la maison
    if (COMPRESSIBLE.test(type) && /\bgzip\b/.test(req.headers['accept-encoding'] || '') && !req.headers.range) {
      return gzipped(file, st, (err, buf) => {
        if (err) return send(res, 500, 'Erreur');
        res.writeHead(200, { ...headers, 'Content-Encoding': 'gzip', 'Vary': 'Accept-Encoding', 'Content-Length': buf.length });
        res.end(req.method === 'HEAD' ? undefined : buf);
      });
    }
    // Requêtes partielles (lecture et avance rapide des fichiers audio)
    const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
    if (range) {
      const start = range[1] ? Number(range[1]) : 0;
      const end = range[2] ? Math.min(Number(range[2]), st.size - 1) : st.size - 1;
      if (start > end || start >= st.size) return send(res, 416, 'Plage invalide', { 'Content-Range': `bytes */${st.size}` });
      res.writeHead(206, { ...headers, 'Content-Range': `bytes ${start}-${end}/${st.size}`, 'Content-Length': end - start + 1 });
      return fs.createReadStream(file, { start, end }).pipe(res);
    }
    res.writeHead(200, { ...headers, 'Content-Length': st.size });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(file).pipe(res);
  });
}

// En-têtes de sécurité envoyés avec chaque fichier
const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
};

function send(res, code, text, headers = {}) {
  res.writeHead(code, { ...SECURITY_HEADERS, 'Content-Type': 'text/plain; charset=utf-8', ...headers });
  res.end(text);
}

// Adresse du réseau local, pour que l'URL d'invitation fonctionne depuis un autre appareil
function lanAddress() {
  for (const list of Object.values(os.networkInterfaces())) {
    for (const a of list || []) if (a.family === 'IPv4' && !a.internal) return a.address;
  }
  return null;
}

const server = http.createServer({ requestTimeout: 30000, headersTimeout: 15000 }, (req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Méthode non autorisée');
  serveStatic(req, res);
});

// --- Salles de jeu à deux joueurs ---------------------------------------------------------
const rooms = new Map(); // id → { host, guest, started }
const newRoomId = () => crypto.randomBytes(5).toString('base64url'); // ex. « k3Xp9aQ »
const clean = name => String(name ?? '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, 24);
const emit = (ws, msg) => { if (ws && ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg)); };

// --- Pendule partagée : le serveur fait foi -------------------------------------------------
// Seule la pendule du camp au trait tourne ; elle démarre après le premier coup des Blancs.
// À chaque coup : temps réellement écoulé décompté, incrément Fischer ajouté, main à l'adversaire.
// La chute du drapeau est détectée ici, au même instant pour les deux joueurs.
function newClock(c = {}) {
  const base = Math.max(0, Math.min(3 * 3600e3, Number(c.base) || 0));
  const inc = Math.max(0, Math.min(60e3, Number(c.inc) || 0));
  return { id: String(c.id || 'none').slice(0, 12), base, inc, rem: { w: base, b: base }, running: null, started: false, flagged: null, since: 0, timer: null };
}
function clockState(clk) {
  const rem = { ...clk.rem };
  if (clk.running) rem[clk.running] = Math.max(0, rem[clk.running] - (Date.now() - clk.since));
  return { type: 'clock', id: clk.id, base: clk.base, inc: clk.inc, rem, running: clk.running, started: clk.started, flagged: clk.flagged };
}
function broadcastClock(room) { const st = clockState(room.clock); emit(room.host, st); emit(room.guest, st); }
function armFlag(room) {
  const clk = room.clock;
  clearTimeout(clk.timer);
  if (!clk.running) return;
  clk.timer = setTimeout(() => {
    clk.rem[clk.running] = 0;
    clk.flagged = clk.running;
    clk.running = null;
    broadcastClock(room);
  }, clk.rem[clk.running]);
}
function clockMove(room, mover) {
  const clk = room.clock;
  if (clk.id === 'none' || clk.flagged) return;
  const now = Date.now();
  if (clk.running === mover) clk.rem[mover] = Math.max(0, clk.rem[mover] - (now - clk.since));
  if (clk.started || mover === 'w') clk.rem[mover] += clk.inc;
  clk.started = true;
  clk.running = mover === 'w' ? 'b' : 'w';
  clk.since = now;
  armFlag(room);
  broadcastClock(room);
}
function resetClock(room, c = room.clock) {
  clearTimeout(room.clock?.timer);
  room.clock = newClock(c);
  broadcastClock(room);
}

function clientIp(req) {
  const h = TRUST_PROXY === 'cloudflare' ? req.headers['cf-connecting-ip']
    : TRUST_PROXY === '1' ? String(req.headers['x-forwarded-for'] || '').split(',')[0] : '';
  return String(h || '').trim().slice(0, 64) || req.socket.remoteAddress;
}
const connPerIp = new Map(); // adresse → nombre de connexions ouvertes

const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 8192 });

wss.on('connection', (ws, req) => {
  ws.room = null;
  ws.role = null; // 'host' (Blancs) | 'guest' (Noirs)
  const ip = clientIp(req);
  const count = (connPerIp.get(ip) || 0) + 1;
  if (count > MAX_CONN_PER_IP) return ws.close(1008, 'Trop de connexions');
  connPerIp.set(ip, count);
  ws.on('close', () => { const n = connPerIp.get(ip) - 1; if (n > 0) connPerIp.set(ip, n); else connPerIp.delete(ip); });

  ws.alive = true;
  ws.on('pong', () => { ws.alive = true; });
  let tokens = 2 * MSG_PER_SEC, refill = Date.now();

  ws.on('message', raw => {
    // Limite de débit : au-delà, les messages sont ignorés ; un flot continu ferme la connexion
    const now = Date.now();
    tokens = Math.min(2 * MSG_PER_SEC, tokens + (now - refill) * MSG_PER_SEC / 1000);
    refill = now;
    if (tokens < 1) { if (tokens < -10 * MSG_PER_SEC) ws.terminate(); tokens -= 1; return; }
    tokens -= 1;
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    if (!msg || typeof msg !== 'object') return;
    const room = ws.room && rooms.get(ws.room);
    const other = room && (ws.role === 'host' ? room.guest : room.host);

    switch (msg.type) {
      case 'create': {
        if (ws.room) break; // une seule partie par connexion
        if (rooms.size >= MAX_ROOMS) return emit(ws, { type: 'error', message: 'Le serveur est complet, réessayez plus tard.' });
        let id;
        do { id = newRoomId(); } while (rooms.has(id));
        rooms.set(id, { host: ws, guest: null, hostName: clean(msg.name) || 'Joueur 1', guestName: '', started: false, clock: newClock(msg.clock) });
        ws.room = id; ws.role = 'host';
        const lan = SHOW_LAN && lanAddress();
        emit(ws, { type: 'created', room: id, color: 'w', lanUrl: lan ? `http://${lan}:${PORT}/?partie=${id}` : null });
        break;
      }
      case 'join': {
        if (ws.room) break; // une seule partie par connexion
        const r = rooms.get(String(msg.room));
        if (!r) return emit(ws, { type: 'error', message: 'Cette partie n\'existe pas ou est terminée.' });
        if (r.guest && r.guest !== ws) return emit(ws, { type: 'error', message: 'Cette partie a déjà deux joueurs.' });
        r.guest = ws;
        ws.room = String(msg.room); ws.role = 'guest';
        emit(ws, { type: 'joined', color: 'b', hostName: r.hostName });
        emit(r.host, { type: 'guest-connected' });
        break;
      }
      case 'typing': // le nom du second joueur, à chaque touche
        if (room && ws.role === 'guest' && !room.started) {
          room.guestName = clean(msg.name);
          emit(room.host, { type: 'guest-name', name: room.guestName });
        }
        break;
      case 'ready':
        if (room && ws.role === 'guest' && room.host && !room.started) {
          room.guestName = clean(msg.name) || 'Joueur 2';
          room.started = true;
          const start = { type: 'start', white: room.hostName, black: room.guestName };
          emit(room.host, start);
          emit(room.guest, start);
          resetClock(room);
        }
        break;
      case 'rematch-request': // nouvelle partie : l'adversaire doit confirmer
        if (room && room.started && other) emit(other, { type: 'rematch-request', from: ws.role === 'host' ? room.hostName : room.guestName });
        break;
      case 'rematch-answer':
        if (room && room.started && other) {
          if (msg.accept) { emit(ws, { type: 'rematch-start' }); emit(other, { type: 'rematch-start' }); resetClock(room); }
          else emit(other, { type: 'rematch-answer', accept: false });
        }
        break;
      case 'chat': { // messagerie entre les deux joueurs
        const text = String(msg.text ?? '').replace(/[\u0000-\u0008\u000b-\u001f]/g, '').trim().slice(0, 300);
        if (!room || !room.started || !text) break;
        const out = { type: 'chat', from: ws.role === 'host' ? room.hostName : room.guestName, color: ws.role === 'host' ? 'w' : 'b', text, at: Date.now() };
        emit(room.host, out);
        emit(room.guest, out);
        break;
      }
      case 'simulate': { // panneau Debug : la fin de partie simulée s'applique aux deux joueurs
        const REASONS = ['mate', 'time', 'resign', 'stalemate', 'time-draw', 'material'];
        if (!room || !room.started || !REASONS.includes(msg.reason)) break;
        const out = { type: 'simulate', winner: msg.winner === 'w' || msg.winner === 'b' ? msg.winner : null, reason: msg.reason };
        emit(room.host, out);
        emit(room.guest, out);
        break;
      }
      case 'style': // pièces et plateau choisis par un joueur : appliqués chez l'autre
        if (room && room.started && other) emit(other, { type: 'style', theme: String(msg.theme ?? '').slice(0, 24), board: String(msg.board ?? '').slice(0, 24) });
        break;
      case 'clock-control': // le joueur 1 change la cadence : les deux pendules repartent de zéro
        if (room && ws.role === 'host') resetClock(room, msg);
        break;
      case 'clock-stop': // fin de partie (mat, pat…) : la pendule s'arrête
        if (room && room.started && room.clock.running) {
          const clk = room.clock;
          clk.rem[clk.running] = Math.max(0, clk.rem[clk.running] - (Date.now() - clk.since));
          clk.running = null;
          clearTimeout(clk.timer);
          broadcastClock(room);
        }
        break;
      case 'leave': // le joueur ferme la page ou quitte la partie
        depart(ws);
        break;
      case 'move': // relayé tel quel à l'adversaire (chaque client vérifie la légalité)
        if (room && room.started && other) {
          emit(other, { type: 'move', from: Number(msg.from), to: Number(msg.to), promo: msg.promo ? String(msg.promo).slice(0, 1) : null });
          clockMove(room, ws.role === 'host' ? 'w' : 'b');
        }
        break;
    }
  });

  ws.on('close', () => depart(ws));
});

// Battement de cœur : une connexion qui ne répond plus est fermée (et l'adversaire prévenu)
setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.alive) { ws.terminate(); continue; }
    ws.alive = false;
    ws.ping();
  }
}, HEARTBEAT_MS).unref();

// Départ d'un joueur (message « leave » à la fermeture de la page, ou connexion perdue) :
// l'autre joueur est prévenu immédiatement, une seule fois.
function depart(ws) {
  if (ws.left) return;
  ws.left = true;
  const room = ws.room && rooms.get(ws.room);
  if (!room) return;
  const other = ws.role === 'host' ? room.guest : room.host;
  const name = ws.role === 'host' ? room.hostName : (room.guestName || 'Le second joueur');
  emit(other, { type: 'opponent-left', name, started: room.started });
  clearTimeout(room.clock?.timer);
  if (ws.role === 'host') room.host = null; else room.guest = null;
  // Partie vide, ou joueur 1 parti avant le début : la salle est fermée
  if ((!room.host && !room.guest) || (ws.role === 'host' && !room.started)) rooms.delete(ws.room);
}

server.listen(PORT, HOST, () => {
  const lan = SHOW_LAN && lanAddress();
  console.log(`Échiquier 3D prêt : http://localhost:${PORT}`);
  if (lan) console.log(`Sur le réseau local : http://${lan}:${PORT}`);
});

// Arrêt propre (docker stop) : les joueurs sont prévenus par la fermeture des connexions
for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, () => {
    for (const ws of wss.clients) ws.close(1001, 'Serveur arrêté');
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000).unref();
  });
}
