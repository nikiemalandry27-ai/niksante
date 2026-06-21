const express        = require('express');
const authMiddleware = require('../middleware/auth');
const { pool }       = require('../config/database');

const router = express.Router();
router.use(authMiddleware);

const VALID_TYPES = ['rapide', 'lente', 'premixte'];

function toEntry(row) {
  return {
    id:             row.id,
    userId:         row.user_id,
    doseUnits:      parseFloat(row.dose_units),
    type:           row.type,
    administeredAt: row.administered_at,
    note:           row.note,
    createdAt:      row.created_at,
  };
}

// GET /api/insulin?days=30
router.get('/', async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;
    const { rows } = await pool.query(
      `SELECT * FROM insulin_entries
       WHERE user_id = $1
         AND administered_at >= NOW() - INTERVAL '${days} days'
       ORDER BY administered_at DESC`,
      [req.user.id],
    );
    res.json(rows.map(toEntry));
  } catch (err) {
    console.error('[Insulin] GET error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/insulin
router.post('/', async (req, res) => {
  try {
    const { dose_units, type, administered_at, note } = req.body;
    if (!dose_units || !type || !administered_at) {
      return res.status(400).json({ error: 'dose_units, type et administered_at sont requis' });
    }
    if (!VALID_TYPES.includes(type)) {
      return res.status(400).json({ error: `type invalide — valeurs: ${VALID_TYPES.join(', ')}` });
    }
    const dose = parseFloat(dose_units);
    if (isNaN(dose) || dose <= 0 || dose > 300) {
      return res.status(400).json({ error: 'dose_units doit être entre 0.5 et 300 unités' });
    }
    const { rows } = await pool.query(
      `INSERT INTO insulin_entries (user_id, dose_units, type, administered_at, note)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [req.user.id, dose, type, administered_at, note || null],
    );
    res.status(201).json(toEntry(rows[0]));
  } catch (err) {
    console.error('[Insulin] POST error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// DELETE /api/insulin/:id
router.delete('/:id', async (req, res) => {
  try {
    const { rowCount } = await pool.query(
      'DELETE FROM insulin_entries WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id],
    );
    if (rowCount === 0) return res.status(404).json({ error: 'Entrée introuvable' });
    res.json({ success: true });
  } catch (err) {
    console.error('[Insulin] DELETE error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
