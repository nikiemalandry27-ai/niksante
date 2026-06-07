const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
  console.error('[DB] Variable DATABASE_URL non définie — vérifiez les variables d\'environnement sur Render');
  process.exit(1);
}

console.log('[DB] Connexion à :', process.env.DATABASE_URL.replace(/:\/\/.*@/, '://***@'));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function createTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id            UUID PRIMARY KEY,
      name          VARCHAR(100)  NOT NULL,
      email         VARCHAR(254)  UNIQUE NOT NULL,
      password_hash VARCHAR(255)  NOT NULL,
      created_at    TIMESTAMPTZ   DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS glucose_entries (
      id           UUID PRIMARY KEY,
      user_id      UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      value        INTEGER      NOT NULL,
      date         TIMESTAMPTZ  NOT NULL,
      note         TEXT,
      meal_context VARCHAR(50),
      created_at   TIMESTAMPTZ  DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS stats (
      key   VARCHAR PRIMARY KEY,
      value INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS glycemic_categories (
      id             SERIAL PRIMARY KEY,
      category_key   VARCHAR UNIQUE NOT NULL,
      gi             INTEGER        NOT NULL,
      carbs_per_100g NUMERIC        NOT NULL,
      description    TEXT
    );

    INSERT INTO stats (key, value) VALUES ('food_scans', 0) ON CONFLICT DO NOTHING;
  `);

  // Seed glycemic categories (idempotent)
  const categories = [
    ['water',                    0,  0,  'Eau et boissons sans calories'],
    ['protein_pure',             0,  0,  'Viandes, poissons, œufs, tofu'],
    ['fat_pure',                 0,  0,  'Huiles, beurre, graisses pures'],
    ['leafy_vegetable',         15,  3,  'Légumes à feuilles vertes'],
    ['non_starchy_vegetable',   25,  6,  'Légumes non féculents'],
    ['legume',                  30, 20,  'Légumineuses : lentilles, pois chiches, haricots'],
    ['dairy_plain',             27,  5,  'Produits laitiers nature non sucrés'],
    ['nut_seed',                15, 10,  'Noix, graines, fruits secs oléagineux'],
    ['berry',                   40, 10,  'Baies : fraises, myrtilles, framboises'],
    ['fruit_low_gi',            45, 13,  'Fruits à IG bas : pomme, poire, pêche'],
    ['fruit_high_gi',           65, 20,  'Fruits à IG élevé : melon, ananas, raisin'],
    ['whole_grain',             55, 40,  'Céréales complètes : riz brun, quinoa, avoine'],
    ['starchy_vegetable',       65, 17,  'Légumes féculents : maïs, petits pois, betterave'],
    ['banana',                  51, 23,  'Banane'],
    ['dairy_sweetened',         55, 20,  'Produits laitiers sucrés : yaourt aromatisé, fromage blanc sucré'],
    ['refined_grain',           72, 50,  'Céréales raffinées : riz blanc, pain blanc, pâtes blanches'],
    ['potato',                  78, 17,  'Pomme de terre bouillie ou à la vapeur'],
    ['fried_potato',            75, 35,  'Frites, chips, pommes de terre sautées'],
    ['sugary_drink',            68, 11,  'Boissons sucrées : sodas, jus industriels'],
    ['candy_sugar',             80, 95,  'Confiseries, bonbons, sucre pur'],
    ['pastry_cake',             76, 55,  'Pâtisseries, gâteaux, viennoiseries'],
    ['breakfast_cereal_sugary', 74, 80,  'Céréales de petit-déjeuner sucrées'],
    ['fast_food_meal',          70, 30,  'Repas fast-food : burger, sandwich, menu complet'],
    ['pizza',                   60, 33,  'Pizza'],
    ['ice_cream',               61, 23,  'Glaces et sorbets'],
    ['honey_syrup',             61, 82,  'Miel, sirop d\'érable, confitures'],
    ['alcohol_pure',             0,  0,  'Alcools forts : whisky, vodka, rhum'],
    ['beer',                    66,  4,  'Bière'],
    ['mixed_meal',              55, 20,  'Repas mixte équilibré'],
    ['unknown',                 50, 15,  'Aliment non identifié'],
  ];

  for (const [key, gi, carbs, desc] of categories) {
    await pool.query(
      `INSERT INTO glycemic_categories (category_key, gi, carbs_per_100g, description)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (category_key) DO NOTHING`,
      [key, gi, carbs, desc]
    );
  }

  console.log('[DB] Tables prêtes');
}

module.exports = { pool, createTables };
