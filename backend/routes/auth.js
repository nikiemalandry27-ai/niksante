const express = require('express');
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { users } = require('../config/database');

const router = express.Router();
const SECRET = process.env.JWT_SECRET || 'niksante_dev_secret';

// Regex email simple mais efficace
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,253}\.[^\s@]{2,}$/;

// POST /api/auth/register
router.post('/register', async (req, res) => {
  const { name, email, password } = req.body;

  // ── Présence ──
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Champs name, email et password requis' });
  }

  // ── Longueurs max (protection contre la saturation mémoire) ──
  if (typeof name !== 'string' || name.trim().length > 100) {
    return res.status(400).json({ error: 'Nom invalide (max 100 caractères)' });
  }
  if (typeof email !== 'string' || email.length > 254) {
    return res.status(400).json({ error: 'Email invalide (max 254 caractères)' });
  }
  if (typeof password !== 'string' || password.length > 128) {
    return res.status(400).json({ error: 'Mot de passe trop long (max 128 caractères)' });
  }

  // ── Format email ──
  if (!EMAIL_RE.test(email.trim())) {
    return res.status(400).json({ error: 'Adresse email invalide' });
  }

  // ── Longueur min mot de passe ──
  if (password.length < 6) {
    return res.status(400).json({ error: 'Mot de passe trop court (min 6 caractères)' });
  }

  const existing = [...users.values()].find((u) => u.email === email.trim().toLowerCase());
  if (existing) {
    return res.status(409).json({ error: 'Cet email est déjà utilisé' });
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const user = {
    id:           uuidv4(),
    name:         name.trim(),
    email:        email.trim().toLowerCase(),
    passwordHash,
    createdAt:    new Date().toISOString(),
  };
  users.set(user.id, user);

  const token = jwt.sign({ id: user.id, email: user.email }, SECRET, { expiresIn: '30d' });
  res.status(201).json({ token, user: { id: user.id, name: user.name, email: user.email } });
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

  // Toujours exécuter bcrypt.compare même si l'utilisateur n'existe pas
  // → empêche l'énumération d'emails par timing
  const user = [...users.values()].find((u) => u.email === email.trim().toLowerCase());
  const dummyHash = '$2a$12$invalidhashinvalidhashinvalidhashXXXXXXXXXXXXXXXXXXXXXX';
  const valid = await bcrypt.compare(password, user?.passwordHash ?? dummyHash);

  if (!user || !valid) {
    return res.status(401).json({ error: 'Email ou mot de passe incorrect' });
  }

  const token = jwt.sign({ id: user.id, email: user.email }, SECRET, { expiresIn: '30d' });
  res.json({ token, user: { id: user.id, name: user.name, email: user.email } });
});

// POST /api/auth/logout
router.post('/logout', (_req, res) => {
  res.json({ message: 'Déconnecté avec succès' });
});

module.exports = router;
