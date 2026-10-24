<!-- Logo du jeu : roi Staunton doré (même dessin que dans index.html) -->
<script>
  let { size = 32 } = $props();
  const uid = Math.random().toString(36).slice(2, 8); // dégradé propre à chaque logo
</script>

<svg width={size * 64 / 84} height={size} viewBox="0 0 64 84" aria-hidden="true">
  <defs>
    <linearGradient id="gold-{uid}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#f3dc9c" /><stop offset=".45" stop-color="#c9a25e" /><stop offset="1" stop-color="#8a6a2f" />
    </linearGradient>
  </defs>
  <g fill="url(#gold-{uid})" stroke="#5e4720" stroke-width="1.2" stroke-linejoin="round">
    <path d="M29 2h6v6h6v6h-6v7h-6v-7h-6V8h6z" />
    <path d="M15 27c5-5 29-5 34 0l-5 10H20z" />
    <rect x="18" y="37" width="28" height="4.5" rx="2" />
    <path d="M23.5 41.5h17c-.5 9 1.5 16 6.5 23H17c5-7 7-14 6.5-23z" />
    <rect x="13" y="64.5" width="38" height="5" rx="2.2" />
    <path d="M9 74c0-3 2-4.5 4-4.5h38c2 0 4 1.5 4 4.5v4.5H9z" />
  </g>
  <path d="M20 29.5c6-3 18-3 24 0" fill="none" stroke="#fff3cf" stroke-opacity=".55" stroke-width="1.2" stroke-linecap="round" />
</svg>
