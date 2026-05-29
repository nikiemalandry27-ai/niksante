const express        = require('express');
const { v4: uuidv4 } = require('uuid');
const authMiddleware = require('../middleware/auth');
const { pool }       = require('../config/database');

const router = express.Router();
router.use(authMiddleware);

const VALID_MEAL_CONTEXTS = ['fasting', 'before_meal', 'after_meal', 'bedtime', 'sport'];

// Convertit une ligne PostgreSQL (snake_case) en objet attendu par le frontend
function toEntry(row) {
  return {
    id:          row.id,
    userId:      row.user_id,
    value:       row.value,
    date:        row.date,
    note:        row.note,
    mealContext: row.meal_context,
    createdAt:   row.created_at,
  };
}

// GET /api/glucose
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM glucose_entries WHERE user_id = $1 ORDER BY date DESC',
      [req.user.id]
    );
    res.json(result.rows.map(toEntry));
  } catch (err) {
    console.error('[Glucose] GET:', err.message);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
});

// POST /api/glucose
router.post('/', async (req, res) => {
  const { value, date, note, mealContext } = req.body;

  if (typeof value !== 'number' || !Number.isFinite(value) || value < 20 || value > 600) {
    return res.status(400).json({ error: 'Valeur glycémique invalide (20–600 mg/dL)' });
  }

  if (date !== undefined) {
    const parsed = new Date(date);
    if (isNaN(parsed.getTime())) {
      return res.status(400).json({ error: 'Date invalide' });
    }
    if (parsed.getTime() > Date.now() + 60_000) {
      return res.status(400).json({ error: 'La date ne peut pas être dans le futur' });
    }
  }

  if (note !== undefined && note !== null) {
    if (typeof note !== 'string' || note.length > 500) {
      return res.status(400).json({ error: 'Note invalide (max 500 caractères)' });
    }
  }

  if (mealContext !== undefined && mealContext !== null && !VALID_MEAL_CONTEXTS.includes(mealContext)) {
    return res.status(400).json({ error: 'Contexte repas invalide' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO glucose_entries (id, user_id, value, date, note, meal_context)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        uuidv4(),
        req.user.id,
        Math.round(value),
        date || new Date().toISOString(),
        note?.trim() || null,
        mealContext || null,
      ]
    );
    res.status(201).json(toEntry(result.rows[0]));
  } catch (err) {
    console.error('[Glucose] POST:', err.message);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
});

// DELETE /api/glucose/:id
router.delete('/:id', async (req, res) => {
  const { id } = req.params;

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    return res.status(400).json({ error: 'ID invalide' });
  }

  try {
    const result = await pool.query(
      'DELETE FROM glucose_entries WHERE id = $1 AND user_id = $2 RETURNING id',
      [id, req.user.id]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Mesure introuvable' });
    }
    res.json({ message: 'Mesure supprimée' });
  } catch (err) {
    console.error('[Glucose] DELETE:', err.message);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
});

// DELETE /api/glucose
router.delete('/', async (req, res) => {
  try {
    await pool.query('DELETE FROM glucose_entries WHERE user_id = $1', [req.user.id]);
    res.json({ message: 'Historique vidé' });
  } catch (err) {
    console.error('[Glucose] DELETE ALL:', err.message);
    res.status(500).json({ error: 'Erreur interne du serveur' });
  }
});

module.exports = router;
