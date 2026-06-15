async function classifyImage(imageBase64, categories) {
  const categoryList = categories.map(c => c.category_key).join(', ');

  const prompt = `You are a clinical-grade nutrition AI integrated into a deterministic glycemic impact engine.

You receive a photo of a food product, meal, drink, or nutrition label.

Your job is to extract ONLY observable facts and classify the item into a predefined glycemic category.

---

STEP 1 — LABEL EXTRACTION

Extract ONLY if clearly visible on the image:
- product_name: name of the food or product
- carbs_per_100g: number or null (ONLY from a readable nutrition label)
- sugars_per_100g: number or null (ONLY from a readable nutrition label)

extraction_source:
- "label"    → nutrition facts panel is clearly readable
- "partial"  → some values visible but incomplete
- "no_label" → no nutrition label visible

Rules:
- NEVER guess numbers
- NEVER infer values from visual appearance
- If unreadable → null

---

STEP 2 — CLASSIFICATION

Classify into EXACTLY ONE of: ${categoryList}

Rules:
- water or plain water bottle → water
- meat / fish / eggs / tofu → protein_pure
- oils / butter / fats → fat_pure
- spirits / wine → alcohol_pure
- beer / malt drinks → beer
- if completely uncertain → unknown
- NEVER invent a category

---

STEP 3 — CONFIDENCE

Set confidence to 0.0 (zero) in ANY of these cases:
- The image is not a food item (person, object, document, scenery, hand, etc.)
- The image is too dark, blurry, or low quality to identify the food
- The dish is a complex mixed meal that cannot be classified into a single category
- You are guessing without any visual basis

Set confidence between 0.1 and 0.49 when the food is partially recognizable but uncertain.
Set confidence >= 0.5 ONLY when you can clearly and confidently identify the food.

---

STRICT RULES:
- NEVER hallucinate numeric values
- NEVER give a high confidence score to mask uncertainty
- Output valid JSON ONLY — no markdown, no explanation

OUTPUT:
{
  "product_name": "string",
  "category": "one of the listed categories",
  "carbs_per_100g": number or null,
  "sugars_per_100g": number or null,
  "extraction_source": "label" | "partial" | "no_label",
  "confidence": 0.0 to 1.0,
  "reasoning": "one short sentence"
}`;

  const controller = new AbortController();
  const timeoutId  = setTimeout(() => controller.abort(), 25_000);

  let response;
  try {
    response = await fetch('https://api.openai.com/v1/chat/completions', {
      method:  'POST',
      signal:  controller.signal,
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [{
          role:    'user',
          content: [
            { type: 'text',      text: prompt },
            { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${imageBase64}`, detail: 'auto' } },
          ],
        }],
        max_tokens: 400,
      }),
    });
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`OpenAI ${response.status}: ${err}`);
  }

  const data    = await response.json();
  const raw     = data.choices[0].message.content.trim();
  const cleaned = raw.replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/, '').trim();

  let result;
  try {
    result = JSON.parse(cleaned);
  } catch {
    throw new Error(`Réponse IA non parseable: ${cleaned.slice(0, 200)}`);
  }

  // Ensure category is valid
  const validKeys = new Set(categories.map(c => c.category_key));
  if (!validKeys.has(result.category)) {
    result.category = 'unknown';
  }

  return result;
}

module.exports = { classifyImage };
