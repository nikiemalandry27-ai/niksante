const express        = require('express');
const { v4: uuidv4 } = require('uuid');
const authMiddleware = require('../middleware/auth');
const { glucose }    = require('../config/database');

const router = express.Router();
router.use(authMiddleware);

const VALID_MEAL_CONTEXTS = ['fasting', 'before_meal', 'after_meal', 'bedtime', 'sport', null];

// GET /api/glucose
router.get('/', (req, res) => {
  const entries = glucose.get(req.user.id) || [];
  res.json(entries);
});

// POST /api/glucose
router.post('/', (req, res) => {
  const { value, date, note, mealContext } = req.body;

  // ── Valeur glycémique ──
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 20 || value > 600) {
    return res.status(400).json({ error: 'Valeur glycémique invalide (20–600 mg/dL)' });
  }

  // ── Date ──
  if (date !== undefined) {
    const parsed = new Date(date);
    if (isNaN(parsed.getTime())) {
      return res.status(400).json({ error: 'Date invalide' });
    }
    // Refuser les dates dans le futur (> 1 min de tolérance)
    if (parsed.getTime() > Date.now() + 60_000) {
      return res.status(400).json({ error: 'La date ne peut pas être dans le futur' });
    }
  }

  // ── Note ──
  if (note !== undefined && note !== null) {
    if (typeof note !== 'string' || note.length > 500) {
      return res.status(400).json({ error: 'Note invalide (max 500 caractères)' });
    }
  }

  // ── Contexte repas ──
  if (!VALID_MEAL_CONTEXTS.includes(mealContext ?? null)) {
    return res.status(400).json({ error: 'Contexte repas invalide' });
  }

  const entry = {
    id:          uuidv4(),
    userId:      req.user.id,
    value:       Math.round(value),
    date:        date || new Date().toISOString(),
    note:        (note?.trim()) || null,
    mealContext: mealContext || null,
    createdAt:   new Date().toISOString(),
  };

  const entries = glucose.get(req.user.id) || [];
  entries.unshift(entry);
  glucose.set(req.user.id, entries);

  res.status(201).json(entry);
});

// DELETE /api/glucose/:id
router.delete('/:id', (req, res) => {
  const { id } = req.params;

  // Validation basique de l'ID (UUID v4)
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    return res.status(400).json({ error: 'ID invalide' });
  }

  const entries  = glucose.get(req.user.id) || [];
  const filtered = entries.filter((e) => e.id !== id);

  if (filtered.length === entries.length) {
    return res.status(404).json({ error: 'Mesure introuvable' });
  }

  glucose.set(req.user.id, filtered);
  res.json({ message: 'Mesure supprimée' });
});

// DELETE /api/glucose
router.delete('/', (req, res) => {
  glucose.set(req.user.id, []);
  res.json({ message: 'Historique vidé' });
});

module.exports = router;
