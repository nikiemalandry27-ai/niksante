const fs   = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// ---------------------------------------------------------------------------
// PersistentMap — Map dont le contenu survit aux redémarrages du serveur.
// Les données sont écrites dans un fichier JSON après chaque modification.
// L'API (get/set/delete/values/entries) est identique à celle d'une Map.
// ---------------------------------------------------------------------------

class PersistentMap extends Map {
  constructor(filePath) {
    super();
    this._file = filePath;
    try {
      if (fs.existsSync(filePath)) {
        const entries = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        for (const [k, v] of entries) super.set(k, v);
      }
    } catch (err) {
      console.warn(`[DB] Impossible de charger ${filePath} :`, err.message);
    }
  }

  _persist() {
    try {
      fs.writeFileSync(this._file, JSON.stringify([...this.entries()]), 'utf8');
    } catch (err) {
      console.error(`[DB] Erreur écriture ${this._file} :`, err.message);
    }
  }

  set(k, v) {
    super.set(k, v);
    this._persist();
    return this;
  }

  delete(k) {
    const removed = super.delete(k);
    if (removed) this._persist();
    return removed;
  }
}

// ---------------------------------------------------------------------------
// Instances — une Map par entité, une par fichier JSON
// ---------------------------------------------------------------------------

/** Map<userId: string, User> */
const users = new PersistentMap(path.join(DATA_DIR, 'users.json'));

/** Map<userId: string, GlucoseEntry[]> */
const glucose = new PersistentMap(path.join(DATA_DIR, 'glucose.json'));

/** Statistiques globales (foodScans persist, startTime repart à zéro) */
const STATS_FILE = path.join(DATA_DIR, 'stats.json');
let savedStats = {};
try {
  if (fs.existsSync(STATS_FILE)) savedStats = JSON.parse(fs.readFileSync(STATS_FILE, 'utf8'));
} catch {}

const stats = {
  foodScans: savedStats.foodScans ?? 0,
  startTime: new Date(),
};

// Proxy pour persister foodScans automatiquement à chaque incrémentation
const statsProxy = new Proxy(stats, {
  set(target, prop, value) {
    target[prop] = value;
    if (prop === 'foodScans') {
      try { fs.writeFileSync(STATS_FILE, JSON.stringify({ foodScans: value }), 'utf8'); } catch {}
    }
    return true;
  },
});

module.exports = { users, glucose, stats: statsProxy };
