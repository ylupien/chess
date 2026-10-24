// Page d'administration (Svelte), compilée par Vite.
//   npm run build:admin   → admin/dist (servie par le serveur de jeu sur /admin/)
//   npm run dev           → serveur de jeu + Vite en direct (recompilation et rechargement instantanés)
import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { fileURLToPath } from 'node:url';

const GAME = `http://localhost:${process.env.PORT || 8080}`; // serveur de jeu (API, WebSocket, jeu)

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  base: '/admin/',
  plugins: [svelte()],
  build: { outDir: 'dist', emptyOutDir: true, assetsInlineLimit: 0 },
  server: {
    port: 5173,
    strictPort: true,
    // En développement, tout ce qui n'est pas la page d'administration va au serveur de jeu
    proxy: {
      '/admin/api': GAME,
      '/ws': { target: GAME, ws: true },
      '^/(?!admin(/|$)).*': GAME, // le jeu lui-même (mode spectateur)
    },
  },
});
