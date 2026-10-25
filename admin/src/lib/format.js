// Mise en forme des données de l'administration.

// Durée lisible : « 42 s », « 5 min », « 2 h 07 », « 3 j 4 h »
export function duration(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} h ${String(m % 60).padStart(2, '0')}`;
  return `${Math.floor(h / 24)} j ${h % 24} h`;
}

// Pendule : « 4:59 », « 1:02:30 », « 0:08.4 » sous 10 secondes
export function clock(ms) {
  ms = Math.max(0, ms);
  if (ms < 10000) return `0:0${(ms / 1000).toFixed(1)}`;
  const s = Math.ceil(ms / 1000), h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60;
  const ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

export const time = t => new Date(t).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

export const day = t => new Date(t).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
export const count = n => (n ?? 0).toLocaleString('fr-FR');

export function bytes(n) {
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(0)} Ko`;
  return `${(n / 1024 ** 2).toFixed(1)} Mo`;
}

// Navigateur et système, d'après l'agent utilisateur
export function browser(ua = '') {
  const b = /HeadlessChrome/.test(ua) ? 'Chrome (automatisé)' : /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera'
    : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : '';
  const os = /Windows/.test(ua) ? 'Windows' : /iPhone|iPad/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android'
    : /Mac OS X/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : '';
  return [b, os].filter(Boolean).join(' · ') || 'Inconnu';
}

export const ROOM_STATUS = {
  playing: { label: 'En cours', tone: 'ok' },
  joining: { label: 'Invité connecté', tone: 'gold' },
  waiting: { label: 'En attente', tone: 'warn' },
  abandoned: { label: 'Abandonnée', tone: 'danger' },
  solo: { label: 'Solo', tone: 'gold' },
  free: { label: 'Solo · placement libre', tone: 'muted' },
};
export const ROLE = {
  host: { label: 'Joueur 1 · Blancs', tone: 'gold' },
  guest: { label: 'Joueur 2 · Noirs', tone: 'gold' },
  spectator: { label: 'Spectateur', tone: 'muted' },
  solo: { label: 'Solo', tone: 'ok' },
  lobby: { label: 'Accueil', tone: 'muted' },
};
export const THEMES = { classic: 'Classique', medieval: 'Médiéval', dragons: 'Dragons', crystal: 'Cristal', farm: 'La Ferme des animaux' };
export const BOARDS = { wood: 'Bois clair', glass: 'Verre noir' };

// Position reconstituée à partir des coups (roque, prise en passant et promotion compris).
// Les coups ont déjà été validés par les joueurs : on les applique simplement.
// Cases : 0 = a1 … 63 = h8. Pièce : { t: 'p'|'n'|'b'|'r'|'q'|'k', w: blanc ? }
export function positionFrom(line = []) {
  const b = Array(64).fill(null);
  const BACK = 'rnbqkbnr';
  for (let f = 0; f < 8; f++) {
    b[f] = { t: BACK[f], w: true }; b[8 + f] = { t: 'p', w: true };
    b[48 + f] = { t: 'p', w: false }; b[56 + f] = { t: BACK[f], w: false };
  }
  for (const [from, to, promo] of line) {
    const p = b[from];
    if (!p) continue;
    const df = (to & 7) - (from & 7);
    if (p.t === 'k' && Math.abs(df) === 2) { // roque : la tour saute par-dessus le roi
      const r = from & ~7, [rf, rt] = df > 0 ? [7, 5] : [0, 3];
      b[r + rt] = b[r + rf]; b[r + rf] = null;
    }
    if (p.t === 'p' && df !== 0 && !b[to]) b[(from & ~7) + (to & 7)] = null; // prise en passant
    const last = p.t === 'p' && (to >> 3 === 7 || to >> 3 === 0);
    b[to] = last ? { t: promo || 'q', w: p.w } : p;
    b[from] = null;
  }
  return b;
}
