// Adversaire ordinateur : moteur d'échecs exécuté dans un Web Worker (le rendu ne saccade pas).
// Script classique (chargé par index.html dans l'ordre). Dépend de : aucune.
//
// Le worker est créé depuis le code de aiEngine() (Blob) : pas de fichier séparé à charger,
// donc il fonctionne aussi en file://, sans serveur ni connexion.
//
// Moteur : recherche alpha-bêta (négamax) en approfondissement itératif, table de transposition,
// recherche de calme (prises), coup nul, réductions des coups tardifs, tri des coups
// (coup de la table, prises MVV-LVA, coups « killer », historique). Évaluation : matériel et
// tables de placement (dont le roi, qui se centralise en finale), paire de fous.

function aiEngine() {
  const P = 1, N = 2, B = 3, R = 4, Q = 5, K = 6;
  const VAL = [0, 100, 320, 330, 500, 900, 20000];
  const MATE = 100000, INF = 1000000;

  // Tables de placement des Blancs, écrites du rang 8 (haut) au rang 1 (bas)
  const PST = {
    [P]: [0, 0, 0, 0, 0, 0, 0, 0, 50, 50, 50, 50, 50, 50, 50, 50, 10, 10, 20, 30, 30, 20, 10, 10, 5, 5, 10, 25, 25, 10, 5, 5,
      0, 0, 0, 20, 20, 0, 0, 0, 5, -5, -10, 0, 0, -10, -5, 5, 5, 10, 10, -20, -20, 10, 10, 5, 0, 0, 0, 0, 0, 0, 0, 0],
    [N]: [-50, -40, -30, -30, -30, -30, -40, -50, -40, -20, 0, 0, 0, 0, -20, -40, -30, 0, 10, 15, 15, 10, 0, -30, -30, 5, 15, 20, 20, 15, 5, -30,
      -30, 0, 15, 20, 20, 15, 0, -30, -30, 5, 10, 15, 15, 10, 5, -30, -40, -20, 0, 5, 5, 0, -20, -40, -50, -40, -30, -30, -30, -30, -40, -50],
    [B]: [-20, -10, -10, -10, -10, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 10, 10, 5, 0, -10, -10, 5, 5, 10, 10, 5, 5, -10,
      -10, 0, 10, 10, 10, 10, 0, -10, -10, 10, 10, 10, 10, 10, 10, -10, -10, 5, 0, 0, 0, 0, 5, -10, -20, -10, -10, -10, -10, -10, -10, -20],
    [R]: [0, 0, 0, 0, 0, 0, 0, 0, 5, 10, 10, 10, 10, 10, 10, 5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5,
      -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, 0, 0, 0, 5, 5, 0, 0, 0],
    [Q]: [-20, -10, -10, -5, -5, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 5, 5, 5, 0, -10, -5, 0, 5, 5, 5, 5, 0, -5,
      0, 0, 5, 5, 5, 5, 0, -5, -10, 5, 5, 5, 5, 5, 0, -10, -10, 0, 5, 0, 0, 0, 0, -10, -20, -10, -10, -5, -5, -10, -10, -20],
  };
  const KING_MID = [-30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30,
    -30, -40, -40, -50, -50, -40, -40, -30, -20, -30, -30, -40, -40, -30, -30, -20, -10, -20, -20, -20, -20, -20, -20, -10,
    20, 20, 0, 0, 0, 0, 20, 20, 20, 30, 10, 0, 0, 10, 30, 20];
  const KING_END = [-50, -40, -30, -20, -20, -30, -40, -50, -30, -20, -10, 0, 0, -10, -20, -30, -30, -10, 20, 30, 30, 20, -10, -30,
    -30, -10, 30, 40, 40, 30, -10, -30, -30, -10, 30, 40, 40, 30, -10, -30, -30, -10, 20, 30, 30, 20, -10, -30,
    -30, -30, 0, 0, 0, 0, -30, -30, -50, -30, -30, -30, -30, -30, -30, -50];
  const PHASE = [0, 0, 1, 1, 2, 4, 0]; // 24 = début de partie, 0 = finale de rois et pions
  // Case s (a1 = 0) → index dans une table écrite du rang 8 au rang 1
  const idxW = s => (7 - (s >> 3)) * 8 + (s & 7);
  const idxB = s => s; // les Noirs lisent la table en miroir vertical

  // --- Cases d'arrivée précalculées -------------------------------------------------
  const rays = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]; // 0-3 : lignes, 4-7 : diagonales
  const steps = (s, list) => list.map(([df, dr]) => [(s & 7) + df, (s >> 3) + dr])
    .filter(([f, r]) => f >= 0 && f < 8 && r >= 0 && r < 8).map(([f, r]) => r * 8 + f);
  const KN_TO = [], KI_TO = [], RAY = [];
  for (let s = 0; s < 64; s++) {
    KN_TO[s] = steps(s, [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]]);
    KI_TO[s] = steps(s, rays);
    RAY[s] = rays.map(([df, dr]) => {
      const out = [];
      let f = (s & 7) + df, r = (s >> 3) + dr;
      while (f >= 0 && f < 8 && r >= 0 && r < 8) { out.push(r * 8 + f); f += df; r += dr; }
      return out;
    });
  }
  // Droits de roque (1 = petit blanc, 2 = grand blanc, 4 = petit noir, 8 = grand noir) gardés
  // quand une pièce part de (ou arrive sur) la case s
  const CASTLE_KEEP = new Array(64).fill(15);
  CASTLE_KEEP[0] = 13; CASTLE_KEEP[7] = 14; CASTLE_KEEP[4] = 12;
  CASTLE_KEEP[56] = 7; CASTLE_KEEP[63] = 11; CASTLE_KEEP[60] = 3;

  // --- Hachage de Zobrist (deux clés 32 bits : index et vérification) ----------------
  let seed = 0x2545f491;
  const rnd = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return seed | 0; };
  const Z1 = new Int32Array(13 * 64), Z2 = new Int32Array(13 * 64);
  for (let i = 0; i < 13 * 64; i++) { Z1[i] = rnd(); Z2[i] = rnd(); }
  const ZC1 = Int32Array.from({ length: 16 }, rnd), ZC2 = Int32Array.from({ length: 16 }, rnd);
  const ZE1 = Int32Array.from({ length: 8 }, rnd), ZE2 = Int32Array.from({ length: 8 }, rnd);
  const ZS1 = rnd(), ZS2 = rnd();
  const zi = (p, s) => (p + 6) * 64 + s;

  // --- Position ------------------------------------------------------------------------
  const bd = new Int8Array(64); // > 0 : blanc, < 0 : noir
  let side = 1, castle = 0, ep = -1, h1 = 0, h2 = 0;
  const kingSq = [0, 0]; // [blanc, noir]
  const ki = c => (c > 0 ? 0 : 1);

  function computeHash() {
    h1 = 0; h2 = 0;
    for (let s = 0; s < 64; s++) if (bd[s]) { h1 ^= Z1[zi(bd[s], s)]; h2 ^= Z2[zi(bd[s], s)]; }
    h1 ^= ZC1[castle]; h2 ^= ZC2[castle];
    if (ep >= 0) { h1 ^= ZE1[ep & 7]; h2 ^= ZE2[ep & 7]; }
    if (side < 0) { h1 ^= ZS1; h2 ^= ZS2; }
  }
  const CODE = { p: P, n: N, b: B, r: R, q: Q, k: K };
  // pos : 64 cases null ou { t, w, moved } (format de js/rules.js)
  function setPosition(pos, white, epSq) {
    kingSq[0] = kingSq[1] = -1;
    for (let s = 0; s < 64; s++) {
      const q = pos[s];
      bd[s] = q ? CODE[q.t] * (q.w ? 1 : -1) : 0;
      if (q && q.t === 'k') kingSq[q.w ? 0 : 1] = s;
    }
    const unmoved = (s, code) => pos[s] && bd[s] === code && !pos[s].moved;
    castle = 0;
    if (unmoved(4, K)) { if (unmoved(7, R)) castle |= 1; if (unmoved(0, R)) castle |= 2; }
    if (unmoved(60, -K)) { if (unmoved(63, -R)) castle |= 4; if (unmoved(56, -R)) castle |= 8; }
    side = white ? 1 : -1;
    ep = epSq >= 0 ? epSq : -1;
    computeHash();
  }

  // La case s est-elle attaquée par le camp by (1 ou -1) ?
  function attacked(s, by) {
    if (s < 0) return false;
    const pr = (s >> 3) - by, f = s & 7; // rang d'où un pion de ce camp attaquerait
    if (pr >= 0 && pr < 8) {
      if (f > 0 && bd[pr * 8 + f - 1] === P * by) return true;
      if (f < 7 && bd[pr * 8 + f + 1] === P * by) return true;
    }
    for (const t of KN_TO[s]) if (bd[t] === N * by) return true;
    for (const t of KI_TO[s]) if (bd[t] === K * by) return true;
    const ray = RAY[s];
    for (let d = 0; d < 8; d++) {
      const line = ray[d], a = d < 4 ? R * by : B * by;
      for (let i = 0; i < line.length; i++) {
        const q = bd[line[i]];
        if (q) { if (q === a || q === Q * by) return true; break; }
      }
    }
    return false;
  }
  const inCheck = () => attacked(kingSq[ki(side)], -side);

  // --- Coups : from | to << 6 | promo << 12 | flag << 16 (1 : en passant, 2 : roque, 3 : double pas)
  const MAXPLY = 64;
  const moveBuf = Array.from({ length: MAXPLY + 1 }, () => new Int32Array(256));
  const scoreBuf = Array.from({ length: MAXPLY + 1 }, () => new Int32Array(256));

  function gen(list, capsOnly) {
    let n = 0;
    const us = side;
    const add = (from, to, promo = 0, flag = 0) => { list[n++] = from | (to << 6) | (promo << 12) | (flag << 16); };
    for (let s = 0; s < 64; s++) {
      const q = bd[s] * us;
      if (q <= 0) continue;
      if (q === P) {
        const f = s & 7, r = s >> 3, d = us * 8, last = us > 0 ? 7 : 0, start = us > 0 ? 1 : 6;
        const one = s + d;
        const push = (to, cap) => {
          if ((to >> 3) === last) { add(s, to, Q); if (!capsOnly || cap) { add(s, to, N); add(s, to, R); add(s, to, B); } }
          else if (!capsOnly || cap) add(s, to);
        };
        if (!bd[one]) {
          if (!capsOnly || (one >> 3) === last) push(one, false);
          if (!capsOnly && r === start && !bd[one + d]) add(s, one + d, 0, 3);
        }
        for (const df of [-1, 1]) {
          if (f + df < 0 || f + df > 7) continue;
          const to = one + df;
          if (bd[to] * us < 0) push(to, true);
          else if (to === ep) add(s, to, 0, 1);
        }
      } else if (q === N || q === K) {
        for (const to of (q === N ? KN_TO : KI_TO)[s]) {
          const c = bd[to] * us;
          if (c < 0 || (!capsOnly && c === 0)) add(s, to);
        }
        if (q === K && !capsOnly) {
          if (us > 0 && s === 4) {
            if ((castle & 1) && !bd[5] && !bd[6] && bd[7] === R && !attacked(4, -1) && !attacked(5, -1) && !attacked(6, -1)) add(4, 6, 0, 2);
            if ((castle & 2) && !bd[3] && !bd[2] && !bd[1] && bd[0] === R && !attacked(4, -1) && !attacked(3, -1) && !attacked(2, -1)) add(4, 2, 0, 2);
          } else if (us < 0 && s === 60) {
            if ((castle & 4) && !bd[61] && !bd[62] && bd[63] === -R && !attacked(60, 1) && !attacked(61, 1) && !attacked(62, 1)) add(60, 62, 0, 2);
            if ((castle & 8) && !bd[59] && !bd[58] && !bd[57] && bd[56] === -R && !attacked(60, 1) && !attacked(59, 1) && !attacked(58, 1)) add(60, 58, 0, 2);
          }
        }
      } else {
        const ray = RAY[s], d0 = q === B ? 4 : 0, d1 = q === R ? 4 : 8;
        for (let d = d0; d < d1; d++) {
          const line = ray[d];
          for (let i = 0; i < line.length; i++) {
            const to = line[i], c = bd[to] * us;
            if (c > 0) break;
            if (c < 0) { add(s, to); break; }
            if (!capsOnly) add(s, to);
          }
        }
      }
    }
    return n;
  }

  // --- Jouer / défaire un coup ------------------------------------------------------------
  const undo = [];
  function make(m) {
    const from = m & 63, to = (m >> 6) & 63, promo = (m >> 12) & 7, flag = m >> 16;
    const piece = bd[from], us = side;
    let cap = bd[to], capSq = to;
    if (flag === 1) { capSq = to - 8 * us; cap = bd[capSq]; }
    undo.push(m, cap, castle, ep, h1, h2);
    h1 ^= Z1[zi(piece, from)]; h2 ^= Z2[zi(piece, from)];
    if (cap) { h1 ^= Z1[zi(cap, capSq)]; h2 ^= Z2[zi(cap, capSq)]; bd[capSq] = 0; }
    const placed = promo ? promo * us : piece;
    bd[from] = 0; bd[to] = placed;
    h1 ^= Z1[zi(placed, to)]; h2 ^= Z2[zi(placed, to)];
    if (piece * us === K) kingSq[ki(us)] = to;
    if (flag === 2) { // la tour saute par-dessus le roi
      const rf = to === 6 ? 7 : to === 2 ? 0 : to === 62 ? 63 : 56, rt = (from + to) >> 1, rook = bd[rf];
      bd[rf] = 0; bd[rt] = rook;
      h1 ^= Z1[zi(rook, rf)] ^ Z1[zi(rook, rt)]; h2 ^= Z2[zi(rook, rf)] ^ Z2[zi(rook, rt)];
    }
    h1 ^= ZC1[castle]; h2 ^= ZC2[castle];
    castle &= CASTLE_KEEP[from] & CASTLE_KEEP[to];
    h1 ^= ZC1[castle]; h2 ^= ZC2[castle];
    if (ep >= 0) { h1 ^= ZE1[ep & 7]; h2 ^= ZE2[ep & 7]; }
    ep = flag === 3 ? (from + to) >> 1 : -1;
    if (ep >= 0) { h1 ^= ZE1[ep & 7]; h2 ^= ZE2[ep & 7]; }
    side = -us; h1 ^= ZS1; h2 ^= ZS2;
  }
  function unmake() {
    const hh2 = undo.pop(), hh1 = undo.pop(), oldEp = undo.pop(), oldCastle = undo.pop(), cap = undo.pop(), m = undo.pop();
    const from = m & 63, to = (m >> 6) & 63, promo = (m >> 12) & 7, flag = m >> 16;
    side = -side;
    const us = side;
    const piece = promo ? P * us : bd[to];
    bd[from] = piece; bd[to] = 0;
    if (flag === 1) bd[to - 8 * us] = cap; else bd[to] = cap;
    if (piece * us === K) kingSq[ki(us)] = from;
    if (flag === 2) {
      const rf = to === 6 ? 7 : to === 2 ? 0 : to === 62 ? 63 : 56, rt = (from + to) >> 1;
      bd[rf] = bd[rt]; bd[rt] = 0;
    }
    castle = oldCastle; ep = oldEp; h1 = hh1; h2 = hh2;
  }
  function makeNull() {
    undo.push(0, 0, castle, ep, h1, h2);
    if (ep >= 0) { h1 ^= ZE1[ep & 7]; h2 ^= ZE2[ep & 7]; }
    ep = -1; side = -side; h1 ^= ZS1; h2 ^= ZS2;
  }
  function unmakeNull() {
    h2 = undo.pop(); h1 = undo.pop(); ep = undo.pop(); castle = undo.pop(); undo.pop(); undo.pop();
    side = -side;
  }

  // --- Évaluation (du point de vue du camp au trait) ------------------------------------------
  function evaluate() {
    let mid = 0, phase = 0, wb = 0, bb = 0;
    for (let s = 0; s < 64; s++) {
      const q = bd[s];
      if (!q) continue;
      const t = q > 0 ? q : -q;
      phase += PHASE[t];
      if (t === K) continue;
      const v = VAL[t] + PST[t][q > 0 ? idxW(s) : idxB(s)];
      mid += q > 0 ? v : -v;
      if (t === B) { if (q > 0) wb++; else bb++; }
    }
    if (wb >= 2) mid += 30;
    if (bb >= 2) mid -= 30;
    phase = Math.min(24, phase);
    const kw = kingSq[0], kb = kingSq[1];
    if (kw >= 0) mid += (KING_MID[idxW(kw)] * phase + KING_END[idxW(kw)] * (24 - phase)) / 24;
    if (kb >= 0) mid -= (KING_MID[idxB(kb)] * phase + KING_END[idxB(kb)] * (24 - phase)) / 24;
    return (mid | 0) * side;
  }
  const hasPieces = () => {
    for (let s = 0; s < 64; s++) { const t = bd[s] * side; if (t > P && t < K) return true; }
    return false;
  };

  // --- Table de transposition -------------------------------------------------------------------
  const TT_BITS = 20, TT_MASK = (1 << TT_BITS) - 1;
  const ttKey = new Int32Array(1 << TT_BITS), ttMove = new Int32Array(1 << TT_BITS);
  const ttScore = new Int32Array(1 << TT_BITS), ttDepth = new Int8Array(1 << TT_BITS), ttFlag = new Int8Array(1 << TT_BITS);
  const EXACT = 1, LOWER = 2, UPPER = 3;
  const toTT = (sc, ply) => (sc > MATE - 1000 ? sc + ply : sc < -MATE + 1000 ? sc - ply : sc);
  const fromTT = (sc, ply) => (sc > MATE - 1000 ? sc - ply : sc < -MATE + 1000 ? sc + ply : sc);

  // --- Recherche ---------------------------------------------------------------------------------
  let nodes = 0, deadline = 0, stopped = false, rootBest = 0;
  const killers = Array.from({ length: MAXPLY + 1 }, () => [0, 0]);
  const hist = new Int32Array(64 * 64);
  const path = []; // clés des positions de la ligne en cours (répétitions)
  let seen = new Set(); // positions déjà jouées dans la partie

  const isQuiet = m => !bd[(m >> 6) & 63] && ((m >> 16) !== 1) && !((m >> 12) & 7);
  function scoreMoves(list, scores, n, ply, best) {
    for (let i = 0; i < n; i++) {
      const m = list[i], from = m & 63, to = (m >> 6) & 63, victim = bd[to];
      let sc;
      if (m === best) sc = 1 << 30;
      else if (victim || (m >> 16) === 1 || ((m >> 12) & 7)) {
        const v = victim ? VAL[victim > 0 ? victim : -victim] : 100, a = VAL[Math.abs(bd[from])];
        sc = (1 << 28) + v * 16 - (a >> 4) + (((m >> 12) & 7) === Q ? 8000 : 0);
      } else if (m === killers[ply][0]) sc = (1 << 27) + 2;
      else if (m === killers[ply][1]) sc = (1 << 27) + 1;
      else sc = hist[from * 64 + to];
      scores[i] = sc;
    }
  }
  function pick(list, scores, n, i) { // tri par sélection : le meilleur restant passe en position i
    let b = i;
    for (let j = i + 1; j < n; j++) if (scores[j] > scores[b]) b = j;
    if (b !== i) {
      const m = list[i]; list[i] = list[b]; list[b] = m;
      const s = scores[i]; scores[i] = scores[b]; scores[b] = s;
    }
    return list[i];
  }
  const timeUp = () => {
    if ((++nodes & 2047) === 0 && performance.now() > deadline) stopped = true;
    return stopped;
  };

  function quiesce(alpha, beta, ply) {
    if (timeUp()) return 0;
    const stand = evaluate();
    if (stand >= beta) return stand;
    if (stand > alpha) alpha = stand;
    if (ply >= MAXPLY) return stand;
    const list = moveBuf[ply], scores = scoreBuf[ply];
    const n = gen(list, true);
    scoreMoves(list, scores, n, ply, 0);
    for (let i = 0; i < n; i++) {
      const m = pick(list, scores, n, i);
      make(m);
      if (attacked(kingSq[ki(-side)], side)) { unmake(); continue; }
      const sc = -quiesce(-beta, -alpha, ply + 1);
      unmake();
      if (stopped) return 0;
      if (sc >= beta) return sc;
      if (sc > alpha) alpha = sc;
    }
    return alpha;
  }

  function search(depth, alpha, beta, ply, nullOk) {
    if (timeUp()) return 0;
    const key1 = h1, key2 = h2;
    if (ply > 0) {
      // Répétition (dans la ligne ou déjà vue dans la partie) : nulle
      for (let i = path.length - 2; i >= 0; i -= 2) if (path[i] === key1 && path[i + 1] === key2) return 0;
      if (seen.has(key1)) return 0;
    }
    const chk = inCheck();
    if (chk) depth++;
    if (depth <= 0) return quiesce(alpha, beta, ply);
    if (ply >= MAXPLY) return evaluate();

    const slot = key1 & TT_MASK;
    let best = 0;
    if (ttKey[slot] === key2) {
      best = ttMove[slot];
      if (ply > 0 && ttDepth[slot] >= depth) {
        const sc = fromTT(ttScore[slot], ply), fl = ttFlag[slot];
        if (fl === EXACT || (fl === LOWER && sc >= beta) || (fl === UPPER && sc <= alpha)) return sc;
      }
    }
    // Coup nul : si passer son tour suffit à dépasser beta, la position est déjà très bonne
    if (nullOk && !chk && depth >= 3 && ply > 0 && hasPieces() && evaluate() >= beta) {
      makeNull();
      path.push(h1, h2);
      const sc = -search(depth - 3, -beta, -beta + 1, ply + 1, false);
      path.length -= 2;
      unmakeNull();
      if (stopped) return 0;
      if (sc >= beta) return beta;
    }

    const list = moveBuf[ply], scores = scoreBuf[ply];
    const n = gen(list, false);
    scoreMoves(list, scores, n, ply, best);
    const alpha0 = alpha;
    let legal = 0, bestScore = -INF, bestMove = 0;
    path.push(key1, key2);
    for (let i = 0; i < n; i++) {
      const m = pick(list, scores, n, i);
      const quiet = isQuiet(m);
      make(m);
      if (attacked(kingSq[ki(-side)], side)) { unmake(); continue; }
      legal++;
      let sc;
      if (legal === 1) sc = -search(depth - 1, -beta, -alpha, ply + 1, true);
      else {
        // Coups tardifs et calmes : d'abord une recherche réduite, à fenêtre nulle
        const red = legal > 4 && depth >= 3 && quiet && !chk ? 1 : 0;
        sc = -search(depth - 1 - red, -alpha - 1, -alpha, ply + 1, true);
        if (sc > alpha && (red || sc < beta)) sc = -search(depth - 1, -beta, -alpha, ply + 1, true);
      }
      unmake();
      if (stopped) { path.length -= 2; return 0; }
      if (sc > bestScore) { bestScore = sc; bestMove = m; if (ply === 0) rootBest = m; }
      if (sc > alpha) {
        alpha = sc;
        if (sc >= beta) {
          if (quiet) {
            if (killers[ply][0] !== m) { killers[ply][1] = killers[ply][0]; killers[ply][0] = m; }
            hist[(m & 63) * 64 + ((m >> 6) & 63)] += depth * depth;
          }
          break;
        }
      }
    }
    path.length -= 2;
    if (!legal) return chk ? -MATE + ply : 0;
    ttKey[slot] = key2; ttMove[slot] = bestMove; ttDepth[slot] = depth;
    ttScore[slot] = toTT(bestScore, ply);
    ttFlag[slot] = bestScore >= beta ? LOWER : bestScore <= alpha0 ? UPPER : EXACT;
    return bestScore;
  }

  // Coups légaux de la position courante
  function legalMoves() {
    const list = new Int32Array(256), out = [];
    const n = gen(list, false);
    for (let i = 0; i < n; i++) {
      make(list[i]);
      if (!attacked(kingSq[ki(-side)], side)) out.push(list[i]);
      unmake();
    }
    return out;
  }

  // Niveaux : profondeur, temps de réflexion (ms) et part de hasard (centipions)
  const LEVELS = {
    1: { depth: 1, time: 300, noise: 220 },   // Débutant : voit les prises immédiates, se trompe souvent
    2: { depth: 2, time: 500, noise: 90 },    // Facile
    3: { depth: 5, time: 800, noise: 20 },    // Moyen
    4: { depth: 64, time: 1000, noise: 0 },   // Difficile : environ 8 à 9 demi-coups
    5: { depth: 64, time: 3500, noise: 0 },   // Expert : environ 10 demi-coups
  };

  function think(req) {
    const lv = LEVELS[req.level] || LEVELS[3];
    seen = new Set();
    for (const p of req.past || []) { setPosition(p.pos, p.white, p.ep); seen.add(h1); }
    setPosition(req.pos, req.white, req.ep);
    seen.delete(h1); // la position actuelle elle-même n'est pas une répétition à éviter
    const moves = legalMoves();
    if (!moves.length) return { move: 0 };
    nodes = 0; stopped = false; path.length = 0; undo.length = 0;
    deadline = performance.now() + lv.time;
    for (const k of killers) k[0] = k[1] = 0;
    hist.fill(0);

    let bestMove = moves[0], bestScore = 0, depthDone = 0;
    if (lv.noise) {
      // Niveaux faciles : chaque coup est évalué, puis un peu de hasard s'ajoute au score
      const scored = [];
      for (let d = 1; d <= lv.depth; d++) {
        const cur = [];
        for (const m of moves) {
          make(m);
          const sc = -search(d - 1, -INF, INF, 1, true);
          unmake();
          if (stopped) break;
          cur.push([m, sc]);
        }
        if (stopped) break;
        scored.splice(0, scored.length, ...cur);
        depthDone = d;
      }
      let top = -INF;
      for (const [m, sc] of scored) {
        const v = sc + (Math.random() * 2 - 1) * lv.noise;
        if (v > top) { top = v; bestMove = m; bestScore = sc; }
      }
    } else {
      for (let d = 1; d <= lv.depth; d++) {
        rootBest = 0;
        const sc = search(d, -INF, INF, 0, false);
        if (stopped) break;
        if (rootBest) bestMove = rootBest;
        bestScore = sc; depthDone = d;
        if (Math.abs(sc) > MATE - 1000) break; // mat trouvé : inutile de chercher plus loin
        if (performance.now() > deadline - lv.time * 0.45) break; // l'itération suivante n'aurait pas le temps
      }
    }
    const promo = (bestMove >> 12) & 7;
    return { move: bestMove, from: bestMove & 63, to: (bestMove >> 6) & 63,
      promo: promo ? ' pnbrqk'[promo] : null, score: bestScore, depth: depthDone, nodes };
  }

  // Vérification du générateur de coups : nombre de positions à la profondeur d
  function perft(d) {
    if (!d) return 1;
    const list = new Int32Array(256), n = gen(list, false);
    let c = 0;
    for (let i = 0; i < n; i++) {
      make(list[i]);
      if (!attacked(kingSq[ki(-side)], side)) c += perft(d - 1);
      unmake();
    }
    return c;
  }

  self.onmessage = e => {
    if (e.data.perft) { setPosition(e.data.pos, e.data.white, e.data.ep); self.postMessage({ id: e.data.id, count: perft(e.data.perft) }); return; }
    const res = think(e.data);
    self.postMessage({ id: e.data.id, ...res });
  };
}

const AI = (() => {
  const LEVELS = [
    { id: 1, name: 'Débutant' }, { id: 2, name: 'Facile' }, { id: 3, name: 'Moyen' },
    { id: 4, name: 'Fort' }, { id: 5, name: 'Expert' },
  ];
  let worker = null, pending = null, reqId = 0;
  function ensure() {
    if (worker) return;
    const url = URL.createObjectURL(new Blob([`(${aiEngine.toString()})();`], { type: 'text/javascript' }));
    worker = new Worker(url);
    URL.revokeObjectURL(url);
    worker.onmessage = e => {
      if (!pending || e.data.id !== pending.id) return; // réponse d'une demande annulée
      const { cb } = pending;
      pending = null;
      cb(e.data);
    };
    worker.onerror = e => { console.error('Ordinateur :', e.message); pending = null; worker = null; };
  }
  // req : { pos, white, ep, level, past: [{ pos, white, ep }] } ; cb({ from, to, promo } | { move: 0 })
  function think(req, cb) {
    cancel();
    ensure();
    pending = { id: ++reqId, cb };
    worker.postMessage({ ...req, id: pending.id });
  }
  // Une réflexion en cours est abandonnée : le worker est arrêté (un niveau Expert réfléchit plusieurs secondes)
  function cancel() {
    if (!pending) return;
    pending = null;
    worker.terminate();
    worker = null;
  }
  return { LEVELS, think, cancel, get thinking() { return !!pending; } };
})();
