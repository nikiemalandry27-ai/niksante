const express  = require('express');
const crypto   = require('crypto');
const jwt      = require('jsonwebtoken');
const { pool } = require('../config/database');

const router     = express.Router();
const SECRET     = process.env.JWT_SECRET     || 'niksante_dev_secret';
const ADMIN_USER = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASSWORD || 'niksante2024';

const SERVER_START = new Date();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function safeEqual(a, b) {
  const bufA = Buffer.alloc(64);
  const bufB = Buffer.alloc(64);
  bufA.write(a);
  bufB.write(b);
  return crypto.timingSafeEqual(bufA, bufB);
}

function maskEmail(email) {
  const [local, domain] = email.split('@');
  return `${local[0]}${'*'.repeat(Math.min(local.length - 1, 5))}@${domain}`;
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

router.get('/stats', adminAuth, async (req, res) => {
  try {
    const now     = new Date();
    const weekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);

    const [
      totalUsersRes,
      totalMeasRes,
      todayMeasRes,
      todayUsersRes,
      weekUsersRes,
      avgGlucoseRes,
      activeUsersRes,
      foodScansRes,
      measByDayRes,
      regByDayRes,
      distRes,
      userRowsRes,
    ] = await Promise.all([
      pool.query('SELECT COUNT(*) FROM users'),
      pool.query('SELECT COUNT(*) FROM glucose_entries'),
      pool.query("SELECT COUNT(*) FROM glucose_entries WHERE DATE(date) = CURRENT_DATE"),
      pool.query("SELECT COUNT(*) FROM users WHERE DATE(created_at) = CURRENT_DATE"),
      pool.query('SELECT COUNT(*) FROM users WHERE created_at >= $1', [weekAgo]),
      pool.query('SELECT ROUND(AVG(value)) as avg FROM glucose_entries'),
      pool.query('SELECT COUNT(DISTINCT user_id) FROM glucose_entries WHERE date >= $1', [weekAgo]),
      pool.query("SELECT value FROM stats WHERE key = 'food_scans'"),
      pool.query(`
        SELECT TO_CHAR(date AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day, COUNT(*) AS count
        FROM glucose_entries WHERE date >= $1
        GROUP BY day ORDER BY day
      `, [weekAgo]),
      pool.query(`
        SELECT TO_CHAR(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day, COUNT(*) AS count
        FROM users WHERE created_at >= $1
        GROUP BY day ORDER BY day
      `, [weekAgo]),
      pool.query(`
        SELECT
          SUM(CASE WHEN value < 80              THEN 1 ELSE 0 END) AS hypo,
          SUM(CASE WHEN value BETWEEN 80 AND 140 THEN 1 ELSE 0 END) AS normal,
          SUM(CASE WHEN value > 140             THEN 1 ELSE 0 END) AS hyper
        FROM glucose_entries
      `),
      pool.query(`
        SELECT u.name, u.email, u.created_at,
          COUNT(g.id)::int        AS measurement_count,
          MAX(g.date)             AS last_measurement,
          ROUND(AVG(g.value))     AS avg_glucose
        FROM users u
        LEFT JOIN glucose_entries g ON g.user_id = u.id
        GROUP BY u.id
        ORDER BY measurement_count DESC
      `),
    ]);

    // Construit les tableaux des 7 derniers jours
    const last7 = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(now);
      d.setDate(d.getDate() - (6 - i));
      return d.toISOString().split('T')[0];
    });

    const measMap = Object.fromEntries(measByDayRes.rows.map(r => [r.day, parseInt(r.count)]));
    const regMap  = Object.fromEntries(regByDayRes.rows.map(r  => [r.day, parseInt(r.count)]));
    const dist    = distRes.rows[0];

    res.json({
      summary: {
        totalUsers:        parseInt(totalUsersRes.rows[0].count),
        totalMeasurements: parseInt(totalMeasRes.rows[0].count),
        todayMeasurements: parseInt(todayMeasRes.rows[0].count),
        todayNewUsers:     parseInt(todayUsersRes.rows[0].count),
        weeklyNewUsers:    parseInt(weekUsersRes.rows[0].count),
        avgGlucose:        parseInt(avgGlucoseRes.rows[0].avg) || 0,
        activeUsers:       parseInt(activeUsersRes.rows[0].count),
        foodScans:         parseInt(foodScansRes.rows[0]?.value ?? 0),
      },
      charts: {
        measurementsByDay:  last7.map(day => ({ date: day, count: measMap[day] || 0 })),
        registrationsByDay: last7.map(day => ({ date: day, count: regMap[day]  || 0 })),
      },
      distribution: {
        hypo:   parseInt(dist.hypo   || 0),
        normal: parseInt(dist.normal || 0),
        hyper:  parseInt(dist.hyper  || 0),
      },
      users: userRowsRes.rows.map(u => ({
        name:             u.name,
        email:            maskEmail(u.email),
        createdAt:        u.created_at,
        measurementCount: u.measurement_count,
        lastMeasurement:  u.last_measurement || null,
        avgGlucose:       u.avg_glucose ? parseInt(u.avg_glucose) : null,
      })),
      uptimeSeconds: Math.floor((now - SERVER_START) / 1000),
      updatedAt:     now.toISOString(),
    });
  } catch (err) {
    console.error('[Admin] Stats:', err.message);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
});

module.exports = router;
