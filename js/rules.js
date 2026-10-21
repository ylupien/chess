// Moteur de règles des échecs (indépendant du rendu 3D).
// Script classique (chargé par index.html dans l'ordre). Dépend de : aucune.
// =====================================================================
// Règles des échecs
// Une position est un tableau de 64 cases : null ou { t, w, moved }
//   t : 'p' 'n' 'b' 'r' 'q' 'k'   w : true = blanc
// Case s = rang * 8 + colonne (a1 = 0, h1 = 7, a8 = 56).
// =====================================================================
const SQ = (f, r) => r * 8 + f;
const fileOf = s => s & 7;
const rankOf = s => s >> 3;
const onBoard = (f, r) => f >= 0 && f < 8 && r >= 0 && r < 8;

const KNIGHT = [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]];
const KING   = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
const ORTHO  = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const DIAG   = [[1, 1], [1, -1], [-1, 1], [-1, -1]];

// La case s est-elle attaquée par le camp byWhite ?
function isAttacked(pos, s, byWhite) {
  const f = fileOf(s), r = rankOf(s);
  const is = (df, dr, types) => {
    if (!onBoard(f + df, r + dr)) return false;
    const q = pos[SQ(f + df, r + dr)];
    return !!q && q.w === byWhite && types.includes(q.t);
  };
  const pawnDr = byWhite ? -1 : 1; // un pion blanc attaque depuis le rang inférieur
  if (is(-1, pawnDr, 'p') || is(1, pawnDr, 'p')) return true;
  if (KNIGHT.some(([df, dr]) => is(df, dr, 'n'))) return true;
  if (KING.some(([df, dr]) => is(df, dr, 'k'))) return true;
  for (const [dirs, types] of [[ORTHO, 'rq'], [DIAG, 'bq']]) {
    for (const [df, dr] of dirs) {
      let x = f + df, y = r + dr;
      while (onBoard(x, y)) {
        const q = pos[SQ(x, y)];
        if (q) { if (q.w === byWhite && types.includes(q.t)) return true; break; }
        x += df; y += dr;
      }
    }
  }
  return false;
}

function inCheck(pos, white) {
  const k = pos.findIndex(q => q && q.t === 'k' && q.w === white);
  return k >= 0 && isAttacked(pos, k, !white); // sans roi (mode libre) : jamais en échec
}

function pseudoMoves(pos, s, epSq) {
  const q = pos[s], w = q.w, f = fileOf(s), r = rankOf(s);
  const out = [];
  const add = (to, extra = {}) => out.push({ from: s, to, ...extra });

  if (q.t === 'p') {
    const d = w ? 1 : -1, startRank = w ? 1 : 6, lastRank = w ? 7 : 0;
    const push = to => add(to, rankOf(to) === lastRank ? { promo: true } : {});
    if (onBoard(f, r + d) && !pos[SQ(f, r + d)]) {
      push(SQ(f, r + d));
      if (r === startRank && !pos[SQ(f, r + 2 * d)]) add(SQ(f, r + 2 * d), { double: true });
    }
    for (const df of [-1, 1]) {
      if (!onBoard(f + df, r + d)) continue;
      const to = SQ(f + df, r + d), c = pos[to];
      if (c && c.w !== w) push(to);
      else if (!c && to === epSq) add(to, { ep: true });
    }
  } else if (q.t === 'n' || q.t === 'k') {
    for (const [df, dr] of (q.t === 'n' ? KNIGHT : KING)) {
      if (!onBoard(f + df, r + dr)) continue;
      const to = SQ(f + df, r + dr), c = pos[to];
      if (!c || c.w !== w) add(to);
    }
    // Roque : roi et tour jamais déplacés, cases libres, pas d'échec en chemin
    const home = w ? 0 : 7;
    if (q.t === 'k' && !q.moved && f === 4 && r === home && !isAttacked(pos, s, !w)) {
      const rookOk = rf => { const t = pos[SQ(rf, home)]; return t && t.t === 'r' && t.w === w && !t.moved; };
      const empty = fs => fs.every(x => !pos[SQ(x, home)]);
      const safe = fs => fs.every(x => !isAttacked(pos, SQ(x, home), !w));
      if (rookOk(7) && empty([5, 6]) && safe([5, 6])) add(SQ(6, home), { castle: 'k' });
      if (rookOk(0) && empty([1, 2, 3]) && safe([2, 3])) add(SQ(2, home), { castle: 'q' });
    }
  } else {
    const dirs = q.t === 'r' ? ORTHO : q.t === 'b' ? DIAG : [...ORTHO, ...DIAG];
    for (const [df, dr] of dirs) {
      let x = f + df, y = r + dr;
      while (onBoard(x, y)) {
        const c = pos[SQ(x, y)];
        if (!c) add(SQ(x, y));
        else { if (c.w !== w) add(SQ(x, y)); break; }
        x += df; y += dr;
      }
    }
  }
  return out;
}

function applyToPos(pos, m) {
  const a = pos.slice();
  a[m.to] = a[m.from];
  a[m.from] = null;
  if (m.ep) a[SQ(fileOf(m.to), rankOf(m.from))] = null;
  if (m.castle) {
    const home = rankOf(m.from);
    const [rf, rt] = m.castle === 'k' ? [7, 5] : [0, 3];
    a[SQ(rt, home)] = a[SQ(rf, home)];
    a[SQ(rf, home)] = null;
  }
  return a;
}

function legalMovesFrom(pos, s, epSq) {
  const w = pos[s].w;
  return pseudoMoves(pos, s, epSq).filter(m => !inCheck(applyToPos(pos, m), w));
}

function hasAnyLegalMove(pos, white, epSq) {
  for (let s = 0; s < 64; s++) {
    if (pos[s] && pos[s].w === white && legalMovesFrom(pos, s, epSq).length) return true;
  }
  return false;
}
