// Compteurs cumulés (sessions, parties, pic de connexions), conservés dans un fichier JSON.
// Ils continuent de monter d'un redémarrage à l'autre du serveur.
//
//   DATA_DIR : dossier du fichier counters.json (par défaut data/ à la racine du projet ;
//              /data dans Docker, sur un volume nommé). Illisible ou absent : on repart de zéro.
//
// Écriture atomique (fichier temporaire puis renommage), groupée au plus toutes les 2 s,
// et forcée à l'arrêt du serveur.
const fs = require('fs');
const path = require('path');

const FIELDS = ['sessions', 'gamesStarted', 'soloGames', 'peak'];

function createCounters(dir) {
  const file = path.join(dir, 'counters.json');
  const data = { since: Date.now(), sessions: 0, gamesStarted: 0, soloGames: 0, peak: 0 };
  try {
    const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
    for (const k of FIELDS) if (Number.isSafeInteger(saved[k]) && saved[k] >= 0) data[k] = saved[k];
    if (Number.isSafeInteger(saved.since) && saved.since > 0) data.since = saved.since;
  } catch (err) {
    if (err.code !== 'ENOENT') console.warn(`Compteurs : ${file} illisible (${err.message}), on repart de zéro`);
  }

  let timer = null, failed = false;
  function save() {
    clearTimeout(timer);
    timer = null;
    try {
      fs.mkdirSync(dir, { recursive: true });
      const tmp = file + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n', { mode: 0o600 });
      fs.renameSync(tmp, file);
      failed = false;
    } catch (err) {
      if (!failed) console.warn(`Compteurs : écriture impossible dans ${dir} (${err.message})`);
      failed = true; // un seul avertissement tant que l'écriture échoue
    }
  }
  const later = () => { if (!timer) timer = setTimeout(save, 2000); };

  return {
    data,
    add(key, n = 1) { data[key] += n; later(); },
    max(key, n) { if (n > data[key]) { data[key] = n; later(); } },
    flush() { if (timer) save(); },
  };
}

module.exports = { createCounters };
