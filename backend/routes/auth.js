const express        = require('express');
const bcrypt         = require('bcryptjs');
const jwt            = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { pool }       = require('../config/database');

const router = express.Router();
const SECRET   = process.env.JWT_SECRET || 'niksante_dev_secret';
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,253}\.[^\s@]{2,}$/;

// POST /api/auth/register
router.post('/register', async (req, res) => {
  const { name, email, password } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Champs name, email et password requis' });
  }
  if (typeof name !== 'string' || name.trim().length > 100) {
    return res.status(400).json({ error: 'Nom invalide (max 100 caractères)' });
  }
  if (typeof email !== 'string' || email.length > 254) {
    return res.status(400).json({ error: 'Email invalide (max 254 caractères)' });
  }
  if (typeof password !== 'string' || password.length > 128) {
    return res.status(400).json({ error: 'Mot de passe trop long (max 128 caractères)' });
  }
  if (!EMAIL_RE.test(email.trim())) {
    return res.status(400).json({ error: 'Adresse email invalide' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Mot de passe trop court (min 6 caractères)' });
  }

  try {
    const existing = await pool.query(
      'SELECT id FROM users WHERE email = $1',
      [email.trim().toLowerCase()]
    );
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Cet email est déjà utilisé' });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const result = await pool.query(
      'INSERT INTO users (id, name, email, password_hash) VALUES ($1, $2, $3, $4) RETURNING id, name, email',
      [uuidv4(), name.trim(), email.trim().toLowerCase(), passwordHash]
    );
    const user = result.rows[0];

    const token = jwt.sign({ id: user.id, email: user.email }, SECRET, { expiresIn: '30d' });
    res.status(201).json({ token, user: { id: user.id, name: user.name, email: user.email } });
  } catch (err) {
    console.error('[Auth] Register:', err.message);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email et mot de passe requis' });
  }
  if (typeof email !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ error: 'Données invalides' });
  }

  try {
    const result = await pool.query(
      'SELECT * FROM users WHERE email = $1',
      [email.trim().toLowerCase()]
    );
    const user = result.rows[0];

    // Toujours exécuter bcrypt même si l'utilisateur n'existe pas (anti-timing attack)
    const dummyHash = '$2a$12$invalidhashinvalidhashinvalidhashXXXXXXXXXXXXXXXXXXXXXX';
    const valid = await bcrypt.compare(password, user?.password_hash ?? dummyHash);

    if (!user || !valid) {
      return res.status(401).json({ error: 'Email ou mot de passe incorrect' });
    }

    const token = jwt.sign({ id: user.id, email: user.email }, SECRET, { expiresIn: '30d' });
    res.json({ token, user: { id: user.id, name: user.name, email: user.email } });
  } catch (err) {
    console.error('[Auth] Login:', err.message);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
});

// POST /api/auth/logout
router.post('/logout', (_req, res) => {
  res.json({ message: 'Déconnecté avec succès' });
});

module.exports = router;
