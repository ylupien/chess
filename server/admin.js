// Administration : page protégée par mot de passe (/admin) et flux en temps réel (/ws/admin).
//
//   ADMIN_PASSWORD   mot de passe (12 caractères au moins). Absent : l'administration est désactivée
//                    (toutes ses adresses répondent 404).
//
// Sécurité :
//   - comparaison du mot de passe en temps constant ; après 5 échecs, l'adresse est bloquée 15 min ;
//   - session aléatoire dans un cookie HttpOnly, SameSite=Strict (Secure en HTTPS), valable 12 h ;
//   - connexions et requêtes acceptées seulement depuis la même origine (Origin = Host) ;
//   - la page d'administration interdit tout script externe (Content-Security-Policy).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');

const SESSION_MS = 12 * 3600e3;
const MAX_FAILS = 5, LOCK_MS = 15 * 60e3;
const COOKIE = 'echiquier_admin';

function createAdmin({ ROOT, send, serveFile, clientIp, snapshot }) {
  const PASSWORD = process.env.ADMIN_PASSWORD || '';
  const enabled = PASSWORD.length >= 12;
  if (PASSWORD && !enabled) console.warn('ADMIN_PASSWORD trop court (12 caractères au moins) : administration désactivée.');
  const DIST = path.join(ROOT, 'admin', 'dist');
  // Version de la page compilée : une page ouverte d'une version précédente se recharge seule
  const build = () => { try { return String(fs.statSync(path.join(DIST, 'index.html')).mtimeMs); } catch { return ''; } };

  const sessions = new Map(); // jeton → expiration
  const fails = new Map();    // adresse → { count, until }
  const wss = new WebSocketServer({ noServer: true, maxPayload: 1024 });

  const CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
    + "font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'";

  const digest = s => crypto.createHash('sha256').update(String(s)).digest();
  const checkPassword = p => crypto.timingSafeEqual(digest(p), digest(PASSWORD));

  function cookies(req) {
    const out = {};
    for (const part of String(req.headers.cookie || '').split(';')) {
      const i = part.indexOf('=');
      if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
    }
    return out;
  }
  function tokenOf(req) {
    const t = cookies(req)[COOKIE];
    const exp = t && sessions.get(t);
    if (!exp) return null;
    if (exp < Date.now()) { sessions.delete(t); return null; }
    return t;
  }
  // Requête venant de la page elle-même (et non d'un autre site)
  function sameOrigin(req) {
    try { return new URL(req.headers.origin).host === req.headers.host; } catch { return false; }
  }
  const isHttps = req => req.socket.encrypted || req.headers['x-forwarded-proto'] === 'https'
    || /"scheme":"https"/.test(String(req.headers['cf-visitor'] || ''));

  function json(res, code, data, headers = {}) {
    send(res, code, JSON.stringify(data), { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  }
  function readJson(req, cb) {
    let size = 0, body = '';
    req.on('data', c => { size += c.length; if (size > 2048) req.destroy(); else body += c; });
    req.on('end', () => { try { cb(JSON.parse(body || '{}')); } catch { cb(null); } });
  }

  function login(req, res) {
    const ip = clientIp(req);
    const f = fails.get(ip);
    if (f && f.until > Date.now()) {
      return json(res, 429, { error: `Trop d'essais. Réessayez dans ${Math.ceil((f.until - Date.now()) / 60e3)} min.` });
    }
    readJson(req, body => {
      if (body && typeof body.password === 'string' && checkPassword(body.password)) {
        fails.delete(ip);
        const token = crypto.randomBytes(32).toString('base64url');
        sessions.set(token, Date.now() + SESSION_MS);
        const secure = isHttps(req) ? '; Secure' : '';
        return json(res, 200, { ok: true }, {
          'Set-Cookie': `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_MS / 1000}${secure}`,
        });
      }
      const fresh = f && Date.now() - f.at < LOCK_MS && !(f.until && f.until <= Date.now()); // essais récents
      const n = (fresh ? f.count : 0) + 1;
      fails.set(ip, { count: n, at: Date.now(), until: n >= MAX_FAILS ? Date.now() + LOCK_MS : 0 });
      console.warn(`Administration : mot de passe refusé (${ip}, essai ${n})`);
      // Petit délai : les essais en rafale sont ralentis
      setTimeout(() => json(res, 401, { error: n >= MAX_FAILS ? 'Trop d\'essais : accès bloqué 15 minutes.' : 'Mot de passe incorrect.' }), 600);
    });
  }

  function logout(req, res) {
    const t = tokenOf(req);
    if (t) {
      sessions.delete(t);
      for (const ws of wss.clients) if (ws.token === t) ws.close(4001, 'Déconnecté');
    }
    json(res, 200, { ok: true }, { 'Set-Cookie': `${COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0` });
  }

  // Requête HTTP : renvoie true si elle concerne l'administration (et y a été répondu)
  function handle(req, res) {
    let pathname;
    try { pathname = new URL(req.url, 'http://x').pathname; } catch { return false; }
    if (pathname !== '/admin' && !pathname.startsWith('/admin/')) return false;
    if (!enabled) { send(res, 404, 'Introuvable'); return true; }
    const headers = { 'Content-Security-Policy': CSP };

    if (pathname.startsWith('/admin/api/')) {
      const route = pathname.slice('/admin/api/'.length);
      if (req.method === 'GET' && route === 'session') json(res, 200, { admin: !!tokenOf(req) });
      else if (req.method === 'POST' && !sameOrigin(req)) json(res, 403, { error: 'Origine refusée.' });
      else if (req.method === 'POST' && route === 'login') login(req, res);
      else if (req.method === 'POST' && route === 'logout') logout(req, res);
      else json(res, 404, { error: 'Introuvable' });
      return true;
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') { send(res, 405, 'Méthode non autorisée'); return true; }
    if (pathname === '/admin') { res.writeHead(301, { Location: '/admin/' }); res.end(); return true; }

    // Page compilée par Vite (npm run build:admin) : admin/dist
    if (!fs.existsSync(path.join(DIST, 'index.html'))) {
      send(res, 503, 'Page d\'administration non compilée : lancez « npm run build:admin ».');
      return true;
    }
    const rel = pathname === '/admin/' ? 'index.html' : pathname.slice('/admin/'.length);
    const file = path.resolve(DIST, rel);
    if (!file.startsWith(DIST + path.sep)) { send(res, 404, 'Introuvable'); return true; }
    // Fichiers de assets/ : nom contenant leur empreinte, gardés un an
    // no-transform : Cloudflare n'injecte rien dans la page (ni script de statistiques)
    serveFile(req, res, file, rel.startsWith('assets/') ? 'public, max-age=31536000, immutable' : 'no-cache, no-transform', headers);
    return true;
  }

  // --- Temps réel ------------------------------------------------------------------------
  function upgrade(req, socket, head) {
    if (!enabled) return false;
    const token = tokenOf(req);
    if (!token || !sameOrigin(req)) {
      socket.end('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');
      return true;
    }
    wss.handleUpgrade(req, socket, head, ws => {
      ws.token = token;
      ws.alive = true;
      ws.on('pong', () => { ws.alive = true; });
      ws.on('message', () => { }); // la page ne fait qu'écouter
      ws.send(JSON.stringify({ ...snapshot(), build: build() }));
    });
    return true;
  }

  // Un changement (connexion, coup, nom…) : nouvel état envoyé, au plus toutes les 300 ms
  // (delay : attente plus longue pour les changements fréquents, comme la saisie d'un nom)
  let timer = null;
  function changed(delay = 300) {
    if (timer || !wss.clients.size) return;
    timer = setTimeout(broadcast, delay);
  }
  function broadcast() {
    clearTimeout(timer);
    timer = null;
    if (!wss.clients.size) return;
    const data = JSON.stringify({ ...snapshot(), build: build() });
    for (const ws of wss.clients) if (ws.readyState === ws.OPEN) ws.send(data);
  }
  // Toutes les 5 s : état à jour (durées, mémoire) ; sessions expirées fermées ; connexions mortes coupées
  setInterval(() => {
    const now = Date.now();
    for (const [t, exp] of sessions) if (exp < now) sessions.delete(t);
    for (const [ip, f] of fails) if (now - f.at > LOCK_MS && f.until < now) fails.delete(ip);
    for (const ws of wss.clients) {
      if (!sessions.has(ws.token)) { ws.close(4001, 'Session expirée'); continue; }
      if (!ws.alive) { ws.terminate(); continue; }
      ws.alive = false;
      ws.ping();
    }
    broadcast();
  }, 5000).unref();

  return {
    enabled, handle, upgrade, changed,
    isAdmin: req => enabled && !!tokenOf(req) && sameOrigin(req),
    close: () => { for (const ws of wss.clients) ws.close(1001, 'Serveur arrêté'); },
  };
}

module.exports = { createAdmin };
