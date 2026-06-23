const { Client } = require('pg');
require('dotenv').config();

const DATABASE_URL = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;

async function check() {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  const res = await client.query("SELECT price_jmd, stock_quantity, description, size FROM products WHERE name ILIKE '%Revive%'");
  console.log(res.rows[0]);
  await client.end();
}
check().catch(console.error);
