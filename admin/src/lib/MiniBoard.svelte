<!-- Mini-échiquier : position actuelle d'une partie, dernier coup surligné -->
<script>
  import { positionFrom } from './format.js';

  // line : coups de la partie · position : 64 caractères (a1 … h8, majuscules = Blancs) · lastMove : [de, vers]
  let { line = [], position = '', lastMove = null, size = 136 } = $props();
  const GLYPH = { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' };
  const board = $derived(position
    ? [...position].map(c => c === '.' ? null : { t: c.toLowerCase(), w: c !== c.toLowerCase() })
    : positionFrom(line));
  const last = $derived(lastMove || line.at(-1));
  // Affichage : rangée 8 en haut, colonne a à gauche (vue des Blancs)
  const squares = $derived(Array.from({ length: 64 }, (_, i) => {
    const sq = (7 - (i >> 3)) * 8 + (i & 7);
    return { sq, dark: ((sq >> 3) + (sq & 7)) % 2 === 0, piece: board[sq], hit: last && (last[0] === sq || last[1] === sq) };
  }));
</script>

<div class="board" style="--size: {size}px" aria-label="Position actuelle">
  {#each squares as s (s.sq)}
    <div class="sq" class:dark={s.dark} class:hit={s.hit}>
      {#if s.piece}<span class="pc" class:white={s.piece.w}>{GLYPH[s.piece.t]}&#xFE0E;</span>{/if}
    </div>
  {/each}
</div>

<style>
  .board {
    width: var(--size); height: var(--size); flex: none; aspect-ratio: 1;
    /* 8 × 8 cases carrées : rangées et colonnes égales, quel que soit le contenu */
    display: grid; grid-template-columns: repeat(8, minmax(0, 1fr)); grid-template-rows: repeat(8, minmax(0, 1fr));
    border: 2px solid #0a0a0c; outline: 1px solid rgba(201, 162, 94, .55); outline-offset: 1px;
    border-radius: 2px; overflow: hidden; box-shadow: 0 6px 18px rgba(0, 0, 0, .45);
  }
  .sq { position: relative; display: grid; place-items: center; background: #d9d6cf; aspect-ratio: 1; min-width: 0; min-height: 0; overflow: hidden; }
  .sq.dark { background: #2a2b31; }
  .sq.hit::after { content: ""; position: absolute; inset: 0; background: rgba(201, 162, 94, .45); }
  .pc {
    position: relative; z-index: 1; line-height: 1; height: 1em; display: block;
    font: calc(var(--size) / 8 * .92) "Segoe UI Symbol", "DejaVu Sans", "Noto Sans Symbols 2", serif;
    color: #121014; text-shadow: 0 0 1px #e9e4da, 0 0 2px rgba(255, 255, 255, .7);
  }
  .pc.white { color: #f6f0e3; text-shadow: 0 0 1px #000, 0 0 2px rgba(0, 0, 0, .9), 0 1px 1px #000; }
</style>
