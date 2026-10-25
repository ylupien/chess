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
  // Cache : un script ou une feuille de style demandé avec sa version (?v=…) ne change jamais
  // à cette adresse, il est gardé un an ; les sons, une semaine ; le reste est revérifié.
  const versioned = /^(js|css)\//.test(rel) && /[?&]v=/.test(req.url);
  const cache = versioned ? 'public, max-age=31536000, immutable'
    : rel.startsWith('sounds/') && !rel.endsWith('.html') ? 'public, max-age=604800' : 'no-cache';
  serveFile(req, res, file, cache);
}

// Envoie un fichier : validation du cache (304), compression du texte, requêtes partielles
function serveFile(req, res, file, cache, extra = {}) {
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) return send(res, 404, 'Introuvable');
    const type = TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream';
    const etag = `"${st.size.toString(36)}-${Math.floor(st.mtimeMs).toString(36)}"`;
    const headers = { ...SECURITY_HEADERS, 'Content-Type': type, 'Cache-Control': cache, 'ETag': etag, 'Last-Modified': st.mtime.toUTCString(), 'Accept-Ranges': 'bytes', ...extra };
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
  if (admin.handle(req, res)) return; // page et API d'administration (/admin)
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Méthode non autorisée');
  serveStatic(req, res);
});

// --- Salles de jeu à deux joueurs ---------------------------------------------------------
// id → { host, guest, hostName, guestName, started, clock, moves, style, spectators, createdAt, startedAt }
const rooms = new Map();
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
function broadcastClock(room) { const st = clockState(room.clock); emit(room.host, st); emit(room.guest, st); toWatchers(room, st); }

// --- Spectateurs (administration) ----------------------------------------------------------
// Un administrateur connecté peut assister à une partie : il reçoit la position (liste des coups),
// puis chaque coup, la pendule et les pièces choisies. Il ne peut rien envoyer à la partie.
// Les joueurs voient combien de spectateurs regardent.
function toWatchers(room, msg) { for (const s of room.spectators) emit(s, msg); }
function announceWatchers(room) {
  const out = { type: 'spectators', count: room.spectators.size };
  emit(room.host, out); emit(room.guest, out);
}
const sqName = s => 'abcdefgh'[s & 7] + ((s >> 3) + 1);

// --- Parties solo -------------------------------------------------------------------------
// Un joueur seul (jeu servi par ce serveur) envoie l'état de sa partie à chaque changement :
// l'administration la voit et peut la regarder. Rien n'est renvoyé au joueur, à part le nombre
// de spectateurs. L'état est vérifié et réduit à l'essentiel.
const int = (v, min, max) => Number.isInteger(v) && v >= min && v <= max ? v : null;
const str = (v, n) => typeof v === 'string' ? v.replace(/[\u0000-\u001f]/g, '').slice(0, n) : '';
function cleanSolo(st) {
  if (!st || typeof st !== 'object' || !Array.isArray(st.pieces) || st.pieces.length !== 32) return null;
  const pieces = [];
  for (const p of st.pieces) {
    if (!p || !'pnbrqk'.includes(p.type) || String(p.type).length !== 1 || int(p.sq, -1, 63) === null) return null;
    pieces.push({ type: p.type, sq: p.sq, moved: !!p.moved, capturedAt: int(p.capturedAt, 0, 1e6) ?? 0 });
  }
  const lm = st.lastMove && int(st.lastMove.from, 0, 63) !== null && int(st.lastMove.to, 0, 63) !== null
    ? { from: st.lastMove.from, to: st.lastMove.to } : null;
  const log = (Array.isArray(st.log) ? st.log.slice(-50) : []).map(e => ({
    kind: e?.kind === 'note' ? 'note' : 'move', white: !!e?.white, num: int(e?.num, 0, 1e5) ?? 0,
    san: str(e?.san, 16), name: str(e?.name, 90), text: str(e?.text, 120), free: !!e?.free,
  }));
  return {
    pieces, turn: st.turn === 'b' ? 'b' : 'w', epSquare: int(st.epSquare, -1, 63) ?? -1, lastMove: lm,
    moveNumber: int(st.moveNumber, 1, 1e5) ?? 1, log, plies: int(st.plies, 0, 1e5) ?? 0,
    mode: st.mode === 'free' ? 'free' : 'rules', theme: str(st.theme, 24), board: str(st.board, 24),
  };
}
// Position en 64 caractères (a1 … h8) : majuscules = Blancs, « . » = case vide.
// Les pièces sont dans l'ordre de création du jeu : par colonne, 2 blanches puis 2 noires.
function soloPosition(st) {
  const out = Array(64).fill('.');
  st.pieces.forEach((p, i) => { if (p.sq >= 0) out[p.sq] = i % 4 < 2 ? p.type.toUpperCase() : p.type; });
  return out.join('');
}
const soloById = id => [...wss.clients].find(ws => ws.solo && 's' + ws.id === id);
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
const stats = { bootAt: Date.now(), connections: 0, gamesStarted: 0, peak: 0 };
// Totaux depuis la mise en service, conservés dans DATA_DIR/counters.json entre deux redémarrages
const counters = require('./counters').createCounters(process.env.DATA_DIR || path.join(ROOT, 'data'));
// Session = une page du jeu ouverte. Ses reconnexions (même identifiant ?p=) ne comptent pas.
const pagesSeen = new Map(); // identifiant de page → dernière connexion
const PAGE_TTL = 12 * 3600e3, MAX_PAGES = 20000;
function countSession(req) {
  let id = '';
  try { id = new URL(req.url, 'http://x').searchParams.get('p') || ''; } catch { }
  id = /^[a-z0-9]{6,32}$/.test(id) ? id : '';
  const now = Date.now();
  if (id && pagesSeen.has(id)) { pagesSeen.delete(id); pagesSeen.set(id, now); return; }
  counters.add('sessions');
  if (!id) return;
  pagesSeen.set(id, now);
  for (const [k, at] of pagesSeen) { // les plus anciennes d'abord
    if (pagesSeen.size <= MAX_PAGES && now - at < PAGE_TTL) break;
    pagesSeen.delete(k);
  }
}

// --- Administration : état en temps réel des connexions et des parties ----------------------
function adminSnapshot() {
  const now = Date.now();
  const roleOf = ws => ws.watching ? 'spectator' : ws.role || (ws.solo ? 'solo' : 'lobby');
  const nameOf = ws => {
    const r = ws.room && rooms.get(ws.room);
    return !r ? '' : ws.role === 'host' ? r.hostName : r.guestName;
  };
  return {
    type: 'snapshot', now,
    server: { bootAt: stats.bootAt, connectionsTotal: stats.connections, gamesStarted: stats.gamesStarted, peak: stats.peak,
      totals: counters.data,
      rss: process.memoryUsage().rss, node: process.version, maxRooms: MAX_ROOMS },
    rooms: [...rooms].map(([id, r]) => {
      const last = r.moves.at(-1);
      return {
        id, white: r.hostName, black: r.guestName,
        status: !r.started ? (r.guest ? 'joining' : 'waiting') : r.host && r.guest ? 'playing' : 'abandoned',
        whiteOnline: !!r.host, blackOnline: !!r.guest,
        createdAt: r.createdAt, startedAt: r.startedAt, lastMoveAt: r.lastMoveAt || 0, games: r.games,
        moves: r.moves.length, turn: r.moves.length % 2 ? 'b' : 'w',
        last: last ? sqName(last.from) + sqName(last.to) + (last.promo || '') : '',
        theme: r.style?.theme || '', board: r.style?.board || '',
        clock: clockState(r.clock), spectators: r.spectators.size,
        line: r.moves.map(m => m.promo ? [m.from, m.to, m.promo] : [m.from, m.to]), // mini-échiquier
      };
    }).concat([...wss.clients].filter(ws => ws.solo).map(ws => {
      const st = ws.solo, lm = st.lastMove;
      return {
        id: 's' + ws.id, solo: true, white: 'Partie solo', black: '', status: st.mode === 'free' ? 'free' : 'solo',
        whiteOnline: true, blackOnline: true, createdAt: ws.soloSince, startedAt: ws.soloSince, lastMoveAt: ws.soloAt, games: 1,
        moves: st.plies, turn: st.turn, last: lm ? sqName(lm.from) + sqName(lm.to) : '',
        theme: st.theme, board: st.board, clock: { id: 'none', rem: {} }, spectators: ws.soloWatchers?.size || 0,
        position: soloPosition(st), lastSq: lm ? [lm.from, lm.to] : null, ip: ws.ip,
      };
    })),
    connections: [...wss.clients].map(ws => ({
      id: ws.id, ip: ws.ip, since: ws.since, ua: ws.ua, msgs: ws.msgs, admin: ws.admin,
      role: roleOf(ws), room: ws.room || ws.watching || '', name: nameOf(ws),
    })),
  };
}
const admin = require('./admin').createAdmin({ ROOT, send, serveFile, clientIp, snapshot: adminSnapshot });

// Connexions WebSocket : /ws pour le jeu, /ws/admin pour l'administration (session requise)
const wss = new WebSocketServer({ noServer: true, maxPayload: 16384 }); // 16 Ko : état d'une partie solo
server.on('upgrade', (req, socket, head) => {
  let pathname = '';
  try { pathname = new URL(req.url, 'http://x').pathname; } catch { }
  if (pathname === '/ws') return wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws, req));
  if (pathname === '/ws/admin' && admin.upgrade(req, socket, head)) return;
  socket.end('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n');
});

wss.on('connection', (ws, req) => {
  ws.room = null;
  ws.role = null; // 'host' (Blancs) | 'guest' (Noirs)
  ws.watching = null; // spectateur : salle regardée
  const ip = clientIp(req);
  // Fiche visible dans l'administration
  ws.id = ++stats.connections;
  ws.ip = ip;
  ws.since = Date.now();
  ws.ua = String(req.headers['user-agent'] || '').slice(0, 300);
  ws.msgs = 0;
  ws.admin = admin.isAdmin(req); // session d'administration ouverte (mode spectateur permis)
  const count = (connPerIp.get(ip) || 0) + 1;
  if (count > MAX_CONN_PER_IP) return ws.close(1008, 'Trop de connexions');
  connPerIp.set(ip, count);
  stats.peak = Math.max(stats.peak, wss.clients.size);
  counters.max('peak', wss.clients.size);
  countSession(req);
  admin.changed();
  ws.on('close', () => { const n = connPerIp.get(ip) - 1; if (n > 0) connPerIp.set(ip, n); else connPerIp.delete(ip); admin.changed(); });

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
    ws.msgs++;
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    if (!msg || typeof msg !== 'object') return;
    if (msg.type === 'typing') admin.changed(1000); else if (msg.type !== 'cam') admin.changed();
    const room = ws.room && rooms.get(ws.room);
    const other = room && (ws.role === 'host' ? room.guest : room.host);

    switch (msg.type) {
      case 'create': {
        if (ws.room || ws.watching) break; // une seule partie par connexion
        endSolo(ws); // la partie solo laisse place à la partie en ligne
        if (rooms.size >= MAX_ROOMS) return emit(ws, { type: 'error', message: 'Le serveur est complet, réessayez plus tard.' });
        let id;
        do { id = newRoomId(); } while (rooms.has(id));
        rooms.set(id, {
          host: ws, guest: null, hostName: clean(msg.name) || 'Joueur 1', guestName: '', started: false, clock: newClock(msg.clock),
          moves: [], style: null, spectators: new Set(), createdAt: Date.now(), startedAt: 0, games: 0,
        });
        ws.room = id; ws.role = 'host';
        const lan = SHOW_LAN && lanAddress();
        emit(ws, { type: 'created', room: id, color: 'w', lanUrl: lan ? `http://${lan}:${PORT}/?partie=${id}` : null });
        break;
      }
      case 'join': {
        if (ws.room || ws.watching) break; // une seule partie par connexion
        const r = rooms.get(String(msg.room));
        if (!r) return emit(ws, { type: 'error', message: 'Cette partie n\'existe pas ou est terminée.' });
        if (r.guest && r.guest !== ws) return emit(ws, { type: 'error', message: 'Cette partie a déjà deux joueurs.' });
        endSolo(ws);
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
          room.startedAt = Date.now();
          room.moves = [];
          room.games = 1;
          stats.gamesStarted++; counters.add('gamesStarted');
          const start = { type: 'start', white: room.hostName, black: room.guestName };
          emit(room.host, start);
          emit(room.guest, start);
          toWatchers(room, { type: 'watch-start', white: room.hostName, black: room.guestName });
          resetClock(room);
          announceWatchers(room);
        }
        break;
      case 'rematch-request': // nouvelle partie : l'adversaire doit confirmer
        if (room && room.started && other) emit(other, { type: 'rematch-request', from: ws.role === 'host' ? room.hostName : room.guestName });
        break;
      case 'rematch-answer':
        if (room && room.started && other) {
          if (msg.accept) {
            room.moves = [];
            room.games++;
            stats.gamesStarted++; counters.add('gamesStarted'); counters.add('gamesStarted');
            emit(ws, { type: 'rematch-start' }); emit(other, { type: 'rematch-start' }); toWatchers(room, { type: 'rematch-start' });
            resetClock(room);
          }
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
        toWatchers(room, out);
        break;
      }
      case 'style': // pièces et plateau choisis par un joueur : appliqués chez l'autre (et les spectateurs)
        if (room && room.started && other) {
          room.style = { type: 'style', theme: String(msg.theme ?? '').slice(0, 24), board: String(msg.board ?? '').slice(0, 24) };
          emit(other, room.style);
          toWatchers(room, room.style);
        }
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
          const from = Number(msg.from), to = Number(msg.to);
          if (!(from >= 0 && from < 64 && to >= 0 && to < 64) || room.moves.length >= 2000) break;
          const mv = { type: 'move', from, to, promo: msg.promo ? String(msg.promo).slice(0, 1) : null };
          room.moves.push(mv);
          room.lastMoveAt = Date.now();
          emit(other, mv);
          toWatchers(room, mv);
          clockMove(room, ws.role === 'host' ? 'w' : 'b');
        }
        break;
      case 'cam': { // caméra d'un joueur regardé : transmise aux spectateurs (envoyée seulement s'il y en a)
        const vec = a => Array.isArray(a) && a.length === 3 && a.every(n => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) < 200);
        if (!vec(msg.p) || !vec(msg.t)) break;
        const cam = { type: 'cam', p: msg.p, t: msg.t, f: Math.min(120, Math.max(10, Number(msg.f) || 40)) };
        if (room && room.started) {
          cam.color = ws.role === 'host' ? 'w' : 'b';
          (room.cams ||= {})[cam.color] = cam; // pour un spectateur qui arrive
          toWatchers(room, cam);
        } else if (ws.solo) {
          cam.color = 'solo';
          ws.soloCam = cam;
          for (const s of ws.soloWatchers || []) emit(s, cam);
        }
        break;
      }
      case 'solo': { // état d'une partie solo (null : retour à l'accueil)
        if (ws.room || ws.watching) break;
        const st = msg.state === null ? null : cleanSolo(msg.state);
        if (msg.state !== null && !st) break;
        if (st && !ws.solo) { ws.soloSince = Date.now(); counters.add('soloGames'); }
        ws.solo = st;
        ws.soloAt = Date.now();
        const out = st ? { type: 'solo', state: st } : { type: 'room-closed' };
        for (const s of ws.soloWatchers || []) emit(s, out);
        break;
      }
      case 'watch': { // administrateur : assister à une partie
        if (ws.room || ws.watching) break;
        if (!ws.admin) return emit(ws, { type: 'error', message: 'Le mode spectateur est réservé à l\'administration.' });
        const id = String(msg.room ?? '');
        const solo = id.startsWith('s') && soloById(id);
        if (solo) { // partie solo
          (solo.soloWatchers ||= new Set()).add(ws);
          ws.watching = id;
          emit(ws, { type: 'watching', room: id, solo: true, white: 'Partie solo', black: '', started: true, moves: [], state: solo.solo });
          if (solo.soloCam) emit(ws, solo.soloCam);
          emit(solo, { type: 'spectators', count: solo.soloWatchers.size });
          break;
        }
        const r = rooms.get(id);
        if (!r) return emit(ws, { type: 'error', message: 'Cette partie n\'existe plus.' });
        r.spectators.add(ws);
        ws.watching = id;
        emit(ws, { type: 'watching', room: id, white: r.hostName, black: r.guestName, started: r.started, moves: r.moves, style: r.style });
        emit(ws, clockState(r.clock));
        for (const cam of Object.values(r.cams || {})) emit(ws, cam);
        announceWatchers(r);
        break;
      }
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

// Fin d'une partie solo (départ, ou partie en ligne qui commence) : ses spectateurs sont prévenus
function endSolo(ws) {
  if (!ws.solo && !ws.soloWatchers?.size) return;
  for (const s of ws.soloWatchers || []) emit(s, { type: 'room-closed' });
  ws.soloWatchers?.clear();
  ws.solo = null;
}

// Départ d'un joueur (message « leave » à la fermeture de la page, ou connexion perdue) :
// l'autre joueur est prévenu immédiatement, une seule fois.
function depart(ws) {
  if (ws.left) return;
  ws.left = true;
  admin.changed();
  if (ws.watching) { // spectateur
    const r = rooms.get(ws.watching);
    if (r) { r.spectators.delete(ws); announceWatchers(r); }
    const solo = soloById(ws.watching);
    if (solo) { solo.soloWatchers.delete(ws); emit(solo, { type: 'spectators', count: solo.soloWatchers.size }); }
    return;
  }
  endSolo(ws);
  const room = ws.room && rooms.get(ws.room);
  if (!room) return;
  const other = ws.role === 'host' ? room.guest : room.host;
  const name = ws.role === 'host' ? room.hostName : (room.guestName || 'Le second joueur');
  emit(other, { type: 'opponent-left', name, started: room.started });
  clearTimeout(room.clock?.timer);
  if (ws.role === 'host') room.host = null; else room.guest = null;
  toWatchers(room, { type: 'player-left', name, color: ws.role === 'host' ? 'w' : 'b' });
  // Partie vide, ou joueur 1 parti avant le début : la salle est fermée
  if ((!room.host && !room.guest) || (ws.role === 'host' && !room.started)) {
    toWatchers(room, { type: 'room-closed' });
    rooms.delete(ws.room);
  }
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
    admin.close();
    counters.flush();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000).unref();
  });
}
