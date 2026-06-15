const express        = require('express');
const authMiddleware = require('../middleware/auth');
const { classifyImage }                        = require('./classifier');
const { computeGlycemicImpact, generateAdvice } = require('./engine');
const { getAllCategories, getCategoryByKey }    = require('./repository');

const router = express.Router();
router.use(authMiddleware);

// POST /api/glycemic/analyze-image
// Body (JSON): { imageBase64, quantity_grams?, diabetic?, insulin_sensitivity? }
router.post('/analyze-image', async (req, res) => {
  const {
    imageBase64,
    quantity_grams      = 150,
    diabetic            = true,
    insulin_sensitivity = 'normal',
  } = req.body;

  if (!imageBase64 || typeof imageBase64 !== 'string') {
    return res.status(400).json({ error: 'imageBase64 (string) requis' });
  }

  const rawB64 = imageBase64
    .replace(/^data:image\/[a-z]+;base64,/i, '')
    .replace(/[\r\n\s]/g, '');

  const BASE64_RE = /^[A-Za-z0-9+/]+=*$/;
  if (!BASE64_RE.test(rawB64)) {
    return res.status(400).json({ error: 'Format base64 invalide' });
  }

  const qty        = Math.max(1, Math.min(2000, Number(quantity_grams) || 150));
  const isDiabetic = diabetic === true || diabetic === 'true';

  try {
    const categories     = await getAllCategories();
    const classification = await classifyImage(rawB64, categories);

    // Aliment non identifié — on bloque immédiatement sans calculer d'impact
    if (classification.category === 'unknown' || classification.confidence < 0.5) {
      return res.json({
        food:                  classification.product_name || 'Non identifié',
        category_resolved:     'unknown',
        category_description:  'Aliment non identifié',
        glycemic_index:        0,
        carbs_used:            0,
        glycemic_load:         0,
        label_carbs_per_100g:  null,
        label_sugars_per_100g: null,
        carbs_source:          'category_db',
        extraction_source:     classification.extraction_source,
        impact_mg_dl:          { min: 0, max: 0 },
        impact_level:          'None',
        confidence_score:      classification.confidence,
        advice:                '',
      });
    }

    const dbCategory = (await getCategoryByKey(classification.category))
      ?? (await getCategoryByKey('unknown'));

    const impact = computeGlycemicImpact({
      gi:             dbCategory.gi,
      label_carbs:    classification.carbs_per_100g,
      category_carbs: Number(dbCategory.carbs_per_100g),
      quantity_grams: qty,
      diabetic:       isDiabetic,
      sensitivity:    insulin_sensitivity,
    });

    const advice = generateAdvice(impact.impact_level);

    return res.json({
      food:                  classification.product_name,
      category_resolved:     dbCategory.category_key,
      category_description:  dbCategory.description,
      glycemic_index:        dbCategory.gi,
      carbs_used:            impact.carbs_used,
      glycemic_load:         impact.glycemic_load,
      label_carbs_per_100g:  classification.carbs_per_100g,
      label_sugars_per_100g: classification.sugars_per_100g,
      carbs_source:          classification.carbs_per_100g !== null ? 'label_ocr' : 'category_db',
      extraction_source:     classification.extraction_source,
      impact_mg_dl:          impact.impact_mg_dl,
      impact_level:          impact.impact_level,
      confidence_score:      classification.confidence,
      advice,
    });
  } catch (err) {
    console.error('[Glycemic] Erreur :', err.message);
    return res.status(500).json({ error: 'Analyse impossible. Réessayez.' });
  }
});

module.exports = router;
