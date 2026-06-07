const { pool } = require('../config/database');

async function getAllCategories() {
  const { rows } = await pool.query(
    'SELECT * FROM glycemic_categories ORDER BY category_key'
  );
  return rows;
}

async function getCategoryByKey(key) {
  const { rows } = await pool.query(
    'SELECT * FROM glycemic_categories WHERE category_key = $1',
    [key]
  );
  return rows[0] ?? null;
}

module.exports = { getAllCategories, getCategoryByKey };
