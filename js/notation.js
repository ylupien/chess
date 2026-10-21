// Notation des coups et noms des pièces (en français).
// Script classique (chargé par index.html dans l'ordre). Dépend de : rules.js.

const sqName = s => 'abcdefgh'[fileOf(s)] + (rankOf(s) + 1);
const SAN_GLYPH = { k: '♔', q: '♕', r: '♖', b: '♗', n: '♘', p: '' };
const pieceGlyph = p => (p.white ? { k: '♔', q: '♕', r: '♖', b: '♗', n: '♘', p: '♙' }
                                 : { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' })[p.type];

// Noms des pièces (Dame et Tour sont féminins : « Dame blanche », « Tour noire »)
const PIECE_NAME = { k: 'Roi', q: 'Dame', r: 'Tour', b: 'Fou', n: 'Cavalier', p: 'Pion' };
const FEMININE = new Set(['q', 'r']);
const pieceLabel = p => `${PIECE_NAME[p.type]} ${p.white ? 'blanc' : 'noir'}${FEMININE.has(p.type) ? 'e' : ''}`;

// Description en clair d'un coup : « Cavalier », « Fou × Tour », « Pion → Dame »…
function moveName(p, m, victim, promoType) {
  const route = `${sqName(m.from)} → ${sqName(m.to)}`;
  if (m.castle) return `Roi ${route} (${m.castle === 'k' ? 'petit' : 'grand'} roque)`;
  let n = `${PIECE_NAME[p.type]} ${route}`;
  if (victim) n += ' × ' + PIECE_NAME[victim.type];
  if (m.ep) n += ' (en passant)';
  if (promoType) n += ' = ' + PIECE_NAME[promoType];
  return n;
}

// Notation algébrique (figurines) du coup m, calculée sur la position pos avant le coup.
function sanFor(pos, m, epSquare, promoType) {
  if (m.castle) return m.castle === 'k' ? 'O-O' : 'O-O-O';
  const q = pos[m.from];
  const capture = !!pos[m.to] || !!m.ep;
  if (q.t === 'p') {
    return (capture ? 'abcdefgh'[fileOf(m.from)] + 'x' : '') + sqName(m.to)
      + (promoType ? '=' + SAN_GLYPH[promoType] : '');
  }
  // Lever l'ambiguïté si une autre pièce identique peut aller sur la même case
  let disamb = '';
  const rivals = [];
  for (let s = 0; s < 64; s++) {
    const r = pos[s];
    if (s !== m.from && r && r.t === q.t && r.w === q.w &&
        legalMovesFrom(pos, s, epSquare).some(x => x.to === m.to)) rivals.push(s);
  }
  if (rivals.length) {
    const f = 'abcdefgh'[fileOf(m.from)], r = String(rankOf(m.from) + 1);
    if (!rivals.some(s => fileOf(s) === fileOf(m.from))) disamb = f;
    else if (!rivals.some(s => rankOf(s) === rankOf(m.from))) disamb = r;
    else disamb = f + r;
  }
  return SAN_GLYPH[q.t] + disamb + (capture ? 'x' : '') + sqName(m.to);
}

// U+FE0E : force l'affichage texte des symboles d'échecs (pas en émoji)
const textGlyphs = t => t.replace(/[\u2654-\u265F]/g, '$&\uFE0E');
