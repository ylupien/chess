// Mode développement : serveur de jeu + page d'administration recompilée en direct.
//
//   npm run dev
//     → jeu             http://localhost:8090          (le serveur redémarre quand server/ change)
//     → administration  http://localhost:5173/admin/   (Vite : chaque modification de admin/src
//                                                      s'affiche aussitôt, sans recharger la page)
//
// Les variables de .env (ADMIN_PASSWORD…) sont chargées. Port 8090 (le conteneur Docker occupe
// le 8080) : DEV_PORT=… pour un autre. Ctrl+C arrête tout.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const PORT = process.env.DEV_PORT || '8090';
const env = existsSync(`${root}.env`) ? ['--env-file=.env'] : [];
const run = (name, cmd, args) => {
  const p = spawn(cmd, args, { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, PORT, FORCE_COLOR: '1' } });
  const tag = `\x1b[33m[${name}]\x1b[0m `;
  const out = s => process.stdout.write(String(s).replace(/^(?=.)/gm, tag));
  p.stdout.on('data', out);
  p.stderr.on('data', out);
  p.on('exit', code => { out(`arrêté (${code})\n`); shutdown(); });
  return p;
};
const procs = [
  run('jeu', process.execPath, [...env, '--watch-path=server', 'server/server.js']),
  run('admin', process.execPath, ['node_modules/vite/bin/vite.js', '--config', 'admin/vite.config.mjs']),
];
let stopping = false;
function shutdown() {
  if (stopping) return;
  stopping = true;
  for (const p of procs) p.kill('SIGTERM');
  setTimeout(() => process.exit(0), 500);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
