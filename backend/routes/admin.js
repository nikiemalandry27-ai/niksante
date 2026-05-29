const express = require('express');
const crypto  = require('crypto');
const jwt     = require('jsonwebtoken');
const { users, glucose, stats } = require('../config/database');

const router = express.Router();
const SECRET     = process.env.JWT_SECRET     || 'niksante_dev_secret';
const ADMIN_USER = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASSWORD || 'niksante2024';

// ---------------------------------------------------------------------------
// Comparaison timing-safe (protège contre les timing attacks)
// ---------------------------------------------------------------------------

function safeEqual(a, b) {
  // Même longueur de buffer obligatoire pour timingSafeEqual
  const bufA = Buffer.alloc(64);
  const bufB = Buffer.alloc(64);
  bufA.write(a);
  bufB.write(b);
  return crypto.timingSafeEqual(bufA, bufB);
}

// ---------------------------------------------------------------------------
// Middleware admin
// ---------------------------------------------------------------------------

function adminAuth(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Non autorisé' });
  }
  try {
    const payload = jwt.verify(auth.slice(7), SECRET);
    if (payload.role !== 'admin') return res.status(403).json({ error: 'Accès refusé' });
    next();
  } catch {
    return res.status(401).json({ error: 'Token invalide ou expiré' });
  }
}

// ---------------------------------------------------------------------------
// POST /api/admin/login
// ---------------------------------------------------------------------------

router.post('/login', (req, res) => {
  const { username, password } = req.body;

  if (typeof username !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ error: 'Données invalides' });
  }

  // Comparaison timing-safe sur les deux champs
  const userOk = safeEqual(username, ADMIN_USER);
  const passOk = safeEqual(password, ADMIN_PASS);

  if (!userOk || !passOk) {
    return res.status(401).json({ error: 'Identifiants incorrects' });
  }

  const token = jwt.sign({ role: 'admin' }, SECRET, { expiresIn: '8h' });
  res.json({ token });
});

// ---------------------------------------------------------------------------
// GET /api/admin/stats
// ---------------------------------------------------------------------------

router.get('/stats', adminAuth, (req, res) => {
  const now     = new Date();
  const today   = now.toDateString();
  const weekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);

  const allUsers   = [...users.values()];
  const allGlucose = [...glucose.values()].flat();

  const totalUsers        = allUsers.length;
  const totalMeasurements = allGlucose.length;
  const todayMeasurements = allGlucose.filter(g => new Date(g.date).toDateString() === today).length;
  const todayNewUsers     = allUsers.filter(u => new Date(u.createdAt).toDateString() === today).length;
  const weeklyNewUsers    = allUsers.filter(u => new Date(u.createdAt) >= weekAgo).length;

  const avgGlucose = allGlucose.length > 0
    ? Math.round(allGlucose.reduce((s, g) => s + g.value, 0) / allGlucose.length)
    : 0;

  const activeUserIds = new Set(
    allGlucose.filter(g => new Date(g.date) >= weekAgo).map(g => g.userId)
  );

  const last7 = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(now);
    d.setDate(d.getDate() - (6 - i));
    return d.toISOString().split('T')[0];
  });

  const measurementsByDay  = last7.map(day => ({
    date:  day,
    count: allGlucose.filter(g => g.date.startsWith(day)).length,
  }));
  const registrationsByDay = last7.map(day => ({
    date:  day,
    count: allUsers.filter(u => u.createdAt.startsWith(day)).length,
  }));

  const distribution = {
    hypo:   allGlucose.filter(g => g.value < 80).length,
    normal: allGlucose.filter(g => g.value >= 80 && g.value <= 140).length,
    hyper:  allGlucose.filter(g => g.value > 140).length,
  };

  // Email masqué dans la réponse : j*****@domain.com
  const maskEmail = (email) => {
    const [local, domain] = email.split('@');
    return `${local[0]}${'*'.repeat(Math.min(local.length - 1, 5))}@${domain}`;
  };

  const userRows = allUsers.map(u => {
    const entries = glucose.get(u.id) || [];
    return {
      name:             u.name,
      email:            maskEmail(u.email),
      createdAt:        u.createdAt,
      measurementCount: entries.length,
      lastMeasurement:  entries[0]?.date || null,
      avgGlucose:       entries.length > 0
        ? Math.round(entries.reduce((s, e) => s + e.value, 0) / entries.length)
        : null,
    };
  }).sort((a, b) => b.measurementCount - a.measurementCount);

  const uptimeSeconds = Math.floor((now - stats.startTime) / 1000);

  res.json({
    summary: {
      totalUsers,
      totalMeasurements,
      todayMeasurements,
      todayNewUsers,
      weeklyNewUsers,
      avgGlucose,
      activeUsers:  activeUserIds.size,
      foodScans:    stats.foodScans,
    },
    charts:       { measurementsByDay, registrationsByDay },
    distribution,
    users:        userRows,
    uptimeSeconds,
    updatedAt:    now.toISOString(),
  });
});

module.exports = router;
