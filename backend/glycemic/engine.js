// Pure deterministic glycemic computation — no I/O, no side effects

function calculateCarbs(carbs_per_100g, quantity_grams) {
  return (carbs_per_100g * quantity_grams) / 100;
}

function calculateGL(gi, carbs) {
  return (gi * carbs) / 100;
}

function estimateImpact(gl) {
  const mean = gl * 1.5;
  return {
    min: Math.max(0, mean * 0.7),
    max: Math.min(120, mean * 1.3),
  };
}

function adjustForUser(impact, diabetic, sensitivity) {
  let factor = 1.0;
  if (diabetic)                  factor *= 1.2;
  if (sensitivity === 'low')     factor *= 1.3;
  else if (sensitivity === 'high') factor *= 0.7;
  return {
    min: Math.round(impact.min * factor),
    max: Math.round(impact.max * factor),
  };
}

function classifyImpactLevel(max) {
  if (max === 0)   return 'None';
  if (max <= 30)   return 'Low';
  if (max <= 60)   return 'Moderate';
  return 'High';
}

function generateAdvice(level) {
  const map = {
    None:     'Aucun impact glycémique — consommation sans restriction.',
    Low:      'Impact faible — bon choix pour les diabétiques. Surveiller la portion.',
    Moderate: 'Impact modéré — consommer en quantité raisonnée, associer à des protéines.',
    High:     'Impact élevé — limiter la portion, privilégier un équivalent à IG plus bas.',
  };
  return map[level] ?? 'Consultez votre médecin pour des conseils adaptés.';
}

function computeGlycemicImpact({ gi, label_carbs, category_carbs, quantity_grams, diabetic, sensitivity }) {
  const carbs_per_100g = label_carbs ?? category_carbs;
  const carbs          = calculateCarbs(carbs_per_100g, quantity_grams);
  const gl             = calculateGL(gi, carbs);

  if (carbs_per_100g === 0 || gl < 1) {
    return {
      carbs_used:    Math.round(carbs * 10) / 10,
      glycemic_load: Math.round(gl  * 10) / 10,
      impact_mg_dl:  { min: 0, max: 0 },
      impact_level:  'None',
    };
  }

  const raw      = estimateImpact(gl);
  const adjusted = adjustForUser(raw, diabetic, sensitivity);
  const level    = classifyImpactLevel(adjusted.max);

  return {
    carbs_used:    Math.round(carbs * 10) / 10,
    glycemic_load: Math.round(gl   * 10) / 10,
    impact_mg_dl:  adjusted,
    impact_level:  level,
  };
}

module.exports = { computeGlycemicImpact, generateAdvice, classifyImpactLevel };
