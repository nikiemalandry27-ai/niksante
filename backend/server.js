require('dotenv').config();

const express      = require('express');
const cors         = require('cors');
const helmet       = require('helmet');
const rateLimit    = require('express-rate-limit');
const path         = require('path');
const { createTables } = require('./config/database');
const authRoutes       = require('./routes/auth');
const glucoseRoutes    = require('./routes/glucose');
const foodRoutes       = require('./routes/food');
const adminRoutes      = require('./routes/admin');

const app  = express();
const PORT = process.env.PORT || 3001;

// ── Origines autorisées ──────────────────────────────────────────────────────
const ALLOWED_ORIGINS = (process.env.CORS_ORIGIN || '')
  .split(',')
  .map(o => o.trim())
  .filter(Boolean);

// En développement on accepte localhost; en production uniquement CORS_ORIGIN
const corsOptions = {
  origin: (origin, cb) => {
    // Les apps mobiles natives n'envoient pas d'Origin → toujours autorisées
    if (!origin) return cb(null, true);
    const devOrigins = [
      'http://localhost:3001',
      'http://localhost:8081',
      'http://localhost:19006',
    ];
    const allowed = [...devOrigins, ...ALLOWED_ORIGINS];
    if (allowed.includes(origin)) return cb(null, true);
    cb(new Error(`CORS bloqué : origine non autorisée (${origin})`));
  },
  methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};

// ── Headers de sécurité (Helmet) ─────────────────────────────────────────────
app.use(helmet({
  crossOriginEmbedderPolicy: false, // nécessaire pour les assets mobiles
  contentSecurityPolicy: {
    directives: {
      defaultSrc:  ["'self'"],
      scriptSrc:   ["'self'", "'unsafe-inline'", 'cdn.jsdelivr.net', 'cdn.tailwindcss.com'],
      styleSrc:    ["'self'", "'unsafe-inline'", 'cdn.tailwindcss.com'],
      imgSrc:      ["'self'", 'data:'],
      connectSrc:  ["'self'"],
      fontSrc:     ["'self'"],
      objectSrc:   ["'none'"],
      frameAncestors: ["'none'"],
    },
  },
}));

// ── Rate limiting ─────────────────────────────────────────────────────────────

// Auth : 10 tentatives / 15 min par IP (anti brute-force)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Trop de tentatives de connexion. Réessayez dans 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Food detect : 30 scans / heure par IP (protège la clé OpenAI)
const foodLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 30,
  message: { error: 'Limite de scans atteinte. Réessayez dans 1 heure.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// API globale : 200 requêtes / 15 min par IP
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  message: { error: 'Trop de requêtes. Réessayez dans quelques minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// ── Middlewares globaux ──────────────────────────────────────────────────────
app.use(cors(corsOptions));
app.use(express.json({ limit: '10mb' }));
app.use(globalLimiter);

// ── Dashboard admin (fichiers statiques) ────────────────────────────────────
app.use('/admin', express.static(path.join(__dirname, 'public', 'admin')));

// ── Routes API ───────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/auth',    authLimiter, authRoutes);
app.use('/api/glucose', glucoseRoutes);
app.use('/api/food',    foodLimiter, foodRoutes);
app.use('/api/admin',   adminRoutes);

// ── 404 catch-all ───────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: 'Route introuvable' });
});

// ── Gestionnaire d'erreurs global ────────────────────────────────────────────
app.use((err, _req, res, _next) => {
  if (err.message?.startsWith('CORS')) {
    return res.status(403).json({ error: 'Accès refusé (CORS)' });
  }
  console.error('[Erreur serveur]', err.message);
  res.status(500).json({ error: 'Erreur interne du serveur' });
});

// ── Démarrage ────────────────────────────────────────────────────────────────
createTables()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`\n🩺 NikSanté API démarrée sur http://localhost:${PORT}`);
      console.log(`   POST /api/auth/register  |  /api/auth/login`);
      console.log(`   GET  /api/glucose        |  POST /api/glucose`);
      console.log(`   POST /api/food/detect`);
      console.log(`   📊   http://localhost:${PORT}/admin\n`);
    });
  })
  .catch((err) => {
    console.error('[Démarrage] Échec connexion base de données :', err);
    process.exit(1);
  });
