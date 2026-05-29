const express        = require('express');
const authMiddleware = require('../middleware/auth');
const { pool }       = require('../config/database');

const router = express.Router();
router.use(authMiddleware);

// ---------------------------------------------------------------------------
// Base nutritionnelle locale (utilisée en simulation ou en fallback)
// ---------------------------------------------------------------------------

const FOOD_DB = [
  { name: 'Riz blanc',         carbs: 28, gi: 72, calories: 130, proteins: 3,  fats: 0,  impact: 'Élevé',      tips: 'Préférez le riz complet (IG plus bas).' },
  { name: 'Poulet grillé',     carbs: 0,  gi: 0,  calories: 165, proteins: 31, fats: 4,  impact: 'Nul',        tips: 'Excellente source de protéines, n\'affecte pas la glycémie.' },
  { name: 'Salade verte',      carbs: 3,  gi: 10, calories: 15,  proteins: 1,  fats: 0,  impact: 'Très faible', tips: 'Idéal pour les diabétiques, très faible en glucides.' },
  { name: 'Pain blanc',        carbs: 30, gi: 75, calories: 140, proteins: 4,  fats: 1,  impact: 'Élevé',      tips: 'Remplacez par du pain complet ou aux céréales.' },
  { name: 'Banane',            carbs: 27, gi: 52, calories: 105, proteins: 1,  fats: 0,  impact: 'Modéré',     tips: 'Consommez en petite quantité, idéalement après un repas.' },
  { name: 'Pomme',             carbs: 25, gi: 38, calories: 95,  proteins: 0,  fats: 0,  impact: 'Faible',     tips: 'Bon choix de fruit pour les diabétiques grâce à son IG bas.' },
  { name: 'Pâtes',             carbs: 38, gi: 45, calories: 200, proteins: 7,  fats: 1,  impact: 'Modéré',     tips: 'Cuissez al dente pour réduire l\'index glycémique.' },
  { name: 'Œufs',              carbs: 1,  gi: 0,  calories: 155, proteins: 13, fats: 11, impact: 'Très faible', tips: 'Excellent choix, sans impact sur la glycémie.' },
  { name: 'Poisson',           carbs: 0,  gi: 0,  calories: 150, proteins: 25, fats: 5,  impact: 'Nul',        tips: 'Très bon pour la santé cardiovasculaire des diabétiques.' },
  { name: 'Légumes verts',     carbs: 5,  gi: 15, calories: 30,  proteins: 2,  fats: 0,  impact: 'Très faible', tips: 'Consommez sans limite, riche en fibres et micronutriments.' },
  { name: 'Yaourt nature',     carbs: 7,  gi: 36, calories: 60,  proteins: 5,  fats: 3,  impact: 'Faible',     tips: 'Préférez le yaourt sans sucre ajouté.' },
  { name: 'Pomme de terre',    carbs: 20, gi: 85, calories: 90,  proteins: 2,  fats: 0,  impact: 'Très élevé', tips: 'À éviter ou consommer froid (amidon résistant = IG réduit).' },
  { name: 'Chocolat noir',     carbs: 17, gi: 22, calories: 170, proteins: 2,  fats: 12, impact: 'Faible',     tips: 'En petite quantité (>70% cacao), peu d\'impact glycémique.' },
  { name: 'Haricots',          carbs: 20, gi: 28, calories: 130, proteins: 9,  fats: 1,  impact: 'Faible',     tips: 'Riches en fibres et protéines, excellent pour les diabétiques.' },
  { name: 'Soda / boisson sucrée', carbs: 35, gi: 65, calories: 140, proteins: 0, fats: 0, impact: 'Très élevé', tips: 'À éviter absolument — pic glycémique immédiat.' },
];

function getImpactColor(impact) {
  const map = {
    'Nul': '#388E3C',
    'Très faible': '#66BB6A',
    'Faible': '#FBC02D',
    'Modéré': '#F57C00',
    'Élevé': '#E53935',
    'Très élevé': '#B71C1C',
  };
  return map[impact] ?? '#888';
}

// ---------------------------------------------------------------------------
// Détection via OpenAI Vision (si clé configurée)
// ---------------------------------------------------------------------------

async function detectWithOpenAI(imageBase64) {
  const prompt = `Tu es un expert en nutrition pour diabétiques.
Analyse cette image et identifie le ou les aliments principaux.
Réponds UNIQUEMENT avec un objet JSON valide (sans markdown) :
{
  "name": "nom de l'aliment principal en français",
  "carbs": <glucides en grammes pour une portion standard>,
  "gi": <index glycémique 0-100>,
  "calories": <kcal pour une portion>,
  "proteins": <protéines en grammes>,
  "fats": <lipides en grammes>,
  "impact": "Nul|Très faible|Faible|Modéré|Élevé|Très élevé",
  "tips": "conseil bref pour un patient diabétique",
  "confidence": <0.0 à 1.0>
}`;

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${imageBase64}`, detail: 'low' } },
        ],
      }],
      max_tokens: 300,
    }),
  });

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`OpenAI ${response.status}: ${errBody}`);
  }

  const data = await response.json();
  const raw  = data.choices[0].message.content.trim();

  // GPT enveloppe parfois la réponse dans des backticks markdown — on les retire
  const cleaned = raw.replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/,'').trim();
  const json = JSON.parse(cleaned);

  // Validation des champs essentiels
  const required = ['name', 'carbs', 'gi', 'calories', 'proteins', 'fats', 'impact', 'tips', 'confidence'];
  for (const field of required) {
    if (json[field] === undefined) throw new Error(`Champ manquant dans la réponse IA : ${field}`);
  }

  return { ...json, simulated: false, impactColor: getImpactColor(json.impact) };
}

// ---------------------------------------------------------------------------
// Simulation (sans clé API)
// ---------------------------------------------------------------------------

function simulateDetection() {
  const food = FOOD_DB[Math.floor(Math.random() * FOOD_DB.length)];
  return {
    ...food,
    confidence: Math.round((0.70 + Math.random() * 0.25) * 100) / 100,
    simulated:  true,
    impactColor: getImpactColor(food.impact),
  };
}

// ---------------------------------------------------------------------------
// POST /api/food/detect
// ---------------------------------------------------------------------------

// Regex base64 valide (caractères autorisés + padding)
const BASE64_RE = /^[A-Za-z0-9+/]+={0,2}$/;

router.post('/detect', async (req, res) => {
  const { imageBase64 } = req.body;

  if (!imageBase64) {
    return res.status(400).json({ error: 'Image manquante (imageBase64 requis)' });
  }

  // ── Validation du format base64 ──
  if (typeof imageBase64 !== 'string') {
    return res.status(400).json({ error: 'imageBase64 doit être une chaîne de caractères' });
  }

  // Supprimer le préfixe data URI éventuel avant validation
  const rawB64 = imageBase64.replace(/^data:image\/[a-z]+;base64,/i, '');

  if (!BASE64_RE.test(rawB64)) {
    return res.status(400).json({ error: 'Format base64 invalide' });
  }

  // Taille décodée estimée (base64 → ~75% de la taille encodée)
  const estimatedBytes = Math.ceil(rawB64.length * 0.75);
  if (estimatedBytes > 8 * 1024 * 1024) { // 8 Mo max
    return res.status(413).json({ error: 'Image trop grande (max 8 Mo)' });
  }

  try {
    let result;

    if (process.env.OPENAI_API_KEY) {
      result = await detectWithOpenAI(imageBase64);
    } else {
      // Simulation réaliste avec délai pour reproduire le comportement réel
      await new Promise((r) => setTimeout(r, 1200));
      result = simulateDetection();
    }

    pool.query("UPDATE stats SET value = value + 1 WHERE key = 'food_scans'").catch(() => {});
    res.json(result);
  } catch (err) {
    console.error('[FoodDetect] Erreur OpenAI — passage en simulation :', err.message);
    const fallback = simulateDetection();
    res.json({ ...fallback, simulated: true });
  }
});

module.exports = router;
